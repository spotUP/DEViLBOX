/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-27T08:43:40.191Z
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
export const BUILD_VERSION = '1.0.1465';
export const BUILD_NUMBER = '1465';
export const BUILD_HASH = '2d167a9e';
export const BUILD_DATE = '2026-02-27';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1465',
    date: '2026-02-27',
    changes: [
      {
        type: 'fix',
        "description": "Thread linearPeriods through store → replayer"
      },
      {
        type: 'fix',
        "description": "Thread hivelyFileData/hivelyMeta through store → replayer"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog"
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
      },
      {
        type: 'fix',
        "description": "Hook pumaTracker pref key into PumaTracker stub"
      },
      {
        type: 'feature',
        "description": "Wire Composer667 native parser (batch 6)"
      },
      {
        type: 'feature',
        "description": "Test(import): add ITParser vitest suite for orbiter.it and sunchild.it"
      },
      {
        type: 'fix',
        "description": "Guard EnvelopeConverter against negative sustainPointIdx"
      },
      {
        type: 'fix',
        "description": "Correct S3M 3-byte paragraph pointer byte order"
      },
      {
        type: 'feature',
        "description": "Wire FMTracker, MadTracker2, PSM native parsers (batch 5)"
      },
      {
        type: 'feature',
        "description": "Wire 9 more native parser guards + add 4 new format keys"
      },
      {
        type: 'feature',
        "description": "Native S3M and IT parsers with real PCM extraction"
      },
      {
        type: 'improvement',
        "description": "Chore: clean up stale masterplan todos and dead useEffect"
      },
      {
        type: 'feature',
        "description": "Rewrite TFMXControls with editable VolModSeq/SndModSeq macro viewer"
      },
      {
        type: 'feature',
        "description": "Wire 51 more UADE stubs with native parser guards (batch 3)"
      },
      {
        type: 'feature',
        "description": "Extract Rob Hubbard PCM samples + wire 4 more native parsers"
      },
      {
        type: 'feature',
        "description": "Wire 9 more native parsers — UFO, IffSmus, MagneticFieldsPacker, RichardJoseph, DaveLowe, LME, JochenHippelST, SpecialFX, BenDaglish"
      },
      {
        type: 'feature',
        "description": "Wire OctaMED, SidMon1, HippelCoSo, DavidWhittaker synths into ToneEngine"
      },
      {
        type: 'feature',
        "description": "Wire 18 native parsers — Medley, MarkCooksey, JeroenTel, Quartet, SoundMaster, ZoundMonitor, SynthPack, TCBTracker, MMDC, PSA, SteveTurner, TME, JasonBrooke, Laxity, FredGray, MusicMaker4V/8V, ManiacsOfNoise"
      },
      {
        type: 'improvement',
        "description": "Sync format-implementation-status with batch-3/4 parsers and routing audit"
      },
      {
        type: 'fix',
        "description": "Remove 22 final silent stub native parsers — route to UADE"
      }
    ]
  },
  {
    version: '2026-02-26',
    date: '2026-02-26',
    changes: [
      {
        type: 'fix',
        "description": "Correct Medley subsong pointer arithmetic and add placeholder instrument"
      },
      {
        type: 'fix',
        "description": "Remove 35 more silent stub native parsers — route to UADE"
      },
      {
        type: 'feature',
        "description": "Complete UADE prefix routing coverage + native parser prefs"
      },
      {
        type: 'improvement',
        "description": "Swap stale format prefs for new parser wiring"
      },
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
