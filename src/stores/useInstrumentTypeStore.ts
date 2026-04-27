/**
 * Instrument type classification store.
 *
 * Manages the CED worker lifecycle and stores per-instrument type results.
 *
 * Two classification paths:
 *  1. Sample instruments — PCM decoded directly from data:audio/wav;base64 URL.
 *  2. Synth instruments  — rendered via SynthBaker.bakeToSample() in the main
 *     thread (OfflineAudioContext), then PCM sent to the worker. Falls back
 *     gracefully for WASM-based engines that InstrumentFactory can't render.
 *
 * Both paths send Float32Array PCM to the CED ONNX worker and receive an
 * InstrumentTypeResult back. Results are stored here and consumed by AutoDub
 * (via SongRoleTimeline) and the instrument list UI.
 */
import { create } from 'zustand';
import { decodeWavDataUrl } from '@/bridge/analysis/SampleSpectrum';
import { useUIStore } from '@/stores/useUIStore';
import {
  synthTypeToInstrumentType,
  instrumentTypeToRole,
} from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentTypeResult, InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentConfig } from '@/types/instrument/defaults';

export type { InstrumentTypeResult, InstrumentType };

type WorkerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface InstrumentTypeState {
  results: Map<number, InstrumentTypeResult>;
  status: WorkerStatus;
  pendingIds: Set<number>;
  classifiedUrls: Set<string>;   // dedup sample instruments by URL
  classifiedSynthIds: Set<number>; // dedup synth instruments by ID

  /** Classify all instruments — samples via PCM decode, synths via bake.
   *  Safe to call on every AutoDub tick — deduplicates automatically. */
  classifyInstruments(instruments: InstrumentConfig[]): void;
  /** Clear dedup sets so the next classifyInstruments call reclassifies everything. */
  resetClassified(): void;
  /** Manually assign an instrument type, overriding auto-detection. Pass null to clear. */
  setManualType(instrumentId: number, type: InstrumentType | null): void;
  getType(instrumentId: number): InstrumentType | null;
  getResult(instrumentId: number): InstrumentTypeResult | null;
  _onWorkerMessage(data: unknown): void;
  _setStatus(status: WorkerStatus): void;
}

// ── Worker singleton ──────────────────────────────────────────────────────────

let _worker: Worker | null = null;
let _reqId = 0;
// Track pending stagger timeouts so resetClassified() can cancel them,
// preventing bleed from a previous song load when a new one starts quickly.
const _pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

/** Export worker accessor so CedChannelAccumulator / SidVoiceClassifier can
 *  dispatch channel PCM to the same worker without a second instance. */
export function getInstrumentClassifierWorker(): Worker | null { return _worker; }

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(
    new URL('../workers/instrument-classifier.worker.ts', import.meta.url),
    { type: 'module' }
  );
  _worker.addEventListener('message', (e: MessageEvent) => {
    useInstrumentTypeStore.getState()._onWorkerMessage(e.data);
  });
  _worker.addEventListener('error', (e) => {
    console.error('[CED] Worker error:', e.message, e.filename, e.lineno);
    useInstrumentTypeStore.getState()._setStatus('error');
    useUIStore.getState().setStatusMessage('Instrument classifier error — see console', false, 5000);
  });
  _worker.postMessage({ type: 'init' });
  return _worker;
}

// ── Synth baking (main thread, OfflineAudioContext) ───────────────────────────

/** Send an AudioBuffer's channel 0 to the CED worker. */
function sendAudioBufferToWorker(
  worker: Worker,
  instrumentId: number,
  buffer: AudioBuffer,
): void {
  // Copy to avoid detaching a read-only AudioBuffer channel
  const src = buffer.getChannelData(0);
  const pcm = new Float32Array(src);
  const id = String(++_reqId);
  useInstrumentTypeStore.getState()._markPending(instrumentId);
  worker.postMessage({
    type: 'classify',
    id,
    instrumentId,
    pcm,
    sampleRate: buffer.sampleRate,
    name: '',
  }, [pcm.buffer]);
}

/** Bake a synth instrument offline and classify via CED.
 *  Silently skips instruments that InstrumentFactory cannot render (WASM engines). */
async function bakeSynthAndClassify(
  inst: InstrumentConfig,
  worker: Worker,
): Promise<void> {
  try {
    const { SynthBaker } = await import('@/lib/audio/SynthBaker');
    const duration = SynthBaker.getSmartDuration(inst);
    const buffer = await SynthBaker.bakeToSample(inst, Math.max(1.0, duration));
    sendAudioBufferToWorker(worker, inst.id, buffer);
  } catch {
    // WASM/non-Tone engines fail silently — no classification for this instrument
    useInstrumentTypeStore.getState()._clearPending(inst.id);
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useInstrumentTypeStore = create<InstrumentTypeState & {
  _markPending(id: number): void;
  _clearPending(id: number): void;
}>((set, get) => ({
  results: new Map(),
  status: 'idle',
  pendingIds: new Set(),
  classifiedUrls: new Set(),
  classifiedSynthIds: new Set(),

  resetClassified() {
    // Cancel any staggered dispatches from the previous song load before clearing state.
    for (const id of _pendingTimeouts) clearTimeout(id);
    _pendingTimeouts.length = 0;
    set({ classifiedUrls: new Set(), classifiedSynthIds: new Set(), results: new Map(), pendingIds: new Set() });
  },

  setManualType(instrumentId: number, type: InstrumentType | null) {
    // Persist to InstrumentConfig so it survives reloads
    void import('@stores/useInstrumentStore').then(({ useInstrumentStore }) => {
      useInstrumentStore.getState().updateInstrument(instrumentId, { manualInstrumentType: type ?? undefined });
    });
    set(s => {
      const results = new Map(s.results);
      if (type) {
        results.set(instrumentId, {
          instrumentId,
          instrumentType: type,
          topLabels: [{ label: type, score: 1.0 }],
          confidence: 1.0,
        });
      } else {
        results.delete(instrumentId);
      }
      return { results };
    });
  },

  classifyInstruments(instruments: InstrumentConfig[]) {
    // Inject manual type overrides immediately — they beat CED and spectral.
    const manualResults = new Map(get().results);
    for (const inst of instruments) {
      if (inst.manualInstrumentType) {
        const type = inst.manualInstrumentType as InstrumentType;
        manualResults.set(inst.id, {
          instrumentId: inst.id,
          instrumentType: type,
          topLabels: [{ label: type, score: 1.0 }],
          confidence: 1.0,
        });
      }
    }
    if (manualResults.size !== get().results.size) set({ results: manualResults });

    const { classifiedUrls, classifiedSynthIds } = get();
    const worker = getWorker();
    // Stagger dispatches so we don't flood the worker with all instruments at
    // once. ONNX inference is CPU-heavy; sending one every 200ms keeps the
    // browser responsive while the 86.9MB model warms up.
    let delay = 0;
    const STAGGER_MS = 200;

    for (const inst of instruments) {
      // Manual type already injected above — skip CED entirely for this instrument.
      if (inst.manualInstrumentType) continue;

      const url = inst.sample?.url;
      const hasSample = typeof url === 'string' && url.startsWith('data:audio/wav;base64,');

      // ── Path 1: sample instrument ─────────────────────────────────────────
      if (hasSample) {
        if (classifiedUrls.has(url!)) continue;
        const decoded = decodeWavDataUrl(url!);
        if (!decoded || decoded.pcm.length < 64) continue;

        classifiedUrls.add(url!);
        const id = String(++_reqId);
        const pcm = decoded.pcm;
        const sampleRate = decoded.sampleRate;
        const instId = inst.id;
        set(s => ({ pendingIds: new Set([...s.pendingIds, instId]) }));

        _pendingTimeouts.push(setTimeout(() => {
          worker.postMessage({
            type: 'classify',
            id,
            instrumentId: instId,
            pcm,
            sampleRate,
            name: inst.name,
          }, [pcm.buffer]);
        }, delay));
        delay += STAGGER_MS;
        continue;
      }

      // ── Path 2a: synthType with deterministic role — no audio needed ─────
      const deterministicType = synthTypeToInstrumentType(inst.synthType);
      if (deterministicType !== null) {
        if (classifiedSynthIds.has(inst.id)) continue;
        classifiedSynthIds.add(inst.id);
        // Resolve role immediately without CED
        const role = instrumentTypeToRole(deterministicType);
        set(s => {
          const results = new Map(s.results);
          results.set(inst.id, {
            instrumentId: inst.id,
            instrumentType: deterministicType,
            topLabels: [{ label: inst.synthType, score: 1.0 }],
            confidence: 1.0,
          });
          return { results };
        });
        void role; // used via SongRoleTimeline — satisfies linter
        continue;
      }

      // ── Path 2b: synth instrument — bake via SynthBaker then CED ─────────
      if (classifiedSynthIds.has(inst.id)) continue;
      classifiedSynthIds.add(inst.id);
      set(s => ({ pendingIds: new Set([...s.pendingIds, inst.id]) }));
      _pendingTimeouts.push(setTimeout(() => void bakeSynthAndClassify(inst, worker), delay));
      delay += STAGGER_MS;
    }
  },

  getType(instrumentId: number): InstrumentType | null {
    return get().results.get(instrumentId)?.instrumentType ?? null;
  },

  getResult(instrumentId: number): InstrumentTypeResult | null {
    return get().results.get(instrumentId) ?? null;
  },

  _markPending(id: number) {
    set(s => ({ pendingIds: new Set([...s.pendingIds, id]) }));
  },

  _clearPending(id: number) {
    set(s => {
      const pendingIds = new Set(s.pendingIds);
      pendingIds.delete(id);
      return { pendingIds };
    });
  },

  _onWorkerMessage(data: unknown) {
    const msg = data as Record<string, unknown>;

    if (msg.type === 'loading') {
      set({ status: 'loading' });
      useUIStore.getState().setStatusMessage('Loading instrument classifier…', false, 0);
      return;
    }
    if (msg.type === 'ready') {
      set({ status: 'ready' });
      // Status message will be updated once results arrive
      return;
    }
    if (msg.type === 'error' && msg.id === 'init') {
      set({ status: 'error' });
      useUIStore.getState().setStatusMessage('Instrument classifier unavailable', false, 3000);
      return;
    }

    if (msg.type === 'result') {
      const { instrumentId, topLabels, instrumentType, confidence } = msg as {
        instrumentId: number;
        topLabels: Array<{ label: string; score: number }>;
        instrumentType: InstrumentType;
        confidence: number;
      };
      // Negative IDs are channel-direct classifications — route to channel store
      if (instrumentId < 0) {
        void import('@stores/useChannelTypeStore').then(({ useChannelTypeStore }) => {
          useChannelTypeStore.getState()._onWorkerResult({ instrumentId, topLabels, instrumentType, confidence });
        }).catch(() => {});
        return;
      }
      set(s => {
        const results = new Map(s.results);
        results.set(instrumentId, { instrumentId, topLabels, instrumentType, confidence });
        const pendingIds = new Set(s.pendingIds);
        pendingIds.delete(instrumentId);
        // Announce when the last pending result arrives
        if (pendingIds.size === 0 && results.size > 0) {
          useUIStore.getState().setStatusMessage(
            `Instruments classified: ${results.size} typed`,
            false, 3000
          );
        }
        return { results, pendingIds };
      });
    }

    if (msg.type === 'error' && msg.instrumentId !== undefined) {
      const instrumentId = msg.instrumentId as number;
      console.warn(`[CED] classify error inst=${instrumentId}:`, msg.error);
      set(s => {
        const pendingIds = new Set(s.pendingIds);
        pendingIds.delete(instrumentId);
        return { pendingIds };
      });
    }
  },

  _setStatus(status: WorkerStatus) {
    set({ status });
  },
}));
