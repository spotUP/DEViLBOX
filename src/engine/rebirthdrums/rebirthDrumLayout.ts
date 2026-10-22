/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 808 / 909 drum kits: knob layout, note map and defaults (port of the group tables in
 * re-rebirth src/render/devices/drum-machine.js). Pure data, no imports: shared by the synth,
 * the registry descriptor, the defaults and the panel UI so there is one source of truth.
 *
 * A config field is the group id plus the capitalised knob key: group 'bd' knob 'level' -> 'bdLevel'.
 */

export type DrumKitId = '808' | '909';

export interface DrumKnobDef {
  key: string;
  label: string;
  def: number;
  /** Two-position voice switch (value < 0.5 = first label, >= 0.5 = second) instead of a knob. */
  switchLabels?: [string, string];
}

export interface DrumVoiceDef {
  /** Voice id inside the kit (source track id). */
  id: string;
  label: string;
  /** Primary General MIDI drum note, shown in the legend. */
  note: number;
  /** Further notes that play the same voice. */
  aliases: number[];
}

export interface DrumGroupDef {
  id: string;
  label: string;
  voices: string[];
  knobs: DrumKnobDef[];
}

export interface DrumKitLayout {
  id: DrumKitId;
  title: string;
  subtitle: string;
  voices: DrumVoiceDef[];
  groups: DrumGroupDef[];
}

const k = (key: string, label: string, def: number, switchLabels?: [string, string]): DrumKnobDef =>
  switchLabels ? { key, label, def, switchLabels } : { key, label, def };

export const REBIRTH_808_LAYOUT: DrumKitLayout = {
  id: '808',
  title: 'Drum 08',
  subtitle: 'Analog Rhythm Machine',
  voices: [
    { id: 'bd', label: 'Bass Drum', note: 36, aliases: [35] },
    { id: 'sd', label: 'Snare Drum', note: 38, aliases: [40] },
    { id: 'lt', label: 'Low Tom / Low Conga', note: 41, aliases: [43] },
    { id: 'mt', label: 'Mid Tom / Mid Conga', note: 45, aliases: [47] },
    { id: 'ht', label: 'High Tom / High Conga', note: 48, aliases: [50] },
    { id: 'rs', label: 'Rim Shot / Claves', note: 37, aliases: [] },
    { id: 'cp', label: 'Hand Clap / Maracas', note: 39, aliases: [70] },
    { id: 'cb', label: 'Cow Bell', note: 56, aliases: [] },
    { id: 'cy', label: 'Cymbal', note: 49, aliases: [51, 52, 55, 57, 59] },
    { id: 'oh', label: 'Open Hi-Hat', note: 46, aliases: [] },
    { id: 'ch', label: 'Closed Hi-Hat', note: 42, aliases: [44] },
  ],
  groups: [
    { id: 'bd', label: 'Bass Drum', voices: ['bd'], knobs: [k('level', 'Level', 0.8), k('tone', 'Tone', 0.5), k('decay', 'Decay', 0.6)] },
    { id: 'sd', label: 'Snare Drum', voices: ['sd'], knobs: [k('level', 'Level', 0.7), k('tone', 'Tone', 0.5), k('snappy', 'Snappy', 0.6)] },
    { id: 'lt', label: 'Low Tom', voices: ['lt'], knobs: [k('level', 'Level', 0.6), k('tuning', 'Tuning', 0.5), k('alt', 'Voice', 0, ['Tom', 'Conga'])] },
    { id: 'mt', label: 'Mid Tom', voices: ['mt'], knobs: [k('level', 'Level', 0.6), k('tuning', 'Tuning', 0.5), k('alt', 'Voice', 0, ['Tom', 'Conga'])] },
    { id: 'ht', label: 'High Tom', voices: ['ht'], knobs: [k('level', 'Level', 0.6), k('tuning', 'Tuning', 0.5), k('alt', 'Voice', 0, ['Tom', 'Conga'])] },
    { id: 'rs', label: 'Rim Shot', voices: ['rs'], knobs: [k('level', 'Level', 0.6), k('alt', 'Voice', 0, ['Rim', 'Claves'])] },
    { id: 'cp', label: 'Hand Clap', voices: ['cp'], knobs: [k('level', 'Level', 0.7), k('alt', 'Voice', 0, ['Clap', 'Maracas'])] },
    { id: 'cb', label: 'Cow Bell', voices: ['cb'], knobs: [k('level', 'Level', 0.5)] },
    { id: 'cy', label: 'Cymbal', voices: ['cy'], knobs: [k('level', 'Level', 0.5), k('tone', 'Tone', 0.5), k('decay', 'Decay', 0.6)] },
    { id: 'oh', label: 'Open Hi-Hat', voices: ['oh'], knobs: [k('level', 'Level', 0.6), k('decay', 'Decay', 0.4)] },
    { id: 'ch', label: 'Closed Hi-Hat', voices: ['ch'], knobs: [k('level', 'Level', 0.7)] },
    { id: 'ac', label: 'Accent', voices: [], knobs: [k('level', 'Level', 0.6)] },
  ],
};

export const REBIRTH_909_LAYOUT: DrumKitLayout = {
  id: '909',
  title: 'Drum 09',
  subtitle: 'Hybrid Rhythm Machine',
  voices: [
    { id: 'bd', label: 'Bass Drum', note: 36, aliases: [35] },
    { id: 'sd', label: 'Snare Drum', note: 38, aliases: [40] },
    { id: 'lt', label: 'Low Tom', note: 41, aliases: [43] },
    { id: 'mt', label: 'Mid Tom', note: 45, aliases: [47] },
    { id: 'ht', label: 'High Tom', note: 48, aliases: [50] },
    { id: 'rs', label: 'Rim Shot', note: 37, aliases: [] },
    { id: 'cp', label: 'Hand Clap', note: 39, aliases: [] },
    { id: 'ch', label: 'Closed Hi-Hat', note: 42, aliases: [44] },
    { id: 'oh', label: 'Open Hi-Hat', note: 46, aliases: [] },
    { id: 'cr', label: 'Crash Cymbal', note: 49, aliases: [52, 55, 57] },
    { id: 'rd', label: 'Ride Cymbal', note: 51, aliases: [53, 59] },
  ],
  groups: [
    { id: 'bd', label: 'Bass Drum', voices: ['bd'], knobs: [k('tune', 'Tune', 0.5), k('level', 'Level', 0.8), k('attack', 'Attack', 0.4), k('decay', 'Decay', 0.6)] },
    { id: 'sd', label: 'Snare Drum', voices: ['sd'], knobs: [k('tune', 'Tune', 0.5), k('tone', 'Tone', 0.5), k('snappy', 'Snappy', 0.6), k('level', 'Level', 0.7)] },
    { id: 'lt', label: 'Low Tom', voices: ['lt'], knobs: [k('tune', 'Tune', 0.5), k('decay', 'Decay', 0.5), k('level', 'Level', 0.6)] },
    { id: 'mt', label: 'Mid Tom', voices: ['mt'], knobs: [k('tune', 'Tune', 0.5), k('decay', 'Decay', 0.5), k('level', 'Level', 0.6)] },
    { id: 'ht', label: 'High Tom', voices: ['ht'], knobs: [k('tune', 'Tune', 0.5), k('decay', 'Decay', 0.5), k('level', 'Level', 0.6)] },
    { id: 'rs', label: 'Rim Shot', voices: ['rs'], knobs: [k('level', 'Level', 0.6)] },
    { id: 'cp', label: 'Hand Clap', voices: ['cp'], knobs: [k('level', 'Level', 0.7)] },
    { id: 'hh', label: 'Hi-Hat', voices: ['ch', 'oh'], knobs: [k('level', 'Level', 0.7), k('chDecay', 'Closed Decay', 0.3), k('ohDecay', 'Open Decay', 0.5)] },
    { id: 'cy', label: 'Cymbal', voices: ['cr', 'rd'], knobs: [k('crLevel', 'Crash Level', 0.5), k('crTune', 'Crash Tune', 0.5), k('rdLevel', 'Ride Level', 0.5), k('rdTune', 'Ride Tune', 0.5)] },
    { id: 'ac', label: 'Accent', voices: [], knobs: [k('level', 'Level', 0.6)] },
  ],
};

export const REBIRTH_LAYOUTS: Record<DrumKitId, DrumKitLayout> = { '808': REBIRTH_808_LAYOUT, '909': REBIRTH_909_LAYOUT };

/** Config field name of a group knob. */
export function drumParamKey(group: string, key: string): string {
  return group + key.charAt(0).toUpperCase() + key.slice(1);
}

/** Default value for every config field of a kit. */
export function drumKitDefaults(layout: DrumKitLayout): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of layout.groups) for (const kn of g.knobs) out[drumParamKey(g.id, kn.key)] = kn.def;
  return out;
}

/** MIDI note -> voice id for a kit (primary notes and aliases). */
export function drumNoteMap(layout: DrumKitLayout): Map<number, string> {
  const map = new Map<number, string>();
  for (const v of layout.voices) {
    map.set(v.note, v.id);
    for (const a of v.aliases) map.set(a, v.id);
  }
  return map;
}
