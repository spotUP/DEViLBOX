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
 * Interpolate between two frames for coarticulation.
 * Returns a frame with values blended at ratio t (0=from, 1=to).
 */
function lerpFrame(from: VLM5030Frame, to: VLM5030Frame, t: number): VLM5030Frame {
  const k = from.k.map((v, i) => Math.round(v + (to.k[i] - v) * t));
  return {
    k,
    energy: Math.round(from.energy + (to.energy - from.energy) * t),
    pitch: to.unvoiced ? 0 : Math.round(from.pitch + (to.pitch - from.pitch) * t),
    unvoiced: t > 0.5 ? to.unvoiced : from.unvoiced,
    durationMs: 25, // transition frame = 1 LPC frame
  };
}

/** Phoneme categories for energy shaping */
const STOPS = new Set(['P*', 'T*', 'K*', 'KX', 'B*', 'D*', 'G*', 'GX', 'Q*']);
const VOICELESS_STOPS = new Set(['P*', 'T*', 'K*', 'KX']);

const VOWELS = new Set(['IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'UH', 'AX', 'IX', 'ER', 'UX', 'OH']);
const DIPHTHONGS: Record<string, [string, string]> = {
  'EY': ['EH', 'IY'], 'AY': ['AA', 'IY'], 'OY': ['AO', 'IY'],
  'AW': ['AA', 'UX'], 'OW': ['AO', 'UX'], 'UW': ['UX', 'UX'],
};

/**
 * Convert SAM PhonemeTokens to VLM5030 frames with:
 * - Per-phoneme LPC coefficients
 * - Coarticulation (transition frames between phonemes)
 * - Prosody (stress-based pitch/energy + sentence intonation)
 * - Diphthong glides (smooth formant movement within diphthongs)
 * - Consonant-vowel energy ramps (stops burst then ramp into vowels)
 */
export function phonemesToVLM5030Frames(
  tokens: Array<{ code: string; stress: number }>,
  question = false
): VLM5030Frame[] {
  const rawFrames: VLM5030Frame[] = [];
  const tokenCodes: string[] = [];

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    const frame = samToVLM5030(token.code);
    if (frame) {
      const energyBoost = token.stress >= 4 ? 3 : token.stress >= 2 ? 1 : 0;
      const pitchBoost = token.stress >= 4 ? 2 : token.stress >= 2 ? 1 : 0;

      // Vowel reduction: unstressed vowels become shorter and more central
      let duration = frame.durationMs;
      let k = [...frame.k];
      if (VOWELS.has(token.code) && token.stress === 0) {
        duration = Math.round(duration * 0.7); // shorter
        // Shift K0 toward neutral (index ~48) for schwa-like quality
        k[0] = Math.round(k[0] + (48 - k[0]) * 0.3);
        k[1] = Math.round(k[1] + (8 - k[1]) * 0.3);
      }

      rawFrames.push({
        ...frame,
        k,
        durationMs: duration,
        energy: Math.min(31, frame.energy + energyBoost),
        pitch: frame.unvoiced ? 0 : Math.min(31, frame.pitch + pitchBoost),
      });
      tokenCodes.push(token.code);
    }
  }

  if (rawFrames.length === 0) return [];

  // #7: Nasal coarticulation — nasals shift neighboring vowels' K2 toward nasal range
  const NASALS = new Set(['M*', 'N*', 'NX']);
  for (let i = 0; i < rawFrames.length; i++) {
    if (NASALS.has(tokenCodes[i])) {
      // Affect previous vowel (anticipatory nasalization)
      if (i > 0 && VOWELS.has(tokenCodes[i - 1])) {
        rawFrames[i - 1].k[2] = Math.round(rawFrames[i - 1].k[2] + (10 - rawFrames[i - 1].k[2]) * 0.3);
      }
      // Affect next vowel (carryover nasalization)
      if (i < rawFrames.length - 1 && VOWELS.has(tokenCodes[i + 1])) {
        rawFrames[i + 1].k[2] = Math.round(rawFrames[i + 1].k[2] + (10 - rawFrames[i + 1].k[2]) * 0.2);
      }
    }
  }

  // #8: Final consonant lengthening — last consonant gets 40% longer
  if (rawFrames.length >= 2) {
    const lastCode = tokenCodes[rawFrames.length - 1];
    if (!VOWELS.has(lastCode) && lastCode !== ' ') {
      rawFrames[rawFrames.length - 1].durationMs = Math.round(rawFrames[rawFrames.length - 1].durationMs * 1.4);
    }
  }

  // Sentence-level intonation
  const totalFrames = rawFrames.length;
  for (let i = 0; i < totalFrames; i++) {
    const f = rawFrames[i];
    if (!f.unvoiced && f.pitch > 0) {
      const pos = i / totalFrames;
      if (question) {
        // Questions: pitch rises in last 30%
        if (pos > 0.7) {
          const rise = Math.round((pos - 0.7) / 0.3 * 4);
          f.pitch = Math.min(31, f.pitch + rise);
        }
      } else {
        // Statements: pitch drops in last 30%
        if (pos > 0.7) {
          const drop = Math.round((pos - 0.7) / 0.3 * 3);
          f.pitch = Math.max(1, f.pitch - drop);
        }
      }
    }
  }

  const result: VLM5030Frame[] = [];
  for (let i = 0; i < rawFrames.length; i++) {
    const curr = rawFrames[i];
    const code = tokenCodes[i];

    // Coarticulation: transition FROM previous phoneme
    if (i > 0) {
      const prev = rawFrames[i - 1];
      result.push(lerpFrame(prev, curr, 0.33));
      result.push(lerpFrame(prev, curr, 0.67));
    }

    // Consonant-vowel energy ramps: stops get brief burst then ramp
    if (STOPS.has(code)) {
      // Burst: short high-energy frame
      result.push({ ...curr, durationMs: 15, energy: Math.min(31, curr.energy + 4) });
      // Aspiration: voiceless stops (P/T/K) get a brief noise burst
      if (VOICELESS_STOPS.has(code)) {
        const aspFrame = samToVLM5030('/H'); // use /H (aspiration) formants
        if (aspFrame) {
          result.push({ ...aspFrame, durationMs: 20, energy: Math.min(31, curr.energy - 2), unvoiced: true, pitch: 0 });
        }
      }
      // Ramp down: lower energy
      result.push({ ...curr, durationMs: 15, energy: Math.max(1, curr.energy - 2) });
      continue;
    }

    // Diphthong glides: split into start→end formant glide
    const diph = DIPHTHONGS[code];
    if (diph) {
      const startFrame = samToVLM5030(diph[0]);
      const endFrame = samToVLM5030(diph[1]);
      if (startFrame && endFrame) {
        const totalMs = curr.durationMs;
        const steps = Math.max(3, Math.round(totalMs / 30));
        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          result.push({
            ...lerpFrame(
              { ...startFrame, energy: curr.energy, pitch: curr.pitch, unvoiced: curr.unvoiced },
              { ...endFrame, energy: curr.energy, pitch: curr.pitch, unvoiced: curr.unvoiced },
              t
            ),
            durationMs: Math.round(totalMs / steps),
          });
        }
        continue;
      }
    }

    // Regular phoneme: energy envelope shaping for longer phonemes
    const steadyMs = Math.max(25, curr.durationMs - 50);
    if (steadyMs > 75 && VOWELS.has(code)) {
      // Long vowels: attack (25%) → sustain (50%) → release (25%)
      const attackMs = Math.round(steadyMs * 0.2);
      const sustainMs = Math.round(steadyMs * 0.6);
      const releaseMs = steadyMs - attackMs - sustainMs;
      result.push({ ...curr, durationMs: attackMs, energy: Math.max(1, curr.energy - 3) });
      result.push({ ...curr, durationMs: sustainMs });
      result.push({ ...curr, durationMs: releaseMs, energy: Math.max(1, curr.energy - 4) });
    } else {
      result.push({ ...curr, durationMs: steadyMs });
    }
  }

  return result;
}
