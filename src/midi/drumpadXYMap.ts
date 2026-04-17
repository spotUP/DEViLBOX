/**
 * DrumPad XY Map — Per-synth joystick axis mappings for live performance.
 *
 * When holding a drumpad and moving the MPK Mini joystick:
 *   X axis (pitch bend) → param1
 *   Y axis (mod wheel / CC 1) → param2
 *
 * Two routing modes:
 *   'pad'   → modulates the DrumPad's built-in filter (cutoff/resonance)
 *   'synth' → modulates the synth engine via routeParameterToEngine
 */

import type { SynthType } from '../types/instrument/base';

export interface DrumPadXYMapping {
  x: {
    /** 'pad' = pad.cutoff/resonance, 'synth' = synth engine param */
    target: 'pad' | 'synth';
    /** For 'pad': 'cutoff' | 'resonance' | 'tune'. For 'synth': MappableParameter id */
    param: string;
    label: string;
    min: number;
    max: number;
    curve: 'linear' | 'log';
  };
  y: {
    target: 'pad' | 'synth';
    param: string;
    label: string;
    min: number;
    max: number;
    curve: 'linear' | 'log';
  };
}

// ── Shorthand factories ──

function padFilter(): DrumPadXYMapping {
  return {
    x: { target: 'pad', param: 'cutoff', label: 'Cutoff', min: 20, max: 20000, curve: 'log' },
    y: { target: 'pad', param: 'resonance', label: 'Reso', min: 0, max: 100, curve: 'linear' },
  };
}

function synthXY(
  xParam: string, xLabel: string, xMin: number, xMax: number,
  yParam: string, yLabel: string, yMin: number, yMax: number,
  xCurve: 'linear' | 'log' = 'linear', yCurve: 'linear' | 'log' = 'linear',
): DrumPadXYMapping {
  return {
    x: { target: 'synth', param: xParam, label: xLabel, min: xMin, max: xMax, curve: xCurve },
    y: { target: 'synth', param: yParam, label: yLabel, min: yMin, max: yMax, curve: yCurve },
  };
}

// ── Explicit mappings for synths with unique performance params ──

const EXPLICIT_MAP: Partial<Record<SynthType, DrumPadXYMapping>> = {
  // ─── Acid / Bass ───
  TB303:       synthXY('cutoff', 'Cutoff', 0, 1, 'resonance', 'Reso', 0, 1),
  Buzz3o3:     synthXY('cutoff', 'Cutoff', 0, 1, 'resonance', 'Reso', 0, 1),
  Buzz3o3DF:   synthXY('cutoff', 'Cutoff', 0, 1, 'resonance', 'Reso', 0, 1),
  WobbleBass:  synthXY('wobbleBass.filter.frequency', 'Cutoff', 20, 20000, 'wobbleBass.wobbleLFO.rate', 'Wobble', 0.1, 20, 'log'),

  // ─── Classic Subtractive ───
  Synth:       synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  MonoSynth:   synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  DuoSynth:    synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  PolySynth:   synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  SuperSaw:    synthXY('superSaw.filter.frequency', 'Cutoff', 20, 20000, 'superSaw.filter.resonance', 'Reso', 0, 100, 'log'),
  PWMSynth:    synthXY('pwmSynth.filter.frequency', 'Cutoff', 20, 20000, 'pwmSynth.filter.resonance', 'Reso', 0, 100, 'log'),
  StringMachine: synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  FormantSynth: synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),

  // ─── FM / Modulation ───
  FMSynth:     synthXY('modulationIndex', 'FM Index', 0, 40, 'harmonicity', 'Harm', 0.5, 10),
  ToneAM:      synthXY('modulationIndex', 'AM Index', 0, 40, 'harmonicity', 'Harm', 0.5, 10),
  DX7:         synthXY('dx7.algorithm', 'Algorithm', 0, 31, 'dx7.feedback', 'Feedback', 0, 7),
  OPL3:        synthXY('opl3.feedback', 'Feedback', 0, 7, 'opl3.modLevel', 'Mod Lvl', 0, 63),

  // ─── Percussion ───
  MetalSynth:    synthXY('harmonicity', 'Harm', 0.1, 20, 'modulationIndex', 'FM Index', 0, 40),
  MembraneSynth: synthXY('pitchDecay', 'Pitch Dcy', 0, 1, 'octaves', 'Octaves', 0, 8),
  TR808:         synthXY('tune', 'Tune', -120, 120, 'decay', 'Decay', 0, 2000),
  TR909:         synthXY('tune', 'Tune', -120, 120, 'decay', 'Decay', 0, 2000),
  Synare:        synthXY('synare.filterCutoff', 'Cutoff', 20, 20000, 'synare.filterEnvMod', 'Env Mod', 0, 100, 'log'),
  Geonkick:      synthXY('geonkick.filterCutoff', 'Cutoff', 20, 20000, 'geonkick.distortion', 'Dist', 0, 100, 'log'),

  // ─── Effects / Weird ───
  DubSiren:    synthXY('frequency', 'Freq', 0, 1, 'lfoRate', 'LFO Rate', 0, 1),
  SpaceLaser:  synthXY('spacelaser.fmAmount', 'FM Amt', 0, 100, 'spacelaser.filterCutoff', 'Cutoff', 20, 20000, 'linear', 'log'),
  NoiseSynth:  synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  PluckSynth:  synthXY('resonance', 'Bright', 0, 7000, 'attackNoise', 'Noise', 0, 5),

  // ─── Chip / Retro ───
  ChipSynth:   synthXY('filter.frequency', 'Cutoff', 20, 20000, 'oscillator.detune', 'Detune', -100, 100, 'log'),
  VL1:         synthXY('vl1.tone', 'Tone', 0, 9, 'vl1.tempo', 'Tempo', 0, 9),
  C64SID:      padFilter(),

  // ─── Speech ───
  Sam:           synthXY('sam.pitch', 'Pitch', 0, 255, 'sam.speed', 'Speed', 0, 255),
  PinkTrombone:  synthXY('pinkTrombone.tongueX', 'Tongue X', 0, 1, 'pinkTrombone.tongueY', 'Tongue Y', 0, 1),
  DECtalk:       synthXY('dectalk.pitch', 'Pitch', 50, 500, 'dectalk.speed', 'Speed', 75, 600),
  V2Speech:      synthXY('v2.filter1Cutoff', 'Cutoff', 0, 127, 'v2.filter1Reso', 'Reso', 0, 127),

  // ─── Demoscene ───
  V2:            synthXY('v2.filter1Cutoff', 'Cutoff', 0, 127, 'v2.filter1Reso', 'Reso', 0, 127),
  Oidos:         synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  OidosSynth:    synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  WaveSabreSynth: synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),
  TunefishSynth: synthXY('filter.frequency', 'Cutoff', 20, 20000, 'filter.Q', 'Reso', 0, 100, 'log'),

  // ─── Wavetable / Granular / Additive ───
  Wavetable:     synthXY('wavetable.filter.frequency', 'Cutoff', 20, 20000, 'wavetable.wavetablePosition', 'WavePos', 0, 1, 'log'),
  GranularSynth: synthXY('granular.grainSize', 'Grain Sz', 10, 500, 'granular.grainDensity', 'Density', 1, 100),
  HarmonicSynth: synthXY('harmonicSynth.harmonicSpread', 'Spread', 0, 1, 'harmonicSynth.brightness', 'Bright', 0, 1),

  // ─── Keyboards / Organs ───
  Organ:           synthXY('organ.vibratoDepth', 'Vibrato', 0, 1, 'organ.overdrive', 'Drive', 0, 1),
  TonewheelOrgan:  synthXY('organ.vibratoDepth', 'Vibrato', 0, 1, 'organ.overdrive', 'Drive', 0, 1),
  SetBfree:        synthXY('setbfree.drawbar1', 'Drawbar 1', 0, 8, 'setbfree.vibrato', 'Vibrato', 0, 1),
  Aeolus:          synthXY('aeolus.swell', 'Swell', 0, 1, 'aeolus.tremulant', 'Tremulant', 0, 1),
  OpenWurli:       synthXY('openwurli.drive', 'Drive', 0, 1, 'openwurli.tremolo', 'Tremolo', 0, 1),
  Melodica:        synthXY('melodica.vibratoRate', 'Vibrato', 0, 10, 'melodica.brightness', 'Bright', 0, 1),

  // ─── Ported Synths (WASM) ───
  RaffoSynth:    synthXY('raffo.cutoff', 'Cutoff', 0, 1, 'raffo.resonance', 'Reso', 0, 1),
  CalfMono:      synthXY('calfMono.cutoff', 'Cutoff', 0, 1, 'calfMono.resonance', 'Reso', 0, 1),
  SynthV1:       synthXY('synthv1.dcf1Cutoff', 'Cutoff', 0, 1, 'synthv1.dcf1Reso', 'Reso', 0, 1),
  TalNoizeMaker: synthXY('talNoizeMaker.cutoff', 'Cutoff', 0, 1, 'talNoizeMaker.resonance', 'Reso', 0, 1),
  Amsynth:       synthXY('amsynth.filterCutoff', 'Cutoff', 0, 1, 'amsynth.filterResonance', 'Reso', 0, 1),

  // ─── VSTBridge / WAM ───
  Vital:       synthXY('vital.macro1', 'Macro 1', 0, 1, 'vital.macro2', 'Macro 2', 0, 1),
  Odin2:       synthXY('odin2.filterCutoff', 'Cutoff', 0, 1, 'odin2.filterResonance', 'Reso', 0, 1),
  Surge:       synthXY('surge.filterCutoff', 'Cutoff', 0, 1, 'surge.filterResonance', 'Reso', 0, 1),
  Helm:        synthXY('helm.filterCutoff', 'Cutoff', 0, 1, 'helm.filterResonance', 'Reso', 0, 1),
  Sorcer:      synthXY('sorcer.filterCutoff', 'Cutoff', 0, 1, 'sorcer.filterResonance', 'Reso', 0, 1),
  OBXf:        synthXY('obxf.filterCutoff', 'Cutoff', 0, 1, 'obxf.filterResonance', 'Reso', 0, 1),
  Monique:     synthXY('monique.cutoff', 'Cutoff', 0, 1, 'monique.resonance', 'Reso', 0, 1),
  WAMOBXd:     synthXY('wamobxd.filterCutoff', 'Cutoff', 0, 1, 'wamobxd.filterResonance', 'Reso', 0, 1),
  WAMSynth101: synthXY('wamsynth101.filterCutoff', 'Cutoff', 0, 1, 'wamsynth101.filterResonance', 'Reso', 0, 1),

  // ─── SF2 / SFZ ───
  FluidSynth:  synthXY('fluidsynth.filterCutoff', 'Cutoff', 0, 1, 'fluidsynth.filterResonance', 'Reso', 0, 1),
  Sfizz:       synthXY('sfizz.cutoff', 'Cutoff', 0, 1, 'sfizz.resonance', 'Reso', 0, 1),
  ZynAddSubFX: synthXY('zynaddsubfx.filterCutoff', 'Cutoff', 0, 1, 'zynaddsubfx.filterResonance', 'Reso', 0, 1),

  // ─── Phase Distortion ───
  CZ101:       synthXY('cz101.lineSelect', 'Line', 0, 7, 'cz101.env1Rate', 'Env Rate', 0, 99),
  MAMEUPD933:  synthXY('mameupd933.lineSelect', 'Line', 0, 7, 'mameupd933.env1Rate', 'Env Rate', 0, 99),

  // ─── MAME Specials ───
  MAMESN76477:  synthXY('mamesn76477.vcoFreq', 'VCO Freq', 0, 1, 'mamesn76477.noiseFilter', 'Noise Flt', 0, 1),
  CEM3394:      synthXY('cem3394.filterCutoff', 'Cutoff', 0, 1, 'cem3394.filterResonance', 'Reso', 0, 1),
  SCSP:         synthXY('scsp.filterCutoff', 'Cutoff', 0, 1, 'scsp.filterResonance', 'Reso', 0, 1),
  MAMECMI:      synthXY('mamecmi.filterCutoff', 'Cutoff', 0, 1, 'mamecmi.filterResonance', 'Reso', 0, 1),
  MAMEVFX:      synthXY('mamevfx.filterCutoff', 'Cutoff', 0, 1, 'mamevfx.filterResonance', 'Reso', 0, 1),
  MAMEDOC:      synthXY('mamedoc.filterCutoff', 'Cutoff', 0, 1, 'mamedoc.filterResonance', 'Reso', 0, 1),

  // ─── Speech synths ───
  MAMEMEA8000:  synthXY('mamemea8000.pitch', 'Pitch', 0, 1, 'mamemea8000.speed', 'Speed', 0, 1),
  MAMESP0250:   synthXY('mamesp0250.pitch', 'Pitch', 0, 1, 'mamesp0250.speed', 'Speed', 0, 1),
  MAMEVotrax:   synthXY('mamevotrax.pitch', 'Pitch', 0, 1, 'mamevotrax.speed', 'Speed', 0, 1),
  MAMETMS5220:  synthXY('mametms5220.pitch', 'Pitch', 0, 1, 'mametms5220.speed', 'Speed', 0, 1),
  MAMEUPD931:   synthXY('mameupd931.pitch', 'Pitch', 0, 1, 'mameupd931.speed', 'Speed', 0, 1),

  // ─── MAME Organ ───
  MAMETMS36XX:  synthXY('mametms36xx.tune', 'Tune', 0, 1, 'mametms36xx.volume', 'Volume', 0, 1),

  // ─── Klystrack ───
  KlysSynth:    synthXY('klystrack.cutoff', 'Cutoff', 0, 1, 'klystrack.resonance', 'Reso', 0, 1),

  // ─── Sawteeth ───
  SawteethSynth: synthXY('sawteeth.cutoff', 'Cutoff', 0, 1, 'sawteeth.resonance', 'Reso', 0, 1),

  // ─── Modular ───
  ModularSynth:  padFilter(),
  SunVoxModular: padFilter(),
  SunVoxSynth:   padFilter(),
  SuperCollider: padFilter(),

  // ─── Sample-based (always use pad filter) ───
  Sampler:       padFilter(),
  Player:        padFilter(),
  DrumMachine:   padFilter(),
  DrumKit:       padFilter(),
  ChiptuneModule: padFilter(),
};

/**
 * Get the XY joystick mapping for a given synth type.
 * Falls back to pad filter (cutoff/resonance) for unmapped types.
 */
export function getDrumPadXYMapping(synthType: SynthType | undefined): DrumPadXYMapping {
  // Explicit mapping takes priority
  if (synthType && EXPLICIT_MAP[synthType]) {
    return EXPLICIT_MAP[synthType]!;
  }

  // Category fallbacks — all use pad filter since we can't know
  // what synth-level params are available for generic categories
  return padFilter();
}
