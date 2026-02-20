/**
 * audioMotion-analyzer presets tuned for DEViLBOX's dark UI.
 *
 * Each preset sets `overlay: true, showBgColor: false` so the analyzer
 * composites seamlessly over dark backgrounds.  All presets use log
 * frequency scale and 8192-sample FFT for high resolution.
 */

import type { Options } from 'audiomotion-analyzer';

/** Shared base settings applied to every preset */
const BASE: Options = {
  overlay: true,
  showBgColor: false,
  showScaleX: false,
  showScaleY: false,
  fftSize: 8192,
  smoothing: 0.7,
  frequencyScale: 'log',
  showPeaks: true,
  weightingFilter: '',
};

export const AUDIOMOTION_PRESETS: Record<string, Options> = {
  /** Classic LED spectrum bars */
  ledBars: {
    ...BASE,
    mode: 6, // 1/3 octave bands
    ledBars: true,
    trueLeds: true,
    gradient: 'classic',
    barSpace: 0.5,
    showPeaks: true,
  },

  /** Gradient-filled smooth bars */
  smoothBars: {
    ...BASE,
    mode: 4, // 1/6 octave bands
    roundBars: true,
    barSpace: 0.25,
    gradient: 'prism',
    showPeaks: true,
  },

  /** Mirrored bars meeting at centre */
  mirrorBars: {
    ...BASE,
    mode: 5, // 1/4 octave bands
    mirror: -1,
    reflexRatio: 0.35,
    reflexAlpha: 0.25,
    gradient: 'prism',
    barSpace: 0.3,
  },

  /** Filled area graph with peak line */
  graphLine: {
    ...BASE,
    mode: 10, // line / area graph
    fillAlpha: 0.5,
    lineWidth: 1.5,
    peakLine: true,
    gradient: 'rainbow',
  },

  /** Circular radial bars */
  radialSpectrum: {
    ...BASE,
    mode: 3, // 1/2 octave bands
    radial: true,
    gradient: 'rainbow',
    spinSpeed: 1,
    barSpace: 0.3,
  },

  /** Circular graph with reflex */
  radialGraph: {
    ...BASE,
    mode: 10,
    radial: true,
    fillAlpha: 0.6,
    reflexRatio: 0.4,
    reflexAlpha: 0.2,
    gradient: 'prism',
    lineWidth: 1.5,
  },

  /** Side-by-side stereo LED bars */
  dualStereo: {
    ...BASE,
    mode: 6,
    channelLayout: 'dual-horizontal',
    ledBars: true,
    gradient: 'classic',
    barSpace: 0.5,
    stereo: true,
  },

  /** Full-height luminance bars */
  lumiBars: {
    ...BASE,
    mode: 4,
    lumiBars: true,
    gradient: 'orangered',
    barSpace: 0.1,
    showPeaks: false,
  },

  /** Ghost bars — opacity tracks amplitude */
  alphaBars: {
    ...BASE,
    mode: 3,
    alphaBars: true,
    roundBars: true,
    barSpace: 0.4,
    gradient: 'steelblue',
    showPeaks: false,
  },

  /** Hollow outlines only */
  outlineBars: {
    ...BASE,
    mode: 5,
    outlineBars: true,
    barSpace: 0.3,
    gradient: 'prism',
    lineWidth: 1.5,
    fillAlpha: 0,
    showPeaks: true,
    fadePeaks: true,
  },

  /** Stacked stereo — top/bottom split */
  dualVertical: {
    ...BASE,
    mode: 6,
    channelLayout: 'dual-vertical',
    roundBars: true,
    gradient: 'rainbow',
    barSpace: 0.3,
    splitGradient: true,
  },

  /** Overlaid stereo channels */
  dualOverlay: {
    ...BASE,
    mode: 10,
    channelLayout: 'dual-combined',
    fillAlpha: 0.4,
    lineWidth: 1.5,
    gradient: 'steelblue',
  },

  /** Bark scale — perceptual frequency bands */
  barkSpectrum: {
    ...BASE,
    mode: 4,
    frequencyScale: 'bark',
    roundBars: true,
    barSpace: 0.2,
    gradient: 'orangered',
    reflexRatio: 0.3,
    reflexAlpha: 0.2,
  },

  /** Mel scale area graph */
  melGraph: {
    ...BASE,
    mode: 10,
    frequencyScale: 'mel',
    fillAlpha: 0.6,
    lineWidth: 2,
    gradient: 'prism',
    peakLine: true,
  },

  /** Dense hi-res octave bands */
  octaveBands: {
    ...BASE,
    mode: 8,
    roundBars: true,
    barSpace: 0.15,
    gradient: 'classic',
    showPeaks: true,
    fadePeaks: true,
    peakFadeTime: 1000,
    peakHoldTime: 200,
  },

  /** Musical note labels with LED look */
  noteLabels: {
    ...BASE,
    mode: 7,
    ledBars: true,
    trueLeds: true,
    gradient: 'rainbow',
    barSpace: 0.4,
    noteLabels: true,
    showScaleX: true,
  },

  /** Mirror + reflex with fading peaks */
  mirrorReflex: {
    ...BASE,
    mode: 4,
    mirror: 1,
    reflexRatio: 0.5,
    reflexAlpha: 0.3,
    reflexBright: 0.8,
    roundBars: true,
    barSpace: 0.2,
    gradient: 'rainbow',
    fadePeaks: true,
  },

  /** Inverted radial — bars grow inward */
  radialInvert: {
    ...BASE,
    mode: 4,
    radial: true,
    radialInvert: true,
    gradient: 'orangered',
    barSpace: 0.2,
    spinSpeed: -2,
    radius: 0.3,
  },

  /** Radial LED ring */
  radialLED: {
    ...BASE,
    mode: 6,
    radial: true,
    ledBars: true,
    trueLeds: true,
    gradient: 'classic',
    barSpace: 0.5,
    spinSpeed: 0.5,
    radius: 0.2,
  },

  /** Linear amplitude — raw waveform energy */
  linearBars: {
    ...BASE,
    mode: 3,
    linearAmplitude: true,
    linearBoost: 1.8,
    roundBars: true,
    barSpace: 0.3,
    gradient: 'steelblue',
    showPeaks: true,
  },

  /** A-weighted spectrum (human hearing curve) */
  aWeighted: {
    ...BASE,
    mode: 5,
    weightingFilter: 'A',
    roundBars: true,
    barSpace: 0.25,
    gradient: 'prism',
    reflexRatio: 0.2,
    reflexAlpha: 0.15,
  },

  /** Luminance + mirror — ambient fire look */
  lumiMirror: {
    ...BASE,
    mode: 3,
    lumiBars: true,
    mirror: -1,
    gradient: 'orangered',
    barSpace: 0.05,
    showPeaks: false,
  },
};

/** Ordered preset names for cycling */
export const AUDIOMOTION_PRESET_NAMES = Object.keys(AUDIOMOTION_PRESETS);
