import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useControl } from '../../context/ControlContext'
import type { LogLevel } from '../../types'

export default function LogsPanel() {
  const { logs, stacks, activeStack, selectedProc } = useControl()
  const [manualTab, setManualTab] = useState<string>('All')
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({ info: true, error: true, warn: true })
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const procNames = Object.keys(stacks[activeStack]?.processes ?? {})
  const tabs = ['All', ...procNames]

  const activeTab = selectedProc && procNames.includes(selectedProc) ? selectedProc : manualTab

  const filtered = logs.filter(l => {
    const tabMatch = activeTab === 'All' || l.process === activeTab
    const levelMatch = filters[l.level]
    return tabMatch && levelMatch
  })

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filtered.length, autoScroll])

  return (
    <div className="h-60 border-t border-[var(--border)] bg-[var(--bg-base)] flex flex-col shrink-0">

      {/* Row 1: "Logs:" label + process tabs */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-1 flex-wrap">
        <span className="text-[var(--text-primary)] font-bold text-lg shrink-0">Logs:</span>
        <div className="flex items-center gap-3 flex-wrap">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setManualTab(tab)}
              className={`text-xs font-medium transition-colors
                ${activeTab === tab
                  ? 'text-[#3b82f6] underline underline-offset-4 decoration-[#3b82f6]'
                  : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)]'
                }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: filters left, autoscroll right */}
      <div className="flex items-center justify-between px-5 pb-2">
        <div className="flex items-center gap-4">
          {(['info', 'error'] as LogLevel[]).map(level => (
            <label key={level} className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setFilters(f => ({ ...f, [level]: !f[level] }))}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer shrink-0
                  ${filters[level] ? 'bg-[#3b82f6] border-[#3b82f6]' : 'bg-transparent border-[var(--border-node)] hover:border-[var(--border-node-hover)]'}`}>
                {filters[level] && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2.5">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <span className="text-xs text-[var(--text-muted)]">{level}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--text-dimmed)]">Auto-scroll</span>
          <button onClick={() => setAutoScroll(v => !v)}
            className={`w-10 h-5 rounded-full relative transition-colors shrink-0
              ${autoScroll ? 'bg-[#3b82f6]' : 'bg-[var(--bg-toggle-off)]'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
              ${autoScroll ? 'right-0.5' : 'left-0.5'}`} />
          </button>
          <button
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            title="Scroll to latest"
            className="text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Terminal log box */}
      <div className="flex-1 mx-4 mb-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-terminal)]">
        <div className="h-full overflow-y-auto px-4 py-2 font-mono text-xs">
          {filtered.length === 0 && (
            <span className="text-[var(--text-faint)]">No log entries.</span>
          )}
          {filtered.map(l => (
            <div key={l.id} className="flex gap-2 leading-5">
              <span className="text-[var(--text-faint)] shrink-0">[{l.ts}]</span>
              <span className={`shrink-0 font-bold
                ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-[#3b82f6]'}`}>
                [{l.level.toUpperCase()}]
              </span>
              <span className={l.level === 'error' ? 'text-red-300' : 'text-[var(--text-secondary)]'}>{l.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
