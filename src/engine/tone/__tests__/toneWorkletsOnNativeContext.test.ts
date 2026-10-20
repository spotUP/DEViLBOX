/**
 * Live sweep 2026-10-20: PluckSynth (and every Tone worklet node: FeedbackCombFilter, BitCrusher, so Freeverb and
 * JCReverb too) loaded but stayed silent with no visible error. DEViLBOX hands Tone a native AudioContext, and Tone
 * builds worklet nodes through standardized-audio-context, which throws InvalidStateError for a context it did not
 * create. ToneEngine now installs nativeContextWorklets so Tone builds those nodes natively.
 * Real Tone and real processors on node-web-audio-api; the offline render opens no device.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, audioLoadsSettled } from '@/test/audio/realWebAudio';

let ToneNS: typeof import('tone');

beforeAll(async () => {
  installRealWebAudio();
  resolveWorkletsFromPublic();
  ToneNS = await import('tone');
  const { getToneEngine } = await import('../../ToneEngine');
  getToneEngine();
}, 60000);

describe('Tone worklet nodes on a native context, after ToneEngine boots', () => {
  it('a PluckSynth gets its comb-filter worklet and sounds', async () => {
    const SR = 48000;
    const offline = new OfflineAudioContext(1, SR, SR);
    const previous = ToneNS.getContext();
    ToneNS.setContext(offline);
    try {
      const pluck = new ToneNS.PluckSynth().toDestination();
      await audioLoadsSettled();
      const comb = (pluck as unknown as { _lfcf: { _combFilter: { _worklet?: unknown } } })._lfcf._combFilter;
      expect(comb._worklet).toBeInstanceOf(AudioWorkletNode);
      pluck.triggerAttack('C4', 0.05);
      const rendered = await offline.startRendering();
      const data = rendered.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      expect(peak).toBeGreaterThan(0.05);
    } finally {
      ToneNS.setContext(previous);
    }
  }, 30000);
});
