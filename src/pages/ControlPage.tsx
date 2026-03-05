import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Share2, List, Play, Square, Plus, MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react'
import { useControl } from '../context/ControlContext'
import { autoName } from '../utils/stack'
import { PKG_DEFAULTS, type PalettePkg } from '../config'
import type { Stack } from '../types'
import ProcessPalette from '../components/control/ProcessPalette'
import StackCanvas    from '../components/control/StackCanvas'
import ProcessTable   from '../components/control/ProcessTable'
import JsonPanel      from '../components/control/JsonPanel'
import LogsPanel      from '../components/control/LogsPanel'
import { AddStackModal, RenameStackModal, CloneStackModal, DeleteStackModal } from '../components/control/StackModals'

export default function ControlPage() {
  const {
    stacks, stackOrder, activeStack, setActiveStack,
    selectedProc, setSelectedProc,
    viewMode, setViewMode,
    addStack, renameStack, cloneStack, deleteStack, saveStack,
    startAll, stopAll, startProcess, stopProcess,
    statuses, jsonStatus, stacksLoading,
  } = useControl()

  const [showMenu, setShowMenu]         = useState(false)
  const [menuAnchor, setMenuAnchor]     = useState<{ top: number; left: number } | null>(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showClone, setShowClone]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [activeDrag, setActiveDrag] = useState<string | null>(null)

  const stackNames    = stackOrder
  const stack         = stacks[activeStack]
  const procNames     = useMemo(() => Object.keys(stack?.processes ?? {}), [stack])
  const stackStatuses = useMemo(() => statuses[activeStack] ?? {}, [statuses, activeStack])

  const allRunning = useMemo(() =>
    procNames.length > 0 && procNames.every(p => stackStatuses[p] === 'running' || stackStatuses[p] === 'busy'),
    [procNames, stackStatuses])
  const anyRunning = useMemo(() =>
    procNames.some(p => stackStatuses[p] === 'running' || stackStatuses[p] === 'busy'),
    [procNames, stackStatuses])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!selectedProc) return
      if (e.key === 'u') startProcess(activeStack, selectedProc)
      if (e.key === 'd') stopProcess(activeStack, selectedProc)
      if (e.key === 'Escape') setSelectedProc(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedProc, activeStack, startProcess, stopProcess, setSelectedProc])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (over?.id !== 'canvas') return
    const currentStack = stacks[activeStack]
    if (!currentStack) return
    const pkg = (active.data.current as { pkg: string }).pkg
    const name = autoName(pkg, currentStack.processes)
    const existingOffsets = Object.values(currentStack.processes).map(p => p.port_offset)
    const portOffset = existingOffsets.length === 0 ? 0 : Math.max(...existingOffsets) + 1
    const defaults = PKG_DEFAULTS[pkg as PalettePkg] ?? {}
    const updated: Stack = {
      ...currentStack,
      processes: { ...currentStack.processes, [name]: { pkg, port_offset: portOffset, ...defaults } },
    }
    saveStack(activeStack, updated)
  }, [stacks, activeStack, saveStack])

  const handleAddStack = (name: string, description: string, basePort: number) => {
    addStack(name, { description, base_port: basePort, processes: {} })
  }

  if (stacksLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="flex items-center gap-3 text-[var(--text-dimmed)] text-sm">
          <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[#3b82f6] rounded-full animate-spin" />
          Connecting…
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => setActiveDrag((e.active.data.current as { pkg: string }).pkg)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-stretch border-b border-[var(--border)] bg-[var(--bg-surface)]">

          {/* Left section: view toggle + scrollable stack tabs */}
          <div className="flex-1 min-w-0 flex items-center gap-4 px-5 py-2.5">

            {/* View toggle */}
            <button onClick={() => setViewMode(viewMode === 'graph' ? 'table' : 'graph')}
              className="flex items-center justify-center gap-2 w-[128px] shrink-0 px-3.5 py-1.5 rounded border
                font-medium text-sm whitespace-nowrap transition-all border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20">
              {viewMode === 'graph' ? <><List size={14} /> Table view</> : <><Share2 size={14} /> Graph view</>}
            </button>

            {/* Stack tabs — scrollable, + always pinned outside */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <div className="tab-scroll min-w-0 overflow-x-auto">
                <div className="flex items-center gap-1.5 ml-3 w-max">
                  {stackNames.map(name => (
                    <button key={name} onClick={() => { setActiveStack(name); setSelectedProc(null) }}
                      className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                        ${activeStack === name
                          ? 'bg-[var(--bg-tab-active)] text-[var(--text-primary)] border border-[var(--border-tab-active)]'
                          : 'text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]'}`}>
                      {name}
                      {activeStack === name && (
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setMenuAnchor({ top: rect.bottom + 6, left: rect.left })
                            setShowMenu(v => !v)
                          }}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-0.5 cursor-pointer">
                          <MoreHorizontal size={12} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowAdd(true)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-md)]">
                <Plus size={13} />
              </button>
            </div>

            {/* Stack menu portal */}
            {showMenu && menuAnchor && createPortal(
              <div
                style={{ position: 'fixed', top: menuAnchor.top, left: menuAnchor.left }}
                className="z-[9999] bg-[var(--bg-dropdown)] border border-[var(--border)] rounded-lg shadow-xl w-36 py-1"
                onMouseLeave={() => setShowMenu(false)}>
                <button onClick={() => { setShowRename(true); setShowMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]">
                  <Pencil size={12} className="text-[var(--text-dimmed)]" /> Rename
                </button>
                <button onClick={() => { setShowClone(true); setShowMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover-md)]">
                  <Copy size={12} className="text-[var(--text-dimmed)]" /> Clone
                </button>
                <button onClick={() => { setShowDelete(true); setShowMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-red-400 hover:bg-[var(--bg-hover-md)]">
                  <Trash2 size={12} className="text-red-400" /> Delete
                </button>
              </div>,
              document.body
            )}
          </div>

          {/* Start / Stop all */}
          <div className="shrink-0 flex items-center gap-2 px-4 border-l border-[var(--border)]">
            <button
              onClick={() => startAll(activeStack)}
              disabled={allRunning}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all
                ${allRunning
                  ? 'border-[var(--border)] text-[var(--text-faint)] cursor-not-allowed'
                  : 'border-green-500/70 text-green-400 hover:bg-green-500/10'}`}>
              <Play size={11} className={allRunning ? 'fill-[var(--text-faint)]' : 'fill-green-400'} />
              Start all
            </button>
            <button
              onClick={() => stopAll(activeStack)}
              disabled={!anyRunning}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all
                ${!anyRunning
                  ? 'border-[var(--border)] text-[var(--text-faint)] cursor-not-allowed'
                  : 'border-orange-500/70 text-orange-400 hover:bg-orange-500/10'}`}>
              <Square size={11} className={!anyRunning ? 'fill-[var(--text-faint)]' : 'fill-orange-400'} />
              Stop all
            </button>
          </div>

          {/* Right section: JSON Config header */}
          {(() => {
            const cfg = {
              valid:   { label: 'Valid',           dot: 'bg-green-400 shadow-[0_0_6px_#4ade80]', text: 'text-green-400' },
              unsaved: { label: 'Unsaved changes', dot: 'bg-amber-400 shadow-[0_0_6px_#fbbf24]', text: 'text-amber-400' },
              invalid: { label: 'Invalid',         dot: 'bg-red-400 shadow-[0_0_6px_#f87171]',   text: 'text-red-400'   },
            }[jsonStatus]
            return (
              <div className="w-80 shrink-0 flex items-center justify-between px-5 border-l border-[var(--border)]">
                <span className="text-sm font-bold text-[var(--text-primary)]">JSON Config</span>
                <span className={`flex items-center gap-2 text-xs font-semibold ${cfg.text}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  {cfg.label}
                </span>
              </div>
            )
          })()}
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-1 min-h-0">
              {viewMode === 'graph' && <ProcessPalette />}
              {viewMode === 'graph' ? <StackCanvas /> : <ProcessTable key={activeStack} />}
            </div>
            <LogsPanel key={activeStack} />
          </div>
          <JsonPanel />
        </div>
      </div>

      <DragOverlay>
        {activeDrag && (
          <div className="px-3 py-2 rounded-md bg-[#3b82f6]/20 border border-[#3b82f6] text-[#3b82f6] text-xs font-mono shadow-lg">
            {activeDrag}
          </div>
        )}
      </DragOverlay>

      {showAdd && (
        <AddStackModal
          existingNames={stackNames}
          suggestedPort={Math.max(0, ...Object.values(stacks).map(s => s.base_port)) + 1000}
          onAdd={handleAddStack}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showRename && (
        <RenameStackModal stackName={activeStack} existingNames={stackNames}
          onRename={name => renameStack(activeStack, name)} onClose={() => setShowRename(false)} />
      )}
      {showClone && (
        <CloneStackModal sourceName={activeStack} existingNames={stackNames}
          onClone={name => cloneStack(activeStack, name)} onClose={() => setShowClone(false)} />
      )}
      {showDelete && (
        <DeleteStackModal stackName={activeStack}
          onDelete={() => { deleteStack(activeStack); setShowDelete(false) }}
          onClose={() => setShowDelete(false)} />
      )}
    </DndContext>
  )
}
