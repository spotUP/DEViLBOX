/**
 * Sawteeth test song builder: takes the bytes of public/data/songs/sawteeth/okolaNUKE.st (never altered) and, through the
 * product parser, returns a TrackerSong that adds
 *   - every part-step effect the reference replayer implements (sawteeth-wasm/src/sawteeth.c, effect switch: high nibble
 *     1 2 3 4 5 7 8 9 A B C; 0 6 D E F fall through `default: break`), placed on notes that already exist, and
 *   - three extra instruments so every waveform (0..7), filter mode (0..6) and clip mode (0..2) occurs in the song,
 *     each used on existing notes.
 * A part step that several grid rows play (one stored part at several positions) is edited in all of them
 * (`sawteethGridSource` from the parser). scripts/generate-sawteeth-test-song.ts exports the result through SawteethExporter.
 */
import { parseSawteethFile } from './SawteethParser';
import { ST_FX_BASE } from './commandStreamEffectGlyphs';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { SawteethInstrumentConfig } from '@/types/instrument/exotic';

export const SAWTEETH_TEST_SONG_NAME = 'TEST all effects okolaNUKE';

/** Effect high nibbles the replayer implements (sawteeth.c effect switch), with the meaning there. */
export const SAWTEETH_IMPLEMENTED_EFFECTS: ReadonlyArray<{ nibble: number; meaning: string }> = [
  { nibble: 0x1, meaning: 'pitch slide up' },
  { nibble: 0x2, meaning: 'pitch slide down' },
  { nibble: 0x3, meaning: 'portamento to the note' },
  { nibble: 0x4, meaning: 'PWM offset' },
  { nibble: 0x5, meaning: 'resonance' },
  { nibble: 0x7, meaning: 'filter cutoff down' },
  { nibble: 0x8, meaning: 'filter cutoff up' },
  { nibble: 0x9, meaning: 'filter cutoff set' },
  { nibble: 0xa, meaning: 'amp fade down' },
  { nibble: 0xb, meaning: 'amp fade up' },
  { nibble: 0xc, meaning: 'amp set' },
];

/** Nibbles the original song already uses (counted from the file): 9 and C. */
const ALREADY_IN_SONG = new Set([0x9, 0xc]);

interface GridSource { partIdx: number; row: number }
type SongWithSources = TrackerSong & { sawteethGridSource: Array<Array<GridSource | null>> };

interface ExtraInstrument { name: string; filterMode: number; clipMode: number; wForms: number[] }

/** Added instruments: the types the original lacks (waveforms 0 5 6 7, filters SLP LP BS). Cloned from instrument 1, only the type fields change. */
const EXTRA_INSTRUMENTS: ExtraInstrument[] = [
  { name: 'TEST waveforms sine and triangle unsigned, filter SLP', filterMode: 1, clipMode: 0, wForms: [5, 6] },
  { name: 'TEST waveform sine unsigned then hold, filter LP', filterMode: 3, clipMode: 0, wForms: [7, 0] },
  { name: 'TEST filter BS, hard clip', filterMode: 6, clipMode: 1, wForms: [1, 1] },
];

export function buildSawteethEffectTestSong(original: Uint8Array): TrackerSong {
  const song = parseSawteethFile(original, 'okolaNUKE.st') as SongWithSources | null;
  if (!song) throw new Error('okolaNUKE.st did not parse');
  song.name = SAWTEETH_TEST_SONG_NAME;
  const source = song.sawteethGridSource;

  // ── Instruments ────────────────────────────────────────────────────────
  const first = song.instruments[0];
  const cfg = first.sawteeth;
  if (!cfg) throw new Error('no Sawteeth config on instrument 1');
  const base = cfg.instruments[0];
  const firstExtraId = cfg.instruments.length + 1;
  for (const extra of EXTRA_INSTRUMENTS) {
    const ins: SawteethInstrumentConfig = {
      ...base,
      ampEnv: base.ampEnv.map((p) => ({ ...p })),
      filterEnv: base.filterEnv.map((p) => ({ ...p })),
      filterMode: extra.filterMode,
      clipMode: extra.clipMode,
      len: extra.wForms.length,
      loop: 0,
      steps: extra.wForms.map((wForm, i) => ({ ...(base.steps[i] ?? base.steps[0]), wForm })),
    };
    cfg.instruments.push(ins);
    cfg.instrumentNames.push(extra.name);
    song.instruments.push({ ...first, id: cfg.instruments.length, name: extra.name } as InstrumentConfig);
  }

  // ── Grid addressing ────────────────────────────────────────────────────
  const rowAt = (ch: number, flat: number): TrackerCell => {
    let rest = flat;
    for (const p of song.patterns) {
      if (rest < p.length) return p.channels[ch].rows[rest];
      rest -= p.length;
    }
    throw new Error(`flat row ${flat} outside the song`);
  };
  const totalRows = song.patterns.reduce((n, p) => n + p.length, 0);
  const sameStep = (ch: number, a: GridSource): TrackerCell[] => {
    const out: TrackerCell[] = [];
    for (let r = 0; r < totalRows; r++) {
      const s = source[ch][r];
      if (s && s.partIdx === a.partIdx && s.row === a.row) out.push(rowAt(ch, r));
    }
    return out;
  };

  const channels = song.numChannels;
  const taken = new Set<string>();
  // candidate rows: a stored step that triggers an instrument on a note with no effect yet
  const candidates = (ch: number): number[] => {
    const out: number[] = [];
    for (let r = 0; r < totalRows; r++) {
      const s = source[ch][r];
      const c = s ? rowAt(ch, r) : null;
      if (s && c && c.note > 0 && c.instrument > 0 && c.effTyp === 0) out.push(r);
    }
    return out;
  };
  const pick = (ch: number, slot: number, slots: number): { ch: number; r: number } => {
    const cand = candidates(ch).filter((r) => {
      const s = source[ch][r]!;
      return !taken.has(`${ch}:${s.partIdx}:${s.row}`);
    });
    if (cand.length === 0) throw new Error(`no free note on channel ${ch}`);
    const r = cand[Math.floor((cand.length * (slot + 0.5)) / slots)];
    const s = source[ch][r]!;
    taken.add(`${ch}:${s.partIdx}:${s.row}`);
    return { ch, r };
  };

  // ── Effects ────────────────────────────────────────────────────────────
  const wanted = SAWTEETH_IMPLEMENTED_EFFECTS.filter((e) => !ALREADY_IN_SONG.has(e.nibble));
  const perChannel = Math.ceil(wanted.length / channels);
  wanted.forEach((e, k) => {
    const ch = k % channels;
    const { r } = pick(ch, Math.floor(k / channels), perChannel + 1);
    for (const cell of sameStep(ch, source[ch][r]!)) {
      cell.effTyp = ST_FX_BASE + e.nibble;
      cell.eff = 4; // a mid-range value: audible without clipping into the 0 and 15 limits
    }
  });

  // ── Instruments on notes ───────────────────────────────────────────────
  EXTRA_INSTRUMENTS.forEach((_, k) => {
    const ch = (k + 1) % channels;
    const { r } = pick(ch, 0, 1 + EXTRA_INSTRUMENTS.length);
    for (const cell of sameStep(ch, source[ch][r]!)) cell.instrument = firstExtraId + k;
  });

  return song;
}
