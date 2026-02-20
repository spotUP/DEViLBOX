/**
 * VJ Visualizer types — mode enum, audio data, particle interfaces, state factory.
 */

export const VISUALIZER_MODES = [
  'pattern',
  'spectrumBars',
  'circularSpectrum',
  'waveformTerrain',
  'plasmaField',
  'starfield',
  'particleBurst',
  // audioMotion modes
  'amLED',
  'amBars',
  'amMirror',
  'amGraphLine',
  'amRadial',
  'amRadialGraph',
  'amStereo',
  'amLumi',
  'amAlpha',
  'amOutline',
  'amDualVert',
  'amDualOverlay',
  'amBark',
  'amMel',
  'amOctave',
  'amNotes',
  'amMirrorReflex',
  'amRadialInvert',
  'amRadialLED',
  'amLinear',
  'amAWeighted',
  'amLumiMirror',
] as const;

export type VisualizerMode = (typeof VISUALIZER_MODES)[number];

/** WebGL-only modes (excludes 'pattern' and audioMotion 'am*' modes) */
export type WebGLVisualizerMode = Exclude<VisualizerMode,
  | 'pattern'
  | 'amLED' | 'amBars' | 'amMirror' | 'amGraphLine'
  | 'amRadial' | 'amRadialGraph' | 'amStereo' | 'amLumi'
  | 'amAlpha' | 'amOutline' | 'amDualVert' | 'amDualOverlay'
  | 'amBark' | 'amMel' | 'amOctave' | 'amNotes'
  | 'amMirrorReflex' | 'amRadialInvert' | 'amRadialLED'
  | 'amLinear' | 'amAWeighted' | 'amLumiMirror'
>;

export const MODE_LABELS: Record<VisualizerMode, string> = {
  pattern: 'PATTERN',
  spectrumBars: 'SPECTRUM',
  circularSpectrum: 'RADIAL',
  waveformTerrain: 'TERRAIN',
  plasmaField: 'PLASMA',
  starfield: 'STARFIELD',
  particleBurst: 'PARTICLES',
  amLED: 'LED BARS',
  amBars: 'SMOOTH BARS',
  amMirror: 'MIRROR BARS',
  amGraphLine: 'GRAPH LINE',
  amRadial: 'RADIAL SPIN',
  amRadialGraph: 'RADIAL GRAPH',
  amStereo: 'DUAL STEREO',
  amLumi: 'LUMI BARS',
  amAlpha: 'GHOST BARS',
  amOutline: 'OUTLINE',
  amDualVert: 'DUAL VERTICAL',
  amDualOverlay: 'DUAL OVERLAY',
  amBark: 'BARK',
  amMel: 'MEL GRAPH',
  amOctave: 'OCTAVE BANDS',
  amNotes: 'NOTE LABELS',
  amMirrorReflex: 'MIRROR REFLEX',
  amRadialInvert: 'RADIAL INVERT',
  amRadialLED: 'RADIAL LED',
  amLinear: 'LINEAR',
  amAWeighted: 'A-WEIGHTED',
  amLumiMirror: 'LUMI MIRROR',
};

/** Map audioMotion mode names to preset keys */
export const AM_PRESET_MAP: Partial<Record<VisualizerMode, string>> = {
  amLED: 'ledBars',
  amBars: 'smoothBars',
  amMirror: 'mirrorBars',
  amGraphLine: 'graphLine',
  amRadial: 'radialSpectrum',
  amRadialGraph: 'radialGraph',
  amStereo: 'dualStereo',
  amLumi: 'lumiBars',
  amAlpha: 'alphaBars',
  amOutline: 'outlineBars',
  amDualVert: 'dualVertical',
  amDualOverlay: 'dualOverlay',
  amBark: 'barkSpectrum',
  amMel: 'melGraph',
  amOctave: 'octaveBands',
  amNotes: 'noteLabels',
  amMirrorReflex: 'mirrorReflex',
  amRadialInvert: 'radialInvert',
  amRadialLED: 'radialLED',
  amLinear: 'linearBars',
  amAWeighted: 'aWeighted',
  amLumiMirror: 'lumiMirror',
};

/** Check whether a mode is an audioMotion mode */
export function isAudioMotionMode(mode: VisualizerMode): boolean {
  return mode.startsWith('am');
}

export interface AudioData {
  waveform: Float32Array;
  fft: Float32Array;
  rms: number;
  peak: number;
  bassEnergy: number;
  midEnergy: number;
  highEnergy: number;
}

export interface StarParticle {
  x: number;
  y: number;
  z: number;
  speed: number;
  prevX: number;
  prevY: number;
}

export interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

export interface VisualizerState {
  // Spectrum bars
  smoothedBars: Float32Array;
  peakHold: Float32Array;
  peakDecay: Float32Array;

  // Waveform terrain
  terrainHistory: Float32Array[];
  terrainFrame: number;

  // Plasma field
  plasmaTime: number;

  // Starfield
  stars: StarParticle[];

  // Particle burst
  particles: BurstParticle[];
  prevRms: number;
}

const NUM_BARS = 64;
const TERRAIN_ROWS = 40;
const STAR_COUNT = 300;

export function createVisualizerState(): VisualizerState {
  const stars: StarParticle[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      speed: 0.002 + Math.random() * 0.005,
      prevX: 0,
      prevY: 0,
    });
  }

  return {
    smoothedBars: new Float32Array(NUM_BARS),
    peakHold: new Float32Array(NUM_BARS),
    peakDecay: new Float32Array(NUM_BARS),
    terrainHistory: Array.from({ length: TERRAIN_ROWS }, () => new Float32Array(256)),
    terrainFrame: 0,
    plasmaTime: 0,
    stars,
    particles: [],
    prevRms: 0,
  };
}
