/**
 * The four voice kinds of a Neo Geo sound chip (YM2610 / YM2610B), and which
 * chip channels take each. One table, read from the channel layout in
 * systemPresets.ts, so the editor, the engine upload and the composing chat's
 * channel text all say the same thing.
 */
import { SYSTEM_PRESETS, DivChanType, type DivChanDef } from '@constants/systemPresets';
import { DIV_INS_FM, DIV_INS_AY, DIV_INS_ADPCMA, DIV_INS_ADPCMB } from '@lib/export/FurnaceInstrumentEncoder';

/** FurnaceConfig.chipType of the YM2610 (OPNB) and the YM2610B (OPNBB). */
export const CHIPTYPE_OPNB = 14;
export const CHIPTYPE_OPNBB = 48;

const PRESET_OF_CHIPTYPE: Record<number, string> = {
  [CHIPTYPE_OPNB]: 'ym2610_full',
  [CHIPTYPE_OPNBB]: 'ym2610b',
};

export type OpnbVoiceKindId = 'fm' | 'ssg' | 'adpcma' | 'adpcmb';

export interface OpnbVoiceKind {
  id: OpnbVoiceKindId;
  /** The chip's own name for the kind; these stay as written. */
  label: string;
  divInsType: number;
  /** Does a channel of the layout belong to this kind? */
  takes: (def: DivChanDef) => boolean;
}

export const OPNB_VOICE_KINDS: readonly OpnbVoiceKind[] = [
  { id: 'fm', label: 'FM', divInsType: DIV_INS_FM, takes: (d) => d.type === DivChanType.FM },
  { id: 'ssg', label: 'SSG', divInsType: DIV_INS_AY, takes: (d) => d.type === DivChanType.PULSE },
  { id: 'adpcma', label: 'ADPCM-A', divInsType: DIV_INS_ADPCMA, takes: (d) => d.type === DivChanType.PCM && d.name.startsWith('ADPCM-A') },
  { id: 'adpcmb', label: 'ADPCM-B', divInsType: DIV_INS_ADPCMB, takes: (d) => d.type === DivChanType.PCM && d.name.startsWith('ADPCM-B') },
];

export function isOpnbChipType(chipType: number): boolean {
  return chipType in PRESET_OF_CHIPTYPE;
}

function layoutOf(chipType: number): DivChanDef[] {
  const id = PRESET_OF_CHIPTYPE[chipType];
  const preset = SYSTEM_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`opnbVoices: chipType ${chipType} is not a Neo Geo chip`);
  return preset.channelDefs;
}

export function opnbVoiceKind(divInsType: number | undefined): OpnbVoiceKind {
  return OPNB_VOICE_KINDS.find((k) => k.divInsType === divInsType) ?? OPNB_VOICE_KINDS[0];
}

/** The chip channels (counted from the chip's first) that take a kind. */
export function opnbKindChannels(chipType: number, divInsType: number | undefined): number[] {
  const kind = opnbVoiceKind(divInsType);
  const out: number[] = [];
  layoutOf(chipType).forEach((d, i) => { if (kind.takes(d)) out.push(i); });
  return out;
}

export function opnbFirstChannel(chipType: number, divInsType: number | undefined): number {
  return opnbKindChannels(chipType, divInsType)[0] ?? 0;
}

export function opnbChannelCount(chipType: number, divInsType: number | undefined): number {
  return opnbKindChannels(chipType, divInsType).length;
}

/** First chip channel of the kind: where a live note of that instrument plays. */
export const opnbPreviewChannel = opnbFirstChannel;

/** The kind a chip channel takes. */
export function opnbVoiceKindOfChannel(chipType: number, chipChannel: number): OpnbVoiceKind {
  const def = layoutOf(chipType)[chipChannel];
  return OPNB_VOICE_KINDS.find((k) => def && k.takes(def)) ?? OPNB_VOICE_KINDS[0];
}
