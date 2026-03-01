/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-01T23:57:46.793Z
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
export const BUILD_VERSION = '1.0.1941';
export const BUILD_NUMBER = '1941';
export const BUILD_HASH = 'b18ad3c8';
export const BUILD_DATE = '2026-03-01';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1941',
    date: '2026-03-02',
    changes: [
      {
        type: 'fix',
        "description": "Correct instrument numbers and speed detection in pattern reconstructor"
      },
      {
        type: 'feature',
        "description": "Add interactive volume/pan faders to track headers"
      },
      {
        type: 'feature',
        "description": "Clip transpose and automation lane playback"
      },
      {
        type: 'feature',
        "description": "Mount MixerPanel in App + Ctrl+M shortcut"
      },
      {
        type: 'feature',
        "description": "Add DOM MixerPanel floating panel"
      },
      {
        type: 'feature',
        "description": "Implement PixiMixerView with live VU meters"
      },
      {
        type: 'fix',
        "description": "Add React import to PixiMixerChannelStrip"
      },
      {
        type: 'feature',
        "description": "Add PixiMixerChannelStrip GL component"
      },
      {
        type: 'feature',
        "description": "Register mixer window in workbench + nav"
      },
      {
        type: 'fix',
        "description": "Increase 68k stack space for complex eagleplayers"
      },
      {
        type: 'feature',
        "description": "Add setMixerChannelVolume + setMixerChannelPan to ToneEngine"
      },
      {
        type: 'feature',
        "description": "Track group folding and per-track automation lane rendering"
      },
      {
        type: 'fix',
        "description": "Call setMixerChannelVolume/Pan in store (cast any until Task 2)"
      },
      {
        type: 'feature',
        "description": "MIDI key preview on click and multi-channel note display"
      },
      {
        type: 'feature',
        "description": "Clip note preview, marker rename/drag, time signature markers"
      },
      {
        type: 'feature',
        "description": "Add useMixerStore with 16-channel + master state"
      },
      {
        type: 'feature',
        "description": "Clip color picker — 16-color palette in context menu with per-clip override"
      },
      {
        type: 'fix',
        "description": "Fix 4 TypeScript errors from parallel agent changes"
      }
    ]
  },
  {
    version: '2026-03-01',
    date: '2026-03-01',
    changes: [
      {
        type: 'feature',
        "description": "Chip preset browser — browse and insert Furnace chip synths by family"
      },
      {
        type: 'feature',
        "description": "Cmd+Q quantize selection and velocity lane interpolated drag"
      },
      {
        type: 'feature',
        "description": "Loop region playback — clip trimming, loop bounds, visual wrap-around"
      },
      {
        type: 'feature',
        "description": "Magnetic clip-edge snapping, overlap detection, BPM-aware snap labels"
      },
      {
        type: 'fix',
        "description": "Fix volume-0 drop and instrument index ordering in pattern reconstructor"
      },
      {
        type: 'feature',
        "description": "Add Pass 2 restructurer and --pass2 CLI flag"
      },
      {
        type: 'feature',
        "description": "SynthDef hot-reload via Reload button and Cmd+Enter"
      },
      {
        type: 'feature',
        "description": "Arrangement export button and length auto-calculation"
      },
      {
        type: 'feature',
        "description": "Implement CIA tick-based pattern reconstructor and wire into UADEParser"
      },
      {
        type: 'fix',
        "description": "Fix wrapper tick rate, remove extern linkage, wire --timing option"
      },
      {
        type: 'feature',
        "description": "Note copy/paste (Cmd+C/X/V) and chord mode"
      },
      {
        type: 'feature',
        "description": "Wire Cmd+Z / Cmd+Shift+Z undo/redo in arrangement keyboard shortcuts"
      },
      {
        type: 'feature',
        "description": "Clip fade visualization, track height resize, timeline markers"
      },
      {
        type: 'fix',
        "description": "Fix React.FC import and panel background height in PixiUADEDebuggerPanel"
      },
      {
        type: 'feature',
        "description": "Add Phase B live Paula debugger panels (DOM + GL)"
      },
      {
        type: 'feature',
        "description": "Add CLI with full pipeline integration"
      },
      {
        type: 'feature',
        "description": "Right-click context menu, track rename, and track color cycling"
      },
      {
        type: 'feature',
        "description": "Add Emscripten wrapper and CMake generator"
      },
      {
        type: 'feature',
        "description": "Expose CIA tick snapshots via worklet and UADEEngine API"
      },
      {
        type: 'feature',
        "description": "Add soft Paula chip emulator (C runtime)"
      },
      {
        type: 'feature',
        "description": "Rebuild UADE.wasm with CIA tick snapshot exports"
      },
      {
        type: 'improvement',
        "description": "Wip(arrangement): save uncommitted arrangement view changes"
      },
      {
        type: 'feature',
        "description": "Add CIA tick snapshot buffer to WASM core (C implementation)"
      },
      {
        type: 'fix',
        "description": "Fix NOT/NEG size handling, CLR operand, paula LC signature, anon naming"
      },
      {
        type: 'feature',
        "description": "Scroll sync, pattern switch, and clip rename"
      },
      {
        type: 'fix',
        "description": "Add malloc guard and WASM export checks to paulaLog worklet handlers"
      },
      {
        type: 'fix',
        "description": "Add missing worklet handlers for enablePaulaLog and getPaulaLog"
      },
      {
        type: 'feature',
        "description": "Implement Pass 1 flat C emitter"
      },
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
