/**
 * NKS2 Preview Generation
 *
 * Generates OGG Vorbis audio previews per NKS SDK v2.0.2 Section 7:
 * - 6 seconds max, 120 BPM, stereo 44.1kHz
 * - Loudness normalized to -19 LUFS with -3dB peak
 * - MIDI patterns per instrument type (melodic, bass, chord, drum, pad, fx)
 * - Output: .nksf.ogg placed in .previews/ folder
 */

import * as Tone from 'tone';
import { InstrumentFactory } from '@engine/InstrumentFactory';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';
import { getNKSTypeForSynth } from './nksTaxonomy';
import type { PresetCategory } from '@/stores/usePresetStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreviewPattern = 'melodic' | 'bass' | 'chord' | 'drum' | 'pad' | 'fx';

export interface PreviewOptions {
  /** Duration in seconds (default 6, max 6 per SDK) */
  duration?: number;
  /** Tempo in BPM (default 120 per SDK) */
  tempo?: number;
  /** Override auto-detected pattern */
  pattern?: PreviewPattern;
  /** Output format: ogg preferred, wav fallback */
  format?: 'ogg' | 'webm' | 'wav';
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
}

export interface PreviewResult {
  blob: Blob;
  format: 'ogg' | 'webm' | 'wav';
  duration: number;
  lufs: number;
  peakDb: number;
}

/** A MIDI event for the preview pattern */
interface PreviewNote {
  note: string;
  time: number;     // seconds
  duration: number;  // seconds
  velocity: number;  // 0-1
}

/** Synth node returned by InstrumentFactory */
interface PlayableInstrument {
  connect?(destination: Tone.ToneAudioNode | AudioNode): void;
  triggerAttackRelease?(note: string, duration: number | string, time?: number, velocity?: number): this;
  triggerAttack?(note: string | string[], time?: number, velocity?: number): void;
  triggerRelease?(note?: string | string[], time?: number): void;
  dispose?(): void;
}

// ---------------------------------------------------------------------------
// MIDI Pattern Definitions (per NKS SDK Section 7.1.2)
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const MAX_DURATION = 6;
const DEFAULT_TEMPO = 120;

/** Single C3 note, 1 bar at 120 BPM (2 seconds held, 4s total with release) */
function melodicPattern(): PreviewNote[] {
  return [{ note: 'C3', time: 0, duration: 2, velocity: 0.78 }];
}

/** Single C1 note for bass instruments */
function bassPattern(): PreviewNote[] {
  return [{ note: 'C1', time: 0, duration: 2, velocity: 0.78 }];
}

/** C major chord (C3-E3-G3) for piano/organ — per SDK Pianos.mid spec */
function chordPattern(): PreviewNote[] {
  return [
    { note: 'C3', time: 0, duration: 2.5, velocity: 0.75 },
    { note: 'E3', time: 0, duration: 2.5, velocity: 0.70 },
    { note: 'G3', time: 0, duration: 2.5, velocity: 0.70 },
  ];
}

/** 2-bar drum pattern at 120 BPM (4 beats x 2 bars = 4 seconds) */
function drumPattern(): PreviewNote[] {
  const beatDur = 60 / DEFAULT_TEMPO; // 0.5s per beat
  const notes: PreviewNote[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const barStart = bar * 4 * beatDur;
    // Kick on 1, 3
    notes.push({ note: 'C1', time: barStart, duration: 0.2, velocity: 0.9 });
    notes.push({ note: 'C1', time: barStart + 2 * beatDur, duration: 0.2, velocity: 0.85 });
    // Snare on 2, 4
    notes.push({ note: 'D1', time: barStart + beatDur, duration: 0.15, velocity: 0.8 });
    notes.push({ note: 'D1', time: barStart + 3 * beatDur, duration: 0.15, velocity: 0.8 });
    // Hi-hat on every 8th
    for (let i = 0; i < 8; i++) {
      notes.push({
        note: 'F#1',
        time: barStart + i * beatDur * 0.5,
        duration: 0.1,
        velocity: i % 2 === 0 ? 0.7 : 0.5,
      });
    }
  }
  return notes;
}

/** Pad: C3 held for full duration with slow attack feel */
function padPattern(): PreviewNote[] {
  return [{ note: 'C3', time: 0, duration: 5.0, velocity: 0.7 }];
}

/** FX/SFX: single trigger, let it ring */
function fxPattern(): PreviewNote[] {
  return [{ note: 'C3', time: 0, duration: 0.5, velocity: 0.85 }];
}

const PATTERN_MAP: Record<PreviewPattern, () => PreviewNote[]> = {
  melodic: melodicPattern,
  bass: bassPattern,
  chord: chordPattern,
  drum: drumPattern,
  pad: padPattern,
  fx: fxPattern,
};

// ---------------------------------------------------------------------------
// Instrument Type → Preview Pattern Mapping
// ---------------------------------------------------------------------------

/** Determine the best preview pattern for an instrument based on NKS type */
export function getPreviewPattern(
  synthType: SynthType,
  category?: PresetCategory,
): PreviewPattern {
  const nksInfo = getNKSTypeForSynth(synthType, category);
  const type = nksInfo.type;

  switch (type) {
    case 'Bass':
      return 'bass';
    case 'Drums':
    case 'Percussion':
      return 'drum';
    case 'Piano / Keys':
    case 'Organ':
      return 'chord';
    case 'Synth Pad':
    case 'Soundscapes':
      return 'pad';
    case 'Sound Effects':
      return 'fx';
    case 'Synth Lead':
    case 'Synth Misc':
    case 'Guitar':
    case 'Bowed Strings':
    case 'Brass':
    case 'Flute':
    case 'Reed Instruments':
    case 'Plucked Strings':
    case 'Mallet Instruments':
    case 'Vocal':
    default:
      return 'melodic';
  }
}

// ---------------------------------------------------------------------------
// LUFS Measurement & Normalization
// ---------------------------------------------------------------------------

/**
 * Simplified K-weighted LUFS measurement.
 * Uses a pre-filter approximation suitable for preview normalization.
 * Full ITU-R BS.1770-4 is overkill for 6s previews.
 */
function measureLUFS(buffer: AudioBuffer): number {
  const channels = buffer.numberOfChannels;
  let sumSquared = 0;
  let totalSamples = 0;

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    // K-weighting approximation: boost HF slightly, attenuate LF
    // For 44100Hz, the shelf filter at 1681Hz adds ~4dB above
    // Simplified: apply a mild high-shelf via first-order difference
    let prev = 0;
    for (let i = 0; i < data.length; i++) {
      // Simple high-shelf: y[n] = x[n] + 0.3 * (x[n] - x[n-1])
      const weighted = data[i] + 0.3 * (data[i] - prev);
      prev = data[i];
      sumSquared += weighted * weighted;
    }
    totalSamples += data.length;
  }

  const meanSquared = sumSquared / totalSamples;
  if (meanSquared < 1e-10) return -Infinity;
  return -0.691 + 10 * Math.log10(meanSquared);
}

/** Measure true peak in dBFS */
function measurePeakDb(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak < 1e-10) return -Infinity;
  return 20 * Math.log10(peak);
}

/**
 * Normalize an AudioBuffer in-place to target LUFS and peak limit.
 * Returns the applied gain in dB.
 */
function normalizeLoudness(
  buffer: AudioBuffer,
  targetLUFS: number = -19,
  peakLimitDb: number = -3,
): { gainDb: number; finalLUFS: number; finalPeakDb: number } {
  const currentLUFS = measureLUFS(buffer);
  if (!isFinite(currentLUFS)) {
    return { gainDb: 0, finalLUFS: -Infinity, finalPeakDb: -Infinity };
  }

  // Calculate gain to reach target LUFS
  let gainDb = targetLUFS - currentLUFS;
  let gainLinear = Math.pow(10, gainDb / 20);

  // Check if peak would exceed limit after gain
  const currentPeakDb = measurePeakDb(buffer);
  const newPeakDb = currentPeakDb + gainDb;
  if (newPeakDb > peakLimitDb) {
    gainDb = peakLimitDb - currentPeakDb;
    gainLinear = Math.pow(10, gainDb / 20);
  }

  // Apply gain in-place
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
      // Hard clip at peak limit (safety net)
      const limit = Math.pow(10, peakLimitDb / 20);
      if (data[i] > limit) data[i] = limit;
      if (data[i] < -limit) data[i] = -limit;
    }
  }

  return {
    gainDb,
    finalLUFS: measureLUFS(buffer),
    finalPeakDb: measurePeakDb(buffer),
  };
}

// ---------------------------------------------------------------------------
// Audio Encoding
// ---------------------------------------------------------------------------

/**
 * Detect the best supported encoding format for previews.
 * Prefers OGG Vorbis (per SDK), falls back to WebM Opus, then WAV.
 */
export function detectBestPreviewFormat(): 'ogg' | 'webm' | 'wav' {
  if (typeof MediaRecorder === 'undefined') return 'wav';
  if (MediaRecorder.isTypeSupported('audio/ogg; codecs=vorbis')) return 'ogg';
  if (MediaRecorder.isTypeSupported('audio/webm; codecs=opus')) return 'webm';
  return 'wav';
}

/** Encode AudioBuffer to OGG/WebM via MediaRecorder */
async function encodeViaMediaRecorder(
  buffer: AudioBuffer,
  mimeType: string,
): Promise<Blob> {
  // Create a real-time AudioContext to play the buffer through MediaRecorder
  const ctx = new AudioContext({ sampleRate: buffer.sampleRate });
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);

  const recorder = new MediaRecorder(dest.stream, {
    mimeType,
    audioBitsPerSecond: 128000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      ctx.close();
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = (e) => {
      ctx.close();
      reject(e);
    };

    recorder.start();
    source.start(0);

    // Stop recording when source finishes
    source.onended = () => {
      // Small delay to capture tail
      setTimeout(() => recorder.stop(), 100);
    };
  });
}

/** Encode AudioBuffer to WAV (16-bit PCM) */
function encodeToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const fileSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Encode AudioBuffer to the requested (or best available) format */
async function encodePreview(
  buffer: AudioBuffer,
  format?: 'ogg' | 'webm' | 'wav',
): Promise<{ blob: Blob; format: 'ogg' | 'webm' | 'wav' }> {
  const target = format ?? detectBestPreviewFormat();

  if (target === 'ogg') {
    try {
      const blob = await encodeViaMediaRecorder(buffer, 'audio/ogg; codecs=vorbis');
      return { blob, format: 'ogg' };
    } catch {
      // Fall through to next format
    }
  }

  if (target === 'webm' || target === 'ogg') {
    try {
      const blob = await encodeViaMediaRecorder(buffer, 'audio/webm; codecs=opus');
      return { blob, format: 'webm' };
    } catch {
      // Fall through to WAV
    }
  }

  return { blob: encodeToWav(buffer), format: 'wav' };
}

// ---------------------------------------------------------------------------
// Main Preview Generator
// ---------------------------------------------------------------------------

/**
 * Generate an NKS2 preview for an instrument configuration.
 *
 * Renders a representative audio preview using OfflineAudioContext,
 * normalizes loudness to -19 LUFS / -3dB peak, and encodes to OGG Vorbis.
 */
export async function generatePreview(
  config: InstrumentConfig,
  options: PreviewOptions = {},
): Promise<PreviewResult> {
  const {
    duration: rawDuration = MAX_DURATION,
    tempo = DEFAULT_TEMPO,
    pattern: patternOverride,
    format,
    onProgress,
  } = options;

  const duration = Math.min(rawDuration, MAX_DURATION);
  const patternType = patternOverride ?? getPreviewPattern(config.synthType);
  const notes = PATTERN_MAP[patternType]();

  onProgress?.(0.05);

  // 1. Render offline
  const numChannels = 2; // stereo per SDK
  const totalSamples = Math.ceil(SAMPLE_RATE * duration);
  const offlineContext = new OfflineAudioContext(numChannels, totalSamples, SAMPLE_RATE);

  const originalContext = Tone.getContext();
  const offlineToneContext = new Tone.Context(offlineContext);
  Tone.setContext(offlineToneContext);

  try {
    // Set tempo
    Tone.getTransport().bpm.value = tempo;

    const instrument = InstrumentFactory.createInstrument(config) as PlayableInstrument;
    if (instrument.connect) {
      instrument.connect(Tone.getContext().destination);
    }

    onProgress?.(0.15);

    // Schedule all notes
    for (const n of notes) {
      if (instrument.triggerAttackRelease) {
        // Tone.js triggerAttackRelease with explicit time
        offlineContext.suspend(n.time).then(() => {
          (instrument as any).triggerAttackRelease(n.note, n.duration, undefined, n.velocity);
          offlineContext.resume();
        });
      } else if (instrument.triggerAttack) {
        offlineContext.suspend(n.time).then(() => {
          instrument.triggerAttack!(n.note, undefined, n.velocity);
          offlineContext.resume();
        });
        if (instrument.triggerRelease) {
          const releaseTime = n.time + n.duration;
          if (releaseTime < duration) {
            offlineContext.suspend(releaseTime).then(() => {
              instrument.triggerRelease!(n.note);
              offlineContext.resume();
            });
          }
        }
      }
    }

    onProgress?.(0.25);

    const rendered = await offlineContext.startRendering();

    onProgress?.(0.60);

    // Cleanup
    if (instrument.dispose) instrument.dispose();

    // 2. Normalize loudness
    const normResult = normalizeLoudness(rendered, -19, -3);

    onProgress?.(0.75);

    // 3. Encode
    const { blob, format: actualFormat } = await encodePreview(rendered, format);

    onProgress?.(1.0);

    return {
      blob,
      format: actualFormat,
      duration,
      lufs: normResult.finalLUFS,
      peakDb: normResult.finalPeakDb,
    };
  } finally {
    Tone.setContext(originalContext);
  }
}

// ---------------------------------------------------------------------------
// Batch Generation
// ---------------------------------------------------------------------------

export interface BatchPreviewItem {
  config: InstrumentConfig;
  name: string;
  category?: PresetCategory;
}

export interface BatchPreviewResult {
  name: string;
  result?: PreviewResult;
  error?: string;
}

/**
 * Generate previews for multiple presets.
 * Returns results in order, with errors reported per-item.
 */
export async function batchGeneratePreviews(
  items: BatchPreviewItem[],
  onProgress?: (completed: number, total: number, current: string) => void,
): Promise<BatchPreviewResult[]> {
  const results: BatchPreviewResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.name);

    try {
      const pattern = getPreviewPattern(item.config.synthType, item.category);
      const result = await generatePreview(item.config, { pattern });
      results.push({ name: item.name, result });
    } catch (err) {
      results.push({
        name: item.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.(items.length, items.length, 'Done');
  return results;
}

// ---------------------------------------------------------------------------
// Download Helpers
// ---------------------------------------------------------------------------

/** File extension for the given format */
function previewExtension(format: 'ogg' | 'webm' | 'wav'): string {
  return format === 'ogg' ? '.ogg' : format === 'webm' ? '.webm' : '.wav';
}

/**
 * Download a single preview file.
 * Filename follows NKS convention: `<presetName>.nksf.ogg`
 */
export function downloadPreview(result: PreviewResult, presetName: string): void {
  const ext = previewExtension(result.format);
  const filename = `${presetName}.nksf${ext}`;

  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Package batch previews into a zip-like download.
 * Since we can't create real zip files without a library, we download individually
 * or return an array of { filename, blob } for the caller to package.
 */
export function getPreviewFiles(
  results: BatchPreviewResult[],
): Array<{ filename: string; blob: Blob }> {
  const files: Array<{ filename: string; blob: Blob }> = [];
  for (const r of results) {
    if (r.result) {
      const ext = previewExtension(r.result.format);
      files.push({
        filename: `.previews/${r.name}.nksf${ext}`,
        blob: r.result.blob,
      });
    }
  }
  return files;
}
