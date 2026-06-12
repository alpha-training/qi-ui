/**
 * Backtest performance data — reads the four global tables that `qi.perf`
 * (.qs.perf) sets on the process that ran the backtest:
 *
 *   Info    one row per sym — headline metrics (sharpe, cagr, calmar, dd…)
 *   Stats   one row per sym — trade stats (win%, pf, expectancy…)
 *   Trades  one row per exit (entry/exit time+px, rpnl, ret_pct, bars…)
 *   Equity  one row per (sym, dt) — pv (portfolio value) and dd_pct
 *
 * We DON'T open a WebSocket straight to the qs process — a standalone `qs run`
 * process has no .z.ws handler. Instead we relay through the hub: the hub
 * `hopen`s the target over plain IPC, pulls the tables, and returns them as
 * JSON over its (working) WebSocket. So the target only needs an open port
 * (`\p 9876`) reachable from the hub — no handler, no extra port-forwarding.
 *
 * kdb temporal columns arrive as strings via .j.j: dates as "yyyy-mm-dd",
 * timestamps as "yyyy-mm-ddThh:mm:ss.000000000" (9-digit nanoseconds).
 */

import { relay } from './engine'

export interface InfoRow {
  sym: string
  [metric: string]: unknown
}

export interface StatsRow {
  sym: string
  [metric: string]: unknown
}

export interface TradeRow {
  side: string          // "L" | "S"
  sym: string
  entryTime: string     // "2026-02-08T00:00:00.000000000"
  exitTime: string
  unwind: string        // signal_exit | stop_loss | take_profit | trail | open_close
  entryPx: number
  exitPx: number
  qty: number
  rpnl: number
  ret_pct: number
  bars: number | null
}

export interface EquityRow {
  sym: string
  dt: string            // "2026-02-01"
  pv: number
  dd_pct: number
}

export interface PerfData {
  info: InfoRow[]
  stats: StatsRow[]
  trades: TradeRow[]
  equity: EquityRow[]
  syms: string[]
}

/** Lightweight-charts daily time key: the leading "yyyy-mm-dd" of any kdb
 *  temporal string (dates pass through, timestamps get truncated to the day). */
export function toChartDay(v: string): string {
  return v.slice(0, 10)
}

/** Parse a kdb timestamp string ("…T…000000000") into a JS Date (UTC). */
export function parseKdbTime(v: string): Date {
  // Trim 9-digit nanoseconds to 3-digit milliseconds and pin to UTC.
  const trimmed = v.replace(/(\.\d{3})\d*$/, '$1')
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(trimmed) ? trimmed : trimmed + 'Z')
}

// The query run on the target process. Guards on Equity existing so a process
// with no backtest returns a sentinel instead of a stack of errors.
// NB sentinel must be a valid q symbol (no leading underscore — that parses as
// the cut operator and raises '_).
const NO_RESULTS = 'noresults'
const TARGET_QUERY =
  '$[`Equity in system"a";' +
  '`Info`Stats`Trades`Equity`syms!(' +
  '0!Info;0!Stats;' +
  'select side,sym,entryTime,exitTime,unwind,entryPx,exitPx,qty,rpnl,ret_pct,bars from Trades;' +
  'select sym,dt,pv,dd_pct from Equity;' +
  'asc exec distinct sym from Equity);' +
  '`' + NO_RESULTS + ']'

interface RawPerf {
  Info: InfoRow[]
  Stats: StatsRow[]
  Trades: TradeRow[]
  Equity: EquityRow[]
  syms: string[]
}

/**
 * Pull all four perf tables from `host:port` via the hub. `host`/`port` must be
 * reachable from the hub process (typically localhost). Throws a friendly error
 * if no backtest tables are present or the target is unreachable.
 */
export async function fetchPerf(host: string, port: number): Promise<PerfData> {
  // Hub hopens the target over IPC, pulls the tables, closes the handle.
  // hopen / remote errors propagate to the hub's catch as a "kdb error:" string.
  const res = await relay(host, port, TARGET_QUERY, 30000)

  if (res === NO_RESULTS)
    throw new Error('No backtest results on this process — run a backtest so Info/Stats/Trades/Equity exist.')
  if (!res || typeof res !== 'object')
    throw new Error(`Unexpected response from target: ${String(res).slice(0, 120)}`)

  const d = res as RawPerf
  return {
    info: d.Info ?? [],
    stats: d.Stats ?? [],
    trades: d.Trades ?? [],
    equity: d.Equity ?? [],
    syms: d.syms ?? [],
  }
}
