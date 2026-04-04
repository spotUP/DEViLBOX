/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-03T23:45:23.949Z
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
export const BUILD_VERSION = '1.0.3990';
export const BUILD_NUMBER = '3990';
export const BUILD_HASH = 'dd47e18d8';
export const BUILD_DATE = '2026-04-03';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.3990',
    date: '2026-04-04',
    changes: [
      {
        type: 'fix',
        "description": "Native presets load on running synth instead of recreating"
      },
      {
        type: 'fix',
        "description": "SelectVoiceInBank always loads bank sysex before selecting voice"
      },
      {
        type: 'fix',
        "description": "Prevent context menu on test keyboard + accumulated session changes"
      },
      {
        type: 'fix',
        "description": "Restore selectVoice delay + add loadPatchBank debug log"
      },
      {
        type: 'fix',
        "description": "Add EditorHeader with PresetDropdown to layout mode"
      },
      {
        type: 'fix',
        "description": "Strip all redundant voice loading — let bridge handle everything"
      },
      {
        type: 'feature',
        "description": "Add 10 more factory presets (25 total)"
      },
      {
        type: 'fix',
        "description": "SetBfree — 2 tabs: MAIN (upper drawbars, perc, leslie, fx) and DETAIL (lower/pedal drawbars, vibrato, leslie detail, master)"
      },
      {
        type: 'fix',
        "description": "Raffo — single screen layout, no tabs for 32 params"
      },
      {
        type: 'fix',
        "description": "Don't send program change after single-voice sysex"
      },
      {
        type: 'fix',
        "description": "VCED presets use single-voice sysex (don't wipe entire bank)"
      },
      {
        type: 'fix',
        "description": "Remove HEAP*/wasmExports/wasmTable from unexported abort list"
      },
      {
        type: 'fix',
        "description": "Proper cartridge sync — loadVoices called alongside loadSysex"
      },
      {
        type: 'fix',
        "description": "Remove wasmMemory from unexportedSymbols abort getter list"
      },
      {
        type: 'fix',
        "description": "Patch banks — load voice data as cartridge in worklet"
      },
      {
        type: 'fix',
        "description": "Remove wasmMemory assert that blocked module init"
      },
      {
        type: 'fix',
        "description": "Remove wasmMemory early-access guard that aborted on init"
      },
      {
        type: 'fix',
        "description": "Patch banks silent — remove loadVoices init (cartridge conflict)"
      },
      {
        type: 'feature',
        "description": "Smart hardware UI popout + theme fixes"
      },
      {
        type: 'fix',
        "description": "Make applyConfig public on 7 WASM synths"
      },
      {
        type: 'fix',
        "description": "All WASM synths use layout mode — no more slider fallbacks"
      },
      {
        type: 'fix',
        "description": "Add to NATIVE_POLY_TYPES so note-off reaches the right instance"
      },
      {
        type: 'fix',
        "description": "MdaDX10 — single screen layout, no tabs for 16 params"
      },
      {
        type: 'fix',
        "description": "MdaJX10 — single screen layout, no tabs for 24 params"
      },
      {
        type: 'fix',
        "description": "MdaEPiano — single screen layout, no tabs needed for 12 params"
      },
      {
        type: 'fix',
        "description": "Knob preventDefault only for mouse, skip for passive touch events"
      },
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
