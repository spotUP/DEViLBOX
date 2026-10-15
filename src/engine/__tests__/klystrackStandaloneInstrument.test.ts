/**
 * A standalone klystrack instrument (owned by the project, not by a klystrack song) sounds with NO song loaded:
 * the real Klystrack worklet + WASM make the empty song on the first key, audition the engine's preview copy of the
 * instrument value, report its voice under the preview index, and let a real song replace the empty one.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { klysTransform, packKlysInstrument, type KlysChannelVoice } from '@/engine/klystrack/KlysEngine';
import { klysInstrumentToEngine } from '@/engine/klystrack/klysSongData';
import { KLYS_PREVIEW_INSTRUMENT_INDEX } from '@/engine/klystrack/klysInstrumentFields';
import { klysInitInstrument } from '@constants/klysPresets';

type Worklet = Awaited<ReturnType<typeof startWorklet>>;
interface Msg { type?: string; channels?: KlysChannelVoice[] }

const packed = (volume: number): ArrayBuffer => {
  const inst = { ...klysInitInstrument(), volume };
  return packKlysInstrument(klysInstrumentToEngine(inst)).buffer as ArrayBuffer;
};

/** RMS of `blocks` render blocks of 128 frames. */
function rms(w: Worklet, blocks: number): number {
  const out = stereoOutputs(1);
  let sum = 0;
  let n = 0;
  for (let b = 0; b < blocks; b++) {
    w.proc.process([], out);
    for (const v of out[0][0]) { sum += v * v; n++; }
  }
  return Math.sqrt(sum / n);
}

describe('standalone klystrack instrument in the worklet', () => {
  it('sounds with no song loaded, and a changed instrument value changes what is heard', { timeout: 120_000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    expect((w.proc as { songLoaded?: boolean }).songLoaded, 'no song yet').toBe(false);

    await w.send({ type: 'setPreviewInstrument', data: packed(128) });
    await w.send({ type: 'previewNoteOnData', note: 48 });
    expect((w.proc as { songLoaded?: boolean }).songLoaded, 'the empty song was made for the audition').toBe(true);
    expect(rms(w, 100)).toBeGreaterThan(0.01);

    await w.send({ type: 'previewNoteOff' });
    rms(w, 400);
    await w.send({ type: 'setPreviewInstrument', data: packed(0) });
    await w.send({ type: 'previewNoteOnData', note: 48 });
    expect(rms(w, 100), 'volume 0 is silent').toBeLessThan(0.0005);
  });

  it('reports the voice under the preview index, and a real song replaces the empty one', { timeout: 120_000 }, async () => {
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w.send({ type: 'watchVoices', on: true });
    await w.send({ type: 'setPreviewInstrument', data: packed(128) });
    await w.send({ type: 'previewNoteOnData', note: 48 });
    rms(w, 400);
    const voices = (w.posted as unknown as Msg[]).filter((m) => m.type === 'voiceStatus');
    const ch31 = voices[voices.length - 1].channels!.find((c) => c.channel === 31)!;
    expect(ch31.instrument).toBe(KLYS_PREVIEW_INSTRUMENT_INDEX);
    expect(ch31.active).toBe(true);
    expect((w.posted as unknown as Msg[]).some((m) => m.type === 'position'), 'the empty song posts no position').toBe(false);

    await w.send({ type: 'loadSong', buffer: songBuffer('public/data/songs/klystrack/Ocean Loader III.kt') });
    expect((w.proc as { hiddenSong?: boolean }).hiddenSong).toBe(false);
    const loaded = (w.posted as unknown as Array<{ type?: string; numInstruments?: number }>).filter((m) => m.type === 'songLoaded');
    expect(loaded[loaded.length - 1].numInstruments, 'the real song is the loaded one').toBeGreaterThan(1);
    // The standalone instrument still keys inside a real song.
    await w.send({ type: 'previewNoteOnData', note: 48 });
    expect(rms(w, 100)).toBeGreaterThan(0.005);
  });
});
