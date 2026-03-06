import {
    createContext, useContext, useState, useEffect, useCallback, useRef,
    type ReactNode,
  } from 'react'
  import type { Stack, ProcessStatus, LogEntry, ViewMode, JsonStatus } from '../types'
  import * as mock from '../api/mock'
  import * as realApi from '../api/api'
  import * as qApi from '../api/qws'
  import type { StreamMessage } from '../api/api'
  import { useConnectionContext } from './ConnectionContext'

  let _logId = 0

  interface ControlState {
    stacks: Record<string, Stack>
    stackOrder: string[]
    activeStack: string
    setActiveStack: (name: string) => void
    selectedProc: string | null
    setSelectedProc: (name: string | null) => void
    statuses: Record<string, Record<string, ProcessStatus>>
    viewMode: ViewMode
    setViewMode: (m: ViewMode) => void
    logs: LogEntry[]
    jsonStatus: JsonStatus
    setJsonStatus: (s: JsonStatus) => void
    connected: boolean   // true = qi-cli API is reachable
    stacksLoading: boolean    // true while waiting for real stacks to arrive
    statusesLoading: boolean  // true until first stream push with process statuses

    // Stack actions
    addStack: (name: string, stack: Stack) => Promise<void>
    renameStack: (oldName: string, newName: string) => Promise<void>
    cloneStack: (name: string, newName: string) => Promise<void>
    deleteStack: (name: string) => Promise<void>
    saveStack: (name: string, stack: Stack) => Promise<void>      // persists to API
    updateStackLocal: (name: string, stack: Stack) => void        // live update, no API call

    // Process actions
    startProcess: (stackName: string, proc: string) => Promise<void>
    stopProcess: (stackName: string, proc: string) => Promise<void>
    startAll: (stackName: string) => Promise<void>
    stopAll: (stackName: string) => Promise<void>
  }

  const ControlContext = createContext<ControlState | null>(null)

  export function ControlProvider({ children }: { children: ReactNode }) {
    const { apiBase, activeConn } = useConnectionContext()
    const connType = activeConn?.type ?? 'q'

    const [stacks, setStacks] = useState<Record<string, Stack>>({})
    const [stackOrder, setStackOrder] = useState<string[]>([])
    const [activeStack, setActiveStack] = useState('')
    const [selectedProc, setSelectedProc] = useState<string | null>(null)
    const [statuses, setStatuses] = useState<Record<string, Record<string, ProcessStatus>>>({})
    const [viewMode, setViewMode] = useState<ViewMode>('graph')
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [jsonStatus, setJsonStatus] = useState<JsonStatus>('valid')
    const [connected, setConnected] = useState(false)
    const [stacksLoading, setStacksLoading] = useState(true)
    const [statusesLoading, setStatusesLoading] = useState(true)
    const hasRealStacksRef = useRef(false)

    // ── Re-initialise when connection changes ────────────────────────────────
    useEffect(() => {
      hasRealStacksRef.current = false
      setStacksLoading(true)
      setStatusesLoading(true)
      setStacks({})
      setStackOrder([])
      setActiveStack('')
      setStatuses({})
      // Keep qws in sync with the active q-type connection
      if (connType === 'q' && activeConn) {
        qApi.setQBase(activeConn.host, activeConn.port)
      }
    }, [apiBase, connType]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Check API connectivity ────────────────────────────────────────────────
    useEffect(() => {
      const api = connType === 'q' ? qApi : realApi
      api.ping().then(ok => setConnected(ok))
    }, [apiBase, connType])

    // ── Statuses timeout: if stream hasn't pushed within 3s of stacks loading, unblock UI ─
    useEffect(() => {
      if (!stacksLoading) {
        const t = setTimeout(() => setStatusesLoading(false), 3000)
        return () => clearTimeout(t)
      }
    }, [stacksLoading])

    // ── Load stacks: try real API first, fall back to mock ───────────────────
    useEffect(() => {
      const api = connType === 'q' ? qApi : realApi
      api.getStacks()
        .then(async s => {
          hasRealStacksRef.current = true
          setStacks(s)
          const order = Object.keys(s)
          setStackOrder(order)
          setActiveStack(order[0] ?? '')
          setStacksLoading(false)
          // Query current statuses immediately — don't wait for the hub's cron push
          if (connType === 'q') {
            try {
              const rows = await qApi.getStatuses()
              if (Array.isArray(rows) && rows.length > 0) {
                setStatuses(prev => {
                  const next = { ...prev }
                  for (const p of rows) {
                    if (!p.stackname || !p.name) continue
                    const procName = p.name.split('.')[0]
                    const status: ProcessStatus = p.status === 'up' || p.status === 'busy' ? 'running' : 'stopped'
                    next[p.stackname] = { ...next[p.stackname], [procName]: status }
                  }
                  return next
                })
                setStatusesLoading(false)
              }
            } catch { /* stream will populate statuses */ }
          }
        })
        .catch(() => {
          // Wait 3s for stream to deliver real stacks before falling back to mock
          setTimeout(() => {
            if (hasRealStacksRef.current) return
            mock.getStacks().then(s => {
              setStacks(s)
              const order = Object.keys(s)
              setStackOrder(order)
              setActiveStack(order[0] ?? '')
              setStacksLoading(false)
            })
          }, 3000)
        })
    }, [apiBase, connType])

    const addLog = useCallback((process: string, level: LogEntry['level'], msg: string) => {
      const ts = new Date().toTimeString().slice(0, 8)
      setLogs(l => [...l, { id: _logId++, process, level, msg, ts }])
    }, [])

    // ── Stream — live process status + log updates from kdb+ ─────────────────
    useEffect(() => {
      const api = connType === 'q' ? qApi : realApi
      const cleanup = api.connectStream(
        (msg: StreamMessage) => {
          const result = msg.result
          // Stream format: ["tableName", [...rows]]
          if (!Array.isArray(result) || result.length < 2) return
          const [tableName, rows] = result as [string, unknown[]]
          if (!Array.isArray(rows) || rows.length === 0) return

          if (tableName === 'processes') {
            const procRows = rows as realApi.ProcStatus[]

            // Update statuses only — stacks are loaded via getStacks (with full JSON including publish_to etc.)
            setStatuses(prev => {
              const next = { ...prev }
              for (const p of procRows) {
                if (!p.stackname || !p.name) continue
                const procName = p.name.split('.')[0]   // "tp1.dev1" → "tp1"
                const status: ProcessStatus = p.status === 'up' ? 'running' : p.status === 'busy' ? 'busy' : 'stopped'
                next[p.stackname] = { ...next[p.stackname], [procName]: status }
              }
              return next
            })
            setStatusesLoading(false)
          } else if (tableName === 'Logs') {
            const logRows = rows as realApi.StreamLogEntry[]
            for (const l of logRows) {
              const procName = l.name?.split('.')[0] ?? 'system'
              const lines = Array.isArray(l.lines) ? l.lines : [l.lines ?? '']
              for (const line of lines) {
                if (!line.trim()) continue
                // Line format: "2026.03.05D16:36:03.000000000 info 0 message here"
                const parts = line.split(' ')
                const rawLevel = parts[1]?.toLowerCase() ?? 'info'
                const level: LogEntry['level'] = rawLevel === 'fatal' ? 'fatal' : rawLevel === 'error' ? 'error' : 'info'
                const msg = parts.slice(3).join(' ')
                addLog(procName, level, msg || line)
              }
            }
          }
        },
        (isConnected) => setConnected(isConnected),
      )
      return cleanup
    }, [apiBase, connType, addLog])

    const setStatus = (stackName: string, proc: string, status: ProcessStatus) =>
      setStatuses(s => ({ ...s, [stackName]: { ...s[stackName], [proc]: status } }))

    // ── Process control ──────────────────────────────────────────────────────

    const startProcess = useCallback(async (stackName: string, proc: string) => {
      const api = connType === 'q' ? qApi : realApi
      try {
        await api.startProcess(stackName, proc)
        setStatus(stackName, proc, 'running')
        addLog(proc, 'info', `${proc} started`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('invalid process name')) {
          addLog(proc, 'error', `${proc}: hub doesn't know this process — restart the hub to pick up new stacks`)
        } else {
          try { await mock.startProcess(stackName, proc) } catch { /* ignore */ }
          addLog(proc, 'error', `${proc} start failed: ${msg}`)
          setStatus(stackName, proc, 'running')
        }
      }
    }, [addLog, connType])

    const stopProcess = useCallback(async (stackName: string, proc: string) => {
      const api = connType === 'q' ? qApi : realApi
      try {
        await api.stopProcess(stackName, proc)
        setStatus(stackName, proc, 'stopped')
        addLog(proc, 'info', `${proc} stopped`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('invalid process name')) {
          addLog(proc, 'error', `${proc}: hub doesn't know this process — restart the hub to pick up new stacks`)
        } else {
          try { await mock.stopProcess(stackName, proc) } catch { /* ignore */ }
          addLog(proc, 'error', `${proc} stop failed: ${msg}`)
          setStatus(stackName, proc, 'stopped')
        }
      }
    }, [addLog, connType])

    const startAll = useCallback(async (stackName: string) => {
      const api = connType === 'q' ? qApi : realApi
      const procs = Object.keys(stacks[stackName]?.processes ?? {})
      try {
        await api.startAll(stackName)
        addLog('system', 'info', `All processes started in ${stackName}`)
        // Update individual statuses (merge, not replace) to avoid triggering full nodes recompute
        setStatuses(s => ({
          ...s,
          [stackName]: { ...s[stackName], ...Object.fromEntries(procs.map(p => [p, 'running' as const])) },
        }))
      } catch {
        addLog('system', 'error', `Start all failed for ${stackName}`)
      }
    }, [stacks, addLog, connType])

    const stopAll = useCallback(async (stackName: string) => {
      const api = connType === 'q' ? qApi : realApi
      const procs = Object.keys(stacks[stackName]?.processes ?? {})
      try {
        await api.stopAll(stackName)
        addLog('system', 'info', `All processes stopped in ${stackName}`)
        setStatuses(s => ({
          ...s,
          [stackName]: { ...s[stackName], ...Object.fromEntries(procs.map(p => [p, 'stopped' as const])) },
        }))
      } catch {
        addLog('system', 'error', `Stop all failed for ${stackName}`)
      }
    }, [stacks, addLog, connType])

    // ── Stack CRUD ───────────────────────────────────────────────────────────

    const addStack = useCallback(async (name: string, stack: Stack) => {
      const api = connType === 'q' ? qApi : realApi
      setStacks(s => ({ ...s, [name]: stack }))
      setStackOrder(o => [...o, name])
      setActiveStack(name)
      try {
        await api.saveStack(name, stack)
        addLog('system', 'info', `Stack "${name}" created`)
      } catch (e) {
        await mock.createStack(name, stack)
        const msg = e instanceof Error ? e.message : String(e)
        addLog('system', 'error', `Stack "${name}" save failed: ${msg}`)
      }
    }, [addLog, connType])

    const renameStack = useCallback(async (oldName: string, newName: string) => {
      try {
        if (connType === 'q') {
          await qApi.renameStack(oldName, newName)
        } else {
          await realApi.saveStack(newName, stacks[oldName])
          await realApi.deleteStack(oldName)
        }
        addLog('system', 'info', `Stack "${oldName}" renamed to "${newName}"`)
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = raw.replace(/^kdb error:\s*/i, '')
        addLog('system', 'error', `Rename failed: ${msg}`)
        return   // don't update local state — backend rejected the rename
      }
      setStacks(s => {
        const ns = { ...s, [newName]: s[oldName] }
        delete ns[oldName]
        return ns
      })
      setStackOrder(o => o.map(n => n === oldName ? newName : n))
      setStatuses(s => {
        const ns = { ...s, [newName]: s[oldName] ?? {} }
        delete ns[oldName]
        return ns
      })
      if (activeStack === oldName) setActiveStack(newName)
    }, [stacks, activeStack, addLog, connType])

    const cloneStack = useCallback(async (name: string, newName: string) => {
      const api = connType === 'q' ? qApi : realApi
      try {
        const cloned = await api.cloneStack(name, newName)
        setStacks(s => ({ ...s, [newName]: cloned }))
        addLog('system', 'info', `Stack "${name}" cloned as "${newName}"`)
      } catch {
        await mock.cloneStack(name, newName)
        setStacks(s => ({ ...s, [newName]: { ...structuredClone(s[name]), description: newName } }))
        addLog('system', 'error', `Stack "${newName}" cloned locally (backend offline)`)
      }
      setStackOrder(o => [...o, newName])
      setActiveStack(newName)
    }, [addLog, connType])

    const deleteStack = useCallback(async (name: string) => {
      const api = connType === 'q' ? qApi : realApi
      try {
        await api.deleteStack(name)
        addLog('system', 'info', `Stack "${name}" deleted`)
      } catch (e) {
        try { await mock.deleteStack(name) } catch { /* ignore */ }
        addLog('system', 'error', `Stack "${name}" delete failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      setStacks(s => {
        const ns = { ...s }
        delete ns[name]
        return ns
      })
      setStackOrder(o => {
        const remaining = o.filter(n => n !== name)
        if (activeStack === name) setActiveStack(remaining[0] ?? '')
        return remaining
      })
    }, [activeStack, addLog, connType])

    const saveStack = useCallback(async (name: string, stack: Stack) => {
      const api = connType === 'q' ? qApi : realApi
      setStacks(s => ({ ...s, [name]: stack }))
      try {
        await api.saveStack(name, stack)
        addLog('system', 'info', `Stack "${name}" saved`)
      } catch (e) {
        try { await mock.updateStack(name, stack) } catch { /* ignore */ }
        addLog('system', 'error', `Save failed for "${name}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }, [addLog, connType])

    // Live update without API call — used by JSON editor while typing
    const updateStackLocal = useCallback((name: string, stack: Stack) => {
      setStacks(s => ({ ...s, [name]: stack }))
    }, [])

    return (
      <ControlContext.Provider value={{
        stacks, stackOrder, activeStack, setActiveStack,
        selectedProc, setSelectedProc,
        statuses, viewMode, setViewMode, logs,
        jsonStatus, setJsonStatus,
        connected, stacksLoading, statusesLoading,
        addStack, renameStack, cloneStack, deleteStack, saveStack, updateStackLocal,
        startProcess, stopProcess, startAll, stopAll,
      }}>
        {children}
      </ControlContext.Provider>
    )
  }

  // eslint-disable-next-line react-refresh/only-export-components
  export function useControl() {
    const ctx = useContext(ControlContext)
    if (!ctx) throw new Error('useControl must be used within ControlProvider')
    return ctx
  }
