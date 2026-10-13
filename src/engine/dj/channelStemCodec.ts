/**
 * The cached form of a channel stem: lossless FLAC, mono since render
 * version 5 (channelScopeTrack monoStem: one channel and a pan; 16 stems fit a
 * deck's 32-channel buffer). The measurements below chose stereo FLAC for the
 * stereo stems that version 4 cached.
 *
 * Measured 2026-10-12 (plan 2026-10-12-dj-rendered-deck-channel-mute.md):
 * UADE and libopenmpt stems have L == R exactly and Hively 16-channel stems pan
 * per channel over time (L/R residual -7 dB), AHX pans are constant only to
 * -75 dB. FLAC's stereo decorrelation already stores an L == R stem at the size
 * of a mono one, so one stereo FLAC per channel is exact for every engine and
 * as small as mono-plus-pan wherever mono-plus-pan would be exact.
 *
 * Encoding is the app's FLAC encoder (lib/export/audioEncoders, the one the
 * exports use), in the render worker. Decoding happens on deck load through
 * the wasm FLAC decoder, in its own Web Worker where one exists.
 */

import { encodeFlac } from '@/lib/export/audioEncoders';

/**
 * One stem (int16 encoded like the WAV: mono, or interleaved stereo with
 * channels = 2) as FLAC. The encoder rounds float x 0x7FFF, so x = v / 0x7FFF
 * gives back v exactly (-32768 alone lands on -32767). A silent stem stays empty.
 */
export async function encodeStemFlac(stem: Int16Array, sampleRate: number, channels: 1 | 2 = 1): Promise<Uint8Array> {
  if (stem.length === 0) return new Uint8Array(0);
  const n = Math.floor(stem.length / channels);
  const planes = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < channels; c++) planes[c][i] = stem[channels * i + c] / 0x7FFF;
  }
  return encodeFlac(planes, sampleRate, 16);
}

/** Node / jsdom (tests): no real Web Worker for the decoder. */
function isNodeOrJsdom(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string }; cwd?: unknown } }).process;
  if (proc && (typeof proc.versions?.node === 'string' || typeof proc.cwd === 'function')) return true;
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

interface FlacDecoded { channelData: Float32Array[]; samplesDecoded: number }
interface FlacDecoderLike { ready: Promise<void>; decodeFile(data: Uint8Array): Promise<FlacDecoded>; free(): void | Promise<void> }

/**
 * Decode FLAC stems to their float channels (v / 32767, the decoder's scale):
 * [mono] for a render-version-5 stem, [left, right] for an older one. Off the main thread when Web Workers exist; an empty stem decodes
 * to null (a channel that never sounds).
 */
export async function decodeStemsFlac(stems: Uint8Array[]): Promise<(Float32Array[] | null)[]> {
  const mod = await import('@wasm-audio-decoders/flac');
  const offThread = typeof Worker !== 'undefined' && !isNodeOrJsdom();
  const decoder = (offThread ? new mod.FLACDecoderWebWorker() : new mod.FLACDecoder()) as unknown as FlacDecoderLike;
  await decoder.ready;
  try {
    const out: (Float32Array[] | null)[] = [];
    for (const data of stems) {
      if (data.byteLength === 0) { out.push(null); continue; }
      const { channelData } = await decoder.decodeFile(data);
      // The decoder scales by 1 / 32767, the deck's WAV decode by 1 / 32768: the stem plays 0.0003 dB
      // hot, a mute residual of about -90 dB. Not rescaled here, so no per-sample pass runs on this thread.
      out.push(channelData);
    }
    return out;
  } finally {
    await decoder.free();
  }
}
