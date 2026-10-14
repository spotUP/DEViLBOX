/** Messages between the row-preview client (main thread) and the host (worker). */
import type { RowResult } from './rowClip';
import type { RowTarget } from './rowTarget';

export interface RowPreviewRequest {
  /** WASM_ENGINES key of the engine that plays the song. */
  engineKey: string;
  /** The module bytes and load arguments playback would load (engineLoadArgs): compared byte for byte (D8). */
  data: Uint8Array;
  args: unknown[];
  sampleRate: number;
  target: RowTarget;
  /** Voices audible (bit N set = voice N), isolation already removed. */
  mask: number;
}

export type RowPreviewIn =
  | { type: 'request'; id: number; req: RowPreviewRequest }
  | { type: 'prepare'; id: number; req: RowPreviewRequest };

export type RowPreviewOut =
  | { type: 'result'; id: number; result: RowResult | { kind: 'skipped' } }
  | { type: 'error'; id: number; message: string };
