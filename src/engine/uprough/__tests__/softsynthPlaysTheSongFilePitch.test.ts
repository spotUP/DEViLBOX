/**
 * Reachability of the note convention: a cell of a real song file, imported through the song-file loader
 * (parseSongFile -> songFileToSong -> tracker cell + instrument) and played the way the replayer plays a synth note
 * (xmNoteToNoteName -> ToneEngine.triggerNote), must sound at the frequency the Up Rough host gives the same cell.
 *
 * The host (Up_Rough_Demo_System/tools/song_file.py) writes notes with C-4 = MIDI 48:
 *   bass808 cell = note_name(36 + semi) and trap808 semi 0 = C1 = 32.703 Hz, so "A-3" = 55.0 Hz;
 *   melody cell = note_name(midi) and the piano plays hz(midi) = 440 * 2^((midi - 69) / 12), so "A-3" = 110 Hz;
 *   drum cell = DRUM_NOTE "C-4", played untransposed, so a "C-4" kick is the reference kick sample for sample.
 * DEViLBOX names the same text C-4 = MIDI 60; before the boundary conversion the 808 played "A-3" at 220 Hz.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { InstrumentConfig } from '@typedefs/instrument';
import { parseSongFile, songFileToSong } from '@/lib/uprough/songFile';
import e6 from '@/lib/uprough/__tests__/fixtures/e6.uprough-song.json';
import { xmNoteToNoteName } from '@/engine/replayer/PeriodTables';
import { SOFTSYNTH_RATE, voiceDefaults } from '../softsynthVoice';
import { getSoftsynthVoice } from '../voiceRegistry';
import { resetSoftsynthRenderCount, softsynthRenderCount } from '../UpRoughSoftsynth';
import drumFixture from './fixtures/drums.json';

type Engine = {
  ensureInstrumentReady: (c: InstrumentConfig) => Promise<void>;
  getInstrument: (id: number, c: InstrumentConfig, ch?: number) => { output: { context: Record<string, unknown> } };
  triggerNote: (id: number, note: string, dur: number, time: number, vel: number, c: InstrumentConfig) => void;
};
let engine: Engine;

beforeAll(async () => {
  installRealWebAudio();
  await import('@/engine/registry/sdk');
  const { getToneEngine } = await import('../../ToneEngine');
  engine = getToneEngine() as unknown as Engine;
  (engine as unknown as { isContextActuallyRunning: () => boolean }).isContextActuallyRunning = () => true;
}, 60000);

const cfg = (id: number, voice: string, params: Record<string, number> = {}, seed = 0): InstrumentConfig => ({
  id, name: 'softsynth', type: 'synth', synthType: 'UpRoughSoftsynth', effects: [], volume: -6, pan: 0,
  upRoughSoftsynth: { voice, params: { ...voiceDefaults(getSoftsynthVoice(voice)!), ...params }, seed },
} as unknown as InstrumentConfig);

const song = songFileToSong(parseSongFile(JSON.stringify(e6)));

/** The first imported cell of `lane` in section `sec` whose file text is `text` (any text when omitted). */
function importedCell(sec: string, lane: string, text?: string): { note: number; instrument: InstrumentConfig; text: string } {
  const doc = e6 as unknown as { sections: { id: string; lanes: Record<string, ([string, number, number, unknown] | null)[]> }[] };
  const fileCells = doc.sections.find((s) => s.id === sec)!.lanes[lane]!;
  const row = fileCells.findIndex((c) => c !== null && (text === undefined || c[0] === text));
  expect(row, `${sec}/${lane} has a ${text ?? 'note'} cell`).toBeGreaterThanOrEqual(0);
  const cell = song.patterns.find((p) => p.id === sec)!.channels.find((c) => c.id === lane)!.rows[row]!;
  const instrument = song.instruments.find((i) => i.id === cell.instrument)!;
  return { note: cell.note, instrument, text: fileCells[row]![0] };
}

/** Host note number of a cell text (song_file.py note_midi: C-4 = 48). */
function hostMidi(text: string): number {
  const names = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  return Number(text[2]) * 12 + names.indexOf(text.slice(0, 2));
}

/** Play one imported tracker note through the tracker entry point; return the buffer the synth started. */
async function playCell(config: InstrumentConfig, trackerNote: number, dur: number): Promise<Float32Array> {
  await engine.ensureInstrumentReady(config);
  const ctx = engine.getInstrument(config.id, config).output.context as unknown as {
    createBufferSource: () => AudioBufferSourceNode; currentTime: number;
  };
  const captured: AudioBuffer[] = [];
  const orig = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => {
    const src = orig();
    const start = src.start.bind(src);
    src.start = (...a: Parameters<AudioBufferSourceNode['start']>) => { if (src.buffer) captured.push(src.buffer); start(...a); };
    return src;
  };
  try {
    engine.triggerNote(config.id, xmNoteToNoteName(trackerNote), dur, ctx.currentTime + 0.01, 1, config);
  } finally {
    ctx.createBufferSource = orig;
  }
  expect(captured.length, 'the synth started a buffer').toBe(1);
  return Float32Array.from(captured[0]!.getChannelData(0));
}

/** Fundamental of x[from..to) by autocorrelation: the shortest lag within 10% of the best peak (no octave slips). */
function fundamentalHz(x: Float32Array, fromSec: number, toSec: number, loHz = 25, hiHz = 1000): number {
  const a = Math.round(fromSec * SOFTSYNTH_RATE), b = Math.round(toSec * SOFTSYNTH_RATE);
  const seg = x.subarray(a, b);
  let mean = 0;
  for (const v of seg) mean += v;
  mean /= seg.length;
  const minLag = Math.floor(SOFTSYNTH_RATE / hiHz), maxLag = Math.ceil(SOFTSYNTH_RATE / loHz);
  const r: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < seg.length; i++) s += (seg[i]! - mean) * (seg[i + lag]! - mean);
    r.push(s / (seg.length - lag));
  }
  const best = Math.max(...r);
  for (let k = 1; k < r.length - 1; k++) {
    if (r[k]! >= 0.9 * best && r[k]! >= r[k - 1]! && r[k]! >= r[k + 1]!) return SOFTSYNTH_RATE / (k + minLag);
  }
  return NaN;
}

describe('a song-file cell plays at the host pitch through the tracker', () => {
  it('bass808: imported bass cell "A-3" (host semi 9) sounds at 55 Hz +-3% once the attack pitch drop has settled', async () => {
    const cell = importedCell('verse_0', 'bass', 'A-3');
    expect(cell.instrument.upRoughSoftsynth?.voice).toBe('bass808');
    resetSoftsynthRenderCount();
    const buf = await playCell({ ...cell.instrument, id: 960 }, cell.note, 0.9);
    expect(softsynthRenderCount(), 'the voice rendered').toBe(1);
    const hz = fundamentalHz(buf, 0.25, 0.75);
    console.log(`[pitch] bass808 "A-3" measured ${hz.toFixed(2)} Hz (host 55.00)`);
    expect(Math.abs(hz / 55.0 - 1), `808 "A-3" measured ${hz.toFixed(2)} Hz`).toBeLessThan(0.03);
  });

  it('piano (melody lane): an imported melody cell sounds at the host hz(midi) +-3%', async () => {
    const cell = importedCell('hook_1', 'melody1');
    expect(cell.instrument.upRoughSoftsynth?.voice).toBe('piano');
    const want = 440 * 2 ** ((hostMidi(cell.text) - 69) / 12);
    const buf = await playCell({ ...cell.instrument, id: 961 }, cell.note, 0.9);
    const hz = fundamentalHz(buf, 0.05, 0.3, 25, 2000);
    console.log(`[pitch] piano "${cell.text}" measured ${hz.toFixed(2)} Hz (host ${want.toFixed(2)})`);
    expect(Math.abs(hz / want - 1), `piano "${cell.text}" measured ${hz.toFixed(2)} Hz`).toBeLessThan(0.03);
  });

  it('kick (drum lane): cell "C-4" (the host DRUM_NOTE) is the untransposed reference kick, sample for sample', async () => {
    const c = drumFixture.cases[0]!;
    expect(c.voice).toBe('kick');
    const cell = importedCell('verse_0', 'kick', 'C-4');
    expect(cell.instrument.upRoughSoftsynth?.voice).toBe('kick');
    const buf = await playCell(cfg(962, 'kick', c.params as unknown as Record<string, number>, c.seed), cell.note, 0.5);
    let worst = 0;
    c.samples.forEach((ref: number, k: number) => { worst = Math.max(worst, Math.abs(buf[k * drumFixture.keep]! - ref)); });
    expect(worst, 'float32 buffer vs float64 reference').toBeLessThan(1e-6);
  });
});
