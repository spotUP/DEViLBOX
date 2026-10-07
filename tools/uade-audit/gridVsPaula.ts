#!/usr/bin/env npx tsx
/**
 * gridVsPaula.ts — does the parsed grid say what the player plays?
 *
 * For an "Incorrect Pattern Data" verdict the ear is the wrong instrument:
 * the question is whether the native parser's grid matches the notes the
 * emulated player actually writes to Paula. This renders the file through
 * UADE with the Paula write log on, turns AUDxPER writes into a note-event
 * sequence per voice, takes the grid's note sequence per channel from the
 * registry's own parser (`detectFormatFromContent` + `nativeParser`), and
 * scores the two as the longest common subsequence of their INTERVAL
 * sequences (note-to-note semitone steps), so a parser that shows the right
 * tune an octave off, or in another base, still scores high while a parser
 * that shows carrier bytes as notes scores near zero.
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/uade-audit/gridVsPaula.ts <file> [<file> ...] [--secs N]
 *
 * Paula is read to the song's end (UADE, looping off); --secs N caps it.
 *
 * The UADE import's scan grid (a UADE-only format, or a native parser that
 * falls back to it) needs the worklet. Dump that grid's note sequence per
 * channel to JSON ({ "<basename>": number[][] }) and pass it with
 * --grid-json FILE; a file named there is scored against that grid instead
 * of its native parser's.
 *
 * Output per file: channels, grid events, Paula events, score 0..1 per
 * channel pairing (best assignment of grid channels to voices), and the first
 * 16 intervals of each so a mismatch can be read. The 2026-10-05
 * broken-formats sweep (sweep 2) uses it on the owner's verdicts.
 *
 * OTHER AUDIT SCRIPTS: see the header of tools/playback-smoke-test.ts.
 */
import { readFileSync, readdirSync } from 'fs';
import { basename, dirname, join } from 'path';
import { listingFromRelativePaths, resolveCompanions } from '../../src/lib/import/companionResolver';
import { paulaNotes, intervals, score, type LogModule, type PaulaNotes } from './gridVsPaulaCore';
import { detectFormatFromContent } from '../../src/lib/import/FormatRegistry';
import { loadUADEModule } from './uadeRenderCore';

const args = process.argv.slice(2);
const secsIdx = args.indexOf('--secs');
// The grid holds the whole song, so Paula is read to the song's end by
// default; --secs caps it. (Before 2026-10-05 the render loop added
// uade_wasm_render's return value - 1, not a frame count - to its clock, so
// every run read the whole song whatever --secs said.)
const SECS = secsIdx >= 0 ? Number(args[secsIdx + 1]) : 900;
const gridJsonIdx = args.indexOf('--grid-json');
const GRID_JSON: Record<string, number[][]> = gridJsonIdx >= 0 ? JSON.parse(readFileSync(args[gridJsonIdx + 1], 'utf8')) : {};
const optionValues = new Set([secsIdx, gridJsonIdx].filter((i) => i >= 0).map((i) => i + 1));
const files = args.filter((a, i) => !a.startsWith('--') && !optionValues.has(i));

/** The grid's note sequence per channel, in song order. */
async function gridNotes(data: Uint8Array, name: string, dir: string): Promise<{ format: string; notes: number[][] } | null> {
  if (GRID_JSON[name]) return { format: 'grid-json', notes: GRID_JSON[name] };
  const fmt = detectFormatFromContent(name, data.subarray(0, 128));
  if (!fmt?.nativeParser) return null;
  const modPath = fmt.nativeParser.module.replace('@lib/', `${process.cwd()}/src/lib/`);
  const m = await import(modPath);
  const parse = m[fmt.nativeParser.parseFn];
  if (typeof parse !== 'function') return null;
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  // A parser whose grid needs the companion files (registry companionsArg)
  // gets the ones the app would load beside the module.
  const companions = fmt.nativeParser.companionsArg
    ? new Map(resolveCompanions(name, listingFromRelativePaths(readdirSync(dir))).companions.map((c) => {
      const b = readFileSync(join(dir, c));
      return [c, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)] as const;
    }))
    : undefined;
  const song = await parse(buf, name, companions);
  if (!song?.patterns) return null;
  const order: number[] = song.songPositions?.length ? song.songPositions : song.patterns.map((_: unknown, i: number) => i);
  const notes: number[][] = Array.from({ length: song.numChannels ?? song.patterns[0].channels.length }, () => []);
  const last = notes.map(() => 0);
  for (const p of order) {
    const pat = song.patterns[p]; if (!pat) continue;
    pat.channels.forEach((c: { rows: { note: number }[] }, ch: number) => {
      for (const r of c.rows) if (r.note > 0 && r.note < 97) { notes[ch].push(r.note); last[ch] = r.note; }
    });
  }
  return { format: fmt.key, notes };
}

(async () => {
  const mod = (await loadUADEModule(false)) as LogModule;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('uade init failed');
  for (const f of files) {
    const data = new Uint8Array(readFileSync(f));
    const name = basename(f);
    let grid: Awaited<ReturnType<typeof gridNotes>> = null;
    try { grid = await gridNotes(data, name, dirname(f)); } catch (e) { console.log(`${name}: parser threw: ${String((e as Error).message).slice(0, 100)}`); continue; }
    if (!grid) { console.log(`${name}: no native parser / no grid`); continue; }
    let paula: PaulaNotes;
    try { paula = await paulaNotes(mod, data, name, dirname(f), SECS); } catch (e) { console.log(`${name}: ${(e as Error).message}`); continue; }
    const voices = paula.loose.map((v, i) => `${v.length}(${paula.strict[i].length})`);
    console.log(`${name} [${grid.format}]: grid channels=${grid.notes.length} events=${grid.notes.map((c) => c.length).join('/')}; paula voices events=${voices.join('/')} (strict in brackets)`);
    for (let ch = 0; ch < grid.notes.length; ch++) {
      const g = grid.notes[ch];
      let best = 0, bestV = -1, bestSeq: number[] = [], bestRead = '';
      for (let v = 0; v < 4; v++) {
        for (const [read, seq] of [['loose', paula.loose[v]], ['strict', paula.strict[v]]] as const) {
          // The score normalises by the shorter sequence, so a strict reading
          // that caught only a handful of bursts would fit any grid; it only
          // counts when it holds at least half as many notes as the grid.
          if (read === 'strict' && seq.length * 2 < g.length) continue;
          const s = score(g, seq);
          if (s > best) { best = s; bestV = v; bestSeq = seq; bestRead = read; }
        }
      }
      const show = (s: number[]) => intervals(s).slice(0, 16).join(',');
      console.log(`  ch${ch}: best voice ${bestV} score ${best.toFixed(2)}${bestRead ? ` (${bestRead})` : ''}  grid[${show(g)}]  paula[${show(bestSeq)}]`);
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* a refused load leaves the core in a state cleanup traps on */ }
})();
