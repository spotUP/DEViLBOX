/**
 * Auto-generated changelog from git commits
 * Generated: 2026-03-15T10:07:48.061Z
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
export const BUILD_VERSION = '1.0.2883';
export const BUILD_NUMBER = '2883';
export const BUILD_HASH = 'c1f54de35';
export const BUILD_DATE = '2026-03-15';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2883',
    date: '2026-03-15',
    changes: [
      {
        type: 'fix',
        "description": "Fix Medley (.ml/.mso), injectUADE logic, MAMEMultiPCM missing entry"
      },
      {
        type: 'fix',
        "description": "Add native tests for DSS/SCR/DSR/DODA; fix missing injectUADE on pvp/dsr"
      },
      {
        type: 'feature',
        "description": "Add native detection tests for WallyBeben, SteveBarrett, PaulSummers, DaveLoweNew"
      },
      {
        type: 'improvement',
        "description": "Convert daveLowe and magneticFieldsPacker to withNativeThenUADE"
      },
      {
        type: 'improvement',
        "description": "Convert adpcmMono/robHubbard to withNativeThenUADE; remove duplicate smus/snx/tiny block"
      },
      {
        type: 'improvement',
        "description": "Convert 9 more format routing blocks to withNativeThenUADE"
      },
      {
        type: 'feature',
        "description": "Add SoundMon/MusicMaker native parser tests; convert mm4/mm8 to withNativeThenUADE"
      },
      {
        type: 'improvement',
        "description": "Convert 5 inline native-parser blocks to withNativeThenUADE with injectUADE"
      },
      {
        type: 'fix',
        "description": "Fix injectUADE: bypass 0-notes check for stub parsers; add injectUADE to 6 formats"
      },
      {
        type: 'fix',
        "description": "Fix format parser tests: correct wrong parsers for .ntp, .rho, .psa, .sg files"
      }
    ]
  },
  {
    version: '2026-03-14',
    date: '2026-03-14',
    changes: [
      {
        type: 'fix',
        "description": "Fix .digi routing: fall back to OpenMPT for old DigiBooster 1.x text-header format"
      },
      {
        type: 'feature',
        "description": "Furnace WASM stub: implement DivSample::render() for BRR encoding (SNES)"
      },
      {
        type: 'improvement',
        "description": "Furnace WASM: call render() on all PCM samples before renderSamples(); SoundFactory: enable native+UADE injection"
      },
      {
        type: 'fix',
        "description": "DeltaMusic1: simplify synth instrument to first-segment snapshot; withFallback: add injectUADE option; Furnace: fix BRR/ADPCM sample depth byte counts"
      },
      {
        type: 'feature',
        "description": "Add MED magic-based routing; cover med.sadman and ballade.ems in tests"
      },
      {
        type: 'improvement',
        "description": "Update format status dashboard"
      },
      {
        type: 'improvement',
        "description": "DeltaMusic1: pre-render full sound table sequence for synth instruments"
      },
      {
        type: 'fix',
        "description": "Remove MAMEMultiPCM synth; fix ZSG-2 ROM config size"
      },
      {
        type: 'fix',
        "description": "Remove unused uadePatternLayout from parsers; misc synth fixes"
      },
      {
        type: 'fix',
        "description": "Add .hip routing to JochenHippelSTParser; fix PC-relative LEA off-by-2"
      },
      {
        type: 'improvement',
        "description": "Update generated changelog"
      },
      {
        type: 'feature',
        "description": "Add 10 vintage drum machine themes: TR-606 through Sequential Tom"
      },
      {
        type: 'improvement',
        "description": "Furnace: notify dispatch on wavetable change for PCE/Namco platforms"
      },
      {
        type: 'fix',
        "description": "Gearmulator: auto-load ROMs from disk, fix synthType routing and Tone.js context"
      },
      {
        type: 'feature',
        "description": "Add GlueMon and DavidHanney native format parsers"
      },
      {
        type: 'improvement',
        "description": "Auto-switch to tracker view when loading custom-editor formats"
      },
      {
        type: 'improvement',
        "description": "Refactor MAME PCM/wavetable chip hardware UI to pure React"
      },
      {
        type: 'fix',
        "description": "Fix Symphonie Pro instrument names showing full Amiga paths"
      },
      {
        type: 'feature',
        "description": "Add Wurlitzer Side Man (1959) theme — warm wood/amber 50s hi-fi palette"
      },
      {
        type: 'fix',
        "description": "Fix persistence hook running twice on HMR remount, wiping DSP effects"
      },
      {
        type: 'feature',
        "description": "Add 9 MAME PCM/sampler chip synths with hardware UIs and presets"
      },
      {
        type: 'feature',
        "description": "Add comprehensive format parser regression suite: 108 tests covering 90+ formats"
      },
      {
        type: 'fix',
        "description": "Fix TrackerGLRenderer channel content centering for effect columns"
      },
      {
        type: 'improvement',
        "description": "Ignore !TODO.TXT (contains private notes, must not be committed)"
      },
      {
        type: 'feature',
        "description": "Add CHIP_SYNTH_DEFS for new MAME PCM synths (CMI, FZ, PS1, MultiPCM, ZSG2, KS0164, SWP00/20, RolandGP)"
      },
      {
        type: 'feature',
        "description": "Add MAME PCM synths: FZ-1, PS1 SPU, MultiPCM, ZSG2, KS0164, SWP00, SWP20, Roland GP"
      },
      {
        type: 'fix',
        "description": "Fix pattern-wrap pauses: UADE immediate updates, resolveSongRow cache, memo headers"
      },
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
