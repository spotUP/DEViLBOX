/**
 * Tracker Scratch Commands — keyboard handlers for fader cut/mute and scratch
 * fader patterns during tracker playback.
 *
 * Unlike the DJ scratch commands (which require DJEngine + deck), these work
 * directly on the TrackerReplayer's masterGain via TrackerScratchController.
 * They work anytime the tracker is playing — no DJ mode required.
 *
 * Usage:
 *  - Fader cut: hold key to mute audio, release to unmute (keydown/keyup)
 *  - Patterns: toggle on/off (tap to start, tap again to stop)
 */

import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { useUIStore } from '@stores/useUIStore';
import { SCRATCH_PATTERNS } from '@engine/dj/DJScratchEngine';

// ── Fader cut (hold-to-mute) ────────────────────────────────────────────────

/** Engage fader cut (mute). Call on keydown. */
export function trackerFaderCutOn(): boolean {
  getTrackerScratchController().setFaderCut(true);
  useUIStore.getState().setStatusMessage('Fader: CUT', false, 300);
  return true;
}

/** Release fader cut (unmute). Call on keyup. */
export function trackerFaderCutOff(): boolean {
  getTrackerScratchController().setFaderCut(false);
  return true;
}

// ── Held-key pattern controls (keydown starts, keyup stops) ─────────────────

/** Start crab fader chop. Call on keydown. */
export function trackerCrabOn(): boolean {
  getTrackerScratchController().startFaderPattern('Crab');
  useUIStore.getState().setStatusMessage('CRAB scratch', false, 300);
  return true;
}

/** Stop crab fader chop. Call on keyup. */
export function trackerCrabOff(): boolean {
  getTrackerScratchController().stopFaderPattern();
  return true;
}

/** Start transformer fader chop. Call on keydown. */
export function trackerTransformerOn(): boolean {
  getTrackerScratchController().startFaderPattern('Transformer');
  useUIStore.getState().setStatusMessage('TRANSFORMER scratch', false, 300);
  return true;
}

/** Stop transformer fader chop. Call on keyup. */
export function trackerTransformerOff(): boolean {
  getTrackerScratchController().stopFaderPattern();
  return true;
}

/** Start flare fader pattern. Call on keydown. */
export function trackerFlareOn(): boolean {
  getTrackerScratchController().startFaderPattern('Flare');
  useUIStore.getState().setStatusMessage('FLARE scratch', false, 300);
  return true;
}

/** Stop flare fader pattern. Call on keyup. */
export function trackerFlareOff(): boolean {
  getTrackerScratchController().stopFaderPattern();
  return true;
}

// ── Pattern toggles ─────────────────────────────────────────────────────────

function togglePattern(name: string): boolean {
  const ctrl = getTrackerScratchController();
  ctrl.toggleFaderPattern(name);
  const msg = ctrl.activePatternName
    ? `Scratch: ${ctrl.activePatternName}`
    : 'Scratch: stopped';
  useUIStore.getState().setStatusMessage(msg, false, 1000);
  return true;
}

// Patterns with fader chops (the ones most useful during tracker playback)
export function trackerScratchTransformer(): boolean { return togglePattern(SCRATCH_PATTERNS[1].name); }  // Transformer
export function trackerScratchCrab():        boolean { return togglePattern(SCRATCH_PATTERNS[4].name); }  // Crab
export function trackerScratchFlare():       boolean { return togglePattern(SCRATCH_PATTERNS[2].name); }  // Flare
export function trackerScratchChirp():       boolean { return togglePattern(SCRATCH_PATTERNS[6].name); }  // Chirp
export function trackerScratchStab():        boolean { return togglePattern(SCRATCH_PATTERNS[7].name); }  // Stab
export function trackerScratch8Crab():       boolean { return togglePattern(SCRATCH_PATTERNS[12].name); } // 8-Finger Crab
export function trackerScratchTwiddle():     boolean { return togglePattern(SCRATCH_PATTERNS[11].name); } // Twiddle

/** Stop whatever pattern is running */
export function trackerScratchStop(): boolean {
  getTrackerScratchController().stopFaderPattern();
  useUIStore.getState().setStatusMessage('Scratch: stopped', false, 800);
  return true;
}

// ── Spinback ────────────────────────────────────────────────────────────────

/** Trigger spinback — platter brakes to a halt, then motor spins back up */
export function trackerSpinback(): boolean {
  getTrackerScratchController().triggerSpinback();
  useUIStore.getState().setStatusMessage('SPINBACK', false, 1000);
  return true;
}

// ── Power Cut ───────────────────────────────────────────────────────────────

/** Trigger power-cut — turntable power off, platter coasts to a stop */
export function trackerPowerCut(): boolean {
  getTrackerScratchController().triggerPowerCut();
  useUIStore.getState().setStatusMessage('POWER OFF', false, 2000);
  return true;
}
