/**
 * Zynthian WASM Synth Factory Presets
 * Wraps the inline preset maps from 14 Zynthian synth engines into
 * the InstrumentPreset['config'] format used by the PresetDropdown system.
 */

import type { InstrumentPreset } from '../types/instrument';

import { DX10_PRESETS, DEFAULT_MDA_DX10 } from '../engine/mda-dx10/MdaDX10Synth';
import { JX10_PRESETS, DEFAULT_MDA_JX10 } from '../engine/mda-jx10/MdaJX10Synth';
import { EPIANO_PRESETS, DEFAULT_MDA_EPIANO } from '../engine/mda-epiano/MdaEPianoSynth';
import { AMSYNTH_PRESETS, DEFAULT_AMSYNTH } from '../engine/amsynth/AMSynthSynth';
import { RAFFO_PRESETS, DEFAULT_RAFFO } from '../engine/raffo/RaffoSynth';
import { MONIQUE_PRESETS, DEFAULT_MONIQUE } from '../engine/monique/MoniqueSynth';
import { VL1_PRESETS, DEFAULT_VL1 } from '../engine/vl1/VL1Synth';
import { CALF_MONO_PRESETS, DEFAULT_CALF_MONO } from '../engine/calf-mono/CalfMonoSynth';
import { CALFMONO_NATIVE_FACTORY_PRESETS } from '../engine/calf-mono/CalfMonoSynth';
import { SYNTHV1_PRESETS, DEFAULT_SYNTHV1 } from '../engine/synthv1/SynthV1Synth';
import { AEOLUS_PRESETS, DEFAULT_AEOLUS } from '../engine/aeolus/AeolusSynth';
import { FLUIDSYNTH_PRESETS, DEFAULT_FLUIDSYNTH } from '../engine/fluidsynth/FluidSynthSynth';
import { SFIZZ_PRESETS, DEFAULT_SFIZZ } from '../engine/sfizz/SfizzSynth';
import { ZYNADDSUBFX_PRESETS, ZYNADDSUBFX_XML_PRESETS, DEFAULT_ZYNADDSUBFX } from '../engine/zynaddsubfx/ZynAddSubFXSynth';
import { TAL_NATIVE_FACTORY_PRESETS } from '../engine/tal-noizemaker/TalNoizeMakerSynth';
import { SETBFREE_NATIVE_FACTORY_PRESETS } from '../engine/setbfree/SetBfreeSynth';

/** Convert a synth engine's preset map into InstrumentPreset['config'][] */
function makePresets<D, P>(
  presetMap: Record<string, P>,
  synthType: string,
  configKey: string,
  defaultConfig: D,
): InstrumentPreset['config'][] {
  return Object.entries(presetMap).map(([name, config]) => {
    const preset: Record<string, unknown> = {
      type: 'synth',
      name,
      synthType,
      effects: [],
      volume: -8,
      pan: 0,
    };
    preset[configKey] = { ...(defaultConfig as any), ...(config as any) };
    return preset as InstrumentPreset['config'];
  });
}

export const MDA_DX10_FACTORY_PRESETS = makePresets(DX10_PRESETS, 'MdaDX10', 'mdaDX10', DEFAULT_MDA_DX10);
export const MDA_JX10_FACTORY_PRESETS = makePresets(JX10_PRESETS, 'MdaJX10', 'mdaJX10', DEFAULT_MDA_JX10);
export const MDA_EPIANO_FACTORY_PRESETS = makePresets(EPIANO_PRESETS, 'MdaEPiano', 'mdaEPiano', DEFAULT_MDA_EPIANO);
export const AMSYNTH_FACTORY_PRESETS = makePresets(AMSYNTH_PRESETS, 'Amsynth', 'amsynth', DEFAULT_AMSYNTH);
export const RAFFO_FACTORY_PRESETS = makePresets(RAFFO_PRESETS, 'RaffoSynth', 'raffo', DEFAULT_RAFFO);
export const MONIQUE_FACTORY_PRESETS = makePresets(MONIQUE_PRESETS, 'Monique', 'monique', DEFAULT_MONIQUE);
export const VL1_FACTORY_PRESETS = makePresets(VL1_PRESETS, 'VL1', 'vl1', DEFAULT_VL1);
export const CALF_MONO_FACTORY_PRESETS: InstrumentPreset['config'][] = [
  // Legacy flat config presets
  ...makePresets(CALF_MONO_PRESETS, 'CalfMono', 'calfMono', DEFAULT_CALF_MONO),
  // Native factory presets from upstream presets.xml
  ...CALFMONO_NATIVE_FACTORY_PRESETS.map(p => ({
    type: 'synth' as const,
    name: p.name,
    synthType: 'CalfMono',
    effects: [],
    volume: -8,
    pan: 0,
    calfMono: { ...DEFAULT_CALF_MONO },
    calfMonoNativePatch: p.name,
  } as InstrumentPreset['config'])),
];
export const SETBFREE_FACTORY_PRESETS: InstrumentPreset['config'][] =
  SETBFREE_NATIVE_FACTORY_PRESETS.map(p => ({
    type: 'synth' as const,
    name: p.name,
    synthType: 'SetBfree',
    effects: [],
    volume: -8,
    pan: 0,
    setbfreeNativePatch: p.name,
  } as InstrumentPreset['config']));
export const SYNTHV1_FACTORY_PRESETS = makePresets(SYNTHV1_PRESETS, 'SynthV1', 'synthv1', DEFAULT_SYNTHV1);
export const TAL_NOIZEMAKER_FACTORY_PRESETS: InstrumentPreset['config'][] =
  TAL_NATIVE_FACTORY_PRESETS.map(p => ({
    type: 'synth' as const,
    name: p.name,
    synthType: 'TalNoizeMaker',
    effects: [],
    volume: -8,
    pan: 0,
    talNativePatch: p.name,
  } as InstrumentPreset['config']));
export const AEOLUS_FACTORY_PRESETS = makePresets(AEOLUS_PRESETS, 'Aeolus', 'aeolus', DEFAULT_AEOLUS);
export const FLUIDSYNTH_FACTORY_PRESETS = makePresets(FLUIDSYNTH_PRESETS, 'FluidSynth', 'fluidsynth', DEFAULT_FLUIDSYNTH);
export const SFIZZ_FACTORY_PRESETS = makePresets(SFIZZ_PRESETS, 'Sfizz', 'sfizz', DEFAULT_SFIZZ);
export const ZYNADDSUBFX_FACTORY_PRESETS = [
  // Legacy flat config preset
  ...makePresets(ZYNADDSUBFX_PRESETS, 'ZynAddSubFX', 'zynaddsubfx', DEFAULT_ZYNADDSUBFX),
  // XML presets loaded natively by ZynAddSubFX's own XML parser
  ...Object.keys(ZYNADDSUBFX_XML_PRESETS).map(name => ({
    type: 'synth' as const,
    name,
    synthType: 'ZynAddSubFX',
    effects: [],
    volume: -8,
    pan: 0,
    zynaddsubfx: { ...DEFAULT_ZYNADDSUBFX },
    zynaddsubfxXmlPreset: name,
  } as InstrumentPreset['config'])),
];

export const ZYNTHIAN_PRESETS: InstrumentPreset['config'][] = [
  ...MDA_DX10_FACTORY_PRESETS,
  ...MDA_JX10_FACTORY_PRESETS,
  ...MDA_EPIANO_FACTORY_PRESETS,
  ...AMSYNTH_FACTORY_PRESETS,
  ...RAFFO_FACTORY_PRESETS,
  ...MONIQUE_FACTORY_PRESETS,
  ...VL1_FACTORY_PRESETS,
  ...CALF_MONO_FACTORY_PRESETS,
  ...SETBFREE_FACTORY_PRESETS,
  ...SYNTHV1_FACTORY_PRESETS,
  ...TAL_NOIZEMAKER_FACTORY_PRESETS,
  ...AEOLUS_FACTORY_PRESETS,
  ...FLUIDSYNTH_FACTORY_PRESETS,
  ...SFIZZ_FACTORY_PRESETS,
  ...ZYNADDSUBFX_FACTORY_PRESETS,
];
