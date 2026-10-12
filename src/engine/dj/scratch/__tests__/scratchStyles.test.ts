/**
 * Levels, palettes, genre hints and BPM suitability (owner scratch plan
 * sections 31-34; ledger SCR-P1.6 - P1.9).
 */
import { describe, it, expect } from 'vitest';
import {
  GESTURE_LEVELS, SCRATCH_STYLES, maxLevelFor, styleVocabulary, genreToScratchStyle,
  gestureSuitability, phraseBarsFor, MODE_MAX_LEVEL,
} from '../scratchStyles';
import { SCRATCH_GESTURE_IDS, getGesture } from '../scratchGestureCatalog';
import type { ScratchGesture } from '../scratchTypes';

describe('levels (section 31, SCR-P1.6)', () => {
  it('every gesture has exactly one level; crab is L4, forwardStab L1', () => {
    for (const id of SCRATCH_GESTURE_IDS) expect([1, 2, 3, 4], id).toContain(GESTURE_LEVELS[id]);
    expect(GESTURE_LEVELS.crab).toBe(4);
    expect(GESTURE_LEVELS.forwardStab).toBe(1);
    expect(GESTURE_LEVELS.baby).toBe(1);
    expect(GESTURE_LEVELS.chirp).toBe(2);
    expect(GESTURE_LEVELS.transformer8).toBe(3);
    expect(GESTURE_LEVELS.orbit).toBe(4);
    expect(GESTURE_LEVELS.eightFingerCrab).toBe(4);
  });

  it('maxLevelFor is the smaller of the mode and the style ceiling', () => {
    // the demo's whole ladder for every playing mode but SAFE (owner 2026-10-12, the demo's version wins)
    expect(MODE_MAX_LEVEL).toEqual({ OFF: 0, SAFE: 1, MUSICAL: 4, PERFORMER: 4, BATTLE: 4 });
    expect(maxLevelFor('BATTLE', 'battle')).toBe(4);
    expect(maxLevelFor('BATTLE', 'oldSchool')).toBe(2);
    expect(maxLevelFor('SAFE', 'battle')).toBe(1);
    expect(maxLevelFor('MUSICAL', 'electro')).toBe(4);
    expect(maxLevelFor('OFF', 'electro')).toBe(0);
  });
});

describe('style palettes (section 32, SCR-P1.7)', () => {
  it('five styles; loFi density 0.35; battle max level 4; oldSchool never yields crab', () => {
    expect(Object.keys(SCRATCH_STYLES)).toEqual(['oldSchool', 'boomBap', 'electro', 'battle', 'loFi']);
    expect(SCRATCH_STYLES.loFi.densityScale).toBe(0.35);
    expect(SCRATCH_STYLES.battle.maxLevel).toBe(4);
    expect(SCRATCH_STYLES.battle.bias).toEqual([]);
    expect(SCRATCH_STYLES.oldSchool.maxLevel).toBe(2);
    expect(SCRATCH_STYLES.oldSchool.fxAmount).toBe(0);
    expect(SCRATCH_STYLES.electro.fxAmount).toBe(0.5);
    expect(styleVocabulary('oldSchool')).not.toContain('crab');
    // the demo's scratch_dj palette bias, exact (SCR-PHRASING-PARITY)
    expect(styleVocabulary('oldSchool').slice(0, 3)).toEqual(['baby', 'forwardStab', 'drag']);
    expect(styleVocabulary('battle')).toContain('crab');
    expect(styleVocabulary('battle', 'SAFE')).not.toContain('chirp');
    for (const style of Object.values(SCRATCH_STYLES)) {
      expect(style.densityScale).toBeGreaterThan(0);
      expect(style.restScale).toBeGreaterThan(0);
      expect(style.fxAmount).toBeGreaterThanOrEqual(0);
      expect(style.fxAmount).toBeLessThanOrEqual(1);
      expect(style.name).toMatch(/^[A-Z]/);
    }
  });
});

describe('genre hints (section 33, SCR-P1.8)', () => {
  it('house -> electro palette with density x0.5 and a transformer bias', () => {
    const c = genreToScratchStyle('house');
    expect(c.style).toBe('electro');
    expect(c.modifiers.densityScale).toBe(0.5);
    expect(c.modifiers.bias).toEqual(['transformer4', 'transformer8']);
  });

  it('drumAndBass -> duration cap 2 steps; downtempo -> loFi; unknown -> boomBap unchanged', () => {
    expect(genreToScratchStyle('drumAndBass').modifiers.durationCapSteps).toBe(2);
    expect(genreToScratchStyle('downtempo').style).toBe('loFi');
    const u = genreToScratchStyle('polka');
    expect(u.style).toBe('boomBap');
    expect(u.genre).toBe('unknown');
    expect(u.modifiers).toEqual({ densityScale: 1, phraseBars: 4, fxScale: 1, restScale: 1, levelCap: 4, bias: [] });
    expect(genreToScratchStyle(undefined).style).toBe('boomBap');
  });

  it('reads a GenreAnalysis (subgenre before primary) and an Auto DJ style name', () => {
    expect(genreToScratchStyle({ primary: 'Electronic', subgenre: 'Techno', confidence: 0.6, mood: 'Energetic' }).genre).toBe('techno');
    expect(genreToScratchStyle({ primary: 'Hip Hop', subgenre: '', confidence: 0.6, mood: '' }).style).toBe('boomBap');
    expect(genreToScratchStyle({ primary: 'Electronic', subgenre: 'Drum & Bass', confidence: 0.6, mood: '' }).genre).toBe('drumAndBass');
    expect(genreToScratchStyle('Aggressive').style).toBe('battle');
    expect(genreToScratchStyle('Classic').style).toBe('oldSchool');
    expect(genreToScratchStyle('Minimal').style).toBe('loFi');
  });

  it('every hint names the dimensions of section 33 and never dictates alone (bias is additive)', () => {
    for (const hint of ['hipHop', 'breakbeat', 'electro', 'house', 'techno', 'drumAndBass', 'jungle', 'downtempo', 'experimental'] as const) {
      const c = genreToScratchStyle(hint);
      expect(c.genre).toBe(hint);
      expect(c.modifiers.densityScale).toBeGreaterThan(0);
      expect(c.modifiers.phraseBars).toBeGreaterThan(0);
      expect(c.modifiers.levelCap).toBeGreaterThanOrEqual(1);
      expect(SCRATCH_STYLES[c.style]).toBeDefined();
    }
  });
});

describe('BPM-aware suitability (section 34, SCR-P1.9)', () => {
  it('drag at 174 BPM < 0.4, drag at 80 BPM >= 1.0; crab and scribble are damped at speed', () => {
    expect(gestureSuitability('drag', 174)).toBeLessThan(0.4);
    expect(gestureSuitability('drag', 80)).toBeGreaterThanOrEqual(1.0);
    expect(gestureSuitability('crab', 174)).toBeCloseTo(0.6, 9);
    expect(gestureSuitability('scribble', 170)).toBeCloseTo(0.6, 9);
    expect(gestureSuitability('forwardStab', 174)).toBe(1);
    expect(gestureSuitability('baby', 120)).toBe(1);
    expect(gestureSuitability('baby', 80)).toBeCloseTo(1.2, 9);
    expect(phraseBarsFor(80)).toBe(8);
    expect(phraseBarsFor(120)).toBe(4);
  });

  it('nothing returns 0 except a recommendedBpm violation', () => {
    for (const bpm of [60, 85, 92, 124, 160, 174, 200]) {
      for (const id of SCRATCH_GESTURE_IDS) expect(gestureSuitability(id, bpm), `${id}@${bpm}`).toBeGreaterThan(0);
    }
    const slowOnly: ScratchGesture = { ...getGesture('tweak'), recommendedBpm: { max: 140 } };
    expect(gestureSuitability(slowOnly, 174)).toBe(0);
    expect(gestureSuitability(slowOnly, 120)).toBeGreaterThan(0);
    const fastOnly: ScratchGesture = { ...getGesture('forwardStab'), recommendedBpm: { min: 100 } };
    expect(gestureSuitability(fastOnly, 80)).toBe(0);
  });
});
