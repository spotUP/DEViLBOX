/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-26T17:00:11.203Z
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
export const BUILD_VERSION = '1.0.6230';
export const BUILD_NUMBER = '6230';
export const BUILD_HASH = 'f1c8e84a9';
export const BUILD_DATE = '2026-04-26';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6230',
    date: '2026-04-26',
    changes: [
      {
        type: 'fix',
        "description": "Shrink volume slider + add MCP debugging rule to CLAUDE.md"
      },
      {
        type: 'fix',
        "description": "MCP subprocess always connects as client, never races for port 4003"
      },
      {
        type: 'fix',
        "description": "Stagger CED instrument classifications 200ms apart"
      },
      {
        type: 'fix',
        "description": "Use status message bar for CED progress, remove tiny footer indicator"
      },
      {
        type: 'fix',
        "description": "Instrument list badges + CED worker race condition + width"
      },
      {
        type: 'feature',
        "description": "Smooth selection animation in instrument list"
      },
      {
        type: 'fix',
        "description": "InstrumentSelector — remove name, fix arrows, fix re-renders"
      },
      {
        type: 'fix',
        "description": "Trigger CED classification on instrument list mount/change, not only AutoDub tick"
      },
      {
        type: 'feature',
        "description": "CED type tags in InstrumentList + InstrumentSelector in FT2Toolbar"
      },
      {
        type: 'feature',
        "description": "Channel classification for UADE/SID song-level replayers"
      },
      {
        type: 'feature',
        "description": "Deterministic synthType → role mapping, no CED needed"
      },
      {
        type: 'feature',
        "description": "Classify synth instruments via SynthBaker bake + CED"
      },
      {
        type: 'feature',
        "description": "CED neural instrument classifier — per-channel live role timeline"
      },
      {
        type: 'feature',
        "description": "Skank echo throw — dotted-delay offbeat dub move"
      },
      {
        type: 'feature',
        "description": "SID filter curve wiring + D00 song position display"
      },
      {
        type: 'fix',
        "description": "Prince Jammy style reverts to Custom in dropdown"
      }
    ]
  },
  {
    version: '2026-04-25',
    date: '2026-04-25',
    changes: [
      {
        type: 'feature',
        "description": "AutoDub seeds role-appropriate sends on enable when a style is active"
      },
      {
        type: 'feature',
        "description": "AutoDub channel exclude — 'Exclude' option in per-channel role selector"
      },
      {
        type: 'fix',
        "description": "Style dropdown reverts to Custom + Tubby init beep"
      },
      {
        type: 'fix',
        "description": "Open up dub bus presets — less 'in a jar', more treble air and sub depth"
      },
      {
        type: 'fix',
        "description": "TubbyScream — warm mid-range squeal instead of metallic subway brake"
      },
      {
        type: 'fix',
        "description": "Character preset audit — Scientist reverb, Tubby return EQ"
      },
      {
        type: 'fix',
        "description": "Perry preset — remove constant direct spring sends, reduce phaser sweep"
      },
      {
        type: 'fix',
        "description": "Dub deck style selector — stable derivation and defer channel sends"
      },
      {
        type: 'fix',
        "description": "Dub deck UX + SID visualizer + generic format visualizer"
      },
      {
        type: 'feature',
        "description": "World-class dub deck — version drop, phrase arc, authentic personas"
      },
      {
        type: 'fix',
        "description": "Extend pattern break dimming to cover Bxx (position jump) effect"
      },
      {
        type: 'fix',
        "description": "D00 indicator visible even when break is on the last row"
      },
      {
        type: 'feature',
        "description": "Dim unreachable rows past D (Pattern Break) effect"
      },
      {
        type: 'feature',
        "description": "Per-channel EQ/reverb/sweep presets per dub persona"
      },
      {
        type: 'fix',
        "description": "Dub deck layout overflow + AutoDub baseline sends"
      },
      {
        type: 'fix',
        "description": "Replace require() with proper ESM imports for PerChannelDubFx"
      },
      {
        type: 'fix',
        "description": "Hold buttons use setPointerCapture to prevent premature release"
      },
      {
        type: 'feature',
        "description": "Multi-pattern role voting + skank AutoDub rules"
      },
      {
        type: 'feature',
        "description": "Global Headphones mode toggle in tracker settings"
      },
      {
        type: 'feature',
        "description": "Wire SID Stereo Enhance + Headphones controls to audio engine"
      },
      {
        type: 'feature',
        "description": "Wire SID dialog pan + reverb to live audio engine"
      },
      {
        type: 'feature',
        "description": "Per-channel dub mini-chain (filter + reverb send + comb sweep)"
      },
      {
        type: 'fix',
        "description": "Make combSweep audible — boost rate+depth on fire, restore on release"
      },
      {
        type: 'fix',
        "description": "Role select shows detected role when auto, amber when locked"
      },
      {
        type: 'fix',
        "description": "Replace role chips with compact select dropdown in channel strip"
      },
      {
        type: 'feature',
        "description": "Manual channel role override for AutoDub targeting"
      },
      {
        type: 'fix',
        "description": "Runtime audio overrides note-stats roles for tracker music"
      },
      {
        type: 'feature',
        "description": "Pre-play audio scrub for channel role classification"
      },
      {
        type: 'fix',
        "description": "Add dub.combSweep to MappableParameter type"
      },
      {
        type: 'feature',
        "description": "Skank channel role + off-beat pattern detector"
      },
      {
        type: 'feature',
        "description": "Liquid comb sweep dub move + AutoDub rules"
      },
      {
        type: 'fix',
        "description": "Reset character fields to defaults when switching to Custom preset"
      },
      {
        type: 'fix',
        "description": "Defer returnEQ activation during preset transitions to prevent beep"
      },
      {
        type: 'feature',
        "description": "Add comb sweep / phaser controls to dub deck TONE row"
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
