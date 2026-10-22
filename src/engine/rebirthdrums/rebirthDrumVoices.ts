/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Synthesized 808 / 909 drum voices (port of re-rebirth src/audio/drums.js). No samples: each hit
 * builds short-lived nodes that stop themselves; playHit() disconnects its bus once the last
 * source ended. Voice signature: (v, P) where v is the hit context and P(key) the knob value
 * (0..1) of the voice's knob group.
 */

export interface DrumKitState {
  /** Gate of the currently ringing open hat, so a closed hat can cut it off. */
  openHat: GainNode | null;
}

export interface DrumHit {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  kit: DrumKitState;
  /** Start time, seconds. */
  t: number;
  /** Accent multiplier. */
  acc: number;
  end: number;
  last: AudioScheduledSourceNode | null;
}

export type Knobs = (key: string) => number;
export type DrumVoice = (v: DrumHit, P: Knobs) => void;

const T60 = 1 / 6.9; // setTargetAtTime tau factor: reaches -60 dB at `decay`
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]; // inharmonic square bank

const lvl = (x: number): number => x * x * 1.3;

function env(v: DrumHit, peak: number, decay: number, attack = 0.0015, at = v.t): GainNode {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, decay * T60);
  return g;
}

// A fast drop to `tail` (fraction of the peak) followed by a long decay: metal voices ring on
// long after their bright attack.
function env2(v: DrumHit, peak: number, fast: number, tail: number, slow: number, attack = 0.001): GainNode {
  const g = v.ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, v.t);
  p.linearRampToValueAtTime(peak, v.t + attack);
  p.setTargetAtTime(peak * tail, v.t + attack, fast * T60);
  p.setTargetAtTime(0, v.t + attack + fast * 0.5, slow * T60);
  return g;
}

function osc(v: DrumHit, type: OscillatorType, hz: number): OscillatorNode {
  const o = v.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, v.t);
  return o;
}

function noise(v: DrumHit): AudioBufferSourceNode {
  const n = v.ctx.createBufferSource();
  n.buffer = v.noise;
  n.loop = true;
  return n;
}

function filter(v: DrumHit, type: BiquadFilterType, hz: number, Q = 0.7): BiquadFilterNode {
  const f = v.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = Q;
  return f;
}

function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function run(v: DrumHit, src: AudioScheduledSourceNode, dur: number): void {
  if (src instanceof AudioBufferSourceNode && src.buffer) src.start(v.t, Math.random() * (src.buffer.duration - 0.1));
  else src.start(v.t);
  src.stop(v.t + dur);
  if (v.t + dur >= v.end) {
    v.end = v.t + dur;
    v.last = src;
  }
}

/** Every hit plays through its own bus, disconnected once its last source ends. */
export function playHit(voice: DrumVoice, ctx: BaseAudioContext, out: AudioNode, noiseBuf: AudioBuffer, kit: DrumKitState, t: number, acc: number, P: Knobs): void {
  const bus = ctx.createGain();
  bus.connect(out);
  const hit: DrumHit = { ctx, out: bus, noise: noiseBuf, kit, t, acc, end: 0, last: null };
  voice(hit, P);
  if (hit.last) hit.last.onended = () => bus.disconnect();
  else bus.disconnect();
}

// Six detuned squares summed: the classic analog metallic source.
function metal(v: DrumHit, scale: number, dur: number): GainNode {
  const sum = v.ctx.createGain();
  sum.gain.value = 1 / METAL.length;
  for (const hz of METAL) {
    const o = osc(v, 'square', hz * scale);
    o.connect(sum);
    run(v, o, dur);
  }
  return sum;
}

interface KickOpts { base: number; sweep: number; sweepTime?: number; settle?: number; decay: number; level: number; click: number; clickHz?: number; harm?: number }

// Pitch falls from base * sweep to base, either reaching it at sweepTime or, with `settle`
// (time constant), approaching it gradually. harm: level of a second harmonic on the same sweep.
function kick(v: DrumHit, { base, sweep, sweepTime = 0, settle, decay, level, click, clickHz = 3500, harm = 0 }: KickOpts): void {
  const partials: Array<[number, number]> = harm ? [[1, 1], [2, harm]] : [[1, 1]];
  for (const [mul, gain] of partials) {
    const o = osc(v, 'sine', base * sweep * mul);
    if (settle) o.frequency.setTargetAtTime(base * mul, v.t, settle);
    else o.frequency.exponentialRampToValueAtTime(base * mul, v.t + sweepTime);
    chain(o, env(v, level * gain, decay, 0.001), v.out);
    run(v, o, decay + 0.05);
  }
  if (click > 0) {
    const n = noise(v);
    chain(n, filter(v, 'lowpass', clickHz), env(v, level * click, 0.012, 0.0005), v.out);
    run(v, n, 0.03);
  }
}

interface SnareOpts { tones: Array<[number, number, number, number?]>; sweep?: number; noiseHp: number; noiseLp: number; noiseDecay: number; noiseLevel: number }

// tones: [hz, level, decay, fast?] drum heads, sine, falling from hz * sweep over 20 ms; `fast`
// adds a quick drop to a fifth of the level before the decay.
function snare(v: DrumHit, { tones, sweep = 1, noiseHp, noiseLp, noiseDecay, noiseLevel }: SnareOpts): void {
  for (const [hz, level, decay, fast] of tones) {
    const o = osc(v, 'sine', hz * sweep);
    o.frequency.exponentialRampToValueAtTime(hz, v.t + 0.02);
    chain(o, fast ? env2(v, level, fast, 0.2, decay, 0.0015) : env(v, level, decay), v.out);
    run(v, o, decay + 0.05);
  }
  const n = noise(v);
  chain(n, filter(v, 'highpass', noiseHp), filter(v, 'lowpass', noiseLp), env(v, noiseLevel, noiseDecay), v.out);
  run(v, n, noiseDecay + 0.05);
}

interface TomOpts { hz: number; decay: number; level: number; noiseAmt?: number; sweep?: number; sweepTime?: number; click?: number; attack?: number }

// click: a short broadband noise burst on the attack.
function tom(v: DrumHit, { hz, decay, level, noiseAmt = 0, sweep = 1.35, sweepTime = 0.06, click = 0, attack = 0.0015 }: TomOpts): void {
  const o = osc(v, 'sine', hz * sweep);
  o.frequency.exponentialRampToValueAtTime(hz, v.t + sweepTime);
  chain(o, env(v, level, decay, attack), v.out);
  run(v, o, decay + 0.05);
  if (click) {
    const n = noise(v);
    chain(n, filter(v, 'lowpass', 6000), env(v, level * click, 0.04, 0.0005), v.out);
    run(v, n, 0.06);
  }
  if (noiseAmt) {
    const n = noise(v);
    chain(n, filter(v, 'bandpass', hz * 4, 1), env(v, level * noiseAmt, decay * 0.3), v.out);
    run(v, n, decay * 0.3 + 0.05);
  }
}

interface RingOpts { partials: Array<[number, number]>; decay: number; level: number; tick?: number; tickHz?: number }

// Damped sine partials [hz, relative level], plus a short noise tick.
function ring(v: DrumHit, { partials, decay, level, tick = 0, tickHz = 2500 }: RingOpts): void {
  for (const [hz, rel] of partials) {
    const o = osc(v, 'sine', hz);
    chain(o, env(v, level * rel, decay, 0.0005), v.out);
    run(v, o, decay + 0.05);
  }
  if (tick) {
    const n = noise(v);
    chain(n, filter(v, 'bandpass', tickHz, 0.8), env(v, level * tick, 0.01, 0.0005), v.out);
    run(v, n, 0.03);
  }
}

// Several rapid noise bursts then a diffuse tail.
function clap(v: DrumHit, level: number, hz: number, tail: number, q = 1.6, tailLevel = 0.8, hp = 600): void {
  const n = noise(v);
  const g = v.ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, v.t);
  for (let i = 0; i < 3; i++) {
    const at = v.t + i * 0.011;
    p.setValueAtTime(level, at);
    p.setTargetAtTime(0, at + 0.001, 0.0035);
  }
  p.setValueAtTime(level * tailLevel, v.t + 0.033);
  p.setTargetAtTime(0, v.t + 0.034, tail * T60);
  chain(n, filter(v, 'bandpass', hz, q), filter(v, 'highpass', hp), g, v.out);
  run(v, n, 0.04 + tail);
}

interface HatOpts { level: number; decay: number; scale?: number; bp?: number; hp?: number; lp?: number; noiseMix?: number; metalMix?: number; body?: number; bodyDecay?: number; choke?: boolean; chokeable?: boolean }

function hat(v: DrumHit, { level, decay, scale = 1, bp = 10000, hp = 7000, lp = 20000, noiseMix = 0, metalMix = 1, body = 0, bodyDecay = 0.06, choke = false, chokeable = false }: HatOpts): void {
  const out = env(v, level, decay, 0.0008);
  const mg = v.ctx.createGain();
  mg.gain.value = metalMix;
  const source = metal(v, scale, decay + 0.05);
  chain(source, filter(v, 'bandpass', bp, 1), filter(v, 'highpass', hp), filter(v, 'lowpass', lp), mg, out);
  if (body) chain(source, filter(v, 'bandpass', 400, 2), env(v, level * body, bodyDecay, 0.0008), out);
  if (noiseMix) {
    const n = noise(v);
    const ng = v.ctx.createGain();
    ng.gain.value = noiseMix;
    chain(n, filter(v, 'highpass', hp), filter(v, 'lowpass', lp), ng, out);
    run(v, n, decay + 0.05);
  }
  // The open hat goes through a separate gain so a closed hat can cut it off.
  const gate = v.ctx.createGain();
  chain(out, gate, v.out);
  // The gate is never automated before a choke, so pin its value explicitly first.
  if (choke && v.kit.openHat) {
    v.kit.openHat.gain.setValueAtTime(1, v.t);
    v.kit.openHat.gain.setTargetAtTime(0, v.t, 0.004);
  }
  if (chokeable) v.kit.openHat = gate;
}

interface CymbalOpts { level: number; decay: number; scale: number; hp: number; bp: number; noiseMix: number; fast?: number; tail?: number }

// fast/tail: an optional quick initial drop before the main decay.
function cymbal(v: DrumHit, { level, decay, scale, hp, bp, noiseMix, fast = 0, tail = 1 }: CymbalOpts): void {
  const out = fast ? env2(v, level, fast, tail, decay) : env(v, level, decay, 0.001);
  chain(metal(v, scale, decay + 0.05), filter(v, 'bandpass', bp, 0.6), filter(v, 'highpass', hp), out, v.out);
  if (noiseMix) {
    const n = noise(v);
    const ng = v.ctx.createGain();
    ng.gain.value = noiseMix;
    chain(n, filter(v, 'highpass', hp), ng, out);
    run(v, n, decay + 0.05);
  }
}

// High-passed noise with a short envelope (the 808's maracas).
function shaker(v: DrumHit, { level, decay, hp }: { level: number; decay: number; hp: number }): void {
  const n = noise(v);
  chain(n, filter(v, 'highpass', hp), env(v, level, decay, 0.002), v.out);
  run(v, n, decay + 0.05);
}

// Voices with a switch (808 toms / congas etc.): `alt` on picks the second.
const pick = (standard: DrumVoice, alternate: DrumVoice): DrumVoice => (v, P) => (P('alt') >= 0.5 ? alternate : standard)(v, P);
const tom808 = (hz: number, decay: number, level: number): DrumVoice => (v, P) =>
  tom(v, { hz: hz * (0.8 + P('tuning') * 0.5), decay, level: lvl(P('level')) * v.acc * level, sweep: 1.04, sweepTime: 0.02, attack: 0.005 });
// Knob response that stays close to linear below ~0.8 and stretches the top end (808 cymbal
// and open hat decays run several seconds at 127).
const stretch = (d: number, base: number, lin: number, top: number): number => base + d * lin + d ** 8 * top;

export interface KitVoice {
  /** Knob group whose fields feed P(). */
  group: string;
  voice: DrumVoice;
}

/** 808 voices (fitted to isolated hits in ReBirth exports in the source). */
export const R808: Record<string, KitVoice> = {
  bd: { group: 'bd', voice: (v, P) => kick(v, { base: 50 + P('tone') * 6, sweep: 1.5, sweepTime: 0.03, decay: 0.12 * 4.25 ** (2 * P('decay')), level: lvl(P('level')) * v.acc * 1.4, click: P('tone') * 0.1 }) },
  sd: { group: 'sd', voice: (v, P) => {
    const L = lvl(P('level')) * v.acc;
    snare(v, { tones: [[179, L * 0.8, 0.2], [332, L * 0.8 * 10 ** ((-15 + 22 * P('tone')) / 20), 0.07]], noiseHp: 1800, noiseLp: 6000 + P('tone') * 6000, noiseDecay: 0.18, noiseLevel: L * P('snappy') });
  } },
  lt: { group: 'lt', voice: pick(tom808(80, 0.57, 0.7), tom808(174, 0.45, 1.1)) },
  mt: { group: 'mt', voice: pick(tom808(123, 0.4, 0.68), tom808(256, 0.38, 0.7)) },
  ht: { group: 'ht', voice: pick(tom808(166, 0.3, 0.77), tom808(363, 0.2, 1.1)) },
  rs: { group: 'rs', voice: pick(
    (v, P) => ring(v, { partials: [[495, 1], [1700, 0.35]], decay: 0.035, level: lvl(P('level')) * v.acc * 0.9, tick: 0.6, tickHz: 3000 }),
    (v, P) => ring(v, { partials: [[2517, 1]], decay: 0.06, level: lvl(P('level')) * v.acc * 0.5 }),
  ) },
  cp: { group: 'cp', voice: pick(
    (v, P) => clap(v, lvl(P('level')) * v.acc * 0.9, 1400, 0.3, 0.5, 0.5, 200),
    (v, P) => shaker(v, { level: lvl(P('level')) * v.acc * 1.0, decay: 0.07, hp: 8000 }),
  ) },
  cb: { group: 'cb', voice: (v, P) => {
    const out = env2(v, lvl(P('level')) * v.acc * 0.6, 0.06, 0.18, 0.9);
    for (const hz of [540, 800]) {
      const o = osc(v, 'square', hz);
      chain(o, filter(v, 'bandpass', 1000, 1), out);
      run(v, o, 1);
    }
    out.connect(v.out);
  } },
  cy: { group: 'cy', voice: (v, P) => {
    const fast = stretch(P('decay'), 0.27, 0, 0.78);
    cymbal(v, { level: lvl(P('level')) * v.acc * 1.0, decay: fast * 6.2, fast, tail: 0.06, scale: 1, hp: 2500 + P('tone') * 3000, bp: 7000 + P('tone') * 2000, noiseMix: 0.2 });
  } },
  oh: { group: 'oh', voice: (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 1.1, decay: stretch(P('decay'), 0.15, 0.6, 3.6), bp: 8000, hp: 6000, chokeable: true }) },
  ch: { group: 'ch', voice: (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 4.4, decay: 0.1, bp: 11000, hp: 8000, choke: true }) },
};

/** 909 voices (fitted to isolated hits in ReBirth exports in the source). */
export const R909: Record<string, KitVoice> = {
  bd: { group: 'bd', voice: (v, P) => kick(v, { base: 56, sweep: 4.9, settle: 0.005 + 0.025 * Math.min(1, P('tune') / 0.78) ** 2.5, decay: 0.25 + P('decay') * 0.85, level: lvl(P('level')) * v.acc * 0.75, click: 0.06 * P('attack') ** 0.45, clickHz: 7000, harm: 0.07 }) },
  sd: { group: 'sd', voice: (v, P) => {
    const L = lvl(P('level')) * v.acc;
    const hz = 122 * (1 + 0.975 * P('tune') ** 1.1);
    snare(v, { tones: [[hz, L * 1.05, 0.45, 0.06], [hz * 1.35, L * 0.37, 0.3, 0.06]], sweep: 1.3, noiseHp: 1200, noiseLp: 3000 + P('tone') * 9000, noiseDecay: 0.18, noiseLevel: L * (0.02 + P('snappy') * 0.45) });
  } },
  lt: { group: 'lt', voice: (v, P) => tom(v, { hz: 90 * (0.8 + P('tune') * 0.5), decay: 0.75 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 1.6, sweep: 1.2, sweepTime: 0.04, click: 0.1 }) },
  mt: { group: 'mt', voice: (v, P) => tom(v, { hz: 108 * (0.8 + P('tune') * 0.5), decay: 0.55 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 1.5, sweep: 1.2, sweepTime: 0.04, click: 0.12 }) },
  ht: { group: 'ht', voice: (v, P) => tom(v, { hz: 122 * (0.8 + P('tune') * 0.5), decay: 0.5 * (0.3 + P('decay') * 0.7), level: lvl(P('level')) * v.acc * 1.9, sweep: 1.3, sweepTime: 0.05, click: 0.12 }) },
  rs: { group: 'rs', voice: (v, P) => ring(v, { partials: [[221, 1], [480, 0.45], [1000, 0.2], [1700, 0.1]], decay: 0.07, level: lvl(P('level')) * v.acc * 1.1, tick: 0.25 }) },
  cp: { group: 'cp', voice: (v, P) => clap(v, lvl(P('level')) * v.acc * 6.5, 1100, 0.75, 1.3, 0.12) },
  ch: { group: 'hh', voice: (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 1.05, decay: 0.03 + P('chDecay') * 0.25, scale: 1.3, hp: 2400, lp: 11000, noiseMix: 1, metalMix: 0.35, choke: true }) },
  oh: { group: 'hh', voice: (v, P) => hat(v, { level: lvl(P('level')) * v.acc * 0.85, decay: 0.25 + P('ohDecay') * 0.6, scale: 1.3, hp: 2600, lp: 12000, noiseMix: 1, metalMix: 0.35, chokeable: true }) },
  cr: { group: 'cy', voice: (v, P) => cymbal(v, { level: lvl(P('crLevel')) * v.acc * 0.7, decay: 2.1, scale: 1.7 * (0.7 + P('crTune') * 0.6), hp: 1500, bp: 5000, noiseMix: 0.5 }) },
  rd: { group: 'cy', voice: (v, P) => cymbal(v, { level: lvl(P('rdLevel')) * v.acc * 1.2, decay: 2.0, scale: 2.3 * (0.7 + P('rdTune') * 0.6), hp: 2500, bp: 8000, noiseMix: 0.15 }) },
};
