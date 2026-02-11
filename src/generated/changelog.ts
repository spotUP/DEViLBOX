/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-11T17:57:04.536Z
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
export const BUILD_NUMBER = '392';
export const BUILD_HASH = 'a8322a5';
export const BUILD_DATE = '2026-02-11';

// Full semantic version with build number
export const FULL_VERSION = `${BUILD_VERSION}.${BUILD_NUMBER}`;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1',
    date: '2026-02-11',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Improve master routing and synth engine stability"
      },
      {
        type: 'feature',
        "description": "Expand Odin2 WASM engine with full parameter coverage"
      },
      {
        type: 'feature',
        "description": "Add Helm, Sorcer, amsynth, and OB-Xf WASM synth engines"
      },
      {
        type: 'fix',
        "description": "Resolve Tone.js compatibility issues from DevilboxSynth refactor"
      },
      {
        type: 'fix',
        "description": "Load Behringer .sqs/.seq files via file browser"
      },
      {
        type: 'fix',
        "description": "Clean up synth controls - fix Odin2 ranges, add OTHER tab, show all params"
      },
      {
        type: 'fix',
        "description": "Bridge native DevilboxSynths into Tone.js effect chains"
      },
      {
        type: 'fix',
        "description": "Clean up SurgeControls component"
      },
      {
        type: 'fix',
        "description": "Clean up VitalControls component"
      },
      {
        type: 'fix',
        "description": "Register Vital, Odin2, and Surge panel components in synth registry"
      },
      {
        type: 'feature',
        "description": "Test: add swing timing test scripts and XML test patterns"
      },
      {
        type: 'feature',
        "description": "Add Tonewheel Organ, Vital, Odin2, Surge, and Melodica controls"
      },
      {
        type: 'feature',
        "description": "Add effect engine modules, BPM sync, and compiled WASM binaries"
      },
      {
        type: 'feature',
        "description": "Chore: add documentation, changelog, test pages, and gitignore updates"
      },
      {
        type: 'feature',
        "description": "Add Moog filters, MVerb, Leslie, Spring reverb, and synth templates"
      },
      {
        type: 'feature',
        "description": "Expand knob banks and controller mappings for all synth types"
      },
      {
        type: 'feature',
        "description": "Add auto-preview oscilloscope hook and expand synth parameter editors"
      },
      {
        type: 'feature',
        "description": "Add BPM sync controls, genre presets, and enhanced visual editors"
      },
      {
        type: 'improvement',
        "description": "Decouple synth engines from Tone.js and expand audio architecture"
      },
      {
        type: 'feature',
        "description": "Update editors, presets, tracker, and DB303 controls"
      },
      {
        type: 'feature',
        "description": "Improve import/export engine and song parser"
      },
      {
        type: 'feature',
        "description": "Add WAM host, VST bridge, and JUCE WASM build template"
      },
      {
        type: 'improvement',
        "description": "Introduce DevilboxSynth interface and decouple synths from Tone.js"
      }
    ]
  },
  {
    version: '2026-02-10',
    date: '2026-02-10',
    changes: [
      {
        type: 'fix',
        "description": "Chore(infra): update electron, packages, and local debug tools"
      },
      {
        type: 'improvement',
        "description": "Enhance audio engine and fix multiple stability issues"
      },
      {
        type: 'feature',
        "description": "Add new channel visualizers and standardize styling"
      },
      {
        type: 'feature',
        "description": "Implement 1:1 logic port of FT2 Nibbles"
      },
      {
        type: 'feature',
        "description": "Improve TD-3 pattern import/export and audit .seq format"
      }
    ]
  },
  {
    version: '2026-02-09',
    date: '2026-02-09',
    changes: [
      {
        type: 'fix',
        "description": "Use absolute paths for worklet/wasm loading on GitHub Pages"
      },
      {
        type: 'fix',
        "description": "Test page uses direct worklet loading + correct case-sensitive filenames"
      },
      {
        type: 'fix',
        "description": "Test page now uses direct worklet loading instead of TypeScript imports"
      },
      {
        type: 'fix',
        "description": "Tracker knobs now update live synth + improve test page tracking params"
      },
      {
        type: 'feature',
        "description": "Comprehensive parameter testing with smoothing, retrigger, and auto-setup"
      },
      {
        type: 'feature',
        "description": "Complete DB303 synth overhaul with full parameter test suite"
      },
      {
        type: 'improvement',
        "description": "Update changelog and minor UI refinements"
      },
      {
        type: 'improvement',
        "description": "303 UI improvements: full-width responsive layout with collapsible sections"
      },
      {
        type: 'fix',
        "description": "Rebrand file formats: .dbx for songs, .dbi for instruments + fix speech synth singing modes"
      },
      {
        type: 'improvement',
        "description": "Optimize engine and shared control components"
      },
      {
        type: 'improvement',
        "description": "Optimize effect and specialty synth controls"
      },
      {
        type: 'improvement',
        "description": "Add refs to high-complexity synth controls"
      },
      {
        type: 'improvement',
        "description": "Prevent knob handler re-creation with refs"
      },
      {
        type: 'fix',
        "description": "Eliminate stale state bug preventing first drag response"
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
