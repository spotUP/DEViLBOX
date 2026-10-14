/**
 * U3/U4: a row rendered by the row-preview stream from a cold seek is the EaglePlayer runner's playback, sample for sample.
 *
 * Real EaglePlayer.wasm in Node. Reference = the real EaglePlayer worklet playing the song in 128-frame quanta (its
 * process() output, and the voice buffers it renders), with the same mute mask posted the way the mixer posts it. Stream =
 * RowPreviewStream over EaglePlayerRowAdapter (a second module instance) asked for rows 8 s and 30 s into the song,
 * the later one first so the earlier one is reached by a restart and a silent advance. The clip must equal the reference at
 * the same frames (max diff 0) for the stereo mix and every voice, and the row's first frame must be the first tick of it.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { ROOT, loadSharedWorkletScripts, startWorklet, stereoOutputs, type WorkletProc } from '../../__tests__/workletHarness';
import { EAGLE_PLAYER_FORMATS, eaglePlayerModuleName, type EaglePlayerFormat } from '../../eagleplayer/eaglePlayerFormats';
import { EaglePlayerRowAdapter, SLICE_FRAMES, type EaglePlayerWasm } from '../adapters/eaglePlayerAdapter';
import { RowPreviewStream } from '../rowPreviewStream';
import { rowClipMinFrames, type RowClip } from '../rowClip';
import type { RowTarget } from '../rowTarget';

const RATE = 48000;
const QUANTUM = 128;
const ALL = 0xf;
const SECONDS = [8, 30];
const FORMATS = ['WallyBeben', 'DaveLowe'].map((id) => EAGLE_PLAYER_FORMATS[id]!);

const bytes = (p: string) => { const b = readFileSync(resolve(ROOT, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

interface Reference { stereo: Float32Array; voices: Float32Array[]; ticksAtBlock: number[] }

/** The real worklet playing `seconds` of the song under `mask`. */
async function playback(fmt: EaglePlayerFormat, mask: number, seconds: number): Promise<Reference> {
  const { proc, send } = await startWorklet('eagleplayer', 'EaglePlayer');
  const files = (fmt.companions ?? []).map((c) => ({ name: basename(c), data: bytes(c) }));
  await send({ type: 'loadModule', moduleData: bytes(fmt.corpus), playerData: bytes(`public/eagleplayer/players/${fmt.player}`), moduleName: eaglePlayerModuleName(fmt, basename(fmt.corpus)), files });
  await send({ type: 'setMuteMask', mask });
  await send({ type: 'play' });
  const blocks = Math.ceil((seconds * RATE) / QUANTUM);
  const out: Reference = { stereo: new Float32Array(blocks * QUANTUM * 2), voices: Array.from({ length: 4 }, () => new Float32Array(blocks * QUANTUM)), ticksAtBlock: [] };
  const w = proc as WorkletProc & { voiceBufs: Float32Array[]; module: EaglePlayerWasm };
  for (let b = 0; b < blocks; b++) {
    const o = stereoOutputs(5);
    proc.process([], o);
    for (let i = 0; i < QUANTUM; i++) { out.stereo[(b * QUANTUM + i) * 2] = o[0]![0]![i]!; out.stereo[(b * QUANTUM + i) * 2 + 1] = o[0]![1]![i]!; }
    for (let v = 0; v < 4; v++) out.voices[v]!.set(w.voiceBufs[v]!.subarray(0, QUANTUM), b * QUANTUM);
    out.ticksAtBlock.push(w.module._ep_wasm_player_ticks() >>> 0);
  }
  return out;
}

const maxDiff = (a: Float32Array, b: Float32Array, n: number, bOff = 0): number => {
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i]! - b[bOff + i]!));
  return m;
};

describe('the row preview stream renders the EaglePlayer runner\'s playback from a cold seek', () => {
  beforeAll(() => loadSharedWorkletScripts());
  for (const fmt of FORMATS) {
    it(`${fmt.label} (${basename(fmt.corpus)}): rows at ${SECONDS.join(' s and ')} s equal the worklet's playback (max diff 0), also with a voice muted`, async () => {
      const module = new Uint8Array(bytes(fmt.corpus));
      const files = new Map((fmt.companions ?? []).map((c) => [basename(c), bytes(c)] as [string, ArrayBuffer]));
      const args = [fmt.id, basename(fmt.corpus), undefined, files.size ? files : undefined];
      const horizon = Math.max(...SECONDS) + 3;
      const { proc: ep } = await startWorklet('eagleplayer', 'EaglePlayer');
      const adapter = new EaglePlayerRowAdapter((ep as unknown as { module: EaglePlayerWasm }).module, RATE, async (url) => bytes(`public${decodeURIComponent(url)}`));

      for (const mask of [ALL, ALL & ~2]) {
        const ref = await playback(fmt, mask, horizon);
        // The rows: the ticks the player stands in at those times, one row = 6 ticks.
        const targets: RowTarget[] = SECONDS.map((s) => {
          const t = ref.ticksAtBlock[Math.floor((s * RATE) / QUANTUM)]!;
          const from = Math.floor(t / 6) * 6;
          return { kind: 'ticks', from, to: from + 6 };
        });
        const clips: RowClip[] = [];
        const stream = new RowPreviewStream(adapter);
        await adapter.prepare(args);
        stream.ensureOpen(module, args);
        const advance = vi.spyOn(adapter, 'advanceSilent');
        for (const target of targets.slice().reverse()) {
          const r = await stream.request(target, mask);
          expect(r.kind).toBe('clip');
          if (r.kind === 'clip') clips.push(r.clip);
        }
        expect(advance, 'the earlier row was reached by a silent advance').toHaveBeenCalledTimes(1);
        advance.mockRestore();
        clips.forEach((clip, i) => {
          const target = targets[targets.length - 1 - i] as Extract<RowTarget, { kind: 'ticks' }>;
          expect(clip.frames, 'a clip is at least the minimum preview length').toBeGreaterThanOrEqual(rowClipMinFrames(RATE));
          expect(maxDiff(clip.stereo, ref.stereo, clip.frames * 2, clip.startFrame * 2), `row ${i} stereo, mask ${mask.toString(16)}`).toBe(0);
          expect(clip.voices!.length).toBe(4);
          clip.voices!.forEach((v, vi) => expect(maxDiff(v, ref.voices[vi]!, clip.frames, clip.startFrame), `row ${i} voice ${vi}`).toBe(0));
          if (mask === ALL) expect(Math.max(...clip.stereo.map(Math.abs)), 'the row sounds').toBeGreaterThan(0.001);
          // The first frame is the first tick of the row, to one render slice: the block before it is another row.
          const block = Math.floor(clip.startFrame / QUANTUM);
          expect(ref.ticksAtBlock[block + SLICE_FRAMES > QUANTUM ? block + 1 : block]! >= target.from).toBe(true);
          if (block > 0) expect(ref.ticksAtBlock[block - 1]! < target.from + 1).toBe(true);
        });
        if (mask !== ALL) {
          // The muted voice is gone from the mix, and its buffer is silent.
          expect(Math.max(...clips[0]!.voices![1]!.map(Math.abs))).toBe(0);
        }
      }
    }, 120_000);
  }
});
