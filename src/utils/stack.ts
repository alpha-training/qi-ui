import type { Stack, Process, GraphNode, GraphEdge, ProcessRuntime, ProcessStatus } from '../types'
import { PKG_LAYER, LAYOUT, FEED_PKGS, FIXED_PORT_OFFSETS } from '../config'

// ─── Port offset assignment ───────────────────────────────────────────────────

/**
 * Returns the correct port_offset for a new process of the given package type,
 * following the convention: feeds=1–9, tp=10, rdb=11, wdb=12, hdb=13, others=14+
 */
export function assignPortOffset(pkg: string, processes: Record<string, Process>): number {
  const used = new Set(Object.values(processes).map(p => p.port_offset))

  if (FEED_PKGS.has(pkg)) {
    for (let i = 1; i <= 9; i++) {
      if (!used.has(i)) return i
    }
  } else if (pkg in FIXED_PORT_OFFSETS) {
    const fixed = FIXED_PORT_OFFSETS[pkg]
    if (!used.has(fixed)) return fixed
  }

  // Others (or fixed/feed overflow): next available >= 14
  let offset = 14
  while (used.has(offset)) offset++
  return offset
}

// ─── Auto-naming ──────────────────────────────────────────────────────────────

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
  statuses: Record<string, ProcessStatus>,
): ProcessRuntime[] {
  return Object.entries(stack.processes).map(([name, proc]) => ({
    name,
    process: proc,
    status: statuses[name] ?? 'stopped',
    port: resolvePort(stack, proc),
    host: 'localhost',
  }))
}

// ─── Graph layout ─────────────────────────────────────────────────────────────

function layerNodes(processes: Record<string, Process>): Record<string, { x: number; y: number }> {
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

// ─── Graph derivation ─────────────────────────────────────────────────────────

export function deriveGraphNodes(
  stack: Stack,
  statuses: Record<string, ProcessStatus>,
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
  const seen = new Set<string>() // keyed by source|target — prevents duplicate pairs across edge types

  function add(source: string, target: string, edgeType: GraphEdge['edgeType']) {
    const key = `${source}|${target}`
    if (!seen.has(key) && stack.processes[source] && stack.processes[target]) {
      seen.add(key)
      edges.push({ id: `${key}|${edgeType}`, source, target, edgeType })
    }
  }

  // subscribe_to and hdb first — they take priority over publish_to for the same pair
  for (const [name, proc] of Object.entries(stack.processes)) {
    Object.keys(proc.subscribe_to ?? {}).forEach(src => add(src, name, 'subscribes'))
    if (proc.hdb) add(name, proc.hdb, 'hdb')
  }
  // publish_to second — skipped if a subscribe/hdb edge already covers this pair
  for (const [name, proc] of Object.entries(stack.processes)) {
    proc.publish_to?.forEach(t => add(name, t, 'publishes'))
  }

  return edges
}