/**
 * Is a channel send feeding the bus with anything a listener would hear?
 *
 * Two different questions were asked of one number. "Is any send non-zero"
 * decides whether the ALL / NONE button reads ALL or NONE, and whether the
 * echo should drain when the last send closes — and for those, any non-zero
 * value is a send. "Is the bus fed enough for a return processor to be
 * heard" decides whether Wide, Ring, Liquid and the rest are dimmed and the
 * "raise a CH send to hear" hint shows — and for that, the BLEED floor is
 * not a send.
 *
 * BLEED seeds every closed channel to `GHOST_SEND_FLOOR`, -36 dB, so muted
 * channels whisper through the return. Counted as "a send is open", it
 * silenced the hint: with BLEED on and nothing else, the processors looked
 * live, ran on near-silence (busInput 0.0077, 2026-09-23), and read as dead
 * with no word about why.
 */

/** The send level BLEED floors a closed channel to. ~-36 dB. */
export const GHOST_SEND_FLOOR = 0.015;

/**
 * Anything at or under the floor is the bleed, not a performer's send. A hair
 * above the floor allows for the float the store writes.
 */
export const AUDIBLE_SEND_MIN = GHOST_SEND_FLOOR + 0.001;

export function sendIsAudible(dubSend: number | undefined | null): boolean {
  return (dubSend ?? 0) >= AUDIBLE_SEND_MIN;
}

/** True when at least one of the given sends would feed a return processor. */
export function anySendAudible(sends: ReadonlyArray<number | undefined | null>): boolean {
  return sends.some(sendIsAudible);
}
