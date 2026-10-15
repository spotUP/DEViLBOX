import { describe, it, expect } from 'vitest';
import { envelopeMarkerX, filterMarkerX, lfoMarkerX } from '../klysCurveMarkers';
import { adsrEnvelope, filterStageCornerHz } from '../klysCurveModels';
import { buildKlystrackLayout } from '@/constants/synthLayouts/klystrack';
import type { KlysVoiceMarker } from '@/engine/klystrack/klysVoiceStatus';

const SR = 48000;
const voice = (over: Partial<KlysVoiceMarker>): KlysVoiceMarker => ({
  channel: 31, stage: 'attack', elapsedSeconds: 0, level: 0, cutoff: 1000, resonance: 0, pulseWidth: 0, ...over,
});

describe('klystrack curve markers', () => {
  it('the envelope marker moves forward through attack, decay, sustain and release', () => {
    const [a, d, s, r] = [30, 30, 16, 30];
    const env = adsrEnvelope(a, d, s, r, SR);
    const x = (stage: KlysVoiceMarker['stage'], level: number) => envelopeMarkerX(a, d, s, r, SR, voice({ stage, level }));
    const attack = x('attack', 0.3);
    const decay = x('decay', 0.7);
    const sustain = x('sustain', 0.5);
    const release = x('release', 0.2);
    expect(attack).toBeLessThan(env.attackSeconds + 1e-6);
    expect(decay).toBeGreaterThanOrEqual(env.attackSeconds - 1e-6);
    expect(attack).toBeLessThan(decay);
    expect(decay).toBeLessThanOrEqual(sustain);
    expect(sustain).toBeLessThan(release);
    expect(release).toBeLessThanOrEqual(env.totalSeconds + env.releaseSeconds + 1e-6);
  });

  it('a falling release level moves the marker later on the release curve', () => {
    const at = (level: number) => envelopeMarkerX(30, 30, 16, 30, SR, voice({ stage: 'release', level }));
    expect(at(0.1)).toBeGreaterThan(at(0.4));
  });

  it('the filter marker is the effective cutoff as a frequency, and absent when the filter is off', () => {
    expect(filterMarkerX(true, voice({ cutoff: 800 }), SR)).toBe(filterStageCornerHz(800, SR));
    expect(filterMarkerX(true, voice({ cutoff: 1800 }), SR)!).toBeGreaterThan(filterMarkerX(true, voice({ cutoff: 400 }), SR)!);
    expect(filterMarkerX(false, voice({ cutoff: 800 }), SR)).toBeNull();
  });

  it('the LFO marker advances with the note and wraps over the two drawn cycles; a speed of 0 draws none', () => {
    const x = (t: number) => lfoMarkerX(16, voice({ elapsedSeconds: t }), 50)!;
    expect(x(0)).toBe(0);
    expect(x(1)).toBeGreaterThan(x(0.2));
    expect(x(1000)).toBeGreaterThanOrEqual(0);
    expect(x(1000)).toBeLessThan(1);
    expect(lfoMarkerX(0, voice({}), 50)).toBeNull();
  });

  it('through the layout: a live voice report moves each curve marker, and they follow the knobs', () => {
    const listeners = new Set<(v: KlysVoiceMarker | null) => void>();
    const emit = (v: KlysVoiceMarker | null): void => listeners.forEach((l) => l(v));
    let unsubscribed = 0;
    const layout = buildKlystrackLayout([], {
      sampleRate: SR,
      voice: { subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); unsubscribed++; }; } },
    });
    const marker = (section: string) => layout.sections!.find((s) => s.label === section)!.curves![0].marker!;
    const values: Record<string, number> = { cydflags_512: 1, attack: 30, decay: 30, sustain: 16, release: 30, vibratoSpeed: 16, pwmSpeed: 16 };
    const get = (k: string) => values[k] ?? 0;
    const seen: Record<string, (number | null)[]> = {};
    const off = ['Volume', 'Filter', 'Vibrato', 'Pulse Width Modulation'].map((label) => {
      seen[label] = [];
      return marker(label).subscribe((x) => seen[label].push(x), () => get);
    });
    emit(voice({ stage: 'decay', level: 0.7, elapsedSeconds: 0.2, cutoff: 900 }));
    for (const label of Object.keys(seen)) expect(seen[label].at(-1), label).not.toBeNull();
    emit(null);
    for (const label of Object.keys(seen)) expect(seen[label].at(-1), `${label} clears with the voice`).toBeNull();
    off.forEach((o) => o());
    expect(unsubscribed).toBe(4);
  });
});
