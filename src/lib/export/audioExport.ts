// @ts-nocheck - ToneAudioNode type issues
/**
 * Audio Export - Render pattern/song to WAV file
 * Uses Tone.js Offline rendering for accurate timing
 */

import * as Tone from 'tone';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';

interface AudioExportOptions {
  sampleRate?: number;
  channels?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Convert tracker note format (C-4) to Tone.js format (C4)
 */
function convertNoteFormat(note: string): string {
  if (note === '===' || note === '...') return note;
  return note.replace('-', '');
}

/**
 * Render a pattern to audio buffer using Tone.js Offline
 */
export async function renderPatternToAudio(
  pattern: Pattern,
  instruments: InstrumentConfig[],
  bpm: number,
  options: AudioExportOptions = {}
): Promise<AudioBuffer> {
  const { sampleRate = 44100, onProgress } = options;

  // Calculate pattern duration
  const beatsPerRow = 0.25; // 4 rows per beat
  const secondsPerRow = (60 / bpm) * beatsPerRow;
  const patternDuration = pattern.length * secondsPerRow;

  // Add a small tail for reverb/delay to ring out
  const tailDuration = 2;
  const totalDuration = patternDuration + tailDuration;

  onProgress?.(0);

  // Render offline
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = bpm;

    // Create synths for each instrument used
    // Use ToneAudioNode as base type to support all synth types
    const synths = new Map<number, Tone.ToneAudioNode>();

    // Determine which instruments are used in the pattern
    const usedInstrumentIds = new Set<number>();
    pattern.channels.forEach((channel) => {
      if (channel.instrumentId !== null) {
        usedInstrumentIds.add(channel.instrumentId);
      }
      channel.rows.forEach((cell) => {
        if (cell.instrument !== null) {
          usedInstrumentIds.add(cell.instrument);
        }
      });
    });

    // Create synths for used instruments
    instruments.forEach((inst) => {
      if (!usedInstrumentIds.has(inst.id)) return;

      let synth: Tone.ToneAudioNode;

      switch (inst.synthType) {
        case 'MonoSynth':
          synth = new Tone.MonoSynth({
            oscillator: { type: inst.oscillator?.type || 'sawtooth' },
            envelope: {
              attack: inst.envelope?.attack ?? 0.01,
              decay: inst.envelope?.decay ?? 0.2,
              sustain: inst.envelope?.sustain ?? 0.5,
              release: inst.envelope?.release ?? 0.5,
            },
            filter: {
              type: inst.filter?.type || 'lowpass',
              frequency: inst.filter?.frequency ?? 2000,
              Q: inst.filter?.Q ?? 1,
            },
          }).toDestination();
          break;
        case 'FMSynth':
          synth = new Tone.PolySynth(Tone.FMSynth).toDestination();
          break;
        case 'AMSynth':
          synth = new Tone.PolySynth(Tone.AMSynth).toDestination();
          break;
        case 'DuoSynth':
          synth = new Tone.DuoSynth().toDestination();
          break;
        case 'PluckSynth':
          synth = new Tone.PluckSynth().toDestination();
          break;
        case 'MetalSynth':
          synth = new Tone.MetalSynth().toDestination();
          break;
        case 'MembraneSynth':
          synth = new Tone.MembraneSynth().toDestination();
          break;
        case 'NoiseSynth':
          synth = new Tone.NoiseSynth().toDestination();
          break;
        case 'Sampler':
          // Create sampler with uploaded sample
          if (inst.parameters?.sampleUrl) {
            synth = new Tone.Sampler({
              urls: { C4: inst.parameters.sampleUrl },
              volume: inst.volume || -12,
            }).toDestination();
          } else {
            // Skip if no sample loaded
            return;
          }
          break;
        case 'Player':
          // Create player with uploaded sample
          if (inst.parameters?.sampleUrl) {
            synth = new Tone.Player({
              url: inst.parameters.sampleUrl,
              volume: inst.volume || -12,
            }).toDestination();
          } else {
            // Skip if no sample loaded
            return;
          }
          break;
        default:
          // Default to PolySynth with Synth
          synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: inst.oscillator?.type || 'sawtooth' },
            envelope: {
              attack: inst.envelope?.attack ?? 0.01,
              decay: inst.envelope?.decay ?? 0.2,
              sustain: inst.envelope?.sustain ?? 0.5,
              release: inst.envelope?.release ?? 0.5,
            },
          }).toDestination();
      }

      synths.set(inst.id, synth);
    });

    // Schedule all notes
    pattern.channels.forEach((channel) => {
      const defaultInstrumentId = channel.instrumentId ?? 0;

      channel.rows.forEach((cell, rowIndex) => {
        // Skip empty cells (note 0 = no note in XM format)
        if (cell.note === 0) return;
        // Skip note off (note 97 in XM format)
        if (cell.note === 97) return;

        const time = rowIndex * secondsPerRow;
        const instrumentId = cell.instrument ?? defaultInstrumentId;
        const synth = synths.get(instrumentId);

        if (!synth) return;

        // Calculate note duration (until next note or note off)
        let duration = secondsPerRow;
        for (let nextRow = rowIndex + 1; nextRow < pattern.length; nextRow++) {
          const nextCell = channel.rows[nextRow];
          if (nextCell.note && nextCell.note !== '...') {
            duration = (nextRow - rowIndex) * secondsPerRow;
            break;
          }
        }

        const toneNote = convertNoteFormat(cell.note);
        const velocity = cell.volume !== null ? cell.volume / 64 : 0.8;

        transport.schedule((t) => {
          try {
            if ('triggerAttackRelease' in synth) {
              synth.triggerAttackRelease(toneNote, duration, t, velocity);
            }
          } catch (e) {
            console.warn(`Failed to trigger note ${toneNote}:`, e);
          }
        }, time);
      });
    });

    transport.start(0);

    onProgress?.(50);
  }, totalDuration, 2, sampleRate);

  onProgress?.(100);

  // ToneAudioBuffer.get() returns the underlying AudioBuffer
  return buffer.get() as AudioBuffer;
}

/**
 * Convert AudioBuffer to WAV blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const fileSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved samples
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Concatenate multiple AudioBuffers into a single buffer
 */
function concatenateAudioBuffers(
  buffers: AudioBuffer[],
  sampleRate: number
): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No buffers to concatenate');
  }
  if (buffers.length === 1) {
    return buffers[0];
  }

  const numChannels = buffers[0].numberOfChannels;
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);

  // Create offline context to generate the combined buffer
  const offlineCtx = new OfflineAudioContext(numChannels, totalLength, sampleRate);
  const combinedBuffer = offlineCtx.createBuffer(numChannels, totalLength, sampleRate);

  // Copy each buffer's data
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = combinedBuffer.getChannelData(channel);
      const sourceData = buffer.getChannelData(channel);
      channelData.set(sourceData, offset);
    }
    offset += buffer.length;
  }

  return combinedBuffer;
}

/**
 * Export pattern as WAV file
 */
export async function exportPatternAsWav(
  pattern: Pattern,
  instruments: InstrumentConfig[],
  bpm: number,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const buffer = await renderPatternToAudio(pattern, instruments, bpm, { onProgress });
  const wavBlob = audioBufferToWav(buffer);

  // Download the file
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all patterns as a single WAV file following the sequence order
 */
export async function exportSongAsWav(
  patterns: Pattern[],
  sequence: number[],
  instruments: InstrumentConfig[],
  bpm: number,
  filename: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (sequence.length === 0) {
    throw new Error('No patterns in sequence to export');
  }

  const sampleRate = 44100;
  const buffers: AudioBuffer[] = [];
  const totalSteps = sequence.length;

  // Render each pattern in sequence order
  for (let i = 0; i < sequence.length; i++) {
    const patternIndex = sequence[i];
    const pattern = patterns[patternIndex];

    if (!pattern) {
      console.warn(`Pattern ${patternIndex} not found in sequence, skipping`);
      continue;
    }

    // Calculate progress: each pattern contributes equally to total progress
    const patternProgress = (progress: number) => {
      const baseProgress = (i / totalSteps) * 100;
      const stepProgress = (progress / 100) * (100 / totalSteps);
      onProgress?.(Math.round(baseProgress + stepProgress));
    };

    const buffer = await renderPatternToAudio(pattern, instruments, bpm, {
      sampleRate,
      onProgress: patternProgress,
    });

    buffers.push(buffer);
  }

  if (buffers.length === 0) {
    throw new Error('No valid patterns to export');
  }

  // Concatenate all pattern buffers
  const combinedBuffer = concatenateAudioBuffers(buffers, sampleRate);
  const wavBlob = audioBufferToWav(combinedBuffer);

  // Download the file
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.(100);
}
