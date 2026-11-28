/**
 * DJ render for the synth formats. Furnace (.fur, and DefleMask .dmf through the same FurnaceFileOps parser) plays
 * through the engine the tracker view uses: FurnaceDispatchEngine.startWithCoordinator driving the real
 * FurnaceDispatch.worklet.js + FurnaceDispatch.wasm. A Web Worker has no AudioContext, so the worklet's processor is
 * hosted here (AudioWorkletProcessor / registerProcessor / port shims) and its process() is called block by block.
 *
 * Per-voice signal: the worklet's own readOscilloscopeData (furnace_dispatch_get_osc_needle / read_osc, every chip's
 * every channel) streams into a capturing DevilboxChannelStream instead of the UI's shared ring.
 */
import {
  ChannelScopeTrackBuilder, ChannelStemsBuilder, DECK_SCOPE_CHANNELS,
  type ChannelScopeTrack, type MonoStem,
} from '@/engine/dj/channelScopeTrack';
import type { PlaybackCoordinator } from '@engine/PlaybackCoordinator';

export interface SynthRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  channelScopes?: ChannelScopeTrack;
  monoStems?: MonoStem[];
}

const SAMPLE_RATE = 44100;
/** The worklet's own block (FurnaceDispatch.worklet.js bufferSize). */
const BLOCK = 128;
/** A song that has gone fully silent this long after sounding has ended. */
const END_SILENCE_FRAMES = SAMPLE_RATE * 4;

type MessageHandler = ((e: { data: unknown }) => void) | null;

/** One end of a MessageChannel-like pair; delivery is async like a real port. */
class ShimPort {
  onmessage: MessageHandler = null;
  peer: ShimPort | null = null;
  postMessage(data: unknown): void {
    const peer = this.peer;
    queueMicrotask(() => peer?.onmessage?.({ data }));
  }
  start(): void { /* MessagePort API */ }
  close(): void { this.onmessage = null; }
}

interface HostedProcessor {
  port: ShimPort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  readOscilloscopeData(): void;
}
type ProcessorClass = new (options?: unknown) => HostedProcessor;

/** The voice samples the worklet's readOscilloscopeData hands its channel stream, kept per voice. */
class OscCapture {
  chunks: Int16Array[][] = [];
  writeInt16(views: Int16Array[], n: number): void {
    for (let ch = 0; ch < views.length; ch++) (this.chunks[ch] ??= []).push(views[ch].subarray(0, n));
  }
  discontinue(): void { /* a gap: the next write continues the same capture */ }
}


const g = globalThis as unknown as Record<string, unknown>;
let processorClass: Promise<ProcessorClass> | null = null;
const host: { processor: HostedProcessor | null } = { processor: null };

/** Evaluate FurnaceDispatch.worklet.js with the AudioWorkletGlobalScope names it uses, once per worker. */
function loadProcessorClass(url: string): Promise<ProcessorClass> {
  processorClass ??= (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FurnaceDispatch.worklet.js: HTTP ${res.status}`);
    const code = await res.text();
    let registered: ProcessorClass | null = null;
    class AudioWorkletProcessorShim {
      port: ShimPort;
      constructor() {
        const port = pendingPort;
        if (!port) throw new Error('furnace worklet host: processor constructed outside its node');
        this.port = port;
      }
    }
    g.AudioWorkletProcessor = AudioWorkletProcessorShim;
    g.registerProcessor = (_name: string, cls: ProcessorClass) => { registered = cls; };
    g.sampleRate = SAMPLE_RATE;
    g.currentTime = 0;
    g.currentFrame = 0;
    new Function(code)();
    if (!registered) throw new Error('FurnaceDispatch.worklet.js registered no processor');
    return registered;
  })();
  return processorClass;
}
let pendingPort: ShimPort | null = null;
let loadedClass: ProcessorClass | null = null;

/** The AudioWorkletNode FurnaceDispatchEngine creates: here it builds the hosted processor. */
class HostedWorkletNode {
  port = new ShimPort();
  constructor() {
    if (!loadedClass) throw new Error('furnace worklet host: module not loaded');
    const inner = new ShimPort();
    this.port.peer = inner;
    inner.peer = this.port;
    pendingPort = inner;
    try { host.processor = new loadedClass({ processorOptions: { sampleRate: SAMPLE_RATE } }); } finally { pendingPort = null; }
  }
  connect(): void { /* no graph in a worker: process() is called directly */ }
  disconnect(): void { /* no graph */ }
}

/** The minimum of a BaseAudioContext FurnaceDispatchEngine.init touches. */
function hostContext(): Record<string, unknown> {
  const node = () => ({ gain: { value: 0 }, connect() { /* no graph */ }, disconnect() { /* no graph */ } });
  return {
    state: 'running',
    sampleRate: SAMPLE_RATE,
    currentTime: 0,
    resume: async () => {},
    destination: {},
    createGain: node,
    audioWorklet: {
      addModule: async (url: string) => {
        if (!url.includes('FurnaceDispatch.worklet.js')) return; // channel-stream.js: replaced by OscCapture
        loadedClass = await loadProcessorClass(url.split('?')[0]);
      },
    },
  };
}

async function renderWithFurnace(
  fileBuffer: ArrayBuffer, filename: string, subsong: number,
  postProgress: (progress: number) => void, maxSeconds: number, withStems: boolean,
): Promise<SynthRenderResult> {
  const { parseFurnaceFile } = await import('@/lib/import/parsers/FurnaceToSong');
  const song = await parseFurnaceFile(fileBuffer, filename, Math.max(0, subsong));
  if (!song.furnaceNative) throw new Error(`${filename}: no Furnace module data`);
  postProgress(10);

  g.AudioWorkletNode ??= HostedWorkletNode;
  g.DevilboxChannelStream = OscCapture;
  const { FurnaceDispatchEngine } = await import('@/engine/furnace-dispatch/FurnaceDispatchEngine');
  const engine = FurnaceDispatchEngine.getInstance();
  await engine.init(hostContext());
  const processor = host.processor;
  if (!processor) throw new Error('furnace worklet host: no processor (engine initialised elsewhere)');

  let ended = false;
  const coordinator = { dispatchEnginePosition: () => {} } as unknown as PlaybackCoordinator;
  const started = await engine.startWithCoordinator(coordinator, {
    song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
    onEnded: () => { ended = true; },
  });
  if (!started.started) throw new Error(`${filename}: the Furnace sequencer did not start`);

  const osc = new OscCapture();
  // The processor made its stream on its first read; hand it this render's capture.
  (processor as unknown as { _oscStream: OscCapture; _oscReadPos: unknown })._oscStream = osc;
  (processor as unknown as { _oscReadPos: unknown })._oscReadPos = null;
  try {
    const maxFrames = Math.floor(SAMPLE_RATE * maxSeconds);
    const left = new Float32Array(maxFrames), right = new Float32Array(maxFrames);
    const outL = new Float32Array(BLOCK), outR = new Float32Array(BLOCK);
    const outputs = [[outL, outR]];
    let totalFrames = 0, lastSound = -1;
    while (totalFrames < maxFrames && !ended) {
      g.currentFrame = totalFrames;
      g.currentTime = totalFrames / SAMPLE_RATE;
      processor.process([], outputs, {});
      processor.readOscilloscopeData();
      const n = Math.min(BLOCK, maxFrames - totalFrames);
      left.set(outL.subarray(0, n), totalFrames);
      right.set(outR.subarray(0, n), totalFrames);
      for (let i = 0; i < n; i++) if (outL[i] !== 0 || outR[i] !== 0) lastSound = totalFrames + i;
      totalFrames += n;
      // Let the port messages (chip state, seqEnded) arrive.
      if ((totalFrames / BLOCK) % 64 === 0) await Promise.resolve();
      if (totalFrames % (SAMPLE_RATE * 5) < BLOCK) postProgress(Math.min(80, 15 + (totalFrames / maxFrames) * 65));
      if (lastSound >= 0 && totalFrames - lastSound > END_SILENCE_FRAMES) break;
    }
    if (lastSound < 0) throw new Error(`Furnace rendered only silence for ${filename}`);
    postProgress(85);

    // shortcut: the osc ring runs at each chip's own rate; a voice is stretched over the mix by sample count, which
    // assumes a constant rate (true per chip). Upgrade when a scope must be sample-exact against the mix.
    const voices = osc.chunks.slice(0, DECK_SCOPE_CHANNELS).map((parts) => {
      const len = parts.reduce((s, p) => s + p.length, 0);
      const all = new Int16Array(len);
      let o = 0;
      for (const p of parts) { all.set(p, o); o += p.length; }
      return all;
    });
    let channelScopes: ChannelScopeTrack | undefined;
    let monoStems: MonoStem[] | undefined;
    if (voices.length > 0) {
      const at = (ch: number, i: number) => {
        const v = voices[ch];
        return v.length ? v[Math.min(v.length - 1, Math.floor((i * v.length) / totalFrames))] / 32768 : 0;
      };
      const scopes = new ChannelScopeTrackBuilder(voices.length, SAMPLE_RATE);
      scopes.push(totalFrames, at);
      channelScopes = scopes.finish();
      if (withStems) {
        // shortcut: a stem is the voice's oscilloscope signal (pre chip-volume, centred); write a per-channel audio
        // tap in FurnaceDispatchWrapper.cpp when stems must match the mix level and pan.
        const stems = new ChannelStemsBuilder(voices.length);
        stems.push(totalFrames, at, at);
        monoStems = stems.finishMono(totalFrames);
      }
    }
    console.log(`[DJRenderWorker/furnace] ${filename}: ${voices.length} voice taps, ${totalFrames} frames${ended ? ', song ended' : ''}, ${monoStems?.length ?? 0} mono stems`);
    return { left: left.slice(0, totalFrames), right: right.slice(0, totalFrames), sampleRate: SAMPLE_RATE, channelScopes, monoStems };
  } finally {
    started.cleanup();
  }
}

const FURNACE_EXTENSIONS = new Set(['fur', 'dmf']);

export async function renderWithSynth(
  fileBuffer: ArrayBuffer,
  filename: string,
  subsong: number,
  postProgress: (progress: number) => void,
  maxSeconds = 600,
  withStems = true,
): Promise<SynthRenderResult> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (FURNACE_EXTENSIONS.has(ext)) return renderWithFurnace(fileBuffer, filename, subsong, postProgress, maxSeconds, withStems);
  throw new Error(`.${ext} is not yet rendered by the DJ synth renderer (play it in the main tracker)`);
}
