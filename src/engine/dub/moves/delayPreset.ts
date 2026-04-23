/**
 * delayPreset380 / delayPresetDotted / delayPresetQuarter / delayPreset8th /
 * delayPresetTriplet / delayPreset16th / delayPresetDoubler — one-shot moves
 * that snap the echo rate to a canonical dub setting.
 *
 * - 380 ms — the "Tubby / Perry chord delay" that pops up everywhere in
 *   the research. Use for vocal chops and chord stabs: a single throw
 *   lands into a familiar-feeling echo rhythm regardless of host BPM.
 * - Dotted 3/8 — 1.5-beat delay, research-quoted as "very typical".
 *   BPM-synced: computed from transport BPM at fire time so it always
 *   lines up with the track.
 * - Quarter — 1 beat. Standard on-beat echo.
 * - 8th — half beat. Double-time echo.
 * - Triplet — 2/3 beat. Swing-feel echo that creates a galloping rhythm.
 * - 16th — quarter beat. Machine-gun echo, dense.
 * - Doubler — 25ms. Not an echo at all — doubles the source like a
 *   short slapback. Techniken Defunkus technique from the Dubroom.
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

export const delayPresetQuarter: DubMove = {
  id: 'delayPresetQuarter',
  kind: 'trigger',
  defaults: {},
  execute({ bus, bpm }) {
    const ms = 60_000 / Math.max(30, bpm);
    bus.setEchoRate(ms);
    return null;
  },
};

export const delayPreset8th: DubMove = {
  id: 'delayPreset8th',
  kind: 'trigger',
  defaults: {},
  execute({ bus, bpm }) {
    const ms = 30_000 / Math.max(30, bpm);
    bus.setEchoRate(ms);
    return null;
  },
};

export const delayPresetTriplet: DubMove = {
  id: 'delayPresetTriplet',
  kind: 'trigger',
  defaults: {},
  execute({ bus, bpm }) {
    // Triplet quarter = 2/3 of a beat
    const ms = (60_000 / Math.max(30, bpm)) * (2 / 3);
    bus.setEchoRate(ms);
    return null;
  },
};

export const delayPreset16th: DubMove = {
  id: 'delayPreset16th',
  kind: 'trigger',
  defaults: {},
  execute({ bus, bpm }) {
    const ms = 15_000 / Math.max(30, bpm);
    bus.setEchoRate(ms);
    return null;
  },
};

export const delayPresetDoubler: DubMove = {
  id: 'delayPresetDoubler',
  kind: 'trigger',
  defaults: {},
  execute({ bus }) {
    // 25ms slapback — beat doubling, not an echo
    bus.setEchoRate(25);
    return null;
  },
};
