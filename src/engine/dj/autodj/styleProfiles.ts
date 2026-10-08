/**
 * DJ style profiles (plan section 30, 54): ten personalities that modify the
 * planner weights and tolerances. Not separate engines.
 */
import type { DJStyleName, DJStyleProfile, ScoreWeights } from './types';

const BASE_WEIGHTS: ScoreWeights = {
  harmonicCompatibility: 1.0,
  tempoCompatibility: 1.2,
  phraseCompatibility: 0.4,
  energyArcFit: 1.0,
  sectionCompatibility: 0.5,
  introOutroCompatibility: 0.5,
  drumCompatibility: 0.6,
  bassCompatibility: 0.6,
  vocalCompatibility: 0.7,
  genreCompatibility: 0.3,
  textureCompatibility: 0.3,
  novelty: 0.4,
  setNarrative: 0.6,
  repetition: 0.8,
  awkwardness: 0.8,
  risk: 0.8,
};

function weights(overrides: Partial<ScoreWeights>): ScoreWeights {
  return { ...BASE_WEIGHTS, ...overrides };
}

export const DJ_STYLES: Record<DJStyleName, DJStyleProfile> = {
  Smooth: {
    name: 'Smooth', transitionLengthBars: 16, riskTolerance: 0.2, energyMovement: 0.1, fxUsage: 0.2,
    bassBehaviour: 'strict', keyStrictness: 0.9, tempoTolerancePercent: 4, cutFrequency: 0, repetitionTolerance: 0.5,
    phraseStrictness: 0.9, weights: weights({ harmonicCompatibility: 1.4, risk: 1.2, vocalCompatibility: 0.9 }),
  },
  Club: {
    name: 'Club', transitionLengthBars: 16, riskTolerance: 0.4, energyMovement: 0.3, fxUsage: 0.4,
    bassBehaviour: 'swap', keyStrictness: 0.7, tempoTolerancePercent: 6, cutFrequency: 0.1, repetitionTolerance: 0.4,
    phraseStrictness: 0.9, weights: weights({ energyArcFit: 1.2, drumCompatibility: 0.8, bassCompatibility: 0.8 }),
  },
  Aggressive: {
    name: 'Aggressive', transitionLengthBars: 4, riskTolerance: 0.8, energyMovement: 0.6, fxUsage: 0.7,
    bassBehaviour: 'swap', keyStrictness: 0.4, tempoTolerancePercent: 10, cutFrequency: 0.5, repetitionTolerance: 0.3,
    phraseStrictness: 0.6, weights: weights({ energyArcFit: 1.4, novelty: 0.8, harmonicCompatibility: 0.6, risk: 0.4 }),
  },
  Dub: {
    name: 'Dub', transitionLengthBars: 8, riskTolerance: 0.6, energyMovement: 0.0, fxUsage: 0.9,
    bassBehaviour: 'shared', keyStrictness: 0.6, tempoTolerancePercent: 6, cutFrequency: 0.2, repetitionTolerance: 0.6,
    phraseStrictness: 0.7, weights: weights({ bassCompatibility: 1.0, textureCompatibility: 0.6, novelty: 0.6 }),
  },
  Progressive: {
    name: 'Progressive', transitionLengthBars: 32, riskTolerance: 0.3, energyMovement: 0.2, fxUsage: 0.3,
    bassBehaviour: 'strict', keyStrictness: 0.85, tempoTolerancePercent: 4, cutFrequency: 0, repetitionTolerance: 0.6,
    phraseStrictness: 1.0, weights: weights({ setNarrative: 1.0, harmonicCompatibility: 1.3, phraseCompatibility: 0.7 }),
  },
  Classic: {
    name: 'Classic', transitionLengthBars: 8, riskTolerance: 0.35, energyMovement: 0.25, fxUsage: 0.3,
    bassBehaviour: 'swap', keyStrictness: 0.7, tempoTolerancePercent: 6, cutFrequency: 0.1, repetitionTolerance: 0.4,
    phraseStrictness: 0.8, weights: weights({}),
  },
  Experimental: {
    name: 'Experimental', transitionLengthBars: 8, riskTolerance: 0.9, energyMovement: 0.4, fxUsage: 0.8,
    bassBehaviour: 'shared', keyStrictness: 0.3, tempoTolerancePercent: 12, cutFrequency: 0.4, repetitionTolerance: 0.2,
    phraseStrictness: 0.5, weights: weights({ novelty: 1.2, genreCompatibility: 0.1, harmonicCompatibility: 0.5, risk: 0.3, repetition: 1.2 }),
  },
  Minimal: {
    name: 'Minimal', transitionLengthBars: 32, riskTolerance: 0.2, energyMovement: 0.1, fxUsage: 0.1,
    bassBehaviour: 'strict', keyStrictness: 0.8, tempoTolerancePercent: 3, cutFrequency: 0, repetitionTolerance: 0.8,
    phraseStrictness: 1.0, weights: weights({ textureCompatibility: 0.8, tempoCompatibility: 1.6, novelty: 0.2, repetition: 0.3 }),
  },
  Festival: {
    name: 'Festival', transitionLengthBars: 8, riskTolerance: 0.7, energyMovement: 0.7, fxUsage: 0.8,
    bassBehaviour: 'swap', keyStrictness: 0.5, tempoTolerancePercent: 8, cutFrequency: 0.3, repetitionTolerance: 0.4,
    phraseStrictness: 0.8, weights: weights({ energyArcFit: 1.5, sectionCompatibility: 0.8, novelty: 0.6 }),
  },
  Radio: {
    name: 'Radio', transitionLengthBars: 4, riskTolerance: 0.3, energyMovement: 0.2, fxUsage: 0.3,
    bassBehaviour: 'swap', keyStrictness: 0.6, tempoTolerancePercent: 8, cutFrequency: 0.2, repetitionTolerance: 0.5,
    phraseStrictness: 0.5, weights: weights({ vocalCompatibility: 1.0, genreCompatibility: 0.6, tempoCompatibility: 0.6 }),
  },
};

export const DEFAULT_STYLE: DJStyleName = 'Classic';

export function getStyle(name: DJStyleName | string | undefined | null): DJStyleProfile {
  return (name && (DJ_STYLES as Record<string, DJStyleProfile>)[name]) || DJ_STYLES[DEFAULT_STYLE];
}
