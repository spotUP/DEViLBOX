/**
 * PITCH-SLIDER-ALL-FORMATS / Hively (AHX, HVL): the tracker pitch slider moves an AHX song.
 *
 * The REAL worklet and WASM play aces_high.ahx (corpus song) four ways and the test measures, from what they produce:
 *   tempo = song steps (position * track length + row) the replayer advanced over the same output length
 *   pitch = the frequency scale that best maps the plain run's spectrum onto the run's spectrum
 *
 *   Key Lock on  -> setTempoScale(1.5): tempo x1.5, pitch unchanged (the replayer's samples per tick)
 *   Key Lock off -> setRateFactor(1.5): tempo x1.5, pitch x1.5 (the ring is read as a tape transport)
 *   setTempoScale(1): bit-identical to never sending it (the song's own tick length is kept exactly)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { openWorklet, sameAudio, BLOCK, SAMPLE_RATE, type WorkletHarness } from './helpers/workletHarness';
import { hivelyTransform } from '@/engine/hively/HivelyEngine';

const FILE = 'public/data/songs/formats/aces_high.ahx';
const worklet = { dir: 'hively', name: 'Hively', factory: 'createHively', transformJs: hivelyTransform };
const BLOCKS = Math.round((12 * SAMPLE_RATE) / BLOCK); // 12 s of output

function bytes(): ArrayBuffer {
  const f = readFileSync(FILE);
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
}

async function play(setup: Array<Record<string, unknown>>): Promise<WorkletHarness> {
  const h = await openWorklet(worklet);
  for (const m of setup) await h.send(m);
  await h.send({ type: 'loadTune', buffer: bytes(), defStereo: 2 });
  await h.send({ type: 'play' });
  return h;
}

/** Song steps the replayer has advanced, from the last position it reported. */
function stepsPlayed(h: WorkletHarness): number {
  const meta = h.posted.find((m) => m.type === 'tuneLoaded') as { trackLength: number } | undefined;
  const pos = [...h.posted].reverse().find((m) => m.type === 'position') as { position: number; row: number } | undefined;
  if (!meta || !pos) return 0;
  return pos.position * meta.trackLength + pos.row;
}

const N = 4096;

/** Mean magnitude spectrum of the left channel over 4096-sample Hann frames. */
function spectrum(blocks: Float32Array[]): Float64Array {
  const left: number[] = [];
  for (const b of blocks) for (let i = 0; i < BLOCK; i++) left.push(b[i]);
  const acc = new Float64Array(N / 2);
  for (let off = 0; off + N <= left.length; off += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = left[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += Math.hypot(re[k], im[k]);
  }
  return acc;
}

/**
 * Pitch ratio of `b` against `a`: the frequency scale s that best maps a's spectrum onto b's
 * (b(f * s) ~ a(f)), searched 0.7..2.0 over 80 Hz..4 kHz. 1 = same key.
 */
function pitchRatio(a: Float64Array, b: Float64Array): number {
  const hz = SAMPLE_RATE / N;
  const lo = Math.ceil(80 / hz), hi = Math.floor(4000 / hz);
  const at = (spec: Float64Array, bin: number) => {
    const i = Math.floor(bin), f = bin - i;
    return i + 1 < spec.length ? spec[i] * (1 - f) + spec[i + 1] * f : 0;
  };
  let best = 1, bestScore = -Infinity;
  for (let s = 0.7; s <= 2.0; s += 0.005) {
    let dot = 0, na = 0, nb = 0;
    for (let k = lo; k <= hi; k++) {
      const x = a[k], y = at(b, k * s);
      dot += x * y; na += x * x; nb += y * y;
    }
    const score = dot / Math.sqrt(na * nb || 1);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
}

describe('Hively: the pitch slider moves an AHX song', { timeout: 300000 }, () => {
  it('tempo scale moves tempo only, rate factor moves tempo and pitch, scale 1 is bit-identical', async () => {
    const plainH = await play([]);
    const plain = plainH.render(BLOCKS);
    const plainSteps = stepsPlayed(plainH);
    const plainSpec = spectrum(plain);

    const unity = (await play([{ type: 'setTempoScale', value: 1 }])).render(BLOCKS);
    expect(sameAudio(unity, plain), 'scale 1 plays the song exactly as the reference').toBe(true);

    const lockedH = await play([{ type: 'setTempoScale', value: 1.5 }]);
    const locked = lockedH.render(BLOCKS);
    const lockedTempo = stepsPlayed(lockedH) / plainSteps;
    const lockedPitch = pitchRatio(plainSpec, spectrum(locked));

    const varispeedH = await play([{ type: 'setRateFactor', value: 1.5 }]);
    const varispeed = varispeedH.render(BLOCKS);
    const varispeedTempo = stepsPlayed(varispeedH) / plainSteps;
    const varispeedPitch = pitchRatio(plainSpec, spectrum(varispeed));

    console.log(`[hivelyTempoScale] steps plain=${plainSteps} | ` +
      `key lock tempo x${lockedTempo.toFixed(3)} pitch x${lockedPitch.toFixed(3)} | ` +
      `varispeed tempo x${varispeedTempo.toFixed(3)} pitch x${varispeedPitch.toFixed(3)}`);

    expect(plainSteps, 'the song advanced (sentinel)').toBeGreaterThan(20);
    expect(lockedTempo).toBeGreaterThan(1.4);
    expect(lockedTempo).toBeLessThan(1.6);
    expect(lockedPitch).toBeGreaterThan(0.97);
    expect(lockedPitch).toBeLessThan(1.03);
    expect(varispeedTempo).toBeGreaterThan(1.4);
    expect(varispeedTempo).toBeLessThan(1.6);
    expect(varispeedPitch).toBeGreaterThan(1.45);
    expect(varispeedPitch).toBeLessThan(1.55);
  });
});
