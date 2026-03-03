import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Share2, List, Play, Square, Plus, MoreHorizontal } from 'lucide-react'
import { useControl } from '../context/ControlContext'
import { autoName } from '../utils/stack'
import type { Stack } from '../types'
import ProcessPalette from '../components/control/ProcessPalette'
import StackCanvas    from '../components/control/StackCanvas'
import ProcessTable   from '../components/control/ProcessTable'
import JsonPanel      from '../components/control/JsonPanel'
import LogsPanel      from '../components/control/LogsPanel'
import { AddStackModal, CloneStackModal, DeleteStackModal } from '../components/control/StackModals'

export default function ControlPage() {
  const {
    stacks, activeStack, setActiveStack,
    selectedProc, setSelectedProc,
    viewMode, setViewMode,
    addStack, cloneStack, deleteStack, saveStack,
    startAll, stopAll, startProcess, stopProcess,
    statuses,
  } = useControl()

  const [showMenu, setShowMenu]     = useState(false)
  const [showAdd, setShowAdd]       = useState(false)
  const [showClone, setShowClone]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [activeDrag, setActiveDrag] = useState<string | null>(null)

  const stackNames   = Object.keys(stacks)
  const stack        = stacks[activeStack]
  const procNames    = Object.keys(stack?.processes ?? {})
  const stackStatuses = statuses[activeStack] ?? {}

  // Disable Start all if every process is running; Stop all if every process is stopped
  const allRunning = useMemo(() =>
    procNames.length > 0 && procNames.every(p => stackStatuses[p] === 'running'),
    [procNames, stackStatuses])
  const allStopped = useMemo(() =>
    procNames.length > 0 && procNames.every(p => !stackStatuses[p] || stackStatuses[p] === 'stopped'),
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
    const portOffset = Object.keys(currentStack.processes).length
    const updated: Stack = {
      ...currentStack,
      processes: { ...currentStack.processes, [name]: { pkg, port_offset: portOffset } },
    }
    saveStack(activeStack, updated)
  }, [stacks, activeStack, saveStack])

  const handleAddStack = (name: string, description: string, basePort: number) => {
    addStack(name, { description, base_port: basePort, processes: {} })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => setActiveDrag((e.active.data.current as { pkg: string }).pkg)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-white/10 bg-[#0f1117] flex-wrap">

          {/* View toggle */}
          <button onClick={() => setViewMode(viewMode === 'graph' ? 'table' : 'graph')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-medium text-sm transition-all
              border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 shrink-0">
            {viewMode === 'graph' ? <><List size={14} /> Table view</> : <><Share2 size={14} /> Graph view</>}
          </button>

          {/* Stack tabs */}
          <div className="flex items-center gap-1 relative">
            {stackNames.map(name => (
              <button key={name} onClick={() => { setActiveStack(name); setSelectedProc(null) }}
                className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${activeStack === name
                    ? 'bg-zinc-700/80 text-white border border-white/15'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>
                {name}
                {activeStack === name && (
                  <span onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
                    className="text-zinc-400 hover:text-white ml-0.5 cursor-pointer">
                    <MoreHorizontal size={12} />
                  </span>
                )}
              </button>
            ))}
            <button onClick={() => setShowAdd(true)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/5">
              <Plus size={13} />
            </button>

            {showMenu && (
              <div className="absolute top-9 left-0 z-50 bg-[#1a2233] border border-white/10 rounded-lg shadow-xl w-40"
                onMouseLeave={() => setShowMenu(false)}>
                <button onClick={() => { setShowClone(true); setShowMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-white/5">Clone stack</button>
                <button onClick={() => { setShowDelete(true); setShowMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-white/5">Delete stack</button>
              </div>
            )}
          </div>

          {/* Spacer pushes Start/Stop all to the right */}
          <div className="flex-1" />

          {/* Start / Stop all — flush against JSON panel */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => startAll(activeStack)}
              disabled={allRunning}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-all
                ${allRunning
                  ? 'border-white/10 text-zinc-600 cursor-not-allowed'
                  : 'border-green-500/70 text-green-400 hover:bg-green-500/10'}`}>
              <Play size={11} className={allRunning ? 'fill-zinc-600' : 'fill-green-400'} />
              Start all
            </button>
            <button
              onClick={() => stopAll(activeStack)}
              disabled={allStopped}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium transition-all
                ${allStopped
                  ? 'border-white/10 text-zinc-600 cursor-not-allowed'
                  : 'border-orange-500/70 text-orange-400 hover:bg-orange-500/10'}`}>
              <Square size={11} className={allStopped ? 'fill-zinc-600' : 'fill-orange-400'} />
              Stop all
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex flex-1 min-h-0">
              <ProcessPalette />
              {viewMode === 'graph' ? <StackCanvas /> : <ProcessTable />}
            </div>
            <LogsPanel />
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
        <AddStackModal existingNames={stackNames} onAdd={handleAddStack} onClose={() => setShowAdd(false)} />
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