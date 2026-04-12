/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-12T08:42:35.767Z
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
export const BUILD_VERSION = '1.0.4949';
export const BUILD_NUMBER = '4949';
export const BUILD_HASH = '6334cd705';
export const BUILD_DATE = '2026-04-12';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4949',
    date: '2026-04-12',
    changes: [
      {
        type: 'fix',
        "description": "Respect layers + add per-osc filter/FM/phase/seed"
      },
      {
        type: 'fix',
        "description": "Buzzmachine stereo buffer view + Core Design native parser routing"
      },
      {
        type: 'feature',
        "description": "Browser search fix + bundled presets + UI editor"
      },
      {
        type: 'fix',
        "description": "Break store cycle — late-bound access via storeAccess leaf"
      },
      {
        type: 'fix',
        "description": "TDZ on MASK_* exports — move bitmasks to leaf module"
      }
    ]
  },
  {
    version: '2026-04-11',
    date: '2026-04-11',
    changes: [
      {
        type: 'fix',
        "description": "Route GoatTracker to USB-SID-Pico correctly"
      },
      {
        type: 'feature',
        "description": "Registry integration — usable as a tracker instrument"
      },
      {
        type: 'feature',
        "description": "TypeScript engine, springs shader, hardware UI + registry wire-up"
      },
      {
        type: 'feature',
        "description": "JUCE UI WASM build — real plugin editor in a canvas"
      },
      {
        type: 'feature',
        "description": "DSP WASM build — tape delay + 4-spring reverb"
      },
      {
        type: 'feature',
        "description": "Supreme Synthetics playlist end-to-end auto-DJ soak test"
      },
      {
        type: 'feature',
        "description": ".gkick preset loader (Phase 3)"
      },
      {
        type: 'fix',
        "description": "Remove circular dep — use prefix check instead of AVAILABLE_EFFECTS import"
      },
      {
        type: 'feature',
        "description": "Envelope point surface (kick-level + per-oscillator)"
      },
      {
        type: 'feature',
        "description": "Scalar parameter surface (filter/distortion/oscillators)"
      },
      {
        type: 'fix',
        "description": "Replace require() with static import in useAudioStore"
      },
      {
        type: 'feature',
        "description": "AudioWorklet + TypeScript engine wrapper"
      },
      {
        type: 'feature',
        "description": "WASM build — CMake, C bridge, pthread-free worker stub"
      },
      {
        type: 'improvement',
        "description": "Third-party: import geonkick 3.7.0 DSP engine (GPL-3)"
      },
      {
        type: 'fix',
        "description": "Bridge Tone.js and native AudioNodes in master effects chain"
      },
      {
        type: 'fix',
        "description": "Handle DevilboxSynth effects in master effects chain"
      },
      {
        type: 'fix',
        "description": "UADE protocol cascade self-healing — mark poisoned, recreate on next access"
      },
      {
        type: 'fix',
        "description": "Buzzmachine effects get correct category + default parameters"
      },
      {
        type: 'fix',
        "description": "AudioContext staleness + direct routing for 20 WASM engines"
      },
      {
        type: 'feature',
        "description": "Add 23 Buzzmachine effects to the master effects UI"
      },
      {
        type: 'fix',
        "description": "Use level-affecting params for Delay/Phaser knob tests"
      },
      {
        type: 'fix',
        "description": "Delay/FeedbackDelay use 'time' param, not 'delayTime'"
      },
      {
        type: 'fix',
        "description": "Restore 6 WASM effect binaries to correct path (public/)"
      },
      {
        type: 'feature',
        "description": "Retry with alternate files on silence/UADE/AdPlug failure"
      },
      {
        type: 'fix',
        "description": "Dispose stale instance when AudioContext changes"
      },
      {
        type: 'fix',
        "description": "Route only Furnace/DefleMask/XRNS through ModuleLoader"
      },
      {
        type: 'improvement',
        "description": "Build(juce-wasm): pin 4MB INITIAL_MEMORY, disable ALLOW_MEMORY_GROWTH"
      },
      {
        type: 'improvement',
        "description": "Chore(audit): update format state — fx-delay regression (knobs dead)"
      },
      {
        type: 'fix',
        "description": "Bridge cross-context native synth via MediaStream"
      },
      {
        type: 'feature',
        "description": "Pixi mirror of raw vol macro byte editor"
      },
      {
        type: 'feature',
        "description": "Editable loop points for OctaMED/SidMon/SoundMon"
      },
      {
        type: 'improvement',
        "description": "Use design tokens for negate toggle buttons"
      },
      {
        type: 'feature',
        "description": "Make mode fields editable"
      },
      {
        type: 'fix',
        "description": "Rebuild-after-play uses scheduleWasmEffectRebuild for both paths"
      },
      {
        type: 'improvement',
        "description": "Chore: uncommitted local changes — writeHandlers, changelog, PixiRoot, tools"
      },
      {
        type: 'fix',
        "description": "Remove trailing spaces from MusicLine instrument filenames"
      },
      {
        type: 'fix',
        "description": "Export suppressFormatChecks/restoreFormatChecks"
      },
      {
        type: 'feature',
        "description": "F7 multi-song support — up to 16 songs per .sf2 file"
      },
      {
        type: 'improvement',
        "description": "Move theme picker to settings only, move Tips button to header"
      },
      {
        type: 'fix',
        "description": "Status bar fixed-width numerals to prevent layout jumps"
      },
      {
        type: 'feature',
        "description": "F5 resize, Shift+F5 expand, F6 remove unused sequences"
      },
      {
        type: 'feature',
        "description": "Play markers, notation mode, SID toggle, expand/resize sequence"
      },
      {
        type: 'fix',
        "description": "VisualEffectEditorWrapper crash + Furnace frozen config mutation"
      },
      {
        type: 'fix',
        "description": "Reorder audit tests — stable engines first, UADE-heavy formats last"
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
