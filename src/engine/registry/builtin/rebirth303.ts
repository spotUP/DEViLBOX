/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 303 synth registration - acid bass voice (Web Audio, no WASM).
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { ReBirth303Synth } from '../../rerebirth303/ReBirth303Synth';
import { DEFAULT_REBIRTH303 } from '@/types/instrument';

const rebirth303Desc: SynthDescriptor = {
  id: 'ReRebirth303',
  name: 're-rebirth 303',
  category: 'native',
  loadMode: 'eager',
  sharedInstance: false,
  useSynthBus: true,
  // The voice is calibrated to the source's level (peaks at about +2 dBFS at 0 dB); a boost here only clips it
  volumeOffsetDb: 0,
  controlsComponent: 'ReBirth303Controls',

  create: (config) => new ReBirth303Synth(config.rebirth303 || { ...DEFAULT_REBIRTH303 }),

  onTriggerAttack: (synth, note, time, velocity, opts) => {
    (synth as ReBirth303Synth).triggerAttack(note, time, velocity, opts.accent, opts.slide);
    return true;
  },

  onTriggerRelease: (synth, note, time, _opts) => {
    (synth as ReBirth303Synth).triggerRelease(note, time);
    return true;
  },

  parameters: [
    { key: 'tuning', label: 'Tuning', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.5 },
    { key: 'cutoff', label: 'Cut Off Frequency', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.35 },
    { key: 'resonance', label: 'Resonance', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.78 },
    { key: 'envmod', label: 'Env Mod', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.55 },
    { key: 'decay', label: 'Decay', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.4 },
    { key: 'accent', label: 'Accent', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.7 },
    { key: 'volume', label: 'Volume', group: 'Main', type: 'knob', min: 0, max: 1, default: 0.8 },
    { key: 'waveform', label: 'Waveform', group: 'Main', type: 'select', min: 0, max: 1, default: 0,
      options: [{ value: 0, label: 'Sawtooth' }, { value: 1, label: 'Square' }] },
  ],
};

SynthRegistry.register(rebirth303Desc);
