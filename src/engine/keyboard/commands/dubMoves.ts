/**
 * Dub Move keyboard commands — fire any move from `DubRouter.MOVES` via the
 * global keyboard layer. Mirrors the `djScratch.ts` pattern: exported helpers
 * are registered in `useGlobalKeyboardHandler.ts`; the scheme JSON file binds
 * actual keys to the command names.
 *
 * Two shapes:
 *   - trigger moves (`echoThrow`, `dubStab`, …) — fire once on press.
 *   - hold moves (`filterDrop`, `dubSiren`, …) — fire on press, dispose on
 *     release. The handler is called twice: `handler(true)` on keydown,
 *     `handler(false)` on keyup (mirrors `djScratchBaby(start)`).
 *
 * Source of truth for trigger/hold kind is `DUB_MOVE_KINDS` in
 * `parameterRouter.ts`. A contract test in
 * `__tests__/dubMovesContract.test.ts` verifies every move in the router has
 * a matching keyboard command here, so adding a new move to the registry
 * without a keyboard binding fails CI before it ships.
 */

import { fire } from '@engine/dub/DubRouter';
import { useUIStore } from '@stores/useUIStore';

type MoveHandler = (start?: boolean) => boolean;

// Hold-move disposers keyed by moveId. One disposer per move — pressing the
// same hold key twice without releasing is safe: the old disposer is called
// before the new one is stored (mirrors the DJ scratch single-active-pattern
// guard). Multi-touch chord playing is NOT a goal here; each key maps to
// one logical move.
const heldDisposers = new Map<string, { dispose(): void }>();

/**
 * Clear the held-disposer for a move. Exposed for tests + emergency-panic
 * handlers that want to release every held move at once.
 */
export function clearHeldDubMoves(): void {
  for (const [, disp] of heldDisposers) {
    try { disp.dispose(); } catch { /* ok */ }
  }
  heldDisposers.clear();
}

function fireTrigger(moveId: string, label: string): boolean {
  try {
    fire(moveId, undefined, {}, 'live');
    useUIStore.getState().setStatusMessage(`Dub: ${label}`, false, 800);
  } catch {
    useUIStore.getState().setStatusMessage('Dub bus not ready', false, 1000);
  }
  return true;
}

function startHold(moveId: string, label: string): boolean {
  // Defensive: if a previous press didn't release (key-repeat, focus loss,
  // browser swallowed keyup), release the old disposer before re-firing.
  const existing = heldDisposers.get(moveId);
  if (existing) {
    try { existing.dispose(); } catch { /* ok */ }
    heldDisposers.delete(moveId);
  }
  try {
    const disp = fire(moveId, undefined, {}, 'live');
    if (disp) heldDisposers.set(moveId, disp);
    useUIStore.getState().setStatusMessage(`Dub: ${label}`, false, 800);
  } catch {
    useUIStore.getState().setStatusMessage('Dub bus not ready', false, 1000);
  }
  return true;
}

function stopHold(moveId: string): boolean {
  const disp = heldDisposers.get(moveId);
  if (!disp) return true;
  heldDisposers.delete(moveId);
  try { disp.dispose(); } catch { /* ok */ }
  return true;
}

// ── Trigger moves ──────────────────────────────────────────────────────────
export function dubEchoThrow():         boolean { return fireTrigger('echoThrow',         'Echo Throw'); }
export function dubStab():              boolean { return fireTrigger('dubStab',           'Dub Stab'); }
export function dubChannelThrow():      boolean { return fireTrigger('channelThrow',      'Channel Throw'); }
export function dubSpringSlam():        boolean { return fireTrigger('springSlam',        'Spring Slam'); }
export function dubSnareCrack():        boolean { return fireTrigger('snareCrack',        'Snare Crack'); }
export function dubDelayTimeThrow():    boolean { return fireTrigger('delayTimeThrow',    'Delay Throw'); }
export function dubBackwardReverb():    boolean { return fireTrigger('backwardReverb',    'Backward Reverb'); }
export function dubReverseEcho():       boolean { return fireTrigger('reverseEcho',       'Reverse Echo'); }
export function dubSonarPing():         boolean { return fireTrigger('sonarPing',         'Sonar Ping'); }
export function dubRadioRiser():        boolean { return fireTrigger('radioRiser',        'Radio Riser'); }
export function dubSubSwell():          boolean { return fireTrigger('subSwell',          'Sub Swell'); }
export function dubEchoBuildUp():       boolean { return fireTrigger('echoBuildUp',       'Echo Build Up'); }

// ── Hold moves (handler(true) on press, handler(false) on release) ────────
function holdCommand(moveId: string, label: string): MoveHandler {
  return (start: boolean = true) => (start ? startHold(moveId, label) : stopHold(moveId));
}

export const dubChannelMute:  MoveHandler = holdCommand('channelMute',   'Channel Mute');
export const dubFilterDrop:   MoveHandler = holdCommand('filterDrop',    'Filter Drop');
export const dubSiren:        MoveHandler = holdCommand('dubSiren',      'Siren');
export const dubTapeWobble:   MoveHandler = holdCommand('tapeWobble',    'Tape Wobble');
export const dubMasterDrop:   MoveHandler = holdCommand('masterDrop',    'Master Drop');
export const dubToast:        MoveHandler = holdCommand('toast',         'Toast');
export const dubTapeStop:          MoveHandler = holdCommand('tapeStop',          'Tape Stop');
export const dubTransportTapeStop: MoveHandler = holdCommand('transportTapeStop', 'Transport Tape Stop');
export const dubTubbyScream:  MoveHandler = holdCommand('tubbyScream',   'Tubby Scream');
export const dubStereoDoubler: MoveHandler = holdCommand('stereoDoubler', 'Stereo Doubler');
export const dubOscBass:      MoveHandler = holdCommand('oscBass',       'Osc Bass');
export const dubCrushBass:    MoveHandler = holdCommand('crushBass',     'Crush Bass');
export const dubSubHarmonic:  MoveHandler = holdCommand('subHarmonic',   'Sub Harmonic');
export const dubEqSweep:      MoveHandler = holdCommand('eqSweep',       'EQ Sweep');
export const dubDelayPreset380:     MoveHandler = holdCommand('delayPreset380',     '380ms');
export const dubDelayPresetDotted:  MoveHandler = holdCommand('delayPresetDotted',  'Dotted');
export const dubDelayPresetQuarter: MoveHandler = holdCommand('delayPresetQuarter', '1/4');
export const dubDelayPreset8th:     MoveHandler = holdCommand('delayPreset8th',     '1/8');
export const dubDelayPresetTriplet: MoveHandler = holdCommand('delayPresetTriplet', 'Triplet');
export const dubDelayPreset16th:    MoveHandler = holdCommand('delayPreset16th',    '1/16');
export const dubDelayPresetDoubler: MoveHandler = holdCommand('delayPresetDoubler', 'Doubler');
export function dubSpringKick():         boolean { return fireTrigger('springKick', 'Spring Kick'); }
export const dubGhostReverb:    MoveHandler = holdCommand('ghostReverb',    'Ghost Reverb');
export const dubVoltageStarve: MoveHandler = holdCommand('voltageStarve',  'Voltage Starve');
export const dubRingMod:       MoveHandler = holdCommand('ringMod',        'Ring Modulator');
export const dubHpfRise:       MoveHandler = holdCommand('hpfRise',        'HPF Rise (Big Knob)');
export const dubMadProfPingPong: MoveHandler = holdCommand('madProfPingPong', 'Mad Prof Ping-Pong');
export const dubCombSweep:      MoveHandler = holdCommand('combSweep',      'Liquid Comb Sweep');

// ── Panic — release everything ────────────────────────────────────────────
export function dubPanicReleaseAll(): boolean {
  clearHeldDubMoves();
  useUIStore.getState().setStatusMessage('Dub: panic release', false, 600);
  return true;
}
