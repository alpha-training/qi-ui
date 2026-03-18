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

  const STACK_ORDER_KEY  = 'qi_stack_order'
  const ACTIVE_STACK_KEY = 'qi_active_stack'

  function loadSavedOrder(): string[] {
    try { return JSON.parse(localStorage.getItem(STACK_ORDER_KEY) ?? '[]') } catch { return [] }
  }

  function mergeOrder(saved: string[], backend: string[]): string[] {
    return [
      ...saved.filter(n => backend.includes(n)),
      ...backend.filter(n => !saved.includes(n)),
    ]
  }

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
    reconnect: () => void

    // Stack actions
    addStack: (name: string, stack: Stack) => Promise<void>
    renameStack: (oldName: string, newName: string) => Promise<void>
    cloneStack: (name: string, newName: string, port?: number) => Promise<void>
    deleteStack: (name: string) => Promise<void>
    saveStack: (name: string, stack: Stack) => Promise<void>      // persists to API
    updateStackLocal: (name: string, stack: Stack) => void        // live update, no API call
    reorderStacks: (newOrder: string[]) => void

    clearLogs: () => void
    refreshStackLogs: (stack: string, proc?: string) => void

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

    // Ignore log entries older than session start (avoids replaying old errors via refreshlogs)
    const sessionStartRef = useRef(new Date())

    const [reconnectKey, setReconnectKey] = useState(0)
    const reconnect = useCallback(() => setReconnectKey(k => k + 1), [])

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
    const lastLogLevelRef = useRef<Record<string, LogEntry['level']>>({})
    // Tracks processes stopped intentionally so watchdogs don't false-alarm
    const intentionallyStoppedRef = useRef<Set<string>>(new Set())

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
    }, [apiBase, connType, reconnectKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

    
    // Persist active stack so browser refresh lands on the same tab
    useEffect(() => {
      if (activeStack) localStorage.setItem(ACTIVE_STACK_KEY, activeStack)
    }, [activeStack])

    // ── Load stacks: try real API first, fall back to mock ───────────────────
    useEffect(() => {
const api = connType === 'q' ? qApi : realApi
      api.getStacks()
        .then(async s => {
          hasRealStacksRef.current = true
          setStacks(s)
          const order = mergeOrder(loadSavedOrder(), Object.keys(s))
          setStackOrder(order)
          const savedActive = localStorage.getItem(ACTIVE_STACK_KEY) ?? ''
          setActiveStack(order.includes(savedActive) ? savedActive : (order[0] ?? ''))
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
                    const status: ProcessStatus = p.status === 'up' ? 'running' : p.status === 'busy' ? 'busy' : 'stopped'
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
          // Backend unreachable — show offline state immediately
          if (!hasRealStacksRef.current) {
            setStacksLoading(false)
            setStatusesLoading(false)
          }
        })
    }, [apiBase, connType, reconnectKey])

    const addLog = useCallback((process: string, level: LogEntry['level'], msg: string, stackname = '') => {
      const ts = new Date().toTimeString().slice(0, 8)
      const id = _logId++
      setLogs(l => {
        const next = [...l, { id, process, stackname, level, msg, ts }]
        return next.length > 500 ? next.slice(next.length - 500) : next
      })
    }, [])

    // ── Parse a MonText log row and emit addLog calls ─────────────────────────
    const parseMonTextRow = useCallback((l: { sym?: string; stackname?: string; lines?: string | string[] }) => {
      // sym = ":/path/to/logs/process/dev1/tp1.log"
      const symStr = String(l.sym ?? '')
      const fileName = symStr.split('/').pop() ?? ''          // "tp1.log"
      const procName = fileName.replace(/\.log$/, '') || 'system'  // "tp1"
      const stackname = String(l.stackname ?? '')
      const lines = Array.isArray(l.lines) ? l.lines : [String(l.lines ?? '')]
      for (const line of lines) {
        if (!line.trim()) continue
        // Line format: "2026.03.05D16:36:03.000000000 info 0 message here"
        const parts = line.split(' ')
        const rawLevel = parts[1]?.toLowerCase() ?? ''
        const knownLevel: LogEntry['level'] | null =
          rawLevel === 'fatal' ? 'fatal' : rawLevel === 'error' ? 'error' : rawLevel === 'info' ? 'info' : null
        if (knownLevel !== null) {
          lastLogLevelRef.current[procName] = knownLevel
          addLog(procName, knownLevel, parts.slice(3).join(' ') || line, stackname)
        } else {
          addLog(procName, lastLogLevelRef.current[procName] ?? 'info', line, stackname)
        }
      }
    }, [addLog])

    // ── Stream — live process status updates from kdb+ ────────────────────────
    useEffect(() => {
      const api = connType === 'q' ? qApi : realApi
      const cleanup = api.connectStream(
        (msg: StreamMessage) => {
          const result = msg.result
          if (!Array.isArray(result) || result.length < 2) return
          const [tableName, rows] = result as [string, unknown[]]
          if (!Array.isArray(rows) || rows.length === 0) return

          if (tableName === 'processes') {
            const procRows = rows as realApi.ProcStatus[]
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
          } else if (tableName === 'MonText' || tableName === 'Logs') {
            const logRows = rows as Array<{ sym?: string; name?: string; stackname?: string; lines?: string | string[] }>
            for (const l of logRows) parseMonTextRow(l)
          }
        },
        (isConnected) => setConnected(isConnected),
      )

      // Fetch recent logs once on connect — stream handles live updates from here
      let logTimer: ReturnType<typeof setTimeout> | null = null
      if (connType === 'q') {
        const sessionStart = sessionStartRef.current
        logTimer = setTimeout(async () => {
          try {
            const rows = await qApi.refreshLogs()
            if (!Array.isArray(rows) || rows.length === 0) return
            for (const r of rows) {
              const ts = String((r as { time?: string }).time ?? '')
              if (ts) {
                const iso = ts.replace('D', 'T').slice(0, 23)
                if (new Date(iso) < sessionStart) continue
              }
              parseMonTextRow(r)
            }
          } catch { /* ignore — stream will deliver live logs */ }
        }, 1500)
      }

      return () => { cleanup(); if (logTimer) clearTimeout(logTimer) }
    }, [apiBase, connType, addLog, parseMonTextRow])

    const setStatus = (stackName: string, proc: string, status: ProcessStatus) =>
      setStatuses(s => ({ ...s, [stackName]: { ...s[stackName], [proc]: status } }))

    // ── Process control ──────────────────────────────────────────────────────

    // After sending up/down, wait briefly then query real statuses to correct any wrong optimistic updates
    const refreshStatuses = useCallback(() => {
      if (connType !== 'q') return
      setTimeout(async () => {
        try {
          const rows = await qApi.getStatuses()
          if (!Array.isArray(rows) || rows.length === 0) return
          setStatuses(prev => {
            const next = { ...prev }
            for (const p of rows) {
              if (!p.stackname || !p.name) continue
              const procName = p.name.split('.')[0]
              const status: ProcessStatus = p.status === 'up' ? 'running' : p.status === 'busy' ? 'busy' : 'stopped'
              next[p.stackname] = { ...next[p.stackname], [procName]: status }
            }
            return next
          })
        } catch { /* stream will correct eventually */ }
      }, 2000)
    }, [connType])

    const startProcess = useCallback(async (stackName: string, proc: string) => {
      const api = connType === 'q' ? qApi : realApi
      const key = `${stackName}.${proc}`
      intentionallyStoppedRef.current.delete(key)
      try {
        await api.startProcess(stackName, proc)
        setStatus(stackName, proc, 'running')
        addLog(proc, 'info', `${proc} started`, stackName)
        refreshStatuses()
        // Watchdog: warn if process is still down after 7s (crashed before connecting to hub)
        if (connType === 'q') {
          setTimeout(async () => {
            try {
              const rows = await qApi.getStatuses()
              const row = rows.find(r => r.stackname === stackName && r.name.split('.')[0] === proc)
              if (row && row.status !== 'up' && row.status !== 'busy') {
                if (!intentionallyStoppedRef.current.has(key)) {
                  addLog(proc, 'error', `${proc} failed to start — check ~/projects/qi/data/${stackName}/logs/${proc}.log`, stackName)
                  setStatus(stackName, proc, 'stopped')
                }
                intentionallyStoppedRef.current.delete(key)
              }
            } catch { /* ignore */ }
          }, 20000)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('invalid process name')) {
          addLog(proc, 'error', `${proc}: hub doesn't know this process — restart the hub to pick up new stacks`, stackName)
        } else {
          try { await mock.startProcess(stackName, proc) } catch { /* ignore */ }
          addLog(proc, 'error', `${proc} start failed: ${msg}`, stackName)
          setStatus(stackName, proc, 'stopped')
        }
      }
    }, [addLog, connType, refreshStatuses])

    const stopProcess = useCallback(async (stackName: string, proc: string) => {
      const api = connType === 'q' ? qApi : realApi
      intentionallyStoppedRef.current.add(`${stackName}.${proc}`)
      try {
        await api.stopProcess(stackName, proc)
        setStatus(stackName, proc, 'stopped')
        addLog(proc, 'info', `${proc} stopped`, stackName)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('invalid process name')) {
          addLog(proc, 'error', `${proc}: hub doesn't know this process — restart the hub to pick up new stacks`, stackName)
        } else {
          try { await mock.stopProcess(stackName, proc) } catch { /* ignore */ }
          addLog(proc, 'error', `${proc} stop failed: ${msg}`, stackName)
          setStatus(stackName, proc, 'stopped')
        }
      }
    }, [addLog, connType])

    const startAll = useCallback(async (stackName: string) => {
      // Clear intentional-stop flags so watchdog can fire if something doesn't come up
      for (const key of [...intentionallyStoppedRef.current]) {
        if (key.startsWith(`${stackName}.`)) intentionallyStoppedRef.current.delete(key)
      }
      try {
        const api = connType === 'q' ? qApi : realApi
        await api.startAll(stackName)
        addLog('system', 'info', `All processes started in ${stackName}`, stackName)
        refreshStatuses()
        // Watchdog: warn about any processes still down after 10s
        if (connType === 'q') {
          setTimeout(async () => {
            try {
              const rows = await qApi.getStatuses()
              const failed = rows.filter(r => {
                const proc = r.name.split('.')[0]
                return r.stackname === stackName &&
                  r.status !== 'up' && r.status !== 'busy' &&
                  !intentionallyStoppedRef.current.has(`${stackName}.${proc}`)
              })
              for (const r of failed) {
                const proc = r.name.split('.')[0]
                addLog(proc, 'error', `${proc} failed to start — check ~/projects/qi/data/${stackName}/logs/${proc}.log`, stackName)
              }
            } catch { /* ignore */ }
          }, 20000)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        addLog('system', 'error', `Start all failed for ${stackName}: ${msg}`, stackName)
      }
    }, [addLog, connType, refreshStatuses])

    const stopAll = useCallback(async (stackName: string) => {
      const procs = Object.keys(stacks[stackName]?.processes ?? {})
      for (const p of procs) intentionallyStoppedRef.current.add(`${stackName}.${p}`)
      try {
        if (connType === 'q') {
          const results = await Promise.allSettled(procs.map(p => qApi.stopProcess(stackName, p)))
          const stopped = procs.filter((_, i) => results[i].status === 'fulfilled')
          const failed  = procs.filter((_, i) => results[i].status === 'rejected')
          if (stopped.length > 0) {
            setStatuses(s => ({
              ...s,
              [stackName]: { ...s[stackName], ...Object.fromEntries(stopped.map(p => [p, 'stopped' as const])) },
            }))
          }
          if (failed.length > 0) {
            addLog('system', 'error', `Stop all: failed to stop ${failed.join(', ')}`, stackName)
          } else {
            addLog('system', 'info', `All processes stopped in ${stackName}`, stackName)
          }
        } else {
          await realApi.stopAll(stackName)
          addLog('system', 'info', `All processes stopped in ${stackName}`, stackName)
          setStatuses(s => ({
            ...s,
            [stackName]: { ...s[stackName], ...Object.fromEntries(procs.map(p => [p, 'stopped' as const])) },
          }))
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        addLog('system', 'error', `Stop all failed for ${stackName}: ${msg}`, stackName)
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
        addLog('system', 'info', `Stack "${name}" created`, name)
      } catch (e) {
        await mock.createStack(name, stack)
        const msg = e instanceof Error ? e.message : String(e)
        addLog('system', 'error', `Stack "${name}" save failed: ${msg}`, name)
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
        addLog('system', 'info', `Stack "${oldName}" renamed to "${newName}"`, newName)
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = raw.replace(/^kdb error:\s*/i, '')
        addLog('system', 'error', `Rename failed: ${msg}`, oldName)
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

    const cloneStack = useCallback(async (name: string, newName: string, port = 0) => {
      const api = connType === 'q' ? qApi : realApi
      let cloned
      try {
        cloned = await api.cloneStack(name, newName, port)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        addLog('system', 'error', `Clone failed: ${msg}`, name)
        return
      }
      setStacks(s => ({ ...s, [newName]: cloned }))
      setStackOrder(o => [...o, newName])
      setActiveStack(newName)
      addLog('system', 'info', `Stack "${name}" cloned as "${newName}"`, newName)
    }, [addLog, connType])

    const deleteStack = useCallback(async (name: string) => {
      const api = connType === 'q' ? qApi : realApi
      try {
        await api.deleteStack(name)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const clean = msg.replace(/^kdb error:\s*/i, '')
        addLog('system', 'error', `Delete failed: ${clean}`, name)
        return  // backend rejected — keep stack in UI
      }
      try { await mock.deleteStack(name) } catch { /* ignore */ }
      addLog('system', 'info', `Stack "${name}" deleted`, name)
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
        addLog('system', 'info', `Stack "${name}" saved`, name)
      } catch (e) {
        try { await mock.updateStack(name, stack) } catch { /* ignore */ }
        addLog('system', 'error', `Save failed for "${name}": ${e instanceof Error ? e.message : String(e)}`, name)
      }
    }, [addLog, connType])

    const clearLogs = useCallback(() => setLogs([]), [])

    const refreshStackLogs = useCallback((stack: string, proc?: string) => {
      if (connType !== 'q' || !stack) return
      const procArg = proc ? `${proc}.${stack}` : ''
      const sessionStart = sessionStartRef.current
      qApi.refreshLogs(stack, procArg).then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) return
        for (const r of rows) {
          // Skip entries older than session start to avoid replaying stale errors
          const ts = String((r as { time?: string }).time ?? '')
          if (ts) {
            const iso = ts.replace('D', 'T').slice(0, 23)
            if (new Date(iso) < sessionStart) continue
          }
          parseMonTextRow(r)
        }
      }).catch(() => {})
    }, [connType, parseMonTextRow])


    // Live update without API call — used by JSON editor while typing
    const updateStackLocal = useCallback((name: string, stack: Stack) => {
      setStacks(s => ({ ...s, [name]: stack }))
    }, [])

    const reorderStacks = useCallback((newOrder: string[]) => {
      setStackOrder(newOrder)
      localStorage.setItem(STACK_ORDER_KEY, JSON.stringify(newOrder))
    }, [])

    return (
      <ControlContext.Provider value={{
        stacks, stackOrder, activeStack, setActiveStack,
        selectedProc, setSelectedProc,
        statuses, viewMode, setViewMode, logs,
        jsonStatus, setJsonStatus,
        connected, stacksLoading, statusesLoading, reconnect,
        clearLogs, refreshStackLogs,
        addStack, renameStack, cloneStack, deleteStack, saveStack, updateStackLocal, reorderStacks,
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
