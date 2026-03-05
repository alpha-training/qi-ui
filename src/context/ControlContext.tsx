import {
    createContext, useContext, useState, useEffect, useCallback, useRef,
    type ReactNode,
  } from 'react'
  import type { Stack, ProcessStatus, LogEntry, ViewMode, JsonStatus } from '../types'
  import * as mock from '../api/mock'
  import * as realApi from '../api/api'
  import type { StreamMessage } from '../api/api'

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
    stacksLoading: boolean  // true while waiting for real stacks to arrive

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
    const hasRealStacksRef = useRef(false)

    // ── Check API connectivity on mount (independent of kdb) ────────────────
    useEffect(() => {
      realApi.ping().then(ok => setConnected(ok))
    }, [])

    // ── Load stacks on mount: try real API first, fall back to mock ─────────
    useEffect(() => {
      realApi.getStacks()
        .then(s => {
          hasRealStacksRef.current = true
          setStacks(s)
          const order = Object.keys(s)
          setStackOrder(order)
          setActiveStack(order[0] ?? '')
          setStacksLoading(false)
        })
        .catch(() => {
          // Wait 3s for SSE to deliver real stacks before falling back to mock
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
    }, [])

    const addLog = useCallback((process: string, level: LogEntry['level'], msg: string) => {
      const ts = new Date().toTimeString().slice(0, 8)
      setLogs(l => [...l, { id: _logId++, process, level, msg, ts }])
    }, [])

    // ── SSE stream — live process status + log updates from kdb+ ────────────
    useEffect(() => {
      const cleanup = realApi.connectStream(
        (msg: StreamMessage) => {
          const result = msg.result
          // Stream format: ["tableName", [...rows]]
          if (!Array.isArray(result) || result.length < 2) return
          const [tableName, rows] = result as [string, unknown[]]
          console.log('[SSE]', tableName, rows)
          if (!Array.isArray(rows) || rows.length === 0) return

          if (tableName === 'processes') {
            const procRows = rows as realApi.ProcStatus[]

            // Update statuses
            setStatuses(prev => {
              const next = { ...prev }
              for (const p of procRows) {
                if (!p.stackname || !p.name) continue
                const procName = p.name.split('.')[0]   // "tp1.dev1" → "tp1"
                const status: ProcessStatus = p.status === 'up' ? 'running' : 'stopped'
                next[p.stackname] = { ...next[p.stackname], [procName]: status }
              }
              return next
            })

            // Build stacks from SSE — replaces mock if real data arrives after fallback
            if (!hasRealStacksRef.current) {
              const stackMap: Record<string, Stack> = {}
              for (const p of procRows) {
                if (!p.stackname || !p.name) continue
                const procName = p.name.split('.')[0]
                if (!stackMap[p.stackname]) {
                  stackMap[p.stackname] = { description: p.stackname, base_port: 0, processes: {} }
                }
                stackMap[p.stackname].processes[procName] = { pkg: p.proc, port_offset: p.port }
              }
              if (Object.keys(stackMap).length > 0) {
                hasRealStacksRef.current = true
                setStacks(stackMap)
                const order = Object.keys(stackMap)
                setStackOrder(order)
                setActiveStack(prev => order.includes(prev) ? prev : (order[0] ?? ''))
                setStacksLoading(false)
              }
            }
          } else if (tableName === 'Logs') {
            const logRows = rows as realApi.StreamLogEntry[]
            for (const l of logRows) {
              const procName = l.name?.split('.')[0] ?? 'system'
              addLog(procName, 'info', l.lines ?? '')
            }
          }
        },
        (isConnected) => setConnected(isConnected),
      )
      return cleanup
    }, [addLog])

    const setStatus = (stackName: string, proc: string, status: ProcessStatus) =>
      setStatuses(s => ({ ...s, [stackName]: { ...s[stackName], [proc]: status } }))

    // ── Process control — uses real API ─────────────────────────────────────

    const startProcess = useCallback(async (stackName: string, proc: string) => {
      try {
        await realApi.startProcess(stackName, proc)
      } catch {
        // Fall back to mock if backend unavailable
        await mock.startProcess(stackName, proc)
        addLog(proc, 'warn', `(offline) ${proc} started locally`)
      }
      setStatus(stackName, proc, 'running')
      addLog(proc, 'info', `${proc} started`)
    }, [addLog])

    const stopProcess = useCallback(async (stackName: string, proc: string) => {
      try {
        await realApi.stopProcess(stackName, proc)
      } catch {
        await mock.stopProcess(stackName, proc)
        addLog(proc, 'warn', `(offline) ${proc} stopped locally`)
      }
      setStatus(stackName, proc, 'stopped')
      addLog(proc, 'info', `${proc} stopped`)
    }, [addLog])

    const startAll = useCallback(async (stackName: string) => {
      try {
        await realApi.startAll(stackName)
      } catch {
        const procs = Object.keys(stacks[stackName]?.processes ?? {})
        await Promise.allSettled(procs.map(p => mock.startProcess(stackName, p)))
        addLog('system', 'warn', `(offline) All processes started locally in ${stackName}`)
      }
      addLog('system', 'info', `All processes started in ${stackName}`)
    }, [stacks, addLog])

    const stopAll = useCallback(async (stackName: string) => {
      try {
        await realApi.stopAll(stackName)
      } catch {
        const procs = Object.keys(stacks[stackName]?.processes ?? {})
        await Promise.allSettled(procs.map(p => mock.stopProcess(stackName, p)))
        addLog('system', 'warn', `(offline) All processes stopped locally in ${stackName}`)
      }
      addLog('system', 'info', `All processes stopped in ${stackName}`)
    }, [stacks, addLog])

    // ── Stack CRUD ───────────────────────────────────────────────────────────

    const addStack = useCallback(async (name: string, stack: Stack) => {
      setStacks(s => ({ ...s, [name]: stack }))
      setStackOrder(o => [...o, name])
      setActiveStack(name)
      try {
        await realApi.saveStack(name, stack)
        addLog('system', 'info', `Stack "${name}" created`)
      } catch {
        await mock.createStack(name, stack)
        addLog('system', 'warn', `Stack "${name}" created locally (backend offline)`)
      }
    }, [addLog])

    const renameStack = useCallback(async (oldName: string, newName: string) => {
      await mock.createStack(newName, stacks[oldName])
      await mock.deleteStack(oldName)
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
    }, [stacks, activeStack])

    const cloneStack = useCallback(async (name: string, newName: string) => {
      try {
        const cloned = await realApi.cloneStack(name, newName)
        setStacks(s => ({ ...s, [newName]: cloned }))
        addLog('system', 'info', `Stack "${name}" cloned as "${newName}"`)
      } catch {
        await mock.cloneStack(name, newName)
        setStacks(s => ({ ...s, [newName]: { ...structuredClone(s[name]), description: newName } }))
        addLog('system', 'warn', `Stack "${newName}" cloned locally (backend offline)`)
      }
      setStackOrder(o => [...o, newName])
      setActiveStack(newName)
    }, [addLog])

    const deleteStack = useCallback(async (name: string) => {
      try {
        await realApi.deleteStack(name)
        addLog('system', 'info', `Stack "${name}" deleted`)
      } catch {
        await mock.deleteStack(name)
        addLog('system', 'warn', `Stack "${name}" deleted locally (backend offline)`)
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
    }, [activeStack])

    const saveStack = useCallback(async (name: string, stack: Stack) => {
      setStacks(s => ({ ...s, [name]: stack }))
      try {
        await realApi.saveStack(name, stack)
        addLog('system', 'info', `Stack "${name}" saved`)
      } catch {
        await mock.updateStack(name, stack)
        addLog('system', 'warn', `Stack "${name}" saved locally (backend offline)`)
      }
    }, [addLog])

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
        connected, stacksLoading,
        addStack, renameStack, cloneStack, deleteStack, saveStack, updateStackLocal,
        startProcess, stopProcess, startAll, stopAll,
      }}>
        {children}
      </ControlContext.Provider>
    )
  }

  export function useControl() {
    const ctx = useContext(ControlContext)
    if (!ctx) throw new Error('useControl must be used within ControlProvider')
    return ctx
  }
