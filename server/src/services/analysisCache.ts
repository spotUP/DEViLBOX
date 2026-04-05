/**
 * Song Analysis Cache — server-side shared cache for DJ analysis results.
 *
 * Stores BPM, beat grid, key, genre, waveform peaks etc. keyed by SHA-256.
 * Binary-packed arrays keep storage compact (~5KB/song).
 *
 * Encoding:
 *   beats/downbeats → delta-encoded Uint16 (ms between events)
 *   waveform_peaks  → Uint8 (0-255 quantized from 0.0-1.0)
 *   frequency_peaks → 3 × N Uint8 (low/mid/high bands, same quantization)
 */

import db from '../db/database';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SongAnalysis {
  hash: string;
  bpm: number;
  bpmConfidence: number;
  timeSignature: number;
  musicalKey: string;
  keyConfidence: number;
  rmsDb: number;
  peakDb: number;
  genrePrimary: string;
  genreSubgenre: string;
  genreConfidence: number;
  mood: string;
  energy: number;
  danceability: number;
  duration: number;
  beats: number[];
  downbeats: number[];
  waveformPeaks: number[];
  frequencyPeaks: number[][];
  analysisVersion: number;
}

// ── Binary packing helpers ──────────────────────────────────────────────────

/** Encode an array of timestamps (seconds) as delta-encoded Uint16 (ms deltas). */
function packTimestamps(times: number[]): Buffer {
  if (!times || times.length === 0) return Buffer.alloc(0);
  // First 4 bytes: float32 of first timestamp, then Uint16 deltas
  const buf = Buffer.alloc(4 + (times.length - 1) * 2);
  buf.writeFloatLE(times[0], 0);
  let prev = times[0];
  for (let i = 1; i < times.length; i++) {
    const deltaMs = Math.round((times[i] - prev) * 1000);
    buf.writeUInt16LE(Math.min(65535, Math.max(0, deltaMs)), 4 + (i - 1) * 2);
    prev = times[i];
  }
  return buf;
}

/** Decode delta-encoded Uint16 timestamps back to seconds. */
function unpackTimestamps(buf: Buffer): number[] {
  if (!buf || buf.length === 0) return [];
  const first = buf.readFloatLE(0);
  const result = [first];
  let acc = first;
  for (let i = 4; i < buf.length; i += 2) {
    acc += buf.readUInt16LE(i) / 1000;
    result.push(acc);
  }
  return result;
}

/** Encode 0-1 float array as Uint8 (0-255). */
function packPeaks(peaks: number[]): Buffer {
  if (!peaks || peaks.length === 0) return Buffer.alloc(0);
  const buf = Buffer.alloc(peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    buf[i] = Math.round(Math.min(1, Math.max(0, peaks[i])) * 255);
  }
  return buf;
}

/** Decode Uint8 back to 0-1 floats. */
function unpackPeaks(buf: Buffer): number[] {
  if (!buf || buf.length === 0) return [];
  const result = new Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    result[i] = buf[i] / 255;
  }
  return result;
}

/** Encode frequency peaks (3 bands × N bins) as concatenated Uint8. */
function packFrequencyPeaks(bands: number[][]): Buffer {
  if (!bands || bands.length === 0) return Buffer.alloc(0);
  const binsPerBand = bands[0]?.length || 0;
  if (binsPerBand === 0) return Buffer.alloc(0);
  // Header: 2 bytes for numBands, 2 bytes for binsPerBand, then data
  const buf = Buffer.alloc(4 + bands.length * binsPerBand);
  buf.writeUInt16LE(bands.length, 0);
  buf.writeUInt16LE(binsPerBand, 2);
  let offset = 4;
  for (const band of bands) {
    for (let i = 0; i < binsPerBand; i++) {
      buf[offset++] = Math.round(Math.min(1, Math.max(0, band[i] || 0)) * 255);
    }
  }
  return buf;
}

/** Decode frequency peaks from packed buffer. */
function unpackFrequencyPeaks(buf: Buffer): number[][] {
  if (!buf || buf.length < 4) return [];
  const numBands = buf.readUInt16LE(0);
  const binsPerBand = buf.readUInt16LE(2);
  const result: number[][] = [];
  let offset = 4;
  for (let b = 0; b < numBands; b++) {
    const band = new Array(binsPerBand);
    for (let i = 0; i < binsPerBand; i++) {
      band[i] = (buf[offset++] || 0) / 255;
    }
    result.push(band);
  }
  return result;
}

// ── Database operations (lazy-init to avoid crash before initDatabase()) ─────

let lookupStmt: ReturnType<typeof db.prepare>;
let insertStmt: ReturnType<typeof db.prepare>;
let countStmt: ReturnType<typeof db.prepare>;
let sizeStmt: ReturnType<typeof db.prepare>;
let _stmtsReady = false;

function ensureStatements() {
  if (_stmtsReady) return;
  lookupStmt = db.prepare('SELECT * FROM song_analysis WHERE hash = ?');
  insertStmt = db.prepare(`
    INSERT OR REPLACE INTO song_analysis (
      hash, bpm, bpm_confidence, time_signature,
      musical_key, key_confidence, rms_db, peak_db,
      genre_primary, genre_subgenre, genre_confidence,
      mood, energy, danceability, duration,
      beats, downbeats, waveform_peaks, frequency_peaks,
      analysis_version, created_at
    ) VALUES (
      @hash, @bpm, @bpm_confidence, @time_signature,
      @musical_key, @key_confidence, @rms_db, @peak_db,
      @genre_primary, @genre_subgenre, @genre_confidence,
      @mood, @energy, @danceability, @duration,
      @beats, @downbeats, @waveform_peaks, @frequency_peaks,
      @analysis_version, @created_at
    )
  `);
  countStmt = db.prepare('SELECT COUNT(*) as count FROM song_analysis');
  sizeStmt = db.prepare(`
    SELECT SUM(LENGTH(beats) + LENGTH(downbeats) + LENGTH(waveform_peaks) + LENGTH(frequency_peaks)) as bytes
    FROM song_analysis
  `);
  _stmtsReady = true;
}

/**
 * Look up cached analysis by SHA-256 hash.
 * Returns null if not found.
 */
export function lookupAnalysis(hash: string): SongAnalysis | null {
  ensureStatements();
  const row = lookupStmt.get(hash) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    hash: row.hash as string,
    bpm: row.bpm as number,
    bpmConfidence: row.bpm_confidence as number,
    timeSignature: row.time_signature as number,
    musicalKey: row.musical_key as string,
    keyConfidence: row.key_confidence as number,
    rmsDb: row.rms_db as number,
    peakDb: row.peak_db as number,
    genrePrimary: row.genre_primary as string,
    genreSubgenre: row.genre_subgenre as string,
    genreConfidence: row.genre_confidence as number,
    mood: row.mood as string,
    energy: row.energy as number,
    danceability: row.danceability as number,
    duration: row.duration as number,
    beats: unpackTimestamps(row.beats as Buffer),
    downbeats: unpackTimestamps(row.downbeats as Buffer),
    waveformPeaks: unpackPeaks(row.waveform_peaks as Buffer),
    frequencyPeaks: unpackFrequencyPeaks(row.frequency_peaks as Buffer),
    analysisVersion: row.analysis_version as number,
  };
}

/**
 * Store analysis results for a file hash.
 */
export function storeAnalysis(data: SongAnalysis): void {
  ensureStatements();
  insertStmt.run({
    hash: data.hash,
    bpm: data.bpm,
    bpm_confidence: data.bpmConfidence,
    time_signature: data.timeSignature,
    musical_key: data.musicalKey,
    key_confidence: data.keyConfidence,
    rms_db: data.rmsDb,
    peak_db: data.peakDb,
    genre_primary: data.genrePrimary,
    genre_subgenre: data.genreSubgenre,
    genre_confidence: data.genreConfidence,
    mood: data.mood,
    energy: data.energy,
    danceability: data.danceability,
    duration: data.duration,
    beats: packTimestamps(data.beats),
    downbeats: packTimestamps(data.downbeats),
    waveform_peaks: packPeaks(data.waveformPeaks),
    frequency_peaks: packFrequencyPeaks(data.frequencyPeaks),
    analysis_version: data.analysisVersion,
    created_at: Date.now(),
  });
}

/**
 * Cache statistics.
 */
export function getAnalysisCacheStats(): { count: number; sizeBytes: number } {
  ensureStatements();
  const count = (countStmt.get() as { count: number }).count;
  const size = (sizeStmt.get() as { bytes: number | null }).bytes || 0;
  return { count, sizeBytes: size };
}
