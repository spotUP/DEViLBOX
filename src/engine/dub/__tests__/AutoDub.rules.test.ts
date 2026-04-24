/**
 * AutoDub rule-engine tests.
 *
 * Pure coverage of `chooseMove(ctx, rng)` — the decision step that runs
 * every 250 ms tick. Deterministic via seeded RNG. No DubBus mocking
 * required because chooseMove never touches the router.
 */

import { describe, it, expect } from 'vitest';
import {
  chooseMove, detectTransients, hasTransientForRole,
  channelHasNoteInWindow, computeDensityByRole,
  type AutoDubTickCtx,
} from '../AutoDub';
import { getPersona } from '../AutoDubPersonas';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import type { Pattern, ChannelData, TrackerCell } from '@/types/tracker';

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
    wetFiredThisBar: 0,
    moveLastFiredBar: new Map(),
    channelCount: 8,
    roles: [],
    transientChannels: [],
    // Defaults for the look-ahead / density / rename-boost fields added
    // 2026-04-21 — `null` pattern disables look-ahead, empty density map
    // disables bias, empty name array disables boost. Existing tests thus
    // exercise the Phase-1 behaviour by default.
    currentPattern: null,
    currentRow: 0,
    channelNames: [],
    densityByRole: new Map(),
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
      'springKick', 'ghostReverb', 'ringMod', 'voltageStarve', 'eqSweep',
      'delayPresetDotted', 'delayPresetTriplet',
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

  it('wet-budget: skips wet rules after a wet move already fired this bar', () => {
    // With wetFiredThisBar=1 (cap is 1), every wet rule is skipped. Only
    // dry rules (tapeStop, filterDrop, channelMute, etc.) can fire.
    // Run many rolls and assert no wet-tagged move is chosen.
    const rng = seededRng(4000);
    const wetMoves = new Set([
      'echoThrow', 'snareCrack', 'springSlam', 'echoBuildUp',
      'reverseEcho', 'backwardReverb', 'tubbyScream', 'sonarPing',
      'channelThrow',
    ]);
    let drySeen = 0;
    for (let i = 0; i < 500; i++) {
      // Use bar 7 isNewBar (both wet + dry rules eligible) with wet exhausted.
      const result = chooseMove(baseCtx({
        bar: 7, barPos: 0.0, isNewBar: true, intensity: 1,
        movesFiredThisBar: 1,
        wetFiredThisBar: 1,
      }), rng);
      if (result) {
        expect(wetMoves.has(result.moveId)).toBe(false);
        drySeen += 1;
      }
    }
    expect(drySeen).toBeGreaterThan(0);
  });

  it('never fires oscBass or crushBass (the BASS/CRUSH pads are manual-only)', () => {
    // Contract — both moves are generators that stomp on the mix (self-
    // oscillating LPF drone / 3-bit quantize saw drone). They're useful as
    // manual performance pads but catastrophic when auto-fired. Walking the
    // whole rule table with a permissive ctx and asserting no pick returns
    // either moveId locks this behaviour.
    const rng = seededRng(6000);
    const forbidden = new Set(['oscBass', 'crushBass']);
    for (let i = 0; i < 2000; i++) {
      // Vary bar/barPos to hit every rule's condition window.
      const bar = i % 16;
      const barPos = (i % 32) / 32;
      const result = chooseMove(baseCtx({
        bar, barPos, isNewBar: (i % 4) === 0,
        intensity: 1, movesFiredThisBar: 0, wetFiredThisBar: 0,
      }), rng);
      if (result) expect(forbidden.has(result.moveId)).toBe(false);
    }
  });

  it('wet flag is set on choice when a wet rule wins the roulette', () => {
    const rng = seededRng(5000);
    // intensity 1 at isNewBar bar 3 → echoThrow (wet) is most likely pick.
    for (let i = 0; i < 100; i++) {
      const result = chooseMove(baseCtx({ intensity: 1 }), rng);
      if (result?.moveId === 'echoThrow') {
        expect(result.wet).toBe(true);
        return;
      }
    }
    expect.fail('echoThrow never rolled in 100 tries — adjust seed');
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

  it('falls back to any non-empty channel when no role match (rather than silently skipping)', () => {
    // Roles list has no bass. channelMute (bass) used to be skipped
    // entirely — but then on songs without a clear bass role no bass-
    // targeted rule ever fires and the pattern editor sees zero Zxx
    // cells. New behaviour: when classification returns roles but none
    // match the rule's want, pick from ANY non-empty channel.
    const roles: ChannelRole[] = ['percussion', 'percussion', 'lead', 'empty'];
    const rng = seededRng(2003);
    let sawBassTargeted = false;
    for (let i = 0; i < 500; i++) {
      const result = chooseMove(baseCtx({
        bar: 1, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: roles.length, roles,
      }), rng);
      if (result?.moveId === 'channelMute') {
        sawBassTargeted = true;
        // Must have landed on a non-empty channel (0, 1, or 2 — not 3).
        expect([0, 1, 2]).toContain(result.channelId);
      }
    }
    expect(sawBassTargeted).toBe(true);
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

// ── Look-ahead / density / rename-boost helpers (2026-04-21) ────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function noteCell(n: number): TrackerCell {
  return { note: n, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function makeChannel(name: string, length: number, notes: Record<number, number>): ChannelData {
  const rows: TrackerCell[] = Array.from({ length }, () => emptyCell());
  for (const [rowStr, note] of Object.entries(notes)) {
    const row = parseInt(rowStr, 10);
    if (row >= 0 && row < length) rows[row] = noteCell(note);
  }
  return {
    id: name, name, rows, muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: 1, color: null,
  };
}
function makePattern(channels: ChannelData[]): Pattern {
  return { id: 'p0', name: 'p', length: channels[0]?.rows.length ?? 64, channels };
}

describe('channelHasNoteInWindow', () => {
  it('returns false for null pattern / missing channel / out-of-range index', () => {
    expect(channelHasNoteInWindow(null, 0, 0, 16)).toBe(false);
    const p = makePattern([makeChannel('ch0', 64, { 0: 24 })]);
    expect(channelHasNoteInWindow(p, 0, 99, 16)).toBe(false);
  });
  it('returns true when any note lands inside the window', () => {
    const p = makePattern([makeChannel('ch0', 64, { 5: 24 })]);
    expect(channelHasNoteInWindow(p, 0, 0, 16)).toBe(true);
    // Exact window boundary: note at row 15 included when windowRows=16.
    const p2 = makePattern([makeChannel('ch0', 64, { 15: 24 })]);
    expect(channelHasNoteInWindow(p2, 0, 0, 16)).toBe(true);
    // Past window: note at row 16 NOT included.
    const p3 = makePattern([makeChannel('ch0', 64, { 16: 24 })]);
    expect(channelHasNoteInWindow(p3, 0, 0, 16)).toBe(false);
  });
  it('returns false for a silent window (no notes in range)', () => {
    const p = makePattern([makeChannel('ch0', 64, { 40: 24 })]);
    expect(channelHasNoteInWindow(p, 0, 0, 16)).toBe(false);
  });
});

describe('computeDensityByRole', () => {
  it('returns an empty map when pattern is null or roles empty', () => {
    expect(computeDensityByRole(null, 0, ['percussion'], 16).size).toBe(0);
    const p = makePattern([makeChannel('ch0', 64, { 0: 24 })]);
    expect(computeDensityByRole(p, 0, [], 16).size).toBe(0);
  });
  it('reports higher density for a busier role', () => {
    // Percussion fires every row; bass only twice.
    const drums = makeChannel('d', 64, Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [i, 24]),
    ));
    const bass = makeChannel('b', 64, { 0: 13, 8: 13 });
    const p = makePattern([drums, bass]);
    const d = computeDensityByRole(p, 0, ['percussion', 'bass'], 16);
    const perc = d.get('percussion') ?? 0;
    const bassDen = d.get('bass') ?? 0;
    expect(perc).toBeGreaterThan(bassDen);
    // Percussion should be nearly saturated (close to 1.0).
    expect(perc).toBeGreaterThan(0.8);
    expect(bassDen).toBeLessThan(0.3);
  });
  it('respects the look-ahead window — only notes inside range count', () => {
    const drums = makeChannel('d', 64, { 0: 24, 32: 24, 48: 24 });
    const p = makePattern([drums]);
    // Window covers rows 0..15 → sees only the row-0 note.
    const d1 = computeDensityByRole(p, 0, ['percussion'], 16);
    // Window covers rows 30..45 → sees the row-32 note.
    const d2 = computeDensityByRole(p, 30, ['percussion'], 16);
    expect(d1.get('percussion')).toBeGreaterThan(0);
    expect(d2.get('percussion')).toBeGreaterThan(0);
    // Window covers rows 16..31 → no notes in range.
    const d3 = computeDensityByRole(p, 16, ['percussion'], 16);
    expect(d3.get('percussion')).toBeCloseTo(0, 5);
  });
});

describe('chooseMove — look-ahead skips silent target channels', () => {
  it('does not fire per-channel move on a silent channel when look-ahead is possible', () => {
    // Channel 0 = percussion, silent for the next 16 rows. Channel 1 =
    // percussion, notes every 2 rows. Fire should pick ch 1, never ch 0.
    const silent = makeChannel('ch0', 64, { 60: 24 }); // note only at tail
    const busy = makeChannel('ch1', 64, Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [i * 2, 24]),
    ));
    const pattern = makePattern([silent, busy]);
    const rng = seededRng(7070);
    let pickedSilent = 0;
    let pickedBusy = 0;
    for (let i = 0; i < 200; i++) {
      const result = chooseMove(baseCtx({
        bar: 3, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: 2, roles: ['percussion', 'percussion'],
        currentPattern: pattern, currentRow: 0,
      }), rng);
      if (result?.channelId === 0) pickedSilent += 1;
      if (result?.channelId === 1) pickedBusy += 1;
    }
    expect(pickedSilent).toBe(0);
    expect(pickedBusy).toBeGreaterThan(0);
  });
  it('falls through to Phase-1 (all candidates) when currentPattern is null', () => {
    // No pattern → look-ahead disabled → both channels eligible.
    const rng = seededRng(8080);
    let pickedSilent = 0;
    let pickedBusy = 0;
    for (let i = 0; i < 200; i++) {
      const result = chooseMove(baseCtx({
        bar: 3, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: 2, roles: ['percussion', 'percussion'],
        currentPattern: null,
      }), rng);
      if (result?.channelId === 0) pickedSilent += 1;
      if (result?.channelId === 1) pickedBusy += 1;
    }
    expect(pickedSilent + pickedBusy).toBeGreaterThan(0);
    expect(pickedSilent).toBeGreaterThan(0); // no longer skipped
  });
});

describe('chooseMove — user-rename target boost', () => {
  it('prefers a channel with a user-edited name over an auto-named sibling', () => {
    // Two percussion channels, same look-ahead status. Channel 0 = generic
    // name "Channel 1", channel 1 = user-edited "Snare Solo". Expect
    // roughly ~60% pick rate on ch 1 (1.5 / 2.5 ≈ 0.6) vs ~40% on ch 0.
    const busy = makeChannel('busy', 64, Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [i, 24]),
    ));
    const pattern = makePattern([
      { ...busy, id: 'ch0', name: 'Channel 1' },
      { ...busy, id: 'ch1', name: 'Snare Solo' },
    ]);
    const rng = seededRng(9090);
    let pickedGeneric = 0;
    let pickedUser = 0;
    for (let i = 0; i < 300; i++) {
      const result = chooseMove(baseCtx({
        bar: 3, barPos: 0.0, isNewBar: true, intensity: 1,
        channelCount: 2, roles: ['percussion', 'percussion'],
        currentPattern: pattern, currentRow: 0,
        channelNames: ['Channel 1', 'Snare Solo'],
      }), rng);
      if (result?.channelId === 0) pickedGeneric += 1;
      if (result?.channelId === 1) pickedUser += 1;
    }
    expect(pickedUser).toBeGreaterThan(pickedGeneric);
  });
});

describe('chooseMove — density bias', () => {
  it('Scientist persona (+density) fires more during dense passages', () => {
    // Build two fixtures: one dense, one sparse. Count firings of a global
    // rule (e.g. echoBuildUp, which is Scientist's signature) across 500
    // ticks with each.
    const denseDrums = makeChannel('d', 64, Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [i, 24]),
    ));
    const sparseDrums = makeChannel('d', 64, { 0: 24, 8: 24 });
    const densePattern = makePattern([denseDrums]);
    const sparsePattern = makePattern([sparseDrums]);
    function countFires(pattern: Pattern): number {
      const rng = seededRng(1234);
      let n = 0;
      for (let i = 0; i < 500; i++) {
        // bar 2 of 4 → echoBuildUp is eligible. Scientist weights it 1.8×.
        const density = computeDensityByRole(pattern, 0, ['percussion'], 16);
        const result = chooseMove(baseCtx({
          bar: 2, barPos: 0.0, isNewBar: true, intensity: 0.8,
          persona: getPersona('scientist'),
          channelCount: 1, roles: ['percussion'],
          currentPattern: pattern, currentRow: 0,
          densityByRole: density,
        }), rng);
        if (result?.moveId === 'echoBuildUp') n += 1;
      }
      return n;
    }
    const denseFires = countFires(densePattern);
    const sparseFires = countFires(sparsePattern);
    // Density bias of +0.5 scales rule weight ~1-1.75× for dense vs
    // ~0.25-1× for sparse. Allow a small margin for rule competition.
    expect(denseFires).toBeGreaterThan(sparseFires);
  });
  it('Jammy persona (-density) fires more during sparse passages', () => {
    const denseDrums = makeChannel('d', 64, Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [i, 24]),
    ));
    const sparseDrums = makeChannel('d', 64, { 0: 24, 8: 24 });
    const densePattern = makePattern([denseDrums]);
    const sparsePattern = makePattern([sparseDrums]);
    function countFires(pattern: Pattern): number {
      const rng = seededRng(2222);
      let n = 0;
      for (let i = 0; i < 500; i++) {
        // bar 8 of 8 → tapeStop eligible; Jammy's signature move.
        const density = computeDensityByRole(pattern, 0, ['percussion'], 16);
        const result = chooseMove(baseCtx({
          bar: 7, barPos: 0.0, isNewBar: true, intensity: 0.8,
          persona: getPersona('jammy'),
          channelCount: 1, roles: ['percussion'],
          currentPattern: pattern, currentRow: 0,
          densityByRole: density,
        }), rng);
        if (result?.moveId === 'tapeStop') n += 1;
      }
      return n;
    }
    const denseFires = countFires(densePattern);
    const sparseFires = countFires(sparsePattern);
    expect(sparseFires).toBeGreaterThan(denseFires);
  });
  it('neutral persona (densityBias=0) is unaffected by density', () => {
    // Tubby has no densityBias — dense vs sparse should produce similar
    // fire counts (allow ±20% variance for RNG).
    const denseDrums = makeChannel('d', 64, Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [i, 24]),
    ));
    const sparseDrums = makeChannel('d', 64, { 0: 24, 8: 24 });
    const densePattern = makePattern([denseDrums]);
    const sparsePattern = makePattern([sparseDrums]);
    function countFires(pattern: Pattern): number {
      const rng = seededRng(333);
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const density = computeDensityByRole(pattern, 0, ['percussion'], 16);
        const result = chooseMove(baseCtx({
          bar: 3, barPos: 0.0, isNewBar: true, intensity: 0.8,
          persona: getPersona('tubby'),
          channelCount: 1, roles: ['percussion'],
          currentPattern: pattern, currentRow: 0,
          densityByRole: density,
        }), rng);
        if (result?.moveId === 'echoThrow') n += 1;
      }
      return n;
    }
    const denseFires = countFires(densePattern);
    const sparseFires = countFires(sparsePattern);
    const ratio = denseFires > sparseFires
      ? sparseFires / Math.max(1, denseFires)
      : denseFires / Math.max(1, sparseFires);
    expect(ratio).toBeGreaterThan(0.6); // within ~40% of each other
  });
});
