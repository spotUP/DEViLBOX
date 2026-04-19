/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-18T19:48:42.870Z
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
export const BUILD_VERSION = '1.0.5750';
export const BUILD_NUMBER = '5750';
export const BUILD_HASH = 'f02aa07d5';
export const BUILD_DATE = '2026-04-18';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5750',
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
      },
      {
        type: 'fix',
        "description": "No retry-storm on persistent fails + skip 0-byte stub decode"
      },
      {
        type: 'feature',
        "description": "Analyze button always visible; supports force re-scan"
      },
      {
        type: 'fix',
        "description": "BPM-only gate + retry analysisSkipped on explicit click"
      },
      {
        type: 'fix',
        "description": ".fred files need prefix-form filename for UADE"
      },
      {
        type: 'improvement',
        "description": "Scope scroll-restore anchor to playlist id"
      },
      {
        type: 'feature',
        "description": "Dub bus + performance-throw actions overhaul"
      },
      {
        type: 'feature',
        "description": "Scroll-restore to last-played track on modal open"
      },
      {
        type: 'fix',
        "description": "Mouse drag animates when paramKey is set"
      },
      {
        type: 'fix',
        "description": "Apply per-song FX live from dropdown + during Auto DJ"
      },
      {
        type: 'fix',
        "description": "Don't auto-save per-song FX chains into playlist.masterEffects"
      },
      {
        type: 'fix',
        "description": "Per-song FX stops leaking across playlist tracks"
      },
      {
        type: 'fix',
        "description": "Stop native text-range selection from hijacking shift-click"
      },
      {
        type: 'feature',
        "description": "Explicit \"None\" option in per-song FX dropdown"
      },
      {
        type: 'fix',
        "description": "Stop sanitizing TFMX companion filenames"
      },
      {
        type: 'fix',
        "description": "Per-song FX dropdown now lists the full master FX library"
      },
      {
        type: 'feature',
        "description": "FX preset button shows the currently active preset"
      },
      {
        type: 'fix',
        "description": "TFMX companion files now reach the playlist render worker"
      },
      {
        type: 'fix',
        "description": "Closing playlist modal / Modland browser no longer stops deck audio"
      },
      {
        type: 'feature',
        "description": "Smooth crossfade when applying deck EQ presets"
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
