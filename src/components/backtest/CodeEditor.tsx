import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { qsLanguage, confLanguage } from '../../lib/qsLang'

export type EditorKind = 'qs' | 'conf' | 'plain'

interface Props {
  value: string
  onChange: (text: string) => void
  kind: EditorKind
  theme: 'dark' | 'light'
}

const baseTheme = (dark: boolean) => EditorView.theme({
  '&': { background: 'transparent', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: '1.6' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: dark ? '#4b5563' : '#94a3b8' },
  '.cm-content': { padding: '8px 0' },
  '.cm-focused': { outline: 'none' },
}, { dark })

function langExt(kind: EditorKind): Extension[] {
  if (kind === 'qs') return [qsLanguage]
  if (kind === 'conf') return [confLanguage]
  return []
}

export default function CodeEditor({ value, onChange, kind, theme }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const programmatic = useRef(false)
  const valueRef = useRef(value)

  // Keep latest props in refs. Declared first so it runs before the create
  // effect on mount, giving it the current value/onChange without re-creating
  // the editor on every keystroke.
  useEffect(() => { onChangeRef.current = onChange; valueRef.current = value })

  // (Re)create the editor when the file type or theme changes.
  useEffect(() => {
    if (!ref.current) return
    viewRef.current?.destroy()

    const updateListener = EditorView.updateListener.of(u => {
      if (!u.docChanged || programmatic.current) return
      onChangeRef.current(u.state.doc.toString())
    })

    const extensions: Extension[] = [
      basicSetup,
      ...langExt(kind),
      baseTheme(theme === 'dark'),
      ...(theme === 'dark' ? [oneDark] : []),
      updateListener,
    ]
    viewRef.current = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions }),
      parent: ref.current,
    })
    return () => { viewRef.current?.destroy(); viewRef.current = null }
  }, [kind, theme])

  // Sync external value changes (switching files, reload, save) into the doc.
  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    const cur = v.state.doc.toString()
    if (cur === value) return
    programmatic.current = true
    v.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    programmatic.current = false
  }, [value])

  return <div ref={ref} className="h-full w-full overflow-auto" />
}
