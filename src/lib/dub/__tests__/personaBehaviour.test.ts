import { describe, it, expect } from 'vitest';
import {
  PERSONA_BEHAVIOUR,
  NEUTRAL_BEHAVIOUR,
  behaviourFor,
  intentionPolicyFor,
  energyBudgetFor,
  holdBarsFor,
  intentionAffinity,
} from '../personaBehaviour';

const IDS = ['tubby', 'scientist', 'perry', 'madProfessor', 'jammy', 'custom'] as const;

describe('persona behaviour profiles', () => {
  it('covers every persona the app ships', () => {
    for (const id of IDS) expect(PERSONA_BEHAVIOUR[id], id).toBeDefined();
  });

  it('falls back to neutral for an unknown persona rather than throwing', () => {
    expect(behaviourFor('nobody')).toBe(NEUTRAL_BEHAVIOUR);
  });

  it('keeps every axis inside 0..1', () => {
    for (const id of IDS) {
      const b = PERSONA_BEHAVIOUR[id];
      for (const [axis, value] of Object.entries(b)) {
        if (typeof value !== 'number') continue;
        expect(value, `${id}.${axis}`).toBeGreaterThanOrEqual(0);
        expect(value, `${id}.${axis}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not make any persona high on everything — that is just the loud setting', () => {
    for (const id of IDS) {
      const b = PERSONA_BEHAVIOUR[id];
      const allHigh = b.activity > 0.7 && b.depth > 0.7 && b.risk > 0.7 && b.restraint > 0.7;
      expect(allHigh, id).toBe(false);
    }
  });

  it('separates what the single intensity scalar conflated', () => {
    // Jammy is sparse but deep: rare, and big when it happens. That pair was
    // unsayable with one number.
    expect(PERSONA_BEHAVIOUR.jammy.activity).toBeLessThan(0.4);
    expect(PERSONA_BEHAVIOUR.jammy.depth).toBeGreaterThan(0.6);
    // Perry is the opposite kind of extreme: restless and loose.
    expect(PERSONA_BEHAVIOUR.perry.activity).toBeGreaterThan(0.7);
    expect(PERSONA_BEHAVIOUR.perry.timingVariance).toBeGreaterThan(0.2);
    expect(PERSONA_BEHAVIOUR.tubby.timingVariance).toBeLessThan(0.05);
  });
});

describe('intentionPolicyFor', () => {
  it('rests longer and more often the more restrained the persona', () => {
    const jammy = intentionPolicyFor(PERSONA_BEHAVIOUR.jammy);
    const perry = intentionPolicyFor(PERSONA_BEHAVIOUR.perry);
    expect(jammy.restBars).toBeGreaterThan(perry.restBars);
    expect(jammy.restEveryPhrases).toBeLessThan(perry.restEveryPhrases);
  });

  it('looks further ahead for a persona with more anticipation', () => {
    expect(intentionPolicyFor(PERSONA_BEHAVIOUR.tubby).accentWindow).toBe('1/4');
    expect(intentionPolicyFor(PERSONA_BEHAVIOUR.perry).accentWindow).toBe('1/16');
  });

  it('lets a bold persona accent weaker onsets', () => {
    const perry = intentionPolicyFor(PERSONA_BEHAVIOUR.perry);
    const tubby = intentionPolicyFor(PERSONA_BEHAVIOUR.tubby);
    expect(perry.accentStrength).toBeLessThan(tubby.accentStrength);
  });

  it('keeps the feedback ceiling in a narrow band whatever the appetite', () => {
    const ceilings = IDS.map(id => intentionPolicyFor(PERSONA_BEHAVIOUR[id]).feedbackCeiling);
    expect(Math.min(...ceilings)).toBeGreaterThanOrEqual(0.8);
    expect(Math.max(...ceilings)).toBeLessThanOrEqual(0.9);
  });

  it('waits longer before filling silence when the persona is patient', () => {
    expect(intentionPolicyFor(PERSONA_BEHAVIOUR.scientist).textureAfterRows)
      .toBeGreaterThan(intentionPolicyFor(PERSONA_BEHAVIOUR.perry).textureAfterRows);
  });
});

describe('energyBudgetFor', () => {
  it('gives the deep, lush persona more room than the sparse one', () => {
    expect(energyBudgetFor(PERSONA_BEHAVIOUR.madProfessor).wet)
      .toBeGreaterThan(energyBudgetFor(PERSONA_BEHAVIOUR.jammy).wet);
  });

  it('lets a feedback appetite move feedback without moving the spectrum', () => {
    const scientist = energyBudgetFor(PERSONA_BEHAVIOUR.scientist);   // feedback 0.9
    const jammy = energyBudgetFor(PERSONA_BEHAVIOUR.jammy);           // feedback 0.4
    expect(scientist.feedback / jammy.feedback)
      .toBeGreaterThan(scientist.spectralDensity / jammy.spectralDensity);
  });

  it('never hands out an unbounded budget', () => {
    for (const id of IDS) {
      const b = energyBudgetFor(PERSONA_BEHAVIOUR[id]);
      expect(b.wet, id).toBeLessThanOrEqual(1.5);
      expect(b.feedback, id).toBeLessThanOrEqual(1.8);
    }
  });
});

describe('holdBarsFor and intentionAffinity', () => {
  it('holds longer for a patient persona', () => {
    expect(holdBarsFor(PERSONA_BEHAVIOUR.scientist, 2))
      .toBeGreaterThan(holdBarsFor(PERSONA_BEHAVIOUR.perry, 2));
  });

  it('never collapses a hold to nothing', () => {
    expect(holdBarsFor(PERSONA_BEHAVIOUR.perry, 0)).toBeGreaterThan(0);
  });

  it('prefers rather than restricts — every persona can still use every intention', () => {
    expect(intentionAffinity(PERSONA_BEHAVIOUR.jammy, 'DROP')).toBeGreaterThan(1);
    // Jammy does not prefer TEXTURE, but is not barred from it.
    expect(intentionAffinity(PERSONA_BEHAVIOUR.jammy, 'TEXTURE')).toBe(1);
  });

  it('ranks the first preference above the second', () => {
    const b = PERSONA_BEHAVIOUR.scientist;
    expect(intentionAffinity(b, b.intentionPreference[0]))
      .toBeGreaterThan(intentionAffinity(b, b.intentionPreference[1]));
  });
});
