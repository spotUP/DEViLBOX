/**
 * Neo Geo preset bank: one table of FM voices and one of SSG voices, generated for both
 * YM2610 (FurnaceOPNB) and YM2610B (FurnaceOPNBB). The two chips share the FM operator
 * structure and the SSG register set, so only the label, synth type, chip type and the
 * SSG preview channel differ (YM2610: FM 0-3, SSG 4-6. YM2610B: FM 0-5, SSG 6-8).
 *
 * ADPCM-A / ADPCM-B are not in this bank: DEViLBOX has no sample-upload path for the
 * OPNB synth instruments (the Furnace importer maps both to 'Sampler'), so a preset there
 * would be silent.
 */
import type { InstrumentPreset } from '@typedefs/instrument';
import type { FurnaceMacro } from '@typedefs/instrument/furnace';
import { op } from './furnacePresets';
import { fmOperatorsFromManualOrder } from '../lib/furnace/fmOperatorModel';
import { DIV_INS_AY } from '../lib/export/FurnaceInstrumentEncoder';

/** Operator shorthand: mult, tl, ar, dr, d2r, sl, rr, dt. */
export type OpTuple = [mult: number, tl: number, ar: number, dr: number, d2r: number, sl: number, rr: number, dt: number];
export interface NeoGeoFmVoice {
  name: string; algorithm: number; feedback: number; ops: [OpTuple, OpTuple, OpTuple, OpTuple]; volume?: number;
}
export interface NeoGeoSsgVoice { name: string; macros: FurnaceMacro[]; volume?: number }

const fm = (name: string, algorithm: number, feedback: number, ops: NeoGeoFmVoice['ops'], volume = -8): NeoGeoFmVoice =>
  ({ name, algorithm, feedback, ops, volume });

/** Macro slots as the dispatch encoder reads them: 0 volume, 1 arpeggio, 2 duty (noise frequency), 3 wave (1 tone, 2 noise, 3 both). */
const mac = (code: number, data: number[], loop = 255): FurnaceMacro => ({ code, type: code, data, loop, release: 255, mode: 0 });
const ssg = (name: string, macros: FurnaceMacro[], volume = -10): NeoGeoSsgVoice => ({ name, macros, volume });

/** FM voices. Names carry the category first. The first eight keep the original role names ("FM Lead", "FM Bass", ...) the New Song Wizard picks by. */
export const NEO_GEO_FM_VOICES: NeoGeoFmVoice[] = [
  // --- Wizard roles (original eight) ---
  fm('Lead', 4, 6, [[1, 22, 31, 6, 0, 2, 6, 0], [1, 4, 31, 5, 0, 3, 7, 0], [2, 30, 31, 8, 0, 3, 7, 2], [1, 2, 31, 6, 0, 2, 8, -1]]),
  fm('Bass', 0, 5, [[1, 28, 31, 12, 0, 4, 8, 0], [1, 34, 31, 14, 0, 5, 8, 0], [1, 20, 31, 10, 0, 3, 8, 0], [1, 0, 31, 8, 2, 3, 9, 0]]),
  fm('Chord', 2, 3, [[1, 36, 24, 4, 0, 3, 5, 1], [2, 40, 22, 5, 0, 4, 5, -2], [1, 18, 26, 3, 0, 2, 6, 3], [1, 6, 20, 3, 0, 2, 6, -1]]),
  fm('Arp', 5, 2, [[3, 26, 31, 18, 0, 8, 10, 0], [1, 10, 31, 16, 0, 7, 10, 1], [2, 14, 31, 16, 0, 7, 10, -1], [1, 8, 31, 15, 0, 6, 11, 0]]),
  fm('Pad', 7, 4, [[1, 22, 14, 2, 0, 1, 4, 2], [2, 26, 12, 2, 0, 1, 4, -2], [1, 24, 13, 3, 0, 2, 4, 1], [4, 30, 12, 3, 0, 2, 5, -3]]),
  fm('Pluck', 3, 4, [[2, 30, 31, 20, 0, 10, 12, 0], [1, 20, 31, 18, 0, 9, 12, 0], [5, 38, 31, 22, 0, 12, 13, 1], [1, 0, 31, 16, 0, 8, 11, 0]]),
  fm('Bell', 4, 1, [[7, 36, 31, 14, 0, 9, 9, 0], [1, 8, 31, 12, 0, 8, 8, 0], [14, 44, 31, 16, 0, 11, 9, 3], [1, 6, 31, 10, 0, 7, 8, 0]]),
  fm('Brass', 6, 5, [[1, 18, 20, 4, 0, 2, 6, 0], [1, 10, 22, 5, 0, 3, 7, 0], [1, 12, 22, 5, 0, 3, 7, 1], [2, 14, 24, 6, 0, 3, 7, -1]]),

  // --- Basses ---
  fm('Bass Slap', 0, 6, [[1, 30, 31, 14, 0, 4, 8, 0], [2, 28, 31, 18, 4, 6, 8, 0], [1, 26, 31, 12, 0, 4, 8, 0], [1, 0, 31, 10, 2, 3, 9, 0]]),
  fm('Bass Synth', 4, 7, [[1, 24, 31, 8, 0, 2, 7, 0], [1, 0, 31, 8, 1, 2, 8, 0], [1, 30, 31, 9, 0, 2, 7, 1], [1, 2, 31, 9, 1, 2, 8, 0]]),
  fm('Bass Finger', 2, 3, [[1, 38, 31, 16, 0, 6, 9, 0], [3, 34, 31, 20, 3, 7, 9, 0], [1, 22, 31, 12, 0, 4, 9, 0], [1, 0, 31, 12, 3, 4, 10, 0]]),
  fm('Bass Sub', 0, 1, [[1, 60, 31, 4, 0, 1, 8, 0], [1, 70, 31, 4, 0, 1, 8, 0], [1, 50, 31, 4, 0, 1, 8, 0], [1, 0, 31, 4, 0, 1, 9, 0]], -6),
  fm('Bass Acid', 4, 7, [[1, 18, 31, 12, 2, 5, 6, 0], [1, 0, 31, 12, 2, 5, 7, 0], [2, 22, 31, 14, 2, 6, 6, -1], [1, 4, 31, 14, 2, 6, 7, 0]]),
  fm('Bass Rubber', 1, 5, [[1, 32, 31, 10, 0, 3, 8, 0], [1, 36, 31, 10, 0, 3, 8, 1], [2, 30, 31, 12, 0, 4, 8, 0], [1, 0, 31, 9, 1, 3, 9, 0]]),
  fm('Bass Growl', 6, 7, [[1, 14, 31, 8, 0, 2, 7, 0], [3, 20, 31, 9, 0, 3, 7, 2], [1, 6, 31, 8, 1, 2, 8, -2], [1, 4, 31, 8, 1, 2, 8, 0]]),

  // --- Leads ---
  fm('Lead Saw', 4, 7, [[1, 20, 31, 4, 0, 1, 7, 0], [1, 2, 31, 4, 0, 1, 7, 0], [2, 26, 31, 5, 0, 2, 7, 1], [1, 2, 31, 4, 0, 1, 8, -1]]),
  fm('Lead Square', 3, 4, [[1, 34, 31, 3, 0, 1, 6, 0], [3, 40, 31, 4, 0, 2, 6, 0], [1, 16, 31, 3, 0, 1, 6, 0], [1, 0, 31, 3, 0, 1, 7, 0]]),
  fm('Lead Sync', 4, 6, [[5, 24, 31, 5, 0, 2, 7, 1], [1, 4, 31, 5, 0, 2, 7, 0], [3, 28, 31, 6, 0, 2, 7, -2], [1, 3, 31, 5, 0, 2, 8, 0]]),
  fm('Lead Screaming', 5, 7, [[2, 12, 31, 4, 0, 1, 7, 0], [1, 8, 31, 4, 0, 1, 7, 3], [4, 16, 31, 5, 0, 2, 7, -3], [1, 6, 31, 4, 0, 1, 8, 0]]),
  fm('Lead Soft Flute', 4, 2, [[1, 40, 22, 2, 0, 1, 6, 0], [1, 6, 24, 3, 0, 1, 7, 0], [2, 52, 20, 2, 0, 1, 6, 1], [1, 8, 26, 3, 0, 1, 8, 0]]),

  // --- Pads and strings ---
  fm('Pad Warm', 7, 3, [[1, 26, 12, 2, 0, 1, 5, 1], [1, 24, 11, 2, 0, 1, 5, -1], [2, 28, 13, 3, 0, 2, 5, 2], [1, 22, 12, 2, 0, 1, 5, -2]]),
  fm('Strings Ensemble', 5, 2, [[1, 30, 16, 2, 0, 1, 5, 2], [1, 16, 18, 2, 0, 1, 5, -2], [1, 18, 17, 2, 0, 1, 5, 3], [2, 20, 18, 3, 0, 1, 6, -3]]),
  fm('Strings Slow Attack', 7, 1, [[1, 30, 8, 1, 0, 1, 4, 1], [1, 28, 8, 1, 0, 1, 4, -1], [2, 32, 9, 1, 0, 1, 4, 2], [1, 26, 8, 1, 0, 1, 4, -2]]),
  fm('Pad Glass', 4, 2, [[3, 34, 14, 3, 0, 2, 5, 0], [1, 14, 14, 3, 0, 2, 5, 1], [6, 44, 12, 3, 0, 3, 5, -1], [1, 12, 14, 3, 0, 2, 6, 0]]),

  // --- Brass and horns ---
  fm('Brass Section', 5, 6, [[1, 20, 24, 3, 0, 1, 6, 0], [1, 12, 26, 4, 0, 2, 7, 1], [1, 14, 26, 4, 0, 2, 7, -1], [1, 10, 28, 4, 0, 2, 7, 0]]),
  fm('Brass Stab', 6, 6, [[1, 16, 31, 12, 0, 5, 9, 0], [1, 8, 31, 14, 0, 6, 9, 1], [2, 10, 31, 14, 0, 6, 9, -1], [1, 8, 31, 14, 0, 6, 10, 0]]),
  fm('Horn French', 4, 4, [[1, 36, 18, 3, 0, 1, 6, 0], [1, 8, 20, 3, 0, 2, 7, 0], [1, 40, 16, 3, 0, 1, 6, 1], [1, 10, 22, 3, 0, 2, 7, 0]]),

  // --- Organs ---
  fm('Organ Church', 7, 0, [[1, 20, 31, 0, 0, 0, 8, 0], [2, 24, 31, 0, 0, 0, 8, 0], [4, 28, 31, 0, 0, 0, 8, 0], [8, 36, 31, 0, 0, 0, 8, 0]]),
  fm('Organ Rock', 7, 5, [[1, 18, 31, 0, 0, 0, 9, 0], [1, 22, 31, 0, 0, 0, 9, 2], [3, 30, 31, 0, 0, 0, 9, -2], [2, 24, 31, 0, 0, 0, 9, 0]]),
  fm('Organ Reed', 5, 3, [[1, 28, 31, 1, 0, 1, 8, 0], [2, 14, 31, 1, 0, 1, 8, 0], [1, 18, 31, 1, 0, 1, 8, 1], [3, 22, 31, 1, 0, 1, 8, 0]]),

  // --- Electric pianos ---
  fm('E-Piano Tine', 4, 5, [[14, 38, 31, 14, 0, 9, 9, 0], [1, 6, 31, 10, 2, 7, 8, 0], [1, 24, 31, 12, 0, 8, 9, 1], [1, 4, 31, 9, 2, 6, 8, 0]]),
  fm('E-Piano Warm', 2, 4, [[1, 34, 31, 12, 0, 7, 8, 0], [1, 30, 31, 14, 2, 8, 8, 1], [14, 40, 31, 16, 0, 10, 9, 0], [1, 2, 31, 8, 2, 5, 8, -1]]),
  fm('E-Piano Bright', 5, 3, [[1, 26, 31, 14, 0, 8, 9, 0], [7, 22, 31, 16, 0, 9, 9, 0], [1, 10, 31, 11, 2, 6, 8, 1], [1, 6, 31, 10, 2, 6, 8, -1]]),

  // --- Bells and mallets ---
  fm('Bell Tubular', 4, 1, [[9, 34, 31, 10, 0, 7, 7, 0], [1, 10, 31, 8, 0, 6, 7, 0], [13, 46, 31, 12, 0, 9, 8, 2], [1, 8, 31, 8, 0, 5, 7, 0]]),
  fm('Mallet Marimba', 4, 2, [[4, 30, 31, 22, 0, 12, 13, 0], [1, 8, 31, 18, 0, 10, 12, 0], [10, 44, 31, 24, 0, 13, 13, 0], [1, 8, 31, 18, 0, 10, 12, 0]]),
  fm('Mallet Vibraphone', 4, 3, [[3, 38, 31, 8, 0, 6, 7, 0], [1, 8, 31, 6, 0, 5, 6, 1], [3, 50, 31, 8, 0, 7, 7, -1], [1, 8, 31, 6, 0, 4, 6, 0]]),
  fm('Bell Music Box', 3, 2, [[8, 40, 31, 16, 0, 11, 10, 0], [5, 36, 31, 18, 0, 12, 10, 0], [1, 16, 31, 14, 0, 9, 10, 0], [1, 2, 31, 12, 0, 8, 10, 1]]),

  // --- Plucks and guitars ---
  fm('Guitar Nylon', 4, 4, [[1, 36, 31, 16, 0, 8, 10, 0], [1, 6, 31, 14, 2, 7, 10, 0], [2, 42, 31, 18, 0, 10, 10, 1], [1, 6, 31, 14, 2, 7, 10, -1]]),
  fm('Guitar Steel', 5, 5, [[2, 28, 31, 18, 0, 9, 10, 0], [1, 12, 31, 16, 2, 8, 10, 1], [3, 24, 31, 18, 0, 9, 10, -1], [1, 10, 31, 14, 2, 7, 10, 0]]),
  fm('Guitar Distortion', 6, 7, [[1, 10, 31, 6, 0, 2, 8, 0], [2, 14, 31, 6, 0, 2, 8, 3], [1, 8, 31, 6, 0, 2, 8, -3], [1, 6, 31, 6, 0, 2, 9, 0]]),
  fm('Pluck Harp', 3, 3, [[3, 32, 31, 14, 0, 8, 9, 1], [1, 14, 31, 12, 0, 7, 9, 0], [2, 40, 31, 16, 0, 9, 9, -1], [1, 0, 31, 12, 1, 6, 9, 0]]),
  fm('Pluck Koto', 4, 6, [[2, 26, 31, 20, 0, 11, 11, 0], [1, 8, 31, 16, 2, 9, 11, 0], [5, 34, 31, 22, 0, 12, 11, 2], [1, 6, 31, 16, 2, 9, 11, 0]]),

  // --- Choir and voice ---
  fm('Choir Aah', 5, 3, [[1, 34, 14, 2, 0, 1, 5, 1], [2, 20, 16, 3, 0, 2, 6, -1], [3, 24, 15, 3, 0, 2, 6, 2], [1, 18, 16, 3, 0, 2, 6, 0]]),
  fm('Voice Ooh', 4, 1, [[1, 44, 16, 2, 0, 1, 6, 0], [1, 10, 18, 3, 0, 1, 6, 1], [1, 48, 14, 2, 0, 1, 6, -1], [1, 12, 18, 3, 0, 1, 7, 0]]),
  fm('Voice Formant', 6, 5, [[2, 24, 20, 4, 0, 2, 6, 0], [3, 18, 20, 4, 0, 2, 6, 2], [5, 30, 18, 4, 0, 3, 6, -2], [1, 12, 22, 4, 0, 2, 7, 0]]),

  // --- Effects ---
  fm('FX Sweep', 4, 7, [[7, 10, 31, 2, 0, 1, 5, 3], [1, 0, 31, 2, 0, 1, 5, 0], [13, 8, 31, 2, 0, 1, 5, -3], [1, 2, 31, 2, 0, 1, 6, 0]]),
  fm('FX Laser', 4, 7, [[15, 4, 31, 22, 0, 12, 12, 0], [1, 0, 31, 20, 0, 12, 12, 0], [11, 6, 31, 24, 0, 13, 12, 0], [1, 2, 31, 20, 0, 12, 12, 0]]),
  fm('FX Riser', 7, 6, [[3, 30, 6, 1, 0, 0, 3, 3], [5, 28, 6, 1, 0, 0, 3, -3], [7, 26, 6, 1, 0, 0, 3, 2], [9, 24, 6, 1, 0, 0, 3, -2]]),
  fm('FX Zap', 1, 7, [[12, 6, 31, 26, 0, 14, 14, 0], [15, 10, 31, 26, 0, 14, 14, 2], [3, 8, 31, 24, 0, 13, 14, -2], [1, 0, 31, 22, 0, 13, 14, 0]]),

  // --- FM percussion ---
  fm('Perc Kick', 0, 7, [[1, 12, 31, 22, 8, 14, 15, 0], [1, 16, 31, 20, 8, 14, 15, 0], [1, 10, 31, 20, 8, 13, 15, 0], [1, 0, 31, 18, 10, 12, 15, 0]], -4),
  fm('Perc Snare', 4, 7, [[13, 6, 31, 26, 0, 14, 14, 0], [1, 0, 31, 24, 0, 13, 14, 0], [15, 10, 31, 28, 0, 15, 14, 3], [1, 4, 31, 22, 4, 12, 14, 0]], -4),
  fm('Perc Tom', 0, 5, [[1, 22, 31, 20, 4, 12, 14, 0], [1, 26, 31, 18, 4, 12, 14, 0], [1, 18, 31, 18, 4, 11, 14, 0], [1, 0, 31, 16, 6, 11, 14, 0]], -4),
  fm('Perc Clap', 7, 7, [[11, 0, 31, 28, 0, 15, 13, 0], [13, 4, 31, 26, 0, 14, 13, 2], [9, 8, 31, 28, 0, 15, 13, -2], [15, 2, 31, 27, 0, 15, 13, 0]], -4),
  fm('Perc Hat', 7, 7, [[15, 10, 31, 31, 0, 15, 15, 0], [13, 12, 31, 30, 0, 15, 15, 3], [11, 14, 31, 31, 0, 15, 15, -3], [14, 8, 31, 31, 0, 15, 15, 1]], -6),
  fm('Perc Cymbal', 7, 7, [[15, 14, 31, 24, 6, 13, 10, 2], [13, 16, 31, 22, 6, 12, 10, -2], [11, 18, 31, 24, 6, 13, 10, 3], [14, 12, 31, 22, 6, 12, 10, -3]], -6),
];

/** SSG voices (tone, noise, volume, arpeggio and noise-frequency macros). The envelope shape register is not reachable through the dispatch macros, so no envelope-shape presets exist. */
export const NEO_GEO_SSG_VOICES: NeoGeoSsgVoice[] = [
  ssg('Lead Square', [mac(0, [15]), mac(3, [1])]),
  ssg('Lead Decay', [mac(0, [15, 15, 14, 13, 12, 11, 10, 9, 9, 8]), mac(3, [1])]),
  ssg('Lead Octave', [mac(0, [15]), mac(3, [1]), mac(1, [0, 0, 0, 12, 12, 12], 0)]),
  ssg('Arp Major', [mac(0, [15]), mac(3, [1]), mac(1, [0, 4, 7, 12], 0)]),
  ssg('Arp Minor', [mac(0, [15]), mac(3, [1]), mac(1, [0, 3, 7, 12], 0)]),
  ssg('Arp Octave', [mac(0, [15]), mac(3, [1]), mac(1, [0, 12], 0)]),
  ssg('Bass Pluck', [mac(0, [15, 13, 11, 9, 7, 6, 5, 4]), mac(3, [1])], -8),
  ssg('Bass Sustain', [mac(0, [15]), mac(3, [1]), mac(1, [-12])], -8),
  ssg('Pad Swell', [mac(0, [3, 5, 7, 9, 11, 13, 15]), mac(3, [1])]),
  ssg('Pad Tremolo', [mac(0, [15, 13, 11, 9, 11, 13], 0), mac(3, [1])]),
  ssg('Noise Hat Closed', [mac(0, [15, 8, 3, 0]), mac(2, [24]), mac(3, [2])]),
  ssg('Noise Hat Open', [mac(0, [15, 13, 11, 9, 7, 5, 3, 2, 1]), mac(2, [20]), mac(3, [2])]),
  ssg('Noise Snare', [mac(0, [15, 12, 8, 5, 3, 1]), mac(2, [12]), mac(3, [3])]),
  ssg('Noise Kick', [mac(0, [15, 14, 12, 9, 6, 3]), mac(1, [-24, -24, -30, -36, -36, -36]), mac(2, [31, 28, 24, 20, 20, 20]), mac(3, [3])], -6),
  ssg('Noise Crash', [mac(0, [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), mac(2, [8]), mac(3, [2])]),
];

const NEO_GEO_SSG_CHANNEL = { FurnaceOPNB: 4, FurnaceOPNBB: 6 } as const;

/** Every Neo Geo preset of one chip: FM voices first (original role names lead), then SSG voices. */
export const neoGeoPresets = (label: string, synthType: 'FurnaceOPNB' | 'FurnaceOPNBB', chipType: number): InstrumentPreset['config'][] => [
  ...NEO_GEO_FM_VOICES.map((v) => ({
    name: `${label} FM ${v.name}`, type: 'synth' as const, synthType, volume: v.volume ?? -8, pan: 0, effects: [],
    furnace: {
      chipType, algorithm: v.algorithm, feedback: v.feedback, ops: 4,
      // The voice tuples below list operators 1, 2, 3, 4 as the chip manual numbers them; the config stores 1, 3, 2, 4.
      operators: fmOperatorsFromManualOrder(v.ops).map(([mult, tl, ar, dr, d2r, sl, rr, dt]) => op({ mult, tl, ar, dr, d2r, sl, rr, dt })),
      macros: [] as FurnaceMacro[], opMacros: [] as never[], wavetables: [] as never[],
    },
  })),
  ...NEO_GEO_SSG_VOICES.map((v) => ({
    name: `${label} SSG ${v.name}`, type: 'synth' as const, synthType, volume: v.volume ?? -10, pan: 0, effects: [],
    furnace: {
      // divInsType marks the voice as SSG: without it the type is inferred from the chip (FM), so the
      // pattern editor refuses it on SSG channels and the Furnace exporter writes it as an FM instrument.
      chipType, divInsType: DIV_INS_AY, previewChannel: NEO_GEO_SSG_CHANNEL[synthType], algorithm: 4, feedback: 0, ops: 4,
      operators: [op({ tl: 127, ar: 0, rr: 15 }), op({ tl: 0, ar: 31, rr: 15 }), op({ tl: 127, ar: 0, rr: 15 }), op({ tl: 0, ar: 31, rr: 15 })],
      macros: v.macros.map((m) => ({ ...m, data: [...m.data] })), opMacros: [] as never[], wavetables: [] as never[],
    },
  })),
];
