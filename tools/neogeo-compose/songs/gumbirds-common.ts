/**
 * Shared helpers for the Gumbirds arena / round_clear / game_over specs (same patch format as gumbirds-title.ts).
 * Not a song: run.ts loads gumbirds-arena / gumbirds-round-clear / gumbirds-game-over, which import this.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import type { FurnaceConfig, FurnaceOperatorConfig, FurnaceMacro } from '@/types/instrument';
import { INS_SSG, INS_ADPCM_B, readWavPcm16, trimWithFade, resample } from '@/lib/export/neogeo/neoGeoCompose';

export const OPNB = 14;
export type Op = Partial<FurnaceOperatorConfig>;

/** FM patch from operators named as on the chip (OP1-OP4); stored in register-slot order OP1, OP3, OP2, OP4. */
export function fm(algorithm: number, feedback: number, ops: { op1: Op; op2: Op; op3: Op; op4: Op }): FurnaceConfig {
  const make = (o: Op): FurnaceOperatorConfig =>
    ({ ...DEFAULT_FURNACE.operators[0], dt: 3, rs: 0, ssg: 0, am: false, d2r: 0, ...o, enabled: true }) as FurnaceOperatorConfig;
  return {
    ...DEFAULT_FURNACE, chipType: OPNB, algorithm, feedback, fms: 0, ams: 0,
    operators: [make(ops.op1), make(ops.op3), make(ops.op2), make(ops.op4)],
    macros: [], opMacros: [{}, {}, {}, {}],
  } as FurnaceConfig;
}

export const seqMacro = (code: number, data: number[], loop = -1): FurnaceMacro => ({ code, type: 0, data, loop, release: -1, mode: 0 });
export function ssg(macros: FurnaceMacro[]): FurnaceConfig {
  return { ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_SSG, operators: [], macros, opMacros: [] } as FurnaceConfig;
}

/** The title's ADPCM-B kick: 0.18 s of BD_Romkick1, 30 ms fade, 18.5 kHz (3330 samples, 1792 bytes of V ROM). */
export function kick(repoRoot: string): FurnaceConfig {
  const wav = readWavPcm16(readFileSync(`${repoRoot}/public/data/samples/packs/drumnibus/kicks/BD_Romkick1.wav`));
  const data = resample(trimWithFade(wav.data, wav.rate, 0.18, 30), wav.rate, 18500, 0.9);
  return {
    ...DEFAULT_FURNACE, chipType: OPNB, divInsType: INS_ADPCM_B, operators: [], macros: [], opMacros: [],
    userSample: { name: 'gumbirds kick', data, rate: 18500 },
  } as unknown as FurnaceConfig;
}

/** SSG arp bed: pluck decay then soft looping tail; arp cycles root/third/fifth/top two ticks each. */
export function arpMacros(third: number, top: number, start = 9): FurnaceMacro[] {
  const cycle = [0, 0, third, third, 7, 7, top, top];
  const v = [start, start - 1, start - 2, start - 2, start - 3, start - 3, start - 4, start - 4, start - 4,
    start - 5, start - 5, start - 5, start - 6, start - 6, start - 6, start - 6].map((x) => Math.max(x, 2));
  return [
    seqMacro(0, [...v, 2, 2, 2, 2, 2, 2, 2, 2], 16),
    seqMacro(1, [...cycle, ...cycle, ...cycle], 16),
  ];
}
