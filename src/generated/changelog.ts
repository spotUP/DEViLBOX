/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-24T09:31:45.950Z
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
export const BUILD_VERSION = '1.0.3448';
export const BUILD_NUMBER = '3448';
export const BUILD_HASH = '7921c3eea';
export const BUILD_DATE = '2026-03-24';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3448',
    date: '2026-03-24',
    changes: [
      {
        type: 'improvement',
        "description": "Wire both views to usePianoRoll shared hook"
      },
      {
        type: 'feature',
        "description": "Add usePianoRoll shared logic hook"
      },
      {
        type: 'feature',
        "description": "Diag: add alert() diagnostics for iOS file loading"
      },
      {
        type: 'feature',
        "description": "Extract usePatternEditor shared hook for both pattern editor views"
      },
      {
        type: 'fix',
        "description": "Auto-discover companion files for multi-file Amiga formats"
      },
      {
        type: 'improvement',
        "description": "Wire ArrangementView pair to useArrangementView hook"
      },
      {
        type: 'feature',
        "description": "Add useArrangementView shared hook"
      },
      {
        type: 'improvement',
        "description": "Extract shared TrackerView logic into useTrackerView hook"
      },
      {
        type: 'fix',
        "description": "Guard ALL stop paths in usePatternPlayback with skipNextReload"
      },
      {
        type: 'fix',
        "description": "Use getSong()!==null to detect playback for Right Shift/Alt seek"
      },
      {
        type: 'improvement',
        "description": "Wire Pixi NavBar to shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire Pixi EditorControlsBar to shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire DOM EditorControlsBar to shared hook"
      },
      {
        type: 'feature',
        "description": "Add useEditorControls shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire DOM NavBar to shared hook"
      },
      {
        type: 'feature',
        "description": "Add useNavBar shared hook"
      },
      {
        type: 'improvement',
        "description": "Add toggleMic/setMicGain actions, wire PixiDJMixer"
      },
      {
        type: 'fix',
        "description": "Add ?reset escape hatch for stuck songs + fix FormatFamily type"
      },
      {
        type: 'improvement',
        "description": "Wire transport views to DJActions"
      },
      {
        type: 'fix',
        "description": "Right Shift/Alt directly calls forcePosition, bypasses React"
      },
      {
        type: 'fix',
        "description": "Add 77 missing Amiga extensions to FormatRegistry + fix UADE prefix mapping"
      },
      {
        type: 'fix',
        "description": "Add missing UADE prefix entries to FormatRegistry"
      },
      {
        type: 'fix',
        "description": "Check both replayer.isPlaying AND store.isPlaying for seek"
      },
      {
        type: 'fix',
        "description": "Use DJActions.togglePlay() in keyboard handler"
      },
      {
        type: 'fix',
        "description": "Add 20+ missing UADE prefix routes, prevent SunVox restore freeze"
      },
      {
        type: 'fix',
        "description": "Stop position — remove stale playbackRow cursor override"
      },
      {
        type: 'fix',
        "description": "SkipNextReload flag prevents usePatternPlayback from restarting after forcePosition"
      },
      {
        type: 'improvement',
        "description": "Wire Pixi PixiNewSongWizard to shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire Pixi SIDInfoModal to shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire Pixi GrooveSettingsModal to shared hook"
      },
      {
        type: 'fix',
        "description": "Skip Tone.start/unlockIOSAudio when seeking during playback"
      },
      {
        type: 'improvement',
        "description": "Wire DOM NewSongWizard to shared hook"
      },
      {
        type: 'feature',
        "description": "Add useNewSongWizard shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire DOM SIDInfoModal to shared hook"
      },
      {
        type: 'feature',
        "description": "Add useSIDInfoDialog shared hook"
      },
      {
        type: 'improvement',
        "description": "Wire DOM GrooveSettingsModal to shared hook"
      },
      {
        type: 'feature',
        "description": "Add useGrooveSettings shared hook"
      },
      {
        type: 'fix',
        "description": "Don't change store state when seeking during playback"
      },
      {
        type: 'improvement',
        "description": "Diag: verbose forcePosition logging"
      },
      {
        type: 'fix',
        "description": "ForcePosition no longer updates transport store"
      },
      {
        type: 'fix',
        "description": "Sync editing cursor to playback position on stop"
      },
      {
        type: 'fix',
        "description": "Right Shift = play song, Right Alt = play pattern (ProTracker)"
      },
      {
        type: 'improvement',
        "description": "Wire DOM HelpModal to shared hook and data constants"
      },
      {
        type: 'fix',
        "description": "ExitScratchMode bails if replayer already stopped — no restart loop"
      },
      {
        type: 'fix',
        "description": "Use lastDequeuedState for stop position — matches visual display"
      },
      {
        type: 'feature',
        "description": "Add shared help content data and useHelpDialog hook"
      },
      {
        type: 'fix',
        "description": "Sync transport currentRow to replayer pattPos on stop"
      },
      {
        type: 'fix',
        "description": "Alt/Option+click Play Song/Pattern restarts from row 0"
      },
      {
        type: 'fix',
        "description": "Preserve lastDequeuedState on stop — pattern editor stays in place"
      },
      {
        type: 'fix',
        "description": "Add forcePosition() for instant play-from-start"
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
