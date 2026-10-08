/**
 * The Mad Professor persona's EQ performer does not make the treble burst.
 *
 * Reported 2026-10-08: "the Mad Professor has been broken for a while now, he
 * does something that makes treble overload in bursts".
 *
 * The persona is the only one on the `energy-reactive` improv driver, on all
 * four parametric bands, 12 dB deep. That driver turned every tick-to-tick
 * change in loudness into a gain written to all four bands at once, at eight
 * times the change: a swing of 0.125 in the 0..1 energy was already the full
 * +/-12 dB. A drum loop's kick-to-kick swing is 0.3-0.4, so on every beat the
 * return EQ jumped +12 dB across the bands (the 2 kHz and 8 kHz ones are the
 * treble) and, on the next quieter tick, to -12 dB. The driver has been live
 * since 8fe60862b (2026-09-19), when the EQ performer first got a snapshot in
 * an ordinary session; before that it never moved.
 *
 * Rendered through the real entry point: the AutoEQ driver's own timer reads
 * the snapshot, writes the real DubBus return EQ, and the bus is rendered
 * offline (src/test/audio/dubBusRig.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadDubBus, makeDubBusRig, releaseDubBusRigClock, type DubBusRig } from '@/test/audio/dubBusRig';

// The driver and the store reach the audio context on import: load them after
// the rig has installed Web Audio.
let driver: typeof import('@/engine/dub/AutoEQDriver');
let useDubStore: typeof import('@/stores/useDubStore').useDubStore;

beforeAll(async () => {
  await loadDubBus();
  driver = await import('@/engine/dub/AutoEQDriver');
  useDubStore = (await import('@/stores/useDubStore')).useDubStore;
}, 120_000);
afterAll(() => releaseDubBusRigClock());

const SECONDS = 14;
const MEASURE_FROM = 4;

/** One-pole-free 2nd-order high pass at 4 kHz. */
function highpass4k(x: Float32Array, sr: number): Float32Array {
  const w = 2 * Math.PI * 4000 / sr, c = Math.cos(w), a = Math.sin(w) / (2 * Math.SQRT1_2);
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = b0, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** A saw pad plus hats on every half second: broadband, with some treble. */
function feedProgramme(rig: DubBusRig): void {
  const ctx = rig.ctx, sr = ctx.sampleRate, n = ctx.length;
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let seed = 1;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = t % 0.5;
    d[i] = 0.12 * (((220 * t) % 1) * 2 - 1) + (ph < 0.05 ? rnd() * Math.exp(-ph * 60) * 0.5 : 0);
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(rig.node('input')); src.start(0);
}

/** Loudness per driver tick for a four-on-the-floor loop: kick tick, then three softer ones. */
const LOOP_ENERGY = [0.9, 0.55, 0.6, 0.5];

/** Highest 4 kHz-and-up sample over the measured span, and the per-second peaks. */
async function highBandPeak(personaDrives: boolean): Promise<{ peak: number; maxBoostDb: number; applies: number }> {
  const rig = await makeDubBusRig(SECONDS);
  feedProgramme(rig);
  useDubStore.setState({ autoDubPersona: 'madProfessor', autoDubEqMode: personaDrives ? 'improv' : 'off', autoDubEqDepthMult: 1 });
  driver.resetAutoEqDriver();
  let maxBoostDb = 0;
  const appliesBefore = driver.getAutoEqDiag().applies;
  const actions = [
    { at: 0, run: () => { rig.bus.setSettings({ enabled: true, echoEngine: 'spaceEcho' } as never); driver.startAutoEqDriver(); } },
  ];
  for (let k = 0; k * 0.18 < SECONDS - 0.2; k++) {
    actions.push({
      at: k * 0.18,
      run: () => {
        driver.setAutoEqSnapshot({
          genre: 'Unknown', energy: LOOP_ENERGY[k % 4], danceability: 0.5, bpm: 120, beatPhase: 0,
          frequencyPeaks: [], baseline: rig.bus.getReturnEQ().getParams(),
        });
        for (const b of rig.bus.getReturnEQ().getParams().p) if (b.enabled) maxBoostDb = Math.max(maxBoostDb, b.gain);
      },
    });
  }
  const out = await rig.render(actions);
  const applies = driver.getAutoEqDiag().applies - appliesBefore;
  driver.stopAutoEqDriver();
  const sr = out.sampleRate;
  const hl = highpass4k(out.getChannelData(0), sr), hr = highpass4k(out.getChannelData(1), sr);
  let peak = 0;
  for (let i = MEASURE_FROM * sr; i < hl.length; i++) peak = Math.max(peak, Math.abs(hl[i]), Math.abs(hr[i]));
  return { peak, maxBoostDb, applies };
}

describe('Mad Professor EQ performer', () => {
  it('keeps the treble peak within 3 dB of the unmodulated return on a drum loop', async () => {
    const still = await highBandPeak(false);
    const driven = await highBandPeak(true);
    const aboveDb = 20 * Math.log10(driven.peak / still.peak);
    expect(aboveDb, `treble peak ${aboveDb.toFixed(1)} dB above the unmodulated return (it was +19.7 dB)`).toBeLessThan(3);
    // The performer did move the EQ - a quiet result from a dead driver proves nothing.
    expect(driven.applies, 'the driver never wrote the EQ').toBeGreaterThan(20);
  }, 180_000);
});
