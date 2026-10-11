/**
 * detectBPM and the module grid report the song's musical BPM (dj-juggling
 * plan C7, P1.3). The tick tempo alone is not the BPM, and neither is
 * 6 * tempo / speed: that assumes 4 rows a beat, and at speed 3 composers
 * put a beat every 8 rows. "ultraux vision" (speed 3 / tempo 141) showed 272
 * on the deck after 272983a45; the owner hears ~136-141. Rows per beat come
 * from the song: the 24-ticks-a-beat convention, corrected by the drums'
 * backbeat when they clearly sit on half or double that.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types/tracker';
import { detectBPM } from '../DJBeatDetector';
import { moduleBeatGrid } from '../autodj/moduleBeatGrid';
import { timeOrderPositions } from '../autodj/trackerMixAnalysis';
import { corpusTrackerSong } from '../autodj/testing/corpus';

const empty = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** The corpus module (drums on channel 0) with its tempo, a first-row effect and an optional drum pattern. */
function song(opts: { speed?: number; bpm?: number; fx?: Array<[number, number]>; drums?: (r: number) => TrackerCell | null } = {}): TrackerSong {
  const base = corpusTrackerSong();
  const patterns = base.patterns.map((p) => ({
    ...p,
    channels: p.channels.map((ch, c) => ({
      ...ch,
      rows: ch.rows.map((cell, r) => {
        let out = cell;
        if (c === 0 && opts.drums && cell.note > 0) out = opts.drums(r) ?? empty();
        else if (c === 0 && opts.drums) out = opts.drums(r) ?? cell;
        if (r === 0 && c === 5 && opts.fx) { out = { ...out }; const [a, b] = opts.fx; if (a) { out.effTyp = a[0]; out.eff = a[1]; } if (b) { out.effTyp2 = b[0]; out.eff2 = b[1]; } }
        return out;
      }),
    })),
  }));
  return { ...base, patterns, initialSpeed: opts.speed ?? 6, initialBPM: opts.bpm ?? 125 } as TrackerSong;
}

describe('detectBPM returns the musical BPM from the song\'s own beat', () => {
  it('ultraux vision (speed 3 / tempo 141, a beat every 8 rows) is 141, not 282', async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures/ultraux-vision.mod'));
    const s = await parseModuleToSong(new File([bytes], 'ultraux vision.mod'));
    const r = detectBPM(s);
    expect(r.bpm).toBe(141);
    expect(r.confidence).toBe('exact');
    // The module grid reads the same number: one tempo per track.
    const { positions } = timeOrderPositions(s);
    const g = moduleBeatGrid(s, positions[positions.length - 1].end)!;
    expect(g.bpm).toBe(141);
    expect(g.rowsPerBeat).toBe(8);
  }, 30_000);

  it('speed 3 / tempo 125 with the backbeat every 16 rows (beat = 8 rows) is 125', () => {
    expect(detectBPM(song({ speed: 3, fx: [[0x0f, 0x03], [0x0f, 0x7d]] })).bpm).toBe(125);
  });

  it('speed 3 / tempo 80 with the snare every 8 rows (beat = 4 rows) is 160: the drums decide, not the speed', () => {
    const drums = (r: number) => (r % 8 === 0 ? { ...empty(), note: 36, instrument: 1 } : r % 8 === 4 ? { ...empty(), note: 38, instrument: 2 } : null);
    expect(detectBPM(song({ speed: 3, bpm: 80, drums })).bpm).toBe(160);
  });

  it('a plain speed 6 / tempo 125 song still reports 125', () => {
    const r = detectBPM(song());
    expect(r.bpm).toBe(125);
    expect(r.confidence).toBe('default');
  });

  it('a set-tempo F8C at speed 6 reports 140', () => {
    expect(detectBPM(song({ fx: [[0x0f, 0x8c]] })).bpm).toBe(140);
  });
});
