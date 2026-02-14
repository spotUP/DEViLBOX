/**
 * Buzzmachine generator registrations (lazy-loaded)
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import { BuzzmachineGenerator } from '../../buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from '../../buzzmachines/BuzzmachineEngine';

const VOLUME_OFFSETS: Record<string, number> = {
  BuzzKick: 3, BuzzKickXP: 5, BuzzNoise: 7, BuzzTrilok: 5,
  Buzz4FM2F: 7, BuzzFreqBomb: 4, BuzzDTMF: 0, BuzzDynamite6: 0,
  BuzzM3: 0, BuzzM4: 0, Buzz3o3: 5, Buzz3o3DF: 8,
};

function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}

interface BuzzDef {
  id: string;
  name: string;
  machineType: BuzzmachineType;
}

const BUZZ_GENERATORS: BuzzDef[] = [
  { id: 'BuzzDTMF', name: 'CyanPhase DTMF', machineType: BuzzmachineType.CYANPHASE_DTMF },
  { id: 'BuzzFreqBomb', name: 'Frequency Bomb', machineType: BuzzmachineType.ELENZIL_FREQUENCYBOMB },
  { id: 'BuzzKick', name: 'FSM Kick', machineType: BuzzmachineType.FSM_KICK },
  { id: 'BuzzKickXP', name: 'FSM KickXP', machineType: BuzzmachineType.FSM_KICKXP },
  { id: 'BuzzNoise', name: 'Jeskola Noise', machineType: BuzzmachineType.JESKOLA_NOISE },
  { id: 'BuzzTrilok', name: 'Jeskola Trilok', machineType: BuzzmachineType.JESKOLA_TRILOK },
  { id: 'Buzz4FM2F', name: 'MadBrain 4FM2F', machineType: BuzzmachineType.MADBRAIN_4FM2F },
  { id: 'BuzzDynamite6', name: 'MadBrain Dynamite6', machineType: BuzzmachineType.MADBRAIN_DYNAMITE6 },
  { id: 'BuzzM3', name: 'Makk M3', machineType: BuzzmachineType.MAKK_M3 },
  { id: 'BuzzM4', name: 'Makk M4', machineType: BuzzmachineType.MAKK_M4 },
];

// Standard non-303 buzz generators
for (const buzz of BUZZ_GENERATORS) {
  SynthRegistry.register({
    id: buzz.id,
    name: buzz.name,
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: VOLUME_OFFSETS[buzz.id] ?? 0,
    controlsComponent: 'ChipSynthControls',
    create: (config) => {
      const synth = new BuzzmachineGenerator(buzz.machineType);
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume(buzz.id, config.volume));
      return synth;
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      (synth as unknown as { triggerAttack: (note: string, time: number, velocity: number, accent?: boolean, slide?: boolean) => void })
        .triggerAttack(note, time, velocity, opts.accent, opts.slide);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  });
}

// Buzz3o3 (303 clone — uses Devil Fish WASM with TB-303 config)
SynthRegistry.register({
  id: 'Buzz3o3',
  name: 'Oomek Aggressor 3o3',
  category: 'wasm',
  loadMode: 'lazy',
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 5,
  controlsComponent: 'TB303Controls',
  create: (config) => {
    const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);
    if (config.tb303) {
      const tb = config.tb303;
      synth.setCutoff(tb.filter.cutoff);
      synth.setResonance(tb.filter.resonance);
      synth.setEnvMod(tb.filterEnvelope.envMod);
      synth.setDecay(tb.filterEnvelope.decay);
      synth.setAccentAmount(tb.accent.amount);
      synth.setWaveform(tb.oscillator.type);
      if (tb.tuning !== undefined) synth.setTuning(tb.tuning);
      if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);
    }
    const normalizedVolume = getNormalizedVolume('Buzz3o3', config.volume);
    synth.output.gain.value = Tone.dbToGain(normalizedVolume);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity, opts) => {
    (synth as unknown as { triggerAttack: (note: string, time: number, velocity: number, accent?: boolean, slide?: boolean) => void })
      .triggerAttack(note, time, velocity, opts.accent, opts.slide);
    return true;
  },
  onTriggerRelease: (synth, _note, time) => {
    (synth as any).triggerRelease(time);
    return true;
  },
});

// Buzz3o3DF (Devil Fish enhanced variant)
SynthRegistry.register({
  id: 'Buzz3o3DF',
  name: 'Oomek Aggressor Devil Fish',
  category: 'wasm',
  loadMode: 'lazy',
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 8,
  controlsComponent: 'TB303Controls',
  create: (config) => {
    const synth = new BuzzmachineGenerator(BuzzmachineType.OOMEK_AGGRESSOR_DF);
    if (config.tb303) {
      const tb = config.tb303;
      synth.setCutoff(tb.filter.cutoff);
      synth.setResonance(tb.filter.resonance);
      synth.setEnvMod(tb.filterEnvelope.envMod);
      synth.setDecay(tb.filterEnvelope.decay);
      synth.setAccentAmount(tb.accent.amount);
      synth.setWaveform(tb.oscillator.type);
      if (tb.tuning !== undefined) synth.setTuning(tb.tuning);
      if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);
    }
    const normalizedVolume = getNormalizedVolume('Buzz3o3DF', config.volume);
    synth.output.gain.value = Tone.dbToGain(normalizedVolume);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity, opts) => {
    (synth as unknown as { triggerAttack: (note: string, time: number, velocity: number, accent?: boolean, slide?: boolean) => void })
      .triggerAttack(note, time, velocity, opts.accent, opts.slide);
    return true;
  },
  onTriggerRelease: (synth, _note, time) => {
    (synth as any).triggerRelease(time);
    return true;
  },
});

// Buzzmachine (generic effects machine)
SynthRegistry.register({
  id: 'Buzzmachine',
  name: 'Buzzmachine',
  category: 'wasm',
  loadMode: 'lazy',
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 0,
  create: (config) => {
    const machineTypeStr = config.buzzmachine?.machineType || 'ArguruDistortion';
    const machineTypeMap: Record<string, BuzzmachineType> = {
      ArguruDistortion: BuzzmachineType.ARGURU_DISTORTION,
      ElakDist2: BuzzmachineType.ELAK_DIST2,
      JeskolaDistortion: BuzzmachineType.JESKOLA_DISTORTION,
      GeonikOverdrive: BuzzmachineType.GEONIK_OVERDRIVE,
      GraueSoftSat: BuzzmachineType.GRAUE_SOFTSAT,
      WhiteNoiseStereoDist: BuzzmachineType.WHITENOISE_STEREODIST,
      ElakSVF: BuzzmachineType.ELAK_SVF,
      CyanPhaseNotch: BuzzmachineType.CYANPHASE_NOTCH,
      QZfilter: BuzzmachineType.Q_ZFILTER,
      FSMPhilta: BuzzmachineType.FSM_PHILTA,
      JeskolaDelay: BuzzmachineType.JESKOLA_DELAY,
      JeskolaCrossDelay: BuzzmachineType.JESKOLA_CROSSDELAY,
      JeskolaFreeverb: BuzzmachineType.JESKOLA_FREEVERB,
      FSMPanzerDelay: BuzzmachineType.FSM_PANZERDELAY,
      FSMChorus: BuzzmachineType.FSM_CHORUS,
      FSMChorus2: BuzzmachineType.FSM_CHORUS2,
      WhiteNoiseWhiteChorus: BuzzmachineType.WHITENOISE_WHITECHORUS,
      BigyoFrequencyShifter: BuzzmachineType.BIGYO_FREQUENCYSHIFTER,
      GeonikCompressor: BuzzmachineType.GEONIK_COMPRESSOR,
      LdSLimit: BuzzmachineType.LD_SLIMIT,
      OomekExciter: BuzzmachineType.OOMEK_EXCITER,
      OomekMasterizer: BuzzmachineType.OOMEK_MASTERIZER,
      DedaCodeStereoGain: BuzzmachineType.DEDACODE_STEREOGAIN,
      FSMKick: BuzzmachineType.FSM_KICK,
      FSMKickXP: BuzzmachineType.FSM_KICKXP,
      JeskolaTrilok: BuzzmachineType.JESKOLA_TRILOK,
      JeskolaNoise: BuzzmachineType.JESKOLA_NOISE,
      OomekAggressor: BuzzmachineType.OOMEK_AGGRESSOR,
      MadBrain4FM2F: BuzzmachineType.MADBRAIN_4FM2F,
      MadBrainDynamite6: BuzzmachineType.MADBRAIN_DYNAMITE6,
      MakkM3: BuzzmachineType.MAKK_M3,
      CyanPhaseDTMF: BuzzmachineType.CYANPHASE_DTMF,
      ElenzilFrequencyBomb: BuzzmachineType.ELENZIL_FREQUENCYBOMB,
    };
    const machineType = machineTypeMap[machineTypeStr] ?? BuzzmachineType.ARGURU_DISTORTION;
    const synth = new BuzzmachineGenerator(machineType);
    synth.output.gain.value = Tone.dbToGain((config.volume ?? -12));
    return synth;
  },
  onTriggerRelease: (synth, _note, time) => {
    (synth as any).triggerRelease(time);
    return true;
  },
});
