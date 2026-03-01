/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-01T22:08:27.734Z
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
export const BUILD_VERSION = '1.0.1894';
export const BUILD_NUMBER = '1894';
export const BUILD_HASH = 'e0eb7e01';
export const BUILD_DATE = '2026-03-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1894',
    date: '2026-03-01',
    changes: [
      {
        type: 'feature',
        "description": "Implement 68k instruction → C mapper"
      },
      {
        type: 'feature',
        "description": "Double-click clip opens piano roll; title-bar double-click toggles maximize"
      },
      {
        type: 'fix',
        "description": "Fix HEAPU8/HEAPF32 exposure and pool-full deadlock in all Emscripten worklet engines"
      },
      {
        type: 'fix',
        "description": "Correct Paula register table to match real hardware addresses"
      },
      {
        type: 'fix',
        "description": "Add app icon and configure electron-builder icon path"
      },
      {
        type: 'feature',
        "description": "Implement symbol resolver with Paula register tagging"
      },
      {
        type: 'fix',
        "description": "Fix pc_rel operand, parseOperand signature, Size cast safety"
      },
      {
        type: 'fix',
        "description": "Correct repo name and webhook URL path"
      },
      {
        type: 'feature',
        "description": "Implement AST parser"
      },
      {
        type: 'feature',
        "description": "Add AST node types"
      },
      {
        type: 'feature',
        "description": "Implement lexer with 68k token support"
      },
      {
        type: 'feature',
        "description": "Scaffold TypeScript project"
      },
      {
        type: 'fix',
        "description": "Remove unused useTabsStore imports"
      },
      {
        type: 'fix',
        "description": "Remove unused _addTab declarations"
      },
      {
        type: 'fix',
        "description": "Suppress unused addTab variable errors with underscore prefix"
      },
      {
        type: 'fix',
        "description": "Release only needs build-server, electron builds are best-effort"
      },
      {
        type: 'fix',
        "description": "Mkdir release-assets before tar in case electron artifacts absent"
      },
      {
        type: 'feature',
        "description": "Add UADE system presets and new song wizard"
      },
      {
        type: 'fix',
        "description": "Add maximized field to BUILTIN_WORKSPACES, remove unused fitWindow import"
      },
      {
        type: 'fix',
        "description": "Run release if build-server passes even when electron fails"
      },
      {
        type: 'feature',
        "description": "Green button maximizes window to fill viewport"
      },
      {
        type: 'fix',
        "description": "Continue-on-error for electron builds so release always runs"
      },
      {
        type: 'fix',
        "description": "Ensure nav bar and status bar always render above workbench content"
      },
      {
        type: 'fix',
        "description": "Add content mask as child so it tracks window position"
      },
      {
        type: 'fix',
        "description": "Use pianoData.notes for correct velocity; add arrangement scrollbars"
      },
      {
        type: 'fix',
        "description": "Increase Node heap to 4GB for electron builds to prevent OOM"
      },
      {
        type: 'feature',
        "description": "Dynamic total rows + channel switcher"
      },
      {
        type: 'feature',
        "description": "Wire velocity lane editing with proper drag/undo"
      },
      {
        type: 'fix',
        "description": "Remove unused isChipDump variable in ImportModuleDialog"
      },
      {
        type: 'fix',
        "description": "Remove unused isUADE variable"
      },
      {
        type: 'feature',
        "description": "Show read-only dialog when editing UADE playback-only patterns"
      },
      {
        type: 'feature',
        "description": "Playback cursor in piano roll + arrangement follow-playback scroll"
      },
      {
        type: 'improvement',
        "description": "Chore: untrack Reference Music/Docs/Images and docs from git"
      },
      {
        type: 'fix',
        "description": "Rename apostrophe dir to fix Windows git checkout"
      },
      {
        type: 'fix',
        "description": "Remove dead showUADEModeSelector referencing undefined isNativeSelected"
      },
      {
        type: 'fix',
        "description": "Pre-bundle @dnd-kit packages to prevent 504 Outdated Optimize Dep"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog to build 1854"
      },
      {
        type: 'feature',
        "description": "Add horizontal and vertical scrollbars to GL piano roll"
      },
      {
        type: 'fix',
        "description": "Get metadata from useProjectStore not useTrackerStore"
      },
      {
        type: 'fix',
        "description": "Fix tab bar transparency, height, and FT2 toolbar row colors"
      },
      {
        type: 'fix',
        "description": "Simplify dialog — remove engine/mode toggles, always load editable"
      },
      {
        type: 'improvement',
        "description": "Chore: trigger pipeline test"
      },
      {
        type: 'improvement',
        "description": "Unify toolbar state via UI store, match GL UI to DOM UI"
      },
      {
        type: 'fix',
        "description": "Guard keyboard shortcuts against firing in input fields"
      },
      {
        type: 'feature',
        "description": "Switch to pull-based deployment via GitHub Release + webhook"
      },
      {
        type: 'feature',
        "description": "Add vertical scroll for tracks"
      },
      {
        type: 'fix',
        "description": "Remove File/Module/Help menu bar row from Pixi tracker toolbar"
      },
      {
        type: 'feature',
        "description": "Add horizontal and vertical zoom controls to toolbar"
      },
      {
        type: 'fix',
        "description": "Cast Uint8Array.buffer to ArrayBuffer for parseHippelCoSoFile"
      },
      {
        type: 'fix',
        "description": "Fix BindingError on menu open + wire up Load/Save/Clear buttons"
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
