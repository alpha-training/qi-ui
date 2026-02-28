import type { Stack } from '../types'

/** Simulated network delay */
const delay = (ms = 250) => new Promise<void>(r => setTimeout(r, ms))

// ─── In-memory store (replace with fetch() calls when backend is ready) ───────

let _stacks: Record<string, Stack> = {
  Dev1: {
    description: 'Dev 1',
    base_port: 8000,
    processes: {
      binance1: { pkg: 'binance', port_offset: 100, publishes_to: ['tp1'] },
      massive1: { pkg: 'massive', port_offset: 101, publishes_to: ['tp1'] },
      alpaca1:  { pkg: 'alpaca',  port_offset: 102, publishes_to: ['tp1'] },
      kraken1:  { pkg: 'kraken',  port_offset: 103, publishes_to: ['tp1'] },
      tp1:      { pkg: 'tp',      port_offset: 10,  publishes_to: ['rdb1', 'wdb1'] },
      rdb1:     { pkg: 'rdb',     port_offset: 11,  subscribes_to: { tp1: '*' } },
      wdb1:     { pkg: 'wdb',     port_offset: 12,  subscribes_to: { tp1: '*' } },
      hdb1:     { pkg: 'hdb',     port_offset: 13 },
    },
  },
  Dev2: {
    description: 'Dev 2',
    base_port: 9000,
    processes: {
      alpaca1: { pkg: 'alpaca', port_offset: 0, publishes_to: ['tp1'] },
      tp1:     { pkg: 'tp',     port_offset: 10, publishes_to: ['rdb1'] },
      rdb1:    { pkg: 'rdb',    port_offset: 11, subscribes_to: { tp1: '*' } },
    },
  },
  Prod: {
    description: 'Production',
    base_port: 7000,
    processes: {
      binance1: { pkg: 'binance', port_offset: 0,  publishes_to: ['tp1'] },
      tp1:      { pkg: 'tp',      port_offset: 10, publishes_to: ['rdb1', 'wdb1'] },
      rdb1:     { pkg: 'rdb',     port_offset: 11, subscribes_to: { tp1: '*' } },
      wdb1:     { pkg: 'wdb',     port_offset: 12, subscribes_to: { tp1: '*' } },
      hdb1:     { pkg: 'hdb',     port_offset: 13 },
    },
  },
  Research: {
    description: 'Research',
    base_port: 6000,
    processes: {
      tp1:     { pkg: 'tp',      port_offset: 0 },
      massive1:{ pkg: 'massive', port_offset: 1, publishes_to: ['tp1'] },
    },
  },
}

// ─── Stack CRUD ───────────────────────────────────────────────────────────────

export async function getStacks(): Promise<Record<string, Stack>> {
  await delay()
  return structuredClone(_stacks)
}

export async function getStack(name: string): Promise<Stack> {
  await delay()
  const s = _stacks[name]
  if (!s) throw new Error(`Stack "${name}" not found`)
  return structuredClone(s)
}

export async function createStack(name: string, stack: Stack): Promise<void> {
  await delay()
  _stacks[name] = structuredClone(stack)
}

export async function updateStack(name: string, stack: Stack): Promise<void> {
  await delay()
  if (!_stacks[name]) throw new Error(`Stack "${name}" not found`)
  _stacks[name] = structuredClone(stack)
}

export async function deleteStack(name: string): Promise<void> {
  await delay()
  delete _stacks[name]
}

export async function cloneStack(name: string, newName: string): Promise<void> {
  await delay()
  if (!_stacks[name]) throw new Error(`Stack "${name}" not found`)
  _stacks[newName] = structuredClone(_stacks[name])
}

// ─── Process control ─────────────────────────────────────────────────────────

export async function startProcess(_stack: string, _proc: string): Promise<void> {
  await delay(300)
}

export async function stopProcess(_stack: string, _proc: string): Promise<void> {
  await delay(300)
}

export async function startAll(_stack: string): Promise<void> {
  await delay(400)
}

export async function stopAll(_stack: string): Promise<void> {
  await delay(400)
}