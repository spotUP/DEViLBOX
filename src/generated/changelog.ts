/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-14T13:45:56.311Z
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
export const BUILD_VERSION = '1.0.2843';
export const BUILD_NUMBER = '2843';
export const BUILD_HASH = '02f1c3648';
export const BUILD_DATE = '2026-03-14';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2843',
    date: '2026-03-14',
    changes: [
      {
        type: 'fix',
        "description": "Fix pattern-wrap pauses: counter for natural-advance ref, startTransition for store updates"
      },
      {
        type: 'fix',
        "description": "Symphonie Pro: fix DSP display, DSPDelay parsing, DSP audio, MCP effStr"
      },
      {
        type: 'feature',
        "description": "Add CMISynth engine stub (Fairlight CMI IIx)"
      },
      {
        type: 'improvement',
        "description": "Update third-party: openmpt Load_symmod.cpp"
      },
      {
        type: 'fix',
        "description": "Fix MAME stream output_count + add CMI capabilities; fix MCP effStr for Symphonie DSP"
      },
      {
        type: 'improvement',
        "description": "Update generated changelog"
      },
      {
        type: 'improvement',
        "description": "Symphonie: rebuild WASM with updated symphonie_player.c"
      },
      {
        type: 'fix',
        "description": "Fix SpaceLaserSynth.triggerRelease signature to accept optional note param"
      },
      {
        type: 'improvement',
        "description": "Replace MAME AICA with Fairlight CMI IIx synth"
      },
      {
        type: 'fix',
        "description": "Fix Symphonie DSP effect display: reorder type chars E/C swap"
      },
      {
        type: 'feature',
        "description": "GL UI: add accent color swatches to theme dropdown"
      },
      {
        type: 'feature',
        "description": "GL UI: add 31 visualizer modes via DOM overlay + NavBar auth/MIDI dropdowns"
      },
      {
        type: 'fix',
        "description": "GL UI: fix remaining gaps — theme dropdown + 5 new visualizer modes"
      },
      {
        type: 'fix',
        "description": "Symphonie WASM: rebuild with playback fixes"
      },
      {
        type: 'fix',
        "description": "VFXSynth: fix ES5506 register map and rendering pipeline"
      },
      {
        type: 'improvement',
        "description": "Format routing: route sfx/dsym/gt2 through OpenMPT; switch MAMEDOC to ES5503Synth"
      },
      {
        type: 'improvement',
        "description": "OpenMPT Soundlib: MIDI macro API + DSP echo export + WASM rebuild"
      },
      {
        type: 'improvement',
        "description": "Symphonie Pro: DSP echo display + route audio through libopenmpt"
      },
      {
        type: 'feature',
        "description": "GL UI: implement tracker interface gaps"
      },
      {
        type: 'improvement',
        "description": "Update changelog"
      },
      {
        type: 'feature',
        "description": "MCP: add run_synth_tests tool, auto-reconnect, 15min timeout, MAME batch testing"
      },
      {
        type: 'fix',
        "description": "Fix MAME chip synths: ES5503 wavetable, RF5C400 pan/freq, VFX rendering"
      },
      {
        type: 'fix',
        "description": "Fix Symphonie Pro: CMD_REPLAY_FROM playback, instrument column noise"
      },
      {
        type: 'fix',
        "description": "UADE engine: pass subsong on load, expand skipScan formats, fix looping"
      },
      {
        type: 'fix',
        "description": "Fix Steve Turner parser: timing, effects, subsong metadata"
      },
      {
        type: 'feature',
        "description": "Add UADE subsong selector for native-parsed formats (Steve Turner etc.)"
      },
      {
        type: 'fix',
        "description": "Fix GL UI BindingErrors: remove StrictMode, eliminate hover-state re-renders"
      },
      {
        type: 'improvement',
        "description": "Synth tester: skip C64SID — InstrumentFactory returns null intentionally"
      },
      {
        type: 'improvement',
        "description": "UADE: propagate skipScan to UADESynth for looping 68k replayer formats"
      },
      {
        type: 'improvement',
        "description": "Tools + changelog: format status updates, furnace audit tools, changelog"
      },
      {
        type: 'fix',
        "description": "UI tweaks: theme fixes, import dialog loading text, CSS border fix"
      },
      {
        type: 'feature',
        "description": "Synth tester: add testMAMESynths(), skip Buzzmachine effects processor"
      },
      {
        type: 'fix',
        "description": "Tone.js: GranularSynth stop fix, PluckSynth race fix, BitCrusher wet fix"
      },
      {
        type: 'fix',
        "description": "Furnace: FurnaceDispatch output tap fix, platform chip updates, WASM rebuild"
      },
      {
        type: 'improvement',
        "description": "Format parsers: Steve Turner native decode, Amiga routing refactor"
      },
      {
        type: 'improvement',
        "description": "Update UADE audit tools: improved comparison metrics and rendering"
      },
      {
        type: 'improvement',
        "description": "UADE: skipScan for looping formats, mute mask support, WASM rebuild"
      },
      {
        type: 'fix',
        "description": "Fix V2 synth: connect worklet before init message, fix default channel volume"
      },
      {
        type: 'improvement',
        "description": "Refactor settings modal: transparent overlay, improved tab navigation"
      },
      {
        type: 'fix',
        "description": "Fix PixiJS rendering: anchor rects, channel header clip mask, layer ordering"
      }
    ]
  },
  {
    version: '2026-03-13',
    date: '2026-03-13',
    changes: [
      {
        type: 'feature',
        "description": "Add UADE audio quality audit CLI tools"
      },
      {
        type: 'fix',
        "description": "Fix pattern editor trail: gate on isPlaying, skip empty cells"
      },
      {
        type: 'improvement',
        "description": "Update project docs: CLAUDE.md, MCP help, format status tool"
      },
      {
        type: 'improvement',
        "description": "Misc UI polish: editor header, synth selector, MAME synths, CSS tweaks"
      },
      {
        type: 'improvement',
        "description": "Replace TR-707 native slider with custom drag handler"
      },
      {
        type: 'fix',
        "description": "Fix triggerNote/releaseNote: look up instrument from store, not engine"
      },
      {
        type: 'feature',
        "description": "Add per-note piano key colors and vintage drum machine themes"
      },
      {
        type: 'improvement',
        "description": "Calibrate volume offsets for Furnace chips and VST synths"
      },
      {
        type: 'fix',
        "description": "Fix CZ101 WASM init: fetch binary on main thread, pass to worklet"
      },
      {
        type: 'fix',
        "description": "Fix pattern editor trail highlight: only apply to cells with content"
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
