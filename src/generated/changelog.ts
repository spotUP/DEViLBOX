/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T22:51:24.303Z
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
export const BUILD_VERSION = '1.0.1424';
export const BUILD_NUMBER = '1424';
export const BUILD_HASH = '7b2ae20f';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1424',
    date: '2026-02-26',
    changes: [
      {
        type: 'fix',
        "description": "Remove 23 silent stub native parsers — route to UADE/libopenmpt"
      },
      {
        type: 'feature',
        "description": "Add instrument editor panels for OctaMED, SidMon1, HippelCoSo, RobHubbard, DavidWhittaker"
      },
      {
        type: 'fix',
        "description": "Correct 68k ASM bugs in AshleyHogg, JochenHippel7V, JochenHippelST parsers"
      },
      {
        type: 'fix',
        "description": "Route Magnetic Fields Packer directly to UADE"
      },
      {
        type: 'feature',
        "description": "40 new UADE format parsers + prefix routing"
      },
      {
        type: 'fix',
        "description": "Route Sawteeth to UADE and .667 to libopenmpt"
      },
      {
        type: 'feature',
        "description": "Add prefix routing for 18 UADE formats + wire native parser prefs"
      },
      {
        type: 'fix',
        "description": "Read initial cycle from position data instead of hardcoding 6"
      },
      {
        type: 'fix',
        "description": "Remove metadata-only native parse calls for 28 UADE formats"
      },
      {
        type: 'feature',
        "description": "Fashion Tracker, MultiMedia Sound parsers + dialog + UADE ext updates"
      },
      {
        type: 'feature',
        "description": "Add 9 UADE format parsers (TimeTracker, ChipTracker, Cinemaware, NTP, Alcatraz, Blade, TomyTracker, IMS, TME)"
      },
      {
        type: 'fix',
        "description": "Metadata-only parsers always delegate to UADE; fix XM multiSample persistence"
      },
      {
        type: 'feature',
        "description": "TME, Infogrames (DUM) native parsers + routing"
      },
      {
        type: 'fix',
        "description": "Halve playback speed - checkSongEvent was firing twice per sample"
      },
      {
        type: 'fix',
        "description": "Use bd.* prefix routing for Ben Daglish instead of .bd extension"
      },
      {
        type: 'feature',
        "description": "MMDC, PSA, Steve Turner parsers + routing"
      },
      {
        type: 'feature',
        "description": "SoundMaster, ZoundMonitor, TCB Tracker, Medley, RobHubbard parsers"
      },
      {
        type: 'improvement',
        "description": "Rewrite TCBTracker/RobHubbard/BenDaglish as metadata-only; add tcb.* routing"
      },
      {
        type: 'feature',
        "description": "Wire SoundMaster + ZoundMonitor parsers; update status doc"
      },
      {
        type: 'improvement',
        "description": "Add Furnace, Jeroen Tel, Mark Cooksey, Quartet to status; fix Symphonie duplicate"
      },
      {
        type: 'improvement',
        "description": "Add Symphonie Pro (.symmod) to format-implementation-status.md"
      },
      {
        type: 'improvement',
        "description": "Add Jason Page (jpn.*/jp.*) to format-implementation-status.md"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'improvement',
        "description": "Add Medley (.ml) to format-implementation-status.md"
      },
      {
        type: 'fix',
        "description": "Remove unused _version in LMEParser; fix RobHubbard v3 pos logic"
      },
      {
        type: 'feature',
        "description": "Medley native parser (.ml) + routing + settings key"
      },
      {
        type: 'fix',
        "description": "Register SymphonieSynth in ToneEngine; single instrument"
      },
      {
        type: 'fix',
        "description": "Deep-merge formatEngine on persist hydration"
      },
      {
        type: 'fix',
        "description": "Add SymphonieSynth to SYNTH_INFO; fix ArrayBufferLike cast"
      },
      {
        type: 'feature',
        "description": "Wire SymphonieSynth into InstrumentFactory, types, and parser"
      },
      {
        type: 'improvement',
        "description": "Remove unused _engineConnectedToSynth dead state"
      },
      {
        type: 'feature',
        "description": "SymphonieEngine singleton + SymphonieSynth wrapper"
      },
      {
        type: 'feature',
        "description": "Symphonie.worklet.js — VoiceExpander AudioWorklet processor"
      },
      {
        type: 'feature',
        "description": "Jason Page parser + routing"
      },
      {
        type: 'feature',
        "description": "Future Player native parser (.fp/FP.*)"
      },
      {
        type: 'fix',
        "description": "Correct _decodeDelta16 block-interleaved algorithm; fix loop comment"
      },
      {
        type: 'fix',
        "description": "Remove dead code and unused variables from parser files"
      },
      {
        type: 'feature',
        "description": "Mark Cooksey, Jeroen Tel, Quartet native parsers"
      },
      {
        type: 'feature',
        "description": "Leggless Music Editor (LME) native parser"
      },
      {
        type: 'feature',
        "description": "ParseSymphonieForPlayback() with PCM extraction and DSP events"
      },
      {
        type: 'feature',
        "description": "GDM, MDL, NRU, PTM native parsers + parser bug fixes"
      },
      {
        type: 'feature',
        "description": "SymphoniePlaybackData interfaces"
      },
      {
        type: 'feature',
        "description": "Dave Lowe (.dl) native parser with UADE fallback"
      },
      {
        type: 'feature',
        "description": "UFO/MicroProse (.ufo/.mus) native parser with UADE fallback"
      },
      {
        type: 'feature',
        "description": "Richard Joseph Player (.rjp/.sng) native parser"
      },
      {
        type: 'fix',
        "description": "Routing fixes + parser bug fixes"
      },
      {
        type: 'feature',
        "description": "Wire IFF SMUS, MFP, Delta Music 1.0 parsers; cleanup duplicates"
      },
      {
        type: 'feature',
        "description": "AMS (Extreme Tracker / Velvet Studio) native parser (OpenMPT)"
      },
      {
        type: 'feature',
        "description": "MadTracker 2 and PSM native parsers (OpenMPT)"
      },
      {
        type: 'feature',
        "description": "FM Tracker, XMF, UAX native parsers"
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
