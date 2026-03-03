import {
    createContext, useContext, useState, useEffect, useCallback,
    type ReactNode,
  } from 'react'
  import type { Stack, ProcessStatus, LogEntry, ViewMode, JsonStatus } from '../types'
  import * as api from '../api/mock'

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

    useEffect(() => {
      api.getStacks().then(s => {
        setStacks(s)
        const order = Object.keys(s)
        setStackOrder(order)
        setActiveStack(order[0] ?? '')
      })
    }, [])

    const addLog = useCallback((process: string, level: LogEntry['level'], msg: string) => {
      const ts = new Date().toTimeString().slice(0, 8)
      setLogs(l => [...l, { id: _logId++, process, level, msg, ts }])
    }, [])

    const setStatus = (stackName: string, proc: string, status: ProcessStatus) =>
      setStatuses(s => ({ ...s, [stackName]: { ...s[stackName], [proc]: status } }))

    const startProcess = useCallback(async (stackName: string, proc: string) => {
      await api.startProcess(stackName, proc)
      setStatus(stackName, proc, 'running')
      addLog(proc, 'info', `${proc} started`)
    }, [addLog])

    const stopProcess = useCallback(async (stackName: string, proc: string) => {
      await api.stopProcess(stackName, proc)
      setStatus(stackName, proc, 'stopped')
      addLog(proc, 'info', `${proc} stopped`)
    }, [addLog])

    const startAll = useCallback(async (stackName: string) => {
      await api.startAll(stackName)
      const procs = stacks[stackName]?.processes ?? {}
      const all: Record<string, ProcessStatus> = {}
      Object.keys(procs).forEach(p => { all[p] = 'running' })
      setStatuses(s => ({ ...s, [stackName]: all }))
      addLog('system', 'info', `All processes started in ${stackName}`)
    }, [stacks, addLog])

    const stopAll = useCallback(async (stackName: string) => {
      await api.stopAll(stackName)
      const procs = stacks[stackName]?.processes ?? {}
      const all: Record<string, ProcessStatus> = {}
      Object.keys(procs).forEach(p => { all[p] = 'stopped' })
      setStatuses(s => ({ ...s, [stackName]: all }))
      addLog('system', 'info', `All processes stopped in ${stackName}`)
    }, [stacks, addLog])

    const addStack = useCallback(async (name: string, stack: Stack) => {
      await api.createStack(name, stack)
      setStacks(s => ({ ...s, [name]: stack }))
      setStackOrder(o => [...o, name])
      setActiveStack(name)
    }, [])

    const renameStack = useCallback(async (oldName: string, newName: string) => {
      await api.createStack(newName, stacks[oldName])
      await api.deleteStack(oldName)
      setStacks(s => {
        const ns = { ...s, [newName]: s[oldName] }
        delete ns[oldName]
        return ns
      })
      setStackOrder(o => o.map(n => n === oldName ? newName : n))
      if (activeStack === oldName) setActiveStack(newName)
    }, [stacks, activeStack])

    const cloneStack = useCallback(async (name: string, newName: string) => {
      await api.cloneStack(name, newName)
      setStacks(s => ({ ...s, [newName]: { ...structuredClone(s[name]), description: newName } }))
      setStackOrder(o => [...o, newName])
      setActiveStack(newName)
    }, [])

    const deleteStack = useCallback(async (name: string) => {
      await api.deleteStack(name)
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
      await api.updateStack(name, stack)
      setStacks(s => ({ ...s, [name]: stack }))
      addLog('system', 'info', `Stack "${name}" saved`)
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
