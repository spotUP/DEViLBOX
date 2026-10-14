/**
 * The row clip: what the row preview renders and an engine's worklet plays back (public/worklets/row-clip.js).
 *
 * A clip is the output of one engine for one grid row, in the shapes the engine's own render produces, so playing it
 * goes through the same output code as playback (main mix, per-voice buffers for scopes / isolation / dub sends, pans).
 */

/** Seconds of linear fade-out on a clip's last frames (D3), so a clip that ends mid-waveform does not click. */
export const ROW_CLIP_FADE_SECONDS = 0.005;
/** A row longer than this is cut here (D7). */
export const ROW_CLIP_MAX_SECONDS = 10;
/** Frames the render advances per chunk: one audio render quantum. */
export const ROW_CHUNK_FRAMES = 128;

export const rowClipFadeFrames = (sampleRate: number): number => Math.round(ROW_CLIP_FADE_SECONDS * sampleRate);
export const rowClipMaxFrames = (sampleRate: number): number => Math.round(ROW_CLIP_MAX_SECONDS * sampleRate);

/** Bits of a render's `flags`: the song looped / ended inside the chunk. */
export const CHUNK_LOOPED = 1;
export const CHUNK_ENDED = 2;

/** Where the player stands: the same fields nuade's snapshot (and every position post) carries. */
export interface PlayerPosition { order: number; pattern: number; row: number; tick: number; speed: number }

/** One render call's output. */
export interface RowChunk {
  frames: number;
  /** Interleaved stereo, `frames * 2`. */
  stereo: Float32Array;
  /** One mono buffer per voice (`frames` each), or null for an engine with no per-voice output. */
  voices: Float32Array[] | null;
  /** Each voice's pan in the mix, -1 left .. 1 right, at the end of the chunk. */
  pans: Float32Array | null;
  flags: number;
}

export interface RowClip {
  sampleRate: number;
  frames: number;
  /** The song frame the row starts at (for tests and tooling; playback does not use it). */
  startFrame: number;
  stereo: Float32Array;
  voices: Float32Array[] | null;
  /** The pans in force from clip frame `at` on; the first step is at 0. Empty when the engine has none. */
  panSteps: { at: number; pans: Float32Array }[];
  /** The last `fadeFrames` frames fade linearly to silence when played (row-clip.js does it, once). */
  fadeFrames: number;
}

export type RowMissReason = 'ended' | 'looped' | 'limit';

/** What a row request answers. */
export type RowResult =
  | { kind: 'clip'; clip: RowClip }
  /** The song never reaches that row (it loops or ends first): nothing to play. */
  | { kind: 'missed'; reason: RowMissReason }
  /** A newer request replaced this one. */
  | { kind: 'cancelled' };

/** A copy the caller may transfer: the stream keeps its own clip for repeat presses and prefetch. */
export function cloneClip(c: RowClip): RowClip {
  return {
    ...c,
    stereo: c.stereo.slice(),
    voices: c.voices ? c.voices.map((v) => v.slice()) : null,
    panSteps: c.panSteps.map((p) => ({ at: p.at, pans: p.pans.slice() })),
  };
}

export function clipTransferables(c: RowClip): Transferable[] {
  return [c.stereo.buffer, ...(c.voices ?? []).map((v) => v.buffer), ...c.panSteps.map((p) => p.pans.buffer)];
}
