/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-26T20:11:38.328Z
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
export const BUILD_VERSION = '1.0.1397';
export const BUILD_NUMBER = '1397';
export const BUILD_HASH = '5cc7a9ae';
export const BUILD_DATE = '2026-02-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1397',
    date: '2026-02-26',
    changes: [
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
      },
      {
        type: 'feature',
        "description": "X-Tracker DMF native parser (OpenMPT)"
      },
      {
        type: 'feature',
        "description": "Imago Orpheus, C67/CDFM, EasyTrax, Karl Morton native parsers"
      },
      {
        type: 'feature',
        "description": "9 new format parsers — PT36, SpeedySystem, STK, IMF, STP, AMF, MDL, Tronic"
      },
      {
        type: 'feature',
        "description": "DigiBooster Pro (.dbm) native parser (OpenMPT)"
      },
      {
        type: 'feature',
        "description": "Composer 667 and Chuck Biscuits / Black Artist native parsers"
      },
      {
        type: 'feature',
        "description": "DigiBooster Pro (.dbm) and Imago Orpheus (.imf) native parsers"
      },
      {
        type: 'feature',
        "description": "STK (Ultimate SoundTracker) and STP (SoundTracker Pro II) native parsers"
      },
      {
        type: 'feature',
        "description": "Symphonie Pro native parser (OpenMPT)"
      },
      {
        type: 'feature',
        "description": "Graoumf Tracker 2 native parser (OpenMPT)"
      },
      {
        type: 'improvement',
        "description": "Update format status — add IMS, ICE, KRIS; sync all implemented parsers"
      },
      {
        type: 'feature',
        "description": "Wire NRU, PTM, GDM parsers; add Digital Symphony and Digital Sound Studio"
      },
      {
        type: 'feature',
        "description": "Digital Sound Studio native parser"
      },
      {
        type: 'feature',
        "description": "10 PC/DOS tracker format parsers — UNIC, MTM, 669, FAR, PLM, ULT, RTM, DSM, DTM, STM"
      },
      {
        type: 'feature',
        "description": "Synthesis and Music Assembler native parsers"
      },
      {
        type: 'feature',
        "description": "Actionamics, Activision Pro, Ron Klaren native parsers"
      },
      {
        type: 'feature',
        "description": "Game Music Creator and Face The Music native parsers (OpenMPT)"
      },
      {
        type: 'improvement',
        "description": "Update format implementation status with all recent parsers and in-progress agents"
      },
      {
        type: 'feature',
        "description": "Add IMS, ICE, KRIS, GMC native parsers"
      },
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
