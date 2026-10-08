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
import { runBuzzChild, lastJsonLine, CPU_BUDGET_S } from './fixtures/runBuzzChild';

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
    it(`${type} initialises, finishes 400 blocks, and passes audio`, async () => {
      // A hang spins forever, so the budget is CPU time, not wall time: the
      // full pre-push gate starves a 0.1 s child for tens of seconds (it killed
      // FSMChorus at 30 s after it had printed its result, 2026-10-08).
      const r = await runBuzzChild([type, file, 'both']);
      expect(r.hung, `${type} hung (${r.cpuSeconds} s CPU, budget ${CPU_BUDGET_S}); output tail: ${r.stdout.slice(-300)} ${r.stderr.slice(-300)}`).toBeNull();
      const line = lastJsonLine(r.stdout);
      expect(line, r.stderr.slice(-400)).toBeTruthy();
      const res = JSON.parse(line!);
      expect(res.msgs).toEqual(['initialized']);
      expect(res.outRms).toBeGreaterThan(0.005);
    }, 150000);
  }

  it('Jeskola Freeverb at its defaults stays within 3 dB of the input (its LowCut 0 integrated sub-bass)', async () => {
    // LowCut 0 set a 0.001 Hz high-pass whose float coefficients put a pole
    // on z = 1: +18 dB overall on pink noise, all of it below 63 Hz.
    const r = await runBuzzChild(['JeskolaFreeverb', 'Jeskola_Freeverb', 'pink']);
    expect(r.hung).toBeNull();
    const res = JSON.parse(lastJsonLine(r.stdout)!);
    expect(Math.abs(res.gainDb), `${res.gainDb.toFixed(1)} dB`).toBeLessThan(3);
  }, 150000);

  it('a disposed machine stops its processor (disposed nodes ran for the rest of the session)', async () => {
    const r = await runBuzzChild(['JeskolaFreeverb', 'Jeskola_Freeverb', 'dispose']);
    expect(r.hung).toBeNull();
    const res = JSON.parse(lastJsonLine(r.stdout)!);
    expect(res.keepsRunning).toBe(false);
  }, 150000);
});
