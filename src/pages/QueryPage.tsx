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

type OutputTab = 'results' | 'logs'

// ─── Result table (hidden for now, kept for future use) ───────────────────────

// function fmtCell(v: unknown): string {
//   if (v instanceof Date) {
//     const y = v.getUTCFullYear(), m = String(v.getUTCMonth()+1).padStart(2,'0'), d = String(v.getUTCDate()).padStart(2,'0')
//     const hh = v.getUTCHours(), mm = v.getUTCMinutes(), ss = v.getUTCSeconds(), ms = v.getUTCMilliseconds()
//     if (hh || mm || ss || ms)
//       return `${y}.${m}.${d}D${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(ms).padStart(3,'0')}000000`
//     return `${y}.${m}.${d}`
//   }
//   return String(v ?? '')
// }
//
// function ResultTable({ data }: { data: unknown }) {
//   if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
//     const cols = Object.keys(data[0] as object)
//     return (
//       <div className="overflow-auto flex-1">
//         <table className="w-full text-xs border-collapse">
//           <thead className="sticky top-0 bg-[var(--bg-panel)]">
//             <tr>
//               <th className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium w-8">#</th>
//               {cols.map(c => <th key={c} className="px-3 py-2 text-left text-[var(--text-dimmed)] border-b border-[var(--border)] font-medium">{c}</th>)}
//             </tr>
//           </thead>
//           <tbody>
//             {(data as Record<string, unknown>[]).map((row, i) => (
//               <tr key={i} className={i % 2 === 0 ? 'bg-[var(--bg-base)]' : 'bg-[var(--bg-panel)]'}>
//                 <td className="px-3 py-1.5 text-[var(--text-faint)]">{i + 1}</td>
//                 {cols.map(c => <td key={c} className="px-3 py-1.5 text-[var(--text-secondary)]">{fmtCell(row[c])}</td>)}
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     )
//   }
//   return <pre className="text-xs text-[var(--text-secondary)] p-3 whitespace-pre-wrap font-mono">{JSON.stringify(data, null, 2)}</pre>
// }

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_TABS: QueryTab[] = [
  { id: '1', name: 'query1.q', code: '' },
]

const ACTIVE_TAB_KEY = 'qi_query_active_tab'
const ACTIVE_PROC_KEY = 'qi_query_active_proc'

let _tabId = 3
function newTab(name?: string): QueryTab {
  const id = String(++_tabId)
  return { id, name: name ?? `query${_tabId}.q`, code: '' }
}

export default function QueryPage() {
  const { stacks, stackOrder, activeStack, setActiveStack, statuses, connected } = useControl()
  const { activeConn } = useConnectionContext()
  const connType = activeConn?.type ?? 'q'

  const [tabs, setTabs] = useState<QueryTab[]>(DEFAULT_TABS)
  const [tabsLoaded, setTabsLoaded] = useState(false)
  const [activeTabId, setActiveTabId] = useState<string>('1')
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pagingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedProc, setSelectedProc] = useState<string | null>(() => localStorage.getItem(ACTIVE_PROC_KEY) ?? 'hub')
  const [outputTab, setOutputTab] = useState<OutputTab>('results')
  const [outputMap, setOutputMap] = useState<Record<string, { raw: string; error: string | null; total: number | null; hasRun: boolean }>>({})
  const procKey = `${activeStack}.${selectedProc ?? 'hub'}`
  const rawOutput = outputMap[procKey]?.raw ?? ''
  const error = outputMap[procKey]?.error ?? null
  const totalCount = outputMap[procKey]?.total ?? null

  const hasRun = outputMap[procKey]?.hasRun ?? false

  const setRawOutput = useCallback((raw: string, total?: number | null) => {
    setOutputMap(m => ({ ...m, [procKey]: { raw, error: null, total: total ?? m[procKey]?.total ?? null, hasRun: true } }))
  }, [procKey])
  const setError = useCallback((err: string | null) => {
    setOutputMap(m => ({ ...m, [procKey]: { raw: m[procKey]?.raw ?? '', error: err, total: m[procKey]?.total ?? null, hasRun: true } }))
  }, [procKey])
  const [running, setRunning] = useState(false)
  const [pageSize, setPageSize] = useState(100)
  const [pageSizeInput, setPageSizeInput] = useState('100')
  const [pageStart, setPageStart] = useState(0)
  const [pageStartInput, setPageStartInput] = useState('0')
  const pageSizeRef = useRef(100)
  const pageStartRef = useRef(0)
  const [outputHeight, setOutputHeight] = useState(() => parseInt(localStorage.getItem('qi_query_output_height') ?? '240'))
  const [stackDropdownOpen, setStackDropdownOpen] = useState(false)
  const [menuTabId, setMenuTabId] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumRef = useRef<HTMLDivElement>(null)
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
    if (stackProcs.length > 0 && selectedProc && selectedProc !== 'hub' && !stackProcs.includes(selectedProc)) {
      const saved = localStorage.getItem(ACTIVE_PROC_KEY)
      const fallback = (saved && stackProcs.includes(saved)) ? saved : stackProcs[0]
      setSelectedProc(fallback)
      localStorage.setItem(ACTIVE_PROC_KEY, fallback)
    }
  }, [activeStack, stackProcs.length])

  // Auto-save a tab to backend (debounced 1s)
  const scheduleTabSave = useCallback((tab: QueryTab) => {
    clearTimeout(saveTimers.current[tab.id])
    saveTimers.current[tab.id] = setTimeout(() => {
      qApi.writeScript(tab.name, tab.code).catch(() => {})
    }, 1000)
  }, [])

  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId

  const queryHistory = useRef<string[]>([])
  const historyIndex = useRef<number>(-1)
  const historyDraft = useRef<string>('')

  const runQueryRef = useRef<(targetStart?: number, codeOverride?: string) => void>(() => {})

  const updateCode = useCallback((code: string) => {
    const id = activeTabIdRef.current
    setTabs(ts => {
      const next = ts.map(t => t.id === id ? { ...t, code } : t)
      if (tabsLoaded) {
        const tab = next.find(t => t.id === id)
        if (tab) scheduleTabSave(tab)
      }
      return next
    })
  }, [tabsLoaded, scheduleTabSave])

  const addTab = useCallback(() => {
    const t = newTab()
    setTabs(ts => [...ts, t])
    setActiveTabId(t.id)
    if (tabsLoaded) scheduleTabSave(t)
  }, [tabsLoaded, scheduleTabSave])

  const closeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs(ts => {
      const closing = ts.find(t => t.id === id)
      if (closing && tabsLoaded) qApi.deleteScript(closing.name).catch(() => {})
      const next = ts.filter(t => t.id !== id)
      if (next.length === 0) {
        const t = newTab()
        setActiveTabId(t.id)
        if (tabsLoaded) scheduleTabSave(t)
        return [t]
      }
      if (id === activeTabId) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeTabId, tabsLoaded, scheduleTabSave])

  // Load scripts from backend on connect
  useEffect(() => {
    if (!connected || tabsLoaded) return
    qApi.readScripts().then(async names => {
      if (Array.isArray(names) && names.length > 0) {
        const loaded = await Promise.all(
          names.map(async (name, i): Promise<QueryTab> => {
            const code = await qApi.readScript(name).catch(() => '')
            return { id: String(i + 1), name, code }
          })
        )
        setTabs(loaded)
        _tabId = loaded.length
        // Restore last active tab by name
        const savedName = localStorage.getItem(ACTIVE_TAB_KEY)
        const match = loaded.find(t => t.name === savedName) ?? loaded[0]
        setActiveTabId(match.id)
      }
      setTabsLoaded(true)
    }).catch(() => setTabsLoaded(true))
  }, [connected, tabsLoaded])

  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab) localStorage.setItem(ACTIVE_TAB_KEY, tab.name)
  }, [activeTabId, tabs])

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
    if (name) {
      const old = tabs.find(t => t.id === renamingTabId)
      setTabs(ts => ts.map(t => t.id === renamingTabId ? { ...t, name } : t))
      if (old && old.name !== name) {
        qApi.writeScript(name, old.code).catch(() => {})
        qApi.deleteScript(old.name).catch(() => {})
      }
    }
    setRenamingTabId(null)
  }, [renameValue, renamingTabId, tabs])

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

  // Disconnect direct connection and reset paging when stack/proc changes
  useEffect(() => {
    directRef.current?.disconnect()
    directRef.current = null
    setProcConnStatus('idle')
    setPageSize(100); setPageSizeInput('100'); pageSizeRef.current = 100
    setPageStart(0); setPageStartInput('0'); pageStartRef.current = 0
  }, [activeStack, selectedProc])

  const resetPaging = useCallback(() => {
    setPageStart(0); setPageStartInput('0'); pageStartRef.current = 0
    setPageSize(100); setPageSizeInput('100'); pageSizeRef.current = 100
  }, [])

  const runQuery = useCallback(async (targetStart = 0, codeOverride?: string) => {
    if (!activeTab || running) return
    const code = (codeOverride ?? activeTab.code).trim()
    if (!code) return

    // Push to history (avoid consecutive duplicates)
    const last = queryHistory.current[queryHistory.current.length - 1]
    if (code !== last) queryHistory.current.push(code)
    historyIndex.current = -1
    historyDraft.current = ''

    setRunning(true)
    setOutputMap(m => ({ ...m, [procKey]: { raw: '', error: null, total: null, hasRun: false } }))

    try {
      if (connType !== 'q') {
        throw new Error('Query page requires a q (WebSocket) connection')
      }

      const cmd = code
      const pagestart = codeOverride ? 0 : targetStart
      const pagesize  = codeOverride ? 100 : pageSizeRef.current

      if (!selectedProc || selectedProc === 'hub') {
        // Hub: always use .Q.s text format
        const res = await qApi.runQuery(`.Q.s[${cmd}]`)
        setRawOutput(String(res), null); setOutputTab('results')
      } else {
        // Direct process: .Q.s text format
        const conn = await ensureDirectConnection(selectedProc)
        const textRes = await conn.query(cmd, 'text', pagestart, pagesize, 30000)
        const total = textRes.count ?? null
        setRawOutput(String(textRes.result ?? ''), total)
        if (total !== null && total > 0 && total < pageSizeRef.current) {
          setPageSize(total); setPageSizeInput(String(total)); pageSizeRef.current = total
        }
        setProcConnStatus('connected')
        setOutputTab('results')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setRawOutput(msg)
      setOutputTab('results')
      setProcConnStatus('error')
      // Only disconnect and clear init if it's a connection error (not a query timeout)
      if (selectedProc && selectedProc !== 'hub' && !msg.includes('timed out')) {
        initializedProcs.current.delete(`${activeStack}.${selectedProc}`)
        directRef.current?.disconnect()
        directRef.current = null
      }
    } finally {
      setRunning(false)
    }
  }, [activeTab, running, connType, pageStart, selectedProc, procKey, ensureDirectConnection])
  runQueryRef.current = runQuery

  const goToOffset = useCallback((next: number) => {
    const offset = Math.max(0, next)
    setPageStart(offset)
    setPageStartInput(String(offset))
    pageStartRef.current = offset
    runQuery(offset)
  }, [runQuery])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = e.metaKey
    const isWin = e.ctrlKey

    // Up/Down — navigate query history (only when single line or at top/bottom)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const history = queryHistory.current
      if (history.length === 0) return
      const ta = e.currentTarget
      // Only navigate if cursor is on the first or last line
      const onFirstLine = !ta.value.slice(0, ta.selectionStart).includes('\n')
      const onLastLine = !ta.value.slice(ta.selectionStart).includes('\n')
      if (e.key === 'ArrowUp' && !onFirstLine) return
      if (e.key === 'ArrowDown' && !onLastLine) return
      e.preventDefault()
      if (e.key === 'ArrowUp') {
        if (historyIndex.current === -1) historyDraft.current = ta.value
        const next = historyIndex.current === -1 ? history.length - 1 : Math.max(0, historyIndex.current - 1)
        historyIndex.current = next
        updateCode(history[next])
      } else {
        if (historyIndex.current === -1) return
        const next = historyIndex.current + 1
        if (next >= history.length) {
          historyIndex.current = -1
          updateCode(historyDraft.current)
        } else {
          historyIndex.current = next
          updateCode(history[next])
        }
      }
      return
    }

    // ⌘/Ctrl+E — run selection if any, otherwise run whole script
    if ((isMac || isWin) && e.key === 'e') {
      e.preventDefault()
      const ta = e.currentTarget
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()
      if (sel && !sel.startsWith('/')) {
        resetPaging(); runQuery(0, sel)
      } else {
        resetPaging(); runQuery(0)
      }
      return
    }

    // ⌘/Ctrl+Enter — run current line (skip comments)
    if ((isMac || isWin) && e.key === 'Enter') {
      e.preventDefault()
      const ta = e.currentTarget
      const pos = ta.selectionStart
      const text = ta.value
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1
      const lineEnd = text.indexOf('\n', pos)
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim()
      if (line && !line.startsWith('/')) { resetPaging(); runQuery(0, line) }
    }
  }, [runQuery, resetPaging])

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

        {/* Run button */}
        <button
          onClick={() => { resetPaging(); runQuery(0) }}
          disabled={running || !activeTab?.code.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          <Play size={12} />
          {running ? 'Running…' : 'Run'}
        </button>
        <span className="text-[var(--text-faint)] text-xs shrink-0">⌘↵ line · ⌘E sel/all</span>
        {selectedProc && selectedProc !== 'hub' && (
          <span className={`text-xs shrink-0 ${
            procConnStatus === 'connected' ? 'text-green-400' :
            procConnStatus === 'connecting' ? 'text-yellow-400' :
            procConnStatus === 'error' ? 'text-red-400' : 'text-[var(--text-faint)]'
          }`}>
            {procConnStatus === 'connected' ? `● ${selectedProc}` :
             procConnStatus === 'connecting' ? `○ ${selectedProc} connecting…` :
             procConnStatus === 'error' ? `● ${selectedProc} error` : `○ ${selectedProc}`}
          </span>
        )}
      </div>

      {/* ── Main area: editor + right panel ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Code editor */}
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
          {/* Line numbers */}
          <div
            ref={lineNumRef}
            aria-hidden
            className="select-none shrink-0 overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-faint)] font-mono text-xs text-right leading-relaxed pt-4 pb-4 pl-2 pr-2 border-r border-[var(--border)]"
            style={{ minWidth: '2.5rem' }}>
            {(activeTab?.code ?? '').split('\n').map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
            {/* padding line so last line number aligns with textarea */}
            <div>&nbsp;</div>
          </div>
          <textarea
            ref={textareaRef}
            value={activeTab?.code ?? ''}
            onChange={e => updateCode(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={e => { if (lineNumRef.current) lineNumRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop }}
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
                    onClick={() => { setActiveStack(name); setStackDropdownOpen(false) }}
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
                  onClick={() => { setSelectedProc(proc); localStorage.setItem(ACTIVE_PROC_KEY, proc) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors
                    ${isSelected
                      ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUp ? 'bg-green-400' : 'bg-red-500'}`} />
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
          {(['results', 'logs'] as const).map(t => (
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

          {(!selectedProc || selectedProc === 'hub') ? <div className="ml-auto" /> : null}
          {selectedProc && selectedProc !== 'hub' && <div className="flex items-center gap-2 ml-auto">
            <span className="text-[var(--text-faint)] text-xs">offset</span>
            <input
              type="number" min={0} max={totalCount !== null ? Math.max(0, totalCount - 1) : undefined}
              value={pageStartInput}
              disabled={!rawOutput}
              onChange={e => {
                const raw = e.target.value
                setPageStartInput(raw)
                const parsed = parseInt(raw)
                if (isNaN(parsed)) return
                const maxOffset = totalCount !== null ? Math.max(0, totalCount - 1) : Infinity
                const v = Math.min(Math.max(0, parsed), maxOffset)
                setPageStart(v)
                pageStartRef.current = v
                if (pagingTimer.current) clearTimeout(pagingTimer.current)
                pagingTimer.current = setTimeout(() => runQueryRef.current(v), 600)
              }}
              onBlur={e => {
                const parsed = parseInt(e.target.value) || 0
                const maxOffset = totalCount !== null ? Math.max(0, totalCount - 1) : Infinity
                const v = Math.min(Math.max(0, parsed), maxOffset)
                setPageStart(v); setPageStartInput(String(v)); pageStartRef.current = v
              }}
              className="w-14 bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50 text-center disabled:opacity-30"
            />
            <span className="text-[var(--text-faint)] text-xs">size</span>
            <input
              type="number" min={1} max={totalCount ?? undefined}
              value={pageSizeInput}
              onChange={e => {
                const raw = e.target.value
                setPageSizeInput(raw)
                const parsed = parseInt(raw)
                if (isNaN(parsed)) return
                const maxSize = totalCount !== null ? totalCount : Infinity
                const v = Math.min(Math.max(1, parsed), maxSize)
                setPageSize(v)
                pageSizeRef.current = v
                setPageStart(0); setPageStartInput('0')
                pageStartRef.current = 0
                if (pagingTimer.current) clearTimeout(pagingTimer.current)
                pagingTimer.current = setTimeout(() => runQueryRef.current(0), 600)
              }}
              onBlur={e => {
                const parsed = parseInt(e.target.value) || 100
                const maxSize = totalCount !== null ? totalCount : Infinity
                const v = Math.min(Math.max(1, parsed), maxSize)
                setPageSize(v); setPageSizeInput(String(v)); pageSizeRef.current = v
              }}
              className="w-14 bg-[var(--bg-input)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500/50 text-center"
            />
            <button
              onClick={() => goToOffset(pageStart - pageSize)}
              disabled={pageStart === 0 || running || (!rawOutput)}
              className="flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                border-[var(--border-btn)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-btn-hover)] hover:bg-[var(--bg-hover-md)]">
              ◀ Prev
            </button>
            <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
              rows {pageStart}–{totalCount !== null ? Math.min(pageStart + pageSize, totalCount) : pageStart + pageSize}{totalCount !== null ? ` of ${totalCount}` : ''}
            </span>
            <button
              onClick={() => goToOffset(pageStart + pageSize)}
              disabled={running || (!rawOutput) || (totalCount !== null && pageStart + pageSize >= totalCount)}
              className="flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                border-[var(--border-btn)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-btn-hover)] hover:bg-[var(--bg-hover-md)]">
              Next ▶
            </button>
          </div>}
        </div>

        {/* Output content */}
        <div className="flex-1 overflow-auto">
          {outputTab === 'results' && (
            error
              ? <pre className="text-xs text-red-400 p-3 font-mono whitespace-pre-wrap">{error}</pre>
              : rawOutput
                ? <pre className="text-xs text-[var(--text-secondary)] p-3 font-mono whitespace-pre-wrap">{rawOutput}</pre>
                : hasRun
                  ? <p className="text-xs text-green-400 p-3">Success!</p>
                  : <p className="text-xs text-[var(--text-faint)] p-3">Run a query to see results</p>
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
