/**
 * U1/U2/U4: a row rendered by the row-preview stream from a cold seek is UADE's playback, sample for sample.
 *
 * Real UADE.wasm in Node. Reference = the real UADE worklet playing the song in 128-frame quanta (its process() output;
 * the four Paula channels through the dub-send outputs), with the same mute / isolation messages the mixer posts. Stream =
 * RowPreviewStream over UadeRowAdapter (a second module instance) asked for a row 8 s and one 30 s into the song, the
 * later one first so the earlier one is reached by a restart and a silent advance. The clip must equal the reference at the
 * same frames (max diff 0) for the stereo mix and every voice. Three kinds of row: a player-tick row (Rob Hubbard), a frame
 * range (the opaque player's rows; a TFMX song with a companion file, so a restart must keep its sample file), and a
 * multi-subsong song that is not pinned (the adapter must start on the subsong the worklet's probe picks).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { basename } from 'node:path';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs, type WorkletProc } from '../../__tests__/workletHarness';
import { uadeTransform } from '../../uade/uadeGlue';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';
import { UadeRowAdapter, SLICE_FRAMES, type UadeRowArgs } from '../adapters/uadeAdapter';
import { uadeMask } from '../../uade/uadeLoadArgs';
import { RowPreviewStream } from '../rowPreviewStream';
import { rowClipMinFrames, type RowClip } from '../rowClip';
import type { RowTarget } from '../rowTarget';
import { nodeUadeWasm } from './uadeNodeModule';

const RATE = 48000;
const QUANTUM = 128;
const SECONDS = [8, 30];

interface Song { name: string; file: string; subsong: number; pin: boolean; companions?: Record<string, string> }
const RH: Song = { name: 'Rob Hubbard skateordie.rh', file: 'public/data/songs/rob-hubbard/skateordie.rh', subsong: 0, pin: false };
const TFMX: Song = { name: 'TFMX hbtitle (companion smpl)', file: 'public/data/songs/tfmx/mdat.hbtitle', subsong: 0, pin: false, companions: { 'smpl.hbtitle': 'public/data/songs/tfmx/smpl.hbtitle' } };
const BATMAN: Song = { name: 'Desire batmanreturns.dsr (unpinned multi-subsong)', file: 'public/data/songs/desire/batmanreturns.dsr', subsong: 0, pin: false };

interface Reference { stereo: Float32Array; voices: Float32Array[]; playerTicks: number[] }

const companionsOf = (s: Song) => new Map(Object.entries(s.companions ?? {}).map(([n, p]) => [n, songBuffer(p)] as [string, ArrayBuffer]));

/** The real worklet playing `seconds` of the song; `audible` and `isolated` are the voices the mixer / an isolation slot hold. */
async function playback(s: Song, audible: number, isolated: number, seconds: number): Promise<Reference> {
  const { proc, send } = await startWorklet('uade', 'UADE', async (c) => uadeTransform(c));
  const file = basename(s.file);
  await send({
    type: 'load', buffer: songBuffer(s.file), filenameHint: uadePlayerHint(file), skipScan: true, subsong: s.subsong, pinSubsong: s.pin,
    companions: [...companionsOf(s)].map(([filename, buffer]) => ({ filename, buffer })),
  });
  await send({ type: 'setMuteMask', mask: audible });
  if (isolated) await send({ type: 'addIsolation', slotIndex: 0, channelMask: isolated });
  for (let ch = 0; ch < 4; ch++) await send({ type: 'dubChannelEnable', channel: ch });
  await send({ type: 'play' });
  const blocks = Math.ceil((seconds * RATE) / QUANTUM);
  const out: Reference = { stereo: new Float32Array(blocks * QUANTUM * 2), voices: Array.from({ length: 4 }, () => new Float32Array(blocks * QUANTUM)), playerTicks: [] };
  const w = proc as WorkletProc & { _wasm: { _uade_wasm_get_player_tick_count(): number } };
  for (let b = 0; b < blocks; b++) {
    const o = stereoOutputs(37);
    proc.process([], o);
    for (let i = 0; i < QUANTUM; i++) { out.stereo[(b * QUANTUM + i) * 2] = o[0]![0]![i]!; out.stereo[(b * QUANTUM + i) * 2 + 1] = o[0]![1]![i]!; }
    for (let v = 0; v < 4; v++) out.voices[v]!.set(o[5 + v]![0]!.subarray(0, QUANTUM), b * QUANTUM);
    out.playerTicks.push(w._wasm._uade_wasm_get_player_tick_count() >>> 0);
  }
  return out;
}

const maxDiff = (a: Float32Array, b: Float32Array, n: number, bOff = 0): number => {
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i]! - b[bOff + i]!));
  return m;
};

async function freshAdapter(): Promise<UadeRowAdapter> { return new UadeRowAdapter(await nodeUadeWasm(RATE), RATE); }

function expectClipEqualsPlayback(clip: RowClip, ref: Reference, label: string): void {
  expect(clip.frames, 'a clip is at least the minimum preview length').toBeGreaterThanOrEqual(rowClipMinFrames(RATE));
  expect(maxDiff(clip.stereo, ref.stereo, clip.frames * 2, clip.startFrame * 2), `${label} stereo`).toBe(0);
  expect(clip.voices!.length).toBe(4);
  clip.voices!.forEach((v, vi) => expect(maxDiff(v, ref.voices[vi]!, clip.frames, clip.startFrame), `${label} voice ${vi}`).toBe(0));
}

describe('the row preview stream renders UADE\'s playback from a cold seek', () => {
  beforeAll(() => loadSharedWorkletScripts());

  it(`${RH.name}: player-tick rows at ${SECONDS.join(' s and ')} s equal the worklet (max diff 0), with a voice muted and with a voice isolated`, async () => {
    const module = new Uint8Array(songBuffer(RH.file));
    const args: UadeRowArgs = [basename(RH.file), RH.subsong, RH.pin, undefined, { kind: 'player' }];
    const adapter = await freshAdapter();
    const cases = [{ audible: 0xF, isolated: 0 }, { audible: 0xF & ~2, isolated: 0 }, { audible: 0xF, isolated: 8 }];
    for (const c of cases) {
      const ref = await playback(RH, c.audible, c.isolated, Math.max(...SECONDS) + 3);
      // The rows: the player ticks the song stands in at those times; the grid names tick p as p - 1, one row = 6 ticks.
      const targets: RowTarget[] = SECONDS.map((s) => {
        const q = ref.playerTicks[Math.floor((s * RATE) / QUANTUM)]! - 1;
        const from = Math.floor(q / 6) * 6;
        return { kind: 'ticks', from, to: from + 6 };
      });
      const stream = new RowPreviewStream(adapter);
      stream.ensureOpen(module, args);
      const advance = vi.spyOn(adapter, 'advanceSilent');
      const clips: RowClip[] = [];
      for (const target of targets.slice().reverse()) {
        const r = await stream.request(target, uadeMask(c.audible, c.isolated));
        expect(r.kind).toBe('clip');
        if (r.kind === 'clip') clips.push(r.clip);
      }
      expect(advance, 'the earlier row was reached by a silent advance').toHaveBeenCalledTimes(1);
      advance.mockRestore();
      clips.forEach((clip, i) => {
        const target = targets[targets.length - 1 - i] as Extract<RowTarget, { kind: 'ticks' }>;
        expectClipEqualsPlayback(clip, ref, `row ${i}, audible ${c.audible.toString(16)} isolated ${c.isolated.toString(16)}`);
        if (c.audible === 0xF && !c.isolated) expect(Math.max(...clip.stereo.map(Math.abs)), 'the row sounds').toBeGreaterThan(0.001);
        // The first frame is the first tick of the row, to one render slice: the block before it is another row.
        const block = Math.floor(clip.startFrame / QUANTUM);
        const rowTick = (b: number) => ref.playerTicks[b]! - 1;
        expect(rowTick(Math.min(block + (clip.startFrame % QUANTUM + SLICE_FRAMES > QUANTUM ? 1 : 0), ref.playerTicks.length - 1)) >= target.from).toBe(true);
        if (block > 0) expect(rowTick(block - 1) < target.from).toBe(true);
      });
      if (c.audible !== 0xF) expect(Math.max(...clips[0]!.voices![1]!.map(Math.abs)), 'the muted voice is silent in its buffer').toBe(0);
    }
  }, 180_000);

  for (const song of [RH, TFMX, BATMAN]) {
    it(`${song.name}: frame-range rows at ${SECONDS.join(' s and ')} s equal the worklet (max diff 0), the earlier one after a restart`, async () => {
      const module = new Uint8Array(songBuffer(song.file));
      const args: UadeRowArgs = [basename(song.file), song.subsong, song.pin, song.companions ? companionsOf(song) : undefined, { kind: 'frames' }];
      const ref = await playback(song, 0xF, 0, Math.max(...SECONDS) + 3);
      const targets: RowTarget[] = SECONDS.map((s) => ({ kind: 'frames', from: s * RATE + 1234, to: s * RATE + 1234 + 5292 }));
      const adapter = await freshAdapter();
      const stream = new RowPreviewStream(adapter);
      stream.ensureOpen(module, args);
      const restart = vi.spyOn(adapter, 'restart');
      const clips: RowClip[] = [];
      for (const target of targets.slice().reverse()) {
        const r = await stream.request(target, uadeMask(0xF, 0));
        expect(r.kind).toBe('clip');
        if (r.kind === 'clip') clips.push(r.clip);
      }
      expect(restart, 'the earlier row was reached by a restart (the companion file must survive it)').toHaveBeenCalledTimes(1);
      restart.mockRestore();
      clips.forEach((clip, i) => {
        expect(clip.startFrame).toBe(targets[targets.length - 1 - i]!.kind === 'frames' ? (targets[targets.length - 1 - i] as { from: number }).from : -1);
        expectClipEqualsPlayback(clip, ref, `${song.name} row ${i}`);
      });
      expect(Math.max(...clips[0]!.stereo.map(Math.abs)), 'the row sounds').toBeGreaterThan(0.001);
    }, 180_000);
  }
});
