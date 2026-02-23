/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-23T22:20:46.583Z
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
export const BUILD_VERSION = '1.0.1140';
export const BUILD_NUMBER = '1140';
export const BUILD_HASH = 'ad747392';
export const BUILD_DATE = '2026-02-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1140',
    date: '2026-02-23',
    changes: [
      {
        type: 'feature',
        "description": "Implement headphone cueing (PFL) system"
      },
      {
        type: 'feature',
        "description": "Wire scenario behaviors and complete MIDI noteOff handling"
      },
      {
        type: 'feature',
        "description": "Implement DJ scenario presets and generic controller support"
      },
      {
        type: 'fix',
        "description": "Actually fix TypeScript errors in loadInstrumentFile"
      },
      {
        type: 'fix',
        "description": "Fix remaining TypeScript errors in UnifiedFileLoader"
      },
      {
        type: 'improvement',
        "description": "Update changelog for unified file loader"
      },
      {
        type: 'fix',
        "description": "Fix TypeScript errors in unified file loader"
      },
      {
        type: 'improvement',
        "description": "Unify file loading: Single code path for all 137 formats"
      },
      {
        type: 'fix',
        "description": "Fix tracker module file dialog path to match drag-drop"
      },
      {
        type: 'fix',
        "description": "Fix HVL silence, DrumMachine crash, MIDI drag-drop, song-ended spam, DJ pipeline"
      },
      {
        type: 'improvement',
        "description": "Chore: Update dependencies for DJ system"
      },
      {
        type: 'feature',
        "description": "Integrate DJ audio routing with tracker and export"
      },
      {
        type: 'feature',
        "description": "Add comprehensive keyboard shortcuts and inline sampler"
      },
      {
        type: 'feature',
        "description": "Add mixer controls with EQ, filter, VU meters, and transitions"
      },
      {
        type: 'feature',
        "description": "Add frequency-colored waveforms and 3D vinyl visualization"
      },
      {
        type: 'feature',
        "description": "Add deck controls with hot cues, loops, and FX pads"
      },
      {
        type: 'feature',
        "description": "Update core DJ view layout and file browser"
      },
      {
        type: 'feature',
        "description": "Add beat sync, quantized FX, and beat jump utilities"
      },
      {
        type: 'feature',
        "description": "Enhance DJ store and audio engine with advanced features"
      },
      {
        type: 'feature',
        "description": "Add DJ pipeline orchestrator with render and analysis workers"
      },
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
