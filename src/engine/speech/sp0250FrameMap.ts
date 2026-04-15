/**
 * Maps SAM phoneme codes to SP0250 LPC filter coefficient frames.
 *
 * The SP0250 has 6 cascaded second-order lattice filter stages, each with:
 * - F (forward) coefficient: gc()-encoded 8-bit value
 * - B (backward) coefficient: gc()-encoded 8-bit value
 *
 * gc() encoding (from SP0250 coefficient ROM):
 *   Bit 7: sign (1=positive, 0=negative)
 *   Bits 6-0: magnitude index into 128-entry ROM (0..511 range)
 *
 * Frame layout (15 bytes per frame):
 *   [amp, pitch, voiced, F0, B0, F1, B1, F2, B2, F3, B3, F4, B4, F5, B5]
 *
 * amp: ga()-encoded amplitude (bits 4-0 = mantissa, bits 7-5 = exponent)
 *   Common values: 0x4A (~mid), 0x48 (~mid-low), 0x4C (~mid-high), 0x42 (~low)
 *   0x00 = silent frame, 0xFF = stop marker
 *
 * pitch: raw pitch period (0=noise-only, higher=lower frequency)
 *   Typical voiced speech: 50-80 range (~125-200Hz at 10kHz LPC rate)
 *
 * Filter coefficient ranges for formant shaping:
 *   F coefficients set resonant frequency positions
 *   B coefficients set bandwidth/damping
 *   Higher gc() magnitude = sharper resonance
 *   Filters 0-1 = primary formants (F1, F2)
 *   Filters 2-3 = secondary formants (F3, F4)
 *   Filters 4-5 = spectral tilt / fine detail
 */

export interface SP0250LPCFrame {
  /** ga()-encoded amplitude byte */
  amp: number;
  /** Raw pitch period (0=unvoiced) */
  pitch: number;
  /** Voiced excitation flag */
  voiced: boolean;
  /** gc()-encoded F coefficients for 6 filters */
  filterF: number[];
  /** gc()-encoded B coefficients for 6 filters */
  filterB: number[];
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Map a SAM phoneme code to SP0250 LPC filter coefficients.
 *
 * Filter coefficient design rationale:
 * - F coeff high bit = sign: 0x80+ = positive resonance, 0x00-0x7F = negative
 * - Vowels need strong F0/F1 resonances (high magnitude positive F values)
 * - Back vowels have lower F2 than front vowels
 * - Nasals have antiformant characteristics (negative F in mid-range filters)
 * - Fricatives use noise excitation with high-frequency emphasis
 * - Stops are brief bursts with rapid spectral change
 */
export function samToSP0250LPC(samCode: string): SP0250LPCFrame | null {
  const map: Record<string, SP0250LPCFrame> = {
    // =====================================================================
    // Vowels (voiced) — strong formant resonances
    // F0/B0 = F1 formant, F1/B1 = F2 formant, F2-F5 = higher formants
    // =====================================================================

    // /i:/ (beet) — F1=270Hz F2=2290Hz: low F1, very high F2
    'IY': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xC0, 0x80, 0x88, 0x80, 0x80, 0x80],
      filterB: [0x38, 0x30, 0x20, 0x18, 0x18, 0x10],
      durationMs: 150,
    },
    // /I/ (bit) — F1=390Hz F2=1990Hz
    'IH': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xBC, 0x88, 0x90, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x34, 0x24, 0x1C, 0x1C, 0x14],
      durationMs: 120,
    },
    // /E/ (bet) — F1=530Hz F2=1840Hz
    'EH': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xBA, 0x8C, 0x94, 0x80, 0x84, 0x80],
      filterB: [0x32, 0x34, 0x24, 0x1C, 0x1C, 0x14],
      durationMs: 140,
    },
    // /ae/ (bat) — F1=660Hz F2=1720Hz
    'AE': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB6, 0x90, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x30, 0x36, 0x26, 0x1E, 0x1C, 0x14],
      durationMs: 150,
    },
    // /a/ (father) — F1=730Hz F2=1090Hz: high F1, mid F2
    'AA': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80],
      filterB: [0x30, 0x38, 0x28, 0x20, 0x20, 0x18],
      durationMs: 160,
    },
    // /uh/ (but) — F1=640Hz F2=1190Hz
    'AH': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xB6, 0x92, 0x9C, 0x80, 0x86, 0x80],
      filterB: [0x30, 0x38, 0x28, 0x20, 0x1E, 0x16],
      durationMs: 130,
    },
    // /aw/ (caught) — F1=570Hz F2=840Hz: mid F1, low F2
    'AO': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB4, 0xA8, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x3C, 0x2C, 0x20, 0x1C, 0x14],
      durationMs: 150,
    },
    // /U/ (book) — F1=440Hz F2=1020Hz
    'UH': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xB8, 0xA4, 0x96, 0x80, 0x82, 0x80],
      filterB: [0x36, 0x3A, 0x2A, 0x20, 0x1A, 0x12],
      durationMs: 120,
    },
    // schwa (about) — F1=500Hz F2=1500Hz: neutral
    'AX': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xB8, 0x94, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x32, 0x36, 0x26, 0x1E, 0x1C, 0x14],
      durationMs: 90,
    },
    // unstressed /I/ — near schwa
    'IX': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xBC, 0x8A, 0x92, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x34, 0x24, 0x1C, 0x1C, 0x14],
      durationMs: 90,
    },
    // /er/ (bird) — F1=490Hz F2=1350Hz with F3 lowered
    'ER': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xB8, 0x96, 0x8C, 0x88, 0x84, 0x80],
      filterB: [0x32, 0x36, 0x28, 0x22, 0x1E, 0x16],
      durationMs: 160,
    },
    // /u:/ (boot) — F1=300Hz F2=870Hz: low F1, low F2
    'UX': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80],
      filterB: [0x38, 0x3C, 0x2C, 0x20, 0x18, 0x10],
      durationMs: 130,
    },
    // /o/ (boat) — F1=570Hz F2=840Hz
    'OH': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB4, 0xA8, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x3C, 0x2C, 0x20, 0x1C, 0x14],
      durationMs: 150,
    },

    // =====================================================================
    // Diphthongs (voiced) — use dominant vowel
    // =====================================================================
    'EY': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xBA, 0x8C, 0x94, 0x80, 0x84, 0x80],
      filterB: [0x32, 0x34, 0x24, 0x1C, 0x1C, 0x14],
      durationMs: 200,
    },
    'AY': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80],
      filterB: [0x30, 0x38, 0x28, 0x20, 0x20, 0x18],
      durationMs: 200,
    },
    'OY': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB4, 0xA8, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x3C, 0x2C, 0x20, 0x1C, 0x14],
      durationMs: 200,
    },
    'AW': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80],
      filterB: [0x30, 0x38, 0x28, 0x20, 0x20, 0x18],
      durationMs: 200,
    },
    'OW': {
      amp: 0x4A, pitch: 60, voiced: true,
      filterF: [0xB4, 0xA8, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x34, 0x3C, 0x2C, 0x20, 0x1C, 0x14],
      durationMs: 200,
    },
    'UW': {
      amp: 0x48, pitch: 60, voiced: true,
      filterF: [0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80],
      filterB: [0x38, 0x3C, 0x2C, 0x20, 0x18, 0x10],
      durationMs: 160,
    },

    // =====================================================================
    // Glides / Liquids (voiced, lower amplitude)
    // =====================================================================
    'R*': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xB8, 0x96, 0x8C, 0x88, 0x84, 0x80],
      filterB: [0x32, 0x36, 0x28, 0x22, 0x1E, 0x16],
      durationMs: 100,
    },
    'RX': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xB8, 0x96, 0x8C, 0x88, 0x84, 0x80],
      filterB: [0x32, 0x36, 0x28, 0x22, 0x1E, 0x16],
      durationMs: 100,
    },
    'L*': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xBC, 0x90, 0x8E, 0x84, 0x82, 0x80],
      filterB: [0x34, 0x36, 0x26, 0x20, 0x1C, 0x14],
      durationMs: 110,
    },
    'LX': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xBC, 0x90, 0x8E, 0x84, 0x82, 0x80],
      filterB: [0x34, 0x36, 0x26, 0x20, 0x1C, 0x14],
      durationMs: 110,
    },
    'W*': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80],
      filterB: [0x38, 0x3C, 0x2C, 0x20, 0x18, 0x10],
      durationMs: 80,
    },
    'WX': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80],
      filterB: [0x38, 0x3C, 0x2C, 0x20, 0x18, 0x10],
      durationMs: 80,
    },
    'WH': {
      amp: 0x40, pitch: 0, voiced: false,
      filterF: [0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80],
      filterB: [0x28, 0x2C, 0x1C, 0x18, 0x10, 0x0C],
      durationMs: 80,
    },
    'Y*': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0xC0, 0x80, 0x88, 0x80, 0x80, 0x80],
      filterB: [0x36, 0x30, 0x20, 0x18, 0x18, 0x10],
      durationMs: 80,
    },
    'YX': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0xC0, 0x80, 0x88, 0x80, 0x80, 0x80],
      filterB: [0x36, 0x30, 0x20, 0x18, 0x18, 0x10],
      durationMs: 80,
    },

    // =====================================================================
    // Nasals (voiced) — characteristic nasal formants with antiformant
    // Nasals have F1 at mouth resonance + nasal antiformant cancelling F2-F3
    // =====================================================================
    'M*': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xB6, 0x94, 0x80, 0x8C, 0x80, 0x80],
      filterB: [0x30, 0x38, 0x20, 0x28, 0x18, 0x10],
      durationMs: 120,
    },
    'N*': {
      amp: 0x44, pitch: 60, voiced: true,
      filterF: [0xB8, 0x90, 0x80, 0x8A, 0x80, 0x80],
      filterB: [0x30, 0x36, 0x20, 0x26, 0x18, 0x10],
      durationMs: 100,
    },
    'NX': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0xB4, 0x98, 0x80, 0x8E, 0x80, 0x80],
      filterB: [0x30, 0x3A, 0x20, 0x2A, 0x18, 0x10],
      durationMs: 120,
    },

    // =====================================================================
    // Fricatives (unvoiced) — noise through shaped filters
    // High-frequency emphasis via upper filter stages
    // =====================================================================
    'S*': {
      amp: 0x46, pitch: 0, voiced: false,
      filterF: [0x90, 0x80, 0x84, 0x8C, 0x90, 0x88],
      filterB: [0x18, 0x14, 0x18, 0x20, 0x24, 0x1C],
      durationMs: 140,
    },
    'SH': {
      amp: 0x48, pitch: 0, voiced: false,
      filterF: [0x94, 0x84, 0x88, 0x8A, 0x8C, 0x86],
      filterB: [0x1C, 0x18, 0x1C, 0x1E, 0x20, 0x18],
      durationMs: 140,
    },
    'F*': {
      amp: 0x40, pitch: 0, voiced: false,
      filterF: [0x88, 0x80, 0x80, 0x84, 0x88, 0x84],
      filterB: [0x14, 0x10, 0x10, 0x18, 0x1C, 0x14],
      durationMs: 120,
    },
    'TH': {
      amp: 0x3E, pitch: 0, voiced: false,
      filterF: [0x8C, 0x80, 0x82, 0x86, 0x8A, 0x84],
      filterB: [0x16, 0x12, 0x14, 0x1A, 0x1E, 0x16],
      durationMs: 120,
    },
    '/H': {
      amp: 0x3C, pitch: 0, voiced: false,
      filterF: [0xB0, 0x98, 0x84, 0x80, 0x80, 0x80],
      filterB: [0x20, 0x24, 0x18, 0x14, 0x10, 0x0C],
      durationMs: 80,
    },
    '/X': {
      amp: 0x3C, pitch: 0, voiced: false,
      filterF: [0xB0, 0x98, 0x84, 0x80, 0x80, 0x80],
      filterB: [0x20, 0x24, 0x18, 0x14, 0x10, 0x0C],
      durationMs: 80,
    },

    // =====================================================================
    // Voiced fricatives — voiced excitation through fricative filter shapes
    // =====================================================================
    'Z*': {
      amp: 0x46, pitch: 60, voiced: true,
      filterF: [0x90, 0x80, 0x84, 0x8C, 0x90, 0x88],
      filterB: [0x18, 0x14, 0x18, 0x20, 0x24, 0x1C],
      durationMs: 130,
    },
    'ZH': {
      amp: 0x46, pitch: 60, voiced: true,
      filterF: [0x94, 0x84, 0x88, 0x8A, 0x8C, 0x86],
      filterB: [0x1C, 0x18, 0x1C, 0x1E, 0x20, 0x18],
      durationMs: 120,
    },
    'V*': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0x88, 0x80, 0x80, 0x84, 0x88, 0x84],
      filterB: [0x14, 0x10, 0x10, 0x18, 0x1C, 0x14],
      durationMs: 100,
    },
    'DH': {
      amp: 0x42, pitch: 60, voiced: true,
      filterF: [0x8C, 0x80, 0x82, 0x86, 0x8A, 0x84],
      filterB: [0x16, 0x12, 0x14, 0x1A, 0x1E, 0x16],
      durationMs: 80,
    },

    // =====================================================================
    // Affricates
    // =====================================================================
    'CH': {
      amp: 0x44, pitch: 0, voiced: false,
      filterF: [0x94, 0x84, 0x88, 0x8A, 0x8C, 0x86],
      filterB: [0x1C, 0x18, 0x1C, 0x1E, 0x20, 0x18],
      durationMs: 120,
    },
    'J*': {
      amp: 0x46, pitch: 60, voiced: true,
      filterF: [0x94, 0x84, 0x88, 0x8A, 0x8C, 0x86],
      filterB: [0x1C, 0x18, 0x1C, 0x1E, 0x20, 0x18],
      durationMs: 120,
    },

    // =====================================================================
    // Stops — brief burst, low energy
    // =====================================================================
    'B*': {
      amp: 0x3C, pitch: 60, voiced: true,
      filterF: [0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80],
      filterB: [0x20, 0x28, 0x1C, 0x18, 0x14, 0x10],
      durationMs: 60,
    },
    'D*': {
      amp: 0x3C, pitch: 60, voiced: true,
      filterF: [0xB8, 0x88, 0x94, 0x80, 0x86, 0x80],
      filterB: [0x20, 0x24, 0x1C, 0x18, 0x14, 0x10],
      durationMs: 60,
    },
    'G*': {
      amp: 0x3C, pitch: 60, voiced: true,
      filterF: [0xB4, 0x98, 0x90, 0x84, 0x82, 0x80],
      filterB: [0x22, 0x2A, 0x1E, 0x1A, 0x14, 0x10],
      durationMs: 60,
    },
    'GX': {
      amp: 0x3C, pitch: 60, voiced: true,
      filterF: [0xB4, 0x98, 0x90, 0x84, 0x82, 0x80],
      filterB: [0x22, 0x2A, 0x1E, 0x1A, 0x14, 0x10],
      durationMs: 60,
    },
    'P*': {
      amp: 0x38, pitch: 0, voiced: false,
      filterF: [0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80],
      filterB: [0x18, 0x20, 0x14, 0x10, 0x0C, 0x08],
      durationMs: 60,
    },
    'T*': {
      amp: 0x3A, pitch: 0, voiced: false,
      filterF: [0xB8, 0x88, 0x94, 0x80, 0x86, 0x80],
      filterB: [0x18, 0x1C, 0x14, 0x10, 0x0C, 0x08],
      durationMs: 60,
    },
    'K*': {
      amp: 0x38, pitch: 0, voiced: false,
      filterF: [0xB4, 0x98, 0x90, 0x84, 0x82, 0x80],
      filterB: [0x1A, 0x22, 0x16, 0x12, 0x0C, 0x08],
      durationMs: 60,
    },
    'KX': {
      amp: 0x38, pitch: 0, voiced: false,
      filterF: [0xB4, 0x98, 0x90, 0x84, 0x82, 0x80],
      filterB: [0x1A, 0x22, 0x16, 0x12, 0x0C, 0x08],
      durationMs: 60,
    },

    // =====================================================================
    // Other
    // =====================================================================
    'DX': {
      amp: 0x3A, pitch: 60, voiced: true,
      filterF: [0xB8, 0x88, 0x94, 0x80, 0x86, 0x80],
      filterB: [0x20, 0x24, 0x1C, 0x18, 0x14, 0x10],
      durationMs: 40,
    },
    'Q*': {
      amp: 0x30, pitch: 0, voiced: false,
      filterF: [0xB8, 0x94, 0x98, 0x80, 0x84, 0x80],
      filterB: [0x10, 0x14, 0x0C, 0x08, 0x06, 0x04],
      durationMs: 20,
    },

    // =====================================================================
    // Pause — silent frame
    // =====================================================================
    ' ': {
      amp: 0x00, pitch: 0, voiced: false,
      filterF: [0x80, 0x80, 0x80, 0x80, 0x80, 0x80],
      filterB: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10],
      durationMs: 120,
    },
  };

  return map[samCode] ?? null;
}

/**
 * Interpolate between two LPC frames for coarticulation.
 */
function lerpFrame(from: SP0250LPCFrame, to: SP0250LPCFrame, t: number): SP0250LPCFrame {
  // Simple linear interpolation on encoded byte values
  const filterF = from.filterF.map((v, i) => Math.round(v + (to.filterF[i] - v) * t));
  const filterB = from.filterB.map((v, i) => Math.round(v + (to.filterB[i] - v) * t));
  return {
    amp: Math.round(from.amp + (to.amp - from.amp) * t),
    pitch: to.voiced ? Math.round(from.pitch + (to.pitch - from.pitch) * t) : 0,
    voiced: t > 0.5 ? to.voiced : from.voiced,
    filterF,
    filterB,
    durationMs: 25, // one LPC frame
  };
}

/**
 * Convert SAM PhonemeTokens to SP0250 LPC frames with coarticulation.
 * Inserts transition frames between phonemes for smooth formant movement.
 */
const STOPS = new Set(['P*', 'T*', 'K*', 'KX', 'B*', 'D*', 'G*', 'GX', 'Q*']);
const VOICELESS_STOPS = new Set(['P*', 'T*', 'K*', 'KX']);
const VOWELS = new Set(['IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'UH', 'AX', 'IX', 'ER', 'UX', 'OH']);
const DIPHTHONGS: Record<string, [string, string]> = {
  'EY': ['EH', 'IY'], 'AY': ['AA', 'IY'], 'OY': ['AO', 'IY'],
  'AW': ['AA', 'UX'], 'OW': ['AO', 'UX'], 'UW': ['UX', 'UX'],
};

/**
 * Convert SAM PhonemeTokens to SP0250 LPC frames with coarticulation,
 * sentence intonation, diphthong glides, and CV energy ramps.
 */
export function phonemesToSP0250LPCFrames(
  tokens: Array<{ code: string; stress: number }>,
  question = false
): SP0250LPCFrame[] {
  const rawFrames: SP0250LPCFrame[] = [];
  const tokenCodes: string[] = [];

  for (const token of tokens) {
    const frame = samToSP0250LPC(token.code);
    if (frame) {
      const ampBoost = token.stress >= 4 ? 0x04 : token.stress >= 2 ? 0x02 : 0;
      // Higher pitch period = lower frequency; stress should raise pitch (lower period)
      const pitchDrop = token.stress >= 4 ? 8 : token.stress >= 2 ? 4 : 0;
      // Vowel reduction: unstressed vowels shorter
      let duration = frame.durationMs;
      if (VOWELS.has(token.code) && token.stress === 0) {
        duration = Math.round(duration * 0.7);
      }
      rawFrames.push({
        ...frame,
        durationMs: duration,
        amp: Math.min(0xFE, frame.amp + ampBoost),
        pitch: frame.voiced ? Math.max(1, frame.pitch - pitchDrop) : 0,
      });
      tokenCodes.push(token.code);
    }
  }

  if (rawFrames.length === 0) return [];

  // Sentence intonation (higher pitch period = lower frequency)
  const total = rawFrames.length;
  for (let i = 0; i < total; i++) {
    const f = rawFrames[i];
    if (f.voiced && f.pitch > 0) {
      const pos = i / total;
      if (question) {
        // Questions: raise pitch at end (decrease period)
        if (pos > 0.7) { const rise = Math.round((pos - 0.7) / 0.3 * 10); f.pitch = Math.max(1, f.pitch - rise); }
      } else {
        // Statements: lower pitch at end (increase period)
        if (pos > 0.7) { const drop = Math.round((pos - 0.7) / 0.3 * 8); f.pitch = Math.min(255, f.pitch + drop); }
      }
    }
  }

  const result: SP0250LPCFrame[] = [];
  for (let i = 0; i < rawFrames.length; i++) {
    const curr = rawFrames[i];
    const code = tokenCodes[i];

    // Coarticulation transitions
    if (i > 0) {
      const prev = rawFrames[i - 1];
      result.push(lerpFrame(prev, curr, 0.33));
      result.push(lerpFrame(prev, curr, 0.67));
    }

    // Stop consonants: burst + aspiration + ramp
    if (STOPS.has(code)) {
      result.push({ ...curr, durationMs: 15, amp: Math.min(0xFE, curr.amp + 0x06) });
      if (VOICELESS_STOPS.has(code)) {
        const asp = samToSP0250LPC('/H');
        if (asp) result.push({ ...asp, durationMs: 20, amp: Math.max(1, curr.amp - 0x02), voiced: false, pitch: 0 });
      }
      result.push({ ...curr, durationMs: 15, amp: Math.max(1, curr.amp - 0x02) });
      continue;
    }

    // Diphthong glides
    const diph = DIPHTHONGS[code];
    if (diph) {
      const sf = samToSP0250LPC(diph[0]);
      const ef = samToSP0250LPC(diph[1]);
      if (sf && ef) {
        const steps = Math.max(3, Math.round(curr.durationMs / 30));
        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          result.push({
            ...lerpFrame(
              { ...sf, amp: curr.amp, pitch: curr.pitch, voiced: curr.voiced },
              { ...ef, amp: curr.amp, pitch: curr.pitch, voiced: curr.voiced },
              t
            ),
            durationMs: Math.round(curr.durationMs / steps),
          });
        }
        continue;
      }
    }

    // Energy envelope for long vowels
    const steadyMs = Math.max(25, curr.durationMs - 50);
    if (steadyMs > 75 && VOWELS.has(code)) {
      const attackMs = Math.round(steadyMs * 0.2);
      const sustainMs = Math.round(steadyMs * 0.6);
      const releaseMs = steadyMs - attackMs - sustainMs;
      result.push({ ...curr, durationMs: attackMs, amp: Math.max(1, curr.amp - 0x03) });
      result.push({ ...curr, durationMs: sustainMs });
      result.push({ ...curr, durationMs: releaseMs, amp: Math.max(1, curr.amp - 0x04) });
    } else {
      result.push({ ...curr, durationMs: steadyMs });
    }
  }

  return result;
}
