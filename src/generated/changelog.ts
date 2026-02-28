/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-28T00:42:37.783Z
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
export const BUILD_VERSION = '1.0.1540';
export const BUILD_NUMBER = '1540';
export const BUILD_HASH = 'd6df5c2e';
export const BUILD_DATE = '2026-02-28';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1540',
    date: '2026-02-28',
    changes: [
      {
        type: 'feature',
        "description": "Add DEViLBOX.SC.worklet.js AudioWorklet processor"
      },
      {
        type: 'feature',
        "description": "Build WASM binary, song+preview API"
      },
      {
        type: 'feature',
        "description": "Write MusicLineWrapper.cpp C shim"
      },
      {
        type: 'improvement',
        "description": "Add exhaustiveness guard, hoist TextEncoder, strengthen tests"
      },
      {
        type: 'feature',
        "description": "Session 4 — write-back, loop refinement, Track C polish, Delitracker Custom guard"
      },
      {
        type: 'feature',
        "description": "Add SunVoxSynth DevilboxSynth implementation with unit tests"
      },
      {
        type: 'improvement',
        "description": "Test(sc): strengthen OSC high-level function payload assertions"
      },
      {
        type: 'fix',
        "description": "Fix worklet render buffers, synthSaved key, dispose cleanup, fetch error handling"
      },
      {
        type: 'feature',
        "description": "Add OSC 1.0 message encoder with tests"
      },
      {
        type: 'feature',
        "description": "Chore(musicline): add WASM build skeleton"
      },
      {
        type: 'feature',
        "description": "Add AudioWorklet and SunVoxEngine.ts singleton"
      },
      {
        type: 'feature',
        "description": "Add scsynth WASM binary with sc3-plugins (ext build)"
      },
      {
        type: 'feature',
        "description": "Compile SunVox audio WASM — add missing sundog deps, force-include cmath"
      },
      {
        type: 'improvement',
        "description": "Add MusicLine WASM engine implementation plan"
      },
      {
        type: 'feature',
        "description": "Implement SunVoxWrapper.cpp C++ WASM bridge"
      },
      {
        type: 'improvement',
        "description": "SuperCollider synth implementation plan"
      },
      {
        type: 'feature',
        "description": "Add sunvox-wasm project skeleton with CMakeLists.txt"
      },
      {
        type: 'improvement',
        "description": "SuperCollider synth design document"
      },
      {
        type: 'feature',
        "description": "Universal editable instruments — write-back, per-format guards, macro-synth isolation"
      },
      {
        type: 'improvement',
        "description": "Add SunVox integration design + implementation plan"
      },
      {
        type: 'improvement',
        "description": "Add MusicLine WASM engine design doc"
      },
      {
        type: 'feature',
        "description": "Add native .ml/.mli save/load support"
      }
    ]
  },
  {
    version: '2026-02-27',
    date: '2026-02-27',
    changes: [
      {
        type: 'fix',
        "description": "Wire HivelyImportDialog state, prop, and HVL button into InstrumentList"
      },
      {
        type: 'feature',
        "description": "Add HivelyImportDialog and wire showHivelyImport into InstrumentList"
      },
      {
        type: 'improvement',
        "description": "Add 11 new format docs and expand README index to 214 entries"
      },
      {
        type: 'feature',
        "description": "Add per-instrument .ahi save/load buttons in InstrumentList"
      },
      {
        type: 'feature',
        "description": "Add HVL/AHX export buttons to toolbar"
      },
      {
        type: 'feature',
        "description": "Add extractInstrumentsFromHvl for import dialog"
      },
      {
        type: 'feature',
        "description": "Add Sample Bus / Synth Bus gain controls to balance levels"
      },
      {
        type: 'fix',
        "description": "Use iso-8859-1 decoder in parseAhiFile for non-ASCII names"
      },
      {
        type: 'feature',
        "description": "Add parseAhiFile — .ahi instrument file parser with round-trip tests"
      },
      {
        type: 'feature',
        "description": "Add exportAsAhi — standalone .ahi instrument file writer"
      },
      {
        type: 'improvement',
        "description": "Add 113 format spec docs and expand README index"
      },
      {
        type: 'improvement',
        "description": "HivelyTracker AHX export + instrument I/O implementation plan"
      },
      {
        type: 'fix',
        "description": "Eliminate empty phantom patterns between populated patterns"
      },
      {
        type: 'feature',
        "description": "Add SequenceEditor and WaveformThumbnail shared components; bump changelog"
      },
      {
        type: 'fix',
        "description": "Correct note pitch, waveform names, and parse effect slots"
      },
      {
        type: 'fix',
        "description": "Implement 50Hz pacing for standalone instrument player, recompile WASM"
      },
      {
        type: 'improvement',
        "description": "HivelyTracker instrument mode implementation plan"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive format documentation for 56 Amiga music formats"
      },
      {
        type: 'fix',
        "description": "Correct waveform loop length (was 2× too large, all pitches one octave low)"
      },
      {
        type: 'fix',
        "description": "Add 14 missing synth types to SYNTH_CATEGORIES dropdown"
      },
      {
        type: 'feature',
        "description": "Add multi-channel pattern viewer below track matrix"
      },
      {
        type: 'fix',
        "description": "Use actual SMPL PCM for waveform instruments instead of fake generators"
      },
      {
        type: 'fix',
        "description": "Replace Sampler dropdown with MusicLine branded header"
      },
      {
        type: 'fix',
        "description": "Add ChipTrackerParser + SamplerTrackerPlusParser stubs, fix test"
      },
      {
        type: 'feature',
        "description": "Synth editor for waveform instruments"
      },
      {
        type: 'fix',
        "description": "Wire MFPParser, delete two dead stub parsers"
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
