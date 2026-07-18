/**
 * sunEffectMap.ts — SunTronic V1.3 effect-map module
 *
 * Single source of truth for the opcode <-> tracker-column mapping consumed by
 * both the grid decoder (Task 3) and re-encoder (Task 4).
 *
 * Control opcodes 0x8b..0x9c + 0x97 each have one SunEffectDef.  Two defs may
 * share an effTyp id (0x98 / 0x8e both use effTyp 15 for "Fxx") and one def may
 * own two effTyp ids (0x9b owns effTyp 1 = pitch up / effTyp 2 = pitch down).
 *
 * volSlide rate (SUN_FX.volSlideRate) is NOT independently encodable:
 *   sunEncodeEffect(SUN_FX.volSlideRate, …) returns null.
 *   Task 4's group encoder supplies the second byte of a 0x9a opcode by reading
 *   a sibling volSlideRate column — no standalone opcode exists for the rate.
 *
 * All SunTronic *private* control effTyp ids live in the reserved 0x40..0x4F
 * block defined by SUN_FX (see sunEffectGlyphs.ts). They used to squat ids
 * 39-51, which collided with dub (36-40) and OPL (0x30-0x3F) in the shared
 * grid renderers and showed "?00" / bogus glyphs. Do NOT hardcode these ids —
 * reference SUN_FX so the id and its display glyph stay in one place.
 */

import type { SunCmdWidths } from './SunTronicV13';
import { SUN_FX } from './sunEffectGlyphs';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SunEffectDef {
  /** Decode-side opcode byte this def owns (0x8b..0x9c, 0x97). */
  op: number;
  /** Human-readable name matching SunTronicPlayer.controlOpcode names. */
  name: string;
  /** true = maps to a real ProTracker effect column; false = SunTronic custom. */
  ptStyle: boolean;
  /**
   * Interpret already-sliced arg bytes (caller slices via sunCommandLen) into
   * one display-effect column.
   */
  decode(argBytes: number[]): { effTyp: number; param: number };
  /**
   * Encode-side routing predicate.  Returns true if THIS def should produce
   * the opcode for the given display column.  Allows:
   *   - two defs to share an effTyp (0x98/0x8e for effTyp 15)
   *   - one def to own two effTyps (0x9b owns effTyp 1 and 2)
   */
  owns(effTyp: number, param: number): boolean;
  /**
   * Rebuild arg bytes (NOT including the opcode) for this column.
   * `widths` is only consulted for 0x9b (1 vs 2 bytes); ignored elsewhere.
   */
  encode(effTyp: number, param: number, widths: SunCmdWidths): number[];
}

/** All SunTronic control opcode defs, keyed by opcode byte. */
export const SUN_EFFECT_BY_OP: Map<number, SunEffectDef> = new Map();

/**
 * Encode-side resolver: scan SUN_EFFECT_BY_OP for the first def whose
 * owns(effTyp, param) is true, return { op, argBytes }.
 *
 * Returns null when no def owns the effTyp — in particular SUN_FX.volSlideRate
 * has no independent opcode and always returns null.
 */
export function sunEncodeEffect(
  effTyp: number,
  param: number,
  widths: SunCmdWidths,
): { op: number; argBytes: number[] } | null {
  for (const def of SUN_EFFECT_BY_OP.values()) {
    if (def.owns(effTyp, param)) {
      return { op: def.op, argBytes: def.encode(effTyp, param, widths) };
    }
  }
  return null;
}

/**
 * Static arg-count map for all control opcodes.
 * Mirrors SUN_CMD_ARGC (except 0x9a/0x9b which are variant-dependent).
 */
const OP_ARG_COUNT: Record<number, number> = {
  0x9c: 1, // arpSelect
  0x99: 1, // setVolume
  0x98: 1, // speedGlobal
  0x97: 2, // prngSeed
  0x96: 0, // restartVolEnv
  0x95: 0, // restartFreqEnv
  0x94: 1, // setPitchNoRetrig
  0x93: 2, // masterFade
  0x92: 1, // masterVol
  0x91: 1, // paulaAttach
  0x90: 1, // finetune
  0x8f: 1, // speedVoice
  0x8e: 2, // ciaTempo
  0x8d: 2, // tempoSlide
  0x8c: 1, // rowsGlobal
  0x8b: 1, // rowsVoice
};

/**
 * Arg-byte count for `op` under `widths`.
 * Mirrors sunCommandLen (minus the leading opcode byte) — NOT a new width authority.
 */
export function opcodeParamBytes(op: number, widths: SunCmdWidths): number {
  if (op === 0x9b) return pitchSlideByteCount(widths);
  if (op === 0x9a) return widths.volSlideRateFromStream ? 2 : 1;
  return OP_ARG_COUNT[op] ?? 0;
}

// ---------------------------------------------------------------------------
// Shared helper — keeps the 0x9b width rule in one place
// ---------------------------------------------------------------------------

/** Returns the number of arg bytes for 0x9b, matching sunCommandLen's rule. */
function pitchSlideByteCount(widths: SunCmdWidths): 1 | 2 {
  return widths.arpShift >= 4 ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Byte-packing helpers
// ---------------------------------------------------------------------------

/** 1-byte arg: param = b0. */
function decode1(argBytes: number[], effTyp: number): { effTyp: number; param: number } {
  return { effTyp, param: argBytes[0] & 0xff };
}

/** 2-byte big-endian arg: param = (b0<<8)|b1. */
function decode2(argBytes: number[], effTyp: number): { effTyp: number; param: number } {
  return { effTyp, param: ((argBytes[0] & 0xff) << 8) | (argBytes[1] & 0xff) };
}

/** 0-byte arg: param = 0. */
function decode0(effTyp: number): { effTyp: number; param: number } {
  return { effTyp, param: 0 };
}

/** Encode 1-byte arg. */
function encode1(_effTyp: number, param: number): number[] {
  return [param & 0xff];
}

/** Encode 2-byte big-endian arg. */
function encode2(_effTyp: number, param: number): number[] {
  return [(param >> 8) & 0xff, param & 0xff];
}

/** Encode 0-byte arg. */
function encode0(): number[] {
  return [];
}

// ---------------------------------------------------------------------------
// Def factory helpers
// ---------------------------------------------------------------------------

/** Standard 1-byte opcode with a single effTyp. */
function def1(op: number, name: string, ptStyle: boolean, effTyp: number): SunEffectDef {
  return {
    op, name, ptStyle,
    decode: (argBytes) => decode1(argBytes, effTyp),
    owns: (e) => e === effTyp,
    encode: encode1,
  };
}

/** Standard 2-byte opcode with a single effTyp. */
function def2(op: number, name: string, ptStyle: boolean, effTyp: number): SunEffectDef {
  return {
    op, name, ptStyle,
    decode: (argBytes) => decode2(argBytes, effTyp),
    owns: (e) => e === effTyp,
    encode: encode2,
  };
}

/** Standard 0-byte opcode with a single effTyp. */
function def0(op: number, name: string, ptStyle: boolean, effTyp: number): SunEffectDef {
  return {
    op, name, ptStyle,
    decode: () => decode0(effTyp),
    owns: (e) => e === effTyp,
    encode: encode0,
  };
}

// ---------------------------------------------------------------------------
// Register all defs
// ---------------------------------------------------------------------------

function register(def: SunEffectDef): void {
  SUN_EFFECT_BY_OP.set(def.op, def);
}

// 0x9c  arpSelect    1 byte    SUN_FX.arpSelect   custom arp-table
register(def1(0x9c, 'arpSelect', false, SUN_FX.arpSelect));

// 0x9b  pitchSlide   1 or 2 bytes (variant-width)
//   effTyp 1 = pitch up (param >= 0), effTyp 2 = pitch down (param < 0 in native)
register({
  op: 0x9b,
  name: 'pitchSlide',
  ptStyle: true,
  decode(argBytes): { effTyp: number; param: number } {
    let signed: number;
    if (argBytes.length === 1) {
      // Sign-extend the single byte (Version-A variant)
      signed = (argBytes[0] << 24) >> 24;
    } else {
      // Big-endian signed word (Main variant, 2 bytes)
      signed = (((argBytes[0] & 0xff) << 8) | (argBytes[1] & 0xff)) << 16 >> 16;
    }
    const effTyp = signed >= 0 ? 1 : 2;
    const param = Math.abs(signed);
    return { effTyp, param };
  },
  owns(effTyp): boolean {
    return effTyp === 1 || effTyp === 2;
  },
  encode(effTyp, param, widths): number[] {
    // effTyp 2 = down → negate; effTyp 1 = up → positive
    const signed = effTyp === 2 ? -param : param;
    if (pitchSlideByteCount(widths) === 2) {
      // 2-byte signed word (Main variant)
      const word = signed & 0xffff;
      return [(word >> 8) & 0xff, word & 0xff];
    } else {
      // 1 signed byte (Version-A variant)
      return [signed & 0xff];
    }
  },
});

// 0x9a  volSlide     1 byte (+1 rate byte in variant)
//   decode: effTyp 10 (amount only); the rate byte (SUN_FX.volSlideRate) is NOT
//   an independent opcode — sunEncodeEffect(SUN_FX.volSlideRate,…) returns null.
register({
  op: 0x9a,
  name: 'volSlide',
  ptStyle: true,
  decode(argBytes): { effTyp: number; param: number } {
    // Always decode only the amount byte as effTyp 10.
    // When argBytes has 2 bytes (volSlideRateFromStream variant), the rate
    // byte is handled by the group decoder which also emits SUN_FX.volSlideRate.
    return { effTyp: 10, param: argBytes[0] & 0xff };
  },
  owns(effTyp): boolean {
    // SUN_FX.volSlideRate is NOT independently encodable — return false for it.
    return effTyp === 10;
  },
  encode(_effTyp, param): number[] {
    return [param & 0xff];
  },
});

// 0x99  setVolume    1 byte    effTyp 12   PT Cxx
register(def1(0x99, 'setVolume', true, 12));

// 0x98  speedGlobal  1 byte    effTyp 15   PT Fxx
//   Identified by opcode; no param-value guard needed (0x8e ciaTempo is effTyp 51).
register({
  op: 0x98,
  name: 'speedGlobal',
  ptStyle: true,
  decode: (argBytes) => decode1(argBytes, 15),
  owns: (effTyp) => effTyp === 15,
  encode: encode1,
});

// 0x8f  speedVoice   1 byte    SUN_FX.speedVoice   custom
register(def1(0x8f, 'speedVoice', false, SUN_FX.speedVoice));

// 0x96  restartVolEnv  0 bytes  SUN_FX.restartVolEnv   custom
register(def0(0x96, 'restartVolEnv', false, SUN_FX.restartVolEnv));

// 0x95  restartFreqEnv 0 bytes  SUN_FX.restartFreqEnv   custom
register(def0(0x95, 'restartFreqEnv', false, SUN_FX.restartFreqEnv));

// 0x94  setPitchNoRetrig  1 byte  effTyp 3   note cell + PT 3xx glide
register(def1(0x94, 'setPitchNoRetrig', true, 3));

// 0x93  masterFade   2 bytes   SUN_FX.masterFade   custom
register(def2(0x93, 'masterFade', false, SUN_FX.masterFade));

// 0x92  masterVol    1 byte    SUN_FX.masterVol   custom
register(def1(0x92, 'masterVol', false, SUN_FX.masterVol));

// 0x91  paulaAttach  1 byte    SUN_FX.paulaAttach   custom
register(def1(0x91, 'paulaAttach', false, SUN_FX.paulaAttach));

// 0x90  finetune     1 byte    effTyp 14   PT E5x
//   decode: param = b0 (the x nibble); the E5 prefix is implied by effTyp 14.
//   Brief says "emit as E5x — high nibble 5": the param IS the x nibble value.
register(def1(0x90, 'finetune', true, 14));

// 0x8e  ciaTempo     2 bytes   SUN_FX.ciaTempo   custom (private 0x40..0x4F block)
//   Identified by opcode; dedicated effTyp avoids value-split ambiguity with 0x98.
register({
  op: 0x8e,
  name: 'ciaTempo',
  ptStyle: false,
  decode: (argBytes) => decode2(argBytes, SUN_FX.ciaTempo),
  owns: (effTyp) => effTyp === SUN_FX.ciaTempo,
  encode: encode2,
});

// 0x8d  tempoSlide   2 bytes   SUN_FX.tempoSlide   custom
register(def2(0x8d, 'tempoSlide', false, SUN_FX.tempoSlide));

// 0x8c  rowsGlobal   1 byte    SUN_FX.rowsGlobal   custom
register(def1(0x8c, 'rowsGlobal', false, SUN_FX.rowsGlobal));

// 0x8b  rowsVoice    1 byte    SUN_FX.rowsVoice   custom
register(def1(0x8b, 'rowsVoice', false, SUN_FX.rowsVoice));

// 0x97  prngSeed     2 bytes   SUN_FX.prngSeed   custom (carry verbatim)
register(def2(0x97, 'prngSeed', false, SUN_FX.prngSeed));
