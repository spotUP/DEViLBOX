/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-27T00:59:06.044Z
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
export const BUILD_VERSION = '1.0.1446';
export const BUILD_NUMBER = '1446';
export const BUILD_HASH = '386f1f96';
export const BUILD_DATE = '2026-02-27';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1446',
    date: '2026-02-27',
    changes: [
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
