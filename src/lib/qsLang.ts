/**
 * CodeMirror 6 stream languages for the backtest config files, mirroring the
 * VSCode `qs` TextMate grammar (source.qs): line comments, section headers,
 * and "invalid" unknown headers at column 0. Plus a small INI highlighter for
 * the run `.conf` / `.params` key=value files.
 *
 * Token strings ('comment', 'keyword', 'number', …) are the classic CodeMirror
 * names that StreamLanguage maps to @lezer/highlight tags, so the active theme
 * (oneDark in dark mode, default in light) colours them automatically.
 */

import { StreamLanguage } from '@codemirror/language'

// Section headers recognised by the qs DSL (superset of the VSCode grammar so
// params:/sizing:/exits: from current strategies highlight too).
const QS_SECTIONS = new Set([
  'params', 'vars', 'state', 'indicators', 'sizing',
  'enter', 'exits',
  'signal_exit', 'stop_loss', 'take_profit', 'time_stop',
  'trailing_stop', 'stale_exit', 'pnl_stop', 'pnl_trailing',
  'exit_policy', 'execution',
])

export const qsLanguage = StreamLanguage.define<Record<string, never>>({
  name: 'qs',
  startState: () => ({}),
  token(stream) {
    const atCol0 = stream.sol()
    if (stream.eatSpace()) return null
    if (stream.match(/#.*/)) return 'comment'

    // A word immediately followed by ':' is a header (section or label).
    const w = stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/) as RegExpMatchArray | null
    if (w) {
      if (QS_SECTIONS.has(w[0])) return 'keyword'
      return atCol0 ? 'invalid' : null   // unknown header at column 0 is illegal
    }

    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/)) return null   // identifiers / ta.sma
    if (stream.match(/^[=<>!+\-*/%,()[\]]/)) return 'operator'
    stream.next()
    return null
  },
})

interface ConfState { afterEq: boolean }

export const confLanguage = StreamLanguage.define<ConfState>({
  name: 'conf',
  startState: () => ({ afterEq: false }),
  copyState: s => ({ afterEq: s.afterEq }),
  token(stream, state) {
    if (stream.sol()) state.afterEq = false
    if (stream.eatSpace()) return null
    if (stream.match(/#.*/)) return 'comment'
    if (stream.match('=')) { state.afterEq = true; return 'operator' }
    if (!state.afterEq) {
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/)) return 'propertyName'
    } else {
      if (stream.match(/^[0-9][A-Za-z0-9_.:]*/)) return 'number'  // 10000, 2bps, 2026.02.01D00:00
      if (stream.match(/^[^#\s][^#]*/)) return 'string'           // qi.binance, next_open, BTC,SOL
    }
    stream.next()
    return null
  },
})
