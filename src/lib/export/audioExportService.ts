/**
 * The one audio export (plan 2026-10-07-one-load-save-export-path, U3a).
 *
 * Render strategy: LIVE CAPTURE of the engine's export tap, always. Reasons:
 *  - It is what the owner hears: every engine (native WASM, UADE, libopenmpt,
 *    Tone synths), every instrument / channel / master effect, mute and solo,
 *    stereo separation and the in-song tracker effects all sit on that graph.
 *  - The offline renders cannot be the canonical one: the Tone-offline render
 *    ignores everything except plain Tone synths (samplers render silence, no
 *    tracker effects, no mixer), and the UADE offline render bypasses the
 *    mixer and effects, so it never equals what the panel exports.
 *  - Stems are live-solo captures of the same tap, so a stem sums to the mix.
 * The raw module render (`raw: true`, UADE offline) stays as an explicit
 * option of the same entry point for "the module as shipped"; it is WAV only.
 *
 * Callers: the Export panel (AudioExportPanel) and MCP export_wav /
 * export_mp3 / export_stems. Both pass the same options and get the same
 * bytes for the same song.
 */
import {
  type AudioFormat,
  type StemResult,
  captureLiveSong,
  downloadLiveCaptureStems,
  encodeAudioBuffer,
  exportLiveCaptureStems,
  getUADEInstrument,
  maybeDownload,
  renderUADEToWav,
} from './audioExport';

export type { AudioFormat, StemResult };

export type AudioExportScope = 'song' | 'pattern' | 'stems';

export interface ExportAudioOptions {
  format?: AudioFormat;
  scope?: AudioExportScope;
  /** scope 'pattern': the pattern whose length sets the capture window (default: the selected one). */
  patternIndex?: number;
  /** Capture length; default is estimated from the song (pattern scope: the pattern's rows + 2 s tail). */
  durationSec?: number;
  /** Upper bound on the capture length. */
  maxDurationSec?: number;
  /** Unmute every channel for the capture, restored after (default true: a full mix). */
  unmuteAll?: boolean;
  /** MP3 bitrate (default 192). */
  kbps?: number;
  /** Render the module file offline through UADE instead of the live graph (WAV only; ignored when the song has no module file). */
  raw?: boolean;
  /** When set, the result is also saved as a download under this name (extension added). */
  filename?: string;
  onProgress?: (percent: number) => void;
  onStemProgress?: (stemIndex: number, totalStems: number, stemPercent: number) => void;
}

export interface ExportAudioResult {
  method: 'live-capture' | 'uade-raw' | 'live-solo-capture';
  scope: AudioExportScope;
  format: AudioFormat;
  mimeType: string;
  /** Song and pattern scope. */
  blob?: Blob;
  durationSec?: number;
  /** Stems scope. */
  stems?: StemResult[];
}

export const AUDIO_MIME: Record<AudioFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
};

interface RawSource { bytes: ArrayBuffer; filename: string; subsong: number }

/** The module file a raw render plays, from the UADE instrument or the stored original. */
async function rawSource(): Promise<RawSource | null> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const uadeInst = getUADEInstrument(useInstrumentStore.getState().instruments);
  if (uadeInst?.uade?.fileData) {
    return {
      bytes: uadeInst.uade.fileData,
      filename: uadeInst.uade.filename ?? 'module',
      subsong: uadeInst.uade.currentSubsong ?? 0,
    };
  }
  const { useFormatStore } = await import('@/stores/useFormatStore');
  const original = useFormatStore.getState().originalModuleData;
  if (original?.base64) {
    const bin = atob(original.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return {
      bytes: bytes.buffer,
      filename: original.sourceFile || `module.${original.format.toLowerCase()}`,
      subsong: 0,
    };
  }
  return null;
}

async function patternSeconds(patternIndex: number | undefined): Promise<number> {
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { useTransportStore } = await import('@/stores/useTransportStore');
  const tr = useTrackerStore.getState();
  const idx = patternIndex ?? tr.currentPatternIndex;
  const pattern = tr.patterns[idx];
  if (!pattern) throw new Error(`Pattern ${idx} not found`);
  const bpm = useTransportStore.getState().bpm || 125;
  return pattern.length * (60 / bpm) * 0.25 + 2;
}

export async function exportAudio(options: ExportAudioOptions = {}): Promise<ExportAudioResult> {
  const format = options.format ?? 'wav';
  const scope = options.scope ?? 'song';
  const kbps = options.kbps ?? 192;

  if (scope === 'stems') {
    const stemOptions = {
      durationSec: options.durationSec,
      maxDurationSec: options.maxDurationSec,
      format,
      kbps,
      onProgress: options.onStemProgress,
    };
    const stems = options.filename
      ? await downloadLiveCaptureStems(options.filename, stemOptions)
      : await exportLiveCaptureStems(stemOptions);
    return { method: 'live-solo-capture', scope, format, mimeType: AUDIO_MIME[format], stems };
  }

  // A song with no module file (a pure composition) has nothing to render raw:
  // the option is ignored and the live capture runs.
  const src = options.raw ? await rawSource() : null;
  if (src) {
    options.onProgress?.(0);
    const blob = await renderUADEToWav(src.bytes, src.filename, src.subsong, options.onProgress);
    maybeDownload(blob, options.filename, 'wav');
    return {
      method: 'uade-raw', scope, format: 'wav', mimeType: AUDIO_MIME.wav, blob,
      durationSec: +((blob.size - 44) / (44100 * 4)).toFixed(2),
    };
  }

  const durationSec = options.durationSec ?? (scope === 'pattern' ? await patternSeconds(options.patternIndex) : undefined);
  const buffer = await captureLiveSong({
    durationSec,
    maxDurationSec: options.maxDurationSec,
    unmuteAll: options.unmuteAll ?? true,
    onProgress: options.onProgress,
  });
  const blob = await encodeAudioBuffer(buffer, format, kbps);
  maybeDownload(blob, options.filename, format);
  return {
    method: 'live-capture', scope, format, mimeType: AUDIO_MIME[format], blob,
    durationSec: +(buffer.length / buffer.sampleRate).toFixed(2),
  };
}
