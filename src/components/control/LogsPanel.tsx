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

  return (
    <div className="h-64 border-t border-white/10 bg-[#0d1117] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-2.5 flex-wrap">
        <span className="text-white font-bold text-lg">Logs:</span>

        {/* Tabs */}
        <div className="flex items-center gap-4">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`text-sm transition-colors font-medium
                ${activeTab === tab
                  ? 'text-blue-400 underline underline-offset-4 decoration-blue-400'
                  : 'text-zinc-500 hover:text-zinc-300'
                }`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 ml-1">
          {(['info', 'error'] as LogLevel[]).map(level => (
            <label key={level} className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setFilters(f => ({ ...f, [level]: !f[level] }))}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer
                  ${filters[level] ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-zinc-600 hover:border-zinc-400'}`}>
                {filters[level] && (
                  <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
              <span className="text-sm text-zinc-400">{level}</span>
            </label>
          ))}
        </div>

        {/* Auto-scroll + refresh */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">Auto-scroll</span>
          <button onClick={() => setAutoScroll(v => !v)}
            className={`w-11 h-6 rounded-full relative transition-colors
              ${autoScroll ? 'bg-blue-600' : 'bg-zinc-700'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
              ${autoScroll ? 'right-1' : 'left-1'}`} />
          </button>
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Terminal box */}
      <div className="flex-1 mx-4 mb-4 overflow-hidden rounded-lg border border-white/10 bg-[#080d13]">
        <div className="h-full overflow-y-auto px-4 py-3 font-mono text-xs space-y-0.5">
          {filtered.length === 0 && (
            <span className="text-zinc-600">No log entries.</span>
          )}
          {filtered.map(l => (
            <div key={l.id} className="flex gap-2 leading-6">
              <span className="text-zinc-500 shrink-0">[{l.ts}]</span>
              <span className={`shrink-0 font-bold
                ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'}`}>
                [{l.level.toUpperCase()}]
              </span>
              <span className={l.level === 'error' ? 'text-red-300' : 'text-zinc-300'}>{l.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}