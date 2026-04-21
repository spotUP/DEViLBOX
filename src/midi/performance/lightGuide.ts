/**
 * NKS2 Light Guide — Per-Key Color Maps
 *
 * Generates key color assignments for NI Kontrol S-series keyboards.
 * Colors follow the SDK v2.0.2 drum kit scheme and melodic conventions.
 */

import type { NKSKeyLight } from './types';
import { NKSLightGuideColor } from './types';
import type { SynthType } from '@typedefs/instrument';

// General MIDI drum map: note → { color, name }
const GM_DRUM_MAP: Record<number, { color: NKSLightGuideColor; name: string }> = {
  35: { color: NKSLightGuideColor.RED, name: 'Acoustic Bass Drum' },
  36: { color: NKSLightGuideColor.RED, name: 'Bass Drum 1' },
  37: { color: NKSLightGuideColor.WARM_YELLOW, name: 'Side Stick' },
  38: { color: NKSLightGuideColor.WARM_YELLOW, name: 'Acoustic Snare' },
  39: { color: NKSLightGuideColor.FUCHSIA, name: 'Hand Clap' },
  40: { color: NKSLightGuideColor.WARM_YELLOW, name: 'Electric Snare' },
  41: { color: NKSLightGuideColor.ORANGE, name: 'Low Floor Tom' },
  42: { color: NKSLightGuideColor.CYAN, name: 'Closed Hi-Hat' },
  43: { color: NKSLightGuideColor.ORANGE, name: 'High Floor Tom' },
  44: { color: NKSLightGuideColor.CYAN, name: 'Pedal Hi-Hat' },
  45: { color: NKSLightGuideColor.ORANGE, name: 'Low Tom' },
  46: { color: NKSLightGuideColor.CYAN, name: 'Open Hi-Hat' },
  47: { color: NKSLightGuideColor.ORANGE, name: 'Low-Mid Tom' },
  48: { color: NKSLightGuideColor.ORANGE, name: 'Hi-Mid Tom' },
  49: { color: NKSLightGuideColor.BLUE, name: 'Crash Cymbal 1' },
  50: { color: NKSLightGuideColor.ORANGE, name: 'High Tom' },
  51: { color: NKSLightGuideColor.BLUE, name: 'Ride Cymbal 1' },
  52: { color: NKSLightGuideColor.BLUE, name: 'Chinese Cymbal' },
  53: { color: NKSLightGuideColor.BLUE, name: 'Ride Bell' },
  54: { color: NKSLightGuideColor.ORANGE, name: 'Tambourine' },
  55: { color: NKSLightGuideColor.BLUE, name: 'Splash Cymbal' },
  56: { color: NKSLightGuideColor.ORANGE, name: 'Cowbell' },
  57: { color: NKSLightGuideColor.BLUE, name: 'Crash Cymbal 2' },
  59: { color: NKSLightGuideColor.BLUE, name: 'Ride Cymbal 2' },
  60: { color: NKSLightGuideColor.ORANGE, name: 'Hi Bongo' },
  61: { color: NKSLightGuideColor.ORANGE, name: 'Low Bongo' },
  62: { color: NKSLightGuideColor.ORANGE, name: 'Mute Hi Conga' },
  63: { color: NKSLightGuideColor.ORANGE, name: 'Open Hi Conga' },
  64: { color: NKSLightGuideColor.ORANGE, name: 'Low Conga' },
  69: { color: NKSLightGuideColor.ORANGE, name: 'Cabasa' },
  70: { color: NKSLightGuideColor.ORANGE, name: 'Maracas' },
  75: { color: NKSLightGuideColor.ORANGE, name: 'Claves' },
  76: { color: NKSLightGuideColor.ORANGE, name: 'Hi Wood Block' },
  77: { color: NKSLightGuideColor.ORANGE, name: 'Low Wood Block' },
  80: { color: NKSLightGuideColor.ORANGE, name: 'Mute Triangle' },
  81: { color: NKSLightGuideColor.ORANGE, name: 'Open Triangle' },
};

// Drum-type synths that should use drum color scheme. Exported so
// ChannelNaming + any future classifier can share one source of truth.
export const DRUM_SYNTHS: Set<string> = new Set([
  'DrumMachine', 'BuzzKick', 'BuzzKickXP', 'BuzzTrilok',
  'MembraneSynth', 'MetalSynth', 'NoiseSynth',
  'BuzzDynamite6', 'BuzzFreqBomb',
  'Geonkick', 'TR808', 'TR909',
]);

// Single-sound drum synths and their primary color
const SINGLE_DRUM_COLOR: Partial<Record<string, NKSLightGuideColor>> = {
  'BuzzKick': NKSLightGuideColor.RED,
  'BuzzKickXP': NKSLightGuideColor.RED,
  'MembraneSynth': NKSLightGuideColor.RED,
  'MetalSynth': NKSLightGuideColor.CYAN,
  'NoiseSynth': NKSLightGuideColor.BLUE,
};

/**
 * Get Light Guide key colors for a synth type.
 * Returns per-note color array for NI Kontrol S-series keyboards.
 */
export function getLightGuideForSynth(
  synthType: SynthType,
  noteRange?: { low: number; high: number },
): NKSKeyLight[] {
  const keys: NKSKeyLight[] = [];
  const low = noteRange?.low ?? 0;
  const high = noteRange?.high ?? 127;

  if (DRUM_SYNTHS.has(synthType)) {
    return getLightGuideForDrumSynth(synthType, low, high);
  }

  // Melodic instruments: active range gets TURQUOISE, inactive gets INACTIVE
  for (let note = 0; note <= 127; note++) {
    if (note >= low && note <= high) {
      keys.push({
        note,
        color: NKSLightGuideColor.TURQUOISE,
        brightness: 1.0,
      });
    } else {
      keys.push({
        note,
        color: NKSLightGuideColor.INACTIVE,
        brightness: 0,
      });
    }
  }

  return keys;
}

/**
 * Get Light Guide for drum-type synths using SDK drum color scheme.
 */
function getLightGuideForDrumSynth(
  synthType: string,
  low: number,
  high: number,
): NKSKeyLight[] {
  const keys: NKSKeyLight[] = [];

  // Single-sound drums: one color for active range
  const singleColor = SINGLE_DRUM_COLOR[synthType];
  if (singleColor !== undefined) {
    for (let note = 0; note <= 127; note++) {
      if (note >= low && note <= high) {
        keys.push({ note, color: singleColor, brightness: 1.0 });
      } else {
        keys.push({ note, color: NKSLightGuideColor.INACTIVE, brightness: 0 });
      }
    }
    return keys;
  }

  // Full drum kit: use GM drum map for notes 35-81
  for (let note = 0; note <= 127; note++) {
    const gmEntry = GM_DRUM_MAP[note];
    if (gmEntry && note >= low && note <= high) {
      keys.push({
        note,
        color: gmEntry.color,
        brightness: 1.0,
        name: gmEntry.name.slice(0, 25),
      });
    } else if (note >= low && note <= high) {
      keys.push({ note, color: NKSLightGuideColor.BLUE, brightness: 0.5 });
    } else {
      keys.push({ note, color: NKSLightGuideColor.INACTIVE, brightness: 0 });
    }
  }

  return keys;
}

/**
 * Auto-classify a sample name into a drum color.
 * Used for user drum kits with custom sample assignments.
 */
export function classifySampleColor(sampleName: string): number {
  const lower = sampleName.toLowerCase();
  if (/kick|bass\s*drum|bd\b/i.test(lower)) return NKSLightGuideColor.RED;
  if (/snare|snr|sd\b|rim/i.test(lower)) return NKSLightGuideColor.WARM_YELLOW;
  if (/hat|hh\b|hihat|hi-hat/i.test(lower)) return NKSLightGuideColor.CYAN;
  if (/clap|cp\b/i.test(lower)) return NKSLightGuideColor.FUCHSIA;
  if (/tom\b/i.test(lower)) return NKSLightGuideColor.ORANGE;
  if (/cymbal|crash|ride|splash/i.test(lower)) return NKSLightGuideColor.BLUE;
  if (/perc|conga|bongo|shaker|tamb/i.test(lower)) return NKSLightGuideColor.ORANGE;
  return NKSLightGuideColor.BLUE; // Default for unclassified percussion
}
