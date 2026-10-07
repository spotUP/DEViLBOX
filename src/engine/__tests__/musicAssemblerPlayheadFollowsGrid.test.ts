/**
 * Music Assembler: the pattern editor follows the music (plan 2026-10-07-grid-from-replayer-walk, U8).
 *
 * The WASM replayer's worklet posted no position, so the pattern editor scrolled on the tracker scheduler's
 * clock while the audio free-ran. The worklet now posts the player's tick count when it reaches a new row
 * ({ type: 'position', ticks }; the replayer ticks at 50 Hz, and row r reads on tick 1 + r * speed) and the
 * engine maps it to the grid with the importer's own layout (walkTickPosition).
 *
 * Real worklet and WASM, real songs:
 *  - the reported positions walk the grid exactly: (0,0), then the next row of the pattern, then row 0 of the
 *    next pattern;
 *  - a row lasts speed ticks of 50 Hz of audio;
 *  - the reported row is the row sounding: each voice heard alone rises one tick after the reported row of its
 *    grid notes (a voice is updated on the tick after it read its event), more than a row before or after;
 *  - the replayer's stereo is the hardware's: voice v plays on Paula channel [0, 2, 3, 1][v] (0 and 3 left);
 *  - the engine is wirable by NativeEngineRouting (it has onPositionUpdate).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { startWorklet, stereoOutputs, type WorkletMsg } from './workletHarness';
import { MA_FILES } from './maOracle';
import { parseMusicAssemblerFile } from '@/lib/import/formats/MusicAssemblerParser';
import { loadMaModule } from '@/lib/import/formats/maModule';
import { walkMusicAssembler } from '@/lib/import/formats/maWalk';
import { walkLayout, walkTickPosition } from '@/lib/import/formats/walkLayout';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const BLOCK = 128;
const RATE = 48000;
const SECONDS = 30;
const FRAMES_PER_TICK = RATE / 50;

interface Render { posts: Array<{ block: number; ticks: number }>; levels: number[] }

/** Render the real worklet; `mask` (bit N = voice N audible) isolates a voice; the per-block output level is returned with every position post. */
async function render(bytes: Uint8Array, mask = 0xf): Promise<{ r: Render; left: number[]; right: number[] }> {
  const { proc, send, posted } = await startWorklet('ma', 'Ma');
  await send({ type: 'loadModule', moduleData: bytes.slice().buffer });
  await send({ type: 'setMuteMask', mask });
  const out = stereoOutputs(1);
  const posts: Render['posts'] = [];
  const levels: number[] = [], left: number[] = [], right: number[] = [];
  const blocks = Math.floor((RATE * SECONDS) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], out);
    let l = 0, rr = 0;
    for (let i = 0; i < BLOCK; i++) { l += out[0][0][i] * out[0][0][i]; rr += out[0][1][i] * out[0][1][i]; }
    left.push(Math.sqrt(l / BLOCK)); right.push(Math.sqrt(rr / BLOCK));
    levels.push(Math.sqrt((l + rr) / (2 * BLOCK)));
    while (posted.length) {
      const m = posted.shift() as WorkletMsg & { ticks?: number };
      if (m.type === 'position') posts.push({ block: b, ticks: m.ticks! });
    }
  }
  return { r: { posts, levels }, left, right };
}

/** How much the level rises when the row starting at `block` starts: the loudest of the next four blocks over the mean of the six before (log ratio). */
function rise(levels: number[], block: number): number {
  const at = (k: number): number => levels[k] ?? 0;
  let after = 0, before = 0;
  for (let k = 0; k < 4; k++) after = Math.max(after, at(block + k));
  for (let k = 1; k <= 6; k++) before += at(block - k) / 6;
  return Math.log((after + 1e-4) / (before + 1e-4));
}

describe.each(MA_FILES.map((f) => [f.split('/').pop()!, f] as const))('Music Assembler: the playhead follows the grid: %s', (name, file) => {
  const bytes = new Uint8Array(readFileSync(file));

  it('the reported position walks the grid, lasts a row of 50 Hz ticks, and is the row sounding', async () => {
    const song = parseMusicAssemblerFile(bytes, name) as TrackerSong;
    const walk = walkMusicAssembler(loadMaModule(bytes)!, 0)!;
    const layout = walkLayout(walk);
    const { r } = await render(bytes);
    expect(r.posts.length, 'the worklet posts its position as it changes').toBeGreaterThan(50);

    // 1. the walk of the grid
    const pos = r.posts.map((p) => walkTickPosition(layout, p.ticks)!);
    expect(pos.every((p) => p !== null && p !== undefined), 'every reported tick is a grid row').toBe(true);
    expect(pos[0]).toEqual({ songPos: 0, row: 0 });
    const lengthAt = (p: number): number => song.patterns[p].length;
    const bad: string[] = [];
    for (let i = 1; i < pos.length && bad.length < 5; i++) {
      const a = pos[i - 1], b = pos[i];
      const next = (b.songPos === a.songPos && b.row === a.row + 1) || (b.songPos === a.songPos + 1 && b.row === 0 && a.row === lengthAt(a.songPos) - 1);
      if (!next) bad.push(`#${i}: (${a.songPos},${a.row}) -> (${b.songPos},${b.row})`);
    }
    expect(bad).toEqual([]);

    // 2. a row lasts speed ticks of 50 Hz
    const want = walk.speed * FRAMES_PER_TICK;
    const gaps = r.posts.slice(1).map((p, i) => (p.block - r.posts[i].block) * BLOCK);
    expect(gaps.filter((g) => Math.abs(g - want) > 2 * BLOCK), `every row lasts ${walk.speed} ticks = ${want} frames`).toEqual([]);
    expect(Math.abs(gaps.reduce((a, g) => a + g, 0) / gaps.length / want - 1)).toBeLessThan(0.005);

    // 3. the reported row is the row sounding: each voice alone rises one tick after the reported row of its grid notes
    const flat = (p: { songPos: number; row: number }): number => song.patterns.slice(0, p.songPos).reduce((n, q) => n + q.length, 0) + p.row;
    const cellAt = (v: number, row: number) => {
      let r0 = row;
      for (const pat of song.patterns) { if (r0 < pat.length) return pat.channels[v].rows[r0]; r0 -= pat.length; }
      return undefined;
    };
    const solo = await Promise.all([0, 1, 2, 3].map((v) => render(bytes, 1 << v)));
    const lag = Math.round(FRAMES_PER_TICK / BLOCK); // a voice is updated on the tick after it read its event
    const score = (shift: number): { mean: number; n: number } => {
      let sum = 0, n = 0;
      for (let v = 0; v < 4; v++) {
        const posts = solo[v].r.posts;
        for (let i = 2; i < posts.length - 2; i++) {
          const cell = cellAt(v, flat(pos[i]));
          if (!cell || cell.note <= 0 || cell.note > 96 || cell.instrument === 0) continue;
          sum += rise(solo[v].r.levels, posts[i + shift].block + lag);
          n++;
        }
      }
      return { mean: n ? sum / n : 0, n };
    };
    const here = score(0), early = score(-1), late = score(1);
    expect(here.n, 'grid notes compared').toBeGreaterThan(30);
    expect(here.mean, `a voice with a grid note rises at the reported row (${here.mean.toFixed(3)} vs a row early ${early.mean.toFixed(3)})`).toBeGreaterThan(early.mean);
    expect(here.mean, `... and a row late (${late.mean.toFixed(3)})`).toBeGreaterThan(late.mean);
    console.log(`ROW Music Assembler playhead | ${name} | ${r.posts.length} positions, ${(gaps.reduce((a, g) => a + g, 0) / gaps.length / RATE * 1000).toFixed(1)} ms a row (${walk.speed} ticks), ${here.n} grid notes, rise ${here.mean.toFixed(2)} vs ${early.mean.toFixed(2)} early / ${late.mean.toFixed(2)} late`);

    // 4. stereo: voice v plays on Paula channel [0, 2, 3, 1][v]; channels 0 and 3 are left, 1 and 2 right
    const side = (v: number): number => {
      const l = solo[v].left.reduce((a, x) => a + x, 0), rr = solo[v].right.reduce((a, x) => a + x, 0);
      return l + rr === 0 ? 0 : (l - rr) / (l + rr);
    };
    const expectLeft = [true, false, true, false];
    for (let v = 0; v < 4; v++) {
      if (solo[v].left.every((x) => x === 0) && solo[v].right.every((x) => x === 0)) continue; // a silent voice has no side
      if (expectLeft[v]) expect(side(v), `voice ${v} is on the left`).toBeGreaterThan(0.9); else expect(side(v), `voice ${v} is on the right`).toBeLessThan(-0.9);
    }
  }, 300000);

  /**
   * The replayer's own volumes are the 68k player's: the walk's volumes (which UADE confirms write for write) against
   * the wasm's voice levels after every block of audio. The wasm ran the ADSR's and the arpeggio's counter compares
   * with greater-or-equal where the 68k player has strictly greater, so an instrument with attack 255 and a peak of
   * 255 (baseheads.ma, thanatos.ma) sounded one tick at 240 where the player writes 255.
   */
  it('the replayer\'s voice volumes are the walk\'s', async () => {
    const walk = walkMusicAssembler(loadMaModule(bytes)!, 0)!;
    const { proc, send } = await startWorklet('ma', 'Ma');
    await send({ type: 'loadModule', moduleData: bytes.slice().buffer });
    const mod = proc.module as { _player_get_ticks_played(): number; _player_get_channel_levels(p: number): void; _malloc(n: number): number; HEAPF32?: Float32Array; wasmMemory?: { buffer: ArrayBuffer } };
    const ptr = mod._malloc(16);
    const out = stereoOutputs(1);
    let compared = 0, ticksSeen = 0;
    const bad: string[] = [];
    const blocks = Math.floor((RATE * 25) / BLOCK);
    for (let b = 0; b < blocks && bad.length < 5; b++) {
      proc.process([], out);
      const ticks = mod._player_get_ticks_played();
      if (ticks < 2 || ticks > walk.ticks) continue;
      mod._player_get_channel_levels(ptr);
      const heap = mod.HEAPF32 ?? new Float32Array(mod.wasmMemory!.buffer);
      for (let v = 0; v < 4; v++) {
        const want = [...walk.writes[v]].reverse().find((w) => w.tick <= ticks)?.volume ?? 0;
        const got = Math.round(heap[(ptr >> 2) + v] * 64);
        compared++;
        if (got !== want) bad.push(`tick ${ticks} voice ${v}: the replayer's volume ${got}, the walk's ${want}`);
      }
      ticksSeen = ticks;
    }
    expect(ticksSeen, 'ticks played').toBeGreaterThan(500);
    expect(compared).toBeGreaterThan(2000);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 300000);

  it('the engine has onPositionUpdate, so NativeEngineRouting wires it', async () => {
    const { MaEngine } = await import('@/engine/ma/MaEngine');
    expect(typeof MaEngine.prototype.onPositionUpdate).toBe('function');
  }, 60000);
});
