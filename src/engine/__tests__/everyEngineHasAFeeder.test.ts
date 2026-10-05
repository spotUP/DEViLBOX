/**
 * RATCHET — every dedicated engine in WASM_ENGINES is reachable from import.
 *
 * A descriptor starts its engine only when the song carries the descriptor's
 * fileDataKey (and, for a descriptor with a `formats` gate, when song.format
 * is one of the gate's values). Several engines were built, registered and
 * never heard: Actionamics, Digital Sound Studio, Ron Klaren, Face The Music
 * — no parser ever set their file data — and PumaTracker, Eupmini and
 * Cpsycle, whose parsers carry the data but set format 'MOD', which their
 * gate refuses. This test reads the import sources and fails when a
 * descriptor has no file that sets its fileDataKey, or when a gated
 * descriptor's feeders never set one of its gate formats.
 *
 * KNOWN_UNREACHED is the documented debt. It may only shrink: an entry that
 * becomes reachable fails the second test until it is removed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WASM_ENGINES } from '../replayer/NativeEngineRouting';

const ROOT = join(__dirname, '../../..');
/** Where songs are built: the parsers and the file loader that hands songs to the store. */
const IMPORT_DIRS = [join(ROOT, 'src/lib/import'), join(ROOT, 'src/lib/file')];

/** Engines that import cannot reach today, each with the reason. */
const KNOWN_UNREACHED: Record<string, string> = {
  // Gate/format mismatch: the parser carries the file data but sets format
  // 'MOD'; the gate wants its own name. Fix level is an open routing decision.
  PumaTracker: "PumaTrackerParser sets format 'MOD', gate is ['PumaTracker']",
  Eupmini: "EupminiParser sets format 'MOD', gate is ['EUP'] (isEupFormat also rejects real .eup files)",
  Cpsycle: "CpsycleParser sets format 'MOD', gate is ['Psycle']",
  // No feeder.
  RonKlarenReplayer: 'ronklaren.c has no rk_set_cell: switching off UADE would make grid edits inaudible (UADE gets them via chip RAM)',
  FaceTheMusicReplayer: '.ftm imports through libopenmpt; the FTM worklet passes setCell args in the wrong order for ftm_set_cell',
  FredEditorReplayer: 'superseded for songs by FredReplayer2 (fredReplayerFileData); nothing creates FredEditorReplayerSynth either',
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__') out.push(...sources(p)); continue; }
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function unreached(): Map<string, string> {
  const files = IMPORT_DIRS.flatMap(sources).map((p) => ({ p: relative(ROOT, p), s: readFileSync(p, 'utf8') }));
  const result = new Map<string, string>();
  for (const d of WASM_ENGINES) {
    const sets = new RegExp(`\\b${String(d.fileDataKey)}\\s*(:|=[^=])`);
    const feeders = files.filter((f) => sets.test(f.s));
    if (feeders.length === 0) { result.set(d.key, 'no import source sets ' + String(d.fileDataKey)); continue; }
    if (d.formats) {
      const gate = d.formats.map((f) => new RegExp(`\\bformat\\b[^\\n]*['"]${f}['"]`));
      if (!feeders.some((f) => gate.some((g) => g.test(f.s)))) {
        result.set(d.key, `feeders (${feeders.map((f) => f.p).join(', ')}) never set format ${JSON.stringify(d.formats)}`);
      }
    }
  }
  return result;
}

describe('every dedicated engine is reachable from import', () => {
  const found = unreached();

  it('has a feeder that satisfies its gate, or a documented reason', () => {
    const undocumented = [...found].filter(([key]) => !(key in KNOWN_UNREACHED)).map(([k, why]) => `${k}: ${why}`);
    expect(undocumented, 'engines no import path can start').toEqual([]);
  });

  it('documents no engine that is in fact reachable (the list only shrinks)', () => {
    const stale = Object.keys(KNOWN_UNREACHED).filter((key) => !found.has(key));
    expect(stale, 'reachable now: remove from KNOWN_UNREACHED').toEqual([]);
  });
});
