/**
 * "It says it is playing, and there is no sound."
 *
 * Reported 2026-09-19. The evidence at the time: transport playing, rows
 * advancing, every channel audible (`userMuteMask` all bits set — set means
 * AUDIBLE), `hasModule: true`, `paused: false`, and `lastRenderRms: 0` with
 * `silentReason: "module-rendered-silence"`. The module itself was producing no
 * samples. A stop/play cured it.
 *
 * Nobody was watching for that. The worklet has computed `silentReason` for a
 * while, and nothing reads it during playback — so the failure is invisible
 * until a person notices the room has gone quiet.
 *
 * Deliberately a REPORTER, not a repairer. Silence is a legitimate musical
 * state here: a version drop takes everything away for bars at a time, and a
 * watchdog that "fixed" that would fight the performer. It says what it sees
 * and leaves the decision to a human, which is the same line the bus audition
 * draws.
 *
 * Pure, so the awkward cases are testable without an AudioContext.
 */

export interface PlaybackSilenceInputs {
  /** What the transport believes. */
  isPlaying: boolean;
  /** Is the row counter still moving? A frozen transport is a different fault. */
  rowsAdvancing: boolean;
  /** Loudest recent render from the engine, 0 when it produced nothing. */
  lastRenderRms: number;
  /** The worklet's own account, when it has one. */
  silentReason: string | null;
  /** Seconds the engine has rendered silence while playing. */
  silentForSec: number;
  /** A user who muted everything is not a fault. */
  masterMuted: boolean;
}

export type SilenceVerdict =
  | { kind: 'ok' }
  /** Silent, but not for long enough to be anything but music. */
  | { kind: 'watching'; silentForSec: number }
  /** Silence the user asked for. */
  | { kind: 'expected'; reason: string }
  /** Playing, advancing, unmuted, and producing nothing. */
  | { kind: 'stalled'; reason: string; silentForSec: number };

/**
 * How long silence must persist before it stops being music.
 *
 * A dub drop can take the whole mix away for a few bars; at 125 BPM four bars
 * is about eight seconds. This has to sit clear of that or it cries wolf every
 * time the performer does its best trick.
 */
export const SILENCE_GRACE_SEC = 12;

export function judgePlaybackSilence(i: PlaybackSilenceInputs): SilenceVerdict {
  if (!i.isPlaying) return { kind: 'ok' };
  if (i.lastRenderRms > 0) return { kind: 'ok' };
  if (i.masterMuted) return { kind: 'expected', reason: 'the master is muted' };

  // A transport that has stopped advancing is a stuck transport, not a silent
  // engine — a different fault with a different fix, so do not claim this one.
  if (!i.rowsAdvancing) {
    return { kind: 'expected', reason: 'the transport is not advancing — paused or stalled elsewhere' };
  }

  if (i.silentForSec < SILENCE_GRACE_SEC) {
    return { kind: 'watching', silentForSec: i.silentForSec };
  }

  return {
    kind: 'stalled',
    reason: i.silentReason ?? 'the engine is rendering silence',
    silentForSec: i.silentForSec,
  };
}

/** What to tell a human, in their terms. */
export function describeSilenceVerdict(v: SilenceVerdict): string | null {
  if (v.kind !== 'stalled') return null;
  return `Playing for ${v.silentForSec.toFixed(0)}s with no audio — ${v.reason}. `
    + 'The transport is running and nothing is muted, so the engine is producing '
    + 'nothing. Stop and play again to re-seek it.';
}

/**
 * How long the engine has been silent, across sporadic observations.
 *
 * The reporting path is polled by hand rather than on a timer, so elapsed time
 * cannot be counted in ticks. This keeps the timestamp at which silence began
 * and subtracts, which gives a true duration however irregularly it is asked.
 *
 * The first observation that sees silence starts the clock, so silence that
 * began before anyone looked reads as zero and climbs from there. That
 * under-reports rather than over-reports, which is the right way round for
 * something that decides whether to call a fault.
 */
export class SilenceClock {
  private silentSinceMs: number | null = null;

  /** Returns seconds of continuous silence observed so far. */
  observe(nowMs: number, silentNow: boolean): number {
    if (!silentNow) {
      this.silentSinceMs = null;
      return 0;
    }
    if (this.silentSinceMs === null) {
      this.silentSinceMs = nowMs;
      return 0;
    }
    return Math.max(0, (nowMs - this.silentSinceMs) / 1000);
  }

  reset(): void {
    this.silentSinceMs = null;
  }
}
