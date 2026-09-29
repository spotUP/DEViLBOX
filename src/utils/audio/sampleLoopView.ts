/**
 * The sample editor's view of a sample's loop, read from and written to the
 * instrument's `sample` - the one place loop state lives.
 *
 * The engine plays `sample.loop` / `loopStart` / `loopEnd` (frames at
 * `sample.sampleRate`, the rate the ORIGINAL sample plays at its natural
 * pitch - 8363 Hz for a MOD sample, whatever its decoded buffer runs at).
 * The editor works in 0-1 positions over the decoded buffer. These two
 * functions convert between them; nothing else keeps a copy.
 *
 * The editor used to keep its own copy in `parameters` (loop off by default)
 * and copy it over `sample` on mount, so opening an imported chip sample in
 * the editor switched its loop off and set its rate to the decoded buffer's:
 * held notes played a one-shot 20 ms blip - a click.
 */
import type { SampleConfig } from '@typedefs/instrument';

export type LoopType = 'off' | 'forward' | 'pingpong';

export interface SampleLoopView {
  loopEnabled: boolean;
  /** 0-1 over the sample's length */
  loopStart: number;
  /** 0-1 over the sample's length */
  loopEnd: number;
  loopType: LoopType;
}

export const LOOP_VIEW_KEYS: ReadonlyArray<keyof SampleLoopView> = ['loopEnabled', 'loopStart', 'loopEnd', 'loopType'];

type LoopFields = Pick<SampleConfig, 'loop' | 'loopStart' | 'loopEnd' | 'loopType' | 'sampleRate'>;

/** The sample's length in its own frames (at `sample.sampleRate`). */
function sampleFrames(sample: Partial<LoopFields> | undefined, bufferDuration: number, bufferRate: number): number {
  return Math.round(bufferDuration * (sample?.sampleRate || bufferRate));
}

/** The loop as the editor shows it. Without a decoded buffer the positions are the whole sample. */
export function sampleLoopToView(sample: Partial<LoopFields> | undefined, bufferDuration: number | undefined, bufferRate: number | undefined): SampleLoopView {
  const loopEnabled = sample?.loop === true;
  const loopType: LoopType = sample?.loopType && sample.loopType !== 'off' ? sample.loopType : 'forward';
  const total = bufferDuration && bufferRate ? sampleFrames(sample, bufferDuration, bufferRate) : 0;
  const start = sample?.loopStart ?? 0;
  const end = sample?.loopEnd ?? 0;
  if (total <= 0) return { loopEnabled, loopStart: 0, loopEnd: 1, loopType };
  // loopEnd <= loopStart means "to the end" to the engine; show it that way.
  const loopStart = Math.max(0, Math.min(1, start / total));
  const loopEnd = end > start ? Math.max(loopStart, Math.min(1, end / total)) : 1;
  return { loopEnabled, loopStart, loopEnd, loopType };
}

/**
 * The `sample` fields an editor loop change writes, or null when the change
 * has no loop keys. Positions become frames at the sample's own rate; the
 * rate is written only when the sample has none (the engine would otherwise
 * read the frames at its 8363 Hz default).
 */
export function viewLoopToSample(
  change: Partial<SampleLoopView>,
  sample: Partial<LoopFields> | undefined,
  bufferDuration: number,
  bufferRate: number,
): Partial<LoopFields> | null {
  const out: Partial<LoopFields> = {};
  if (change.loopEnabled !== undefined) out.loop = change.loopEnabled;
  if (change.loopType !== undefined) out.loopType = change.loopType;
  if (change.loopStart !== undefined || change.loopEnd !== undefined) {
    const total = sampleFrames(sample, bufferDuration, bufferRate);
    if (total > 0) {
      if (change.loopStart !== undefined) out.loopStart = Math.round(Math.max(0, Math.min(1, change.loopStart)) * total);
      if (change.loopEnd !== undefined) out.loopEnd = Math.round(Math.max(0, Math.min(1, change.loopEnd)) * total);
      if (!sample?.sampleRate) out.sampleRate = bufferRate;
    }
  }
  return Object.keys(out).length ? out : null;
}
