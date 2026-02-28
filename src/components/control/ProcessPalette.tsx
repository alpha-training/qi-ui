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
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-grab active:cursor-grabbing select-none
        transition-all font-bold text-base border-2
        ${isDragging
          ? 'opacity-40 border-blue-500/50 bg-[#0f2236]'
          : 'border-[#1a3a52] bg-[#0f2236] hover:bg-[#132b42] hover:border-[#2a5070] text-white'
        }`}
    >
      <Icon size={18} className="text-white/70" strokeWidth={2} />
      <span>{pkg}</span>
    </div>
  )
}

export default function ProcessPalette() {
  return (
    <div className="w-[200px] shrink-0 flex flex-col gap-2 px-4 py-5 border-r border-white/5">
      <p className="text-white text-xl font-bold mb-3 px-1">Processes</p>
      {PALETTE_PKGS.map(pkg => (
        <DraggableItem key={pkg} pkg={pkg} />
      ))}
    </div>
  )
}