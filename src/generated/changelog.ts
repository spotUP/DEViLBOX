/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-15T09:09:07.969Z
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
export const BUILD_VERSION = '1.0.5315';
export const BUILD_NUMBER = '5315';
export const BUILD_HASH = 'c644f2d0c';
export const BUILD_DATE = '2026-04-15';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5315',
    date: '2026-04-15',
    changes: [
      {
        type: 'fix',
        "description": "Autotune dropdown z-index in vocoder panel"
      },
      {
        type: 'fix',
        "description": "TALK button starts muted (push-to-talk, not toggle)"
      },
      {
        type: 'fix',
        "description": "DJ loading uses pipeline directly + music ducks during speech"
      },
      {
        type: 'feature',
        "description": "Device persistence and smart reconnection"
      },
      {
        type: 'fix',
        "description": "Interactive sample editor demo with correct pitch"
      },
      {
        type: 'fix',
        "description": "Per-channel DJ oscilloscopes now show independent data"
      },
      {
        type: 'fix',
        "description": "AHX/HVL loads through native parser path in tour"
      },
      {
        type: 'feature',
        "description": "NKS-powered auto-configuration"
      },
      {
        type: 'fix',
        "description": "Portal vocoder settings panel to escape overflow clipping"
      },
      {
        type: 'fix',
        "description": "Tour DJ loading, speech pad, and format suppression"
      },
      {
        type: 'feature',
        "description": "Add ping-pong sweep to filter FX"
      },
      {
        type: 'fix',
        "description": "Use AHX chiptune for tracker demo, MOD for sample editor"
      },
      {
        type: 'fix',
        "description": "Handle 'pending-import' for .mod files in loadTrackerSong"
      },
      {
        type: 'feature',
        "description": "Add Swedish Chainsaw HM-2 preset to master FX demo"
      },
      {
        type: 'fix',
        "description": "Use loadFile() for tracker songs (same path as file dialog)"
      },
      {
        type: 'fix',
        "description": "Phonemize 'music' → 'myuzik' for DECtalk"
      },
      {
        type: 'fix',
        "description": "Tracker playback, smooth subtitle fade, phonemization"
      },
      {
        type: 'fix',
        "description": "Fix first keypress silence in sample editor and synths"
      },
      {
        type: 'feature',
        "description": "Double playhead trail to 240px"
      },
      {
        type: 'feature',
        "description": "Laser glow on waveform lines + triple playhead trail"
      },
      {
        type: 'fix',
        "description": "Nicer synth sound + move tour button next to tips"
      },
      {
        type: 'fix',
        "description": "Clear playhead on key release in sample editor"
      },
      {
        type: 'improvement',
        "description": "Smooth playhead line via overlay canvas (no re-render flicker)"
      },
      {
        type: 'feature',
        "description": "Live Modland/HVSC search, automation demo, MIDI demo"
      },
      {
        type: 'fix',
        "description": "Clear stale audioBuffer when persisting sample edits"
      },
      {
        type: 'feature',
        "description": "Master FX demo + mixer solo/mute demo"
      },
      {
        type: 'fix',
        "description": "Fix drumpad bank switching and keyboard control bugs"
      },
      {
        type: 'improvement',
        "description": "Remove dead PadMode type and modes field"
      },
      {
        type: 'fix',
        "description": "Fix drumpad bugs: stutter routing, copy/paste, touch handling"
      },
      {
        type: 'feature',
        "description": "Advanced sample editor demo, subtitle fade, Kraftwerk mouth fix"
      },
      {
        type: 'improvement',
        "description": "Replace deprecated ScriptProcessor with delay-based stutter"
      },
      {
        type: 'feature',
        "description": "Interactive drumpad/synth demo, subtitle fade fix, Kraftwerk mouth"
      },
      {
        type: 'improvement',
        "description": "Remove dead padMode code from drumpad store"
      },
      {
        type: 'fix',
        "description": "Cut/edit operations now update engine sample"
      },
      {
        type: 'fix',
        "description": "Fix stutter DJ FX not connecting to master audio"
      },
      {
        type: 'feature',
        "description": "Add preset selection to drumpad synth assignment"
      },
      {
        type: 'fix',
        "description": "Tracker song loading bypasses import dialog"
      },
      {
        type: 'feature',
        "description": "Add full synth browser to drumpad context menu"
      },
      {
        type: 'fix',
        "description": "Tour DJ loading uses proper pipeline render path"
      }
    ]
  },
  {
    version: '2026-04-14',
    date: '2026-04-14',
    changes: [
      {
        type: 'feature',
        "description": "Interactive hands-on tour with voice FX and subtitle fade"
      },
      {
        type: 'feature',
        "description": "Tour enhancements — demo song, Kraftwerk head, spotlight"
      },
      {
        type: 'fix',
        "description": "Tour skip resolves delay promise to prevent loop hang"
      },
      {
        type: 'feature',
        "description": "Guided tour with DECtalk voiceover and subtitles"
      },
      {
        type: 'fix',
        "description": "Fix ROM speech synths in drumpad context menu"
      },
      {
        type: 'fix',
        "description": "Make Kraftwerk head spikes visible — correct coordinate space"
      },
      {
        type: 'feature',
        "description": "Add all speech synths to drumpad context menu"
      },
      {
        type: 'improvement',
        "description": "Prevent drum pads from triggering on right-click"
      },
      {
        type: 'feature',
        "description": "Add full one-shot preset selection to pad context menu"
      },
      {
        type: 'fix',
        "description": "Deep audit — 6 issues fixed across VJ pipeline"
      },
      {
        type: 'improvement',
        "description": "Remove mode tabs entirely - bank-based organization only"
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
