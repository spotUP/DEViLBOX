/**
 * Dub bus types — canonical home. Originally embedded in types/drumpad.ts;
 * promoted to its own module during Phase 0 of the Tracker Dub Studio work.
 *
 * See: thoughts/shared/plans/2026-04-19-tracker-dub-studio-design.md
 */

/**
 * Dub action IDs — pad-fired "King Tubby moves" that route DJ deck audio
 * into the shared Dub Bus. Behaviors:
 *
 *   dub_throw_*     — momentary one-shot: press grabs a slice of the deck
 *                     into the echo, then releases on its own after ~1 beat.
 *                     Dry deck audio never mutes.
 *   dub_hold_*      — press-and-hold: deck audio feeds the bus while held,
 *                     closes on release. Longer captures.
 *   dub_mute_*      — "the drop": mutes dry deck + opens bus at full while
 *                     held. The classic King Tubby move.
 */
export type DubActionId =
  // ── Auto-select: resolves the currently-loudest playing deck at press ──
  // Primary layout. One pad per gesture regardless of which deck is playing —
  // the kit follows the DJ's crossfader automatically.
  | 'dub_throw' | 'dub_hold' | 'dub_mute'
  // Throw-length variants — different musical rhythmic feel
  | 'dub_slap_back'      // 0.125 beats — tiny accent grab
  | 'dub_throw_short'    // 0.25 beats  — quarter-beat chop
  | 'dub_throw_long'     // 2 beats     — big half-bar phrase grab
  // Combined "the drop" — simultaneous mute + filter sweep, the classic
  // King Tubby move where the mix drops out AND ducks tonally at once.
  | 'dub_combo_drop'
  // ── Broadcast: hit every playing deck at once ──
  | 'dub_throw_all' | 'dub_hold_all' | 'dub_mute_all'
  // ── Explicit targeting (retained for context-menu power users; not in
  //    the factory kit layout anymore since auto-select covers every case).
  | 'dub_throw_a' | 'dub_throw_b' | 'dub_throw_c'
  | 'dub_hold_a' | 'dub_hold_b' | 'dub_hold_c'
  | 'dub_mute_a' | 'dub_mute_b' | 'dub_mute_c'
  // ── Bus FX: no deck source needed ──
  | 'dub_siren'
  | 'dub_filter_drop';

/** Dub Bus — shared send FX for all drumpads. Settings apply engine-wide. */
export interface DubBusSettings {
  enabled: boolean;
  // Return gain for the whole bus (0-1). 1 = full wet.
  returnGain: number;
  // HPF cutoff on the bus input — rolls bass off the send so the echo/reverb
  // doesn't muddy the low end (classic dub trick). Default 180 Hz.
  hpfCutoff: number;
  // Spring reverb amount in the bus chain (0-1).
  springWet: number;
  // Space Echo intensity (feedback) — one shared delay, so this can run
  // higher than a per-pad chain could. 0-0.85 sensible range.
  echoIntensity: number;
  // Space Echo wet amount (0-1).
  echoWet: number;
  // Space Echo rate in ms (shorter = tighter repeats, longer = more spaced).
  echoRateMs: number;
  // Sidechain-style duck on the bus return. When loud input hits the bus,
  // the return briefly ducks so transients cut through the tail (the
  // "pumping dub" effect). 0 = no duck, 1 = full duck.
  sidechainAmount: number;
  // How much of a deck's audio is injected into the bus when a dub-action
  // pad fires (throw / hold / mute). 0-1; typical 0.85-1.0.
  deckTapAmount: number;
  // Throw duration in beats — how long the tap stays open for a
  // dub_throw_* action before it begins releasing. 0.5 = eighth note.
  throwBeats: number;
  // Siren feedback target (0-0.95) — how hot the self-oscillation runs
  // when a dub_siren pad is held. Above ~0.9 gets screaming.
  sirenFeedback: number;
  // Filter drop target in Hz — where the bus LPF drops to while a
  // dub_filter_drop pad is held. 80-600 Hz is the classic muffle range.
  filterDropHz: number;
  // Echo rate BPM-sync — when non-'off', the SpaceEcho `rate` is derived
  // live from transport BPM using the selected note division instead of
  // the free-running `echoRateMs`. That's how classic dub delays stay
  // locked to the groove: repeats hit on the beat subdivisions.
  //   '1/4'  = quarter note   (one repeat per beat)
  //   '1/8'  = eighth note    (tight stutter)
  //   '1/8D' = dotted eighth  (the classic reggae/dub skank feel)
  //   '1/16' = sixteenth      (very dense)
  //   '1/2'  = half note      (long dub tail)
  echoSyncDivision: 'off' | '1/4' | '1/8' | '1/8D' | '1/16' | '1/2';
  // Throw quantize — when non-'off', dub throws wait for the next beat
  // subdivision boundary before firing. Gives the pad a "locked-to-the-
  // groove" feel instead of free-timing. 'offbeat' is the King Tubby
  // signature: hits land on the "&" between beats so echoes fill onbeats.
  //   'off'     = fire immediately
  //   '1/16'    = tight grid — hit feels perfectly locked
  //   '1/8'     = next eighth boundary
  //   'offbeat' = next half-beat (the "&" between downbeats)
  //   'bar'     = next downbeat only (biggest moves)
  throwQuantize: 'off' | '1/16' | '1/8' | 'offbeat' | 'bar';
}

export const DEFAULT_DUB_BUS: DubBusSettings = {
  enabled: false,
  // Defaults tuned so dub moves are CLEARLY audible alongside the dry mix.
  // Subtle settings produced "I hear mostly the music" — the dub tail was
  // ~8 dB below the dry. These values put the tail within 3 dB of dry,
  // which is where King Tubby / Scientist records actually sit.
  // Gig-fix (2026-04-18): dropped returnGain 1.0 → 0.55. At 1.0 the dub
  // tail hit the master bus at parity with deck output — sirens + echo
  // throws were ~+6 dB hotter than the music. 0.55 sits it ~-5 dB under
  // the dry mix, which is where real dub records actually mix (the tail
  // supports, never dominates). User can push it back up via the Dub
  // Bus panel return knob if they want.
  returnGain: 0.55,
  hpfCutoff: 180,
  springWet: 0.55,       // was 0.4 — more audible spring tank character
  echoIntensity: 0.62,   // was 0.55 — 4-5 repeats before decay
  echoWet: 0.7,          // was 0.5 — the echo is the CONTENT of the bus, push it forward
  echoRateMs: 300,
  sidechainAmount: 0.4,
  deckTapAmount: 0.75,   // gig-fix: was 1.0 — tap is ALREADY hitting a
                         // bus with echo+spring+feedback; full deck into
                         // it stacks on top of the dry mix and overloads
                         // the return. 0.75 = -2.5 dB lands cleanly.
  throwBeats: 0.5,
  sirenFeedback: 0.85,
  filterDropHz: 220,
  // BPM-sync defaults: both off. User opts in via the Dub Bus panel for
  // locked-to-the-groove behavior. Defaulting sync on caused confusion in
  // first-time UX where the tracker transport BPM (e.g. 120) didn't match
  // the DJ deck's BPM (e.g. 140) — echoes felt "off" until the user
  // realized they had to pick a sync division explicitly.
  echoSyncDivision: 'off',
  throwQuantize: 'off',
};

// ─── Phase 1: dub lane + event types ──────────────────────────────────────
// Per-pattern automation: dub moves performed live (or written offline in
// the lane editor) are serialised as DubEvents and replayed by DubLanePlayer
// on each tracker tick. See:
//   thoughts/shared/plans/2026-04-19-tracker-dub-studio-phase-1-plan.md

/** Quantize modes — shared between Echo Throw's snap-to-grid behavior and
 *  future moves. 'off' fires immediately; everything else snaps to the next
 *  corresponding beat subdivision boundary relative to transport.currentBeat. */
export type QuantizeMode = 'off' | '1/16' | '1/8' | 'offbeat' | 'bar';

/** A single recorded dub move. Lives on the pattern's dubLane.events[].
 *  Stored sorted by `row` so DubLanePlayer can advance a cursor in O(1)/tick. */
export interface DubEvent {
  /** Stable uuid — survives edits so the lane editor can reference events. */
  id: string;
  /** Move registry key — 'echoThrow' today; 'dubStab', 'channelMute', … in later phases. */
  moveId: string;
  /** Target tracker channel (0-based). Undefined for global moves (siren, master drop, …). */
  channelId?: number;
  /** Quantized row within pattern (float — fractional for sub-row placement). */
  row: number;
  /** For hold-style moves: filled on release. Undefined = trigger/one-shot. */
  durationRows?: number;
  /** Move-specific params — e.g. echoThrow: { throwBeats, feedbackBoost }. */
  params: Record<string, number>;
  /** Kept so the lane editor can re-quantize later without losing user intent. */
  sourceQuantize?: QuantizeMode;
}

/** Per-pattern dub lane. `enabled: false` mute/solos the whole lane so the
 *  user can audition the naked song (and still perform moves live on top). */
export interface DubLane {
  enabled: boolean;
  events: DubEvent[];
}
