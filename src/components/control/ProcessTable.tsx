import { useState } from 'react'
import { FileText } from 'lucide-react'
import { useControl } from '../../context/ControlContext'
import { buildRuntimeList } from '../../utils/stack'

const PAGE_SIZE = 8

export default function ProcessTable() {
  const { stacks, activeStack, statuses, selectedProc, setSelectedProc, startProcess, stopProcess } = useControl()
  const [page, setPage] = useState(0)
  const stack = stacks[activeStack]
  if (!stack) return null

  const rows = buildRuntimeList(stack, statuses[activeStack] ?? {})
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-base)]" onClick={() => setSelectedProc(null)}>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-base)] z-10">
            <tr className="border-b border-[var(--border)]">
              {['name', 'host', 'port', 'status', 'pid', 'mem/heap', 'log', 'action'].map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-medium text-[var(--text-dimmed)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-[var(--text-faint)]">
                  No processes in this stack.
                </td>
              </tr>
            )}
            {pageRows.map(r => (
              <tr
                key={r.name}
                onClick={e => { e.stopPropagation(); setSelectedProc(r.name === selectedProc ? null : r.name) }}
                className={`border-b border-[var(--border-subtle)] cursor-pointer transition-colors
                  ${r.name === selectedProc ? 'bg-blue-500/10' : 'hover:bg-[var(--bg-hover)]'}`}>
                <td className="px-4 py-2 text-[var(--text-primary)] font-medium">{r.name}</td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{r.host}</td>
                <td className="px-4 py-2 text-[var(--text-muted)] font-mono">{r.port}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0
                      ${r.status === 'running'
                        ? 'bg-green-400 shadow-[0_0_5px_#4ade80]'
                        : r.status === 'busy'
                        ? 'bg-yellow-400 shadow-[0_0_5px_#facc15]'
                        : 'bg-red-500'}`}
                    />
                    <span className={r.status === 'running' ? 'text-[var(--text-secondary)]' : r.status === 'busy' ? 'text-yellow-400' : 'text-[var(--text-dimmed)]'}>
                      {r.status === 'running' ? 'up' : r.status === 'busy' ? 'busy' : 'down'}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2 text-[var(--text-dimmed)] font-mono">{r.pid ?? '–'}</td>
                <td className="px-4 py-2 text-[var(--text-dimmed)] font-mono text-xs">
                  {r.mem && r.heap ? `${r.mem} / ${r.heap}` : '–'}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedProc(r.name === selectedProc ? null : r.name) }}
                    className="text-[var(--text-dimmed)] hover:text-[var(--text-primary)] transition-colors p-1 rounded hover:bg-[var(--bg-hover-md)]">
                    <FileText size={14} />
                  </button>
                </td>
                <td className="px-4 py-2">
                  {r.status === 'stopped' ? (
                    <button onClick={e => { e.stopPropagation(); startProcess(activeStack, r.name) }}
                      className="px-4 py-1 rounded-lg border border-green-500/70 text-green-400 text-xs
                        font-medium hover:bg-green-500/10 transition-colors min-w-[64px]">
                      Start
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); stopProcess(activeStack, r.name) }}
                      className="px-4 py-1 rounded-lg border border-orange-500/70 text-orange-400 text-xs
                        font-medium hover:bg-orange-500/10 transition-colors min-w-[64px]">
                      Stop
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination — only shown when there is more than one page */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-[var(--border)] shrink-0">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3.5 py-1 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)]
              hover:border-[var(--border-node)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            Previous
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3.5 py-1 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)]
              hover:border-[var(--border-node)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            Next
          </button>
        </div>
      )}
    </div>
  )
}
