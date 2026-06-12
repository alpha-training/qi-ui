/**
 * Backtest config access — list runs, load a run's four config files
 * (run .conf, strategy logic.qs, params, universe), save edits, and trigger a
 * run. Everything is relayed through the hub to the qs engine, which holds the
 * .bt.RUNS / .bt.STRATS / .bt.UNIVERSES registries and re-reads configs from
 * disk on each `.bt.run`.
 */

import { relay, qstr } from './engine'

export interface RunRef {
  name: string
  path: string   // ":/abs/path.conf"
}

export interface ConfigFile {
  key: FileKey
  name: string   // display label (e.g. strategy name, file basename)
  path: string   // editable iff non-empty
  text: string   // newline-joined contents
}

export type FileKey = 'run' | 'logic' | 'params' | 'universe'

export interface RunConfig {
  run: ConfigFile
  logic: ConfigFile
  params: ConfigFile
  universe: ConfigFile & { inline: string } // inline non-empty => universe lives in the run file
}

// Resolves a run name to its four files (paths + line arrays). Validated against
// the live engine. Single q expression so it's one round trip.
const RESOLVER =
  '{[rn] rp:.bt.RUNS[rn]`path; rs:@[read0;rp;()];' +
  ' sline:$[count s:rs where rs like "strategy*";first s;""];' +
  ' spec:` vs `$trim $[count sline;last "=" vs sline;""]; strat:first spec; ver:$[1<count spec;last spec;`v1];' +
  ' lp:.bt.STRATS[strat]`path; ltext:@[read0;lp;()];' +
  ' pp:$[null lp;`;hsym`$ssr[1_string lp;"logic.qs";string[ver],".params"]]; ptext:@[read0;pp;()];' +
  ' uline:$[count u:rs where rs like "universe*";first u;""]; uval:trim $[count uline;last "=" vs uline;""];' +
  ' isfile:any uval like/:("*.txt";"*.csv"); up:$[isfile;.bt.UNIVERSES[`$first "." vs uval]`path;`]; utext:@[read0;up;()];' +
  ' `run`logic`params`universe!(' +
  '  `name`path`text!(string rn;1_string rp;rs);' +
  '  `name`path`text!(string strat;$[null lp;"";1_string lp];ltext);' +
  '  `name`path`text!($[null pp;"";string[ver],".params"];$[null pp;"";1_string pp];ptext);' +
  '  `name`path`text`inline!(uval;$[null up;"";1_string up];utext;$[isfile;"";uval])) }'

interface RawFile { name: string; path: string; text?: string[]; inline?: string }
interface RawConfig { run: RawFile; logic: RawFile; params: RawFile; universe: RawFile }

/** All runs, sorted by name. */
export async function listRuns(host: string, port: number): Promise<RunRef[]> {
  const r = await relay(host, port, '0!`name xasc .bt.RUNS') as Array<{ name: string; path: string }>
  return Array.isArray(r) ? r.map(x => ({ name: x.name, path: x.path })) : []
}

/** Load a run's four config files. */
export async function loadRunConfig(host: string, port: number, runName: string): Promise<RunConfig> {
  const r = await relay(host, port, `${RESOLVER} (\`$${qstr(runName)})`) as RawConfig
  const f = (key: FileKey, o: RawFile): ConfigFile =>
    ({ key, name: o.name ?? '', path: o.path ?? '', text: (o.text ?? []).join('\n') })
  return {
    run: f('run', r.run),
    logic: f('logic', r.logic),
    params: f('params', r.params),
    universe: { ...f('universe', r.universe), inline: r.universe.inline ?? '' },
  }
}

/** Overwrite a file on disk (via the engine's filesystem). */
export async function saveFile(host: string, port: number, path: string, text: string): Promise<void> {
  const lines = text.split('\n')
  const body = lines.length === 1 ? `enlist ${qstr(lines[0])}` : `(${lines.map(qstr).join(';')})`
  await relay(host, port, `(hsym\`$${qstr(path)}) 0: ${body}; \`saved`)
}

/** Run a backtest by name. Re-reads configs from disk and repopulates
 *  Info/Stats/Trades/Equity/.bt.DPV on the engine. Generous timeout. */
export async function runBacktest(host: string, port: number, runName: string): Promise<void> {
  await relay(host, port, `.bt.run (\`$${qstr(runName)}); \`done`, 180000)
}
