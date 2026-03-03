import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { Pencil, Trash2 } from 'lucide-react'
import { useControl } from '../../context/ControlContext'

const editorTheme = EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: '#4b5563' },
  '.cm-content': { padding: '4px 0 8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark: true })

export default function JsonPanel() {
  const { stacks, activeStack, selectedProc, setSelectedProc, saveStack, updateStackLocal, jsonStatus, setJsonStatus } = useControl()
  const editorRef         = useRef<HTMLDivElement>(null)
  const viewRef           = useRef<EditorView | null>(null)
  const isProgrammaticRef = useRef(false)   // suppress listener during programmatic updates
  const lastSyncedJsonRef = useRef('')      // last json we pushed into the editor
  const [error, setError]         = useState<string | null>(null)
  const [isDirty, setIsDirty]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName]   = useState('')

  const stack = stacks[activeStack]

  const initialJson = selectedProc && stack?.processes[selectedProc]
    ? JSON.stringify(stack.processes[selectedProc], null, 2)
    : stack
      ? JSON.stringify(stack, null, 2)
      : ''

  const editorKey = `${activeStack}::${selectedProc ?? '__stack__'}`
  const editorKeyRef = useRef('')

  useEffect(() => {
    if (!editorRef.current) return
    if (editorKeyRef.current === editorKey) return
    editorKeyRef.current = editorKey
    viewRef.current?.destroy()
    setEditingName(false)

    const updateListener = EditorView.updateListener.of(update => {
      if (!update.docChanged) return
      if (isProgrammaticRef.current) return
      const text = update.state.doc.toString()
      setIsDirty(true)
      try {
        const parsed = JSON.parse(text)
        setError(null)
        setJsonStatus('unsaved')
        if (selectedProc) {
          updateStackLocal(activeStack, { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } })
        } else {
          updateStackLocal(activeStack, parsed)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
        setJsonStatus('invalid')
      }
    })

    const state = EditorState.create({
      doc: initialJson,
      extensions: [basicSetup, json(), oneDark, editorTheme, updateListener],
    })
    viewRef.current = new EditorView({ state, parent: editorRef.current })
    lastSyncedJsonRef.current = initialJson
    setError(null)
    setIsDirty(false)
    setJsonStatus('valid')

    return () => {
      viewRef.current?.destroy()
      editorKeyRef.current = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey])

  // Sync editor when stack is modified externally (e.g. drag-drop adds a process)
  // Only runs when the user isn't actively editing (isDirty = false)
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
    setEditingName(false)
    if (!trimmed || trimmed === selectedProc || !selectedProc || !stack) return
    const procs = { ...stack.processes }
    procs[trimmed] = procs[selectedProc]
    delete procs[selectedProc]
    saveStack(activeStack, { ...stack, processes: procs })
    setSelectedProc(trimmed)
  }, [editName, selectedProc, stack, activeStack, saveStack, setSelectedProc])

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
      setSaving(true)
      if (selectedProc) {
        await saveStack(activeStack, { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } })
      } else {
        await saveStack(activeStack, parsed)
      }
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
    setIsDirty(false)
    setJsonStatus('valid')
  }, [initialJson, activeStack, stack, stacks, updateStackLocal, setJsonStatus])

  return (
    <div className="w-80 shrink-0 flex flex-col bg-[#0a1628] border-l border-white/10"
      style={{ height: '100%', overflow: 'hidden' }}>

      {/* Process name bar — editable name + delete */}
      {selectedProc && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                onBlur={commitRename}
                className="flex-1 min-w-0 bg-white/5 border border-blue-500/50 rounded px-2 py-0.5
                  text-sm text-white outline-none font-medium"
              />
            ) : (
              <>
                <span className="text-sm font-medium text-white truncate">{selectedProc}</span>
                <button
                  onClick={() => { setEditName(selectedProc); setEditingName(true) }}
                  className="text-zinc-400 hover:text-white transition-colors shrink-0"
                  title="Rename process"
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleDeleteProc}
            className="text-zinc-400 hover:text-red-400 transition-colors shrink-0"
            title="Delete process"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="shrink-0 px-5 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300 font-mono break-all">
          {error}
        </div>
      )}

      {/* Editor */}
      <div ref={editorRef} className="flex-1 min-h-0 overflow-auto" />

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-white/10">
        <button onClick={handleCancel} disabled={!isDirty}
          className="px-5 py-2 rounded-lg text-sm font-medium border border-white/20 text-zinc-300
            hover:border-white/40 hover:text-white transition-all
            disabled:opacity-30 disabled:cursor-not-allowed">
          Cancel
        </button>
        <button onClick={handleSave} disabled={jsonStatus === 'invalid' || saving}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium border transition-all
            ${jsonStatus === 'invalid' || saving
              ? 'border-white/10 text-zinc-500 cursor-not-allowed'
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
  )
}
