/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T12:46:56.564Z
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
export const BUILD_VERSION = '1.0.1323';
export const BUILD_NUMBER = '1323';
export const BUILD_HASH = '060a48bb';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1323',
    date: '2026-02-26',
    changes: [
      {
        type: 'fix',
        "description": "Fix RefObject null type errors for React 19 strict typing"
      },
      {
        type: 'fix',
        "description": "Clamp NSF channels to base APU, fix SAP play-addr fallback"
      },
      {
        type: 'feature',
        "description": "NSF/SID/SAP pattern extraction via 6502 CPU emulation"
      },
      {
        type: 'fix',
        "description": "Always mount shared Canvas; add background:transparent"
      },
      {
        type: 'fix',
        "description": "Rebuild vestax-mixer GLB with full texture set"
      },
      {
        type: 'improvement',
        "description": "Build(soundmon): compile SoundMon.wasm from soundmon_synth.c"
      },
      {
        type: 'feature',
        "description": "Phase 7 — instrument editor UI for all new synth types"
      },
      {
        type: 'feature',
        "description": "Add 6502 CPU emulator for NSF/SID/SAP pattern extraction"
      },
      {
        type: 'fix',
        "description": "Correct OPM test comment (nibble A = B4, not A#4)"
      },
      {
        type: 'fix',
        "description": "Correct OPM KC note encoding and add OPM test"
      },
      {
        type: 'fix',
        "description": "Move mixer into shared WebGL canvas via drei View"
      },
      {
        type: 'feature',
        "description": "Phase 6 — instrument naming for enhanced scan"
      },
      {
        type: 'fix',
        "description": "Share single WebGL context across all turntable 3D views"
      },
      {
        type: 'feature',
        "description": "Add FredSynth — real-time PWM synthesis for Fred Editor type-1 instruments"
      },
      {
        type: 'feature',
        "description": "Add TFMXSynth — per-note TFMX synthesis via libtfmxaudiodecoder WASM"
      },
      {
        type: 'feature',
        "description": "Add SN76489 PSG and OPM note extraction to VGMParser"
      },
      {
        type: 'fix',
        "description": "Cap LZH-5 bit-length at 15, tighten output cap, fix plan doc error"
      },
      {
        type: 'fix',
        "description": "Remove mesh debug logging and improve WebGL context loss resilience"
      },
      {
        type: 'fix',
        "description": "Correct LZH-5 decoder in YMParser for YM5!/YM6! files"
      },
      {
        type: 'feature',
        "description": "Phase 3 — Future Composer synthesis engine"
      },
      {
        type: 'feature',
        "description": "Phase 2 — SidMon II + Digital Mugician real-time WASM synthesis"
      },
      {
        type: 'fix',
        "description": "Embed Backplate_GFX_01 texture into vestax-mixer GLB"
      },
      {
        type: 'feature',
        "description": "Exclude chip-dump formats from UADE mode selector in ImportModuleDialog"
      },
      {
        type: 'feature',
        "description": "Wire VGM/YM/NSF/SID/SAP/AY parsers into dispatch + extension list"
      },
      {
        type: 'feature',
        "description": "Add SIDParser, SAPParser, AYParser — C64/Atari/ZX Spectrum instrument stubs"
      },
      {
        type: 'feature',
        "description": "Add NSFParser — NES Sound Format with expansion chip instrument stubs"
      },
      {
        type: 'feature',
        "description": "Add YMParser — Atari ST AY/YM register dump format"
      },
      {
        type: 'feature',
        "description": "Add VGMParser — VGM/VGZ chip-dump with OPN2 pattern extraction"
      },
      {
        type: 'fix',
        "description": "Support comma-separated CORS origins for multi-port dev"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'feature',
        "description": "Phase 1 — SoundMon II real-time WASM synthesis pilot"
      },
      {
        type: 'fix',
        "description": "Apply speed2 alternation when switching subsongs"
      },
      {
        type: 'feature',
        "description": "Phase 0 — define format-specific synth types and C API"
      },
      {
        type: 'feature',
        "description": "Chore: add .worktrees/ to .gitignore"
      },
      {
        type: 'improvement',
        "description": "Add missing format imports design doc (VGM, YM, NSF, SAP, SID, AY)"
      },
      {
        type: 'fix',
        "description": "Proper subsong conversion — shared instruments, per-subsong patterns"
      },
      {
        type: 'improvement',
        "description": "Chore(furnace-insed): bump WASM cache-bust version to 3"
      },
      {
        type: 'fix',
        "description": "Remove unused fields and dead header reads (TS6133)"
      },
      {
        type: 'feature',
        "description": "Add sample preview playback to FurnaceInsEd hardware UI"
      },
      {
        type: 'feature',
        "description": "Implement full multi-subsong support with in-editor switching"
      },
      {
        type: 'fix',
        "description": "SoundMon synth loop covers full ADSR expansion not base cycle"
      },
      {
        type: 'feature',
        "description": "Add sample playback — PLAY/STOP buttons + Web Audio API"
      },
      {
        type: 'fix',
        "description": "Resolve all TypeScript TS6133/TS2345/TS18047 errors"
      },
      {
        type: 'feature',
        "description": "FurnaceInsEd WASM module + import dialogs + TFMX parser"
      },
      {
        type: 'improvement',
        "description": "Chore: changelog update, FT2 WASM patches, FT2Hardware volume/pan edit, cleanup"
      },
      {
        type: 'feature',
        "description": "FileBrowser previews, Modland API, UIStore imports, Pixi fixes"
      },
      {
        type: 'fix',
        "description": "WASM config polling, Retina canvas, and Hively layout fixes"
      },
      {
        type: 'feature',
        "description": "Per-format import dialogs in TrackerView and FT2Toolbar"
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
