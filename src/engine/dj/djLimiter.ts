/**
 * The DJ path's safety limiters (per deck, and the mixer's): one definition.
 * They only catch overs - a deck at its tracker level stays below them.
 */

/** Per-deck brick-wall threshold, dBFS. */
export const DECK_LIMITER_THRESHOLD_DB = -3;
