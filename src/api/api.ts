import { API_BASE } from '../config'
import type { Stack } from '../types'

// ─── Stack reads/writes ───────────────────────────────────────────────────────

/** Fetch all stacks from the new liststacks endpoint */
export async function getStacks(): Promise<Record<string, Stack>> {
  const res = await fetch(`${API_BASE}/liststacks/`)
  if (!res.ok) throw new Error(`liststacks/ failed: ${res.statusText}`)
  const data = await res.json()

  // New format: ["dev1", "dev2"] — fetch each stack config individually
  if (Array.isArray(data)) {
    const entries = await Promise.all(
      (data as string[]).map(async name => [name, await getStack(name)] as [string, Stack])
    )
    return Object.fromEntries(entries)
  }

  // Old format: { name: Stack }
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, Stack>
  }

  throw new Error('liststacks/ returned unexpected format')
}

/** Fetch a single stack config from the backend */
export async function getStack(name: string): Promise<Stack> {
  const res = await fetch(`${API_BASE}/readstack/${name}`)
  if (!res.ok) throw new Error(`readstack/${name} failed: ${res.statusText}`)
  return res.json()
}

/** Save a stack — POST with JSON body (new writestack endpoint).
 *  Strips routing fields (publish_to, subscribe_to, hdb) that qi-proc
 *  does not yet support — they are used by the UI only. */
export async function saveStack(name: string, stack: Stack): Promise<void> {
  const stripped: Stack = {
    ...stack,
    processes: Object.fromEntries(
      Object.entries(stack.processes).map(([k, p]) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { publish_to, subscribe_to, hdb, ...rest } = p as typeof p & {
          publish_to?: unknown; subscribe_to?: unknown; hdb?: unknown
        }
        return [k, rest]
      })
    ),
  }
  const res = await fetch(`${API_BASE}/writestack/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stripped),
  })
  if (!res.ok) throw new Error(`writestack/${name} failed: ${res.statusText}`)
}

/** Clone a stack — then reads back the new stack to verify */
export async function cloneStack(name: string, newName: string): Promise<Stack> {
  const res = await fetch(`${API_BASE}/clonestack/${name}/${newName}`)
  if (!res.ok) throw new Error(`clonestack/${name}/${newName} failed: ${res.statusText}`)
  return getStack(newName)
}

/** Delete a stack */
export async function deleteStack(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/deletestack/${name}`)
  if (!res.ok) throw new Error(`deletestack/${name} failed: ${res.statusText}`)
}

// ─── Process control ──────────────────────────────────────────────────────────

/** Start a process — format: /up/procname.stackname */
export async function startProcess(stack: string, proc: string): Promise<void> {
  const name = `${proc}.${stack}`
  const res = await fetch(`${API_BASE}/up/${name}`)
  if (!res.ok) throw new Error(`up/${name} failed: ${res.statusText}`)
}

/** Stop a process — format: /down/procname.stackname */
export async function stopProcess(stack: string, proc: string): Promise<void> {
  const name = `${proc}.${stack}`
  const res = await fetch(`${API_BASE}/down/${name}`)
  if (!res.ok) throw new Error(`down/${name} failed: ${res.statusText}`)
}

/** Start all processes in a stack — format: /up/stackname */
export async function startAll(stack: string): Promise<void> {
  const res = await fetch(`${API_BASE}/up/${stack}`)
  if (!res.ok) throw new Error(`up/${stack} failed: ${res.statusText}`)
}

/** Stop all processes in a stack — format: /down/stackname */
export async function stopAll(stack: string): Promise<void> {
  const res = await fetch(`${API_BASE}/down/${stack}`)
  if (!res.ok) throw new Error(`down/${stack} failed: ${res.statusText}`)
}

// ─── SSE stream ───────────────────────────────────────────────────────────────

export interface StreamMessage {
  callback: string
  result: unknown
  error: string
}

/** Shape of a process status record from the kdb+ upd stream */
export interface ProcStatus {
  name: string        // "tp1.dev1"
  proc: string        // "tp"
  stackname: string   // "dev1"
  port: number
  status: 'up' | 'down'
  pid: number | null
  lastheartbeat: string
  goal?: string
  logfile?: string
  attempts?: number | null
  lastattempt?: string
  used?: unknown
  heap?: unknown
}

/** Shape of a log entry from the kdb+ Logs stream */
export interface StreamLogEntry {
  time: string
  sym: string
  lines: string
  name: string        // "tp1.dev1"
}

/**
 * Open an SSE connection to /stream.
 * Returns a cleanup function to close it (use in useEffect cleanup).
 */
export function connectStream(
  onMessage: (msg: StreamMessage) => void,
  onStatusChange: (connected: boolean) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/stream`)

  es.onopen = () => onStatusChange(true)

  es.onmessage = (e) => {
    try {
      const msg: StreamMessage = JSON.parse(e.data)
      onMessage(msg)
    } catch {
      console.warn('[stream] could not parse message:', e.data)
    }
  }

  es.onerror = () => {
    onStatusChange(false)
  }

  return () => es.close()
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/ping`)
    return res.ok
  } catch {
    return false
  }
}
