/**
 * The demo's Deck C scratch bus on the audio thread (`public/worklets/scratch-deck-c.worklet.js`):
 * rendered strokes (`scratchRender.ts`) summed at their start sample on a 22,050 Hz bus clock, then
 * the demo's deck_c_eq, scratch_channel and tail, sample for sample. The filters' coefficients are
 * scipy's (`refDsp.butter`), designed here and handed to the processor.
 *
 * Bus sample n is context time n / 22,050 s: a stroke due at context time t starts at
 * trunc(t x 22,050) plus its humanize in whole bus samples, as the demo places it.
 */
import { butter, normFc } from './refDsp';
import { DEMO_RATE } from './scratchRender';

/** deck_c_eq and scratch_channel's fixed corners. */
export const DECK_C = {
  eqHpHz: 200, eqPresence: 0.2, eqBand: [1000, 3000] as const, eqLpHz: 6000,
  hpHz: 160, presence: 0.22, band: [1500, 3000] as const, lpHz: 5000, headroom: 0.75,
} as const;

/** The routine's bus (the demo renders each routine through its own chain). */
export interface DeckCChain { eq: boolean; room: number; delayMix: number; drive: number; tail: number }
export const DECK_C_CHAINS = {
  /** three_deck.render: deck_c_eq, scratch_channel(room .42, delay .28, drive .09), + 0.22 dark room. */
  threeDeck: { eq: true, room: 0.42, delayMix: 0.28, drive: 0.09, tail: 0.22 },
  /** scratch_dj.render: scratch_channel(room .3, delay .16, drive .10). */
  scratchDj: { eq: false, room: 0.30, delayMix: 0.16, drive: 0.10, tail: 0 },
} as const satisfies Record<string, DeckCChain>;
export type DeckCChainName = keyof typeof DECK_C_CHAINS;

/** Stage taps (the null test): the processor's output after that stage, before the level. */
export const DECK_C_TAPS = { dry: 0, eq: 1, hp: 2, presence: 3, drive: 4, delay: 5, room: 6, lp: 7, tail: 8 } as const;

export function deckCCoefficients(rate: number = DEMO_RATE) {
  const lo = (fc: number, poles = 2) => butter(poles, normFc(fc, rate), 'low');
  const hi = (fc: number) => butter(2, normFc(fc, rate), 'high');
  const band = (a: number, b: number) => butter(2, [normFc(a, rate), normFc(b, rate)], 'band');
  return {
    eqHp: hi(DECK_C.eqHpHz), eqBp: band(...DECK_C.eqBand), eqLp: lo(DECK_C.eqLpHz, 4),
    chHp: hi(DECK_C.hpHz), chBp: band(...DECK_C.band), chLp: lo(DECK_C.lpHz, 4),
    // sampler.reverb: short_plate = hp 350 (lp 6000 (plate)), dark_room = lp 2400 (room); the tail is a dark room
    plateLp: lo(6000), plateHp: hi(350), darkLp: lo(2400), tailLp: lo(2400),
  };
}

/** Reachability sentinel: Deck C buses built and strokes handed to one. */
export const deckCStats = { created: 0, strokes: 0 };

export interface DeckCBus {
  readonly node: AudioWorkletNode;
  /** Sum a rendered stroke into the bus from bus sample `start`. */
  stroke(start: number, samples: Float64Array | Float32Array): void;
  /** The bus sample a context time falls on (trunc, as the demo's int()). */
  busSampleAt(contextSec: number): number;
  setLevel(value: number): void;
  /** The programme's RMS the layer follows at the demo's 0.60 ratio (live; the null test sends none). */
  setProgramme(rms: number): void;
  clear(): void;
  dispose(): void;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export async function createDeckCBus(ctx: BaseAudioContext, destination: AudioNode, opts: { chain?: DeckCChainName; tap?: number; level?: number } = {}): Promise<DeckCBus> {
  const chain = DECK_C_CHAINS[opts.chain ?? 'threeDeck'];
  let p = loaded.get(ctx);
  if (!p) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    p = ctx.audioWorklet.addModule(`${base}worklets/scratch-deck-c.worklet.js`);
    loaded.set(ctx, p);
  }
  await p;
  const node = new AudioWorkletNode(ctx, 'scratch-deck-c', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
    processorOptions: { busRate: DEMO_RATE, coeffs: deckCCoefficients(DEMO_RATE), ...chain, tap: opts.tap ?? -1, level: opts.level ?? 1 },
  });
  node.connect(destination);
  deckCStats.created++;
  return {
    node,
    stroke(start, samples) {
      deckCStats.strokes++;
      const copy = Float64Array.from(samples);
      node.port.postMessage({ type: 'stroke', start, samples: copy }, [copy.buffer]);
    },
    busSampleAt: (sec) => Math.trunc(sec * DEMO_RATE),
    setLevel(value) { node.port.postMessage({ type: 'level', value }); },
    setProgramme(rms) { node.port.postMessage({ type: 'programme', rms }); },
    clear() { node.port.postMessage({ type: 'clear' }); },
    dispose() { try { node.disconnect(); } catch { /* gone */ } },
  };
}
