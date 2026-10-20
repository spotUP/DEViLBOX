/**
 * renderSong against tools/hiphop.py render_track over song files whose locked layers (sample, chops, vocals, scratch)
 * are absent (plan 2026-10-19 O6j). The generator drives the real song_file.render_doc; the layers are absent through
 * song-file fields only (layers.sample = layers.vocal = 0, a blank scratch plan). Every case compares the host's float64
 * final output (int8 / 127.0) with renderSong's to 1e-9, the tolerance of the sibling song tests (float accumulation
 * order inside the shared primitives), after the sha256 of each decoded lane. A case with stored lanes also compares the
 * drums, bass and melody lanes the host handed to balance_buses (copied before it scaled them in place) with the
 * arguments renderSong gives balanceBuses, and demands the sample and vocal lanes there are all zero.
 * The reachability test counts the host's own calls: balance_buses once per section, _apply_texture once per track,
 * master_bus once per track, and the host's scratch bus ran in every section although the plan is blank. The per-style
 * scratch table (use_scratch, dust, room, echo mix) is compared with the host's runtime DIRT for all 19 styles.
 * Regenerate with tools/softsynth-fixtures/gen_song_render.py.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/song_render.json';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import * as busEffects from '../effects/busEffects';
import * as songMix from '../mix/songMix';
import { renderSongFile, scratchDirt } from '../songRender';

interface Arr { n: number; off: number; sha: string; peak: number }
interface SectionRec { n: number; has_drums: boolean; reinforce: boolean; bass_g: number; drums?: Arr; bass?: Arr; melody?: Arr }
interface Case {
  name: string; style: string; bpm: number; vintage: boolean; doc: SongFileDoc;
  calls: { balance: number; texture: number; master: number };
  scratch_sections: { n: number; peak: number }[]; sections: SectionRec[]; final: Arr;
}
interface ScratchRow {
  use_scratch: boolean; dust: number; scratch_dust_k: number; scratch_rev: string; scratch_rev_mix: number;
  scratch_echo_mix: number; master_rev: string | null; master_rev_mix: number | null; in_dirt: boolean; clean_dust: number;
}
const ref = fixture as unknown as { scratch: Record<string, ScratchRow>; cases: Case[] };

const TOL = 1e-9;
const lanesBytes = ((): Uint8Array => {
  const planes = brotliDecompressSync(readFileSync(join(__dirname, 'fixtures/song_render.lanes.br')));
  const n = planes.length / 8;
  const out = new Uint8Array(planes.length);
  for (let k = 0; k < 8; k++) for (let i = 0; i < n; i++) out[i * 8 + k] = planes[k * n + i]!;
  return out;
})();
const laneOf = (a: Arr): Float64Array => {
  const bytes = lanesBytes.slice(a.off * 8, (a.off + a.n) * 8);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha);
  return new Float64Array(bytes.buffer);
};
const maxErr = (a: Float64Array, b: Float64Array): number => {
  let m = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

/** renderSongFile with the three host-counted calls observed: balanceBuses (lanes by reference; it copies), applyTexture, masterBus. */
const run = (c: Case) => {
  const balance = vi.spyOn(songMix, 'balanceBuses');
  const texture = vi.spyOn(songMix, 'applyTexture');
  const master = vi.spyOn(busEffects, 'masterBus');
  const out = renderSongFile(c.doc);
  return {
    out, lanes: balance.mock.calls.map((a) => a[0]),
    calls: { balance: balance.mock.calls.length, texture: texture.mock.calls.length, master: master.mock.calls.length },
  };
};

afterEach(() => { vi.restoreAllMocks(); });

describe('the scratch table matches the host DIRT', () => {
  it('scratchDirt equals hiphop.DIRT and STYLES.use_scratch for all 19 styles', () => {
    expect(Object.keys(ref.scratch)).toHaveLength(19);
    for (const [style, r] of Object.entries(ref.scratch)) {
      expect(r.in_dirt, style).toBe(true);
      expect(r.scratch_dust_k, style).toBe(1.0);
      expect(r.clean_dust, style).toBe(0);
      expect(scratchDirt(style), style).toEqual({
        dust: r.dust * r.scratch_dust_k, room: r.scratch_rev, roomMix: r.scratch_rev_mix, echoMix: r.scratch_echo_mix,
        useScratch: r.use_scratch,
      });
    }
  });
  it('no style carries a master_rev override; only the use_scratch styles of the table take the scratch gain', () => {
    for (const [style, r] of Object.entries(ref.scratch)) {
      expect(r.master_rev, style).toBeNull();
      expect(r.master_rev_mix, style).toBeNull();
    }
    expect(Object.entries(ref.scratch).filter(([, r]) => r.use_scratch).map(([s]) => s).sort()).toEqual(['east_coast', 'old_school']);
  });
});

describe('renderSong matches render_track with the locked layers absent', () => {
  for (const c of ref.cases) {
    it(`${c.name}: the final output and every stored balance_buses lane`, () => {
      const r = run(c);
      expect(r.lanes).toHaveLength(c.sections.length);
      c.sections.forEach((s, i) => {
        const lanes = r.lanes[i]!;
        expect(lanes.sample.every((v) => v === 0) && lanes.vocal.every((v) => v === 0), `${c.name} s${i} locked lanes`).toBe(true);
        expect(lanes.reinforce !== null, `${c.name} s${i} reinforce`).toBe(s.reinforce);
        for (const lane of ['drums', 'bass', 'melody'] as const) {
          if (s[lane]) expect(maxErr(lanes[lane], laneOf(s[lane]!)), `${c.name} s${i} ${lane}`).toBeLessThan(TOL);
        }
      });
      const want = laneOf(c.final);
      expect(r.out).toHaveLength(want.length);
      expect(maxErr(r.out, want), `${c.name} final output`).toBeLessThan(TOL);
    });
  }
  it('the corpus covers the Paula buckets, vintage off, use_scratch, a drums-off section and stored lanes', () => {
    const tex = (style: string) => ref.scratch[style]!;
    expect(ref.cases.some((c) => !c.vintage)).toBe(true);
    expect(ref.cases.some((c) => Math.max(...c.sections.map((s) => s.n)) > 1.5 * Math.min(...c.sections.map((s) => s.n))), 'a multi-bar section').toBe(true);
    expect(ref.cases.some((c) => c.vintage)).toBe(true);
    expect(new Set(ref.cases.map((c) => c.style))).toEqual(new Set(['boom_bap', 'lofi', 'g_funk', 'trap', 'dirty_south', 'east_coast']));
    expect(ref.cases.some((c) => tex(c.style).use_scratch)).toBe(true);
    expect(ref.cases.some((c) => !tex(c.style).use_scratch)).toBe(true);
    expect(ref.cases.some((c) => c.sections.some((s) => !s.has_drums) && c.sections.some((s) => s.has_drums))).toBe(true);
    expect(ref.cases.some((c) => c.sections.some((s) => s.drums && s.bass && s.melody))).toBe(true);
    // a500 bucket (lofi, dirty_south) and a1200 bucket (boom_bap, g_funk, trap) both present
    expect(ref.cases.some((c) => c.style === 'lofi')).toBe(true);
    expect(ref.cases.some((c) => c.style === 'g_funk')).toBe(true);
  });
});

describe('reachability: a song file -> renderSong runs the host stages the way the host did', () => {
  it('calls balanceBuses, applyTexture and masterBus exactly as often as render_track did', () => {
    let host = { balance: 0, texture: 0, master: 0 };
    const got = { balance: 0, texture: 0, master: 0 };
    for (const c of ref.cases) {
      const r = run(c);
      expect(c.scratch_sections).toHaveLength(c.sections.length);     // the host ran its scratch bus in every section
      expect(c.scratch_sections.every((s) => s.n > 0), c.name).toBe(true);
      expect(r.calls, c.name).toEqual(c.calls);
      host = { balance: host.balance + c.calls.balance, texture: host.texture + c.calls.texture, master: host.master + c.calls.master };
      got.balance += r.calls.balance; got.texture += r.calls.texture; got.master += r.calls.master;
      vi.restoreAllMocks();
    }
    expect(host.balance).toBeGreaterThan(ref.cases.length);
    expect(got).toEqual(host);
  }, 240_000);
});
