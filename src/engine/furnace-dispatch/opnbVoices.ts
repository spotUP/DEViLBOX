/**
 * The four voice kinds of a Neo Geo sound chip (YM2610 / YM2610B), and which
 * chip channels take each. One table, read from the channel layout in
 * systemPresets.ts, so the editor, the engine upload and the composing chat's
 * channel text all say the same thing.
 */
import type { DivChanDef } from '@constants/systemPresets';
import {
  chipSpecOf, kindOfInsType, kindOfChipChannel, chipChannelsOfKind,
  type ChipVoiceKind, type ChipVoiceSpec,
} from './chipVoiceKinds';

/** FurnaceConfig.chipType of the YM2610 (OPNB) and the YM2610B (OPNBB). */
export const CHIPTYPE_OPNB = 14;
export const CHIPTYPE_OPNBB = 48;

const SYNTH_OF_CHIPTYPE: Record<number, string> = {
  [CHIPTYPE_OPNB]: 'FurnaceOPNB',
  [CHIPTYPE_OPNBB]: 'FurnaceOPNBB',
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

function asOpnbKind(k: ChipVoiceKind): OpnbVoiceKind {
  return { id: k.id as OpnbVoiceKindId, label: k.label, divInsType: k.insTypes[0], takes: k.takes };
}

// The Neo Geo kinds are the YM2610 entry of chipVoiceKinds.ts, the one table of every mixed-kind chip.
const OPNB_SPEC = chipSpecOf('FurnaceOPNB') as ChipVoiceSpec;
export const OPNB_VOICE_KINDS: readonly OpnbVoiceKind[] = OPNB_SPEC.kinds.map(asOpnbKind);

export function isOpnbChipType(chipType: number): boolean {
  return chipType in SYNTH_OF_CHIPTYPE;
}

function specOf(chipType: number): ChipVoiceSpec {
  const spec = chipSpecOf(SYNTH_OF_CHIPTYPE[chipType]);
  if (!spec) throw new Error(`opnbVoices: chipType ${chipType} is not a Neo Geo chip`);
  return spec;
}

export function opnbVoiceKind(divInsType: number | undefined): OpnbVoiceKind {
  return asOpnbKind(kindOfInsType(OPNB_SPEC, divInsType));
}

/** The chip channels (counted from the chip's first) that take a kind. */
export function opnbKindChannels(chipType: number, divInsType: number | undefined): number[] {
  const spec = specOf(chipType);
  return chipChannelsOfKind(spec, kindOfInsType(spec, divInsType));
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
  const spec = specOf(chipType);
  return asOpnbKind(kindOfChipChannel(spec, chipChannel) ?? spec.kinds[0]);
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
