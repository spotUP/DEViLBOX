/**
 * soundFactoryEffects.ts - the Sound Factory effect opcodes as grid effects: operand layout of each opcode,
 * read off the SF_OP_* handlers of soundfactory.c. Shared by the parser (stream -> cell effects) and the
 * exporter (cell effects -> stream), so both agree on every byte.
 *
 * One opcode becomes one effect per operand byte; the first operand of the enabling opcodes (vibrato,
 * arpeggio, phasing, portamento, tremolo, filter) is the enable byte, and the rest follow only when it is
 * non-zero. SetAdsr's release time follows only when its release byte is non-zero. OneShot / Looping have
 * no operand: the effect is the opcode itself (value 0).
 */
import { BD_FX } from './benDaglishEffectGlyphs';
import { SF_FX } from './soundFactoryEffectGlyphs';

export const SF_OPCODE = {
  SetVolume: 0x81, SetFineTune: 0x82, FadeOut: 0x8a, FadeIn: 0x8f, SetAdsr: 0x90, OneShot: 0x91, Looping: 0x92,
  Vibrato: 0x93, Arpeggio: 0x94, Phasing: 0x95, Portamento: 0x96, Tremolo: 0x97, Filter: 0x98, Led: 0x9a,
  SetTranspose: 0x9c,
} as const;

/** Operand ids of an opcode in stream order; `more` are the ids after the first byte, present when it is non-zero. */
interface Layout { first: number; more: readonly number[]; }

const F = SF_FX;
const LAYOUT: Record<number, Layout> = {
  [SF_OPCODE.SetVolume]: { first: BD_FX.channelVolume, more: [] },
  [SF_OPCODE.SetFineTune]: { first: F.fineTune, more: [] },
  [SF_OPCODE.FadeOut]: { first: F.fadeOut, more: [] },
  [SF_OPCODE.FadeIn]: { first: F.fadeIn, more: [] },
  [SF_OPCODE.Led]: { first: F.led, more: [] },
  [SF_OPCODE.SetTranspose]: { first: BD_FX.transpose, more: [] },
  [SF_OPCODE.Vibrato]: { first: F.vibrato, more: [F.vibratoDelay, F.vibratoSpeed, F.vibratoStep, F.vibratoAmount] },
  [SF_OPCODE.Arpeggio]: { first: F.arpeggio, more: [F.arpeggioSpeed] },
  [SF_OPCODE.Phasing]: { first: F.phasing, more: [F.phasingStart, F.phasingEnd, F.phasingSpeed, F.phasingStep] },
  [SF_OPCODE.Portamento]: { first: F.portamento, more: [F.portamentoSpeed, F.portamentoStepHigh, F.portamentoStepLow] },
  [SF_OPCODE.Tremolo]: { first: F.tremolo, more: [F.tremoloSpeed, F.tremoloStep, F.tremoloRange] },
  [SF_OPCODE.Filter]: { first: F.filter, more: [F.filterFrequency, F.filterEnd, F.filterSpeed] },
};

/** SetAdsr: attack, decay, sustain, release byte, then the release time when the release byte is non-zero. */
const ADSR_FIXED = [F.attackTime, F.decayTime, F.sustainLevel, F.release] as const;

/** Effect id of a presence-only opcode (no operand byte), or undefined. */
export function sfPresenceEffect(opcode: number): number | undefined {
  return opcode === SF_OPCODE.OneShot ? F.oneShot : opcode === SF_OPCODE.Looping ? F.looping : undefined;
}

export const SF_EFFECT_OPCODES: readonly number[] = [
  ...Object.keys(LAYOUT).map(Number), SF_OPCODE.SetAdsr, SF_OPCODE.OneShot, SF_OPCODE.Looping,
];

/**
 * The operands of effect opcode `opcode` whose bytes are `read(i)` (operand i of the opcode, 0-based).
 * Returns the effect ids with their byte values, in stream order, or null when `opcode` is not an effect opcode
 * or the bytes run out (`read` returns undefined).
 */
export function sfDecodeOperands(opcode: number, read: (i: number) => number | undefined): Array<{ id: number; value: number }> | null {
  const presence = sfPresenceEffect(opcode);
  if (presence !== undefined) return [{ id: presence, value: 0 }];
  const out: Array<{ id: number; value: number }> = [];
  const take = (id: number): number | undefined => {
    const v = read(out.length);
    if (v === undefined) return undefined;
    out.push({ id, value: v });
    return v;
  };
  if (opcode === SF_OPCODE.SetAdsr) {
    for (const id of ADSR_FIXED) if (take(id) === undefined) return null;
    if (out[3].value !== 0 && take(F.releaseTime) === undefined) return null;
    return out;
  }
  const lay = LAYOUT[opcode];
  if (!lay) return null;
  const head = take(lay.first);
  if (head === undefined) return null;
  if (head !== 0) for (const id of lay.more) if (take(id) === undefined) return null;
  return out;
}

/** Opcode that starts with effect id `id`, or -1 (a non-leading operand, or not a Sound Factory effect). */
export function sfOpcodeStartingWith(id: number): number {
  if (id === F.oneShot) return SF_OPCODE.OneShot;
  if (id === F.looping) return SF_OPCODE.Looping;
  if (id === F.attackTime) return SF_OPCODE.SetAdsr;
  for (const [op, lay] of Object.entries(LAYOUT)) if (lay.first === id) return Number(op);
  return -1;
}

/**
 * Encode the effect list `fx` (grid order) as opcode bytes. Walks the list opcode by opcode; an operand
 * that does not lead an opcode, or an opcode whose operands are missing, is skipped and named in `warnings`.
 */
export function sfEncodeEffects(fx: ReadonlyArray<{ id: number; value: number }>, warnings: string[], where: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < fx.length;) {
    const op = sfOpcodeStartingWith(fx[i].id);
    if (op < 0) { warnings.push(`${where}: effect ${fx[i].id.toString(16)} does not start a command; not exported`); i++; continue; }
    const dec = sfDecodeOperands(op, (k) => fx[i + k]?.value);
    // The decode reads the operand ids from the list positionally; verify they are the ones the layout names.
    const expect = sfDecodeOperands(op, (k) => (fx[i + k] ? fx[i + k].value : undefined));
    if (!dec || !expect || dec.some((d, k) => fx[i + k].id !== d.id)) {
      warnings.push(`${where}: command ${op.toString(16)} is missing operands; not exported`); i++; continue;
    }
    bytes.push(op, ...(sfPresenceEffect(op) !== undefined ? [] : dec.map((d) => d.value & 0xff)));
    i += dec.length;
  }
  return bytes;
}

/**
 * The grid effect list `fx` made well-formed: an enabling effect whose enable byte is non-zero gets the operands
 * that follow it (a missing one is zero-filled), one whose enable byte is zero loses them. This is what lets the
 * writer turn "set vibrato to 1" into the full command and "set it to 0" into the one-byte command.
 */
export function sfNormalizeEffects(fx: ReadonlyArray<{ id: number; value: number }>): Array<{ id: number; value: number }> {
  const out: Array<{ id: number; value: number }> = [];
  for (let i = 0; i < fx.length;) {
    const op = sfOpcodeStartingWith(fx[i].id);
    if (op < 0 || sfPresenceEffect(op) !== undefined) { out.push({ ...fx[i] }); i++; continue; }
    const adsr = op === SF_OPCODE.SetAdsr;
    const seq: number[] = adsr ? [...ADSR_FIXED, F.releaseTime] : [LAYOUT[op].first, ...LAYOUT[op].more];
    const got: number[] = [];
    seq.forEach((id, k) => {
      const need = adsr ? (k < 4 || got[3] !== 0) : (k === 0 || got[0] !== 0);
      const present = fx[i]?.id === id;
      const value = present ? fx[i].value : 0;
      if (present) i++;
      got.push(value);
      if (need) out.push({ id, value });
    });
  }
  return out;
}
