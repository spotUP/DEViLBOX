/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-02T05:20:37.810Z
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
export const BUILD_VERSION = '1.0.3828';
export const BUILD_NUMBER = '3828';
export const BUILD_HASH = '9ae89e5eb';
export const BUILD_DATE = '2026-04-02';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3828',
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
      },
      {
        type: 'fix',
        "description": "Set all factory kit notes to C4 for correct pitch"
      },
      {
        type: 'fix',
        "description": "Use pitch noteMode so drum type is always respected"
      },
      {
        type: 'fix',
        "description": "Misc accumulated fixes: vocoder worklet, DJ autoDJ, drumpad, ProjectM"
      },
      {
        type: 'improvement',
        "description": "Enforce knobs→visualizers→checkboxes hierarchy across synth UIs"
      },
      {
        type: 'fix',
        "description": "Constrain performance mode pad size in DOM view"
      },
      {
        type: 'fix',
        "description": "Cap pad size at 90px + show full names in Pads view"
      },
      {
        type: 'fix',
        "description": "Shrink sampler pads 60→44px so all 16 fit on screen"
      },
      {
        type: 'fix',
        "description": "Use full names in 808/909 factory kits (Kick/Snare/Closed Hat etc)"
      },
      {
        type: 'fix',
        "description": "Show full pad name — remove 8-char truncation"
      },
      {
        type: 'improvement',
        "description": "Standardize knob size to md + align 4-col grids in DOM & Pixi"
      },
      {
        type: 'improvement',
        "description": "Switch synth panels to 4-column grid layout"
      },
      {
        type: 'improvement',
        "description": "Switch synth panels from 2-column to 3-column grid layout"
      },
      {
        type: 'improvement',
        "description": "Compact 2-column synth panel layouts + DOMSynthPanel renderer"
      },
      {
        type: 'feature',
        "description": "Show synth type badge on pad cells in GL sampler (808/SAM/303 etc)"
      },
      {
        type: 'fix',
        "description": "Remove spurious heldPadsRef.add + guard synth release in GL sampler"
      },
      {
        type: 'fix',
        "description": "Add V2Speech to speech synth text handling in PadEditor"
      },
      {
        type: 'fix',
        "description": "Trigger synth pads in GL sampler — 808/909/SAM/DECtalk now play in GL mode"
      },
      {
        type: 'improvement',
        "description": "Config persistence + hardware UIs for demoscene synths"
      },
      {
        type: 'fix',
        "description": "V2 preset fix + Tunefish/WaveSabre/V2 Pixi panels & presets"
      },
      {
        type: 'feature',
        "description": "Add OpenWurli/OPL3/DX7 to synth browser, Oidos panel + presets"
      },
      {
        type: 'feature',
        "description": "DX7 patch bank browser with 1120 voices"
      },
      {
        type: 'feature',
        "description": "Complete parameter wiring for OPL3/DX7 synths"
      },
      {
        type: 'feature',
        "description": "Auto-load DX7 firmware ROM and voice banks"
      },
      {
        type: 'feature',
        "description": "Add Pixi panel layouts for OpenWurli, OPL3, DX7 synths"
      },
      {
        type: 'feature',
        "description": "Add DX7 WASM synth (VDX7 cycle-accurate emulation)"
      },
      {
        type: 'fix',
        "description": "Route UADE formats through render worker in DJ view"
      },
      {
        type: 'feature',
        "description": "Add OPL3 (YMF262) WASM synth — 18-channel FM, SBI patches"
      },
      {
        type: 'feature',
        "description": "Add OPL3 WASM build artifacts"
      },
      {
        type: 'fix',
        "description": "Move OPL3 forward declaration before use"
      },
      {
        type: 'feature',
        "description": "Add OPL3 JUCE-WASM bridge scaffold"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore third-party/retromulator clone"
      },
      {
        type: 'fix',
        "description": "Disable Import button while UADE engine is still loading"
      },
      {
        type: 'fix',
        "description": "Preload UADE WASM engine during import so song is ready on Play"
      },
      {
        type: 'fix',
        "description": "Import dialog blocks until song is fully ready to play"
      },
      {
        type: 'improvement',
        "description": "Double-click songs in DJ browsers to load to next free deck"
      },
      {
        type: 'fix',
        "description": "Remove aggressive API rate limiting (100 req/15min was too low for dev)"
      },
      {
        type: 'fix',
        "description": "Fix playlist sort dropdown clipped by Crate overflow"
      },
      {
        type: 'fix',
        "description": "Strip directory from UADE filename in parseUADEFile + add trigger note for compiled 68k"
      }
    ]
  },
  {
    version: '2026-03-31',
    date: '2026-03-31',
    changes: [
      {
        type: 'fix',
        "description": "Remove require() call in useNoteInput — useInstrumentStore already imported"
      },
      {
        type: 'fix',
        "description": "Force classic UADE mode for CustomMade formats (cust.*, custom.*, cm.*, rk.*)"
      },
      {
        type: 'improvement',
        "description": "Remove FX Editor button from DJ view (both DOM and GL)"
      },
      {
        type: 'improvement',
        "description": "Overlay Auto DJ panel instead of pushing content down"
      },
      {
        type: 'fix',
        "description": "Fix playlist dividers and crate click-outside-to-close"
      },
      {
        type: 'improvement',
        "description": "Soften playlist track text and dividers"
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
