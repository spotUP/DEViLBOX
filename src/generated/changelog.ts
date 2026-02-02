/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-02T19:04:56.029Z
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
export const BUILD_NUMBER = '191';
export const BUILD_HASH = 'fe0af07';
export const BUILD_DATE = '2026-02-02';
export const FULL_VERSION = `${BUILD_VERSION}+${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
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
    version: '1.0.1-1',
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
      },
      {
        type: 'fix',
        description: 'Reduce audio engine debug logging for performance'
      },
      {
        type: 'feature',
        description: 'Add Clear modal and functional Speed/Song Length controls'
      },
      {
        type: 'improvement',
        description: 'Improve pattern editor smooth scrolling and performance'
      },
      {
        type: 'improvement',
        description: 'Improve grid sequencer visuals and smooth scrolling'
      }
    ]
  },
  {
    version: '1.0.1-2',
    date: '2026-01-30',
    changes: [
      {
        type: 'feature',
        description: 'Add CRITICAL git safety rules to CLAUDE.md'
      },
      {
        type: 'feature',
        description: 'Add deploy.sh script for quick commit/push/deploy'
      },
      {
        type: 'improvement',
        description: 'Update generated changelog'
      },
      {
        type: 'improvement',
        description: 'Update synth categories and organization'
      },
      {
        type: 'improvement',
        description: 'Enhance audio engine and synth handling'
      },
      {
        type: 'improvement',
        description: 'Improve module and instrument import handling'
      },
      {
        type: 'improvement',
        description: 'Improve file browser and file system access'
      },
      {
        type: 'improvement',
        description: 'Enhance tracker input handling and FT2 toolbar'
      },
      {
        type: 'improvement',
        description: 'Improve MIDI handling and settings management'
      },
      {
        type: 'improvement',
        description: 'Enhance instrument visualization components'
      },
      {
        type: 'improvement',
        description: 'Refactor Furnace and synth editors for unified architecture'
      },
      {
        type: 'improvement',
        description: 'Improve TestKeyboard and InstrumentList collapsible behavior'
      },
      {
        type: 'improvement',
        description: 'Update FurnaceChips WASM build with improved chip emulation'
      },
      {
        type: 'improvement',
        description: 'Unify instrument editor architecture with common template'
      },
      {
        type: 'improvement',
        description: 'Make TestKeyboard and InstrumentList collapsible, collapsed by default'
      },
      {
        type: 'improvement',
        description: 'Scroll to selected synth when opening instrument selector'
      },
      {
        type: 'improvement',
        description: 'Remember instrument selector filter and scroll position'
      },
      {
        type: 'fix',
        description: 'Fix Buzzmachine paths for GitHub Pages deployment'
      },
      {
        type: 'fix',
        description: 'Add All Furnace Chips category and fix Buzzmachine null time error'
      },
      {
        type: 'fix',
        description: 'Fix unused variable TypeScript errors'
      },
      {
        type: 'improvement',
        description: 'Update instrument editors'
      }
    ]
  }
];

// Get the latest version
export const CURRENT_VERSION = CHANGELOG[0]?.version || BUILD_VERSION;

// Get all changes from the last N entries
export function getRecentChanges(count: number = 10): ChangelogEntry[] {
  return CHANGELOG.slice(0, count);
}
