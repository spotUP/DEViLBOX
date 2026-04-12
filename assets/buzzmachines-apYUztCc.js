import { dbToGain } from "./vendor-tone-48TQc1H3.js";
import { bn as BuzzmachineType, aT as SynthRegistry, bo as BuzzmachineGenerator } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const VOLUME_OFFSETS = {
  BuzzKick: 3,
  BuzzKickXP: 5,
  BuzzNoise: 7,
  BuzzTrilok: 5,
  Buzz4FM2F: 7,
  BuzzFreqBomb: 4,
  BuzzDTMF: 0,
  BuzzDynamite6: 0,
  BuzzM3: 0,
  BuzzM4: 0,
  Buzz3o3: 5,
  Buzz3o3DF: 8
};
function getNormalizedVolume(synthType, configVolume) {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}
const BUZZ_GENERATORS = [
  { id: "BuzzDTMF", name: "CyanPhase DTMF", machineType: BuzzmachineType.CYANPHASE_DTMF },
  { id: "BuzzFreqBomb", name: "Frequency Bomb", machineType: BuzzmachineType.ELENZIL_FREQUENCYBOMB },
  { id: "BuzzKick", name: "FSM Kick", machineType: BuzzmachineType.FSM_KICK },
  { id: "BuzzKickXP", name: "FSM KickXP", machineType: BuzzmachineType.FSM_KICKXP },
  { id: "BuzzNoise", name: "Jeskola Noise", machineType: BuzzmachineType.JESKOLA_NOISE },
  { id: "BuzzTrilok", name: "Jeskola Trilok", machineType: BuzzmachineType.JESKOLA_TRILOK },
  { id: "Buzz4FM2F", name: "MadBrain 4FM2F", machineType: BuzzmachineType.MADBRAIN_4FM2F },
  { id: "BuzzDynamite6", name: "MadBrain Dynamite6", machineType: BuzzmachineType.MADBRAIN_DYNAMITE6 },
  { id: "BuzzM3", name: "Makk M3", machineType: BuzzmachineType.MAKK_M3 },
  { id: "BuzzM4", name: "Makk M4", machineType: BuzzmachineType.MAKK_M4 }
];
for (const buzz of BUZZ_GENERATORS) {
  SynthRegistry.register({
    id: buzz.id,
    name: buzz.name,
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: VOLUME_OFFSETS[buzz.id] ?? 0,
    controlsComponent: "ChipSynthControls",
    create: (config) => {
      const synth = new BuzzmachineGenerator(buzz.machineType);
      synth.output.gain.value = dbToGain(getNormalizedVolume(buzz.id, config.volume));
      return synth;
    },
    onTriggerAttack: (synth, note, time, velocity, opts) => {
      synth.triggerAttack(note, time, velocity, opts.accent, opts.slide);
      return true;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  });
}
SynthRegistry.register({
  id: "Buzz3o3",
  name: "Oomek Aggressor 3o3",
  category: "wasm",
  loadMode: "lazy",
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 5,
  controlsComponent: "TB303Controls",
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
      if (tb.tuning !== void 0) synth.setTuning(tb.tuning);
      if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);
    }
    const normalizedVolume = getNormalizedVolume("Buzz3o3", config.volume);
    synth.output.gain.value = dbToGain(normalizedVolume);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity, opts) => {
    synth.triggerAttack(note, time, velocity, opts.accent, opts.slide);
    return true;
  },
  onTriggerRelease: (synth, _note, time) => {
    synth.triggerRelease(time);
    return true;
  }
});
SynthRegistry.register({
  id: "Buzz3o3DF",
  name: "Oomek Aggressor Devil Fish",
  category: "wasm",
  loadMode: "lazy",
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 8,
  controlsComponent: "TB303Controls",
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
      if (tb.tuning !== void 0) synth.setTuning(tb.tuning);
      if (tb.overdrive) synth.setOverdrive(tb.overdrive.amount);
    }
    const normalizedVolume = getNormalizedVolume("Buzz3o3DF", config.volume);
    synth.output.gain.value = dbToGain(normalizedVolume);
    return synth;
  },
  onTriggerAttack: (synth, note, time, velocity, opts) => {
    synth.triggerAttack(note, time, velocity, opts.accent, opts.slide);
    return true;
  },
  onTriggerRelease: (synth, _note, time) => {
    synth.triggerRelease(time);
    return true;
  }
});
SynthRegistry.register({
  id: "Buzzmachine",
  name: "Buzzmachine",
  category: "wasm",
  loadMode: "lazy",
  sharedInstance: true,
  useSynthBus: true,
  volumeOffsetDb: 0,
  create: (config) => {
    var _a;
    const machineTypeStr = ((_a = config.buzzmachine) == null ? void 0 : _a.machineType) || "ArguruDistortion";
    const machineTypeMap = {
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
      ElenzilFrequencyBomb: BuzzmachineType.ELENZIL_FREQUENCYBOMB
    };
    const machineType = machineTypeMap[machineTypeStr] ?? BuzzmachineType.ARGURU_DISTORTION;
    const synth = new BuzzmachineGenerator(machineType);
    synth.output.gain.value = dbToGain(config.volume ?? -12);
    return synth;
  },
  onTriggerRelease: (synth, _note, time) => {
    synth.triggerRelease(time);
    return true;
  }
});
