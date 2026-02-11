/**
 * Maps SAM phoneme codes to MEA8000 formant indices.
 *
 * The MEA8000 has the richest formant control of the speech chips:
 * - F1: 32 values (150-1047 Hz)
 * - F2: 32 values (440-3400 Hz)
 * - F3: 8 values (1179-3400 Hz)
 *
 * Formant frequencies from Peterson & Barney (1952) acoustic data,
 * mapped to nearest MEA8000 table indices.
 */

// MEA8000 frequency tables (from C++ MEA8000Synth.cpp)
const FM1_TABLE = [
  150, 162, 174, 188, 202, 217, 233, 250,
  267, 286, 305, 325, 346, 368, 391, 415,
  440, 466, 494, 523, 554, 587, 622, 659,
  698, 740, 784, 830, 880, 932, 988, 1047,
];

const FM2_TABLE = [
  440, 466, 494, 523, 554, 587, 622, 659,
  698, 740, 784, 830, 880, 932, 988, 1047,
  1100, 1179, 1254, 1337, 1428, 1528, 1639, 1761,
  1897, 2047, 2214, 2400, 2609, 2842, 3105, 3400,
];

const FM3_TABLE = [1179, 1337, 1528, 1761, 2047, 2400, 2842, 3400];

/** Find nearest index in a frequency table */
function freqToIndex(freq: number, table: number[]): number {
  let best = 0;
  let bestDist = Math.abs(freq - table[0]);
  for (let i = 1; i < table.length; i++) {
    const dist = Math.abs(freq - table[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export interface MEA8000Frame {
  f1: number;       // F1 index (0-31)
  f2: number;       // F2 index (0-31)
  f3: number;       // F3 index (0-7)
  noise: boolean;   // true = noise excitation
  bw: number;       // Bandwidth index (0-3)
  durationMs: number;
}

/**
 * Create an MEA8000 frame from formant frequencies in Hz.
 */
function makeFrame(
  f1Hz: number, f2Hz: number, f3Hz: number,
  noise: boolean, bw: number, durationMs: number
): MEA8000Frame {
  return {
    f1: freqToIndex(f1Hz, FM1_TABLE),
    f2: freqToIndex(f2Hz, FM2_TABLE),
    f3: freqToIndex(f3Hz, FM3_TABLE),
    noise,
    bw,
    durationMs,
  };
}

/**
 * Map a SAM phoneme code to MEA8000 formant parameters.
 *
 * Vowel formant frequencies from Peterson & Barney (1952) for adult male:
 *   IY: F1=270, F2=2290, F3=3010
 *   IH: F1=390, F2=1990, F3=2550
 *   EH: F1=530, F2=1840, F3=2480
 *   AE: F1=660, F2=1720, F3=2410
 *   AH: F1=730, F2=1090, F3=2440
 *   AA: F1=710, F2=1100, F3=2540
 *   AO: F1=570, F2=840,  F3=2410
 *   UH: F1=440, F2=1020, F3=2240
 *   OO: F1=300, F2=870,  F3=2240
 *   ER: F1=490, F2=1350, F3=1690
 *
 * Returns null for unknown phonemes.
 */
export function samToMEA8000(samCode: string): MEA8000Frame | null {
  // BW: 0=wide(726Hz), 1=medium(309Hz), 2=narrow(125Hz), 3=very narrow(50Hz)
  const map: Record<string, MEA8000Frame> = {
    // === Vowels (voiced, narrow bandwidth for clear resonance) ===
    'IY': makeFrame(270,  2290, 3010, false, 2, 100),
    'IH': makeFrame(390,  1990, 2550, false, 2, 80),
    'EH': makeFrame(530,  1840, 2480, false, 2, 80),
    'AE': makeFrame(660,  1720, 2410, false, 2, 90),
    'AA': makeFrame(710,  1100, 2540, false, 2, 100),
    'AH': makeFrame(730,  1090, 2440, false, 2, 80),
    'AO': makeFrame(570,  840,  2410, false, 2, 100),
    'UH': makeFrame(440,  1020, 2240, false, 2, 80),
    'AX': makeFrame(500,  1500, 2500, false, 1, 60),
    'IX': makeFrame(390,  1990, 2550, false, 1, 60),
    'ER': makeFrame(490,  1350, 1690, false, 2, 100),
    'UX': makeFrame(300,  870,  2240, false, 2, 80),
    'OH': makeFrame(570,  840,  2410, false, 2, 100),

    // === Diphthongs ===
    'EY': makeFrame(530,  1840, 2480, false, 2, 130),
    'AY': makeFrame(710,  1100, 2540, false, 2, 140),
    'OY': makeFrame(570,  840,  2410, false, 2, 140),
    'AW': makeFrame(710,  1100, 2540, false, 2, 130),
    'OW': makeFrame(570,  840,  2410, false, 2, 130),
    'UW': makeFrame(300,  870,  2240, false, 2, 100),

    // === Glides / Liquids ===
    'R*': makeFrame(490,  1350, 1690, false, 1, 70),
    'RX': makeFrame(490,  1350, 1690, false, 1, 70),
    'L*': makeFrame(360,  1700, 2800, false, 1, 70),
    'LX': makeFrame(360,  1700, 2800, false, 1, 70),
    'W*': makeFrame(300,  870,  2240, false, 1, 60),
    'WX': makeFrame(300,  870,  2240, false, 1, 60),
    'WH': makeFrame(300,  870,  2240, true,  0, 60),
    'Y*': makeFrame(270,  2290, 3010, false, 1, 60),
    'YX': makeFrame(270,  2290, 3010, false, 1, 60),

    // === Nasals ===
    'M*': makeFrame(300,  1100, 2500, false, 0, 80),
    'N*': makeFrame(350,  1700, 2500, false, 0, 70),
    'NX': makeFrame(300,  1100, 2500, false, 0, 80),

    // === Fricatives ===
    'S*': makeFrame(400,  2200, 3400, true,  0, 90),
    'SH': makeFrame(350,  1800, 2800, true,  0, 90),
    'F*': makeFrame(350,  1500, 2500, true,  0, 80),
    'TH': makeFrame(400,  2000, 3000, true,  0, 80),
    '/H': makeFrame(500,  1500, 2500, true,  0, 60),
    '/X': makeFrame(500,  1500, 2500, true,  0, 60),
    'Z*': makeFrame(400,  2200, 3400, false, 0, 90),
    'ZH': makeFrame(350,  1800, 2800, false, 0, 80),
    'V*': makeFrame(350,  1500, 2500, false, 0, 70),
    'DH': makeFrame(400,  2000, 3000, false, 0, 60),

    // === Affricates ===
    'CH': makeFrame(400,  2000, 3000, true,  0, 80),
    'J*': makeFrame(400,  2000, 3000, false, 0, 80),

    // === Stops ===
    'B*': makeFrame(350,  1100, 2500, false, 0, 40),
    'D*': makeFrame(400,  1800, 2600, false, 0, 40),
    'G*': makeFrame(350,  1500, 2500, false, 0, 40),
    'GX': makeFrame(350,  1500, 2500, false, 0, 40),
    'P*': makeFrame(350,  1100, 2500, true,  0, 40),
    'T*': makeFrame(400,  1800, 2600, true,  0, 40),
    'K*': makeFrame(350,  1500, 2500, true,  0, 40),
    'KX': makeFrame(350,  1500, 2500, true,  0, 40),

    // === Other ===
    'DX': makeFrame(400,  1800, 2600, false, 0, 30),
    'Q*': makeFrame(150,  440,  1179, false, 0, 10),

    // === Pause ===
    ' ':  makeFrame(150,  440,  1179, false, 0, 80),
  };

  return map[samCode] ?? null;
}

/**
 * Convert SAM PhonemeTokens to MEA8000 frames.
 */
export function phonemesToMEA8000Frames(
  tokens: Array<{ code: string; stress: number }>
): MEA8000Frame[] {
  const frames: MEA8000Frame[] = [];
  for (const token of tokens) {
    const frame = samToMEA8000(token.code);
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}
