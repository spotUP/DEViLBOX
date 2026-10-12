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

import { getCachedAudio, cacheAudio, updateCacheAnalysis, hashFile, setCacheChannelScopes } from './DJAudioCache';
import type { CachedAudio } from './DJAudioCache';
import { lookupServerAnalysis, storeServerAnalysis } from '@/lib/analysisCache';
import { useDJStore, type DeckState } from '@/stores/useDJStore';
import { notify } from '@/stores/useNotificationStore';
import type { DeckId } from './DeckEngine';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { getDJEngineIfActive } from './DJEngine';
import type { BeatGridData } from './DJAudioCache';
import { autoMatchOnLoad, pitchedBpm } from './DJAutoSync';
import type { ExtendedAnalysis } from './autodj/types';
import { buildDJTrackAnalysis, DJ_AUDIO_ANALYSIS_VERSION } from './autodj/trackAnalysis';
import { DemucsEngine } from '@engine/demucs/DemucsEngine';
import { attachChannelScopes, type ChannelScopeTrack } from './channelScopeTrack';
import type { StemResult } from '@engine/demucs/types';

// ── Auto-gain ────────────────────────────────────────────────────────────────

/**
 * A deck plays a song at the level the same song has in the tracker view
 * (owner decision 2026-10-11, "match tracker level"). The tracker applies no
 * per-song loudness normalisation: the sample and synth bus gains are manual
 * (0 dB by default), the optional bus auto-gain only balances the sample bus
 * against the synth bus, and the master volume defaults to 0 dB. So the
 * matching trim is 0 dB for every track, measured or not - the deck plays the
 * rendered song as rendered, and the deck limiter only catches overs.
 *
 * The old policy pushed every track to -6 dB RMS (+8 dB for a typical module
 * at -14 dB RMS), which put a crest-12 dB track's peaks ~6 dB over the deck
 * limiter: continuous limiting, a pumping kick, the DJ view sounding
 * processed next to the tracker view. Before that, an unmeasured track got
 * +9 dB. The arguments stay so every caller keeps one policy function.
 */
export function computeAutoTrim(_rmsDb: number, _peakDb: number): number {
  return 0;
}

// ── Types ────────────────────────────────────────────────────────────────────

/** What the render worker returns: the stereo mix and, where the engine has a per-channel tap, each channel's signal. */
interface RenderOutput {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  duration: number;
  channelScopes?: ChannelScopeTrack;
}

/** A scope re-render must be this close in length to the cached WAV for its track to line up with it. */
const SCOPE_RERENDER_DURATION_TOLERANCE_SEC = 0.5;

/** A background scope re-render was cut short so a user load could start; it is re-queued, not failed. */
class ScopeRenderPreempted extends Error {
  constructor() { super('Scope re-render preempted'); }
}

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
  /** Max render duration in seconds (default: 600). Use shorter for analysis-only batch. */
  maxRenderSeconds?: number;
  /**
   * Optional companion files forwarded to the render worker for multi-file
   * formats like TFMX (mdat.<song> needs smpl.<song>). Without these, UADE
   * fails with "uade_request_amiga_file: file not found" and returns -1.
   */
  companions?: Array<{ filename: string; buffer: ArrayBuffer }>;
  /**
   * Render only to read the per-channel scope track and store it on the
   * existing cache entry (old-shape entries rendered before scope tracks).
   * No WAV is encoded, no analysis runs, the cached audio and analysis are
   * untouched, and nothing is applied to a deck: the caller attaches the
   * track. `expectedDuration` is the cached WAV's length; a render of a
   * different length cannot line up with it and is discarded.
   */
  scopesOnly?: { expectedDuration: number };
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
  stems?: StemResult;
  /** scopesOnly tasks: the scope track rendered (and stored on the cache entry); wavData is empty then. */
  channelScopes?: ChannelScopeTrack;
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
    genre: {
      primary: string;
      subgenre: string;
      confidence: number;
      mood: string;
      energy: number;
      danceability: number;
    };
    /** Auto DJ extended analysis (activity timelines, loudness set, spectral, chroma); null for legacy entries. */
    extended?: ExtendedAnalysis | null;
  } | null;
}

/**
 * The analysis a fully analysed cache entry stands for, in the shape the
 * pipeline returns for a fresh analysis. Null when the entry was never
 * analysed (no beat grid or no BPM). One mapping for the cache-hit return of
 * loadOrEnqueue and for Auto DJ's pre-rendered load.
 */
/**
 * The cached loudness. Entries written before the analysis update stored
 * rmsDb/peakDb have none of their own; their extended analysis carries the
 * same measurement (mean-square RMS and peak of the mono render), so that is
 * read instead of reporting the track as unmeasured.
 */
export function cachedLoudness(cached: CachedAudio): { rmsDb: number; peakDb: number } {
  return {
    rmsDb: cached.rmsDb ?? cached.extended?.loudness.integratedDb ?? -100,
    peakDb: cached.peakDb ?? cached.extended?.loudness.peakDb ?? -100,
  };
}

export function analysisFromCachedAudio(cached: CachedAudio): PipelineResult['analysis'] {
  if (!cached.beatGrid || !cached.bpm) return null;
  const { rmsDb, peakDb } = cachedLoudness(cached);
  return {
    bpm: cached.bpm,
    bpmConfidence: cached.bpmConfidence ?? 0,
    beats: cached.beatGrid.beats ?? [],
    downbeats: cached.beatGrid.downbeats ?? [],
    timeSignature: cached.beatGrid.timeSignature ?? 4,
    musicalKey: cached.musicalKey ?? 'Unknown',
    keyConfidence: cached.keyConfidence ?? 0,
    frequencyPeaks: cached.frequencyPeaks ?? [],
    rmsDb,
    peakDb,
    genre: {
      primary: cached.genrePrimary ?? 'Unknown',
      subgenre: cached.genreSubgenre ?? 'Unknown',
      confidence: cached.genreConfidence ?? 0,
      mood: cached.mood ?? 'Unknown',
      energy: cached.energy ?? 0.5,
      danceability: cached.danceability ?? 0.5,
    },
    extended: cached.extended ?? null,
  };
}

/** A cache entry is fully analysed when it has the beat grid AND the current extended analysis. */
export function isCacheFullyAnalyzed(cached: CachedAudio): boolean {
  return !!cached.beatGrid && !!cached.bpm && (cached.analysisVersion ?? 1) >= DJ_AUDIO_ANALYSIS_VERSION && !!cached.extended;
}

// ── WAV Encoder ──────────────────────────────────────────────────────────────

/**
 * Encode stereo Float32 PCM → stereo 16-bit WAV ArrayBuffer.
 * Stereo output preserves spatial information for hard-panned tracker content
 * and is required for accurate Demucs stem separation.
 */
function encodePCMToWAV(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const numChannels = 2; // Stereo — preserves spatial info for stem separation
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

  // Interleaved stereo: L0 R0 L1 R1 ...
  const hasRight = right !== left && right.length === left.length;
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
    offset += 2;
    const sR = hasRight ? Math.max(-1, Math.min(1, right[i])) : sL;
    view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
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

  /** When true, stem separation runs after analysis (opt-in) */
  private stemSeparationEnabled = false;

  private queue: QueueEntry[] = [];
  private processing = false;
  private currentTaskId: string | null = null;
  private currentScopesOnly = false;
  private currentDeckId: DeckId | null = null;

  // Pending render/analysis callbacks keyed by task id
  private renderCallbacks = new Map<string, {
    resolve: (data: RenderOutput) => void;
    reject: (err: Error) => void;
  }>();

  private analysisCallbacks = new Map<string, {
    resolve: (result: PipelineResult['analysis']) => void;
    reject: (err: Error) => void;
  }>();

  // In-flight render dedup: hash → promise (prevents re-rendering the same file concurrently)
  private inflight = new Map<string, Promise<PipelineResult>>();

  constructor() {
    this.initWorkers();
  }

  // ── Worker Lifecycle ─────────────────────────────────────────────────────

  private initWorkers(): void {
    this.spawnRenderWorker();
    this.spawnAnalysisWorker();
  }

  /**
   * (Re)spawn the render worker. Called at init and after a worker crash so
   * the pipeline can recover without an app restart — otherwise a single
   * worker error would leave every subsequent task hanging on a dead Worker.
   */
  private spawnRenderWorker(): void {
    try { this.renderWorker?.terminate(); } catch { /* already terminated */ }
    const worker = new Worker(
      new URL('@/workers/dj-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e) => this.handleRenderMessage(e);
    worker.onerror = (e) => {
      console.error('[DJPipeline] Render worker error:', e);
      for (const [, cb] of this.renderCallbacks) {
        cb.reject(new Error('Render worker crashed: ' + e.message));
      }
      this.renderCallbacks.clear();
      // Respawn so the next enqueue doesn't hang on a dead worker.
      this.spawnRenderWorker();
    };
    worker.postMessage({ type: 'init' });
    this.renderWorker = worker;
  }

  private spawnAnalysisWorker(): void {
    try { this.analysisWorker?.terminate(); } catch { /* already terminated */ }
    const worker = new Worker(
      new URL('@/workers/dj-analysis.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e) => this.handleAnalysisMessage(e);
    worker.onerror = (e) => {
      console.error('[DJPipeline] Analysis worker error:', e);
      for (const [, cb] of this.analysisCallbacks) {
        cb.reject(new Error('Analysis worker crashed: ' + e.message));
      }
      this.analysisCallbacks.clear();
      this.spawnAnalysisWorker();
    };
    worker.postMessage({ type: 'init' });
    this.analysisWorker = worker;
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
        const { id, left, right, sampleRate, duration, channelScopes } = msg;
        const cb = this.renderCallbacks.get(id);
        if (cb) {
          this.renderCallbacks.delete(id);
          cb.resolve({ left, right, sampleRate, duration, channelScopes });
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

      // A user load never waits behind a background scope re-render: cut the
      // running one short (it goes back to the end of the queue).
      if (!task.scopesOnly) this.preemptScopesRender();

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
    companions?: Array<{ filename: string; buffer: ArrayBuffer }>,
    maxRenderSeconds?: number,
  ): Promise<PipelineResult> {
    const id = `${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return this.enqueue({ id, fileBuffer, filename, deckId, priority, companions, maxRenderSeconds });
  }

  /**
   * Re-render an old-shape cache entry's source at LOW priority for its scope
   * track only (see PipelineTask.scopesOnly). Resolves with the track stored
   * on the entry, or undefined when the render had no per-channel tap or did
   * not match the cached audio's length.
   */
  async renderChannelScopes(
    source: ArrayBuffer,
    filename: string,
    expectedDuration: number,
    companions?: Array<{ filename: string; buffer: ArrayBuffer }>,
  ): Promise<ChannelScopeTrack | undefined> {
    const id = `scopes-${filename}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const result = await this.enqueue({
      id, fileBuffer: source, filename, priority: 'low', companions, scopesOnly: { expectedDuration },
    });
    return result.channelScopes;
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
   * Enable or disable automatic stem separation in the pipeline.
   * When enabled, tracks are separated into stems (drums, bass, other, vocals)
   * after analysis completes. Results are cached in IndexedDB.
   */
  setStemSeparation(enabled: boolean): void {
    this.stemSeparationEnabled = enabled;
    console.log(`[DJPipeline] Stem separation ${enabled ? 'enabled' : 'disabled'}`);
  }

  get isStemSeparationEnabled(): boolean {
    return this.stemSeparationEnabled;
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
    companions?: Array<{ filename: string; buffer: ArrayBuffer }>,
    maxRenderSeconds?: number,
  ): Promise<PipelineResult> {
    // Check cache. A preview render (capped) serves only a preview request;
    // a deck load gets the whole song, rendered now if the cache has a preview.
    const preview = maxRenderSeconds !== undefined;
    const cached = await getCachedAudio(fileBuffer, { allowPreview: preview });
    if (cached && isCacheFullyAnalyzed(cached) && cached.audioData.byteLength > 0) {
      // Fully cached + analyzed — return immediately
      console.log(`[DJPipeline] Full cache hit for ${filename}`);

      // The deck's analysis, tempo and grid in one write - the same call every
      // load ends with (never the cached grid alone: its BPM is the audio
      // reading, the deck's tempo is the track analysis', DECK-BPM-TWO-VALUES).
      const cachedAnalysis = analysisFromCachedAudio(cached);
      if (deckId) this.applyAnalysisToDeck(deckId, cachedAnalysis);

      return {
        wavData: cached.audioData,
        duration: cached.duration,
        sampleRate: cached.sampleRate,
        waveformPeaks: new Float32Array(cached.waveformPeaks),
        analysis: cachedAnalysis,
      };
    }

    if (cached && !isCacheFullyAnalyzed(cached)) {
      // Audio cached but not analyzed (or analysed before the Auto DJ extended
      // analysis existed) — check server cache first for a never-analysed entry.
      // The server carries no extended analysis, so an old local entry goes
      // straight to the local analysis below.
      const hash = await hashFile(fileBuffer);
      // Only audio the cache holds can carry a server analysis: a source-only entry (a stub, or a preview a deck may not play) renders below.
      const serverAnalysis = cached.beatGrid || cached.audioData.byteLength === 0 ? null : await lookupServerAnalysis(hash);

      if (serverAnalysis && serverAnalysis.bpm > 0 && serverAnalysis.beats.length > 0) {
        // Server cache hit — merge analysis into local cache
        console.log(`[DJPipeline] Server analysis cache hit for ${filename}`);
        const beatGrid: BeatGridData = {
          beats: serverAnalysis.beats,
          downbeats: serverAnalysis.downbeats,
          bpm: serverAnalysis.bpm,
          timeSignature: serverAnalysis.timeSignature,
        };
        await updateCacheAnalysis(fileBuffer, {
          beatGrid,
          bpm: serverAnalysis.bpm,
          bpmConfidence: serverAnalysis.bpmConfidence,
          musicalKey: serverAnalysis.musicalKey,
          keyConfidence: serverAnalysis.keyConfidence,
          frequencyPeaks: serverAnalysis.frequencyPeaks,
          rmsDb: serverAnalysis.rmsDb,
          peakDb: serverAnalysis.peakDb,
          analysisVersion: serverAnalysis.analysisVersion,
          genrePrimary: serverAnalysis.genrePrimary,
          genreSubgenre: serverAnalysis.genreSubgenre,
          genreConfidence: serverAnalysis.genreConfidence,
          mood: serverAnalysis.mood,
          energy: serverAnalysis.energy,
          danceability: serverAnalysis.danceability,
        });

        if (deckId) {
          const rmsDb = serverAnalysis.rmsDb;
          const peakDb = serverAnalysis.peakDb;
          const autoTrimDb = computeAutoTrim(rmsDb, peakDb);
          const deckState = useDJStore.getState().decks[deckId];
          const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;

          useDJStore.getState().setDeckState(deckId, {
            analysisState: 'ready',
            beatGrid,
            musicalKey: serverAnalysis.musicalKey,
            keyConfidence: serverAnalysis.keyConfidence,
            frequencyPeaks: serverAnalysis.frequencyPeaks.map(b => new Float32Array(b)),
            rmsDb,
            peakDb,
            trimGain,
            genrePrimary: serverAnalysis.genrePrimary,
            genreSubgenre: serverAnalysis.genreSubgenre,
            genreConfidence: serverAnalysis.genreConfidence,
            mood: serverAnalysis.mood,
            energy: serverAnalysis.energy,
            danceability: serverAnalysis.danceability,
          });

          // Auto-match BPM + phase to the master if the other deck is playing.
          autoMatchOnLoad(deckId);
        }

        return {
          wavData: cached.audioData,
          duration: cached.duration,
          sampleRate: cached.sampleRate,
          waveformPeaks: new Float32Array(cached.waveformPeaks),
          analysis: {
            bpm: serverAnalysis.bpm,
            bpmConfidence: serverAnalysis.bpmConfidence,
            beats: serverAnalysis.beats,
            downbeats: serverAnalysis.downbeats,
            timeSignature: serverAnalysis.timeSignature,
            musicalKey: serverAnalysis.musicalKey,
            keyConfidence: serverAnalysis.keyConfidence,
            frequencyPeaks: serverAnalysis.frequencyPeaks,
            rmsDb: serverAnalysis.rmsDb,
            peakDb: serverAnalysis.peakDb,
            genre: {
              primary: serverAnalysis.genrePrimary,
              subgenre: serverAnalysis.genreSubgenre,
              confidence: serverAnalysis.genreConfidence,
              mood: serverAnalysis.mood,
              energy: serverAnalysis.energy,
              danceability: serverAnalysis.danceability,
            },
          },
        };
      }

      // No server cache — fall through to local analysis.
      // cacheSourceFile stores a stub entry with audioData.byteLength === 0
      // (only sourceData is populated). Attempting decodeAudioData on the
      // stub throws EncodingError; skip straight to re-render in that case.
      console.log(`[DJPipeline] Cached but unanalyzed: ${filename}`);
      if (cached.audioData.byteLength > 0) {
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
    }

    // No local audio cache at all — check server for analysis before full render
    // (analysis will be applied after render completes)
    const hash = await hashFile(fileBuffer);
    // A preview request may ride a whole-song render in flight; a whole-song request never rides a preview.
    const existing = this.inflight.get(hash) ?? (preview ? this.inflight.get(`${hash}:preview`) : undefined);
    if (existing) {
      console.log(`[DJPipeline] In-flight dedup hit for ${filename} — waiting for existing render`);
      const result = await existing;
      /* executeTask only applies deck state to the *first* requester's deckId;
       * a second deck riding on the same render would otherwise never receive
       * beatGrid / analysisState = 'ready' and show a blank waveform. */
      if (deckId) this.applyResultToDeck(deckId, result);
      return result;
    }

    // Full render + analysis needed
    const promise = this.renderAndAnalyze(fileBuffer, filename, deckId, priority, companions, maxRenderSeconds);
    const inflightKey = preview ? `${hash}:preview` : hash;
    this.inflight.set(inflightKey, promise);
    // Both outcomes clear the entry, and this side branch settles either way: a .finally() here
    // re-threw a failed render as a second, never-handled rejection (the unhandledrejection on a
    // timed-out 3SID render). The caller handles the failure on `promise` itself.
    const forget = (): void => { this.inflight.delete(inflightKey); };
    promise.then(forget, forget);
    return promise;
  }

  /**
   * Abort the running scopesOnly render, if that is what runs: the render
   * worker is respawned (a render cannot be interrupted any other way) and the
   * task's render promise rejects with ScopeRenderPreempted, which processNext
   * turns into a re-queue.
   */
  private preemptScopesRender(): void {
    if (!this.processing || !this.currentScopesOnly || !this.currentTaskId) return;
    const cb = this.renderCallbacks.get(this.currentTaskId);
    if (!cb) return;
    this.renderCallbacks.delete(this.currentTaskId);
    cb.reject(new ScopeRenderPreempted());
    this.spawnRenderWorker();
  }

  /** Number of queued tasks (not counting current). */
  get queueSize(): number {
    return this.queue.length;
  }

  /** Whether the pipeline is actively processing. */
  get isActive(): boolean {
    return this.processing;
  }

  /**
   * Apply a finished PipelineResult's analysis to a deck's store state.
   * Called from executeTask for the primary task deck AND from loadOrEnqueue
   * when an in-flight dedup caller attaches a second deck to the same render.
   */
  private applyResultToDeck(deckId: DeckId, result: PipelineResult): void {
    this.applyAnalysisToDeck(deckId, result.analysis);
  }

  /**
   * Put an analysis on a deck: beat grid, key, energy, genre, trim. Public so
   * a track loaded from a finished analysis (Auto DJ's pre-rendered load)
   * lands on the deck it is loaded to, not on no deck.
   */
  applyAnalysisToDeck(deckId: DeckId, analysis: PipelineResult['analysis']): void {
    if (!analysis) {
      useDJStore.getState().setDeckState(deckId, { analysisState: 'ready', trackAnalysis: null });
      return;
    }
    const autoTrimDb = computeAutoTrim(analysis.rmsDb, analysis.peakDb);
    const deckState = useDJStore.getState().decks[deckId];
    const trimGain = deckState.autoGainEnabled ? autoTrimDb : 0;
    // The unified DJTrackAnalysis (plan section 3): the canonical input to
    // every Auto DJ decision, built once per load from the pipeline analysis,
    // the extended worker data and the loaded module (tracker structure).
    let trackAnalysis: DeckState['trackAnalysis'] = null;
    try {
      let song: TrackerSong | null = null;
      try { song = getDJEngineIfActive()?.getDeck(deckId).getLoadedSong() ?? null; } catch { song = null; }
      trackAnalysis = buildDJTrackAnalysis({
        id: deckState.fileName ?? deckId,
        durationSec: deckState.durationMs > 0 ? deckState.durationMs / 1000 : 0,
        analysis,
        extended: analysis.extended ?? null,
        song,
      });
    } catch (err) {
      console.warn(`[DJPipeline] DJTrackAnalysis failed for deck ${deckId}:`, err);
    }
    // One tempo per track: the deck grid and BPM are the analysis' (the
    // module's own timing for a tracker song whose walk matches the render),
    // replacing the interim detectBPM / header value the load wrote.
    const bpm = trackAnalysis?.bpm ?? analysis.bpm;
    useDJStore.getState().setDeckState(deckId, {
      analysisState: 'ready',
      trackAnalysis,
      beatGrid: trackAnalysis
        ? {
            beats: trackAnalysis.beatGrid.beats.map((b) => b.time),
            downbeats: trackAnalysis.downbeats.bars.map((b) => b.start),
            bpm,
            timeSignature: trackAnalysis.meter.beatsPerBar,
          }
        : {
            beats: analysis.beats,
            downbeats: analysis.downbeats,
            bpm: analysis.bpm,
            timeSignature: analysis.timeSignature,
          },
      detectedBPM: bpm,
      effectiveBPM: pitchedBpm(bpm, deckState.pitchOffset),
      musicalKey: analysis.musicalKey,
      keyConfidence: analysis.keyConfidence,
      frequencyPeaks: analysis.frequencyPeaks.map(b => new Float32Array(b)),
      rmsDb: analysis.rmsDb,
      peakDb: analysis.peakDb,
      trimGain,
      genrePrimary: analysis.genre.primary,
      genreSubgenre: analysis.genre.subgenre,
      genreConfidence: analysis.genre.confidence,
      mood: analysis.genre.mood,
      energy: analysis.genre.energy,
      danceability: analysis.genre.danceability,
    });
    autoMatchOnLoad(deckId);
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
    this.currentScopesOnly = !!task.scopesOnly;
    this.currentDeckId = task.deckId ?? null;

    // Start progress interpolation ticker
    if (this.currentDeckId) {
      this.startProgressTicker(this.currentDeckId);
    }

    this.updateStoreQueue();

    try {
      /* 180s — generous enough for long UADE / SC68 tracks that can take
       * 60-120s to render fully. Previously 60s would time-out mid-render
       * and strand pending worker callbacks in their maps (leak). */
      const TASK_TIMEOUT_MS = 180_000;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, rej) => {
        timeoutHandle = setTimeout(() => {
          // Reject any still-pending worker callbacks for this task so they
          // drain from the maps instead of leaking forever.
          const rcb = this.renderCallbacks.get(task.id);
          if (rcb) { this.renderCallbacks.delete(task.id); rcb.reject(new Error('Task timeout')); }
          const acb = this.analysisCallbacks.get(task.id);
          if (acb) { this.analysisCallbacks.delete(task.id); acb.reject(new Error('Task timeout')); }
          rej(new Error(`Task timeout after ${TASK_TIMEOUT_MS / 1000}s: ${task.filename}`));
        }, TASK_TIMEOUT_MS);
      });
      try {
        const result = await Promise.race([this.executeTask(task), timeoutPromise]);
        resolve(result);
      } finally {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      }
    } catch (err) {
      if (err instanceof ScopeRenderPreempted) {
        console.log(`[DJPipeline] Scope re-render of ${task.filename} preempted by a load; re-queued`);
        this.queue.push(entry);
        this.updateStoreQueue();
      } else {
        console.error(`[DJPipeline] Task failed: ${task.filename}`, err);
        this.reportDeckTaskFailure(task, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.currentScopesOnly = false;
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

  /**
   * A failed render or analysis for a deck, said once, here: the deck leaves its
   * 'rendering' state (its view falls back to the oscilloscope / the parsed song)
   * and the user is told. Background tasks (no deck) only log.
   */
  private reportDeckTaskFailure(task: PipelineTask, err: unknown): void {
    if (!task.deckId) return;
    useDJStore.getState().setDeckState(task.deckId, { analysisState: 'none' });
    notify.error(`Could not render ${task.filename}: ${err instanceof Error ? err.message : String(err)}`);
  }

  private async executeTask(task: PipelineTask): Promise<PipelineResult> {
    const startTime = performance.now();

    let left: Float32Array;
    let right: Float32Array;
    let sampleRate: number;
    let duration: number;
    let wavData: ArrayBuffer;
    let waveformPeaks: Float32Array;

    if (task.scopesOnly) return this.executeScopesOnly(task, task.scopesOnly.expectedDuration);

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

      // The per-channel scope track travels with the WAV it was rendered with.
      attachChannelScopes(wavData, renderResult.channelScopes);

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
        renderResult.channelScopes,
        // A render that ran into its cap is a preview, not the song (isPreviewRender).
        task.maxRenderSeconds !== undefined && duration >= task.maxRenderSeconds - 0.5 ? task.maxRenderSeconds : null,
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
          // The loudness the trim is computed from: without it every later
          // cache hit read -100 dB and got the unanalysed trim.
          rmsDb: analysis.rmsDb,
          peakDb: analysis.peakDb,
          analysisVersion: analysis.extended ? DJ_AUDIO_ANALYSIS_VERSION : 1,
          extended: analysis.extended ?? undefined,
          // Genre classification
          genrePrimary: analysis.genre.primary,
          genreSubgenre: analysis.genre.subgenre,
          genreConfidence: analysis.genre.confidence,
          mood: analysis.genre.mood,
          energy: analysis.genre.energy,
          danceability: analysis.genre.danceability,
        });

        // Store to server cache (fire-and-forget) for other users
        const taskHash = await hashFile(task.fileBuffer);
        storeServerAnalysis({
          hash: taskHash,
          bpm: analysis.bpm,
          bpmConfidence: analysis.bpmConfidence,
          timeSignature: analysis.timeSignature,
          musicalKey: analysis.musicalKey,
          keyConfidence: analysis.keyConfidence,
          rmsDb: analysis.rmsDb,
          peakDb: analysis.peakDb,
          genrePrimary: analysis.genre.primary,
          genreSubgenre: analysis.genre.subgenre,
          genreConfidence: analysis.genre.confidence,
          mood: analysis.genre.mood,
          energy: analysis.genre.energy,
          danceability: analysis.genre.danceability,
          duration,
          beats: analysis.beats,
          downbeats: analysis.downbeats,
          waveformPeaks: waveformPeaks ? Array.from(waveformPeaks) : [],
          frequencyPeaks: analysis.frequencyPeaks,
          analysisVersion: 1,
        });
      }
    } catch (err) {
      console.warn(`[DJPipeline] Analysis failed for ${task.filename}:`, err);
      // Analysis failure is non-fatal — the audio is still usable
    }

    // ── Stem separation phase (opt-in, non-blocking) ────────────────────
    let stems: StemResult | undefined;
    if (this.stemSeparationEnabled) {
      try {
        const fileHash = await hashFile(task.fileBuffer);
        const demucs = DemucsEngine.getInstance();

        // Check cache first
        const cached = await demucs.loadCachedStems(fileHash);
        if (cached) {
          stems = cached;
          console.log(`[DJPipeline] Loaded cached stems for ${task.filename}`);
        } else {
          this.updateDeckAnalysisState(task.id, 'separating', task.deckId);
          await demucs.ensureModel('4s', (p, msg) => {
            this.emitTaskProgress(task.id, 80 + p * 5);
            console.log(`[DJPipeline] Demucs model: ${msg}`);
          });

          stems = await demucs.separate(left, right, sampleRate, (p) => {
            this.emitTaskProgress(task.id, 85 + p * 15);
          });

          // Cache stems for next time
          await demucs.cacheStemResult(fileHash, stems, sampleRate);
          console.log(`[DJPipeline] Stems separated for ${task.filename}`);
        }
      } catch (err) {
        console.warn(`[DJPipeline] Stem separation failed for ${task.filename}:`, err);
        // Non-fatal — deck works without stems
      }
    }

    // ── Update deck state ────────────────────────────────────────────────
    if (task.deckId) {
      const currentState = useDJStore.getState().decks[task.deckId];
      if (!currentState) {
        console.warn(`[DJPipeline] Deck ${task.deckId} no longer exists, skipping state update`);
      } else if (currentState.fileName === task.filename) {
        this.applyResultToDeck(task.deckId, { wavData, duration, sampleRate, waveformPeaks, analysis });

        // Hot-swap from Tracker engine to Audio engine if applicable.
        if (currentState.playbackMode === 'tracker') {
          const djEngine = getDJEngineIfActive();
          if (djEngine) {
            void djEngine.getDeck(task.deckId).hotSwapToAudio(wavData, task.filename).catch(err => {
              console.warn(`[DJPipeline] Hot-swap failed for ${task.filename}:`, err);
            });
          }
        }

        // Load separated stems into the deck engine (non-blocking).
        if (stems && Object.keys(stems).length > 0) {
          const djEngine = getDJEngineIfActive();
          if (djEngine) {
            void djEngine.getDeck(task.deckId).loadStems(stems, sampleRate).catch(err => {
              console.warn(`[DJPipeline] Stem loading failed for ${task.filename}:`, err);
            });
          }
        }
      } else {
        console.log(`[DJPipeline] Skipping stale state update: ${task.filename} no longer on deck ${task.deckId}`);
      }
    }

    const totalTime = Math.round(performance.now() - startTime);
    console.log(
      `[DJPipeline] Pipeline complete for ${task.filename} in ${totalTime}ms ` +
      `(BPM: ${analysis?.bpm?.toFixed(1) ?? '?'}, Key: ${analysis?.musicalKey ?? '?'})`,
    );

    return { wavData, duration, sampleRate, waveformPeaks, stems, analysis };
  }

  /**
   * A scopesOnly task: render, keep only the scope track, store it on the
   * existing cache entry beside its untouched audio and analysis. The render
   * is a full one (never maxRenderSeconds): it must cover the cached WAV.
   * A failed render still marks the entry scope-rendered so a source that
   * cannot render is not retried on every load.
   */
  private async executeScopesOnly(task: PipelineTask, expectedDuration: number): Promise<PipelineResult> {
    const hash = await hashFile(task.fileBuffer);
    let track: ChannelScopeTrack | undefined;
    try {
      const out = await this.doRender(task);
      const aligned = Math.abs(out.duration - expectedDuration) <= SCOPE_RERENDER_DURATION_TOLERANCE_SEC;
      if (aligned && out.channelScopes && out.channelScopes.channels.length > 0) track = out.channelScopes;
      else console.log(`[DJPipeline] Scope re-render of ${task.filename} unused (${aligned ? 'no per-channel tap' : `length ${out.duration.toFixed(1)}s != cached ${expectedDuration.toFixed(1)}s`})`);
    } catch (err) {
      // A preempted render is retried later: the entry is not marked scope-rendered.
      if (err instanceof ScopeRenderPreempted) throw err;
      await setCacheChannelScopes(hash, undefined);
      throw err;
    }
    await setCacheChannelScopes(hash, track);
    return {
      wavData: new ArrayBuffer(0), duration: expectedDuration, sampleRate: 0,
      waveformPeaks: new Float32Array(0), analysis: null, channelScopes: track,
    };
  }

  // ── Worker Communication ─────────────────────────────────────────────────

  private doRender(task: PipelineTask): Promise<RenderOutput> {
    return new Promise((resolve, reject) => {
      if (!this.renderWorker) {
        reject(new Error('Render worker not initialized'));
        return;
      }

      this.renderCallbacks.set(task.id, { resolve, reject });

      const buffer = task.fileBuffer.slice(0); // Clone to transfer
      const transferables: ArrayBuffer[] = [buffer];
      // Clone companion buffers too — the originals may still be referenced
      // by caller (playlist cache, auto-DJ pre-render) so we can't donate them.
      const companions = task.companions?.map((cf) => {
        const cloned = cf.buffer.slice(0);
        transferables.push(cloned);
        return { filename: cf.filename, buffer: cloned };
      });
      try {
        this.renderWorker.postMessage(
          {
            type: 'render',
            id: task.id,
            fileBuffer: buffer,
            filename: task.filename,
            subsong: task.subsong,
            companions,
            maxSeconds: task.maxRenderSeconds,
          },
          transferables,
        );
      } catch (err) {
        this.renderCallbacks.delete(task.id);
        reject(new Error(`Render worker postMessage failed: ${err}`));
      }
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

      try {
        // Clone arrays for transfer — guard against detached buffers
        const leftCopy = new Float32Array(left);
        const rightCopy = new Float32Array(right);

        this.analysisWorker.postMessage(
          { type: 'analyze', id, pcmLeft: leftCopy, pcmRight: rightCopy, sampleRate, numBins: 800 },
          [leftCopy.buffer, rightCopy.buffer],
        );
      } catch (err) {
        this.analysisCallbacks.delete(id);
        reject(new Error(`Analysis worker postMessage failed: ${err}`));
      }
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
    state: 'rendering' | 'analyzing' | 'separating',
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
