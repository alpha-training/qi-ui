import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { Pencil, Trash2, AlertTriangle, Lock } from 'lucide-react'
import { useControl } from '../../context/ControlContext'
import { useTheme } from '../../context/ThemeContext'

const editorThemeDark = EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: '#4b5563' },
  '.cm-content': { padding: '4px 0 8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark: true })

const editorThemeLight = EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: '#94a3b8' },
  '.cm-content': { padding: '4px 0 8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark: false })

interface UnsavedNav {
  label: string
  save: () => Promise<void>
  discard: () => void
}

export default function JsonPanel() {
  const { stacks, statuses, activeStack, selectedProc, setSelectedProc, saveStack, updateStackLocal, jsonStatus, setJsonStatus } = useControl()

  const stackStatuses = statuses[activeStack] ?? {}
  const procIsRunning = selectedProc
    ? (stackStatuses[selectedProc] === 'running' || stackStatuses[selectedProc] === 'busy')
    : false
  const anyRunning = Object.values(stackStatuses).some(s => s === 'running' || s === 'busy')
  // Lock the editor: process view → locked if that proc is running
  //                  stack view   → locked if any proc is running
  const isLocked = selectedProc ? procIsRunning : anyRunning
  const lockMsg  = selectedProc
    ? 'Stop this process to edit'
    : 'Stop all processes to edit'
  const { theme } = useTheme()
  const editorRef         = useRef<HTMLDivElement>(null)
  const viewRef           = useRef<EditorView | null>(null)
  const readOnlyCompartment = useRef(new Compartment())
  const isProgrammaticRef = useRef(false)
  const lastSyncedJsonRef = useRef('')
  const isDirtyRef             = useRef(false)          // always-current mirror of isDirty
  const stacksRef              = useRef(stacks)         // always-current mirror of stacks
  const updateStackLocalRef    = useRef(updateStackLocal) // always-current mirror of updateStackLocal
  const [error, setError]         = useState<string | null>(null)
  const [isDirty, setIsDirty]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName]   = useState('')
  const [unsavedNav, setUnsavedNav] = useState<UnsavedNav | null>(null)

  // Keep refs current on every render so effects always read fresh values
  stacksRef.current = stacks
  updateStackLocalRef.current = updateStackLocal

  const stack = stacks[activeStack]

  const initialJson = selectedProc && stack?.processes[selectedProc]
    ? JSON.stringify(stack.processes[selectedProc], null, 2)
    : stack
      ? JSON.stringify(stack, null, 2)
      : ''

  const editorKey = `${activeStack}::${selectedProc ?? '__stack__'}::${theme}`
  const editorKeyRef = useRef('')

  useEffect(() => {
    if (!editorRef.current) return
    if (editorKeyRef.current === editorKey && viewRef.current !== null) return

    // If the user has unsaved changes, capture a save closure before switching.
    // Use refs — isDirty and stacks are stale in this effect's closure.
    if (isDirtyRef.current && editorKeyRef.current && viewRef.current) {
      const parts = editorKeyRef.current.split('::')
      const oldStackName = parts[0]
      const oldProcName  = parts[1] === '__stack__' ? null : parts[1]
      const oldText      = viewRef.current.state.doc.toString()
      const oldStack     = stacksRef.current[oldStackName]

      if (oldStack) {
        try {
          const parsed = JSON.parse(oldText)
          const label  = oldProcName ?? `"${oldStackName}"`
          // Capture the clean JSON (before edits) so Discard can revert local state.
          // lastSyncedJsonRef is only updated while !isDirty, so it holds the pre-edit value.
          const cleanJson = lastSyncedJsonRef.current
          setUnsavedNav({
            label,
            save: async () => {
              if (oldProcName) {
                await saveStack(oldStackName, {
                  ...oldStack,
                  processes: { ...oldStack.processes, [oldProcName]: parsed },
                })
              } else {
                const bp = parsed.base_port
                if (typeof bp !== 'number' || !Number.isInteger(bp) || bp < 1024 || bp > 65535)
                  throw new Error('base_port must be an integer between 1024 and 65535')
                await saveStack(oldStackName, parsed)
              }
            },
            discard: () => {
              try {
                const reverted = JSON.parse(cleanJson)
                if (oldProcName) {
                  const currentOldStack = stacksRef.current[oldStackName]
                  updateStackLocalRef.current(oldStackName, {
                    ...currentOldStack,
                    processes: { ...currentOldStack.processes, [oldProcName]: reverted },
                  })
                } else {
                  updateStackLocalRef.current(oldStackName, reverted)
                }
              } catch { /* ignore */ }
            },
          })
        } catch {
          // Invalid JSON — silently discard (user already saw the error bar)
        }
      }
    }

    editorKeyRef.current = editorKey
    viewRef.current?.destroy()
    setEditingName(false)

    const updateListener = EditorView.updateListener.of(update => {
      if (!update.docChanged) return
      if (isProgrammaticRef.current) return
      const text = update.state.doc.toString()
      isDirtyRef.current = true
      setIsDirty(true)
      try {
        const parsed = JSON.parse(text)
        setError(null)
        setJsonStatus('unsaved')
        if (selectedProc && stack) {
          updateStackLocal(activeStack, { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } })
        } else if (!selectedProc) {
          updateStackLocal(activeStack, parsed)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
        setJsonStatus('invalid')
      }
    })

    const extensions = theme === 'dark'
      ? [basicSetup, json(), oneDark, editorThemeDark, updateListener, readOnlyCompartment.current.of(EditorState.readOnly.of(isLocked))]
      : [basicSetup, json(), editorThemeLight, updateListener, readOnlyCompartment.current.of(EditorState.readOnly.of(isLocked))]

    const state = EditorState.create({ doc: initialJson, extensions })
    viewRef.current = new EditorView({ state, parent: editorRef.current })
    lastSyncedJsonRef.current = initialJson
    setError(null)
    isDirtyRef.current = false
    setIsDirty(false)
    setJsonStatus('valid')

    return () => {
      // Do NOT destroy or null viewRef here — the next effect run reads isDirtyRef
      // and viewRef before destroying the old view (unsaved-changes detection).
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey])

  // Toggle read-only dynamically when lock state changes
  useEffect(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(isLocked)),
    })
  }, [isLocked])

  // Sync editor when stack is modified externally (e.g. drag-drop adds a process)
  useEffect(() => {
    if (!viewRef.current || isDirty) return
    if (lastSyncedJsonRef.current === initialJson) return
    lastSyncedJsonRef.current = initialJson
    isProgrammaticRef.current = true
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: initialJson },
    })
    isProgrammaticRef.current = false
  }, [initialJson, isDirty])

  const commitRename = useCallback(() => {
    const trimmed = editName.trim()
    if (!trimmed || !selectedProc || !stack) { setEditingName(false); return }
    if (trimmed === selectedProc) { setEditingName(false); return }
    if (stack.processes[trimmed]) {
      setError(`Process name "${trimmed}" already exists in this stack`)
      return  // keep editing open
    }
    setEditingName(false)
    const procs = { ...stack.processes }
    procs[trimmed] = procs[selectedProc]
    delete procs[selectedProc]
    saveStack(activeStack, { ...stack, processes: procs })
    setSelectedProc(trimmed)
  }, [editName, selectedProc, stack, activeStack, saveStack, setSelectedProc, setError])

  const handleDeleteProc = useCallback(() => {
    if (!selectedProc || !stack) return
    const procs = { ...stack.processes }
    delete procs[selectedProc]
    saveStack(activeStack, { ...stack, processes: procs })
    setSelectedProc(null)
  }, [selectedProc, stack, activeStack, saveStack, setSelectedProc])

  const handleSave = useCallback(async () => {
    const text = viewRef.current?.state.doc.toString() ?? ''
    try {
      const parsed = JSON.parse(text)
      if (selectedProc) {
        const po = parsed.port_offset
        if (typeof po !== 'number' || !Number.isInteger(po) || po < 0)
          throw new Error('port_offset must be a non-negative integer')
        const conflict = Object.entries(stack.processes)
          .find(([n, p]) => n !== selectedProc && p.port_offset === po)
        if (conflict) throw new Error(`port_offset ${po} is already used by "${conflict[0]}"`)
      } else {
        const bp = parsed.base_port
        if (typeof bp !== 'number' || !Number.isInteger(bp) || bp < 1024 || bp > 65535)
          throw new Error('base_port must be an integer between 1024 and 65535')
        const offsets = Object.entries(parsed.processes ?? {}) as [string, { port_offset: number }][]
        const seen = new Map<number, string>()
        for (const [name, proc] of offsets) {
          const po = proc.port_offset
          if (typeof po !== 'number' || !Number.isInteger(po) || po < 0)
            throw new Error(`port_offset for "${name}" must be a non-negative integer`)
          if (seen.has(po)) throw new Error(`port_offset ${po} is used by both "${seen.get(po)}" and "${name}"`)
          seen.set(po, name)
        }
      }
      setSaving(true)
      if (selectedProc) {
        await saveStack(activeStack, { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } })
      } else {
        await saveStack(activeStack, parsed)
      }
      isDirtyRef.current = false
      setIsDirty(false)
      setError(null)
      setJsonStatus('valid')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setJsonStatus('invalid')
    } finally {
      setSaving(false)
    }
  }, [activeStack, selectedProc, stack, saveStack, setJsonStatus])

  const handleCancel = useCallback(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: initialJson },
    })
    if (stack) updateStackLocal(activeStack, stacks[activeStack])
    setError(null)
    isDirtyRef.current = false
    setIsDirty(false)
    setJsonStatus('valid')
  }, [initialJson, activeStack, stack, stacks, updateStackLocal, setJsonStatus])

  return (
    <>
      {/* ── Unsaved-changes dialog ───────────────────────────────── */}
      {unsavedNav && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-80 bg-[var(--bg-modal)] border border-[var(--border)] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <h3 className="font-bold text-base text-[var(--text-primary)]">Unsaved changes</h3>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">
              Changes to{' '}
              <span className="font-semibold text-[var(--text-primary)]">{unsavedNav.label}</span>
              {' '}haven't been saved. Do you want to save them?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { unsavedNav.discard(); setUnsavedNav(null) }}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border-btn)]
                  text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-btn-hover)] transition-all">
                Discard
              </button>
              <button
                onClick={async () => {
                  try { await unsavedNav.save() } catch { /* ignore */ }
                  setUnsavedNav(null)
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel ───────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col bg-[var(--bg-panel)] border-l border-[var(--border)]"
        style={{ height: '100%', overflow: 'hidden' }}>

        {/* Process name bar */}
        {selectedProc && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {editingName && !isLocked ? (
                <input
                  autoFocus
                  value={editName}
                  onFocus={e => { const len = e.target.value.length; e.target.setSelectionRange(len, len) }}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  onBlur={commitRename}
                  className="flex-1 min-w-0 bg-[var(--bg-hover-md)] border border-blue-500/50 rounded px-2 py-0.5
                    text-sm text-[var(--text-primary)] outline-none font-medium"
                />
              ) : (
                <>
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">{selectedProc}</span>
                  <button
                    onClick={() => { if (!isLocked) { setEditName(selectedProc); setEditingName(true) } }}
                    disabled={isLocked}
                    className={`transition-colors shrink-0 ${isLocked ? 'text-[var(--text-faint)] cursor-not-allowed' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    title={isLocked ? 'Stop process to rename' : 'Rename process'}
                  >
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
            <button
              onClick={!isLocked ? handleDeleteProc : undefined}
              disabled={isLocked}
              className={`transition-colors shrink-0 ${isLocked ? 'text-[var(--text-faint)] cursor-not-allowed' : 'text-[var(--text-muted)] hover:text-red-400'}`}
              title={isLocked ? 'Stop process to delete' : 'Delete process'}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Lock banner */}
        {isLocked && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-900/25 border-b border-amber-800/40">
            <Lock size={12} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300">{lockMsg}</span>
          </div>
        )}

        {/* Error bar */}
        {error && (
          <div className="shrink-0 px-5 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300 font-mono break-all">
            {error}
          </div>
        )}

        {/* Editor */}
        <div className={`flex-1 min-h-0 overflow-auto transition-opacity ${isLocked ? 'opacity-50 [&_.cm-content]:!cursor-default [&_.cm-cursor]:!opacity-0' : ''}`}>
          <div ref={editorRef} className="h-full" />
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)]">
          <button onClick={handleCancel} disabled={!isDirty || isLocked}
            className="px-5 py-2 rounded-lg text-sm font-medium border border-[var(--border-btn)] text-[var(--text-secondary)]
              hover:border-[var(--border-btn-hover)] hover:text-[var(--text-primary)] transition-all
              disabled:opacity-30 disabled:cursor-not-allowed">
            Cancel
          </button>
          <button onClick={handleSave} disabled={jsonStatus === 'invalid' || saving || isLocked}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium border transition-all
              ${jsonStatus === 'invalid' || saving || isLocked
                ? 'border-[var(--border)] text-[var(--text-dimmed)] cursor-not-allowed'
                : 'border-[#3b82f6] text-[#3b82f6] hover:bg-[#3b82f6]/10'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
