/**
 * Every tape echo on the dub bus wears its repeats: each pass through the
 * feedback loop is darker and noisier than the one before.
 *
 * Owner, 2026-11-28: "our tape echoes do not degrade per repeat and do not get
 * hissier with each repeat". Measured before the fix (this file, same burst):
 * no engine had a noise source in its loop, so the gap after a repeat fell with
 * the repeat instead of settling on a hiss floor (RE-201 -69 -> -82 dBFS,
 * RE-Tape Echo -42 -> -98 dBFS, AnotherDelay -233 dBFS throughout), and the
 * RE-201's loop filter sat at 8.9 kHz for a 300 ms echo, so its fourth repeat
 * had lost 0.8 dB of 4 kHz against 500 Hz. After: a constant floor at -58 to
 * -69 dBFS, 16 dB closer to the signal by repeat 4, and 6 dB of 4 kHz lost.
 *
 * A burst of 500 Hz + 4 kHz goes in once; each repeat is then read for
 *   - its 4 kHz level against its 500 Hz level (high-frequency loss),
 *   - the hiss in the gap after it against its 500 Hz level (noise floor
 *     relative to the signal),
 *   - the noise riding on it, 5.2-7.8 kHz, read midway between the 500 Hz
 *     harmonics so distortion products do not count as noise.
 * The three WASM engines run their real builds; the Space Echo runs its real
 * node graph on an OfflineAudioContext.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { loadWasmEffect } from '@engine/effects/__tests__/wasmEffectHarness';

const SR = 48000;
const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);

interface Repeat { n: number; lowDb: number; hfRatioDb: number; gapDb: number; gapRelDb: number; ridingRelDb: number }

function burst(lengthSec: number): Float32Array {
  const n = Math.round(lengthSec * SR);
  const edge = Math.round(0.005 * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / edge, (n - 1 - i) / edge);
    x[i] = 0.2 * fade * (Math.sin(2 * Math.PI * 500 * i / SR) + Math.sin(2 * Math.PI * 4000 * i / SR));
  }
  return x;
}

/** Amplitude at `f` over a Hann-windowed slice. */
function tone(y: Float32Array, from: number, len: number, f: number): number {
  const c = 2 * Math.cos(2 * Math.PI * f / SR);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (len - 1));
    const s0 = (y[from + i] ?? 0) * w + c * s1 - s2; s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) * 4 / len;
}

function rms(y: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += y[i] * y[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Read `count` repeats of a burst that entered at `t0` through an echo of `delaySec`. */
function readRepeats(y: Float32Array, t0: number, delaySec: number, burstSec: number, count: number): Repeat[] {
  const out: Repeat[] = [];
  const margin = 0.012;
  const winLen = Math.round((burstSec - 2 * margin) * SR);
  for (let n = 1; n <= count; n++) {
    const start = Math.round((t0 + n * delaySec + margin) * SR);
    const low = tone(y, start, winLen, 500);
    const high = tone(y, start, winLen, 4000);
    let riding = 0, bins = 0;
    for (let f = 5250; f <= 7750; f += 500) { const a = tone(y, start, winLen, f); riding += a * a; bins++; }
    const gapFrom = Math.round((t0 + n * delaySec + burstSec + 0.012) * SR);
    const gapTo = Math.round((t0 + (n + 1) * delaySec - 0.008) * SR);
    const gap = rms(y, gapFrom, gapTo);
    out.push({
      n, lowDb: db(low), hfRatioDb: db(high / low), gapDb: db(gap), gapRelDb: db(gap / low),
      ridingRelDb: db(Math.sqrt(riding / bins) / low),
    });
  }
  return out;
}

function table(name: string, r: Repeat[]): string {
  const f = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-inf').padStart(7);
  return [`[tape-echo] ${name}`, '  rep   500Hz  4k/500  gap dBFS  gap/sig  riding/sig',
    ...r.map((x) => `  ${x.n}   ${f(x.lowDb)} ${f(x.hfRatioDb)}  ${f(x.gapDb)}  ${f(x.gapRelDb)}   ${f(x.ridingRelDb)}`)].join('\n');
}

interface WasmCase {
  name: string; dir: string; stem: string; prefix: string;
  params: Record<string, number>; delaySec: number; burstSec: number;
  /** Repeat compared against repeat 1; default 4. */
  last?: number;
}

/** The parameters each dub-bus adapter sets at the default bus (300 ms, intensity 0.62). */
const WASM_CASES: WasmCase[] = [
  {
    name: 'RE-201', dir: 're201', stem: 'RE201', prefix: 're201', delaySec: 0.3, burstSec: 0.08,
    params: { delay_mode: 1, repeat_rate: (700 - 300) / 650, intensity: 0.62, echo_volume: 0.9, reverb_volume: 0, bass: 0.7, treble: 0.3, input_level: 1 },
  },
  {
    name: 'AnotherDelay', dir: 'another-delay', stem: 'AnotherDelay', prefix: 'another_delay', delaySec: 0.3, burstSec: 0.08,
    params: { delay_time: 300, feedback: 0.62 * 0.55, gain: 1, lowpass: 4000, highpass: 350, flutter_freq: 3.5, flutter_depth: 0.002, wow_freq: 0.3, wow_depth: 0.001, reverb_enabled: 0 },
  },
  {
    // The bus's 300 ms clamps to the RE-Tape Echo's longest head time, 94 ms.
    name: 'RE-Tape Echo', dir: 're-tape-echo', stem: 'RETapeEcho', prefix: 're_tape_echo', delaySec: 0.094, burstSec: 0.04,
    // Its repeats drop 40 dB a pass at the bus intensity: repeat 3 is already under the hiss floor.
    last: 2,
    params: { mode: 3, repeat_rate: 0, intensity: 0.5708, echo_volume: 0.85, wow: 0.3, flutter: 0.25, dirt: 0.15, playhead_filter: 1 },
  },
];

async function renderWasm(c: WasmCase, input: Float32Array | null, seconds: number, warmSec = 3): Promise<Float32Array> {
  const { m, heap } = await loadWasmEffect(c.dir, c.stem);
  const h = m[`_${c.prefix}_create`](SR);
  for (const [k, v] of Object.entries(c.params)) m[`_${c.prefix}_set_${k}`](h, v);
  const block = 128, bytes = block * 4;
  const iL = m._malloc(bytes), iR = m._malloc(bytes), oL = m._malloc(bytes), oR = m._malloc(bytes);
  const total = Math.round((warmSec + seconds) * SR / block) * block;
  const warm = Math.round(warmSec * SR / block) * block;
  const y = new Float32Array(total - warm);
  const x = new Float32Array(block);
  for (let pos = 0; pos < total; pos += block) {
    x.fill(0);
    if (input && pos >= warm) for (let i = 0; i < block; i++) x[i] = input[pos - warm + i] ?? 0;
    heap().set(x, iL >> 2); heap().set(x, iR >> 2);
    m[`_${c.prefix}_process`](h, iL, iR, oL, oR, block);
    if (pos >= warm) y.set(heap().subarray(oL >> 2, (oL >> 2) + block), pos - warm);
  }
  m[`_${c.prefix}_destroy`](h);
  return y;
}

async function renderSpaceEcho(input: Float32Array | null, seconds: number): Promise<Float32Array> {
  const Tone = await import('tone');
  const { SpaceEchoEffect } = await import('@engine/effects/SpaceEchoEffect');
  const ctx = new OfflineAudioContext(1, Math.round(seconds * SR), SR);
  Tone.setContext(ctx);
  const fx = new SpaceEchoEffect({
    mode: 1, rate: 300, intensity: 0.62, echoVolume: 0.7, reverbVolume: 0, bass: 2, treble: -2,
    wow: 0.35, wet: 1, feedbackHpfHz: 350, feedbackLpfHz: 4000,
  });
  if (input) {
    const buf = ctx.createBuffer(1, input.length, SR);
    buf.getChannelData(0).set(input);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    Tone.connect(src, fx.input);
    src.start(0);
  }
  Tone.connect(fx.output, ctx.destination);
  const rendered = await ctx.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

/** What a worn repeat must show: repeat `last` against repeat 1. */
function expectWear(name: string, r: Repeat[], last: number): void {
  const first = r[0], late = r[last - 1];
  expect(first.gapDb, `${name}: hiss after repeat 1`).toBeGreaterThan(-90);
  expect(late.gapRelDb - first.gapRelDb, `${name}: noise floor against the signal, repeat ${last} vs 1`).toBeGreaterThan(6);
  expect(first.hfRatioDb - late.hfRatioDb, `${name}: 4 kHz lost against 500 Hz, repeat ${last} vs 1`).toBeGreaterThan(3);
  expect(late.ridingRelDb - first.ridingRelDb, `${name}: noise riding on repeat ${last} vs 1`).toBeGreaterThan(2);
}

describe('tape echoes wear each repeat', () => {
  beforeAll(() => { installRealWebAudio(); });

  for (const c of WASM_CASES) {
    it(`${c.name}: later repeats are darker and hissier`, async () => {
      const y = await renderWasm(c, burst(c.burstSec), c.delaySec * 7 + 0.5);
      const r = readRepeats(y, 0, c.delaySec, c.burstSec, 5);
      console.log(table(c.name, r));
      expectWear(c.name, r, c.last ?? 4);
    }, 60000);

    it(`${c.name}: an echo that was fed nothing stays silent`, async () => {
      const y = await renderWasm(c, null, 2);
      expect(db(rms(y, 0, y.length))).toBe(-Infinity);
    }, 60000);

    it(`${c.name}: the hiss fades out after the echoes`, async () => {
      const y = await renderWasm(c, burst(c.burstSec), 30);
      expect(db(rms(y, 29 * SR, 30 * SR))).toBeLessThan(-100);
    }, 60000);
  }

  it('Space Echo: later repeats are darker and hissier', async () => {
    const y = await renderSpaceEcho(burst(0.08), 0.3 * 7 + 0.5);
    const r = readRepeats(y, 0, 0.3, 0.08, 5);
    console.log(table('Space Echo', r));
    expectWear('Space Echo', r, 4);
  }, 60000);

  it('Space Echo: an echo that was fed nothing stays silent', async () => {
    const y = await renderSpaceEcho(null, 2);
    expect(db(rms(y, 0, y.length))).toBe(-Infinity);
  }, 60000);

  it('Space Echo: the hiss fades out after the echoes', async () => {
    const y = await renderSpaceEcho(burst(0.08), 30);
    expect(db(rms(y, 29 * SR, 30 * SR))).toBeLessThan(-100);
  }, 60000);
});
