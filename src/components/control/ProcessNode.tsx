import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { ProcessRuntime } from '../../types'
import { useControl } from '../../context/ControlContext'
import { Play, Square } from 'lucide-react'

export default memo(function ProcessNode({ data, selected }: NodeProps<ProcessRuntime>) {
  const { activeStack, startProcess, stopProcess } = useControl()
  const isRunning = data.status === 'running'

  const handleStart = (e: React.MouseEvent) => { e.stopPropagation(); startProcess(activeStack, data.name) }
  const handleStop  = (e: React.MouseEvent) => { e.stopPropagation(); stopProcess(activeStack, data.name) }

  return (
    <div
      className={`group w-[155px] rounded-lg border-2 transition-colors select-none bg-[#0f2236]
        ${selected
          ? 'border-blue-500 shadow-xl shadow-blue-500/20'
          : 'border-[#1a3a52] hover:border-[#2a5070]'
        }`}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#1e4060', border: '2px solid #2a5878', width: 10, height: 10 }} />

      <div className="px-3 py-2">
        {/* Name + status */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-white font-semibold text-sm leading-tight">{data.name}</span>
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ml-2
            ${isRunning
              ? 'bg-green-400 shadow-[0_0_7px_#4ade80]'
              : 'bg-red-500 shadow-[0_0_7px_#f87171]'}`} />
        </div>

        {/* Port + button row — buttons always rendered, toggled via opacity to prevent layout shift */}
        <div className="flex items-center justify-between min-h-[26px]">
          <span className="text-xs text-[#4a7a9b]">{data.port}</span>
          <div className="w-[72px] flex justify-end">
            {isRunning ? (
              <button onClick={handleStop}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-500/70
                  text-orange-400 text-xs font-medium hover:bg-orange-500/10 transition-colors
                  opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                <Square size={9} className="fill-orange-400" />
                Stop
              </button>
            ) : (
              <button onClick={handleStart}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-500/70
                  text-green-400 text-xs font-medium hover:bg-green-500/10 transition-colors
                  opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                <Play size={9} className="fill-green-400" />
                Start
              </button>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#1e4060', border: '2px solid #2a5878', width: 10, height: 10 }} />
    </div>
  )
})
