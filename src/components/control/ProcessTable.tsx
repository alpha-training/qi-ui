import { ScrollText } from 'lucide-react'
import { useControl } from '../../context/ControlContext'
import { buildRuntimeList } from '../../utils/stack'

export default function ProcessTable() {
  const { stacks, activeStack, statuses, startProcess, stopProcess } = useControl()
  const stack = stacks[activeStack]
  if (!stack) return null

  const rows = buildRuntimeList(stack, statuses[activeStack] ?? {})

  return (
    <div className="flex-1 overflow-auto bg-[#0d1117]">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/10">
            {['name','host','port','status','pid','mem/heap','log','action'].map(h => (
              <th key={h} className="px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-white/5 hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{r.name}</td>
              <td className="px-4 py-3 text-zinc-400">{r.host}</td>
              <td className="px-4 py-3 text-zinc-400">{r.port}</td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${r.status === 'running' ? 'bg-green-400' : 'bg-red-500'}`} />
                  <span className={r.status === 'running' ? 'text-green-400' : 'text-red-400'}>{r.status === 'running' ? 'up' : 'down'}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-500">{r.pid ?? '–'}</td>
              <td className="px-4 py-3 text-zinc-500">{r.mem && r.heap ? `${r.mem} / ${r.heap}` : '–'}</td>
              <td className="px-4 py-3">
                <button className="text-zinc-400 hover:text-white transition-colors">
                  <ScrollText size={15} />
                </button>
              </td>
              <td className="px-4 py-3">
                {r.status === 'stopped' ? (
                  <button onClick={() => startProcess(activeStack, r.name)}
                    className="px-4 py-1 rounded border border-green-500 text-green-400 text-xs hover:bg-green-500/10 transition-colors font-medium">
                    Start
                  </button>
                ) : (
                  <button onClick={() => stopProcess(activeStack, r.name)}
                    className="px-4 py-1 rounded border border-orange-500 text-orange-400 text-xs hover:bg-orange-500/10 transition-colors font-medium">
                    Stop
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}