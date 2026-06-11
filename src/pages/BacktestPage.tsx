import { useState, useCallback, useEffect, useMemo } from 'react'
import { ChevronDown, RefreshCw, TrendingUp, Boxes, Plug } from 'lucide-react'
import { useControl } from '../context/ControlContext'
import { useConnectionContext } from '../context/ConnectionContext'
import { useTheme } from '../context/ThemeContext'
import { fetchPerf, parseKdbTime, type PerfData } from '../api/perf'
import EquityChart from '../components/backtest/EquityChart'

const ACTIVE_PROC_KEY = 'qi_backtest_proc'
const MODE_KEY = 'qi_backtest_mode'
const DIRECT_HOST_KEY = 'qi_backtest_direct_host'
const DIRECT_PORT_KEY = 'qi_backtest_direct_port'

type SourceMode = 'stack' | 'direct'

// Metrics surfaced in the header strip, in display order, with formatting.
const INFO_METRICS: { key: string; label: string; fmt?: (v: number) => string; good?: 'high' | 'low' }[] = [
  { key: 'pnl',      label: 'PnL',     fmt: v => v.toLocaleString(undefined, { maximumFractionDigits: 0 }), good: 'high' },
  { key: 'ret_pct',  label: 'Return',  fmt: v => `${v.toFixed(1)}%`, good: 'high' },
  { key: 'cagr_pct', label: 'CAGR',    fmt: v => `${v.toFixed(1)}%`, good: 'high' },
  { key: 'sharpe',   label: 'Sharpe',  fmt: v => v.toFixed(2), good: 'high' },
  { key: 'sortino',  label: 'Sortino', fmt: v => v.toFixed(2), good: 'high' },
  { key: 'calmar',   label: 'Calmar',  fmt: v => v.toFixed(2), good: 'high' },
  { key: 'dd_pct',   label: 'Max DD',  fmt: v => `${v.toFixed(1)}%`, good: 'low' },
  { key: 'vol_pct',  label: 'Vol',     fmt: v => `${v.toFixed(1)}%` },
  { key: 'bench_pct', label: 'Bench',  fmt: v => `${v.toFixed(1)}%` },
]

const STAT_METRICS: { key: string; label: string; fmt?: (v: number) => string }[] = [
  { key: 'trades',    label: 'Trades',  fmt: v => String(v) },
  { key: 'win_pct',   label: 'Win %',   fmt: v => `${v.toFixed(0)}%` },
  { key: 'pf',        label: 'PF',      fmt: v => v.toFixed(2) },
  { key: 'expect',    label: 'Expect',  fmt: v => v.toFixed(1) },
  { key: 'best_pct',  label: 'Best',    fmt: v => `${v.toFixed(1)}%` },
  { key: 'worst_pct', label: 'Worst',   fmt: v => `${v.toFixed(1)}%` },
]

function num(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' | null }) {
  return (
    <div className="flex flex-col px-3 py-1.5 shrink-0">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</span>
      <span className={`text-sm font-mono font-medium ${
        tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-[var(--text-primary)]'
      }`}>{value}</span>
    </div>
  )
}

function fmtTime(s: string): string {
  const d = parseKdbTime(s)
  if (Number.isNaN(d.getTime())) return s ?? ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export default function BacktestPage() {
  const { stacks, stackOrder, activeStack, setActiveStack, statuses, connected } = useControl()
  const { activeConn } = useConnectionContext()
  const { theme } = useTheme()

  const [mode, setMode] = useState<SourceMode>(() => (localStorage.getItem(MODE_KEY) as SourceMode) ?? 'stack')
  const [directHost, setDirectHost] = useState(() => localStorage.getItem(DIRECT_HOST_KEY) ?? 'localhost')
  const [directPort, setDirectPort] = useState(() => localStorage.getItem(DIRECT_PORT_KEY) ?? '9876')
  const [selectedProc, setSelectedProc] = useState<string | null>(() => localStorage.getItem(ACTIVE_PROC_KEY))
  const [stackDropdownOpen, setStackDropdownOpen] = useState(false)
  const [data, setData] = useState<PerfData | null>(null)
  const [activeSym, setActiveSym] = useState<string | null>(null)
  const [showMarkers, setShowMarkers] = useState(false)
  const [showBench, setShowBench] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stackProcs = activeStack && stacks[activeStack]
    ? Object.keys(stacks[activeStack].processes)
    : []
  const stackProcsKey = stackProcs.join(',')

  // Default the process selection to the first proc of the stack.
  useEffect(() => {
    if (selectedProc && stackProcs.includes(selectedProc)) return
    if (stackProcs.length > 0) {
      const saved = localStorage.getItem(ACTIVE_PROC_KEY)
      setSelectedProc(saved && stackProcs.includes(saved) ? saved : stackProcs[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStack, stackProcsKey])

  // Persist mode + direct target.
  useEffect(() => { localStorage.setItem(MODE_KEY, mode) }, [mode])
  useEffect(() => { localStorage.setItem(DIRECT_HOST_KEY, directHost) }, [directHost])
  useEffect(() => { localStorage.setItem(DIRECT_PORT_KEY, directPort) }, [directPort])

  // Clear results when the target changes.
  useEffect(() => {
    setData(null); setActiveSym(null); setError(null)
  }, [mode, activeStack, selectedProc, directHost, directPort])

  const load = useCallback(async () => {
    if (loading) return

    // Resolve the target host:port (as reachable from the hub, which relays).
    let host: string, port: number
    if (mode === 'direct') {
      const p = parseInt(directPort, 10)
      if (!directHost.trim() || Number.isNaN(p)) { setError('Enter a valid host and port'); return }
      host = directHost.trim(); port = p
    } else {
      const stack = stacks[activeStack]
      if (!stack || !selectedProc) { setError('Select a stack and process'); return }
      const procDef = stack.processes[selectedProc]
      if (!procDef) { setError(`Process ${selectedProc} not found in stack`); return }
      host = activeConn?.host ?? 'localhost'
      port = stack.base_port + procDef.port_offset
    }

    setLoading(true); setError(null)
    try {
      const perf = await fetchPerf(host, port)
      setData(perf)
      setActiveSym(perf.syms[0] ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [loading, mode, directHost, directPort, stacks, activeStack, selectedProc, activeConn])

  // Per-sym slices for the chart + table.
  const symEquity = useMemo(
    () => data && activeSym ? data.equity.filter(r => r.sym === activeSym) : [],
    [data, activeSym])
  const symTrades = useMemo(
    () => data && activeSym ? data.trades.filter(r => r.sym === activeSym) : [],
    [data, activeSym])
  const symBench = useMemo(
    () => data && activeSym ? data.bench.filter(r => r.sym === activeSym) : [],
    [data, activeSym])
  // Default markers on only when sparse — they bury the curve past ~50 trades.
  useEffect(() => { setShowMarkers(symTrades.length > 0 && symTrades.length <= 50) }, [symTrades])
  const infoRow  = useMemo(() => data?.info.find(r => r.sym === activeSym), [data, activeSym])
  const statsRow = useMemo(() => data?.stats.find(r => r.sym === activeSym), [data, activeSym])

  const stackNames = stackOrder.filter(n => stacks[n])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Toolbar: source selector + sym + refresh ── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">

        {/* Mode toggle: stack-managed vs direct host:port */}
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-0.5 shrink-0">
          {([['stack', Boxes, 'Stack'], ['direct', Plug, 'Direct']] as const).map(([m, Icon, label]) => (
            <button key={m}
              onClick={() => setMode(m)}
              title={m === 'direct' ? 'Connect straight to a qs process by host:port' : 'Pick a hub-managed stack process'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                ${mode === m ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)]' : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)]'}`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {mode === 'stack' ? (
          <>
            {/* Stack dropdown */}
            <div className="relative">
              <button
                onClick={() => setStackDropdownOpen(o => !o)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-xs text-[var(--text-primary)] hover:border-[var(--border-btn-hover)] transition-colors">
                <span className="truncate max-w-32">{activeStack || 'no stack'}</span>
                <ChevronDown size={12} className="shrink-0 text-[var(--text-dimmed)]" />
              </button>
              {stackDropdownOpen && stackNames.length > 0 && (
                <div className="absolute left-0 top-full mt-1 min-w-32 bg-[var(--bg-dropdown)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1">
                  {stackNames.map(name => (
                    <button key={name}
                      onClick={() => { setActiveStack(name); setStackDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover-md)]
                        ${name === activeStack ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Process pills */}
            <div className="flex items-center gap-1 overflow-x-auto tab-scroll">
              {stackProcs.map(proc => {
                const isUp = statuses[activeStack]?.[proc] === 'running'
                const isSel = selectedProc === proc
                return (
                  <button key={proc}
                    onClick={() => { setSelectedProc(proc); localStorage.setItem(ACTIVE_PROC_KEY, proc) }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors shrink-0
                      ${isSel ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border border-[var(--border-tab-active)]'
                              : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)] border border-transparent'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUp ? 'bg-green-400' : 'bg-red-500'}`} />
                    {proc}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          /* Direct host:port inputs */
          <div className="flex items-center gap-1.5">
            <input
              value={directHost}
              onChange={e => setDirectHost(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
              placeholder="host"
              className="w-28 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50"
            />
            <span className="text-[var(--text-faint)] text-xs">:</span>
            <input
              type="number"
              value={directPort}
              onChange={e => setDirectPort(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
              placeholder="port"
              className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50"
            />
          </div>
        )}

        <button
          onClick={load}
          disabled={loading || (mode === 'stack' ? (!selectedProc || !connected) : !directHost.trim() || !directPort)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-1">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Load results'}
        </button>

        {/* Markers toggle + sym selector */}
        {data && data.syms.length > 0 && (
          <div className="flex items-center gap-1 ml-auto overflow-x-auto tab-scroll">
            {symBench.length > 0 && (
              <button
                onClick={() => setShowBench(s => !s)}
                title="Overlay buy-and-hold benchmark"
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 border
                  ${showBench ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border-[var(--border-tab-active)]'
                              : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-hover-md)]'}`}>
                Benchmark
              </button>
            )}
            <button
              onClick={() => setShowMarkers(s => !s)}
              title={`${showMarkers ? 'Hide' : 'Show'} trade entry markers (${symTrades.length} trades)`}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 mr-1 border
                ${showMarkers ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border-[var(--border-tab-active)]'
                              : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-hover-md)]'}`}>
              Markers
            </button>
            {data.syms.map(sym => (
              <button key={sym}
                onClick={() => setActiveSym(sym)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors shrink-0
                  ${sym === activeSym ? 'bg-blue-600 text-white' : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Metrics strip ── */}
      {(infoRow || statsRow) && (
        <div className="shrink-0 flex items-center flex-wrap gap-x-1 gap-y-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)] divide-x divide-[var(--border)]">
          {INFO_METRICS.map(m => {
            const v = num(infoRow?.[m.key])
            if (v === null) return null
            const tone = m.good === 'high' ? (v >= 0 ? 'pos' : 'neg')
                       : m.good === 'low'  ? 'neg'
                       : null
            return <Metric key={m.key} label={m.label} value={m.fmt ? m.fmt(v) : String(v)} tone={tone} />
          })}
          {STAT_METRICS.map(m => {
            const v = num(statsRow?.[m.key])
            if (v === null) return null
            return <Metric key={m.key} label={m.label} value={m.fmt ? m.fmt(v) : String(v)} />
          })}
        </div>
      )}

      {/* ── Body: chart + trades ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Equity + drawdown chart */}
        <div className="flex-1 min-h-0 relative">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-rose-400 px-4 text-center max-w-md">{error}</p>
            </div>
          ) : symEquity.length > 0 ? (
            <EquityChart equity={symEquity} trades={symTrades} bench={symBench} theme={theme} showMarkers={showMarkers} showBench={showBench} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
              <TrendingUp size={28} className="opacity-40" />
              <p className="text-xs">
                {data ? 'No equity data for this sym'
                  : mode === 'direct'
                    ? 'Enter the qs process host:port and load results'
                    : 'Select a stack process and load backtest results'}
              </p>
              {!data && mode === 'direct' && (
                <p className="text-[10px] text-[var(--text-faint)] max-w-sm text-center leading-relaxed">
                  In the qs session just open a port: <span className="font-mono">\p 9876</span>. The hub reaches it directly, so host:port is as seen from the hub (usually <span className="font-mono">localhost</span>) — no handler, no port-forwarding needed.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Trades table */}
        {symTrades.length > 0 && (
          <div className="shrink-0 h-48 overflow-auto border-t border-[var(--border)] bg-[var(--bg-panel)]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--bg-panel)] z-10">
                <tr className="text-[var(--text-dimmed)]">
                  {['Side', 'Entry', 'Exit', 'Unwind', 'Entry px', 'Exit px', 'Qty', 'PnL', 'Ret %', 'Bars'].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium border-b border-[var(--border)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symTrades.map((t, i) => (
                  <tr key={i} className={i % 2 ? 'bg-[var(--bg-base)]' : ''}>
                    <td className={`px-3 py-1 font-mono ${t.side === 'L' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-secondary)] whitespace-nowrap">{fmtTime(t.entryTime)}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-secondary)] whitespace-nowrap">{fmtTime(t.exitTime)}</td>
                    <td className="px-3 py-1 text-[var(--text-dimmed)]">{t.unwind}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-secondary)] text-right">{t.entryPx?.toFixed(2)}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-secondary)] text-right">{t.exitPx?.toFixed(2)}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-secondary)] text-right">{t.qty}</td>
                    <td className={`px-3 py-1 font-mono text-right ${t.rpnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.rpnl?.toFixed(1)}</td>
                    <td className={`px-3 py-1 font-mono text-right ${t.ret_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.ret_pct?.toFixed(2)}</td>
                    <td className="px-3 py-1 font-mono text-[var(--text-dimmed)] text-right">{t.bars ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
