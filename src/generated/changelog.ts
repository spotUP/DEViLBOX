/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-24T23:01:06.611Z
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
export const BUILD_VERSION = '1.0.3518';
export const BUILD_NUMBER = '3518';
export const BUILD_HASH = '3682be662';
export const BUILD_DATE = '2026-03-24';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3518',
    date: '2026-03-24',
    changes: [
      {
        type: 'fix',
        "description": "Fix GT Ultra pattern editor not following playback"
      },
      {
        type: 'feature',
        "description": "Add CMI WASM build dir to gitignore"
      },
      {
        type: 'improvement',
        "description": "CMI synth: smooth envelope accumulator, UI layout improvements"
      },
      {
        type: 'fix',
        "description": "Fix PatternEditorCanvas cleanup for iOS fallback and safe canvas removal"
      },
      {
        type: 'fix',
        "description": "Fix GT Ultra silent playback: initialize editorInfo in gt_play()"
      },
      {
        type: 'fix',
        "description": "Fix format editors rendering zeros instead of dots for empty cells"
      },
      {
        type: 'improvement',
        "description": "Wire format context menu + shared SequenceMatrixEditor"
      },
      {
        type: 'feature',
        "description": "Unify format editor sizing and add collapsible matrix editors"
      },
      {
        type: 'improvement',
        "description": "Unify format/normal pattern editor headers with full channel controls"
      },
      {
        type: 'improvement',
        "description": "Update DEViLBOX theme tracker rows to navy background"
      },
      {
        type: 'fix',
        "description": "Fix format mode channel header alignment with pattern content"
      },
      {
        type: 'improvement',
        "description": "Use theme CSS variables in GTOrderMatrix and GTUltraView"
      },
      {
        type: 'improvement',
        "description": "Remove table sections from GTOrderMatrix — tables live in pattern editor now"
      },
      {
        type: 'improvement',
        "description": "Update default dark theme tracker rows to navy color scheme"
      },
      {
        type: 'improvement',
        "description": "Match pattern editor colors to GTOrderMatrix color scheme"
      },
      {
        type: 'improvement',
        "description": "Remove order channels from pattern editor — orders live only in GTOrderMatrix"
      },
      {
        type: 'feature',
        "description": "Add per-channel column support to pattern editor"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: integrate orders + tables as pattern editor channels"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: tighten instrument isEmpty filter — require ADSR or waveform"
      },
      {
        type: 'fix',
        "description": "Fix white borders in format header: border-dark-border/N opacity variants don't resolve"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: tighten order columns, shrink table widths"
      },
      {
        type: 'feature',
        "description": "GT Ultra: side-by-side Orders+Tables layout, add DOM/Pixi arch rules"
      },
      {
        type: 'fix',
        "description": "GT Ultra: fix 'Unsupported synth type' error spam and double instrument load"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: clean up barrel exports, remove unused Pixi component references"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: AHX layout for Pixi view, bidirectional instrument sync"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: AHX-style layout, shared format data hook, no code duplication"
      },
      {
        type: 'improvement',
        "description": "GT Ultra deep integration: types, synth engine, controls, instrument population, order matrix"
      },
      {
        type: 'improvement',
        "description": "GT Ultra: wire FT2Toolbar play/stop, remove duplicate transport buttons"
      },
      {
        type: 'fix',
        "description": "Add cache bust to WASM/JS fetches, rebuild with debug diagnostics"
      },
      {
        type: 'fix',
        "description": "Extend WebGL renderer note table to 189 entries for GT Ultra"
      },
      {
        type: 'improvement',
        "description": "GT Ultra DOM/Pixi views share single source of truth"
      },
      {
        type: 'fix',
        "description": "DOM format editors show note/instrument data in pattern grid"
      },
      {
        type: 'fix',
        "description": "GT Ultra playback silence — call playroutine() from render loop"
      },
      {
        type: 'fix',
        "description": "DOM GTUltraView reads per-channel patterns correctly"
      },
      {
        type: 'fix',
        "description": "GT Ultra DOM view uses same resolveOrderPattern as Pixi view"
      },
      {
        type: 'fix',
        "description": "GT Ultra pattern grid — resolve order list commands before pattern lookup"
      },
      {
        type: 'feature',
        "description": "Route regular SID files to classic pattern view (read-only)"
      },
      {
        type: 'fix',
        "description": "GT Ultra .sng file loading — songs no longer load empty"
      },
      {
        type: 'feature',
        "description": "5-star rating system for Modland and HVSC browsers"
      },
      {
        type: 'fix',
        "description": "Correct ModuleLoader import name"
      },
      {
        type: 'fix',
        "description": "Handle pending-import in App.tsx mobile file loader"
      },
      {
        type: 'improvement',
        "description": "Diag: trace App.tsx loadFile path on iOS"
      },
      {
        type: 'feature',
        "description": "Sync pattern edits to SunVox WASM sequencer"
      },
      {
        type: 'fix',
        "description": "Bump ALL dialog z-index to z-[99990]"
      },
      {
        type: 'improvement',
        "description": "Diag: alert loadFile result on iOS"
      },
      {
        type: 'fix',
        "description": "Chore: clean up debug trace in UADEParser NATIVE_ROUTES lookup"
      },
      {
        type: 'fix',
        "description": "Disable all WebGL worker views on iOS"
      },
      {
        type: 'fix',
        "description": "Skip WebGL worker on iOS, add HTML pattern fallback"
      },
      {
        type: 'fix',
        "description": "Correct pattern/macro pointer table offsets + data base offset"
      },
      {
        type: 'fix',
        "description": "Remove unused setCurrentRow from usePatternPlayback"
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
