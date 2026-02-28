import type { Stack, Process, GraphNode, GraphEdge, ProcessRuntime } from '../types'
import { PKG_LAYER, LAYOUT } from '../config'

// ─── Auto-naming ──────────────────────────────────────────────────────────────

/**
 * Returns the next available process name for a given package.
 * e.g. if rdb1 exists, returns rdb2.
 */
export function autoName(pkg: string, processes: Record<string, Process>): string {
  let i = 1
  while (processes[`${pkg}${i}`]) i++
  return `${pkg}${i}`
}

// ─── Port calculation ─────────────────────────────────────────────────────────

export function resolvePort(stack: Stack, proc: Process): number {
  return stack.base_port + proc.port_offset
}

// ─── Runtime list ─────────────────────────────────────────────────────────────

export function buildRuntimeList(
  stack: Stack,
  statuses: Record<string, 'running' | 'stopped'>,
): ProcessRuntime[] {
  return Object.entries(stack.processes).map(([name, proc]) => ({
    name,
    process: proc,
    status: statuses[name] ?? 'stopped',
    port: resolvePort(stack, proc),
    host: 'localhost',
  }))
}

// ─── Graph derivation ─────────────────────────────────────────────────────────

function layerNodes(processes: Record<string, Process>): Record<string, { x: number; y: number }> {
  // Group names by layer
  const layers: Record<string, string[]> = { feed: [], ticker: [], storage: [], db: [] }
  for (const [name, p] of Object.entries(processes)) {
    const layer = PKG_LAYER[p.pkg] ?? 'storage'
    layers[layer].push(name)
  }

  const positions: Record<string, { x: number; y: number }> = {}
  for (const [layer, names] of Object.entries(layers)) {
    const y = LAYOUT.LAYER_Y[layer as keyof typeof LAYOUT.LAYER_Y] ?? 0
    const totalW = names.length * LAYOUT.NODE_W + (names.length - 1) * LAYOUT.H_GAP
    names.forEach((name, i) => {
      positions[name] = {
        x: i * (LAYOUT.NODE_W + LAYOUT.H_GAP) - totalW / 2 + LAYOUT.NODE_W / 2,
        y,
      }
    })
  }
  return positions
}

export function deriveGraphNodes(
  stack: Stack,
  statuses: Record<string, 'running' | 'stopped'>,
): GraphNode[] {
  const positions = layerNodes(stack.processes)
  return Object.entries(stack.processes).map(([name, proc]) => ({
    id: name,
    type: 'processNode',
    position: positions[name] ?? { x: 0, y: 0 },
    data: {
      name,
      process: proc,
      status: statuses[name] ?? 'stopped',
      port: resolvePort(stack, proc),
      host: 'localhost',
    },
  }))
}

export function deriveGraphEdges(stack: Stack): GraphEdge[] {
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  function add(source: string, target: string, edgeType: GraphEdge['edgeType']) {
    const key = `${source}|${target}|${edgeType}`
    if (!seen.has(key) && stack.processes[source] && stack.processes[target]) {
      seen.add(key)
      edges.push({ id: key, source, target, edgeType })
    }
  }

  for (const [name, proc] of Object.entries(stack.processes)) {
    // publishes_to: this process → targets (e.g. binance1 → tp1)
    proc.publishes_to?.forEach(t => add(name, t, 'publishes'))

    // subscribes_to: sources → this process (e.g. tp1 → rdb1)
    // The key is the source name, value is the topic
    Object.keys(proc.subscribes_to ?? {}).forEach(src => add(src, name, 'subscribes'))

    // hdb: this process stores into hdb (e.g. wdb1 → hdb1), dashed
    if (proc.hdb) add(name, proc.hdb, 'hdb')
  }

  return edges
}