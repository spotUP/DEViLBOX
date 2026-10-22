/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Shared registry descriptor for the re-rebirth 808 / 909 drum machines (Web Audio, no WASM).
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { ReBirthDrumSynth } from '../../rebirthdrums/ReBirthDrumSynth';
import { REBIRTH_LAYOUTS, drumKitDefaults, drumParamKey, type DrumKitId } from '../../rebirthdrums/rebirthDrumLayout';

export function registerReBirthDrumKit(kit: DrumKitId): void {
  const layout = REBIRTH_LAYOUTS[kit];
  const defaults = drumKitDefaults(layout);
  const configKey = kit === '808' ? 'rebirth808' : 'rebirth909';

  const parameters: NonNullable<SynthDescriptor['parameters']> = [];
  for (const group of layout.groups) {
    for (const knob of group.knobs) {
      const key = drumParamKey(group.id, knob.key);
      const label = `${group.label} ${knob.label}`;
      if (knob.switchLabels) {
        parameters.push({
          key, label, group: group.label, type: 'select', min: 0, max: 1, default: knob.def,
          options: [{ value: 0, label: knob.switchLabels[0] }, { value: 1, label: knob.switchLabels[1] }],
        });
      } else {
        parameters.push({ key, label, group: group.label, type: 'knob', min: 0, max: 1, default: knob.def });
      }
    }
  }

  const desc: SynthDescriptor = {
    id: kit === '808' ? 'ReRebirth808' : 'ReRebirth909',
    name: `re-rebirth ${kit}`,
    category: 'native',
    loadMode: 'eager',
    sharedInstance: false,
    useSynthBus: true,
    // Drum hits peak 4 to 16 dB under the 303 voice at the same instrument volume; this brings the kicks level with it
    volumeOffsetDb: 4,
    controlsComponent: kit === '808' ? 'ReBirth808Controls' : 'ReBirth909Controls',

    create: (config) => new ReBirthDrumSynth(kit, config[configKey] || { ...defaults }),

    onTriggerAttack: (synth, note, time, velocity, opts) => {
      (synth as ReBirthDrumSynth).triggerAttack(note, time, velocity, opts.accent);
      return true;
    },

    onTriggerRelease: (synth, note, time, _opts) => {
      (synth as ReBirthDrumSynth).triggerRelease(note, time);
      return true;
    },

    parameters,
  };

  SynthRegistry.register(desc);
}
