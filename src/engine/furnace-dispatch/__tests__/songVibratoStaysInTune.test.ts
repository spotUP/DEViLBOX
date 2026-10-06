/**
 * A DefleMask song's vibrato stayed within a fraction of a semitone: the song
 * 7_grand_cop.dmf (Game Boy) sounded "off key and wobbly" (2026-10-06).
 *
 * The sequencer produces pitch offsets in the song's linear-pitch units (its
 * vibrato 04 86 peaks at +-31 on the wave channel), but the chips kept the
 * default pitch model because the song's compat flags reached the chips from a
 * racing `.then` in usePatternPlayback, before the chips existed: +-31 became
 * +-5 semitones (545 Hz to 912 Hz around F5 at 697 Hz). Driven through the real
 * entry, FurnaceDispatchEngine.startWithCoordinator, on the real worklet and WASM.
 * Reference: Furnace's linear pitch, 128 units per semitone, so +-31 is +-0.25
 * semitone; the tolerance here is +-0.6 semitone.
 */
import { it, expect } from 'vitest';
import { startWorklet, stereoOutputs, loadSharedWorkletScripts, songBuffer } from '../../__tests__/workletHarness';
import { parseFurnaceFile } from '@/lib/import/parsers/FurnaceToSong';
import { installFurnaceFileOpsWasm } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { FurnaceDispatchEngine } from '../FurnaceDispatchEngine';

type Eng = {
  workletNode: unknown; initialized: boolean;
  handleWorkletMessage(m: unknown): void;
  startWithCoordinator(c: object, o: object): Promise<{ started: boolean }>;
  seqStop(): void;
};

/** Strongest frequency in lo..hi Hz of one window, by a direct DFT scan. */
function peakHz(x: Float32Array, lo: number, hi: number): number {
  let best = 0, bestMag = -1;
  for (let f = lo; f <= hi; f += 1) {
    let re = 0, im = 0;
    for (let i = 0; i < x.length; i++) { const a = (2 * Math.PI * f * i) / 48000; const w = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length)); re += w * Math.cos(a); im += w * Math.sin(a); }
    const mag = re * re + im * im;
    if (mag > bestMag) { bestMag = mag; best = f; }
  }
  return best;
}

it('keeps the wave channel within 0.6 semitone of its note while the song vibrato runs', async () => {
  installFurnaceFileOpsWasm();
  const song = await parseFurnaceFile(songBuffer('public/data/songs/deflemask/DevEd/7_grand_cop.dmf'), '7_grand_cop.dmf');
  loadSharedWorkletScripts();
  const { proc, send } = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  const p = proc as unknown as { port: { postMessage(m: unknown): void }; process(i: unknown[], o: Float32Array[][]): boolean };
  const eng = FurnaceDispatchEngine.getInstance() as unknown as Eng;
  p.port.postMessage = (m) => eng.handleWorkletMessage(m);
  eng.workletNode = { port: { postMessage: (m: unknown) => { void send(m); }, onmessage: null }, connect() {} };
  eng.initialized = true;
  const r = await eng.startWithCoordinator({ dispatchEnginePosition() {} }, {
    song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
  });
  expect(r.started).toBe(true);
  for (let c = 0; c < 4; c++) await send({ type: 'mute', chan: c, mute: c !== 2 });

  const outs = stereoOutputs(37);
  const pcm: number[] = [];
  for (let b = 0; b < (48000 * 1.4) / 128; b++) { p.process([], outs); for (let i = 0; i < 128; i++) pcm.push(outs[0][0][i]); }
  eng.seqStop();

  // Channel 2 plays F6 on a wave an octave down: 697 Hz. Vibrato starts at 0.55 s.
  const note = 697, tol = 2 ** (0.6 / 12);
  const peaks: number[] = [];
  for (let t = 0.6; t < 1.3; t += 0.0667) peaks.push(peakHz(Float32Array.from(pcm.slice(Math.floor(t * 48000), Math.floor(t * 48000) + 4096)), 300, 1000));
  for (const f of peaks) { expect(f).toBeGreaterThan(note / tol); expect(f).toBeLessThan(note * tol); }
}, 120000);

it('a fresh chip is in full linear pitch: a pitch offset of 47 moves a note by a fraction of a semitone', async () => {
  loadSharedWorkletScripts();
  const { proc, send } = await startWorklet('furnace-dispatch', 'FurnaceDispatch');
  await send({ type: 'createChip', platformType: 6, sampleRate: 48000 });
  await send({ type: 'dispatch', platformType: 6, cmd: 0, chan: 0, val1: 58, val2: 0 });
  await send({ type: 'dispatch', platformType: 6, cmd: 5, chan: 0, val1: 15, val2: 0 });
  await send({ type: 'dispatch', platformType: 6, cmd: 9, chan: 0, val1: 47, val2: 0 });
  const outs = stereoOutputs(37);
  const pcm: number[] = [];
  for (let b = 0; b < 12000 / 128; b++) { (proc as unknown as { process(i: unknown[], o: Float32Array[][]): boolean }).process([], outs); for (let i = 0; i < 128; i++) pcm.push(outs[0][0][i]); }
  const hz = peakHz(Float32Array.from(pcm.slice(4000, 8096)), 400, 700);
  expect(hz).toBeGreaterThan(466 / 2 ** (0.6 / 12)); // A#4 at 466 Hz
  expect(hz).toBeLessThan(466 * 2 ** (0.6 / 12));
}, 60000);
