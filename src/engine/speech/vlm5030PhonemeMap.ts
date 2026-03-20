/**
 * Maps SAM phoneme codes to VLM5030 LPC parameter frames.
 *
 * Each phoneme maps to K0-K9 coefficient indices, energy index, pitch index.
 * These indices are looked up in the VLM5030 coefficient tables (from MAME tms5110r.hxx).
 *
 * VLM5030 coefficient index ranges:
 * - K0 (K1_TABLE): 0-63 (6-bit) — primary formant F1
 * - K1 (K2_TABLE): 0-31 (5-bit) — primary formant F2
 * - K2-K3 (K3_TABLE): 0-15 (4-bit) — higher formants
 * - K4-K9 (K5_TABLE): 0-7 (3-bit) — spectral fine detail
 * - Energy (ENERGY_TABLE): 0-31 (5-bit)
 * - Pitch (PITCH_TABLE): 0-31 (5-bit), 0=unvoiced
 *
 * K0 mapping (K1_TABLE has sign flip at index 32):
 *   0-31: positive values 390..509 (closed/front vowels)
 *   32-63: negative values -390..376 (open/back vowels)
 *   Index ~44 = -125 (typical open AH), ~36 = -360 (closed EE)
 *   Index ~52 = 125 (mid-back OH), ~48 = 0 (neutral)
 */

export interface VLM5030Frame {
  k: number[];       // K0-K9 indices [10 values]
  energy: number;    // Energy index 0-31
  pitch: number;     // Pitch index 0-31 (0=unvoiced)
  unvoiced: boolean;
  durationMs: number;
}

export function samToVLM5030(samCode: string): VLM5030Frame | null {
  //                              K0  K1  K2  K3  K4  K5  K6  K7  K8  K9
  const map: Record<string, VLM5030Frame> = {
    // === Vowels (voiced) ===
    // K0: F1 control. Higher negative = more closed. ~44=open, ~36=closed
    // K1: F2 control. Higher positive = more front. ~5=front, ~24=back
    'IY': { k: [36, 14,  6,  4,  2,  1,  0,  0,  0,  0], energy: 22, pitch: 12, unvoiced: false, durationMs: 150 },
    'IH': { k: [40, 10,  5,  3,  2,  1,  0,  0,  0,  0], energy: 22, pitch: 13, unvoiced: false, durationMs: 120 },
    'EH': { k: [42,  8,  5,  3,  2,  1,  0,  0,  0,  0], energy: 22, pitch: 13, unvoiced: false, durationMs: 140 },
    'AE': { k: [44,  6,  4,  3,  1,  1,  0,  0,  0,  0], energy: 23, pitch: 14, unvoiced: false, durationMs: 150 },
    'AA': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 14, unvoiced: false, durationMs: 160 },
    'AH': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 20, pitch: 14, unvoiced: false, durationMs: 130 },
    'AO': { k: [48, 24,  3,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 15, unvoiced: false, durationMs: 150 },
    'UH': { k: [50, 25,  2,  2,  1,  0,  0,  0,  0,  0], energy: 20, pitch: 15, unvoiced: false, durationMs: 120 },
    'AX': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 90 },
    'IX': { k: [38, 12,  5,  3,  2,  1,  0,  0,  0,  0], energy: 18, pitch: 13, unvoiced: false, durationMs: 90 },
    'ER': { k: [42,  8, 10,  6,  3,  2,  1,  0,  0,  0], energy: 22, pitch: 14, unvoiced: false, durationMs: 160 },
    'UX': { k: [52, 26,  2,  1,  0,  0,  0,  0,  0,  0], energy: 20, pitch: 17, unvoiced: false, durationMs: 130 },
    'OH': { k: [48, 24,  3,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 15, unvoiced: false, durationMs: 150 },

    // === Diphthongs ===
    'EY': { k: [42,  8,  5,  3,  2,  1,  0,  0,  0,  0], energy: 22, pitch: 13, unvoiced: false, durationMs: 200 },
    'AY': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 14, unvoiced: false, durationMs: 200 },
    'OY': { k: [48, 24,  3,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 15, unvoiced: false, durationMs: 200 },
    'AW': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 14, unvoiced: false, durationMs: 200 },
    'OW': { k: [48, 24,  3,  2,  1,  0,  0,  0,  0,  0], energy: 22, pitch: 15, unvoiced: false, durationMs: 200 },
    'UW': { k: [52, 26,  2,  1,  0,  0,  0,  0,  0,  0], energy: 20, pitch: 17, unvoiced: false, durationMs: 160 },

    // === Glides / Liquids ===
    'R*': { k: [42,  8, 10,  6,  3,  2,  1,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 100 },
    'RX': { k: [42,  8, 10,  6,  3,  2,  1,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 100 },
    'L*': { k: [38, 12,  7,  4,  2,  1,  0,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 110 },
    'LX': { k: [38, 12,  7,  4,  2,  1,  0,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 110 },
    'W*': { k: [52, 26,  2,  1,  0,  0,  0,  0,  0,  0], energy: 16, pitch: 15, unvoiced: false, durationMs: 80 },
    'WX': { k: [52, 26,  2,  1,  0,  0,  0,  0,  0,  0], energy: 16, pitch: 15, unvoiced: false, durationMs: 80 },
    'WH': { k: [52, 26,  2,  1,  0,  0,  0,  0,  0,  0], energy: 12, pitch:  0, unvoiced: true,  durationMs: 80 },
    'Y*': { k: [36, 14,  6,  4,  2,  1,  0,  0,  0,  0], energy: 16, pitch: 13, unvoiced: false, durationMs: 80 },
    'YX': { k: [36, 14,  6,  4,  2,  1,  0,  0,  0,  0], energy: 16, pitch: 13, unvoiced: false, durationMs: 80 },

    // === Nasals ===
    'M*': { k: [42,  8, 10,  6,  3,  2,  1,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 120 },
    'N*': { k: [40, 10,  8,  5,  3,  2,  1,  0,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 100 },
    'NX': { k: [44,  8,  8,  5,  3,  2,  1,  0,  0,  0], energy: 16, pitch: 14, unvoiced: false, durationMs: 120 },

    // === Fricatives (unvoiced) ===
    'S*': { k: [48,  4,  2,  1,  4,  3,  2,  1,  0,  0], energy: 16, pitch:  0, unvoiced: true,  durationMs: 140 },
    'SH': { k: [46,  6,  3,  2,  4,  3,  2,  1,  0,  0], energy: 18, pitch:  0, unvoiced: true,  durationMs: 140 },
    'F*': { k: [50,  3,  1,  0,  3,  2,  1,  0,  0,  0], energy: 12, pitch:  0, unvoiced: true,  durationMs: 120 },
    'TH': { k: [48,  4,  2,  1,  3,  2,  1,  0,  0,  0], energy: 10, pitch:  0, unvoiced: true,  durationMs: 120 },
    '/H': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 12, pitch:  0, unvoiced: true,  durationMs: 80 },
    '/X': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 12, pitch:  0, unvoiced: true,  durationMs: 80 },

    // === Voiced fricatives ===
    'Z*': { k: [48,  4,  2,  1,  4,  3,  2,  1,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 130 },
    'ZH': { k: [46,  6,  3,  2,  4,  3,  2,  1,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 120 },
    'V*': { k: [50,  3,  1,  0,  3,  2,  1,  0,  0,  0], energy: 16, pitch: 14, unvoiced: false, durationMs: 100 },
    'DH': { k: [48,  4,  2,  1,  3,  2,  1,  0,  0,  0], energy: 16, pitch: 14, unvoiced: false, durationMs: 80 },

    // === Affricates ===
    'CH': { k: [46,  6,  3,  2,  4,  3,  2,  1,  0,  0], energy: 16, pitch:  0, unvoiced: true,  durationMs: 120 },
    'J*': { k: [46,  6,  3,  2,  4,  3,  2,  1,  0,  0], energy: 18, pitch: 14, unvoiced: false, durationMs: 120 },

    // === Stops ===
    'B*': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 14, pitch: 14, unvoiced: false, durationMs: 60 },
    'D*': { k: [40, 10,  5,  3,  2,  1,  0,  0,  0,  0], energy: 14, pitch: 14, unvoiced: false, durationMs: 60 },
    'G*': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 14, pitch: 14, unvoiced: false, durationMs: 60 },
    'GX': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 14, pitch: 14, unvoiced: false, durationMs: 60 },
    'P*': { k: [44,  5,  4,  2,  1,  0,  0,  0,  0,  0], energy: 10, pitch:  0, unvoiced: true,  durationMs: 60 },
    'T*': { k: [40, 10,  5,  3,  2,  1,  0,  0,  0,  0], energy: 12, pitch:  0, unvoiced: true,  durationMs: 60 },
    'K*': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 10, pitch:  0, unvoiced: true,  durationMs: 60 },
    'KX': { k: [46,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy: 10, pitch:  0, unvoiced: true,  durationMs: 60 },

    // === Other ===
    'DX': { k: [40, 10,  5,  3,  2,  1,  0,  0,  0,  0], energy: 12, pitch: 14, unvoiced: false, durationMs: 40 },
    'Q*': { k: [48,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy:  2, pitch:  0, unvoiced: false, durationMs: 20 },

    // === Pause ===
    ' ':  { k: [48,  8,  3,  2,  1,  0,  0,  0,  0,  0], energy:  0, pitch:  0, unvoiced: false, durationMs: 120 },
  };

  return map[samCode] ?? null;
}

/**
 * Convert SAM PhonemeTokens to VLM5030 frames.
 */
export function phonemesToVLM5030Frames(
  tokens: Array<{ code: string; stress: number }>
): VLM5030Frame[] {
  const frames: VLM5030Frame[] = [];
  for (const token of tokens) {
    const frame = samToVLM5030(token.code);
    if (frame) {
      const energyBoost = token.stress >= 4 ? 3 : 0;
      frames.push({
        ...frame,
        energy: Math.min(31, frame.energy + energyBoost),
      });
    }
  }
  return frames;
}
