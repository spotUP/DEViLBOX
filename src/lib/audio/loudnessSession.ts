/**
 * loudnessSession — wires the master output into the BS.1770-4 LoudnessMeter.
 *
 * Taps Tone.Destination's input GainNode (same extraction as AudioDataBus'
 * shared analysers) into a relay AudioWorklet that posts sample-contiguous
 * frames back to the main thread, where the tested LoudnessMeter core runs.
 *
 * Cost model: nothing is attached until start() — "measures only while the
 * panel is open, costs nothing when closed". stop() disconnects everything.
 */

import * as Tone from 'tone';
import { LoudnessMeter, type LoudnessSnapshot } from './loudnessMeter';

export type { LoudnessSnapshot };

interface Session {
  node: AudioWorkletNode;
  tap: AudioNode;
  meter: LoudnessMeter;
}

let session: Session | null = null;
let moduleLoaded = false;

function getNativeContextAndTap(): { ctx: AudioContext; tap: AudioNode } {
  const toneCtx = Tone.getContext();
  const ctx = ((toneCtx as unknown as { rawContext?: AudioContext }).rawContext
    ?? (toneCtx as unknown as { _context?: AudioContext })._context
    ?? (toneCtx as unknown as AudioContext)) as AudioContext;

  const dest = Tone.getDestination();
  const d = dest as unknown as { output?: { input?: AudioNode }; _gainNode?: AudioNode; input?: AudioNode };
  const tap = d.output?.input ?? d._gainNode ?? d.input;
  if (!tap) throw new Error('[loudnessSession] Cannot find Tone.Destination native input node');
  return { ctx, tap };
}

/** Start measuring the master output. Idempotent. */
export async function startLoudnessSession(): Promise<void> {
  if (session) return;
  const { ctx, tap } = getNativeContextAndTap();

  if (!moduleLoaded) {
    // Cache-bust like the other worklet loads so HMR picks up edits in dev.
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL ?? '/'}loudness-relay.worklet.js?v=1`);
    moduleLoaded = true;
  }

  const node = new AudioWorkletNode(ctx, 'loudness-relay', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 2,
    channelCountMode: 'clamped-max',
  });

  const meter = new LoudnessMeter(ctx.sampleRate, 2);
  node.port.onmessage = (e: MessageEvent<{ l: Float32Array; r: Float32Array }>) => {
    meter.process([e.data.l, e.data.r]);
  };

  tap.connect(node);
  session = { node, tap, meter };
}

/** Stop measuring and detach everything. */
export function stopLoudnessSession(): void {
  if (!session) return;
  try { session.tap.disconnect(session.node); } catch { /* already detached */ }
  session.node.port.onmessage = null;
  try { session.node.disconnect(); } catch { /* no outputs */ }
  session = null;
}

/** Current measurement snapshot, or null if the session isn't running. */
export function getLoudnessSnapshot(): LoudnessSnapshot | null {
  return session ? session.meter.snapshot() : null;
}

export function isLoudnessSessionActive(): boolean {
  return session !== null;
}
