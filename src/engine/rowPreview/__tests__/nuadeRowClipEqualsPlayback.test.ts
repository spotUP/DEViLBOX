/**
 * N1: a row rendered by the row-preview stream from a cold seek is playback's row, sample for sample.
 *
 * Real Nuade.wasm in Node. Reference = one linear render of the song in 128-frame quanta (what playback does). Stream =
 * RowPreviewStream over NuadeRowAdapter asked for a row 8 s and one 45 s into the song, cold. The clip must equal the
 * linear render at the same frames (max diff 0) for the stereo mix and every voice, and a muted voice must be absent
 * from the mix exactly as in a linear render with the same mask. One tick-followed song (wallybeben) and one
 * order-and-row-followed song (fashiontracker) so both target kinds run.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NuadeHeadless } from '@engine/nuade/nuadeHeadless';
import { NuadeRowAdapter } from '../adapters/nuadeAdapter';
import { RowPreviewStream } from '../rowPreviewStream';
import { ROW_CHUNK_FRAMES, rowClipMinFrames, type RowClip } from '../rowClip';
import type { RowTarget } from '../rowTarget';

const ROOT = resolve(__dirname, '../../../..');
const RATE = 48000;
const ALL = 0xffffffff;

const SONGS = [
  { name: 'wicked.wb', file: 'public/data/songs/wally-beben/wicked.wb', playerId: 'wallybeben', followBy: 'tick' as const },
  { name: 'ivory tover ii.ex', file: 'public/data/songs/fashion-tracker/ivory tover ii.ex', playerId: 'fashiontracker', followBy: 'orderRow' as const },
];
const AT_SECONDS = [8, 45];

interface Linear { posAtChunk: Map<number, { order: number; row: number; tick: number; speed: number }>; slices: Map<string, { stereo: Float32Array; voices: Float32Array[] }> }

/** Linear render under `mask` to `untilFrame`, keeping the position at every chunk start and the audio of `windows`. */
function linear(d: NuadeHeadless, bytes: Uint8Array, song: typeof SONGS[number], mask: number, untilFrame: number, windows: { key: string; from: number; to: number }[]): Linear {
  d.reinit(); d.clearFiles();
  d.open(bytes, song.name, song.playerId);
  d.start(d.defaultSubsong);
  d.setMuteMask(mask | 0);
  const out: Linear = { posAtChunk: new Map(), slices: new Map() };
  const acc = new Map(windows.map((w) => [w.key, { stereo: new Float32Array((w.to - w.from) * 2), voices: [] as Float32Array[] }]));
  for (let f = 0; f < untilFrame; f += ROW_CHUNK_FRAMES) {
    const r = d.render(ROW_CHUNK_FRAMES, true);
    const s = d.snapshot(f);
    if (s) out.posAtChunk.set(f, { order: s.order, row: s.row, tick: s.tick, speed: s.speed });
    for (const w of windows) {
      const a = acc.get(w.key)!;
      const lo = Math.max(w.from, f), hi = Math.min(w.to, f + r.frames);
      if (hi <= lo) continue;
      a.stereo.set(r.stereo.subarray((lo - f) * 2, (hi - f) * 2), (lo - w.from) * 2);
      if (!a.voices.length) a.voices = r.voices.map(() => new Float32Array(w.to - w.from));
      r.voices.forEach((v, i) => a.voices[i]!.set(v.subarray(lo - f, hi - f), lo - w.from));
    }
  }
  for (const [k, v] of acc) out.slices.set(k, v);
  return out;
}

const maxDiff = (a: Float32Array, b: Float32Array, n: number): number => {
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

/** The target for the row the player stands in at `pos`, as GridFollow.targetOf shapes it. */
function targetAt(song: typeof SONGS[number], pos: { order: number; row: number; tick: number; speed: number }): RowTarget {
  if (song.followBy === 'orderRow') return { kind: 'orderRow', order: pos.order, row: pos.row };
  const speed = Math.max(1, pos.speed), t = pos.row * speed + pos.tick;
  const from = Math.floor(t / speed) * speed;
  return { kind: 'ticks', from, to: from + speed };
}

describe('the row preview stream renders playback\'s row from a cold seek', () => {
  for (const song of SONGS) {
    it(`${song.name}: rows at ${AT_SECONDS.join(' s and ')} s equal the linear render (max diff 0), also with a voice muted`, async () => {
      const bytes = new Uint8Array(readFileSync(resolve(ROOT, song.file)));
      const d = await NuadeHeadless.create(RATE);
      // Which rows: the positions the player stands in at those times, from a first linear pass.
      const first = linear(d, bytes, song, ALL, Math.max(...AT_SECONDS) * RATE + 4 * ROW_CHUNK_FRAMES, []);
      const targets = AT_SECONDS.map((sec) => targetAt(song, first.posAtChunk.get(Math.floor((sec * RATE) / ROW_CHUNK_FRAMES) * ROW_CHUNK_FRAMES)!));

      const adapter = new NuadeRowAdapter(d);
      for (const mask of [ALL, ALL & ~2]) {
        const clips: RowClip[] = [];
        const stream = new RowPreviewStream(adapter);
        stream.ensureOpen(bytes, [song.playerId, song.name, undefined, undefined]);
        // the later row first by rendering forward; the earlier one is then behind the cursor: restart + silent advance
        const restarts = vi.spyOn(adapter, 'advanceSilent');
        for (const target of targets.slice().reverse()) {
          const r = await stream.request(target, mask);
          expect(r.kind).toBe('clip');
          if (r.kind === 'clip') clips.push(r.clip);
        }
        expect(restarts, 'the earlier row was reached by a silent advance').toHaveBeenCalledTimes(1);
        restarts.mockRestore();
        const windows = clips.map((c, i) => ({ key: String(i), from: c.startFrame, to: c.startFrame + c.frames }));
        const ref = linear(d, bytes, song, mask, Math.max(...windows.map((w) => w.to)) + ROW_CHUNK_FRAMES, windows);
        clips.forEach((clip, i) => {
          const win = ref.slices.get(String(i))!;
          expect(clip.frames, 'a clip is at least the minimum preview length (a one-tick row is not a click)').toBeGreaterThanOrEqual(rowClipMinFrames(RATE));
          expect(maxDiff(clip.stereo, win.stereo, clip.frames * 2), `${song.name} row ${i} stereo, mask ${mask.toString(16)}`).toBe(0);
          if (mask === ALL) expect(Math.max(...clip.stereo.map(Math.abs)), 'the row sounds').toBeGreaterThan(0.001);
          expect(clip.voices!.length).toBe(win.voices.length);
          clip.voices!.forEach((v, vi) => expect(maxDiff(v, win.voices[vi]!, clip.frames), `voice ${vi}`).toBe(0));
          // The exact first frame is the first tick of the row: the chunk before it is another row.
          const chunk = Math.floor(clip.startFrame / ROW_CHUNK_FRAMES) * ROW_CHUNK_FRAMES;
          const before = ref.posAtChunk.get(chunk - ROW_CHUNK_FRAMES) ?? first.posAtChunk.get(chunk - ROW_CHUNK_FRAMES);
          const there = first.posAtChunk.get(chunk);
          if (before && there) expect(JSON.stringify(targetAt(song, before)) === JSON.stringify(targetAt(song, there)) ? 'same' : 'differs').toBe(chunk === clip.startFrame ? 'differs' : 'same');
        });
        if (mask !== ALL) {
          // The muted voice is gone from the mix: the masked clip differs from the unmuted linear render.
          const un = linear(d, bytes, song, ALL, clips[0]!.startFrame + clips[0]!.frames + ROW_CHUNK_FRAMES, [{ key: 'u', from: clips[0]!.startFrame, to: clips[0]!.startFrame + clips[0]!.frames }]);
          expect(maxDiff(clips[0]!.stereo, un.slices.get('u')!.stereo, clips[0]!.frames * 2)).toBeGreaterThan(0);
        }
      }
    }, 120_000);
  }
});
