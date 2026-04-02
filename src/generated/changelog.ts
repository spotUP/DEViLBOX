/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-02T12:15:32.836Z
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
export const BUILD_VERSION = '1.0.3872';
export const BUILD_NUMBER = '3872';
export const BUILD_HASH = '7b687175c';
export const BUILD_DATE = '2026-04-02';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3872',
    date: '2026-04-02',
    changes: [
      {
        type: 'fix',
        "description": "Bind Vite dev server to 0.0.0.0 for iPhone access"
      },
      {
        type: 'fix',
        "description": "Fix CalfMonoSynth ensureInitialized: actually start init"
      },
      {
        type: 'fix',
        "description": "Add touch events for iOS Safari compatibility"
      },
      {
        type: 'fix',
        "description": "Remove unused useCallback import and onViewModeChange param"
      },
      {
        type: 'fix',
        "description": "Fix DX7 prewarm: await voices + patch bank before ready"
      },
      {
        type: 'fix',
        "description": "Replace broken QR generator with qrcode library"
      },
      {
        type: 'fix',
        "description": "Fix recursive dist/ nesting: enable emptyOutDir"
      },
      {
        type: 'feature',
        "description": "Add QR code for iPhone pairing"
      },
      {
        type: 'fix',
        "description": "Remove radial visual bg presets + add mode cycler to tracker header"
      },
      {
        type: 'feature',
        "description": "Complete iPhone remote control with WebRTC mic + pairing"
      },
      {
        type: 'fix',
        "description": "DOM tracker visual bg visible — make canvas container transparent"
      },
      {
        type: 'fix',
        "description": "Restore tracker visual background in both DOM and GL views"
      },
      {
        type: 'improvement',
        "description": "Chore: TrackerView minor update"
      },
      {
        type: 'improvement',
        "description": "Re-enable tracker visual background"
      },
      {
        type: 'feature',
        "description": "IPhone remote control for DJ mode (phases 1-3)"
      },
      {
        type: 'improvement',
        "description": "Remove: tracker visual background effect (glow orb behind pattern editor)"
      },
      {
        type: 'fix',
        "description": "DX7 audio fix + pre-warm all WASM synths on init"
      },
      {
        type: 'fix',
        "description": "Crate panel listings use icons instead of colored dots"
      },
      {
        type: 'fix',
        "description": "Tracker visual background — respect setting + enable in DOM view"
      },
      {
        type: 'fix',
        "description": "DJ deck layout to match DOM — track info, pitch slider, progress bar"
      },
      {
        type: 'fix',
        "description": "Add layout props to all navbar icon sprites for flex alignment"
      },
      {
        type: 'fix',
        "description": "Channel faders stretch to fill full mixer row height"
      },
      {
        type: 'fix',
        "description": "Restructure DJ mixer to single horizontal row matching DOM"
      },
      {
        type: 'fix',
        "description": "Replace broken icon references with correct mappings"
      },
      {
        type: 'feature',
        "description": "Add 14 missing Lucide icon mappings for GL parity"
      },
      {
        type: 'fix',
        "description": "File browser parity + mixer dB/VU/filter/video polish"
      },
      {
        type: 'feature',
        "description": "Fuzzy Modland search for 404 tracks, TFMX companion fix, fail report"
      },
      {
        type: 'improvement',
        "description": "Remove duplicate Dexed/OBXd synths, keep DX7/OBXf replacements"
      },
      {
        type: 'feature',
        "description": "DJ mixer polish — dB readouts, VU peak hold, filter labels, video timer"
      },
      {
        type: 'feature',
        "description": "Wire PixiDrumPadManager into GL view router"
      },
      {
        type: 'fix',
        "description": "GL/DOM parity — flex centering, DJ deck layout, button fixes"
      },
      {
        type: 'feature',
        "description": "Per-pad IO808/TR909 drum parameter editing"
      },
      {
        type: 'feature',
        "description": "Helm hardware UI build files — JUCE editor to WASM"
      },
      {
        type: 'feature',
        "description": "Surge XT hardware UI — full JUCE editor compiled to WASM"
      },
      {
        type: 'feature',
        "description": "Add Max Headroom mode setting"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Pixi DJ deck component refinements"
      },
      {
        type: 'feature',
        "description": "Kraftwerk head overlay improvements"
      },
      {
        type: 'fix',
        "description": "16 FT2 effect command bugs from exhaustive audit"
      },
      {
        type: 'feature',
        "description": "New Pixi DJ components, Helm hardware UI, TR-808 layout"
      },
      {
        type: 'fix',
        "description": "Chore: DJ view Pixi improvements, tracker replayer fixes, changelog update"
      },
      {
        type: 'feature',
        "description": "Batch playlist analysis via server-side UADE headless renderer"
      },
      {
        type: 'feature',
        "description": "Smart sort by BPM/key/energy + crossfader fixes"
      },
      {
        type: 'fix',
        "description": "Increase IPC ring buffer to 4MB for large module files"
      }
    ]
  },
  {
    version: '2026-04-01',
    date: '2026-04-01',
    changes: [
      {
        type: 'improvement',
        "description": "Vocoder: enable browser echo cancellation to reduce speaker→mic feedback"
      },
      {
        type: 'improvement',
        "description": "DJ vocoder: mic routing, noise gate, presets, Kraftwerk head animation"
      },
      {
        type: 'feature',
        "description": "Add Odin2 hardware UI WASM build (SDL/Emscripten)"
      },
      {
        type: 'fix',
        "description": "SpaceLaserControls: fix grid layout and separate buttons from knob grid"
      },
      {
        type: 'improvement',
        "description": "Enforce knobs→visualizers→selects hierarchy across all remaining synths"
      },
      {
        type: 'fix',
        "description": "Extend rimshot swing decay 10ms→50ms"
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
