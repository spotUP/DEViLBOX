/**
 * Maps SAM phoneme codes to TMS5220 LPC parameter frames.
 *
 * Each phoneme maps to K1-K10 coefficient indices, energy index, pitch index,
 * and voiced/unvoiced flag. These are fed to the existing setFormants()/setParameter()
 * methods on TMS5220Synth.
 *
 * K coefficient index ranges:
 * - K1: 0-31 (5-bit, controls F1 frequency)
 * - K2: 0-31 (5-bit, controls F2 frequency)
 * - K3: 0-15 (4-bit)
 * - K4-K7: 0-15 (4-bit each)
 * - K8-K10: 0-7 (3-bit each)
 *
 * Vowel presets expanded from the 8 in TMS5220Synth.cpp.
 * Consonant K-coefficients derived from IPA acoustic characteristics.
 */
export interface TMS5220Frame {
  k: number[];       // K1-K10 indices [10 values]
  energy: number;    // Energy index 0-15
  pitch: number;     // Pitch index 0-31 (0=unvoiced, TMC0281 5-bit)
  unvoiced: boolean; // true = noise excitation
  durationMs: number;
}

/**
 * Map a SAM phoneme code to TMS5220 LPC parameters.
 * Returns null for unknown phonemes.
 */
export function samToTMS5220(samCode: string): TMS5220Frame | null {
  // K coefficient indices for TMS5220 lattice filter.
  // K1 (0-31): Controls F1 (jaw openness). Low index=closed, high=open.
  // K2 (0-31): Controls F2 (tongue front/back). Low=back, high=front.
  // K3-K7 (0-15): Higher formants and spectral detail.
  // K8-K10 (0-7): Fine spectral shaping.
  // Energy (0-14): Amplitude. Table: 0,2,4,6,10,14,20,28,40,56,80,112,160,224,320
  // Pitch (0-63): Pitch period. 0=unvoiced. Higher=lower frequency.
  const map: Record<string, TMS5220Frame> = {
    // === Vowels (voiced) ===
    //                            K1  K2  K3  K4  K5  K6  K7  K8  K9  K10
    'IY': { k: [12, 28, 11,  6, 10,  7,  9,  3,  5,  3], energy: 12, pitch: 31, unvoiced: false, durationMs: 150 },
    'IH': { k: [15, 25, 10,  7,  9,  7,  8,  3,  4,  3], energy: 12, pitch: 30, unvoiced: false, durationMs: 120 },
    'EH': { k: [20, 22, 10,  7,  8,  7,  8,  4,  4,  3], energy: 12, pitch: 30, unvoiced: false, durationMs: 140 },
    'AE': { k: [24, 19, 10,  8,  8,  7,  8,  4,  4,  4], energy: 12, pitch: 30, unvoiced: false, durationMs: 150 },
    'AA': { k: [23, 12,  8,  8,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 28, unvoiced: false, durationMs: 160 },
    'AH': { k: [21, 11,  8,  8,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 28, unvoiced: false, durationMs: 130 },
    'AO': { k: [19,  8,  7,  9,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 26, unvoiced: false, durationMs: 150 },
    'UH': { k: [17, 13,  7,  9,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 26, unvoiced: false, durationMs: 120 },
    'AX': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 90 },
    'IX': { k: [14, 23,  9,  7,  9,  7,  8,  3,  4,  3], energy: 10, pitch: 30, unvoiced: false, durationMs: 90 },
    'ER': { k: [18, 16,  9,  9,  6, 10,  7,  5,  4,  4], energy: 12, pitch: 28, unvoiced: false, durationMs: 160 },
    'UX': { k: [14,  6,  6, 10,  7,  8,  8,  5,  4,  4], energy: 12, pitch: 24, unvoiced: false, durationMs: 130 },
    'OH': { k: [19,  8,  7,  9,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 26, unvoiced: false, durationMs: 150 },

    // === Diphthongs ===
    'EY': { k: [20, 22, 10,  7,  8,  7,  8,  4,  4,  3], energy: 12, pitch: 30, unvoiced: false, durationMs: 200 },
    'AY': { k: [23, 12,  8,  8,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 28, unvoiced: false, durationMs: 200 },
    'OY': { k: [19,  8,  7,  9,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 26, unvoiced: false, durationMs: 200 },
    'AW': { k: [23, 12,  8,  8,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 28, unvoiced: false, durationMs: 200 },
    'OW': { k: [19,  8,  7,  9,  7,  8,  8,  4,  4,  4], energy: 12, pitch: 26, unvoiced: false, durationMs: 200 },
    'UW': { k: [14,  6,  6, 10,  7,  8,  8,  5,  4,  4], energy: 12, pitch: 24, unvoiced: false, durationMs: 160 },

    // === Glides / Liquids (voiced, transitional) ===
    'R*': { k: [17, 15,  9,  9,  6, 10,  7,  5,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 100 },
    'RX': { k: [17, 15,  9,  9,  6, 10,  7,  5,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 100 },
    'L*': { k: [16, 20,  7, 10,  5, 10,  6,  5,  3,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 110 },
    'LX': { k: [16, 20,  7, 10,  5, 10,  6,  5,  3,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 110 },
    'W*': { k: [14,  5,  5, 11,  7,  8,  9,  5,  5,  4], energy:  9, pitch: 26, unvoiced: false, durationMs: 80 },
    'WX': { k: [14,  5,  5, 11,  7,  8,  9,  5,  5,  4], energy:  9, pitch: 26, unvoiced: false, durationMs: 80 },
    'WH': { k: [14,  5,  5, 11,  7,  8,  9,  5,  5,  4], energy:  6, pitch:  0, unvoiced: true,  durationMs: 80 },
    'Y*': { k: [12, 28, 11,  6, 10,  7,  9,  3,  5,  3], energy:  9, pitch: 30, unvoiced: false, durationMs: 80 },
    'YX': { k: [12, 28, 11,  6, 10,  7,  9,  3,  5,  3], energy:  9, pitch: 30, unvoiced: false, durationMs: 80 },

    // === Nasals (voiced, nasal resonance via K3/K4 boost) ===
    'M*': { k: [20, 10,  4, 14,  5, 10,  6,  5,  3,  5], energy:  9, pitch: 28, unvoiced: false, durationMs: 120 },
    'N*': { k: [18, 19,  4, 14,  5, 10,  6,  5,  3,  5], energy:  9, pitch: 28, unvoiced: false, durationMs: 100 },
    'NX': { k: [16, 12,  4, 14,  5, 10,  6,  5,  3,  5], energy:  9, pitch: 28, unvoiced: false, durationMs: 120 },

    // === Fricatives (unvoiced noise, high K3/K4 for spectral shaping) ===
    'S*': { k: [10, 28, 14, 12, 11,  5, 10,  2,  6,  2], energy:  8, pitch:  0, unvoiced: true,  durationMs: 140 },
    'SH': { k: [12, 22, 13, 13, 10,  6,  9,  3,  5,  3], energy: 10, pitch:  0, unvoiced: true,  durationMs: 140 },
    'F*': { k: [ 8, 20, 12,  9, 10,  5,  8,  2,  5,  2], energy:  6, pitch:  0, unvoiced: true,  durationMs: 120 },
    'TH': { k: [ 8, 24, 12,  8, 10,  5,  8,  2,  6,  2], energy:  5, pitch:  0, unvoiced: true,  durationMs: 120 },
    '/H': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  6, pitch:  0, unvoiced: true,  durationMs: 80 },
    '/X': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  6, pitch:  0, unvoiced: true,  durationMs: 80 },
    'Z*': { k: [10, 28, 14, 12, 11,  5, 10,  2,  6,  2], energy:  9, pitch: 28, unvoiced: false, durationMs: 130 },
    'ZH': { k: [12, 22, 13, 13, 10,  6,  9,  3,  5,  3], energy:  9, pitch: 28, unvoiced: false, durationMs: 120 },
    'V*': { k: [ 8, 20, 12,  9, 10,  5,  8,  2,  5,  2], energy:  8, pitch: 28, unvoiced: false, durationMs: 100 },
    'DH': { k: [ 8, 24, 12,  8, 10,  5,  8,  2,  6,  2], energy:  8, pitch: 28, unvoiced: false, durationMs: 80 },

    // === Affricates ===
    'CH': { k: [12, 24, 13, 12, 10,  6,  9,  3,  5,  3], energy:  8, pitch:  0, unvoiced: true,  durationMs: 120 },
    'J*': { k: [12, 24, 13, 12, 10,  6,  9,  3,  5,  3], energy:  9, pitch: 28, unvoiced: false, durationMs: 120 },

    // === Stops (burst + brief silence) ===
    'B*': { k: [22, 10,  6, 10,  5,  9,  7,  4,  3,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 60 },
    'D*': { k: [18, 22,  6, 10,  6,  8,  7,  3,  4,  3], energy:  7, pitch: 28, unvoiced: false, durationMs: 60 },
    'G*': { k: [16, 14,  6, 10,  7,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 60 },
    'GX': { k: [16, 14,  6, 10,  7,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 60 },
    'P*': { k: [22, 10,  6, 10,  5,  9,  7,  4,  3,  4], energy:  5, pitch:  0, unvoiced: true,  durationMs: 60 },
    'T*': { k: [18, 22,  6, 10,  6,  8,  7,  3,  4,  3], energy:  6, pitch:  0, unvoiced: true,  durationMs: 60 },
    'K*': { k: [16, 14,  6, 10,  7,  8,  8,  4,  4,  4], energy:  5, pitch:  0, unvoiced: true,  durationMs: 60 },
    'KX': { k: [16, 14,  6, 10,  7,  8,  8,  4,  4,  4], energy:  5, pitch:  0, unvoiced: true,  durationMs: 60 },

    // === Other ===
    'DX': { k: [18, 22,  6, 10,  6,  8,  7,  3,  4,  3], energy:  6, pitch: 28, unvoiced: false, durationMs: 40 },
    'Q*': { k: [ 8,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy:  1, pitch:  0, unvoiced: false, durationMs: 20 },

    // === Pause ===
    ' ':  { k: [ 8,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy:  1, pitch:  0, unvoiced: false, durationMs: 120 },
  };

  return map[samCode] ?? null;
}

/**
 * Interpolate between two frames for coarticulation.
 */
function lerpFrame(from: TMS5220Frame, to: TMS5220Frame, t: number): TMS5220Frame {
  const k = from.k.map((v, i) => Math.round(v + (to.k[i] - v) * t));
  return {
    k,
    energy: Math.round(from.energy + (to.energy - from.energy) * t),
    pitch: to.unvoiced ? 0 : Math.round(from.pitch + (to.pitch - from.pitch) * t),
    unvoiced: t > 0.5 ? to.unvoiced : from.unvoiced,
    durationMs: 25,
  };
}

/**
 * Convert SAM PhonemeTokens to TMS5220 frames with coarticulation transitions.
 */
/** Phoneme categories */
const STOPS = new Set(['P*', 'T*', 'K*', 'KX', 'B*', 'D*', 'G*', 'GX', 'Q*']);
const VOICELESS_STOPS = new Set(['P*', 'T*', 'K*', 'KX']);
const VOWELS = new Set(['IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'UH', 'AX', 'IX', 'ER', 'UX', 'OH']);
const DIPHTHONGS: Record<string, [string, string]> = {
  'EY': ['EH', 'IY'], 'AY': ['AA', 'IY'], 'OY': ['AO', 'IY'],
  'AW': ['AA', 'UX'], 'OW': ['AO', 'UX'], 'UW': ['UX', 'UX'],
};

/**
 * Convert SAM PhonemeTokens to TMS5220 frames with coarticulation,
 * sentence intonation, diphthong glides, and CV energy ramps.
 */
export function phonemesToTMS5220Frames(
  tokens: Array<{ code: string; stress: number }>,
  question = false
): TMS5220Frame[] {
  const rawFrames: TMS5220Frame[] = [];
  const tokenCodes: string[] = [];

  for (const token of tokens) {
    const frame = samToTMS5220(token.code);
    if (frame) {
      const energyBoost = token.stress >= 4 ? 2 : token.stress >= 2 ? 1 : 0;
      const pitchBoost = token.stress >= 4 ? 3 : token.stress >= 2 ? 1 : 0;
      // Vowel reduction: unstressed vowels shorter + more central
      let duration = frame.durationMs;
      let k = [...frame.k];
      if (VOWELS.has(token.code) && token.stress === 0) {
        duration = Math.round(duration * 0.7);
        k[0] = Math.round(k[0] + (16 - k[0]) * 0.3); // K1 toward neutral
        k[1] = Math.round(k[1] + (14 - k[1]) * 0.3); // K2 toward neutral
      }
      rawFrames.push({
        ...frame,
        k,
        durationMs: duration,
        energy: Math.min(14, frame.energy + energyBoost),
        pitch: frame.unvoiced ? 0 : Math.min(31, frame.pitch + pitchBoost),
      });
      tokenCodes.push(token.code);
    }
  }

  if (rawFrames.length === 0) return [];

  // Sentence intonation
  const total = rawFrames.length;
  for (let i = 0; i < total; i++) {
    const f = rawFrames[i];
    if (!f.unvoiced && f.pitch > 0) {
      const pos = i / total;
      if (question) {
        if (pos > 0.7) { const rise = Math.round((pos - 0.7) / 0.3 * 5); f.pitch = Math.min(31, f.pitch + rise); }
      } else {
        if (pos > 0.7) { const drop = Math.round((pos - 0.7) / 0.3 * 4); f.pitch = Math.max(1, f.pitch - drop); }
      }
    }
  }

  const result: TMS5220Frame[] = [];
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
      result.push({ ...curr, durationMs: 15, energy: Math.min(14, curr.energy + 2) });
      // Voiceless stops get brief aspiration (noise burst)
      if (VOICELESS_STOPS.has(code)) {
        const asp = samToTMS5220('/H');
        if (asp) result.push({ ...asp, durationMs: 20, energy: Math.max(1, curr.energy - 1), unvoiced: true, pitch: 0 });
      }
      result.push({ ...curr, durationMs: 15, energy: Math.max(1, curr.energy - 1) });
      continue;
    }

    // Diphthong glides
    const diph = DIPHTHONGS[code];
    if (diph) {
      const sf = samToTMS5220(diph[0]);
      const ef = samToTMS5220(diph[1]);
      if (sf && ef) {
        const steps = Math.max(3, Math.round(curr.durationMs / 30));
        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1);
          result.push({
            ...lerpFrame(
              { ...sf, energy: curr.energy, pitch: curr.pitch, unvoiced: curr.unvoiced },
              { ...ef, energy: curr.energy, pitch: curr.pitch, unvoiced: curr.unvoiced },
              t
            ),
            durationMs: Math.round(curr.durationMs / steps),
          });
        }
        continue;
      }
    }

    // Energy envelope shaping for longer vowels
    const steadyMs = Math.max(25, curr.durationMs - 50);
    if (steadyMs > 75 && VOWELS.has(code)) {
      const attackMs = Math.round(steadyMs * 0.2);
      const sustainMs = Math.round(steadyMs * 0.6);
      const releaseMs = steadyMs - attackMs - sustainMs;
      result.push({ ...curr, durationMs: attackMs, energy: Math.max(1, curr.energy - 2) });
      result.push({ ...curr, durationMs: sustainMs });
      result.push({ ...curr, durationMs: releaseMs, energy: Math.max(1, curr.energy - 3) });
    } else {
      result.push({ ...curr, durationMs: steadyMs });
    }
  }

  return result;
}
