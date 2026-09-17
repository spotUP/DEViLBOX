/**
 * skankFloatThrow — the 3:2 polyrhythmic variant of the skank throw.
 *
 * Same gesture as `skankEchoThrow` — catch one stab, send it hard, get out —
 * but the echo is set to a dotted QUARTER (1.5 beats) instead of a dotted
 * eighth. Against a quarter-note pulse that is a 3:2 relationship, so the
 * repeats drift across the grid and the echo sounds like it is floating at
 * two-thirds of the tune's tempo rather than locking to the offbeat.
 *
 * At 120 BPM:
 *   quarter         500 ms
 *   dotted eighth   375 ms   ← skankEchoThrow, the classic reggae skank delay
 *   dotted quarter  750 ms   ← this move, the floating 3:2 colour
 *
 * This timing was the original behaviour of `skankEchoThrow`. It is a real
 * and useful dub sound, just not the default reading of "skank echo", so it
 * was split into its own move on 2026-09-17 rather than discarded — the two
 * are musically different gestures and the performer should be able to reach
 * for either, weight them separately per persona, and see which one it
 * played back in a recorded lane.
 *
 * Persona tendency: Perry and Mad Professor reach for the float readily
 * (both already run triplet and asymmetric echo timings); Tubby, Scientist
 * and Jammy stay mostly on the dotted eighth. Weighting only — every persona
 * can reach both.
 */

import { makeSkankThrow } from './skankEchoThrow';

/** Dotted quarter (1.5 beats) — floating 3:2 echo against the pulse. */
export const skankFloatThrow = makeSkankThrow('skankFloatThrow', 1.5);
