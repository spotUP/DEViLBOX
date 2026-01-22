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
  for (let i = 0; i < parsed.samples.length; i++) {
    const sample = parsed.samples[i];
    const instrument = convertSampleToInstrument(
      sample,
      parsed,
      instrumentId * 100 + i, // Unique ID
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

  // Calculate base note from relative note and finetune
  const baseNote = calculateBaseNote(sample.relativeNote, sample.finetune);

  // Convert detune from finetune (-128 to +127 → -100 to +100 cents)
  const detune = (sample.finetune * 100) / 128;

  // Convert volume envelope to ADSR
  const envelope = convertEnvelopeToADSR(
    parentInstrument.volumeEnvelope,
    0 // Tracker-style: decay to silence
  );

  // Create sample config
  const sampleConfig: SampleConfig = {
    audioBuffer,
    url: blobUrl,
    baseNote,
    detune,
    loop: sample.loopType !== 'none',
    loopStart: sample.loopStart,
    loopEnd: sample.loopStart + sample.loopLength,
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
    // Convert MOD volume (0-64) to decibels (-60 to 0 dB)
    // Formula: dB = 20 * log10(volume / 64)
    volume: sample.volume > 0 ? 20 * Math.log10(sample.volume / 64) : -60,
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
 * Convert PCM data to AudioBuffer and blob URL
 * XM/MOD samples are signed 8/16-bit, AudioBuffer uses Float32
 */
function convertPCMToAudioBuffer(sample: ParsedSample): { audioBuffer: ArrayBuffer; blobUrl: string } {
  const sampleRate = sample.sampleRate || 8363; // Default to Amiga C-2 rate
  const length = sample.length;

  // Use offline AudioContext to avoid browser limits
  // Creating multiple AudioContexts causes "AudioContext encountered an error"
  const audioContext = new OfflineAudioContext(1, length, sampleRate);
  const audioBuffer = audioContext.createBuffer(1, length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  // Convert PCM to Float32
  if (sample.bitDepth === 8) {
    // Check if already normalized (Float32Array from MOD parser)
    const pcmData = sample.pcmData instanceof Float32Array
      ? new Float32Array(sample.pcmData)
      : new Int8Array(sample.pcmData);

    for (let i = 0; i < length; i++) {
      // If already Float32, copy directly; otherwise normalize
      channelData[i] = pcmData instanceof Float32Array
        ? pcmData[i]
        : pcmData[i] / 127.0; // ProTracker normalization (127 not 128)
    }
  } else if (sample.bitDepth === 16) {
    // 16-bit signed PCM: -32768 to +32767
    const pcmData = new Int16Array(sample.pcmData);
    for (let i = 0; i < length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
  }

  // Create WAV file from AudioBuffer for Tone.js Sampler
  const wavBlob = audioBufferToWav(audioBuffer);
  const blobUrl = URL.createObjectURL(wavBlob);

  return {
    audioBuffer: channelData.buffer,
    blobUrl,
  };
}

/**
 * Convert AudioBuffer to WAV blob for Tone.js
 */
function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numberOfChannels * 2;
  const sampleRate = audioBuffer.sampleRate;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // byte rate
  view.setUint16(32, numberOfChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write PCM data
  const channelData = audioBuffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Calculate base note from relative note offset
 * MOD: No relative note, samples play at C4 (standard tuning)
 * XM: Relative note offset (-96 to +95 semitones from C-4)
 */
function calculateBaseNote(relativeNote: number, _finetune: number): string {
  // Both MOD and XM samples are mapped to C4 by default
  // The Amiga 8363 Hz corresponds to middle C in modern tuning
  const baseNoteNum = 60 + relativeNote; // C4 = MIDI 60

  // Convert MIDI note number to note name (Tone.js format: "C4", not "C-4")
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
