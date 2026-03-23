/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-22T23:35:37.369Z
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
export const BUILD_VERSION = '1.0.3274';
export const BUILD_NUMBER = '3274';
export const BUILD_HASH = 'dd8993434';
export const BUILD_DATE = '2026-03-22';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3274',
    date: '2026-03-23',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: update format audit state"
      },
      {
        type: 'fix',
        "description": "Prevent modal close when clicking checkboxes/buttons inside panel"
      },
      {
        type: 'fix',
        "description": "Route nativeOnly formats through native parser in MCP load"
      },
      {
        type: 'fix',
        "description": "Cable positioning, matrix params, rack SunVox controls"
      },
      {
        type: 'improvement',
        "description": "Frameloop=demand — only render when decks playing or camera moves"
      },
      {
        type: 'fix',
        "description": "Faders slide on Y axis (vertical), crossfader on X — measured from mesh bounds"
      }
    ]
  },
  {
    version: '2026-03-22',
    date: '2026-03-22',
    changes: [
      {
        type: 'improvement',
        "description": "Chore(modular): update ModularMatrixView and ModularRackView"
      },
      {
        type: 'fix',
        "description": "Expand macro filter, add setSkipRegisterWrites to dispatch"
      },
      {
        type: 'feature',
        "description": "Dynamic keyboard shortcuts from active scheme"
      },
      {
        type: 'fix',
        "description": "Flip fader Z direction + set default from mesh measurement"
      },
      {
        type: 'improvement',
        "description": "Add comprehensive keyboard shortcuts reference"
      },
      {
        type: 'fix',
        "description": "Fader default 2.1→2.5 — match left fader position from screenshot"
      },
      {
        type: 'fix',
        "description": "Fader default 2.2→2.1 — back off slightly"
      },
      {
        type: 'fix',
        "description": "Fader default 2.0→2.2 (closer), travel 3.5→4.5 (more range)"
      },
      {
        type: 'fix',
        "description": "Fader defaultValue 1.8→2.0 — nudge forward ~1cm"
      },
      {
        type: 'fix',
        "description": "Show SunVox module controls in DOM rack view"
      },
      {
        type: 'fix',
        "description": "Fader defaultValue 1.1→1.8 — much closer to viewer"
      },
      {
        type: 'feature',
        "description": "Register all 327 missing scheme command handlers"
      },
      {
        type: 'fix',
        "description": "Fader defaultValue 0.75→1.1 — shift toward viewer to align with grooves"
      },
      {
        type: 'fix',
        "description": "Vestax fader travel 5.5→3.5, defaultValue 1→0.75 to fit grooves"
      },
      {
        type: 'fix',
        "description": "Turntable spacing 0.38→0.40 — clear mixer edges"
      },
      {
        type: 'fix',
        "description": "Turntable spacing 0.42→0.38 — slightly closer"
      },
      {
        type: 'fix',
        "description": "Spread turntables outward (0.35→0.42) to clear mixer edges"
      },
      {
        type: 'fix',
        "description": "Mixer Y 0.18→0.15 — split the difference"
      },
      {
        type: 'fix',
        "description": "Mixer Y 0.12→0.18 — still below turntable surface"
      },
      {
        type: 'fix',
        "description": "Raise mixer Y=0.12 to align with turntable surface"
      },
      {
        type: 'feature',
        "description": "Module oscilloscope scope canvas in modular rack view"
      },
      {
        type: 'feature',
        "description": "Chore: add Vestax mixer source assets (OBJ + textures + MTL)"
      },
      {
        type: 'fix',
        "description": "Reduce 3D GPU load — lower DPR, low-power preference"
      },
      {
        type: 'fix',
        "description": "Raise mixer to same level as turntables"
      },
      {
        type: 'fix',
        "description": "Mixer scale 0.02→0.01 to match turntables, tighter side-by-side layout"
      },
      {
        type: 'feature',
        "description": "Unified 3D scene — all decks + mixer in one camera view"
      },
      {
        type: 'fix',
        "description": "Move 3D overlay to DOM tree — fixes Pixi reconciler crash"
      },
      {
        type: 'fix',
        "description": "Filter macro-generated commands from lock-step comparison"
      },
      {
        type: 'fix',
        "description": "Vestax mixer — rebuilt GLB from OBJ+textures with proper materials"
      },
      {
        type: 'fix',
        "description": "Vestax mixer — remove material overrides, use original model materials"
      },
      {
        type: 'fix',
        "description": "Vestax mixer — preserve textures, only override untextured parts"
      },
      {
        type: 'fix',
        "description": "Eliminate UI freeze on pattern wrap during playback"
      },
      {
        type: 'fix',
        "description": "Vestax mixer 3D materials — dark metallic finish matching turntables"
      },
      {
        type: 'fix',
        "description": "Vestax mixer textures/width, AHX scroll, zero TS errors"
      },
      {
        type: 'feature',
        "description": "Furnace center pattern, right-click macro, MPT clipboard paste"
      },
      {
        type: 'feature',
        "description": "Stacked layout — order matrix on top, pattern editor below"
      },
      {
        type: 'fix',
        "description": "Show only cross-format export button, move popout to bottom-right"
      },
      {
        type: 'feature',
        "description": "Wire 3D turntable and mixer views into both DOM and GL modes"
      },
      {
        type: 'improvement',
        "description": "Deduplicate sample/wavetable uploads across instruments"
      },
      {
        type: 'improvement',
        "description": "Chore: Furnace pattern editor collapse, help modal, DJ view, format state updates"
      },
      {
        type: 'fix',
        "description": "Add VBoy/WonderSwan/PV1000/Bifurcator effect handlers, filter macro cmds"
      },
      {
        type: 'feature',
        "description": "Copy/paste/selection in format mode + Hively export reflects edits"
      },
      {
        type: 'feature',
        "description": "FT2 keyboard parity + GT Ultra Pixi editor input"
      },
      {
        type: 'feature',
        "description": "Undo/redo and transpose in format mode pattern editors"
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
