/**
 * Auto-generated changelog from git commits
 * Generated: 2026-05-05T17:06:57.598Z
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
export const BUILD_VERSION = '1.0.6365';
export const BUILD_NUMBER = '6365';
export const BUILD_HASH = 'a79ce98d1';
export const BUILD_DATE = '2026-05-05';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6365',
    date: '2026-04-30',
    changes: [
      {
        type: 'feature',
        "description": "Embed: add keyboard router for pattern editor navigation"
      },
      {
        type: 'feature',
        "description": "Add ?embed=pattern-editor mode for iframe embedding"
      }
    ]
  },
  {
    version: '2026-04-28',
    date: '2026-04-28',
    changes: [
      {
        type: 'fix',
        "description": "Throttle magnitude requests to prevent audio dropouts on drag"
      },
      {
        type: 'feature',
        "description": "GLOBAL FX lane is now a vertical column to the left of channel 1"
      },
      {
        type: 'improvement',
        "description": "Revert: hide global FX lane in format mode (Hively/MusicLine/etc.)"
      },
      {
        type: 'fix',
        "description": "Dub auto-write reaches Hively/AHX songs (native-data formats)"
      },
      {
        type: 'fix',
        "description": "AutoDub Zxx cells use live WASM row + globals go to the global lane"
      },
      {
        type: 'fix',
        "description": "Render Zxx for extended dub-effect slots (effTyp 39/40)"
      },
      {
        type: 'feature',
        "description": "AutoDub writes effect cells inline for trigger moves (global + per-channel)"
      },
      {
        type: 'fix',
        "description": "Rename Gated Flanger → Prince Jammy"
      },
      {
        type: 'fix',
        "description": "Phat width + depth on Tubby/Scientist/MadProf/GatedFlanger"
      },
      {
        type: 'fix',
        "description": "Faster decay + cure muddy buildup in echo + spring tail"
      },
      {
        type: 'feature',
        "description": "Punchy bass via masterBassPunchDb + fix scrub volume snap"
      },
      {
        type: 'fix',
        "description": "Hively/Klystrack mute via globalThis registry — Vite dup-module workaround"
      },
      {
        type: 'fix',
        "description": "AutoDub disposer cleanup and tubbyScream priorWet snowball"
      },
      {
        type: 'improvement',
        "description": "Revert: restore sidechain compressor ratio=6 — diagnostic was negative"
      },
      {
        type: 'improvement',
        "description": "Chore: remove diagnostic logging from dub moves and mixer"
      },
      {
        type: 'fix',
        "description": "Replace fixed WET_COOLDOWN_SEC with dynamic nextWetAllowedMs"
      },
      {
        type: 'improvement',
        "description": "Test: disable sidechain compressor (ratio=1) to diagnose mix smashing"
      },
      {
        type: 'fix',
        "description": "DubSiren missing wet:true — was bypassing wet stacking cooldowns"
      },
      {
        type: 'fix',
        "description": "Remove tubbyScream from AutoDub rules — manual-only move"
      },
      {
        type: 'fix',
        "description": "TubbyScream release — kill feedback immediately, flush spring energy"
      },
      {
        type: 'fix',
        "description": "MasterDrop snowball silence + logging on all output-affecting moves"
      },
      {
        type: 'improvement',
        "description": "Revert: sidechain back to original -28dB/6:1 — was crushing the mix"
      },
      {
        type: 'fix',
        "description": "Hively volume double-application — use binary mute in WASM gains"
      },
      {
        type: 'fix',
        "description": "Debug: add diagnostics to find Hively silence regression"
      },
      {
        type: 'fix',
        "description": "Hively mute/solo actually broken in isolation path — gains reset every frame"
      },
      {
        type: 'fix',
        "description": "Four dub/EQ issues — EQ curve, vinyl noise, stuck-music logging, beep"
      },
      {
        type: 'fix',
        "description": "Hively/AHX mute/solo — re-apply channel gains after song loop"
      },
      {
        type: 'fix',
        "description": "Prevent dub effect stacking — cross-bar wet cooldown + stiffer sidechain"
      },
      {
        type: 'fix',
        "description": "Dub bus core routing — native→native connect for tapeSat inputs"
      },
      {
        type: 'fix',
        "description": "King Tubby RE-201 inaudible — restore echoSpring chain order"
      },
      {
        type: 'fix',
        "description": "GhostReverb audition stuck + role chip infinite re-render loop"
      },
      {
        type: 'feature',
        "description": "Role chip in channel headers — click to cycle dub role override"
      },
      {
        type: 'fix',
        "description": "Transport buttons in nav header now clickable — grid layout replaces absolute"
      },
      {
        type: 'fix',
        "description": "SID visualizer dead when bus ON — Tone→native connections in master insert"
      }
    ]
  },
  {
    version: '2026-04-27',
    date: '2026-04-27',
    changes: [
      {
        type: 'fix',
        "description": "AutoDub EQ mode gate + BPM sync for adaptive EQ timing"
      },
      {
        type: 'fix',
        "description": "RerouteOutput bypassed post-master vinyl + remove dead vinylSum node"
      },
      {
        type: 'fix',
        "description": "Auto Dub improv EQ was inaudible — bands never enabled"
      },
      {
        type: 'fix',
        "description": "Move FT2 transport into main app header nav row (centered)"
      },
      {
        type: 'fix',
        "description": "NavBar transport, search persistence, SID viz, EQ visibility, vinyl post-mix"
      },
      {
        type: 'fix',
        "description": "Dub audit — EQ auto-enable, gated flanger, crushBass level"
      },
      {
        type: 'fix',
        "description": "SID per-voice tap check + clearer Auto Dub status messages"
      },
      {
        type: 'fix',
        "description": "Tubby scream — warm mid-range howl, not ice-pick shriek"
      },
      {
        type: 'fix',
        "description": "Club sim IR quality + SID dub send baseline + FT2 transport in NavBar"
      },
      {
        type: 'feature',
        "description": "File dialog persists search query with inline X to clear"
      },
      {
        type: 'fix',
        "description": "Improv loop — subtract prev delta before applying new to stop EQ accumulation drift"
      },
      {
        type: 'feature',
        "description": "FX Wet fader in DubDeckStrip — same quick returnGain control as DJ mixer"
      },
      {
        type: 'fix',
        "description": "RiddimSection — guard c.bar > 0 to prevent instant mute on AutoDub start"
      },
      {
        type: 'fix',
        "description": "Restore Tubby springWet 0.38→0.50 — spring is load-bearing for click moves"
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
