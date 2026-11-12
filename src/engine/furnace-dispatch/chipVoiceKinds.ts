/**
 * Voice kinds of the Furnace chips whose channels do not all take the same
 * instrument type, and the check that refuses a note whose instrument kind
 * does not match the kind of the chip channel it is written to.
 *
 * Everything is read from the channel layout in systemPresets.ts, so there is
 * one table for the editor, the engine upload, the composing chat and the note
 * check. Which Furnace instrument types a kind takes is the preferred
 * instrument type of the channel in Furnace's sysDef.cpp (getPreferInsType and
 * getPreferInsSecondType).
 *
 * Chips not listed in CHIP_SPECS are either exempt (every channel takes the one
 * instrument type, or the chip has no instrument-to-chip mapping): the list is
 * in thoughts/spot/2026-11-11_wrong-voice-kind-refusal.md.
 */
import { SYSTEM_PRESETS, DivChanType, type DivChanDef } from '@constants/systemPresets';
import {
  DIV_INS_FM, DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB, DIV_INS_OPL, DIV_INS_MULTIPCM,
} from '@lib/export/FurnaceInstrumentEncoder';
import type { InstrumentConfig } from '@typedefs/instrument';

/** DivInstrumentType DIV_INS_AMIGA (instrument.h): a sample instrument, the secondary type of the PCM channels. */
const DIV_INS_AMIGA = 4;

export type ChipVoiceKindId = 'fm' | 'ssg' | 'adpcma' | 'adpcmb' | 'pcm';

export interface ChipVoiceKind {
  id: ChipVoiceKindId;
  /** The chip's own name for the kind; these stay as written. */
  label: string;
  /** Furnace instrument types a channel of the kind takes; the first is the preferred one. */
  insTypes: readonly number[];
  /** Does a channel of the layout belong to this kind? */
  takes: (def: DivChanDef) => boolean;
}

export interface ChipVoiceSpec {
  synthType: string;
  /** id of the SYSTEM_PRESETS entry whose channel layout this chip uses */
  presetId: string;
  kinds: readonly ChipVoiceKind[];
}

const isPcm = (d: DivChanDef) => d.type === DivChanType.PCM;
const named = (prefix: string) => (d: DivChanDef) => isPcm(d) && d.name.startsWith(prefix);

const FM: ChipVoiceKind = { id: 'fm', label: 'FM', insTypes: [DIV_INS_FM], takes: (d) => d.type === DivChanType.FM };
const OPL_FM: ChipVoiceKind = { ...FM, insTypes: [DIV_INS_OPL] };
const SSG: ChipVoiceKind = { id: 'ssg', label: 'SSG', insTypes: [DIV_INS_AY], takes: (d) => d.type === DivChanType.PULSE };
const ADPCMA: ChipVoiceKind = { id: 'adpcma', label: 'ADPCM-A', insTypes: [DIV_INS_ADPCMA, DIV_INS_AMIGA], takes: named('ADPCM-A') };
const ADPCMB: ChipVoiceKind = { id: 'adpcmb', label: 'ADPCM-B', insTypes: [DIV_INS_ADPCMB, DIV_INS_AMIGA], takes: named('ADPCM-B') };

/** The mixed-kind chips an instrument can be addressed to, by the instrument's synthType. */
export const CHIP_SPECS: readonly ChipVoiceSpec[] = [
  { synthType: 'FurnaceOPNB', presetId: 'ym2610_full', kinds: [FM, SSG, ADPCMA, ADPCMB] },
  { synthType: 'FurnaceOPNBB', presetId: 'ym2610b', kinds: [FM, SSG, ADPCMA, ADPCMB] },
  {
    synthType: 'FurnaceOPNA', presetId: 'ym2608',
    kinds: [
      FM, SSG,
      // The six rhythm channels (Kick ... Rim) are NOISE-typed in the layout and play ADPCM-A samples.
      { ...ADPCMA, takes: (d) => d.type === DivChanType.NOISE },
      { ...ADPCMB, takes: (d) => isPcm(d) && d.name === 'ADPCM' },
    ],
  },
  { synthType: 'FurnaceOPN2203', presetId: 'ym2203', kinds: [FM, SSG] },
  { synthType: 'FurnaceY8950', presetId: 'y8950', kinds: [OPL_FM, { ...ADPCMB, takes: isPcm }] },
  {
    synthType: 'FurnaceOPL4', presetId: 'opl4',
    kinds: [OPL_FM, { id: 'pcm', label: 'PCM', insTypes: [DIV_INS_MULTIPCM, DIV_INS_AMIGA], takes: isPcm }],
  },
];

export function chipSpecOf(synthType: string | undefined): ChipVoiceSpec | undefined {
  return CHIP_SPECS.find((s) => s.synthType === synthType);
}

export function chipLayout(spec: ChipVoiceSpec): readonly DivChanDef[] {
  const preset = SYSTEM_PRESETS.find((p) => p.id === spec.presetId);
  if (!preset) throw new Error(`chipVoiceKinds: no system preset ${spec.presetId}`);
  return preset.channelDefs;
}

/** The kind of one chip channel (counted from the chip's first). Undefined: no channel there. */
export function kindOfChipChannel(spec: ChipVoiceSpec, chipChannel: number): ChipVoiceKind | undefined {
  const def = chipLayout(spec)[chipChannel];
  return def ? spec.kinds.find((k) => k.takes(def)) : undefined;
}

/** The kind whose preferred instrument type this is; the chip's first kind when the type is unset or has no kind of its own. */
export function kindOfInsType(spec: ChipVoiceSpec, insType: number | undefined): ChipVoiceKind {
  return spec.kinds.find((k) => insType !== undefined && k.insTypes[0] === insType) ?? spec.kinds[0];
}

/** The chip channels (counted from the chip's first) that take a kind. */
export function chipChannelsOfKind(spec: ChipVoiceSpec, kind: ChipVoiceKind): number[] {
  const out: number[] = [];
  chipLayout(spec).forEach((d, i) => { if (kind.takes(d)) out.push(i); });
  return out;
}

/**
 * The voice kind of a Furnace instrument, or undefined when it cannot be told:
 * not a mixed-kind chip, or an old import that kept only the raw instrument
 * bytes and no instrument type.
 */
export function voiceKindOfInstrument(inst: Pick<InstrumentConfig, 'synthType' | 'furnace'>): { spec: ChipVoiceSpec; kind: ChipVoiceKind } | undefined {
  const spec = chipSpecOf(inst.synthType);
  if (!spec) return undefined;
  const f = inst.furnace;
  if (f?.divInsType === undefined && f?.rawBinaryData) return undefined;
  return { spec, kind: kindOfInsType(spec, f?.divInsType) };
}

/**
 * Volume maximum of each voice kind on the OPN chips, from upstream GET_VOLMAX
 * (ym2610.cpp, ym2610b.cpp, ym2608.cpp, ym2203.cpp): FM 127, SSG 15,
 * ADPCM-A 31, ADPCM-B 255. Only chips whose GET_VOLMAX was read are listed;
 * Y8950 and OPL4 are not.
 */
const OPN_KIND_VOLUME_MAX: Partial<Record<ChipVoiceKindId, number>> = { fm: 127, ssg: 15, adpcma: 31, adpcmb: 255 };
const VOLUME_MAX_CHIPS: ReadonlySet<string> = new Set(['FurnaceOPNB', 'FurnaceOPNBB', 'FurnaceOPNA', 'FurnaceOPN2203']);

/**
 * The volume maximum of one chip channel of a mixed-kind chip, or undefined
 * when the chip has one maximum for all channels (or was not checked) and the
 * platform-wide value applies. A volume scaled to the FM maximum on an SSG
 * channel overflows the 4-bit register and plays at a fraction of the level.
 */
export function maxVolumeOfChipChannel(synthType: string | undefined, chipChannel: number): number | undefined {
  if (!synthType || !VOLUME_MAX_CHIPS.has(synthType)) return undefined;
  const spec = chipSpecOf(synthType);
  const kind = spec && kindOfChipChannel(spec, chipChannel);
  return kind ? OPN_KIND_VOLUME_MAX[kind.id] : undefined;
}

/** Live voices (preview and audition channels, 100 and up) are not pattern cells. */
const FIRST_LIVE_CHANNEL = 100;
const NOTE_OFF = 97;

export type NoteKindCheck = { ok: true } | { ok: false; error: string };

/**
 * Refuse a note whose instrument plays on a voice kind the tracker channel does not have.
 * Cells without a real note, without an instrument, or with a non-Furnace
 * instrument always pass.
 */
export function checkNoteVoiceKind(
  instrument: Pick<InstrumentConfig, 'synthType' | 'furnace'> | undefined,
  trackerChannel: number,
  note: number | undefined,
): NoteKindCheck {
  if (!instrument || !note || note === NOTE_OFF || note < 0) return { ok: true };
  if (trackerChannel >= FIRST_LIVE_CHANNEL || trackerChannel < 0) return { ok: true };
  const found = voiceKindOfInstrument(instrument);
  if (!found) return { ok: true };
  const { spec, kind } = found;
  const layout = chipLayout(spec);
  const chipChannel = trackerChannel % layout.length;
  const channelKind = kindOfChipChannel(spec, chipChannel);
  if (!channelKind || channelKind.id === kind.id) return { ok: true };
  // A secondary type (a sample instrument) plays on any channel that lists it.
  const insType = instrument.furnace?.divInsType;
  if (insType !== undefined && channelKind.insTypes.includes(insType)) return { ok: true };
  const takes: number[] = [];
  for (let c = 0; c < layout.length; c++) {
    // every tracker channel whose chip channel takes the instrument's kind, up to the song's width
    if (kind.takes(layout[c])) takes.push(c);
  }
  const human = takes.map((c) => c + 1).join(', ');
  const zero = takes.join(', ');
  return {
    ok: false,
    error: `Channel ${trackerChannel + 1} (index ${trackerChannel}) plays ${channelKind.label}, but this instrument is a ${kind.label} voice. `
      + `${kind.label} voices play on channels ${human} (indexes ${zero}).`,
  };
}
