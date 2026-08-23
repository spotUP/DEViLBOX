/**
 * chipParamImplemented.test.ts — a declared chip knob must be implemented by the
 * chip it is declared on.
 *
 * The Cabinet knob shipped on MEA8000, which has no cabinet stage, while the
 * TMS5220 — whose wasm implements PARAM_CABINET — showed no knob at all. The
 * knob moved nothing on one chip and was unreachable on the other. This guards
 * the pairing at the only place both sides can be read: the parameter table and
 * the chip's C++ parameter enum.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CHIP_SYNTH_DEFS } from '../chipParameters';

const CPP = (dir: string, file: string) =>
  readFileSync(join(process.cwd(), 'mame-wasm', dir, file), 'utf8');

function keysOf(synthType: string): string[] {
  return CHIP_SYNTH_DEFS[synthType].parameters.map((p) => p.key);
}

describe('chip knobs are declared on the chip that implements them', () => {
  it('declares Cabinet on the TMS5220, which implements PARAM_CABINET', () => {
    expect(keysOf('MAMETMS5220')).toContain('cabinet');
    expect(CPP('tms5220', 'TMS5220Synth.cpp')).toContain('PARAM_CABINET');
  });

  it('does not declare Cabinet on the MEA8000, which has no cabinet stage', () => {
    expect(keysOf('MAMEMEA8000')).not.toContain('cabinet');
    expect(CPP('mea8000', 'MEA8000Synth.cpp')).not.toContain('PARAM_CABINET');
  });
});
