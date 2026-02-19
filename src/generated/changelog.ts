/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-19T14:35:55.076Z
 *
 * DO NOT EDIT MANUALLY - This file is regenerated on build
 * To add changelog entries, use conventional commit messages:
 *   feat: Add new feature
 *   fix: Fix a bug
 *   perf: Improve performance
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement';
    description: string;
  }[];
}

// Build info
export const BUILD_VERSION = '1.0.924';
export const BUILD_NUMBER = '924';
export const BUILD_HASH = '67728852';
export const BUILD_DATE = '2026-02-19';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.924',
    date: '2026-02-19',
    changes: [
      {
        type: 'fix',
        "description": "Resolve all pre-existing test failures (1219/1219 passing)"
      },
      {
        type: 'fix',
        "description": "Full audit — wet accessor, stale UI defaults, Custom mode sample browser"
      },
      {
        type: 'fix',
        "description": "Groove system — stride formula, active state, MOD pitch priority"
      },
      {
        type: 'fix',
        "description": "Correct defaults — Duck mode, mix 0.5, all EQ bands off"
      },
      {
        type: 'fix',
        "description": "Use additive mix formula so music always passes through"
      },
      {
        type: 'fix',
        "description": "Rename set→setParam, wire ToneEngine parameter dispatch"
      },
      {
        type: 'feature',
        "description": "TumultEditor React component — source, controls, 5-band EQ"
      },
      {
        type: 'feature',
        "description": "TumultEffect.ts — Tone.js wrapper with sample loading"
      },
      {
        type: 'improvement',
        "description": "Precompute clip exponents, env coefficients, hoist playerGain"
      },
      {
        type: 'feature',
        "description": "Worklet — clipper, sample player, envelope follower, processor"
      },
      {
        type: 'feature',
        "description": "Worklet — SVF filter classes (svf_*.cpp 1:1 port)"
      },
      {
        type: 'feature',
        "description": "Worklet — noise generator DSP (noise.cpp 1:1 port)"
      },
      {
        type: 'feature',
        "description": "Bundle 95 sample WAV files"
      },
      {
        type: 'feature',
        "description": "Add Tumult to type system and EffectRegistry"
      },
      {
        type: 'feature',
        "description": "VinylNoise — full vinyl emulator expansion"
      },
      {
        type: 'improvement',
        "description": "Add Tumult implementation plan"
      },
      {
        type: 'improvement',
        "description": "Add Tumult effect port design doc"
      },
      {
        type: 'fix',
        "description": "On/off toggle button is green when active in master effects chain"
      },
      {
        type: 'fix',
        "description": "Active LED is green in master effects chain column"
      },
      {
        type: 'fix',
        "description": "Remove redundant settings button from master effects chain items"
      },
      {
        type: 'fix',
        "description": "Master effects browser — widen chain column, narrow browser column"
      },
      {
        type: 'feature',
        "description": "VinylNoise — individual Hiss and Crackle volume controls"
      },
      {
        type: 'fix',
        "description": "VinylNoise hiss is now constant — LFO no longer modulates it"
      },
      {
        type: 'feature',
        "description": "VinylNoise presets + fix hiss LFO modulation depth"
      },
      {
        type: 'feature',
        "description": "Fix VinylNoise LFO to rotate at exact turntable speed (RPM presets)"
      },
      {
        type: 'fix',
        "description": "Initialize Ramper in VinylNoise worklet — crackles were never firing"
      },
      {
        type: 'fix',
        "description": "VinylNoise audit — wrap LFO phase, fix dispose order, document Ramper divergence"
      },
      {
        type: 'feature',
        "description": "Expose VinylNoise in effect picker"
      },
      {
        type: 'feature',
        "description": "Add VinylNoise effect UI editor"
      },
      {
        type: 'feature',
        "description": "Handle VinylNoise parameter updates in ToneEngine"
      },
      {
        type: 'feature',
        "description": "Wire VinylNoise into InstrumentFactory"
      },
      {
        type: 'feature',
        "description": "Register VinylNoise AudioEffectType"
      },
      {
        type: 'feature',
        "description": "Add VinylNoiseEffect Tone.js wrapper"
      },
      {
        type: 'feature',
        "description": "Add VinylNoise AudioWorklet DSP (viator-rust port)"
      },
      {
        type: 'feature',
        "description": "Sync DJ pitch slider with W effect commands"
      },
      {
        type: 'feature',
        "description": "Add smooth W effect (global pitch shift) with DJ-style sliding"
      },
      {
        type: 'improvement',
        "description": "Add vinyl noise effect design document"
      },
      {
        type: 'fix',
        "description": "Pattern editor and playback improvements"
      },
      {
        type: 'feature',
        "description": "Add Audio-to-MIDI conversion in Sample Editor"
      }
    ]
  },
  {
    version: '2026-02-18',
    date: '2026-02-18',
    changes: [
      {
        type: 'fix',
        "description": "Reduce throttle to 30ms and remove rampTo for more responsive pitch shifting"
      },
      {
        type: 'fix',
        "description": "Use longer throttle interval and smooth BPM ramping for stutter-free pitch shifting"
      },
      {
        type: 'fix',
        "description": "Throttle BPM updates during pitch slider drag to prevent audio dropouts"
      },
      {
        type: 'fix',
        "description": "Update transport store BPM for TrackerReplayer timing sync"
      },
      {
        type: 'fix',
        "description": "Apply global playback rate in TrackerReplayer for MOD samples"
      },
      {
        type: 'fix',
        "description": "Remove unused variables and add missing engine declaration"
      },
      {
        type: 'feature',
        "description": "Add global playback rate for true pitch shifting on Amiga MOD samples"
      },
      {
        type: 'fix',
        "description": "Remove unused Tone import from DJPitchSlider"
      },
      {
        type: 'fix',
        "description": "Coordinate DJ pitch slider with PatternScheduler for accurate BPM control"
      },
      {
        type: 'fix',
        "description": "Center collapsed channels correctly to prevent content shift"
      },
      {
        type: 'fix',
        "description": "Use opaque concave gradient on DJ pitch slider handle"
      }
    ]
  }
];

// Current display version
export const CURRENT_VERSION = FULL_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
