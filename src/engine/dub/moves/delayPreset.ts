/**
 * delayPreset380 / delayPresetDotted / delayPresetQuarter / delayPreset8th /
 * delayPresetTriplet / delayPreset16th / delayPresetDoubler — toggle moves
 * that snap the echo rate to a canonical dub timing.
 *
 * Toggle (hold) semantics:
 *   - Activate: captures the current echo rate, applies the preset rate.
 *   - Deactivate (dispose): restores the captured rate.
 *
 * This lets the DubDeckStrip implement mutual exclusion: clicking one rate
 * deactivates the previous one (restoring the original rate) before the new
 * one activates. The performer gets a radio-button feel — only one rate is
 * "on" at a time, and toggling it off reverts to the original setting.
 *
 * - 380 ms  — King Tubby / Lee Perry chord delay
 * - Dotted  — 1.5-beat delay (very typical in classic dub)
 * - 1/4     — quarter note (on-beat echo)
 * - 1/8     — 8th note (double-time)
 * - Triplet — 2/3 beat (swing/gallop feel)
 * - 1/16    — 16th note (dense machine-gun echo)
 * - Doubler — 25ms slapback (beat doubling, not a true echo)
 */

import type { DubMove } from './_types';

function rateToggle(getMs: (bpm: number) => number): DubMove['execute'] {
  return ({ bus, bpm }) => {
    const prev = bus.getEchoRateMs();
    bus.setEchoRate(getMs(bpm));
    return { dispose: () => bus.setEchoRate(prev) };
  };
}

export const delayPreset380: DubMove = {
  id: 'delayPreset380', kind: 'hold', defaults: {},
  execute: rateToggle(() => 380),
};

export const delayPresetDotted: DubMove = {
  id: 'delayPresetDotted', kind: 'hold', defaults: {},
  execute: rateToggle((bpm) => (60_000 / Math.max(30, bpm)) * 1.5),
};

export const delayPresetQuarter: DubMove = {
  id: 'delayPresetQuarter', kind: 'hold', defaults: {},
  execute: rateToggle((bpm) => 60_000 / Math.max(30, bpm)),
};

export const delayPreset8th: DubMove = {
  id: 'delayPreset8th', kind: 'hold', defaults: {},
  execute: rateToggle((bpm) => 30_000 / Math.max(30, bpm)),
};

export const delayPresetTriplet: DubMove = {
  id: 'delayPresetTriplet', kind: 'hold', defaults: {},
  execute: rateToggle((bpm) => (60_000 / Math.max(30, bpm)) * (2 / 3)),
};

export const delayPreset16th: DubMove = {
  id: 'delayPreset16th', kind: 'hold', defaults: {},
  execute: rateToggle((bpm) => 15_000 / Math.max(30, bpm)),
};

export const delayPresetDoubler: DubMove = {
  id: 'delayPresetDoubler', kind: 'hold', defaults: {},
  execute: rateToggle(() => 25),
};
