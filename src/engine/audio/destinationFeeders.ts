/**
 * What actually reaches the speakers.
 *
 * Every level meter in the app (AudioDataBus, signal presence, get_audio_level)
 * taps ONE node: Tone's destination output. AudioContext.destination sums
 * every node connected to it, so a second feeder - a node connected straight
 * to the destination, another copy of the programme, an inverted one, a
 * feeder on another context - changes what the ear hears while that tap reads
 * a healthy level (NO-SOUND-NORMAL-PROFILE, 2026-10-14: a song measured
 * -24 dBFS RMS at the tap and was silent to the ear).
 *
 * This records every connection made to any AudioDestinationNode, from the
 * first import on, so the true final output - the sum the destination plays -
 * can be measured: `measureFinalOutput`.
 */

interface FeederEdge {
  /** Output index of the feeder that is connected (connect(dest, output)). */
  output: number;
}

const feeders = new Map<AudioDestinationNode, Map<AudioNode, FeederEdge>>();
let installedOn: object | null = null;

function isDestination(n: unknown): n is AudioDestinationNode {
  return typeof AudioDestinationNode !== 'undefined' && n instanceof AudioDestinationNode;
}

/**
 * Wrap AudioNode connect/disconnect to record edges into a destination.
 * Idempotent. Takes the prototype so tests can install on a polyfilled one.
 */
export function installDestinationFeeders(
  proto: Record<string, unknown> | undefined = typeof AudioNode !== 'undefined'
    ? (AudioNode.prototype as unknown as Record<string, unknown>)
    : undefined,
): void {
  if (!proto || installedOn === proto) return;
  installedOn = proto;
  const connect = proto.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  const disconnect = proto.disconnect as (this: AudioNode, ...a: unknown[]) => unknown;
  proto.connect = function (this: AudioNode, ...args: unknown[]) {
    const r = connect.apply(this, args);
    const dst = args[0];
    if (isDestination(dst)) {
      let set = feeders.get(dst);
      if (!set) { set = new Map(); feeders.set(dst, set); }
      set.set(this, { output: typeof args[1] === 'number' ? args[1] : 0 });
    }
    return r;
  };
  proto.disconnect = function (this: AudioNode, ...args: unknown[]) {
    const r = disconnect.apply(this, args);
    const dst = args[0];
    if (isDestination(dst)) {
      feeders.get(dst)?.delete(this);
    } else if (dst === undefined || typeof dst === 'number') {
      for (const set of feeders.values()) set.delete(this);
    }
    return r;
  };
}

/** Every node currently connected to a destination, grouped by destination. */
export function destinationFeeders(): Array<{ destination: AudioDestinationNode; nodes: Array<{ node: AudioNode; output: number }> }> {
  const out: Array<{ destination: AudioDestinationNode; nodes: Array<{ node: AudioNode; output: number }> }> = [];
  for (const [destination, set] of feeders) {
    if ((destination.context as BaseAudioContext).state === 'closed') { feeders.delete(destination); continue; }
    if (set.size === 0) continue;
    out.push({ destination, nodes: [...set].map(([node, e]) => ({ node, output: e.output })) });
  }
  return out;
}

/** Side-branch analysers on the destination's input: what the destination sums, per channel and per feeder. */
export interface FinalOutputProbe {
  /** Read the probe's current window; call after audio has run through it. */
  read(): FinalOutputReading;
  dispose(): void;
}

export interface FinalOutputReading {
  /** RMS of the summed left / right channels the destination plays. */
  leftRms: number;
  rightRms: number;
  /** RMS of each feeder alone (mono downmix), in feeder order. */
  feederRms: number[];
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Rebuild the destination's sum on a side branch: every feeder into one
 * 2-channel gain (the same speakers mix the destination applies), split to
 * left and right analysers; plus one analyser per feeder. Nothing here
 * connects to the destination, so it changes no audio.
 */
export function createFinalOutputProbe(ctx: BaseAudioContext, nodes: Array<{ node: AudioNode; output: number }>, fftSize = 2048): FinalOutputProbe {
  const sum = ctx.createGain();
  sum.channelCount = 2;
  sum.channelCountMode = 'explicit';
  sum.channelInterpretation = 'speakers';
  const split = ctx.createChannelSplitter(2);
  const left = ctx.createAnalyser();
  const right = ctx.createAnalyser();
  left.fftSize = right.fftSize = fftSize;
  sum.connect(split);
  split.connect(left, 0);
  split.connect(right, 1);
  const per = nodes.map(({ node, output }) => {
    const a = ctx.createAnalyser();
    a.fftSize = fftSize;
    node.connect(sum, output);
    node.connect(a, output);
    return a;
  });
  const buf = new Float32Array(fftSize);
  return {
    read() {
      left.getFloatTimeDomainData(buf); const leftRms = rms(buf);
      right.getFloatTimeDomainData(buf); const rightRms = rms(buf);
      const feederRms = per.map((a) => { a.getFloatTimeDomainData(buf); return rms(buf); });
      return { leftRms, rightRms, feederRms };
    },
    dispose() {
      nodes.forEach(({ node }, i) => {
        try { node.disconnect(sum); } catch { /* gone */ }
        try { node.disconnect(per[i]); } catch { /* gone */ }
      });
      try { sum.disconnect(); split.disconnect(); } catch { /* ok */ }
    },
  };
}

installDestinationFeeders();
