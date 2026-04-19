/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-19T16:43:23.354Z
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
export const BUILD_VERSION = '1.0.5769';
export const BUILD_NUMBER = '5769';
export const BUILD_HASH = '273ba91e4';
export const BUILD_DATE = '2026-04-19';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5769',
    date: '2026-04-19',
    changes: [
      {
        type: 'feature',
        "description": "Route synth pads through the dub bus via pad.dubSend"
      },
      {
        type: 'fix',
        "description": "Close DubBusPanel on click outside / Esc"
      },
      {
        type: 'improvement',
        "description": "Drop transition re-exports, migrate importers to @/types/dub"
      },
      {
        type: 'improvement',
        "description": "Move DubBusPanel to src/components/dub/"
      },
      {
        type: 'improvement',
        "description": "Extract DubBus from DrumPadEngine"
      },
      {
        type: 'feature',
        "description": "Test(dub): add pure-function regression floor for DubActions"
      },
      {
        type: 'improvement',
        "description": "Move DubActions to src/engine/dub/"
      },
      {
        type: 'improvement',
        "description": "Move DubSirenSynth to src/engine/dub/"
      },
      {
        type: 'improvement',
        "description": "Extract dub types to src/types/dub.ts"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog"
      },
      {
        type: 'improvement',
        "description": "Chore: ignore .superpowers/ and drop tracked scheduler lockfile"
      },
      {
        type: 'feature',
        "description": "PAD master knob + Kill FX button in the manager header"
      },
      {
        type: 'feature',
        "description": "Mark tracks as played across view switches"
      },
      {
        type: 'feature',
        "description": "Auto DJ warns when playlist has missing analysis data"
      },
      {
        type: 'fix',
        "description": "Route XM/IT/S3M/modern-MOD analysis through the local pipeline"
      },
      {
        type: 'feature',
        "description": "Rewrite auto-gain — target -6 dB RMS, +9 dB fallback, no peak clamp"
      },
      {
        type: 'feature',
        "description": "Master volume ceiling 1.5 → 2.0, tighter limiter (-0.3 dBFS, hard knee)"
      },
      {
        type: 'improvement',
        "description": "Chore(settings): remove half-wired customBannerImage feature"
      },
      {
        type: 'improvement',
        "description": "Chore(drumpad): remove dead ConfirmDialog component"
      }
    ]
  },
  {
    version: '2026-04-18',
    date: '2026-04-18',
    changes: [
      {
        type: 'fix',
        "description": "Auto DJ never picks a hard 'cut' transition mid-set"
      },
      {
        type: 'fix',
        "description": "Master bus defaults to -6 dB so pads don't eat the DJ mix"
      },
      {
        type: 'fix',
        "description": "Persisted cue device is restored to the cue engine on DJ view mount"
      },
      {
        type: 'fix',
        "description": "Drop deckTapAmount 1.0 → 0.6 on the main dub kits"
      },
      {
        type: 'feature',
        "description": "Modland preview routes to the cue bus (headphones only)"
      },
      {
        type: 'feature',
        "description": "Add \"Analyze track\" to the playlist row context menu"
      },
      {
        type: 'feature',
        "description": "Modland preview plays via UADE directly — no render wait"
      },
      {
        type: 'feature',
        "description": "Rebuild One-Shots Live Bank B for reggae/dub gigs"
      },
      {
        type: 'feature',
        "description": "Persist loudness + auto-gain manual loads"
      },
      {
        type: 'fix',
        "description": "Dub bus sits under the mix — sirens/echoes no longer clobber decks"
      },
      {
        type: 'fix',
        "description": "Dub effects release crisply — mini-drain on last pad release"
      },
      {
        type: 'fix',
        "description": "Kill the dub-bus pink-noise floor that was producing white noise"
      },
      {
        type: 'feature',
        "description": "Animate pad buttons on external triggers (MIDI/keyboard)"
      },
      {
        type: 'fix',
        "description": "Drum-pad controller triggers pads in every view"
      },
      {
        type: 'fix',
        "description": "ESC triggers djPanic in every non-tracker view"
      },
      {
        type: 'fix',
        "description": "Dub panic actually zeros echo feedback + emergency kill hook"
      },
      {
        type: 'fix',
        "description": "30s auto-release watchdog for stuck dub actions"
      },
      {
        type: 'fix',
        "description": "DjPanic directly calls dubPanic + resets store"
      },
      {
        type: 'fix',
        "description": "Crossfader no longer stalls at 0 for a full bar mid-transition"
      },
      {
        type: 'feature',
        "description": "Eight sound-system / dub flavour presets"
      },
      {
        type: 'improvement',
        "description": "Wrap tag filter pills instead of sideways scroll"
      },
      {
        type: 'feature',
        "description": "Beef up the deck-overview playhead so it's easy to spot"
      },
      {
        type: 'feature',
        "description": "Add dub sub-category tag filters"
      },
      {
        type: 'improvement',
        "description": "Swap ⋯ dropdown icon for a hamburger (≡)"
      },
      {
        type: 'fix',
        "description": "Analyzer 404 auto-fix no longer poisons downstream work"
      },
      {
        type: 'feature',
        "description": "\"Retry failed analyses\" menu option"
      },
      {
        type: 'fix',
        "description": "Stop spamming 404s for .nt companions on plain MODs"
      },
      {
        type: 'fix',
        "description": "Compact format badge — Protracker→MOD etc"
      },
      {
        type: 'fix',
        "description": "Round BPM in list rows so decimals don't overflow"
      },
      {
        type: 'fix',
        "description": "Harden analyzePlaylist against mid-run playlist edits + hangs"
      },
      {
        type: 'fix',
        "description": "Route SIDs through local pipeline, not server UADE"
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
