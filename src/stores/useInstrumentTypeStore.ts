/**
 * Instrument type classification store.
 *
 * Manages the CED worker lifecycle and stores per-instrument type results.
 * Classification is triggered once per unique instrument (keyed by sample URL),
 * results arrive asynchronously and are stored here for AutoDub + UI to read.
 */
import { create } from 'zustand';
import { decodeWavDataUrl } from '@/bridge/analysis/SampleSpectrum';
import type { InstrumentTypeResult, InstrumentType } from '@/bridge/analysis/AudioSetInstrumentMap';
import type { InstrumentConfig } from '@/types/instrument/defaults';

export type { InstrumentTypeResult, InstrumentType };

type WorkerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface InstrumentTypeState {
  results: Map<number, InstrumentTypeResult>;
  status: WorkerStatus;
  pendingIds: Set<number>;
  classifiedUrls: Set<string>;       // dedup by sample URL

  /** Classify all instruments that have sample PCM data. Safe to call repeatedly — dedupes. */
  classifyInstruments(instruments: InstrumentConfig[]): void;
  getType(instrumentId: number): InstrumentType | null;
  getResult(instrumentId: number): InstrumentTypeResult | null;
  _onWorkerMessage(data: unknown): void;
  _setStatus(status: WorkerStatus): void;
}

// ── Worker singleton ──────────────────────────────────────────────────────────

let _worker: Worker | null = null;
let _reqId = 0;

function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(
    new URL('../workers/instrument-classifier.worker.ts', import.meta.url),
    { type: 'module' }
  );
  _worker.addEventListener('message', (e: MessageEvent) => {
    useInstrumentTypeStore.getState()._onWorkerMessage(e.data);
  });
  _worker.addEventListener('error', () => {
    useInstrumentTypeStore.getState()._setStatus('error');
  });
  _worker.postMessage({ type: 'init' });
  return _worker;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useInstrumentTypeStore = create<InstrumentTypeState>((set, get) => ({
  results: new Map(),
  status: 'idle',
  pendingIds: new Set(),
  classifiedUrls: new Set(),

  classifyInstruments(instruments: InstrumentConfig[]) {
    const { classifiedUrls, pendingIds } = get();
    const worker = getWorker();

    for (const inst of instruments) {
      const url = inst.sample?.url;
      if (!url || typeof url !== 'string') continue;
      if (!url.startsWith('data:audio/wav;base64,')) continue;
      if (classifiedUrls.has(url)) continue;

      const decoded = decodeWavDataUrl(url);
      if (!decoded || decoded.pcm.length < 64) continue;

      const id = String(++_reqId);
      pendingIds.add(inst.id);
      classifiedUrls.add(url);

      worker.postMessage({
        type: 'classify',
        id,
        instrumentId: inst.id,
        pcm: decoded.pcm,
        sampleRate: decoded.sampleRate,
        name: inst.name,
      }, [decoded.pcm.buffer]);   // transfer ownership

      set(s => ({ pendingIds: new Set(s.pendingIds) }));
    }
  },

  getType(instrumentId: number): InstrumentType | null {
    return get().results.get(instrumentId)?.instrumentType ?? null;
  },

  getResult(instrumentId: number): InstrumentTypeResult | null {
    return get().results.get(instrumentId) ?? null;
  },

  _onWorkerMessage(data: unknown) {
    const msg = data as Record<string, unknown>;

    if (msg.type === 'loading') {
      set({ status: 'loading' });
      return;
    }
    if (msg.type === 'ready') {
      set({ status: 'ready' });
      return;
    }
    if (msg.type === 'error' && msg.id === 'init') {
      set({ status: 'error' });
      return;
    }
    if (msg.type === 'result') {
      const { instrumentId, topLabels, instrumentType, confidence } = msg as {
        instrumentId: number;
        topLabels: Array<{ label: string; score: number }>;
        instrumentType: InstrumentType;
        confidence: number;
      };
      set(s => {
        const results = new Map(s.results);
        results.set(instrumentId, { instrumentId, topLabels, instrumentType, confidence });
        const pendingIds = new Set(s.pendingIds);
        pendingIds.delete(instrumentId);
        return { results, pendingIds };
      });
    }
    if (msg.type === 'error' && msg.instrumentId !== undefined) {
      const instrumentId = msg.instrumentId as number;
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
