/**
 * The plate stage and its mix must never be able to disagree.
 *
 * The plate WASM is only built when `plateStage !== 'off'`, and the mix write
 * is dropped outright when there is no stage to write to. That produced two
 * ways for the Plate mix knob to be a control with nothing behind it:
 *
 *  1. Stage Off + a non-zero mix. The panel greys the slider out, so the knob
 *     is inert and the stored mix is a lie — it says 70% while nothing is
 *     wired. Reported 2026-10-02 as "the value doesn't change when I turn the
 *     plate mix knob".
 *
 *  2. A stage that is on with a mix of 0. Turning the stage on after the mix
 *     had been zeroed gives a plate that is installed, reporting itself
 *     correctly, and completely inaudible — the same dead-control shape one
 *     step later.
 *
 * Both are the identical defect the default `plateStage: 'off'` caused, which
 * is why the default changed to 'madprofessor' (see types/dub.ts). These two
 * rules close the remaining ways back in, whichever order the performer touches
 * the controls.
 */

import { DEFAULT_DUB_BUS, type DubBusSettings } from '@/types/dub';

/** The stage fitted when the performer reaches for the mix with none fitted. */
export const DEFAULT_PLATE_STAGE = DEFAULT_DUB_BUS.plateStage;

/** A mix you cannot hear. */
const INAUDIBLE_MIX = 0;

/**
 * Move a plate mix while no stage is fitted and fit the default one, so the
 * gesture the performer made — turning the mix up — is the gesture that lands.
 */
export function fitStageForMix(
  settings: DubBusSettings,
  patch: Partial<DubBusSettings>,
): Partial<DubBusSettings> {
  if (patch.plateStageMix === undefined) return patch;
  if (patch.plateStageMix <= INAUDIBLE_MIX) return patch;
  const nextStage = patch.plateStage ?? settings.plateStage;
  if (nextStage !== 'off') return patch;
  return { ...patch, plateStage: DEFAULT_PLATE_STAGE };
}

/**
 * Give a stage that has been switched on some level, unless the patch is
 * explicitly asking for silence. Without this a stage fitted at mix 0 is an
 * installed, correctly-reported, inaudible effect.
 */
export function audiblePlateMix(
  settings: DubBusSettings,
  patch: Partial<DubBusSettings>,
): Partial<DubBusSettings> {
  if (patch.plateStageMix !== undefined) return patch;
  const nextStage = patch.plateStage ?? settings.plateStage;
  if (nextStage === 'off') return patch;
  const nextMix = patch.plateStageMix ?? settings.plateStageMix;
  if (nextMix > INAUDIBLE_MIX) return patch;
  return { ...patch, plateStageMix: DEFAULT_DUB_BUS.plateStageMix };
}

/** Both rules, in the order that decides between them. */
export function reconcilePlateStage(
  settings: DubBusSettings,
  patch: Partial<DubBusSettings>,
): Partial<DubBusSettings> {
  return audiblePlateMix(settings, fitStageForMix(settings, patch));
}