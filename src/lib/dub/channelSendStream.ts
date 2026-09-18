/**
 * The stream of dub-send fader writes.
 *
 * X5, reported 2026-09-17: discrete moves record fine, a continuous fader ride
 * captures nothing. Riding the send IS a dub gesture — arguably the primary
 * one, ahead of any named move — so a recorder that misses it records half a
 * performance, and the replay-reproduces check (M1) can only ever agree with
 * the half that was captured.
 *
 * The cause was that there was nothing to subscribe to. `DubRecorder` listens
 * to the router's fire and release streams; `setChannelDubSend` wrote audio
 * and zustand state and stopped there, so no listener could exist. This is the
 * missing stream, shaped like the router's two so the recorder gains a third
 * subscription rather than a second recording mechanism.
 *
 * Deliberately tiny and dependency-free: the mixer store publishes to it, and
 * a store that had to import the recorder to record would be a cycle.
 */

export interface ChannelSendWrite {
  channelId: number;
  /** The fader position, 0..1, before any curve mapping. */
  value: number;
  /** Row it was written on, from the same clock the router uses. */
  row: number;
  /**
   * 'live' = a hand on the fader. 'lane' = automation replaying one.
   *
   * The recorder ignores 'lane', for the same reason it ignores lane fires:
   * re-capturing what playback just played turns one take into an endless
   * accumulation of itself.
   */
  source: 'live' | 'lane';
}

type Listener = (write: ChannelSendWrite) => void;

const listeners = new Set<Listener>();

export function subscribeChannelSend(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function publishChannelSend(write: ChannelSendWrite): void {
  if (listeners.size === 0) return;
  for (const fn of listeners) {
    try {
      fn(write);
    } catch (err) {
      // One bad listener must not stop the others, and must never break a
      // fader move — the audio already happened by the time this runs.
      console.error('[channelSendStream] listener threw:', err);
    }
  }
}

/** Test seam. Never call from app code. */
export function resetChannelSendListeners(): void {
  listeners.clear();
}
