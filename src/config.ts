// ─── Package Palette ──────────────────────────────────────────────────────────

/** Packages hidden from the drag palette */
export const IGNORED_PKGS = new Set([
  'ipc', 'event', 'cron', 'log', 'proc', 'hub', 'cli',
])

/** All known palette packages — in display order */
export const PALETTE_PKGS = [
  'alpaca', 'binance', 'kraken', 'massive',
  'tp',
  'rdb', 'wdb', 'hdb',
] as const

export type PalettePkg = (typeof PALETTE_PKGS)[number]

// ─── Visual / Layer classification ───────────────────────────────────────────

/** Which layout layer a package belongs to (used for auto-layout) */
export type PkgLayer = 'feed' | 'ticker' | 'storage' | 'db'

export const PKG_LAYER: Record<string, PkgLayer> = {
  alpaca: 'feed',
  binance: 'feed',
  kraken: 'feed',
  massive: 'feed',
  tp: 'ticker',
  rdb: 'storage',
  wdb: 'storage',
  hdb: 'db',
}

// ─── Colours (Tailwind class names) ──────────────────────────────────────────

export const PKG_ICON_COLOR: Record<string, string> = {
  alpaca:  'text-teal-400',
  binance: 'text-yellow-400',
  kraken:  'text-indigo-400',
  massive: 'text-rose-400',
  tp:      'text-blue-400',
  rdb:     'text-purple-400',
  wdb:     'text-green-400',
  hdb:     'text-amber-400',
}

// ─── Graph layout constants ───────────────────────────────────────────────────

export const LAYOUT = {
  NODE_W: 175,
  NODE_H: 80,
  H_GAP: 20,
  V_GAP: 30,
  LAYER_Y: {
    feed:    0,
    ticker:  150,
    storage: 290,
    db:      430,
  },
} as const

// ─── Default process connections ─────────────────────────────────────────────

/** Default connection fields applied when a package is dropped onto the canvas */
export const PKG_DEFAULTS: Partial<Record<PalettePkg, {
  publish_to?: string[]
  subscribe_to?: Record<string, string>
  hdb?: string
}>> = {
  alpaca:  { publish_to: ['tp1'] },
  binance: { publish_to: ['tp1'] },
  kraken:  { publish_to: ['tp1'] },
  massive: { publish_to: ['tp1'] },
  rdb:     { subscribe_to: { tp1: '*' } },
  wdb:     { subscribe_to: { tp1: '*' }, hdb: 'hdb1' },
}

// ─── Port offset convention ───────────────────────────────────────────────────

/** Feed packages occupy port offsets 1–9 (one slot per feed instance) */
export const FEED_PKGS = new Set(['alpaca', 'binance', 'kraken', 'massive'])

/** Fixed canonical port offsets for non-feed packages */
export const FIXED_PORT_OFFSETS: Record<string, number> = {
  tp:  10,
  rdb: 11,
  wdb: 12,
  hdb: 13,
}

// ─── API base ─────────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:9001'