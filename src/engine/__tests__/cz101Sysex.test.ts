/**
 * Casio CZ single-tone SysEx: the decoder and encoder (cz101Sysex.ts).
 * Every message here is produced by our own encoder from our own patches; no third-party dump is embedded.
 */
import { describe, it, expect } from 'vitest';
import { CZ101_PRESET_BANK } from '../cz101/cz101Presets';
import {
  CZ_SYSEX_LENGTH, CZSysexError, decodeCzSysex, decodeCzSysexFile, encodeCzSysex, splitSysex,
} from '../cz101/cz101Sysex';
import type { CZPatch } from '../cz101/cz101Types';

const INIT = CZ101_PRESET_BANK[0].patch;

/** Two lines, every feature the format carries: sustain flags, a coarse pitch step, window, ring modulation, detune, octave. */
const RICH: CZPatch = {
  name: 'Rich',
  octave: -1,
  ringMod: true,
  line1: {
    waveform1: 6,
    waveform2: 4,
    window: 2,
    dcaEnvelope: [{ rate: 100, level: 99 }, { rate: 60, level: 50 }, { rate: 0, level: 50 }, { rate: 40, level: 0 }],
    dcwEnvelope: [{ rate: 90, level: 70 }, { rate: 50, level: 20 }, { rate: 0, level: 20 }],
    dcoEnvelope: [{ rate: 110, level: 12, coarse: true }, { rate: 80, level: 0 }],
  },
  line2: {
    waveform1: 1,
    dcaEnvelope: [{ rate: 90, level: 80 }, { rate: 30, level: 10 }],
    dcwEnvelope: [{ rate: 90, level: 40 }],
    detune: -530,
  },
};

const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

function expectStages(actual: CZPatch['line1']['dcaEnvelope'] | undefined, wanted: CZPatch['line1']['dcaEnvelope'] | undefined, levelTolerance: number) {
  expect(actual?.length).toBe(wanted?.length);
  wanted?.forEach((stage, i) => {
    expect(actual![i].rate).toBe(stage.rate);
    expect(close(actual![i].level, stage.level, levelTolerance), `stage ${i} level ${actual![i].level} vs ${stage.level}`).toBe(true);
    expect(!!actual![i].coarse).toBe(!!stage.coarse);
  });
}

describe('CZ SysEx encoder', () => {
  it('writes a 264-byte Casio tone message with nibble data', () => {
    const message = encodeCzSysex(INIT, 3);
    expect(message.length).toBe(CZ_SYSEX_LENGTH);
    expect(Array.from(message.slice(0, 7))).toEqual([0xf0, 0x44, 0x00, 0x00, 0x73, 0x20, 0x60]);
    expect(message[CZ_SYSEX_LENGTH - 1]).toBe(0xf7);
    expect(message.slice(7, -1).every((byte) => byte <= 0x0f)).toBe(true);
  });

  it('refuses an envelope longer than the 8 steps the CZ holds', () => {
    const tooLong: CZPatch = { line1: { ...INIT.line1, dcaEnvelope: Array.from({ length: 9 }, () => ({ rate: 50, level: 50 })) } };
    expect(() => encodeCzSysex(tooLong)).toThrow(CZSysexError);
  });
});

describe('CZ SysEx round trip (patch -> encode -> decode)', () => {
  it('the Init patch comes back with the same shape within level quantisation', () => {
    const { patch } = decodeCzSysex(encodeCzSysex(INIT), 'Init');
    expect(patch.name).toBe('Init');
    expect(patch.line1.waveform1).toBe(INIT.line1.waveform1);
    expect(patch.line2).toBeUndefined();
    expectStages(patch.line1.dcaEnvelope, INIT.line1.dcaEnvelope, 0.4); // a 7-bit byte spans 99/127 panel steps
    expectStages(patch.line1.dcwEnvelope, INIT.line1.dcwEnvelope, 0.4);
    expect(patch.line1.dcoEnvelope).toBeUndefined();
  });

  it('a two line patch keeps waveforms, window, ring modulation, octave, detune, sustain points and the coarse pitch step', () => {
    const { patch } = decodeCzSysex(encodeCzSysex(RICH), 'Rich');
    expect(patch.ringMod).toBe(true);
    expect(patch.noiseMode).toBeUndefined();
    expect(patch.octave).toBe(-1);
    expect([patch.line1.waveform1, patch.line1.waveform2, patch.line1.window]).toEqual([6, 4, 2]);
    expect(patch.line2!.waveform1).toBe(1);
    expect(close(patch.line2!.detune!, -530, 1)).toBe(true); // 1/60 semitone = 1.7 cents
    expectStages(patch.line1.dcaEnvelope, RICH.line1.dcaEnvelope, 0.4);
    expectStages(patch.line1.dcwEnvelope, RICH.line1.dcwEnvelope, 0.4);
    expectStages(patch.line1.dcoEnvelope, RICH.line1.dcoEnvelope, 0);
    expectStages(patch.line2!.dcaEnvelope, RICH.line2!.dcaEnvelope, 0.4);
  });

  it('noise modulation survives, and is distinct from ring modulation', () => {
    const noisy: CZPatch = { ...INIT, noiseMode: true };
    const { patch } = decodeCzSysex(encodeCzSysex(noisy));
    expect(patch.noiseMode).toBe(true);
    expect(patch.ringMod).toBeUndefined();
    expect(patch.line2).toBeDefined(); // modulation plays a pair
  });
});

describe('CZ SysEx validation', () => {
  const valid = () => encodeCzSysex(RICH);

  it('accepts a valid message', () => {
    expect(() => decodeCzSysex(valid())).not.toThrow();
  });

  it('rejects the wrong length (truncated or padded)', () => {
    expect(() => decodeCzSysex(valid().slice(0, 263))).toThrow(/264/);
    expect(() => decodeCzSysex(new Uint8Array([...valid(), 0]))).toThrow(/264/);
  });

  it('rejects another manufacturer, a non-tone function and a missing terminator', () => {
    const other = valid(); other[1] = 0x43;
    expect(() => decodeCzSysex(other)).toThrow(/Casio/);
    const request = valid(); request[5] = 0x30;
    expect(() => decodeCzSysex(request)).toThrow(/function/);
    const unterminated = valid(); unterminated[CZ_SYSEX_LENGTH - 1] = 0x00;
    expect(() => decodeCzSysex(unterminated)).toThrow(/F7/);
  });

  it('rejects data that is not nibbles, and an envelope end step beyond 7', () => {
    const wide = valid(); wide[20] = 0x7f;
    expect(() => decodeCzSysex(wide)).toThrow(/nibble/);
    const badEnd = valid(); badEnd[7 + 2 * 20] = 9; // DCA end step of line 1 = byte 20
    expect(() => decodeCzSysex(badEnd)).toThrow(/end step/);
  });
});

describe('CZ SysEx files', () => {
  it('names a single tone after its file, numbers several, and reports bad messages without losing the good ones', () => {
    const one = decodeCzSysexFile(encodeCzSysex(INIT), 'Folder/My Sound.syx');
    expect(one.patches.map((p) => p.patch.name)).toEqual(['My Sound']);

    const broken = encodeCzSysex(INIT); broken[1] = 0x00;
    const bank = new Uint8Array([...encodeCzSysex(INIT), ...broken, ...encodeCzSysex(RICH)]);
    expect(splitSysex(bank).length).toBe(3);
    const result = decodeCzSysexFile(bank, 'bank.syx');
    expect(result.patches.map((p) => p.patch.name)).toEqual(['bank 1', 'bank 3']);
    expect(result.errors.length).toBe(1);
  });

  it('a file with no SysEx in it is an error', () => {
    expect(decodeCzSysexFile(new Uint8Array([1, 2, 3]), 'x.syx').errors.length).toBe(1);
  });
});
