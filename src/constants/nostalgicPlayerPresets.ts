/**
 * N15(a): the NostalgicPlayer preset banks (src/constants/presets/nostalgicplayer)
 * as preset-browser entries. One adapter converts every bank; the browser
 * (LoadPresetModal) reads them through PRESET_CATEGORIES like any other bank and
 * shows each only while the open song's format can hold that synth type.
 *
 * The bank params are the WASM replayer's set_instrument_param() keys, so they
 * travel unchanged in `parameters`; they are not renamed onto a typed config.
 */
import type { InstrumentPreset, SynthType } from '../types/instrument';
import { ACTIONAMICS_PRESETS } from './presets/nostalgicplayer/actionamicsPresets';
import { DELTA_MUSIC_1_PRESETS } from './presets/nostalgicplayer/deltaMusic1Presets';
import { DELTA_MUSIC_2_PRESETS } from './presets/nostalgicplayer/deltaMusic2Presets';
import { DIGITAL_MUGICIAN_PRESETS } from './presets/nostalgicplayer/digitalMugicianPresets';
import { FRED_EDITOR_PRESETS } from './presets/nostalgicplayer/fredEditorPresets';
import { IN_STEREO_2_PRESETS } from './presets/nostalgicplayer/inStereo2Presets';
import { SONIC_ARRANGER_PRESETS } from './presets/nostalgicplayer/sonicArrangerPresets';
import { SOUND_MON_PRESETS } from './presets/nostalgicplayer/soundMonPresets';

export interface NostalgicPlayerRawPreset {
  name: string;
  category: string;
  params: Record<string, number>;
}

type PresetConfig = InstrumentPreset['config'];

/** Convert one bank entry to a browser entry for the given synth type. */
export function nostalgicPlayerPresetToConfig(synthType: SynthType, p: NostalgicPlayerRawPreset): PresetConfig {
  return {
    type: 'synth',
    name: p.name,
    synthType,
    parameters: { ...p.params, presetCategory: p.category },
    effects: [],
    volume: -6,
    pan: 0,
  };
}

export function nostalgicPlayerBank(synthType: SynthType, presets: readonly NostalgicPlayerRawPreset[]): PresetConfig[] {
  return presets.map((p) => nostalgicPlayerPresetToConfig(synthType, p));
}

/** Browser category name -> synth type its entries are for. */
export const NOSTALGICPLAYER_BANK_SYNTH: Readonly<Record<string, SynthType>> = {
  Actionamics: 'ActionamicsWasmSynth',
  'Delta Music 1': 'DeltaMusic1WasmSynth',
  'Delta Music 2': 'DeltaMusic2WasmSynth',
  'Digital Mugician': 'DigMugWasmSynth',
  'Fred Editor': 'FredReplayerWasmSynth2',
  'InStereo 2': 'InStereo2WasmSynth',
  'Sonic Arranger': 'SonicArrangerWasmSynth',
  SoundMon: 'SoundMonWasmSynth',
};

const RAW: Record<string, readonly NostalgicPlayerRawPreset[]> = {
  Actionamics: ACTIONAMICS_PRESETS,
  'Delta Music 1': DELTA_MUSIC_1_PRESETS,
  'Delta Music 2': DELTA_MUSIC_2_PRESETS,
  'Digital Mugician': DIGITAL_MUGICIAN_PRESETS,
  'Fred Editor': FRED_EDITOR_PRESETS,
  'InStereo 2': IN_STEREO_2_PRESETS,
  'Sonic Arranger': SONIC_ARRANGER_PRESETS,
  SoundMon: SOUND_MON_PRESETS,
};

export const NOSTALGICPLAYER_BANKS: Record<string, PresetConfig[]> = Object.fromEntries(
  Object.entries(NOSTALGICPLAYER_BANK_SYNTH).map(([cat, st]) => [cat, nostalgicPlayerBank(st, RAW[cat])]),
);

/** A format bank shows only while the open song's format can hold its synth type (null allowed = unlocked project: all). */
export function isBankVisible(category: string, allowed: readonly SynthType[] | null): boolean {
  const st = NOSTALGICPLAYER_BANK_SYNTH[category];
  return !st || allowed === null || allowed.includes(st);
}
