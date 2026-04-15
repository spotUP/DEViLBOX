/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-15T17:49:52.040Z
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
export const BUILD_VERSION = '1.0.5341';
export const BUILD_NUMBER = '5341';
export const BUILD_HASH = 'd5dd7fa60';
export const BUILD_DATE = '2026-04-15';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5341',
    date: '2026-04-15',
    changes: [
      {
        type: 'fix',
        "description": "Tour: Acid RAT preset, expanded synth panel, master compressor + fix AHX spotlight"
      },
      {
        type: 'fix',
        "description": "Fix acid demo: direct replayer control + proper knob animation"
      },
      {
        type: 'fix',
        "description": "Fix sample editor tour silence + robust sample playback"
      },
      {
        type: 'improvement',
        "description": "Tour DJ: load tracks from Modland instead of bad local conversions"
      },
      {
        type: 'fix',
        "description": "Fix tour acid demo: load song directly into replayer"
      },
      {
        type: 'improvement',
        "description": "TB-303: default octave 2 for bass range + acid tour demo"
      },
      {
        type: 'fix',
        "description": "Fix channel oscilloscopes showing waveform on all channels"
      },
      {
        type: 'fix',
        "description": "Fix VU meter timing: time-based decay, remove stagger drift, sync triggers to audio"
      },
      {
        type: 'fix',
        "description": "Fix 808 synth presets: add missing Conga Mid, remove duplicate Cymbal 2"
      },
      {
        type: 'improvement',
        "description": "Mirror MPC pad layout: pad 1 at bottom-left, higher pads at top"
      },
      {
        type: 'improvement',
        "description": "Dynamic drum pad grid based on MIDI controller profile"
      },
      {
        type: 'fix',
        "description": "Tour FX, play retrigger, drumpad/MIDI note fixes"
      },
      {
        type: 'fix',
        "description": "Anti-click fades for HarmonicSynth and WavetableSynth"
      },
      {
        type: 'fix',
        "description": "Anti-click ramp on DubSiren gate transitions"
      },
      {
        type: 'improvement',
        "description": "PadGrid delegates to singleton useMIDIPadRouting hook"
      },
      {
        type: 'improvement',
        "description": "Enable MIDI drum pads in DJ and VJ views"
      },
      {
        type: 'fix',
        "description": "Fix MIDI pads triggering navigation instead of drum sounds in DrumPad view"
      },
      {
        type: 'fix',
        "description": "Silence noisy startup console warnings"
      },
      {
        type: 'fix',
        "description": "Silence SysEx errors when MIDI opened without sysex permission"
      },
      {
        type: 'fix',
        "description": "Fix scratch stacking with immediate guard - prevent Zustand race condition"
      },
      {
        type: 'fix',
        "description": "Fix DJ scratch volume stacking bug - prevent race condition"
      },
      {
        type: 'fix',
        "description": "Fix synth editors to use simple 2-column grid layout"
      },
      {
        type: 'improvement',
        "description": "Convert synth editors to responsive grid layout"
      },
      {
        type: 'fix',
        "description": "TB303 editor not showing — provide DEFAULT_TB303 config on create"
      },
      {
        type: 'fix',
        "description": "Fix synth editor spacing - reduce gap-6 to gap-3"
      },
      {
        type: 'fix',
        "description": "Missing import for isFormatChecksSuppressed"
      },
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
