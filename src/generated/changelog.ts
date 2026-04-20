/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-19T18:50:12.258Z
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
export const BUILD_VERSION = '1.0.5802';
export const BUILD_NUMBER = '5802';
export const BUILD_HASH = 'bc5eecac4';
export const BUILD_DATE = '2026-04-19';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.5802',
    date: '2026-04-19',
    changes: [
      {
        type: 'fix',
        "description": "Ensure DrumPadEngine exists on tracker-view mount"
      },
      {
        type: 'fix',
        "description": "More distinct click-flash + fire setFlashedChannel on click"
      },
      {
        type: 'improvement',
        "description": "Re-apply SidMon1Replayer migration"
      },
      {
        type: 'fix',
        "description": "Replace 'selected channel' highlight with click-flash feedback"
      },
      {
        type: 'feature',
        "description": "DJ-only 180 Hz HPF on deck taps (always kick-dodge for DJ)"
      },
      {
        type: 'improvement',
        "description": "Tweak(dub): lower default HPF cutoff 180 → 40 Hz"
      },
      {
        type: 'fix',
        "description": "Auto-apply default dubSend on tracker channels when bus enables"
      },
      {
        type: 'feature',
        "description": "Bind W to Echo Throw on the selected tracker channel"
      },
      {
        type: 'feature',
        "description": "DubDeckStrip + DubLaneTimeline rendered in TrackerView"
      },
      {
        type: 'improvement',
        "description": "Revert(engine): back out SidMon1Replayer migration, silence regression"
      },
      {
        type: 'feature',
        "description": "DubLanePlayer + wire into transport setCurrentRow"
      },
      {
        type: 'feature',
        "description": "DubRecorder + useTrackerStore.setPatternDubLane action"
      },
      {
        type: 'improvement',
        "description": "Rename DubEvent.beat → row (tracker-native)"
      },
      {
        type: 'feature',
        "description": "DubRouter — single fire() entry for all dub moves"
      },
      {
        type: 'feature',
        "description": "Echo Throw move — first tracker-dub move"
      },
      {
        type: 'improvement',
        "description": "Extract WASMSingletonBase, migrate 6 reference engines"
      },
      {
        type: 'feature',
        "description": "Tracker channel dubSend tap + DubBus openChannelTap/modulateFeedback"
      },
      {
        type: 'feature',
        "description": "UseDubStore — armed flag + rAF-batched write helper"
      },
      {
        type: 'improvement',
        "description": "Chore(persistence): bump SCHEMA_VERSION 19→20 for Pattern.dubLane"
      },
      {
        type: 'feature',
        "description": "Optional dubLane field on Pattern"
      },
      {
        type: 'feature',
        "description": "Add DubEvent, DubLane, QuantizeMode types for Phase 1"
      },
      {
        type: 'improvement',
        "description": "Chore: regenerate changelog"
      },
      {
        type: 'improvement',
        "description": "Chore(dj): remove SID playlist auto-repair — was spamming console for days"
      },
      {
        type: 'fix',
        "description": "Loading a sample clears any prior synth config"
      },
      {
        type: 'feature',
        "description": "Drag-and-drop audio files directly onto pads"
      },
      {
        type: 'fix',
        "description": "One friendly warn per broken instrument, not two stack-traces"
      },
      {
        type: 'fix',
        "description": "Cap bridge reconnect attempts at 5"
      },
      {
        type: 'improvement',
        "description": "Chore(dev): default local API port 3001 → 3011"
      },
      {
        type: 'feature',
        "description": "Auto-apply sound system on first bus enable"
      },
      {
        type: 'fix',
        "description": "Abort mini-drain when a new synth-pad tap attaches"
      },
      {
        type: 'fix',
        "description": "Scale mini-drain window to echo rate so buffer fully flushes"
      },
      {
        type: 'fix',
        "description": "Mini-drain bus when last synth-pad tap detaches"
      },
      {
        type: 'fix',
        "description": "Fade out synth-pad dub-bus tap on release so tails can decay"
      },
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
