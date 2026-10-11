/**
 * Ring / record-voice feasibility probe (SCR-P0.6, decision D4 of
 * thoughts/shared/plans/2026-10-11-scratch-dj-progress.md).
 *
 * The scratch record voice wants to put a STATIC record (a crate WAV) into
 * its own ring of `public/worklets/scratch-buffer.worklet.js` and read it
 * with the existing signed-rate Hermite reader, instead of a second
 * transport. This renders the real worklet in an OfflineAudioContext: a
 * known signal is written into ring id 4 through the capture processor,
 * capture is frozen, and the playback processor is started at position 0,
 * rate 1. The output must be the signal itself (RMS diff < 1e-4): at an
 * integer read position the Hermite kernel returns the sample unchanged.
 *
 * Numbers recorded in thoughts/shared/research/2026-10-11_scratch-baseline.md.
 */
import { describe, it, expect } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic } from '@/test/audio/realWebAudio';

const SR = 48000;
const RECORD_SEC = 0.5;
const START_SEC = 0.6;   // capture has finished writing the record by here
const TOTAL_SEC = 1.3;
const VOICE_RING_ID = 4; // D4: 4 + voice index; decks use 0-2, the tracker 3

/** Deterministic test record: two partials plus seeded noise, never zero at frame 0. */
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

describe('the scratch ring plays a static record back unchanged at rate 1 (SCR-P0.6)', () => {
  it('capture a record into ring 4, start at 0 / rate 1: output == record, RMS diff < 1e-4', async () => {
    installRealWebAudio(); resolveWorkletsFromPublic();
    const total = quantum(TOTAL_SEC);
    const ctx = new OfflineAudioContext(2, total, SR);
    await ctx.audioWorklet.addModule('/worklets/scratch-buffer.worklet.js');

    const opts = { channelCount: 2, channelCountMode: 'explicit' as ChannelCountMode, processorOptions: { bufferId: VOICE_RING_ID } };
    const capture = new AudioWorkletNode(ctx, 'scratch-capture', { ...opts, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const playback = new AudioWorkletNode(ctx, 'scratch-reverse', { ...opts, numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });

    const frames = Math.round(SR * RECORD_SEC);
    const sig = record(frames);
    const buf = ctx.createBuffer(2, frames, SR);
    buf.copyToChannel(sig, 0); buf.copyToChannel(sig, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // The capture processor is pulled only when it reaches the destination; its
    // pass-through output is muted so the render holds the playback alone.
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(capture); capture.connect(mute); mute.connect(ctx.destination);
    playback.connect(ctx.destination);
    src.start(0);

    const startFrame = quantum(START_SEC);
    void ctx.suspend(startFrame / SR).then(() => {
      capture.port.postMessage({ type: 'freeze' });
      playback.port.postMessage({ type: 'start', startPos: 0, rate: 1 });
      return ctx.resume();
    });
    const out = await ctx.startRendering();
    const L = out.getChannelData(0), R = out.getChannelData(1);

    // Where the playback actually began (message delivery is quantum-aligned).
    let first = startFrame;
    while (first < total && L[first] === 0) first++;
    const lagFrames = first - startFrame;
    expect(first, 'playback never started').toBeLessThan(total - frames);

    // The reader advances `readPosF += rate` BEFORE it interpolates, so the
    // first sample out of `start {startPos: P}` is ring[P + 1]. Measure the
    // offset instead of assuming it: output[k] against record[k + offset]
    // for offsets 0..3, and report the one that matches.
    const compare = (offset: number) => {
      let sum = 0, maxAbs = 0;
      const n = frames - 4;
      for (let k = 0; k < n; k++) {
        const d = L[first + k] - sig[k + offset];
        sum += d * d;
        if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
        if (L[first + k] !== R[first + k]) maxAbs = Infinity;
      }
      return { offset, rmsDiff: Math.sqrt(sum / n), maxAbs };
    };
    const byOffset = [0, 1, 2, 3].map(compare);
    const best = byOffset.reduce((a, b) => (b.rmsDiff < a.rmsDiff ? b : a));
    let sumRef = 0;
    for (let k = 0; k < frames; k++) sumRef += sig[k] * sig[k];
    const rmsRef = Math.sqrt(sumRef / frames);
    // Silence before the start: nothing leaks from the ring while idle.
    let idlePeak = 0;
    for (let i = 0; i < startFrame; i++) idlePeak = Math.max(idlePeak, Math.abs(L[i]));

    console.log(`[SCR-P0.6] record ${frames} frames @ ${SR} Hz; playback began ${lagFrames} frames (${(lagFrames / SR * 1000).toFixed(2)} ms) after the start message; rmsRef ${rmsRef.toFixed(4)}; idlePeak ${idlePeak}; output[k] vs record[k + offset]: ${byOffset.map(s => `+${s.offset}: rms ${s.rmsDiff.toExponential(2)} max ${s.maxAbs.toExponential(2)}`).join('; ')}`);

    expect(idlePeak).toBe(0);
    expect(best.offset, 'first sample out is startPos + 1 (pre-increment read)').toBe(1);
    expect(best.rmsDiff).toBeLessThan(1e-4);
    expect(best.maxAbs).toBeLessThan(1e-4);
  }, 120_000);
});
