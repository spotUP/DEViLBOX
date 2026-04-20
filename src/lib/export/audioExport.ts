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
 *
 * The captured buffer is trimmed of leading silence before return — the
 * replayer's async play() path means audio typically doesn't flow for
 * 50–300 ms after the tap connects, and we don't want that dead air in
 * exported files. See `trimLeadingSilence` for the threshold / cap.
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
    // Extend capture by 1 s so the leading-silence trim has headroom
    // without shortening the user's actual song content.
    const buffer = await captureAudioLiveToBuffer(durationSec + 1, { onProgress, unmuteAll });
    return trimLeadingSilence(buffer);
  } finally {
    try { replayer.stop(); } catch { /* ok */ }
  }
}

/**
 * Strip leading silence from an AudioBuffer. Finds the first sample where
 * either channel exceeds `thresholdDb` (default −60 dB ≈ 0.001 amplitude)
 * and returns a new buffer starting `preRollSec` before that sample.
 *
 * Bounded by `maxTrimSec`: if nothing above the threshold appears within
 * that window, the buffer is returned untouched (defensive — a deliberately
 * quiet intro shouldn't be eaten). Default 2 s cap comfortably covers
 * replayer startup latency while preserving short intros.
 */
export function trimLeadingSilence(
  buffer: AudioBuffer,
  options: { thresholdDb?: number; maxTrimSec?: number; preRollSec?: number } = {},
): AudioBuffer {
  const thresholdDb = options.thresholdDb ?? -60;
  const maxTrimSec = options.maxTrimSec ?? 2;
  const preRollSec = options.preRollSec ?? 0.01;

  const threshold = Math.pow(10, thresholdDb / 20);
  const sr = buffer.sampleRate;
  const maxTrimSamples = Math.floor(maxTrimSec * sr);
  const preRollSamples = Math.floor(preRollSec * sr);

  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const scanEnd = Math.min(L.length, maxTrimSamples);

  let firstAudio = -1;
  for (let i = 0; i < scanEnd; i++) {
    if (Math.abs(L[i]) > threshold || Math.abs(R[i]) > threshold) {
      firstAudio = i;
      break;
    }
  }
  if (firstAudio < 0) return buffer; // all silence in the scan window — leave alone
  const trimFrom = Math.max(0, firstAudio - preRollSamples);
  if (trimFrom === 0) return buffer;

  const newLength = buffer.length - trimFrom;
  // Fresh AudioBuffer via OfflineAudioContext — no audio playback side effects.
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, newLength, sr);
  const out = ctx.createBuffer(buffer.numberOfChannels, newLength, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(buffer.getChannelData(ch).subarray(trimFrom));
  }
  return out;
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

// ==========================================================================
// STEM EXPORT — one file per channel via live-solo capture
// ==========================================================================

export interface StemResult {
  channelIndex: number;
  channelName: string;
  blob: Blob;
  format: 'wav' | 'mp3';
}

/**
 * Export every channel as its own file by running a live capture for each,
 * with only that channel unmuted. Correct for every format (tracker MODs,
 * UADE, Furnace, Hively, libopenmpt, SID, Tone.js synths) because it uses
 * the same `blepInput` tap as the main export — including master FX and
 * the dub bus.
 *
 * Real-time cost is N × song duration (one full pass per channel). A
 * 4-channel 2-minute song takes ~8 minutes. A 16-channel 3-minute song
 * takes ~48 minutes. The UI caller should show per-stem progress and
 * make this opt-in, not accidental.
 *
 * Mute / solo state is snapshotted before and restored after, so firing
 * this in the middle of a mix session doesn't silently wreck the user's
 * setup even on error paths.
 */
export async function exportLiveCaptureStems(options: {
  durationSec?: number;
  format?: 'wav' | 'mp3';
  kbps?: number;
  /** (stemIndex, totalStems, percentOfCurrentStem) */
  onProgress?: (stemIndex: number, totalStems: number, stemPercent: number) => void;
} = {}): Promise<StemResult[]> {
  const format = options.format ?? 'wav';
  const kbps = options.kbps ?? 192;

  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const tr = useTrackerStore.getState();
  // Use the currently-selected pattern for the channel layout / names.
  // Every pattern in a song shares the same channel count, so this is
  // sufficient even when we later render the full song.
  const refPattern =
    tr.patterns[tr.currentPatternIndex] ??
    tr.patterns[tr.patternOrder[0] ?? 0] ??
    tr.patterns[0];
  const numChannels = refPattern?.channels.length ?? 0;
  if (numChannels === 0) throw new Error('No channels found to export as stems');

  const { useMixerStore } = await import('@/stores/useMixerStore');
  // Snapshot EVERYTHING we might touch so a crash mid-loop can't leave
  // the user staring at a silently-soloed channel they didn't pick.
  const mix0 = useMixerStore.getState();
  const snapshot = mix0.channels.map((c) => ({ muted: c.muted, soloed: c.soloed }));

  const results: StemResult[] = [];
  try {
    for (let ch = 0; ch < numChannels; ch++) {
      // Clear every solo, then solo only this channel. The mixer's
      // `isSoloing` flag flips automatically and propagates to the
      // TrackerReplayer mute mask so WASM engines honour it too.
      const m = useMixerStore.getState();
      for (let i = 0; i < m.channels.length; i++) {
        if (m.channels[i].soloed && i !== ch) m.setChannelSolo(i, false);
        if (m.channels[i].muted) m.setChannelMute(i, false);
      }
      if (!useMixerStore.getState().channels[ch]?.soloed) {
        m.setChannelSolo(ch, true);
      }

      const buffer = await captureLiveSong({
        durationSec: options.durationSec,
        onProgress: (p) => options.onProgress?.(ch, numChannels, p),
      });
      const blob = format === 'mp3'
        ? audioBufferToMp3(buffer, kbps)
        : audioBufferToWav(buffer);
      const channelName = refPattern.channels[ch]?.name || `Channel ${ch + 1}`;
      results.push({ channelIndex: ch, channelName, blob, format });
    }
  } finally {
    // Restore mute/solo EXACTLY. setChannelSolo also re-derives `isSoloing`.
    const m = useMixerStore.getState();
    for (let i = 0; i < snapshot.length; i++) {
      const s = snapshot[i];
      if (m.channels[i].soloed !== s.soloed) m.setChannelSolo(i, s.soloed);
      if (m.channels[i].muted !== s.muted) m.setChannelMute(i, s.muted);
    }
  }
  return results;
}

/**
 * Convenience wrapper: export stems AND trigger a download for each one,
 * named `<baseName>_<channelNum>_<channelName>.<ext>`.
 */
export async function downloadLiveCaptureStems(
  baseName: string,
  options: Parameters<typeof exportLiveCaptureStems>[0] = {},
): Promise<StemResult[]> {
  const stems = await exportLiveCaptureStems(options);
  for (const stem of stems) {
    const safeName = stem.channelName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const idx = String(stem.channelIndex + 1).padStart(2, '0');
    maybeDownload(stem.blob, `${baseName}_${idx}_${safeName}`, stem.format);
  }
  return stems;
}

