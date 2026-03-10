/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-10T20:55:13.421Z
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
export const BUILD_VERSION = '1.0.2614';
export const BUILD_NUMBER = '2614';
export const BUILD_HASH = '90546c78a';
export const BUILD_DATE = '2026-03-10';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2614',
    date: '2026-03-10',
    changes: [
      {
        type: 'feature',
        "description": "Click-outside-to-close and auto-close for Modland browser"
      },
      {
        type: 'fix',
        "description": "Sync button matches BPM only, no longer seeks/resets position"
      },
      {
        type: 'fix',
        "description": "Eliminate clicks in fader LFO and scratch pattern chops"
      },
      {
        type: 'feature',
        "description": "Add V2 Synthesizer worklet and instrument types"
      },
      {
        type: 'improvement',
        "description": "Add pattern editor optimization and loop stutter fix notes"
      },
      {
        type: 'improvement',
        "description": "Chore: engine, store, tracker, and miscellaneous updates"
      },
      {
        type: 'improvement',
        "description": "Pixi UI dialog and component updates"
      },
      {
        type: 'improvement',
        "description": "Dialog and modal UI improvements"
      },
      {
        type: 'feature',
        "description": "DJ engine improvements and component updates"
      },
      {
        type: 'feature',
        "description": "Add tracker analysis pipeline with genre detection"
      },
      {
        type: 'feature',
        "description": "Add V2 Synthesizer and V2M Player WASM modules"
      },
      {
        type: 'fix',
        "description": "Browser panels overlay + one-shot scratch buttons"
      },
      {
        type: 'feature',
        "description": "Add CSS Technics SL-1200 turntable with proper aspect ratio"
      },
      {
        type: 'fix',
        "description": "Fix bulk pattern edits not syncing to playback engines"
      }
    ]
  },
  {
    version: '2026-03-09',
    date: '2026-03-09',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update gitignore, gearmulator build, and changelog"
      },
      {
        type: 'feature',
        "description": "Chore: add Claude slash commands, update MCP config and CLAUDE.md"
      },
      {
        type: 'feature',
        "description": "AI chat panel, SC68 visualizer, VU meters, and UI improvements"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro delta16 decoding and sample editor for native formats"
      },
      {
        type: 'feature',
        "description": "Engine improvements, new exporters, and format support updates"
      },
      {
        type: 'feature',
        "description": "Add AI chat, music analysis, and MCP bridge improvements"
      },
      {
        type: 'feature',
        "description": "Update WASM engine builds and add Furnace FileOps module"
      }
    ]
  },
  {
    version: '2026-03-08',
    date: '2026-03-08',
    changes: [
      {
        type: 'fix',
        "description": "Pre-upload all Furnace instruments before sequencer playback"
      },
      {
        type: 'feature',
        "description": "Add Ben Daglish, SidMon2, Symphonie Pro WASM engines and improvements"
      },
      {
        type: 'fix',
        "description": "Furnace INS2 instrument upload for all non-FM platforms"
      },
      {
        type: 'fix',
        "description": "Furnace C64 SID crash — HEAPU8 undefined after WASM memory growth"
      },
      {
        type: 'fix',
        "description": "Register missing C64SID, KlysSynth, Sc68Synth in SYNTH_INFO"
      },
      {
        type: 'fix',
        "description": "Cap Symphonie instruments at 128 to prevent duplicate React keys"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro mix clipping and sample-to-instrument mapping"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro broken audio — suppress notes and fix instrument types"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro silent playback and missing instrument samples"
      },
      {
        type: 'fix',
        "description": "Reduce MCP bridge reconnect spam and fix Symphonie type errors"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore artofnoise/pumatracker build dirs and update changelog"
      },
      {
        type: 'feature',
        "description": "Chore: add Furnace audit tools for parser testing and DEViLBOX rendering"
      },
      {
        type: 'fix',
        "description": "Pixi UI improvements for modals, scroll views, and settings"
      },
      {
        type: 'feature',
        "description": "Integrate ArtOfNoise/PumaTracker engines and debounced WASM re-export"
      },
      {
        type: 'feature',
        "description": "Add Digital Symphony and PumaTracker native format exporters"
      },
      {
        type: 'improvement',
        "description": "Chore: update Gearmulator WASM bridge and snapshot dumper"
      },
      {
        type: 'feature',
        "description": "Update Furnace dispatch wrapper, sequencer, and effect router"
      },
      {
        type: 'feature',
        "description": "Add ArtOfNoise and PumaTracker WASM engines"
      },
      {
        type: 'feature',
        "description": "Add UADE pattern encoders for 30 formats and uadePatternLayout support"
      },
      {
        type: 'fix',
        "description": "Resolve build errors and remove regression tests from dev.sh"
      },
      {
        type: 'fix',
        "description": "Resolve TypeScript errors in MCP bridge handlers and SonicArrangerEncoder"
      },
      {
        type: 'feature',
        "description": "Add MCP server with 116 tools for full tracker control and audio debugging"
      }
    ]
  },
  {
    version: '2026-03-07',
    date: '2026-03-07',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: gitignore local Reference Code/Music symlinks"
      },
      {
        type: 'improvement',
        "description": "Chore: update gearmulator WASM JS and UADE pattern encoder"
      },
      {
        type: 'fix',
        "description": "Patch Furnace platform sources for WASM dispatch compatibility"
      },
      {
        type: 'feature',
        "description": "Chore: add serena memories and furnace audit tools"
      },
      {
        type: 'feature',
        "description": "Add gearmulator JP-8000 RAM dump and MicroQ snapshot tools"
      },
      {
        type: 'feature',
        "description": "Add new components, engines, and UADE format encoders"
      },
      {
        type: 'improvement',
        "description": "Update audit reports, CLAUDE.md, and project metadata"
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
