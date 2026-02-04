/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-04T01:16:59.384Z
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
export const BUILD_VERSION = '1.0.1';
export const BUILD_NUMBER = '256';
export const BUILD_HASH = '5b71565';
export const BUILD_DATE = '2026-02-04';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-03',
    changes: [
      {
        type: 'fix',
        "description": "Resolve 13 bugs in synths, stores, and components"
      },
      {
        type: 'fix',
        "description": "Properly handle apostrophes in changelog descriptions and add terser"
      },
      {
        type: 'fix',
        "description": "Escape nested single quotes in changelog description string"
      },
      {
        type: 'fix',
        "description": "Remove problematic single quotes from changelog entry"
      },
      {
        type: 'fix',
        "description": "Resolve nested quote syntax error in changelog"
      },
      {
        type: 'fix',
        "description": "Correctly handle nested quotes in changelog"
      },
      {
        type: 'feature',
        "description": "Add 'Convert to Phonemes' button to SAM synth UI using authentic reciter algorithm"
      },
      {
        type: 'fix',
        "description": "Resolve all TypeScript errors and finalize SAM/V2 Speech integration with UI improvements"
      },
      {
        type: 'feature',
        "description": "Improve SAM synth with XY pad, phoneme guide, and melodic note tracking"
      },
      {
        type: 'feature',
        "description": "Implement Commodore SAM speech synth with dedicated UI and presets"
      },
      {
        type: 'feature',
        "description": "Implement V2 Speech synth UI and wire Nano binary export to UI"
      },
      {
        type: 'feature',
        "description": "Integrate 128 authentic Farbrausch V2 factory presets extracted from presets.v2b"
      },
      {
        type: 'feature',
        "description": "Implement full V2 synth controls with multi-oscillator, dual filter, and modulation support"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors related to missing imports and unused variables"
      },
      {
        type: 'fix',
        "description": "Resolve off-key chip loops and RangeErrors by using original sample rate for loop points and robust clamping"
      },
      {
        type: 'feature',
        "description": "Add preview/jam to LoadPresetModal and fix missing presets in specialized synth editors"
      },
      {
        type: 'feature',
        "description": "Add SpaceLaser and V2 presets to factory list and unify editor headers"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in usePadTriggers hook"
      },
      {
        type: 'fix',
        "description": "Resolve SpaceLaser release error and refine Numpad drum triggers"
      },
      {
        type: 'feature',
        "description": "Restrict drum triggers to Numpad 1-9 and implement NumpadEnter bank swap"
      }
    ]
  },
  {
    version: '2026-02-02',
    date: '2026-02-02',
    changes: [
      {
        type: 'feature',
        "description": "Map drumpad triggers to numeric keyboard (1-9)"
      },
      {
        type: 'feature',
        "description": "Implement quantized drumpad recording in record mode"
      },
      {
        type: 'feature',
        "description": "Add instrument preview to DrumpadEditorModal"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in SamplePackStore export and browser component"
      },
      {
        type: 'fix',
        "description": "Improve SamplePackStore reactivity to ensure uploaded packs appear in UI"
      },
      {
        type: 'fix',
        "description": "Resolve sample jamming beeps by restoring Sampler for standard play and adding load guards"
      },
      {
        type: 'fix',
        "description": "Resolve beeps during sample jamming by favoring Tone.Player for single samples"
      },
      {
        type: 'fix',
        "description": "Debug: add extensive logging to sample pack upload process"
      },
      {
        type: 'fix',
        "description": "Resolve missing Zap icon import in SamplePackBrowser"
      },
      {
        type: 'feature',
        "description": "Enhance SamplePackBrowser jamming with 2-octave tracker layout and JAM indicator"
      },
      {
        type: 'feature',
        "description": "Implement multi-selection and fixed sample preview in SamplePackBrowser"
      },
      {
        type: 'fix',
        "description": "Rename sample files to remove spaces and fix Drumaxia template loading"
      },
      {
        type: 'fix',
        "description": "Resolve Sample Pack upload crashes and add loading UI"
      },
      {
        type: 'feature',
        "description": "Add keyboard and MIDI support for sample preview in SamplePackBrowser"
      },
      {
        type: 'fix',
        "description": "Resolve BaseAudioContext error in V2Synth initialization"
      },
      {
        type: 'fix',
        "description": "Resolve missing default config imports in useInstrumentStore"
      },
      {
        type: 'fix',
        "description": "Resolve final TypeScript errors in ToneEngine and useInstrumentStore"
      },
      {
        type: 'fix',
        "description": "Resolve critical syntax errors in useInstrumentStore"
      },
      {
        type: 'fix',
        "description": "Resolve multiple TypeScript errors in V2 synth and Nano-Exporter"
      },
      {
        type: 'feature',
        "description": "Expand Farbrausch V2 synth with drum presets and demoscene zaps"
      },
      {
        type: 'feature',
        "description": "Add Nano-Exporter for demoscene-grade 4k intro binary packing"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in baking system"
      },
      {
        type: 'feature',
        "description": "Bake instrument effects into samples and restore them on unbake"
      },
      {
        type: 'feature',
        "description": "Implement Pro Bake (multi-sample rendering) for maximum accuracy"
      },
      {
        type: 'feature',
        "description": "Download baked samples and optimize song storage with auto-baking"
      },
      {
        type: 'feature',
        "description": "Add Precalc/Bake functionality to instrument editors"
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
