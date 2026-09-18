/**
 * Gate N1 — the deterministic offline performance simulator.
 *
 * Tuning a performer by listening to it is slow, unrepeatable, and impossible
 * to diff: the song moves, the persona rolls differently, and "it felt busier
 * that time" is not a measurement. This runs the SAME decision cycle the live
 * tick runs — `runPerformanceCycle`, not a copy of it — over a described
 * project, with a seeded RNG, and returns a bar-by-bar log.
 *
 * What it does NOT simulate: audio. There is no DSP here, so wet energy is
 * accounted from the Gate G ledger rather than measured, and a consequence is
 * whatever the caller chooses to model. The log therefore answers questions
 * about DECISIONS — does it rest, does it aim at the right channel, does it
 * build toward the phrase edge, does it repeat itself — and cannot answer
 * whether the result sounds good. Gate O2 exists because nothing here can
 * replace a person listening.
 */

import { PerformanceMemory } from './performanceContext';
import { IntentionPlanner, type IntentionDecision } from './intention';
import { runPerformanceCycle } from './performanceCycle';
import type { PerformanceState } from './performanceState';
import type { ChannelEventSource } from './musicalEvents';
import type { MusicalChannelProfile } from './musicalChannelProfile';
import type { MusicalClockSettings } from './musicalClock';
import { computeMusicalPosition } from './musicalClock';
import { EnergyLedger, DEFAULT_ENERGY_BUDGET, type EnergyBudget } from './moveEnergy';
import { behaviourFor, intentionPolicyFor, energyBudgetFor } from './personaBehaviour';
import { movesForIntention } from './moveIntentions';
import type { RepetitionVerdict } from './repetition';

export interface SimulationProject {
  /** One event source per channel — the notes the song plays. */
  sources: readonly ChannelEventSource[];
  channelProfiles?: ReadonlyMap<number, MusicalChannelProfile>;
  bpm: number;
  /** Tracker speed: ticks per row. */
  ticksPerRow: number;
  clockSettings?: Partial<MusicalClockSettings>;
}

export interface SimulationOptions {
  persona: string;
  /** Seed for the RNG, so a run is reproducible. */
  seed: number;
  /** How long to run, in bars. */
  bars: number;
  /** Decisions per bar. The live tick runs at 250 ms; 8 is a close analogue
   *  at 120 BPM and keeps the log readable. */
  cyclesPerBar?: number;
  budget?: EnergyBudget;
}

/** One decision, with everything needed to explain it. */
export interface SimulationEntry {
  cycle: number;
  row: number;
  bar: number;
  barInPhrase: number;
  positionInBar: number;
  state: PerformanceState;
  intention: IntentionDecision['intention'];
  targetChannel: number | null;
  reason: string;
  fired: string | null;
  /** Energy in the air at the moment of the decision. */
  wet: number;
  feedback: number;
  surprise: boolean;
  repetition: RepetitionVerdict['kind'];
}

export interface SimulationResult {
  entries: SimulationEntry[];
  /** Totals, for assertions and for comparing two runs at a glance. */
  summary: {
    cycles: number;
    fires: number;
    restCycles: number;
    /** Longest unbroken run of cycles with no fire, in bars. */
    longestRestBars: number;
    /** Fires per move id. */
    moveCounts: Record<string, number>;
    /** Fires per target channel. */
    targetCounts: Record<number, number>;
    intentionCounts: Record<string, number>;
    peakWet: number;
    peakFeedback: number;
    /** Wet energy at the very end — a proxy for accumulation. */
    finalWet: number;
  };
}

/** Deterministic RNG. Same seed, same run, on any machine. */
export function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    // xorshift32: cheap, and its sequence does not depend on floating point.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * Run the performer over a project.
 *
 * Move CHOICE is simplified: the simulator picks the first move that serves
 * the intention and that the energy ledger admits, rather than running the
 * rule table's weighted roll. The rule table needs a live tick context, and
 * the questions this environment answers — when does it act, what does it aim
 * at, how much energy accumulates, does it rest — do not depend on which of
 * several eligible moves won a weighted draw. The log records the move it
 * chose so that assumption stays visible.
 */
export function simulatePerformance(
  project: SimulationProject,
  options: SimulationOptions,
): SimulationResult {
  const behaviour = behaviourFor(options.persona);
  const memory = new PerformanceMemory();
  const planner = new IntentionPlanner(intentionPolicyFor(behaviour));
  const ledger = new EnergyLedger();
  const budget = options.budget ?? energyBudgetFor(behaviour) ?? DEFAULT_ENERGY_BUDGET;
  const rng = seededRng(options.seed);
  planner.setRng(rng);

  const cyclesPerBar = options.cyclesPerBar ?? 8;
  const grid = computeMusicalPosition(0, project.ticksPerRow, project.clockSettings);
  const rowsPerCycle = grid.rowsPerBar / cyclesPerBar;
  const secondsPerRow = (60 / Math.max(30, project.bpm)) * (project.ticksPerRow / 24);

  let state: PerformanceState = 'LISTEN';
  const entries: SimulationEntry[] = [];
  const moveCounts: Record<string, number> = {};
  const targetCounts: Record<number, number> = {};
  const intentionCounts: Record<string, number> = {};
  let fires = 0;
  let restCycles = 0;
  let peakWet = 0;
  let peakFeedback = 0;
  let longestRestCycles = 0;
  let currentRestCycles = 0;

  /** Gestures in flight, with the row each should release at. */
  const inFlight: Array<{ id: string; releaseRow: number; moveId: string }> = [];
  let nextGestureId = 0;

  const totalCycles = Math.max(1, Math.round(options.bars * cyclesPerBar));

  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const row = cycle * rowsPerCycle;
    const nowSec = row * secondsPerRow;

    // Release anything whose hold has run out, before deciding anything new.
    for (let i = inFlight.length - 1; i >= 0; i--) {
      if (inFlight[i].releaseRow > row) continue;
      const done = inFlight[i];
      ledger.release(done.id, nowSec);
      memory.noteRelease({ invocationId: done.id, row, timeSec: nowSec });
      inFlight.splice(i, 1);
    }

    const energyNow = ledger.read(nowSec);
    const result = runPerformanceCycle(memory, planner, {
      row,
      ticksPerRow: project.ticksPerRow,
      bpm: project.bpm,
      clockSettings: project.clockSettings,
      sources: project.sources,
      channelProfiles: project.channelProfiles,
      // `EnergyState` is a 0..1 READING of what is in the air — the live
      // system fills it from the bus settings, which are bounded by
      // definition. The ledger's numbers are COSTS, and several layered moves
      // legitimately sum past 1. Handing a raw sum to the cycle would make the
      // safety ceiling mean something different here than it does in the
      // product, which is precisely the drift this shared cycle exists to
      // prevent. The budget still compares against the raw sums.
      energy: {
        wet: Math.min(1, energyNow.wet),
        feedback: Math.min(1, energyNow.feedback),
        spectralDensity: null,
        gesturesInFlight: inFlight.length,
      },
      state,
      gesturesInFlight: inFlight.length,
      canFire: true,
      rowsPerCycle,
      behaviour,
      rng,
    });
    state = result.state;

    let fired: string | null = null;

    if (result.step.shouldRelease) {
      for (const gesture of inFlight) {
        ledger.release(gesture.id, nowSec);
        memory.noteRelease({ invocationId: gesture.id, row, timeSec: nowSec });
      }
      inFlight.length = 0;
    }

    if (result.step.shouldFire) {
      const moveId = chooseSimulatedMove(
        result.decision.intention, ledger, nowSec, budget,
        result.repetitionWeightFor, result.barredFor, rng,
      );
      if (moveId) {
        const id = `sim${nextGestureId++}`;
        const holdRows = grid.rowsPerBar * Math.max(0.25, result.decision.holdBars);
        ledger.add(id, moveId, nowSec, true);
        memory.noteFire({
          invocationId: id,
          moveId,
          channelId: result.decision.target.channelId,
          row,
          timeSec: nowSec,
          source: 'live',
          origin: 'ai',
          isHold: true,
        });
        inFlight.push({ id, releaseRow: row + holdRows, moveId });
        fired = moveId;
        fires++;
        moveCounts[moveId] = (moveCounts[moveId] ?? 0) + 1;
        const channel = result.decision.target.channelId;
        if (channel !== undefined) targetCounts[channel] = (targetCounts[channel] ?? 0) + 1;
      }
    }

    if (fired) {
      currentRestCycles = 0;
    } else {
      restCycles++;
      currentRestCycles++;
      longestRestCycles = Math.max(longestRestCycles, currentRestCycles);
    }

    const intention = result.decision.intention;
    intentionCounts[intention] = (intentionCounts[intention] ?? 0) + 1;
    peakWet = Math.max(peakWet, energyNow.wet);
    peakFeedback = Math.max(peakFeedback, energyNow.feedback);

    entries.push({
      cycle,
      row,
      bar: Math.floor(result.context.position.bar),
      barInPhrase: Math.floor(result.context.position.barInPhrase),
      positionInBar: result.context.position.positionInBar,
      state: result.step.state,
      intention,
      targetChannel: result.decision.target.channelId ?? null,
      reason: result.decision.reason,
      fired,
      wet: energyNow.wet,
      feedback: energyNow.feedback,
      surprise: result.surprise.allowed,
      repetition: result.repetition.kind,
    });
  }

  const finalSec = totalCycles * rowsPerCycle * secondsPerRow;
  return {
    entries,
    summary: {
      cycles: totalCycles,
      fires,
      restCycles,
      longestRestBars: longestRestCycles / cyclesPerBar,
      moveCounts,
      targetCounts,
      intentionCounts,
      peakWet,
      peakFeedback,
      finalWet: ledger.read(finalSec).wet,
    },
  };
}

/**
 * Pick a move for an intention, respecting the energy ledger.
 *
 * Deterministic on purpose: given the same intention and the same energy, the
 * same move. The live rule table's weighted roll is a different question and
 * needs a tick context this environment does not have.
 */
/**
 * Pick a move the way the live performer picks one: a weighted roll.
 *
 * This used to sort by repetition weight and take the first admissible
 * candidate — a deterministic argmax that never touched the RNG. Two things
 * followed, and both were measured on 2026-09-18 before being fixed:
 *
 *   - **The seed did nothing.** Runs at seed 1234 and seed 99 were byte
 *     identical, first differing cycle: none. So N4's thirty minutes proved
 *     ONE trajectory rather than a sampled space, while reading as though a
 *     seed had explored something.
 *   - **Only 6 of the 44 registered moves could ever fire.** The same highest
 *     weighted admissible candidate won its intention every time, and ties
 *     broke on array order, so most of the library was unreachable. Which is
 *     also why "measure the siren with the simulator" could never have said
 *     anything about X14: `dubSiren` never fired here at all.
 *
 * That is precisely the divergence Gate N1 exists to prevent — "a simulator
 * with its own copy would tune a second performer that merely resembles the
 * real one". The decision CHAIN was shared; the choice at the end of it was
 * not. `AutoDub` rolls `rng() * totalWeight` and walks the cumulative weights,
 * so this does the same.
 */
function chooseSimulatedMove(
  intention: IntentionDecision['intention'],
  ledger: EnergyLedger,
  nowSec: number,
  budget: EnergyBudget,
  repetitionWeightFor: (moveId: string) => number,
  barredFor: (moveId: string) => boolean,
  rng: () => number,
): string | null {
  const eligible = movesForIntention(intention)
    .filter(id => !barredFor(id))
    .filter(id => ledger.admits(id, nowSec, budget).ok)
    .map(id => ({ id, weight: Math.max(0, repetitionWeightFor(id)) }))
    .filter(e => e.weight > 0);
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * totalWeight;
  for (const e of eligible) {
    if (roll < e.weight) return e.id;
    roll -= e.weight;
  }
  // Floating-point drift only; the roll is bounded by the total.
  return eligible[eligible.length - 1].id;
}

/** Render a log as text — for eyeballing a run or diffing two. */
export function formatSimulation(result: SimulationResult, limit = 64): string {
  const lines = result.entries.slice(0, limit).map(e =>
    `bar ${String(e.bar).padStart(3)}.${e.barInPhrase.toString().padStart(2)} ` +
    `${e.state.padEnd(10)} ${e.intention.padEnd(10)} ` +
    `${e.targetChannel === null ? ' -' : `ch${e.targetChannel}`} ` +
    `${(e.fired ?? '·').padEnd(18)} wet ${e.wet.toFixed(2)} fb ${e.feedback.toFixed(2)}  ${e.reason}`,
  );
  const s = result.summary;
  lines.push(
    '',
    `${s.fires} fires in ${s.cycles} cycles, longest rest ${s.longestRestBars.toFixed(1)} bars, ` +
    `peak wet ${s.peakWet.toFixed(2)}, peak feedback ${s.peakFeedback.toFixed(2)}, ` +
    `final wet ${s.finalWet.toFixed(2)}`,
  );
  return lines.join('\n');
}
