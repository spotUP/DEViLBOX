/**
 * Is the app making sound? The main thread's copy of the audio idle state.
 *
 * public/worklets/idle-gate.js registers 'signal-presence', a processor with
 * no outputs that listens to everything the context plays through Tone's
 * destination. It posts { sounding: true } on the first quantum above
 * -80 dBFS and { sounding: false } after ~2 s below it, so effect tails ring
 * out first. Nothing here polls: with the app silent, no message arrives and
 * nothing runs.
 *
 * Until the node exists (audio still locked, or the worklet failed) the app
 * counts as silent only when the context is not running; a failed install
 * leaves it sounding, so every picture keeps drawing as it did before.
 */

import { installIdleGate } from './idleGate';

let sounding = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === sounding) return;
  sounding = next;
  for (const fn of listeners) fn();
}

export function isSounding(): boolean {
  return sounding;
}

export function subscribeSounding(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

let installed: Promise<void> | null = null;

/** Listen to `source` (the context's master output). Once per context. */
export function watchSignal(ctx: AudioContext, source: AudioNode): Promise<void> {
  if (installed) return installed;
  installed = installIdleGate(ctx).then(() => {
    const node = new AudioWorkletNode(ctx, 'signal-presence', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (e: MessageEvent<{ sounding: boolean }>) => set(e.data.sounding);
    source.connect(node);
  }).catch(() => {
    // No sentinel: never report silence, so nothing stops drawing.
    set(true);
  });
  return installed;
}

/** Tests only. */
export function _setSoundingForTest(next: boolean): void {
  set(next);
}

/**
 * A measuring tap - an analyser or meter and the delay that feeds it - joined
 * to the graph only while the app sounds. Chrome pulls every AnalyserNode each
 * quantum, with everything upstream of it, whether anything reads it or not;
 * in a silent app nothing reads it (hooks/useFrameGate.ts) and a disconnected
 * analyser keeps its last, silent, block. Returns the disposer.
 */
export function tapWhileSounding(connect: () => void, disconnect: () => void): () => void {
  let joined = false;
  const sync = () => {
    if (sounding === joined) return;
    joined = sounding;
    try { if (joined) connect(); else disconnect(); } catch { /* node already gone */ }
  };
  sync();
  const unsub = subscribeSounding(sync);
  return () => {
    unsub();
    if (joined) { joined = false; try { disconnect(); } catch { /* already gone */ } }
  };
}
