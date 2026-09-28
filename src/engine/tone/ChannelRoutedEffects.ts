/**
 * ChannelRoutedEffects — Per-channel effect routing via multi-output worklet.
 *
 * Architecture: Any engine implementing IsolationCapableEngine can provide
 * per-channel isolation. The worklet has 37 outputs total:
 *   - output[0]            = main mix
 *   - output[1..4]         = isolation slots (shared pool, per-channel effects)
 *   - output[5..36]        = per-channel dub sends (32 slots, one per channel)
 *
 * Supported engines:
 *   - LibOpenMPT: secondary openmpt module instances in lockstep
 *   - FurnaceDispatch: mute-and-re-render per slot (same sequencer instance)
 *   - Hively: secondary player instances with channel gain isolation
 *   - UADE: internal Paula per-channel buffer splitting
 *
 *   worklet output[0] (main mix, isolated ch muted) → gainNode → synthBus → master
 *   worklet output[1] (ch1 only) → BitCrusher → masterEffectsInput
 *   worklet output[5+ch]  → channelDubGain[ch] → DubBus.inputNode
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { createEffect } from '../factories/EffectFactory';
import { dubSendToGain, storedDubSendGains } from '@/lib/dub/dubSendCurve';
import { getNativeAudioNode } from '@utils/audio-context';
import { applyEffectParametersDiff } from './EffectParameterEngine';
import { PerChannelDubFx } from '../dub/PerChannelDubFx';
import { DubChannelLifecycle, type DubChannelAction } from '@/lib/dub/dubChannelLifecycle';
import { getMixerStoreRefOrNull, getTrackerStoreRef } from '@stores/storeAccess';
import { useDubStore } from '@stores/useDubStore';
import { effectiveDubSend } from '@/lib/dub/sendAudibility';
import { connectAudio } from './connectAudio';
// Type-only: erased at build time, so it adds no edge to the module graph.
import type { MixerChannelState } from '@stores/useMixerStore';

/**
 * How long a channel's dub-send gain takes to reach its new value.
 *
 * Shared with the worklet routing below, which must not flip the isolation mask
 * until this ramp has landed — see `_deactivateDubChannelInner`.
 */
export const DUB_SEND_RAMP_SEC = 0.02;

/**
 * How long a send seeded from the store takes to open at boot.
 *
 * Far longer than a fader move's ramp, and deliberately so. The wiring is
 * built while the engines are still coming up, and whatever a worklet emits
 * on its first blocks — a module instance starting, a WASM effect booting —
 * lands on these sends. Seeding them as an instant step made that startup
 * transient audible ("i heard the warm up", 2026-09-23); a slow open fades it
 * in under the music instead. A hand on a fader still gets DUB_SEND_RAMP_SEC.
 */
export const DUB_SEND_SEED_RAMP_SEC = 0.6;

/** First worklet output index dedicated to per-channel dub sends. */
export const DUB_OUTPUT_BASE = 5;

/**
 * The enable/disable message every engine's worklet understands.
 *
 * The worklets disagree about the envelope: LibOpenMPT switches on `cmd`,
 * while Hively, UADE and Furnace switch on `type`. Sending both fields covers
 * all of them — but it was written out by hand at each call site, and one of
 * them was missing `type`.
 *
 * That call site is `rebuildDubConnections`, the path that runs when a song
 * loads or the bus is re-enabled with sends already up. On Hively the message
 * matched no case at all and was dropped in silence, while the code went on to
 * mark the channel active. Measured 2026-09-22 on jennipha.ahx with the bus on
 * and all four sends open: `dubChannelEnabled` false for every channel,
 * `dubPasses: 0`, and `bus.input` at 0.000005 while the main render sat at
 * 0.13. Everything that CAPTURES the bus — reverseEcho, backwardReverb,
 * delayTimeThrow — therefore captured silence, which is how it was reported.
 * Moving a fader by hand worked, because that goes through
 * `_activateDubChannel`, whose envelope was the complete one.
 *
 * One builder, so the two can never drift again.
 */
function dubChannelMessage(
  action: 'dubChannelEnable' | 'dubChannelDisable',
  channel: number,
): Record<string, unknown> {
  return { cmd: action, type: action, val: { channel }, channel };
}
/** Max tracker channels that can be dubbed simultaneously (per-engine). */
export const MAX_DUB_CHANNELS = 32;

/**
 * Interface for any WASM engine that supports per-channel isolation via
 * multi-output AudioWorkletNode. Engines implement this to participate in
 * the per-channel effects routing system.
 */
export interface IsolationCapableEngine {
  addIsolation(slotIndex: number, channelMask: number): void;
  removeIsolation(slotIndex: number): void;
  diagIsolation?(): void;
  getWorkletNode(): AudioWorkletNode | null;
  getAudioContext(): AudioContext | null;
  isAvailable(): boolean;
}

interface IsolationSlot {
  slotIndex: number;
  channels: number[];
  channelMask: number;
  effectConfigs: EffectConfig[];
  effectNodes: (Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void })[];
  /** Native GainNode connected between worklet output and effect chain */
  outputGain: GainNode;
}

/** How an activation attempt ended: wired, no path yet, carried by the whole-mix tap, or no longer wanted. */
type DubActivation = 'wired' | 'unavailable' | 'fallback' | 'cancelled';

export class ChannelRoutedEffectsManager {
  private slots: (IsolationSlot | null)[] = [null, null, null, null];
  private masterEffectsInput: Tone.Gain;

  /**
   * Sidechain tap system — allows sidechain compressors to tap per-channel audio
   * from WASM engines via the isolation system.
   *
   * sidechainConsumers: channelIndex → set of AudioNodes (sidechain inputs) to feed.
   *   Survives teardown/rebuild so taps are re-established automatically.
   * sidechainTaps: channelIndex → active isolation slot + outputGain for that channel.
   *   Torn down and rebuilt alongside per-channel effect slots.
   */
  private sidechainConsumers = new Map<number, Set<AudioNode>>();
  private sidechainTaps = new Map<number, { slotIndex: number; outputGain: GainNode }>();

  /**
   * Dub bus wiring — per-channel GainNode array. Each gain:
   *   worklet output[DUB_OUTPUT_BASE + ch] → channelDubGains[ch] → dubBusInput
   *
   * Gains exist for the lifetime of the manager once setupDubBusWiring runs.
   * The worklet→gain connection is established lazily on first non-zero
   * setChannelDubSend (so muted channels cost nothing in the worklet).
   * Survives engine rebuilds via rebuildDubConnections(), which re-posts
   * dubChannelEnable + re-connects worklet outputs to the pre-existing gains.
   */
  private dubBusInput: AudioNode | null = null;
  private channelDubGains: (GainNode | null)[] = new Array(MAX_DUB_CHANNELS).fill(null);
  /** DubBus dry spring input the per-channel FX chains feed; set with the wiring. */
  private drySpringBus: AudioNode | null = null;
  private perChannelFx: Map<number, import('../dub/PerChannelDubFx').PerChannelDubFx> = new Map();
  /** Target gain value each channel should ramp to. Persists across engine rebuilds. */
  private channelDubSendValues: number[] = new Array(MAX_DUB_CHANNELS).fill(0);
  /**
   * What each channel's dub send should be, what it actually is, and whether a
   * transition is in flight. See `dubChannelLifecycle.ts` for why all three are
   * needed — in short, a throw can close before its own activation has
   * finished, and a single "active" flag reads false on the way down and
   * leaks the slot.
   */
  private dubLifecycle = new DubChannelLifecycle();
  /**
   * Channels whose activation was deferred because no isolation engine was
   * available at setChannelDubSend time. rebuildDubConnections picks these up
   * once an engine becomes available, so a dub send set before the song
   * started still wires up on engine attach. Retries are idempotent —
   * successful activation removes the entry.
   */
  private channelDubPendingActivation: Set<number> = new Set();
  /** Channels whose one retry has run; cleared when the send is reopened. */
  private channelDubRetried: Set<number> = new Set();

  /** Stops following the BLEED switch; see `bleedsInto`. */
  private readonly unsubscribeBleed: () => void;

  constructor(masterEffectsInput: Tone.Gain) {
    this.masterEffectsInput = masterEffectsInput;
    this.unsubscribeBleed = useDubStore.subscribe((s, prev) => {
      if (s.ghostBus !== prev.ghostBus) this.reapplyClosedDubSends();
    });
  }

  /**
   * Whether BLEED floors this channel: on, and the channel is one of the
   * song's (the deck's rule — only the channels a song has bleed).
   */
  private bleedsInto(channelIndex: number): boolean {
    if (!useDubStore.getState().ghostBus) return false;
    try {
      const t = getTrackerStoreRef().getState() as {
        patterns?: { channels?: unknown[] }[]; currentPatternIndex?: number;
      };
      return channelIndex < (t.patterns?.[t.currentPatternIndex ?? 0]?.channels?.length ?? 0);
    } catch { return false; }
  }

  /** The send this channel's tap runs at: its fader, or the BLEED floor. */
  private effectiveDubSendOf(channelIndex: number): number {
    return effectiveDubSend(this.channelDubSendValues[channelIndex], this.bleedsInto(channelIndex));
  }

  /** BLEED toggled: every closed channel moves to or from the floor. */
  private reapplyClosedDubSends(): void {
    for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
      if (this.channelDubSendValues[ch] <= 0 && (this.channelDubGains[ch] || this.bleedsInto(ch))) this._applyDubSend(ch);
    }
  }

  // ── Sidechain tap API ─────────────────────────────────────────────

  /**
   * Register an AudioNode (sidechain input) as a consumer of isolated channel audio.
   * Allocates an isolation slot if one isn't already active for this channel.
   * Returns true if the tap is connected (or was already connected).
   */
  async addSidechainTap(channelIndex: number, scInputNode: AudioNode): Promise<boolean> {
    let consumers = this.sidechainConsumers.get(channelIndex);
    if (!consumers) {
      consumers = new Set();
      this.sidechainConsumers.set(channelIndex, consumers);
    }
    consumers.add(scInputNode);

    // If we already have an active tap for this channel, just connect the new consumer
    const existing = this.sidechainTaps.get(channelIndex);
    if (existing) {
      try { existing.outputGain.connect(scInputNode); } catch { /* */ }
      return true;
    }

    // Allocate a new isolation slot
    return this._allocateSidechainSlot(channelIndex);
  }

  /**
   * Unregister an AudioNode from a sidechain tap. Frees the isolation slot
   * when the last consumer for a channel is removed.
   */
  removeSidechainTap(channelIndex: number, scInputNode: AudioNode): void {
    const consumers = this.sidechainConsumers.get(channelIndex);
    if (!consumers) return;
    consumers.delete(scInputNode);

    // Disconnect this specific consumer
    const tap = this.sidechainTaps.get(channelIndex);
    if (tap) {
      try { tap.outputGain.disconnect(scInputNode); } catch { /* */ }
    }

    if (consumers.size === 0) {
      this.sidechainConsumers.delete(channelIndex);
      // No more consumers — free the isolation slot
      if (tap) {
        try { tap.outputGain.disconnect(); } catch { /* */ }
        this.sidechainTaps.delete(channelIndex);
        void getActiveIsolationEngine().then(e => {
          if (e) e.removeIsolation(tap.slotIndex);
        });
        console.log(`[ChannelRoutedEffects] Released sidechain tap: slot ${tap.slotIndex} (ch${channelIndex + 1})`);
      }
    }
  }

  /** Allocate an isolation slot for a sidechain tap, connect worklet output → consumers. */
  private async _allocateSidechainSlot(channelIndex: number, engine?: IsolationCapableEngine): Promise<boolean> {
    if (!engine) engine = (await getActiveIsolationEngine()) ?? undefined;
    if (!engine?.isAvailable()) return false;

    const workletNode = engine.getWorkletNode();
    const audioContext = engine.getAudioContext();
    if (!workletNode || !audioContext) return false;

    // Find a free slot (not used by effects or other sidechain taps)
    const usedSlots = new Set<number>();
    for (const slot of this.slots) { if (slot) usedSlots.add(slot.slotIndex); }
    for (const tap of this.sidechainTaps.values()) usedSlots.add(tap.slotIndex);

    let freeSlot = -1;
    for (let i = 0; i < 4; i++) {
      if (!usedSlots.has(i)) { freeSlot = i; break; }
    }
    if (freeSlot < 0) {
      console.warn('[ChannelRoutedEffects] No free isolation slots for sidechain tap ch' + (channelIndex + 1));
      return false;
    }

    const channelMask = 1 << channelIndex;
    engine.addIsolation(freeSlot, channelMask);

    const outputGain = audioContext.createGain();
    outputGain.gain.value = 1;

    try {
      workletNode.connect(outputGain, freeSlot + 1);
    } catch (e) {
      console.warn('[ChannelRoutedEffects] Sidechain tap connect failed:', e);
      engine.removeIsolation(freeSlot);
      return false;
    }

    // Connect to all registered consumers for this channel (sidechain inputs)
    const consumers = this.sidechainConsumers.get(channelIndex);
    if (consumers) {
      for (const node of consumers) {
        try { outputGain.connect(node); } catch { /* */ }
      }
    }

    // Route the isolated channel back into the mix AFTER the master effects chain.
    // Isolation removes the channel from worklet output[0] (main mix). We re-inject it
    // at blepInput (post-effects) so it bypasses the sidechain compressor — otherwise
    // the kick would duck itself (the compressor detects the kick AND ducks its own input).
    try {
      const { getPostEffectsInput } = await import('./MasterEffectsChain');
      const postFx = getPostEffectsInput();
      if (postFx) {
        const postFxNative = getNativeAudioNode(postFx);
        if (postFxNative) outputGain.connect(postFxNative);
      } else {
        // Fallback: route to masterEffectsInput (kick will be ducked, but at least audible)
        const masterIn = getNativeAudioNode(this.masterEffectsInput);
        if (masterIn) outputGain.connect(masterIn);
      }
    } catch {
      const masterIn = getNativeAudioNode(this.masterEffectsInput);
      if (masterIn) outputGain.connect(masterIn);
    }

    this.sidechainTaps.set(channelIndex, { slotIndex: freeSlot, outputGain });
    console.log(`[ChannelRoutedEffects] Sidechain tap: slot ${freeSlot} → ch${channelIndex + 1} (routed back to mix)`);
    return true;
  }

  // ── Per-channel dub bus wiring ──────────────────────────────────

  /**
   * Allocate 32 per-channel GainNodes and wire them into the DubBus input.
   * Called once by DubDeckStrip on mount, after ensureDrumPadEngine() has
   * constructed the DubBus. Idempotent — repeat calls with the same
   * dubBusInput are no-ops; a different dubBusInput tears down the old wiring
   * first.
   *
   * The GainNodes exist independently of any engine. setChannelDubSend uses
   * `dubBusInput.context` to stay in the correct audio graph.
   */
  setupDubBusWiring(dubBusInput: AudioNode, dubBus?: import('../dub/DubBus').DubBus): void {
    if (this.dubBusInput === dubBusInput) return;
    if (this.dubBusInput) this._teardownDubWiring();

    this.dubBusInput = dubBusInput;
    const ctx = dubBusInput.context as AudioContext;
    const drySpringBus = dubBus?.drySpringBusNode ?? null;

    // Seed the sends from the store, the same way the per-channel filter and
    // reverb settings below are seeded.
    //
    // These gains used to be created at 0 and written ONLY by a live
    // `setChannelDubSend`. Every path that rebuilds the wiring — a song load,
    // a bus recreate, a crash-recovery restore — therefore produced a graph
    // where the store held the sends, the worklet rendered its dub slots,
    // DubBus listed the channel taps, the deck drew the faders up, and the
    // gain between them was zero. Measured 2026-09-23 after a reload and
    // restore: `busInput` 0.00000 with four sends at 0.77-0.84 and
    // `activeDubSlots: 4`; re-writing the same values the store already held
    // took it to 0.04716. Every colour move was processing silence.
    let bleedChannels = 0;
    while (bleedChannels < MAX_DUB_CHANNELS && this.bleedsInto(bleedChannels)) bleedChannels++;
    const seeded = storedDubSendGains(
      (getMixerStoreRefOrNull()?.getState() as { channels?: MixerChannelState[] } | undefined)?.channels,
      MAX_DUB_CHANNELS,
      bleedChannels,
    );

    // Build only the channels that sound now; the rest are built when their
    // send first opens (_ensureDubChannel). All 32 used to be built up front
    // - 32 gains and 32 per-channel FX chains, about 200 nodes, processed
    // every quantum on a 7-channel song.
    this.drySpringBus = drySpringBus;
    const seedFrom = ctx.currentTime;
    for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
      const target = seeded[ch] ?? 0;
      if (target <= 0) continue;
      const g = this._ensureDubChannel(ch);
      if (!g) continue;
      // Open from silence, never as a step — see DUB_SEND_SEED_RAMP_SEC.
      try {
        g.gain.setValueAtTime(0, seedFrom);
        g.gain.linearRampToValueAtTime(target, seedFrom + DUB_SEND_SEED_RAMP_SEC);
      } catch { g.gain.value = target; }
      this.channelDubSendValues[ch] = Math.max(0, Math.min(1,
        (getMixerStoreRefOrNull()?.getState() as { channels?: MixerChannelState[] } | undefined)?.channels?.[ch]?.dubSend ?? 0));
    }
    console.log(`[ChannelRoutedEffects] Dub bus wiring ready (${this.perChannelFx.size || this.channelDubGains.filter(Boolean).length} of ${MAX_DUB_CHANNELS} per-channel chains built → dubBusInput)`);
  }

  /**
   * The channel's send gain, built on first need together with its FX chain
   * (seeded from the mixer store's per-channel settings). Null before the
   * dub wiring exists.
   */
  private _ensureDubChannel(ch: number): GainNode | null {
    const existing = this.channelDubGains[ch];
    if (existing) return existing;
    const busInput = this.dubBusInput;
    if (!busInput || ch < 0 || ch >= MAX_DUB_CHANNELS) return null;
    const ctx = busInput.context as AudioContext;
    const g = ctx.createGain();
    g.gain.value = 0;
    if (this.drySpringBus) {
      const fx = new PerChannelDubFx(ctx, busInput, this.drySpringBus);
      g.connect(fx.input);
      this.perChannelFx.set(ch, fx);
      // Re-apply any stored channel settings (survive song reload / bus recreate)
      try {
        const mixer = getMixerStoreRefOrNull();
        const chState = (mixer?.getState() as { channels?: MixerChannelState[] } | undefined)?.channels?.[ch];
        if (chState) {
          fx.setFilterMode(chState.dubFilterMode ?? 'off');
          fx.setFilterHz(chState.dubFilterHz ?? 200);
          fx.setReverbSend(chState.dubReverbSend ?? 0);
          fx.setSweepAmount(chState.dubSweepAmount ?? 0);
          fx.setSweepRate(chState.dubSweepRateHz ?? 0.8);
          fx.setSweepDepth(chState.dubSweepDepthMs ?? 8);
          fx.setSweepFeedback(chState.dubSweepFeedback ?? 0.5);
        }
      } catch { /* ok — store may not be ready on first init */ }
    } else {
      g.connect(busInput);
    }
    this.channelDubGains[ch] = g;
    return g;
  }

  /** Get the per-channel effect chain for a tracker channel. */
  getPerChannelFx(ch: number): import('../dub/PerChannelDubFx').PerChannelDubFx | null {
    return this.perChannelFx.get(ch) ?? null;
  }

  private _teardownDubWiring(): void {
    for (const fx of this.perChannelFx.values()) { try { fx.dispose(); } catch { /* ok */ } }
    this.perChannelFx.clear();
    for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
      const g = this.channelDubGains[ch];
      if (g) { try { g.disconnect(); } catch { /* ok */ } }
      this.channelDubGains[ch] = null;
    }
    this.dubLifecycle.clear();
    this.channelDubPendingActivation.clear();
    this.channelDubRetried.clear();
    this.dubBusInput = null;
    this.drySpringBus = null;
  }

  /**
   * Set the dub-send level for tracker channel `ch`. Lazy activation: on first
   * non-zero call, asks the active isolation engine to start rendering this
   * channel into output[DUB_OUTPUT_BASE + ch], connects that output to the
   * per-channel GainNode, and registers the gain with DubBus so
   * openChannelTap (echoThrow) can address it. On return to zero, asks the
   * worklet to stop rendering + disconnects.
   *
   * Graceful fallback: if setupDubBusWiring hasn't run yet, or no isolation
   * engine is active, the call warns and returns — the UI knob continues to
   * move but no audio flows. Re-hydrated via rebuildDubConnections() when an
   * engine becomes available or restarts.
   */
  setChannelDubSend(channelIndex: number, amount: number): void {
    if (channelIndex < 0 || channelIndex >= MAX_DUB_CHANNELS) return;
    this.channelDubSendValues[channelIndex] = Math.max(0, Math.min(1, amount));
    this._applyDubSend(channelIndex);
  }

  /** Put the channel's tap at its effective send: gain, baseline and worklet slot. */
  private _applyDubSend(channelIndex: number): void {
    const effective = this.effectiveDubSendOf(channelIndex);
    const curved = dubSendToGain(effective);

    // Tell the bus where the fader now rests. A throw or solo that releases
    // later restores to this, never to a sampled tap value — sampling picks
    // up other moves' transients and ratchets the tap toward 1.0.
    void import('../dub/DubBus')
      .then(({ getActiveDubBus }) => getActiveDubBus()?.setChannelTapBaseline(channelIndex, curved))
      .catch(() => { /* bus not built yet — registration carries the baseline */ });

    if (!this.dubBusInput) {
      console.warn('[ChannelRoutedEffects] setChannelDubSend: dub wiring not set up — caller should invoke setupDubBusWiring first');
      return;
    }
    // A closed send on a channel never built has nothing to close.
    const gain = effective > 0 ? this._ensureDubChannel(channelIndex) : this.channelDubGains[channelIndex];
    if (!gain) return;

    // Always ramp the gain value — works even before the engine is available.
    const ctx = this.dubBusInput.context as AudioContext;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(curved, now + DUB_SEND_RAMP_SEC);
    } catch (e) {
      console.warn('[ChannelRoutedEffects] setChannelDubSend ramp failed:', e);
    }

    // Lazy activation / deactivation of the worklet render path.
    //
    // Record the intent first and synchronously, so a transition already in
    // flight sees it when it lands. Then dispatch only when nothing is in
    // flight: the running transition reconciles against the recorded intent
    // itself when it finishes, and starting a second one alongside it is how
    // a channel ends up half-activated.
    const shouldBeActive = effective > 0;
    if (shouldBeActive && !this.dubLifecycle.isDesired(channelIndex)) this.channelDubRetried.delete(channelIndex);
    if (!shouldBeActive) {
      // A deferred activation is an intent too — cancel it, or the 500 ms
      // retry re-opens a send the user has already closed.
      this.channelDubPendingActivation.delete(channelIndex);
    }
    this._runDubAction(channelIndex, this.dubLifecycle.setDesired(channelIndex, shouldBeActive));
  }

  /**
   * Carry out whatever the lifecycle says is outstanding.
   *
   * Called after every intent change and at the end of every transition, so
   * a request that arrived mid-flight is honoured as soon as the path is
   * clear instead of being lost.
   */
  private _runDubAction(channelIndex: number, action: DubChannelAction): void {
    if (action === 'activate') void this._activateDubChannel(channelIndex);
    else if (action === 'deactivate') void this._deactivateDubChannel(channelIndex);
  }

  private async _activateDubChannel(channelIndex: number): Promise<void> {
    const gain = this.channelDubGains[channelIndex];
    if (!gain) return;
    this.dubLifecycle.begin(channelIndex);
    let outcome: DubActivation = 'cancelled';
    try {
      outcome = await this._activateDubChannelInner(channelIndex, gain);
    } finally {
      if (outcome === 'unavailable' || outcome === 'fallback') {
        // No path yet. Park rather than reconcile: reconciling a failed
        // activation answers 'activate' again at once, a retry loop per
        // channel (see DubChannelLifecycle.park). rebuildDubConnections
        // wires parked channels when an engine attaches.
        this.dubLifecycle.park(channelIndex);
        if (outcome === 'unavailable') this._scheduleDubRetry(channelIndex);
      } else {
        // The send may have closed while we were awaiting. Whoever finishes
        // last owns the reconciliation.
        this._runDubAction(channelIndex, this.dubLifecycle.finish(channelIndex, outcome === 'wired'));
      }
    }
  }

  /** One retry, 500 ms on, per parked request — the engine may still be initialising. */
  private _scheduleDubRetry(channelIndex: number): void {
    if (this.channelDubPendingActivation.has(channelIndex) || this.channelDubRetried.has(channelIndex)) return;
    this.channelDubPendingActivation.add(channelIndex);
    setTimeout(() => {
      if (!this.channelDubPendingActivation.delete(channelIndex)) return;
      this.channelDubRetried.add(channelIndex);
      if (this.dubLifecycle.isParked(channelIndex)) {
        this._runDubAction(channelIndex, this.dubLifecycle.unpark(channelIndex));
      }
    }, 500);
  }

  private async _activateDubChannelInner(channelIndex: number, gain: GainNode): Promise<DubActivation> {
    const engine = await getActiveIsolationEngine();
    // The user let go of the throw while we were resolving the engine. Do not
    // spin up a slot for a send that is already closed.
    if (!this.dubLifecycle.isDesired(channelIndex)) return 'cancelled';
    if (!engine?.isAvailable() || !engine.getWorkletNode()) {
      // An engine that will never expose per-channel outputs leaves the send
      // to the shared whole-mix tap; nothing to retry.
      try {
        const { getActiveDubBus } = await import('../dub/DubBus');
        if (getActiveDubBus()?.hasUsableWholeMixFallback()) {
          return 'fallback';
        }
      } catch { /* ok */ }
      return 'unavailable';
    }
    const worklet = engine.getWorkletNode()!;
    if (!this.dubLifecycle.isDesired(channelIndex)) return 'cancelled';

    // Dual-convention envelope: LibOpenMPT worklet switches on `cmd`, UADE /
    // Hively / Furnace worklets switch on `type`. Send both so a single
    // postMessage reaches any engine without branching per-engine here.
    worklet.port.postMessage(dubChannelMessage('dubChannelEnable', channelIndex));
    try {
      worklet.connect(gain, DUB_OUTPUT_BASE + channelIndex);
    } catch (e) {
      console.warn(`[ChannelRoutedEffects] Failed to connect worklet output ${DUB_OUTPUT_BASE + channelIndex}:`, e);
      return 'unavailable';
    }
    this.channelDubPendingActivation.delete(channelIndex);

    // Register with DubBus so echoThrow can find the tap — with the fader's
    // gain as the baseline, so a release lands on the fader, not on
    // whatever the node reads at the time.
    try {
      const { getDrumPadEngine } = await import('../../hooks/drumpad/useMIDIPadRouting');
      const bus = getDrumPadEngine()?.getDubBus();
      bus?.registerChannelTap(channelIndex, gain, dubSendToGain(this.effectiveDubSendOf(channelIndex)));
    } catch { /* DubBus not available */ }
    this.channelDubRetried.delete(channelIndex);
    console.log(`[ChannelRoutedEffects] Dub channel ${channelIndex} activated`);
    return 'wired';
  }

  private async _deactivateDubChannel(channelIndex: number): Promise<void> {
    const gain = this.channelDubGains[channelIndex];
    if (!gain) return;
    this.dubLifecycle.begin(channelIndex);
    try {
      await this._deactivateDubChannelInner(channelIndex, gain);
    } finally {
      this._runDubAction(channelIndex, this.dubLifecycle.finish(channelIndex, false));
    }
  }

  private async _deactivateDubChannelInner(channelIndex: number, gain: GainNode): Promise<void> {
    this.channelDubPendingActivation.delete(channelIndex);
    const engine = await getActiveIsolationEngine();

    // Wait for the send's own 20ms ramp to land before cutting the wire.
    //
    // `setChannelDubSend` ramps the gain down over DUB_SEND_RAMP_SEC and then
    // dispatches this, which only had an `await import()` microtask in front of
    // it — effectively zero delay. So the worklet disconnect happened while the
    // gain was still near its OLD value: a hard cut on the dub path every time
    // a send fader crossed zero. Reported 2026-09-21 as choppy, cut-out audio.
    await new Promise<void>((r) => setTimeout(r, Math.ceil(DUB_SEND_RAMP_SEC * 1000) + 5));

    // The send may have been re-opened while we waited; the lifecycle is the
    // authority on what was actually wanted, so do not tear down against it.
    if (this.dubLifecycle.isDesired(channelIndex)) return;

    const worklet = engine?.getWorkletNode();
    if (worklet) {
      worklet.port.postMessage(dubChannelMessage('dubChannelDisable', channelIndex));
      try { worklet.disconnect(gain, DUB_OUTPUT_BASE + channelIndex); } catch { /* ok */ }
    }

    try {
      const { getDrumPadEngine } = await import('../../hooks/drumpad/useMIDIPadRouting');
      const bus = getDrumPadEngine()?.getDubBus();
      bus?.unregisterChannelTap(channelIndex);
    } catch { /* ok */ }
  }

  /**
   * Re-establish worklet→gain connections for every active dub channel.
   * Called after a new song loads (engine's worklet is reused but its play()
   * path resets module state). The GainNodes + send values are preserved, so
   * the effect is just re-firing dubChannelEnable + reconnect.
   */
  async rebuildDubConnections(): Promise<void> {
    if (!this.dubBusInput) return;

    // Drop what we believe the worklet has enabled, BEFORE anything can return
    // early.
    //
    // `dubLifecycle.active` describes state that lives in the WORKLET, and the
    // worklet's enable set does not survive the rebuild this method exists to
    // answer. Keeping the belief made `setDesired(ch, true)` return 'none' for
    // a channel the worklet no longer had enabled, so the enable was never
    // re-posted and that channel's dub send was dead for the rest of the
    // session — the fader moved, the store updated, the send gain ramped, and
    // no audio was ever split out.
    //
    // Measured 2026-09-21 on jennipha.ahx: channels 2 and 3 held sends of 0.5
    // and 0.15 with taps registered, `dubChannelEnabled` false for both, and
    // writing a DIFFERENT value changed nothing. Taking channel 3 to 0 and
    // back to 0.4 brought it straight back — a send transition was the only
    // thing that could reconcile the two.
    //
    // It has to happen before the early returns below, not after them: when no
    // engine is available yet, the stale belief is exactly what would stop the
    // next send write from activating once one appears.
    this.dubLifecycle.clear();

    const engine = await getActiveIsolationEngine();
    if (!engine?.isAvailable()) return;
    const worklet = engine.getWorkletNode();
    if (!worklet) return;

    // Engine is now available — drain the pending-activation set. Channels
    // whose sends are still non-zero will be re-activated below; those that
    // have since been turned off naturally fall out via the continue guard.
    this.channelDubPendingActivation.clear();

    // Take the send values from the MIXER STORE before deciding which channels
    // to reconnect.
    //
    // The loop below skips any channel whose `channelDubSendValues` entry is
    // zero, and that array is the ENGINE's own copy — only written when
    // `setChannelDubSend` is called. The store's values survive a song load and
    // a page reload; this copy does not. So a user whose sends were already up
    // got an engine that believed every send was zero, no channel tap was ever
    // opened, and nothing reached `bus.input` at all.
    //
    // That is invisible for moves which generate their own sound, and fatal for
    // the ones that CAPTURE the bus: reverseEcho, backwardReverb and
    // delayTimeThrow read a ring fed from `bus.input` and got 38400 frames of
    // silence. Reported 2026-09-21 as those three being dead, on every engine.
    try {
      const { useMixerStore } = await import('@stores/useMixerStore');
      const channels = useMixerStore.getState().channels;
      for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
        const stored = channels[ch]?.dubSend ?? 0;
        if (stored > 0 && this.channelDubSendValues[ch] <= 0) {
          this.channelDubSendValues[ch] = Math.max(0, Math.min(1, stored));
        }
        // And the GAIN, not only the bookkeeping. Re-hydrating the values
        // array made the loop below reconnect the channel while the node it
        // reconnected was still at zero — the taps registered, the slots
        // rendered, and nothing reached the bus (2026-09-23).
        const want = dubSendToGain(this.effectiveDubSendOf(ch));
        const g = want > 0 ? this._ensureDubChannel(ch) : this.channelDubGains[ch];
        if (g) {
          if (Math.abs(g.gain.value - want) > 1e-6) {
            // Ramped for the same reason the initial seed is: a rebuild lands
            // while the engine's worklet is restarting.
            const t = (this.dubBusInput!.context as AudioContext).currentTime;
            try {
              g.gain.setValueAtTime(g.gain.value, t);
              g.gain.linearRampToValueAtTime(want, t + DUB_SEND_SEED_RAMP_SEC);
            } catch { g.gain.value = want; }
          }
        }
      }
    } catch { /* store unavailable — fall back to whatever the engine holds */ }

    for (let ch = 0; ch < MAX_DUB_CHANNELS; ch++) {
      if (this.effectiveDubSendOf(ch) <= 0) continue;
      const gain = this._ensureDubChannel(ch);
      if (!gain) continue;
      // Fire enable + reconnect. Safe to disconnect first even if not
      // currently connected (try/catch eats the error).
      worklet.port.postMessage(dubChannelMessage('dubChannelEnable', ch));
      try { worklet.disconnect(gain, DUB_OUTPUT_BASE + ch); } catch { /* first-time */ }
      try {
        worklet.connect(gain, DUB_OUTPUT_BASE + ch);
        this.dubLifecycle.setDesired(ch, true);
        this.dubLifecycle.finish(ch, true);
        // Re-register with DubBus (channelTaps map is cleared on bus dispose)
        try {
          const { getDrumPadEngine } = await import('../../hooks/drumpad/useMIDIPadRouting');
          getDrumPadEngine()?.getDubBus()?.registerChannelTap(ch, gain, dubSendToGain(this.effectiveDubSendOf(ch)));
        } catch { /* ok */ }
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] rebuildDubConnections: ch${ch} connect failed:`, e);
      }
    }
  }

  // ── Per-channel effect routing ──────────────────────────────────

  /**
   * Rebuild per-channel effect routing based on mixer store state.
   * Connects worklet outputs[1..4] → per-channel effect chains → masterEffectsInput.
   * @param channelEffects Map of channel index → effect configs to apply
   * @param engine The isolation-capable engine to route through (auto-detected if omitted)
   */
  async rebuild(
    channelEffects: Map<number, EffectConfig[]>,
    engine?: IsolationCapableEngine,
  ): Promise<void> {
    console.log(`[ChannelRoutedEffects] rebuild() called with ${channelEffects.size} channels:`,
      [...channelEffects.entries()].map(([ch, fx]) => `ch${ch}: ${fx.length} effects (${fx.filter(e=>e.enabled).length} enabled)`));

    // If no engine passed, try to find one
    if (!engine) {
      engine = await getActiveIsolationEngine() ?? undefined;
    }
    if (!engine) { console.warn('[ChannelRoutedEffects] No isolation-capable engine available'); return; }
    if (!engine.isAvailable()) { console.warn('[ChannelRoutedEffects] Engine not available'); return; }

    const workletNode = engine.getWorkletNode();
    if (!workletNode) { console.warn('[ChannelRoutedEffects] No worklet node'); return; }

    // Tear down existing slots
    this.teardown(engine);

    let slotIdx = 0;
    // Sidechain-keyed effects in the slots, wired once every slot is assigned
    // so their taps take free slots. Built without this, a routed
    // SidechainCompressor ignored its source channel and keyed on the channel
    // it sat on - "routing it to a channel kills it" (2026-09-29).
    const sidechainWiring: Array<{ node: Tone.ToneAudioNode; source: number }> = [];
    for (const [channelIndex, effects] of channelEffects) {
      if (slotIdx >= 4) {
        console.warn('[ChannelRoutedEffects] Only 4 isolation slots available, skipping remaining channels');
        break;
      }

      const enabledEffects = effects.filter(e => e.enabled);
      if (enabledEffects.length === 0) continue;

      const channelMask = 1 << channelIndex;

      // Tell worklet to create isolation module for this channel
      engine.addIsolation(slotIdx, channelMask);

      // Create effect nodes (may be Tone.js or native DevilboxSynth like BuzzmachineSynth)
      const effectNodes: IsolationSlot['effectNodes'] = [];
      for (const config of enabledEffects) {
        try {
          const node = await createEffect(config) as Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void };
          if (node) {
            if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
              ((node as any).wet as Tone.Signal).value = config.wet / 100;
            }
            effectNodes.push(node);
            const source = config.sidechainSource ?? Number(config.parameters?.sidechainSource);
            if ('getSidechainInput' in node && Number.isFinite(source)) {
              sidechainWiring.push({ node: node as Tone.ToneAudioNode, source });
            }
          }
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to create ${config.type}:`, e);
        }
      }

      if (effectNodes.length === 0) {
        engine.removeIsolation(slotIdx);
        continue;
      }

      // Create output gain for this slot
      const audioContext = engine.getAudioContext();
      if (!audioContext) { engine.removeIsolation(slotIdx); continue; }
      const outputGain = audioContext.createGain();
      outputGain.gain.value = 1;

      // Connect worklet output[slotIdx+1] → outputGain → effect chain → masterEffectsInput
      const outputIndex = slotIdx + 1;
      try {
        workletNode.connect(outputGain, outputIndex);
        console.log(`[ChannelRoutedEffects] Connected worklet output[${outputIndex}] → outputGain → effects`);
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] Failed to connect worklet output ${outputIndex}:`, e);
        engine.removeIsolation(slotIdx);
        for (const n of effectNodes) { try { n.dispose(); } catch { /* */ } }
        continue;
      }

      // Chain: outputGain → effect1 → effect2 → ... → masterEffectsInput
      // connectAudio bridges Tone.js ↔ native DevilboxSynth (Buzzmachine) nodes
      connectAudio(outputGain, effectNodes[0]);
      for (let i = 0; i < effectNodes.length - 1; i++) {
        connectAudio(effectNodes[i], effectNodes[i + 1]);
      }
      connectAudio(effectNodes[effectNodes.length - 1], this.masterEffectsInput);

      this.slots[slotIdx] = {
        slotIndex: slotIdx,
        channels: [channelIndex],
        channelMask,
        effectConfigs: enabledEffects,
        effectNodes,
        outputGain,
      };

      console.log(`[ChannelRoutedEffects] Slot ${slotIdx}: ch${channelIndex + 1} → ${enabledEffects.map(e => e.type).join(' → ')} (mask=0x${channelMask.toString(16)}) via worklet output[${outputIndex}]`);
      slotIdx++;
    }

    if (sidechainWiring.length > 0) {
      const { wireMasterSidechain } = await import('./MasterEffectsChain');
      for (const { node, source } of sidechainWiring) await wireMasterSidechain(node, source);
    }

    // Re-establish sidechain taps that were torn down
    if (this.sidechainConsumers.size > 0) {
      for (const channelIndex of this.sidechainConsumers.keys()) {
        await this._allocateSidechainSlot(channelIndex, engine);
      }
    }

    // Request diagnostic from worklet after a short delay to let messages settle
    const activeSlots = slotIdx + this.sidechainTaps.size;
    if (activeSlots > 0 && engine.diagIsolation) {
      const diagEngine = engine;
      setTimeout(() => diagEngine.diagIsolation!(), 200);
    }
  }

  /**
   * Update parameters for a specific effect on a specific channel without rebuilding.
   */
  updateEffectParams(channelIndex: number, effectIndex: number, config: EffectConfig): void {
    const slot = this.slots.find(s => s && s.channels.includes(channelIndex));
    if (!slot || effectIndex >= slot.effectNodes.length) return;

    const node = slot.effectNodes[effectIndex];

    // Update wet
    if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
      ((node as any).wet as Tone.Signal).rampTo(config.wet / 100, 0.02);
    }

    // Apply parameter diff
    const prevConfig = slot.effectConfigs[effectIndex];
    const changed: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changed[key] = value;
      }
    }
    if (Object.keys(changed).length > 0) {
      applyEffectParametersDiff(node as Tone.ToneAudioNode, config.type, changed);
    }

    slot.effectConfigs[effectIndex] = config;
  }

  /**
   * Tear down all isolation slots and disconnect effects.
   * Sidechain consumer requests are preserved so taps are re-established on rebuild.
   */
  teardown(engine?: { removeIsolation: (slotIndex: number) => void }): void {
    // Tear down per-channel effect slots
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;

      // Disconnect effects
      for (const node of slot.effectNodes) {
        try { (node as any).disconnect?.(); } catch { /* */ }
        try { node.dispose(); } catch { /* */ }
      }
      try { slot.outputGain.disconnect(); } catch { /* */ }

      // Tell engine to remove the worklet isolation module
      if (engine) {
        engine.removeIsolation(i);
      }

      this.slots[i] = null;
    }

    // Tear down sidechain tap slots (but keep sidechainConsumers for rebuild)
    for (const [, tap] of this.sidechainTaps) {
      try { tap.outputGain.disconnect(); } catch { /* */ }
      if (engine) engine.removeIsolation(tap.slotIndex);
    }
    this.sidechainTaps.clear();
  }

  /** Whether any slots are active. */
  get hasActiveSlots(): boolean {
    return this.slots.some(s => s !== null);
  }

  /** Get the slot for a specific channel (if isolated). */
  getSlotForChannel(channelIndex: number): IsolationSlot | null {
    return this.slots.find(s => s && s.channels.includes(channelIndex)) ?? null;
  }

  async dispose(): Promise<void> {
    this.unsubscribeBleed();
    try {
      const engine = await getActiveIsolationEngine();
      if (engine) {
        this.teardown(engine);
      } else {
        this.teardown();
      }
    } catch {
      this.teardown();
    }
    // On dispose, also clear consumer requests (they won't survive a new manager)
    this.sidechainConsumers.clear();
    this._teardownDubWiring();
  }
}

/**
 * Registry of engine resolvers keyed by editor mode.
 * Each resolver returns an IsolationCapableEngine if that engine is
 * currently active and available, or null otherwise.
 */
const engineResolversByMode: Record<string, () => Promise<IsolationCapableEngine | null>> = {
  classic: async () => {
    const { LibopenmptEngine } = await import('../libopenmpt/LibopenmptEngine');
    if (LibopenmptEngine.hasInstance()) {
      const engine = LibopenmptEngine.getInstance();
      if (engine.isAvailable()) return engine;
    }
    const { PreTrackerEngine } = await import('../pretracker/PreTrackerEngine');
    if (PreTrackerEngine.hasInstance()) {
      return PreTrackerEngine.getInstance() as IsolationCapableEngine;
    }
    return null;
  },
  // Hardcoded resolvers for UADE/Hively/Furnace so the resolver map stays
  // consistent with the module instance returning it. The dynamic
  // `registerIsolationEngineResolver` path below still works (and
  // overwrites these if an engine registers itself) but hardcoding avoids
  // Vite HMR divergence where a re-imported engine module registers into
  // a different copy of this map than the store-side resolver reads from.
  tfmx: async () => {
    try {
      const { useFormatStore } = await import('../../stores/useFormatStore');
      if (useFormatStore.getState().tfmxFileData) {
        const { TFMXEngine } = await import('../tfmx/TFMXEngine');
        if (TFMXEngine.hasInstance()) return null;
      }
    } catch { /* fall through to UADEEngine */ }
    const { UADEEngine } = await import('../uade/UADEEngine');
    if (UADEEngine.hasInstance()) {
      const engine = UADEEngine.getInstance();
      if (engine.isAvailable()) return engine as unknown as IsolationCapableEngine;
    }
    return null;
  },
  hively: async () => {
    const { HivelyEngine } = await import('../hively/HivelyEngine');
    if (HivelyEngine.hasInstance()) {
      const engine = HivelyEngine.getInstance();
      if (engine.isAvailable()) return engine as unknown as IsolationCapableEngine;
    }
    return null;
  },
  furnace: async () => {
    const { FurnaceDispatchEngine } = await import('../furnace-dispatch/FurnaceDispatchEngine');
    if (FurnaceDispatchEngine.hasInstance()) {
      const engine = FurnaceDispatchEngine.getInstance();
      if (engine.isAvailable()) return engine as unknown as IsolationCapableEngine;
    }
    return null;
  },
};

/**
 * Register an engine resolver for per-channel isolation, keyed by editor mode.
 * Called by engines that implement IsolationCapableEngine during their module init.
 */
export function registerIsolationEngineResolver(
  resolver: () => Promise<IsolationCapableEngine | null>,
  editorMode?: string,
): void {
  if (editorMode) {
    engineResolversByMode[editorMode] = resolver;
  } else {
    // Legacy: add as fallback (checked after mode-specific resolver)
    _fallbackResolvers.push(resolver);
  }
}
const _fallbackResolvers: (() => Promise<IsolationCapableEngine | null>)[] = [];

/**
 * Detect which isolation-capable engine is currently active and available.
 * Uses the format store's editorMode to pick the right engine directly,
 * avoiding false positives from stale singleton instances.
 */
export async function getActiveIsolationEngine(): Promise<IsolationCapableEngine | null> {
  // Get current editor mode from format store
  let editorMode = 'classic';
  try {
    const { useFormatStore } = await import('../../stores/useFormatStore');
    editorMode = useFormatStore.getState().editorMode;
  } catch { /* fallback to classic */ }

  // Try mode-specific resolver first
  const modeResolver = engineResolversByMode[editorMode];
  if (modeResolver) {
    try {
      const engine = await modeResolver();
      if (engine) return engine;
    } catch { /* resolver failed */ }
  }

  // Fallback: try all registered resolvers
  for (const resolver of _fallbackResolvers) {
    try {
      const engine = await resolver();
      if (engine) return engine;
    } catch { /* engine module not loaded */ }
  }
  return null;
}

/**
 * Editor modes that support per-channel isolation via multi-output worklet.
 * Used by UI to gate the channel routing selector.
 */
const ISOLATION_CAPABLE_MODES = new Set(['classic', 'furnace', 'hively', 'tfmx']);

/**
 * Check if the current format/editor mode supports per-channel isolation.
 * Returns true for formats with multi-output worklet engines.
 *
 * `hively` IS capable and has been since the Hively worklet grew multi-output
 * support: it renders 37 stereo outputs (main mix + 4 isolation slots + 32 dub
 * sends) and HivelyEngine implements IsolationCapableEngine. This comment used
 * to list Hively as single-output, which is how a whole-mix tap ended up
 * registered for it and shadowed the per-channel dub path entirely — see
 * `shouldFallBackToWholeMix` in DubBus.ts.
 *
 * Single-output engines (SID's ScriptProcessor path, most UADE replayers) are
 * the ones that genuinely have no per-channel audio to tap; they are absent
 * from the set and fall back to the whole-mix tap.
 */
export function supportsChannelIsolation(editorMode: string): boolean {
  return ISOLATION_CAPABLE_MODES.has(editorMode);
}

// Singleton
let routedEffectsInstance: ChannelRoutedEffectsManager | null = null;

export function getChannelRoutedEffectsManager(masterEffectsInput?: Tone.Gain): ChannelRoutedEffectsManager {
  if (!routedEffectsInstance && masterEffectsInput) {
    routedEffectsInstance = new ChannelRoutedEffectsManager(masterEffectsInput);
  }
  return routedEffectsInstance!;
}

export function disposeChannelRoutedEffectsManager(): void {
  if (routedEffectsInstance) {
    void routedEffectsInstance.dispose();
    routedEffectsInstance = null;
  }
}
