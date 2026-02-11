import { SP0250Preset } from '@engine/sp0250/SP0250Synth';

/**
 * Maps SAM phoneme codes to SP0250 vowel presets and parameters.
 *
 * The SP0250 has 8 presets (AH, EE, IH, OH, OO, NN, ZZ, HH) plus
 * voiced/unvoiced control and brightness. More limited than Votrax
 * for consonants, but produces clear vowel sounds.
 */
export interface SP0250Frame {
  preset: number;     // SP0250 vowel preset index (0-7)
  voiced: boolean;    // Voiced excitation (true) or noise (false)
  brightness: number; // 0-1, upper formant emphasis
  durationMs: number;
}

/**
 * Map a SAM phoneme code to SP0250 parameters.
 * Returns null for unknown phonemes.
 */
export function samToSP0250(samCode: string): SP0250Frame | null {
  const map: Record<string, SP0250Frame> = {
    // === Vowels (voiced, clear presets) ===
    'IY': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.7, durationMs: 100 },
    'IH': { preset: SP0250Preset.IH, voiced: true,  brightness: 0.6, durationMs: 80 },
    'EH': { preset: SP0250Preset.IH, voiced: true,  brightness: 0.5, durationMs: 80 },
    'AE': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.6, durationMs: 90 },
    'AA': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.5, durationMs: 100 },
    'AH': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.4, durationMs: 80 },
    'AO': { preset: SP0250Preset.OH, voiced: true,  brightness: 0.3, durationMs: 100 },
    'UH': { preset: SP0250Preset.OO, voiced: true,  brightness: 0.4, durationMs: 80 },
    'AX': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.3, durationMs: 60 },
    'IX': { preset: SP0250Preset.IH, voiced: true,  brightness: 0.4, durationMs: 60 },
    'ER': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.5, durationMs: 100 },
    'UX': { preset: SP0250Preset.OO, voiced: true,  brightness: 0.3, durationMs: 80 },
    'OH': { preset: SP0250Preset.OH, voiced: true,  brightness: 0.4, durationMs: 100 },

    // === Diphthongs (use dominant vowel) ===
    'EY': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.6, durationMs: 130 },
    'AY': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.5, durationMs: 140 },
    'OY': { preset: SP0250Preset.OH, voiced: true,  brightness: 0.4, durationMs: 140 },
    'AW': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.4, durationMs: 130 },
    'OW': { preset: SP0250Preset.OH, voiced: true,  brightness: 0.4, durationMs: 130 },
    'UW': { preset: SP0250Preset.OO, voiced: true,  brightness: 0.3, durationMs: 100 },

    // === Glides / Liquids (voiced, lower energy) ===
    'R*': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.4, durationMs: 70 },
    'RX': { preset: SP0250Preset.AH, voiced: true,  brightness: 0.4, durationMs: 70 },
    'L*': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.3, durationMs: 70 },
    'LX': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.3, durationMs: 70 },
    'W*': { preset: SP0250Preset.OO, voiced: true,  brightness: 0.3, durationMs: 60 },
    'WX': { preset: SP0250Preset.OO, voiced: true,  brightness: 0.3, durationMs: 60 },
    'WH': { preset: SP0250Preset.HH, voiced: false, brightness: 0.3, durationMs: 60 },
    'Y*': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.5, durationMs: 60 },
    'YX': { preset: SP0250Preset.EE, voiced: true,  brightness: 0.5, durationMs: 60 },

    // === Nasals ===
    'M*': { preset: SP0250Preset.NN, voiced: true,  brightness: 0.3, durationMs: 80 },
    'N*': { preset: SP0250Preset.NN, voiced: true,  brightness: 0.4, durationMs: 70 },
    'NX': { preset: SP0250Preset.NN, voiced: true,  brightness: 0.3, durationMs: 80 },

    // === Fricatives ===
    'S*': { preset: SP0250Preset.ZZ, voiced: false, brightness: 0.9, durationMs: 90 },
    'SH': { preset: SP0250Preset.ZZ, voiced: false, brightness: 0.7, durationMs: 90 },
    'F*': { preset: SP0250Preset.HH, voiced: false, brightness: 0.6, durationMs: 80 },
    'TH': { preset: SP0250Preset.HH, voiced: false, brightness: 0.5, durationMs: 80 },
    '/H': { preset: SP0250Preset.HH, voiced: false, brightness: 0.4, durationMs: 60 },
    '/X': { preset: SP0250Preset.HH, voiced: false, brightness: 0.4, durationMs: 60 },
    'Z*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.8, durationMs: 90 },
    'ZH': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.6, durationMs: 80 },
    'V*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.5, durationMs: 70 },
    'DH': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.4, durationMs: 60 },

    // === Affricates ===
    'CH': { preset: SP0250Preset.ZZ, voiced: false, brightness: 0.8, durationMs: 80 },
    'J*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.7, durationMs: 80 },

    // === Stops (brief burst) ===
    'B*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.3, durationMs: 40 },
    'D*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.5, durationMs: 40 },
    'G*': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.4, durationMs: 40 },
    'GX': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.4, durationMs: 40 },
    'P*': { preset: SP0250Preset.HH, voiced: false, brightness: 0.3, durationMs: 40 },
    'T*': { preset: SP0250Preset.HH, voiced: false, brightness: 0.5, durationMs: 40 },
    'K*': { preset: SP0250Preset.HH, voiced: false, brightness: 0.4, durationMs: 40 },
    'KX': { preset: SP0250Preset.HH, voiced: false, brightness: 0.4, durationMs: 40 },

    // === Other ===
    'DX': { preset: SP0250Preset.ZZ, voiced: true,  brightness: 0.4, durationMs: 30 },
    'Q*': { preset: SP0250Preset.AH, voiced: false, brightness: 0.0, durationMs: 10 },

    // === Pause ===
    ' ':  { preset: SP0250Preset.AH, voiced: false, brightness: 0.0, durationMs: 80 },
  };

  return map[samCode] ?? null;
}

/**
 * Convert SAM PhonemeTokens to SP0250 frames.
 */
export function phonemesToSP0250Frames(
  tokens: Array<{ code: string; stress: number }>
): SP0250Frame[] {
  const frames: SP0250Frame[] = [];
  for (const token of tokens) {
    const frame = samToSP0250(token.code);
    if (frame) {
      frames.push(frame);
    }
  }
  return frames;
}
