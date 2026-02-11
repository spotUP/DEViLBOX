/**
 * Votrax SC-01 Phoneme codes (64 phonemes)
 * Defined here (not in VotraxSynth.ts) to avoid circular imports.
 */
export const VotraxPhoneme = {
  EH3: 0, EH2: 1, EH1: 2, PA0: 3, DT: 4, A1: 5, A2: 6, ZH: 7,
  AH2: 8, I3: 9, I2: 10, I1: 11, M: 12, N: 13, B: 14, V: 15,
  CH: 16, SH: 17, Z: 18, AW1: 19, NG: 20, AH1: 21, OO1: 22, OO: 23,
  L: 24, K: 25, J: 26, H: 27, G: 28, F: 29, D: 30, S: 31,
  A: 32, AY: 33, Y1: 34, UH3: 35, AH: 36, P: 37, O: 38, I: 39,
  U: 40, Y: 41, T: 42, R: 43, E: 44, W: 45, AE: 46, AE1: 47,
  AW2: 48, UH2: 49, UH1: 50, UH: 51, O2: 52, O1: 53, IU: 54, U1: 55,
  THV: 56, TH: 57, ER: 58, EH: 59, E1: 60, AW: 61, PA1: 62, STOP: 63,
} as const;

/**
 * Maps SAM phoneme codes to Votrax SC-01 allophone sequences.
 *
 * Each SAM phoneme maps to one or more Votrax phoneme codes.
 * Diphthongs (AY, OW, etc.) require multiple allophones played in sequence.
 *
 * Duration values are derived from the C++ PHONEME_TABLE[].duration field
 * in VotraxSynth.cpp. The hardware duration is in timer ticks; we convert
 * to approximate milliseconds using the Votrax's ~40kHz clock.
 * Each tick ≈ 2ms, so duration_ms ≈ duration * 2.
 */
export interface VotraxFrame {
  phone: number;      // Votrax allophone index (0-63)
  durationMs: number; // Approximate duration in milliseconds
}

/**
 * Votrax phoneme durations from C++ PHONEME_TABLE (in timer ticks).
 * Multiply by ~2 for approximate milliseconds.
 */
const DUR: Record<number, number> = {
  [VotraxPhoneme.EH3]: 59, [VotraxPhoneme.EH2]: 49, [VotraxPhoneme.EH1]: 39,
  [VotraxPhoneme.PA0]: 5,  [VotraxPhoneme.DT]: 21,
  [VotraxPhoneme.A1]: 47,  [VotraxPhoneme.A2]: 39,  [VotraxPhoneme.ZH]: 47,
  [VotraxPhoneme.AH2]: 49, [VotraxPhoneme.I3]: 59,  [VotraxPhoneme.I2]: 49,
  [VotraxPhoneme.I1]: 39,  [VotraxPhoneme.M]: 49,   [VotraxPhoneme.N]: 49,
  [VotraxPhoneme.B]: 21,   [VotraxPhoneme.V]: 41,
  [VotraxPhoneme.CH]: 33,  [VotraxPhoneme.SH]: 47,  [VotraxPhoneme.Z]: 47,
  [VotraxPhoneme.AW1]: 53, [VotraxPhoneme.NG]: 49,  [VotraxPhoneme.AH1]: 39,
  [VotraxPhoneme.OO1]: 47, [VotraxPhoneme.OO]: 59,
  [VotraxPhoneme.L]: 41,   [VotraxPhoneme.K]: 23,   [VotraxPhoneme.J]: 33,
  [VotraxPhoneme.H]: 33,   [VotraxPhoneme.G]: 23,   [VotraxPhoneme.F]: 41,
  [VotraxPhoneme.D]: 21,   [VotraxPhoneme.S]: 47,
  [VotraxPhoneme.A]: 53,   [VotraxPhoneme.AY]: 59,  [VotraxPhoneme.Y1]: 33,
  [VotraxPhoneme.UH3]: 59, [VotraxPhoneme.AH]: 53,  [VotraxPhoneme.P]: 21,
  [VotraxPhoneme.O]: 53,   [VotraxPhoneme.I]: 49,   [VotraxPhoneme.U]: 53,
  [VotraxPhoneme.Y]: 41,   [VotraxPhoneme.T]: 21,   [VotraxPhoneme.R]: 43,
  [VotraxPhoneme.E]: 53,   [VotraxPhoneme.W]: 33,   [VotraxPhoneme.AE]: 53,
  [VotraxPhoneme.AE1]: 39, [VotraxPhoneme.AW2]: 47, [VotraxPhoneme.UH2]: 49,
  [VotraxPhoneme.UH1]: 39, [VotraxPhoneme.UH]: 53,
  [VotraxPhoneme.O2]: 47,  [VotraxPhoneme.O1]: 39,  [VotraxPhoneme.IU]: 53,
  [VotraxPhoneme.U1]: 39,  [VotraxPhoneme.THV]: 41,
  [VotraxPhoneme.TH]: 57,  [VotraxPhoneme.ER]: 53,  [VotraxPhoneme.EH]: 53,
  [VotraxPhoneme.E1]: 39,  [VotraxPhoneme.AW]: 59,
  [VotraxPhoneme.PA1]: 15, [VotraxPhoneme.STOP]: 5,
};

function dur(phone: number): number {
  return (DUR[phone] ?? 30) * 2; // ticks → approximate ms
}

/**
 * Map a SAM phoneme code to a sequence of Votrax allophones.
 * Returns null for unknown phonemes.
 */
export function samToVotrax(samCode: string): VotraxFrame[] | null {
  const map: Record<string, VotraxFrame[]> = {
    // === Vowels ===
    'IY': [{ phone: VotraxPhoneme.E,   durationMs: dur(VotraxPhoneme.E) }],
    'IH': [{ phone: VotraxPhoneme.I,   durationMs: dur(VotraxPhoneme.I) }],
    'EH': [{ phone: VotraxPhoneme.EH,  durationMs: dur(VotraxPhoneme.EH) }],
    'AE': [{ phone: VotraxPhoneme.AE,  durationMs: dur(VotraxPhoneme.AE) }],
    'AA': [{ phone: VotraxPhoneme.A,   durationMs: dur(VotraxPhoneme.A) }],
    'AH': [{ phone: VotraxPhoneme.AH,  durationMs: dur(VotraxPhoneme.AH) }],
    'AO': [{ phone: VotraxPhoneme.O,   durationMs: dur(VotraxPhoneme.O) }],
    'UH': [{ phone: VotraxPhoneme.UH,  durationMs: dur(VotraxPhoneme.UH) }],
    'AX': [{ phone: VotraxPhoneme.AH1, durationMs: dur(VotraxPhoneme.AH1) }],
    'IX': [{ phone: VotraxPhoneme.I1,  durationMs: dur(VotraxPhoneme.I1) }],
    'ER': [{ phone: VotraxPhoneme.ER,  durationMs: dur(VotraxPhoneme.ER) }],
    'UX': [{ phone: VotraxPhoneme.U,   durationMs: dur(VotraxPhoneme.U) }],
    'OH': [{ phone: VotraxPhoneme.O,   durationMs: dur(VotraxPhoneme.O) }],

    // === Diphthongs ===
    'EY': [
      { phone: VotraxPhoneme.EH,  durationMs: dur(VotraxPhoneme.EH) },
      { phone: VotraxPhoneme.I1,  durationMs: dur(VotraxPhoneme.I1) },
    ],
    'AY': [
      { phone: VotraxPhoneme.AY,  durationMs: dur(VotraxPhoneme.AY) },
      { phone: VotraxPhoneme.I1,  durationMs: dur(VotraxPhoneme.I1) },
    ],
    'OY': [
      { phone: VotraxPhoneme.O,   durationMs: dur(VotraxPhoneme.O) },
      { phone: VotraxPhoneme.I1,  durationMs: dur(VotraxPhoneme.I1) },
    ],
    'AW': [
      { phone: VotraxPhoneme.AW,  durationMs: dur(VotraxPhoneme.AW) },
      { phone: VotraxPhoneme.U1,  durationMs: dur(VotraxPhoneme.U1) },
    ],
    'OW': [
      { phone: VotraxPhoneme.O,   durationMs: dur(VotraxPhoneme.O) },
      { phone: VotraxPhoneme.U1,  durationMs: dur(VotraxPhoneme.U1) },
    ],
    'UW': [{ phone: VotraxPhoneme.OO, durationMs: dur(VotraxPhoneme.OO) }],

    // === Glides / Liquids ===
    'R*': [{ phone: VotraxPhoneme.R,  durationMs: dur(VotraxPhoneme.R) }],
    'RX': [{ phone: VotraxPhoneme.R,  durationMs: dur(VotraxPhoneme.R) }],
    'L*': [{ phone: VotraxPhoneme.L,  durationMs: dur(VotraxPhoneme.L) }],
    'LX': [{ phone: VotraxPhoneme.L,  durationMs: dur(VotraxPhoneme.L) }],
    'W*': [{ phone: VotraxPhoneme.W,  durationMs: dur(VotraxPhoneme.W) }],
    'WX': [{ phone: VotraxPhoneme.W,  durationMs: dur(VotraxPhoneme.W) }],
    'WH': [{ phone: VotraxPhoneme.W,  durationMs: dur(VotraxPhoneme.W) }],
    'Y*': [{ phone: VotraxPhoneme.Y,  durationMs: dur(VotraxPhoneme.Y) }],
    'YX': [{ phone: VotraxPhoneme.Y,  durationMs: dur(VotraxPhoneme.Y) }],

    // === Nasals ===
    'M*': [{ phone: VotraxPhoneme.M,  durationMs: dur(VotraxPhoneme.M) }],
    'N*': [{ phone: VotraxPhoneme.N,  durationMs: dur(VotraxPhoneme.N) }],
    'NX': [{ phone: VotraxPhoneme.NG, durationMs: dur(VotraxPhoneme.NG) }],

    // === Fricatives ===
    'S*': [{ phone: VotraxPhoneme.S,  durationMs: dur(VotraxPhoneme.S) }],
    'SH': [{ phone: VotraxPhoneme.SH, durationMs: dur(VotraxPhoneme.SH) }],
    'F*': [{ phone: VotraxPhoneme.F,  durationMs: dur(VotraxPhoneme.F) }],
    'TH': [{ phone: VotraxPhoneme.TH, durationMs: dur(VotraxPhoneme.TH) }],
    '/H': [{ phone: VotraxPhoneme.H,  durationMs: dur(VotraxPhoneme.H) }],
    '/X': [{ phone: VotraxPhoneme.H,  durationMs: dur(VotraxPhoneme.H) }],
    'Z*': [{ phone: VotraxPhoneme.Z,  durationMs: dur(VotraxPhoneme.Z) }],
    'ZH': [{ phone: VotraxPhoneme.ZH, durationMs: dur(VotraxPhoneme.ZH) }],
    'V*': [{ phone: VotraxPhoneme.V,  durationMs: dur(VotraxPhoneme.V) }],
    'DH': [{ phone: VotraxPhoneme.THV, durationMs: dur(VotraxPhoneme.THV) }],

    // === Affricates ===
    'CH': [{ phone: VotraxPhoneme.CH, durationMs: dur(VotraxPhoneme.CH) }],
    'J*': [{ phone: VotraxPhoneme.J,  durationMs: dur(VotraxPhoneme.J) }],

    // === Stops ===
    'B*': [{ phone: VotraxPhoneme.B,  durationMs: dur(VotraxPhoneme.B) }],
    'D*': [{ phone: VotraxPhoneme.D,  durationMs: dur(VotraxPhoneme.D) }],
    'G*': [{ phone: VotraxPhoneme.G,  durationMs: dur(VotraxPhoneme.G) }],
    'GX': [{ phone: VotraxPhoneme.G,  durationMs: dur(VotraxPhoneme.G) }],
    'P*': [{ phone: VotraxPhoneme.P,  durationMs: dur(VotraxPhoneme.P) }],
    'T*': [{ phone: VotraxPhoneme.T,  durationMs: dur(VotraxPhoneme.T) }],
    'K*': [{ phone: VotraxPhoneme.K,  durationMs: dur(VotraxPhoneme.K) }],
    'KX': [{ phone: VotraxPhoneme.K,  durationMs: dur(VotraxPhoneme.K) }],

    // === Other ===
    'DX': [{ phone: VotraxPhoneme.DT, durationMs: dur(VotraxPhoneme.DT) }],
    'Q*': [{ phone: VotraxPhoneme.PA0, durationMs: dur(VotraxPhoneme.PA0) }],

    // === Pauses ===
    ' ': [{ phone: VotraxPhoneme.PA1, durationMs: dur(VotraxPhoneme.PA1) }],
  };

  return map[samCode] ?? null;
}

/**
 * Convert a full array of SAM PhonemeTokens to a flat Votrax frame sequence.
 */
export function phonemesToVotraxFrames(
  tokens: Array<{ code: string; stress: number }>
): VotraxFrame[] {
  const frames: VotraxFrame[] = [];
  for (const token of tokens) {
    const mapped = samToVotrax(token.code);
    if (mapped) {
      frames.push(...mapped);
    }
  }
  return frames;
}
