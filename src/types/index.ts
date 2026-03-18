// ─── Stack / Process ──────────────────────────────────────────────────────────

export interface Process {
    pkg: string
    port_offset: number
    args?: string[]
    publish_to?: string[]
    subscribe_to?: Record<string, string>
    hdb?: string
  }
  
  export interface Stack {
    description: string
    base_port: number
    processes: Record<string, Process>
  }
  
  // ─── Runtime / Status ─────────────────────────────────────────────────────────
  
  export type ProcessStatus = 'running' | 'stopped' | 'busy'
  
  export interface ProcessRuntime {
    name: string
    process: Process
    status: ProcessStatus
    port: number
    pid?: number
    host: string
    mem?: string
    heap?: string
  }
  
  // ─── Graph ────────────────────────────────────────────────────────────────────
  
  export type EdgeType = 'publishes' | 'subscribes' | 'hdb'
  
  export interface GraphNode {
    id: string
    data: ProcessRuntime
    position: { x: number; y: number }
    type: 'processNode'
  }
  
  export interface GraphEdge {
    id: string
    source: string
    target: string
    edgeType: EdgeType
  }
  
  // ─── Logs ─────────────────────────────────────────────────────────────────────
  
  export type LogLevel = 'info' | 'error' | 'fatal'
  
  export interface LogEntry {
    id: number
    process: string
    stackname: string   // '' = show in all stacks (system-wide messages)
    level: LogLevel
    msg: string
    ts: string
  }
  
  // ─── Connection ───────────────────────────────────────────────────────────────

export interface Connection {
  id: string
  host: string
  port: number
  name?: string
  username?: string
  password?: string
  type?: 'q' | 'api'
}

// ─── JSON Editor ──────────────────────────────────────────────────────────────

export type JsonStatus = 'valid' | 'invalid' | 'unsaved'

// ─── View ─────────────────────────────────────────────────────────────────────

  export type ViewMode = 'graph' | 'table'
  
  export interface StackTab {
    name: string
    stack: Stack
  }