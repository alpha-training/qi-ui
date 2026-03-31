/**
 * Direct WebSocket connection to a kdb+ process (qdirect protocol).
 *
 * Protocol:
 *   Send:    JSON  { cmd: string, format: 'text' | 'data' }
 *   Receive: binary kdb+ IPC, deserialised via c.js
 *            result shape: { format: 'text'|'data', result: unknown }
 *
 * Before sending queries, call initProcess() which sends .proc.ui.init[]
 * directly on the connection so it installs the correct .z.ws handler.
 */

import { deserialize } from '../lib/c.js'

export type DirectFormat = 'text' | 'data'

export interface DirectResult {
  format: DirectFormat
  result: unknown
}

type PendingEntry = {
  resolve: (v: DirectResult) => void
  reject: (e: Error) => void
}

export class DirectConnection {
  private ws: WebSocket | null = null
  private pending: PendingEntry[] = []
  private _connected = false

  get connected() { return this._connected }

  connect(host: string, port: number): Promise<void> {
    this.disconnect()
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${host}:${port}`)
      ws.binaryType = 'arraybuffer'

      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`Connection to ${host}:${port} timed out`))
      }, 5000)

      ws.onopen = () => {
        clearTimeout(timer)
        this.ws = ws
        this._connected = true
        resolve()
      }

      ws.onerror = () => {
        clearTimeout(timer)
        reject(new Error(`Failed to connect to ${host}:${port}`))
      }

      ws.onclose = () => {
        this.ws = null
        this._connected = false
        const drained = this.pending.splice(0)
        for (const p of drained) p.reject(new Error('Connection closed'))
      }

      ws.onmessage = (e: MessageEvent) => {
        const p = this.pending.shift()
        if (!p) return
        try {
          const raw = deserialize(e.data) as DirectResult | string
          if (typeof raw === 'string' && (raw as string).startsWith('kdb error:')) {
            p.reject(new Error(raw as string))
          } else {
            p.resolve(raw as DirectResult)
          }
        } catch (err) {
          p.reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })
  }

  query(cmd: string, format: DirectFormat = 'data', pagestart = 0, pagesize = 100, timeoutMs = 10000): Promise<DirectResult> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'))
        return
      }

      const entry: PendingEntry = { resolve: () => {}, reject: () => {} }
      const timer = setTimeout(() => {
        const idx = this.pending.indexOf(entry)
        if (idx !== -1) this.pending.splice(idx, 1)
        reject(new Error(`Query timed out: ${cmd}`))
      }, timeoutMs)

      entry.resolve = (v) => { clearTimeout(timer); resolve(v) }
      entry.reject  = (e) => { clearTimeout(timer); reject(e) }

      this.pending.push(entry)
      this.ws.send(JSON.stringify({ cmd, format, pagestart: pagestart | 0, pagesize: pagesize | 0 }))
    })
  }

  /** Send .proc.ui.init[] as a plain string directly on this connection.
   *  The process evaluates it and installs the proper .z.ws handler.
   *  We don't wait for a response — just give it 200ms to complete. */
  initProcess(): Promise<void> {
    return new Promise(resolve => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { resolve(); return }
      try { this.ws.send('.proc.ui.init[]') } catch { /* ignore */ }
      setTimeout(resolve, 200)
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this._connected = false
    const drained = this.pending.splice(0)
    for (const p of drained) p.reject(new Error('Disconnected'))
  }
}
