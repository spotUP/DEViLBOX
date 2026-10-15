/**
 * Auto-generated changelog from git commits
 * Generated: 2026-10-13T17:42:47.668Z
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
export const BUILD_VERSION = '1.0.8523';
export const BUILD_NUMBER = '8523';
export const BUILD_HASH = '3396f4d4b';
export const BUILD_DATE = '2026-10-13';

// Full version (patch IS the build number, so no need to append)
export const FULL_VERSION = BUILD_VERSION;

// Auto-generated changelog
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.8523',
    date: '2026-10-13',
    changes: [
      {
        type: 'improvement',
        "description": "Plan nuade engine: NS-0..NS-11 ticked with commit b4372a2d2 (27 of 159)"
      },
      {
        type: 'improvement',
        "description": "NS-0..NS-11: nuade registry descriptor, fields, table, resolver, settings v14, withNuade, switchFormatEngine, selector, Settings tab, MCP"
      },
      {
        type: 'improvement',
        "description": "NE-3, NE-5, NE-6, NE-7, NE-8, NE-9, NE-10: NuadeEngine on the real worklet"
      },
      {
        type: 'improvement',
        "description": "NE-4: extract tickGridFollow from EaglePlayerEngine; both engines use it"
      },
      {
        type: 'improvement',
        "description": "Track third-party/nuade/docs (docs/ was gitignored; nuadeVendored test reads docs/players.md)"
      },
      {
        type: 'improvement',
        "description": "NE-2: Nuade.worklet.js (render loop, per-voice buffers to channel outputs, mute mask, pause, stop rewind)"
      },
      {
        type: 'improvement',
        "description": "NE-1: nuade worklet protocol types and one validator; nuade tests join test:ci"
      },
      {
        type: 'improvement',
        "description": "NV-5: nuade.yml rebuilds Nuade.wasm from committed sources and fails on stale artifacts"
      },
      {
        type: 'improvement',
        "description": "NV-2, NV-3, NV-4: nuade-wasm build, C shim with edit-slot probe, committed Nuade.{js,wasm} (1.75 MB)"
      },
      {
        type: 'improvement',
        "description": "NV-1: vendor emoon/nuade at 4900e597e (pristine, MIT) with UPSTREAM.md and update.sh"
      },
      {
        type: 'improvement',
        "description": "Record owner decisions DN-1..DN-3 in the nuade engine plan; plan final"
      },
      {
        type: 'feature',
        "description": "Add plan: nuade as one WASM engine replacing UADE playback per format, with a per-format engine selector and dual-engine A/B"
      },
      {
        type: 'feature',
        "description": "Add research: what emoon's nuade gives DEViLBOX, per format"
      },
      {
        type: 'feature',
        "description": "Add session handoff: scratch full port, SID deck audit, app idle CPU"
      },
      {
        type: 'improvement',
        "description": "Ledger and handoff after the last-rows run (78 of 81; R6, R12, D2 open; three owner reports)"
      },
      {
        type: 'fix',
        "description": "The planned scratch level measures the decks as they are heard (trim and channel fader), and a new DJ engine gets a new scratch pool"
      },
      {
        type: 'fix',
        "description": "Deck C follows the set's master clock instead of showing the store's 125 BPM default"
      },
      {
        type: 'feature',
        "description": "The Three Deck Showcase plays the demo's whole three-deck render while the set holds (J1-J10, X8, D1, D3-D6)"
      },
      {
        type: 'improvement',
        "description": "Record the Three Deck Showcase and vocalstab port decisions in the scratch full-port ledger"
      },
      {
        type: 'improvement',
        "description": "Ledger and handoff after the final-phases run (62 of 81: X7, R5; PG-I engine built, D1 partial)"
      },
      {
        type: 'feature',
        "description": "Deck C's platter, crossfader and slip follow the Auto Scratch strokes from the same render (D1)"
      },
      {
        type: 'feature',
        "description": "A phrase WAV dropped on Deck C is its scratch phrase with the demo's word cues (R5)"
      },
      {
        type: 'feature',
        "description": "A module deck's routine duck and level come from its rendered-ahead audio (X7)"
      },
      {
        type: 'feature',
        "description": "The demo's beat-juggle engine and the three-deck A/B layer, with its drum voices and records (PG-I J1-J10 engine)"
      },
      {
        type: 'improvement',
        "description": "One gate stops every picture loop and the idle effect worklets while the app is silent; the hidden DJ view stops drawing"
      },
      {
        type: 'fix',
        "description": "A pressed Juggle Now skips the random intensity wobble; the Auto DJ's own juggles keep it"
      },
      {
        type: 'improvement',
        "description": "Record R5, X7, X8, Juggle Now and PG-K decisions in the scratch full-port ledger"
      },
      {
        type: 'improvement',
        "description": "Handoff after the Render mode, C15, PG-K and PG-G run (60 of 81)"
      },
      {
        type: 'feature',
        "description": "The demo's bank analyzer and phrase auto-cue; a tracker sample is analysed at load (PG-G: R3, R5)"
      },
      {
        type: 'feature',
        "description": "The demo's model and fader options - cartridge response, grip states, needle skip, fader curve flip, contact bounce, lag, left deck (PG-K: T6, T8, T10, F5, F6)"
      },
      {
        type: 'fix',
        "description": "A rendered channel array keeps its AudioBuffer alive (the scratch null NaN flake)"
      },
      {
        type: 'feature',
        "description": "Auto Scratch Render mode (section / three_deck / dj_routine, default three_deck) and the two-hands rule (S2, C15)"
      },
      {
        type: 'fix',
        "description": "Test(juggle): Juggle Now's opening test pins the wall clock - it failed one run in three (fixture fix, no code change)"
      },
      {
        type: 'feature',
        "description": "Auto Scratch picks records with the demo's record_set selector, and plays the demo's statement-and-chop (R8, C16)"
      },
      {
        type: 'fix',
        "description": "Every channel up to 16 has a mute stem, stored as one channel and its pan (SID-FOLLOWUP-2 a)"
      },
      {
        type: 'improvement',
        "description": "Build(dj): libopenmpt 0.8.4 with per-channel taps for the DJ render worker (SID-FOLLOWUP-2 d)"
      },
      {
        type: 'improvement',
        "description": "Record Render mode decision, pending R8/C16 commit and the Dark preset flake in the scratch ledger"
      },
      {
        type: 'fix',
        "description": "The track end and the render cut-off are no section boundaries - La Mer juggles (SID-FOLLOWUP-2 b)"
      },
      {
        type: 'feature',
        "description": "The demo's scratch macro language plays from the registry (G11)"
      },
      {
        type: 'fix',
        "description": "Every SID Settings control reaches the engines - clock, ASID, voice mask, buffer size (SID-FOLLOWUP-2 c)"
      },
      {
        type: 'fix',
        "description": "The gesture ladder is the demo's GESTURE_LEVELS (P12)"
      },
      {
        type: 'improvement',
        "description": "The scratch bus is the channel alone; the old voice bus's stages are deleted"
      },
      {
        type: 'feature',
        "description": "The demo's overlay plan plays whole in every mode; DEViLBOX extras only add on top (P13)"
      },
      {
        type: 'improvement',
        "description": "Test(ci): the affected-test selector's test runs in test:ci"
      },
      {
        type: 'fix',
        "description": "Test(dj): the deck VU fixture song has a note; the push gate selects tests that import a changed module"
      },
      {
        type: 'fix',
        "description": "A SID deck render plays the SID Settings chip model and clock, cached per setting (SID-FOLLOWUP-2 f)"
      },
      {
        type: 'improvement',
        "description": "Test(sid): the SID-DECK-AUDIT tests run in test:ci (SID-FOLLOWUP-2 e)"
      },
      {
        type: 'improvement',
        "description": "Record section-end decision and next scratch phase (P13) in the full-port ledger"
      }
    ]
  },
  {
    version: '2026-10-12',
    date: '2026-10-12',
    changes: [
      {
        type: 'fix',
        "description": "The UADE debugger panel uses the design-system tokens and components"
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
