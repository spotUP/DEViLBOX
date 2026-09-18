/**
 * Intent versus reality for a channel's dub send.
 *
 * Opening a channel's dub send is asynchronous — resolve the isolation engine,
 * reach its worklet, allocate a secondary module instance, register the tap —
 * and a dub throw is short. So "open, then close 250 ms later" routinely
 * arrives while the open is still in flight.
 *
 * The bug this exists to prevent, observed live on 2026-09-18: the close read
 * a single `active` flag that activation only sets at the END of its work, saw
 * `false`, concluded there was nothing to tear down, and dropped itself. The
 * activation then completed into a slot nobody would ever close — a whole
 * duplicate libopenmpt instance and its buffers, leaked for the life of the
 * page, once per throw on a cold channel. Evidence: `registeredChannelTaps`
 * climbing 0 → 4 across one session and never falling, with every AutoDub fire
 * correctly released.
 *
 * Two flags cannot describe three situations, so this keeps three: what the
 * caller WANTS, what the engine has actually DONE, and whether a transition is
 * in flight. A request that lands mid-flight is recorded rather than acted on,
 * and whoever finishes last reconciles.
 *
 * Pure bookkeeping — it performs no audio work and returns what the caller
 * should do, so the ordering can be tested without an AudioContext.
 */

export type DubChannelAction = 'activate' | 'deactivate' | 'none';

export class DubChannelLifecycle {
  private desired = new Set<number>();
  private active = new Set<number>();
  private inFlight = new Set<number>();

  /**
   * Record what the channel should be, and say what to dispatch now.
   *
   * Returns 'none' while a transition is in flight: starting a second one
   * alongside the first is how a channel ends up half-activated. The running
   * transition picks the intent up through `finish`.
   */
  setDesired(channelId: number, want: boolean): DubChannelAction {
    if (want) this.desired.add(channelId);
    else this.desired.delete(channelId);
    return this.next(channelId);
  }

  /** True while the channel's send should be open. Async steps poll this. */
  isDesired(channelId: number): boolean {
    return this.desired.has(channelId);
  }

  isActive(channelId: number): boolean {
    return this.active.has(channelId);
  }

  isInFlight(channelId: number): boolean {
    return this.inFlight.has(channelId);
  }

  /** A transition is starting. Further requests are recorded, not dispatched. */
  begin(channelId: number): void {
    this.inFlight.add(channelId);
  }

  /**
   * A transition finished, leaving the channel `active` or not — say what to
   * do about any intent that changed while it ran.
   */
  finish(channelId: number, active: boolean): DubChannelAction {
    this.inFlight.delete(channelId);
    if (active) this.active.add(channelId);
    else this.active.delete(channelId);
    return this.next(channelId);
  }

  /**
   * Forget a channel entirely — the wiring underneath it is gone.
   *
   * Not the same as setting it undesired: there is nothing left to deactivate,
   * so this must never hand back an action.
   */
  forget(channelId: number): void {
    this.desired.delete(channelId);
    this.active.delete(channelId);
    this.inFlight.delete(channelId);
  }

  clear(): void {
    this.desired.clear();
    this.active.clear();
    this.inFlight.clear();
  }

  /** Channels the caller believes are wired up, for teardown sweeps. */
  activeChannels(): number[] {
    return [...this.active];
  }

  private next(channelId: number): DubChannelAction {
    if (this.inFlight.has(channelId)) return 'none';
    const want = this.desired.has(channelId);
    if (want === this.active.has(channelId)) return 'none';
    return want ? 'activate' : 'deactivate';
  }
}
