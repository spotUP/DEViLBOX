/**
 * DUB_MOVE_TABLE — canonical 0-indexed list of every dub move ID that can
 * be encoded inside a tracker cell via effect commands (effTyp 33/34/35).
 *
 * **Append-only.** The index is part of the on-disk .dbx contract — reordering
 * or removing entries reinterprets every saved file. When adding a new move:
 *
 *   1. Append to the end of this array. Never insert, never reorder.
 *   2. Update `DUB_MOVE_TABLE_VERSION` — tests assert this matches `.length`
 *      so a reviewer catches accidental drift.
 *   3. If a move is retired, DON'T remove it — leave the string in place and
 *      flag the move as disabled inside its own module. The index stays stable.
 *
 * The 26 entries below mirror the current `MOVES` registry in
 * `DubRouter.ts`. Contract tests assert equality between the two.
 */

export const DUB_MOVE_TABLE: readonly string[] = [
  'echoThrow',        // 0
  'dubStab',          // 1
  'filterDrop',       // 2
  'dubSiren',         // 3
  'springSlam',       // 4
  'channelMute',      // 5
  'channelThrow',     // 6
  'delayTimeThrow',   // 7
  'tapeWobble',       // 8
  'masterDrop',       // 9
  'snareCrack',       // 10
  'tapeStop',         // 11
  'backwardReverb',   // 12
  'toast',            // 13
  'transportTapeStop',// 14
  'tubbyScream',      // 15
  'stereoDoubler',    // 16
  'reverseEcho',      // 17
  'sonarPing',        // 18
  'radioRiser',       // 19
  'subSwell',         // 20
  'oscBass',          // 21
  'echoBuildUp',      // 22
  'delayPreset380',   // 23
  'delayPresetDotted',// 24
  'crushBass',        // 25
  'subHarmonic',      // 26
];

/** Ratchet: tests assert `DUB_MOVE_TABLE.length === DUB_MOVE_TABLE_VERSION`
 *  so any append forces a one-line bump here — a cheap review signal. */
export const DUB_MOVE_TABLE_VERSION = 27;

/**
 * Dub effect-command slots. Picked at 36-40 to sit BEYOND the existing
 * 0-35 XM/IT effect-type range (documented as "XM effect type" in
 * `TrackerCell`) so no existing importer ever produces them and no
 * replayer dispatches on them. Moving here from the earlier 33-35
 * range prevents a serious collision: OpenMPTConverter already emits
 * `effTyp: 33` for `CMD_XFINEPORTAUPDOWN`, which our scanner was
 * misinterpreting as a dub-move trigger — fine-porta commands fired
 * arbitrary dub moves on every playback, producing pattern-level
 * distortion on any imported MOD/XM/IT song with fine porta.
 *
 * The `eff` byte is 8 bits (0x00-0xFF). We split: high nibble is the
 * move index (0-15) and low nibble is context (target channel for
 * per-channel, reserved for global). That's only 16 addressable moves
 * per slot, but `DUB_MOVE_TABLE` is 27+ entries. Two slot-pairs cover
 * the split:
 *
 *   - `DUB_EFFECT_GLOBAL` (36)      — global, moves 0-15
 *   - `DUB_EFFECT_PERCHANNEL` (37)  — per-channel, moves 0-15
 *   - `DUB_EFFECT_PARAM_STEP` (38)  — param step 0-15
 *   - `DUB_EFFECT_GLOBAL_X` (39)    — global, moves 16-31 (offset +16)
 *   - `DUB_EFFECT_PERCHANNEL_X` (40) — per-channel, moves 16-31
 *
 * Encoder logic: pick slot = (moveIdx < 16 ? base : extended), then
 * encode (moveIdx & 0x0f) in the high nibble.
 */
export const DUB_EFFECT_GLOBAL       = 36;
export const DUB_EFFECT_PERCHANNEL   = 37;
export const DUB_EFFECT_PARAM_STEP   = 38;
export const DUB_EFFECT_GLOBAL_X     = 39;
export const DUB_EFFECT_PERCHANNEL_X = 40;

/** True when effTyp is one of the four move-encoding slots (not param step). */
export function isDubMoveEffectSlot(effTyp: number): boolean {
  return effTyp === DUB_EFFECT_GLOBAL
      || effTyp === DUB_EFFECT_PERCHANNEL
      || effTyp === DUB_EFFECT_GLOBAL_X
      || effTyp === DUB_EFFECT_PERCHANNEL_X;
}

/**
 * Decode an effect-command byte into a move + optional channel. Handles
 * both base (0-15) and extended (16-31) slot ranges. Returns null when
 * effTyp isn't a dub slot or the move index overflows the current table.
 */
export function decodeDubEffect(effTyp: number, eff: number): {
  moveId: string;
  channelId?: number;
} | null {
  const nibble = (eff >> 4) & 0x0f;
  let moveIdx: number;
  let perChannel: boolean;
  switch (effTyp) {
    case DUB_EFFECT_GLOBAL:       moveIdx = nibble;       perChannel = false; break;
    case DUB_EFFECT_PERCHANNEL:   moveIdx = nibble;       perChannel = true;  break;
    case DUB_EFFECT_GLOBAL_X:     moveIdx = nibble + 16;  perChannel = false; break;
    case DUB_EFFECT_PERCHANNEL_X: moveIdx = nibble + 16;  perChannel = true;  break;
    default: return null;
  }
  if (moveIdx >= DUB_MOVE_TABLE.length) return null;
  const moveId = DUB_MOVE_TABLE[moveIdx];
  return perChannel ? { moveId, channelId: eff & 0x0f } : { moveId };
}

/**
 * Encode a move + optional channel into an (effTyp, eff) pair. Returns
 * null when the move isn't in the table. Mirror of decodeDubEffect so
 * DubRecorder can write cells without re-implementing the split.
 */
export function encodeDubEffect(moveId: string, channelId?: number): {
  effTyp: number;
  eff: number;
} | null {
  const moveIdx = DUB_MOVE_TABLE.indexOf(moveId);
  if (moveIdx < 0 || moveIdx >= 32) return null;  // 32-move cap per encoding
  const isExtended = moveIdx >= 16;
  const nibble = moveIdx & 0x0f;
  if (channelId !== undefined) {
    if (channelId < 0 || channelId > 15) return null;  // 4-bit channel cap
    return {
      effTyp: isExtended ? DUB_EFFECT_PERCHANNEL_X : DUB_EFFECT_PERCHANNEL,
      eff: (nibble << 4) | channelId,
    };
  }
  return {
    effTyp: isExtended ? DUB_EFFECT_GLOBAL_X : DUB_EFFECT_GLOBAL,
    eff: nibble << 4,
  };
}

/**
 * The dub-param step effect (effTyp 35) uses its own small table — a
 * one-row write of a quantized value to a continuous dub.* param. Lets
 * users step-change echoWet or hpfCutoff mid-pattern without drawing a curve.
 *
 * eff high nibble = param index; low nibble = value step 0-15 → mapped to
 * 0..1 by the receiver (0x00 → 0.0, 0x0F → 1.0).
 */
export const DUB_PARAM_STEP_TABLE: readonly string[] = [
  'dub.echoWet',        // 0
  'dub.echoIntensity',  // 1
  'dub.echoRateMs',     // 2
  'dub.springWet',      // 3
  'dub.returnGain',     // 4
  'dub.hpfCutoff',      // 5
  'dub.sidechainAmount',// 6
];

export function decodeDubParamStep(eff: number): { paramKey: string; value: number } | null {
  const paramIdx = (eff >> 4) & 0x0f;
  if (paramIdx >= DUB_PARAM_STEP_TABLE.length) return null;
  const step = eff & 0x0f;                 // 0..15
  const value = step / 15;                 // 0..1
  return { paramKey: DUB_PARAM_STEP_TABLE[paramIdx], value };
}
