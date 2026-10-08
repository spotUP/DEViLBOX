/**
 * The real `DubBus`, rendered offline, for behaviour tests.
 *
 * Source-text asserts cannot catch a short-circuit: the 2026-10-02 panic fix
 * passed five of them and was still wrong live. This builds the actual bus on
 * node-web-audio-api, feeds it, renders, and lets a test measure the output.
 *
 * Two things make it deterministic:
 *
 *  - Worklets and WASM load from `public/` (see realWebAudio.ts), and the rig
 *    waits for those async splices in real time BEFORE rendering, so the graph
 *    does not change under the renderer.
 *  - The bus schedules restores from `setTimeout` and reads `currentTime` when
 *    they fire. An offline render runs far ahead of the wall clock, so those
 *    reads land in the past. `render()` therefore runs on an audio-locked
 *    clock: fake timers, advanced by exactly the audio time rendered, with the
 *    render suspended at every step.
 */
import { vi } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch, audioLoadsSettled, realDelay } from './realWebAudio';
import type { DubBus as DubBusClass } from '@/engine/dub/DubBus';

export const RIG_SAMPLE_RATE = 48000;

/** Real time a render holds after a timeline action, for worklet messages to land. */
const MESSAGE_SETTLE_MS = 40;

/** Every clock the bus reads. setImmediate/nextTick stay real so I/O resolves. */
const FAKED: NonNullable<Parameters<typeof vi.useFakeTimers>[0]>['toFake'] = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'];

/** The main thread's own Math.random, put back by releaseDubBusRigClock. */
const realRandom = Math.random;

/**
 * Seed the MAIN thread's Math.random, from the same start for every rig.
 *
 * The worklet scopes were already seeded (realWebAudio.ts), but the bus also
 * draws on the main thread while it builds: SpaceEchoEffect picks its wow LFO
 * rate as `0.5 + Math.random() * 0.2`. Unseeded, two identical renders ran
 * their echo heads at different wow rates and differed by -41 to -50 dBFS
 * from render to render, and that drift was the "noise floor" the toggle test
 * measured Starve against — it failed whenever the draw was unlucky
 * (D2, 2026-10-06). Analogue scatter is right for the instrument; a
 * measurement rig must render the same graph the same way every time.
 */
function seedMainThreadRandom(): void {
  let s = 0x2545f491;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/**
 * Tone fills its white/pink/brown noise buffers with Math.random the first
 * time any Noise starts (Tone.Reverb's impulse response does, inside
 * SpaceEchoEffect) and caches them for the process. Left to the first rig,
 * that rig makes ~half a million more draws than every later one, so the same
 * seed hands its echo a different wow rate. Fill the caches before any rig.
 */
function warmToneNoiseCaches(Tone: typeof import('tone')): void {
  const ctx = new Tone.OfflineContext(1, 0.01, RIG_SAMPLE_RATE);
  for (const type of ['white', 'pink', 'brown'] as const) {
    const noise = new Tone.Noise({ context: ctx, type });
    noise.start(0);
    noise.dispose();
  }
}

/** Impulse responses Tone is still rendering — see `holdToneImpulseResponses`. */
const pendingImpulseResponses = new Set<Promise<unknown>>();

/**
 * Make Tone.Reverb's impulse response a thing the rig can wait for.
 *
 * Reverb.generate() renders its IR on a nested Tone.OfflineContext and sets it
 * on the convolver only when that render resolves. Two things made that land
 * mid-render, at a different block each time (first differing sample 2304 or
 * 2432, about 1 run in 2): the nested render yields through `setTimeout`,
 * which the rig has faked, so it advanced only on the render's own 10 ms
 * steps; and nothing waited for it. SpaceEchoEffect builds one Reverb, so the
 * echo bus gained its reverb tail at whichever step the nested render
 * happened to finish on (O3b, 2026-10-08).
 *
 * The render is run without its timer yields, and every generate() is
 * recorded so `toneImpulseResponsesSettled` can wait for the buffer to be set
 * before the audio render starts.
 */
function holdToneImpulseResponses(Tone: typeof import('tone')): void {
  const offline = Tone.OfflineContext.prototype as unknown as { render: (asynchronous?: boolean) => Promise<unknown>; _rigPatched?: boolean };
  if (!offline._rigPatched) {
    const render = offline.render;
    offline.render = function (this: unknown) { return render.call(this, false); };
    offline._rigPatched = true;
  }
  const reverb = Tone.Reverb.prototype as unknown as { generate: () => Promise<unknown>; _rigPatched?: boolean };
  if (!reverb._rigPatched) {
    const generate = reverb.generate;
    reverb.generate = function (this: unknown) {
      const done = generate.call(this);
      pendingImpulseResponses.add(done);
      const forget = () => { pendingImpulseResponses.delete(done); };
      done.then(forget, forget);
      return done;
    };
    reverb._rigPatched = true;
  }
}

/** Resolve once every impulse response Tone started has been set on its convolver. */
async function toneImpulseResponsesSettled(): Promise<void> {
  while (pendingImpulseResponses.size > 0) await Promise.all([...pendingImpulseResponses].map((p) => p.catch(() => undefined)));
}

/** Call from afterAll: the rig leaves fake timers and a seeded Math.random installed between renders. */
export function releaseDubBusRigClock(): void {
  vi.useRealTimers();
  Math.random = realRandom;
}

/** An action at a point on the audio timeline. */
export interface TimelineAction {
  at: number;
  run: () => void;
}

export interface DubBusRig {
  ctx: OfflineAudioContext;
  bus: DubBusClass;
  /** The bus's internals, for wiring a source in or reading a param. */
  node: <T = AudioNode>(name: string) => T;
  /** Render the whole context, running `actions` at their times. */
  render: (actions?: TimelineAction[], stepSec?: number) => Promise<AudioBuffer>;
}

let loaded: Promise<{ Tone: typeof import('tone'); DubBus: typeof DubBusClass }> | null = null;

/** Install real Web Audio and import Tone + DubBus once per test file. */
export function loadDubBus(): Promise<{ Tone: typeof import('tone'); DubBus: typeof DubBusClass }> {
  if (!loaded) {
    installRealWebAudio();
    resolveWorkletsFromPublic();
    servePublicToFetch();
    loaded = (async () => {
      const Tone = await import('tone');
      holdToneImpulseResponses(Tone);
      warmToneNoiseCaches(Tone);
      const { DubBus } = await import('@/engine/dub/DubBus');
      return { Tone, DubBus };
    })();
  }
  return loaded;
}

/**
 * A fresh bus on a fresh offline context of `seconds`, its master wired to the
 * destination, with every worklet module and WASM file loaded.
 */
export async function makeDubBusRig(seconds: number): Promise<DubBusRig> {
  const { Tone, DubBus } = await loadDubBus();
  // Fake timers from before construction: a timer the bus starts while being
  // built must run on the audio-locked clock too, or it fires in real time in
  // the middle of a render. Re-installing also drops the previous rig's timers.
  vi.useFakeTimers({ toFake: FAKED });
  seedMainThreadRandom();
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RIG_SAMPLE_RATE), RIG_SAMPLE_RATE);
  Tone.setContext(ctx);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const bus = new DubBus(ctx as unknown as AudioContext, master);
  // Every worklet module and WASM file the bus asked for, plus a quiet spell
  // for the 'ready' messages that splice each processor in.
  await audioLoadsSettled();
  await toneImpulseResponsesSettled();

  const render = async (actions: TimelineAction[] = [], stepSec = 0.01): Promise<AudioBuffer> => {
    const pending = [...actions].sort((a, b) => a.at - b.at);
    const runDue = (now: number): boolean => {
      let ran = false;
      while (pending.length && pending[0].at <= now + 1e-9) { pending.shift()!.run(); ran = true; }
      return ran;
    };
    // Worklet parameters travel by port message and land whenever the
    // processor's thread reads them. Holding the render while they arrive
    // makes a change apply at the block it was made in, not a random later
    // one — without this, identical renders differed by 2 dB.
    const settleMessages = async (ran: boolean) => { await realDelay(ran ? MESSAGE_SETTLE_MS : 1); await toneImpulseResponsesSettled(); };
    await settleMessages(runDue(0));
    const steps = Math.floor(seconds / stepSec) - 1;
    let suspendFailure: unknown = null;
    for (let k = 1; k <= steps; k++) {
      const t = +(k * stepSec).toFixed(6);
      ctx.suspend(t).then(async () => {
        vi.advanceTimersByTime(stepSec * 1000);
        await settleMessages(runDue(t));
        await ctx.resume();
      }, (err: unknown) => { suspendFailure = err; });
    }
    // node-web-audio-api registers a suspend asynchronously: one started in
    // the same tick as startRendering() is sometimes rejected (4 in 1480
    // under load; none after a real tick). A suspend must never be skipped
    // silently, so a rejection fails the render.
    await realDelay(10);
    const rendered = await ctx.startRendering();
    if (suspendFailure) throw new Error(`audio-locked clock broke: ${String(suspendFailure)}`);
    return rendered;
  };

  return {
    ctx,
    bus,
    node: <T = AudioNode>(name: string) => (bus as unknown as Record<string, T>)[name],
    render,
  };
}

/** A steady tone into the bus input, the way a channel send feeds it. */
export function feedTone(rig: DubBusRig, hz = 220, gain = 0.3): void {
  const osc = rig.ctx.createOscillator();
  osc.frequency.value = hz;
  const level = rig.ctx.createGain();
  level.gain.value = gain;
  osc.connect(level);
  level.connect(rig.node('input'));
  osc.start(0);
}

/** RMS over [from, to) seconds, both channels. */
export function rmsBetween(buffer: AudioBuffer, from: number, to = buffer.duration): number {
  const a = Math.floor(from * buffer.sampleRate);
  const b = Math.min(buffer.length, Math.floor(to * buffer.sampleRate));
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let i = a; i < b; i++) { sum += d[i] * d[i]; n++; }
  }
  return Math.sqrt(sum / Math.max(1, n));
}

export const toDb = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);
