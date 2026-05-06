/**
 * Auto-generated changelog from git commits
 * Generated: 2026-05-06T12:53:56.090Z
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
export const BUILD_VERSION = '1.0.6386';
export const BUILD_NUMBER = '6386';
export const BUILD_HASH = '5da5958cd';
export const BUILD_DATE = '2026-05-06';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6386',
    date: '2026-05-06',
    changes: [
      {
        type: 'feature',
        "description": "Maschine MK2 HID bridge + NKS auto-mapper updates"
      },
      {
        type: 'fix',
        "description": "Use updateInstrumentRealtime in SCKnobPanel for smooth knob control"
      },
      {
        type: 'improvement',
        "description": "Update auto-generated changelog"
      },
      {
        type: 'feature',
        "description": "Add Maschine MK2 display rendering and NI hardware protocol"
      },
      {
        type: 'improvement',
        "description": "Rewrite Maschine MK2 bridge to hybrid NIHIA/HID architecture"
      },
      {
        type: 'fix',
        "description": "Fix per-channel master FX: skip rebuild when no WASM isolation engine"
      },
      {
        type: 'improvement',
        "description": "Retune safety limiter — gentle soft-knee instead of brickwall"
      },
      {
        type: 'fix',
        "description": "Fix master FX mix slider triggering drag reorder"
      },
      {
        type: 'feature',
        "description": "Add master limiter controls — toggle + threshold knob"
      },
      {
        type: 'fix',
        "description": "Master FX channel routing with hybrid playback + channel-add stutter"
      },
      {
        type: 'fix',
        "description": "Master FX channel routing kills all effects when no isolation engine"
      },
      {
        type: 'fix',
        "description": "DJ subscriber storms — split subscriptions, useShallow, selectors"
      }
    ]
  },
  {
    version: '2026-05-05',
    date: '2026-05-05',
    changes: [
      {
        type: 'feature',
        "description": "Auto-connect to Maschine MK2 Virtual Input, disable HID bridge"
      },
      {
        type: 'fix',
        "description": "Deep audit pass 2 — hot paths, re-render storms, engine allocations"
      },
      {
        type: 'fix',
        "description": "Deep audio interference audit — batch WASM position, DJ playback, layout reflow"
      },
      {
        type: 'fix',
        "description": "Audit sweep — batch remaining audio-interfering paths"
      },
      {
        type: 'fix',
        "description": "Await instrument effect chain builds before playback starts"
      },
      {
        type: 'fix',
        "description": "Batch instrument effect wet/param store writes to stop audio halts"
      },
      {
        type: 'improvement',
        "description": "Eliminate UI audio interference: selectors + batched master FX"
      },
      {
        type: 'improvement',
        "description": "Batch remaining continuous stores: dub, audio, booth volume"
      },
      {
        type: 'fix',
        "description": "Batch store writes for all continuous controls to prevent audio glitches"
      }
    ]
  },
  {
    version: '2026-04-30',
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
