/**
 * Act 1 status line (R2f, G13): the sentence for the step the act-1 clock is on, so the text never reads ahead of what is
 * drawn. Pure: the panel passes the schedule and the clock. Also the act's end time (G16 hat ticks, G20 finale).
 */
import { FAN_SECONDS, stageAtTime, type VoiceTimeline } from './pacing';
import { spoken, type FactoryState } from './factoryModel';

/** Seconds "Act 1 finished" stays on the status line before the latest event's caption takes over again. */
export const FINISHED_SECONDS = 2;

/** When the hat pool starts fanning out: the hat slot's last voice chip has popped. */
export function hatFanStart(lines: ReadonlyMap<string, VoiceTimeline>, state: FactoryState): number | undefined {
  const hat = state.slots.find((s) => s.hatVariants.length > 0);
  if (!hat) return undefined;
  return Math.max(0, ...hat.voices.map((v) => lines.get(v.voice)?.chipAt ?? 0));
}

/** The act-1 clock's end: the last chip has popped and every hat variant has fanned out. Undefined when act 1 has no voices. */
export function actOneEnd(lines: ReadonlyMap<string, VoiceTimeline>, state: FactoryState): number | undefined {
  if (lines.size === 0) return undefined;
  const chips = Math.max(...[...lines.values()].map((l) => l.chipAt));
  const fan = hatFanStart(lines, state);
  const hats = state.slots.find((s) => s.hatVariants.length > 0)?.hatVariants.length ?? 0;
  return Math.max(chips, fan === undefined ? 0 : fan + hats * FAN_SECONDS);
}

/** The status sentence at act-1 time `t`, or undefined when act 1 does not own the line (no voices, or its window is over). */
export function actOneStatus(lines: ReadonlyMap<string, VoiceTimeline>, state: FactoryState, t: number): string | undefined {
  const end = actOneEnd(lines, state);
  if (end === undefined || state.done) return undefined;
  if (t >= end) return t < end + FINISHED_SECONDS ? 'Act 1 finished. Click any chip to hear that sound.' : undefined;
  const fan = hatFanStart(lines, state);
  const hat = state.slots.find((s) => s.hatVariants.length > 0);
  if (fan !== undefined && hat && t >= fan) return `Hat slot fans out the ${hat.hatVariants.length} variants of the host hat pool`;
  const current = [...lines.values()].filter((l) => t >= l.start).sort((a, b) => b.start - a.start)[0];
  if (!current) return undefined;
  const view = state.slots.flatMap((s) => s.voices).find((v) => v.voice === current.voice);
  const shown = stageAtTime(current, t);
  if (shown.index < 0 || !view) return `Building ${spoken(current.voice)}`;
  const stage = view.stages[shown.index];
  return `Stage ${shown.index + 1} of ${current.stageAt.length}${stage ? `: ${spoken(stage.stage)}` : ''}`;
}
