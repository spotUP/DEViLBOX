/**
 * renderDrumBar against tools/hiphop.py render_drum_bar (plan 2026-10-19 O6e). Every bar compares exactly: the float64
 * output by sha256 of its bytes (the first 300 samples also by value, for a readable diff) and the sentinels that prove
 * the streams ran: the hat stream position (next random() after the bar), ProbabilityMemory w/last and the number of
 * events skipped for a missing bank voice. Runs with `shared` build the pool and memory once from the song seed and pass
 * them to every bar, the way _render_song does; the others call standalone (pool from the bar seed).
 * Regenerate with tools/softsynth-fixtures/gen_render_drum_bar.py.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/render_drum_bar.json';
import { drumBank, type DrumBank, type HipHopStyle } from '../drumBank';
import { ProbabilityMemory, buildHatPool } from '../hatPath';
import { renderDrumBar, type BarEventInput } from '../renderDrumBar';

interface Arr { n: number; sha: string; head: string }
interface Bar { seed: number; events: BarEventInput[]; buf: Arr; next: number; w: number[]; last: number; skipped: number; peak: number }
interface Case {
  name: string; style: HipHopStyle; bpm: number; rate: number; bank_seed: number; drop: string[];
  shared: { song_seed: number; n: number } | null; bars: Bar[];
}
const ref = fixture as unknown as { cases: Case[] };

describe('renderDrumBar matches hiphop.render_drum_bar', () => {
  for (const c of ref.cases) {
    it(c.name, () => {
      const bank: DrumBank = { ...drumBank(c.style, c.rate, c.bank_seed) };
      for (const v of c.drop) delete bank[v];
      const pool = c.shared ? buildHatPool(c.style, c.rate, c.shared.song_seed, c.shared.n) : undefined;
      const pm = pool ? new ProbabilityMemory(pool.length) : undefined;
      for (const bar of c.bars) {
        const r = renderDrumBar(c.style, bar.events, c.bpm, c.rate, bank, bar.seed, pool, pm);
        expect(r.buf.length).toBe(bar.buf.n);
        const head = new Float64Array(new Uint8Array(Buffer.from(bar.buf.head, 'base64')).buffer);
        expect(Array.from(r.buf.subarray(0, head.length))).toEqual(Array.from(head));
        const bytes = new Uint8Array(r.buf.buffer, r.buf.byteOffset, r.buf.byteLength);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(bar.buf.sha);
        expect(r.skipped).toBe(bar.skipped);
        expect(r.hatRng.random()).toBe(bar.next);
        expect(r.hatPm.w).toEqual(bar.w);
        expect(r.hatPm.last).toBe(bar.last);
      }
    });
  }

  it('the fixture exercises every branch (not dead knobs)', () => {
    const bars = ref.cases.flatMap((c) => c.bars);
    const chokes = (b: Bar, partial: boolean): boolean => b.events.some((e) => !Array.isArray(e) && (e as { sub?: unknown[][] }).sub?.some((s) => s[0] === 'choke_at_ms' && s[2] === partial));
    expect(bars.some((b) => b.skipped > 0)).toBe(true);
    expect(bars.some((b) => chokes(b, true))).toBe(true);
    expect(bars.some((b) => chokes(b, false))).toBe(true);
    expect(bars.every((b) => b.peak > 0 || b.events.length === 0)).toBe(true);
    const shared = ref.cases.find((c) => c.name === 'shared-3bars')!;
    const alone = ref.cases.find((c) => c.name === 'standalone-3bars')!;
    expect(shared.bars[2]!.buf.sha).not.toBe(alone.bars[2]!.buf.sha);
  });
});
