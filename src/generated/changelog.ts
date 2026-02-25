/**
 * Auto-generated changelog from git commits
 * Generated: 2026-02-25T10:13:40.575Z
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
export const BUILD_VERSION = '1.0.1229';
export const BUILD_NUMBER = '1229';
export const BUILD_HASH = 'bd630aa1';
export const BUILD_DATE = '2026-02-25';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.1229',
    date: '2026-02-24',
    changes: [
      {
        type: 'fix',
        "description": "Samplepack samples have no decoded buffer for playback"
      },
      {
        type: 'fix',
        "description": "Boost 3D visualizer audio reactivity ~3x"
      },
      {
        type: 'feature',
        "description": "Add fullscreen button to VJ view, move debug meter to bottom-right"
      },
      {
        type: 'fix',
        "description": "Debug: add VJ audio level meter and boost AudioDataBus responsiveness"
      },
      {
        type: 'feature',
        "description": "Add 13 audio-reactive projectM presets"
      },
      {
        type: 'fix',
        "description": "VJ audio reactivity and zero-size WebGL textures"
      },
      {
        type: 'fix',
        "description": "TB-303 view layout — center horizontally, allow vertical scroll"
      },
      {
        type: 'fix',
        "description": "Click-to-seek works when player is stopped"
      },
      {
        type: 'fix',
        "description": "Correct 3D mixer fader rest positions"
      },
      {
        type: 'fix',
        "description": "Dedup concurrent renders of the same file in DJPipeline"
      },
      {
        type: 'feature',
        "description": "Click-to-seek on scrolling waveform"
      },
      {
        type: 'fix',
        "description": "Waveform h-full stealing visualizer space — use fixed h-16"
      },
      {
        type: 'fix',
        "description": "Add @refresh reset to R3F components for HMR stability"
      },
      {
        type: 'fix',
        "description": "Pattern overlay useMemo stale — add totalPositions to deps"
      },
      {
        type: 'fix',
        "description": "Show pattern overlay in vinyl and 3D deck view modes"
      },
      {
        type: 'fix',
        "description": "Preset scratch patterns now use audio stream in DJ mode"
      },
      {
        type: 'fix',
        "description": "Wire up all 3D mixer controls to DJ engine"
      },
      {
        type: 'fix',
        "description": "DJ scratch now manipulates audio stream, not module replayer"
      },
      {
        type: 'fix',
        "description": "Restore pattern data overlay for pre-rendered modules in DJ view"
      },
      {
        type: 'fix',
        "description": "DJ deck layout overflow — records pushed down when songs loaded"
      },
      {
        type: 'fix',
        "description": "Crossfader and CF monitor translate along X axis (left/right)"
      },
      {
        type: 'fix',
        "description": "Fader rest position at bottom of groove (defaultValue=0)"
      },
      {
        type: 'fix',
        "description": "Remaining build errors in EditorControlsBar and ProjectMCanvas"
      },
      {
        type: 'fix',
        "description": "Build errors, per-fader travel distances from GLB geometry"
      },
      {
        type: 'fix',
        "description": "CF Monitor control moves left/right as horizontal slider"
      },
      {
        type: 'fix',
        "description": "Crossfader axis, fader travel, and duplicate knob mappings"
      },
      {
        type: 'fix',
        "description": "Faders offset from rest position — compute delta from defaultValue"
      },
      {
        type: 'fix',
        "description": "Map all 5 mixer faders with EXP namespace distinction"
      },
      {
        type: 'fix',
        "description": "Skip EXP duplicate meshes and invert fader Z axis"
      },
      {
        type: 'fix',
        "description": "Per-mesh rest matrices for 3D mixer faders and knobs"
      },
      {
        type: 'fix',
        "description": "3D mixer interactions and camera controls"
      },
      {
        type: 'fix',
        "description": "Fix 3D mixer/turntable interactions not working"
      },
      {
        type: 'fix',
        "description": "Route AHX/HVL files to Hively WASM instead of UADE"
      },
      {
        type: 'fix',
        "description": "Smooth progress bar during long analysis WASM calls"
      },
      {
        type: 'fix',
        "description": "Tap audio from Tone.Destination for all-source reactivity"
      },
      {
        type: 'fix',
        "description": "Skip updateMasterEffectParams on enable/disable toggle"
      },
      {
        type: 'fix',
        "description": "Debug(dj): add console logging to diagnose mixer 3D interaction"
      },
      {
        type: 'fix',
        "description": "Use DOM raycasting for mixer 3D knob/fader interaction"
      },
      {
        type: 'fix',
        "description": "Restore OrbitControls for 3D interaction, add overlay buttons"
      },
      {
        type: 'feature',
        "description": "Replace scroll-wheel zoom with on-screen camera controls"
      },
      {
        type: 'fix',
        "description": "Polish 3D mixer lighting, camera, and perf"
      },
      {
        type: 'feature',
        "description": "Integrate 3D mixer in DJ view when in 3D mode"
      },
      {
        type: 'feature',
        "description": "Add 3D Vestax PMC-05 Pro III mixer component"
      },
      {
        type: 'feature',
        "description": "Add hamsterSwitch, cueMix, boothVolume to DJ store"
      },
      {
        type: 'improvement',
        "description": "Chore: gitignore projectm-wasm build artifacts"
      },
      {
        type: 'improvement',
        "description": "Chore: update changelog"
      },
      {
        type: 'feature',
        "description": "Chore: add VJ dependencies (butterchurn, ISF, react-three postprocessing)"
      },
      {
        type: 'fix',
        "description": "Enable deck looping and simplify view switcher"
      },
      {
        type: 'feature',
        "description": "Integrate VJ view into app navigation and layout"
      },
      {
        type: 'feature',
        "description": "Add VJ view UI with Milkdrop, ISF, and 3D scene modes"
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
