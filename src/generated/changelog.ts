/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-04T05:57:48.492Z
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
export const BUILD_VERSION = '1.0.2152';
export const BUILD_NUMBER = '2152';
export const BUILD_HASH = '87f6f791';
export const BUILD_DATE = '2026-03-04';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2152',
    date: '2026-03-04',
    changes: [
      {
        type: 'feature',
        "description": "Wire 7 GL-native dialogs into PixiRoot, remove DOM versions"
      },
      {
        type: 'fix',
        "description": "Furnace FM frequency formulas and MAME noteOff"
      },
      {
        type: 'improvement',
        "description": "Phase 4 — migrate shell/toolbar/view backgrounds to layoutContainer"
      },
      {
        type: 'fix',
        "description": "Cursor navigation — arrow right no longer jumps back to note column"
      },
      {
        type: 'improvement',
        "description": "Migrate remaining GL components to layoutContainer"
      },
      {
        type: 'fix',
        "description": "GTUltra .sng files now reach the GT Ultra UI"
      },
      {
        type: 'fix',
        "description": "Resolve CI TypeScript errors"
      },
      {
        type: 'feature',
        "description": "GL-native New Song Wizard using Div/Txt/GlModal layout bridge"
      },
      {
        type: 'fix',
        "description": "Normalize HVSC paths for SID download from mirrors"
      },
      {
        type: 'fix',
        "description": "PixiJS alphaMode null crash from stale thumbnail textures"
      },
      {
        type: 'fix',
        "description": "BindingError in SIDSubsongAndInfo component"
      },
      {
        type: 'feature',
        "description": "Clickable discography tunes + hide empty photo container"
      },
      {
        type: 'fix',
        "description": "New button not working in GL UI"
      },
      {
        type: 'fix',
        "description": "Duplicate Modland toast, AudioContext mismatch crash, SID engine in import"
      },
      {
        type: 'feature',
        "description": "Add SID engine selector dropdown to SID info modal"
      },
      {
        type: 'feature',
        "description": "Add init presets for all synth types"
      },
      {
        type: 'fix',
        "description": "Defer PixiSelect open to avoid BindingError during event dispatch"
      },
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
