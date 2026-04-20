/**
 * Audio Export - Render pattern/song to WAV file
 * Uses Tone.js Offline rendering for accurate timing.
 * UADE-backed formats are rendered through the real UADE engine for accurate playback.
 */

import * as Tone from 'tone';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { UADEEngine } from '@/engine/uade/UADEEngine';

/** Synth node that can play notes */
interface PlayableSynth extends Tone.ToneAudioNode {
  triggerAttackRelease(note: string, duration: number | string, time?: number, velocity?: number): this;
}

interface AudioExportOptions {
  sampleRate?: number;
  channels?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Convert XM note number to Tone.js note string
 * XM: 1-96 = C-0 to B-7, 97 = note off
 */
function xmNoteToToneNote(note: number): string {
  if (note <= 0 || note > 96) return '';
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const semitone = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${noteNames[semitone]}${octave}`;
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscillator: { type: inst.oscillator?.type || 'sawtooth' } as any,
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
        case 'ToneAM':
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
              urls: { C4: inst.parameters.sampleUrl as string },
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
              url: inst.parameters.sampleUrl as string,
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscillator: { type: inst.oscillator?.type || 'sawtooth' } as any,
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
          if (nextCell.note !== 0) {
            duration = (nextRow - rowIndex) * secondsPerRow;
            break;
          }
        }

        const toneNote = xmNoteToToneNote(cell.note);
        if (!toneNote) return; // Skip if note conversion failed
        const velocity = cell.volume !== 0 ? cell.volume / 64 : 0.8;

        transport.schedule((t) => {
          try {
            if ('triggerAttackRelease' in synth) {
              (synth as PlayableSynth).triggerAttackRelease(toneNote, duration, t, velocity);
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

/**
 * Encode an AudioBuffer to an MP3 Blob using lamejs. Default bitrate 192
 * kbps is a good quality/size tradeoff — bump to 320 for archival, or drop
 * to 128 for small chat-friendly files. Stereo is handled via interleaved
 * left/right Int16 granules; mono pipes a single channel through the encoder.
 */
export function audioBufferToMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(numChannels, buffer.sampleRate, kbps);
  const left = floatTo16Bit(buffer.getChannelData(0));
  const right = numChannels === 2 ? floatTo16Bit(buffer.getChannelData(1)) : undefined;

  const BLOCK = 1152; // one MPEG audio frame
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK);
    const r = right ? right.subarray(i, i + BLOCK) : undefined;
    const enc = encoder.encodeBuffer(l, r);
    if (enc.length > 0) chunks.push(enc);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);
  return new Blob(chunks as unknown as BlobPart[], { type: 'audio/mpeg' });
}

function floatTo16Bit(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
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

// ==========================================================================
// LIVE CAPTURE PATH — real-time tap from masterEffectsInput
// Works for every format: WASM engines, OctaMED synths, Tone.js synths.
// ==========================================================================

/**
 * Capture audio from ToneEngine's masterEffectsInput for `durationSec` seconds.
 * Returns a stereo WAV Blob.
 *
 * The caller must start playback BEFORE awaiting this promise so no samples
 * are missed.  Example:
 *
 *   const capture = captureAudioLive(durationSec);
 *   play();
 *   const wav = await capture;
 *   stop();
 */
interface CaptureOptions {
  onProgress?: (percent: number) => void;
  /**
   * Temporarily unmute every tracker channel before capturing, then
   * restore the original state. Use when the user wants a "full render"
   * that ignores their current mute/solo for export only.
   */
  unmuteAll?: boolean;
}

export function captureAudioLive(
  durationSec: number,
  onProgressOrOptions?: ((percent: number) => void) | CaptureOptions,
): Promise<Blob> {
  return captureAudioLiveToBuffer(durationSec, onProgressOrOptions)
    .then((buffer) => audioBufferToWav(buffer));
}

/**
 * Same as `captureAudioLive` but returns the raw `AudioBuffer` instead of a
 * WAV-encoded Blob. Used by the MP3 encoder and any path that wants to
 * post-process the capture before writing it to disk.
 */
export function captureAudioLiveToBuffer(
  durationSec: number,
  onProgressOrOptions?: ((percent: number) => void) | CaptureOptions,
): Promise<AudioBuffer> {
  const opts: CaptureOptions = typeof onProgressOrOptions === 'function'
    ? { onProgress: onProgressOrOptions }
    : (onProgressOrOptions ?? {});
  const { onProgress, unmuteAll } = opts;

  return new Promise((resolve, reject) => {
    import('@/engine/ToneEngine').then(({ getToneEngine }) => {
      import('@/utils/audio-context').then(({ getNativeAudioNode }) => {
        import('@/stores/useMixerStore').then(({ useMixerStore }) => {
          const toneCtx = Tone.getContext();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx: AudioContext = (toneCtx as any).rawContext ?? (toneCtx as any)._context ?? toneCtx;

          const sampleRate = ctx.sampleRate;
          const totalSamples = Math.ceil(durationSec * sampleRate);
          const BUFFER_SIZE = 4096;

          const bufL = new Float32Array(totalSamples);
          const bufR = new Float32Array(totalSamples);
          let captured = 0;
          let done = false;

          const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);

          // Snapshot mute/solo state if we're about to override for a full render.
          let restoreMuteState: (() => void) | null = null;
          if (unmuteAll) {
            const mix = useMixerStore.getState();
            const snapshot = mix.channels.map((c) => ({ muted: c.muted, soloed: c.soloed }));
            const hadSoloing = mix.isSoloing;
            snapshot.forEach((_s, i) => {
              if (mix.channels[i].muted) mix.setChannelMute(i, false);
              if (mix.channels[i].soloed) mix.setChannelSolo(i, false);
            });
            restoreMuteState = () => {
              const m = useMixerStore.getState();
              snapshot.forEach((s, i) => {
                if (m.channels[i].muted !== s.muted) m.setChannelMute(i, s.muted);
                if (m.channels[i].soloed !== s.soloed) m.setChannelSolo(i, s.soloed);
              });
              // `isSoloing` is derived from the solo flags — setChannelSolo
              // re-syncs it.
              void hadSoloing;
            };
          }

          function finish() {
            if (done) return;
            done = true;
            try { processor.disconnect(); } catch { /* ignore */ }
            try {
              const toneEngine = getToneEngine();
              // Disconnect from whichever tap we connected to. `blepInput`
              // is post master FX and pre master volume — the canonical
              // export point.
              const mn = getNativeAudioNode(toneEngine.blepInput);
              mn?.disconnect(processor);
            } catch { /* ignore */ }
            restoreMuteState?.();

            const audioBuffer = ctx.createBuffer(2, captured, sampleRate);
            audioBuffer.getChannelData(0).set(bufL.subarray(0, captured));
            audioBuffer.getChannelData(1).set(bufR.subarray(0, captured));
            resolve(audioBuffer);
          }

          processor.onaudioprocess = (event: AudioProcessingEvent) => {
            if (done) return;
            const inputL = event.inputBuffer.getChannelData(0);
            const inputR = event.inputBuffer.numberOfChannels > 1
              ? event.inputBuffer.getChannelData(1)
              : inputL;

            const count = Math.min(inputL.length, totalSamples - captured);
            bufL.set(inputL.subarray(0, count), captured);
            bufR.set(inputR.subarray(0, count), captured);
            captured += count;

            onProgress?.(Math.min(99, (captured / totalSamples) * 100));

            if (captured >= totalSamples) finish();
          };

          try {
            const toneEngine = getToneEngine();
            // Tap at `blepInput` — post-master-FX, pre-master-volume. This
            // captures everything the user hears colorized (reverb, EQ,
            // limiter chain) without baking in their current volume knob
            // so the exported WAV is normalized.
            const tap = getNativeAudioNode(toneEngine.blepInput);
            if (!tap) throw new Error('Could not find blepInput native node for capture tap');

            // Silent gain sink — ScriptProcessor requires an output but we
            // don't want to double-route audio to the speaker.
            const silentGain = ctx.createGain();
            silentGain.gain.value = 0;
            silentGain.connect(ctx.destination);

            tap.connect(processor);
            processor.connect(silentGain);

            // Watchdog: resolve early if caller-supplied duration elapses
            // without reaching totalSamples (e.g., song ended with silence
            // padding).
            setTimeout(finish, durationSec * 1000 + 500);
          } catch (err) {
            restoreMuteState?.();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      });
    });
  });
}

// ==========================================================================
// UADE RENDER PATH — accurate offline render for UADE-backed modules
// ==========================================================================

/**
 * Check whether the loaded instruments indicate a UADE-backed module.
 * Returns the UADE instrument config if found, null otherwise.
 */
export function getUADEInstrument(instruments: InstrumentConfig[]): InstrumentConfig | null {
  return instruments.find(i => i.synthType === 'UADESynth' && i.uade?.fileData) ?? null;
}

/**
 * Render a UADE module to a WAV Blob via the real UADE engine.
 * This produces sample-accurate playback with all effects intact.
 *
 * @param fileData - Original module file bytes (from instrument.uade.fileData)
 * @param filename - Original filename (needed for UADE format detection)
 * @param subsong - Subsong index (default: 0)
 * @param onProgress - Progress callback
 * @returns WAV Blob ready for download
 */
export async function renderUADEToWav(
  fileData: ArrayBuffer,
  filename: string,
  subsong = 0,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  onProgress?.(5);

  const engine = UADEEngine.getInstance();
  await engine.ready();

  onProgress?.(10);

  // Load the module into UADE
  await engine.load(fileData.slice(0), filename);

  onProgress?.(20);

  // Render the full song to WAV (ArrayBuffer containing complete WAV file)
  const wavBuffer = await engine.renderFull(subsong);

  onProgress?.(90);

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });

  onProgress?.(100);
  return blob;
}

/**
 * Export a UADE module as WAV file (download).
 */
export async function exportUADEAsWav(
  fileData: ArrayBuffer,
  filename: string,
  outputFilename: string,
  subsong = 0,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const wavBlob = await renderUADEToWav(fileData, filename, subsong, onProgress);

  // Download the file
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputFilename.endsWith('.wav') ? outputFilename : `${outputFilename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

/**
 * Render a single channel/stem to audio buffer.
 * Creates a pattern copy with all other channels muted, then renders.
 */
export async function renderStemToAudio(
  pattern: Pattern,
  instruments: InstrumentConfig[],
  bpm: number,
  channelIndex: number,
  options: AudioExportOptions = {}
): Promise<AudioBuffer> {
  // Create a pattern with only the target channel active
  const stemPattern: Pattern = {
    ...pattern,
    id: `stem-${channelIndex}-${pattern.id}`,
    channels: pattern.channels.map((ch, i) => {
      if (i === channelIndex) return ch;
      // Mute other channels by zeroing all notes
      return {
        ...ch,
        rows: ch.rows.map(() => ({
          note: 0,
          instrument: 0,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        })),
      };
    }),
  };

  return renderPatternToAudio(stemPattern, instruments, bpm, options);
}

/**
 * Export all channels as separate WAV stems.
 * Returns an array of {channelIndex, channelName, blob} for each stem.
 */
export async function exportAllStems(
  pattern: Pattern,
  instruments: InstrumentConfig[],
  bpm: number,
  onProgress?: (stemIndex: number, totalStems: number, stemProgress: number) => void
): Promise<Array<{ channelIndex: number; channelName: string; blob: Blob }>> {
  const results: Array<{ channelIndex: number; channelName: string; blob: Blob }> = [];
  const numChannels = pattern.channels.length;

  for (let ch = 0; ch < numChannels; ch++) {
    const stemProgress = (progress: number) => {
      onProgress?.(ch, numChannels, progress);
    };

    const buffer = await renderStemToAudio(pattern, instruments, bpm, ch, {
      sampleRate: 44100,
      onProgress: stemProgress,
    });

    const blob = audioBufferToWav(buffer);
    const channelName = pattern.channels[ch].name || `Channel ${ch + 1}`;
    results.push({ channelIndex: ch, channelName, blob });
  }

  return results;
}

// ==========================================================================
// LIVE CAPTURE EXPORT — the canonical "what you hear" export path
// ==========================================================================

/**
 * Exports the full song to WAV by capturing the live audio graph from
 * `blepInput` (post master-FX, pre master-volume). This is the
 * authoritative export path for accurate "sounds exactly like what you
 * hear" results because it includes:
 *   - Every synth DEViLBOX supports (TB303, DB303, DubSiren, Furnace, UADE,
 *     Hively, libopenmpt, etc.) — because they're all already wired into
 *     the running engine graph
 *   - Every per-instrument effect in the user's instrument configs
 *   - Every per-channel insert effect in useMixerStore
 *   - Every master FX from useAudioStore.masterEffects
 *   - Stereo separation + per-channel panning
 *   - Live tempo / speed / groove / swing settings
 *   - Every in-song tracker effect (pitch slides, arpeggios, vibrato,
 *     speed changes, pattern jumps, etc.) because the real replayer
 *     is executing
 *
 * Runs in real time — a 3-minute song takes 3 minutes to capture.
 *
 * `options.unmuteAll = true` temporarily unmutes every channel for the
 * duration of the capture (mute/solo state restored after), useful for
 * a "full mix" export even if the user is currently soloing one channel.
 */
export async function exportLiveCaptureToWav(
  options: {
    durationSec?: number;
    unmuteAll?: boolean;
    onProgress?: (progress: number) => void;
    filename?: string;
  } = {},
): Promise<Blob> {
  const buffer = await captureLiveSong(options);
  const blob = audioBufferToWav(buffer);
  maybeDownload(blob, options.filename, 'wav');
  return blob;
}

/**
 * Live-capture sibling of `exportLiveCaptureToWav` that emits MP3 instead
 * of WAV. `kbps` defaults to 192 — pass 320 for archival or 128 for smaller.
 */
export async function exportLiveCaptureToMp3(
  options: {
    durationSec?: number;
    unmuteAll?: boolean;
    onProgress?: (progress: number) => void;
    filename?: string;
    kbps?: number;
  } = {},
): Promise<Blob> {
  const buffer = await captureLiveSong(options);
  const blob = audioBufferToMp3(buffer, options.kbps ?? 192);
  maybeDownload(blob, options.filename, 'mp3');
  return blob;
}

/**
 * Shared orchestration: estimate duration, start the replayer from bar 1,
 * real-time capture into an AudioBuffer. Caller picks the encoding.
 */
async function captureLiveSong(options: {
  durationSec?: number;
  unmuteAll?: boolean;
  onProgress?: (progress: number) => void;
}): Promise<AudioBuffer> {
  const { onProgress, unmuteAll } = options;

  let durationSec = options.durationSec;
  if (!durationSec || durationSec <= 0) {
    const { useTransportStore } = await import('@/stores/useTransportStore');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const t = useTransportStore.getState();
    const tr = useTrackerStore.getState();
    const bpm = t.bpm || 125;
    const speed = t.speed || 6;
    const secPerRow = (speed * 60) / (bpm * 24);
    let totalRows = 0;
    for (const patIdx of tr.patternOrder) {
      const pat = tr.patterns[patIdx];
      totalRows += pat ? (pat.channels[0]?.rows?.length ?? 64) : 64;
    }
    durationSec = Math.max(5, totalRows * secPerRow + 2);
  }

  const { getTrackerReplayer } = await import('@/engine/TrackerReplayer');
  const replayer = getTrackerReplayer();
  try { replayer.stop(false); } catch { /* not playing */ }
  try {
    const { useTransportStore } = await import('@/stores/useTransportStore');
    useTransportStore.getState().setCurrentRow(0);
    useTransportStore.getState().setCurrentPattern(0);
  } catch { /* store not ready */ }
  void replayer.play();

  try {
    return await captureAudioLiveToBuffer(durationSec, { onProgress, unmuteAll });
  } finally {
    try { replayer.stop(); } catch { /* ok */ }
  }
}

function maybeDownload(blob: Blob, filename: string | undefined, ext: 'wav' | 'mp3'): void {
  if (!filename) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all stems and download as individual WAV files.
 */
export async function downloadAllStems(
  pattern: Pattern,
  instruments: InstrumentConfig[],
  bpm: number,
  baseName: string,
  onProgress?: (stemIndex: number, totalStems: number, stemProgress: number) => void
): Promise<void> {
  const stems = await exportAllStems(pattern, instruments, bpm, onProgress);

  for (const stem of stems) {
    const url = URL.createObjectURL(stem.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_${stem.channelName.replace(/[^a-zA-Z0-9]/g, '_')}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
