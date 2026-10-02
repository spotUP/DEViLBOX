/**
 * Gain the send-fed wet chain needs before it reaches `return_`.
 *
 * The bus is fed only by channel sends (the whole-mix fallback is silenced on
 * an isolation-capable engine), and a send is a fraction of one channel, so
 * the chain arrives far under the programme it is mixed against. Measured
 * 2026-10-01 with four sends at 0.2123: a return of 0.75 sat -24.8 dB under
 * the master and every wet move was inaudible; the owner heard Liquid, Echo
 * and Spring properly at an effective return of 3.0 against the default 0.85.
 *
 * That level was first reached by raising `returnGain` itself to 3.0, which
 * broke two things: the Return knob, its MIDI CC and the NKS map all span
 * 0..1, so the first touch dropped the return ~10 dB; and every generated
 * layer that joins `return_` (siren, crack, thump, reverse, the bass
 * generators) was lifted +11 dB above the programme-referenced peak it is
 * calibrated to. The make-up belongs here instead, on the send-fed paths only,
 * so the knob keeps its range and the generators keep their level.
 */
export const WET_CHAIN_MAKEUP = 3.0 / 0.85;
