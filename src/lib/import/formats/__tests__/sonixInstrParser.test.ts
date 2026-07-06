/**
 * Regression: standalone Sonix `.instr` synth parsing must match the WASM/native decode.
 *
 * parseSonixSynthInstr reads the fixed .instr struct offsets in pure TS. The authoritative
 * decode is the C code (sonix_io.c decode_synthesis_wave + sonix_song_set_synth_* setters,
 * exercised by tools/sonix-audit/gen-presets.c). The setters store the raw big-endian u16
 * fields verbatim, so the TS reader must produce identical params. The expected values below
 * were captured by running gen-presets.c on the committed ACE II instrument fixtures — if an
 * offset drifts, these assertions fail.
 *
 * Fixtures: public/data/songs/sonix-smus/ACE II/Instruments/ (committed real Sonix files).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSonixSynthInstr } from '@engine/sonix/sonixInstrument';
import { isSonixSynthInstr } from '../IffSmusParser';
import { buildSonixInstrumentConfigs } from '../SonixInstrumentImport';

const DIR = join(process.cwd(), 'public/data/songs/sonix-smus/ACE II/Instruments');
const read = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));

// Oracle values from gen-presets.c on the same files.
const ORACLE = {
  'Ace2leed.instr': {
    baseVol: 255, portFlag: 1, c2: 255, c4: 88,
    filterBase: 255, filterRange: 0, filterEnvSens: 0,
    envScanRate: 208, envLoopMode: -1, envDelayInit: 56,
    envVolScale: 0, envPitchScale: 64, slideRate: 0,
    wave0: -62, egLevels: [255, 192, 192, 0], egRates: [192, 64, 64, 72],
  },
  'Monty1.instr': {
    baseVol: 255, portFlag: 1, c2: 120, c4: 96,
    filterBase: 255, filterRange: 0, filterEnvSens: 0,
    envScanRate: 104, envLoopMode: -1, envDelayInit: 48,
    envVolScale: 0, envPitchScale: 64, slideRate: 0,
    wave0: -62, egLevels: [255, 192, 192, 0], egRates: [255, 64, 64, 0],
  },
} as const;

describe('parseSonixSynthInstr', () => {
  for (const [name, exp] of Object.entries(ORACLE)) {
    it(`decodes ${name} identically to the C oracle`, () => {
      const p = parseSonixSynthInstr(read(name));
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.baseVol).toBe(exp.baseVol);
      expect(p.portFlag).toBe(exp.portFlag);
      expect(p.c2).toBe(exp.c2);
      expect(p.c4).toBe(exp.c4);
      expect(p.filterBase).toBe(exp.filterBase);
      expect(p.filterRange).toBe(exp.filterRange);
      expect(p.filterEnvSens).toBe(exp.filterEnvSens);
      expect(p.envScanRate).toBe(exp.envScanRate);
      expect(p.envLoopMode).toBe(exp.envLoopMode);
      expect(p.envDelayInit).toBe(exp.envDelayInit);
      expect(p.envVolScale).toBe(exp.envVolScale);
      expect(p.envPitchScale).toBe(exp.envPitchScale);
      expect(p.slideRate).toBe(exp.slideRate);
      expect(p.wave).toHaveLength(128);
      expect(p.wave[0]).toBe(exp.wave0);
      expect(p.envTable).toHaveLength(128);
      expect(p.lfoWave).toHaveLength(128);
      expect(p.egLevels).toEqual(exp.egLevels);
      expect(p.egRates).toEqual(exp.egRates);
    });
  }

  it('returns null for a SampledSound (.ss) file (not a synth voice)', () => {
    expect(parseSonixSynthInstr(read('hidrum1.ss'))).toBeNull();
  });
});

describe('buildSonixInstrumentConfigs', () => {
  it('builds a SonixSynth config from a standalone synth .instr', () => {
    const buf = readFileSync(join(DIR, 'Ace2leed.instr'));
    const { configs, skipped } = buildSonixInstrumentConfigs([
      { name: 'Ace2leed.instr', buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
    ]);
    expect(skipped).toHaveLength(0);
    expect(configs).toHaveLength(1);
    expect(configs[0].type).toBe('synth');
    expect(configs[0].synthType).toBe('SonixSynth');
    const sonix = (configs[0].parameters as { sonix: { baseVol: number } }).sonix;
    expect(sonix.baseVol).toBe(255);
  });

  it('builds a Sampler config from a standalone .ss', () => {
    const buf = readFileSync(join(DIR, 'hidrum1.ss'));
    const { configs, skipped } = buildSonixInstrumentConfigs([
      { name: 'hidrum1.ss', buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
    ]);
    expect(skipped).toHaveLength(0);
    expect(configs).toHaveLength(1);
    expect(configs[0].type).toBe('sample');
    expect(configs[0].synthType).toBe('Sampler');
  });

  it('pairs a non-synth .instr with its .ss into a single Sampler', () => {
    // hidrum1 ships both a (sample) .instr and its .ss PCM — one instrument, from the .ss.
    const instr = readFileSync(join(DIR, 'hidrum1.instr'));
    const ss = readFileSync(join(DIR, 'hidrum1.ss'));
    expect(isSonixSynthInstr(new Uint8Array(instr))).toBe(false);
    const { configs, skipped } = buildSonixInstrumentConfigs([
      { name: 'hidrum1.instr', buffer: instr.buffer.slice(instr.byteOffset, instr.byteOffset + instr.byteLength) },
      { name: 'hidrum1.ss', buffer: ss.buffer.slice(ss.byteOffset, ss.byteOffset + ss.byteLength) },
    ]);
    expect(skipped).toHaveLength(0);
    expect(configs).toHaveLength(1);
    expect(configs[0].type).toBe('sample');
  });
});
