import { Wifi, Database, Activity } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { PALETTE_PKGS, PKG_ICON_COLOR } from '../../config'
import type { PalettePkg } from '../../config'

function pkgIcon(pkg: string) {
  if (['alpaca','binance','kraken','massive'].includes(pkg)) return Wifi
  if (['rdb','wdb','hdb'].includes(pkg)) return Database
  return Activity
}

function DraggableItem({ pkg }: { pkg: PalettePkg }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${pkg}`, data: { pkg } })
  const Icon = pkgIcon(pkg)
  const color = PKG_ICON_COLOR[pkg] ?? 'text-zinc-400'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border cursor-grab active:cursor-grabbing select-none
        transition-all text-sm font-medium
        ${isDragging
          ? 'opacity-50 border-blue-500 bg-blue-500/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-zinc-200'
        }`}
    >
      <Icon size={15} className={color} />
      <span>{pkg}</span>
    </div>
  )
}

export default function ProcessPalette() {
  return (
    <div className="w-[168px] shrink-0 flex flex-col gap-1 px-3 py-4">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2 px-1">Processes</p>
      {PALETTE_PKGS.map(pkg => (
        <DraggableItem key={pkg} pkg={pkg} />
      ))}
    </div>
  )
}