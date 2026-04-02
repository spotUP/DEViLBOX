/**
 * DX7 Factory Presets — VCED format byte arrays
 *
 * Each preset is a 156-byte VCED patch that loads directly into the engine
 * via loadSysEx(). Created using configToVCED() from hand-crafted DX7 patches.
 *
 * These are original patch designs, not copies of Yamaha ROM data.
 */
import { configToVCED } from './dx7sysex';

/** Helper: create a VCED preset with name embedded at bytes 145-154 */
function makePreset(name: string, config: Parameters<typeof configToVCED>[0]): Uint8Array {
  const vced = configToVCED(config);
  // Write patch name into bytes 145-154
  for (let i = 0; i < 10; i++) {
    vced[145 + i] = i < name.length ? name.charCodeAt(i) & 0x7F : 32;
  }
  return vced;
}

// Operator helper for concise preset definitions
const op = (
  level: number, coarse: number, fine = 0, detune = 7,
  rates: [number, number, number, number] = [99, 99, 99, 99],
  levels: [number, number, number, number] = [99, 99, 99, 0],
  extra: Partial<{
    mode: number; breakPoint: number; leftDepth: number; rightDepth: number;
    leftCurve: number; rightCurve: number; rateScaling: number;
    ampModSens: number; velocitySens: number;
  }> = {}
) => ({
  level, coarse, fine, detune,
  egRates: rates, egLevels: levels,
  ...extra
});

export const DX7_VCED_PRESETS: { name: string; data: Uint8Array }[] = [
  // ═══════════════════════════════════════
  //  ELECTRIC PIANOS
  // ═══════════════════════════════════════

  { name: 'E.PIANO 1', data: makePreset('E.PIANO 1 ', {
    algorithm: 5, feedback: 6,
    operators: [
      op(99, 1, 0, 7, [72, 76, 99, 71], [99, 88, 96, 0], { rateScaling: 3, velocitySens: 2 }),
      op(75, 14, 0, 7, [95, 50, 35, 78], [99, 75, 0, 0], { velocitySens: 4 }),
      op(86, 1, 0, 7, [95, 29, 20, 50], [99, 95, 0, 0], { rateScaling: 3 }),
      op(55, 1, 0, 0, [77, 36, 41, 71], [99, 67, 0, 0], { velocitySens: 6 }),
      op(99, 1, 0, 7, [68, 82, 90, 50], [99, 95, 95, 0], { rateScaling: 3 }),
      op(78, 1, 0, 7, [96, 25, 25, 67], [99, 75, 0, 0], { velocitySens: 5 }),
    ],
    transpose: 24,
  })},

  { name: 'E.PIANO 2', data: makePreset('E.PIANO 2 ', {
    algorithm: 5, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [84, 65, 90, 60], [99, 90, 96, 0], { rateScaling: 4, velocitySens: 3 }),
      op(70, 7, 0, 8, [90, 45, 30, 70], [99, 60, 0, 0], { velocitySens: 5 }),
      op(82, 1, 0, 6, [88, 35, 25, 55], [99, 90, 0, 0], { rateScaling: 3 }),
      op(50, 1, 0, 1, [72, 40, 45, 65], [99, 55, 0, 0], { velocitySens: 7 }),
      op(96, 1, 0, 7, [72, 75, 85, 55], [99, 92, 92, 0], { rateScaling: 3 }),
      op(82, 1, 0, 7, [92, 28, 28, 60], [99, 68, 0, 0], { velocitySens: 5 }),
    ],
    transpose: 24,
  })},

  { name: 'Tine Piano', data: makePreset('TINE PIANO', {
    algorithm: 5, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [65, 80, 99, 65], [99, 85, 98, 0], { rateScaling: 4, velocitySens: 3 }),
      op(82, 13, 0, 7, [99, 50, 40, 75], [99, 70, 0, 0], { velocitySens: 5 }),
      op(90, 1, 0, 7, [90, 35, 25, 50], [99, 90, 0, 0], { rateScaling: 3 }),
      op(60, 2, 0, 7, [80, 42, 48, 68], [99, 60, 0, 0], { velocitySens: 6 }),
      op(99, 1, 0, 7, [70, 78, 88, 52], [99, 93, 93, 0], { rateScaling: 3 }),
      op(85, 1, 0, 7, [94, 30, 30, 64], [99, 72, 0, 0], { velocitySens: 5 }),
    ],
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  BASS
  // ═══════════════════════════════════════

  { name: 'Solid Bass', data: makePreset('SOLID BASS', {
    algorithm: 0, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [99, 99, 99, 50], [99, 96, 96, 0], { rateScaling: 2 }),
      op(80, 1, 0, 7, [99, 75, 35, 55], [99, 80, 0, 0], { velocitySens: 3 }),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    transpose: 24,
  })},

  { name: 'Slap Bass', data: makePreset('SLAP BASS ', {
    algorithm: 5, feedback: 6,
    operators: [
      op(99, 1, 0, 7, [99, 82, 80, 60], [99, 90, 85, 0], { rateScaling: 2, velocitySens: 4 }),
      op(85, 3, 0, 7, [99, 40, 25, 60], [99, 55, 0, 0], { velocitySens: 6 }),
      op(90, 1, 0, 7, [99, 70, 60, 55], [99, 85, 80, 0], { rateScaling: 2 }),
      op(70, 2, 0, 7, [99, 35, 20, 55], [99, 50, 0, 0], { velocitySens: 5 }),
      op(99, 1, 0, 7, [99, 90, 85, 50], [99, 95, 90, 0]),
      op(60, 1, 0, 7, [99, 30, 20, 50], [99, 40, 0, 0], { velocitySens: 4 }),
    ],
    transpose: 24,
  })},

  { name: 'FM Bass', data: makePreset('FM BASS   ', {
    algorithm: 0, feedback: 6,
    operators: [
      op(99, 1, 0, 7, [99, 90, 90, 45], [99, 95, 95, 0], { rateScaling: 3 }),
      op(88, 2, 0, 7, [99, 65, 40, 55], [99, 75, 0, 0], { velocitySens: 4 }),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  ORGANS
  // ═══════════════════════════════════════

  { name: 'Full Organ', data: makePreset('FULL ORGAN', {
    algorithm: 22, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
      op(90, 2, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
      op(85, 3, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
      op(80, 4, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
      op(75, 6, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
      op(70, 8, 0, 7, [99, 99, 99, 80], [99, 99, 99, 0]),
    ],
    transpose: 24,
  })},

  { name: 'Jazz Organ', data: makePreset('JAZZ ORGAN', {
    algorithm: 31, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
      op(82, 2, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
      op(70, 4, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
      op(60, 6, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
      op(50, 8, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
      op(40, 12, 0, 7, [99, 99, 99, 75], [99, 99, 99, 0]),
    ],
    lfoSpeed: 35, lfoPmd: 10, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  BRASS
  // ═══════════════════════════════════════

  { name: 'Brass 1', data: makePreset('BRASS 1   ', {
    algorithm: 22, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [65, 80, 99, 60], [99, 92, 97, 0], { rateScaling: 2 }),
      op(82, 1, 0, 7, [70, 60, 50, 55], [99, 80, 0, 0], { velocitySens: 3 }),
      op(90, 1, 0, 6, [68, 78, 95, 58], [99, 90, 96, 0], { rateScaling: 2 }),
      op(75, 1, 0, 8, [72, 55, 45, 52], [99, 75, 0, 0], { velocitySens: 4 }),
      op(85, 1, 0, 7, [62, 82, 99, 55], [99, 88, 95, 0]),
      op(60, 1, 0, 7, [80, 50, 40, 50], [99, 65, 0, 0], { velocitySens: 3 }),
    ],
    transpose: 24,
  })},

  { name: 'Soft Brass', data: makePreset('SOFT BRASS', {
    algorithm: 22, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [55, 70, 99, 55], [99, 88, 96, 0], { rateScaling: 2 }),
      op(65, 1, 0, 7, [60, 50, 40, 50], [99, 70, 0, 0], { velocitySens: 4 }),
      op(88, 1, 0, 7, [58, 72, 94, 54], [99, 86, 95, 0], { rateScaling: 2 }),
      op(58, 1, 0, 7, [62, 48, 38, 48], [99, 65, 0, 0], { velocitySens: 5 }),
      op(82, 1, 0, 7, [52, 75, 98, 52], [99, 85, 93, 0]),
      op(50, 1, 0, 7, [68, 45, 35, 46], [99, 60, 0, 0], { velocitySens: 4 }),
    ],
    lfoSpeed: 20, lfoPmd: 8, lfoDelay: 40, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  STRINGS & PADS
  // ═══════════════════════════════════════

  { name: 'Strings 1', data: makePreset('STRINGS 1 ', {
    algorithm: 2, feedback: 4,
    operators: [
      op(99, 1, 0, 7, [40, 65, 99, 45], [99, 88, 96, 0]),
      op(72, 1, 0, 8, [45, 55, 50, 48], [99, 82, 0, 0]),
      op(92, 1, 0, 6, [42, 68, 99, 47], [99, 90, 97, 0]),
      op(65, 1, 0, 5, [48, 52, 48, 45], [99, 78, 0, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 30, lfoPmd: 12, lfoDelay: 25, lfoWave: 0,
    transpose: 24,
  })},

  { name: 'Warm Pad', data: makePreset('WARM PAD  ', {
    algorithm: 2, feedback: 3,
    operators: [
      op(99, 1, 0, 7, [30, 50, 99, 35], [99, 85, 98, 0]),
      op(60, 1, 0, 9, [35, 45, 40, 38], [99, 70, 0, 0]),
      op(88, 1, 0, 5, [32, 52, 97, 37], [99, 87, 97, 0]),
      op(55, 2, 0, 7, [38, 42, 38, 36], [99, 65, 0, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 22, lfoPmd: 15, lfoDelay: 30, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  BELLS & MALLETS
  // ═══════════════════════════════════════

  { name: 'Tubular Bell', data: makePreset('TUBULARBEL', {
    algorithm: 5, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [99, 75, 50, 30], [99, 80, 60, 0], { rateScaling: 5 }),
      op(85, 3, 50, 7, [99, 55, 35, 25], [99, 65, 0, 0]),
      op(90, 1, 0, 7, [99, 72, 48, 28], [99, 78, 58, 0], { rateScaling: 5 }),
      op(78, 7, 0, 7, [99, 50, 30, 22], [99, 60, 0, 0]),
      op(92, 1, 0, 7, [99, 80, 55, 32], [99, 82, 62, 0]),
      op(65, 5, 20, 7, [99, 45, 25, 20], [99, 55, 0, 0]),
    ],
    transpose: 24,
  })},

  { name: 'Marimba', data: makePreset('MARIMBA   ', {
    algorithm: 5, feedback: 6,
    operators: [
      op(99, 1, 0, 7, [99, 50, 25, 15], [99, 55, 30, 0], { rateScaling: 5 }),
      op(75, 4, 0, 7, [99, 35, 15, 10], [99, 40, 0, 0], { velocitySens: 5 }),
      op(85, 1, 0, 7, [99, 48, 22, 12], [99, 52, 28, 0], { rateScaling: 5 }),
      op(60, 10, 0, 7, [99, 30, 12, 8], [99, 35, 0, 0], { velocitySens: 4 }),
      op(90, 1, 0, 7, [99, 55, 28, 18], [99, 58, 32, 0]),
      op(50, 3, 0, 7, [99, 25, 10, 6], [99, 30, 0, 0], { velocitySens: 3 }),
    ],
    transpose: 24,
  })},

  { name: 'Vibraphone', data: makePreset('VIBRAPHONE', {
    algorithm: 5, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [99, 80, 65, 40], [99, 85, 70, 0], { rateScaling: 4 }),
      op(72, 4, 0, 7, [99, 60, 40, 30], [99, 55, 0, 0]),
      op(88, 1, 0, 7, [99, 78, 62, 38], [99, 82, 68, 0], { rateScaling: 4 }),
      op(65, 7, 0, 7, [99, 55, 35, 25], [99, 50, 0, 0]),
      op(92, 1, 0, 7, [99, 82, 68, 42], [99, 87, 72, 0]),
      op(58, 3, 0, 7, [99, 50, 32, 22], [99, 45, 0, 0]),
    ],
    lfoSpeed: 40, lfoAmd: 30, lfoDelay: 10, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  LEADS
  // ═══════════════════════════════════════

  { name: 'Synth Lead', data: makePreset('SYNTH LEAD', {
    algorithm: 0, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [99, 90, 90, 50], [99, 95, 95, 0]),
      op(92, 1, 0, 7, [99, 75, 55, 50], [99, 85, 0, 0], { velocitySens: 3 }),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 35, lfoPmd: 10, lfoDelay: 20, lfoWave: 0,
    transpose: 24,
  })},

  { name: 'Whistle', data: makePreset('WHISTLE   ', {
    algorithm: 0, feedback: 4,
    operators: [
      op(99, 1, 0, 7, [55, 70, 99, 50], [99, 92, 98, 0]),
      op(40, 1, 0, 7, [60, 55, 45, 45], [99, 60, 0, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 45, lfoPmd: 18, lfoDelay: 15, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  PLUCKED / GUITAR
  // ═══════════════════════════════════════

  { name: 'Harpsichord', data: makePreset('HARPSICHO ', {
    algorithm: 5, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [99, 60, 35, 20], [99, 65, 40, 0], { rateScaling: 5, velocitySens: 3 }),
      op(88, 5, 0, 7, [99, 40, 20, 12], [99, 45, 0, 0], { velocitySens: 5 }),
      op(92, 1, 0, 7, [99, 58, 32, 18], [99, 62, 38, 0], { rateScaling: 5 }),
      op(82, 3, 0, 7, [99, 35, 15, 10], [99, 40, 0, 0], { velocitySens: 4 }),
      op(95, 1, 0, 7, [99, 65, 40, 22], [99, 68, 42, 0]),
      op(70, 2, 0, 7, [99, 30, 12, 8], [99, 35, 0, 0], { velocitySens: 3 }),
    ],
    transpose: 24,
  })},

  { name: 'Clavinet', data: makePreset('CLAVINET  ', {
    algorithm: 5, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [99, 55, 30, 18], [99, 60, 35, 0], { rateScaling: 5, velocitySens: 4 }),
      op(90, 6, 0, 7, [99, 38, 18, 10], [99, 42, 0, 0], { velocitySens: 6 }),
      op(88, 1, 0, 7, [99, 52, 28, 16], [99, 57, 32, 0], { rateScaling: 5 }),
      op(80, 4, 0, 7, [99, 32, 14, 8], [99, 36, 0, 0], { velocitySens: 5 }),
      op(92, 1, 0, 7, [99, 58, 33, 20], [99, 62, 37, 0]),
      op(65, 3, 0, 7, [99, 28, 10, 6], [99, 32, 0, 0], { velocitySens: 4 }),
    ],
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  SFX / TEXTURES
  // ═══════════════════════════════════════

  { name: 'Metallic', data: makePreset('METALLIC  ', {
    algorithm: 4, feedback: 7,
    operators: [
      op(99, 1, 0, 7, [99, 70, 50, 25], [99, 75, 55, 0], { rateScaling: 4 }),
      op(85, 1, 41, 7, [99, 55, 35, 20], [99, 60, 0, 0]),
      op(80, 3, 37, 7, [99, 50, 30, 18], [99, 55, 0, 0]),
      op(75, 7, 23, 7, [99, 45, 25, 15], [99, 50, 0, 0]),
      op(88, 1, 0, 7, [99, 68, 48, 23], [99, 72, 52, 0]),
      op(70, 5, 51, 7, [99, 40, 22, 12], [99, 45, 0, 0]),
    ],
    transpose: 24,
  })},

  { name: 'Glass', data: makePreset('GLASS     ', {
    algorithm: 5, feedback: 4,
    operators: [
      op(99, 1, 0, 7, [99, 82, 65, 35], [99, 86, 68, 0], { rateScaling: 5 }),
      op(78, 7, 0, 7, [99, 62, 42, 25], [99, 55, 0, 0]),
      op(85, 1, 0, 7, [99, 80, 62, 32], [99, 84, 66, 0], { rateScaling: 5 }),
      op(72, 11, 0, 7, [99, 58, 38, 22], [99, 50, 0, 0]),
      op(90, 1, 0, 7, [99, 84, 68, 38], [99, 88, 70, 0]),
      op(65, 5, 0, 7, [99, 54, 34, 18], [99, 45, 0, 0]),
    ],
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  WIND
  // ═══════════════════════════════════════

  { name: 'Flute', data: makePreset('FLUTE     ', {
    algorithm: 0, feedback: 3,
    operators: [
      op(99, 1, 0, 7, [55, 72, 99, 48], [99, 90, 97, 0], { rateScaling: 2 }),
      op(50, 1, 0, 7, [58, 52, 42, 42], [99, 55, 0, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 42, lfoPmd: 12, lfoDelay: 20, lfoWave: 0,
    transpose: 24,
  })},

  { name: 'Clarinet', data: makePreset('CLARINET  ', {
    algorithm: 0, feedback: 5,
    operators: [
      op(99, 1, 0, 7, [55, 70, 99, 45], [99, 88, 96, 0], { rateScaling: 2 }),
      op(65, 3, 0, 7, [60, 55, 45, 42], [99, 65, 0, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    lfoSpeed: 38, lfoPmd: 8, lfoDelay: 18, lfoWave: 0,
    transpose: 24,
  })},

  // ═══════════════════════════════════════
  //  INIT VOICE
  // ═══════════════════════════════════════

  { name: 'Init Voice', data: makePreset('INIT VOICE', {
    algorithm: 0, feedback: 0,
    operators: [
      op(99, 1, 0, 7, [99, 99, 99, 99], [99, 99, 99, 0]),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
      op(0, 1, 0, 7),
    ],
    transpose: 24,
  })},
];
