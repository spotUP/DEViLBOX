/**
 * Failure diagnostics for a Tone.js synth note on a tracker channel: the rms of every stage the note passes
 * (instrument wrapper, effect chain output, voice gain, voice filter, voice panner, channel strip), so a CI-only
 * silent render names the layer that went quiet (WOBBLE-CI: WobbleBass channel 0 renders 0 on Linux x64 only).
 *
 * Each stage feeds a raw-context AnalyserNode, which drains into a gain of 0 on the destination: the taps are
 * parallel and add exact zeros, so the asserted path is unchanged. One offline suspend at the window end reads
 * every analyser (fftSize 32768 holds the whole window), then rendering resumes.
 */
import type * as ToneNs from 'tone';
import type { ToneEngine } from '@engine/ToneEngine';

type Tap = { name: string; analyser: AnalyserNode | null; why?: string };
type EngineInternals = {
  instruments: Map<number, unknown>;
  instrumentEffectChains: Map<number, { output: unknown }>;
  activeVoices: Map<number, { instrument: unknown; nodes: { gain: unknown; filter: unknown; panner: unknown; source?: unknown } }[]>;
  channelOutputs: Map<number, { channel: unknown }>;
};

export interface ChannelStageDiag { report(output: Float32Array): string }

const FFT = 32768;

/** Await right after the channel trigger, inside the render's play callback (before offline.render). */
export async function tapChannelStages(engine: ToneEngine, Tone: typeof ToneNs, instrumentId: number, channel: number,
  from: number, to: number): Promise<ChannelStageDiag> {
  const raw = Tone.getContext().rawContext as unknown as OfflineAudioContext;
  const e = engine as unknown as EngineInternals;
  const key = engine.getInstrumentKey(instrumentId, channel);
  const inst = e.instruments.get(key);
  const chainAtTrigger = e.instrumentEffectChains.get(key);
  const voices = e.activeVoices.get(channel) ?? [];
  const voice = voices[voices.length - 1];
  const strip = e.channelOutputs.get(channel)?.channel;
  const sourceAtTrigger = voice?.nodes.source;
  // The chain is built in a microtask queued at trigger (buildChainNow); let it land before tapping. Microtasks
  // only: a timer here would move wall-clock work into the render path the test measures.
  for (let i = 0; i < 50 && !e.instrumentEffectChains.has(key); i++) await Promise.resolve();
  const chain = e.instrumentEffectChains.get(key);
  const sourceName = (src: unknown) => !src ? 'unset' : src === chain?.output ? 'chain.output'
    : src === inst ? 'instrument' : `other ${(src as object).constructor?.name}`;
  const facts = [
    `key=${key} instrument=${inst ? (inst as object).constructor?.name : 'none'} chainAtTrigger=${!!chainAtTrigger} chainAtRender=${!!chain}`,
    `voices=${voices.length} voice.instrument===instrument:${voice ? voice.instrument === inst : 'n/a'}`,
    `voice.nodes.source: at trigger ${sourceName(sourceAtTrigger)}, at render ${sourceName(voice?.nodes.source)}`,
    `ctx: state=${raw.state} sampleRate=${raw.sampleRate} currentTime=${raw.currentTime}`,
  ];
  const sink = raw.createGain();
  sink.gain.value = 0;
  sink.connect(raw.destination);
  const tap = (name: string, node: unknown): Tap => {
    if (!node) return { name, analyser: null, why: 'missing' };
    try {
      const analyser = raw.createAnalyser();
      analyser.fftSize = FFT;
      (node as { connect(dst: AudioNode): unknown }).connect(analyser); // Tone node, wrapper or native node
      analyser.connect(sink);
      return { name, analyser };
    } catch (err) {
      return { name, analyser: null, why: `tap failed: ${String(err)}` };
    }
  };
  const taps = [
    tap('wrapper output', inst), tap('effects chain output', chain?.output), tap('voice gain', voice?.nodes.gain),
    tap('voice filter', voice?.nodes.filter), tap('voice panner', voice?.nodes.panner), tap('channel strip', strip),
  ];
  const lines: string[] = [];
  const n = Math.min(FFT, Math.round((to - from) * raw.sampleRate));
  raw.suspend(to).then(() => {
    const buf = new Float32Array(FFT);
    for (const t of taps) {
      if (!t.analyser) { lines.push(`${t.name}: ${t.why}`); continue; }
      t.analyser.getFloatTimeDomainData(buf);
      let s = 0, nan = 0;
      for (let i = FFT - n; i < FFT; i++) { const x = buf[i]; if (Number.isNaN(x)) nan++; else s += x * x; }
      lines.push(`${t.name}: rms=${Math.sqrt(s / n).toFixed(5)} nan=${nan}`);
    }
    return raw.resume();
  }).catch((err: unknown) => { lines.push(`suspend/read failed: ${String(err)}`); });
  return {
    report(output) {
      let nan = 0;
      for (const x of output) if (Number.isNaN(x)) nan++;
      return [`stages of channel ${channel}, window ${from}-${to} s`, ...facts, ...(lines.length ? lines : ['stage reads: none (suspend never reached)']),
        `render output ch0 nan=${nan} of ${output.length}`].map((l) => `[WOBBLE-DIAG] ${l}`).join('\n');
    },
  };
}
