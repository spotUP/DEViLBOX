/**
 * TB-303 synth registration
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { DB303Synth } from '../../db303/DB303Synth';
import { DEFAULT_TB303 } from '@/types/instrument';

function getNormalizedVolume(configVolume: number | undefined): number {
  return (configVolume ?? -12) + 15;
}

const tb303Desc: SynthDescriptor = {
  id: 'TB303',
  name: 'TB-303 Bass Line',
  category: 'wasm',
  loadMode: 'eager',
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 15,
  controlsComponent: 'TB303Controls',
  hardwareComponent: 'TB303Hardware',
  create: (config) => {
    const tb303Config = config.tb303 || { ...DEFAULT_TB303 };
    const normalizedVolume = getNormalizedVolume(config.volume);
    const synth = new DB303Synth();
    synth.applyConfig(tb303Config);
    if (normalizedVolume !== undefined) {
      synth.output.gain.value = Tone.dbToGain(normalizedVolume);
    }
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity, opts) => {
    if (typeof window !== 'undefined' && (window as unknown as { TB303_DEBUG_ENABLED?: boolean }).TB303_DEBUG_ENABLED) {
      console.log(
        `%c  └─► DB303.triggerAttack(%c"${note}", t=${time.toFixed(3)}, vel=${velocity.toFixed(2)}, acc=${opts.accent}, sld=${opts.slide}, ham=${opts.hammer}%c)`,
        'color: #66f', 'color: #aaa', 'color: #66f'
      );
    }
    (synth as DB303Synth).triggerAttack(note, time, velocity, opts.accent, opts.slide, opts.hammer);
    return true;
  },
  onTriggerRelease: (synth, _note, time) => {
    (synth as DB303Synth).triggerRelease(time);
    return true;
  },
};

SynthRegistry.register(tb303Desc);
