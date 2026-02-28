/**
 * JsonPanel — uses CodeMirror 6 for syntax highlighting.
 *
 * Install deps:
 *   npm i @codemirror/view @codemirror/state @codemirror/lang-json
 *         @codemirror/theme-one-dark codemirror
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { useControl } from '../../context/ControlContext'

const editorTheme = EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: '#0d1117', border: 'none', color: '#4b5563' },
  '.cm-content': { padding: '0 0 8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark: true })

export default function JsonPanel() {
  const { stacks, activeStack, selectedProc, saveStack } = useControl()
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const stack = stacks[activeStack]

  const initialJson = selectedProc && stack?.processes[selectedProc]
    ? JSON.stringify(stack.processes[selectedProc], null, 2)
    : stack
      ? JSON.stringify(stack, null, 2)
      : ''

  // (Re)create editor when stack/selection changes
  useEffect(() => {
    if (!editorRef.current) return
    viewRef.current?.destroy()

    const updateListener = EditorView.updateListener.of(update => {
      if (!update.docChanged) return
      const text = update.state.doc.toString()
      setIsDirty(true)
      try {
        JSON.parse(text)
        setError(null)
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

    return () => viewRef.current?.destroy()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStack, selectedProc])

  const handleSave = useCallback(async () => {
    const text = viewRef.current?.state.doc.toString() ?? ''
    try {
      const parsed = JSON.parse(text)
      if (selectedProc) {
        const updated = { ...stack, processes: { ...stack.processes, [selectedProc]: parsed } }
        await saveStack(activeStack, updated)
      } else {
        await saveStack(activeStack, parsed)
      }
      setIsDirty(false)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [activeStack, selectedProc, stack, saveStack])

  const handleCancel = useCallback(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: initialJson },
    })
    setError(null)
    setIsDirty(false)
  }, [initialJson])

  const isValid = !error

  return (
    <div className="w-72 shrink-0 bg-[#0d1117] border-l border-white/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-white">JSON Config</span>
        <span className={`flex items-center gap-1.5 text-xs font-medium
          ${isValid ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isValid ? 'bg-green-400' : 'bg-red-400'}`} />
          {isValid ? 'Valid' : 'Error'}
        </span>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300 font-mono truncate">
          {error}
        </div>
      )}

      {/* Context label */}
      {selectedProc && (
        <div className="px-4 py-2 border-b border-white/10 text-xs text-zinc-500">
          Showing: <span className="text-blue-400 font-medium">{selectedProc}</span>
        </div>
      )}

      {/* Editor */}
      <div ref={editorRef} className="flex-1 overflow-auto" />

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 flex gap-2 justify-end">
        <button onClick={handleCancel}
          className="px-4 py-1.5 rounded text-xs text-zinc-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={!!error}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium transition-colors
            ${error ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          <span>💾</span> Save
        </button>
      </div>
    </div>
  )
}