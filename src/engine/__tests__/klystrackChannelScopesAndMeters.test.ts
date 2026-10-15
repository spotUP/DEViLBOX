/**
 * KLYS-CONFORM (owner 2026-10-15, Ocean Loader III.kt): the klystrack channel scopes were dead and the channel VU
 * meters never moved.
 *
 * The worklet streamed no per-channel audio at all (no enableOsc, no oscData), and klys_get_channel_levels tested the
 * gate with `flags & 1` (CYD_CHN_ENABLE_GATE is 32), so every level read 0 while the song played (measured live: 72
 * chLevels reports in 1.5 s, all four channels 0, master RMS 0.44). Both now read cyd.c's per-channel tap.
 *
 * Driven with the real Klystrack worklet + WASM on the real song.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer, stereoOutputs, loadSharedWorkletScripts } from './workletHarness';
import { klysTransform } from '@/engine/klystrack/KlysEngine';

interface Msg { type?: string; channels?: Int16Array[] | number; levels?: Float32Array; frame?: number }

describe('klystrack channel scopes and meters', () => {
  it('Ocean Loader III.kt: every playing channel streams its own audio to the scopes and a non-zero level to the meters', { timeout: 120000 }, async () => {
    loadSharedWorkletScripts();
    const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
    await w.send({ type: 'loadSong', buffer: songBuffer('public/data/songs/klystrack/Ocean Loader III.kt') });
    const loaded = (w.posted as unknown as Msg[]).find((m) => m.type === 'songLoaded')!;
    const nch = loaded.channels as number;
    await w.send({ type: 'play' });
    await w.send({ type: 'enableOsc' });
    (w.posted as unknown[]).splice(0);

    const out = stereoOutputs(1);
    const scopePeak = new Array(nch).fill(0);
    const levelPeak = new Array(nch).fill(0);
    let mixPeak = 0;
    let scopeSamples = 0;
    let lastFrame = -1;
    for (let i = 0; i < 48000 * 4 / 128; i++) {
      w.proc.process([], out);
      for (let k = 0; k < 128; k++) mixPeak = Math.max(mixPeak, Math.abs(out[0][0][k]));
      for (const m of (w.posted as unknown as Msg[]).splice(0)) {
        if (m.type === 'oscData') {
          const chans = m.channels as Int16Array[];
          expect(chans.length, 'one stream per song channel').toBe(nch);
          expect(m.frame, 'contiguous chunks').toBe(lastFrame < 0 ? m.frame : lastFrame);
          lastFrame = m.frame! + chans[0].length;
          scopeSamples += chans[0].length;
          chans.forEach((c, ch) => { for (const s of c) scopePeak[ch] = Math.max(scopePeak[ch], Math.abs(s) / 32768); });
        } else if (m.type === 'chLevels') {
          Array.from(m.levels!).forEach((v, ch) => { levelPeak[ch] = Math.max(levelPeak[ch], v); });
        }
      }
    }

    expect(mixPeak, 'the song plays').toBeGreaterThan(0.05);
    expect(scopeSamples, 'the scopes get every sample rendered').toBeGreaterThan(48000 * 3);
    const soundingScopes = scopePeak.filter((p) => p > 0.01).length;
    const soundingMeters = levelPeak.filter((p) => p > 0.01).length;
    expect(soundingScopes, `channel scope peaks ${scopePeak.map((p) => p.toFixed(3))}`).toBeGreaterThanOrEqual(3);
    expect(soundingMeters, `channel meter peaks ${levelPeak.map((p) => p.toFixed(3))}`).toBeGreaterThanOrEqual(3);
    // The meters read the same audio the scopes show.
    for (let ch = 0; ch < nch; ch++) expect(levelPeak[ch] > 0.01).toBe(scopePeak[ch] > 0.01);
  });
});
