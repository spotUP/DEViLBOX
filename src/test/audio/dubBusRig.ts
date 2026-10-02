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

/** Call from afterAll: the rig leaves fake timers installed between renders. */
export function releaseDubBusRigClock(): void {
  vi.useRealTimers();
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
  const ctx = new OfflineAudioContext(2, Math.round(seconds * RIG_SAMPLE_RATE), RIG_SAMPLE_RATE);
  Tone.setContext(ctx);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const bus = new DubBus(ctx as unknown as AudioContext, master);
  // Every worklet module and WASM file the bus asked for, plus a quiet spell
  // for the 'ready' messages that splice each processor in.
  await audioLoadsSettled();

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
    const settleMessages = (ran: boolean) => realDelay(ran ? MESSAGE_SETTLE_MS : 1);
    await settleMessages(runDue(0));
    const steps = Math.floor(seconds / stepSec) - 1;
    for (let k = 1; k <= steps; k++) {
      const t = +(k * stepSec).toFixed(6);
      void ctx.suspend(t).then(async () => {
        vi.advanceTimersByTime(stepSec * 1000);
        await settleMessages(runDue(t));
        void ctx.resume();
      });
    }
    return ctx.startRendering();
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
