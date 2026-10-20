/**
 * Act 1 pacing (R2f): the build runs at full speed, the show presents each finished voice in build order while its
 * real stage buffers grow during the voice's one-shot (protocol section 4, owner addition). Every number here is the
 * golden draft's. The schedule depends only on the voices before it, so appending a voice never moves an earlier one.
 */
import type { Peaks } from '@/engine/uprough/r2Peaks';

/** Seconds a voice spends being built on screen. */
export const BUILD_SECONDS = 0.52;
const FIRST_STAGE_AT = 0.12;
const STAGE_SPAN = 0.62;
const ONE_SHOT_AT = 0.3;
const STAMP_AFTER_LAST_STAGE = 0.13;
const CHIP_AFTER_STAMP = 0.26;
/** The next voice starts when the one-shot falls this far below its peak, or at the latest after this long. */
export const FALL_DB = 30;
export const MAX_WAIT_SECONDS = 0.7;
/** Seconds between two hat pool variants fanning out. */
export const FAN_SECONDS = 0.07;

export interface VoiceTimeline {
  voice: string;
  start: number;
  /** When stage j shows. A voice with no stages has none: its bank buffer is its only stage. */
  stageAt: number[];
  oneShotAt: number;
  stampAt: number;
  chipAt: number;
}

/** Seconds from the one-shot's start until its envelope has fallen FALL_DB below the peak (the whole length if never). */
export function fallSeconds(bank: Peaks, rate: number): number {
  const limit = 10 ** (-FALL_DB / 20) * 127;
  let last = 0;
  for (let i = 0; i < bank.n; i++) {
    if (Math.max(Math.abs(bank.min[i]!), Math.abs(bank.max[i]!)) >= limit) last = i + 1;
  }
  return (last / bank.n) * (bank.len / rate);
}

export interface PacingVoice { voice: string; stageCount: number; bank: Peaks }

/** The timeline of the voices in build order. */
export function actOneSchedule(voices: readonly PacingVoice[], rate: number): VoiceTimeline[] {
  const out: VoiceTimeline[] = [];
  let start = 0;
  for (const v of voices) {
    const n = Math.max(1, v.stageCount);
    const stageAt = Array.from({ length: n }, (_, j) => start + FIRST_STAGE_AT + (n === 1 ? 0 : (j / (n - 1)) * STAGE_SPAN * BUILD_SECONDS));
    const stampAt = stageAt[n - 1]! + STAMP_AFTER_LAST_STAGE;
    const oneShotAt = start + ONE_SHOT_AT * BUILD_SECONDS;
    out.push({ voice: v.voice, start, stageAt, oneShotAt, stampAt, chipAt: stampAt + CHIP_AFTER_STAMP });
    start = oneShotAt + Math.min(fallSeconds(v.bank, rate), MAX_WAIT_SECONDS);
  }
  return out;
}

/** The index of the stage showing at time t (-1 before the first), and the 0..1 progress to the next. */
export function stageAtTime(line: VoiceTimeline, t: number): { index: number; frac: number } {
  let index = -1;
  for (let j = 0; j < line.stageAt.length; j++) if (t >= line.stageAt[j]!) index = j;
  const next = line.stageAt[index + 1];
  const here = index < 0 ? line.start : line.stageAt[index]!;
  return { index, frac: next === undefined ? 1 : Math.min(1, Math.max(0, (t - here) / (next - here))) };
}
