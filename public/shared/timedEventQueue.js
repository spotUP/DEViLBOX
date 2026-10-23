/**
 * Note events that carry a future `time` (AudioContext seconds) wait here until their frame.
 * The replayer schedules rows ahead; a main-thread stall delivers them late and bunched, so a worklet
 * that keyed notes on arrival turns that into flams. Used by worklets that import it as a module.
 * Untimed, unusable (NaN, Infinity) or past events apply at once.
 */
/**
 * Seconds of slack when an event's time is compared with the render position. `start + done / rate`
 * rounds a hair below an event that falls exactly on a frame, which held the event one frame late.
 * Far below one frame (2e-5 s at 48 kHz), far above the rounding of an AudioContext time.
 */
const DUE_SLACK = 1e-7;

export class TimedEventQueue {
  constructor() { this.events = []; }

  /** Queue `msg` when its time is still ahead, otherwise return true: the caller applies it now. */
  push(msg, now) {
    if (!Number.isFinite(msg.time) || msg.time <= now) return true;
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].time > msg.time) i--;
    this.events.splice(i, 0, msg);
    return false;
  }

  /** Drop queued events at or after `time`: All Notes Off cancels rows already sent ahead. `match` limits it to some events (one channel). */
  cancelFrom(time, match) { this.events = this.events.filter((e) => e.time < time || (match && !match(e))); }

  /** Frames from the block start (at `now`) to the next queued event inside `frames`, or -1. */
  nextOffset(now, frames, rate) {
    if (this.events.length === 0) return -1;
    const off = Math.ceil((this.events[0].time - now - DUE_SLACK) * rate);
    return off < frames ? Math.max(0, off) : -1;
  }

  /** Pop the events due at `now` and hand each to `apply`. */
  drain(now, apply) {
    while (this.events.length > 0 && this.events[0].time <= now + DUE_SLACK) apply(this.events.shift());
  }
}
