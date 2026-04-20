/**
 * delayPreset380 / delayPresetDotted — one-shot moves that snap the
 * echo rate to a canonical dub setting.
 *
 * - 380 ms — the "Tubby / Perry chord delay" that pops up everywhere in
 *   the research. Use for vocal chops and chord stabs: a single throw
 *   lands into a familiar-feeling echo rhythm regardless of host BPM.
 * - Dotted 3/8 — 1.5-beat delay, research-quoted as "very typical".
 *   BPM-synced: computed from transport BPM at fire time so it always
 *   lines up with the track.
 *
 * Triggers; no dispose. The rate persists until the user (or another
 * move) changes it.
 */

import type { DubMove } from './_types';

export const delayPreset380: DubMove = {
  id: 'delayPreset380',
  kind: 'trigger',
  defaults: {},
  execute({ bus }) {
    bus.setEchoRate(380);
    return null;
  },
};

export const delayPresetDotted: DubMove = {
  id: 'delayPresetDotted',
  kind: 'trigger',
  defaults: {},
  execute({ bus, bpm }) {
    // Dotted 8th = 1.5 × quarter-note = 1.5 × (60 / bpm) seconds.
    const ms = (60_000 / Math.max(30, bpm)) * 1.5;
    bus.setEchoRate(ms);
    return null;
  },
};
