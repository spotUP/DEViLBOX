/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T16:59:42.843Z
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
export const BUILD_VERSION = '1.0.1356';
export const BUILD_NUMBER = '1356';
export const BUILD_HASH = 'a875acd5';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1356',
    date: '2026-02-26',
    changes: [
      {
        type: 'fix',
        "description": "Fix puma routing — ArrayBuffer types, remove prefs toggle"
      },
      {
        type: 'feature',
        "description": "PumaTracker native parser (OpenMPT Load_puma.cpp reference)"
      },
      {
        type: 'feature',
        "description": "InStereo! 1.0/2.0 native parsers; fix SA routing with prefs toggle"
      },
      {
        type: 'feature',
        "description": "Art of Noise and Ben Daglish native parsers"
      },
      {
        type: 'feature',
        "description": "Add Sonic Arranger (.sa) native parser"
      },
      {
        type: 'feature',
        "description": "Delta Music 2.0 native parser"
      },
      {
        type: 'fix',
        "description": "Correct TCBTracker and SoundFX parsers against OpenMPT sources"
      },
      {
        type: 'fix',
        "description": "Correct SynthInstr binary layout and wire waveform pointer table"
      },
      {
        type: 'feature',
        "description": "Phase B4 — TCB Tracker (.tcb) native parser"
      },
      {
        type: 'feature',
        "description": "Add David Whittaker native synthesis engine"
      },
      {
        type: 'feature',
        "description": "Phase B3 — AMOS Music Bank (.abk) routing in parseModuleToSong"
      },
      {
        type: 'feature',
        "description": "OctaMED SynthInstr extraction + UADE format debug test + AMOS/DavidWhittaker parsers"
      },
      {
        type: 'feature',
        "description": "Phase B2 — Quadra Composer (.emod, .qc) native parser"
      },
      {
        type: 'feature',
        "description": "Add OctaMED SynthInstr native synthesis engine"
      },
      {
        type: 'feature',
        "description": "Phase B1 — JamCracker (.jam, .jc) native parser"
      },
      {
        type: 'feature',
        "description": "Phase 6 PCM instrument naming — JamCracker, TCB, EMOD, AMOS"
      },
      {
        type: 'feature',
        "description": "Native Rob Hubbard synthesis engine"
      },
      {
        type: 'fix',
        "description": "Guard emscripten.h with __EMSCRIPTEN__ to suppress IDE false positives"
      },
      {
        type: 'feature',
        "description": "Native Jochen Hippel CoSo synthesis engine"
      },
      {
        type: 'improvement',
        "description": "Update masterplan — all phases 0-7 complete except PCM naming"
      },
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
