/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-28T11:01:50.331Z
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
export const BUILD_VERSION = '1.0.1619';
export const BUILD_NUMBER = '1619';
export const BUILD_HASH = '94b05eff';
export const BUILD_DATE = '2026-02-28';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1619',
    date: '2026-02-28',
    changes: [
      {
        type: 'fix',
        "description": "Narrow layout string literals with as const in PixiVisualizer"
      },
      {
        type: 'fix',
        "description": "Fix WASM crash on stop/load and trim pattern length to sentinel"
      },
      {
        type: 'fix',
        "description": "Import .sunvox as project, fix BindingErrors and black screen"
      },
      {
        type: 'feature',
        "description": "Add Oktalyzer SAMP chunk name extraction + pin null guards with tests"
      },
      {
        type: 'fix',
        "description": "Eliminate Yoga BindingError on playback start"
      },
      {
        type: 'feature',
        "description": "Remove dropzone and browse-files button from import dialog"
      },
      {
        type: 'fix',
        "description": "Add Cross-Origin Isolation headers for SharedArrayBuffer"
      },
      {
        type: 'fix',
        "description": "Rewrite chunk parser to match module.cpp reference 1:1"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors and fix SuperCollider registry create()"
      },
      {
        type: 'feature',
        "description": "Extract real PCM samples from TCB Tracker modules"
      },
      {
        type: 'fix',
        "description": "Wire HivelyEngine for HVL/AHX preview; hide button for unsupported formats"
      },
      {
        type: 'feature',
        "description": "Show import dialog on drag-drop instead of silently adding instrument"
      },
      {
        type: 'fix',
        "description": "Make error messages selectable/copyable across all synth editors"
      },
      {
        type: 'fix',
        "description": "Raise toast z-index above modals and overlays"
      },
      {
        type: 'fix',
        "description": "Prevent BindingError black screen on reset by avoiding structural tree swaps"
      },
      {
        type: 'fix',
        "description": "Use PINS chunk name and raise instrument cap to 64"
      },
      {
        type: 'fix',
        "description": "Use MusicLineEngine for import dialog preview of .ml files"
      },
      {
        type: 'fix',
        "description": "Suppress double audio, fix pattern cutting and effect mapping"
      },
      {
        type: 'fix',
        "description": "Add SunVoxSynth and MusicLineSynth to SYNTH_CATEGORIES so they appear in the synth type dropdown"
      },
      {
        type: 'fix',
        "description": "Pipe script via stdin instead of -D file arg for non-root sclang"
      },
      {
        type: 'fix',
        "description": "Song mode load, auto-pattern, portable ASCII strToPtr"
      },
      {
        type: 'fix',
        "description": "Use m.stringToUTF8/lengthBytesUTF8 — TextEncoder unavailable in AudioWorklet scope"
      },
      {
        type: 'fix',
        "description": "Add amosMusicBank and iceTracker to FormatEnginePreferences"
      },
      {
        type: 'fix',
        "description": "Cache Yoga Config on window to survive HMR reloads"
      },
      {
        type: 'fix',
        "description": "Register missing UADE extensions in file picker"
      },
      {
        type: 'fix',
        "description": "Trim last pattern to actual row count, not hardcoded 64"
      },
      {
        type: 'fix',
        "description": "Replace missing Emscripten string helpers with portable _malloc+HEAPU8 approach"
      },
      {
        type: 'fix',
        "description": "Complete UADE modal audit — add 55 missing format engine toggles"
      },
      {
        type: 'fix',
        "description": "Add SuperCollider to Scripted category in synth browser"
      },
      {
        type: 'fix',
        "description": "Audit UADE import modal — fix gaps, add missing formats, fix STX ts error"
      },
      {
        type: 'fix',
        "description": "AllocateUTF8 → stringToNewUTF8, prevent detached ArrayBuffer, add missing audio exts to drop handler"
      },
      {
        type: 'fix',
        "description": "Persist Yoga instance on window to survive Vite HMR reloads"
      },
      {
        type: 'fix',
        "description": "STX parser, .sfx2/.m15 routing, sunvox drag-drop"
      },
      {
        type: 'feature',
        "description": "Register .mxtx extension + route to MaximumEffectParser"
      },
      {
        type: 'fix',
        "description": "Stamp full ImportMetadata on patterns after totals are known"
      },
      {
        type: 'fix',
        "description": "Add -D flag and headless env vars to sclang invocation"
      },
      {
        type: 'fix',
        "description": "Remove stray closing brace in ImportModuleDialog ternary"
      },
      {
        type: 'fix',
        "description": "Register .mid/.midi in getSupportedExtensions()"
      },
      {
        type: 'fix',
        "description": "Set sourceFormat 'ML' on patterns and fix TrackerReplayer guard"
      },
      {
        type: 'fix',
        "description": "Mark MusicLine as native-only in ImportModuleDialog"
      },
      {
        type: 'fix',
        "description": "Handle .sunvox/.sunsynth drop — create SunVoxSynth instrument"
      },
      {
        type: 'fix',
        "description": "Fix three TypeScript errors — canvas null, Uint8Array BlobPart, missing SynthInfo entries"
      },
      {
        type: 'fix',
        "description": "Widen parseAhiFile parameter to ArrayBufferLike"
      },
      {
        type: 'fix',
        "description": "Fix Pattern import in MusicLineExporter"
      },
      {
        type: 'feature',
        "description": "Add POST /api/sc/compile endpoint and wire frontend to API_URL"
      },
      {
        type: 'fix',
        "description": "Remove nonexistent init() call and fix unused param TS errors"
      },
      {
        type: 'fix',
        "description": "Add rjpSample to InstrumentMetadata; add Mark II null guard tests"
      },
      {
        type: 'feature',
        "description": "Wire SunVoxImportDialog into InstrumentList + TrackerView"
      },
      {
        type: 'feature',
        "description": "Wire musiclineFileData through store and usePatternPlayback"
      },
      {
        type: 'feature',
        "description": "Add SunVoxImportDialog for .sunsynth file import"
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
