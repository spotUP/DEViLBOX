/**
 * Buzzmachine effect registrations — lazy loaded
 *
 * 23 Jeskola Buzz effects emulated via WASM.
 * All use the same pattern: BuzzmachineSynth(machineType) + setParameter(idx, value).
 */

import type { EffectConfig, EffectPreset } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';
import { BUZZMACHINE_INFO, type BuzzmachineType } from '@engine/buzzmachines/BuzzmachineEngine';

/** Helper: create a buzzmachine effect descriptor */
function buzzEffect(
  id: string, name: string, machineType: BuzzmachineType, group: string,
  presets?: EffectPreset[],
): EffectDescriptor {
  return {
    id, name, category: 'buzzmachine', group, loadMode: 'lazy',
    create: async (c: EffectConfig) => {
      const { BuzzmachineSynth } = await import('@engine/buzzmachines/BuzzmachineSynth');
      const synth = new BuzzmachineSynth(machineType);
      Object.entries(c.parameters).forEach(([key, value]) => {
        const paramIndex = parseInt(key, 10);
        if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value as number);
      });
      return synth;
    },
    getDefaultParameters: () => {
      // Populate defaults from BUZZMACHINE_INFO so the store has initial
      // values and the knobs render at their correct starting positions.
      const info = BUZZMACHINE_INFO[machineType];
      if (!info?.parameters?.length) return {};
      const defaults: Record<string, number> = {};
      for (const p of info.parameters) {
        defaults[String(p.index)] = p.defaultValue;
      }
      return defaults;
    },
    presets,
  };
}

EffectRegistry.register([
  // ── Distortion ──────────────────────────────────────────────────────────────
  //
  // ArguruDistortion: 6 params from BUZZMACHINE_INFO
  //   0: Input Gain    min=0x0001 max=0x0800 default=0x0100
  //   1: Threshold (-) min=0x0001 max=0x8000 default=0x200
  //   2: Threshold (+) min=0x0001 max=0x8000 default=0x200
  //   3: Output Gain   min=0x0001 max=0x0800 default=0x0400
  //   4: Phase Inv     min=0 max=1 default=0
  //   5: Mode          min=0 max=1 default=0
  buzzEffect('BuzzDistortion', 'Arguru Distortion', 'ArguruDistortion', 'Distortion', [
    {
      name: 'Mild',
      params: {
        '0': 0x0080,  // Input Gain ~25% of range (1→2048)
        '1': 0x2000,  // Threshold (-) ~25% of range
        '2': 0x2000,  // Threshold (+) ~25% of range
        '3': 0x0400,  // Output Gain = default (nice unity)
        '4': 0,
        '5': 0,       // Clip mode
      },
    },
    {
      name: 'Medium',
      params: {
        '0': 0x0100,  // Input Gain = default
        '1': 0x0200,  // Threshold (-) = default
        '2': 0x0200,  // Threshold (+) = default
        '3': 0x0400,  // Output Gain = default
        '4': 0,
        '5': 1,       // Saturate mode
      },
    },
    {
      name: 'Extreme',
      params: {
        '0': 0x0600,  // Input Gain ~85% of range
        '1': 0x0080,  // Threshold (-) very low = heavy clipping
        '2': 0x0080,  // Threshold (+) very low = heavy clipping
        '3': 0x0400,  // Output Gain = default
        '4': 0,
        '5': 1,       // Saturate mode
      },
    },
  ]),

  // GeonikOverdrive: params not documented in BUZZMACHINE_INFO (parameters: [])
  // Typical Buzz overdrive: p0=drive(0-255), p1=tone(0-255), p2=level(0-255)
  buzzEffect('BuzzOverdrive', 'Geonik Overdrive', 'GeonikOverdrive', 'Distortion', [
    { name: 'Mild',    params: { '0': 64,  '1': 128, '2': 200 } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 160 } },
    { name: 'Extreme', params: { '0': 220, '1': 180, '2': 128 } },
  ]),

  // JeskolaDistortion: params not documented — standard drive/tone/output layout
  buzzEffect('BuzzDistortion2', 'Jeskola Distortion', 'JeskolaDistortion', 'Distortion', [
    { name: 'Mild',    params: { '0': 32,  '1': 128 } },
    { name: 'Medium',  params: { '0': 128, '1': 128 } },
    { name: 'Extreme', params: { '0': 220, '1': 200 } },
  ]),

  // ElakDist2: params not documented
  buzzEffect('BuzzDist2', 'Elak Dist2', 'ElakDist2', 'Distortion', [
    { name: 'Mild',    params: { '0': 32,  '1': 128 } },
    { name: 'Medium',  params: { '0': 128, '1': 128 } },
    { name: 'Extreme', params: { '0': 220, '1': 200 } },
  ]),

  // GraueSoftSat: params not documented — soft saturation drive + output
  buzzEffect('BuzzSoftSat', 'Graue Soft Saturation', 'GraueSoftSat', 'Distortion', [
    { name: 'Mild',    params: { '0': 32,  '1': 200 } },
    { name: 'Medium',  params: { '0': 100, '1': 180 } },
    { name: 'Extreme', params: { '0': 200, '1': 128 } },
  ]),

  // WhiteNoiseStereoDist: params not documented — stereo drive + balance
  buzzEffect('BuzzStereoDist', 'WhiteNoise Stereo Dist', 'WhiteNoiseStereoDist', 'Distortion', [
    { name: 'Mild',    params: { '0': 32,  '1': 128, '2': 128 } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 128 } },
    { name: 'Extreme', params: { '0': 220, '1': 180, '2': 100 } },
  ]),

  // ── Filter ──────────────────────────────────────────────────────────────────
  //
  // ElakSVF: 2 params from BUZZMACHINE_INFO
  //   0: Cutoff     min=0 max=1000 default=0x200(512)
  //   1: Resonance  min=0 max=0xFFFE default=0x200(512)
  buzzEffect('BuzzSVF', 'Elak State Variable Filter', 'ElakSVF', 'Filter', [
    {
      name: 'Mild',
      params: {
        '0': 750,    // Cutoff ~75% (open)
        '1': 0x0800, // Resonance ~3% of range (subtle)
      },
    },
    {
      name: 'Medium',
      params: {
        '0': 0x0200, // Cutoff = default (512)
        '1': 0x2000, // Resonance ~20% of range
      },
    },
    {
      name: 'Extreme',
      params: {
        '0': 100,    // Cutoff ~10% (nearly closed)
        '1': 0xC000, // Resonance ~75% of range (near self-oscillation)
      },
    },
  ]),

  // FSMPhilta: params not documented — cutoff + resonance + mode
  buzzEffect('BuzzPhilta', 'FSM Philta', 'FSMPhilta', 'Filter', [
    { name: 'Mild',    params: { '0': 200, '1': 32,  '2': 0 } },
    { name: 'Medium',  params: { '0': 128, '1': 80,  '2': 0 } },
    { name: 'Extreme', params: { '0': 40,  '1': 200, '2': 1 } },
  ]),

  // CyanPhaseNotch: params not documented — frequency + depth + width
  buzzEffect('BuzzNotch', 'CyanPhase Notch', 'CyanPhaseNotch', 'Filter', [
    { name: 'Mild',    params: { '0': 128, '1': 64,  '2': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 128 } },
    { name: 'Extreme', params: { '0': 64,  '1': 220, '2': 32  } },
  ]),

  // QZfilter: params not documented — cutoff + resonance + type
  buzzEffect('BuzzZfilter', 'Q Zfilter', 'QZfilter', 'Filter', [
    { name: 'Mild',    params: { '0': 200, '1': 32,  '2': 0 } },
    { name: 'Medium',  params: { '0': 128, '1': 100, '2': 0 } },
    { name: 'Extreme', params: { '0': 40,  '1': 200, '2': 1 } },
  ]),

  // ── Reverb & Delay ──────────────────────────────────────────────────────────
  //
  // JeskolaDelay: params not documented — time + feedback + mix
  buzzEffect('BuzzDelay', 'Jeskola Delay', 'JeskolaDelay', 'Reverb & Delay', [
    { name: 'Mild',    params: { '0': 64,  '1': 64,  '2': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 128 } },
    { name: 'Extreme', params: { '0': 200, '1': 200, '2': 180 } },
  ]),

  // JeskolaCrossDelay: params not documented — L time + R time + feedback + mix
  buzzEffect('BuzzCrossDelay', 'Jeskola Cross Delay', 'JeskolaCrossDelay', 'Reverb & Delay', [
    { name: 'Mild',    params: { '0': 64,  '1': 96,  '2': 48,  '3': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 192, '2': 128, '3': 128 } },
    { name: 'Extreme', params: { '0': 200, '1': 220, '2': 200, '3': 180 } },
  ]),

  // JeskolaFreeverb: params not documented — room size + damping + wet
  buzzEffect('BuzzFreeverb', 'Jeskola Freeverb', 'JeskolaFreeverb', 'Reverb & Delay', [
    { name: 'Mild',    params: { '0': 64,  '1': 128, '2': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 128 } },
    { name: 'Extreme', params: { '0': 220, '1': 64,  '2': 200 } },
  ]),

  // FSMPanzerDelay: params not documented — time + feedback + stereo width + mix
  buzzEffect('BuzzPanzerDelay', 'FSM Panzer Delay', 'FSMPanzerDelay', 'Reverb & Delay', [
    { name: 'Mild',    params: { '0': 64,  '1': 48,  '2': 128, '3': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 128, '2': 128, '3': 128 } },
    { name: 'Extreme', params: { '0': 200, '1': 200, '2': 200, '3': 180 } },
  ]),

  // ── Modulation ──────────────────────────────────────────────────────────────
  //
  // FSMChorus: params not documented — rate + depth + delay + mix
  buzzEffect('BuzzChorus', 'FSM Chorus', 'FSMChorus', 'Modulation', [
    { name: 'Mild',    params: { '0': 32,  '1': 32,  '2': 64,  '3': 64  } },
    { name: 'Medium',  params: { '0': 80,  '1': 80,  '2': 128, '3': 128 } },
    { name: 'Extreme', params: { '0': 180, '1': 180, '2': 200, '3': 200 } },
  ]),

  // FSMChorus2: params not documented — rate + depth + mix
  buzzEffect('BuzzChorus2', 'FSM Chorus 2', 'FSMChorus2', 'Modulation', [
    { name: 'Mild',    params: { '0': 32,  '1': 32,  '2': 64  } },
    { name: 'Medium',  params: { '0': 80,  '1': 80,  '2': 128 } },
    { name: 'Extreme', params: { '0': 180, '1': 180, '2': 200 } },
  ]),

  // WhiteNoiseWhiteChorus: params not documented — rate + depth + stereo
  buzzEffect('BuzzWhiteChorus', 'WhiteNoise White Chorus', 'WhiteNoiseWhiteChorus', 'Modulation', [
    { name: 'Mild',    params: { '0': 32,  '1': 32,  '2': 128 } },
    { name: 'Medium',  params: { '0': 80,  '1': 100, '2': 200 } },
    { name: 'Extreme', params: { '0': 180, '1': 200, '2': 255 } },
  ]),

  // ── Pitch ────────────────────────────────────────────────────────────────────
  //
  // BigyoFrequencyShifter: params not documented — shift amount + mix
  buzzEffect('BuzzFreqShift', 'Bigyo Frequency Shifter', 'BigyoFrequencyShifter', 'Pitch', [
    { name: 'Mild',    params: { '0': 32,  '1': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 128 } },
    { name: 'Extreme', params: { '0': 220, '1': 200 } },
  ]),

  // ── Dynamics ────────────────────────────────────────────────────────────────
  //
  // GeonikCompressor: params not documented — threshold + ratio + attack + release + gain
  buzzEffect('BuzzCompressor', 'Geonik Compressor', 'GeonikCompressor', 'Dynamics', [
    { name: 'Mild',    params: { '0': 180, '1': 32,  '2': 32,  '3': 64,  '4': 128 } },
    { name: 'Medium',  params: { '0': 128, '1': 100, '2': 64,  '3': 128, '4': 160 } },
    { name: 'Extreme', params: { '0': 64,  '1': 200, '2': 16,  '3': 200, '4': 200 } },
  ]),

  // LdSLimit: params not documented — threshold + gain
  buzzEffect('BuzzLimiter', 'Ld Soft Limiter', 'LdSLimit', 'Dynamics', [
    { name: 'Mild',    params: { '0': 200, '1': 128 } },
    { name: 'Medium',  params: { '0': 160, '1': 160 } },
    { name: 'Extreme', params: { '0': 100, '1': 200 } },
  ]),

  // OomekExciter: params not documented — frequency + amount + mix
  buzzEffect('BuzzExciter', 'Oomek Exciter', 'OomekExciter', 'Dynamics', [
    { name: 'Mild',    params: { '0': 64,  '1': 32,  '2': 64  } },
    { name: 'Medium',  params: { '0': 128, '1': 100, '2': 128 } },
    { name: 'Extreme', params: { '0': 200, '1': 200, '2': 200 } },
  ]),

  // OomekMasterizer: params not documented — bass + treble + enhance + limit
  buzzEffect('BuzzMasterizer', 'Oomek Masterizer', 'OomekMasterizer', 'Dynamics', [
    { name: 'Mild',    params: { '0': 32,  '1': 32,  '2': 32,  '3': 200 } },
    { name: 'Medium',  params: { '0': 80,  '1': 80,  '2': 80,  '3': 180 } },
    { name: 'Extreme', params: { '0': 180, '1': 160, '2': 180, '3': 128 } },
  ]),

  // ── EQ & Stereo ─────────────────────────────────────────────────────────────
  //
  // DedaCodeStereoGain: params not documented — L gain + R gain + width
  buzzEffect('BuzzStereoGain', 'DedaCode Stereo Gain', 'DedaCodeStereoGain', 'EQ & Stereo', [
    { name: 'Mild',    params: { '0': 128, '1': 128, '2': 128 } },
    { name: 'Medium',  params: { '0': 160, '1': 160, '2': 180 } },
    { name: 'Extreme', params: { '0': 220, '1': 220, '2': 255 } },
  ]),
]);
