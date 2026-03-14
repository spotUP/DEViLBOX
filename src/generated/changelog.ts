/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-13T20:55:00.633Z
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
export const BUILD_VERSION = '1.0.2803';
export const BUILD_NUMBER = '2803';
export const BUILD_HASH = 'aeb8837f4';
export const BUILD_DATE = '2026-03-13';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2803',
    date: '2026-03-13',
    changes: [
      {
        type: 'feature',
        "description": "Add UADE audio quality audit CLI tools"
      },
      {
        type: 'fix',
        "description": "Fix pattern editor trail: gate on isPlaying, skip empty cells"
      },
      {
        type: 'improvement',
        "description": "Update project docs: CLAUDE.md, MCP help, format status tool"
      },
      {
        type: 'improvement',
        "description": "Misc UI polish: editor header, synth selector, MAME synths, CSS tweaks"
      },
      {
        type: 'improvement',
        "description": "Replace TR-707 native slider with custom drag handler"
      },
      {
        type: 'fix',
        "description": "Fix triggerNote/releaseNote: look up instrument from store, not engine"
      },
      {
        type: 'feature',
        "description": "Add per-note piano key colors and vintage drum machine themes"
      },
      {
        type: 'improvement',
        "description": "Calibrate volume offsets for Furnace chips and VST synths"
      },
      {
        type: 'fix',
        "description": "Fix CZ101 WASM init: fetch binary on main thread, pass to worklet"
      },
      {
        type: 'fix',
        "description": "Fix pattern editor trail highlight: only apply to cells with content"
      },
      {
        type: 'fix',
        "description": "Fix UADE audio for stub/hybrid parsers: add uadeEditableFileData"
      },
      {
        type: 'fix',
        "description": "Fix parser type errors: remove uadePatternLayout: true, cast ArrayBuffer slices"
      },
      {
        type: 'fix',
        "description": "Fix MCP server startup on Node v24: import zod directly"
      },
      {
        type: 'fix',
        "description": "Fix CDFM67 + Composer667: add libopenmptFileData for OPL audio"
      },
      {
        type: 'fix',
        "description": "Fix RobHubbard uadePatternLayout + GoatTracker FormatStore storage"
      },
      {
        type: 'fix',
        "description": "Fix 4 broken formats: DavidWhittaker, DaveLowe, AshleyHogg, DMF"
      },
      {
        type: 'fix',
        "description": "Fix 6 broken format parsers: AMS, Actionamics, ActivisionPro, Organya, PxTone, Anders0land"
      },
      {
        type: 'fix',
        "description": "Fix last 3 broken formats: DavidWhittaker, RichardJoseph, MidiLoriciel"
      },
      {
        type: 'fix',
        "description": "Fix remaining partial/silent formats: Anders0land, MartinWalker, PaulSummers, IFF SMUS"
      },
      {
        type: 'fix',
        "description": "Fix Klystrack empty klysNative — pre-populate with stub data"
      },
      {
        type: 'fix',
        "description": "Fix RobHubbard, ActivisionPro, HVL position sync, SonicArranger SetTrackLen"
      },
      {
        type: 'fix',
        "description": "Fix JamCracker pattern display + FC BPM calculation"
      },
      {
        type: 'fix',
        "description": "Fix SidMon2 pattern length leak between patterns"
      },
      {
        type: 'fix',
        "description": "Fix KRIS and ICE pattern length trimming (pause at wraps)"
      },
      {
        type: 'fix',
        "description": "Fix SidMon1 and MusicAssembler parser bugs"
      },
      {
        type: 'fix',
        "description": "Fix 6 format parsers: AMS, InStereo, PumaTracker, Actionamics, QuadraComposer"
      },
      {
        type: 'feature',
        "description": "Add diagnostic logging to Furnace import pipeline"
      },
      {
        type: 'fix',
        "description": "Rebuild Furnace WASM with DMF support and fix missing stubs"
      },
      {
        type: 'fix',
        "description": "Fix DSS, Hippel-COSO, Digital Symphony instrument/sample bugs"
      },
      {
        type: 'fix',
        "description": "Fix DigitalMugician: add required finetune field to modPlayback metadata"
      },
      {
        type: 'fix',
        "description": "Fix TypeScript errors: Pattern structure, TrackerCell fields, metadata placement"
      },
      {
        type: 'fix',
        "description": "Fix DefleMask (.dmf) import — detect magic and route correctly"
      },
      {
        type: 'fix',
        "description": "Fix Mugician, ArtOfNoise, Fred + status page improvements"
      },
      {
        type: 'fix',
        "description": "Fix 5 broken format parsers: OKT, DigiBoosterPro, MED, FaceTheMusic, MusicLine"
      },
      {
        type: 'feature',
        "description": "Add double-click to load files in all dialogs"
      },
      {
        type: 'fix',
        "description": "Fix dialog scroll: remove universal overscroll-behavior: none"
      },
      {
        type: 'fix',
        "description": "Fix duplicate hlInterval declaration in GL renderer"
      },
      {
        type: 'fix',
        "description": "Fix GL pattern editor: center line fills entire viewport on init"
      },
      {
        type: 'fix',
        "description": "Fix theme crashes: guard against undefined/stale custom theme colors"
      },
      {
        type: 'fix',
        "description": "Fix SettingsModal crash: guard normalizeToHex6 against undefined color"
      },
      {
        type: 'fix',
        "description": "Fix DOM fake bold: increase offset from 0.5px to 1px for visibility"
      },
      {
        type: 'improvement',
        "description": "Bold font on active/triggered row in pattern editor"
      },
      {
        type: 'fix',
        "description": "Fix glow trail direction: trail behind playhead, not ahead"
      },
      {
        type: 'improvement',
        "description": "Pattern editor: white glow trail fading from active row"
      },
      {
        type: 'fix',
        "description": "Fix arrow key double-step: seed RAF lastMoveTime with current time"
      },
      {
        type: 'improvement',
        "description": "Pattern editor: z-order and active row improvements (DOM/GL)"
      },
      {
        type: 'improvement',
        "description": "Pattern editor: smooth scroll, z-order, and active row improvements (Pixi)"
      },
      {
        type: 'fix',
        "description": "UADE rebuild, engine fixes, Sonic Arranger/Symphonie parsers, settings refactor"
      },
      {
        type: 'improvement',
        "description": "Revert: undo 5 pattern editor optimization attempts that caused regressions"
      },
      {
        type: 'fix',
        "description": "Fix smooth scroll duration calculation returning inflated values"
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
