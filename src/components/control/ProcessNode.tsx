import { memo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { ProcessRuntime } from '../../types'
import { useControl } from '../../context/ControlContext'

function StatusDot({ status }: { status: 'running' | 'stopped' }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full
      ${status === 'running' ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-500'}`}
    />
  )
}

export default memo(function ProcessNode({ data, selected }: NodeProps<ProcessRuntime>) {
  const { activeStack, startProcess, stopProcess } = useControl()
  const [hovering, setHovering] = useState(false)
  const show = hovering || selected

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    startProcess(activeStack, data.name)
  }
  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation()
    stopProcess(activeStack, data.name)
  }

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`w-[200px] rounded-lg border bg-[#111827] transition-all
        ${selected
          ? 'border-blue-500 shadow-lg shadow-blue-500/20'
          : 'border-white/10 hover:border-white/25'
        }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />

      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">{data.name}</span>
            <StatusDot status={data.status} />
            <span className="text-xs text-zinc-400">{data.status}</span>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">port: {data.port}</div>
        </div>
      </div>

      {show && (
        <div className="px-3 pb-3">
          {data.status === 'stopped' ? (
            <button onClick={handleStart}
              className="w-full text-xs py-1 rounded border border-green-500 text-green-400 hover:bg-green-500/10 transition-colors">
              Start
            </button>
          ) : (
            <button onClick={handleStop}
              className="w-full text-xs py-1 rounded bg-orange-500 hover:bg-orange-400 text-white transition-colors font-medium">
              Stop
            </button>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </div>
  )
})