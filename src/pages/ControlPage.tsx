import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Share2, List, Play, Square, Plus, MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react'
import { useControl } from '../context/ControlContext'
import { autoName, assignPortOffset } from '../utils/stack'
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
    addStack, renameStack, cloneStack, deleteStack, saveStack, reorderStacks,
    startAll, stopAll, startProcess, stopProcess,
    statuses, jsonStatus, stacksLoading, statusesLoading,
  } = useControl()

  const [showMenu, setShowMenu]         = useState(false)
  const [menuAnchor, setMenuAnchor]     = useState<{ top: number; left: number } | null>(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showClone, setShowClone]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [activeDrag, setActiveDrag] = useState<string | null>(null)
  const [dragTab, setDragTab] = useState<string | null>(null)
  const [dragOverTab, setDragOverTab] = useState<string | null>(null)

  const stacksRef = useRef(stacks)
  useEffect(() => { stacksRef.current = stacks }, [stacks])

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
    const currentStack = stacksRef.current[activeStack]
    if (!currentStack) return
    const pkg = (active.data.current as { pkg: string }).pkg
    const name = autoName(pkg, currentStack.processes)
    const portOffset = assignPortOffset(pkg, currentStack.processes)
    const defaults = PKG_DEFAULTS[pkg as PalettePkg] ?? {}
    const updated: Stack = {
      ...currentStack,
      processes: { ...currentStack.processes, [name]: { pkg, port_offset: portOffset, ...defaults } },
    }
    saveStack(activeStack, updated)
  }, [activeStack, saveStack])

  const handleAddStack = (name: string, description: string, basePort: number) => {
    addStack(name, {
      description,
      base_port: basePort,
      processes: { tp1: { pkg: 'tp', port_offset: 10 } },
    })
  }

  if (stacksLoading || statusesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="flex items-center gap-3 text-[var(--text-dimmed)] text-sm">
          <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--primary)] rounded-full animate-spin" />
          {stacksLoading ? 'Loading stacks…' : 'Loading statuses…'}
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

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
                    <div key={name} className={`relative flex items-center ${dragOverTab === name && dragTab !== name ? 'before:absolute before:-left-1 before:top-0.5 before:bottom-0.5 before:w-0.5 before:rounded-full before:bg-blue-400' : ''}`}>
                    <button
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragTab(name) }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTab(name) }}
                      onDragLeave={() => setDragOverTab(null)}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragTab && dragTab !== name) {
                          const next = stackNames.filter(n => n !== dragTab)
                          next.splice(next.indexOf(name), 0, dragTab)
                          reorderStacks(next)
                        }
                        setDragTab(null); setDragOverTab(null)
                      }}
                      onDragEnd={() => { setDragTab(null); setDragOverTab(null) }}
                      onClick={() => { setActiveStack(name); setSelectedProc(null) }}
                      className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-grab active:cursor-grabbing
                        ${dragTab === name ? 'opacity-40' : ''}
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
                    </div>
                  ))}
                  {/* Trailing drop zone — allows dropping after the last tab */}
                  {dragTab && (
                    <div
                      className={`relative w-3 self-stretch ${dragOverTab === '__end__' ? 'before:absolute before:left-0 before:top-0.5 before:bottom-0.5 before:w-0.5 before:rounded-full before:bg-blue-400' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOverTab('__end__') }}
                      onDragLeave={() => setDragOverTab(null)}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragTab) reorderStacks([...stackNames.filter(n => n !== dragTab), dragTab])
                        setDragTab(null); setDragOverTab(null)
                      }}
                    />
                  )}
                </div>
              </div>
              <button onClick={() => setShowAdd(true)} title="Add stack"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-md)] cursor-pointer">
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
              {stackNames.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-[var(--text-dimmed)] text-sm">No stacks yet.</p>
                    <button onClick={() => setShowAdd(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-500/50 text-blue-400 text-sm hover:bg-blue-500/10 transition-colors">
                      <Plus size={13} /> Create a stack
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {viewMode === 'graph' && <ProcessPalette />}
                  {viewMode === 'graph' ? <StackCanvas /> : <ProcessTable key={activeStack} />}
                </>
              )}
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
          suggestedPort={Math.max(1024, ...Object.values(stacks).map(s => s.base_port)) + 1000}
          onAdd={handleAddStack}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showRename && (
        <RenameStackModal stackName={activeStack} existingNames={stackNames}
          hasRunningProcesses={Object.values(statuses[activeStack] ?? {}).some(s => s === 'running')}
          onRename={name => renameStack(activeStack, name)} onClose={() => setShowRename(false)} />
      )}
      {showClone && (
        <CloneStackModal sourceName={activeStack} existingNames={stackNames}
          suggestedPort={Math.max(1024, ...Object.values(stacks).map(s => s.base_port)) + 1000}
          onClone={(name, desc, port) => cloneStack(activeStack, name, desc, port)} onClose={() => setShowClone(false)} />
      )}
      {showDelete && (
        <DeleteStackModal stackName={activeStack}
          hasRunningProcesses={Object.values(statuses[activeStack] ?? {}).some(s => s === 'running' || s === 'busy')}
          onDelete={() => { deleteStack(activeStack); setShowDelete(false) }}
          onClose={() => setShowDelete(false)} />
      )}
    </DndContext>
  )
}
