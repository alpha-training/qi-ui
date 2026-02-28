import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  type Edge, type Node,
  MarkerType,
} from 'reactflow'
import { useDroppable } from '@dnd-kit/core'
import 'reactflow/dist/style.css'

import { useControl } from '../../context/ControlContext'
import { deriveGraphNodes, deriveGraphEdges } from '../../utils/stack'
import ProcessNode from './ProcessNode'

const nodeTypes = { processNode: ProcessNode }

function edgeStyle(type: 'publishes' | 'subscribes' | 'hdb') {
  if (type === 'hdb') return {
    stroke: '#a78bfa',
    strokeDasharray: '5 4',
    strokeWidth: 1.5,
  }
  return { stroke: '#60a5fa', strokeWidth: 1.5 }
}

export default function StackCanvas() {
  const { stacks, activeStack, statuses, selectedProc, setSelectedProc } = useControl()
  const { setNodeRef } = useDroppable({ id: 'canvas' })

  const stack = stacks[activeStack]
  const stackStatuses = statuses[activeStack] ?? {}

  const nodes: Node[] = useMemo(
    () => stack ? deriveGraphNodes(stack, stackStatuses) : [],
    [stack, stackStatuses],
  )

  const edges: Edge[] = useMemo(() => {
    if (!stack) return []
    return deriveGraphEdges(stack).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: false,
      style: edgeStyle(e.edgeType),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: e.edgeType === 'hdb' ? '#a78bfa' : '#60a5fa',
        width: 18,
        height: 18,
      },
    }))
  }, [stack])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedProc(node.id === selectedProc ? null : node.id)
  }, [selectedProc, setSelectedProc])

  const onPaneClick = useCallback(() => setSelectedProc(null), [setSelectedProc])

  return (
    <div ref={setNodeRef} className="flex-1 bg-[#0d1117] relative">
      <ReactFlow
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedProc }))}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1f2937" />
        <Controls
          showInteractive={false}
          className="!bg-[#111827] !border-white/10 !shadow-none [&>button]:!bg-[#111827] [&>button]:!border-white/10 [&>button]:!text-zinc-400 [&>button:hover]:!bg-white/10"
        />
      </ReactFlow>

      {/* Keyboard hint when proc selected */}
      {selectedProc && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#111827]/90 border border-white/10 rounded-full px-4 py-1.5 text-xs text-zinc-400 flex gap-4 backdrop-blur-sm">
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">U</kbd> start</span>
          <span><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">D</kbd> stop</span>
        </div>
      )}
    </div>
  )
}