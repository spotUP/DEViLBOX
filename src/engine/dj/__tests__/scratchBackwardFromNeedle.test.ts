/**
 * DJ scratch was audible in one direction only (reported 2026-09-27,
 * measured 2026-09-29 on deck A: a stopped deck's backward pull read RMS
 * 0.0003 while a forward push after it read 0.0185).
 *
 * Three defects in the scratch tape (public/worklets/scratch-buffer.worklet.js):
 *   1. The tracker view's scratch buffer used ring 0, deck A's ring. Both
 *      capture nodes stay alive, so two writers interleaved their blocks into
 *      one tape (the write position ran at twice real time).
 *   2. A backward scratch started at the MIDPOINT of the capture - up to a
 *      minute in the past - instead of at the needle.
 *   3. A stopped deck kept recording silence, carrying the needle away from
 *      the last audio played.
 *
 * Drives the real worklet processors headless.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, stereoOutputs } from '@engine/__tests__/workletHarness';

type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null }; process(i: Float32Array[][], o: Float32Array[][]): boolean };
type ProcClass = new (o: { processorOptions: { bufferId: number } }) => Proc;

let Capture!: ProcClass;
let Playback!: ProcClass;

beforeEach(() => {
  // A fresh AudioWorkletGlobalScope per test: the rings are module state.
  const classes: Record<string, ProcClass> = {};
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (n: string, cls: ProcClass) => { classes[n] = cls; },
    sampleRate: 48000,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/worklets/scratch-buffer.worklet.js'), 'utf8'))(...Object.values(scope));
  Capture = classes['scratch-capture'];
  Playback = classes['scratch-reverse'];
});

const msg = (p: Proc, data: unknown) => p.port.onmessage!({ data });

/** Feed `blocks` 128-frame blocks of a ramp starting at `from` (value = frame index / 1e6). */
function feed(cap: Proc, from: number, blocks: number): number {
  let n = from;
  for (let b = 0; b < blocks; b++) {
    const L = new Float32Array(128), R = new Float32Array(128);
    for (let i = 0; i < 128; i++) { L[i] = R[i] = (n + i) / 1e6; }
    cap.process([[L, R]], stereoOutputs(1));
    n += 128;
  }
  return n;
}

function silence(cap: Proc, blocks: number): void {
  for (let b = 0; b < blocks; b++) cap.process([[new Float32Array(128), new Float32Array(128)]], stereoOutputs(1));
}

function firstBackwardSamples(bufferId: number): number[] {
  const play = new Playback({ processorOptions: { bufferId } });
  msg(play, { type: 'startFromWrite', rate: -1, anchor: 'write' });
  msg(play, { type: 'snapRate', rate: -1 });
  const out = stereoOutputs(1);
  play.process([], out);
  return Array.from(out[0][0].slice(4, 12));
}

describe('DJ backward scratch reads the record from the needle', () => {
  it('starts at the last audio captured, walking back through it', () => {
    const cap = new Capture({ processorOptions: { bufferId: 0 } });
    const end = feed(cap, 0, 400); // ~1 s of a ramp
    const got = firstBackwardSamples(0);
    // Backward from the needle: values just below the newest frame, falling.
    for (const v of got) expect(v * 1e6).toBeGreaterThan(end - 40);
    expect(got[0]).toBeGreaterThan(got[got.length - 1]);
  });

  it('a stopped deck does not record silence over the needle', () => {
    const cap = new Capture({ processorOptions: { bufferId: 0 } });
    const end = feed(cap, 0, 400);
    msg(cap, { type: 'sourceRunning', running: false });
    silence(cap, 2000); // ~5 s stopped
    const got = firstBackwardSamples(0);
    for (const v of got) expect(v * 1e6).toBeGreaterThan(end - 40);
  });

  it('the tracker scratch ring (3) and deck A (0) are separate tapes', () => {
    const deckA = new Capture({ processorOptions: { bufferId: 0 } });
    const tracker = new Capture({ processorOptions: { bufferId: 3 } });
    let n = 0;
    for (let b = 0; b < 400; b++) { n = feed(deckA, n, 1); silence(tracker, 1); }
    const got = firstBackwardSamples(0);
    // Interleaved with the tracker's silent blocks, half the tape would be 0.
    for (const v of got) expect(v * 1e6).toBeGreaterThan(n - 40);
    // ...and the tracker controller really uses its own id, not a deck's.
    const src = readFileSync(resolve(ROOT, 'src/engine/TrackerScratchController.ts'), 'utf8');
    expect(src).toMatch(/new DeckScratchBuffer\(ctx, TRACKER_SCRATCH_BUFFER_ID\)/);
    expect(readFileSync(resolve(ROOT, 'src/engine/dj/DeckScratchBuffer.ts'), 'utf8')).toMatch(/TRACKER_SCRATCH_BUFFER_ID = 3;/);
  });
});
