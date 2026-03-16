import { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  type Edge, type Node, type ReactFlowInstance, MarkerType,
} from 'reactflow'
import { useDroppable } from '@dnd-kit/core'
import 'reactflow/dist/style.css'
import { useControl } from '../../context/ControlContext'
import { deriveGraphNodes, deriveGraphEdges } from '../../utils/stack'
import ProcessNode from './ProcessNode'

const nodeTypes = { processNode: ProcessNode }

const EDGE_STYLES = {
  publishes:  { stroke: '#2dd4bf', strokeWidth: 2 },
  subscribes: { stroke: '#818cf8', strokeWidth: 2 },
  hdb:        { stroke: '#fbbf24', strokeWidth: 2, strokeDasharray: '7 4' },
}
const MARKER_COLORS = {
  publishes:  '#2dd4bf',
  subscribes: '#818cf8',
  hdb:        '#fbbf24',
}

export default function StackCanvas() {
  const { stacks, activeStack, statuses, selectedProc, setSelectedProc } = useControl()
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })
  const rfRef = useRef<ReactFlowInstance | null>(null)
  const prevNodeCountRef = useRef(0)

  // Re-fit view whenever the active stack changes, or when nodes first appear (e.g. stacks load after ReactFlow mounts)
  useEffect(() => {
    if (rfRef.current && nodes.length > 0) {
      setTimeout(() => rfRef.current?.fitView({ padding: 0.3, minZoom: 0.5, maxZoom: 1 }), 50)
    }
  }, [activeStack]) // eslint-disable-line react-hooks/exhaustive-deps

  const stack = stacks[activeStack]
  const stackStatuses = statuses[activeStack] ?? {}

  // Only remount ReactFlow when switching stacks — not on every process addition.
  // Node additions/removals are handled in-place; remounting causes a visible flicker.
  const graphKey = activeStack

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
        width: 16, height: 16,
      },
    }))
  }, [stack])

  // Fit view when nodes first appear after async stack load (handles case where ReactFlow mounted before data arrived)
  useEffect(() => {
    if (nodes.length > 0 && prevNodeCountRef.current === 0 && rfRef.current) {
      setTimeout(() => rfRef.current?.fitView({ padding: 0.3, minZoom: 0.5, maxZoom: 1 }), 100)
    }
    prevNodeCountRef.current = nodes.length
  }, [nodes.length])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedProc(node.id === selectedProc ? null : node.id)
  }, [selectedProc, setSelectedProc])

  const onPaneClick = useCallback(() => setSelectedProc(null), [setSelectedProc])

  // Required for React Flow v10 controlled mode — without this, React Flow treats
  // the initial `nodes` prop as internal state and ignores subsequent updates.
  const onNodesChange = useCallback(() => {}, [])

  return (
    <div ref={setNodeRef} className={`flex-1 relative transition-colors ${isOver ? 'bg-[var(--bg-canvas-over)]' : 'bg-[var(--bg-canvas)]'}`}>
      <ReactFlow
        key={graphKey}
        nodes={nodes.map(n => ({ ...n, selected: n.id === selectedProc }))}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1 }}
        onInit={rf => { rfRef.current = rf; setTimeout(() => rf.fitView({ padding: 0.3, minZoom: 0.5, maxZoom: 1 }), 50) }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="var(--dots-color)" />
        <Controls
          showInteractive={false}
          className="!bg-[var(--bg-node)] !border-[var(--border-node)] !shadow-none [&>button]:!bg-[var(--bg-node)] [&>button]:!border-[var(--border-node)] [&>button]:!text-[var(--text-primary)] [&>button:hover]:!bg-[var(--bg-node-hover)] [&>button>svg]:!fill-[var(--text-primary)]"
        />
      </ReactFlow>

      {nodes.length === 0 && !isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[var(--text-faint)] text-sm">Drag a process from the palette to add it</span>
        </div>
      )}

      {isOver && (
        <div className="absolute inset-0 pointer-events-none z-10 border-2 border-dashed border-blue-500/40 rounded-lg m-2 flex items-center justify-center">
          <span className="text-blue-400/60 text-sm font-medium bg-[var(--bg-canvas)]/80 px-4 py-2 rounded-lg">
            Drop to add process
          </span>
        </div>
      )}

      {/* U/D keyboard hint hidden for now */}
    </div>
  )
}
