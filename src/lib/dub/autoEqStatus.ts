/**
 * What the EQ tab's Auto EQ line says.
 *
 * It said "no analysis" for every state that was not capturing, analysing
 * or failed - including a finished analysis the bus had not applied because
 * it was off at the time (owner, 2026-10-04: "why does auto eq say no
 * analyzis? broken?", ledger L25). The line names the state the analysis
 * store is in and what, if anything, the performer must do.
 */
import type { AnalysisState } from '@/stores/useTrackerAnalysisStore';

export interface AutoEqStatusInput {
  /** The genre the bus last applied, '' when none. */
  genre: string;
  /** Auto EQ strength 0..1. */
  strength: number;
  analysisState: AnalysisState;
  error: string | null;
  busEnabled: boolean;
}

export interface AutoEqStatus { text: string; title: string }

export function autoEqStatus(i: AutoEqStatusInput): AutoEqStatus {
  const pct = Math.round(i.strength * 100);
  if (i.genre) return { text: `${i.genre} · ${pct}%`, title: `Genre baseline from the last analysis, at ${pct}% strength` };
  switch (i.analysisState) {
    case 'capturing': return { text: 'capturing…', title: 'Recording audio to analyse' };
    case 'analyzing': return { text: 'analyzing…', title: 'Classifying the captured audio' };
    case 'error': return { text: 'analysis failed', title: i.error ?? 'The analysis did not complete' };
    case 'ready':
      return i.busEnabled
        ? { text: 'ready, applying…', title: 'The analysis is in; the genre baseline is being applied' }
        : { text: 'ready — bus off', title: 'The analysis is in; switch the dub bus on to apply its genre baseline' };
    default:
      return {
        text: 'no analysis',
        title: 'No genre baseline yet. The analysis captures the song while it PLAYS in the tracker view '
          + '(from about a quarter in); play it there and this fills in. The live improv EQ works without it.',
      };
  }
}
