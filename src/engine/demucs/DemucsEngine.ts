/**
 * DemucsEngine — Singleton manager for Demucs WASM stem separation
 *
 * Handles:
 *   - Model weight download + IndexedDB caching
 *   - Worker lifecycle (spawn, init, terminate)
 *   - Separation requests with progress callbacks
 *   - Stem result caching in IndexedDB
 *
 * Usage:
 *   const engine = DemucsEngine.getInstance();
 *   await engine.ensureModel('4s', (p) => console.log(p));
 *   const stems = await engine.separate(leftPCM, rightPCM, 44100, (p) => console.log(p));
 *   // stems = { drums: {left, right}, bass: {left, right}, ... }
 */

import type {
  DemucsModelType,
  StemResult,
  StemState,
  CachedStems,
  DemucsWorkerResponse,
} from './types';
import { STEM_NAMES_4S, STEM_NAMES_6S } from './types';

// ── Model URLs (hosted on our CDN or Hetzner) ──────────────────────────────

const MODEL_URLS: Record<DemucsModelType, string> = {
  '4s': 'https://devilbox.uprough.net/models/ggml-model-htdemucs-4s-f16.bin',
  '6s': 'https://devilbox.uprough.net/models/ggml-model-htdemucs-6s-f16.bin',
};

// Fallback: HuggingFace direct links
const MODEL_URLS_FALLBACK: Record<DemucsModelType, string> = {
  '4s': 'https://huggingface.co/datasets/Retrobear/demucs.cpp/resolve/main/ggml-model-htdemucs-4s-f16.bin',
  '6s': 'https://huggingface.co/datasets/Retrobear/demucs.cpp/resolve/main/ggml-model-htdemucs-6s-f16.bin',
};

// ── IndexedDB for model weights ────────────────────────────────────────────

const MODEL_DB_NAME = 'DEViLBOX_Models';
const MODEL_DB_VERSION = 1;
const MODEL_STORE = 'models';

const STEM_DB_NAME = 'DEViLBOX_StemCache';
const STEM_DB_VERSION = 1;
const STEM_STORE = 'stems';

// ── Types ──────────────────────────────────────────────────────────────────

export type ProgressCallback = (progress: number, message: string) => void;

// ── Engine ─────────────────────────────────────────────────────────────────

export class DemucsEngine {
  private static instance: DemucsEngine | null = null;

  private worker: Worker | null = null;
  private modelType: DemucsModelType | null = null;
  private state: StemState = 'none';
  private pendingResolve: ((result: StemResult) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private pendingProgress: ProgressCallback | null = null;

  static getInstance(): DemucsEngine {
    if (!DemucsEngine.instance) {
      DemucsEngine.instance = new DemucsEngine();
    }
    return DemucsEngine.instance;
  }

  getState(): StemState { return this.state; }
  getModelType(): DemucsModelType | null { return this.modelType; }

  /**
   * Ensure model weights are downloaded and worker is initialized.
   * Safe to call multiple times — no-ops if already loaded.
   */
  async ensureModel(
    model: DemucsModelType = '4s',
    onProgress?: ProgressCallback,
  ): Promise<void> {
    if (this.worker && this.modelType === model) return; // Already loaded

    // Terminate existing worker if switching models
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.state = 'downloading-model';

    // 1. Get model weights (cached or download)
    const modelData = await this.getModelWeights(model, onProgress);

    // 2. Spawn worker and pass model
    this.worker = new Worker('/demucs/demucs.worker.js');
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);
    this.worker.onerror = (e) => {
      console.error('[Demucs] Worker error:', e);
      this.state = 'error';
      if (this.pendingReject) {
        this.pendingReject(new Error('Demucs worker crashed: ' + e.message));
        this.pendingReject = null;
        this.pendingResolve = null;
      }
    };

    // Transfer model data to worker (zero-copy)
    await new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent<DemucsWorkerResponse>) => {
        if (e.data.type === 'ready') {
          this.worker!.removeEventListener('message', handler as EventListener);
          this.modelType = model;
          this.state = 'none';
          resolve();
        } else if (e.data.type === 'error') {
          this.worker!.removeEventListener('message', handler as EventListener);
          this.state = 'error';
          reject(new Error((e.data as { error: string }).error));
        }
      };
      this.worker!.addEventListener('message', handler as EventListener);
      this.worker!.postMessage({ type: 'init', modelData }, [modelData]);
    });
  }

  /**
   * Separate stereo PCM audio into stems.
   * Returns a StemResult with per-stem stereo Float32Arrays.
   */
  async separate(
    left: Float32Array,
    right: Float32Array,
    _sampleRate: number,
    onProgress?: ProgressCallback,
  ): Promise<StemResult> {
    if (!this.worker) {
      throw new Error('Model not loaded — call ensureModel() first');
    }
    if (this.pendingResolve) {
      throw new Error('Separation already in progress');
    }

    this.state = 'separating';
    const id = crypto.randomUUID();
    this.pendingProgress = onProgress ?? null;

    return new Promise<StemResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Transfer PCM buffers (zero-copy)
      const leftCopy = new Float32Array(left);
      const rightCopy = new Float32Array(right);
      this.worker!.postMessage(
        { type: 'separate', id, left: leftCopy, right: rightCopy },
        [leftCopy.buffer, rightCopy.buffer],
      );
    });
  }

  /** Terminate the worker and release resources */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.modelType = null;
    this.state = 'none';
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  /**
   * Get stem names for the current model
   */
  getStemNames(): readonly string[] {
    return this.modelType === '6s' ? STEM_NAMES_6S : STEM_NAMES_4S;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private handleWorkerMessage(e: MessageEvent<DemucsWorkerResponse>): void {
    const msg = e.data;

    switch (msg.type) {
      case 'progress':
        if (this.pendingProgress) {
          this.pendingProgress(msg.progress, msg.message);
        }
        break;

      case 'complete':
        this.state = 'ready';
        if (this.pendingResolve) {
          this.pendingResolve(msg.stems as StemResult);
          this.pendingResolve = null;
          this.pendingReject = null;
          this.pendingProgress = null;
        }
        break;

      case 'error':
        this.state = 'error';
        if (this.pendingReject) {
          this.pendingReject(new Error(msg.error));
          this.pendingReject = null;
          this.pendingResolve = null;
          this.pendingProgress = null;
        }
        break;

      case 'log':
        console.log('[Demucs WASM]', msg.message);
        break;
    }
  }

  /**
   * Get model weights from IndexedDB cache, or download from CDN.
   */
  private async getModelWeights(
    model: DemucsModelType,
    onProgress?: ProgressCallback,
  ): Promise<ArrayBuffer> {
    // Try IndexedDB cache first
    const cached = await this.loadModelFromCache(model);
    if (cached) {
      onProgress?.(1.0, 'Model loaded from cache');
      return cached;
    }

    // Download from CDN
    onProgress?.(0, `Downloading ${model === '4s' ? '4-stem' : '6-stem'} model...`);

    let data: ArrayBuffer;
    try {
      data = await this.downloadModel(MODEL_URLS[model], onProgress);
    } catch {
      // Fallback to HuggingFace
      onProgress?.(0, 'Primary CDN failed, trying fallback...');
      data = await this.downloadModel(MODEL_URLS_FALLBACK[model], onProgress);
    }

    // Cache for next time
    await this.saveModelToCache(model, data);
    onProgress?.(1.0, 'Model downloaded and cached');

    return data;
  }

  private async downloadModel(
    url: string,
    onProgress?: ProgressCallback,
  ): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

    const contentLength = Number(response.headers.get('Content-Length') || 0);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(received / contentLength, `Downloading model... ${(received / 1e6).toFixed(1)} / ${(contentLength / 1e6).toFixed(1)} MB`);
      }
    }

    // Concatenate chunks
    const result = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  }

  // ── IndexedDB Model Cache ────────────────────────────────────────────────

  private async openModelDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(MODEL_DB_NAME, MODEL_DB_VERSION);
      req.onerror = () => reject(new Error('Failed to open model cache DB'));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MODEL_STORE)) {
          db.createObjectStore(MODEL_STORE, { keyPath: 'model' });
        }
      };
    });
  }

  private async loadModelFromCache(model: DemucsModelType): Promise<ArrayBuffer | null> {
    try {
      const db = await this.openModelDB();
      return new Promise((resolve) => {
        const tx = db.transaction(MODEL_STORE, 'readonly');
        const store = tx.objectStore(MODEL_STORE);
        const req = store.get(model);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async saveModelToCache(model: DemucsModelType, data: ArrayBuffer): Promise<void> {
    try {
      const db = await this.openModelDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MODEL_STORE, 'readwrite');
        const store = tx.objectStore(MODEL_STORE);
        store.put({ model, data, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[Demucs] Failed to cache model:', err);
    }
  }

  // ── Stem Result Cache ────────────────────────────────────────────────────

  private async openStemDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(STEM_DB_NAME, STEM_DB_VERSION);
      req.onerror = () => reject(new Error('Failed to open stem cache DB'));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STEM_STORE)) {
          const store = db.createObjectStore(STEM_STORE, { keyPath: 'hash' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Cache separated stems for a given file hash
   */
  async cacheStemResult(
    hash: string,
    result: StemResult,
    sampleRate: number,
  ): Promise<void> {
    try {
      const db = await this.openStemDB();
      const stems: Record<string, ArrayBuffer> = {};
      let numSamples = 0;

      for (const [name, data] of Object.entries(result)) {
        numSamples = data.left.length;
        // Interleave L/R for compact storage
        const interleaved = new Float32Array(numSamples * 2);
        for (let i = 0; i < numSamples; i++) {
          interleaved[i * 2] = data.left[i];
          interleaved[i * 2 + 1] = data.right[i];
        }
        stems[name] = interleaved.buffer;
      }

      const entry: CachedStems = {
        hash,
        model: this.modelType!,
        sampleRate,
        numSamples,
        stems,
        timestamp: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STEM_STORE, 'readwrite');
        tx.objectStore(STEM_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[Demucs] Failed to cache stems:', err);
    }
  }

  /**
   * Load cached stems for a given file hash
   */
  async loadCachedStems(hash: string): Promise<StemResult | null> {
    try {
      const db = await this.openStemDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STEM_STORE, 'readonly');
        const req = tx.objectStore(STEM_STORE).get(hash);
        req.onsuccess = () => {
          const entry = req.result as CachedStems | undefined;
          if (!entry) { resolve(null); return; }

          const result: StemResult = {};
          for (const [name, buffer] of Object.entries(entry.stems)) {
            const interleaved = new Float32Array(buffer);
            const numSamples = interleaved.length / 2;
            const left = new Float32Array(numSamples);
            const right = new Float32Array(numSamples);
            for (let i = 0; i < numSamples; i++) {
              left[i] = interleaved[i * 2];
              right[i] = interleaved[i * 2 + 1];
            }
            result[name] = { left, right };
          }
          resolve(result);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Check if stems are cached for a given file hash
   */
  async hasCachedStems(hash: string): Promise<boolean> {
    try {
      const db = await this.openStemDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STEM_STORE, 'readonly');
        const req = tx.objectStore(STEM_STORE).count(hash);
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Clear all cached stems
   */
  async clearStemCache(): Promise<void> {
    try {
      const db = await this.openStemDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STEM_STORE, 'readwrite');
        tx.objectStore(STEM_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[Demucs] Failed to clear stem cache:', err);
    }
  }
}
