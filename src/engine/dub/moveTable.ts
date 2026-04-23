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
  'eqSweep',          // 27
  'springKick',       // 28
  'delayPresetQuarter',  // 29
  'delayPreset8th',      // 30
  'delayPresetTriplet',  // 31
  'delayPreset16th',     // 32
  'delayPresetDoubler',  // 33
];

/** Ratchet: tests assert `DUB_MOVE_TABLE.length === DUB_MOVE_TABLE_VERSION`
 *  so any append forces a one-line bump here — a cheap review signal. */
export const DUB_MOVE_TABLE_VERSION = 34;

/**
 * Dub effect-command slots. Picked at 36-38 to sit BEYOND the existing
 * 0-35 XM/IT effect-type range (documented as "XM effect type" in
 * `TrackerCell`) so no existing importer ever produces them and no
 * replayer dispatches on them. Moving here from the earlier 33-35
 * range prevents a serious collision: OpenMPTConverter already emits
 * `effTyp: 33` for `CMD_XFINEPORTAUPDOWN`, which our scanner was
 * misinterpreting as a dub-move trigger — fine-porta commands fired
 * arbitrary dub moves on every playback, producing pattern-level
 * distortion on any imported MOD/XM/IT song with fine porta.
 *
 *  - `DUB_EFFECT_GLOBAL` (36)       — base slot, high nibble = move index 0-15
 *  - `DUB_EFFECT_PERCHANNEL` (37)   — base slot, high nibble = move 0-15, low nibble = target channel 0-15
 *  - `DUB_EFFECT_PARAM_STEP` (38)   — high nibble = param index, low nibble = 0-15 step
 *  - `DUB_EFFECT_GLOBAL_X` (39)     — extended slot, high nibble = (move index - 16), covers moves 16-31
 *  - `DUB_EFFECT_PERCHANNEL_X` (40) — extended per-channel, high nibble = (move - 16), low nibble = channel 0-15
 *
 * Why two slot pairs: a single effTyp encodes 16 moves (4-bit nibble).
 * DUB_MOVE_TABLE has 27 append-only entries, so the _X slots keep moves
 * 16+ addressable inline. Future moves 32+ would need slots 41/42.
 */
export const DUB_EFFECT_GLOBAL       = 36;
export const DUB_EFFECT_PERCHANNEL   = 37;
export const DUB_EFFECT_PARAM_STEP   = 38;
export const DUB_EFFECT_GLOBAL_X     = 39;
export const DUB_EFFECT_PERCHANNEL_X = 40;

/** True when effTyp is any of the four dub move-trigger slots (not the param-step slot). */
export function isDubMoveEffectSlot(effTyp: number): boolean {
  return effTyp === DUB_EFFECT_GLOBAL
      || effTyp === DUB_EFFECT_PERCHANNEL
      || effTyp === DUB_EFFECT_GLOBAL_X
      || effTyp === DUB_EFFECT_PERCHANNEL_X;
}

/**
 * Decode an effect-command byte into a move trigger. Handles all four
 * move-trigger slots (36/37/39/40); returns null for the param-step slot
 * (38 — decode via `decodeDubParamStep` instead) or any non-dub effTyp.
 *
 * Base slots encode moves 0-15; _X slots add 16 to the nibble so moves
 * 16-31 are reachable. Out-of-range indices return null so the caller
 * falls through to a no-op rather than firing garbage.
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
 * Inverse of decodeDubEffect. Picks the correct base or _X slot for the
 * move's table index. Returns null if the move isn't in DUB_MOVE_TABLE,
 * its index ≥ 32 (would need future slots 41/42), or channelId is out
 * of range. DubRecorder uses this to stamp Zxx cells inline.
 */
export function encodeDubEffect(
  moveId: string,
  channelId?: number,
): { effTyp: number; eff: number } | null {
  const moveIdx = DUB_MOVE_TABLE.indexOf(moveId);
  if (moveIdx < 0 || moveIdx >= 32) return null;
  const isExtended = moveIdx >= 16;
  const nibble = moveIdx & 0x0f;
  if (channelId !== undefined) {
    if (channelId < 0 || channelId > 15) return null;
    return {
      effTyp: isExtended ? DUB_EFFECT_PERCHANNEL_X : DUB_EFFECT_PERCHANNEL,
      eff: (nibble << 4) | (channelId & 0x0f),
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
