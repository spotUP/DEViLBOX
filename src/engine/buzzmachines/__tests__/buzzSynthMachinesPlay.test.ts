/**
 * Every Buzz synth (generator) plays a note, finite and at the right pitch.
 *
 * The WASM host gave each machine Work() with an interleaved stereo buffer;
 * a generator writes MONO, so the worklet read its samples as L,R pairs:
 * Oomek Aggressor's C4 came out at 128 Hz. The worklet also overwrote the
 * machines' own defaults on the first note (Makk M3 near-silent at -51 dB,
 * Dynamite6 at 4096x gain - 98 % of samples clipped) and hard-clamped the
 * output. Runs each machine through the real worklet in a child process.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { BUZZMACHINE_INFO, BuzzmachineType } from '../BuzzmachineEngine';

const RUNNER = resolve(__dirname, 'fixtures/runBuzzMachine.cjs');

/** [type, file, pitched] - pitched synths must play C4 (261.6 Hz). */
const SYNTHS: [string, string, boolean][] = [
  ['FSMKick', 'FSM_Kick', false], ['FSMKickXP', 'FSM_KickXP', false], ['JeskolaTrilok', 'Jeskola_Trilok', false],
  ['JeskolaNoise', 'Jeskola_Noise', false], ['OomekAggressor', 'Oomek_Aggressor', true], ['OomekAggressorDF', 'Oomek_Aggressor_DF', true],
  ['MadBrain4FM2F', 'MadBrain_4FM2F', false], ['MadBrainDynamite6', 'MadBrain_Dynamite6', true], ['MakkM3', 'Makk_M3', true],
  ['MakkM4', 'Makk_M4', true], ['CyanPhaseDTMF', 'CyanPhase_DTMF', false], ['ElenzilFrequencyBomb', 'Elenzil_FrequencyBomb', true],
];

function play(type: string, file: string) {
  const info = BUZZMACHINE_INFO[type as BuzzmachineType];
  const layout = info?.parameters?.map((p) => ({ byteOffset: p.byteOffset, size: p.type === 'word' ? 2 : 1, isTrack: p.isTrack ?? false })) ?? [];
  const r = spawnSync(process.execPath, [RUNNER, type, file, 'note'], {
    timeout: 8000, encoding: 'utf8', env: { ...process.env, BUZZ_LAYOUT: JSON.stringify(layout) },
  });
  expect(r.signal, `${type} hung`).toBeNull();
  const line = r.stdout.split('\n').reverse().find((l) => l.startsWith('{'));
  expect(line, r.stderr.slice(-400)).toBeTruthy();
  return JSON.parse(line!);
}

describe('Buzz synth machines', () => {
  for (const [type, file, pitched] of SYNTHS) {
    it(`${type} plays a note${pitched ? ' at C4' : ''}`, () => {
      const res = play(type, file);
      expect(res.msgs).toEqual(['initialized']);
      expect(res.finite).toBe(true);
      expect(res.outRms).toBeGreaterThan(0.01);
      expect(res.clippedFraction).toBeLessThan(0.5);
      if (pitched) expect(Math.abs(12 * Math.log2(res.f0 / 261.63))).toBeLessThan(1);
    }, 15000);
  }
});
