/**
 * Gate M1 — the performance journal.
 *
 * The recorder already captures WHAT was played: cells in the pattern and
 * automation curves that replay the moves. What it cannot capture is WHY, and
 * without that a recorded performance is a list of button presses. "Echo throw
 * on channel 1 at row 44" and "answering the horn phrase that ended at row 40,
 * on the channel that made it" replay identically and mean different things —
 * and only the second can be read back, argued with, or learned from.
 *
 * The journal is additive in both directions:
 *
 *  - It sits BESIDE the lanes rather than inside them, so a project saved
 *    without one loads exactly as before, and a project saved WITH one loads
 *    in a build that has never heard of it (the field is simply ignored).
 *  - It never affects replay. The lanes are the source of truth for what
 *    happens; the journal only explains it. That way a journal that drifts
 *    from the lanes — an edited lane, a hand-written cell — degrades into
 *    stale commentary rather than a performance that plays back wrong.
 *
 * Pure: entries in, entries out.
 */

import type { Intention, IntentionTarget, MoveOrigin } from './performanceContext';

export interface JournalEntry {
  /** Matches the router's invocation id, so a lane event can be paired up. */
  invocationId: string;
  moveId: string;
  channelId?: number;
  /** Absolute row it fired on. */
  row: number;
  /** Song time in seconds, for time-mode songs. */
  timeSec: number;
  /** Row it released on, once it has. Pattern-relative, like `row`. */
  releasedRow?: number;
  /**
   * Song time at release.
   *
   * Held duration is computed from this rather than from the rows, because
   * `row` is PATTERN-relative: a move held across a pattern boundary released
   * at a lower row than it fired on, and the subtraction printed "held -39
   * rows". Time is monotonic and needs no pattern length to interpret.
   */
  releasedTimeSec?: number;
  origin: MoveOrigin;
  /** What the performer wanted. Absent for a move the user made by hand. */
  intention?: Intention;
  target?: IntentionTarget;
  /** Why, in words — the reason the planner recorded. */
  reason?: string;
  /** Where the performer was in its gesture when it fired. */
  state?: string;
  /** Bar and phrase position, so a journal reads musically rather than in rows. */
  bar?: number;
  barInPhrase?: number;
}

/** Version stamp, so a future format change can migrate rather than guess. */
export const JOURNAL_VERSION = 1;

export interface PerformanceJournal {
  version: number;
  entries: JournalEntry[];
}

export function emptyJournal(): PerformanceJournal {
  return { version: JOURNAL_VERSION, entries: [] };
}

/**
 * A journal the performer fills as it plays.
 *
 * Capped: a long session must not grow memory without bound, and the last few
 * hundred decisions are what anyone actually reads. The cap is generous enough
 * to cover a whole side.
 */
export class PerformanceJournalRecorder {
  private readonly entries: JournalEntry[] = [];
  private readonly cap: number;

  constructor(cap = 500) {
    this.cap = Math.max(1, cap);
  }

  record(entry: JournalEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.cap) this.entries.shift();
  }

  /** Stamp the release row onto the entry that fired it. */
  noteRelease(invocationId: string, row: number, timeSec?: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].invocationId === invocationId) {
        this.entries[i].releasedRow = row;
        if (timeSec !== undefined) this.entries[i].releasedTimeSec = timeSec;
        return;
      }
    }
  }

  snapshot(): PerformanceJournal {
    return { version: JOURNAL_VERSION, entries: this.entries.map(e => ({ ...e })) };
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }
}

/**
 * Read a journal off a loaded project.
 *
 * Anything unrecognisable becomes an empty journal rather than an error: a
 * journal is commentary, and commentary must never stop a song from loading.
 */
export function parseJournal(raw: unknown): PerformanceJournal {
  if (!raw || typeof raw !== 'object') return emptyJournal();
  const candidate = raw as Partial<PerformanceJournal>;
  if (!Array.isArray(candidate.entries)) return emptyJournal();
  const entries = candidate.entries.filter(isEntry).map(e => ({ ...e }));
  return { version: typeof candidate.version === 'number' ? candidate.version : JOURNAL_VERSION, entries };
}

function isEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<JournalEntry>;
  return typeof e.invocationId === 'string'
    && typeof e.moveId === 'string'
    && typeof e.row === 'number';
}

/**
 * Render a journal as readable lines.
 *
 * Bars rather than rows, and the reason in full: this is the artefact someone
 * reads after a take to decide whether the performer did something musical or
 * merely something.
 */
export function formatJournal(journal: PerformanceJournal, limit = 80): string {
  return journal.entries.slice(-limit).map(e => {
    const where = e.bar !== undefined ? `bar ${String(e.bar).padStart(3)}` : `row ${String(Math.round(e.row)).padStart(5)}`;
    const held = formatHeld(e);
    const who = e.origin === 'ai' ? 'AI ' : e.origin === 'lane' ? 'LANE' : 'YOU';
    const what = `${e.moveId}${e.channelId !== undefined ? ` ch${e.channelId}` : ''}`;
    const why = e.reason ? ` — ${e.reason}` : '';
    const intent = e.intention ? ` [${e.intention}]` : '';
    return `${where} ${who} ${what.padEnd(22)}${intent}${held}${why}`;
  }).join('\n');
}

/**
 * How long a move was held, in words.
 *
 * Seconds, from the release time, because `row` is PATTERN-relative: a hold
 * that crossed a pattern boundary released at a LOWER row than it fired on and
 * the row subtraction printed "held -39 rows" (observed live 2026-09-18 on a
 * skank throw fired at row 56 and released at row 17).
 *
 * Rows are still used when that is all an older journal has, and only when the
 * arithmetic is meaningful — a negative difference means the take wrapped, and
 * saying nothing is better than saying something false.
 */
function formatHeld(e: JournalEntry): string {
  if (e.releasedTimeSec !== undefined && e.releasedTimeSec >= e.timeSec) {
    return ` held ${(e.releasedTimeSec - e.timeSec).toFixed(1)}s`;
  }
  if (e.releasedRow !== undefined && e.releasedRow >= e.row) {
    return ` held ${(e.releasedRow - e.row).toFixed(0)} rows`;
  }
  if (e.releasedRow !== undefined) return ' released';
  return '';
}
