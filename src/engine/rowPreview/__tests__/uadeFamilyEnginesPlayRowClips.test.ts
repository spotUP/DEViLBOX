/**
 * U1-U3: the UADE family's engine classes are row clip players, and the request a song makes names the right row.
 *
 * The real engine classes (UADEEngine, EaglePlayerEngine) on the headless context with their real worklets in-process
 * (installWorkletRig). Per engine: a clip rendered by the row-preview stream comes out of the worklet's output 0 sample for
 * sample (before the end fade), the scope stream draws the sounding voices and leaves a muted one flat, the mask the clip is
 * rendered with follows the mixer's (and, for UADE, an isolation slot), and an isolated voice leaves the main mix and
 * arrives in its slot. And the request previewNativeRow builds for a song carries the engine's key, the load arguments
 * (UADE: with its clock), a target in the engine's terms and the engine's mask.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { basename } from 'node:path';
import { installWorkletRig, until, type Rig } from '@/engine/nuade/__tests__/nuadeEngineRig';
import { songBuffer, stereoOutputs } from '../../__tests__/workletHarness';
import { createRowPreviewClient, setRowPreviewClient } from '../rowPreviewClient';
import { RowPreviewStream } from '../rowPreviewStream';
import { UadeRowAdapter, type UadeRowArgs } from '../adapters/uadeAdapter';
import { EaglePlayerRowAdapter, type EaglePlayerWasm } from '../adapters/eaglePlayerAdapter';
import { startWorklet } from '../../__tests__/workletHarness';
import { nodeUadeWasm } from './uadeNodeModule';
import { uadeMask } from '../../uade/uadeLoadArgs';
import type { RowClip } from '../rowClip';
import type { RowPreviewRequest } from '../rowPreviewProtocol';
import type { TrackerSong } from '../../TrackerReplayer';

vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ getInstrument: () => ({ ensureInitialized: async () => {} }) }) }));

const RATE = 48000;
const RH = 'public/data/songs/rob-hubbard/skateordie.rh';
const EP = { id: 'WallyBeben', file: 'public/data/songs/wally-beben/wicked.wb', player: 'WallyBeben' };

const peakOf = (v: ArrayLike<number>) => { let m = 0; for (let i = 0; i < v.length; i++) m = Math.max(m, Math.abs(v[i]!)); return m; };

/** Pull the worklet until the clip is done: output 0, and every output's samples, per quantum. */
function pullClip(rig: Rig, clip: RowClip, outputs: number): { main: Float32Array; slot1: Float32Array } {
  const main = new Float32Array(clip.frames * 2);
  const slot1 = new Float32Array(clip.frames * 2);
  let at = 0;
  for (let q = 0; q < Math.ceil(clip.frames / 128) + 4; q++) {
    const out = stereoOutputs(outputs);
    rig.proc().process([], out);
    for (let i = 0; i < 128 && at < clip.frames; i++, at++) {
      main[at * 2] = out[0]![0]![i]!; main[at * 2 + 1] = out[0]![1]![i]!;
      slot1[at * 2] = out[1]![0]![i]!; slot1[at * 2 + 1] = out[1]![1]![i]!;
    }
  }
  return { main, slot1 };
}

describe('EaglePlayerEngine is a row clip player', () => {
  let rig: Rig;
  beforeAll(() => { rig = installWorkletRig('eagleplayer', 'EaglePlayer'); });
  afterAll(async () => {
    const { EaglePlayerEngine } = await import('@/engine/eagleplayer/EaglePlayerEngine');
    if (EaglePlayerEngine.hasInstance()) EaglePlayerEngine.getInstance().dispose();
    rig.uninstall();
  });

  it('plays the clip out of the worklet unchanged (end fade aside), draws the sounding voices, keeps a muted one flat and out of its mask', async () => {
    const { EaglePlayerEngine } = await import('@/engine/eagleplayer/EaglePlayerEngine');
    const { eaglePlayerFormat, eaglePlayerModuleName } = await import('@/engine/eagleplayer/eaglePlayerFormats');
    const engine = EaglePlayerEngine.getInstance();
    await engine.ready();
    expect(engine.rowClipMask, 'a fresh engine has heard of no mute').toBe(0xF);
    engine.setMuteMask(0b1101); // voice 1 muted
    expect(engine.rowClipMask).toBe(0b1101);

    // The target of a grid row: the follow's own inverse (6 ticks a row, row 0 on the parser's first tick).
    const song = { initialSpeed: 6, songPositions: [0, 1], patterns: [{ length: 8 }, { length: 8 }], restartPosition: 0, eaglePlayerTickGrid: { firstTick: 5, passTicks: 96 } } as unknown as Pick<TrackerSong, 'initialSpeed' | 'songPositions' | 'patterns' | 'restartPosition' | 'eaglePlayerTickGrid'>;
    expect(engine.targetOf(song, 1, 3)).toEqual({ kind: 'ticks', from: 5 + (8 + 3) * 6, to: 5 + (8 + 3) * 6 + 6 });

    // A clip of the row at ~8 s, rendered with the engine's mask.
    const fmt = eaglePlayerFormat(EP.id)!;
    const module = new Uint8Array(songBuffer(EP.file));
    const { proc } = await startWorklet('eagleplayer', 'EaglePlayer');
    const adapter = new EaglePlayerRowAdapter((proc as unknown as { module: EaglePlayerWasm }).module, RATE, async (url) => songBuffer(`public${decodeURIComponent(url)}`));
    const args = [EP.id, basename(EP.file), undefined, undefined];
    await adapter.prepare(args);
    const stream = new RowPreviewStream(adapter);
    stream.ensureOpen(module, args);
    void eaglePlayerModuleName; void fmt;
    const res = await stream.request({ kind: 'ticks', from: 400 * 1, to: 406 }, engine.rowClipMask);
    expect(res.kind).toBe('clip');
    if (res.kind !== 'clip') return;
    const clip = res.clip;
    expect(peakOf(clip.voices![1]!), 'the muted voice is silent in the clip').toBe(0);
    expect([0, 2, 3].some((v) => peakOf(clip.voices![v]!) > 0.01), 'another voice sounds').toBe(true);

    const played = vi.spyOn(engine, 'playRowClip');
    rig.posted.length = 0;
    engine.playRowClip(clip);
    await until(() => rig.posted.some((m) => m.type === 'rowClipStarted'));
    expect(played).toHaveBeenCalledTimes(1);
    const outputs = rig.nodeOptions.at(-1)?.numberOfOutputs ?? 37;
    const { main } = pullClip(rig, clip, outputs);
    expect(rig.posted.some((m) => m.type === 'rowClipDone')).toBe(true);
    const sounding = clip.frames - clip.fadeFrames;
    let maxDiff = 0;
    for (let i = 0; i < sounding * 2; i++) maxDiff = Math.max(maxDiff, Math.abs(main[i]! - clip.stereo[i]!));
    expect(maxDiff, 'the worklet emits the clip').toBe(0);
    expect(peakOf(main), 'it sounds').toBeGreaterThan(0.01);
    const osc = rig.posted.filter((m) => m.type === 'oscData') as unknown as Array<{ channels: Int16Array[] }>;
    expect(osc.length, 'the scope stream drew the clip').toBeGreaterThan(0);
    expect(osc.every((m) => m.channels[1]!.every((s) => s === 0)), 'the muted voice is flat on its scope').toBe(true);
    expect(osc.some((m) => m.channels.some((c, i) => i !== 1 && c.some((s) => s !== 0))), 'a sounding voice moves').toBe(true);
    // A song starting takes the output: a posted clip is dropped by play.
    engine.playRowClip(clip);
    await engine.ready();
    rig.posted.length = 0;
    (engine as unknown as { workletNode: { port: { postMessage(m: unknown): void } } }).workletNode.port.postMessage({ type: 'play' });
    pullClip(rig, clip, outputs);
    expect(rig.posted.some((m) => m.type === 'rowClipDone'), 'play dropped the clip').toBe(true);
    played.mockRestore();
  }, 60_000);
});

describe('UADEEngine is a row clip player', () => {
  let rig: Rig;
  beforeAll(() => { rig = installWorkletRig('uade', 'UADE'); });
  afterAll(async () => {
    const { UADEEngine } = await import('@/engine/uade/UADEEngine');
    if (UADEEngine.hasInstance()) UADEEngine.getInstance().dispose();
    rig.uninstall();
  });
  afterEach(() => setRowPreviewClient(null));

  it('plays the clip out of the worklet (an isolated voice leaves the mix for its slot), meters and scopes follow the mask', async () => {
    const { UADEEngine } = await import('@/engine/uade/UADEEngine');
    const engine = UADEEngine.getInstance();
    await engine.ready();
    expect(engine.rowClipMask, 'a fresh engine has heard of no mute or isolation').toBe(uadeMask(0xF, 0));
    engine.setMuteMask(0b1101);            // Paula voice 1 muted
    engine.addIsolation(0, 0b1000);        // voice 3 in an effect slot
    expect(engine.rowClipMask).toBe(uadeMask(0b1101, 0b1000));

    const module = new Uint8Array(songBuffer(RH));
    const args: UadeRowArgs = [basename(RH), 0, false, undefined, { kind: 'player' }];
    const adapter = new UadeRowAdapter(await nodeUadeWasm(RATE), RATE);
    const stream = new RowPreviewStream(adapter);
    stream.ensureOpen(module, args);
    const res = await stream.request({ kind: 'frames', from: 8 * RATE, to: 8 * RATE + 5292 }, engine.rowClipMask);
    expect(res.kind).toBe('clip');
    if (res.kind !== 'clip') return;
    const clip = res.clip;
    expect(peakOf(clip.voices![1]!), 'the muted voice is silent in the clip').toBe(0);
    expect(peakOf(clip.voices![3]!), 'the isolated voice sounds in its buffer').toBeGreaterThan(0.01);

    rig.posted.length = 0;
    engine.playRowClip(clip);
    await until(() => rig.posted.some((m) => m.type === 'rowClipStarted'));
    const outputs = rig.nodeOptions.at(-1)?.numberOfOutputs ?? 37;
    const { main, slot1 } = pullClip(rig, clip, outputs);
    expect(rig.posted.some((m) => m.type === 'rowClipDone')).toBe(true);
    const sounding = clip.frames - clip.fadeFrames;
    let maxDiff = 0;
    for (let i = 0; i < sounding * 2; i++) maxDiff = Math.max(maxDiff, Math.abs(main[i]! - clip.stereo[i]!));
    expect(maxDiff, 'the worklet emits the clip').toBe(0);
    // Voice 3 is on the left: its slot carries its samples on the left, and the main mix was rendered without it.
    let slotDiff = 0;
    for (let i = 0; i < sounding; i++) slotDiff = Math.max(slotDiff, Math.abs(slot1[i * 2]! - clip.voices![3]![i]!));
    expect(slotDiff, 'the isolation slot carries the isolated voice').toBe(0);
    const levels = rig.posted.filter((m) => m.type === 'chLevels') as unknown as Array<{ levels: Float32Array }>;
    expect(levels.length, 'the channel meters were fed').toBeGreaterThan(0);
    expect(levels.every((m) => m.levels[1] === 0), 'the muted voice stays dark').toBe(true);
    expect(levels.some((m) => m.levels[3]! > 0.01), 'the isolated voice still shows on its meter').toBe(true);
    const osc = rig.posted.filter((m) => m.type === 'oscData') as unknown as Array<{ channels: Int16Array[] }>;
    expect(osc.length, 'the scope stream drew the clip').toBeGreaterThan(0);
    expect(osc.every((m) => m.channels[1]!.every((s) => s === 0)), 'the muted voice is flat on its scope').toBe(true);
    expect(osc.some((m) => m.channels.some((c, i) => i !== 1 && c.some((s) => s !== 0))), 'a sounding voice moves').toBe(true);
  }, 60_000);

  it('names the row in the clock the grid is followed by, and builds the request previewNativeRow sends', async () => {
    const { UADEEngine } = await import('@/engine/uade/UADEEngine');
    const { previewNativeRow } = await import('@/engine/replayer/NativeEngineRouting');
    const engine = UADEEngine.getInstance();
    await engine.ready();
    engine.removeIsolation(0);
    engine.setMuteMask(0xF);
    const patterns = [{ length: 16 }, { length: 16 }];
    const bytes = songBuffer(RH);
    const base = { patterns, songPositions: [0, 1], initialSpeed: 6, initialBPM: 125, restartPosition: 0, instruments: [], format: 'UADE', name: 'x', uadeEditableFileName: 'skateordie.rh', uadeEditableFileData: bytes } as unknown as TrackerSong;
    const requests: RowPreviewRequest[] = [];
    setRowPreviewClient(createRowPreviewClient({ onMessage: (cb) => { (requests as unknown as { cb: unknown }).cb = cb; }, post: (msg) => { requests.push(msg.req); ((requests as unknown as { cb: (o: unknown) => void }).cb)({ type: 'result', id: msg.id, result: { kind: 'missed', reason: 'ended' } }); } }));
    const run = async (song: TrackerSong, pos: number, row: number) => { requests.length = 0; await previewNativeRow(song, pos, row, {} as never, new Set()); return requests[0]!; };

    // A player-interrupt grid: row (1, 3) is 6 interrupts at (16 + 3) * 6, in the follow's terms (interrupt count - 1).
    const player = await run({ ...base, uadePlayerTickGrid: true } as TrackerSong, 1, 3);
    expect(player.engineKey).toBe('UADEEditable');
    expect(player.target).toEqual({ kind: 'ticks', from: 19 * 6, to: 19 * 6 + 6 });
    expect(player.args).toEqual(['skateordie.rh', 0, false, undefined, { kind: 'player' }]);
    expect(player.mask).toBe(uadeMask(0xF, 0));
    // A scanned CIA grid counts from the scan's first tick.
    const cia = await run({ ...base, uadeFirstTick: 7 } as TrackerSong, 0, 2);
    expect(cia.target).toEqual({ kind: 'ticks', from: 12, to: 18 });
    expect(cia.args[4]).toEqual({ kind: 'cia', firstTick: 7 });
    // No clock: the scheduler's timing, 6 ticks of 2.5 / 125 s a row = 5760 frames at 48 kHz.
    const sched = await run(base, 1, 1);
    expect(sched.target).toEqual({ kind: 'frames', from: 17 * 5760, to: 18 * 5760 });
    expect(sched.args[4]).toEqual({ kind: 'frames' });
    // The opaque player (no editable data, a UADESynth instrument): its own fixed row length and the instrument's module.
    const classic = await run({
      ...base, uadeEditableFileData: undefined, uadeEditableFileName: undefined,
      instruments: [{ id: 1, synthType: 'UADESynth', uade: { filename: 'skateordie.rh', fileData: bytes, currentSubsong: 0 } }],
    } as unknown as TrackerSong, 1, 1);
    expect(classic.engineKey).toBe('UADE classic');
    expect(classic.target).toEqual({ kind: 'frames', from: 17 * 5292, to: 18 * 5292 });
    expect(classic.args).toEqual(['skateordie.rh', 0, false, undefined, { kind: 'frames' }]);
    expect(classic.data.length).toBe(bytes.byteLength);
  }, 60_000);
});
