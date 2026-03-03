import { memo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { ProcessRuntime } from '../../types'
import { useControl } from '../../context/ControlContext'
import { Play, Square } from 'lucide-react'

export default memo(function ProcessNode({ data, selected }: NodeProps<ProcessRuntime>) {
  const { activeStack, startProcess, stopProcess } = useControl()
  const [hovered, setHovered] = useState(false)
  const isRunning = data.status === 'running'

  const handleStart = (e: React.MouseEvent) => { e.stopPropagation(); startProcess(activeStack, data.name) }
  const handleStop  = (e: React.MouseEvent) => { e.stopPropagation(); stopProcess(activeStack, data.name) }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-[200px] rounded-xl border-2 transition-colors select-none bg-[#0f2236]
        ${selected
          ? 'border-blue-500 shadow-xl shadow-blue-500/20'
          : 'border-[#1a3a52] hover:border-[#2a5070]'
        }`}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#1e4060', border: '2px solid #2a5878', width: 10, height: 10 }} />

      <div className="px-5 py-4">
        {/* Name + status — always rendered, fixed height */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-bold text-lg leading-tight">{data.name}</span>
          <span className="flex items-center gap-2 shrink-0 ml-2">
            {/* <span className={`text-xs font-medium ${isRunning ? 'text-green-400' : 'text-red-400'}`}>
              {data.status}
            </span> */}
            <span className={`w-3.5 h-3.5 rounded-full shrink-0
              ${isRunning
                ? 'bg-green-400 shadow-[0_0_7px_#4ade80]'
                : 'bg-red-500 shadow-[0_0_7px_#f87171]'}`} />
          </span>
        </div>

        {/* Port + button row — button slot always reserves space to prevent layout shift */}
        <div className="flex items-center justify-between min-h-[28px]">
          <span className="text-base text-[#4a7a9b]">{data.port}</span>
          <div className="w-[80px] flex justify-end">
            {hovered && (
              isRunning ? (
                <button onClick={handleStop}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400
                    text-white text-xs font-bold transition-colors shadow-lg shadow-orange-900/40">
                  <Square size={10} className="fill-white" />
                  Stop
                </button>
              ) : (
                <button onClick={handleStart}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20
                    text-zinc-300 text-xs font-medium hover:border-white/40 hover:text-white transition-colors">
                  <Play size={10} className="fill-zinc-300" />
                  Start
                </button>
              )
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#1e4060', border: '2px solid #2a5878', width: 10, height: 10 }} />
    </div>
  )
})