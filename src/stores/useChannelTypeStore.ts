/**
 * Live channel type classification store.
 *
 * Stores CED classification results keyed by channel index (not instrument ID).
 * Fed by CedChannelAccumulator (oscilloscope tap → 0.68s buffer → CED worker)
 * and SidVoiceClassifier (register-state heuristic for SID voices).
 *
 * AutoDub reads from here to get live channel roles for UADE and SID formats
 * where instrument-level PCM is unavailable.
 */
import { create } from 'zustand';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import type { InstrumentType, InstrumentTypeResult } from '@/bridge/analysis/AudioSetInstrumentMap';
import { instrumentTypeToRole } from '@/bridge/analysis/AudioSetInstrumentMap';
import { getInstrumentClassifierWorker } from '@stores/useInstrumentTypeStore';

export interface ChannelTypeResult {
  channel: number;
  instrumentType: InstrumentType;
  role: ChannelRole | null;
  topLabels: Array<{ label: string; score: number }>;
  confidence: number;
  timestampMs: number;
  source: 'ced' | 'register';   // which classifier produced this
}

interface ChannelTypeState {
  results: Map<number, ChannelTypeResult>;

  /** Queue 0.68s of channel audio for CED inference. Called by CedChannelAccumulator. */
  classifyChannelAudio(channel: number, pcm16k: Float32Array): void;

  /** Store a register-based heuristic result directly (SidVoiceClassifier). */
  setChannelRole(channel: number, instrumentType: InstrumentType, source: 'ced' | 'register'): void;

  /** Offline per-voice render + CED classification for SID files.
   *  Triggered once per SID load; results arrive asynchronously. */
  classifySidVoicesFromFile(fileData: Uint8Array, filename: string): void;

  /** Get the ChannelRole for a channel, or null if unknown. */
  getRoleForChannel(channel: number): ChannelRole | null;

  /** Snapshot of all channel roles (array indexed by channel). */
  getRolesSnapshot(nChannels: number): Array<ChannelRole | null>;

  _onWorkerResult(result: InstrumentTypeResult): void;
}

// Channel classifications use negative instrument IDs: channel N → -(N+1)
// The InstrumentClassifier worker doesn't care — it echoes back instrumentId.
// useInstrumentTypeStore routes negative IDs here via _onWorkerResult.

let _reqId = 0;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChannelTypeStore = create<ChannelTypeState>((set, get) => ({
  results: new Map(),

  classifySidVoicesFromFile(fileData: Uint8Array, filename: string) {
    const worker = new Worker(
      new URL('../workers/dj-render.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const id = `sid_voices_${Date.now()}`;
    const buf = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg.type === 'sidVoicesReady' && msg.id === id) {
        const voices = msg.voices as Float32Array[];
        const sampleRate = (msg.sampleRate as number | undefined) ?? 44100;
        const classifierWorker = getInstrumentClassifierWorker();
        if (classifierWorker) {
          voices.forEach((pcm, voiceIdx) => {
            const reqId = `sid_voice_${voiceIdx}_${Date.now()}`;
            const instrumentId = -(voiceIdx + 1);  // voice 0 → -1, etc.
            classifierWorker.postMessage({
              type: 'classify',
              id: reqId,
              instrumentId,
              pcm,
              sampleRate,
              name: `sid_voice_${voiceIdx}`,
            }, [pcm.buffer]);
          });
        }
        worker.terminate();
      }
      if (msg.type === 'renderError') {
        worker.terminate();
      }
    };
    worker.onerror = () => worker.terminate();
    worker.postMessage({ type: 'renderSidVoices', id, fileBuffer: buf, filename, subsong: 0 },
      [buf]);
  },

  classifyChannelAudio(channel: number, pcm16k: Float32Array) {
    const worker = getInstrumentClassifierWorker();
    if (!worker) return;

    const instrumentId = -(channel + 1);   // channel 0 → -1, channel 1 → -2, …
    const id = `ch_${++_reqId}`;

    worker.postMessage({
      type: 'classify',
      id,
      instrumentId,
      pcm: pcm16k,
      sampleRate: 16000,
      name: `channel_${channel}`,
    }, [pcm16k.buffer]);
  },

  setChannelRole(channel: number, instrumentType: InstrumentType, source: 'ced' | 'register') {
    const role = instrumentTypeToRole(instrumentType);
    set(s => {
      const results = new Map(s.results);
      results.set(channel, {
        channel,
        instrumentType,
        role,
        topLabels: [{ label: instrumentType, score: 1.0 }],
        confidence: source === 'register' ? 0.7 : 0.85,
        timestampMs: Date.now(),
        source,
      });
      return { results };
    });
  },

  getRoleForChannel(channel: number): ChannelRole | null {
    return get().results.get(channel)?.role ?? null;
  },

  getRolesSnapshot(nChannels: number): Array<ChannelRole | null> {
    const { results } = get();
    return Array.from({ length: nChannels }, (_, ch) => results.get(ch)?.role ?? null);
  },

  _onWorkerResult(result: InstrumentTypeResult) {
    const channel = -(result.instrumentId) - 1;  // -1 → 0, -2 → 1, …
    if (channel < 0) return;
    const role = instrumentTypeToRole(result.instrumentType);
    set(s => {
      const results = new Map(s.results);
      results.set(channel, {
        channel,
        instrumentType: result.instrumentType,
        role,
        topLabels: result.topLabels,
        confidence: result.confidence,
        timestampMs: Date.now(),
        source: 'ced',
      });
      return { results };
    });
  },
}));
