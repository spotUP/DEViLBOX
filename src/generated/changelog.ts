/**
 * Auto-generated changelog from git commits
 * Generated: 2026-04-21T13:19:25.543Z
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
export const BUILD_VERSION = '1.0.6005';
export const BUILD_NUMBER = '6005';
export const BUILD_HASH = '74ec3c310';
export const BUILD_DATE = '2026-04-21';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.6005',
    date: '2026-04-21',
    changes: [
      {
        type: 'feature',
        "description": "Extended Zxx encoding + global/hold → automation curves + 27-move picker"
      },
      {
        type: 'feature',
        "description": "SoundTouch WASM key-lock + dub fullscreen + export peak-limit"
      },
      {
        type: 'feature',
        "description": "Any-instrument promotion — bass/perc below dominance threshold"
      },
      {
        type: 'feature',
        "description": "DubRecorder writes Zxx cells inline + source=lane replay guard"
      },
      {
        type: 'improvement',
        "description": "Test(ui-smoke): flow 13 — role classification from real Modland dub MOD"
      },
      {
        type: 'improvement',
        "description": "Global FX lane chapter section + Zxx 36/37/38 correction"
      },
      {
        type: 'feature',
        "description": "Global FX lane — pattern-editor row above channels"
      },
      {
        type: 'feature',
        "description": "Runtime channel-tap role classifier — Phase 1"
      },
      {
        type: 'feature',
        "description": "Global (pattern-level) automation lane engine support"
      },
      {
        type: 'fix',
        "description": "Chore(dj): DUB 3/4 tab Nch suffix + scratch-action regression tests"
      },
      {
        type: 'feature',
        "description": "Expose dub.* as picker params — draw curves, edit, save"
      },
      {
        type: 'fix',
        "description": "Move Zxx effect commands off effTyp 33 — fine-porta collision"
      },
      {
        type: 'feature',
        "description": "Spectral sample classifier — instrument role from raw PCM"
      },
      {
        type: 'fix',
        "description": "Dub bus always starts off, even after persisted state"
      },
      {
        type: 'improvement',
        "description": "Dub Bus, Auto Dub & Auto-Name Channels chapter"
      },
      {
        type: 'improvement',
        "description": "Tune(dj): Auto-DJ deferral — proportional cap, short-fade skip, tighter chord window"
      },
      {
        type: 'feature',
        "description": "Zxx dub effect commands — inline dub moves in tracker cells"
      },
      {
        type: 'feature',
        "description": "Save Auto Dub + DubBusSettings so dubs survive reload"
      },
      {
        type: 'feature',
        "description": "Pattern-data awareness — look-ahead, density bias, rename boost, break deferral"
      },
      {
        type: 'feature',
        "description": "Per-session move blacklist"
      },
      {
        type: 'feature',
        "description": "Smart Cuts UI toggle in DJAutoDJPanel"
      },
      {
        type: 'feature',
        "description": "DubBusPanel — collapsible power-user section groups"
      },
      {
        type: 'feature',
        "description": "Smart Cuts wired end-to-end — drum-break cut, harmonic bass-swap, chord-change defer"
      },
      {
        type: 'improvement',
        "description": "Test(ui-smoke): flow 12 — Auto Dub CI regression lock"
      },
      {
        type: 'feature',
        "description": "DUB 4 reflects armed fx-target channels in pad sublabels"
      },
      {
        type: 'feature',
        "description": "Persona audition button — hear the character without enabling"
      },
      {
        type: 'fix',
        "description": "AutoDub polish — biquad stability + voice preset separation"
      },
      {
        type: 'feature',
        "description": "Auto-Name Channels + Auto Dub tuning fixes"
      },
      {
        type: 'feature',
        "description": "Full UI coverage — all 27 moves + all bus settings"
      },
      {
        type: 'feature',
        "description": "Per-channel EQ + filter via fxRouteGain + Tone.js chains"
      },
      {
        type: 'feature',
        "description": "Per-deck channel taps — audio layer for fxTargetChannels"
      },
      {
        type: 'feature',
        "description": "Per-channel FX targeting — MUTE/FX mode on scopes, per-channel DUB pads"
      },
      {
        type: 'feature',
        "description": "DUB 2 tab — 8 more dub moves on the deck FX pads"
      },
      {
        type: 'feature',
        "description": "Expose all ~12 bus-panel settings that were engine-only"
      },
      {
        type: 'fix',
        "description": "Test(sweep): DUB_PLATE_STAGE env + fix leak-check bus-disable gap"
      },
      {
        type: 'improvement',
        "description": "Test(dub): source-contract lockdown for plate-stage wiring invariants"
      },
      {
        type: 'feature',
        "description": "Expose plate-stage in DubBusPanel + engage from drumpad kits"
      },
      {
        type: 'feature',
        "description": "Auto Dub — autonomous performer with 5 persona voicings"
      },
      {
        type: 'feature',
        "description": "Optional plate-stage insert — Mad Professor / Dattorro on the bus"
      },
      {
        type: 'improvement',
        "description": "Test(ui-smoke): flow 10 — dub automation routing end-to-end"
      },
      {
        type: 'improvement',
        "description": "Test(dub): CC sweep — every dub.* move verified end-to-end via routeParameterToEngine"
      },
      {
        type: 'fix',
        "description": "Register DubBus with router at engine creation (not per-view)"
      },
      {
        type: 'feature',
        "description": "Test(dub): lock bassLock preset round-trip through addMasterEffectConfig"
      }
    ]
  },
  {
    version: '2026-04-20',
    date: '2026-04-20',
    changes: [
      {
        type: 'fix',
        "description": "ReverseEcho first-fire race — pre-warm capture + retry on empty ring"
      },
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
