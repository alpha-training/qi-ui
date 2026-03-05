import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'
import type { Connection } from '../types'
import { setApiBase } from '../api/api'

const STORAGE_KEY = 'qi_connections'
const ACTIVE_KEY  = 'qi_active_connection'
const DEFAULT_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:9001'

function connToBase(conn: Connection): string {
  return `http://${conn.host}:${conn.port}`
}

function loadConnections(): Connection[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

interface ConnectionState {
  connections: Connection[]
  activeId: string | null
  activeConn: Connection | null
  apiBase: string
  showOnboarding: boolean
  setActiveId: (id: string | null) => void
  addConnection: (data: Omit<Connection, 'id'>) => Connection
  updateConnection: (conn: Connection) => void
  removeConnection: (id: string) => void
}

const ConnectionContext = createContext<ConnectionState | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [connections, setConnections] = useState<Connection[]>(loadConnections)
  const [activeId, setActiveIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY)
  )

  const activeConn = connections.find(c => c.id === activeId) ?? null
  const apiBase = activeConn ? connToBase(activeConn) : DEFAULT_BASE
  const showOnboarding = connections.length === 0

  // Keep api module in sync with selected connection
  useEffect(() => {
    setApiBase(apiBase)
  }, [apiBase])

  // Persist connections to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
  }, [connections])

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id)
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  const addConnection = useCallback((data: Omit<Connection, 'id'>): Connection => {
    const conn: Connection = { ...data, id: crypto.randomUUID() }
    setConnections(prev => [...prev, conn])
    setActiveId(conn.id)
    return conn
  }, [setActiveId])

  const updateConnection = useCallback((conn: Connection) => {
    setConnections(prev => prev.map(c => c.id === conn.id ? conn : c))
  }, [])

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }, [activeId, setActiveId])

  return (
    <ConnectionContext.Provider value={{
      connections, activeId, activeConn, apiBase, showOnboarding,
      setActiveId, addConnection, updateConnection, removeConnection,
    }}>
      {children}
    </ConnectionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConnectionContext() {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error('useConnectionContext must be used within ConnectionProvider')
  return ctx
}
