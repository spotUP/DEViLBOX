/**
 * Future Player: the pattern editor follows the music (plan 2026-10-07-grid-from-replayer-walk, U7).
 *
 * The WASM replayer renders ahead into a ring buffer and its worklet posted no position, so the
 * pattern editor scrolled on the tracker scheduler's 50 Hz while the player ran on the module's own
 * CIA timer ("frozen", "out of sync"; hybris.fp ticks at 43.98 Hz, not 50). The worklet now posts the
 * interrupt the audio being PLAYED belongs to, when it moves to a new row, and the engine maps it to
 * the grid with the importer's own layout (fpTickPosition).
 *
 * Real worklet and WASM, real songs:
 *  - the reported positions walk the grid exactly: (0,0), then the next row of the pattern, then row 0 of
 *    the next pattern;
 *  - a row lasts speed / (the module's tick rate) of audio: hybris 3 ticks at 43.98 Hz, not 3 at 50;
 *  - the reported row is the row sounding: each voice heard alone rises at the reported row of its grid notes,
 *    more than a row before or after;
 *  - the engine is wirable by NativeEngineRouting (it has onPositionUpdate).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, stereoOutputs, ROOT, type WorkletMsg } from './workletHarness';
import { parseFuturePlayerFile } from '@/lib/import/formats/FuturePlayerParser';
import { fpCodeSection, walkFuturePlayer, FP_WALK } from '@/lib/import/formats/fpWalk';
import { fpLayout, fpTickPosition } from '@/lib/import/formats/fpGrid';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const CASES = [
  { file: 'public/data/songs/formats/hybris.fp', seconds: 25 },
  { file: 'public/data/songs/future-player/imploder drums.fp', seconds: 25 },
];
const BLOCK = 128;
const RATE = 48000;

interface Render { posts: Array<{ block: number; ticks: number }>; levels: number[] }

/** Render the real worklet; `mask` (bit N = voice N audible) isolates a voice; the per-block output level is returned with every position post. */
async function render(bytes: Uint8Array, seconds: number, mask = 0xf): Promise<Render> {
  const { proc, send, posted } = await startWorklet('futureplayer', 'FuturePlayer');
  await send({ type: 'loadTune', buffer: bytes.slice().buffer });
  await send({ type: 'setMuteMask', mask });
  await send({ type: 'play' });
  const out = stereoOutputs(1);
  const posts: Render['posts'] = [];
  const levels: number[] = [];
  const blocks = Math.floor((RATE * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], out);
    let e = 0;
    for (let i = 0; i < BLOCK; i++) e += out[0][0][i] * out[0][0][i] + out[0][1][i] * out[0][1][i];
    levels.push(Math.sqrt(e / (2 * BLOCK)));
    while (posted.length) {
      const m = posted.shift() as WorkletMsg & { ticks?: number };
      if (m.type === 'position') posts.push({ block: b, ticks: m.ticks! });
    }
  }
  return { posts, levels };
}

/** How much the level rises when the row starting at `block` starts: the loudest of the next four blocks over the mean of the six before (log ratio). */
function rise(levels: number[], block: number): number {
  const at = (k: number): number => levels[k] ?? 0;
  let after = 0, before = 0;
  for (let k = 0; k < 4; k++) after = Math.max(after, at(block + k));
  for (let k = 1; k <= 6; k++) before += at(block - k) / 6;
  return Math.log((after + 1e-4) / (before + 1e-4));
}

describe('Future Player: the playhead follows the grid', () => {
  it.each(CASES)('$file: the reported position walks the grid, lasts a row of the module\'s timer, and is the row sounding', async ({ file, seconds }) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, file)));
    const ab = bytes.slice().buffer as ArrayBuffer;
    const song = parseFuturePlayerFile(ab, file.split('/').pop()!) as TrackerSong;
    const code = fpCodeSection(bytes);
    const walk = walkFuturePlayer(code, 0)!;
    const layout = fpLayout(walk);
    const tickHz = walk.tickHz;
    const r = await render(bytes, seconds);
    expect(r.posts.length, 'the worklet posts its position as it changes').toBeGreaterThan(50);

    // 1. the walk of the grid
    const lengthAt = (p: number): number => song.patterns[p].length;
    const pos = r.posts.map((p) => fpTickPosition(layout, p.ticks)!);
    expect(pos.every((p) => p !== null && p !== undefined), 'every reported tick is a grid row').toBe(true);
    expect(pos[0]).toEqual({ songPos: 0, row: 0 });
    const bad: string[] = [];
    for (let i = 1; i < pos.length && bad.length < 5; i++) {
      const a = pos[i - 1], b = pos[i];
      const next = (b.songPos === a.songPos && b.row === a.row + 1) || (b.songPos === a.songPos + 1 && b.row === 0 && a.row === lengthAt(a.songPos) - 1);
      if (!next) bad.push(`#${i}: (${a.songPos},${a.row}) -> (${b.songPos},${b.row})`);
    }
    expect(bad).toEqual([]);

    // 2. a row lasts speed ticks of the module's own timer (tick marks put the posts on interrupts: within two blocks)
    const want = (walk.speed / tickHz) * RATE;
    const gaps = r.posts.slice(1).map((p, i) => (p.block - r.posts[i].block) * BLOCK);
    const off = gaps.filter((g) => Math.abs(g - want) > 3 * BLOCK);
    expect(off, `every row lasts ${walk.speed} ticks at ${tickHz.toFixed(2)} Hz = ${want.toFixed(0)} frames`).toEqual([]);
    const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
    expect(Math.abs(mean / want - 1)).toBeLessThan(0.005);

    // 3. the reported row is the row sounding: each voice heard alone rises at the reported row of its grid notes,
    // more than at the row before or after (the onset of a note is the interrupt it is read on)
    const flat = (p: { songPos: number; row: number }): number => song.patterns.slice(0, p.songPos).reduce((n, q) => n + q.length, 0) + p.row;
    const cellAt = (v: number, row: number) => {
      let r0 = row;
      for (const pat of song.patterns) { if (r0 < pat.length) return pat.channels[v].rows[r0]; r0 -= pat.length; }
      return undefined;
    };
    const solo = await Promise.all([0, 1, 2, 3].map((v) => render(bytes, seconds, 1 << v)));
    const score = (shift: number): { mean: number; n: number } => {
      let sum = 0, n = 0;
      for (let v = 0; v < 4; v++) {
        const posts = solo[v].posts;
        for (let i = 2; i < posts.length - 2; i++) {
          const cell = cellAt(v, flat(pos[i]));
          if (!cell || cell.note <= 0 || cell.note > 96 || cell.instrument === 0) continue;
          sum += rise(solo[v].levels, posts[i + shift].block);
          n++;
        }
      }
      return { mean: n ? sum / n : 0, n };
    };
    const here = score(0), early = score(-1), late = score(1);
    expect(here.n, 'grid notes compared').toBeGreaterThan(50);
    expect(here.mean, `a voice with a grid note rises at the reported row (${here.mean.toFixed(3)} vs a row early ${early.mean.toFixed(3)})`).toBeGreaterThan(early.mean);
    expect(here.mean, `... and a row late (${late.mean.toFixed(3)})`).toBeGreaterThan(late.mean);
    const checked = here.n;
    console.log(`ROW Future Player playhead | ${file.split('/').pop()} | ${r.posts.length} positions, row ${(mean / RATE * 1000).toFixed(1)} ms (module ${(walk.speed / tickHz * 1000).toFixed(1)} ms), ${checked} grid notes, rise ${here.mean.toFixed(2)} vs ${early.mean.toFixed(2)} early / ${late.mean.toFixed(2)} late`);
  }, 300000);

  /**
   * The replayer itself plays what the walk walks: hybris.fp's short subsongs end by themselves, and the notes the
   * Paula chip starts per voice are the walk's retriggered notes. Subsongs 3 to 5 start after an intro of 64, 128
   * and 224 rows the player skips silently (the entry's second long): the wasm replayer ignored that, and ended
   * voices on command 13 only through the call-depth check, so they played from row 0.
   */
  it.each([2, 3, 4, 5])('hybris.fp subsong %i: the replayer starts the notes the walk walks, on every voice', async (sub) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/formats/hybris.fp')));
    const walk = walkFuturePlayer(fpCodeSection(bytes), sub)!;
    expect(walk.stop).toBe('ended');
    const { proc, send, posted } = await startWorklet('futureplayer', 'FuturePlayer');
    await send({ type: 'loadTune', buffer: bytes.slice().buffer });
    await send({ type: 'setSubsong', subsong: sub });
    await send({ type: 'play' });
    const out = stereoOutputs(1);
    let counts: number[] = [0, 0, 0, 0];
    const seconds = walk.ticks / walk.tickHz + 3;
    for (let b = 0; b < (RATE * seconds) / BLOCK; b++) {
      proc.process([], out);
      while (posted.length) { const m = posted.shift() as WorkletMsg & { noteStarts?: number[] }; if (m.type === 'chLevels' && m.noteStarts) counts = m.noteStarts; }
    }
    const want = [0, 1, 2, 3].map((v) => walk.events.filter((e) => e.voice === v && e.kind === FP_WALK.note).length);
    expect(counts).toEqual(want);
  }, 120000);

  it('the engine has onPositionUpdate, so NativeEngineRouting wires it', async () => {
    const { FuturePlayerEngine } = await import('@/engine/futureplayer/FuturePlayerEngine');
    expect(typeof FuturePlayerEngine.prototype.onPositionUpdate).toBe('function');
  }, 60000);
});
