/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T13:22:01.491Z
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
export const BUILD_VERSION = '1.0.1335';
export const BUILD_NUMBER = '1335';
export const BUILD_HASH = '34519234';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1335',
    date: '2026-02-26',
    changes: [
      {
        type: 'fix',
        "description": "Standalone instrument players now produce audio"
      },
      {
        type: 'improvement',
        "description": "Chore(assets): delete turntable_old.glb placeholder backup"
      },
      {
        type: 'feature',
        "description": "Chore(assets): add Technics SL-1200GR 3D model files and archive old turntable"
      },
      {
        type: 'improvement',
        "description": "Chore(docs): remove completed plan documents"
      },
      {
        type: 'feature',
        "description": "Replace turntable model with Technics SL-1200GR; calibrate hitboxes"
      },
      {
        type: 'feature',
        "description": "MED synth instrument waveform extraction + UADE Digital Mugician formats"
      },
      {
        type: 'fix',
        "description": "Guard AY address coverage, strengthen emulation test"
      },
      {
        type: 'feature',
        "description": "AY ZX Spectrum pattern extraction via Z80 CPU emulation"
      },
      {
        type: 'fix',
        "description": "Fix 25 pre-existing TypeScript errors to restore clean build"
      },
      {
        type: 'fix',
        "description": "Add missing Z80 individual register setters (B,C,D,E,H,L,AF,F)"
      },
      {
        type: 'feature',
        "description": "Add Z80 CPU emulator for AY ZX Spectrum pattern extraction"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
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
