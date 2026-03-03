/**
 * Assembled SYNTH_INFO record from all per-family entries
 */

import type { SynthType } from '@typedefs/instrument';
import type { SynthInfo } from './types';
import { classicSynthEntries } from './classicSynths';
import { percussionSynthEntries } from './percussionSynths';
import { sampleSynthEntries } from './sampleSynths';
import { furnaceChipEntries } from './furnaceChips';
import { buzzMachineEntries } from './buzzMachines';
import { mameSynthEntries } from './mameSynths';
import { pluginSynthEntries } from './pluginSynths';
import { fxSynthEntries } from './fxSynths';
import { amigaSynthEntries } from './amigaSynths';

export const SYNTH_INFO: Record<SynthType, SynthInfo> = {
  ...classicSynthEntries,
  ...percussionSynthEntries,
  ...sampleSynthEntries,
  ...furnaceChipEntries,
  ...buzzMachineEntries,
  ...mameSynthEntries,
  ...pluginSynthEntries,
  ...fxSynthEntries,
  ...amigaSynthEntries,
} as Record<SynthType, SynthInfo>;
