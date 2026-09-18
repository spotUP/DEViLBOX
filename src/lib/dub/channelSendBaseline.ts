/**
 * Per-channel dub-send / mute baselines for the STORE path.
 *
 * `useMixerStore.channels[i].dubSend` and `.muted` each carry two meanings at
 * once: what the user set (the resting value) and what a dub move is applying
 * right now (a ghost send at 1.0, a cold-path throw activation, a build-up
 * ramp). A move that snapshots the live store value on fire and writes it back
 * on release therefore promotes another move's transient into the resting
 * value whenever moves overlap — and they always overlap, because AutoDub
 * interleaves per-channel throws with global moves.
 *
 * Reported 2026-09-18 as "auto dub pushed the master up to 100% and stayed
 * there": the Dub Deck master fader is `max(channel dubSend)`, so one pinned
 * channel reads as a pinned master. Measured live — channels 0, 1 and 3 sat at
 * `dubSend: 1` exactly while the same three were muted, which is
 * `ghostReverb`'s signature (mute dry + send to 1.0) left applied.
 *
 * This is the store-path twin of `ChannelTapBaselines` (the audio-node path,
 * fixed 2026-09-18 in `20771d1c5`), with one addition it needs and the node
 * path does not: store-level transients NEST — a global `ghostReverb` fires
 * over a per-channel throw that has already driven the store via the cold-path
 * activation callback. So transients are ref-counted and only the last one out
 * restores.
 *
 * Contract:
 *  - the baseline is captured once, when the FIRST transient opens;
 *  - a user write (fader, MIDI, MCP) updates the baseline even mid-hold, so a
 *    fader moved during a hold is honoured — same rule as `ChannelTapBaselines`;
 *  - a move never writes the baseline, because it writes transiently.
 */

export interface DubChannelState {
  dubSend: number;
  muted: boolean;
}

export class DubSendBaselines {
  private readonly values = new Map<number, DubChannelState>();
  private readonly depth = new Map<number, number>();

  /** Active transient count for a channel. */
  depthOf(channelId: number): number {
    return this.depth.get(channelId) ?? 0;
  }

  /**
   * Open a transient. Captures the current state as the baseline only when no
   * other transient is already in flight — otherwise the captured value would
   * be the other move's transient, which is the whole bug.
   */
  begin(channelId: number, current: DubChannelState): void {
    const d = this.depthOf(channelId);
    if (d === 0) {
      this.values.set(channelId, {
        dubSend: clamp01(current.dubSend),
        muted: current.muted,
      });
    }
    this.depth.set(channelId, d + 1);
  }

  /**
   * Close a transient. Returns the state to restore when this was the LAST
   * one, `null` while other transients are still holding the channel (they
   * restore when they close) or when nothing was open.
   */
  end(channelId: number): DubChannelState | null {
    const d = this.depthOf(channelId);
    if (d <= 0) return null;
    if (d > 1) {
      this.depth.set(channelId, d - 1);
      return null;
    }
    this.depth.delete(channelId);
    const baseline = this.values.get(channelId) ?? null;
    this.values.delete(channelId);
    return baseline;
  }

  /** A user-originated send write — updates the baseline even during a hold. */
  noteUserSend(channelId: number, dubSend: number): void {
    const prev = this.values.get(channelId);
    if (!prev) {
      if (this.depthOf(channelId) === 0) return; // nothing held; store is the truth
      this.values.set(channelId, { dubSend: clamp01(dubSend), muted: false });
      return;
    }
    prev.dubSend = clamp01(dubSend);
  }

  /** A user-originated mute write — updates the baseline even during a hold. */
  noteUserMute(channelId: number, muted: boolean): void {
    const prev = this.values.get(channelId);
    if (!prev) {
      if (this.depthOf(channelId) === 0) return;
      this.values.set(channelId, { dubSend: 0, muted });
      return;
    }
    prev.muted = muted;
  }

  peek(channelId: number): DubChannelState | undefined {
    return this.values.get(channelId);
  }

  clear(): void {
    this.values.clear();
    this.depth.clear();
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Process-wide registry — one mixer, one set of baselines. */
export const dubSendBaselines = new DubSendBaselines();
