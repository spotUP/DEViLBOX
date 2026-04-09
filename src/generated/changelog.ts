/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-09T18:12:09.201Z
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
export const BUILD_VERSION = '1.0.4703';
export const BUILD_NUMBER = '4703';
export const BUILD_HASH = 'b33e31e63';
export const BUILD_DATE = '2026-04-09';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.4703',
    date: '2026-04-09',
    changes: [
      {
        type: 'feature',
        "description": "Add master bus limiter + enable auto-gain by default"
      },
      {
        type: 'improvement',
        "description": "Bulletproof engine mute forwarding: cached refs + error logging"
      },
      {
        type: 'improvement',
        "description": "Unify mute/solo: single source of truth in useMixerStore"
      },
      {
        type: 'feature',
        "description": "Add IMF (id Music Format) exporter for OPL songs"
      },
      {
        type: 'fix',
        "description": "Update RAD exporter to support OPL3Synth instruments"
      },
      {
        type: 'feature',
        "description": "Add WASM pattern/instrument extraction for AdPlug CmodPlayer formats"
      },
      {
        type: 'improvement',
        "description": "Consolidate bottom bars: move paste mode/mask to PatternBottomBar"
      },
      {
        type: 'feature',
        "description": "Make AdLib/OPL formats editable with OPL3Synth"
      },
      {
        type: 'feature',
        "description": "Add GUI layout presets (1-4 slots)"
      },
      {
        type: 'feature',
        "description": "Add Renoise-style bottom control bar for pattern editor"
      },
      {
        type: 'feature',
        "description": "Add channel color blend slider in settings"
      },
      {
        type: 'feature',
        "description": "Add shift-click multi-select to pattern order sidebar"
      },
      {
        type: 'fix',
        "description": "Return streaming player metadata for AdPlug/V2M load_file"
      },
      {
        type: 'feature',
        "description": "Add Renoise-style track scopes strip"
      },
      {
        type: 'improvement',
        "description": "Chore: update format-state with verified AdPlug WASM results"
      },
      {
        type: 'fix',
        "description": "Route AdPlug and V2M audio through ToneEngine master mixer"
      },
      {
        type: 'feature',
        "description": "Make pattern order sidebar fully interactive"
      },
      {
        type: 'improvement',
        "description": "Chore: update format-state.json with AdPlug audit entries"
      },
      {
        type: 'fix',
        "description": "Replace TextEncoder with manual strToBytes in AdPlug AudioWorklet"
      },
      {
        type: 'fix',
        "description": "Use border-dark-border for sidebar dividers"
      },
      {
        type: 'fix',
        "description": "Use ft2 design tokens in pattern order sidebar"
      },
      {
        type: 'feature',
        "description": "Add Renoise-style pattern sequencer sidebar"
      },
      {
        type: 'fix',
        "description": "Correct AdPlug extension mapping from source registry"
      },
      {
        type: 'improvement',
        "description": "Unify all badge designs to match format badge style"
      },
      {
        type: 'fix',
        "description": "Embed insts.dat for KSM (Ken Silverman Music) support"
      },
      {
        type: 'feature',
        "description": "Chore: add standard.bnk and generated header for ROL support"
      },
      {
        type: 'fix',
        "description": "AdPlug WASM companion files, ROL/SCI support, remove FMT"
      },
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
