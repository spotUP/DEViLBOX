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
 *  - `DUB_EFFECT_GLOBAL` (36)    — `eff` high nibble = move index 0-15
 *  - `DUB_EFFECT_PERCHANNEL` (37) — high nibble = move, low nibble = target channel 0-15
 *  - `DUB_EFFECT_PARAM_STEP` (38) — high nibble = param index, low nibble = 0-15 step
 */
export const DUB_EFFECT_GLOBAL     = 36;
export const DUB_EFFECT_PERCHANNEL = 37;
export const DUB_EFFECT_PARAM_STEP = 38;

/**
 * Decode an effect-command byte. `DUB_EFFECT_GLOBAL` = global move: eff
 * high nibble is move index 0-15; low nibble is a variant slot reserved
 * for future args (always 0 today). `DUB_EFFECT_PERCHANNEL` = per-channel:
 * eff high nibble is move index, low nibble is target channel 0-15.
 *
 * Returns null when the effTyp isn't a dub slot or the move index is out
 * of range — caller falls through to a no-op rather than firing garbage.
 */
export function decodeDubEffect(effTyp: number, eff: number): {
  moveId: string;
  channelId?: number;
} | null {
  if (effTyp !== DUB_EFFECT_GLOBAL && effTyp !== DUB_EFFECT_PERCHANNEL) return null;
  const moveIdx = (eff >> 4) & 0x0f;
  if (moveIdx >= DUB_MOVE_TABLE.length) return null;
  const moveId = DUB_MOVE_TABLE[moveIdx];
  if (effTyp === DUB_EFFECT_PERCHANNEL) {
    return { moveId, channelId: eff & 0x0f };
  }
  return { moveId };
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
