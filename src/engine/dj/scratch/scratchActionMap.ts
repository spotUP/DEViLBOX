/**
 * Scratch action aliases onto the DJ FX registry (owner plan
 * `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 81, 82;
 * D2; ledger SCR-P2.9).
 *
 * `ScratchActionId` (pads, keyboard schemes, the 19 pattern slots) and the
 * tracker `Xnn` effect are ALIASES: every one resolves to a registry id and
 * fires through `fireDjFx` / `releaseDjFx`, the one execution path. Nothing
 * here performs; it only maps and forwards.
 *
 * Xnn (DeckEngine `_handleScratchEffect`): X00 stop; X01..X0F pattern slots
 * 1-15; X20..X2F slots 16-31 (the 19 slots need more than one nibble; the
 * tracker-view recorder of SCR-TRACKER writes the same numbers back);
 * X1n is the fader LFO and stays a deck control.
 */

import type { ScratchActionId } from '@/types/drumpad';
import { fireDjFx, releaseDjFx, type DjFxActionId, type DjFxFireOptions, type DjFxSource } from '@/engine/drumpad/DjFxActions';
import { SCRATCH_PATTERNS, getPatternByName } from '../DJScratchEngine';
import { useDJStore } from '@/stores/useDJStore';
import type { DeckId } from '../DeckEngine';

/** The 19 pattern-slot action ids in slot order (keyboard commands index SCRATCH_PATTERNS by position). */
export const SCRATCH_SLOT_ACTIONS: readonly ScratchActionId[] = [
  'scratch_baby', 'scratch_trans', 'scratch_flare', 'scratch_hydro', 'scratch_crab', 'scratch_orbit',
  'scratch_chirp', 'scratch_stab', 'scratch_scribble', 'scratch_tear', 'scratch_uzi', 'scratch_twiddle',
  'scratch_8crab', 'scratch_3flare', 'scratch_laser', 'scratch_phaser', 'scratch_tweak', 'scratch_drag',
  'scratch_vibrato',
];

/** Registry id of a pattern slot (by name). */
export function fxIdForPattern(patternName: string): DjFxActionId | null {
  const pattern = getPatternByName(patternName);
  return pattern ? `fx_scratch_${pattern.gestureId}` : null;
}

/** Every `ScratchActionId` onto a registry id; the fader LFO ids are deck controls, not gestures. */
export const SCRATCH_ACTION_TO_FX: Readonly<Record<ScratchActionId, DjFxActionId | null>> = {
  ...(Object.fromEntries(SCRATCH_SLOT_ACTIONS.map((id, i) => [id, `fx_scratch_${SCRATCH_PATTERNS[i]!.gestureId}`])) as Record<ScratchActionId, DjFxActionId>),
  scratch_stop: 'fx_scratch_stop',
  fader_lfo_off: null, fader_lfo_1_4: null, fader_lfo_1_8: null, fader_lfo_1_16: null, fader_lfo_1_32: null,
};

function activeDeck(): DeckId {
  try {
    const { decks } = useDJStore.getState();
    if (decks.B.isPlaying && !decks.A.isPlaying) return 'B';
    if (decks.C.isPlaying && !decks.A.isPlaying && !decks.B.isPlaying) return 'C';
  } catch { /* store not ready */ }
  return 'A';
}

/**
 * Fire a scratch action alias: `start` true = press, false = release,
 * undefined = toggle against the deck's running pattern. Returns false for
 * ids that are not gestures (fader LFO: the caller keeps its deck control).
 */
export function fireScratchAction(id: ScratchActionId, start: boolean | undefined, source: DjFxSource, opts: Omit<DjFxFireOptions, 'deck'> & { deck?: DeckId } = {}): boolean {
  const fxId = SCRATCH_ACTION_TO_FX[id];
  if (!fxId) return false;
  const deck = opts.deck ?? activeDeck();
  if (fxId === 'fx_scratch_stop') return fireDjFx(fxId, { ...opts, deck, source });
  let press = start;
  if (press === undefined) {
    const pattern = getPatternByName(SCRATCH_PATTERNS[SCRATCH_SLOT_ACTIONS.indexOf(id)]?.name ?? '');
    let running: string | null = null;
    try { running = useDJStore.getState().decks[deck].activePatternName; } catch { /* store not ready */ }
    press = !(pattern && running === pattern.name);
  }
  if (press) return fireDjFx(fxId, { ...opts, deck, source });
  releaseDjFx(fxId, { ...opts, deck, source });
  return true;
}

/** Tracker `Xnn` parameter -> registry action (null for the fader LFO nibble and unknown slots). */
export function scratchEffectToFx(param: number): { id: DjFxActionId; kind: 'fire' } | null {
  const hi = (param >> 4) & 0x0f;
  const lo = param & 0x0f;
  if (hi === 0x0 && lo === 0) return { id: 'fx_scratch_stop', kind: 'fire' };
  const slot = hi === 0x0 ? lo - 1 : hi === 0x2 ? 15 + lo : -1;
  const pattern = slot >= 0 ? SCRATCH_PATTERNS[slot] : undefined;
  if (!pattern) return null;
  return { id: `fx_scratch_${pattern.gestureId}`, kind: 'fire' };
}

/** The `Xnn` effect fires through the registry (source `tracker`); the pattern player restarts on a new slot. */
export function fireScratchEffect(param: number, deck: DeckId): boolean {
  const fx = scratchEffectToFx(param);
  if (!fx) return false;
  return fireDjFx(fx.id, { deck, source: 'tracker' });
}
