/**
 * The one phase-verification rule of the juggle layer (owner plan section 16:
 * align, establish the bar phase, VERIFY, then permit). Every place that asks
 * "is this deck in bar phase with the other one" asks it here: the ladder's
 * gate before the incoming is first heard (juggleController), a double's
 * layer (juggleExecutor's governor) and the stand-alone double's setup
 * (standaloneJuggle).
 */
import type { JuggleActionSink } from './juggleExecutor';

/** A deck's heard bar phase counts as verified within this of the other deck's (owner plan section 16; the P4 criteria's 5 ms). */
export const PHASE_VERIFIED_SEC = 0.005;

/**
 * Why `deck` is not verified in bar phase with the other deck (the sink's
 * measured heard error against PHASE_VERIFIED_SEC), or null when it is - or
 * when the sink cannot measure at all (a test sink without a grid).
 */
export function phaseUnverified(sink: Pick<JuggleActionSink, 'phaseError'>, deck: 'A' | 'B'): string | null {
  if (!sink.phaseError) return null;
  const err = sink.phaseError(deck);
  if (err === null) return `deck ${deck} phase cannot be measured`;
  return Math.abs(err) <= PHASE_VERIFIED_SEC ? null : `deck ${deck} ${(err * 1000).toFixed(1)} ms off the other deck's bars`;
}
