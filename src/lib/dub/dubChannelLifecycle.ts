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
   * Wanted, but the engine cannot give it a path right now (no isolation
   * engine, no worklet). Reconciling a parked channel straight back into
   * 'activate' is a retry loop with no delay: on 2026-09-28 every Hippel/TFMX
   * channel with a dub send spun one, each failure also scheduling a timer
   * that started another, until the main thread's task queue ran seconds
   * behind and the UI fell to 10 fps.
   */
  private parked = new Set<number>();

  /**
   * Record what the channel should be, and say what to dispatch now.
   *
   * Returns 'none' while a transition is in flight: starting a second one
   * alongside the first is how a channel ends up half-activated. The running
   * transition picks the intent up through `finish`.
   */
  setDesired(channelId: number, want: boolean): DubChannelAction {
    if (want) {
      // A send newly opened is a fresh request: try again even if parked.
      if (!this.desired.has(channelId)) this.parked.delete(channelId);
      this.desired.add(channelId);
    } else {
      this.desired.delete(channelId);
      this.parked.delete(channelId);
    }
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
   * A transition finished without a path to activate. The channel stays
   * wanted but is not retried until `unpark` or a new request.
   */
  park(channelId: number): void {
    this.inFlight.delete(channelId);
    this.active.delete(channelId);
    if (this.desired.has(channelId)) this.parked.add(channelId);
  }

  isParked(channelId: number): boolean {
    return this.parked.has(channelId);
  }

  /** Allow a parked channel another attempt; say what to dispatch now. */
  unpark(channelId: number): DubChannelAction {
    this.parked.delete(channelId);
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
    this.parked.delete(channelId);
  }

  clear(): void {
    this.desired.clear();
    this.active.clear();
    this.inFlight.clear();
    this.parked.clear();
  }

  /** Channels the caller believes are wired up, for teardown sweeps. */
  activeChannels(): number[] {
    return [...this.active];
  }

  private next(channelId: number): DubChannelAction {
    if (this.inFlight.has(channelId) || this.parked.has(channelId)) return 'none';
    const want = this.desired.has(channelId);
    if (want === this.active.has(channelId)) return 'none';
    return want ? 'activate' : 'deactivate';
  }
}
