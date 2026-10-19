/**
 * Owner 2026-10-20: "modular synth: many dead notes". A ModularVoice stayed busy for a fixed 2 s after its note off,
 * so on a one-voice patch (the default) every note played within 2 s of the previous release found no free voice
 * and nothing to steal, and was dropped. Released voices are now free at once.
 * Real Web Audio on a never-rendered offline context (no device is opened).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { setDevilboxAudioContext } from '@/utils/audio-context';

beforeAll(() => {
  installRealWebAudio();
  setDevilboxAudioContext(new OfflineAudioContext(2, 48000, 48000) as unknown as AudioContext);
});

describe('ModularSynth voice allocation', () => {
  it('a one-voice patch plays every note of a fast line, and a repeated note retriggers', async () => {
    const { ModularSynth } = await import('../ModularSynth');
    const { ModularVoice } = await import('../ModularVoice');
    const { MODULAR_INIT_PATCH } = await import('@/constants/modularPresets');
    expect(MODULAR_INIT_PATCH.polyphony ?? 1).toBe(1);
    const noteOn = vi.spyOn(ModularVoice.prototype, 'noteOn');
    const synth = new ModularSynth(structuredClone(MODULAR_INIT_PATCH));
    const notes = [60, 62, 64, 64, 65];
    notes.forEach((n, i) => {
      synth.triggerAttack(n, i * 0.25);
      synth.triggerRelease(n, i * 0.25 + 0.2);
    });
    expect(noteOn.mock.calls.map((c) => c[0])).toEqual(notes);
    // Held notes on one voice: the newest steals it.
    synth.triggerAttack(67, 2);
    synth.triggerAttack(69, 2.1);
    expect(noteOn.mock.calls.slice(-2).map((c) => c[0])).toEqual([67, 69]);
    noteOn.mockRestore();
    synth.dispose();
  });
});
