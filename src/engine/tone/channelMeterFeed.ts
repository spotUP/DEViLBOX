/**
 * The two feeds a channel VU meter reads, kept apart.
 *
 * - Level feed (updateRealtimeChannelLevels): the continuous per-channel level
 *   an engine reports every frame. Live mode follows it.
 * - Note feed (triggerChannelMeter): one event per note start. Trigger mode
 *   flashes on it and decays on its own.
 *
 * Engines that report only levels used to push them through the note feed
 * every frame, so trigger mode behaved as live. ChannelMeterFeed splits one
 * per-frame level array into both feeds: levels always go to the level feed,
 * and a note start is reported only on the frame a channel's level jumps.
 * A silent channel reports neither, so it stays dark.
 */

/** Per-frame rise in a channel level that counts as a note starting. */
export const VU_ONSET_RISE = 0.1;

export interface ChannelMeterSink {
  updateRealtimeChannelLevels(levels: number[]): void;
  triggerChannelMeter(channelIndex: number, velocity: number): void;
}

/**
 * The app's channel meters - ToneEngine registers itself when it is created.
 *
 * Format engines report levels through report(), which reads this, instead of
 * importing ToneEngine for it: that import put every format engine in the
 * static import cycle ToneEngine -> InstrumentFactory -> the synths -> the
 * engines -> ToneEngine, where a racing module load meets half-initialised
 * engine classes. See src/lib/song/__tests__/songPersistenceImportCycle.test.ts.
 */
let registeredSink: ChannelMeterSink | null = null;

/** Called once by ToneEngine's constructor (null unregisters, for tests). */
export function registerChannelMeterSink(sink: ChannelMeterSink | null): void { registeredSink = sink; }

/** True on the frame a level jumps far enough to be a note starting. */
export function isLevelOnset(level: number, prevLevel: number): boolean {
  return level - prevLevel > VU_ONSET_RISE;
}

export class ChannelMeterFeed {
  private prev: number[] = [];
  private prevStarts: number[] = [];
  /** Channels whose counted note has not sounded yet (envelope delay / attack from silence). */
  private pending: boolean[] = [];
  /** Reports measured ahead of when they are heard, oldest first (reportAt). */
  private queue: Array<{ at: number; levels: number[]; noteStarts: number[] | null }> = [];

  /**
   * report() for levels an engine measures before they are heard: a worklet
   * renders ahead of the output by its lead and the output latency, and fed
   * on arrival the meters ran that far ahead of the sound (2026-10-23, a
   * hybrid song's 32 ms lead made it visible). The report is held until
   * `now` reaches `at`, both on the audio clock. Of the reports due, only the
   * newest is fed: levels are a snapshot and note-start counts are
   * cumulative, so a skipped report loses no note.
   */
  reportAt(levels: ArrayLike<number>, noteStarts: ArrayLike<number> | null, at: number, now: number): void {
    this.queue.push({ at, levels: Array.from(levels), noteStarts: noteStarts ? Array.from(noteStarts) : null });
    let due = -1;
    while (due + 1 < this.queue.length && this.queue[due + 1].at <= now) due++;
    if (due < 0) return;
    const entry = this.queue[due];
    this.queue.splice(0, due + 1);
    this.report(entry.levels, entry.noteStarts);
  }

  /** Drop held reports: a stop or a new song must not feed the old song's levels. */
  clearHeld(): void { this.queue.length = 0; }

  /**
   * One engine level report to the app's meters: counted when the engine
   * reports note starts, by level jump otherwise. No meters yet (ToneEngine
   * not created) - nothing to show, so nothing is fed.
   */
  report(levels: ArrayLike<number>, noteStarts?: ArrayLike<number> | null): void {
    const sink = registeredSink;
    if (!sink) return;
    if (noteStarts) this.feedCounted(sink, levels, noteStarts);
    else this.feed(sink, levels);
  }

  /** Split one frame of per-channel levels into the level feed and the note feed. */
  feed(sink: ChannelMeterSink, levels: ArrayLike<number>): void {
    const arr: number[] = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i] || 0;
      arr.push(level);
      if (isLevelOnset(level, this.prev[i] || 0)) sink.triggerChannelMeter(i, level);
      this.prev[i] = level;
    }
    sink.updateRealtimeChannelLevels(arr);
  }

  /**
   * Like feed(), for engines that count note starts themselves (UADE reads
   * them off Paula): `noteStarts[i]` is channel i's cumulative note-start
   * count. A rise in it is a note, whatever the level did - a note retriggered
   * at the same volume, or one shorter than the report interval, moves no
   * level. A channel at level 0 stays dark until it sounds. Counts restart at 0 on a song load.
   */
  feedCounted(sink: ChannelMeterSink, levels: ArrayLike<number>, noteStarts: ArrayLike<number>): void {
    const arr: number[] = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i] || 0;
      arr.push(level);
      const count = noteStarts[i] || 0;
      // A count below the last one is a new song: its starts count from zero again.
      const before = count < (this.prevStarts[i] || 0) ? 0 : (this.prevStarts[i] || 0);
      if (count > before) this.pending[i] = true;
      // A note whose level is still 0 (an init delay, an attack from silence)
      // flashes at the first report where it sounds, not never.
      if (this.pending[i] && level > 0) { sink.triggerChannelMeter(i, level); this.pending[i] = false; }
      this.prevStarts[i] = count;
    }
    sink.updateRealtimeChannelLevels(arr);
  }
}
