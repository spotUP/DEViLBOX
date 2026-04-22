import type { SynthPreset } from './types';
import type { GTUltraConfig } from '../../types/instrument';

// Helper: cast GTUltraConfig to Record<string, unknown> for SynthPreset.config
const gtu = (c: GTUltraConfig): Record<string, unknown> => c as unknown as Record<string, unknown>;

/**
 * GT Ultra (GoatTracker) SID synth presets.
 *
 * GTUltraConfig values are raw SID register bytes:
 *   ad:        (attack<<4)|decay     — SID ADSR timing
 *   sr:        (sustain<<4)|release
 *   firstwave: waveform bits + gate  — 0x41=pulse, 0x21=saw, 0x11=tri, 0x81=noise
 *   wavePtr/pulsePtr/filterPtr/speedPtr: table indices (0 = no table)
 *
 * These presets use static waveforms (all table pointers = 0) because
 * table data is song-specific. The SID's characteristic grit comes from
 * waveform + ADSR + SID model alone.
 */

// ── Dub/Soundsystem Presets ──────────────────────────────────────────────────

export const GTULTRA_PRESETS: SynthPreset[] = [
  // ═══ Bass ═══
  {
    id: 'gtu-acid-saw',
    name: 'SID Acid Saw',
    description: '303-style sawtooth bass — fast attack, medium decay, gritty SID character',
    category: 'bass',
    config: gtu({
      ad: 0x09,         // A=0 (2ms attack), D=9 (750ms decay)
      sr: 0x00,         // S=0 (no sustain), R=0 (6ms release)
      firstwave: 0x21,  // Sawtooth + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID Acid Saw',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-303-pulse',
    name: 'SID 303 Pulse',
    description: 'Narrow pulse wave — punchy bass with 303 squelch character',
    category: 'bass',
    config: gtu({
      ad: 0x08,         // A=0 (2ms), D=8 (500ms)
      sr: 0x00,         // S=0, R=0 (6ms)
      firstwave: 0x41,  // Pulse + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID 303 Pulse',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-sub-bass',
    name: 'SID Sub Bass',
    description: 'Deep triangle sub-bass — smooth low-end foundation',
    category: 'bass',
    config: gtu({
      ad: 0x09,         // A=0, D=9 (750ms)
      sr: 0xA0,         // S=A (sustain ~63%), R=0
      firstwave: 0x11,  // Triangle + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID Sub Bass',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-steppers-bass',
    name: 'Steppers Bass',
    description: 'Hard saw bass for steppers riddims — short decay, no sustain',
    category: 'bass',
    config: gtu({
      ad: 0x06,         // A=0, D=6 (168ms)
      sr: 0x00,         // S=0, R=0
      firstwave: 0x21,  // Sawtooth + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Steppers Bass',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-digi-bass',
    name: 'Digital Bass',
    description: 'Pulse + saw combined character — gritty digital bass tone',
    category: 'bass',
    config: gtu({
      ad: 0x07,         // A=0, D=7 (300ms)
      sr: 0x50,         // S=5, R=0
      firstwave: 0x61,  // Pulse + Saw combined (0x40|0x20|0x01)
      vibdelay: 0,
      gatetimer: 0,
      name: 'Digital Bass',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },

  // ═══ Lead / Siren ═══
  {
    id: 'gtu-dub-siren',
    name: 'SID Dub Siren',
    description: 'Pulse wave siren — long sustain for sweeping dub siren effect',
    category: 'lead',
    config: gtu({
      ad: 0x20,         // A=2 (16ms), D=0
      sr: 0xF0,         // S=F (full sustain), R=0
      firstwave: 0x41,  // Pulse + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID Dub Siren',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-saw-siren',
    name: 'Saw Siren',
    description: 'Sawtooth siren — harsher, more aggressive dub horn',
    category: 'lead',
    config: gtu({
      ad: 0x30,         // A=3 (32ms), D=0
      sr: 0xF0,         // S=F (full sustain), R=0
      firstwave: 0x21,  // Sawtooth + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Saw Siren',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-sonar-ping',
    name: 'Sonar Ping',
    description: 'Triangle ping — clean sonar stab for dub effects',
    category: 'lead',
    config: gtu({
      ad: 0x04,         // A=0 (2ms), D=4 (114ms)
      sr: 0x00,         // S=0, R=0
      firstwave: 0x11,  // Triangle + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Sonar Ping',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-laser-zap',
    name: 'Laser Zap',
    description: 'Fast pulse stab — sci-fi laser zap for sound system drops',
    category: 'fx',
    config: gtu({
      ad: 0x02,         // A=0, D=2 (48ms)
      sr: 0x00,         // S=0, R=0
      firstwave: 0x41,  // Pulse + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Laser Zap',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },

  // ═══ FX / Percussion ═══
  {
    id: 'gtu-noise-snare',
    name: 'SID Snare Crack',
    description: 'Noise burst — tight snare hit for dub percussion',
    category: 'drum',
    config: gtu({
      ad: 0x04,         // A=0, D=4 (114ms)
      sr: 0x00,         // S=0, R=0
      firstwave: 0x81,  // Noise + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID Snare Crack',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-noise-hat',
    name: 'SID Hi-Hat',
    description: 'Short noise burst — crispy hi-hat',
    category: 'drum',
    config: gtu({
      ad: 0x02,         // A=0, D=2 (48ms)
      sr: 0x00,         // S=0, R=0
      firstwave: 0x81,  // Noise + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'SID Hi-Hat',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-radio-riser',
    name: 'Radio Riser',
    description: 'Slow noise attack — builds tension before a dub drop',
    category: 'fx',
    config: gtu({
      ad: 0xA0,         // A=A (500ms attack), D=0
      sr: 0xF5,         // S=F (full sustain), R=5 (168ms)
      firstwave: 0x81,  // Noise + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Radio Riser',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-sub-swell',
    name: 'Sub Swell',
    description: 'Slow triangle swell — earthquake sub-bass build-up',
    category: 'bass',
    config: gtu({
      ad: 0x80,         // A=8 (100ms attack), D=0
      sr: 0xF7,         // S=F (full sustain), R=7 (300ms release)
      firstwave: 0x11,  // Triangle + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Sub Swell',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },

  // ═══ Pad / Texture ═══
  {
    id: 'gtu-pulse-pad',
    name: 'Pulse Pad',
    description: 'Slow attack pulse — ethereal SID pad for dub washes',
    category: 'pad',
    config: gtu({
      ad: 0x90,         // A=9 (250ms attack), D=0
      sr: 0xFA,         // S=F (full sustain), R=A (1.5s release)
      firstwave: 0x41,  // Pulse + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Pulse Pad',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
  {
    id: 'gtu-saw-pad',
    name: 'Saw Pad',
    description: 'Rich sawtooth pad — warm dub texture layer',
    category: 'pad',
    config: gtu({
      ad: 0xA0,         // A=A (500ms attack), D=0
      sr: 0xFB,         // S=F, R=B (2.4s release)
      firstwave: 0x21,  // Sawtooth + gate
      vibdelay: 0,
      gatetimer: 0,
      name: 'Saw Pad',
      wavePtr: 0,
      pulsePtr: 0,
      filterPtr: 0,
      speedPtr: 0,
    }),
  },
];
