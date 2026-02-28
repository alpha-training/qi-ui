import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { useControl } from '../../context/ControlContext'

const editorTheme = EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: '#4b5563' },
  '.cm-content': { padding: '4px 0 8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark: true })

export default function JsonPanel() {
  const { stacks, activeStack, selectedProc, saveStack, updateStackLocal } = useControl()
  const editorRef  = useRef<HTMLDivElement>(null)
  const viewRef    = useRef<EditorView | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving]   = useState(false)

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

    const updateListener = EditorView.updateListener.of(update => {
      if (!update.docChanged) return
      const text = update.state.doc.toString()
      setIsDirty(true)
      try {
        const parsed = JSON.parse(text)
        setError(null)
        if (selectedProc) {
          updateStackLocal(activeStack, { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } })
        } else {
          updateStackLocal(activeStack, parsed)
        }
      } catch (e: any) {
        setError(e.message)
      }
    })

    const state = EditorState.create({
      doc: initialJson,
      extensions: [basicSetup, json(), oneDark, editorTheme, updateListener],
    })
    viewRef.current = new EditorView({ state, parent: editorRef.current })
    setError(null)
    setIsDirty(false)

    return () => {
      viewRef.current?.destroy()
      editorKeyRef.current = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey])

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
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [activeStack, selectedProc, stack, saveStack])

  const handleCancel = useCallback(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: initialJson },
    })
    if (stack) updateStackLocal(activeStack, stacks[activeStack])
    setError(null)
    setIsDirty(false)
  }, [initialJson, activeStack, stack, stacks, updateStackLocal])

  const isValid = !error

  return (
    // Outer: fixed width, full height, flex col — never scrolls as a whole
    <div className="w-80 shrink-0 flex flex-col bg-[#0a1628] border-l border-white/10"
      style={{ height: '100%', overflow: 'hidden' }}>

      {/* ── Header — pinned ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10">
        <span className="text-base font-bold text-white">JSON Config</span>
        <span className={`flex items-center gap-2 text-sm font-medium ${isValid ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2 h-2 rounded-full ${isValid
            ? 'bg-green-400 shadow-[0_0_6px_#4ade80]'
            : 'bg-red-400 shadow-[0_0_6px_#f87171]'}`} />
          {isValid ? 'Valid' : 'Error'}
        </span>
      </div>

      {/* ── Error bar — pinned when visible ───────────────────────── */}
      {error && (
        <div className="shrink-0 px-5 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300 font-mono break-all">
          {error}
        </div>
      )}

      {/* ── Context label — pinned when visible ───────────────────── */}
      {selectedProc && (
        <div className="shrink-0 px-5 py-2 border-b border-white/10 text-xs text-zinc-500">
          Showing: <span className="text-blue-400 font-medium">{selectedProc}</span>
        </div>
      )}

      {/* ── Editor — the ONLY scrollable region ───────────────────── */}
      <div ref={editorRef} className="flex-1 min-h-0 overflow-auto" />

      {/* ── Footer — always pinned at bottom ──────────────────────── */}
      <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-white/10">
        <button
          onClick={handleCancel}
          disabled={!isDirty}
          className="px-5 py-2 rounded-xl text-sm font-semibold border border-white/20 text-zinc-300
            hover:border-white/40 hover:text-white transition-all
            disabled:opacity-30 disabled:cursor-not-allowed">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!!error || saving}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all
            ${error || saving
              ? 'border-white/10 text-zinc-500 cursor-not-allowed'
              : 'border-blue-500 text-blue-400 hover:bg-blue-500/10'}`}>
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