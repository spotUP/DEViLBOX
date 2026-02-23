/**
 * TurntablePhysics — Rigid-body rotational physics simulation of a vinyl turntable platter.
 *
 * Models the Technics SL-1200 MK2 as the baseline with **real slipmat simulation**:
 *   - Motor platter spins independently at target RPM (DC motor + bearing friction)
 *   - Vinyl record sits on slipmat (felt pad), coupled to motor platter by friction
 *   - Hand-on-record: hand has strong coupling to record, slipmat provides weak
 *     coupling to motor platter underneath. Hand WINS (record stops instantly),
 *     but motor platter keeps spinning underneath — just like a real turntable.
 *   - Hand release: record re-couples to motor platter through slipmat friction,
 *     gradually accelerating back to motor speed (~0.5–0.8s, not instant).
 *
 * Two-body model (simplified):
 *   - Motor platter: always driven by motor torque toward target ω
 *   - Record: driven by hand (when touching) + slipmat friction (always)
 *   - Slipmat: kinetic friction when record ≠ platter speed, static when close
 *
 * Reference specs (Technics SL-1200 MK2):
 *   Platter mass:    1.8 kg (with record + slipmat)
 *   Platter radius:  0.15 m effective
 *   Starting torque: 1.5 kg·cm = 0.000147 kN·m ≈ 0.147 N·m (for 33⅓ startup in 0.7s)
 *   33⅓ RPM:         ω₀ = 2π × 33.333/60 = 3.49 rad/s
 *   Startup time:    0.7 seconds (spec)
 *
 * The simulation uses semi-implicit Euler integration at whatever rate tick() is called
 * (typically 120–144 Hz via requestAnimationFrame).
 *
 * This module is PURE MATH — no audio, no DOM, no Tone.js dependencies.
 */

// ─── Physical constants ──────────────────────────────────────────────────────

/** Target angular velocity for 33⅓ RPM in rad/s */
const OMEGA_33 = (2 * Math.PI * 33.333) / 60; // ≈ 3.49 rad/s

/** Technics SL-1200 starting torque in N·m (1.5 kg·cm converted) */
const MOTOR_TORQUE_BASE = 0.147;

/** Moment of inertia at mass=0.5 (Technics 1200 baseline): I = ½mr² */
const I_BASELINE = 0.5 * 1.8 * 0.15 * 0.15; // ≈ 0.02025 kg·m²

/** Moment of inertia range: [light CDJ, heavy broadcast deck] */
const I_MIN = 0.005;  // Very light — CDJ/controller feel
const I_MAX = 0.06;   // Very heavy — broadcast turntable

/** Bearing friction damping coefficient (velocity-proportional drag) */
const FRICTION_LINEAR = 0.008; // N·m·s/rad — stylus + bearing drag

/** Quadratic air drag coefficient (only noticeable at extreme speeds) */
const FRICTION_QUADRATIC = 0.0005; // N·m·(s/rad)²

/** Motor proportional gain — how aggressively motor corrects toward target.
 *  The motor doesn't just apply constant torque; it applies torque proportional
 *  to the velocity error, clamped to max torque. This gives the characteristic
 *  S-curve startup: fast initial acceleration tapering to gentle approach. */
const MOTOR_P_GAIN = 8.0;

/** Maximum playback rate (forward or backward) */
const MAX_RATE = 4.0;

/** When hand is on platter, how quickly record matches hand velocity.
 *  Very stiff — hand grip on vinyl is essentially rigid.
 *  Higher = more direct control (DJ expects near-instant response). */
const HAND_COUPLING = 80.0; // rad/s² per rad/s error — near-rigid hand-to-vinyl grip

// ─── Slipmat coupling constants ─────────────────────────────────────────────
//
// The slipmat is the felt pad between the motor platter and the vinyl record.
// It provides WEAK friction coupling: strong enough to bring the record back
// up to speed after release, but easily overcome by hand (scratching).

/** Kinetic (sliding) slipmat friction — when record and platter velocities differ.
 *  This is the "pull" the DJ feels from the motor while actively scratching.
 *  Low enough that it's barely perceptible during active hand movement. */
const SLIPMAT_KINETIC_COUPLING = 3.5; // rad/s² per rad/s error

/** Static slipmat friction — when record and platter are nearly matched.
 *  Slightly stiffer than kinetic to prevent the record from drifting off
 *  motor speed when not being touched (the record "locks" to the platter). */
const SLIPMAT_STATIC_COUPLING = 8.0; // rad/s² per rad/s error

/** Velocity difference threshold for static vs kinetic slipmat friction.
 *  Below this threshold, static coupling applies (record locked to platter). */
const SLIPMAT_BREAKAWAY_THRESHOLD = 0.15; // rad/s (~4% of normal speed)

/** After hand release, coupling ramps from kinetic → this value over RELEASE_RAMP_SEC.
 *  Stronger than active-scratch slipmat because the record is settling back
 *  onto the platter without hand resistance. Models the record "re-seating"
 *  onto the felt and increasing friction as it settles. */
const SLIPMAT_RELEASE_COUPLING = 14.0; // rad/s² per rad/s error

/** Duration of the release ramp (hand lifted → fully re-seated on platter).
 *  During this window, coupling interpolates from kinetic → release coupling.
 *  A real record takes about 0.5–1.0s to fully re-couple after a scratch. */
const RELEASE_RAMP_SEC = 0.6; // seconds

/** Spinback impulse — DJ yanks the record backward.
 *  Strong enough to decelerate and briefly reverse the platter.
 *  The motor stays ON and fights back, creating a "rubber band" arc:
 *  decel → brief reverse → motor pulls back to normal. */
const SPINBACK_BRAKE_TORQUE = 0.30; // N·m — strong backward yank

/** Extra friction during spinback (helps the brake phase, motor fights it) */
const SPINBACK_FRICTION_MULT = 2.0;

/** Motor P-gain boost during active spinback.
 *  The motor stays ON and uses boosted gain to fight the reverse impulse,
 *  creating the characteristic rubber-band return to normal speed. */
const SPINBACK_MOTOR_GAIN = 2.5;

/** Maximum reverse rate during spinback. Limits how far backward it goes. */
const SPINBACK_MAX_REVERSE_RATE = 1.0; // × normal speed

// ─── Power-cut (turntable power off) constants ──────────────────────────────

/** Friction multiplier during power-cut.
 *  Lower than spinback — just bearing/stylus drag, no hand resistance.
 *  This makes the coast-down take noticeably longer than a spinback. */
const POWERCUT_FRICTION_MULT = 0.5;

/** Small friction floor so the platter always eventually stops.
 *  Without this, very low angular velocity could coast indefinitely
 *  due to the velocity-proportional friction approaching zero. */
const POWERCUT_STATIC_FRICTION = 0.001; // N·m — tiny constant drag

// ─── Physics simulation ──────────────────────────────────────────────────────

export class TurntablePhysics {
  // ── State ──────────────────────────────────────────────────

  /** Angular velocity of the RECORD in rad/s. OMEGA_33 = normal playback (1.0×) */
  private _omega = OMEGA_33;

  /** Angular velocity of the MOTOR PLATTER (underneath the slipmat).
   *  The motor platter keeps spinning even when hand is on record.
   *  The record couples to it through slipmat friction. */
  private _motorPlatterOmega = OMEGA_33;

  /** Angular position in radians (wraps at 2π, for future beat-tracking) */
  private _theta = 0;

  /** Whether hand is touching the record (direct velocity control) */
  private _touching = false;

  /** Target hand angular velocity when touching (set by setHandVelocity) */
  private _handOmega = 0;

  /** Whether the motor is engaged (pulls motor platter toward targetOmega) */
  private _motorEnabled = true;

  /** Target angular velocity (normally OMEGA_33, adjustable for pitch ± ) */
  private _targetOmega = OMEGA_33;

  /** Moment of inertia of the record (derived from mass slider) */
  private _I = I_BASELINE;

  /** Pending external impulse torque applied to the RECORD (consumed each tick) */
  private _impulse = 0;

  /** Whether spinback is active (motor ON, fighting reverse impulse) */
  private _spinbackActive = false;

  /** Whether the platter has entered reverse during this spinback */
  private _spinbackWentReverse = false;

  /** Callback when spinback completes (platter back to normal) */
  private _onSpinbackComplete: (() => void) | null = null;

  /** Whether power-cut spindown is active (motor OFF, friction-only coast to zero) */
  private _powerCutActive = false;

  /** Callback when power-cut completes (platter stopped) */
  private _onPowerCutComplete: (() => void) | null = null;

  // ── Slipmat release state ──────────────────────────────────

  /** Time elapsed since hand was released (seconds). -1 = not in release ramp. */
  private _releaseElapsed = -1;

  /** Whether we're in the post-release ramp (record re-seating onto platter) */
  private get _inReleaseRamp(): boolean { return this._releaseElapsed >= 0 && this._releaseElapsed < RELEASE_RAMP_SEC; }

  // ── Getters ────────────────────────────────────────────────

  /** Current angular velocity in rad/s */
  get omega(): number { return this._omega; }

  /** Current playback rate: 1.0 = normal 33⅓, 0 = stopped, negative = backward */
  get playbackRate(): number { return this._omega / OMEGA_33; }

  /** Whether hand is on the platter */
  get touching(): boolean { return this._touching; }

  /** Whether motor is engaged */
  get motorEnabled(): boolean { return this._motorEnabled; }

  /** Whether spinback is in progress */
  get spinbackActive(): boolean { return this._spinbackActive; }

  /** Whether power-cut spindown is in progress */
  get powerCutActive(): boolean { return this._powerCutActive; }

  /** Angular position (0..2π) */
  get theta(): number { return this._theta; }

  // ── Configuration ──────────────────────────────────────────

  /**
   * Set platter mass via normalized 0–1 slider.
   * 0.0 = CDJ/light, 0.5 = Technics 1200, 1.0 = heavy broadcast deck.
   * Uses exponential interpolation for natural feel.
   */
  setMass(normalized: number): void {
    const t = Math.max(0, Math.min(1, normalized));
    // Exponential interpolation between I_MIN and I_MAX
    this._I = I_MIN * Math.pow(I_MAX / I_MIN, t);
  }

  /**
   * Set target angular velocity. Default is OMEGA_33 (33⅓ RPM = 1.0×).
   * Could be adjusted for pitch shift (e.g., ±8% like a real pitch fader).
   */
  setTargetSpeed(rate: number): void {
    this._targetOmega = OMEGA_33 * rate;
  }

  /**
   * Enable/disable the motor. When disabled, only friction decelerates.
   * Used during spinback.
   */
  setMotorEnabled(on: boolean): void {
    this._motorEnabled = on;
  }

  // ── Input methods ──────────────────────────────────────────

  /**
   * Apply an instantaneous impulse torque (scroll wheel nudge).
   * Positive = speed up (forward), negative = slow down / reverse.
   * Called once per scroll event — the impulse is consumed in the next tick.
   *
   * @param torque Impulse in N·m·s (angular impulse = torque × dt, but we
   *               treat it as instantaneous ΔL so it's added directly to ω)
   */
  applyImpulse(torque: number): void {
    this._impulse += torque;
  }

  /**
   * Set the record as "being touched" — hand on vinyl.
   * Hand coupling dominates; slipmat provides weak motor coupling underneath.
   * On release, the record gradually re-couples to the spinning motor platter
   * through slipmat friction (release ramp).
   */
  setTouching(touching: boolean): void {
    if (this._touching && !touching) {
      // Hand lifted — start the release ramp
      this._releaseElapsed = 0;
    }
    if (touching) {
      // Hand placed — cancel any release ramp
      this._releaseElapsed = -1;
    }
    this._touching = touching;
    if (!touching) {
      this._handOmega = 0;
    }
  }

  /**
   * Set the target hand angular velocity while touching.
   * The platter will be driven toward this velocity via hand coupling.
   *
   * @param omega Target angular velocity in rad/s.
   *              Use deltaToOmega() to convert pixel deltas.
   */
  setHandVelocity(omega: number): void {
    this._handOmega = omega;
  }

  /**
   * Trigger spinback: DJ yanks the record backward.
   *
   * The motor stays ON throughout — it fights the reverse impulse,
   * creating the characteristic "decel → brief reverse → spring back"
   * rubber-band arc. The stronger the impulse vs motor, the deeper
   * it goes into reverse before the motor wins.
   *
   * @param onComplete Callback when platter returns to normal speed
   */
  triggerSpinback(onComplete?: () => void): void {
    this._spinbackActive = true;
    this._spinbackWentReverse = false;
    this._powerCutActive = false; // Cancel any power-cut in progress
    this._motorEnabled = true; // Motor stays ON — fights the reverse
    this._onSpinbackComplete = onComplete ?? null;

    // Strong reverse impulse (against current direction)
    const brakeDir = this._omega >= 0 ? -1 : 1;
    this._impulse += brakeDir * SPINBACK_BRAKE_TORQUE;
  }

  /**
   * Trigger power-cut: turntable power is switched off.
   *
   * The motor disengages immediately. The platter coasts on its own inertia,
   * slowing down gradually due to bearing friction and stylus drag. There is
   * NO reverse — the platter simply decelerates to a stop.
   *
   * This takes noticeably longer than a spinback because there's much less
   * resistance — just passive friction, no hand or motor fighting the motion.
   *
   * @param onComplete Callback when platter reaches zero (fully stopped)
   */
  triggerPowerCut(onComplete?: () => void): void {
    this._powerCutActive = true;
    this._spinbackActive = false; // Cancel any spinback in progress
    this._spinbackWentReverse = false;
    this._motorEnabled = false; // Motor OFF — no torque
    this._onPowerCutComplete = onComplete ?? null;
  }

  /**
   * Force-reset to normal playback state (e.g., when transport stops).
   */
  reset(): void {
    this._omega = OMEGA_33;
    this._motorPlatterOmega = OMEGA_33;
    this._theta = 0;
    this._touching = false;
    this._handOmega = 0;
    this._motorEnabled = true;
    this._impulse = 0;
    this._spinbackActive = false;
    this._spinbackWentReverse = false;
    this._onSpinbackComplete = null;
    this._powerCutActive = false;
    this._onPowerCutComplete = null;
    this._releaseElapsed = -1;
  }

  // ── Physics tick ───────────────────────────────────────────

  /**
   * Advance the simulation by dt seconds.
   * Call this from requestAnimationFrame (typically 120–144Hz).
   *
   * Uses semi-implicit Euler integration (velocity first, then position)
   * for better energy conservation than basic Euler.
   *
   * @param dt Time step in seconds (typically 1/120 to 1/60)
   * @returns Current playback rate (omega / OMEGA_33)
   */
  tick(dt: number): number {
    // Clamp dt to prevent physics explosions on tab-switch
    const clampedDt = Math.min(dt, 0.05); // Max 50ms step

    // ══════════════════════════════════════════════════════════
    // STEP 1: Update MOTOR PLATTER (always spinning independently)
    // ══════════════════════════════════════════════════════════

    if (this._motorEnabled) {
      const motorError = this._targetOmega - this._motorPlatterOmega;
      const pGain = this._spinbackActive ? MOTOR_P_GAIN * SPINBACK_MOTOR_GAIN : MOTOR_P_GAIN;
      const motorTorque = Math.max(-MOTOR_TORQUE_BASE, Math.min(MOTOR_TORQUE_BASE,
        motorError * pGain * (this._I / I_BASELINE)
      ));
      // Motor platter has its own friction (bearing drag)
      const motorFriction = -FRICTION_LINEAR * this._motorPlatterOmega;
      const motorAlpha = (motorTorque + motorFriction) / this._I;
      this._motorPlatterOmega += motorAlpha * clampedDt;
      this._motorPlatterOmega = Math.max(0, Math.min(MAX_RATE * OMEGA_33, this._motorPlatterOmega));
    } else {
      // Power-cut: motor platter coasts down too
      const motorFriction = -FRICTION_LINEAR * POWERCUT_FRICTION_MULT * this._motorPlatterOmega;
      const staticFric = this._motorPlatterOmega > 0 ? -POWERCUT_STATIC_FRICTION : 0;
      this._motorPlatterOmega += ((motorFriction + staticFric) / this._I) * clampedDt;
      if (this._motorPlatterOmega < 0) this._motorPlatterOmega = 0;
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: Update RECORD (driven by hand + slipmat + friction)
    // ══════════════════════════════════════════════════════════

    let torqueNet = 0;

    // 1. Slipmat coupling — always active (record ↔ motor platter through felt)
    //    This is the KEY change: motor torque is indirect, through slipmat friction.
    const slipError = this._motorPlatterOmega - this._omega;
    const absSlipError = Math.abs(slipError);

    let slipmatCoupling: number;
    if (this._touching) {
      // While hand is on record: weak kinetic slipmat friction.
      // The DJ should barely feel the motor pull while actively scratching.
      slipmatCoupling = SLIPMAT_KINETIC_COUPLING;
    } else if (this._inReleaseRamp) {
      // Post-release ramp: coupling increases as record settles onto platter
      const t = Math.min(1, this._releaseElapsed / RELEASE_RAMP_SEC);
      // Smooth ease-in: slow start, fast finish (cubic)
      const eased = t * t * (3 - 2 * t); // smoothstep
      slipmatCoupling = SLIPMAT_KINETIC_COUPLING + (SLIPMAT_RELEASE_COUPLING - SLIPMAT_KINETIC_COUPLING) * eased;
    } else if (absSlipError < SLIPMAT_BREAKAWAY_THRESHOLD) {
      // Record is locked to platter (static friction) — normal playback
      slipmatCoupling = SLIPMAT_STATIC_COUPLING;
    } else {
      // Not touching, not in ramp, but record drifting — use release coupling
      slipmatCoupling = SLIPMAT_RELEASE_COUPLING;
    }

    const slipmatTorque = slipError * slipmatCoupling * this._I;
    torqueNet += slipmatTorque;

    // 2. Bearing/stylus friction on the RECORD (always opposes record motion)
    const frictionMult = this._spinbackActive ? SPINBACK_FRICTION_MULT
                       : this._powerCutActive ? POWERCUT_FRICTION_MULT
                       : 1.0;
    const linearFriction = -FRICTION_LINEAR * frictionMult * this._omega;
    const quadFriction = -FRICTION_QUADRATIC * frictionMult * this._omega * Math.abs(this._omega);
    torqueNet += linearFriction + quadFriction;

    // 2b. Static friction during power-cut (ensures record eventually stops)
    if (this._powerCutActive && this._omega !== 0) {
      const staticDir = this._omega > 0 ? -1 : 1;
      torqueNet += staticDir * POWERCUT_STATIC_FRICTION;
    }

    // 3. Hand coupling (when touching — strong grip on vinyl, dominates slipmat)
    if (this._touching) {
      const handError = this._handOmega - this._omega;
      const handTorque = handError * HAND_COUPLING * this._I;
      torqueNet += handTorque;
    }

    // 4. External impulse (consumed this tick)
    if (this._impulse !== 0) {
      torqueNet += this._impulse / clampedDt;
      this._impulse = 0;
    }

    // ── Semi-implicit Euler integration (RECORD) ────────

    const alpha = torqueNet / this._I;
    this._omega += alpha * clampedDt;

    // Clamp velocity to physical limits
    this._omega = Math.max(-MAX_RATE * OMEGA_33, Math.min(MAX_RATE * OMEGA_33, this._omega));

    // ── Advance release ramp timer ──────────────────────
    if (this._releaseElapsed >= 0) {
      this._releaseElapsed += clampedDt;
      if (this._releaseElapsed >= RELEASE_RAMP_SEC) {
        this._releaseElapsed = -1; // Ramp complete
      }
    }

    // Update position
    this._theta += this._omega * clampedDt;
    // Wrap theta to [0, 2π)
    if (this._theta >= 2 * Math.PI) this._theta -= 2 * Math.PI;
    if (this._theta < 0) this._theta += 2 * Math.PI;

    // ── Spinback state machine ────────────────────────
    //    Motor stays ON throughout. The impulse pushes backward,
    //    the motor fights back, creating a natural rubber-band arc.
    if (this._spinbackActive) {
      // Clamp reverse speed
      if (this._omega < -SPINBACK_MAX_REVERSE_RATE * OMEGA_33) {
        this._omega = -SPINBACK_MAX_REVERSE_RATE * OMEGA_33;
      }

      // Track whether platter has actually gone into reverse
      if (this._omega < -OMEGA_33 * 0.05) {
        this._spinbackWentReverse = true;
      }

      // Spinback complete: platter went reverse and motor pulled it back
      // to within 5% of target speed
      if (
        this._spinbackWentReverse &&
        this._omega > 0 &&
        Math.abs(this._omega - this._targetOmega) < OMEGA_33 * 0.05
      ) {
        this._spinbackActive = false;
        this._spinbackWentReverse = false;
        this._omega = this._targetOmega; // snap to exact target

        if (this._onSpinbackComplete) {
          const cb = this._onSpinbackComplete;
          this._onSpinbackComplete = null;
          cb();
        }
      }
    }

    // ── Power-cut state machine ──────────────────────────
    //    Motor OFF, friction-only deceleration. Never reverses.
    //    Completes when platter reaches near-zero angular velocity.
    if (this._powerCutActive) {
      // Clamp: never go into reverse during power-cut
      if (this._omega < 0) {
        this._omega = 0;
      }

      // Power-cut complete: platter has effectively stopped
      if (this._omega < OMEGA_33 * 0.01) {
        this._powerCutActive = false;
        this._omega = 0; // snap to zero

        if (this._onPowerCutComplete) {
          const cb = this._onPowerCutComplete;
          this._onPowerCutComplete = null;
          cb();
        }
      }
    }

    return this._omega / OMEGA_33;
  }

  // ── Utility ────────────────────────────────────────────────

  /**
   * Convert a scroll deltaY (pixels) to angular impulse torque.
   * Positive deltaY = scroll down = speed up (forward nudge).
   *
   * @param deltaY Raw wheel event deltaY in pixels
   * @param deltaMode 0=pixel, 1=line, 2=page (WheelEvent.deltaMode)
   * @returns Impulse value to pass to applyImpulse()
   */
  static deltaToImpulse(deltaY: number, deltaMode: number = 0): number {
    // Normalize deltaMode: line-mode mice send ~3 lines, page-mode is rare
    let normalizedDelta = deltaY;
    if (deltaMode === 1) normalizedDelta *= 40;  // DOM_DELTA_LINE
    if (deltaMode === 2) normalizedDelta *= 800; // DOM_DELTA_PAGE

    // Scale: ~100px scroll ≈ noticeable nudge (~5% speed change)
    // Impulse = delta × scale factor × I_baseline
    // Using I_baseline so the conversion is independent of current mass setting
    return normalizedDelta * 0.00015 * I_BASELINE;
  }

  /**
   * Convert a touch/trackpad pixel delta to angular velocity (rad/s).
   * Used for direct hand control while touching (2-finger mode).
   *
   * @param deltaY Touch delta in pixels (positive = dragging down = forward)
   * @param dt Time between events in seconds
   * @returns Angular velocity in rad/s to pass to setHandVelocity()
   */
  static deltaToAngularVelocity(deltaY: number, dt: number): number {
    if (dt <= 0) return 0;
    // Pixel velocity → angular velocity
    // ~300 px/s drag ≈ normal speed (OMEGA_33)
    const pixelVelocity = deltaY / dt;
    return (pixelVelocity / 300) * OMEGA_33;
  }

  /**
   * Convert a MIDI jog wheel relative CC value to angular velocity.
   * Standard DJ controller protocol: 0-63 = forward, 65-127 = backward.
   *
   * @param ccValue Raw CC value (0-127)
   * @returns Angular velocity in rad/s
   */
  static midiJogToAngularVelocity(ccValue: number): number {
    let velocity: number;
    if (ccValue <= 63) {
      velocity = ccValue / 32; // 0 to ~2 (forward)
    } else {
      velocity = -(128 - ccValue) / 32; // ~-2 to 0 (backward)
    }
    return velocity * OMEGA_33;
  }

  /**
   * Convert a MIDI jog wheel relative CC to nudge impulse (when not touching).
   * Lighter than direct velocity control — models spinning the outer ring.
   */
  static midiJogToImpulse(ccValue: number): number {
    let velocity: number;
    if (ccValue <= 63) {
      velocity = ccValue / 63;
    } else {
      velocity = -(128 - ccValue) / 63;
    }
    return velocity * 0.003 * I_BASELINE;
  }
}

/** Exported constant for reference */
export const OMEGA_NORMAL = OMEGA_33;
