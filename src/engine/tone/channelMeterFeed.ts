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

/** True on the frame a level jumps far enough to be a note starting. */
export function isLevelOnset(level: number, prevLevel: number): boolean {
  return level - prevLevel > VU_ONSET_RISE;
}

export class ChannelMeterFeed {
  private prev: number[] = [];

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
}
