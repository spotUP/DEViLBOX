/**
 * Instrument Converter
 * Converts MOD/XM samples to DEViLBOX Sampler instruments
 * Preserves original envelope data for future point-based editor
 */

import type {
  ParsedInstrument,
  ParsedSample,
  EnvelopePoints,
} from '../../types/tracker';
import type {
  InstrumentConfig,
  SampleConfig,
  InstrumentMetadata,
  SynthType,
} from '../../types/instrument';
import {
  convertEnvelopeToADSR,
  analyzeEnvelopeShape,
} from './EnvelopeConverter';

/**
 * Convert parsed instrument to DEViLBOX instrument config
 */
export function convertToInstrument(
  parsed: ParsedInstrument,
  instrumentId: number,
  sourceFormat: 'MOD' | 'XM' | 'IT' | 'S3M'
): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];

  // XM instruments can have multiple samples
  // Create one DEViLBOX instrument per sample (simplest approach)
  // Use sequential IDs: instrumentId, instrumentId+1, instrumentId+2, etc.
  for (let i = 0; i < parsed.samples.length; i++) {
    const sample = parsed.samples[i];
    const instrument = convertSampleToInstrument(
      sample,
      parsed,
      instrumentId + i, // Sequential ID (1-128 XM-compatible range)
      sourceFormat
    );
    instruments.push(instrument);
  }

  return instruments;
}

/**
 * Convert a single sample to Sampler instrument
 */
function convertSampleToInstrument(
  sample: ParsedSample,
  parentInstrument: ParsedInstrument,
  instrumentId: number,
  sourceFormat: 'MOD' | 'XM' | 'IT' | 'S3M'
): InstrumentConfig {
  // Convert sample PCM data to AudioBuffer and blob URL
  const { audioBuffer, blobUrl } = convertPCMToAudioBuffer(sample);

  // Debug logging for sample conversion
  const logRate = sample.sampleRate || 8363;
  console.log(`[InstrumentConverter] Inst ${instrumentId}: rate=${logRate} len=${sample.length} bits=${sample.bitDepth} loop=${sample.loopType} fine=${sample.finetune} vol=${sample.volume} name="${sample.name || parentInstrument.name}"`);

  // Calculate base note from relative note and finetune
  const baseNote = calculateBaseNote(sample.relativeNote, sample.finetune);

  // Convert detune from finetune (-128 to +127 → -100 to +100 cents)
  const detune = (sample.finetune * 100) / 128;

  // Convert volume envelope to ADSR
  // If no envelope, uses sustain=100 to let sample play fully (MOD samples)
  const envelope = convertEnvelopeToADSR(
    parentInstrument.volumeEnvelope
  );

  // Create sample config
  // IMPORTANT: loopStart/loopEnd are in sample units, not seconds
  // ToneEngine will convert using sampleRate
  const sampleRate = sample.sampleRate || 8363; // Amiga C-2 rate
  const sampleConfig: SampleConfig = {
    audioBuffer,
    url: blobUrl,
    baseNote,
    detune,
    loop: sample.loopType !== 'none',
    loopStart: sample.loopStart,
    loopEnd: sample.loopStart + sample.loopLength,
    sampleRate: sampleRate, // For converting loop points to seconds
    reverse: false,
    playbackRate: 1.0,
  };

  // Create metadata
  const metadata: InstrumentMetadata = {
    importedFrom: sourceFormat,
    originalEnvelope: parentInstrument.volumeEnvelope,
    autoVibrato: parentInstrument.autoVibrato,
    preservedSample: {
      audioBuffer: sampleConfig.audioBuffer!, // Non-null assertion: we just created this
      url: sampleConfig.url,
      baseNote: sampleConfig.baseNote,
      detune: sampleConfig.detune,
      loop: sampleConfig.loop,
      loopStart: sampleConfig.loopStart,
      loopEnd: sampleConfig.loopEnd,
      envelope,
    },
    // Add MOD/XM period-based playback metadata
    modPlayback: {
      usePeriodPlayback: true, // Use period-based playback for accuracy
      periodMultiplier: 3546895, // AMIGA_PALFREQUENCY_HALF (PAL Amiga)
      finetune: sample.finetune, // Store original finetune
      defaultVolume: sample.volume, // Sample's default volume (0-64) for channel init
    },
  };

  // Create instrument
  const instrument: InstrumentConfig = {
    id: instrumentId,
    name: sample.name || parentInstrument.name || `Instrument ${instrumentId}`,
    type: 'sample' as const,
    synthType: 'Sampler',
    sample: sampleConfig,
    envelope,
    effects: [],
    // Set to unity gain (0 dB) - volume is controlled via channel volume (velocity)
    // Sample's default volume is stored in metadata for TrackerReplayer to use
    // when initializing channel volume on note trigger
    volume: 0,
    pan: ((sample.panning - 128) / 127) * 100, // Convert 0-255 to -100 to +100
    metadata,
    // IMPORTANT: Tone.Sampler looks for sampleUrl in parameters
    parameters: {
      sampleUrl: blobUrl,
    },
  };

  return instrument;
}

/**
 * Convert PCM data to AudioBuffer and data URL
 * XM/MOD samples are signed 8/16-bit, AudioBuffer uses Float32
 *
 * IMPORTANT: We use base64 data URLs instead of blob URLs because:
 * - Blob URLs don't survive page refreshes (they're session-specific)
 * - Data URLs embed the audio data directly, surviving serialization
 * - This allows samples to persist across browser sessions
 */
function convertPCMToAudioBuffer(sample: ParsedSample): { audioBuffer: ArrayBuffer; blobUrl: string } {
  const sampleRate = sample.sampleRate || 8363; // Default to Amiga C-2 rate
  const length = sample.length;

  // CRITICAL FIX: Don't use OfflineAudioContext - browsers clamp sample rate to 44100 Hz minimum
  // Instead, create WAV file directly with correct sample rate header
  // The browser will properly decode and resample when loading the WAV

  // Convert PCM to 16-bit signed samples for WAV file
  const samples16bit = new Int16Array(length);

  if (sample.bitDepth === 8) {
    // Check if already normalized (Float32Array from MOD parser)
    const pcmData = sample.pcmData instanceof Float32Array
      ? new Float32Array(sample.pcmData)
      : new Int8Array(sample.pcmData);

    for (let i = 0; i < length; i++) {
      // Convert to 16-bit range
      if (pcmData instanceof Float32Array) {
        // Already normalized -1 to 1
        samples16bit[i] = Math.round(pcmData[i] * 32767);
      } else {
        // 8-bit signed: -128 to +127 → scale to 16-bit
        samples16bit[i] = pcmData[i] * 256;
      }
    }
  } else if (sample.bitDepth === 16) {
    // 16-bit signed PCM: copy directly
    const pcmData = new Int16Array(sample.pcmData);
    for (let i = 0; i < length; i++) {
      samples16bit[i] = pcmData[i];
    }
  }

  // Create WAV file directly with proper sample rate header
  const loopInfo = sample.loopType !== 'none' ? {
    start: sample.loopStart,
    end: sample.loopStart + sample.loopLength,
  } : undefined;

  const wavArrayBuffer = createWavFile(samples16bit, sampleRate, loopInfo);

  // Convert to base64 data URL (survives page refresh unlike blob URLs)
  const base64 = arrayBufferToBase64(wavArrayBuffer);
  const dataUrl = `data:audio/wav;base64,${base64}`;

  return {
    audioBuffer: samples16bit.buffer,
    blobUrl: dataUrl,
  };
}

/**
 * Create a WAV file directly from 16-bit samples
 * This bypasses OfflineAudioContext which has sample rate limitations
 */
function createWavFile(samples: Int16Array, sampleRate: number, loopInfo?: { start: number; end: number }): ArrayBuffer {
  const numberOfChannels = 1;
  const dataLength = samples.length * 2; // 16-bit = 2 bytes per sample

  // Calculate total size (header + data + optional SMPL chunk)
  const smplChunkSize = loopInfo ? 68 : 0;
  const totalSize = 44 + dataLength + smplChunkSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Write RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');

  // Write fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true); // CRITICAL: Use the original sample rate (8363 Hz for MOD)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // byte rate
  view.setUint16(32, numberOfChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // Write data chunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  // Write SMPL chunk if loop points provided
  if (loopInfo) {
    writeString(offset, 'smpl');
    view.setUint32(offset + 4, 60, true);
    view.setUint32(offset + 8, 0, true); // Manufacturer
    view.setUint32(offset + 12, 0, true); // Product
    view.setUint32(offset + 16, Math.floor(1000000000 / sampleRate), true); // Sample period
    view.setUint32(offset + 20, 60, true); // MIDI unity note
    view.setUint32(offset + 24, 0, true); // MIDI pitch fraction
    view.setUint32(offset + 28, 0, true); // SMPTE format
    view.setUint32(offset + 32, 0, true); // SMPTE offset
    view.setUint32(offset + 36, 1, true); // Number of loops
    view.setUint32(offset + 40, 0, true); // Sampler data
    view.setUint32(offset + 44, 0, true); // Cue point ID
    view.setUint32(offset + 48, 0, true); // Loop type (forward)
    view.setUint32(offset + 52, loopInfo.start, true); // Loop start
    view.setUint32(offset + 56, loopInfo.end - 1, true); // Loop end
    view.setUint32(offset + 60, 0, true); // Fraction
    view.setUint32(offset + 64, 0, true); // Play count
  }

  return buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Calculate base note from relative note offset
 * MOD: No relative note, samples play at C3 (Amiga C-2 = period 428 = 8287 Hz)
 * XM: Relative note offset (-96 to +95 semitones from C-4)
 *
 * From pt2_replayer.c period table:
 * - Amiga C-2 (period 428) = modern C3 (MIDI 48)
 * - Sample recorded at 8363 Hz plays at natural pitch when triggered at period 428
 */
function calculateBaseNote(relativeNote: number, _finetune: number): string {
  // Amiga C-2 base note = modern C3 (MIDI 48)
  // ProTracker period table: C-3 (period 428) = MIDI 48 = C3 in scientific notation
  const baseNoteNum = 48 + relativeNote; // C3 = MIDI 48 (Amiga C-2 reference)

  // Convert MIDI note number to note name (Tone.js format: "C3", not "C-2")
  const octave = Math.floor(baseNoteNum / 12) - 1;
  const noteIndex = baseNoteNum % 12;
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  return `${notes[noteIndex]}${octave}`; // No dash, Tone.js format
}

/**
 * Analyze sample and suggest synth configuration for transformation
 * Used when user wants to replace sample with synth
 */
export interface SampleAnalysis {
  dominantFrequency: number | null; // Hz (null if noise/percussion)
  harmonicContent: 'rich' | 'pure' | 'noise';
  envelopeShape: 'pluck' | 'pad' | 'percussive' | 'sustained' | 'unknown';
  hasLoop: boolean;
  isPitched: boolean;
  bandwidth: number; // Spectral bandwidth in Hz
}

export function analyzeSample(
  sample: ParsedSample,
  envelope?: EnvelopePoints
): SampleAnalysis {
  // Analyze envelope
  const envelopeAnalysis = analyzeEnvelopeShape(envelope);

  // Basic analysis (full FFT analysis would be complex)
  // For now, use heuristics
  const hasLoop = sample.loopType !== 'none';
  const isPitched = sample.relativeNote !== 0 || hasLoop;

  // Heuristic: short samples without loops are likely percussive
  const isPercussive =
    sample.length < 8000 && !hasLoop && envelopeAnalysis.type === 'percussive';

  return {
    dominantFrequency: isPitched ? 440 : null, // Would need FFT for real value
    harmonicContent: isPercussive ? 'noise' : isPitched ? 'rich' : 'pure',
    envelopeShape: envelopeAnalysis.type,
    hasLoop,
    isPitched,
    bandwidth: 1000, // Placeholder
  };
}

/**
 * Suggest synth configuration based on sample analysis
 * Used for intelligent sample-to-synth transformation
 */
export function suggestSynthConfig(
  targetSynthType: SynthType,
  analysis: SampleAnalysis
): any {
  switch (targetSynthType) {
    case 'TB303':
      return {
        oscillator: {
          type: analysis.harmonicContent === 'rich' ? 'sawtooth' : 'square',
        },
        filter: {
          cutoff: analysis.dominantFrequency || 440 < 200 ? 500 : 1000,
          resonance: 70,
        },
        filterEnvelope: {
          envMod: 60,
          decay: analysis.envelopeShape === 'pluck' ? 200 : 500,
        },
        accent: {
          amount: 70,
        },
        slide: {
          time: 60,
          mode: 'exponential' as const,
        },
      };

    case 'PolySynth':
      return {
        voiceCount: 8,
        voiceType: 'Synth' as const,
        stealMode: 'oldest' as const,
        oscillator: {
          type: 'sawtooth' as const,
          detune: 0,
          octave: 0,
        },
        envelope: {
          attack: analysis.envelopeShape === 'pad' ? 200 : 50,
          decay: 500,
          sustain: analysis.hasLoop ? 50 : 0,
          release: 100,
        },
        portamento: 0,
      };

    case 'Wavetable':
      return {
        wavetableId: 'basic-saw',
        morphPosition: 0,
        morphModSource: 'none' as const,
        morphModAmount: 50,
        morphLFORate: 2,
        unison: {
          voices: analysis.harmonicContent === 'rich' ? 3 : 1,
          detune: 10,
          stereoSpread: 50,
        },
        envelope: {
          attack: 10,
          decay: 500,
          sustain: 0,
          release: 100,
        },
        filter: {
          type: 'lowpass' as const,
          cutoff: 8000,
          resonance: 20,
          envelopeAmount: 0,
        },
        filterEnvelope: {
          attack: 10,
          decay: 500,
          sustain: 0,
          release: 100,
        },
      };

    case 'ChipSynth':
      return {
        channel: 'pulse1' as const,
        pulse: {
          duty: 50 as const,
        },
        bitDepth: 8,
        sampleRate: 22050,
        envelope: {
          attack: 5,
          decay: analysis.envelopeShape === 'percussive' ? 100 : 300,
          sustain: 0,
          release: 50,
        },
        vibrato: {
          speed: 6,
          depth: 0,
          delay: 200,
        },
        arpeggio: {
          enabled: false,
          speed: 15,
          pattern: [0, 4, 7],
        },
      };

    default:
      // Default synth config
      return {
        oscillator: {
          type: 'sawtooth' as const,
          detune: 0,
          octave: 0,
        },
        envelope: {
          attack: 50,
          decay: 500,
          sustain: 0,
          release: 100,
        },
      };
  }
}
