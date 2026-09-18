/**
 * Per-channel dub-send baselines — the fader value a transient move must
 * return a channel tap to.
 *
 * A tap's GainNode carries two things at once: the user's fader (its resting
 * value) and whatever transient a move is applying on top (a throw opens it to
 * 1.0, a solo zeroes the others). Reading `gain.value` to learn the fader is
 * therefore wrong whenever another transient is in flight — and moves DO
 * overlap: AutoDub interleaves throws with solo moves, and a second throw can
 * land inside the first one's 80 ms release ramp.
 *
 * Sampling the node then "restores" the raised value, and the tap ratchets
 * toward 1.0 across a session. At full send the channel feeds the echo
 * continuously and a throw has nothing left to do — the bass just stays.
 * Reported 2026-09-18 as "one of the bass effects is stuck firing"; the fire
 * log had the tap at 0.149 before the throw (fader was 0.106) and at 1.0 after
 * its release.
 *
 * The whole-mix path already keeps a stored `baseline` per tap for exactly this
 * reason (035b392cb). This is the same idea for per-channel taps.
 */
export class ChannelTapBaselines {
  private readonly values = new Map<number, number>();

  /** Record the fader value for a channel (already curve-mapped to gain). */
  set(channelId: number, gain: number): void {
    this.values.set(channelId, Math.max(0, Math.min(1, gain)));
  }

  get(channelId: number): number | undefined {
    return this.values.get(channelId);
  }

  delete(channelId: number): void {
    this.values.delete(channelId);
  }

  clear(): void {
    this.values.clear();
  }

  /**
   * The value a transient should restore to. The stored fader wins; the
   * sampled node value is only a fallback for taps registered before any fader
   * write reached us.
   */
  resolve(channelId: number, sampledNodeValue: number): number {
    return this.values.get(channelId) ?? sampledNodeValue;
  }
}
