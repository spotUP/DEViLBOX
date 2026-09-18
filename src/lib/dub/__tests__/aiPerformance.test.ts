/**
 * Gate N2 — AI performance tests.
 *
 * Eight named behaviours the performer must exhibit: REST, TARGET, PREDICTION,
 * WET-ENERGY, CONSEQUENCE, DROP, SEEK, PERSONA.
 *
 * These are not unit tests of a function; each asserts something a listener
 * could notice. They run the real decision cycle through the Gate N1
 * simulator, so a regression here means the PERFORMER changed, not that a
 * helper was renamed.
 */

import { describe, it, expect } from 'vitest';
import { simulatePerformance, type SimulationProject } from '../simulator';
import { buildMusicalChannelProfile } from '../musicalChannelProfile';
import { PerformanceMemory, buildPerformanceContext, readWetEnergy } from '../performanceContext';
import { IntentionPlanner } from '../intention';
import { runPerformanceCycle } from '../performanceCycle';
import { behaviourFor, intentionPolicyFor, energyBudgetFor } from '../personaBehaviour';
import { EnergyLedger } from '../moveEnergy';
import { measureConsequence, consequenceWeight, type MixReading } from '../consequence';
import { planDrop, droppedChannels } from '../arrangementIntelligence';

const ROWS_PER_BAR = 16;

function bars(offsets: number[], count = 64) {
  const out: { row: number }[] = [];
  for (let bar = 0; bar < count; bar++) for (const o of offsets) out.push({ row: bar * ROWS_PER_BAR + o });
  return out;
}

/** A four-channel roots riddim: kick, snare, bass, skank. */
function riddim(): SimulationProject {
  return {
    bpm: 140,
    ticksPerRow: 6,
    sources: [
      { channel: 0, onsets: bars([0, 8]) },
      { channel: 1, onsets: bars([4, 12]) },
      { channel: 2, onsets: bars([2, 10]) },
      { channel: 3, onsets: bars([6, 14]) },
    ],
    channelProfiles: new Map([
      [0, { ...buildMusicalChannelProfile({ channel: 0 }, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }), importance: 0.8, audibility: 0.9, density: 0.5, repetition: 0.9 }],
      [1, { ...buildMusicalChannelProfile({ channel: 1 }, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }), importance: 0.6, audibility: 0.85, density: 0.4, repetition: 0.9 }],
      [2, { ...buildMusicalChannelProfile({ channel: 2 }, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }), importance: 0.9, audibility: 0.9, density: 0.4, repetition: 0.8 }],
      [3, { ...buildMusicalChannelProfile({ channel: 3 }, { instrumentFamily: 'guitar', musicalFunction: 'harmony', rhythmicRole: 'offbeat' }), importance: 0.4, audibility: 0.7, density: 0.4, repetition: 0.7 }],
    ]),
  };
}

// ─────────────────────────────── REST ────────────────────────────────────

describe('N2 REST — silence is chosen, not left over', () => {
  it('commits to rest and stays committed across several cycles', () => {
    const r = simulatePerformance(riddim(), { persona: 'tubby', seed: 4, bars: 96 });
    const restRuns: number[] = [];
    let run = 0;
    for (const e of r.entries) {
      if (e.intention === 'REST') { run++; } else if (run > 0) { restRuns.push(run); run = 0; }
    }
    if (run > 0) restRuns.push(run);
    expect(restRuns.length).toBeGreaterThan(0);
    // A rest that lasts one tick is a gap, not a decision.
    expect(Math.max(...restRuns)).toBeGreaterThan(4);
  });

  it('leaves the music alone for a real span, not just between moves', () => {
    const r = simulatePerformance(riddim(), { persona: 'jammy', seed: 9, bars: 96 });
    expect(r.summary.longestRestBars).toBeGreaterThan(2);
  });

  it('still plays — resting is not doing nothing for ever', () => {
    const r = simulatePerformance(riddim(), { persona: 'jammy', seed: 9, bars: 96 });
    expect(r.summary.fires).toBeGreaterThan(5);
  });
});

// ────────────────────────────── TARGET ───────────────────────────────────

describe('N2 TARGET — it aims at something, for a reason', () => {
  it('records a reason for every decision it makes', () => {
    const r = simulatePerformance(riddim(), { persona: 'scientist', seed: 2, bars: 32 });
    expect(r.entries.every(e => e.reason.length > 0)).toBe(true);
  });

  it('spreads its attention across the arrangement rather than one channel', () => {
    const r = simulatePerformance(riddim(), { persona: 'tubby', seed: 4, bars: 96 });
    const channels = Object.keys(r.summary.targetCounts);
    expect(channels.length).toBeGreaterThan(1);
  });

  it('never aims a DROP at the foundation', () => {
    for (const persona of ['jammy', 'tubby', 'perry']) {
      const r = simulatePerformance(riddim(), { persona, seed: 6, bars: 64 });
      const drops = r.entries.filter(e => e.intention === 'DROP' && e.fired);
      for (const d of drops) expect(d.targetChannel, persona).not.toBe(2);
    }
  });
});

// ──────────────────────────── PREDICTION ─────────────────────────────────

describe('N2 PREDICTION — it acts on what is coming, not what has gone', () => {
  it('aims an accent at a row ahead of the one it is on', () => {
    const memory = new PerformanceMemory();
    const behaviour = behaviourFor('tubby');
    const planner = new IntentionPlanner(intentionPolicyFor(behaviour));
    const project = riddim();
    const result = runPerformanceCycle(memory, planner, {
      row: 1,
      ticksPerRow: 6,
      bpm: 140,
      sources: project.sources,
      channelProfiles: project.channelProfiles,
      energy: readWetEnergy({ returnGain: 0.2, echoWet: 0.2, springWet: 0, echoIntensity: 0.2, extFeedbackGain: 0 }, 0),
      state: 'LISTEN',
      gesturesInFlight: 0,
      canFire: true,
      rowsPerCycle: 2,
      behaviour,
      rng: () => 0.5,
    });
    if (result.decision.targetRow !== undefined) {
      expect(result.decision.targetRow).toBeGreaterThan(result.context.row);
    }
  });

  it('abandons a target that has already sounded rather than marking it late', () => {
    const r = simulatePerformance(riddim(), { persona: 'tubby', seed: 3, bars: 32 });
    const late = r.entries.filter(e => e.reason.includes('already sounded'));
    // It may notice one, but it must never FIRE on one.
    for (const e of late) expect(e.fired).toBeNull();
  });
});

// ─────────────────────────── WET-ENERGY ──────────────────────────────────

describe('N2 WET-ENERGY — it does not drown the mix', () => {
  it('keeps wet energy under control over a long run', () => {
    const r = simulatePerformance(riddim(), { persona: 'madProfessor', seed: 8, bars: 192 });
    expect(r.summary.peakWet).toBeLessThan(2);
  });

  it('does not accumulate — the end is no wetter than the peak', () => {
    const r = simulatePerformance(riddim(), { persona: 'perry', seed: 8, bars: 192 });
    expect(r.summary.finalWet).toBeLessThanOrEqual(r.summary.peakWet);
  });

  it('keeps accounted feedback inside the persona\'s own budget', () => {
    // The summary reports the ledger's raw COST sums, which can legitimately
    // pass 1 when moves layer — what must hold is that they stay inside the
    // budget the persona was given.
    for (const persona of ['scientist', 'perry', 'madProfessor']) {
      const r = simulatePerformance(riddim(), { persona, seed: 12, bars: 128 });
      const budget = energyBudgetFor(behaviourFor(persona));
      expect(r.summary.peakFeedback, persona).toBeLessThanOrEqual(budget.feedback);
      expect(r.summary.peakWet, persona).toBeLessThanOrEqual(budget.wet);
    }
  });
});

// ─────────────────────────── CONSEQUENCE ─────────────────────────────────

describe('N2 CONSEQUENCE — it notices when a move did nothing', () => {
  const flat = (over: Partial<MixReading> = {}): MixReading => ({
    rms: 0.2, sub: 0.2, bass: 0.3, mid: 0.3, high: 0.2,
    channelLevels: new Map([[1, 0.3]]), audibleChannels: 4, wet: 0.2, feedback: 0.3,
    ...over,
  });

  it('calls a move that changed nothing inaudible, and demotes it', () => {
    const c = measureConsequence(flat(), flat(), { targetChannel: 1 });
    expect(c.verdict).toBe('inaudible');
    expect(consequenceWeight(c)).toBeLessThan(0.5);
  });

  it('does not demote a move that worked', () => {
    const c = measureConsequence(flat(), flat({ rms: 0.45, channelLevels: new Map([[1, 0.7]]) }), { targetChannel: 1 });
    expect(c.verdict).toBe('effective');
    expect(consequenceWeight(c)).toBe(1);
  });

  it('does not reward success either — that is how one move takes over', () => {
    const good = measureConsequence(flat(), flat({ rms: 0.5 }));
    expect(consequenceWeight(good)).toBeLessThanOrEqual(1);
  });
});

// ────────────────────────────── DROP ─────────────────────────────────────

describe('N2 DROP — a drop leaves a riddim, not a silence', () => {
  const profiles = riddim().channelProfiles!;

  it('protects the foundation and the sub register', () => {
    const plans = planDrop(profiles);
    const bass = plans.find(p => p.channel === 2)!;
    expect(bass.behavior).toBe('protect');
  });

  it('always leaves something playing', () => {
    const plans = planDrop(profiles);
    expect(plans.some(p => p.behavior === 'protect')).toBe(true);
    expect(droppedChannels(plans).length).toBeLessThan(plans.length);
  });

  it('throws an audible part into the echo before muting it', () => {
    const taken = droppedChannels(planDrop(profiles));
    expect(taken.some(p => p.behavior === 'throwThenMute')).toBe(true);
  });
});

// ────────────────────────────── SEEK ─────────────────────────────────────

describe('N2 SEEK — a jump leaves nothing stale behind', () => {
  it('drops row-relative memory, because the distance would be a lie', () => {
    const memory = new PerformanceMemory();
    memory.noteFire({ invocationId: 'a', moveId: 'echoThrow', row: 900, timeSec: 30, source: 'live', origin: 'ai', isHold: true });
    memory.reset();
    expect(memory.rowsSinceLastAction(4)).toBe(Number.POSITIVE_INFINITY);
    expect(memory.getActiveGestures()).toHaveLength(0);
  });

  it('keeps what was actually played — a seek is not an amnesia', () => {
    const memory = new PerformanceMemory();
    memory.noteFire({ invocationId: 'a', moveId: 'echoThrow', row: 900, timeSec: 30, source: 'live', origin: 'ai', isHold: false });
    memory.reset();
    expect(memory.getRecentMoves()).toHaveLength(1);
  });

  it('drops a rest commitment, which belonged to bars that no longer apply', () => {
    const planner = new IntentionPlanner({ restBars: 4, restEveryPhrases: 1 });
    const memory = new PerformanceMemory();
    memory.observePosition({ phrase: 0 });
    memory.noteFire({ invocationId: 'a', moveId: 'echoThrow', row: 8, timeSec: 1, source: 'live', origin: 'ai', isHold: false });
    memory.observePosition({ phrase: 1 });
    const ctx = buildPerformanceContext(memory, {
      row: 256, ticksPerRow: 6, bpm: 140, sources: [],
      energy: readWetEnergy({ returnGain: 0.2, echoWet: 0.2, springWet: 0, echoIntensity: 0.2, extFeedbackGain: 0 }, 0),
    });
    planner.decide(ctx);
    expect(planner.isResting(16)).toBe(true);
    planner.reset();
    expect(planner.isResting(16)).toBe(false);
  });

  it('forgets energy that belonged to a passage it has left', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'springSlam', 0, true);
    expect(ledger.read(0).wet).toBeGreaterThan(0);
    ledger.clear();
    expect(ledger.read(0).wet).toBe(0);
  });
});

// ───────────────────────────── PERSONA ───────────────────────────────────

describe('N2 PERSONA — they are audibly different performers', () => {
  const project = riddim();

  it('produces a different performance per persona from the same seed and song', () => {
    const signatures = ['tubby', 'scientist', 'perry', 'madProfessor', 'jammy'].map(persona => {
      const r = simulatePerformance(project, { persona, seed: 21, bars: 64 });
      return JSON.stringify({ i: r.summary.intentionCounts, m: r.summary.moveCounts });
    });
    expect(new Set(signatures).size).toBeGreaterThan(1);
  });

  it('gives each persona its own rest length', () => {
    const jammy = intentionPolicyFor(behaviourFor('jammy'));
    const perry = intentionPolicyFor(behaviourFor('perry'));
    expect(jammy.restBars).not.toBe(perry.restBars);
  });

  it('keeps every persona inside the same safety limits', () => {
    for (const persona of ['tubby', 'scientist', 'perry', 'madProfessor', 'jammy']) {
      const r = simulatePerformance(project, { persona, seed: 31, bars: 96 });
      expect(r.summary.peakFeedback, persona).toBeLessThan(1);
      expect(r.summary.fires / r.summary.cycles, persona).toBeLessThan(0.25);
    }
  });
});
