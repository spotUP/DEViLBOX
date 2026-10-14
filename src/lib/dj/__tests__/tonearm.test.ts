import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tonearmProgress } from '../tonearm';

const trackerDeckB = { playbackMode: 'tracker' as const, durationMs: 0, songPos: 10, totalPositions: 40 };

describe('Deck B tonearm follows song position', () => {
  it('a tracker deck (no stored duration) shows its place in the order list, not a 180 s guess', () => {
    expect(tonearmProgress(trackerDeckB, 100)).toBeCloseTo(0.25);
    expect(tonearmProgress({ ...trackerDeckB, songPos: 20 }, 400)).toBeCloseTo(0.5);
  });
  it('an audio deck shows heard position over duration', () => {
    const audio = { playbackMode: 'audio' as const, durationMs: 200000, songPos: 0, totalPositions: 0 };
    expect(tonearmProgress(audio, 50)).toBeCloseTo(0.25);
    expect(tonearmProgress(audio, 999)).toBe(1);
  });
  it('an empty deck rests at the outer groove', () => {
    expect(tonearmProgress({ playbackMode: 'tracker', durationMs: 0, songPos: 0, totalPositions: 0 }, 30)).toBe(0);
  });
  it('the CSS turntable and the 3D view both take the arm from tonearmProgress', () => {
    const dir = resolve(__dirname, '../../../components/dj');
    for (const f of ['DeckCssTurntable.tsx', 'DeckVinyl3DView.tsx']) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      expect(src).toMatch(/tonearmProgress\(/);
      expect(src).not.toMatch(/: 180;/);
    }
  });
});
