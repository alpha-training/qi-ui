/**
 * Backtest-engine access, relayed through the hub.
 *
 * The browser can't reach a standalone qs process directly (no .z.ws handler,
 * and it isn't port-forwarded), but the hub can over plain IPC. So every engine
 * call is wrapped as `h:hopen target; r:h"<qExpr>"; hclose h; r` and sent to the
 * hub via the existing WebSocket. The target qs process needs only an open port.
 */

import * as qApi from './qws'

/** Escape a JS string for embedding inside the outer q `h"..."` transport string.
 *  Backslashes must be doubled BEFORE quotes, or pre-escaped quotes get mangled. */
function forTransport(qExpr: string): string {
  return qExpr.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Build a q string literal for a JS string (escapes \ and "). */
export function qstr(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/**
 * Evaluate `qExpr` on the qs process at host:port (relayed through the hub) and
 * return the .j.j-decoded result. Rejects with the kdb error text on failure.
 */
export async function relay(host: string, port: number, qExpr: string, timeoutMs = 30000): Promise<unknown> {
  const cmd = `h:hopen\`$":${host}:${port}"; r:h"${forTransport(qExpr)}"; hclose h; r`
  return qApi.runQuery(cmd, timeoutMs)
}
