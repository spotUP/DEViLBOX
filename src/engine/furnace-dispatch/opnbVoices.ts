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

// ── SSG voice: macro labels and audible defaults ───────────────────────────────
// Slot meanings are those of Furnace's ay.cpp (the YM2610 drives its SSG through
// the AY8910 core): wave = bit mask (1 tone, 2 noise, 4 envelope), duty = noise
// frequency, ex2 = envelope shape, ex3 / alg = auto-envelope numerator /
// denominator.

export const SSG_MACRO_LABELS: Readonly<Record<number, string>> = {
  0: 'Volume',
  2: 'Noise Frequency',
  3: 'Tone, Noise and Envelope',
  6: 'Envelope Shape',
  7: 'Auto Envelope Numerator',
  8: 'Auto Envelope Denominator',
};

interface DefaultMacro { code: number; type: number; data: number[]; loop: number; release: number; mode: number }

/** Add the volume (15) and tone-only wave (1) macros an SSG voice needs to be heard. */
export function withSsgDefaultMacros<T extends { code?: number; type: number }>(macros: T[]): { macros: Array<T | DefaultMacro>; added: boolean } {
  const out: Array<T | DefaultMacro> = [...macros];
  let added = false;
  for (const [code, value] of [[0, 15], [3, 1]] as const) {
    if (!out.some(m => (m.code ?? m.type) === code)) {
      out.push({ code, type: 0, data: [value], loop: -1, release: -1, mode: 0 });
      added = true;
    }
  }
  return { macros: out, added };
}

// ── ADPCM voices: placing a user sample in the module sample list ─────────────

export interface PlacedSample {
  data: Int16Array | Int8Array | Uint8Array;
  rate: number; depth: number; loopStart: number; loopEnd: number; loopMode: number; name: string;
}

/**
 * The one place a user's sample joins the platform sample list. Returns the new
 * list and the index the instrument's amiga.initSample must name. The same
 * PCM buffer is placed once.
 */
export function placeUserSample(
  list: readonly PlacedSample[] | null,
  user: { data: Int16Array; rate: number; name: string },
): { list: PlacedSample[]; index: number } {
  const base = list ? [...list] : [];
  const found = base.findIndex(s => s.data === user.data);
  if (found >= 0) return { list: base, index: found };
  base.push({ data: user.data, rate: user.rate, depth: 16, loopStart: -1, loopEnd: -1, loopMode: 0, name: user.name });
  return { list: base, index: base.length - 1 };
}
