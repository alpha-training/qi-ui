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
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]" onClick={() => setSelectedProc(null)}>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="sticky top-0 bg-[#0d1117] z-10">
            <tr className="border-b border-white/10">
              {['name', 'host', 'port', 'status', 'pid', 'mem/heap', 'log', 'action'].map(h => (
                <th key={h} className="px-4 py-2.5 text-xs font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => (
              <tr
                key={r.name}
                onClick={e => { e.stopPropagation(); setSelectedProc(r.name === selectedProc ? null : r.name) }}
                className={`border-b border-white/5 cursor-pointer transition-colors
                  ${r.name === selectedProc ? 'bg-blue-500/10' : 'hover:bg-white/[0.03]'}`}>
                <td className="px-4 py-2 text-white font-medium">{r.name}</td>
                <td className="px-4 py-2 text-zinc-400">{r.host}</td>
                <td className="px-4 py-2 text-zinc-400 font-mono">{r.port}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0
                      ${r.status === 'running'
                        ? 'bg-green-400 shadow-[0_0_5px_#4ade80]'
                        : 'bg-red-500'}`}
                    />
                    <span className={r.status === 'running' ? 'text-zinc-300' : 'text-zinc-500'}>
                      {r.status === 'running' ? 'up' : 'down'}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-500 font-mono">{r.pid ?? '–'}</td>
                <td className="px-4 py-2 text-zinc-500 font-mono text-xs">
                  {r.mem && r.heap ? `${r.mem} / ${r.heap}` : '–'}
                </td>
                <td className="px-4 py-2">
                  <button className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-white/5">
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

      {/* Pagination — always visible */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-white/10 shrink-0">
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          className="px-3.5 py-1 text-xs rounded-lg border border-white/10 text-zinc-400
            hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          Previous
        </button>
        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
          className="px-3.5 py-1 text-xs rounded-lg border border-white/10 text-zinc-400
            hover:border-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          Next
        </button>
      </div>
    </div>
  )
}
