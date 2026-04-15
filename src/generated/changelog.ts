/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-15T06:56:33.329Z
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
export const BUILD_VERSION = '1.0.5287';
export const BUILD_NUMBER = '5287';
export const BUILD_HASH = '2452748fe';
export const BUILD_DATE = '2026-04-15';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5287',
    date: '2026-04-15',
    changes: [
      {
        type: 'fix',
        "description": "Fix drumpad bugs: stutter routing, copy/paste, touch handling"
      },
      {
        type: 'feature',
        "description": "Advanced sample editor demo, subtitle fade, Kraftwerk mouth fix"
      },
      {
        type: 'improvement',
        "description": "Replace deprecated ScriptProcessor with delay-based stutter"
      },
      {
        type: 'feature',
        "description": "Interactive drumpad/synth demo, subtitle fade fix, Kraftwerk mouth"
      },
      {
        type: 'improvement',
        "description": "Remove dead padMode code from drumpad store"
      },
      {
        type: 'fix',
        "description": "Cut/edit operations now update engine sample"
      },
      {
        type: 'fix',
        "description": "Fix stutter DJ FX not connecting to master audio"
      },
      {
        type: 'feature',
        "description": "Add preset selection to drumpad synth assignment"
      },
      {
        type: 'fix',
        "description": "Tracker song loading bypasses import dialog"
      },
      {
        type: 'feature',
        "description": "Add full synth browser to drumpad context menu"
      },
      {
        type: 'fix',
        "description": "Tour DJ loading uses proper pipeline render path"
      }
    ]
  },
  {
    version: '2026-04-14',
    date: '2026-04-14',
    changes: [
      {
        type: 'feature',
        "description": "Interactive hands-on tour with voice FX and subtitle fade"
      },
      {
        type: 'feature',
        "description": "Tour enhancements — demo song, Kraftwerk head, spotlight"
      },
      {
        type: 'fix',
        "description": "Tour skip resolves delay promise to prevent loop hang"
      },
      {
        type: 'feature',
        "description": "Guided tour with DECtalk voiceover and subtitles"
      },
      {
        type: 'fix',
        "description": "Fix ROM speech synths in drumpad context menu"
      },
      {
        type: 'fix',
        "description": "Make Kraftwerk head spikes visible — correct coordinate space"
      },
      {
        type: 'feature',
        "description": "Add all speech synths to drumpad context menu"
      },
      {
        type: 'improvement',
        "description": "Prevent drum pads from triggering on right-click"
      },
      {
        type: 'feature',
        "description": "Add full one-shot preset selection to pad context menu"
      },
      {
        type: 'fix',
        "description": "Deep audit — 6 issues fixed across VJ pipeline"
      },
      {
        type: 'improvement',
        "description": "Remove mode tabs entirely - bank-based organization only"
      },
      {
        type: 'fix',
        "description": "Replace fade-to-black with preload strategy for smooth transitions"
      },
      {
        type: 'improvement',
        "description": "Show all DJ presets in all modes for better bank organization"
      },
      {
        type: 'fix',
        "description": "Hide shader compilation behind fade-to-black overlay"
      },
      {
        type: 'improvement',
        "description": "Remove test file"
      },
      {
        type: 'improvement',
        "description": "Show empty pads as 'Empty' instead of mode mapping placeholders"
      },
      {
        type: 'fix',
        "description": "Hide pattern overlay for formats without real pattern data"
      },
      {
        type: 'fix',
        "description": "Fix DJ FX pad display: show actual pad names/colors when loaded"
      },
      {
        type: 'fix',
        "description": "Eliminate frame drops during transitions and playback"
      },
      {
        type: 'fix',
        "description": "Playlist reorder selection, post-limiter metering, import error handling"
      },
      {
        type: 'fix',
        "description": "VJ popout now works - was missing from DOM mode render"
      },
      {
        type: 'fix',
        "description": "DJ/DrumPad audit round 4 - EQ kill clicks, atomic IDB save, AutoDJ resilience"
      },
      {
        type: 'fix',
        "description": "Debug: add logging inside PopOutWindow conditional"
      },
      {
        type: 'fix',
        "description": "Debug: add App render logging for vjPoppedOut state"
      },
      {
        type: 'fix',
        "description": "Strip 2SID/SCC Extended/parenthetical suffixes in SID repair"
      },
      {
        type: 'fix',
        "description": "Debug: add PopOutWindow logging to trace popup issue"
      },
      {
        type: 'fix',
        "description": "Debug: add VJ popout logging to diagnose issue"
      },
      {
        type: 'fix',
        "description": "Deep audit round 3 — DJ engine, state management, and live performance reliability"
      },
      {
        type: 'fix',
        "description": "DJ preset loading now auto-switches to Bank A"
      },
      {
        type: 'fix',
        "description": "Improve drumpad text contrast"
      },
      {
        type: 'fix',
        "description": "SID repair filter checks path not name for .sid extension"
      },
      {
        type: 'fix',
        "description": "PadButton uniform dark bg with colored text + SID render frame count fix"
      },
      {
        type: 'feature',
        "description": "Add full one-shot preset browser to pad wizard"
      },
      {
        type: 'fix',
        "description": "One-shot pad assignment now uses actual preset configs"
      },
      {
        type: 'fix',
        "description": "DJ vocoder race conditions, error boundary recovery, drumpad keyboard dedup + voice cleanup"
      },
      {
        type: 'fix',
        "description": "WebSID init regex for nested braces in spp_backend_state_SID"
      },
      {
        type: 'fix',
        "description": "Route HVSC SIDs to WebSID pipeline, not UADE, when loading to DJ deck"
      },
      {
        type: 'fix',
        "description": "Move SID_PLAYLIST_KEYWORDS before store creation to avoid TDZ"
      },
      {
        type: 'feature',
        "description": "Auto-repair SID playlists on store load"
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
