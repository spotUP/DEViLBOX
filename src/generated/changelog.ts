/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-23T19:23:01.526Z
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
export const BUILD_VERSION = '1.0.1120';
export const BUILD_NUMBER = '1120';
export const BUILD_HASH = 'd9c7d817';
export const BUILD_DATE = '2026-02-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1120',
    date: '2026-02-23',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: gitignore turntable source models and backup files"
      },
      {
        type: 'fix',
        "description": "Chore: tracker UI tweaks, import fixes, engine updates, and changelog"
      },
      {
        type: 'improvement',
        "description": "Update Pixi DJ/tracker views, navigation, theming, and performance"
      },
      {
        type: 'feature',
        "description": "DJ engine improvements, audio cache, UADE prerender, and UI component updates"
      },
      {
        type: 'feature',
        "description": "Always overlay pattern display on visualizers with nav buttons instead of click-to-cycle"
      },
      {
        type: 'feature',
        "description": "Add master FX chain support to DJMixerEngine with preset watcher in DJView"
      },
      {
        type: 'fix',
        "description": "Route UADE/Hively through stereo separation chain for proper master FX processing"
      },
      {
        type: 'fix',
        "description": "Gate DeckScopes animation on isPlaying to pause when stopped"
      },
      {
        type: 'feature',
        "description": "Add 2D/3D vinyl turntable views with Three.js GLB model and deck view mode switching"
      },
      {
        type: 'feature',
        "description": "Add turntable physics engine, scratch buffer worklet, and keyboard/MIDI controls"
      }
    ]
  },
  {
    version: '2026-02-22',
    date: '2026-02-22',
    changes: [
      {
        type: 'fix',
        "description": "Resolve 5 bugs from Swedish beta testing"
      },
      {
        type: 'improvement',
        "description": "Chore: update gitignore for WASM build dirs, update CLAUDE.md"
      },
      {
        type: 'fix',
        "description": "Tracker view routing, editor controls, and drag-drop updates"
      },
      {
        type: 'feature',
        "description": "Add FT2 sample editor WASM module source"
      },
      {
        type: 'fix',
        "description": "Update PT2 sample editor WASM source and binary"
      },
      {
        type: 'feature',
        "description": "Add native Pixi pattern editors with full DOM parity"
      },
      {
        type: 'fix',
        "description": "Fix speed/BPM detection and all-zero PCM for VBlank formats"
      },
      {
        type: 'fix',
        "description": "Remove placeholder instruments for unextracted sample pointers"
      },
      {
        type: 'fix',
        "description": "Correct sample rate formula for PCM extraction"
      },
      {
        type: 'fix',
        "description": "Resolve 9 TypeScript errors in UADE parsers and format types"
      },
      {
        type: 'improvement',
        "description": "Build(uade): rebuild WASM with extended channel, CIA timer, and memory read exports"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'feature',
        "description": "Complete DOM/GL pixel-perfect parity + real FPS monitor"
      },
      {
        type: 'fix',
        "description": "Resolve canvas null narrowing in FT2/PT2 hardware UIs"
      },
      {
        type: 'feature',
        "description": "Enhance editor controls, dialogs, and settings"
      },
      {
        type: 'feature',
        "description": "Add modland API integration"
      },
      {
        type: 'feature',
        "description": "Update UADE engine, worklet, and Amiga format parsers"
      },
      {
        type: 'feature',
        "description": "Update PT2/FT2 WASM sample editors"
      },
      {
        type: 'improvement',
        "description": "Add WebGL UI enhancement progress tracking document"
      },
      {
        type: 'improvement',
        "description": "Chore: update stores, engine, and supporting files"
      },
      {
        type: 'feature',
        "description": "Convert GL shell components to DOM overlays for 1:1 parity"
      },
      {
        type: 'feature',
        "description": "Add Pixi views for Furnace, Hively, tracker overlays, and visualizations"
      },
      {
        type: 'feature',
        "description": "Add WASM hardware UI modules and instrument components"
      },
      {
        type: 'feature',
        "description": "Expand UADE WASM engine and Amiga format parsers"
      }
    ]
  },
  {
    version: '2026-02-21',
    date: '2026-02-21',
    changes: [
      {
        type: 'feature',
        "description": "Add UADE playback layer and Amiga format parsers/exporters"
      },
      {
        type: 'feature',
        "description": "Add Furnace order matrix Pixi view component"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar visibility and modal z-index layering"
      },
      {
        type: 'feature',
        "description": "Expand Pixi views with full DOM overlay implementations"
      },
      {
        type: 'feature',
        "description": "Add PatternAccessor, Furnace subsong support, and replayer improvements"
      },
      {
        type: 'feature',
        "description": "Enhance pad editor with note repeat and improved pad controls"
      },
      {
        type: 'feature',
        "description": "Integrate HivelyTracker into instrument factory and import pipeline"
      },
      {
        type: 'feature',
        "description": "Add HivelyTracker WASM engine, synth, and hardware controls"
      },
      {
        type: 'fix',
        "description": "Resolve all pre-existing TypeScript errors and code quality issues"
      },
      {
        type: 'fix',
        "description": "Complete instrument support — operator macros, wavetable/sample upload, old format parsing"
      },
      {
        type: 'feature',
        "description": "Add ModPlug stereo separation mode toggle and slider to Settings"
      },
      {
        type: 'feature',
        "description": "Insert StereoSeparationNode into audio chain; add ModPlug mode"
      },
      {
        type: 'feature',
        "description": "Add stereoSeparationMode and modplugSeparation fields"
      },
      {
        type: 'fix',
        "description": "Remove unnecessary casts, expand clamp tests, add gain-boost warning"
      },
      {
        type: 'feature',
        "description": "Add StereoSeparationNode (OpenMPT M-S algorithm)"
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
