/**
 * OPL3 synth registration — Nuked OPL3 (YMF262) 18-channel FM (WASM)
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { OPL3Synth } from '../../opl3/OPL3Synth';

const opl3Desc: SynthDescriptor = {
  id: 'OPL3',
  name: 'OPL3 FM Synth',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: false,
  useSynthBus: true,
  volumeOffsetDb: 6,

  create: () => new OPL3Synth(),

  onTriggerAttack: (synth, note, time, velocity) => {
    (synth as OPL3Synth).triggerAttack(note, time, velocity);
    return true;
  },

  onTriggerRelease: (synth, note, time) => {
    (synth as OPL3Synth).triggerRelease(note, time);
    return true;
  },

  parameters: [
    // Operator 1 (modulator)
    { key: 'op1Attack', label: 'Op1 Attack', group: 'Op1', type: 'knob', min: 0, max: 15, default: 1 },
    { key: 'op1Decay', label: 'Op1 Decay', group: 'Op1', type: 'knob', min: 0, max: 15, default: 4 },
    { key: 'op1Sustain', label: 'Op1 Sustain', group: 'Op1', type: 'knob', min: 0, max: 15, default: 2 },
    { key: 'op1Release', label: 'Op1 Release', group: 'Op1', type: 'knob', min: 0, max: 15, default: 5 },
    { key: 'op1Level', label: 'Op1 Level', group: 'Op1', type: 'knob', min: 0, max: 63, default: 32 },
    { key: 'op1Multi', label: 'Op1 Multi', group: 'Op1', type: 'knob', min: 0, max: 15, default: 1 },
    { key: 'op1Waveform', label: 'Op1 Wave', group: 'Op1', type: 'knob', min: 0, max: 7, default: 0 },
    { key: 'op1Tremolo', label: 'Op1 Trem', group: 'Op1', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op1Vibrato', label: 'Op1 Vib', group: 'Op1', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op1SustainHold', label: 'Op1 Hold', group: 'Op1', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op1KSR', label: 'Op1 KSR', group: 'Op1', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op1KSL', label: 'Op1 KSL', group: 'Op1', type: 'knob', min: 0, max: 3, default: 0 },
    // Operator 2 (carrier)
    { key: 'op2Attack', label: 'Op2 Attack', group: 'Op2', type: 'knob', min: 0, max: 15, default: 1 },
    { key: 'op2Decay', label: 'Op2 Decay', group: 'Op2', type: 'knob', min: 0, max: 15, default: 4 },
    { key: 'op2Sustain', label: 'Op2 Sustain', group: 'Op2', type: 'knob', min: 0, max: 15, default: 2 },
    { key: 'op2Release', label: 'Op2 Release', group: 'Op2', type: 'knob', min: 0, max: 15, default: 5 },
    { key: 'op2Level', label: 'Op2 Level', group: 'Op2', type: 'knob', min: 0, max: 63, default: 0 },
    { key: 'op2Multi', label: 'Op2 Multi', group: 'Op2', type: 'knob', min: 0, max: 15, default: 1 },
    { key: 'op2Waveform', label: 'Op2 Wave', group: 'Op2', type: 'knob', min: 0, max: 7, default: 0 },
    { key: 'op2Tremolo', label: 'Op2 Trem', group: 'Op2', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op2Vibrato', label: 'Op2 Vib', group: 'Op2', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op2SustainHold', label: 'Op2 Hold', group: 'Op2', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op2KSR', label: 'Op2 KSR', group: 'Op2', type: 'toggle', min: 0, max: 1, default: 0 },
    { key: 'op2KSL', label: 'Op2 KSL', group: 'Op2', type: 'knob', min: 0, max: 3, default: 0 },
    // Global
    { key: 'feedback', label: 'Feedback', group: 'Global', type: 'knob', min: 0, max: 7, default: 0 },
    { key: 'connection', label: 'Additive', group: 'Global', type: 'toggle', min: 0, max: 1, default: 0 },
  ],
};

SynthRegistry.register(opl3Desc);
