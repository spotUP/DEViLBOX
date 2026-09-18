import { describe, it, expect } from 'vitest';
import {
  nextPerformanceState,
  defaultLeadRows,
  type PerformanceState,
  type PerformanceStateInput,
} from '../performanceState';

function input(over: Partial<PerformanceStateInput> = {}): PerformanceStateInput {
  return {
    intention: 'ACCENT',
    targetRow: null,
    row: 0,
    leadRows: 1,
    gesturesInFlight: 0,
    holdExpired: false,
    energyCritical: false,
    canFire: true,
    ...over,
  };
}

describe('performance state machine — safety first', () => {
  it('RECOVERs and lets go the moment energy is critical, even mid-gesture', () => {
    const s = nextPerformanceState('RIDE', input({ energyCritical: true, gesturesInFlight: 1 }));
    expect(s.state).toBe('RECOVER');
    expect(s.shouldRelease).toBe(true);
    expect(s.shouldFire).toBe(false);
  });

  it('stays in RECOVER until nothing is left in flight', () => {
    expect(nextPerformanceState('RECOVER', input({ gesturesInFlight: 1 })).state).toBe('RECOVER');
    expect(nextPerformanceState('RECOVER', input({ gesturesInFlight: 0 })).state).toBe('LISTEN');
  });

  it('never fires while recovering, however strong the intention', () => {
    const s = nextPerformanceState('ANTICIPATE', input({
      energyCritical: true, intention: 'ACCENT', targetRow: 4, row: 4,
    }));
    expect(s.shouldFire).toBe(false);
  });
});

describe('performance state machine — letting go', () => {
  it('RELEASEs a hold that has run its length before considering anything new', () => {
    const s = nextPerformanceState('RIDE', input({ holdExpired: true, gesturesInFlight: 1 }));
    expect(s.state).toBe('RELEASE');
    expect(s.shouldRelease).toBe(true);
  });

  it('does not release when nothing is held', () => {
    const s = nextPerformanceState('LISTEN', input({ holdExpired: true, gesturesInFlight: 0 }));
    expect(s.state).not.toBe('RELEASE');
  });
});

describe('performance state machine — REST interrupts', () => {
  it('drops an anticipation when the performer decides to rest', () => {
    const s = nextPerformanceState('ANTICIPATE', input({ intention: 'REST', targetRow: 8, row: 4 }));
    expect(s.state).toBe('LISTEN');
    expect(s.shouldFire).toBe(false);
  });

  it('rides out what is already held while resting', () => {
    const s = nextPerformanceState('RIDE', input({ intention: 'REST', gesturesInFlight: 1 }));
    expect(s.state).toBe('RIDE');
    expect(s.shouldRelease).toBe(false);
  });
});

describe('performance state machine — aiming at an event', () => {
  it('ANTICIPATEs a target still outside the lead-in', () => {
    const s = nextPerformanceState('LISTEN', input({ targetRow: 8, row: 4, leadRows: 1 }));
    expect(s.state).toBe('ANTICIPATE');
    expect(s.reason).toMatch(/4\.00 rows ahead/);
  });

  it('ACTs once the target is inside the lead-in', () => {
    const s = nextPerformanceState('ANTICIPATE', input({ targetRow: 8, row: 7.5, leadRows: 1 }));
    expect(s.state).toBe('ACT');
    expect(s.shouldFire).toBe(true);
  });

  it('PREPAREs instead of firing when the budget says no', () => {
    const s = nextPerformanceState('ANTICIPATE', input({
      targetRow: 8, row: 7.5, leadRows: 1, canFire: false,
    }));
    expect(s.state).toBe('PREPARE');
    expect(s.shouldFire).toBe(false);
  });

  it('abandons a target that has already sounded rather than marking it late', () => {
    const s = nextPerformanceState('PREPARE', input({ targetRow: 8, row: 9 }));
    expect(s.state).toBe('LISTEN');
    expect(s.shouldFire).toBe(false);
    expect(s.reason).toMatch(/already sounded/);
  });

  it('acts without a target when the intention does not need one', () => {
    const s = nextPerformanceState('LISTEN', input({ intention: 'TEXTURE', targetRow: null }));
    expect(s.state).toBe('ACT');
    expect(s.shouldFire).toBe(true);
  });

  it('listens rather than acting when it is not free to fire', () => {
    const s = nextPerformanceState('LISTEN', input({ targetRow: null, canFire: false }));
    expect(s.state).toBe('LISTEN');
    expect(s.shouldFire).toBe(false);
  });
});

describe('performance state machine — a whole gesture, start to finish', () => {
  it('walks LISTEN → ANTICIPATE → ACT → RIDE → RELEASE → LISTEN', () => {
    const seen: PerformanceState[] = [];
    let state: PerformanceState = 'LISTEN';
    const target = 8;

    // Approaching the snare at row 8, a beat away.
    for (const row of [4, 6, 7.5]) {
      const s = nextPerformanceState(state, input({ targetRow: target, row, leadRows: 1 }));
      state = s.state;
      seen.push(state);
    }
    // Fired: a gesture is now in flight.
    let s = nextPerformanceState(state, input({ targetRow: null, row: 9, gesturesInFlight: 1 }));
    seen.push((state = s.state));
    // The hold reaches its length.
    s = nextPerformanceState(state, input({ row: 16, gesturesInFlight: 1, holdExpired: true }));
    seen.push((state = s.state));
    expect(s.shouldRelease).toBe(true);
    // Nothing held, nothing planned.
    s = nextPerformanceState(state, input({ row: 17, intention: 'REST' }));
    seen.push((state = s.state));

    expect(seen).toEqual(['ANTICIPATE', 'ANTICIPATE', 'ACT', 'RIDE', 'RELEASE', 'LISTEN']);
  });
});

describe('defaultLeadRows', () => {
  it('is a quarter of a beat, so it means the same at any speed', () => {
    expect(defaultLeadRows(4)).toBe(1);      // speed 6: 4 rows/beat
    expect(defaultLeadRows(8)).toBe(2);      // speed 3: 8 rows/beat
  });

  it('never collapses to zero on a very fast grid', () => {
    expect(defaultLeadRows(0.5)).toBe(0.25);
  });
});

describe('performance state machine — a drop interrupts', () => {
  it('lets go of what is held instead of riding through a drop', () => {
    const s = nextPerformanceState('RIDE', input({ intention: 'DROP', gesturesInFlight: 1 }));
    expect(s.state).toBe('RELEASE');
    expect(s.shouldRelease).toBe(true);
  });

  it('acts on the next decision, once nothing is in the way', () => {
    const s = nextPerformanceState('RELEASE', input({ intention: 'DROP', gesturesInFlight: 0 }));
    expect(s.shouldFire).toBe(true);
  });

  it('still lets safety come first', () => {
    const s = nextPerformanceState('RIDE', input({
      intention: 'DROP', gesturesInFlight: 1, energyCritical: true,
    }));
    expect(s.state).toBe('RECOVER');
  });
});
