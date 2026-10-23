/**
 * I180d: TrackerReplayer.seekToMs puts the replayer on the speed and BPM in force at the target row, not the ones
 * it held at the start of the song.
 */
import { describe, it, expect } from 'vitest';
import { TrackerReplayer } from '@/engine/TrackerReplayer';
import { useTransportStore } from '@/stores/useTransportStore';
import type { TrackerCell } from '@/types/tracker';

const empty = { effTyp: 0, eff: 0 } as unknown as TrackerCell;
const cell = (effTyp: number, eff: number) => ({ effTyp, eff }) as unknown as TrackerCell;
const pattern = {
  id: 'p', name: 'p', length: 8,
  channels: [{ rows: Array.from({ length: 8 }, (_, r) => (r === 1 ? cell(0xF, 3) : r === 2 ? cell(0xF, 150) : empty)) }],
};

describe('TrackerReplayer.seekToMs', () => {
  it('restores speed 3 and BPM 150 set by Fxx on rows before the target', () => {
    const r = Object.create(TrackerReplayer.prototype) as Record<string, unknown>;
    r.song = { initialSpeed: 6, initialBPM: 125, songLength: 1, songPositions: [0], patterns: [pattern] };
    const context: { speed?: number; bpm?: number } = {};
    r.coordinator = { context };
    r._speed = 6; r._bpm = 125; r.useXMPeriods = false;
    let seekedTo: [number, number] | null = null;
    r.seekTo = (songPos: number, pattPos: number) => { seekedTo = [songPos, pattPos]; };
    // Row 0 120 ms (6 ticks at 125), row 1 sets speed 3 (60 ms), row 2 sets tempo 150 (50 ms): row 4 starts at 280 ms.
    const at = (r as unknown as TrackerReplayer).seekToMs(300);
    expect(at).toEqual({ songPos: 0, pattPos: 4 });
    expect(seekedTo).toEqual([0, 4]);
    expect(r._speed).toBe(3);
    expect(r._bpm).toBe(150);
    expect(context).toEqual({ speed: 3, bpm: 150 });
    expect(useTransportStore.getState().speed).toBe(3);
    expect(useTransportStore.getState().bpm).toBe(150);
  });
});
