/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-03T22:29:24.448Z
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
export const BUILD_VERSION = '1.0.3964';
export const BUILD_NUMBER = '3964';
export const BUILD_HASH = 'faa01a037';
export const BUILD_DATE = '2026-04-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3964',
    date: '2026-04-04',
    changes: [
      {
        type: 'fix',
        "description": "Velocity slider — fixed 96px width instead of full-width stretch"
      },
      {
        type: 'fix',
        "description": "Guard worklet cartridge update — check function exists + try/catch"
      },
      {
        type: 'fix',
        "description": "Suppress passive event listener warning in Knob component"
      },
      {
        type: 'fix',
        "description": "Hide filter curve + ADSR visualizer for WASM synths"
      },
      {
        type: 'fix',
        "description": "MdaEPiano/JX10/DX10 — remove synthType fallback to slider controls"
      },
      {
        type: 'fix',
        "description": "Patch banks silent — update cartridge on sysex load"
      },
      {
        type: 'fix',
        "description": "MdaEPiano knobs instead of sliders, add Odin2/Surge/Helm hw UIs"
      }
    ]
  },
  {
    version: '2026-04-03',
    date: '2026-04-03',
    changes: [
      {
        type: 'improvement',
        "description": "Chore: track DX7 WASM build artifacts in git (prevent accidental loss)"
      },
      {
        type: 'fix',
        "description": "Complete parameter coverage — all synth layouts now 100%"
      },
      {
        type: 'fix',
        "description": "Playlist hover — always-rendered buttons with opacity toggle, subtle hover bg"
      },
      {
        type: 'fix',
        "description": "VCED operator order — config[0]=OP1 maps to VCED slot 5, not 0"
      },
      {
        type: 'fix',
        "description": "DOM playlist hover — JS-based onPointerEnter/Leave, not CSS :hover"
      },
      {
        type: 'fix',
        "description": "DOM playlist hover — 20% white on all rows, always applied"
      },
      {
        type: 'fix',
        "description": "PixiList crash — bufferItems should be buffer (prop name)"
      },
      {
        type: 'fix',
        "description": "DOM playlist — make 1/2/X buttons always visible, brighter on hover"
      },
      {
        type: 'fix',
        "description": "PixiList hover — track from parent pointermove instead of per-row events"
      },
      {
        type: 'fix',
        "description": "Replace hardcoded Tailwind colors with design token classes"
      },
      {
        type: 'fix',
        "description": "PixiList rows — add explicit hitArea for click and hover"
      },
      {
        type: 'fix',
        "description": "PixiList hover — use tint+alpha (reactive) on pixiGraphics background"
      },
      {
        type: 'fix',
        "description": "PixiList hover — use reactive backgroundColor instead of draw callback"
      },
      {
        type: 'feature',
        "description": "GL/DOM UI parity — design system tokens, dialog conversions, feature gaps"
      },
      {
        type: 'fix',
        "description": "Crate/playlist panels need eventMode=\"static\" on all containers"
      },
      {
        type: 'feature',
        "description": "Hover-revealed action buttons on playlist track rows"
      },
      {
        type: 'feature',
        "description": "Add hover state to PixiList rows"
      },
      {
        type: 'fix',
        "description": "Crate panel needs click before becoming active"
      },
      {
        type: 'feature',
        "description": "Add brick-wall limiter on deck channel output"
      },
      {
        type: 'fix',
        "description": "Revert pitchShift routing — internal delay buffers cause volume boost"
      },
      {
        type: 'fix',
        "description": "Scratch buffer playback now routes through pitchShift"
      },
      {
        type: 'fix',
        "description": "Root cause of scratch volume boost — gain overlap during transitions"
      },
      {
        type: 'fix',
        "description": "Bypass Tone.Signal entirely for scratch gain + fix sync false-stop"
      },
      {
        type: 'fix',
        "description": "Eliminate gain corruption from Tone.js linearRampTo wrapper"
      },
      {
        type: 'feature',
        "description": "Mount PixiDeckPatternDisplay overlay on vinyl and 3D deck views"
      },
      {
        type: 'fix',
        "description": "Auto DJ enable returns error messages instead of failing silently"
      },
      {
        type: 'feature',
        "description": "Scratch sensitivity setting + view switch mutual exclusion"
      },
      {
        type: 'fix',
        "description": "Scratch backward displacement tracking and gain automation safety"
      },
      {
        type: 'fix',
        "description": "Scratch flanging, position reset, and volume accumulation"
      },
      {
        type: 'feature',
        "description": "Edit Instrument modal — fullscreen with collapsible left panel"
      },
      {
        type: 'fix',
        "description": "Duplicate WaveSabre key + DrumPadManager crash on app.screen"
      },
      {
        type: 'fix',
        "description": "File browser — single click opens directories, fix event propagation"
      },
      {
        type: 'fix',
        "description": "Simplify Add Instrument search bar — use PixiPureTextInput directly"
      },
      {
        type: 'fix',
        "description": "Add Instrument dialog sizing/spacing/fonts to match DOM"
      },
      {
        type: 'fix',
        "description": "Add layout={{}} to all bitmap text and icons in Add Instrument dialog"
      },
      {
        type: 'fix',
        "description": "Restore audio by using loadVoices+setBank path for VCED presets"
      },
      {
        type: 'feature',
        "description": "Add New Instrument dialog — 1:1 with DOM CategorizedSynthSelector"
      },
      {
        type: 'fix',
        "description": "Stabilize sync indicator with 1-second rolling average"
      },
      {
        type: 'feature',
        "description": "Categorized Add New Instrument browser matching DOM"
      },
      {
        type: 'feature',
        "description": "Beat-snap drag + visual sync indicator on waveforms"
      },
      {
        type: 'fix',
        "description": "Improve Add New Instrument dialog — full width, icons, better layout"
      },
      {
        type: 'feature',
        "description": "Serato-style full-width waveforms at top of DJ view"
      },
      {
        type: 'fix',
        "description": "ADD instrument button opens GL-native create dialog"
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
