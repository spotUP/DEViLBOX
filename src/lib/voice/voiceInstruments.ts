/**
 * voiceInstruments.ts - the instruments Voice to Notes writes with must make
 * sound.
 *
 * A new song's instrument (createDefaultInstrument) is a Sampler with no
 * sample, so notes committed onto it are silent (owner report 2026-10-17).
 * Melody notes fall back to a "Voice Lead" built from the factory Square Lead;
 * drum classes fall back to TR-808 voices (owner decision), written at C-4,
 * the io808 voice's native pitch. Existing matching instruments are reused, so
 * repeated commits do not pile up copies.
 */
import type { DeepPartial, InstrumentConfig } from '@typedefs/instrument';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { LEAD_PRESETS } from '@/constants/factoryPresets/lead';
import { TR808_PRESETS } from '@/constants/factoryPresets/tr808';
import type { DrumClass } from './drumHits';

export const VOICE_LEAD_NAME = 'Voice Lead';
const VOICE_LEAD_PRESET = 'Square Lead';

/** io808 voice per drum class. */
export const DRUM_808_VOICE: Record<DrumClass, string> = {
  kick: 'kick',
  snare: 'snare',
  hat: 'closedHat',
  clap: 'clap',
};

/** MIDI note an 808 voice is written as (C-4). */
export const DRUM_808_MIDI = 60;

type InstrumentLike = Pick<InstrumentConfig, 'id' | 'name' | 'synthType' | 'sample' | 'parameters'>;

/** A sample-playing instrument without a sample is silent; everything else plays. */
export function isPlayable(inst: InstrumentLike | undefined): boolean {
  if (!inst) return false;
  if (inst.synthType !== 'Sampler' && inst.synthType !== 'Player') return true;
  const s = inst.sample;
  return !!s && (s.url !== '' || (s.audioBuffer?.byteLength ?? 0) > 0);
}

function find(id: number): InstrumentLike | undefined {
  return useInstrumentStore.getState().instruments.find((i) => i.id === id);
}

/** Create from a preset; null when the format's instrument limit refused it. */
function create(config: DeepPartial<InstrumentConfig>): number | null {
  const id = useInstrumentStore.getState().createInstrument(config);
  return id < 0 ? null : id;
}

function preset(list: readonly DeepPartial<InstrumentConfig>[], match: (p: DeepPartial<InstrumentConfig>) => boolean) {
  const p = list.find(match);
  if (!p) throw new Error('voiceInstruments: factory preset missing');
  return p;
}

/** `id` when it plays, else the song's Voice Lead (created when missing). */
export function playableMelodyInstrument(id: number): number {
  if (isPlayable(find(id))) return id;
  const existing = useInstrumentStore.getState().instruments.find((i) => i.name === VOICE_LEAD_NAME && isPlayable(i));
  if (existing) return existing.id;
  const lead = preset(LEAD_PRESETS, (p) => p.name === VOICE_LEAD_PRESET);
  return create({ ...lead, name: VOICE_LEAD_NAME }) ?? id;
}

/** The song's 808 instrument for `drum`, created from the factory preset when missing. */
export function drum808Instrument(drum: DrumClass): number | null {
  const voice = DRUM_808_VOICE[drum];
  const existing = useInstrumentStore
    .getState()
    .instruments.find((i) => i.synthType === 'TR808' && i.parameters?.io808Type === voice);
  if (existing) return existing.id;
  return create(preset(TR808_PRESETS, (p) => p.parameters?.io808Type === voice));
}

export interface DrumTargetLike {
  instrumentId: number;
  midi: number;
}

/** The classes in `used` whose target is silent or missing. */
export function silentDrumClasses(map: Record<DrumClass, DrumTargetLike>, used: readonly DrumClass[]): DrumClass[] {
  return used.filter((drum) => !isPlayable(find(map[drum].instrumentId)));
}

/**
 * The notes a commit will write, without creating anything: silent classes
 * move to the 808 pitch (the preview shows notes, not instruments).
 */
export function drumMapAsWritten<M extends Record<DrumClass, DrumTargetLike>>(map: M, used: readonly DrumClass[]): M {
  const out = { ...map };
  for (const drum of silentDrumClasses(map, used)) out[drum] = { ...map[drum], midi: DRUM_808_MIDI };
  return out;
}

/**
 * Every class in `used` that points at a silent or missing instrument gets its
 * 808 voice at C-4. Classes the take has no hits for create nothing.
 */
export function playableDrumMap<M extends Record<DrumClass, DrumTargetLike>>(map: M, used: readonly DrumClass[]): M {
  const out = { ...map };
  // Decided before any instrument is created: a new 808 can take the id a
  // missing target pointed at, which would then look playable to the next class.
  for (const drum of silentDrumClasses(map, used)) {
    const id = drum808Instrument(drum);
    if (id !== null) out[drum] = { ...map[drum], instrumentId: id, midi: DRUM_808_MIDI };
  }
  return out;
}
