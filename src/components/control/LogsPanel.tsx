import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useControl } from '../../context/ControlContext'
import type { LogLevel } from '../../types'

export default function LogsPanel() {
  const { logs, stacks, activeStack } = useControl()
  const [activeTab, setActiveTab] = useState<string>('All')
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({ info: true, error: true, warn: true })
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const procNames = Object.keys(stacks[activeStack]?.processes ?? {})
  const tabs = ['All', ...procNames]

  const filtered = logs.filter(l => {
    const tabMatch = activeTab === 'All' || l.process === activeTab
    const levelMatch = filters[l.level]
    return tabMatch && levelMatch
  })

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filtered.length, autoScroll])

  const toggleFilter = (level: LogLevel) =>
    setFilters(f => ({ ...f, [level]: !f[level] }))

  return (
    <div className="h-56 border-t border-white/10 bg-[#0d1117] flex flex-col shrink-0">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 flex-wrap">
        <span className="text-white font-semibold text-sm mr-1">Logs:</span>

        {/* Tab buttons */}
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`text-xs px-0.5 pb-0.5 transition-colors font-medium
              ${activeTab === tab
                ? 'text-blue-400 border-b border-blue-400'
                : 'text-zinc-500 hover:text-zinc-300'
              }`}>
            {tab}
          </button>
        ))}

        {/* Filters */}
        <div className="flex items-center gap-3 ml-1">
          {(['info', 'error'] as LogLevel[]).map(level => (
            <label key={level} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={filters[level]} onChange={() => toggleFilter(level)}
                className="w-3.5 h-3.5 accent-blue-500 rounded" />
              <span className="text-xs text-zinc-400">{level}</span>
            </label>
          ))}
        </div>

        {/* Auto-scroll */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500">Auto-scroll</span>
          <button onClick={() => setAutoScroll(v => !v)}
            className={`w-10 h-5 rounded-full relative transition-colors
              ${autoScroll ? 'bg-blue-600' : 'bg-zinc-700'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
              ${autoScroll ? 'right-0.5' : 'left-0.5'}`} />
          </button>
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors ml-1">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5">
        {filtered.length === 0 && (
          <span className="text-zinc-600">No log entries.</span>
        )}
        {filtered.map(l => (
          <div key={l.id} className="flex gap-2 leading-5">
            <span className="text-zinc-600 shrink-0">[{l.ts}]</span>
            <span className={`shrink-0 font-semibold
              ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'}`}>
              [{l.level.toUpperCase()}]
            </span>
            <span className="text-zinc-300">{l.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}