/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-02T21:50:29.614Z
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
export const BUILD_NUMBER = '216';
export const BUILD_HASH = '7c97420';
export const BUILD_DATE = '2026-02-02';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-02',
    changes: [
      {
        type: 'fix',
        description: 'Resolve critical syntax errors in useInstrumentStore'
      },
      {
        type: 'fix',
        description: 'Resolve multiple TypeScript errors in V2 synth and Nano-Exporter'
      },
      {
        type: 'feature',
        description: 'Expand Farbrausch V2 synth with drum presets and demoscene zaps'
      },
      {
        type: 'feature',
        description: 'Add Nano-Exporter for demoscene-grade 4k intro binary packing'
      },
      {
        type: 'fix',
        description: 'Resolve TypeScript errors in baking system'
      },
      {
        type: 'feature',
        description: 'Bake instrument effects into samples and restore them on unbake'
      },
      {
        type: 'feature',
        description: 'Implement Pro Bake (multi-sample rendering) for maximum accuracy'
      },
      {
        type: 'feature',
        description: 'Download baked samples and optimize song storage with auto-baking'
      },
      {
        type: 'feature',
        description: 'Add Precalc/Bake functionality to instrument editors'
      },
      {
        type: 'fix',
        description: 'Resolve TypeScript errors in SpaceLaser and LoadPresetModal'
      },
      {
        type: 'feature',
        description: 'Add 20 factory presets for Space Laser synth'
      },
      {
        type: 'feature',
        description: 'Add Space Laser synth for classic reggae and anime effects'
      },
      {
        type: 'fix',
        description: 'Convert Casio MT-40 samples to standard WAV for browser compatibility'
      },
      {
        type: 'feature',
        description: 'Add Casio MT-40 default sample pack'
      },
      {
        type: 'feature',
        description: 'Enhance TD-3 pattern transfer with file support and improve sample pack cover detection'
      },
      {
        type: 'improvement',
        description: 'Comprehensive optimization of audio engine, worklets, build, and UI'
      },
      {
        type: 'feature',
        description: 'Restore sample pack upload functionality and improve version display'
      },
      {
        type: 'fix',
        description: 'Resolve require is not defined ReferenceError in toolbar'
      },
      {
        type: 'fix',
        description: 'Ensure all instruments have presets dropdown using FACTORY_PRESETS'
      },
      {
        type: 'fix',
        description: 'Refactor high-DPI scaling to prevent React attribute conflicts and cumulative scaling'
      },
      {
        type: 'feature',
        description: 'Expand factory presets, quicktips, and update changelog'
      },
      {
        type: 'fix',
        description: 'Implement high-DPI scaling and resolve oscilloscope frame clearing'
      },
      {
        type: 'fix',
        description: 'Synchronize visuals with audio clock and improve transport stability'
      },
      {
        type: 'improvement',
        description: 'Unify instrument editors and delete legacy standalone editors'
      },
      {
        type: 'feature',
        description: 'Resolve audio drift, enhance JC303/Buzzmachine worklets and implement absolute tick timing'
      }
    ]
  },
  {
    version: '2026-02-01',
    date: '2026-02-01',
    changes: [
      {
        type: 'fix',
        description: 'Robust native context retrieval for all worklets and fix synth disposal race conditions'
      },
      {
        type: 'fix',
        description: 'Use JC303StyledKnobPanel in tracker view and fix ToneEngine context init'
      },
      {
        type: 'fix',
        description: 'Fix AudioWorklet context errors and enable real-time tuning/waveform updates for JC303'
      },
      {
        type: 'fix',
        description: 'Fix knob value loss due to stale closures and remove default delay from DT303 preset'
      },
      {
        type: 'feature',
        description: 'Add JC303 engine (Open303 WASM) with custom UI, set as default TB-303 engine, and fix AudioWorklet context issues'
      },
      {
        type: 'feature',
        description: 'Update MIDI toolbar, DubSiren controls, and app integration'
      },
      {
        type: 'improvement',
        description: 'Update InstrumentFactory, ToneEngine, and synth implementations'
      },
      {
        type: 'feature',
        description: 'Implement NKS (Native Kontrol Standard) integration with Akai hardware support'
      }
    ]
  },
  {
    version: '2026-01-31',
    date: '2026-01-31',
    changes: [
      {
        type: 'feature',
        description: 'Add new utility libraries for audio parsing and MIDI knob banks'
      },
      {
        type: 'improvement',
        description: 'Enhance UI components, update project configurations, and generate changelog'
      },
      {
        type: 'feature',
        description: 'Introduce MAME, Dub Siren, and Synare instruments with WASM modules'
      },
      {
        type: 'feature',
        description: 'Implement core engine enhancements and assembly updates'
      },
      {
        type: 'feature',
        description: 'Add Dub Siren synth'
      },
      {
        type: 'feature',
        description: 'Add Drumpad Editor for custom pad mapping'
      },
      {
        type: 'fix',
        description: 'Resolve integration issues from MIDI and engine updates'
      },
      {
        type: 'fix',
        description: 'Implement scheduled playback for TB303AccurateSynth'
      },
      {
        type: 'fix',
        description: 'Integrate TB303AccurateSynth and resolve type errors'
      },
      {
        type: 'fix',
        description: 'Enable TB-303 accent and slide in tracker playback'
      },
      {
        type: 'improvement',
        description: 'Chore: update changelog for build 1.0.1+169'
      },
      {
        type: 'fix',
        description: 'Correct MOD/XM instrument and sample parsing'
      },
      {
        type: 'feature',
        description: 'Improve tracker playback engine and visual sync'
      },
      {
        type: 'feature',
        description: 'Enhance MIDI system with learn modal, grouping, and smoothing'
      },
      {
        type: 'improvement',
        description: 'Update generated changelog'
      },
      {
        type: 'improvement',
        description: 'Simplify LogoAnimation component'
      },
      {
        type: 'fix',
        description: 'Fix loop mode and optimize playback state updates'
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
