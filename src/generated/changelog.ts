/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-08T11:57:57.126Z
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
export const BUILD_VERSION = '1.0.2580';
export const BUILD_NUMBER = '2580';
export const BUILD_HASH = 'c0adabbce';
export const BUILD_DATE = '2026-03-08';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2580',
    date: '2026-03-08',
    changes: [
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
      },
      {
        type: 'improvement',
        "description": "Chore: move regression tests to CI-only and update build config"
      },
      {
        type: 'feature',
        "description": "UI improvements — theme editor, custom banner, settings modal"
      },
      {
        type: 'feature',
        "description": "Update engines with improved playback and format handling"
      },
      {
        type: 'feature',
        "description": "Expand import format support and update parsers"
      },
      {
        type: 'improvement',
        "description": "Chore: update WASM C/C++ sources for harness and paula_soft improvements"
      },
      {
        type: 'improvement',
        "description": "Chore: rebuild WASM modules and update worklets"
      },
      {
        type: 'improvement',
        "description": "Chore: update build paths for third-party directory restructure"
      },
      {
        type: 'improvement',
        "description": "Chore: remove unneeded third-party reference sources from git"
      },
      {
        type: 'feature',
        "description": "Implement complete Furnace chip flags pipeline with version compat"
      },
      {
        type: 'feature',
        "description": "Chore: add gearmulator build-native to gitignore"
      },
      {
        type: 'fix',
        "description": "Sync arrangement playhead on view switch and update changelog"
      },
      {
        type: 'feature',
        "description": "Add searchable filter to PixiSelect dropdown"
      },
      {
        type: 'feature',
        "description": "Import dialog format capabilities, warnings, and metadata"
      },
      {
        type: 'feature',
        "description": "Add 7 new WASM format engines"
      },
      {
        type: 'feature',
        "description": "Extend furnace sequencer with FDS, QSound, N163, ESFM commands"
      },
      {
        type: 'feature',
        "description": "Refactor gearmulator to Worker+SAB audio architecture"
      },
      {
        type: 'feature',
        "description": "Add per-channel mixer gain to WASM Amiga engines"
      },
      {
        type: 'fix',
        "description": "Chore: remove temporary diagnostic/debug files and update .gitignore"
      },
      {
        type: 'feature',
        "description": "Chore: update pxtone harness and add CMakeLists.txt"
      },
      {
        type: 'fix',
        "description": "TrackerView merge resolution"
      },
      {
        type: 'improvement',
        "description": "Chore: update gm-o2-test script"
      },
      {
        type: 'feature',
        "description": "Add Organya, Sonix, and MusicLine editor modes to TrackerView"
      },
      {
        type: 'feature',
        "description": "Add pxtone WASM engine source (Pixel music format)"
      },
      {
        type: 'fix',
        "description": "Update gearmulator CMake and TrackerView routing"
      },
      {
        type: 'feature',
        "description": "Add eupmini WASM build config and compiled output"
      },
      {
        type: 'fix',
        "description": "Update useUIStore for split view mode"
      },
      {
        type: 'feature',
        "description": "Add eupmini WASM engine (FM Towns EUP music format)"
      },
      {
        type: 'improvement',
        "description": "Chore: update gearmulator O2 test script"
      },
      {
        type: 'feature',
        "description": "Add PitchResampler worklet for sample-based engines"
      },
      {
        type: 'feature',
        "description": "Add Organya WASM engine (Cave Story music format)"
      },
      {
        type: 'feature',
        "description": "Add Sonix Music Driver format parser"
      },
      {
        type: 'feature',
        "description": "Engine and store updates for Sonix format and routing"
      },
      {
        type: 'feature',
        "description": "Update FurnaceEditor, MixerPanel, and StudioCanvasView"
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
