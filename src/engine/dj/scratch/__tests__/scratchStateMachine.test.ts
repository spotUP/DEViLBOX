/** Performance states and peak mode (owner scratch plan sections 50, 51, 56; ledger SCR-P6.4, P6.9). */
import { describe, it, expect } from 'vitest';
import { ScratchStateMachine, SCRATCH_STATES, SCRATCH_TRANSITIONS, IllegalScratchTransition, type ScratchState } from '../scratchStateMachine';
import { performancePermissions } from '../scratchBudget';
import { checkCutRate, cutsPerBeat, MAX_CUTS_PER_BEAT } from '../ScratchSafety';
import { allowedGrids } from '../scratchAnchor';
import { getGesture } from '../scratchGestureCatalog';

/** Shortest legal path from IDLE to `to` (breadth first over the table). */
function pathTo(to: ScratchState): ScratchState[] {
  const prev = new Map<ScratchState, ScratchState>();
  const queue: ScratchState[] = ['IDLE'];
  const seen = new Set<ScratchState>(['IDLE']);
  while (queue.length) {
    const s = queue.shift()!;
    if (s === to) break;
    for (const n of SCRATCH_TRANSITIONS[s]) if (!seen.has(n)) { seen.add(n); prev.set(n, s); queue.push(n); }
  }
  const out: ScratchState[] = [];
  for (let s: ScratchState | undefined = to; s && s !== 'IDLE'; s = prev.get(s)) out.unshift(s);
  return out;
}

describe('scratch performance states (SCR-P6.4)', () => {
  it('every transition in the table is reachable and legal', () => {
    let count = 0;
    for (const from of SCRATCH_STATES) {
      if (from === 'ABORTING') continue;
      for (const to of SCRATCH_TRANSITIONS[from]) {
        const m = new ScratchStateMachine();
        m.path(pathTo(from), 'setup');
        expect(m.state).toBe(from);
        m.go(to, 'test');
        expect(m.state).toBe(to);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(30);
  });

  it('the section 51 walk: listening -> setup -> throw -> scratching -> rest -> evaluate outcomes', () => {
    const m = new ScratchStateMachine();
    m.path(['LISTENING', 'SETUP', 'THROW', 'SCRATCHING', 'REST'], 'phrase');
    for (const next of ['RESPONSE', 'ESCALATING', 'RESOLVING', 'LISTENING'] as const) expect(m.can(next)).toBe(true);
  });

  it('an illegal transition throws', () => {
    const m = new ScratchStateMachine();
    expect(() => m.go('SCRATCHING', 'jump')).toThrow(IllegalScratchTransition);
    m.go('LISTENING', 'on');
    expect(() => m.go('FEATURE', 'jump')).toThrow(/LISTENING -> FEATURE/);
  });

  it('ABORTING from every state ends in IDLE with the restore called, also when the restore throws', () => {
    for (const s of SCRATCH_STATES) {
      if (s === 'ABORTING' || s === 'IDLE') continue;
      const m = new ScratchStateMachine();
      m.path(pathTo(s), 'setup');
      let restored = 0;
      m.abort('user took over', () => { restored++; });
      expect(m.state, s).toBe('IDLE');
      expect(restored, s).toBe(1);
    }
    const m = new ScratchStateMachine();
    m.path(['LISTENING', 'SETUP', 'SCRATCHING'], 'x');
    expect(() => m.abort('boom', () => { throw new Error('restore failed'); })).toThrow('restore failed');
    expect(m.state).toBe('IDLE');
  });
});

describe('peak performance mode (SCR-P6.9)', () => {
  it('PEAK with the budget >= 75 unlocks level 4 and 1/32 for PERFORMER; outside the peak it does not', () => {
    const peak = performancePermissions({ setPhase: 'PEAK', budgetTotal: 80, mode: 'PERFORMER' });
    expect(peak).toMatchObject({ peak: true, maxLevel: 4, juggle: true, doubles: true, callResponse: true, throws: true });
    expect(peak.grids).toContain('1/32');
    expect(performancePermissions({ setPhase: 'PEAK', budgetTotal: 60, mode: 'PERFORMER' })).toMatchObject({ peak: false, maxLevel: 3 });
    expect(performancePermissions({ setPhase: 'CRUISING', budgetTotal: 90, mode: 'BATTLE' }).grids).not.toContain('1/32');
    expect(performancePermissions({ setPhase: 'PEAK', budgetTotal: 90, mode: 'MUSICAL' })).toMatchObject({ peak: false, maxLevel: 2 });
  });

  it('the safety check still refuses a 20 cuts-per-beat request at the peak, and passes the catalogue at 1/16', () => {
    expect(checkCutRate({ cutsPerBeat: 20 })).toMatchObject({ ok: false });
    expect(checkCutRate({ cutsPerBeat: MAX_CUTS_PER_BEAT })).toMatchObject({ ok: true });
    for (const id of ['transformer8', 'crab', 'eightFingerCrab', 'uzi', 'chirp'] as const) expect(checkCutRate({ gesture: id }).ok, `${id} ${cutsPerBeat(id).toFixed(1)}`).toBe(true);
    // a one-step gesture on 1/32 under 110 BPM is allowed by the grid rule
    expect(allowedGrids(getGesture('laser'), 100)).toContain('1/32');
  });
});
