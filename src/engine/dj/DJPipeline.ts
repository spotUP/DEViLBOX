/**
 * DJPipeline — Orchestrator for background rendering + analysis
 *
 * Manages a priority queue of render + analysis tasks using dedicated
 * Web Workers for both rendering (UADE/libopenmpt) and analysis (essentia.js).
 * Never blocks the audio thread or UI.
 *
 * Pipeline per task:
 *   1. Render tracker file → stereo PCM (DJRenderWorker)
 *   2. Encode PCM → WAV for storage
 *   3. Cache WAV + basic waveform peaks (DJAudioCache)
 *   4. Analyze PCM → BPM, beats, key, frequency peaks (DJAnalysisWorker)
 *   5. Persist analysis results (DJAudioCache.updateCacheAnalysis)
 *   6. Update deck state in store (useDJStore)
 *
 * @module DJPipeline
 */

import { getCachedAudio, cacheAudio, updateCacheAnalysis } from './DJAudioCache';
import { useDJStore } from '@/stores/useDJStore';
import type { DeckId } from './DeckEngine';
import { getDJEngineIfActive } from './DJEngine';
import type { BeatGridData } from './DJAudioCache';

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskPriority = 'high' | 'normal' | 'low';

export interface PipelineTask {
  id: string;
  fileBuffer: ArrayBuffer;
  filename: string;
  deckId?: DeckId;         // If associated with a specific deck
  priority: TaskPriority;
  subsong?: number;
  /** If true, skip render and go straight to analysis (audio already cached) */
  analysisOnly?: boolean;
  /** Pre-existing PCM data (skip render, just analyze + optionally cache) */
  pcmLeft?: Float32Array;
  pcmRight?: Float32Array;
  sampleRate?: number;
  /** Pre-existing WAV data (skip render, just load + analyze) */
  wavData?: ArrayBuffer;
  duration?: number;
}

interface QueueEntry {
  task: PipelineTask;
  resolve: (result: PipelineResult) => void;
  reject: (error: Error) => void;
}

export interface PipelineResult {
  wavData: ArrayBuffer;
  duration: number;
  sampleRate: number;
  waveformPeaks: Float32Array;
  analysis: {
    bpm: number;
    bpmConfidence: number;
    beats: number[];
    downbeats: number[];
    timeSignature: number;
    musicalKey: string;
    keyConfidence: number;
    frequencyPeaks: number[][];
    rmsDb: number;
    peakDb: number;
  } | null;
}

// ── WAV Encoder ──────────────────────────────────────────────────────────────

/**
 * Encode stereo Float32 PCM → 16-bit WAV ArrayBuffer.
 * Matches the format UADE.worklet.js _encodeWAV produces.
 */
function encodePCMToWAV(
  left: Float32Array,
  _right: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const numChannels = 1; // Mono — mix L+R for DJ use
  const bitsPerSample = 16;
  const numSamples = left.length;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const bufferSize = 44 + dataSize;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);              // chunk size
  view.setUint16(20, 1, true);               // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write mono 16-bit (UADE renders with panning=0.0 so L≡R)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Compute waveform overview peaks from stereo PCM.
 */
function computeWaveformFromPCM(
  left: Float32Array,
  right: Float32Array,
  numBins: number,
): Float32Array {
  const peaks = new Float32Array(numBins);
  const samplesPerBin = Math.floor(left.length / numBins);
  if (samplesPerBin < 1) return peaks;

  for (let bin = 0; bin < numBins; bin++) {
    const start = bin * samplesPerBin;
    const end = Math.min(start + samplesPerBin, left.length);
    let maxAmp = 0;
    for (let i = start; i < end; i++) {
      const sample = (Math.abs(left[i]) + Math.abs(right[i])) * 0.5;
      if (sample > maxAmp) maxAmp = sample;
    }
    peaks[bin] = maxAmp;
  }
  return peaks;
}

// ── Singleton Pipeline ───────────────────────────────────────────────────────

let instance: DJPipeline | null = null;

export function getDJPipeline(): DJPipeline {
  if (!instance) {
    instance = new DJPipeline();
  }
  return instance;
}

export function disposeDJPipeline(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}

// ── Pipeline Class ───────────────────────────────────────────────────────────

export class DJPipeline {
  private renderWorker: Worker | null = null;
  private analysisWorker: Worker | null = null;

  private queue: QueueEntry[] = [];
  private processing = false;
  private currentTaskId: string | null = null;
  private currentDeckId: DeckId | null = null;

  // Pending render/analysis callbacks keyed by task id
  private renderCallbacks = new Map<string, {
    resolve: (data: { left: Float32Array; right: Float32Array; sampleRate: number; duration: number }) => void;
    reject: (err: Error) => void;
  }>();

  private analysisCallbacks = new Map<string, {
    resolve: (result: PipelineResult['analysis']) => void;
    reject: (err: Error) => void;
  }>();

  constructor() {
    this.initWorkers();
  }

  // ── Worker Lifecycle ─────────────────────────────────────────────────────

  private initWorkers(): void {
    // Render worker
    this.renderWorker = new Worker(
      new URL('@/workers/dj-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.renderWorker.onmessage = (e) => this.handleRenderMessage(e);
    this.renderWorker.onerror = (e) => {
      console.error('[DJPipeline] Render worker error:', e);
    };

    // Analysis worker
    this.analysisWorker = new Worker(
      new URL('@/workers/dj-analysis.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.analysisWorker.onmessage = (e) => this.handleAnalysisMessage(e);
    this.analysisWorker.onerror = (e) => {
      console.error('[DJPipeline] Analysis worker error:', e);
    };

    // Init both
    this.renderWorker.postMessage({ type: 'init' });
    this.analysisWorker.postMessage({ type: 'init' });
  }

  private handleRenderMessage(e: MessageEvent): void {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        console.log('[DJPipeline] Render worker ready');
        break;

      case 'renderProgress': {
        const { id, progress } = msg;
        if (id === this.currentTaskId) {
          this.updateDeckAnalysisState(id, 'rendering', this.currentDeckId);
        }
        // Scale render progress to 0-50% of total pipeline
        this.emitTaskProgress(id, progress * 0.5);
        break;
      }

      case 'renderComplete': {
        const { id, left, right, sampleRate, duration } = msg;
        const cb = this.renderCallbacks.get(id);
        if (cb) {
          this.renderCallbacks.delete(id);
          cb.resolve({ left, right, sampleRate, duration });
        }
        break;
      }

      case 'renderError': {
        const { id, error } = msg;
        const cb = this.renderCallbacks.get(id);
        if (cb) {
          this.renderCallbacks.delete(id);
          cb.reject(new Error(error));
        }
        break;
      }
    }
  }

  private handleAnalysisMessage(e: MessageEvent): void {
    const msg = e.data;
    switch (msg.type) {
      case 'ready':
        console.log('[DJPipeline] Analysis worker ready');
        break;

      case 'analysisProgress': {
        const { id, progress } = msg;
        // Scale analysis progress to 50-100% of total pipeline
        this.emitTaskProgress(id, 50 + progress * 0.5);
        break;
      }

      case 'analysisComplete': {
        const { id, result } = msg;
        const cb = this.analysisCallbacks.get(id);
        if (cb) {
          this.analysisCallbacks.delete(id);
          cb.resolve(result);
        }
        break;
      }

      case 'analysisError': {
        const { id, error } = msg;
        const cb = this.analysisCallbacks.get(id);
        if (cb) {
          this.analysisCallbacks.delete(id);
          cb.reject(new Error(error));
        }
        break;
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Enqueue a file for render + analysis.
   * Returns a promise that resolves when the full pipeline completes.
   */
  enqueue(task: PipelineTask): Promise<PipelineResult> {
    return new Promise((resolve, reject) => {
      const entry: QueueEntry = { task, resolve, reject };

      // Insert by priority
      const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
      const insertIdx = this.queue.findIndex(
        (q) => priorityOrder[q.task.priority] > priorityOrder[task.priority],
      );

      if (insertIdx === -1) {
        this.queue.push(entry);
      } else {
        this.queue.splice(insertIdx, 0, entry);
      }

      // Update store with queue size
      this.updateStoreQueue();

      // If deck is specified, mark it as pending
      if (task.deckId) {
        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: 'pending',
        });
      }

      // Kick the processor
      void this.processNext();
    });
  }

  /**
   * Convenience: enqueue render + analysis for a tracker file.
   */
  async renderAndAnalyze(
    fileBuffer: ArrayBuffer,
    filename: string,
    deckId?: DeckId,
    priority: TaskPriority = 'normal',
  ): Promise<PipelineResult> {
    const id = `${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return this.enqueue({ id, fileBuffer, filename, deckId, priority });
  }

  /**
   * Convenience: analyze already-rendered PCM (e.g., from an existing cache entry that
   * was rendered before analysis was implemented).
   */
  async analyzeOnly(
    fileBuffer: ArrayBuffer,
    filename: string,
    pcmLeft: Float32Array,
    pcmRight: Float32Array,
    sampleRate: number,
    deckId?: DeckId,
    priority: TaskPriority = 'normal',
  ): Promise<PipelineResult> {
    const id = `analyze-${filename}-${Date.now()}`;
    return this.enqueue({
      id,
      fileBuffer,
      filename,
      deckId,
      priority,
      analysisOnly: true,
      pcmLeft,
      pcmRight,
      sampleRate,
    });
  }

  /**
   * Check cache and return if fully analyzed; otherwise enqueue.
   * Designed to be the primary entry point for file loading.
   */
  async loadOrEnqueue(
    fileBuffer: ArrayBuffer,
    filename: string,
    deckId?: DeckId,
    priority: TaskPriority = 'high',
  ): Promise<PipelineResult> {
    // Check cache
    const cached = await getCachedAudio(fileBuffer);
    if (cached && cached.beatGrid && cached.bpm) {
      // Fully cached + analyzed — return immediately
      console.log(`[DJPipeline] Full cache hit for ${filename}`);

      // Update deck state immediately
      if (deckId) {
        // Auto-gain: target -14 dB RMS
        const TARGET_RMS_DB = -14;
        const rmsDb = cached.rmsDb ?? -100;
        const peakDb = cached.peakDb ?? -100;
        const autoTrimDb = rmsDb > -80
          ? Math.max(-12, Math.min(12, TARGET_RMS_DB - rmsDb))
          : 0;
        const deckState = useDJStore.getState().decks[deckId];
        const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;

        useDJStore.getState().setDeckState(deckId, {
          analysisState: 'ready',
          beatGrid: cached.beatGrid as BeatGridData,
          musicalKey: cached.musicalKey ?? null,
          keyConfidence: cached.keyConfidence ?? 0,
          frequencyPeaks: cached.frequencyPeaks
            ? cached.frequencyPeaks.map(b => new Float32Array(b))
            : null,
          rmsDb,
          peakDb,
          trimGain,
        });
      }

      return {
        wavData: cached.audioData,
        duration: cached.duration,
        sampleRate: cached.sampleRate,
        waveformPeaks: new Float32Array(cached.waveformPeaks),
        analysis: {
          bpm: cached.bpm!,
          bpmConfidence: cached.bpmConfidence ?? 0,
          beats: cached.beatGrid?.beats ?? [],
          downbeats: cached.beatGrid?.downbeats ?? [],
          timeSignature: cached.beatGrid?.timeSignature ?? 4,
          musicalKey: cached.musicalKey ?? 'Unknown',
          keyConfidence: cached.keyConfidence ?? 0,
          frequencyPeaks: cached.frequencyPeaks ?? [],
          rmsDb: cached.rmsDb ?? -100,
          peakDb: cached.peakDb ?? -100,
        },
      };
    }

    if (cached && !cached.beatGrid) {
      // Audio cached but not analyzed — decode to PCM and analyze only
      console.log(`[DJPipeline] Cached but unanalyzed: ${filename}`);
      try {
        const audioCtx = new OfflineAudioContext(2, 1, 44100);
        const decoded = await audioCtx.decodeAudioData(cached.audioData.slice(0));
        const left = decoded.getChannelData(0);
        const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
        return this.analyzeOnly(fileBuffer, filename, left, right, decoded.sampleRate, deckId, priority);
      } catch (err) {
        console.warn(`[DJPipeline] Failed to decode cached audio for analysis, re-rendering: ${filename}`, err);
        // Fall through to full render
      }
    }

    // Full render + analysis needed
    return this.renderAndAnalyze(fileBuffer, filename, deckId, priority);
  }

  /** Number of queued tasks (not counting current). */
  get queueSize(): number {
    return this.queue.length;
  }

  /** Whether the pipeline is actively processing. */
  get isActive(): boolean {
    return this.processing;
  }

  /** Cancel all pending tasks (does not cancel in-progress task). */
  cancelAll(): void {
    for (const entry of this.queue) {
      entry.reject(new Error('Pipeline cancelled'));
    }
    this.queue = [];
    this.updateStoreQueue();
  }

  /** Cancel tasks for a specific deck. */
  cancelForDeck(deckId: DeckId): void {
    const removed = this.queue.filter(e => e.task.deckId === deckId);
    this.queue = this.queue.filter(e => e.task.deckId !== deckId);
    for (const entry of removed) {
      entry.reject(new Error(`Cancelled: deck ${deckId} reloaded`));
    }
    this.updateStoreQueue();
  }

  dispose(): void {
    this.stopProgressTicker();
    this.cancelAll();
    this.renderWorker?.terminate();
    this.analysisWorker?.terminate();
    this.renderWorker = null;
    this.analysisWorker = null;
  }

  // ── Internal Processing Loop ─────────────────────────────────────────────

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const entry = this.queue.shift()!;
    const { task, resolve, reject } = entry;
    this.currentTaskId = task.id;
    this.currentDeckId = task.deckId ?? null;

    // Start progress interpolation ticker
    if (this.currentDeckId) {
      this.startProgressTicker(this.currentDeckId);
    }

    this.updateStoreQueue();

    try {
      const result = await this.executeTask(task);
      resolve(result);
    } catch (err) {
      console.error(`[DJPipeline] Task failed: ${task.filename}`, err);
      reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.stopProgressTicker();
      this.processing = false;
      this.currentTaskId = null;
      this.currentDeckId = null;

      // Continue processing queue
      if (this.queue.length > 0) {
        void this.processNext();
      } else {
        // Queue drained
        useDJStore.getState().setPipelineState(0, null);
      }
    }
  }

  private async executeTask(task: PipelineTask): Promise<PipelineResult> {
    const startTime = performance.now();

    let left: Float32Array;
    let right: Float32Array;
    let sampleRate: number;
    let duration: number;
    let wavData: ArrayBuffer;
    let waveformPeaks: Float32Array;

    if (task.analysisOnly && task.pcmLeft) {
      // Skip render — PCM already provided
      left = task.pcmLeft;
      right = task.pcmRight ?? task.pcmLeft;
      sampleRate = task.sampleRate ?? 44100;
      duration = left.length / sampleRate;

      // We still need WAV + waveform for the result
      wavData = encodePCMToWAV(left, right, sampleRate);
      waveformPeaks = computeWaveformFromPCM(left, right, 800);
    } else if (task.wavData) {
      // WAV provided, decode to PCM for analysis
      wavData = task.wavData;
      const audioCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await audioCtx.decodeAudioData(wavData.slice(0));
      left = decoded.getChannelData(0);
      right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
      sampleRate = decoded.sampleRate;
      duration = decoded.duration;
      waveformPeaks = computeWaveformFromPCM(left, right, 800);
    } else {
      // Full render
      this.updateDeckAnalysisState(task.id, 'rendering', task.deckId);

      const renderResult = await this.doRender(task);
      left = renderResult.left;
      right = renderResult.right;
      sampleRate = renderResult.sampleRate;
      duration = renderResult.duration;

      // Encode to WAV
      this.emitTaskProgress(task.id, 48);
      wavData = encodePCMToWAV(left, right, sampleRate);
      waveformPeaks = computeWaveformFromPCM(left, right, 800);

      // Debug: Check WAV output
      console.log(`[DJPipeline] WAV encoded: ${wavData.byteLength} bytes, duration: ${duration.toFixed(2)}s, PCM frames: ${left.length}`);

      // Cache the audio immediately (before analysis)
      this.emitTaskProgress(task.id, 49);
      await cacheAudio(
        task.fileBuffer,
        task.filename,
        wavData,
        duration,
        waveformPeaks,
        sampleRate,
        2, // stereo
      );

      console.log(
        `[DJPipeline] Rendered ${task.filename} in ${Math.round(performance.now() - startTime)}ms ` +
        `(${Math.round(duration)}s audio, ${Math.round(wavData.byteLength / 1024)}KB)`,
      );

      // Brief breather between heavy render and heavy analysis to prevent UI/audio jank
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // ── Analysis phase ───────────────────────────────────────────────────
    this.updateDeckAnalysisState(task.id, 'analyzing', task.deckId);

    let analysis: PipelineResult['analysis'] = null;
    try {
      analysis = await this.doAnalysis(task.id, left, right, sampleRate);

      // Persist analysis results in cache
      if (analysis) {
        const beatGrid: BeatGridData = {
          beats: analysis.beats,
          downbeats: analysis.downbeats,
          bpm: analysis.bpm,
          timeSignature: analysis.timeSignature,
        };

        await updateCacheAnalysis(task.fileBuffer, {
          beatGrid,
          bpm: analysis.bpm,
          bpmConfidence: analysis.bpmConfidence,
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          frequencyPeaks: analysis.frequencyPeaks,
          analysisVersion: 1,
        });
      }
    } catch (err) {
      console.warn(`[DJPipeline] Analysis failed for ${task.filename}:`, err);
      // Analysis failure is non-fatal — the audio is still usable
    }

    // ── Update deck state ────────────────────────────────────────────────
    if (task.deckId) {
      if (analysis) {
        // Auto-gain: target -14 dB RMS (standard DJ loudness reference)
        const TARGET_RMS_DB = -14;
        const autoTrimDb = analysis.rmsDb > -80
          ? Math.max(-12, Math.min(12, TARGET_RMS_DB - analysis.rmsDb))
          : 0;
        const deckState = useDJStore.getState().decks[task.deckId];
        const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;

        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: 'ready',
          beatGrid: {
            beats: analysis.beats,
            downbeats: analysis.downbeats,
            bpm: analysis.bpm,
            timeSignature: analysis.timeSignature,
          },
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          frequencyPeaks: analysis.frequencyPeaks.map(b => new Float32Array(b)),
          rmsDb: analysis.rmsDb,
          peakDb: analysis.peakDb,
          trimGain,
        });
      } else {
        // Analysis failed but render succeeded
        useDJStore.getState().setDeckState(task.deckId, {
          analysisState: 'ready',
        });
      }

      // ── Hot-swap from Tracker engine to Audio engine ───────────────────
      // If the DJ engine is still active and this track is still on that deck,
      // seamlessly switch to the pre-rendered high-quality WAV stream.
      const djEngine = getDJEngineIfActive();
      if (djEngine) {
        const deck = djEngine.getDeck(task.deckId);
        const currentState = useDJStore.getState().decks[task.deckId];
        
        // Only swap if the track hasn't changed while we were rendering
        if (currentState.fileName === task.filename && currentState.playbackMode === 'tracker') {
          void deck.hotSwapToAudio(wavData, task.filename).catch(err => {
            console.warn(`[DJPipeline] Hot-swap failed for ${task.filename}:`, err);
          });
        }
      }
    }

    const totalTime = Math.round(performance.now() - startTime);
    console.log(
      `[DJPipeline] Pipeline complete for ${task.filename} in ${totalTime}ms ` +
      `(BPM: ${analysis?.bpm?.toFixed(1) ?? '?'}, Key: ${analysis?.musicalKey ?? '?'})`,
    );

    return { wavData, duration, sampleRate, waveformPeaks, analysis };
  }

  // ── Worker Communication ─────────────────────────────────────────────────

  private doRender(task: PipelineTask): Promise<{
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    duration: number;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.renderWorker) {
        reject(new Error('Render worker not initialized'));
        return;
      }

      this.renderCallbacks.set(task.id, { resolve, reject });

      const buffer = task.fileBuffer.slice(0); // Clone to transfer
      this.renderWorker.postMessage(
        { type: 'render', id: task.id, fileBuffer: buffer, filename: task.filename, subsong: task.subsong },
        [buffer],
      );
    });
  }

  private doAnalysis(
    id: string,
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
  ): Promise<PipelineResult['analysis']> {
    return new Promise((resolve, reject) => {
      if (!this.analysisWorker) {
        reject(new Error('Analysis worker not initialized'));
        return;
      }

      this.analysisCallbacks.set(id, { resolve, reject });

      // Clone arrays for transfer
      const leftCopy = new Float32Array(left);
      const rightCopy = new Float32Array(right);

      this.analysisWorker.postMessage(
        { type: 'analyze', id, pcmLeft: leftCopy, pcmRight: rightCopy, sampleRate, numBins: 800 },
        [leftCopy.buffer, rightCopy.buffer],
      );
    });
  }

  // ── State Updates ────────────────────────────────────────────────────────

  private updateStoreQueue(): void {
    const store = useDJStore.getState();
    store.setPipelineState(
      this.queue.length + (this.processing ? 1 : 0),
      this.currentTaskId ? `Processing: ${this.currentTaskId}` : null,
    );
  }

  private updateDeckAnalysisState(
    _taskId: string,
    state: 'rendering' | 'analyzing',
    deckId?: DeckId | null,
  ): void {
    // Use the provided deckId directly (task has already been shifted from queue)
    const target = deckId ?? this.findDeckForTask(_taskId);
    if (target) {
      useDJStore.getState().setDeckState(target, {
        analysisState: state,
      });
    }
  }

  private findDeckForTask(taskId: string): DeckId | null {
    // Check queue entries
    for (const entry of this.queue) {
      if (entry.task.id === taskId && entry.task.deckId) {
        return entry.task.deckId;
      }
    }
    return null;
  }

  // ── Progress interpolation ────────────────────────────────────────────────
  // Workers report progress in large jumps (e.g. 55% → 70% with nothing in between
  // during a multi-second WASM call). A ticker gradually advances the displayed
  // progress toward the last reported target so the bar never appears frozen.

  private progressTarget = 0;
  private progressDisplayed = 0;
  private progressTickTimer: ReturnType<typeof setInterval> | null = null;
  private progressDeckId: DeckId | null = null;

  private startProgressTicker(deckId: DeckId): void {
    this.stopProgressTicker();
    this.progressTarget = 0;
    this.progressDisplayed = 0;
    this.progressDeckId = deckId;
    this.progressTickTimer = setInterval(() => {
      if (this.progressDisplayed >= this.progressTarget) return;
      // Ease toward target: close 30% of the remaining gap each tick (200ms)
      // This means we approach but never quite reach the target until a real update bumps it
      const gap = this.progressTarget - this.progressDisplayed;
      const step = Math.max(0.5, gap * 0.3);
      this.progressDisplayed = Math.min(this.progressTarget, this.progressDisplayed + step);
      if (this.progressDeckId) {
        useDJStore.getState().setDeckAnalysisProgress(this.progressDeckId, Math.round(this.progressDisplayed));
      }
    }, 200);
  }

  private stopProgressTicker(): void {
    if (this.progressTickTimer) {
      clearInterval(this.progressTickTimer);
      this.progressTickTimer = null;
    }
  }

  private emitTaskProgress(taskId: string, progress: number): void {
    const deckId = (taskId === this.currentTaskId && this.currentDeckId) 
      ? this.currentDeckId 
      : this.findDeckForTask(taskId);

    if (deckId) {
      this.progressTarget = progress;
      this.progressDeckId = deckId;
      // If displayed is behind target, the ticker will animate toward it.
      // If this is a big jump forward, snap displayed to at least the last shown value
      // (the ticker handles the rest).
      // For the final 100%, snap immediately.
      if (progress >= 100) {
        this.progressDisplayed = 100;
        this.stopProgressTicker();
        useDJStore.getState().setDeckAnalysisProgress(deckId, 100);
      } else if (this.progressDisplayed < progress) {
        // Immediately show at least 60% of the jump so the bar isn't completely stale
        const jump = progress - this.progressDisplayed;
        this.progressDisplayed += jump * 0.6;
        useDJStore.getState().setDeckAnalysisProgress(deckId, Math.round(this.progressDisplayed));
      }
    }
  }
}
