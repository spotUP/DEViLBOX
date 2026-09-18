/**
 * One decision cycle of the performer, as a pure function.
 *
 * This is the chain the live tick runs — context, intention, state machine,
 * variance, repetition — with nothing in it that needs a store, an engine or a
 * clock. The live `AutoDub` tick calls it, and so does the offline simulator
 * (Gate N1).
 *
 * That sharing is the point. A simulator that re-implemented the chain would
 * be tuning a second performer that merely resembles the real one, and the two
 * would drift the first time either was touched — which makes the simulator
 * worse than useless, because its results would look authoritative.
 *
 * What stays OUTSIDE: firing, holding, releasing, measuring consequences,
 * anything with a side effect. Those belong to the caller, because the live
 * tick does them to the audio graph and the simulator only records that they
 * were asked for.
 */

import type { ChannelEventSource } from './musicalEvents';
import type { MusicalChannelProfile } from './musicalChannelProfile';
import type { MusicalClockSettings } from './musicalClock';
import {
  buildPerformanceContext,
  type ArrangementSnapshot,
  type EnergyState,
  type PerformanceContext,
  type PerformanceMemory,
} from './performanceContext';
import type { IntentionDecision, IntentionPlanner } from './intention';
import {
  nextPerformanceState,
  defaultLeadRows,
  type PerformanceState,
  type PerformanceStep,
} from './performanceState';
import { allowSurprise, varianceInputsFrom, type VarianceVerdict } from './contextualVariance';
import {
  classifyRepetition,
  repetitionWeight,
  atMotifPosition,
  type RepetitionVerdict,
} from './repetition';
import { pickTarget } from './musicalTargeting';
import type { PersonaBehaviour } from './personaBehaviour';

export interface PerformanceCycleInput {
  /** Absolute row the transport is on. */
  row: number;
  ticksPerRow: number;
  bpm: number;
  clockSettings?: Partial<MusicalClockSettings>;
  sources: readonly ChannelEventSource[];
  channelProfiles?: ReadonlyMap<number, MusicalChannelProfile>;
  arrangement?: ArrangementSnapshot | null;
  energy: EnergyState;
  /** Where the performer was at the end of the previous cycle. */
  state: PerformanceState;
  /** Gestures the caller currently has in flight. */
  gesturesInFlight: number;
  /** False when budgets, cooldowns or the caller's own rules forbid firing. */
  canFire: boolean;
  behaviour: PersonaBehaviour;
  /** Injected so a cycle is reproducible from a seed. */
  rng: () => number;
}

export interface PerformanceCycleResult {
  context: PerformanceContext;
  decision: IntentionDecision;
  step: PerformanceStep;
  surprise: VarianceVerdict;
  repetition: RepetitionVerdict;
  /** Weight multiplier per move from the repetition verdict. */
  repetitionWeightFor: (moveId: string) => number;
  /** Where the performer now is. The caller stores it for the next cycle. */
  state: PerformanceState;
}

/**
 * Run one cycle.
 *
 * The planner and the memory are passed in rather than created here: they
 * carry commitments across cycles (a REST that lasts four bars, a phrase
 * history), and a cycle that made its own would forget everything each tick,
 * which is the behaviour Gate E exists to remove.
 */
export function runPerformanceCycle(
  memory: PerformanceMemory,
  planner: IntentionPlanner,
  input: PerformanceCycleInput,
): PerformanceCycleResult {
  const context = buildPerformanceContext(memory, {
    row: input.row,
    ticksPerRow: input.ticksPerRow,
    bpm: input.bpm,
    clockSettings: input.clockSettings,
    sources: input.sources,
    channelProfiles: input.channelProfiles,
    arrangement: input.arrangement,
    energy: input.energy,
  });

  memory.observePosition(context.position);

  let decision = planner.decide(context, input.sources);

  // Gate H: when the music did not point at a channel, choose one for what the
  // move is FOR rather than leaving the rule table to pick at random.
  if (decision.target.kind !== 'channel' && input.channelProfiles) {
    const target = pickTarget(decision.intention, input.channelProfiles);
    if (target) {
      decision = {
        ...decision,
        target: { kind: 'channel', channelId: target.channelId, reason: target.reason },
      };
    }
  }

  memory.setIntention(decision.intention, decision.target);

  const step = nextPerformanceState(input.state, {
    intention: decision.intention,
    targetRow: decision.targetRow ?? null,
    row: context.row,
    leadRows: defaultLeadRows(context.position.rowsPerBeat),
    gesturesInFlight: input.gesturesInFlight,
    // The caller's own timers own hold expiry; reporting it here as well would
    // release twice.
    holdExpired: false,
    energyCritical: decision.intention === 'RESET',
    canFire: input.canFire,
  });

  const surprise = allowSurprise(varianceInputsFrom(context), input.behaviour, input.rng);

  const repetition = classifyRepetition(context.recentMoves, {
    rowsPerBar: context.position.rowsPerBar,
    rowsPerPhrase: context.position.rowsPerPhrase,
  });
  const motifRow = repetition.kind === 'motif'
    ? context.recentMoves.filter(m => m.moveId === repetition.moveId).at(-1)?.row ?? null
    : null;
  const atMotif = motifRow !== null && atMotifPosition(
    context.row,
    motifRow,
    context.position.rowsPerPhrase,
    context.position.rowsPerBar,
  );

  return {
    context,
    decision,
    step,
    surprise,
    repetition,
    repetitionWeightFor: (moveId: string) =>
      repetitionWeight(moveId, repetition, input.behaviour.novelty, atMotif),
    state: step.state,
  };
}
