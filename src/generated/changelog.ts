/**
 * Auto-generated changelog from git commits
 * Generated: 2026-05-08T14:27:01.802Z
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
export const BUILD_VERSION = '1.0.6441';
export const BUILD_NUMBER = '6441';
export const BUILD_HASH = '2e30ee5c4';
export const BUILD_DATE = '2026-05-08';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6441',
    date: '2026-05-07',
    changes: [
      {
        type: 'improvement',
        "description": "Consolidate MIDI settings into dedicated tab"
      },
      {
        type: 'feature',
        "description": "Add VST tab to Add Instrument dialog"
      },
      {
        type: 'feature',
        "description": "AU plugin picker UI — browse and load any AU instrument"
      },
      {
        type: 'feature',
        "description": "Generalize AU bridge — enumerate and load any AU plugin"
      },
      {
        type: 'fix',
        "description": "Kontakt bridge crash — CFRunLoop + SIGPIPE hardening"
      },
      {
        type: 'fix',
        "description": "Fix unhandled rejections in Kontakt MIDI routing"
      },
      {
        type: 'fix',
        "description": "Fix Kontakt synth type init error when selecting instrument"
      },
      {
        type: 'feature',
        "description": "Add Kontakt synth type for NKS preset MIDI routing"
      },
      {
        type: 'fix',
        "description": "Fix Add Instrument dialog: all 4 tabs render inline"
      },
      {
        type: 'feature',
        "description": "Consolidate instrument toolbar into unified Add dialog"
      },
      {
        type: 'fix',
        "description": "Fix NKS preset loading with pending preset data pattern"
      },
      {
        type: 'fix',
        "description": "Fix NKS Library preset load + Kontakt bridge auto-connect"
      },
      {
        type: 'fix',
        "description": "Fix Load Preset: create instrument when none selected"
      },
      {
        type: 'fix',
        "description": "Fix preset dialog hidden behind nav bar"
      },
      {
        type: 'feature',
        "description": "Add Library tab to instrument preset browser"
      },
      {
        type: 'fix',
        "description": "Fix Vite proxy: forward /api/* to Express:3011 in dev"
      },
      {
        type: 'feature',
        "description": "Add Surge XT (2618), OB-Xf (330), Odin2 (260) to preset browser"
      },
      {
        type: 'feature',
        "description": "Add cross-platform Kontakt bridge (AU/VST3 host, WebSocket audio streaming)"
      },
      {
        type: 'fix',
        "description": "Fix NKS browser to read from Kontakt 8 database (568 presets)"
      },
      {
        type: 'feature',
        "description": "Add DevilBOX synth preset browser (Helm + Dexed)"
      },
      {
        type: 'feature',
        "description": "Add Maschine MK3 display support and Traktor controller profiles"
      },
      {
        type: 'feature',
        "description": "Add KK Light Guide, Focus Follow, and Light Guide settings panel"
      },
      {
        type: 'feature',
        "description": "Add NKS Library Browser UI"
      },
      {
        type: 'feature',
        "description": "Add KK DAW MIDI protocol integration for Komplete Kontrol keyboards"
      },
      {
        type: 'fix',
        "description": "Fix flaky test timeouts: bump to 60s for heavy imports"
      },
      {
        type: 'improvement',
        "description": "SongScreen: show position chain with slot mute counts"
      },
      {
        type: 'fix',
        "description": "Pattern matrix sizing, always-show blocks, pattern numbers"
      },
      {
        type: 'fix',
        "description": "Fix piano roll auto-scroll to center on actual notes"
      },
      {
        type: 'feature',
        "description": "Renoise-style Pattern Matrix view with per-slot muting"
      },
      {
        type: 'feature',
        "description": "Add piano roll view to pattern editor"
      },
      {
        type: 'feature',
        "description": "Separate main encoder from knobs, add context-aware scrolling"
      },
      {
        type: 'feature',
        "description": "Add default factory mappings for Maschine MK2 and MPK Mini MK3"
      },
      {
        type: 'feature',
        "description": "Add Akai MPK Mini MK3 layout to MIDI controller mapper"
      },
      {
        type: 'feature',
        "description": "Add Maschine MK2 layout to MIDI controller mapper"
      }
    ]
  },
  {
    version: '2026-05-06',
    date: '2026-05-06',
    changes: [
      {
        type: 'fix',
        "description": "MK2 knob mapping: fix index, wire page switching, hide NKS bar"
      },
      {
        type: 'fix',
        "description": "Motor fader init retry + cache clear on dub toggle"
      },
      {
        type: 'improvement',
        "description": "Expand drum pads to 8 groups (A-H, 128 pads) for MK2"
      },
      {
        type: 'fix',
        "description": "Clear motor fader cache on init flush and dub toggle"
      },
      {
        type: 'fix',
        "description": "Fix drum pad grid: show all 16 pads for MK2, hide bank selector"
      },
      {
        type: 'improvement',
        "description": "Move TD-3 Pattern Transfer to Export/Import dialog"
      },
      {
        type: 'fix',
        "description": "Wire all 48 MK2 buttons: fix name mapping, add grid/volume/nav handlers"
      },
      {
        type: 'fix',
        "description": "Fix MIDI dropdown clipped by toolbar overflow-hidden"
      },
      {
        type: 'fix',
        "description": "Fix Controller Mapper modal not opening"
      },
      {
        type: 'fix',
        "description": "Fix motor faders not matching app state after reload"
      },
      {
        type: 'fix',
        "description": "Fix MK2 playback display: always update currentRow in transport store"
      },
      {
        type: 'fix',
        "description": "Fix null crash in MIDIMapperModal when no user overrides exist"
      },
      {
        type: 'fix',
        "description": "Visual MIDI controller mapper + motor fader snap-back fix"
      },
      {
        type: 'improvement',
        "description": "MK2: show 16 pads in 4x4 grid, set controllerPadCount on connect"
      },
      {
        type: 'improvement',
        "description": "MK2 pad LEDs reflect drum pad bank colors"
      },
      {
        type: 'feature',
        "description": "Persist mixer state in .dbx + reset X-Touch controls on init"
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
