/**
 * The demo's Deck C scratch bus on the audio thread (`public/worklets/scratch-deck-c.worklet.js`):
 * rendered strokes (`scratchRender.ts`) summed at their start sample on a 22,050 Hz bus clock, then
 * the demo's deck_c_eq, scratch_channel and tail, sample for sample. The filters' coefficients are
 * scipy's (`refDsp.butter`), designed here and handed to the processor.
 *
 * Bus sample n is context time n / 22,050 s: a stroke due at context time t starts at
 * trunc(t x 22,050) plus its humanize in whole bus samples, as the demo places it.
 */
import { butter, normFc, lp, resamplePoly } from './refDsp';
import { DEMO_RATE, type DemoFx } from './scratchRender';

/** deck_c_eq and scratch_channel's fixed corners. */
export const DECK_C = {
  eqHpHz: 200, eqPresence: 0.2, eqBand: [1000, 3000] as const, eqLpHz: 6000,
  hpHz: 160, presence: 0.22, band: [1500, 3000] as const, lpHz: 5000, headroom: 0.75,
  /** three_deck DECK_C_LEVEL_SCALE: the layer's RMS as a fraction of the beat's. */
  levelScale: 0.60,
} as const;

/** The routine's bus (the demo renders each routine through its own chain). `lpHz`: scratch_channel's steep low pass. */
export interface DeckCChain { eq: boolean; room: number; delayMix: number; drive: number; tail: number; lpHz: number }
export const DECK_C_CHAINS = {
  /** three_deck.render: deck_c_eq, scratch_channel(room .42, delay .28, drive .09), + 0.22 dark room. */
  threeDeck: { eq: true, room: 0.42, delayMix: 0.28, drive: 0.09, tail: 0.22, lpHz: 5000 },
  /** scratch_dj.render: scratch_channel(room .3, delay .16, drive .10). */
  scratchDj: { eq: false, room: 0.30, delayMix: 0.16, drive: 0.10, tail: 0, lpHz: 5000 },
  /** scratch_routine.render_versions (C3, the stored versions): RoutineDry, RoutineDark (lp 3800), RoutineDelay,
   *  and RoutinePhraseEnd = scratch_channel's defaults (room .28, delay .14, drive .09). */
  routineDry: { eq: false, room: 0.06, delayMix: 0, drive: 0.09, tail: 0, lpHz: 5000 },
  routineDark: { eq: false, room: 0.25, delayMix: 0.06, drive: 0.09, tail: 0, lpHz: 3800 },
  routineDelay: { eq: false, room: 0.18, delayMix: 0.28, drive: 0.09, tail: 0, lpHz: 5000 },
  routinePhraseEnd: { eq: false, room: 0.28, delayMix: 0.14, drive: 0.09, tail: 0, lpHz: 5000 },
} as const satisfies Record<string, DeckCChain>;
/** A bus: one of the chains, or the overlay (scratch.render_scratch_section: a chain per section, `apply_fx`). */
export type DeckCChainName = keyof typeof DECK_C_CHAINS | 'overlay';

/** The stored version a routine preset plays through (`ScratchEventFx.preset`). */
export const PRESET_CHAIN = { dry: 'routineDry', dark: 'routineDark', delay: 'routineDelay', phraseEnd: 'routinePhraseEnd' } as const satisfies Record<string, keyof typeof DECK_C_CHAINS>;

/**
 * An overlay section on the bus: its first and end bus samples and its profile's `apply_fx` (filters designed
 * here, scipy's butter 2 like synth_dsp hp / lp). Every stroke of the section carries it; the first one opens it.
 */
export interface DeckCSection { key: string; start: number; end: number; fx: DemoFx }
function sectionMessage(sec: DeckCSection, rate: number) {
  const fx = sec.fx;
  return {
    key: sec.key, start: sec.start, end: sec.end,
    hp: fx.hp ? butter(2, normFc(fx.hp, rate), 'high') : null,
    lp: fx.lp ? butter(2, normFc(fx.lp, rate), 'low') : null,
    drive: fx.drive ?? 0, delayMix: fx.delay_mix ?? 0, delaySec: fx.delay_s ?? 0.18, reverbMix: fx.reverb_mix ?? 0,
  };
}

/** Stage taps (the null test): the processor's output after that stage, before the level. */
export const DECK_C_TAPS = { dry: 0, eq: 1, hp: 2, presence: 3, drive: 4, delay: 5, room: 6, lp: 7, tail: 8 } as const;

export function deckCCoefficients(rate: number = DEMO_RATE, lpHz: number = DECK_C.lpHz) {
  const lo = (fc: number, poles = 2) => butter(poles, normFc(fc, rate), 'low');
  const hi = (fc: number) => butter(2, normFc(fc, rate), 'high');
  const band = (a: number, b: number) => butter(2, [normFc(a, rate), normFc(b, rate)], 'band');
  return {
    eqHp: hi(DECK_C.eqHpHz), eqBp: band(...DECK_C.eqBand), eqLp: lo(DECK_C.eqLpHz, 4),
    chHp: hi(DECK_C.hpHz), chBp: band(...DECK_C.band), chLp: lo(lpHz, 4),
    // sampler.reverb: short_plate = hp 350 (lp 6000 (plate)), dark_room = lp 2400 (room); the tail is a dark room
    plateLp: lo(6000), plateHp: hi(350), darkLp: lo(2400), tailLp: lo(2400),
  };
}

/** Reachability sentinel: Deck C buses built, strokes handed to a live one, strokes rendered for a routine's shape. */
export const deckCStats = { created: 0, strokes: 0, plannedStrokes: 0 };

export interface DeckCBus {
  readonly node: AudioWorkletNode;
  /** Sum a rendered stroke into the bus from bus sample `start` (an overlay stroke: into its section). */
  stroke(start: number, samples: Float64Array | Float32Array, section?: DeckCSection): void;
  /** The bus sample a context time falls on (trunc, as the demo's int()). */
  busSampleAt(contextSec: number): number;
  setLevel(value: number): void;
  /** three_deck's duck for a span of bus samples from `start` (`deckCDuck`), then its level (`deckCLevel`). */
  shape(start: number, duck: Float32Array): void;
  shapeLevel(start: number, level: number): void;
  clear(): void;
  dispose(): void;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * A Deck C bus on `ctx` into `destination`. `follow`: the live level (X6) - 0.60 x the RMS of what arrives on
 * the bus's input (decks A + B, `beat`) over the layer's - instead of the fixed `level` (the null test).
 */
export async function createDeckCBus(ctx: BaseAudioContext, destination: AudioNode, opts: { chain?: DeckCChainName; tap?: number; level?: number; planned?: boolean; follow?: boolean; beat?: AudioNode | null } = {}): Promise<DeckCBus> {
  const name = opts.chain ?? 'threeDeck';
  const chain: DeckCChain = name === 'overlay' ? DECK_C_CHAINS.threeDeck : DECK_C_CHAINS[name];
  let p = loaded.get(ctx);
  if (!p) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    p = ctx.audioWorklet.addModule(`${base}worklets/scratch-deck-c.worklet.js`);
    loaded.set(ctx, p);
  }
  await p;
  const node = new AudioWorkletNode(ctx, 'scratch-deck-c', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: {
      busRate: DEMO_RATE, coeffs: deckCCoefficients(DEMO_RATE, chain.lpHz), ...chain, mode: name === 'overlay' ? 'sections' : 'chain',
      tap: opts.tap ?? -1, level: opts.level ?? 1, follow: !!opts.follow,
    },
  });
  node.connect(destination);
  if (opts.beat) opts.beat.connect(node);
  deckCStats.created++;
  return {
    node,
    stroke(start, samples, section) {
      if (opts.planned) deckCStats.plannedStrokes++; else deckCStats.strokes++;
      const copy = Float64Array.from(samples);
      node.port.postMessage({ type: 'stroke', start, samples: copy, ...(section ? { section: sectionMessage(section, DEMO_RATE) } : {}) }, [copy.buffer]);
    },
    busSampleAt: (sec) => Math.trunc(sec * DEMO_RATE),
    setLevel(value) { node.port.postMessage({ type: 'level', value }); },
    shape(start, duck) { node.port.postMessage({ type: 'shape', start, duck }); },
    shapeLevel(start, level) { node.port.postMessage({ type: 'shapeLevel', start, level }); },
    clear() { node.port.postMessage({ type: 'clear' }); },
    dispose() {
      try { opts.beat?.disconnect(node); } catch { /* gone */ }
      try { node.disconnect(); } catch { /* gone */ }
    },
  };
}

/** three_deck DUCK_DEPTH: how far the scratch layer ducks on the beat's transients. */
export const DECK_C_DUCK_DEPTH = 0.25;

/**
 * three_deck.render's two whole-render stages after the bus, over the routine's span (22,050 Hz):
 *   level = 0.60 x rms(beat) / rms(layer)      (DECK_C_LEVEL_SCALE; the layer at least as long as the beat)
 *   duck  = 1 - 0.25 x clip(lp(|beat|, 40 Hz) / max, 0, 1)
 * The layer may be the bus before the demo's peak normalisation: the ratio absorbs it. The duck needs
 * only the beat (known when the routine is planned); the level needs the whole planned layer.
 */
export function deckCDuck(beat: ArrayLike<number>, rate: number = DEMO_RATE): Float32Array {
  const n = beat.length;
  const abs = new Float64Array(n);
  for (let i = 0; i < n; i++) abs[i] = Math.abs(beat[i]!);
  const env = lp(abs, 40, rate);
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, env[i]!);
  const duck = new Float32Array(n);
  for (let i = 0; i < n; i++) duck[i] = 1.0 - DECK_C_DUCK_DEPTH * Math.min(1, Math.max(0, env[i]! / (mx + 1e-9)));
  return duck;
}
export function deckCLevel(layer: ArrayLike<number>, beat: ArrayLike<number>): number {
  const n = beat.length;
  let jb = 0, cb = 0;
  for (let i = 0; i < n; i++) { jb += beat[i]! * beat[i]!; cb += (layer[i] ?? 0) * (layer[i] ?? 0); }
  return DECK_C.levelScale * (Math.sqrt(jb / n) + 1e-9) / (Math.sqrt(cb / n) + 1e-9);
}

/**
 * A deck's programme over a span, as the demo reads a beat: mono (the channels' mean), at 22,050 Hz
 * (synth_dsp.resample_rate: resample_poly, float32), from `fromSec` for `samples` samples.
 */
export function programmeSpan(buffer: Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'length' | 'getChannelData'>, fromSec: number, samples: number): Float64Array {
  const sr = buffer.sampleRate;
  const a = Math.max(0, Math.trunc(fromSec * sr)), b = Math.min(buffer.length, a + Math.ceil(samples * sr / DEMO_RATE) + 64);
  const mono = new Float64Array(Math.max(0, b - a));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] = mono[i]! + d[a + i]!;
  }
  if (buffer.numberOfChannels > 1) for (let i = 0; i < mono.length; i++) mono[i] = mono[i]! / buffer.numberOfChannels;
  const at22 = sr === DEMO_RATE ? mono : resamplePoly(mono, DEMO_RATE / gcdInt(DEMO_RATE, sr), sr / gcdInt(DEMO_RATE, sr));
  const out = new Float64Array(samples);
  for (let i = 0; i < samples && i < at22.length; i++) out[i] = Math.fround(at22[i]!);
  return out;
}
function gcdInt(a: number, b: number): number { while (b) { [a, b] = [b, a % b]; } return a; }

/**
 * The decks a planned routine's level and duck read (X6, owner decision: three_deck's 0.60 x the RMS of the A/B
 * decks, not only the deck under the routine): the routine's deck from the routine's first downbeat, and the
 * other deck when it plays, from where it will be then; each weighted as the crossfader sends it now. Null when a
 * deck that plays has no buffer (a module deck): the live bus measures decks A + B on its input instead.
 */
export function routineShapeDecks<B>(
  shape: { deck: 'A' | 'B'; startSec: number; trackFromSec: number },
  decks: Readonly<Record<'A' | 'B', { playing: boolean; audio: B | null; position: number; rate: number }>>,
  gains: readonly [number, number],
  nowSec: number,
): Array<{ audio: B; trackFromSec: number; gain: number }> | null {
  const out: Array<{ audio: B; trackFromSec: number; gain: number }> = [];
  for (const d of ['A', 'B'] as const) {
    const own = d === shape.deck;
    const k = decks[d];
    if (!own && !k.playing) continue;
    if (!k.audio) return null;
    out.push({ audio: k.audio, trackFromSec: own ? shape.trackFromSec : k.position + (shape.startSec - nowSec) * k.rate, gain: gains[d === 'A' ? 0 : 1] });
  }
  return out;
}
