/**
 * Direct WebSocket client for kdb+ hub.
 *
 * Hub WebSocket handler:
 *   .z.ws:{a:.j.k x; r:@[get;a`cmd;{"kdb error: ",x}];
 *          if[not"none"~cb:a`callback; ws.push[.z.w;(cb;r)]]}
 *
 * Send:    {cmd: "q expression"}  → hub evaluates and responds {callback: null, result: r}
 * Push:    hub cron auto-publishes: {callback: "upd", result: ["processes"/"Logs", rows]}
 *          NO subscription command needed — hub pushes to all connected WS clients.
 */

import type { Stack } from '../types'
import type { StreamMessage, ProcStatus, StreamLogEntry } from './api'

export type { StreamMessage, ProcStatus, StreamLogEntry }

// ─── State ────────────────────────────────────────────────────────────────────

let _host = 'localhost'
let _port = 8000
let _ws: WebSocket | null = null
let _wsReadyPromise: Promise<void> | null = null
let _wsReadyReject: ((e: Error) => void) | null = null

// Pending query responses (kdb+ is single-threaded — responses are in-order)
const _pending: Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void }> = []

let _onStreamMsg: ((msg: StreamMessage) => void) | null = null
let _onStatusChange: ((connected: boolean) => void) | null = null

// ─── Connection management ────────────────────────────────────────────────────

export function setQBase(host: string, port: number) {
  _host = host
  _port = port
  _closeWs()
}

function _closeWs() {
  if (_ws) {
    _ws.onclose = null
    _ws.onerror = null
    _ws.onmessage = null
    _ws.close()
    _ws = null
  }
  _wsReadyPromise = null
  _wsReadyReject = null
  const drained = _pending.splice(0)
  for (const p of drained) p.reject(new Error('Connection reset'))
}

function _handleMessage(e: MessageEvent) {
  let text: string
  if (typeof e.data === 'string') {
    text = e.data
  } else {
    text = new TextDecoder().decode(new Uint8Array(e.data as ArrayBuffer))
  }

  let msg: unknown
  try {
    msg = JSON.parse(text)
  } catch {
    const p = _pending.shift()
    if (p) p.reject(new Error(`Non-JSON response: ${text.slice(0, 200)}`))
    return
  }

  // Hub push messages always have callback === "upd"
  // Query responses have callback === null (or whatever we sent)
  if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).callback === 'upd') {
    _onStreamMsg?.(msg as StreamMessage)
  } else {
    const p = _pending.shift()
    if (p) p.resolve((msg as Record<string, unknown>)?.result ?? msg)
  }
}

function _ensureOpen(): Promise<void> {
  if (_ws?.readyState === WebSocket.OPEN) return Promise.resolve()
  if (_wsReadyPromise) return _wsReadyPromise

  let resolved = false
  _wsReadyPromise = new Promise<void>((resolve, reject) => {
    _wsReadyReject = reject

    const ws = new WebSocket(`ws://${_host}:${_port}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      _ws = ws
      _wsReadyPromise = null
      _wsReadyReject = null
      _onStatusChange?.(true)
      resolved = true
      resolve()
    }

    ws.onmessage = _handleMessage

    ws.onerror = () => {
      _onStatusChange?.(false)
      const err = new Error('WebSocket error')
      if (!resolved) { reject(err); resolved = true }
    }

    ws.onclose = () => {
      if (_ws === ws) { _ws = null; _wsReadyPromise = null }
      _onStatusChange?.(false)
      const err = new Error('WebSocket closed')
      if (!resolved) { reject(err); resolved = true }
      if (_wsReadyReject) { _wsReadyReject = null }
      const drained = _pending.splice(0)
      for (const p of drained) p.reject(err)
    }
  })

  return _wsReadyPromise
}

// ─── Query (request/response) ─────────────────────────────────────────────────

function query<T>(cmd: string, timeoutMs = 5000): Promise<T> {
  return _ensureOpen().then(
    () =>
      new Promise<T>((resolve, reject) => {
        if (!_ws || _ws.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket not open'))
          return
        }
        const timer = setTimeout(() => {
          const idx = _pending.findIndex(p => p.resolve === (resolve as (v: unknown) => void))
          if (idx !== -1) _pending.splice(idx, 1)
          reject(new Error(`query timeout: ${cmd}`))
        }, timeoutMs)
        _pending.push({
          resolve: (v) => {
            clearTimeout(timer)
            // Hub returns errors as strings: "kdb error: ..."
            if (typeof v === 'string' && v.startsWith('kdb error:')) {
              reject(new Error(v))
            } else {
              ;(resolve as (v: unknown) => void)(v)
            }
          },
          reject:  (e) => { clearTimeout(timer); reject(e) },
        })
        _ws.send(JSON.stringify({ cmd }))
      }),
  )
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function ping(): Promise<boolean> {
  try {
    await _ensureOpen()
    return true
  } catch {
    return false
  }
}

// ─── Stack reads/writes ───────────────────────────────────────────────────────

export async function getStacks(): Promise<Record<string, Stack>> {
  // Use filesystem query to find ALL stack JSON files (including newly created ones
  // in the ui/ subdirectory that aren't in .proc.stacks startup snapshot).
  // Split by "/" to extract filename, works for any path format (hsym or relative sym).
  let names: string[]
  const fsQuery = '{-5_last "/" vs string x} each .qi.paths[.conf.STACKS;"*.json"]'
  try {
    names = await query<string[]>(fsQuery, 10000)
  } catch {
    // Retry once after a short delay before falling back to startup snapshot
    await new Promise(r => setTimeout(r, 1500))
    try {
      names = await query<string[]>(fsQuery, 10000)
    } catch {
      // Final fallback: startup snapshot only (won't include newly created stacks)
      names = await query<string[]>('string 1_key .proc.stacks')
    }
  }
  if (!Array.isArray(names) || names.length === 0) throw new Error('No stacks found')
  const entries = (await Promise.all(
    names.map(async (name): Promise<[string, Stack] | null> => {
      try { return [name, await getStack(name)] }
      catch { return null }
    }),
  )).filter((e): e is [string, Stack] => e !== null)
  if (entries.length === 0) throw new Error('No stacks could be read')
  return Object.fromEntries(entries)
}

export async function getStack(name: string): Promise<Stack> {
  // readstack returns read0 of the JSON file — an array of strings (one per line)
  const lines = await query<string | string[]>(`readstack[\`${name}]`)
  const json = Array.isArray(lines) ? lines.join('\n') : lines
  return JSON.parse(json) as Stack
}

async function triggerUpdate(): Promise<void> {
  await query('updAPI[]').catch(() => { /* best-effort */ })
}

export async function saveStack(name: string, stack: Stack): Promise<void> {
  const jsonStr = JSON.stringify(stack).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  try {
    await query(`writestack[\`${name}; enlist "${jsonStr}"]`)
  } catch (err) {
    // Hub may throw on post-write reload step but file is still written — verify
    const hubErr = err instanceof Error ? err.message : String(err)
    const written = await getStack(name).catch(() => null)
    if (!written) throw new Error(`writestack failed (${hubErr})`)
    const sentKeys    = Object.keys(stack.processes).sort().join(',')
    const writtenKeys = Object.keys(written.processes).sort().join(',')
    if (sentKeys !== writtenKeys) throw new Error(`writestack: content not updated (${hubErr})`)
  }
  await triggerUpdate()
}

export async function renameStack(name: string, newName: string): Promise<void> {
  try {
    await query(`renamestack[\`${name};\`${newName}]`)
  } catch {
    const written = await getStack(newName).catch(() => null)
    if (!written) throw new Error('renamestack failed and could not be verified')
  }
  await triggerUpdate()
}

export async function cloneStack(name: string, newName: string): Promise<Stack> {
  try {
    await query(`clonestack[\`${name};\`${newName}]`)
  } catch {
    const written = await getStack(newName).catch(() => null)
    if (!written) throw new Error('clonestack failed and clone could not be verified')
  }
  await triggerUpdate()
  return getStack(newName)
}

export async function deleteStack(name: string): Promise<void> {
  await query(`deletestack[\`${name}]`)
  await triggerUpdate()
}

// ─── Current process statuses (one-shot query, not stream) ───────────────────

export async function getStatuses(): Promise<Array<{ name: string; stackname: string; status: string }>> {
  return query('select name,stackname,status from procs')
}

// ─── Process control ──────────────────────────────────────────────────────────

export async function startProcess(stack: string, proc: string): Promise<void> {
  // up accepts `proc.stack — hub's tofullname handles the format
  await query(`up \`${proc}.${stack}`)
}

export async function stopProcess(stack: string, proc: string): Promise<void> {
  await query(`down \`${proc}.${stack}`)
}

export async function startAll(stack: string): Promise<void> {
  // up `stackname starts all processes in that stack
  await query(`up \`${stack}`)
}

export async function stopAll(stack: string): Promise<void> {
  await query(`down \`${stack}`)
}

// ─── Stream via WebSocket ─────────────────────────────────────────────────────

/**
 * Open a persistent WebSocket connection for live process/log updates.
 * The hub automatically pushes {callback:"upd", result:["processes"//"Logs", rows]}
 * to ALL connected WebSocket clients via its check cron — no subscription needed.
 */
export function connectStream(
  onMessage: (msg: StreamMessage) => void,
  onStatusChange: (connected: boolean) => void,
): () => void {
  _onStreamMsg = onMessage
  _onStatusChange = onStatusChange

  _ensureOpen().catch(() => {
    // Connection failed — onStatusChange(false) already called in _ensureOpen
  })

  return () => {
    _onStreamMsg = null
    _onStatusChange = null
    _closeWs()
  }
}
