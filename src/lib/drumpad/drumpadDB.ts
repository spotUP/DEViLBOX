/**
 * DrumPad IndexedDB Persistence
 *
 * Stores DrumPad audio samples (Float32Array per channel) in IndexedDB
 * since AudioBuffer is not JSON-serializable and can't go in localStorage.
 *
 * Two object stores:
 *   - "programs": Full DrumProgram JSON (pad configs, names, params — no AudioBuffer)
 *   - "samples":  Raw PCM channel data keyed by sampleId
 */

import type { DrumProgram, DrumPad, SampleData, MpcResampleConfig } from '../../types/drumpad';
import { createEmptyPad } from '../../types/drumpad';

const DB_NAME = 'devilbox-drumpad';
const DB_VERSION = 1;
const STORE_PROGRAMS = 'programs';
const STORE_SAMPLES = 'samples';

export interface StoredSample {
  id: string;
  name: string;
  channels: ArrayBuffer[];  // Per-channel PCM data (Float32Array → ArrayBuffer)
  sampleRate: number;
  duration: number;
}

// ── Database lifecycle ──────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROGRAMS)) {
        db.createObjectStore(STORE_PROGRAMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
        db.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('[drumpadDB] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function txStore(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Sample storage ──────────────────────────────────────────────────────────

/** Convert an AudioBuffer to a storable format */
function audioBufferToStored(sample: SampleData): StoredSample {
  const channels: ArrayBuffer[] = [];
  for (let ch = 0; ch < sample.audioBuffer.numberOfChannels; ch++) {
    // getChannelData returns Float32Array; .buffer is the underlying ArrayBuffer
    // We must slice to get an independent copy (the original may be neutered)
    const channelData = sample.audioBuffer.getChannelData(ch);
    channels.push(channelData.buffer.slice(
      channelData.byteOffset,
      channelData.byteOffset + channelData.byteLength,
    ));
  }
  return {
    id: sample.id,
    name: sample.name,
    channels,
    sampleRate: sample.sampleRate,
    duration: sample.duration,
  };
}

/** Reconstruct an AudioBuffer from stored data */
function storedToAudioBuffer(
  stored: StoredSample,
  audioContext: BaseAudioContext,
): SampleData {
  const numChannels = stored.channels.length;
  const sampleLength = stored.channels[0]
    ? new Float32Array(stored.channels[0]).length
    : 0;

  const audioBuffer = audioContext.createBuffer(
    numChannels,
    sampleLength,
    stored.sampleRate,
  );

  for (let ch = 0; ch < numChannels; ch++) {
    audioBuffer.copyToChannel(new Float32Array(stored.channels[ch]), ch);
  }

  return {
    id: stored.id,
    name: stored.name,
    audioBuffer,
    sampleRate: stored.sampleRate,
    duration: stored.duration,
  };
}

// ── Public API: Samples ─────────────────────────────────────────────────────

export async function saveSample(sample: SampleData): Promise<void> {
  const db = await openDB();
  const store = txStore(db, STORE_SAMPLES, 'readwrite');
  const stored = audioBufferToStored(sample);
  await idbRequest(store.put(stored));
}

export async function loadSample(
  id: string,
  audioContext: BaseAudioContext,
): Promise<SampleData | null> {
  const db = await openDB();
  const store = txStore(db, STORE_SAMPLES, 'readonly');
  const stored = await idbRequest(store.get(id)) as StoredSample | undefined;
  if (!stored) return null;
  return storedToAudioBuffer(stored, audioContext);
}

export async function deleteSample(id: string): Promise<void> {
  const db = await openDB();
  const store = txStore(db, STORE_SAMPLES, 'readwrite');
  await idbRequest(store.delete(id));
}

export async function getAllSampleIds(): Promise<string[]> {
  const db = await openDB();
  const store = txStore(db, STORE_SAMPLES, 'readonly');
  return idbRequest(store.getAllKeys()) as Promise<string[]>;
}

// ── Public API: Programs ────────────────────────────────────────────────────

/** Serializable version of DrumProgram (no AudioBuffer) */
interface StoredProgram {
  id: string;
  name: string;
  pads: StoredPad[];
  masterLevel: number;
  masterTune: number;
  mpcResample?: MpcResampleConfig;
}

interface StoredPad {
  id: number;
  name: string;
  sampleId: string | null;    // Reference to sample in STORE_SAMPLES
  level: number;
  tune: number;
  pan: number;
  output: string;
  attack: number;
  decay: number;
  decayMode?: string;
  sustain: number;
  release: number;
  filterType: string;
  cutoff: number;
  resonance: number;
  filterAttack?: number;
  filterDecay?: number;
  filterEnvAmount?: number;
  veloToLevel?: number;
  veloToAttack?: number;
  veloToStart?: number;
  veloToFilter?: number;
  veloToPitch?: number;
  scratchAction?: string;
  // MPC features
  muteGroup?: number;
  playMode?: string;
  sampleStart?: number;
  sampleEnd?: number;
  reverse?: boolean;
}

function programToStored(program: DrumProgram): StoredProgram {
  return {
    id: program.id,
    name: program.name,
    masterLevel: program.masterLevel,
    masterTune: program.masterTune,
    mpcResample: program.mpcResample,
    pads: program.pads.map(pad => ({
      id: pad.id,
      name: pad.name,
      sampleId: pad.sample?.id ?? null,
      level: pad.level,
      tune: pad.tune,
      pan: pad.pan,
      output: pad.output,
      attack: pad.attack,
      decay: pad.decay,
      decayMode: pad.decayMode,
      sustain: pad.sustain,
      release: pad.release,
      filterType: pad.filterType,
      cutoff: pad.cutoff,
      resonance: pad.resonance,
      filterAttack: pad.filterAttack,
      filterDecay: pad.filterDecay,
      filterEnvAmount: pad.filterEnvAmount,
      veloToLevel: pad.veloToLevel,
      veloToAttack: pad.veloToAttack,
      veloToStart: pad.veloToStart,
      veloToFilter: pad.veloToFilter,
      veloToPitch: pad.veloToPitch,
      scratchAction: pad.scratchAction,
      muteGroup: pad.muteGroup,
      playMode: pad.playMode,
      sampleStart: pad.sampleStart,
      sampleEnd: pad.sampleEnd,
      reverse: pad.reverse,
    })),
  };
}

function storedToProgram(
  stored: StoredProgram,
  sampleMap: Map<string, SampleData>,
): DrumProgram {
  const pads: DrumPad[] = stored.pads.map(sp => ({
    id: sp.id,
    name: sp.name,
    sample: sp.sampleId ? (sampleMap.get(sp.sampleId) ?? null) : null,
    level: sp.level,
    tune: sp.tune,
    pan: sp.pan,
    output: sp.output as DrumPad['output'],
    attack: sp.attack,
    decay: sp.decay,
    sustain: sp.sustain,
    release: sp.release,
    filterType: sp.filterType as DrumPad['filterType'],
    cutoff: sp.cutoff,
    resonance: sp.resonance,
    layers: [],
    scratchAction: sp.scratchAction as DrumPad['scratchAction'],
    // MPC fields with backward-compatible defaults
    muteGroup: sp.muteGroup ?? 0,
    playMode: (sp.playMode as DrumPad['playMode']) ?? 'oneshot',
    sampleStart: sp.sampleStart ?? 0,
    sampleEnd: sp.sampleEnd ?? 1,
    reverse: sp.reverse ?? false,
    // VMPC fields with backward-compatible defaults
    decayMode: (sp.decayMode as DrumPad['decayMode']) ?? 'start',
    filterAttack: sp.filterAttack ?? 0,
    filterDecay: sp.filterDecay ?? 50,
    filterEnvAmount: sp.filterEnvAmount ?? 0,
    veloToLevel: sp.veloToLevel ?? 100,
    veloToAttack: sp.veloToAttack ?? 0,
    veloToStart: sp.veloToStart ?? 0,
    veloToFilter: sp.veloToFilter ?? 0,
    veloToPitch: sp.veloToPitch ?? 0,
  }));

  // Migration: expand 16-pad programs to 64 pads
  while (pads.length < 64) {
    pads.push(createEmptyPad(pads.length + 1));
  }

  return {
    id: stored.id,
    name: stored.name,
    masterLevel: stored.masterLevel,
    masterTune: stored.masterTune,
    mpcResample: stored.mpcResample,
    pads,
  };
}

// ── Save / Load all programs + samples ──────────────────────────────────────

export async function saveAllPrograms(
  programs: Map<string, DrumProgram>,
): Promise<void> {
  const db = await openDB();

  // Collect all unique samples across all programs
  const sampleSet = new Map<string, SampleData>();
  for (const program of programs.values()) {
    for (const pad of program.pads) {
      if (pad.sample) {
        sampleSet.set(pad.sample.id, pad.sample);
      }
    }
  }

  // Write samples
  const sampleTx = db.transaction(STORE_SAMPLES, 'readwrite');
  const sampleStore = sampleTx.objectStore(STORE_SAMPLES);
  // Clear old samples first
  sampleStore.clear();
  for (const sample of sampleSet.values()) {
    sampleStore.put(audioBufferToStored(sample));
  }
  await idbTransaction(sampleTx);

  // Write programs
  const progTx = db.transaction(STORE_PROGRAMS, 'readwrite');
  const progStore = progTx.objectStore(STORE_PROGRAMS);
  progStore.clear();
  for (const program of programs.values()) {
    progStore.put(programToStored(program));
  }
  await idbTransaction(progTx);
}

export async function loadAllPrograms(
  audioContext: BaseAudioContext,
): Promise<Map<string, DrumProgram> | null> {
  const db = await openDB();

  // Load all samples
  const sampleStore = txStore(db, STORE_SAMPLES, 'readonly');
  const storedSamples = await idbRequest(sampleStore.getAll()) as StoredSample[];

  if (storedSamples.length === 0) {
    // Check if programs exist — if neither samples nor programs, return null (first run)
    const progStore = txStore(db, STORE_PROGRAMS, 'readonly');
    const storedProgs = await idbRequest(progStore.getAll()) as StoredProgram[];
    if (storedProgs.length === 0) return null;
  }

  const sampleMap = new Map<string, SampleData>();
  for (const stored of storedSamples) {
    try {
      sampleMap.set(stored.id, storedToAudioBuffer(stored, audioContext));
    } catch (err) {
      console.warn(`[drumpadDB] Failed to reconstruct sample "${stored.id}":`, err);
    }
  }

  // Load all programs
  const progStore = txStore(db, STORE_PROGRAMS, 'readonly');
  const storedProgs = await idbRequest(progStore.getAll()) as StoredProgram[];

  const programs = new Map<string, DrumProgram>();
  for (const sp of storedProgs) {
    programs.set(sp.id, storedToProgram(sp, sampleMap));
  }

  return programs.size > 0 ? programs : null;
}

// ── Export / Import (.dvbpads) ──────────────────────────────────────────────

interface ExportedConfig {
  version: 1;
  programs: StoredProgram[];
  samples: Array<{
    id: string;
    name: string;
    sampleRate: number;
    duration: number;
    channels: string[];  // base64-encoded Float32Array per channel
  }>;
}

function float32ToBase64(f32: Float32Array): string {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

export async function exportConfig(
  programs: Map<string, DrumProgram>,
): Promise<Blob> {
  // Collect unique samples
  const sampleSet = new Map<string, SampleData>();
  for (const program of programs.values()) {
    for (const pad of program.pads) {
      if (pad.sample) sampleSet.set(pad.sample.id, pad.sample);
    }
  }

  const exportedSamples = Array.from(sampleSet.values()).map(sample => {
    const channels: string[] = [];
    for (let ch = 0; ch < sample.audioBuffer.numberOfChannels; ch++) {
      channels.push(float32ToBase64(sample.audioBuffer.getChannelData(ch)));
    }
    return {
      id: sample.id,
      name: sample.name,
      sampleRate: sample.sampleRate,
      duration: sample.duration,
      channels,
    };
  });

  const config: ExportedConfig = {
    version: 1,
    programs: Array.from(programs.values()).map(programToStored),
    samples: exportedSamples,
  };

  return new Blob([JSON.stringify(config)], { type: 'application/json' });
}

export async function importConfig(
  blob: Blob,
  audioContext: BaseAudioContext,
): Promise<Map<string, DrumProgram>> {
  const text = await blob.text();
  const config = JSON.parse(text) as ExportedConfig;

  if (config.version !== 1) {
    throw new Error(`Unsupported .dvbpads version: ${config.version}`);
  }

  // Reconstruct samples
  const sampleMap = new Map<string, SampleData>();
  for (const exported of config.samples) {
    const numChannels = exported.channels.length;
    const channelData = exported.channels.map(base64ToFloat32);
    const sampleLength = channelData[0]?.length ?? 0;

    const audioBuffer = audioContext.createBuffer(
      numChannels,
      sampleLength,
      exported.sampleRate,
    );
    for (let ch = 0; ch < numChannels; ch++) {
      audioBuffer.copyToChannel(new Float32Array(channelData[ch]), ch);
    }

    sampleMap.set(exported.id, {
      id: exported.id,
      name: exported.name,
      audioBuffer,
      sampleRate: exported.sampleRate,
      duration: exported.duration,
    });
  }

  // Reconstruct programs
  const programs = new Map<string, DrumProgram>();
  for (const sp of config.programs) {
    programs.set(sp.id, storedToProgram(sp, sampleMap));
  }

  return programs;
}
