/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-23T07:35:08.139Z
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
export const BUILD_VERSION = '1.0.3296';
export const BUILD_NUMBER = '3296';
export const BUILD_HASH = '192d4a5bc';
export const BUILD_DATE = '2026-03-23';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3296',
    date: '2026-03-23',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: server database, DJ engine updates, changelog"
      },
      {
        type: 'feature',
        "description": "Per-channel VU meters via module scope RMS polling"
      },
      {
        type: 'fix',
        "description": "Eagerly init scratch buffer on play for SunVox audio"
      },
      {
        type: 'improvement',
        "description": "Chore: update format state and furnace audit tools"
      },
      {
        type: 'feature',
        "description": "Add DJ set recording and playback engine"
      },
      {
        type: 'fix',
        "description": "Suppress font cache warnings by checking Cache.has() before install"
      },
      {
        type: 'improvement',
        "description": "Only poll module scope when canvas is visible"
      },
      {
        type: 'fix',
        "description": "Tighter knob sensitivity, center detent snap, faster tonearm tracking"
      },
      {
        type: 'fix',
        "description": "Read computedLayout.width from element itself, not parent"
      },
      {
        type: 'fix',
        "description": "Smooth slider drag using native DOM coordinates"
      },
      {
        type: 'feature',
        "description": "Editable Klystrack positions + MusicLine hex nibble entry"
      },
      {
        type: 'fix',
        "description": "Remove panel stopPropagation blocking slider pointerDown"
      },
      {
        type: 'fix',
        "description": "Use hitArea on slider container (same pattern as checkbox)"
      },
      {
        type: 'feature',
        "description": "Insert/delete rows, Pixi block ops, Furnace order editing"
      },
      {
        type: 'improvement',
        "description": "Chore: CLAUDE.md update, FurnaceSequencer improvements, changelog, format state"
      },
      {
        type: 'fix',
        "description": "Default Div eventMode to \"auto\" for event pass-through"
      },
      {
        type: 'fix',
        "description": "Move onPointerDown to slider graphics element directly"
      },
      {
        type: 'fix',
        "description": "Filter null-note NOTE_ON from macro volume updates"
      },
      {
        type: 'fix',
        "description": "Set eventMode=\"static\" on slider graphics for hit testing"
      },
      {
        type: 'fix',
        "description": "Add hitArea to PixiSlider for reliable drag interaction"
      },
      {
        type: 'fix',
        "description": "Add hitArea to PixiCheckbox for reliable click detection"
      },
      {
        type: 'fix',
        "description": "Use onPointerTap for modal overlay close instead of onPointerUp"
      },
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
