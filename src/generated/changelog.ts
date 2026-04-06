/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-06T15:09:21.533Z
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
export const BUILD_VERSION = '1.0.4325';
export const BUILD_NUMBER = '4325';
export const BUILD_HASH = 'd9fec10ca';
export const BUILD_DATE = '2026-04-06';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4325',
    date: '2026-04-06',
    changes: [
      {
        type: 'fix',
        "description": "Polyfill TextDecoder in worklet + redeploy libopenmpt WASM with channel state API"
      },
      {
        type: 'improvement',
        "description": "Revert: restore original working libopenmpt WASM binary"
      },
      {
        type: 'feature',
        "description": "Worklet channel state extraction + LibopenmptEngine callback"
      },
      {
        type: 'feature',
        "description": "Deploy rebuilt libopenmpt WASM with per-channel state API"
      },
      {
        type: 'feature',
        "description": "UADE full editability — sample extraction, pattern parsing, uadeEditableFileData for 115+ formats"
      },
      {
        type: 'fix',
        "description": "Use std::uint32_t in libopenmpt channel state GetFreqFromPeriod call"
      },
      {
        type: 'feature',
        "description": "Operator macro subtabs, NES DPCM viewer, old format macro parsing"
      },
      {
        type: 'feature',
        "description": "Add fireHybridNotesFromChannelState and wire onChannelState in libopenmpt path"
      },
      {
        type: 'feature',
        "description": "Full Furnace instrument format parity — all 27 feature blocks, signed types, UI panels"
      },
      {
        type: 'feature',
        "description": "Add per-channel state C API functions to libopenmpt"
      },
      {
        type: 'improvement',
        "description": "Phase 1 implementation plan — libopenmpt channel state export"
      },
      {
        type: 'improvement',
        "description": "OpenMPT as core engine — design spec"
      },
      {
        type: 'improvement',
        "description": "Hybrid playback driven by WASM engine position callbacks"
      },
      {
        type: 'fix',
        "description": "Make hybrid playback universal — not libopenmpt-only"
      },
      {
        type: 'fix',
        "description": "Hybrid playback — cut synth notes when channel switches to non-replaced instrument"
      },
      {
        type: 'feature',
        "description": "Complete mute/solo coverage — add remaining 6 engines"
      },
      {
        type: 'feature',
        "description": "Add setMuteMask to 5 WASM engines and register in mixer store"
      },
      {
        type: 'feature',
        "description": "Mute/solo forwards to ALL 29 WASM engines"
      },
      {
        type: 'fix',
        "description": "Mute/solo for all WASM engines — use dynamic import() instead of require()"
      },
      {
        type: 'fix',
        "description": "Sync AudioContext in getInstrument() to prevent cross-context errors"
      },
      {
        type: 'fix',
        "description": "Hybrid playback reads live pattern data from tracker store"
      },
      {
        type: 'fix',
        "description": "Start TS scheduler alongside libopenmpt when instruments are replaced"
      },
      {
        type: 'fix',
        "description": "Hybrid playback — rebuild replacedInstruments at play(), fix channel config"
      },
      {
        type: 'feature',
        "description": "Furnace editor parity — SSG-EG modes, N163 per-channel, FDS compat, GB double wave"
      },
      {
        type: 'fix',
        "description": "Silence replaced instrument samples BEFORE libopenmpt loads module"
      },
      {
        type: 'fix',
        "description": "Remove OPLL preset dropdown from Chip Settings tab"
      },
      {
        type: 'feature',
        "description": "Synth module panels now use per-synth brand colors for borders"
      },
      {
        type: 'feature',
        "description": "Apply panelStyle from useInstrumentColors for brand-colored module borders"
      },
      {
        type: 'fix',
        "description": "Remove C64SID player from synth browser, add OPLL hardware presets"
      },
      {
        type: 'feature',
        "description": "Preset dropdown shows current name, per-preset V2 volumes, showcase defaults"
      },
      {
        type: 'fix',
        "description": "Replace white synth module borders with design system border token"
      },
      {
        type: 'fix',
        "description": "Replace all raw Tailwind grays with design system tokens across instrument UI"
      },
      {
        type: 'fix',
        "description": "Replace raw Tailwind gray colors with design system tokens"
      },
      {
        type: 'fix',
        "description": "Remove ugly white/faded dividers from lists across the app"
      },
      {
        type: 'fix',
        "description": "Remove ugly white dividers from manual sidebar"
      },
      {
        type: 'feature',
        "description": "Bump manual tab fonts to match fullscreen help dialog"
      },
      {
        type: 'feature',
        "description": "Make help dialog fullscreen with bigger fonts (DOM + GL)"
      },
      {
        type: 'feature',
        "description": "V2 synth — real Farbrausch presets with full parameter support"
      },
      {
        type: 'feature',
        "description": "Route 21 more stub UADE formats through enhanced scan"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive C64/SID music tutorial for beginners"
      },
      {
        type: 'feature',
        "description": "Route 12 stub UADE formats through enhanced scan for pattern reconstruction"
      },
      {
        type: 'feature',
        "description": "Add per-channel muting to SC68, EUPMini, Ixalance, SunVox WASM engines"
      },
      {
        type: 'feature',
        "description": "UADE format audit — fix parsers, add sample extraction, route BD/JT through enhanced scan"
      },
      {
        type: 'feature',
        "description": "Per-channel mute for 8 song-based WASM engines"
      },
      {
        type: 'feature',
        "description": "Add per-channel muting to 4 song-based WASM engines"
      },
      {
        type: 'feature',
        "description": "Wire setMuteMask to per-channel WASM calls for 4 song-based engines"
      },
      {
        type: 'feature',
        "description": "DBX persistence + export warnings for replaced instruments"
      },
      {
        type: 'feature',
        "description": "Add setMuteMask to 20 WASM engines for per-channel muting"
      },
      {
        type: 'feature',
        "description": "Universal synth replacement routing for ALL WASM engines"
      },
      {
        type: 'feature',
        "description": "Universal hybrid playback infrastructure — replaced instruments API + dynamic WASM muting"
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
