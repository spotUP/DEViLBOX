/**
 * Audio export primitives: encoders, the live capture of the engine's export
 * tap, the raw UADE render and the per-channel stems. Callers do not use these
 * directly: `audioExportService.exportAudio` is the one entry point
 * (plan 2026-10-07-one-load-save-export-path, U3a).
 */

import * as Tone from 'tone';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { UADEEngine } from '@/engine/uade/UADEEngine';

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

  // Peak-normalize if the captured signal would otherwise clip.
  // DEViLBOX's master chain is user-configurable — `masterChannel` is just
  // volume/pan, no default limiter — so a hot mix can legitimately deliver
  // peaks above ±1.0 into the pre-limiter chain. The old
  // code did `Math.max(-1, Math.min(1, x))` which hard-clipped the tops off
  // every wave crest (reported as "distorted audio" on 2026-04-21).
  //
  // Strategy: find the absolute peak across the whole buffer; if > 1.0 scale
  // the entire buffer uniformly so the loudest sample lands at -0.3 dBFS.
  // This is shape-preserving (relative dynamics between channels + samples
  // are untouched) and only engages when needed — well-mixed songs within
  // 0 dBFS roundtrip bit-exact.
  let peak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = channelData[ch];
    for (let i = 0; i < samples; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  const CEILING = 0.9661; // -0.3 dBFS
  const scale = peak > 1.0 ? (CEILING / peak) : 1.0;
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  console.warn(`[audioExport] ⚠️ PEAK LEVEL: ${peak.toFixed(4)} (${peakDb.toFixed(1)} dBFS) | scale: ${scale.toFixed(6)} | samples: ${samples}`);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const scaled = channelData[ch][i] * scale;
      const clamped = scaled < -1 ? -1 : (scaled > 1 ? 1 : scaled);
      const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
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

/**
 * Capture the export tap for `durationSec` seconds and return the raw
 * `AudioBuffer`. The caller must start playback BEFORE awaiting it so no
 * samples are missed (captureLiveSong does).
 */
function captureAudioLiveToBuffer(
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
              // Disconnect from the export tap (post-limiter, pre-master-volume)
              const mn = getNativeAudioNode(toneEngine.exportTap);
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

            // Peak diagnostics — log every ~2 seconds to see how hot the signal is
            if (captured % (sampleRate * 2) < BUFFER_SIZE) {
              let blockPeak = 0;
              for (let j = 0; j < inputL.length; j++) {
                const a = Math.max(Math.abs(inputL[j]), Math.abs(inputR[j]));
                if (a > blockPeak) blockPeak = a;
              }
              const bpDb = blockPeak > 0 ? 20 * Math.log10(blockPeak) : -Infinity;
              console.warn(`[audioExport] capture block peak: ${blockPeak.toFixed(4)} (${bpDb.toFixed(1)} dBFS) at sample ${captured}`);
            }

            const count = Math.min(inputL.length, totalSamples - captured);
            bufL.set(inputL.subarray(0, count), captured);
            bufR.set(inputR.subarray(0, count), captured);
            captured += count;

            onProgress?.(Math.min(99, (captured / totalSamples) * 100));

            if (captured >= totalSamples) finish();
          };

          try {
            const toneEngine = getToneEngine();
            // Tap at `exportTap` — post-safety-limiter, pre-master-volume.
            // The limiter prevents channel-summing overloads (16 channels at
            // 0 dB can peak at ±16.0 = +24 dBFS) from destroying the export.
            // This captures what the user hears through speakers, minus their
            // current master volume knob, so the WAV is normalized.
            const tap = getNativeAudioNode(toneEngine.exportTap);
            if (!tap) throw new Error('Could not find exportTap native node for capture tap');

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

  // Load the module into UADE. NO SCAN: the scan renders the whole song
  // offline to extract pattern rows, `renderFull` below then renders it again,
  // and nothing here reads the rows — the export was paying for the song
  // twice. Looping does not matter either way; `_renderFullSong` sets it to 0
  // itself so the render can terminate.
  await engine.load(fileData.slice(0), filename, true);

  onProgress?.(20);

  // Render the full song to WAV (ArrayBuffer containing complete WAV file)
  const wavBuffer = await engine.renderFull(subsong);

  onProgress?.(90);

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });

  onProgress?.(100);
  return blob;
}

// ==========================================================================
// LIVE CAPTURE EXPORT — the canonical "what you hear" export path
// ==========================================================================

/**
 * Encode an AudioBuffer to a FLAC Blob (lossless). Lazy-loads the encoder —
 * the FLAC payload never touches the main bundle.
 */
export async function audioBufferToFlac(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): Promise<Blob> {
  const { encodeFlac } = await import('./audioEncoders');
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(buffer.numberOfChannels, 2); c++) {
    channels.push(buffer.getChannelData(c));
  }
  const bytes = await encodeFlac(channels, buffer.sampleRate, bitDepth);
  return new Blob([bytes as unknown as BlobPart], { type: 'audio/flac' });
}

/**
 * Encode an AudioBuffer to an OGG Vorbis Blob. Lazy-loads the encoder.
 * `quality` is Vorbis VBR -1..10 (q3/q5/q7 ≈ 112/160/224 kbps); default 5.
 */
export async function audioBufferToOgg(buffer: AudioBuffer, quality = 5): Promise<Blob> {
  const { encodeOgg } = await import('./audioEncoders');
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(buffer.numberOfChannels, 2); c++) {
    channels.push(buffer.getChannelData(c));
  }
  const bytes = await encodeOgg(channels, buffer.sampleRate, quality);
  return new Blob([bytes as unknown as BlobPart], { type: 'audio/ogg' });
}

export type AudioFormat = 'wav' | 'mp3' | 'flac' | 'ogg';

/** The one encoder switch: every caller turns a captured buffer into a file through it. */
export async function encodeAudioBuffer(buffer: AudioBuffer, format: AudioFormat, kbps = 192): Promise<Blob> {
  switch (format) {
    case 'mp3': return audioBufferToMp3(buffer, kbps);
    case 'flac': return audioBufferToFlac(buffer);
    case 'ogg': return audioBufferToOgg(buffer);
    default: return audioBufferToWav(buffer);
  }
}

/**
 * Length of the full song in seconds (+2 s tail): libopenmpt-backed songs ask
 * the engine, everything else sums the pattern rows at the transport's tempo.
 */
export async function estimateSongSeconds(): Promise<number> {
  const { useTransportStore } = await import('@/stores/useTransportStore');
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { useFormatStore } = await import('@/stores/useFormatStore');
  if (useFormatStore.getState().libopenmptFileData) {
    try {
      const { LibopenmptEngine } = await import('@/engine/libopenmpt/LibopenmptEngine');
      if (LibopenmptEngine.hasInstance()) {
        const sec = LibopenmptEngine.getInstance().getDurationSeconds();
        if (sec > 0) return sec + 2;
      }
    } catch { /* fall through to the row estimate */ }
  }
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
  return Math.max(5, totalRows * secPerRow + 2);
}

/**
 * Shared orchestration: estimate duration, start transport playback from
 * bar 1, real-time capture into an AudioBuffer. Caller picks the encoding.
 *
 * The captured buffer is trimmed of leading silence before return — the
 * replayer's async play() path means audio typically doesn't flow for
 * 50–300 ms after the tap connects, and we don't want that dead air in
 * exported files. See `trimLeadingSilence` for the threshold / cap.
 */
export async function captureLiveSong(options: {
  durationSec?: number;
  /** Upper bound on the (given or estimated) capture length. */
  maxDurationSec?: number;
  unmuteAll?: boolean;
  onProgress?: (progress: number) => void;
}): Promise<AudioBuffer> {
  const { onProgress, unmuteAll } = options;

  let durationSec = options.durationSec;
  if (!durationSec || durationSec <= 0) durationSec = await estimateSongSeconds();
  if (options.maxDurationSec && options.maxDurationSec > 0) durationSec = Math.min(durationSec, options.maxDurationSec);

  const { useTransportStore } = await import('@/stores/useTransportStore');
  const restore = startTransportForCapture(useTransportStore.getState, useTransportStore.getState);
  try {
    // Connect the capture tap FIRST (so nothing is missed), then AWAIT play()
    // so the engine is confirmed running before the window elapses. Extend
    // capture by 1 s so the leading-silence trim has headroom.
    const capturePromise = captureAudioLiveToBuffer(durationSec + 1, { onProgress, unmuteAll });
    await useTransportStore.getState().play();
    const buffer = await capturePromise;
    return trimLeadingSilence(buffer);
  } finally {
    restore();
  }
}

/** Minimal slice of the transport store that capture orchestration needs. */
export interface CaptureTransport {
  isLooping: boolean;
  stop(): void;
  play(): Promise<void> | void;
  setCurrentRow(row: number): void;
  setCurrentPattern(pattern: number): void;
  setIsLooping(looping: boolean): void;
}

/**
 * Prepare the transport for a full-song live capture and return a restore
 * function to call when the capture finishes.
 *
 * Playback MUST go through the TRANSPORT STORE — the same entry point the
 * play button and the (working) MCP export path use. It routes to whichever
 * engine actually plays this song (internal TrackerReplayer OR a native
 * engine: libopenmpt, UADE, Hively, ...). Calling TrackerReplayer.play()
 * directly silently no-ops for native-engine songs (resolves immediately,
 * isPlaying stays false, no audio) — every such export captured pure
 * silence. Regression 2026-07-22.
 */
export function startTransportForCapture(
  getState: () => CaptureTransport,
  getFreshState: () => CaptureTransport = getState,
): () => void {
  const transport = getState();
  try { transport.stop(); } catch { /* not playing */ }
  transport.setCurrentRow(0);
  transport.setCurrentPattern(0);
  const wasLooping = getFreshState().isLooping;
  transport.setIsLooping(false); // song mode: advance through all patterns
  return () => {
    try { getFreshState().stop(); } catch { /* ok */ }
    try { getFreshState().setIsLooping(wasLooping); } catch { /* ok */ }
  };
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

export function maybeDownload(blob: Blob, filename: string | undefined, ext: 'wav' | 'mp3' | 'flac' | 'ogg'): void {
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
  format: 'wav' | 'mp3' | 'flac' | 'ogg';
}

/**
 * Export every channel as its own file by running a live capture for each,
 * with only that channel unmuted. Correct for every format (tracker MODs,
 * UADE, Furnace, Hively, libopenmpt, SID, Tone.js synths) because it uses
 * the same `exportTap` tap as the main export — including master FX and
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
  maxDurationSec?: number;
  format?: 'wav' | 'mp3' | 'flac' | 'ogg';
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
        maxDurationSec: options.maxDurationSec,
        onProgress: (p) => options.onProgress?.(ch, numChannels, p),
      });
      const blob = await encodeAudioBuffer(buffer, format, kbps);
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

