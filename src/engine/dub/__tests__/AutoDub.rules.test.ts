/**
 * AutoDub rule-engine tests.
 *
 * Pure coverage of `chooseMove(ctx, rng)` — the decision step that runs
 * every 250 ms tick. Deterministic via seeded RNG. No DubBus mocking
 * required because chooseMove never touches the router.
 */

import { describe, it, expect } from 'vitest';
import { chooseMove, detectTransients, hasTransientForRole, type AutoDubTickCtx } from '../AutoDub';
import { getPersona } from '../AutoDubPersonas';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';

/** Deterministic linear-congruential RNG. xorshift would be nicer but this
 *  is plenty for "roll the same sequence twice in a test." */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function baseCtx(overrides: Partial<AutoDubTickCtx> = {}): AutoDubTickCtx {
  return {
    bar: 3,                // bar 3 of 4 — several rules are eligible here
    barPos: 0.0,
    isNewBar: true,
    intensity: 0.8,
    persona: getPersona('custom'),
    blacklist: new Set(),
    movesFiredThisBar: 0,
    moveLastFiredBar: new Map(),
    channelCount: 8,
    roles: [],
    transientChannels: [],
    ...overrides,
  };
}

describe('AutoDub chooseMove', () => {
  it('returns null when intensity is 0 (per-tick roll always fails)', () => {
    const rng = seededRng(1);
    const result = chooseMove(baseCtx({ intensity: 0 }), rng);
    expect(result).toBeNull();
  });

  it('returns null when blacklist blocks every candidate', () => {
    // Blacklist every move that has a rule at bar 3 / new bar
    const blacklist = new Set([
      'echoThrow', 'tapeStop', 'filterDrop', 'radioRiser', 'snareCrack',
      'channelMute', 'springSlam', 'echoBuildUp', 'dubSiren', 'reverseEcho',
      'backwardReverb', 'crushBass', 'tubbyScream', 'sonarPing', 'subSwell',
      'stereoDoubler', 'channelThrow', 'subHarmonic',
    ]);
    const rng = seededRng(42);
    const result = chooseMove(baseCtx({ blacklist, intensity: 1 }), rng);
    expect(result).toBeNull();
  });

  it('respects per-bar budget cap', () => {
    // Intensity 1 → budget = 1 + 3 = 4. Already at 4 → null.
    const rng = seededRng(7);
    const result = chooseMove(
      baseCtx({ intensity: 1, movesFiredThisBar: 4 }),
      rng,
    );
    expect(result).toBeNull();
  });

  it("respects persona-specific budgetCap (Jammy caps at 1)", () => {
    const rng = seededRng(7);
    const result = chooseMove(
      baseCtx({ persona: getPersona('jammy'), movesFiredThisBar: 1 }),
      rng,
    );
    expect(result).toBeNull();
  });

  it('produces a well-formed choice when conditions + budget allow', () => {
    const rng = seededRng(11);
    const result = chooseMove(baseCtx({ intensity: 1 }), rng);
    expect(result).not.toBeNull();
    expect(typeof result?.moveId).toBe('string');
    expect(Array.isArray(result?.params) ? false : typeof result?.params).toBe('object');
    expect(typeof result?.holdBars).toBe('number');
  });

  it('picks a channel only for channel-targeted moves', () => {
    // At barPos 0.45 mid-bar, springSlam (no channelRole) is the cleanest hit.
    // With channelCount > 0 and channelRole undefined → channelId must be undefined.
    const rng = seededRng(5);
    for (let i = 0; i < 50; i++) {
      const result = chooseMove(baseCtx({
        bar: 0, barPos: 0.47, isNewBar: false, intensity: 1,
      }), rng);
      if (!result) continue;
      if (result.moveId === 'springSlam') {
        expect(result.channelId).toBeUndefined();
        return;
      }
    }
    // Fallback if springSlam never rolls in 50 tries with this seed — should
    // happen with seeded RNG stability, but guard anyway.
    expect.fail('springSlam was not picked in 50 seeded rolls — adjust seed/test');
  });

  it('persona paramOverrides flow through to the choice', () => {
    // Scientist persona overrides echoThrow to throwBeats: 4. Any pick of
    // echoThrow should carry that param through chooseMove's output.
    const rng = seededRng(123);
    const persona = getPersona('scientist');
    for (let i = 0; i < 80; i++) {
      const result = chooseMove(baseCtx({ persona, intensity: 1 }), rng);
      if (result?.moveId === 'echoThrow') {
        expect(result.params.throwBeats).toBe(4);
        expect(result.params.feedbackBoost).toBe(0.25);
        return;
      }
    }
    expect.fail('echoThrow not picked for Scientist in 80 rolls — adjust seed');
  });

  it('persona weight bias shifts distribution vs Custom', () => {
    // At barPos 0, isNewBar, bar=3 → many competing rules. Tubby weights
    // echoThrow at 1.5 vs Custom's 1.0, so Tubby should fire echoThrow
    // proportionally more often when it's in competition with other rules.
    function countMove(personaId: 'custom' | 'tubby', targetId: string): number {
      const persona = getPersona(personaId);
      const rng = seededRng(2024);
      let count = 0;
      for (let i = 0; i < 500; i++) {
        const result = chooseMove(baseCtx({
          persona, intensity: 1, barPos: 0.0, isNewBar: true, bar: 3,
        }), rng);
        if (result?.moveId === targetId) count += 1;
      }
      return count;
    }
    const customCount = countMove('custom', 'echoThrow');
    const tubbyCount = countMove('tubby', 'echoThrow');
    expect(tubbyCount).toBeGreaterThan(customCount);
  });

  it('cooldown decay suppresses moves fired within the last 4 bars', () => {
    // At bar=7, isNewBar, echoThrow is eligible (bar%4===3). If echoThrow
    // fired recently on bar 5, decay = (7-5)/4 = 0.5 → echoThrow weight halved.
    // Over many rolls with a continuous RNG, echoThrow should be picked less
    // often when the cooldown is active.
    const lastFired = new Map<string, number>();
    lastFired.set('echoThrow', 5);

    const rngA = seededRng(9000);
    const rngB = seededRng(9000);
    let withCooldown = 0;
    let withoutCooldown = 0;
    for (let i = 0; i < 500; i++) {
      const a = chooseMove(baseCtx({
        bar: 7, barPos: 0.0, isNewBar: true, intensity: 1,
        moveLastFiredBar: lastFired,
      }), rngA);
      const b = chooseMove(baseCtx({
        bar: 7, barPos: 0.0, isNewBar: true, intensity: 1,
      }), rngB);
      if (a?.moveId === 'echoThrow') withCooldown += 1;
      if (b?.moveId === 'echoThrow') withoutCooldown += 1;
    }
    expect(withoutCooldown).toBeGreaterThan(withCooldown);
  });

  it('zero channelCount nulls the channelId even for channel-targeted rules', () => {
    const rng = seededRng(99);
    for (let i = 0; i < 50; i++) {
      const result = chooseMove(baseCtx({
        channelCount: 0, intensity: 1,
      }), rng);
      if (result?.moveId === 'echoThrow' || result?.moveId === 'channelMute' || result?.moveId === 'snareCrack') {
        expect(result.channelId).toBeUndefined();
        return;
      }
    }
  });

  // ─── Phase 2: role-aware targeting ────────────────────────────────────────

  it('channelMute only targets bass-role channels when roles available', () => {
    // ch0=perc, ch1=bass, ch2=lead, ch3=pad, ch4=empty, ch5=bass.
    // Bar 1 of 2 → channelMute is the only rule eligible (bar%2===1).
    // channelId must be 1 or 5 — never 0/2/3/4.
    const roles: ChannelRole[] = ['percussion', 'bass', 'lead', 'pad', 'empty', 'bass'];
    const rng = seededRng(2001);
    let found = 0;
    for (let i = 0; i < 400; i++) {
      const result = chooseMove(baseCtx({
        bar: 1, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: roles.length, roles,
      }), rng);
      if (result?.moveId === 'channelMute') {
        expect([1, 5]).toContain(result.channelId);
        found += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('echoThrow only targets percussion-role channels when roles available', () => {
    const roles: ChannelRole[] = ['bass', 'percussion', 'lead', 'percussion', 'empty'];
    const rng = seededRng(2002);
    let found = 0;
    for (let i = 0; i < 400; i++) {
      const result = chooseMove(baseCtx({
        bar: 3, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: roles.length, roles,
      }), rng);
      if (result?.moveId === 'echoThrow') {
        expect([1, 3]).toContain(result.channelId);
        found += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('skips role-targeted rule when no channels match the required role', () => {
    // Roles list has no bass. channelMute (bass) should never fire.
    const roles: ChannelRole[] = ['percussion', 'percussion', 'lead', 'empty'];
    const rng = seededRng(2003);
    for (let i = 0; i < 500; i++) {
      const result = chooseMove(baseCtx({
        bar: 1, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: roles.length, roles,
      }), rng);
      expect(result?.moveId).not.toBe('channelMute');
    }
  });

  it("'any' role skips empty channels but picks from everything else", () => {
    // Roles: ch0=empty, ch1=bass, ch2=empty, ch3=lead. channelThrow
    // (role='any') should never pick ch0 or ch2.
    const roles: ChannelRole[] = ['empty', 'bass', 'empty', 'lead'];
    const rng = seededRng(2004);
    let found = 0;
    for (let i = 0; i < 400; i++) {
      const result = chooseMove(baseCtx({
        bar: 0, barPos: 0.7, isNewBar: false, intensity: 1,
        channelCount: roles.length, roles,
      }), rng);
      if (result?.moveId === 'channelThrow') {
        expect([1, 3]).toContain(result.channelId);
        found += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('empty roles array falls back to Phase-1 random channel pick', () => {
    // No role data → any channel 0..channelCount-1 is fair game.
    const rng = seededRng(2005);
    let sawChannel = false;
    for (let i = 0; i < 50; i++) {
      const result = chooseMove(baseCtx({
        channelCount: 4, roles: [], intensity: 1,
      }), rng);
      if (result?.moveId === 'echoThrow' && result.channelId !== undefined) {
        expect(result.channelId).toBeGreaterThanOrEqual(0);
        expect(result.channelId).toBeLessThan(4);
        sawChannel = true;
      }
    }
    expect(sawChannel).toBe(true);
  });
});

// ─── Phase 3: transient detection ────────────────────────────────────────────

function makeQuietBuffer(): Int16Array {
  // 128-sample buffer at ~200 amplitude — below TRANSIENT_MIN_PEAK (800).
  const buf = new Int16Array(128);
  for (let i = 0; i < buf.length; i++) buf[i] = (i & 1) ? 200 : -200;
  return buf;
}

function makeLoudBuffer(amp: number = 12000): Int16Array {
  const buf = new Int16Array(128);
  for (let i = 0; i < buf.length; i++) buf[i] = (i & 1) ? amp : -amp;
  return buf;
}

describe('detectTransients', () => {
  it('does not flag the very first tick (no history to compare against)', () => {
    const rolling: number[][] = [];
    const trans = detectTransients([makeLoudBuffer()], rolling);
    expect(trans).toEqual([]);
    // History should now have the first peak recorded.
    expect(rolling[0].length).toBe(1);
  });

  it('flags a channel whose peak jumps above the rolling ratio', () => {
    const rolling: number[][] = [];
    // Prime 4 quiet ticks
    for (let i = 0; i < 4; i++) detectTransients([makeQuietBuffer()], rolling);
    // Now a loud hit
    const trans = detectTransients([makeLoudBuffer()], rolling);
    expect(trans).toEqual([0]);
  });

  it('does not flag channels below TRANSIENT_MIN_PEAK even if ratio passes', () => {
    const rolling: number[][] = [];
    // Prime with very quiet — avg = near 0 (but > 0)
    const veryQuiet = new Int16Array(128);
    for (let i = 0; i < 128; i++) veryQuiet[i] = (i & 1) ? 100 : -100;
    for (let i = 0; i < 4; i++) detectTransients([veryQuiet], rolling);
    // Quiet tick — peak 200 passes ratio vs avg 100 but < MIN_PEAK (800)
    const trans = detectTransients([makeQuietBuffer()], rolling);
    expect(trans).toEqual([]);
  });

  it('handles per-channel independence (one spike, one quiet)', () => {
    const rolling: number[][] = [];
    for (let i = 0; i < 4; i++) {
      detectTransients([makeQuietBuffer(), makeQuietBuffer()], rolling);
    }
    const trans = detectTransients([makeLoudBuffer(), makeQuietBuffer()], rolling);
    expect(trans).toEqual([0]);
  });

  it('shifts out old peaks past TRANSIENT_WINDOW (8)', () => {
    const rolling: number[][] = [];
    for (let i = 0; i < 20; i++) detectTransients([makeQuietBuffer()], rolling);
    expect(rolling[0].length).toBeLessThanOrEqual(8);
  });
});

describe('hasTransientForRole', () => {
  it('returns true when any channel with the matching role has a transient', () => {
    const ctx = {
      ...({} as AutoDubTickCtx),
      roles: ['percussion', 'bass', 'lead'] as ChannelRole[],
      transientChannels: [0],
    } as AutoDubTickCtx;
    expect(hasTransientForRole(ctx, 'percussion')).toBe(true);
    expect(hasTransientForRole(ctx, 'bass')).toBe(false);
  });

  it('returns false when no transients this tick', () => {
    const ctx = {
      ...({} as AutoDubTickCtx),
      roles: ['percussion'] as ChannelRole[],
      transientChannels: [],
    } as AutoDubTickCtx;
    expect(hasTransientForRole(ctx, 'percussion')).toBe(false);
  });

  it('returns false when roles unavailable (Phase-1 fallback)', () => {
    const ctx = {
      ...({} as AutoDubTickCtx),
      roles: [] as ChannelRole[],
      transientChannels: [0, 1],
    } as AutoDubTickCtx;
    expect(hasTransientForRole(ctx, 'percussion')).toBe(false);
  });
});

describe('transient-triggered rules', () => {
  it('echoThrow fires preferentially on a percussion transient vs bar-phase only', () => {
    // Count echoThrow fires with vs without a percussion transient present,
    // with identical bar-phase conditions (bar 3 new-bar where the bar-phase
    // rule is also eligible). Transients should boost fire frequency.
    const roles: ChannelRole[] = ['percussion', 'bass', 'lead'];
    function countWithTransient(active: boolean): number {
      const rng = seededRng(3001);
      let count = 0;
      for (let i = 0; i < 500; i++) {
        const result = chooseMove(baseCtx({
          bar: 3, barPos: 0.0, isNewBar: true, intensity: 1,
          channelCount: 3, roles,
          transientChannels: active ? [0] : [],
        }), rng);
        if (result?.moveId === 'echoThrow') count += 1;
      }
      return count;
    }
    const withTransient = countWithTransient(true);
    const without = countWithTransient(false);
    expect(withTransient).toBeGreaterThan(without);
  });
});
