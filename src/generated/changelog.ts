/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-09T15:51:48.760Z
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
export const BUILD_VERSION = '1.0.4676';
export const BUILD_NUMBER = '4676';
export const BUILD_HASH = '335a7f7ac';
export const BUILD_DATE = '2026-04-09';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4676',
    date: '2026-04-09',
    changes: [
      {
        type: 'fix',
        "description": "Remove visual mode badge from pattern editor, fix bg bleeding into headers"
      },
      {
        type: 'fix',
        "description": "Fix instrument list action icon colors when selected"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore AdPlug extracted source directories"
      },
      {
        type: 'feature',
        "description": "Compile AdPlug C++ library to WASM for 50+ OPL/AdLib format support"
      },
      {
        type: 'improvement',
        "description": "Unify all toolbar button fonts to 10px mono"
      },
      {
        type: 'fix',
        "description": "Unify button font sizes — all variants use 10px mono font"
      },
      {
        type: 'fix',
        "description": "View selector in nav header uses default CustomSelect styling"
      },
      {
        type: 'fix',
        "description": "Prevent text wrapping in dropdown buttons and menu items"
      },
      {
        type: 'feature',
        "description": "Format tracker auto-collapses finished categories with ✓ done badge"
      },
      {
        type: 'fix',
        "description": "FM Tracker (.fmt) always uses native parser — UADE can't play PC OPL formats"
      },
      {
        type: 'improvement',
        "description": "Migrate remaining selects to CustomSelect"
      },
      {
        type: 'improvement',
        "description": "Migrate instrument editor/shared selects to CustomSelect"
      },
      {
        type: 'improvement',
        "description": "Migrate instrument control selects to CustomSelect"
      },
      {
        type: 'improvement',
        "description": "Migrate dialog selects to CustomSelect"
      },
      {
        type: 'improvement',
        "description": "Migrate piano roll, grid, and DJ selects to CustomSelect"
      },
      {
        type: 'improvement',
        "description": "Migrate toolbar/nav/controls selects to CustomSelect"
      },
      {
        type: 'feature',
        "description": "Add CustomSelect component and extend DropdownButton with style prop"
      },
      {
        type: 'fix',
        "description": "Route 8 missing chip-dump formats to native parsers + fix VGZ gzip"
      },
      {
        type: 'fix',
        "description": "Dropdown menu uses text-xs font-mono to match toolbar buttons"
      },
      {
        type: 'fix',
        "description": "Dropdown menu items don't wrap text — use w-max + whitespace-nowrap"
      },
      {
        type: 'improvement',
        "description": "Hardware selector uses custom DropdownButton instead of native select"
      },
      {
        type: 'fix',
        "description": "More right space after dropdown arrow (40→48px total extra)"
      },
      {
        type: 'fix',
        "description": "Dropdown sizes to selected text only, not widest option"
      },
      {
        type: 'fix',
        "description": "Dropdown auto-size uses browser's natural width + 8px right breathing room"
      },
      {
        type: 'fix',
        "description": "Right padding after dropdown arrow on hardware selector"
      },
      {
        type: 'fix',
        "description": "Add right padding after dropdown arrow in hardware selector"
      },
      {
        type: 'fix',
        "description": "Hardware selector auto-sizes width to fit selected option text"
      },
      {
        type: 'fix',
        "description": "Recategorize 8 formats from chip-dump to pc-tracker"
      },
      {
        type: 'improvement',
        "description": "Chore: remove 34 fake *_test format files"
      },
      {
        type: 'fix',
        "description": "Hardware selector shows selected preset instead of reverting to SELECT HARDWARE"
      },
      {
        type: 'feature',
        "description": "Hardware selector shows current format — tracker name + platform"
      },
      {
        type: 'feature',
        "description": "Tabs show full song names and are editable via double-click"
      },
      {
        type: 'feature',
        "description": "Save master FX to playlists — auto-save and apply on Auto DJ start"
      },
      {
        type: 'fix',
        "description": "Clip toolbar horizontal overflow so buttons don't leak over pattern editor"
      },
      {
        type: 'fix',
        "description": "Visualizer gets explicit 68px height to break 100% chain"
      },
      {
        type: 'fix',
        "description": "Visualizer stretches to toolbar height instead of collapsing"
      },
      {
        type: 'improvement',
        "description": "Chore: update format tracker notes for fail/unknown entries"
      },
      {
        type: 'fix',
        "description": "Playback buttons wrap below inputs on narrow windows"
      },
      {
        type: 'improvement',
        "description": "Chore: update UADE.js glue from WASM rebuild"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar responsive — sections wrap instead of overflowing"
      },
      {
        type: 'fix',
        "description": "Remove verbose UADE file-lookup logging from WASM"
      },
      {
        type: 'fix',
        "description": "FT2 toolbar visualizer clipped to black line"
      },
      {
        type: 'feature',
        "description": "Pattern editor drag-to-select auto-scrolls at edges"
      },
      {
        type: 'feature',
        "description": "Auto-prompt Samples/ folder for ZoundMonitor .sng imports"
      },
      {
        type: 'fix',
        "description": "Add missing useClickOutside hook and structuredClone polyfill"
      },
      {
        type: 'fix',
        "description": "Preserve Samples/ subdirectory paths for companion files"
      },
      {
        type: 'fix',
        "description": "Chore: update format tracker — Zound Monitor fixed"
      },
      {
        type: 'fix',
        "description": "IO808 noise buffer uses context sample rate + reliable trigger"
      },
      {
        type: 'improvement',
        "description": "Chore: update generated changelog"
      },
      {
        type: 'fix',
        "description": "Drum machine instrument creation + mixer panel + arrangement view"
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
