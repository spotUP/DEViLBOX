/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-24T08:56:22.144Z
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
export const BUILD_VERSION = '1.0.1178';
export const BUILD_NUMBER = '1178';
export const BUILD_HASH = '5ab5bfed';
export const BUILD_DATE = '2026-02-24';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1178',
    date: '2026-02-24',
    changes: [
      {
        type: 'feature',
        "description": "Modland browser keyboard navigation + deck 3 button"
      },
      {
        type: 'fix',
        "description": "Restore tracker visuals in audio mode"
      },
      {
        type: 'fix',
        "description": "UADE panning 1.0 = mono, not 0.0"
      },
      {
        type: 'fix',
        "description": "Restore fresh UADE init per render — IPC corrupts on reuse"
      },
      {
        type: 'feature',
        "description": "UADE renders mono via panning=0.0, WAV encodes mono"
      },
      {
        type: 'fix',
        "description": "Uade_wasm_render returns 1=success, not frame count"
      },
      {
        type: 'fix',
        "description": "Match worklet UADE instantiation exactly"
      },
      {
        type: 'fix',
        "description": "Force fresh UADE instance for each render"
      },
      {
        type: 'fix',
        "description": "Use HEAPF32.buffer approach matching working UADE worklet"
      },
      {
        type: 'fix',
        "description": "Revert to looping disabled, increase silence tolerance"
      },
      {
        type: 'fix',
        "description": "Remove stop() call that was corrupting UADE IPC"
      },
      {
        type: 'fix',
        "description": "Restart UADE playback after setting looping mode"
      },
      {
        type: 'fix',
        "description": "Debug(dj): Add more detailed silence detection logging"
      },
      {
        type: 'fix',
        "description": "Enable UADE looping to prevent premature song termination"
      },
      {
        type: 'fix',
        "description": "Debug(dj): Add detailed UADE render loop logging"
      },
      {
        type: 'fix',
        "description": "Fix audio playback after skipping tracker mode"
      },
      {
        type: 'feature',
        "description": "Automatically switch view mode based on loaded file type"
      },
      {
        type: 'feature',
        "description": "Add setDeckViewMode action to DJ store"
      },
      {
        type: 'fix',
        "description": "Robustify UADE background renderer startup and memory access"
      },
      {
        type: 'fix',
        "description": "Robustify UADE render loop and clean up diagnostic logs"
      },
      {
        type: 'fix',
        "description": "Expand audio extensions and add misrouting guard"
      },
      {
        type: 'fix',
        "description": "Robustify UADE render loop to prevent premature termination"
      },
      {
        type: 'fix',
        "description": "Expand audio support and prevent misrouting modern formats"
      },
      {
        type: 'fix',
        "description": "Correctly route regular audio files in DJ UI components"
      },
      {
        type: 'fix',
        "description": "Implementation of aggressive UADE filename sanitization and refined initialization"
      },
      {
        type: 'fix',
        "description": "Sanitize UADE filenames and ensure full WASM initialization"
      },
      {
        type: 'fix',
        "description": "Ensure AudioContext is running before deck playback"
      },
      {
        type: 'fix',
        "description": "Restore all amiga formats to UADE and add loading retry mechanism"
      },
      {
        type: 'fix',
        "description": "Debug(dj): add diagnostic logging for audio pipeline and player"
      },
      {
        type: 'fix',
        "description": "Add buffer check and fade-in/out to DeckAudioPlayer"
      },
      {
        type: 'fix',
        "description": "Mute tracker replayer and ensure visuals load during rendering"
      },
      {
        type: 'feature',
        "description": "Remove tracker mode fallback from UI components"
      },
      {
        type: 'fix',
        "description": "Ensure tracker-as-source mode and eliminate audio glitches"
      },
      {
        type: 'fix',
        "description": "Resolve keyboard hook unused variables and incorrect argument count"
      },
      {
        type: 'fix',
        "description": "Implement stopNativeEngine and add UADE instance check"
      },
      {
        type: 'fix',
        "description": "Eliminate tracker playback bugs by rendering MOD files first"
      },
      {
        type: 'improvement',
        "description": "Remove Open303 duplicate TB-303 implementation"
      }
    ]
  },
  {
    version: '2026-02-23',
    date: '2026-02-23',
    changes: [
      {
        type: 'feature',
        "description": "Add 5 missing VSTBridge synths to synth selector"
      },
      {
        type: 'feature',
        "description": "Implement headphone cueing (PFL) system"
      },
      {
        type: 'feature',
        "description": "Wire scenario behaviors and complete MIDI noteOff handling"
      },
      {
        type: 'feature',
        "description": "Implement DJ scenario presets and generic controller support"
      },
      {
        type: 'fix',
        "description": "Actually fix TypeScript errors in loadInstrumentFile"
      },
      {
        type: 'fix',
        "description": "Fix remaining TypeScript errors in UnifiedFileLoader"
      },
      {
        type: 'improvement',
        "description": "Update changelog for unified file loader"
      },
      {
        type: 'fix',
        "description": "Fix TypeScript errors in unified file loader"
      },
      {
        type: 'improvement',
        "description": "Unify file loading: Single code path for all 137 formats"
      },
      {
        type: 'fix',
        "description": "Fix tracker module file dialog path to match drag-drop"
      },
      {
        type: 'fix',
        "description": "Fix HVL silence, DrumMachine crash, MIDI drag-drop, song-ended spam, DJ pipeline"
      },
      {
        type: 'improvement',
        "description": "Chore: Update dependencies for DJ system"
      },
      {
        type: 'feature',
        "description": "Integrate DJ audio routing with tracker and export"
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
