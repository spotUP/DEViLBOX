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
import { SCRATCH_PATTERNS, type ScratchPattern, type ScratchFrame } from './dj/DJScratchEngine';
import { TurntablePhysics } from './turntable/TurntablePhysics';

// ─── Tuning constants ────────────────────────────────────────────────────────

/** How long after last input before checking if we can exit scratch mode (ms) */
const IDLE_TIMEOUT_MS = 300; // 300ms — responsive exit without being too aggressive

/** Minimum number of touch points for "grab" mode on trackpad (3 fingers on Mac) */
const GRAB_TOUCH_COUNT = 3;

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

  /** Whether scratch mode is enabled (only true during playback + user interaction) */
  get isActive(): boolean { return this._isActive; }
  get accelerationEnabled(): boolean { return this._accelerationEnabled; }
  set accelerationEnabled(v: boolean) { this._accelerationEnabled = v; }

  /** Expose physics for external queries (e.g., UI visualization) */
  get turntable(): TurntablePhysics { return this.physics; }

  // ── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize the scratch buffer. Call once after audio context is running.
   * Taps the tracker replayer's output for ring-buffer capture.
   */
  async initScratchBuffer(): Promise<void> {
    if (this.scratchBufferReady) return;

    const ctx = Tone.getContext().rawContext as AudioContext;
    // Use bufferId 0 (Deck A slot) — tracker scratch doesn't coexist with DJ mode
    this.scratchBuffer = new DeckScratchBuffer(ctx, 0);
    await this.scratchBuffer.init();

    // Wire: tap the replayer's masterGain output into capture, and wire
    // playback into ToneEngine's masterInput
    const replayer = getTrackerReplayer();
    const engine = getToneEngine();

    const replayerGain = getNativeAudioNode(replayer.getMasterGain() as unknown as Record<string, unknown>);
    const masterInput = getNativeAudioNode(engine.masterInput as unknown as Record<string, unknown>);

    if (replayerGain && masterInput) {
      // Tap: replayer masterGain → captureNode (capture taps audio, doesn't interrupt chain)
      replayerGain.connect(this.scratchBuffer['captureNode']);
      // Inject: playbackNode → playbackGain → masterInput (for scratch audio)
      this.scratchBuffer.playbackGain.connect(masterInput);
      this.scratchBufferReady = true;
    } else {
      console.warn('[TrackerScratch] Could not get native audio nodes; scratch disabled');
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
    const replayer = getTrackerReplayer();

    // First event — enter scratch mode
    if (!this._isActive) {
      this.enterScratchMode(replayer);
    }

    this.lastEventTime = timestamp;

    // Read acceleration preference from store
    this._accelerationEnabled = useUIStore.getState().scratchAcceleration;

    // Convert scroll delta to angular impulse via physics utility
    const impulse = TurntablePhysics.deltaToImpulse(deltaY, deltaMode);

    // With acceleration disabled, use a more direct/linear feel
    const scaledImpulse = this._accelerationEnabled ? impulse : impulse * 1.5;

    this.physics.applyImpulse(scaledImpulse);
    return true;
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
    if (!replayer.isPlaying()) return false;

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
   * Exit scratch mode and stop playback entirely.
   * Used when power-cut spindown completes — the record has stopped,
   * no point resuming normal playback.
   */
  private exitScratchModeAndStop(): void {
    this._isActive = false;
    this.stopPhysicsLoop();

    // Silence the scratch buffer immediately (it's already at/near zero rate)
    if (this.scratchBuffer) {
      this.scratchBuffer.silenceAndStop();
      this.scratchBuffer.unfreezeCapture();
    }

    // Stop the tracker replayer and full transport chain
    const replayer = getTrackerReplayer();
    replayer.getMasterGain().gain.rampTo(this.originalGainValue, 0.01);
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
          this.engageScratchAudio(replayer);
        }
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

    // INSTANT mute - no ramp (we want immediate silence)
    const now = Tone.getContext().rawContext.currentTime;
    const gainParam = replayer.getMasterGain().gain;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(0, now);
    console.log('[TrackerScratch] Replayer gain muted to 0, buffer gain:', this.scratchBuffer.playbackGain.gain.value);
    
    // Slow replayer to crawl + suppress notes (safety)
    replayer.setSuppressNotes(true);
    replayer.setTempoMultiplier(0.001);
    replayer.setPitchMultiplier(0.001);

    // Start scratch playback (handles freeze + gain ramp internally)
    const rate = this.physics.playbackRate;
    this.scratchBuffer.startScratch(rate);
    this.scratchBuffer.snapScratchRate(rate);
    
    // Log final gain values after scratch starts
    setTimeout(() => {
      console.log('[TrackerScratch] Post-engage: replayer gain:', gainParam.value, 'buffer gain:', this.scratchBuffer?.playbackGain.gain.value);
    }, 10);
  }

  /** Duration of the crossfade when exiting scratch mode (seconds).
   *  Scratch buffer fades out while live tracker fades in simultaneously. */
  private static readonly EXIT_CROSSFADE_SEC = 0.15; // 150ms crossfade — long enough to be click-free

  private exitScratchMode(replayer: TrackerReplayer): void {
    this._isActive = false;
    this.stopPhysicsLoop();

    const fadeSec = TrackerScratchController.EXIT_CROSSFADE_SEC;
    const fadeMs = fadeSec * 1000;

    console.log('[TrackerScratch] Exiting scratch mode, starting crossfade...');

    // Restore tempo/pitch to normal (quick catch-up from 0.1% to 100%)
    replayer.setTempoMultiplier(1.0);
    replayer.setPitchMultiplier(1.0);
    replayer.setSuppressNotes(false);

    // Crossfade — scratch buffer out, live tracker in.
    replayer.getMasterGain().gain.rampTo(this.originalGainValue, fadeSec);
    console.log('[TrackerScratch] Restoring replayer gain to:', this.originalGainValue);

    // Crossfade: ramp scratch buffer gain down over the same duration
    if (this.scratchBuffer) {
      // Set rate to 1.0 so the buffer plays at normal speed during crossfade
      this.scratchBuffer.setScratchRate(1.0);

      // Ramp playback gain down
      const now = this.scratchBuffer['ctx'].currentTime;
      const gain = this.scratchBuffer.playbackGain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + fadeSec);
      console.log('[TrackerScratch] Ramping buffer gain:', gain.value, '→ 0 over', fadeSec, 'sec');

      // Stop worklet + unfreeze capture after crossfade completes
      setTimeout(() => {
        if (this.scratchBuffer) {
          this.scratchBuffer['playbackNode'].port.postMessage({ type: 'stop' });
          this.scratchBuffer.unfreezeCapture();
          console.log('[TrackerScratch] Crossfade complete, buffer stopped');
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

      // Check if we can exit scratch mode
      // (motor has brought platter back to normal, no recent input, not touching)
      const idleMs = now - this.lastEventTime;
      if (
        idleMs > IDLE_TIMEOUT_MS &&
        !this.physics.touching &&
        !this.physics.spinbackActive &&
        !this.physics.powerCutActive &&
        Math.abs(rate - 1.0) < 0.001 // Much tighter tolerance - must be virtually perfect
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
