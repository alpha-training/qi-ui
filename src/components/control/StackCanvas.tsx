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


// Colors matching the design exactly
const EDGE_STYLES = {
  publishes:  { stroke: '#2dd4bf', strokeWidth: 2 },                          // teal  — feeds → tp
  subscribes: { stroke: '#818cf8', strokeWidth: 2 },                          // indigo — tp → rdb/wdb
  hdb:        { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '7 4' }, // yellow dashed — wdb → hdb
}
const MARKER_COLORS = {
  publishes:  '#2dd4bf',
  subscribes: '#818cf8',
  hdb:        '#fbbf24',
}

export default function StackCanvas() {
  const { stacks, activeStack, statuses, selectedProc, setSelectedProc } = useControl()

  // ✅ Drop target wraps the whole canvas — not inside React Flow
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })

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
      style: EDGE_STYLES[e.edgeType],
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: MARKER_COLORS[e.edgeType],
        width: 16,
        height: 16,
      },
    }))
  }, [stack])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedProc(node.id === selectedProc ? null : node.id)
  }, [selectedProc, setSelectedProc])

  const onPaneClick = useCallback(() => setSelectedProc(null), [setSelectedProc])

  return (
    // ✅ setNodeRef on the outer wrapper — React Flow is a child, not the drop target
    <div ref={setNodeRef} className={`flex-1 relative transition-colors
      ${isOver ? 'bg-[#0d1e30]' : 'bg-[#080e18]'}`}>
      <ReactFlow
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedProc }))}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1a2535" />
        <Controls
          showInteractive={false}
          className="!bg-[#0f2236] !border-[#1a3a52] !shadow-none [&>button]:!bg-[#0f2236] [&>button]:!border-[#1a3a52] [&>button]:!text-zinc-400 [&>button:hover]:!bg-[#132b42]"
        />
      </ReactFlow>

      {/* Drop hint overlay */}
      {isOver && (
        <div className="absolute inset-0 pointer-events-none z-10 border-2 border-dashed border-blue-500/40 rounded-lg m-2 flex items-center justify-center">
          <span className="text-blue-400/60 text-sm font-medium bg-[#080e18]/80 px-4 py-2 rounded-lg">
            Drop to add process
          </span>
        </div>
      )}

      {selectedProc && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#0f2236]/95 border border-[#1a3a52] rounded-full px-5 py-2 text-xs text-zinc-400 flex gap-4 backdrop-blur-sm">
          <span><kbd className="bg-[#1a3a52] px-1.5 py-0.5 rounded text-white font-mono">U</kbd> start</span>
          <span><kbd className="bg-[#1a3a52] px-1.5 py-0.5 rounded text-white font-mono">D</kbd> stop</span>
        </div>
      )}
    </div>
  )
}