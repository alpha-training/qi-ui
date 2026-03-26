import React, { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Play, Plus, ChevronDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useControl } from '../context/ControlContext'
import { useConnectionContext } from '../context/ConnectionContext'
import * as qApi from '../api/qws'
import { DirectConnection } from '../api/direct'
import LogsPanel from '../components/control/LogsPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueryTab {
  id: string
  name: string
  code: string
}

type OutputTab = 'output' | 'terminal' | 'logs'

// ─── Result rendering ─────────────────────────────────────────────────────────

function ResultTable({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-[var(--text-dimmed)] text-xs">null</span>
  }

  // Array of objects → table
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    const cols = Object.keys(data[0] as object)
    return (
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-panel)]">
            <tr>
              <th className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium w-8">#</th>
              {cols.map(c => (
                <th key={c} className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data as Record<string, unknown>[]).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-[var(--bg-base)]' : 'bg-[var(--bg-panel)]'}>
                <td className="px-3 py-1.5 text-[var(--text-faint)]">{i + 1}</td>
                {cols.map(c => (
                  <td key={c} className="px-3 py-1.5 text-[var(--text-secondary)]">
                    {String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Column-oriented dict with all-array values → table
  if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length > 0 && entries.every(([, v]) => Array.isArray(v))) {
      const cols = entries.map(([k]) => k)
      const rows = (entries[0][1] as unknown[]).length
      return (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--bg-panel)]">
              <tr>
                <th className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium w-8">#</th>
                {cols.map(c => (
                  <th key={c} className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-[var(--bg-base)]' : 'bg-[var(--bg-panel)]'}>
                  <td className="px-3 py-1.5 text-[var(--text-faint)]">{i + 1}</td>
                  {cols.map(c => (
                    <td key={c} className="px-3 py-1.5 text-[var(--text-secondary)]">
                      {String((data as Record<string, unknown[]>)[c][i] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }

  // Scalar or simple array → raw display
  return (
    <pre className="text-xs text-[var(--text-secondary)] p-3 whitespace-pre-wrap font-mono">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_TABS: QueryTab[] = [
  { id: '1', name: 'query1.q', code: '' },
]

const TABS_KEY       = 'qi_query_tabs'
const ACTIVE_TAB_KEY = 'qi_query_active_tab'

let _tabId = 3
function newTab(name?: string): QueryTab {
  const id = String(++_tabId)
  return { id, name: name ?? `query${_tabId}.q`, code: '' }
}

export default function QueryPage() {
  const { stacks, stackOrder, activeStack, setActiveStack, statuses, connected } = useControl()
  const { activeConn } = useConnectionContext()
  const connType = activeConn?.type ?? 'q'

  const [tabs, setTabs] = useState<QueryTab[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null')
      // Wipe old demo data if any tab contains the clothing demo
      if (Array.isArray(saved) && saved.some((t: QueryTab) => t.code?.includes('Street Pulse Hoodie') || t.name === 'research2.q')) {
        localStorage.removeItem(TABS_KEY)
        localStorage.removeItem(ACTIVE_TAB_KEY)
        return DEFAULT_TABS
      }
      return saved ?? DEFAULT_TABS
    } catch { return DEFAULT_TABS }
  })
  const [activeTabId, setActiveTabId] = useState<string>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY) ?? '1'
  )
  const [selectedProc, setSelectedProc] = useState<string | null>(null)
  const [outputTab, setOutputTab] = useState<OutputTab>('output')
  const [result, setResult] = useState<unknown>(null)
  const [rawOutput, setRawOutput] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [useQs, setUseQs] = useState(false)
  const [pagingEnabled, setPagingEnabled] = useState(false)
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)
  const [outputHeight, setOutputHeight] = useState(() => parseInt(localStorage.getItem('qi_query_output_height') ?? '240'))
  const [stackDropdownOpen, setStackDropdownOpen] = useState(false)
  const [menuTabId, setMenuTabId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const directRef = useRef<DirectConnection | null>(null)
  const initializedProcs = useRef<Set<string>>(new Set())
  const [procConnStatus, setProcConnStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]

  // Process list for selected stack
  const stackProcs = activeStack && stacks[activeStack]
    ? Object.keys(stacks[activeStack].processes)
    : []

  // Auto-select first process when stack changes (only if current selection not in list)
  useEffect(() => {
    if (stackProcs.length > 0 && selectedProc && !stackProcs.includes(selectedProc)) {
      setSelectedProc(stackProcs[0])
    }
  }, [activeStack, stackProcs.length])

  const updateCode = useCallback((code: string) => {
    setTabs(ts => ts.map(t => t.id === activeTabId ? { ...t, code } : t))
  }, [activeTabId])

  const addTab = useCallback(() => {
    const t = newTab()
    setTabs(ts => [...ts, t])
    setActiveTabId(t.id)
  }, [])

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs(ts => {
      const next = ts.filter(t => t.id !== id)
      if (next.length === 0) {
        const t = newTab()
        setActiveTabId(t.id)
        return [t]
      }
      if (id === activeTabId) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeTabId])

  // Persist tabs + active tab
  useEffect(() => { localStorage.setItem(TABS_KEY, JSON.stringify(tabs)) }, [tabs])
  useEffect(() => { localStorage.setItem(ACTIVE_TAB_KEY, activeTabId) }, [activeTabId])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingTabId) renameInputRef.current?.select()
  }, [renamingTabId])

  const openMenu = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenuTabId(id)
    setMenuAnchor({ top: rect.bottom + 4, left: rect.left })
  }, [])

  const startRename = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (!tab) return
    setRenameValue(tab.name)
    setRenamingTabId(id)
    setMenuTabId(null)
    setMenuAnchor(null)
  }, [tabs])

  const commitRename = useCallback(() => {
    const name = renameValue.trim()
    if (name) setTabs(ts => ts.map(t => t.id === renamingTabId ? { ...t, name } : t))
    setRenamingTabId(null)
  }, [renameValue, renamingTabId])

  // Connect directly to a process and call .proc.ui.init[] on it (once per proc)
  const ensureDirectConnection = useCallback(async (proc: string): Promise<DirectConnection> => {
    const stack = stacks[activeStack]
    if (!stack) throw new Error('No active stack')
    const procDef = stack.processes[proc]
    if (!procDef) throw new Error(`Process ${proc} not found in stack`)

    const host = activeConn?.host ?? 'localhost'
    const port = stack.base_port + procDef.port_offset

    // Reuse existing connection if still open
    if (directRef.current?.connected) return directRef.current

    // Call .proc.ui.init[] via hub IPC — kdb+ accepts IPC even without .z.ws,
    // which installs the WebSocket handler so the direct WS connection can succeed
    if (!initializedProcs.current.has(`${activeStack}.${proc}`)) {
      await qApi.runQuery(
        `h:hopen \`$":${host}:${port}"; h".proc.ui.init[]"; hclose h`,
        5000
      ).catch(() => {})
      initializedProcs.current.add(`${activeStack}.${proc}`)
    }

    directRef.current?.disconnect()
    const conn = new DirectConnection()
    setProcConnStatus('connecting')
    await conn.connect(host, port)

    directRef.current = conn
    setProcConnStatus('connected')
    return conn
  }, [stacks, activeStack, activeConn])

  // Disconnect direct connection when stack/proc changes
  useEffect(() => {
    directRef.current?.disconnect()
    directRef.current = null
    setProcConnStatus('idle')
  }, [activeStack, selectedProc])

  const runQuery = useCallback(async (targetPage = page, codeOverride?: string) => {
    if (!activeTab || running) return
    const code = (codeOverride ?? activeTab.code).trim()
    if (!code) return

    setRunning(true)
    setError(null)
    setResult(null)
    setRawOutput('')

    try {
      if (connType !== 'q') {
        throw new Error('Query page requires a q (WebSocket) connection')
      }

      let cmd = code
      if (pagingEnabled) {
        const offset = (targetPage - 1) * pageSize
        cmd = offset === 0
          ? `select[${pageSize}]from (${cmd})`
          : `select[${offset} ${pageSize}]from (${cmd})`
      }

      const format = useQs ? 'text' : 'data'

      if (!selectedProc || selectedProc === 'hub') {
        // Hub: use existing JSON WebSocket protocol
        const hubCmd = useQs ? `.Q.s[${cmd}]` : cmd
        const res = await qApi.runQuery(hubCmd)
        if (useQs || typeof res === 'string') {
          setRawOutput(String(res)); setOutputTab('terminal'); setResult(null)
        } else {
          setResult(res); setRawOutput(JSON.stringify(res, null, 2)); setOutputTab('output')
        }
      } else {
        // Direct process connection using qdirect binary protocol
        const conn = await ensureDirectConnection(selectedProc)
        const res = await conn.query(cmd, format)
        if (res.format === 'text' || typeof res.result === 'string') {
          setRawOutput(String(res.result)); setOutputTab('terminal'); setResult(null)
        } else {
          setResult(res.result); setRawOutput(JSON.stringify(res.result, null, 2)); setOutputTab('output')
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setRawOutput(msg)
      setOutputTab('terminal')
      setProcConnStatus('error')
    } finally {
      setRunning(false)
    }
  }, [activeTab, running, connType, page, pageSize, pagingEnabled, useQs, selectedProc, ensureDirectConnection])

  const goToPage = useCallback((next: number) => {
    if (next < 1) return
    setPage(next)
    runQuery(next)
  }, [runQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = e.metaKey
    const isWin = e.ctrlKey

    // ⌘/Ctrl+E — run selected text
    if ((isMac || isWin) && e.key === 'e') {
      e.preventDefault()
      const ta = e.currentTarget
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()
      if (sel) runQuery(page, sel)
      return
    }

    // ⌘/Ctrl+Enter — run current line
    if ((isMac || isWin) && e.key === 'Enter') {
      e.preventDefault()
      const ta = e.currentTarget
      const pos = ta.selectionStart
      const text = ta.value
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1
      const lineEnd = text.indexOf('\n', pos)
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim()
      if (line) runQuery(page, line)
    }
  }, [runQuery, page])

  const handleOutputResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = outputHeight
    const onMove = (ev: MouseEvent) => {
      const h = Math.max(80, Math.min(500, startH + startY - ev.clientY))
      setOutputHeight(h)
      localStorage.setItem('qi_query_output_height', String(h))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [outputHeight])

  const stackNames = stackOrder.filter(n => stacks[n])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

      {/* ── Query file tabs bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto tab-scroll">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer group/tab
                ${tab.id === activeTabId
                  ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border border-[var(--border-tab-active)]'
                  : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
              {renamingTabId === tab.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingTabId(null) }}
                  onClick={e => e.stopPropagation()}
                  className="font-mono bg-transparent focus:outline-none w-24 border-b border-blue-500"
                />
              ) : (
                <span className="font-mono">{tab.name}</span>
              )}
              {tab.id === activeTabId && (
                <span
                  onClick={e => openMenu(tab.id, e)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-0.5 cursor-pointer">
                  <MoreHorizontal size={12} />
                </span>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="p-1.5 rounded-lg text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-md)] transition-colors shrink-0">
            <Plus size={14} />
          </button>
        </div>

        {/* .Q.s toggle */}
        <button
          onClick={() => setUseQs(v => !v)}
          title="Wrap result in .Q.s[] — displays kdb+ formatted text output"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 border
            ${useQs
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
              : 'border-[var(--border)] text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
          .Q.s
        </button>

        {/* Run button */}
        <button
          onClick={() => runQuery()}
          disabled={running || !activeTab?.code.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          <Play size={12} />
          {running ? 'Running…' : 'Run'}
        </button>
        <span className="text-[var(--text-faint)] text-xs shrink-0">⌘↵ line · ⌘E sel</span>
        {selectedProc && selectedProc !== 'hub' && (
          <span className={`text-xs shrink-0 ${
            procConnStatus === 'connected' ? 'text-emerald-400' :
            procConnStatus === 'connecting' ? 'text-yellow-400' :
            procConnStatus === 'error' ? 'text-red-400' : 'text-[var(--text-faint)]'
          }`}>
            {procConnStatus === 'connected' ? '● direct' :
             procConnStatus === 'connecting' ? '○ connecting…' :
             procConnStatus === 'error' ? '● error' : '○ direct'}
          </span>
        )}
      </div>

      {/* ── Main area: editor + right panel ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Code editor */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={activeTab?.code ?? ''}
            onChange={e => updateCode(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="/ enter kdb+ expression&#10;select from trade"
            className="flex-1 resize-none bg-[var(--bg-canvas)] text-[var(--text-primary)] font-mono text-xs p-4 focus:outline-none placeholder:text-[var(--text-faint)] leading-relaxed"
          />
        </div>

        {/* Right panel: stack + process selector */}
        <div className="w-44 shrink-0 border-l border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">

          {/* Stack dropdown */}
          <div className="px-3 py-2 border-b border-[var(--border)] relative">
            <button
              onClick={() => setStackDropdownOpen(o => !o)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-xs text-[var(--text-primary)] hover:border-[var(--border-btn-hover)] transition-colors">
              <span className="truncate">{activeStack || 'no stack'}</span>
              <ChevronDown size={12} className="shrink-0 text-[var(--text-dimmed)]" />
            </button>
            {stackDropdownOpen && stackNames.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-[var(--bg-dropdown)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1">
                {stackNames.map(name => (
                  <button
                    key={name}
                    onClick={() => { setActiveStack(name); setSelectedProc(null); setStackDropdownOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover-md)]
                      ${name === activeStack ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Process list */}
          <div className="flex-1 overflow-y-auto py-1">
            {/* Hub — always shown */}
            {(['hub', ...stackProcs]).map(proc => {
              const isHub = proc === 'hub'
              const isUp = isHub ? connected : statuses[activeStack]?.[proc] === 'running'
              const isSelected = selectedProc === proc
              return (
                <button
                  key={proc}
                  onClick={() => setSelectedProc(proc)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors
                    ${isSelected
                      ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUp ? 'bg-emerald-400' : 'bg-red-500'}`} />
                  <span className="truncate font-mono">{proc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Output panel ── */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-panel)] flex flex-col" style={{ height: outputHeight }}>

        {/* Resize handle */}
        <div
          onMouseDown={handleOutputResize}
          className="h-1 cursor-row-resize hover:bg-blue-500/40 transition-colors shrink-0"
        />

        {/* Output tabs + paging controls */}
        <div className="flex items-center gap-1 px-3 border-b border-[var(--border)] shrink-0">
          {(['output', 'terminal', 'logs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setOutputTab(t)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px
                ${outputTab === t
                  ? 'border-blue-500 text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-dimmed)] hover:text-[var(--text-secondary)]'}`}>
              {t}
            </button>
          ))}

          <div className="flex items-center gap-2 ml-auto">
            {/* Paging toggle */}
            <button
              onClick={() => { setPagingEnabled(v => !v); setPage(1) }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors border
                ${pagingEnabled
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-dimmed)]'}`}>
              paging
            </button>

            {pagingEnabled && (
              <>
                <span className="text-[var(--text-faint)] text-xs">rows</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={pageSize}
                  onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 50); setPageSize(v); setPage(1) }}
                  className="w-14 bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50 text-center"
                />
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1 || running}
                  className="px-1.5 py-0.5 rounded text-xs text-[var(--text-dimmed)] hover:text-[var(--text-primary)] disabled:opacity-30 hover:bg-[var(--bg-hover-md)] transition-colors">
                  ◀
                </button>
                <span className="text-xs text-[var(--text-secondary)] min-w-[3rem] text-center">p.{page}</span>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={running}
                  className="px-1.5 py-0.5 rounded text-xs text-[var(--text-dimmed)] hover:text-[var(--text-primary)] disabled:opacity-30 hover:bg-[var(--bg-hover-md)] transition-colors">
                  ▶
                </button>
              </>
            )}
          </div>
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-auto">
          {outputTab === 'output' && (
            error
              ? <p className="text-xs text-red-400 p-3 font-mono">{error}</p>
              : result !== null
                ? <ResultTable data={result} />
                : <p className="text-xs text-[var(--text-faint)] p-3">Run a query to see results</p>
          )}
          {outputTab === 'terminal' && (
            <pre className="text-xs text-[var(--text-secondary)] p-3 font-mono whitespace-pre-wrap">{rawOutput || '—'}</pre>
          )}
          {outputTab === 'logs' && (
            <LogsPanel height={outputHeight - 40} />
          )}
        </div>
      </div>

      {/* Tab context menu */}
      {menuTabId && menuAnchor && createPortal(
        <div
          style={{ position: 'fixed', top: menuAnchor.top, left: menuAnchor.left }}
          className="z-[9999] bg-[var(--bg-dropdown)] border border-[var(--border)] rounded-lg shadow-xl w-32 py-1"
          onMouseLeave={() => { setMenuTabId(null); setMenuAnchor(null) }}>
          <button
            onClick={() => startRename(menuTabId)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]">
            <Pencil size={12} className="text-[var(--text-dimmed)]" /> Rename
          </button>
          {tabs.length > 1 && (
            <button
              onClick={e => { closeTab(menuTabId, e); setMenuTabId(null); setMenuAnchor(null) }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-400 hover:bg-[var(--bg-hover-md)]">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
