/**
 * TrackerScratchController — Vinyl turntable simulation for tracker playback.
 *
 * Uses TurntablePhysics for physically-modeled platter dynamics (Technics SL-1200).
 * Two input modes:
 *   1. **Nudge** (2-finger scroll / mouse wheel) — impulse applied to spinning platter
 *   2. **Grab** (3-finger touch on Mac trackpad / MIDI jog touch) — hand on record,
 *      direct velocity control
 *
 * UNIFIED SCRATCH ENGINE (terminatorX-inspired):
 *   When scratch activates, the live tracker is muted and ALL audio comes from the
 *   ring buffer. The physics engine computes a signed playback rate (+1 = normal
 *   forward, -1 = backward, 0 = stopped). This rate is sent to the worklet which
 *   applies per-sample smoothing and cubic Hermite interpolation. No forward/backward
 *   switching, no dead zones, no clicks.
 *
 * On Mac trackpads: 1 finger = cursor, 2 fingers = scroll (nudge), 3 fingers = grab.
 * These gesture overrides only apply when scratch mode is enabled (transport playing).
 * When the tracker is NOT playing, all touch/scroll events pass through normally.
 *
 * Single shared instance for GL + DOM editors.
 */

import * as Tone from 'tone';
import { getTrackerReplayer, type TrackerReplayer } from './TrackerReplayer';
import { DeckScratchBuffer } from './dj/DeckScratchBuffer';
import { getToneEngine } from './ToneEngine';
import { getNativeAudioNode } from '@/utils/audio-context';
import { useUIStore } from '@/stores/useUIStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { SCRATCH_PATTERNS, type ScratchPattern, type ScratchFrame } from './dj/DJScratchEngine';
import { TurntablePhysics } from './turntable/TurntablePhysics';

// ─── Tuning constants ────────────────────────────────────────────────────────

/** How long after last input before checking if we can exit scratch mode (ms) */
const IDLE_TIMEOUT_MS = 300; // 300ms — responsive exit without being too aggressive

/** Minimum number of touch points for "grab" mode on trackpad (3 fingers on Mac) */
const GRAB_TOUCH_COUNT = 3;

/** Minimum scroll delta (pixels) to count as intentional input.
 *  Mac trackpad sends inertial scroll events with tiny deltas for 2-3s after
 *  the user lifts their fingers. These must NOT reset the idle timer, otherwise
 *  scratch mode stays active long after the user stopped interacting. */
const SCROLL_IDLE_THRESHOLD = 1;

/** Minimum scroll delta to reset the idle timer (pixels).
 *  Must be higher than inertial decay tail (< 1px), while still capturing
 *  intentional trackpad scrolls (typically 2-8px). */
const SCROLL_SIGNIFICANT_THRESHOLD = 2;

/** How long after the last scroll event before releasing the platter (ms).
 *  Must be longer than the typical gap between trackpad scroll events (~16-32ms)
 *  so a continuous gesture doesn't accidentally drop touch state between events. */
const SCROLL_RELEASE_MS = 150;

// ─── Controller ──────────────────────────────────────────────────────────────

export class TrackerScratchController {
  /** Physics simulation */
  private physics = new TurntablePhysics();

  /** Whether we're actively scratching (user has interacted during playback) */
  private _isActive = false;

  /** Timestamp of last input event */
  private lastEventTime = 0;

  /** rAF handle for physics loop */
  private rafId: number | null = null;

  /** Last rAF timestamp for dt calculation */
  private lastTickTime = 0;

  /** Ring buffer for scratch audio */
  private scratchBuffer: DeckScratchBuffer | null = null;
  private scratchBufferReady = false;

  /** Whether acceleration smoothing is enabled (setting — affects impulse scaling) */
  private _accelerationEnabled = true;

  /** The replayer's original masterGain value before scratch started */
  private originalGainValue = 1;

  /** The transport's original smoothScrolling state before scratch started */
  private originalSmoothScrolling = false;


  /** Previous touch Y position for delta calculation (grab mode) */
  private grabLastY = 0;
  /** Previous touch timestamp for velocity calculation (grab mode) */
  private grabLastTime = 0;

  /** Last scroll event timestamp for dt calculation (scroll/wheel mode) */
  private _lastScrollTime = 0;
  /** Timer to release hand from platter after scroll stops (50ms) */
  private _scrollReleaseTimerId: ReturnType<typeof setTimeout> | null = null;

  // ── Scratch display position tracking ──────────────────────────────────
  /** Row when scratch started */
  private scratchStartRow = 0;
  /** Pattern index when scratch started */
  private scratchStartPattern = 0;
  /** Fractional row offset accumulated during scratch (can go negative) */
  private scratchRowOffset = 0;
  /** Pattern length at scratch start (for wrapping) */
  private scratchPatternLength = 64;

  /** Whether scratch mode is enabled (only true during playback + user interaction) */
  get isActive(): boolean { return this._isActive; }
  get accelerationEnabled(): boolean { return this._accelerationEnabled; }
  set accelerationEnabled(v: boolean) { this._accelerationEnabled = v; }

  /** Expose physics for external queries (e.g., UI visualization) */
  get turntable(): TurntablePhysics { return this.physics; }

  /**
   * Get the current display position during scratch.
   * Returns { row, pattern, smoothOffset } for the pattern editor to render.
   * row = integer row, smoothOffset = fractional pixel offset for smooth scrolling.
   */
  getScratchDisplayState(rowHeight: number): { row: number; pattern: number; smoothOffset: number } | null {
    if (!this._isActive) return null;
    const totalOffset = this.scratchRowOffset;
    const len = this.scratchPatternLength;
    // Compute integer row + fractional remainder
    let intRow = this.scratchStartRow + Math.floor(totalOffset);
    const frac = totalOffset - Math.floor(totalOffset);
    // Wrap within pattern bounds
    intRow = ((intRow % len) + len) % len;
    return {
      row: intRow,
      pattern: this.scratchStartPattern,
      smoothOffset: frac * rowHeight,
    };
  }

  // ── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize the scratch buffer. Call once after audio context is running.
   * Taps the tracker replayer's output for ring-buffer capture.
   */
  async initScratchBuffer(): Promise<void> {
    if (this.scratchBufferReady) return;

    console.log('[TrackerScratch] Initializing scratch buffer...');
    const ctx = Tone.getContext().rawContext as AudioContext;
    // Use bufferId 0 (Deck A slot) — tracker scratch doesn't coexist with DJ mode
    this.scratchBuffer = new DeckScratchBuffer(ctx, 0);
    await this.scratchBuffer.init();

    // Wire: tap ToneEngine buses into capture, and wire playback into masterInput
    const engine = getToneEngine();

    const masterInput = getNativeAudioNode(engine.masterInput as unknown as Record<string, unknown>);
    const synthBus    = getNativeAudioNode(engine.synthBus    as unknown as Record<string, unknown>);

    if (masterInput && synthBus) {
      // Tap 1: ToneEngine masterInput → captureNode
      //   Captures: MOD/XM/IT/S3M (masterGain→separationNode→masterInput)
      //             + UADE/Hively/native WASM engines (nativeEngine→separationNode→masterInput)
      masterInput.connect(this.scratchBuffer['captureNode']);
      // Tap 2: ToneEngine synthBus → captureNode
      //   Captures: Furnace chips, C64 SID, DB303, and all other ToneEngine synths
      //             (these bypass masterInput and flow through synthBus directly)
      synthBus.connect(this.scratchBuffer['captureNode']);
      // Inject: playbackNode → playbackGain → masterInput (scratch audio playback)
      this.scratchBuffer.playbackGain.connect(masterInput);
      this.scratchBufferReady = true;
      // Reset immediately — no previous song audio should be in the buffer yet
      this.scratchBuffer.resetCapture();
      console.log('[TrackerScratch] Scratch buffer wired successfully');
    } else {
      console.warn('[TrackerScratch] Could not get native audio nodes; scratch disabled',
        { masterInput: !!masterInput, synthBus: !!synthBus });
    }
  }

  // ── Scroll/wheel handler (nudge mode) ────────────────────────────────────

  /**
   * Feed a scroll delta into the scratch controller (nudge mode).
   * Call this from wheel handlers when scratch should be active.
   * 2-finger trackpad scroll on Mac, or mouse wheel.
   *
   * Caller is responsible for determining when scratch should be enabled
   * (DJ view, scratch toggle, or during playback).
   *
   * @param deltaY Raw scroll delta (positive = scroll down = forward nudge)
   * @param timestamp Event timestamp (performance.now())
   * @param deltaMode WheelEvent.deltaMode (0=pixel, 1=line, 2=page)
   * @returns true if the event was consumed (scratch active), false if passthrough
   */
  onScrollDelta(deltaY: number, timestamp: number, deltaMode: number = 0): boolean {
    const absDelta = Math.abs(deltaY);

    // Ignore tiny inertial scroll events when scratch is not active.
    // Mac trackpad sends decaying deltas for seconds after lifting fingers —
    // these must not re-enter scratch mode after a clean exit.
    if (!this._isActive && absDelta < SCROLL_IDLE_THRESHOLD) {
      return false; // passthrough — let normal scroll handling take over
    }

    // When active and the idle timer has expired (no significant input for 300ms),
    // consume the event but DON'T apply impulses. This lets the motor bring the
    // rate back to 1.0 without interference from inertial scroll events —
    // matching how the DJ vinyl view works after pointer release.
    if (this._isActive && (timestamp - this.lastEventTime) > IDLE_TIMEOUT_MS) {
      return true; // consume event, no impulse
    }

    const replayer = getTrackerReplayer();

    // Only enter scratch mode when transport is playing
    if (!replayer.isPlaying()) return false;

    // First significant event — enter scratch mode
    if (!this._isActive) {
      console.warn(`[TrackerScratch] Entering scratch mode, delta=${deltaY.toFixed(1)}`);
      this.enterScratchMode(replayer);
    }

    // Only reset idle timer for clearly intentional deltas.
    // Mac trackpad inertial decay events (5-20px) must NOT reset the timer,
    // otherwise the idle timer never expires and scratch mode stays active forever.
    if (absDelta >= SCROLL_SIGNIFICANT_THRESHOLD) {
      this.lastEventTime = timestamp;
    }

    // Read acceleration preference from store
    this._accelerationEnabled = useUIStore.getState().scratchAcceleration;

    // Velocity control (same as grab mode) — hand on record, motor disengaged.
    // Impulse mode produced ~0.007 rad/s per 5px scroll, far below the 0.15 rad/s
    // slipmat breakaway threshold, so the motor instantly corrected and no audible
    // scratch occurred. Velocity control gives direct, responsive feel.
    const dt = Math.max(0.001, (timestamp - this._lastScrollTime) / 1000);
    this._lastScrollTime = timestamp;

    // Normalize deltaMode (line=12px, page=400px)
    const normalizedDelta = deltaMode === 1 ? deltaY * 12 : deltaMode === 2 ? deltaY * 400 : deltaY;
    const omega = TurntablePhysics.deltaToAngularVelocity(normalizedDelta, dt);

    this.physics.setTouching(true);
    this.physics.setHandVelocity(omega);

    // Release hand after scroll stops — motor re-engages naturally
    this.clearScrollReleaseTimer();
    this._scrollReleaseTimerId = setTimeout(() => {
      this._scrollReleaseTimerId = null;
      if (this._isActive) {
        this.physics.setTouching(false);
      }
    }, SCROLL_RELEASE_MS);

    return true;
  }

  private clearScrollReleaseTimer(): void {
    if (this._scrollReleaseTimerId !== null) {
      clearTimeout(this._scrollReleaseTimerId);
      this._scrollReleaseTimerId = null;
    }
  }

  // ── Touch handlers (grab mode — 3 fingers on Mac trackpad) ────────────

  /**
   * Check whether a touch event qualifies as a grab (hand on record).
   * On Mac trackpad: 3+ fingers. On touchscreen: 3+ fingers.
   * Only returns true when transport is playing (scratch mode can activate).
   *
   * @param touchCount Number of active touch points (e.touches.length)
   * @returns true if this should be treated as a grab gesture
   */
  isGrabTouch(touchCount: number): boolean {
    // Only override gestures when transport is playing
    try {
      const replayer = getTrackerReplayer();
      if (!replayer.isPlaying()) return false;
    } catch { return false; }

    return touchCount >= GRAB_TOUCH_COUNT;
  }

  /**
   * Begin grab mode — hand on record. Called on touchstart with 3+ fingers.
   * Only activates when playing (scratch mode enabled).
   *
   * @param clientY Initial touch Y position (average of touch points)
   * @param timestamp Event timestamp
   * @returns true if grab was activated, false if passthrough
   */
  onGrabStart(clientY: number, timestamp: number): boolean {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) {
      console.log('[TrackerScratch] onGrabStart: replayer not playing, ignoring');
      return false;
    }

    console.log('[TrackerScratch] onGrabStart: activating grab scratch');

    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.lastEventTime = timestamp;
    this.grabLastY = clientY;
    this.grabLastTime = timestamp;

    // Tell physics: hand on platter
    this.physics.setTouching(true);
    // Initial hand velocity = 0 (just placed hand, hasn't moved yet)
    this.physics.setHandVelocity(0);
    return true;
  }

  /**
   * Update grab position — hand moving on record. Called on touchmove with 3+ fingers.
   *
   * @param clientY Current touch Y position (average of touch points)
   * @param timestamp Event timestamp
   */
  onGrabMove(clientY: number, timestamp: number): void {
    if (!this._isActive || !this.physics.touching) return;

    this.lastEventTime = timestamp;

    const deltaY = clientY - this.grabLastY;
    const dt = Math.max(0.001, (timestamp - this.grabLastTime) / 1000); // seconds

    this.grabLastY = clientY;
    this.grabLastTime = timestamp;

    // Convert pixel delta to angular velocity
    const omega = TurntablePhysics.deltaToAngularVelocity(deltaY, dt);
    this.physics.setHandVelocity(omega);
  }

  /**
   * End grab mode — hand lifted from record. Called on touchend/touchcancel.
   * The platter will coast on its current velocity, then motor spins back up.
   *
   * @param _timestamp Event timestamp
   */
  onGrabEnd(_timestamp: number): void {
    if (!this.physics.touching) return;

    this.lastEventTime = _timestamp;
    this.physics.setTouching(false);
    // Motor re-engages automatically via physics (hand release → motor pulls to target ω)
  }

  // ── MIDI jog wheel handlers ──────────────────────────────────────────────

  /**
   * MIDI jog touch — hand on jog platter top surface.
   * Uses controller's touch-sensitive detection (note on/off).
   */
  onMidiJogTouch(touching: boolean): void {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) return;

    if (!this._isActive && touching) {
      this.enterScratchMode(replayer);
    }

    this.lastEventTime = performance.now();
    this.physics.setTouching(touching);

    if (touching) {
      this.physics.setHandVelocity(0);
    }
  }

  /**
   * MIDI jog spin — relative CC value from jog wheel edge or platter.
   *
   * @param ccValue Raw CC value (0-63 = forward, 65-127 = backward)
   * @param touching Whether hand is on the platter (touch-sensitive jog)
   */
  onMidiJogSpin(ccValue: number, touching: boolean): void {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) return;

    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.lastEventTime = performance.now();

    if (touching) {
      // Direct velocity control (hand on record)
      const omega = TurntablePhysics.midiJogToAngularVelocity(ccValue);
      this.physics.setHandVelocity(omega);
    } else {
      // Nudge impulse (outer ring)
      const impulse = TurntablePhysics.midiJogToImpulse(ccValue);
      this.physics.applyImpulse(impulse);
    }
  }

  // ── Spinback ─────────────────────────────────────────────────────────────

  /**
   * Trigger spinback effect. Motor stays ON, backward impulse creates a
   * rubber-band arc: decel → brief reverse → motor pulls back to normal speed.
   * Playback resumes after spinback completes.
   */
  triggerSpinback(): void {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) return;

    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.physics.triggerSpinback();
  }

  /**
   * Trigger power-cut effect. Motor OFF, platter coasts to a stop on
   * friction alone. No reverse. Takes longer than a spinback because
   * there's less resistance — just passive bearing/stylus drag.
   * Playback stops completely when the platter reaches zero.
   */
  triggerPowerCut(): void {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) return;

    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.physics.triggerPowerCut(() => {
      // Platter has stopped — stop the tracker and exit scratch mode
      this.exitScratchModeAndStop();
    });
  }

  /**
   * Electronic brake — stop with turntable physics deceleration (~0.8s).
   * Used for normal stop button (vs power-cut which is shift+stop, ~19s coast).
   * Playback stops completely when the platter reaches zero.
   */
  triggerElectronicBrake(onComplete?: () => void): void {
    const replayer = getTrackerReplayer();
    if (!replayer.isPlaying()) {
      onComplete?.();
      return;
    }

    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.physics.triggerElectronicBrake(() => {
      this.exitScratchModeAndStop();
      onComplete?.();
    });
  }

  /**
   * Exit scratch mode and stop playback entirely.
   * Used when power-cut spindown completes — the record has stopped,
   * no point resuming normal playback.
   */
  private exitScratchModeAndStop(): void {
    this._isActive = false;
    this.clearScrollReleaseTimer();
    this.stopPhysicsLoop();

    // Silence the scratch buffer immediately (it's already at/near zero rate)
    if (this.scratchBuffer) {
      this.scratchBuffer.silenceAndStop();
      this.scratchBuffer.unfreezeCapture();
    }

    // Stop the tracker replayer and full transport chain
    const replayer = getTrackerReplayer();
    replayer.getFullOutput().gain.rampTo(this.originalGainValue, 0.01);
    replayer.stop();
    useTransportStore.getState().stop();
    getToneEngine().stop();

    // Reset physics to normal state
    this.physics.reset();

    // Restore original smooth scrolling state
    useTransportStore.getState().setSmoothScrolling(this.originalSmoothScrolling);
  }

  // ── Internal state machine ───────────────────────────────────────────────

   private enterScratchMode(replayer: TrackerReplayer): void {
    this._isActive = true;
    this.originalGainValue = 1;
    this.lastEventTime = performance.now();

    console.log('[TrackerScratch] Entering scratch mode');

    // Capture current display position for scratch visual tracking
    const audioState = replayer.getStateAtTime(Tone.now());
    if (audioState) {
      this.scratchStartRow = audioState.row;
      this.scratchStartPattern = audioState.pattern;
    } else {
      const ts = useTransportStore.getState();
      this.scratchStartRow = ts.currentRow;
      this.scratchStartPattern = ts.currentPatternIndex;
    }
    this.scratchRowOffset = 0;
    const patterns = useTrackerStore.getState().patterns;
    this.scratchPatternLength = (patterns && patterns[this.scratchStartPattern]?.length) || 64;

    // Store and enable smooth scrolling for scratch mode
    const transportState = useTransportStore.getState();
    this.originalSmoothScrolling = transportState.smoothScrolling;
    if (!transportState.smoothScrolling) {
      transportState.setSmoothScrolling(true);
    }

    // Sync physics to platter mass setting
    const state = useUIStore.getState();
    const mass = state.platterMass;
    if (typeof mass === 'number') {
      this.physics.setMass(mass);
    }

    // Initialize scratch buffer if needed
    if (!this.scratchBufferReady) {
      void this.initScratchBuffer().then(() => {
        // Once buffer is ready and we're still active, engage scratch audio
        if (this._isActive && this.scratchBuffer) {
          console.log('[TrackerScratch] Scratch buffer ready, engaging audio');
          this.engageScratchAudio(replayer);
        }
      }).catch((err) => {
        console.error('[TrackerScratch] Failed to init scratch buffer:', err);
      });
    } else {
      this.engageScratchAudio(replayer);
    }

    // Start the physics rAF loop
    this.startPhysicsLoop();
  }

  /**
   * Engage the unified scratch audio path:
   * - Mute replayer output to ZERO immediately (no ramp - instant silence)
   * - Slow replayer way down (safety - won't generate much audio anyway)
   * - Start ring buffer playback (internally freezes capture and ramps gain up)
   */
  private engageScratchAudio(replayer: TrackerReplayer): void {
    if (!this.scratchBufferReady || !this.scratchBuffer) return;

    // CRITICAL ORDER: freeze capture FIRST, before muting replayer.
    // Otherwise the capture writes silence frames between mute and freeze,
    // and startFromWrite reads from the silence zone → user hears nothing.
    const rate = this.physics.playbackRate;
    this.scratchBuffer.startScratch(rate);
    this.scratchBuffer.snapScratchRate(rate);

    // NOW mute the full tracker output — covers internal sequencer AND native WASM
    // engines (libopenmpt, UADE, etc.) that bypass masterGain and connect directly
    // to the separation node. masterGain alone would leave native engines audible.
    const now = Tone.getContext().rawContext.currentTime;
    const gainParam = replayer.getFullOutput().gain;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(0, now);

    // Pause ALL native WASM engines (JamCracker, Hively, UADE, FC, SunVox, etc.)
    // These run independently in worklets and keep playing even with gain at zero.
    replayer.pauseNativeEnginesForScratch();

    // Slow replayer to crawl + suppress notes (safety)
    replayer.setSuppressNotes(true);
    replayer.setTempoMultiplier(0.001);
    replayer.setPitchMultiplier(0.001);
  }

  /** Duration of the crossfade when exiting scratch mode (seconds).
   *  Scratch buffer fades out while live tracker fades in simultaneously. */
  private static readonly EXIT_CROSSFADE_SEC = 0.15; // 150ms crossfade — long enough to be click-free

  private exitScratchMode(replayer: TrackerReplayer): void {
    this._isActive = false;
    this.clearScrollReleaseTimer();
    this.stopPhysicsLoop();

    const fadeSec = TrackerScratchController.EXIT_CROSSFADE_SEC;
    const fadeMs = fadeSec * 1000;

    console.warn(`[TrackerScratch] Exiting scratch mode, rate=${this.physics.playbackRate.toFixed(3)}`);

    // IMPORTANT ORDER: resync BEFORE unsuppressing notes.
    // At 0.001x tempo, nextScheduleTime is far in the future.
    // Resync snaps it to now. Then restore normal tempo so the
    // next scheduler tick processes at the right speed.
    replayer.resyncSchedulerToNow();
    replayer.setTempoMultiplier(1.0);
    replayer.setPitchMultiplier(1.0);
    replayer.setSuppressNotes(false);

    // Crossfade — scratch buffer out, live tracker in.
    // Restore the full output gain (covers all formats, including native WASM engines).
    replayer.getFullOutput().gain.value = this.originalGainValue;

    // Resume ALL native WASM engines (were paused when entering scratch mode)
    replayer.resumeNativeEnginesAfterScratch();
    console.warn(`[TrackerScratch] Gain restored to ${this.originalGainValue}`);

    // Crossfade: ramp scratch buffer gain down over the same duration
    if (this.scratchBuffer && this.scratchBufferReady) {
      // Set rate to 1.0 so the buffer plays at normal speed during crossfade
      this.scratchBuffer.setScratchRate(1.0);

      // Ramp playback gain down
      const now = this.scratchBuffer['ctx'].currentTime;
      const gain = this.scratchBuffer.playbackGain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + fadeSec);

      // Stop worklet + unfreeze capture after crossfade completes
      setTimeout(() => {
        if (this.scratchBuffer) {
          this.scratchBuffer['playbackNode'].port.postMessage({ type: 'stop' });
          this.scratchBuffer.unfreezeCapture();
        }
      }, fadeMs + 10);
    }

    // Reset physics to normal state
    this.physics.reset();

    // Restore original smooth scrolling state
    useTransportStore.getState().setSmoothScrolling(this.originalSmoothScrolling);
  }

  // ── Physics loop (rAF-driven) ────────────────────────────────────────────

  private startPhysicsLoop(): void {
    if (this.rafId !== null) return;

    this.lastTickTime = performance.now();

    const loop = (now: number) => {
      if (!this._isActive) {
        this.rafId = null;
        return;
      }

      const dt = (now - this.lastTickTime) / 1000; // seconds
      this.lastTickTime = now;

      // Tick physics
      const rate = this.physics.tick(dt);

      // Send signed rate directly to the ring buffer worklet.
      // The worklet does per-sample smoothing for click-free audio.
      this.applyPlaybackRate(rate);

      // Accumulate visual row offset: rate × dt × rowsPerSecond
      const ts = useTransportStore.getState();
      const rowDuration = (2.5 * ts.speed) / ts.bpm; // seconds per row
      if (rowDuration > 0) {
        this.scratchRowOffset += rate * dt / rowDuration;
      }

      // Exit when idle (no recent significant input) and not in a special mode
      const idleMs = now - this.lastEventTime;
      if (
        idleMs > IDLE_TIMEOUT_MS &&
        !this.physics.touching &&
        !this.physics.spinbackActive &&
        !this.physics.powerCutActive
      ) {
        const replayer = getTrackerReplayer();
        this.exitScratchMode(replayer);
        return;
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stopPhysicsLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Apply the physics-computed playback rate to the scratch buffer.
   * Rate is SIGNED: positive = forward, negative = backward.
   * The worklet handles all smoothing, interpolation, and zero-crossing fades.
   */
  private applyPlaybackRate(rate: number): void {
    if (this.scratchBufferReady && this.scratchBuffer) {
      this.scratchBuffer.setScratchRate(rate);
    }
  }

  // ── Fader cut (mute while held) ────────────────────────────────────────

  /** Whether fader cut is currently active (audio muted) */
  private _faderCutActive = false;
  get faderCutActive(): boolean { return this._faderCutActive; }

  /**
   * Set fader cut state. When active, mutes the masterGain immediately (sub-ms).
   * Call with true on keydown and false on keyup for hold-to-mute behavior.
   */
  setFaderCut(active: boolean): void {
    if (this._faderCutActive === active) return;
    this._faderCutActive = active;

    try {
      const replayer = getTrackerReplayer();
      const ctx = Tone.getContext().rawContext as AudioContext;
      const gainNode = getNativeAudioNode(replayer.getMasterGain() as unknown as Record<string, unknown>);
      if (!gainNode) return;

      const param = (gainNode as AudioNode as GainNode).gain;
      param.cancelScheduledValues(ctx.currentTime);
      param.setValueAtTime(active ? 0 : 1, ctx.currentTime);
    } catch { /* replayer not ready */ }
  }

  /**
   * Set fader gain directly (0.0–1.0). Only applies during active scratch.
   * Used for continuous MIDI CC (joystick crossfader).
   */
  setFaderGain(value: number): void {
    if (!this._isActive) return;
    if (!this.scratchBuffer || !this.scratchBufferReady) return;
    const clamped = Math.max(0, Math.min(1, value));
    const ctx = Tone.getContext().rawContext as AudioContext;
    const gain = this.scratchBuffer.playbackGain.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(clamped, ctx.currentTime);
  }

  // ── Scratch patterns (fader chops while held) ────────────────────────────

  /** Currently running fader pattern interval */
  private faderPatternTimerId: ReturnType<typeof setInterval> | null = null;
  /** Active pattern name (null = none) */
  private _activePatternName: string | null = null;
  /** Pattern elapsed time in ms */
  private patternElapsedMs = 0;
  /** Pattern start real time */
  private patternStartTime = 0;

  get activePatternName(): string | null { return this._activePatternName; }

  /**
   * Start a scratch fader pattern by name (e.g., 'Crab', 'Transformer').
   * Uses the fader chop data from SCRATCH_PATTERNS and applies to the
   * tracker replayer's masterGain. Pattern loops indefinitely until stopped.
   */
  startFaderPattern(patternName: string): void {
    // If same pattern running, ignore (stop separately)
    if (this._activePatternName === patternName) return;
    // If different pattern running, stop it first
    if (this._activePatternName !== null) {
      this.stopFaderPattern();
    }

    const pattern = SCRATCH_PATTERNS.find(p => p.name === patternName);
    if (!pattern) return;

    this._activePatternName = patternName;
    this.patternElapsedMs = 0;
    this.patternStartTime = performance.now();

    // Special patterns (Transformer, Crab, 8-Finger Crab) use AudioParam scheduling
    if (patternName === 'Transformer' || patternName === 'Crab' || patternName === '8-Finger Crab') {
      this.scheduleChopPattern(pattern);
      return;
    }

    // Other patterns use a JS interval tick (~10ms) for frame-driven fader
    this.faderPatternTimerId = setInterval(() => {
      this.tickFaderPattern(pattern);
    }, 10);
  }

  /**
   * Stop the current fader pattern and restore gain to 1.
   */
  stopFaderPattern(): void {
    this._activePatternName = null;
    this.patternElapsedMs = 0;

    if (this.faderPatternTimerId !== null) {
      clearInterval(this.faderPatternTimerId);
      this.faderPatternTimerId = null;
    }

    // Restore gain
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const gainNode = getNativeAudioNode(
        getTrackerReplayer().getMasterGain() as unknown as Record<string, unknown>
      );
      if (gainNode) {
        const param = (gainNode as AudioNode as GainNode).gain;
        param.cancelScheduledValues(ctx.currentTime);
        param.setValueAtTime(1, ctx.currentTime);
      }
    } catch { /* replayer not ready */ }
  }

  /**
   * Toggle a fader pattern: start if not running this pattern, stop if it is.
   */
  toggleFaderPattern(patternName: string): void {
    if (this._activePatternName === patternName) {
      this.stopFaderPattern();
    } else {
      this.startFaderPattern(patternName);
    }
  }

  /** Tick callback for frame-driven fader patterns (non-Transformer/Crab) */
  private tickFaderPattern(pattern: ScratchPattern): void {
    const now = performance.now();
    this.patternElapsedMs = now - this.patternStartTime;

    // Compute cycle duration
    let cycleDurationMs: number;
    if (pattern.durationMs !== null) {
      cycleDurationMs = pattern.durationMs;
    } else if (pattern.durationBeats !== null) {
      // Approximate BPM from transport — use 125 as fallback
      let bpm = 125;
      try {
        bpm = Tone.getTransport().bpm.value || 125;
      } catch { /* fallback */ }
      cycleDurationMs = (60000 / bpm) * pattern.durationBeats;
    } else {
      cycleDurationMs = 500; // fallback
    }

    const posInCycle = this.patternElapsedMs % cycleDurationMs;
    const fracInCycle = posInCycle / cycleDurationMs;

    // Find surrounding frames for fader gain
    const faderGain = this.interpolateFaderGain(pattern, fracInCycle, posInCycle, cycleDurationMs);

    // Apply fader gain to masterGain
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const gainNode = getNativeAudioNode(
        getTrackerReplayer().getMasterGain() as unknown as Record<string, unknown>
      );
      if (gainNode) {
        const param = (gainNode as AudioNode as GainNode).gain;
        param.cancelScheduledValues(ctx.currentTime);
        param.setValueAtTime(faderGain, ctx.currentTime);
      }
    } catch { /* replayer not ready */ }
  }

  /** Interpolate fader gain from pattern frames at current position */
  private interpolateFaderGain(
    pattern: ScratchPattern,
    fracInCycle: number,
    _posMs: number,
    cycleDurationMs: number
  ): number {
    const frames = pattern.frames;
    if (frames.length === 0) return 1;

    // Find frame positions using fraction or time
    let prevFrame: ScratchFrame = frames[0];
    let nextFrame: ScratchFrame = frames[0];
    let prevPos = 0;
    let nextPos = 1;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const fPos = f.timeFraction ?? (f.timeMs != null ? f.timeMs / cycleDurationMs : 0);

      if (fPos <= fracInCycle) {
        prevFrame = f;
        prevPos = fPos;
        nextFrame = frames[(i + 1) % frames.length];
        nextPos = nextFrame.timeFraction ?? (nextFrame.timeMs != null ? nextFrame.timeMs / cycleDurationMs : 1);
        if (nextPos <= fPos) nextPos = 1; // wrap
      }
    }

    // Step function for fader (no interpolation — sharp DJ cuts)
    void prevPos; void nextPos; void nextFrame;
    return prevFrame.faderGain;
  }

  /**
   * Schedule Transformer/Crab/8-Finger Crab chop patterns using AudioParam scheduling.
   * These use regular on/off pulses at beat subdivisions for sub-ms accuracy.
   */
  private scheduleChopPattern(pattern: ScratchPattern): void {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const gainNode = getNativeAudioNode(
        getTrackerReplayer().getMasterGain() as unknown as Record<string, unknown>
      );
      if (!gainNode) return;

      const param = (gainNode as AudioNode as GainNode).gain;
      param.cancelScheduledValues(ctx.currentTime);

      // Determine chops-per-beat and duty cycle
      let chopsPerBeat = 4;  // Transformer default
      let dutyCycle = 0.5;   // 50% on/off

      if (pattern.name === 'Crab') {
        chopsPerBeat = 4;
        dutyCycle = 0.6;  // crab has slightly longer on-time
      } else if (pattern.name === '8-Finger Crab') {
        chopsPerBeat = 8;
        dutyCycle = 0.2;  // very staccato
      }

      let bpm = 125;
      try { bpm = Tone.getTransport().bpm.value || 125; } catch { /* fallback */ }

      const beatDuration = 60 / bpm;
      const chopDuration = beatDuration / chopsPerBeat;
      const onTime = chopDuration * dutyCycle;
      const offTime = chopDuration - onTime;

      // Schedule 128 chops ahead
      const numChops = 128;
      let t = ctx.currentTime;

      for (let i = 0; i < numChops; i++) {
        param.setValueAtTime(1, t);         // on
        param.setValueAtTime(0, t + onTime); // off
        t += onTime + offTime;
      }

      // Auto-reschedule before expiry
      const totalDuration = (numChops * chopDuration) * 1000;
      const rescheduleMs = totalDuration - 300;

      this.faderPatternTimerId = setTimeout(() => {
        if (this._activePatternName === pattern.name) {
          this.scheduleChopPattern(pattern);
        }
      }, rescheduleMs) as unknown as ReturnType<typeof setInterval>;
    } catch { /* replayer not ready */ }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /** Reset the scratch ring buffer. Call when a new song loads so stale audio
   *  from the previous song is never heard during scratch. */
  resetScratchBuffer(): void {
    if (this.scratchBuffer && this.scratchBufferReady) {
      this.scratchBuffer.resetCapture();
    }
  }

  /** Force-stop scratching (e.g., when playback stops externally) */
  forceStop(): void {
    // Stop any fader pattern
    if (this._activePatternName !== null) {
      this.stopFaderPattern();
    }
    // Stop fader cut
    if (this._faderCutActive) {
      this.setFaderCut(false);
    }

    if (!this._isActive) return;
    const replayer = getTrackerReplayer();
    this.exitScratchMode(replayer);
  }

  dispose(): void {
    this.forceStop();
    if (this.scratchBuffer) {
      this.scratchBuffer.dispose();
      this.scratchBuffer = null;
      this.scratchBufferReady = false;
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _instance: TrackerScratchController | null = null;

export function getTrackerScratchController(): TrackerScratchController {
  if (!_instance) {
    _instance = new TrackerScratchController();
    // Auto-stop scratch when transport stops
    // Lazy import to avoid circular dependency
    import('@/stores/useTransportStore').then(({ useTransportStore }) => {
      useTransportStore.subscribe((state, prev) => {
        if (prev.isPlaying && !state.isPlaying) {
          _instance?.forceStop();
        }
      });
    });
  }
  return _instance;
}
