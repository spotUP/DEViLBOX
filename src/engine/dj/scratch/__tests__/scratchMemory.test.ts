/** Performance memory and cooldowns (owner scratch plan sections 53, 54, 90; ledger SCR-P6.6, P6.7). */
import { describe, it, expect } from 'vitest';
import { ScratchMemory, MEMORY_SIZE } from '../scratchMemory';

const entry = (bar: number, sourceKey: string, gesture: 'chirp' | 'baby' | 'crab' | 'scribble' | 'transformer8', section = 'breakdown', nextSection = 'drop') =>
  ({ bar, sourceKey, gesture, intensity: 0.5, section, nextSection });

describe('memory informs the next choice (SCR-P6.6)', () => {
  it('AH + chirp right after AH + chirp is penalised below YEAH + baby', () => {
    const m = new ScratchMemory();
    m.record(entry(10, 'crate:AH_STANDARD', 'chirp'));
    expect(m.preference('crate:AH_STANDARD', 'chirp', 'breakdown', 'drop')).toBeLessThan(m.preference('crate:YEAH_STANDARD', 'baby', 'breakdown', 'drop'));
  });

  it('a pairing that scored well at breakdown -> drop is preferred next time; a poor one is penalised', () => {
    const m = new ScratchMemory();
    const good = entry(10, 'crate:AH_STANDARD', 'chirp');
    const poor = entry(11, 'crate:FRESH_STANDARD', 'crab', 'chorus', 'verse');
    m.record(good); m.record(poor);
    m.recordQuality([good], 0.9);
    m.recordQuality([poor], 0.3);
    m.record(entry(12, 'crate:YEAH_STANDARD', 'baby')); // something else played last
    expect(m.preference('crate:AH_STANDARD', 'chirp', 'breakdown', 'drop')).toBeCloseTo(0.1, 9);
    expect(m.preference('crate:FRESH_STANDARD', 'crab', 'chorus', 'verse')).toBeCloseTo(-0.2, 9);
    expect(m.preference('crate:AH_STANDARD', 'chirp', 'verse', 'chorus')).toBe(0);
  });

  it('keeps the last 16 entries and reports what was used', () => {
    const m = new ScratchMemory();
    for (let i = 0; i < 20; i++) m.record(entry(i, `crate:R${i}`, 'baby'));
    expect(m.entries).toHaveLength(MEMORY_SIZE);
    expect(m.recent().recentSources[0]).toBe('crate:R4');
  });
});

describe('cooldowns (SCR-P6.7)', () => {
  it('crab again within 16 bars is blocked; scribble after 8; baby after 2 is allowed', () => {
    const m = new ScratchMemory();
    m.record(entry(0, 'crate:AH_STANDARD', 'crab'));
    m.record(entry(0, 'crate:YEAH_STANDARD', 'scribble'));
    m.record(entry(0, 'crate:ONE', 'baby'));
    expect(m.gestureReady('crab', 15)).toBe(false);
    expect(m.gestureReady('crab', 16)).toBe(true);
    expect(m.gestureReady('scribble', 7)).toBe(false);
    expect(m.gestureReady('scribble', 8)).toBe(true);
    expect(m.gestureReady('baby', 1)).toBe(false);
    expect(m.gestureReady('baby', 2)).toBe(true);
    expect(m.gestureReady('transformer8', 1)).toBe(true);
    expect(m.coolingGestures(5, ['crab', 'baby', 'scribble'])).toEqual(['crab', 'scribble']);
  });

  it('AH_STANDARD cools 8 bars, other sources 4; routines 16; a feature 32; a battle 64', () => {
    const m = new ScratchMemory();
    m.record({ ...entry(0, 'crate:AH_STANDARD', 'chirp'), routine: 'phraseEnd' });
    m.record(entry(0, 'crate:ONE', 'chirp'));
    expect(m.sourceReady('crate:AH_STANDARD', 7)).toBe(false);
    expect(m.sourceReady('crate:AH_STANDARD', 8)).toBe(true);
    expect(m.sourceReady('crate:ONE', 4)).toBe(true);
    expect(m.routineReady('phraseEnd', 15)).toBe(false);
    expect(m.routineReady('phraseEnd', 16)).toBe(true);
    m.recordPerformance('battle', 0);
    expect(m.featureReady(31)).toBe(false);
    expect(m.featureReady(32)).toBe(true);
    expect(m.battleReady(63)).toBe(false);
    expect(m.battleReady(64)).toBe(true);
  });
});
