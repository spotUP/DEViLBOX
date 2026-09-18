/**
 * Gate AE1 — the technical-assistive EQ driver, out of the performer's brain.
 *
 * Auto EQ was doing two unrelated jobs from inside AutoDub, and the mixture
 * made both harder to reason about:
 *
 *  1. TECHNICAL-ASSISTIVE. A corrective curve from genre, instrument hints and
 *     the spectrum, plus a spectral/beat-sync improv loop that nudges the
 *     return EQ's bands. This is engineering, not performance: it runs on its
 *     own cadence, it has no opinion about bars or phrases, and it should
 *     behave identically whichever persona is loaded.
 *  2. MUSICAL GESTURE. `eqSweep` and `hpfRise` — moves the performer CHOOSES,
 *     with an intention behind them, timed against the phrase.
 *
 * Only the second belongs to the brain. Keeping them in one file meant the
 * performer's tick was responsible for feeding a spectral loop it never reads,
 * and any change to one risked the other.
 *
 * The split is structural, not cosmetic: this module owns its own timers and
 * its own state, AutoDub only starts and stops it, and the gesture moves stay
 * where the decisions are.
 */

import { getPersona } from './AutoDubPersonas';
import { useDubStore } from '@/stores/useDubStore';
import { getActiveDubBus } from './DubBus';
import { computeImprovDelta, type EQSnapshot } from './AutoDub';

/**
 * The spectral snapshot the loop reads.
 *
 * Supplied by AutoDub rather than sampled here, because the analysis it comes
 * from is already being read once per tick and reading it twice would be two
 * different answers about the same instant.
 */
let _snapshot: EQSnapshot | null = null;

export function setAutoEqSnapshot(snapshot: EQSnapshot | null): void {
  _snapshot = snapshot;
}

let _improvTimer: ReturnType<typeof setInterval> | null = null;
let _improvRampTimer: ReturnType<typeof setInterval> | null = null;
let _prevEnergy = 0;
/** Per-band gain delta from improv loop (indices 0-3 = parametric bands P1-P4). */
const _improvBandDeltas = [0, 0, 0, 0];
/** Deltas applied in the PREVIOUS tick — subtracted before applying new deltas
 *  to avoid accumulation when returnEQ.getParams() already includes last tick's write. */
const _prevImprovBandDeltas = [0, 0, 0, 0];

export function makeFlatEqBaseline(): import('@/engine/effects/Fil4EqEffect').Fil4Params {
  return {
    hp: { enabled: false, freq: 40, q: 0.7 },
    lp: { enabled: false, freq: 20000, q: 0.7 },
    ls: { enabled: false, freq: 80, gain: 0, q: 0.7 },
    hs: { enabled: false, freq: 8000, gain: 0, q: 0.7 },
    p: [
      { enabled: false, freq: 200, bw: 1, gain: 0 },
      { enabled: false, freq: 500, bw: 1, gain: 0 },
      { enabled: false, freq: 2000, bw: 1, gain: 0 },
      { enabled: false, freq: 8000, bw: 1, gain: 0 },
    ],
    masterGain: 1,
  };
}

function _applyImprovDeltas(): void {
  try {
    const dubBus = getActiveDubBus?.();
    if (!dubBus) return;
    const returnEQ = dubBus.getReturnEQ();
    const current = returnEQ.getParams();
    for (let i = 0; i < 4; i++) {
      const b = current.p[i];
      if (!b) continue;
      const newGain = b.gain - _prevImprovBandDeltas[i] + _improvBandDeltas[i];
      // Auto-enable the band when gain is audible (> 0.2 dB); disable when it
      // returns to near-zero so we don't leave phantom filter nodes active.
      // Passing b.enabled was the bug — all return EQ bands start disabled, so
      // gain writes had no effect on audio even though values were changing.
      returnEQ.setBand(i, Math.abs(newGain) > 0.2, b.freq, b.bw, newGain);
    }
    for (let i = 0; i < 4; i++) _prevImprovBandDeltas[i] = _improvBandDeltas[i];
  } catch { /* ok */ }
}

function improvTick(): void {
  const dub = useDubStore.getState();
  const eqMode = dub.autoDubEqMode ?? 'both';
  if (eqMode === 'off' || eqMode === 'collaborative') {
    // No improv — ramp deltas toward zero this tick
    let changed = false;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(_improvBandDeltas[i]) > 0.01) {
        _improvBandDeltas[i] *= 0.85; // exponential decay
        changed = true;
      } else {
        _improvBandDeltas[i] = 0;
      }
    }
    if (changed) _applyImprovDeltas();
    return;
  }

  const snapshot = _snapshot;
  if (!snapshot) return;

  const persona = getPersona(dub.autoDubPersona);
  const cfg = persona.improvConfig;
  if (!cfg) return;

  const depthMult = dub.autoDubEqDepthMult ?? 1.0;
  const effectiveDepth = cfg.depth * depthMult;
  const { energy, beatPhase, frequencyPeaks } = snapshot;

  for (const bandIdx of cfg.liveBands) {
    if (bandIdx < 0 || bandIdx > 3) continue;
    const baseline = snapshot.baseline.p[bandIdx];
    if (!baseline) continue;

    let delta: number;

    if (cfg.driver === 'spectral') {
      // Find frequency peak nearest this band's center frequency
      const bandFreq = baseline.freq;
      if (frequencyPeaks.length === 0) {
        delta = 0;
      } else {
        const nearest = frequencyPeaks.reduce(
          (best, p) => Math.abs(p[0] - bandFreq) < Math.abs(best[0] - bandFreq) ? p : best,
          frequencyPeaks[0],
        );
        const peakAboveBaseline = nearest[1] - baseline.gain;
        delta = peakAboveBaseline > 3
          ? -effectiveDepth * 0.4  // Problem frequency: gentle cut
          : effectiveDepth * 0.3;  // Sweet spot: gentle boost
      }
    } else {
      delta = computeImprovDelta(cfg.driver, beatPhase, energy, _prevEnergy, effectiveDepth);
    }

    _improvBandDeltas[bandIdx] = Math.max(-effectiveDepth, Math.min(effectiveDepth, delta));
  }

  _prevEnergy = energy;
  _applyImprovDeltas();
}

function _rampBandsToBaseline(): void {
  if (_improvRampTimer !== null) {
    clearInterval(_improvRampTimer);
    _improvRampTimer = null;
  }
  // Exponential decay to zero over ~200ms
  _improvRampTimer = setInterval(() => {
    let allZero = true;
    for (let i = 0; i < 4; i++) {
      _improvBandDeltas[i] *= 0.7;
      if (Math.abs(_improvBandDeltas[i]) > 0.01) allZero = false;
      else _improvBandDeltas[i] = 0;
    }
    _applyImprovDeltas();
    if (allZero) {
      if (_improvRampTimer !== null) {
        clearInterval(_improvRampTimer);
        _improvRampTimer = null;
      }
      _prevImprovBandDeltas.fill(0);
    }
  }, 20);
}

export function startAutoEqDriver(): void {
  if (_improvTimer !== null) return;
  if (_improvRampTimer !== null) {
    clearInterval(_improvRampTimer);
    _improvRampTimer = null;
  }
  const persona = getPersona(useDubStore.getState().autoDubPersona);
  const rate = persona.improvConfig?.rate ?? 1.0;
  const cadenceMs = Math.max(50, Math.round(250 / rate));
  _improvTimer = setInterval(improvTick, cadenceMs);
}

export function stopAutoEqDriver(): void {
  if (_improvTimer !== null) {
    clearInterval(_improvTimer);
    _improvTimer = null;
  }
  _rampBandsToBaseline();
}

/**
 * Forget the driver's accumulated deltas — a new session or a new song.
 *
 * Owned here rather than reset by AutoDub reaching into these arrays, which is
 * what made the two concerns hard to separate in the first place.
 */
export function resetAutoEqDriver(): void {
  _prevEnergy = 0;
  _improvBandDeltas.fill(0);
  _prevImprovBandDeltas.fill(0);
}
