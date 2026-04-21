/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-20T21:58:20.125Z
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
export const BUILD_VERSION = '1.0.5960';
export const BUILD_NUMBER = '5960';
export const BUILD_HASH = '8ae3247ff';
export const BUILD_DATE = '2026-04-20';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5960',
    date: '2026-04-20',
    changes: [
      {
        type: 'feature',
        "description": "Route dub.* curves through the shared dispatcher (#35)"
      },
      {
        type: 'feature',
        "description": "Default CC routes for all 27 dub moves + bus params (#37)"
      },
      {
        type: 'feature',
        "description": "DUB tab on deck FX pads — 8 dub-move sends per deck"
      },
      {
        type: 'feature',
        "description": "2 new dub kits tuned for Mad Professor + Dattorro plates"
      },
      {
        type: 'feature',
        "description": "8 dub presets using MadProfessor/Dattorro + channel preset selector"
      },
      {
        type: 'improvement',
        "description": "Test(dub): lock FLAT-move diagnostic logs with source contract"
      },
      {
        type: 'improvement',
        "description": "Chore(dub): diag logs on backwardReverb + reverseEcho (FLAT-move triage)"
      },
      {
        type: 'feature',
        "description": "Per-FX bassLock + editors for Mad Professor & Dattorro plates"
      },
      {
        type: 'feature',
        "description": "Report silent formats + track peak in baseline"
      },
      {
        type: 'feature',
        "description": "Dattorro Plate reverb — WASM port of el-visio/dattorro-verb (MIT)"
      },
      {
        type: 'feature',
        "description": "Gate format smoke test on peak audio level (distortion)"
      },
      {
        type: 'fix',
        "description": "Clear 5 broken detectFn entries in FORMAT_REGISTRY"
      },
      {
        type: 'feature',
        "description": "Mad Professor Plate — MVerb tuned to PCM-70 dub voicing"
      },
      {
        type: 'fix',
        "description": "Ramp master-insert envelope across rewire to kill the glitch (G15)"
      },
      {
        type: 'improvement',
        "description": "Test(dub): regression guard for bus tail-leak after stop + disable"
      },
      {
        type: 'fix',
        "description": "Clamp additive moves + softclip oscBass to prevent clipping"
      },
      {
        type: 'feature',
        "description": "Sidechain source selector — pick channel or bus (G13)"
      },
      {
        type: 'improvement',
        "description": "Test(sweep): cover all 27 dub moves + per-channel scan + ramp-up holds"
      },
      {
        type: 'fix',
        "description": "Auto-flip preset to 'custom' on character-field edit (G16)"
      },
      {
        type: 'improvement',
        "description": "Test(dub): unit coverage for 22 move files (G14)"
      },
      {
        type: 'fix',
        "description": "Echo rate follows BPM changes in tracker view (G12)"
      },
      {
        type: 'feature',
        "description": "A/B character-preset compare button (G11)"
      },
      {
        type: 'feature',
        "description": "Keyboard bindings for all 27 dub moves (G3)"
      },
      {
        type: 'fix',
        "description": "Chain-swap self-oscillation guard + TOAST in DJ view (#63)"
      },
      {
        type: 'fix',
        "description": "Retry dub-channel activation when isolation engine attaches late (G6)"
      },
      {
        type: 'improvement',
        "description": "Test(dub): .dbx file export preserves Pattern.dubLane (G4) (#61)"
      },
      {
        type: 'improvement',
        "description": "Test(dub): Pattern.dubLane round-trips through save → load (G5) (#60)"
      },
      {
        type: 'fix',
        "description": "Stamp libopenmptFileData in parseTrackerModule (#58)"
      },
      {
        type: 'improvement',
        "description": "Test(scratch): Tier-3 UI-smoke flow — jog-wheel scratch continuity (#57)"
      },
      {
        type: 'feature',
        "description": "Chore(sweep): add MODLAND_QUERY env-var to auto-load test song (#56)"
      },
      {
        type: 'improvement',
        "description": "Test(scratch): Tier-1 regression tests for DJ scratch — pattern registry + keyboard wiring (#55)"
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
