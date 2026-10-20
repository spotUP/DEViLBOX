/**
 * songDrums against tools/hiphop.py _render_song / render_section (plan 2026-10-19 O6e-w). Every section lane compares
 * exactly: the float64 lane by sha256 of its bytes (the first 300 samples also by value, for a readable diff). The
 * reference lane is the host's drums_buf as render_section hands it to trim_drums_to_peak, captured by wrapping that
 * function; a section the host never called it for (drums layer off) is all zeros. KNOWN LIMIT: hiphop_kit.add_snare_ghost fades with np.cos, which differs from Math.cos and from portable pcos in the last
 * bit at ~3% of points (machine dependent in the host). A ghost hit played without resample (|cents| <= 0.1) therefore
 * differs by 1 ulp; trap seed 5 hit it (7 of 59842 samples, max 5.5e-17), so the trap case uses seed 6. Fix belongs in the
 * host: use portable_math.cos there, then pcos in addSnareGhost.
 * Cases cover the arrangement path
 * with a breakdown, a bar whose drop layer is "drums", the params.section fast path and a stem that silences the drums.
 * The last test is the reachability test: it drives the song entry (song file -> songFileToBarEvents -> songDrums) and
 * counts the renderDrumBar calls, which must equal the number of bars the host rendered.
 * Regenerate with tools/softsynth-fixtures/gen_song_drums.py.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/song_drums.json';
import { songFileToBarEvents, type BarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import * as renderDrumBarModule from '../renderDrumBar';
import { songDrums } from '../songDrums';

interface Arr { n: number; sha: string; head: string; peak: number }
interface Lane { called: boolean; bars: number; drops: unknown[]; buf: Arr }
interface Case { name: string; style: string; rate: number; bpm: number; doc: SongFileDoc | null; events: BarEvents | null; lanes: Lane[] }
const ref = fixture as unknown as { cases: Case[] };

const inputOf = (c: Case): BarEvents => (c.doc ? songFileToBarEvents(c.doc) : c.events!);
const sha = (a: Float64Array): string => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

afterEach(() => { vi.restoreAllMocks(); });

describe('songDrums matches the hiphop section drums_buf', () => {
  for (const c of ref.cases) {
    it(c.name, () => {
      const lanes = songDrums(inputOf(c), c.bpm);
      expect(lanes.length).toBe(c.lanes.length);
      lanes.forEach((lane, i) => {
        const want = c.lanes[i]!;
        expect(lane.length).toBe(want.buf.n);
        const head = new Float64Array(new Uint8Array(Buffer.from(want.buf.head, 'base64')).buffer);
        expect(Array.from(lane.subarray(0, head.length))).toEqual(Array.from(head));
        expect(sha(lane)).toBe(want.buf.sha);
      });
    });
  }

  it('the fixture exercises every branch (not dead knobs)', () => {
    const lanes = ref.cases.flatMap((c) => c.lanes);
    expect(lanes.some((l) => !l.called && l.buf.peak === 0)).toBe(true);
    expect(lanes.some((l) => l.called && l.buf.peak > 0)).toBe(true);
    expect(lanes.some((l) => l.drops.includes('drums'))).toBe(true);
    expect(ref.cases.some((c) => c.events !== null)).toBe(true);
    expect(ref.cases.some((c) => c.doc !== null)).toBe(true);
    // the hat pool is per section: a later section does not replay the first section's pool state
    const trap = ref.cases.find((c) => c.name === 'trap-8bars')!;
    expect(trap.lanes[1]!.buf.sha).not.toBe(trap.lanes[2]!.buf.sha);
  });

  it('reachability: the song entry renders exactly the bars the host rendered', () => {
    const c = ref.cases.find((x) => x.name === 'trap-16bars-drop-drums')!;
    const events = songFileToBarEvents(c.doc!);
    const calls = vi.spyOn(renderDrumBarModule, 'renderDrumBar');
    const lanes = songDrums(events, (c.doc!.song as { bpm: number }).bpm);
    const hostBars = c.lanes.reduce((n, l) => n + (l.called ? l.bars - l.drops.filter((d) => d === 'drums').length : 0), 0);
    expect(hostBars).toBe(13);
    expect(calls).toHaveBeenCalledTimes(hostBars);
    expect((c.doc!.song as { bpm: number }).bpm).toBe(c.bpm);
    expect(lanes.map(sha)).toEqual(c.lanes.map((l) => l.buf.sha));
  });
});
