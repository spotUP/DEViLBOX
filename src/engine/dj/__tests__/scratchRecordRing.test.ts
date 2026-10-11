/**
 * Worklet record mode (owner scratch plan section 16; D4; ledger SCR-P2.4):
 * a static record is written into its own ring of
 * `public/worklets/scratch-buffer.worklet.js` with `load`, read with the
 * existing signed-rate Hermite reader from `startAt`, and reported back with
 * `position` every 128 frames. Rendered offline through the real worklet via
 * `DeckScratchBuffer` in record mode (no capture node).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';

const SR = 48000;
const RECORD_SEC = 1.0;
const TOTAL_SEC = 1.5;
const START_SEC = 0.3;

type Ring = import('../DeckScratchBuffer').DeckScratchBuffer;
let DeckScratchBuffer: typeof import('../DeckScratchBuffer').DeckScratchBuffer;
let RECORD_RING_BASE: number;

/** Deterministic test record: two partials plus seeded noise, never zero. */
function record(frames: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(frames);
  let s = 0x2545f491;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
  for (let i = 0; i < frames; i++) {
    x[i] = 0.4 * Math.sin(2 * Math.PI * 220 * i / SR) + 0.2 * Math.sin(2 * Math.PI * 1375 * i / SR) + 0.05 * next() + 0.1;
  }
  return x;
}

const quantum = (t: number) => Math.round(t * SR / 128) * 128;

async function renderRecord(rate: number, startSec: number): Promise<{ L: Float32Array; sig: Float32Array; firstFrame: number; positions: number[]; ring: Ring }> {
  const total = quantum(TOTAL_SEC);
  const ctx = new OfflineAudioContext(2, total, SR);
  const ring = new DeckScratchBuffer(ctx as unknown as AudioContext, RECORD_RING_BASE, { record: true });
  await ring.init();
  ring.playbackGain.connect(ctx.destination);
  ring.playbackGain.gain.value = 1;

  const frames = Math.round(SR * RECORD_SEC);
  const sig = record(frames);
  const buf = ctx.createBuffer(2, frames, SR);
  buf.copyToChannel(sig, 0); buf.copyToChannel(sig, 1);
  const loaded = await ring.loadRecord(buf);
  expect(loaded).toBe(frames);

  const positions: number[] = [];
  ring.onPosition = (p) => { positions.push(p.frames); };

  const startFrame = quantum(startSec);
  void ctx.suspend(startFrame / SR).then(async () => {
    ring.startAt(START_SEC, rate);
    // the start message reaches the worklet on a macrotask; resuming before it lands starts the render without the drop (CI: first frame NaN)
    await new Promise((r) => setTimeout(r, 50));
    return ctx.resume();
  });
  const out = await ctx.startRendering();
  // position messages are delivered asynchronously after the render
  await new Promise((r) => setTimeout(r, 50));
  const L = out.getChannelData(0);
  // The needle drop fades in over 48 samples (sample 0 is exactly 0), so the
  // first non-zero output sample is one frame after the drop: locate the drop
  // by alignment, not by the first non-zero sample.
  let first = startFrame;
  while (first < total && L[first] === 0) first++;
  expect(first, 'the needle drop was never heard').toBeLessThan(total - 1);
  return { L, sig, firstFrame: first - 1, positions, ring };
}

/** RMS / max abs difference of output[k] vs record[from + k] for k in [skip, n). */
function diff(L: Float32Array, first: number, sig: Float32Array, from: number, n: number, dir: 1 | -1, skip = 64): { rms: number; maxAbs: number } {
  let sum = 0, maxAbs = 0;
  for (let k = skip; k < n; k++) {
    const d = L[first + k]! - sig[from + dir * k]!;
    sum += d * d; maxAbs = Math.max(maxAbs, Math.abs(d));
  }
  return { rms: Math.sqrt(sum / (n - skip)), maxAbs };
}

describe('the scratch ring plays a static record from a position (SCR-P2.4)', () => {
  beforeAll(async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    const mod = await import('../DeckScratchBuffer');
    DeckScratchBuffer = mod.DeckScratchBuffer;
    RECORD_RING_BASE = mod.SCRATCH_RECORD_RING_BASE;
    expect(RECORD_RING_BASE).toBe(4);
  });

  it('rate 1 from 0.3 s: the output is the record from 0.3 s (RMS diff < 1e-4), nothing leaks while idle', async () => {
    const { L, sig, firstFrame, positions, ring } = await renderRecord(1, 0.2);
    const startPos = Math.round(START_SEC * SR);
    const n = Math.round(SR * RECORD_SEC) - startPos - 4;
    const d = diff(L, firstFrame, sig, startPos, n, 1);
    expect(d.rms).toBeLessThan(1e-4);
    expect(d.maxAbs).toBeLessThan(1e-4);
    // the needle drop is faded in: the first sample is silent, the 24th at half gain
    expect(L[firstFrame]).toBe(0);
    expect(Math.abs(L[firstFrame + 24]! - 0.5 * sig[startPos + 24]!)).toBeLessThan(0.02);
    let idlePeak = 0;
    for (let i = 0; i < quantum(0.2); i++) idlePeak = Math.max(idlePeak, Math.abs(L[i]!));
    expect(idlePeak).toBe(0);
    // position reports advance by 128 frames at rate 1 (one per render quantum)
    expect(positions.length).toBeGreaterThan(10);
    const deltas = positions.slice(1, 11).map((p, i) => p - positions[i]!);
    for (const d of deltas) expect(d).toBeCloseTo(128, 3);
    expect(positions[0]!).toBeGreaterThanOrEqual(startPos);
    ring.dispose();
  });

  it('rate -1 from 0.3 s: the frames come out reversed, and the read head stops at the record start', async () => {
    const { L, sig, firstFrame, positions, ring } = await renderRecord(-1, 0.2);
    const startPos = Math.round(START_SEC * SR);
    const n = startPos - 4;
    expect(diff(L, firstFrame, sig, startPos, n, -1).rms).toBeLessThan(1e-4);
    // past the start the reader clamps (a hand on a record never runs off the sound)
    const tail = L.subarray(firstFrame + startPos + 256);
    let lo = Infinity, hi = -Infinity;
    for (const v of tail) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(hi - lo).toBeLessThan(1e-6);             // held, not wrapped into the record end
    expect(Math.abs(hi - sig[0]!)).toBeLessThan(1e-3); // the first sample (the reference freezes on the edge sample)
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(0);
    ring.dispose();
  });
});
