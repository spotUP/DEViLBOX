/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-27T17:04:13.835Z
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
export const BUILD_VERSION = '1.0.1495';
export const BUILD_NUMBER = '1495';
export const BUILD_HASH = 'ef78d455';
export const BUILD_DATE = '2026-02-27';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1495',
    date: '2026-02-27',
    changes: [
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
      },
      {
        type: 'fix',
        "description": "Hively-style track matrix + fix instrument preview pitch"
      },
      {
        type: 'fix',
        "description": "Wire GMCParser + SonixMusicDriverParser into routing"
      },
      {
        type: 'feature',
        "description": "Add steps-mode EnvelopeVisualization to SidMon1Controls"
      },
      {
        type: 'feature',
        "description": "Wire FilterFrequencyResponse into DubSiren + EnvelopeVisualization into FCControls"
      },
      {
        type: 'feature',
        "description": "Add EnvelopeVisualization mode=linear + wire into OBXd/V2/HarmonicSynth editors"
      },
      {
        type: 'feature',
        "description": "Add FilterFrequencyResponse shared component"
      },
      {
        type: 'feature',
        "description": "Add 'musicline' editor mode for WebGL DOM overlay"
      },
      {
        type: 'feature',
        "description": "Add FMAlgorithmDiagram shared component"
      },
      {
        type: 'fix',
        "description": "Await pending sample decodes before starting scheduler"
      },
      {
        type: 'feature',
        "description": "Enhance MacroEditor with line-draw, presets, playback cursor, hover tooltips"
      },
      {
        type: 'feature',
        "description": "Apply shared component library to WavetableEditor, FurnaceEditor, HivelyControls"
      },
      {
        type: 'fix',
        "description": "Fix SMPL parsing so all instruments have audio"
      },
      {
        type: 'feature',
        "description": "Embed track table editor inline in TrackerView"
      },
      {
        type: 'fix',
        "description": "Emit one InstrumentConfig per instrument slot"
      },
      {
        type: 'fix',
        "description": "Also expose HEAPF32 on Module for audio decode"
      },
      {
        type: 'fix',
        "description": "Expose HEAPU8 on Module so worklet loadTune doesn't crash"
      },
      {
        type: 'feature',
        "description": "Test(parsers): add instrument assertions to SoundMon, SoundFX, JamCracker tests"
      },
      {
        type: 'feature',
        "description": "Show per-position speed badge in PatternOrderList for Symphonie Pro"
      },
      {
        type: 'improvement',
        "description": "Chore: commit leftover test assertions and changelog updates from parser work"
      },
      {
        type: 'fix',
        "description": "Use track table count and MOD periods for per-channel format playback"
      },
      {
        type: 'fix',
        "description": "Fix 211 failing tests across 44 format parsers"
      },
      {
        type: 'feature',
        "description": "Implement per-channel speed/groove in replayer"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog"
      },
      {
        type: 'fix',
        "description": "Thread linearPeriods through store → replayer"
      },
      {
        type: 'fix',
        "description": "Thread hivelyFileData/hivelyMeta through store → replayer"
      },
      {
        type: 'feature',
        "description": "Upgrade MusicMaker 4V/8V from stub to real IFF parser"
      },
      {
        type: 'feature',
        "description": "Extract instrument names from INAM chunk"
      },
      {
        type: 'fix',
        "description": "Auto-open pattern order modal on load; fix DigiBoosterParser test escapes"
      },
      {
        type: 'fix',
        "description": "Restore getTrackerReplayer import, suppress unused patIdx warning"
      },
      {
        type: 'feature',
        "description": "Test(import): add integration tests for 13 more native parsers"
      },
      {
        type: 'fix',
        "description": "Thread channelTrackTables through store so UI switches to track table editor"
      },
      {
        type: 'fix',
        "description": "Restore numChannels from TUNE header + fix channels[0] lookup in replayer"
      },
      {
        type: 'feature',
        "description": "Real MusicMaker 4V/8V parser — IFF chunk → Sampler instruments"
      },
      {
        type: 'feature',
        "description": "1:1 ASM port - single-voice PARTs, metadata extraction, correct channel matrix"
      },
      {
        type: 'fix',
        "description": "Skip correct 20-byte file header (was 16 — broke all parsing)"
      },
      {
        type: 'fix',
        "description": "Add musicLine key to FormatEnginePreferences"
      },
      {
        type: 'fix',
        "description": "Correct .ml format detection, instrument sentinel, and Vite dedupe"
      },
      {
        type: 'feature',
        "description": "Native MusicLine Editor parser + per-channel replayer support"
      },
      {
        type: 'feature',
        "description": "Add native XM/MOD parsers — isXMFormat+parseXMFile, isMODFormat+parseMODFile"
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
