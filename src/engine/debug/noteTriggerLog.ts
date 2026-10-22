/**
 * Ring buffer of every note that starts a voice on a synth (ToneEngine.triggerNote and the other attack entry
 * points). Read by the get_note_trigger_log MCP tool to count triggers per row in real Chrome.
 *
 * Always on and cheap; the call-stack string is only captured while `window.__noteTriggerLogEnabled` is true
 * (the tool's `clear: true` switches it on).
 */
import { getDevilboxAudioContext } from '@utils/audio-context';

export const NOTE_TRIGGER_LOG_CAP = 512;

export interface NoteTriggerLogEntry {
  t: number;
  audioTime: number | null;
  /** Audio-clock time the caller asked the note to start at; null when the entry point takes none. */
  scheduledTime: number | null;
  source: string;
  instrumentId: number;
  note: string;
  channel: number | null;
  caller: string[];
}

const entries: NoteTriggerLogEntry[] = [];

function enabled(): boolean {
  return (globalThis as { __noteTriggerLogEnabled?: boolean }).__noteTriggerLogEnabled === true;
}

function appFrames(): string[] {
  const lines = (new Error().stack ?? '').split('\n').slice(1);
  return lines
    .filter((l) => !l.includes('node_modules') && !l.includes('noteTriggerLog'))
    .slice(0, 4)
    .map((l) => l.trim());
}

function audioNow(): number | null {
  try {
    return getDevilboxAudioContext().currentTime;
  } catch {
    return null;
  }
}

export function recordNoteTrigger(source: string, instrumentId: number, note: string, channel?: number, scheduledTime?: number): void {
  entries.push({
    t: performance.now(),
    audioTime: audioNow(),
    scheduledTime: scheduledTime ?? null,
    source,
    instrumentId,
    note,
    channel: channel ?? null,
    caller: enabled() ? appFrames() : [],
  });
  if (entries.length > NOTE_TRIGGER_LOG_CAP) entries.splice(0, entries.length - NOTE_TRIGGER_LOG_CAP);
}

export function getNoteTriggerLog(limit?: number): NoteTriggerLogEntry[] {
  return limit !== undefined && limit >= 0 ? entries.slice(-limit) : entries.slice();
}

/** Empties the buffer and turns stack capture on. */
export function clearNoteTriggerLog(): void {
  entries.length = 0;
  (globalThis as { __noteTriggerLogEnabled?: boolean }).__noteTriggerLogEnabled = true;
}
