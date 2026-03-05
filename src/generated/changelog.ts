/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-05T16:30:36.769Z
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
export const BUILD_VERSION = '1.0.2369';
export const BUILD_NUMBER = '2369';
export const BUILD_HASH = '1ed9ba86';
export const BUILD_DATE = '2026-03-05';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2369',
    date: '2026-03-05',
    changes: [
      {
        type: 'fix',
        "description": "Clean up SuperCollider debug diagnostics"
      },
      {
        type: 'feature',
        "description": "Add restructure pass with for/do-while/if-else detection"
      },
      {
        type: 'feature',
        "description": "Add VU meter triggers for native engine formats (SID, HVL, MusicLine)"
      },
      {
        type: 'fix',
        "description": "Chore: add SuperCollider audio driver debug logging"
      },
      {
        type: 'feature',
        "description": "Add Future Player 68k replayer transpiled to C/WASM"
      },
      {
        type: 'fix',
        "description": "Fix silent playback bug: play() race condition and stale state"
      },
      {
        type: 'fix',
        "description": "Fix SuperCollider volume normalization and audio routing"
      },
      {
        type: 'fix',
        "description": "Fix Buzz percussion trigger in test runner"
      },
      {
        type: 'fix',
        "description": "Move transpile/debug skill to proper .github/skills/ format"
      },
      {
        type: 'improvement',
        "description": "Rename skill to 'Transpile and Debug 68k Replayer Waveform Mismatch'"
      },
      {
        type: 'feature',
        "description": "Tools: add Puppeteer FPS profiler script"
      },
      {
        type: 'fix',
        "description": "Jamcracker: add debug render and comparison tools"
      },
      {
        type: 'fix',
        "description": "Jamcracker: rebuild WASM with bug fixes #7-10"
      },
      {
        type: 'fix',
        "description": "Fix SID speed detection: analyze note changes, not all register changes"
      },
      {
        type: 'fix',
        "description": "Fix SuperCollider silence: run scsynth on main thread"
      },
      {
        type: 'fix',
        "description": "JamCracker: fix bugs #7-10 in transpiled replayer"
      },
      {
        type: 'improvement',
        "description": "SID parser: multi-pattern splitting, speed/BPM detection, IndexedDB cache"
      },
      {
        type: 'feature',
        "description": "Add per-engine volume normalization and master volume control"
      },
      {
        type: 'improvement',
        "description": "Clarify UADE as ground truth, waveform 1:1 match goal"
      },
      {
        type: 'improvement',
        "description": "Add generalized replayer channel debug skill to CLAUDE.md"
      },
      {
        type: 'fix',
        "description": "Pre-populate ScriptNodePlayer cache to prevent double loadMusicData"
      },
      {
        type: 'feature',
        "description": "Human-readable C output with inline ASM, formatting, and documentation"
      },
      {
        type: 'fix',
        "description": "Pass C64 ROM data to WebSIDPlay/WebSID adapters"
      },
      {
        type: 'improvement',
        "description": "Fix arrow key scroll FPS drop at 120Hz"
      },
      {
        type: 'fix',
        "description": "Fix FurnaceRF5C68 silence, FurnaceY8950 chipType, add WASM synth fixes"
      },
      {
        type: 'improvement',
        "description": "Memoize layout objects in PixiChannelHeaders"
      },
      {
        type: 'improvement',
        "description": "Stop rAF loops entirely when not visible"
      },
      {
        type: 'improvement',
        "description": "Reduce GC pressure and throttle VU meters to 60fps"
      },
      {
        type: 'fix',
        "description": "WebSIDPlay teardown via global module state, JSIDPlay2 remove pre-buffer delay"
      },
      {
        type: 'fix',
        "description": "Call WASM emu_teardown on engine dispose/switch to reset emulator state"
      },
      {
        type: 'fix',
        "description": "JSIDPlay2 fire-and-forget CLOCK loop, non-blocking SET_SAMPLING_RATE, better ScriptNodePlayer teardown in test page"
      },
      {
        type: 'improvement',
        "description": "Reduce React reconciliation during playback"
      },
      {
        type: 'improvement',
        "description": "Memoize layout props in PixiPatternEditor"
      },
      {
        type: 'improvement',
        "description": "Skip VU meter redraw when all levels at zero"
      },
      {
        type: 'improvement',
        "description": "Skip VJ render loops when layer is not active"
      },
      {
        type: 'improvement',
        "description": "Lazy-load JSZip to prevent postMessage polyfill overhead"
      },
      {
        type: 'improvement',
        "description": "Uncap Pixi ticker FPS to match display refresh rate"
      },
      {
        type: 'fix',
        "description": "Defer ASID MIDI init until enabled in settings"
      },
      {
        type: 'fix',
        "description": "Fix Buzz3o3/Buzz3o3DF volume normalization"
      },
      {
        type: 'improvement',
        "description": "Recalibrate volume offsets for 28 Furnace + MAME synths"
      },
      {
        type: 'fix',
        "description": "Use pivot.y for smooth scroll to avoid layout engine position resets"
      },
      {
        type: 'fix',
        "description": "Sync smooth scroll with Pixi render via useTick"
      },
      {
        type: 'fix',
        "description": "Fix 4 silent synths: ModularSynth, ChipSynth, Wavetable, SpaceLaser"
      },
      {
        type: 'fix',
        "description": "Disable roundPixels to enable sub-pixel smooth scroll in GL tracker"
      },
      {
        type: 'fix',
        "description": "Fix jsSID crash: guard OPL.create() for missing OPL FM emulator"
      },
      {
        type: 'improvement',
        "description": "Recalibrate volume normalization offsets for all 23 synths"
      },
      {
        type: 'fix',
        "description": "GL smooth scroll jitter — cache row duration to prevent oscillation"
      },
      {
        type: 'fix',
        "description": "Fix hooks ordering violation in GlModal — move hooks before early return"
      },
      {
        type: 'fix',
        "description": "GL tracker smooth scroll jitter on row transitions"
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
