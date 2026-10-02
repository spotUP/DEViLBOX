/**
 * Extra wet-chain gain while a return processor is held (+6 dB).
 *
 * Wide, Wobble, Liquid, Sweep, Ring, Starve and Ping-Pong reshape the wet
 * return; they open no send. At Auto Dub's resting sends (0.1-0.2, kept low so
 * throws stand out against the wash) the return sat 30-40 dB under the music,
 * so every one of them changed a signal nobody could hear — "no change at all
 * when pressed", on this branch and the one before it (2026-10-02).
 *
 * Applied after the chain (`DubBus.wetLift`), not at the bus input: the siren
 * feedback loop re-enters at the input, and lifting there would multiply its
 * loop gain.
 *
 * +12 dB (4) made the toggles fire but "way too strong" (owner, 2026-10-02);
 * halved to +6 dB.
 */
export const WET_GESTURE_LIFT = 2;
