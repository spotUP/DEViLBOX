/**
 * Buzzmachine effect registrations — lazy loaded
 *
 * 23 Jeskola Buzz effects emulated via WASM.
 * All use the same pattern: BuzzmachineSynth(machineType) + setParameter(idx, value).
 */

import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';
import type { BuzzmachineType } from '@engine/buzzmachines/BuzzmachineEngine';

/** Helper: create a buzzmachine effect descriptor */
function buzzEffect(
  id: string, name: string, machineType: BuzzmachineType, group: string,
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
    getDefaultParameters: () => ({}),
  };
}

EffectRegistry.register([
  // Distortion
  buzzEffect('BuzzDistortion', 'Arguru Distortion', 'ArguruDistortion', 'Distortion'),
  buzzEffect('BuzzOverdrive', 'Geonik Overdrive', 'GeonikOverdrive', 'Distortion'),
  buzzEffect('BuzzDistortion2', 'Jeskola Distortion', 'JeskolaDistortion', 'Distortion'),
  buzzEffect('BuzzDist2', 'Elak Dist2', 'ElakDist2', 'Distortion'),
  buzzEffect('BuzzSoftSat', 'Graue Soft Saturation', 'GraueSoftSat', 'Distortion'),
  buzzEffect('BuzzStereoDist', 'WhiteNoise Stereo Dist', 'WhiteNoiseStereoDist', 'Distortion'),
  // Filter
  buzzEffect('BuzzSVF', 'Elak State Variable Filter', 'ElakSVF', 'Filter'),
  buzzEffect('BuzzPhilta', 'FSM Philta', 'FSMPhilta', 'Filter'),
  buzzEffect('BuzzNotch', 'CyanPhase Notch', 'CyanPhaseNotch', 'Filter'),
  buzzEffect('BuzzZfilter', 'Q Zfilter', 'QZfilter', 'Filter'),
  // Reverb & Delay
  buzzEffect('BuzzDelay', 'Jeskola Delay', 'JeskolaDelay', 'Reverb & Delay'),
  buzzEffect('BuzzCrossDelay', 'Jeskola Cross Delay', 'JeskolaCrossDelay', 'Reverb & Delay'),
  buzzEffect('BuzzFreeverb', 'Jeskola Freeverb', 'JeskolaFreeverb', 'Reverb & Delay'),
  buzzEffect('BuzzPanzerDelay', 'FSM Panzer Delay', 'FSMPanzerDelay', 'Reverb & Delay'),
  // Modulation
  buzzEffect('BuzzChorus', 'FSM Chorus', 'FSMChorus', 'Modulation'),
  buzzEffect('BuzzChorus2', 'FSM Chorus 2', 'FSMChorus2', 'Modulation'),
  buzzEffect('BuzzWhiteChorus', 'WhiteNoise White Chorus', 'WhiteNoiseWhiteChorus', 'Modulation'),
  buzzEffect('BuzzFreqShift', 'Bigyo Frequency Shifter', 'BigyoFrequencyShifter', 'Pitch'),
  // Dynamics
  buzzEffect('BuzzCompressor', 'Geonik Compressor', 'GeonikCompressor', 'Dynamics'),
  buzzEffect('BuzzLimiter', 'Ld Soft Limiter', 'LdSLimit', 'Dynamics'),
  buzzEffect('BuzzExciter', 'Oomek Exciter', 'OomekExciter', 'Dynamics'),
  buzzEffect('BuzzMasterizer', 'Oomek Masterizer', 'OomekMasterizer', 'Dynamics'),
  // EQ & Stereo
  buzzEffect('BuzzStereoGain', 'DedaCode Stereo Gain', 'DedaCodeStereoGain', 'EQ & Stereo'),
]);
