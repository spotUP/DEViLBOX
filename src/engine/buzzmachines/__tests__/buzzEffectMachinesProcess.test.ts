/**
 * Every Buzz effect machine initialises, processes audio and returns.
 *
 * The master FX sweep (2026-09-29) found 15 of them silent, and Jeskola Delay
 * froze the browser: our WASM host (BuzzmachineWrapper.cpp) skipped the Buzz
 * host contract - no parameter / attribute defaults, no AttributesChanged(),
 * and every machine got Work() with an interleaved stereo buffer, so
 * input-mixing (MDK) machines never received audio, mono-to-stereo ones never
 * ran, and Jeskola Delay's zero-length tracks spun forever on the audio
 * thread. Each machine runs in a child process with a timeout, so a hang
 * fails the test instead of hanging the runner.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const RUNNER = resolve(__dirname, 'fixtures/runBuzzMachine.cjs');

const EFFECTS: [string, string][] = [
  ['ArguruDistortion', 'Arguru_Distortion'], ['ElakSVF', 'Elak_SVF'], ['ElakDist2', 'Elak_Dist2'],
  ['JeskolaDistortion', 'Jeskola_Distortion'], ['GeonikOverdrive', 'Geonik_Overdrive'], ['GraueSoftSat', 'Graue_SoftSat'],
  ['WhiteNoiseStereoDist', 'WhiteNoise_StereoDist'], ['CyanPhaseNotch', 'CyanPhase_Notch'], ['QZfilter', 'Q_Zfilter'],
  ['FSMPhilta', 'FSM_Philta'], ['JeskolaDelay', 'Jeskola_Delay'], ['JeskolaCrossDelay', 'Jeskola_CrossDelay'],
  ['JeskolaFreeverb', 'Jeskola_Freeverb'], ['FSMPanzerDelay', 'FSM_PanzerDelay'], ['FSMChorus', 'FSM_Chorus'],
  ['FSMChorus2', 'FSM_Chorus2'], ['WhiteNoiseWhiteChorus', 'WhiteNoise_WhiteChorus'], ['BigyoFrequencyShifter', 'Bigyo_FrequencyShifter'],
  ['GeonikCompressor', 'Geonik_Compressor'], ['LdSLimit', 'Ld_SLimit'], ['OomekExciter', 'Oomek_Exciter'],
  ['OomekMasterizer', 'Oomek_Masterizer'], ['DedaCodeStereoGain', 'DedaCode_StereoGain'],
];

describe('Buzz effect machines', () => {
  for (const [type, file] of EFFECTS) {
    it(`${type} initialises, finishes 400 blocks, and passes audio`, () => {
      const r = spawnSync(process.execPath, [RUNNER, type, file, 'both'], { timeout: 8000, encoding: 'utf8' });
      expect(r.signal, `${type} hung (killed after 8 s)`).toBeNull();
      const line = r.stdout.split('\n').reverse().find((l) => l.startsWith('{'));
      expect(line, r.stderr.slice(-400)).toBeTruthy();
      const res = JSON.parse(line!);
      expect(res.msgs).toEqual(['initialized']);
      expect(res.outRms).toBeGreaterThan(0.005);
    }, 15000);
  }

  it('Jeskola Freeverb at its defaults stays within 3 dB of the input (its LowCut 0 integrated sub-bass)', () => {
    // LowCut 0 set a 0.001 Hz high-pass whose float coefficients put a pole
    // on z = 1: +18 dB overall on pink noise, all of it below 63 Hz.
    const r = spawnSync(process.execPath, [RUNNER, 'JeskolaFreeverb', 'Jeskola_Freeverb', 'pink'], { timeout: 15000, encoding: 'utf8' });
    const res = JSON.parse(r.stdout.split('\n').reverse().find((l) => l.startsWith('{'))!);
    expect(Math.abs(res.gainDb), `${res.gainDb.toFixed(1)} dB`).toBeLessThan(3);
  }, 20000);

  it('a disposed machine stops its processor (disposed nodes ran for the rest of the session)', () => {
    const r = spawnSync(process.execPath, [RUNNER, 'JeskolaFreeverb', 'Jeskola_Freeverb', 'dispose'], { timeout: 8000, encoding: 'utf8' });
    const res = JSON.parse(r.stdout.split('\n').reverse().find((l) => l.startsWith('{'))!);
    expect(res.keepsRunning).toBe(false);
  }, 15000);
});
