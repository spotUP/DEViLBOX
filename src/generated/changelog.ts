/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-12T21:00:23.503Z
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
export const BUILD_NUMBER = '435';
export const BUILD_HASH = '699afd7';
export const BUILD_DATE = '2026-02-12';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-12',
    changes: [
      {
        type: 'fix',
        "description": "Song length should use patternOrder.length not patterns.length"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in import/export and stores"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in hooks and utilities"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in UI components"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in synth implementations"
      },
      {
        type: 'fix',
        "description": "Resolve 363 TypeScript errors in InstrumentFactory and ToneEngine"
      },
      {
        type: 'feature',
        "description": "Arrangement view, piano roll canvas engine, DB303 param wiring fixes"
      },
      {
        type: 'feature',
        "description": "ROM auto-load status + upload dialog for MAME synths"
      },
      {
        type: 'fix',
        "description": "Route TrackerReplayer through master effects chain"
      },
      {
        type: 'fix',
        "description": "Misc engine, store, and UI improvements"
      },
      {
        type: 'feature',
        "description": "Tabbed MOJO/DevilFish/Korg/LFO/FX UI, always-active filter params"
      },
      {
        type: 'feature',
        "description": "Add Speak & Spell ROM data and fix TTS voice activation"
      },
      {
        type: 'improvement',
        "description": "Reorganize NKS into performance module"
      },
      {
        type: 'improvement',
        "description": "Chore: remove old song data files and unused hardware images"
      }
    ]
  },
  {
    version: '2026-02-11',
    date: '2026-02-11',
    changes: [
      {
        type: 'fix',
        "description": "Eliminate crackles from parameter changes"
      },
      {
        type: 'fix',
        "description": "Clean up MIDI double-trigger diagnostics after confirming fix"
      },
      {
        type: 'feature',
        "description": "Diag: add comprehensive MIDI double-trigger diagnostics"
      },
      {
        type: 'fix',
        "description": "Filter non-automatable params from knob pages, clean up TS errors, add speech engine"
      },
      {
        type: 'fix',
        "description": "Use stored type instead of minified constructor name for stale instrument check"
      },
      {
        type: 'fix',
        "description": "Break circular import between VotraxSynth and votraxPhonemeMap"
      },
      {
        type: 'fix',
        "description": "Prevent stale preview instrument causing double-trigger on MIDI playback"
      },
      {
        type: 'feature',
        "description": "Split WAM plugins into effects and synths, add effect search, fix bugs"
      },
      {
        type: 'feature',
        "description": "Add complete Leap sample taxonomy with 17 categories and character tags"
      },
      {
        type: 'fix',
        "description": "Correct data model, add validation suite, and complete SDK coverage"
      },
      {
        type: 'fix',
        "description": "Polyfill URL constructor for AudioWorklet WASM loading"
      },
      {
        type: 'feature',
        "description": "Add NKS2 metadata builder, Leap expansion support, and NICA improvements"
      },
      {
        type: 'feature',
        "description": "Implement full NKS SDK v2.0.2 specification"
      },
      {
        type: 'fix',
        "description": "Send correct MIDI note in writeKeyOff for all MAME synths"
      },
      {
        type: 'fix',
        "description": "Stop V2Speech looping on note release"
      },
      {
        type: 'fix',
        "description": "Register V2Speech in engine factory and ToneEngine"
      },
      {
        type: 'feature',
        "description": "Expand NKS parameter maps to all 170+ synths with dedicated profiles"
      },
      {
        type: 'fix',
        "description": "Show speech text input without preset, add Speech & Voice category"
      },
      {
        type: 'fix',
        "description": "Chore: update changelog, NKS tweaks, TB303 panel fix"
      },
      {
        type: 'fix',
        "description": "Improve WAM plugin loading, GUI mounting, and registry cleanup"
      },
      {
        type: 'feature',
        "description": "Redesign effect editors with pedal-enclosure aesthetic"
      },
      {
        type: 'feature',
        "description": "Implement NKS2 specification with unified parameter routing"
      },
      {
        type: 'fix',
        "description": "Center WAM plugin GUI in container"
      },
      {
        type: 'feature',
        "description": "Chore: update changelog, add 303 synthesis tips, update project docs"
      },
      {
        type: 'feature',
        "description": "Detect effect plugins and add internal tone generator"
      },
      {
        type: 'feature',
        "description": "Add filter scope visualization and quick tips to JC303 panel"
      },
      {
        type: 'improvement',
        "description": "Normalize all parameters to 0-1, add set() and applyConfig() API"
      },
      {
        type: 'feature',
        "description": "Register Open303 and OB-Xd, fix Dexed init voice, harden VSTBridge worklet"
      },
      {
        type: 'improvement',
        "description": "Ci: build Electron desktop apps on every deploy"
      },
      {
        type: 'fix',
        "description": "Enable file browser on GitHub Pages via static manifest fallback"
      },
      {
        type: 'fix',
        "description": "Remove unused patterns variable from TD-3 import"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Fix knob drag interference on TB-303 panel"
      },
      {
        type: 'feature',
        "description": "Add classic acid effect chain presets and fix preset loader"
      },
      {
        type: 'fix',
        "description": "Fix TD-3 pattern import and parameter editor null guard"
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
