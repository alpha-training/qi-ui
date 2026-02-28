import { Wifi, Database, Activity } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { PALETTE_PKGS } from '../../config'
import type { PalettePkg } from '../../config'

function pkgIcon(pkg: string) {
  if (['alpaca','binance','kraken','massive'].includes(pkg)) return Wifi
  if (['rdb','wdb','hdb'].includes(pkg)) return Database
  return Activity
}

function DraggableItem({ pkg }: { pkg: PalettePkg }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${pkg}`, data: { pkg } })
  const Icon = pkgIcon(pkg)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none
        transition-all text-sm font-semibold border-2
        ${isDragging
          ? 'opacity-40 border-blue-500/50 bg-[#0f2236]'
          : 'border-[#1a3a52] bg-[#0f2236] hover:bg-[#132b42] hover:border-[#2a5070] text-white'
        }`}
    >
      <Icon size={15} className="text-white/60" strokeWidth={2} />
      <span>{pkg}</span>
    </div>
  )
}

export default function ProcessPalette() {
  return (
    <div className="w-[168px] shrink-0 flex flex-col gap-1.5 px-3 py-4 border-r border-white/5">
      <p className="text-white text-lg font-bold mb-2 px-1">Processes</p>
      {PALETTE_PKGS.map(pkg => (
        <DraggableItem key={pkg} pkg={pkg} />
      ))}
    </div>
  )
}