/**
 * hpfRise — Tubby's "Big Knob" HPF sweep gesture.
 *
 * Sweeps the bus highpass filter UP through Altec positions to a peak
 * frequency, holds, then sweeps back down. In stepped mode the movement
 * clicks through 11 discrete Altec 9069B positions at 80ms intervals —
 * the rhythmic staccato that made Tubby's filter sweeps instantly
 * recognisable. In continuous mode it ramps smoothly.
 *
 * The Altec resonance node tracks along so the hump follows the peak.
 *
 * This is the OPPOSITE of filterDrop: that move is an LPF sweep down;
 * this is an HPF sweep up — which is what Tubby actually did most of the
 * time (opening up the bass progressively into a full-spectrum climax).
 */

import type { DubMove } from './_types';

export const hpfRise: DubMove = {
  id: 'hpfRise',
  kind: 'hold',
  defaults: { peakHz: 2000, holdMs: 1000 },

  execute({ bus, params }) {
    const peakHz = (params.peakHz as number | undefined) ?? 2000;
    const holdMs = (params.holdMs as number | undefined) ?? 1000;
    const release = bus.startHpfRise(peakHz, holdMs);
    return { dispose: release };
  },
};
