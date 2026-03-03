/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-03T23:18:19.902Z
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
export const BUILD_VERSION = '1.0.2135';
export const BUILD_NUMBER = '2135';
export const BUILD_HASH = 'f8a26c2c';
export const BUILD_DATE = '2026-03-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2135',
    date: '2026-03-04',
    changes: [
      {
        type: 'fix',
        "description": "Null-guard instrument.dispose() and remove unused import"
      },
      {
        type: 'feature',
        "description": "Complete starter instrument coverage for all system presets"
      },
      {
        type: 'fix',
        "description": "Resolve 10 TypeScript compilation errors"
      },
      {
        type: 'fix',
        "description": "Switch to tracker view after loading GoatTracker .sng"
      },
      {
        type: 'feature',
        "description": "Add starter instruments for all Furnace chip presets"
      },
      {
        type: 'fix',
        "description": "Replace hardcoded red colors with theme colors in dialogs"
      },
      {
        type: 'fix',
        "description": "Preset instruments not loading in New Song wizard"
      },
      {
        type: 'fix',
        "description": "Remove icon from New button in toolbar"
      },
      {
        type: 'feature',
        "description": "Improve New Song wizard — taller modal, search filter, A-Z sorting"
      }
    ]
  },
  {
    version: '2026-03-03',
    date: '2026-03-03',
    changes: [
      {
        type: 'fix',
        "description": "Sync DOM/GL tracker state via useUIStore"
      },
      {
        type: 'fix',
        "description": "GT Ultra view stuck initializing when loading .sng files"
      },
      {
        type: 'fix',
        "description": "NewSongWizard hooks order — move useCallback before early return"
      },
      {
        type: 'feature',
        "description": "Remove compact toolbar option from both UIs"
      },
      {
        type: 'fix',
        "description": "PixiJS render crashes on Exposé toggle"
      },
      {
        type: 'feature',
        "description": "Big SID info modal with full DeepSID metadata"
      },
      {
        type: 'fix',
        "description": "SID files use C64SID synthType instead of Furnace"
      },
      {
        type: 'fix',
        "description": "Scale up GL instrument list — larger fonts and row height"
      },
      {
        type: 'fix',
        "description": "TypeScript errors — add 'studio' to ViewType, fix implicit any"
      },
      {
        type: 'feature',
        "description": "Add Inst FX button to GL toolbar"
      },
      {
        type: 'fix',
        "description": "HVSC search input keyboard protection + vertical action bar buttons"
      },
      {
        type: 'fix',
        "description": "GL pattern editor visual issues"
      },
      {
        type: 'fix',
        "description": "Improve GL instrument list to match DOM quality"
      },
      {
        type: 'fix',
        "description": "HVSC download paths and directory browsing"
      },
      {
        type: 'feature',
        "description": "Integrate fontaudio icon font for GL view icons"
      },
      {
        type: 'fix',
        "description": "Load Noto Sans Symbols 2 web font for GL icon rendering"
      },
      {
        type: 'fix',
        "description": "Allow typing in GL view input fields"
      },
      {
        type: 'fix',
        "description": "Use string ranges for bitmap font chars (matches PixiJS API)"
      },
      {
        type: 'fix',
        "description": "Add unicode symbols to GL bitmap font character set"
      },
      {
        type: 'fix',
        "description": "Status bar text overlap + LOAD opens full file browser in GL mode"
      },
      {
        type: 'fix',
        "description": "Eliminate trackpad momentum/easing in pattern editor scroll"
      },
      {
        type: 'fix',
        "description": "Remove duplicate MASTER heading, top-align VU meters in mixer"
      },
      {
        type: 'fix',
        "description": "Bottom-align master strip with channel strips in mixer view"
      },
      {
        type: 'feature',
        "description": "Remove bottom dock, integrate Device/Master FX into mixer view"
      },
      {
        type: 'feature',
        "description": "Move mixer from bottom dock to its own top-level view"
      },
      {
        type: 'feature',
        "description": "Add view thumbnails to Exposé overlay (macOS Mission Control style)"
      },
      {
        type: 'feature',
        "description": "MacOS Mission Control style Exposé for all views"
      },
      {
        type: 'fix',
        "description": "Restore arrow key hold-to-scroll in pattern editor"
      },
      {
        type: 'feature',
        "description": "Full-featured GL instrument list matching DOM version"
      },
      {
        type: 'feature',
        "description": "Add Exposé toolbar button in Studio view"
      },
      {
        type: 'fix',
        "description": "Use display:none for compact toolbar to prevent Yoga BindingError"
      },
      {
        type: 'fix',
        "description": "Use full names for nav view buttons and fix spacing"
      },
      {
        type: 'fix',
        "description": "Offset VU/automation/macro overlays below channel headers"
      },
      {
        type: 'fix',
        "description": "Render window tethers behind panels in studio view"
      },
      {
        type: 'feature',
        "description": "Add control bar to studio/workbench view"
      },
      {
        type: 'fix',
        "description": "Avoid Yoga BindingError when toggling compact toolbar"
      },
      {
        type: 'fix',
        "description": "Add migrate function for workbench persist v2→v3"
      },
      {
        type: 'fix',
        "description": "Studio view window layout — tile windows with proper spacing"
      },
      {
        type: 'fix',
        "description": "Move hooks before early return in SIDInfoModal to fix Rules of Hooks violation"
      },
      {
        type: 'feature',
        "description": "Add missing GL UI gadgets — volume, collab, auth, MIDI, import, zoom-fit, inst FX"
      },
      {
        type: 'improvement',
        "description": "Soften all 100% white borders with opacity"
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
