/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-24T21:06:15.560Z
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
export const BUILD_VERSION = '1.0.3501';
export const BUILD_NUMBER = '3501';
export const BUILD_HASH = '93bd4f65c';
export const BUILD_DATE = '2026-03-24';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3501',
    date: '2026-03-24',
    changes: [
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
      },
      {
        type: 'improvement',
        "description": "Gate per-note/per-tick console.log in Furnace dispatch and playback"
      },
      {
        type: 'improvement',
        "description": "Stabilize playback effect deps and gate transition logging"
      },
      {
        type: 'improvement',
        "description": "Eliminate dual keyboard handler execution and reduce render overhead"
      },
      {
        type: 'fix',
        "description": "Correct filterFM → filterFmDepth property name in MIDI actions"
      },
      {
        type: 'improvement',
        "description": "Replace JSON.parse(JSON.stringify()) with structuredClone"
      },
      {
        type: 'fix',
        "description": "Remove stale config dep from handlePortClick useCallback"
      },
      {
        type: 'fix',
        "description": "DetectFormat matches extension-form Amiga files (songname.prefix)"
      },
      {
        type: 'improvement',
        "description": "Diag: alert import result on iOS"
      },
      {
        type: 'fix',
        "description": "Tight transport restart — eliminate dual-handler conflicts and async delays"
      },
      {
        type: 'improvement',
        "description": "Diag: alert screen dimensions on iOS"
      },
      {
        type: 'improvement',
        "description": "Extract recording start/stop to DJActions"
      },
      {
        type: 'fix',
        "description": "Instrument tab shows only list, no synth editor"
      },
      {
        type: 'improvement',
        "description": "Wire all visualization components to shared data hook"
      },
      {
        type: 'feature',
        "description": "Add shared visualization data hook — polls once per frame"
      },
      {
        type: 'improvement',
        "description": "Wire all remaining DJ views to DJActions"
      },
      {
        type: 'feature',
        "description": "Add nudge, loop, slip, seek, pitch, scratch pattern actions to DJActions"
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
