import { Wifi, Database, Activity } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { PALETTE_PKGS } from '../../config'
import type { PalettePkg } from '../../config'

function PkgIcon({ pkg }: { pkg: string }) {
  const cls = 'text-[var(--text-muted)]'
  if (['alpaca','binance','kraken','massive'].includes(pkg)) return <Wifi size={15} className={cls} strokeWidth={2} />
  if (['rdb','wdb','hdb'].includes(pkg)) return <Database size={15} className={cls} strokeWidth={2} />
  return <Activity size={15} className={cls} strokeWidth={2} />
}

function DraggableItem({ pkg }: { pkg: PalettePkg }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${pkg}`, data: { pkg } })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none
        transition-all text-sm font-semibold border-2
        ${isDragging
          ? 'opacity-40 border-blue-500/50 bg-[var(--bg-node)]'
          : 'border-[var(--border-node)] bg-[var(--bg-node)] hover:bg-[var(--bg-node-hover)] hover:border-[var(--border-node-hover)] text-[var(--text-primary)]'
        }`}
    >
      <PkgIcon pkg={pkg} />
      <span>{pkg}</span>
    </div>
  )
}

export default function ProcessPalette(props: { width: number }) {
  return (
    <div className="shrink-0 flex flex-col min-h-0 px-3 py-4 border-r border-[var(--border-subtle)] overflow-y-auto" style={{ width: props.width }}>
      <p className="text-[var(--text-primary)] text-lg font-bold mb-2 px-1 shrink-0">Processes</p>
      <div className="flex flex-col gap-1.5">
        {PALETTE_PKGS.map(pkg => (
          <DraggableItem key={pkg} pkg={pkg} />
        ))}
      </div>
    </div>
  )
}
