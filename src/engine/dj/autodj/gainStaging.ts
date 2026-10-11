/**
 * Gain staging (plan section 22): deck trims, overlap compensation, EQ boost
 * cap, FX return level and the loudness monitors the executor reports.
 *
 * Pure. Reuses the pipeline's deck trim policy (tracker level: 0 dB), capped by the master ceiling.
 */
import { computeAutoTrim } from '../DJPipeline';
import type { BassOwner, DJTrackAnalysis, GainPlan } from './types';

export interface GainInput {
  outgoing: DJTrackAnalysis | null;
  incoming: DJTrackAnalysis | null;
  /** Bass ownership schedule: SHARED bars accumulate low end. */
  sharedBars: number;
  durationBars: number;
  /** FX return (echo/reverb) wet level requested by the effects, 0..1. */
  fxAmount: number;
  /** Equal-power crossfades sum to 0 dB at the centre; linear sums to +6 dB. */
  law: 'equal-power' | 'linear' | 'cut';
}

export const MASTER_CEILING_DB = -1;
export const EQ_BOOST_CAP_DB = 3;

/** The deck's auto-gain trim, capped so the track's true peak stays under the master ceiling. */
function trimFor(a: DJTrackAnalysis | null): number {
  if (!a) return 0;
  const wanted = computeAutoTrim(a.loudness.integratedDb, a.loudness.peakDb);
  const headroom = MASTER_CEILING_DB - a.loudness.truePeakDb;
  return Math.min(wanted, headroom);
}

export function planGain(input: GainInput): GainPlan {
  const outTrim = trimFor(input.outgoing);
  const inTrim = trimFor(input.incoming);
  const outLoud = input.outgoing ? input.outgoing.loudness.integratedDb + outTrim : -14;
  const inLoud = input.incoming ? input.incoming.loudness.integratedDb + inTrim : -14;
  // Two correlated low ends add up to +6 dB; uncorrelated +3 dB. Shared bass
  // bars get pulled down by the accumulation estimate, the rest by the law.
  const lawBoost = input.law === 'linear' ? 3 : 0;
  const bassSum = (input.outgoing?.bass.level ?? 0.5) + (input.incoming?.bass.level ?? 0.5);
  const lowFrequencyAccumulation = Math.max(0, Math.min(1, (bassSum - 0.8) / 1.2));
  const sharedFraction = input.durationBars > 0 ? input.sharedBars / input.durationBars : 0;
  const overlapCompensationDb = -(lawBoost + lowFrequencyAccumulation * 3 * (0.5 + 0.5 * sharedFraction));
  const fxReturnDb = -6 - 6 * (1 - input.fxAmount);
  const outTrue = input.outgoing ? input.outgoing.loudness.truePeakDb + outTrim : -3;
  const inTrue = input.incoming ? input.incoming.loudness.truePeakDb + inTrim : -3;
  const truePeakDb = Math.max(outTrue, inTrue) + lawBoost + overlapCompensationDb;
  const integratedDb = 10 * Math.log10(Math.pow(10, outLoud / 10) + Math.pow(10, inLoud / 10)) / 2 + overlapCompensationDb;
  const shortTermDb = Math.max(outLoud, inLoud) + lawBoost + overlapCompensationDb;
  return {
    incomingTrimDb: inTrim,
    outgoingTrimDb: outTrim,
    overlapCompensationDb,
    eqBoostCapDb: EQ_BOOST_CAP_DB,
    fxReturnDb,
    masterCeilingDb: MASTER_CEILING_DB,
    monitor: { integratedDb, shortTermDb, truePeakDb, lowFrequencyAccumulation },
  };
}

/** Bars during which both basses are in the mix, from an ownership schedule. */
export function sharedBarsOf(schedule: Array<{ bar: number; owner: BassOwner }>, durationBars: number): number {
  let shared = 0;
  for (let i = 0; i < schedule.length; i++) {
    const end = i + 1 < schedule.length ? schedule[i + 1].bar : durationBars;
    if (schedule[i].owner === 'SHARED') shared += Math.max(0, end - schedule[i].bar);
  }
  return shared;
}
