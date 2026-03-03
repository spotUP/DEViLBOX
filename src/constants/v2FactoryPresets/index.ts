import { V2_SPEECH_PRESETS } from './speech';
import { V2_KEYS_PRESETS } from './keys';
import { V2_BASS_PRESETS } from './bass';
import { V2_BRASS_PRESETS } from './brass';
import { V2_DRUMS_PRESETS } from './drums';
import { V2_EFFECTS_PRESETS } from './effects';
import { V2_LEADS_PRESETS } from './leads';
import { V2_PADS_PRESETS } from './pads';
import { V2_STRINGS_PRESETS } from './strings';
import { V2_SYNTHS_PRESETS } from './synths';
import { V2_INITPATCHES_PRESETS } from './initPatches';
import type { InstrumentPreset } from '@typedefs/instrument';

export { V2_SPEECH_PRESETS };
export { V2_KEYS_PRESETS };
export { V2_BASS_PRESETS };
export { V2_BRASS_PRESETS };
export { V2_DRUMS_PRESETS };
export { V2_EFFECTS_PRESETS };
export { V2_LEADS_PRESETS };
export { V2_PADS_PRESETS };
export { V2_STRINGS_PRESETS };
export { V2_SYNTHS_PRESETS };
export { V2_INITPATCHES_PRESETS };

/** All V2 factory presets combined */
export const V2_FACTORY_PRESETS: InstrumentPreset['config'][] = [
  ...V2_SPEECH_PRESETS,
  ...V2_KEYS_PRESETS,
  ...V2_BASS_PRESETS,
  ...V2_BRASS_PRESETS,
  ...V2_DRUMS_PRESETS,
  ...V2_EFFECTS_PRESETS,
  ...V2_LEADS_PRESETS,
  ...V2_PADS_PRESETS,
  ...V2_STRINGS_PRESETS,
  ...V2_SYNTHS_PRESETS,
  ...V2_INITPATCHES_PRESETS,
];
