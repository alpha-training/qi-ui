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
  NODE_W: 260,
  NODE_H: 100,
  H_GAP: 40,
  V_GAP: 60,
  LAYER_Y: {
    feed:    0,
    ticker:  200,
    storage: 390,
    db:      570,
  },
} as const

// ─── API base ─────────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'