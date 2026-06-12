import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { RefreshCw, TrendingUp, Play, FileText } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { fetchPerf, parseKdbTime, type PerfData } from '../api/perf'
import { listRuns, loadRunConfig, saveFile, runBacktest, type RunRef, type RunConfig, type FileKey } from '../api/bt'
import EquityChart from '../components/backtest/EquityChart'
import CodeEditor, { type EditorKind } from '../components/backtest/CodeEditor'

const HOST_KEY = 'qi_backtest_host'
const PORT_KEY = 'qi_backtest_port'
const RUN_KEY = 'qi_backtest_run'

type View = 'setup' | 'results'

const FILE_TABS: { key: FileKey; label: string; kind: EditorKind }[] = [
  { key: 'run',      label: 'Run',      kind: 'conf' },
  { key: 'logic',    label: 'Logic',    kind: 'qs' },
  { key: 'params',   label: 'Params',   kind: 'conf' },
  { key: 'universe', label: 'Universe', kind: 'plain' },
]
const FILE_KIND: Record<FileKey, EditorKind> = Object.fromEntries(FILE_TABS.map(t => [t.key, t.kind])) as Record<FileKey, EditorKind>

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
  const { theme } = useTheme()

  // ── Target engine (host:port reachable from the hub) ──
  const [host, setHost] = useState(() => localStorage.getItem(HOST_KEY) ?? 'localhost')
  const [port, setPort] = useState(() => localStorage.getItem(PORT_KEY) ?? '9876')
  const portNum = parseInt(port, 10)
  const targetOk = !!host.trim() && !Number.isNaN(portNum)
  useEffect(() => { localStorage.setItem(HOST_KEY, host) }, [host])
  useEffect(() => { localStorage.setItem(PORT_KEY, port) }, [port])

  const [view, setView] = useState<View>('setup')
  const [error, setError] = useState<string | null>(null)

  // ── Results state ──
  const [data, setData] = useState<PerfData | null>(null)
  const [activeSym, setActiveSym] = useState<string | null>(null)
  const [showMarkers, setShowMarkers] = useState(false)
  const [loading, setLoading] = useState(false)

  // ── Setup (config editor) state ──
  const [runs, setRuns] = useState<RunRef[]>([])
  const [selectedRun, setSelectedRun] = useState(() => localStorage.getItem(RUN_KEY) ?? '')
  const [config, setConfig] = useState<RunConfig | null>(null)
  const [edits, setEdits] = useState<Record<FileKey, string>>({ run: '', logic: '', params: '', universe: '' })
  const [activeFile, setActiveFile] = useState<FileKey>('run')
  const [configLoading, setConfigLoading] = useState(false)
  const [running, setRunning] = useState(false)

  // Clear everything when the target changes.
  useEffect(() => {
    setData(null); setActiveSym(null); setConfig(null); setRuns([]); setError(null)
  }, [host, port])

  // ── Fetch perf results ──
  const load = useCallback(async () => {
    if (loading || !targetOk) return
    setLoading(true); setError(null)
    try {
      const perf = await fetchPerf(host, portNum)
      setData(perf)
      setActiveSym(perf.syms[0] ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setData(null)
    } finally {
      setLoading(false)
    }
  }, [loading, targetOk, host, portNum])

  // ── Load run list (when entering setup with none loaded) ──
  const refreshRuns = useCallback(async () => {
    if (!targetOk) return
    try {
      const r = await listRuns(host, portNum)
      setRuns(r)
      setSelectedRun(prev => (prev && r.some(x => x.name === prev)) ? prev : (r[0]?.name ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [targetOk, host, portNum])

  useEffect(() => {
    if (view === 'setup' && targetOk && runs.length === 0) refreshRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, targetOk])

  // ── Load a run's config files when the selection changes ──
  const loadConfig = useCallback(async (name: string) => {
    if (!targetOk || !name) return
    setConfigLoading(true); setError(null)
    try {
      const cfg = await loadRunConfig(host, portNum, name)
      setConfig(cfg)
      setEdits({ run: cfg.run.text, logic: cfg.logic.text, params: cfg.params.text, universe: cfg.universe.text })
      setActiveFile('run')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setConfig(null)
    } finally {
      setConfigLoading(false)
    }
  }, [targetOk, host, portNum])

  const loadedRunRef = useRef<string>('')
  useEffect(() => {
    if (view !== 'setup' || !selectedRun) return
    localStorage.setItem(RUN_KEY, selectedRun)
    if (loadedRunRef.current === selectedRun && config) return
    loadedRunRef.current = selectedRun
    loadConfig(selectedRun)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedRun])

  const dirty = useMemo(() => {
    if (!config) return {} as Record<FileKey, boolean>
    return {
      run: edits.run !== config.run.text,
      logic: edits.logic !== config.logic.text,
      params: edits.params !== config.params.text,
      universe: edits.universe !== config.universe.text,
    }
  }, [edits, config])
  const anyDirty = Object.values(dirty).some(Boolean)

  // ── Save dirty files, run the backtest, show results ──
  const saveAndRun = useCallback(async () => {
    if (!config || !selectedRun || running) return
    setRunning(true); setError(null)
    try {
      for (const f of [config.run, config.logic, config.params, config.universe]) {
        if (f.path && edits[f.key] !== f.text) await saveFile(host, portNum, f.path, edits[f.key])
      }
      // Reflect saved state so dirty flags clear.
      setConfig(c => c && ({
        run: { ...c.run, text: edits.run }, logic: { ...c.logic, text: edits.logic },
        params: { ...c.params, text: edits.params },
        universe: { ...c.universe, text: edits.universe },
      }))
      await runBacktest(host, portNum, selectedRun)
      setView('results')
      const perf = await fetchPerf(host, portNum)
      setData(perf); setActiveSym(perf.syms[0] ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [config, selectedRun, running, edits, host, portNum])

  // ── Per-sym slices for the chart + table ──
  const symEquity = useMemo(() => data && activeSym ? data.equity.filter(r => r.sym === activeSym) : [], [data, activeSym])
  const symTrades = useMemo(() => data && activeSym ? data.trades.filter(r => r.sym === activeSym) : [], [data, activeSym])
  useEffect(() => { setShowMarkers(symTrades.length > 0 && symTrades.length <= 50) }, [symTrades])
  const infoRow  = useMemo(() => data?.info.find(r => r.sym === activeSym), [data, activeSym])
  const statsRow = useMemo(() => data?.stats.find(r => r.sym === activeSym), [data, activeSym])

  const universeInline = !!config && !config.universe.path  // universe lives in the run file

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-0.5 shrink-0">
          {(['setup', 'results'] as const).map(v => (
            <button key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors
                ${view === v ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)]' : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)]'}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Engine host:port */}
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            value={host} onChange={e => setHost(e.target.value)} placeholder="host"
            className="w-24 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50"
          />
          <span className="text-[var(--text-faint)] text-xs">:</span>
          <input
            type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="port"
            className="w-20 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {view === 'setup' ? (
          <>
            <select
              value={selectedRun}
              onChange={e => setSelectedRun(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50 max-w-56">
              {runs.length === 0 && <option value="">{targetOk ? 'no runs' : 'set host:port'}</option>}
              {runs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
            <button onClick={refreshRuns} title="Reload run list"
              className="p-1.5 rounded-lg text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-md)] transition-colors shrink-0">
              <RefreshCw size={13} />
            </button>
            <button
              onClick={saveAndRun}
              disabled={running || !config || !targetOk}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto">
              <Play size={12} className={running ? 'animate-pulse' : ''} />
              {running ? 'Running…' : anyDirty ? 'Save & run' : 'Run backtest'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={load}
              disabled={loading || !targetOk}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading…' : 'Load results'}
            </button>

            {/* Markers / benchmark / sym selector */}
            {data && data.syms.length > 0 && (
              <div className="flex items-center gap-1 ml-auto overflow-x-auto tab-scroll">
                <button onClick={() => setShowMarkers(s => !s)} title={`${showMarkers ? 'Hide' : 'Show'} trade entry markers (${symTrades.length} trades)`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 mr-1 border
                    ${showMarkers ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border-[var(--border-tab-active)]'
                                  : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-hover-md)]'}`}>
                  Markers
                </button>
                {data.syms.map(sym => (
                  <button key={sym} onClick={() => setActiveSym(sym)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors shrink-0
                      ${sym === activeSym ? 'bg-blue-600 text-white' : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-4 py-1.5 bg-rose-500/10 border-b border-rose-500/30">
          <p className="text-xs text-rose-400 font-mono truncate" title={error}>{error}</p>
        </div>
      )}

      {/* ── Body ── */}
      {view === 'setup' ? (
        /* Config editor */
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* File tabs */}
          <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)]">
            {FILE_TABS.map(t => {
              const sub = t.key === 'logic' || t.key === 'params' ? config?.[t.key].name : null
              return (
                <button key={t.key}
                  onClick={() => setActiveFile(t.key)}
                  disabled={!config}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40
                    ${activeFile === t.key ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)]' : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)]'}`}>
                  <FileText size={12} />
                  {t.label}{sub ? <span className="text-[var(--text-faint)] font-normal">· {sub}</span> : null}
                  {dirty[t.key] && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </button>
              )
            })}
            {config && <span className="ml-auto text-[10px] text-[var(--text-faint)] font-mono truncate max-w-[40%]" title={config[activeFile].path}>{config[activeFile].path || '(no file)'}</span>}
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0 relative">
            {configLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-faint)]">Loading config…</div>
            ) : !config ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--text-faint)]">
                {targetOk ? 'Select a run to edit its config' : 'Set the engine host:port'}
              </div>
            ) : activeFile === 'universe' && universeInline ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-xs text-[var(--text-secondary)]">Universe is inline in the run file:</p>
                <code className="text-xs font-mono text-amber-400 bg-[var(--bg-input)] px-3 py-1.5 rounded-lg border border-[var(--border)]">{config.universe.inline}</code>
                <p className="text-[10px] text-[var(--text-faint)]">Edit the <button onClick={() => setActiveFile('run')} className="text-blue-400 hover:underline">Run file's</button> <span className="font-mono">universe =</span> line to change it.</p>
              </div>
            ) : (
              <div className="absolute inset-0 bg-[var(--bg-canvas)]">
                <CodeEditor
                  value={edits[activeFile]}
                  onChange={txt => setEdits(m => ({ ...m, [activeFile]: txt }))}
                  kind={FILE_KIND[activeFile]}
                  theme={theme}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Results */
        <>
          {(infoRow || statsRow) && (
            <div className="shrink-0 flex items-center flex-wrap gap-x-1 gap-y-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)] divide-x divide-[var(--border)]">
              {INFO_METRICS.map(m => {
                const v = num(infoRow?.[m.key]); if (v === null) return null
                const tone = m.good === 'high' ? (v >= 0 ? 'pos' : 'neg') : m.good === 'low' ? 'neg' : null
                return <Metric key={m.key} label={m.label} value={m.fmt ? m.fmt(v) : String(v)} tone={tone} />
              })}
              {STAT_METRICS.map(m => {
                const v = num(statsRow?.[m.key]); if (v === null) return null
                return <Metric key={m.key} label={m.label} value={m.fmt ? m.fmt(v) : String(v)} />
              })}
            </div>
          )}

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 relative">
              {symEquity.length > 0 ? (
                <EquityChart equity={symEquity} trades={symTrades} theme={theme} showMarkers={showMarkers} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
                  <TrendingUp size={28} className="opacity-40" />
                  <p className="text-xs">{data ? 'No equity data for this sym' : 'Load results, or configure a run in Setup'}</p>
                </div>
              )}
            </div>

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
        </>
      )}
    </div>
  )
}
