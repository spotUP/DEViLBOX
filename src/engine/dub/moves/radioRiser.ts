/**
 * radioRiser — AM-radio-tuning-between-stations pink noise through a
 * bandpass sweep, rising over `sweepSec` into the downbeat. Classic
 * dub transition filler between sections. Research quote: "AM radio
 * tuning between stations fed through FX = tape-stop-adjacent pink-
 * noise riser."
 */

import type { DubMove } from './_types';

export const radioRiser: DubMove = {
  id: 'radioRiser',
  kind: 'trigger',
  defaults: { sweepSec: 1.2, startHz: 200, endHz: 5000, level: 0.7 },

  execute({ bus, params }) {
    const sweepSec = params.sweepSec ?? this.defaults.sweepSec;
    const startHz = params.startHz ?? this.defaults.startHz;
    const endHz = params.endHz ?? this.defaults.endHz;
    const level = params.level ?? this.defaults.level;
    console.log(`[radioRiser] fired ${startHz}→${endHz}Hz over ${sweepSec}s lvl=${level}`);
    bus.fireRadioRiser(startHz, endHz, sweepSec, level);
    return null;
  },
};
