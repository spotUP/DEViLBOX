/**
 * detectBPM reported the tick tempo as the musical BPM (dj-juggling plan C7,
 * P1.3): a module at speed 3 / tempo 125 plays 250 beats a minute (4 rows a
 * beat) but showed 125 in every browser, the playlist and the deck. The
 * speed (Fxx < 0x20) was scanned into an unused parameter.
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { detectBPM } from '../DJBeatDetector';

const empty = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function song(fx: Record<number, Array<[number, number]>>, opts: { speed?: number; bpm?: number } = {}): TrackerSong {
  const channels = [0, 1].map((ch) => ({
    id: `c${ch}`, name: `c${ch}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: 1, color: null,
    rows: Array.from({ length: 64 }, (_, r) => {
      const c = empty();
      const e = fx[r]?.[ch];
      if (e) { c.effTyp = e[0]; c.eff = e[1]; }
      return c;
    }),
  }));
  const pattern = { id: 'p', name: 'p', length: 64, channels } as unknown as Pattern;
  return {
    name: 's', format: 'MOD', patterns: [pattern], instruments: [], songPositions: [0, 0], songLength: 2,
    restartPosition: 0, numChannels: 2, initialSpeed: opts.speed ?? 6, initialBPM: opts.bpm ?? 125,
  } as unknown as TrackerSong;
}

describe('detectBPM returns the musical BPM, speed included', () => {
  it('a song with F03 + F7D reports 250, not 125', () => {
    const r = detectBPM(song({ 0: [[0x0f, 0x03], [0x0f, 0x7d]] }));
    expect(r.bpm).toBe(250);
    expect(r.confidence).toBe('exact');
  });

  it('a song at speed 12 / tempo 125 from its header reports 62.5', () => {
    expect(detectBPM(song({}, { speed: 12 })).bpm).toBe(62.5);
  });

  it('a plain speed 6 / tempo 125 song still reports 125', () => {
    const r = detectBPM(song({}));
    expect(r.bpm).toBe(125);
    expect(r.confidence).toBe('default');
  });

  it('a set-tempo F8C at speed 6 reports 140', () => {
    expect(detectBPM(song({ 0: [[0x0f, 0x8c]] })).bpm).toBe(140);
  });
});
