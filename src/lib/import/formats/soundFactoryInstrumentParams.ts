/**
 * soundFactoryInstrumentParams.ts - the one field layout of a Sound Factory DefineInstr record.
 *
 * Order, widths and signedness are exactly what soundfactory-wasm/src/soundfactory.c sf_parse_instrument_at reads
 * (record bytes 0..33; the sample data follows at SF_INSTR_HEADER_SIZE). Keys are the sf_get_instrument_param
 * names, so the same key addresses the record, the metadata and the live engine. The parser reads through this
 * table and the writer patches through it; nothing else knows a byte offset.
 */

export const SF_INSTR_HEADER_SIZE = 34;

/** effect_byte flags (soundfactory.c SF_FLAG_*). */
export const SF_FLAG = {
  oneShot: 0x01,
  vibrato: 0x02,
  arpeggio: 0x04,
  phasing: 0x08,
  portamento: 0x10,
  release: 0x20,
  tremolo: 0x40,
  filter: 0x80,
} as const;
export type SfFlagKey = keyof typeof SF_FLAG;

interface SfField {
  key: string;
  offset: number;
  width: 1 | 2;
  signed: boolean;
  /** false: the grid's pitch names and the sample length depend on it, so the writer never patches it. */
  writable: boolean;
}

const f = (key: string, offset: number, width: 1 | 2 = 1, signed = false, writable = true): SfField => ({ key, offset, width, signed, writable });

export const SF_INSTR_FIELDS = [
  f('sampleLength', 0, 2, false, false),
  f('samplingPeriod', 2, 2, false, false),
  f('effectByte', 4),
  f('tremoloSpeed', 5), f('tremoloStep', 6), f('tremoloRange', 7),
  f('portamentoStep', 8, 2), f('portamentoSpeed', 10), f('arpeggioSpeed', 11),
  f('vibratoDelay', 12), f('vibratoSpeed', 13), f('vibratoStep', 14, 1, true), f('vibratoAmount', 15),
  f('attackTime', 16), f('decayTime', 17), f('sustainLevel', 18), f('releaseTime', 19),
  f('phasingStart', 20), f('phasingEnd', 21), f('phasingSpeed', 22), f('phasingStep', 23, 1, true),
  f('waveCount', 24, 1, false, false), f('octave', 25, 1, false, false),
  f('filterFrequency', 26), f('filterEnd', 27), f('filterSpeed', 28),
  // byte 29 is padding and is left alone
  f('dasrSustainOffset', 30, 2), f('dasrReleaseOffset', 32, 2),
] as const satisfies readonly SfField[];

export type SfInstrParamKey = (typeof SF_INSTR_FIELDS)[number]['key'];
export type SfInstrParams = Record<SfInstrParamKey, number>;

/** Read every field of the record that starts at `at` in `data` (missing bytes read as 0). */
export function readSfInstrParams(data: Uint8Array, at: number): SfInstrParams {
  const out = {} as SfInstrParams;
  for (const fl of SF_INSTR_FIELDS) {
    const o = at + fl.offset;
    let v = 0;
    for (let i = 0; i < fl.width; i++) v = (v << 8) | (data[o + i] ?? 0);
    if (fl.signed) v = fl.width === 1 ? (v << 24) >> 24 : (v << 16) >> 16;
    out[fl.key] = v;
  }
  return out;
}

/** Patch the writable fields of the record at `at` in place; returns how many bytes changed. */
export function writeSfInstrParams(data: Uint8Array, at: number, params: Partial<SfInstrParams>): number {
  let changed = 0;
  for (const fl of SF_INSTR_FIELDS) {
    const v = params[fl.key];
    if (!fl.writable || v === undefined) continue;
    for (let i = 0; i < fl.width; i++) {
      const b = (v >> (8 * (fl.width - 1 - i))) & 255;
      if (data[at + fl.offset + i] !== b) { data[at + fl.offset + i] = b; changed++; }
    }
  }
  return changed;
}

/** Sentinel: records the instrument patch visited / bytes it changed (the reachability test reads it). */
export const sfInstrumentPatchStats = { records: 0, bytes: 0 };
