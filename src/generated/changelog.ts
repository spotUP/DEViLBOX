/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-17T16:02:54.404Z
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
export const BUILD_VERSION = '1.0.5559';
export const BUILD_NUMBER = '5559';
export const BUILD_HASH = '358052ea0';
export const BUILD_DATE = '2026-04-17';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5559',
    date: '2026-04-17',
    changes: [
      {
        type: 'fix',
        "description": "Revert \"Remove tracker GL renderer, move fullscreen/smooth to proper locations, fix beat markers\""
      },
      {
        type: 'fix',
        "description": "Revert \"Fix: restore line number highlight to accent color, only change row backgrounds\""
      },
      {
        type: 'fix',
        "description": "Adjust 12 FX preset gain compensation values from final audit"
      },
      {
        type: 'fix',
        "description": "Restore line number highlight to accent color, only change row backgrounds"
      },
      {
        type: 'fix',
        "description": "Remove tracker GL renderer, move fullscreen/smooth to proper locations, fix beat markers"
      },
      {
        type: 'fix',
        "description": "Fix MIDI button style, remove Save asterisk, shrink volume slider"
      },
      {
        type: 'improvement',
        "description": "Move volume slider to pattern editor header, normalize font sizes"
      },
      {
        type: 'fix',
        "description": "Fix tab bar spacing, rename FT2 references to DEViLBOX"
      },
      {
        type: 'fix',
        "description": "Move MIDI and volume to FT2 toolbar, fix tab bar layout"
      },
      {
        type: 'improvement',
        "description": "Remove gap between tabs and FT2 panel, move Collab to NavBar"
      },
      {
        type: 'improvement',
        "description": "Move hamburger menu to far left of button row"
      },
      {
        type: 'improvement',
        "description": "Remove Instruments button from FT2 toolbar"
      },
      {
        type: 'improvement',
        "description": "Normalize NavBar right-section gap to match EditorControlsBar"
      },
      {
        type: 'feature',
        "description": "Add hamburger menu to FT2 toolbar"
      },
      {
        type: 'improvement',
        "description": "Move Play Song/Pattern buttons to left of Load button"
      },
      {
        type: 'improvement',
        "description": "Move Sign In to far right, Collab + Volume to EditorControlsBar"
      },
      {
        type: 'improvement',
        "description": "Move Desktop App download button next to version number"
      },
      {
        type: 'improvement',
        "description": "Remove Studio view"
      },
      {
        type: 'fix',
        "description": "Fix FT2 toolbar input spacing — uniform 6px gap between fields"
      },
      {
        type: 'improvement',
        "description": "Normalize Mute/Stepped/Groove button spacing in EditorControlsBar"
      },
      {
        type: 'improvement',
        "description": "Move Find button from FT2 toolbar to EditorControlsBar"
      },
      {
        type: 'improvement',
        "description": "Move Ghost Patterns toggle from toolbar to Settings dialog"
      },
      {
        type: 'improvement',
        "description": "Remove dead Order button and Import button from toolbar"
      },
      {
        type: 'improvement',
        "description": "Remove dead Order button from EditorControlsBar"
      },
      {
        type: 'improvement',
        "description": "Remove recording settings button next to REC in EditorControlsBar"
      },
      {
        type: 'improvement',
        "description": "Halve spacing between FT2 toolbar inputs"
      },
      {
        type: 'improvement',
        "description": "Reorder FT2 toolbar: Position, Pattern, Length, Edit Step, Speed, BPM"
      },
      {
        type: 'improvement',
        "description": "Swap BPM and Pattern positions in FT2 toolbar"
      },
      {
        type: 'feature',
        "description": "Add bass-lock crossover to master FX chain"
      },
      {
        type: 'improvement',
        "description": "Recalibrate FX preset compensation with full-spectrum test tone"
      },
      {
        type: 'feature',
        "description": "Add DJ Quick EQ presets — one-tap EQ curves per deck"
      },
      {
        type: 'fix',
        "description": "Hide visualizer/oscilloscope on inactive/empty DJ decks"
      },
      {
        type: 'improvement',
        "description": "Remove Tape Stop master FX preset"
      },
      {
        type: 'feature',
        "description": "Add per-preset gain compensation for consistent DJ FX volume"
      },
      {
        type: 'fix',
        "description": "DJ oscilloscope no longer shows on empty decks"
      },
      {
        type: 'improvement',
        "description": "Remove blue focus ring from drum pads"
      },
      {
        type: 'improvement',
        "description": "Remove 'Dub Sirens Live' and 'Pitch Up +3' from master FX presets"
      },
      {
        type: 'improvement',
        "description": "Tame SpaceEcho feedback — echoes decay naturally instead of ringing forever"
      },
      {
        type: 'fix',
        "description": "Oneshot pads play to completion instead of cutting on release"
      },
      {
        type: 'fix',
        "description": "Remove auto-save/restore environment on playlist switch"
      },
      {
        type: 'feature',
        "description": "Add FX presets for sample pads — reggae sound system edition"
      },
      {
        type: 'fix',
        "description": "Override Tailwind preflight border-color globally"
      },
      {
        type: 'fix',
        "description": "Set default border/divide color to design system token"
      },
      {
        type: 'fix',
        "description": "Playlist column alignment, save-as, sidebar search"
      },
      {
        type: 'fix',
        "description": "Tone down playlist divider opacity to match design system"
      },
      {
        type: 'improvement',
        "description": "Full reggae sound system treatment on ALL 33 DJ one-shot presets"
      },
      {
        type: 'fix',
        "description": "Cloud playlist save includes full DJ environment"
      },
      {
        type: 'improvement',
        "description": "Improve DJ one-shot presets: punchier effects, honest names, better pad layout"
      },
      {
        type: 'feature',
        "description": "Cloud playlist save with public/private visibility"
      },
      {
        type: 'improvement',
        "description": "Increase drumpad preset name text to 27px"
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
