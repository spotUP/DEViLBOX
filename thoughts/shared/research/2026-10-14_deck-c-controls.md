---
date: 2026-10-14
topic: Deck C (scratch deck) control census and proposed layout
tags: [dj, deck-c, scratch, ui, DECK-C-UNUSED-CONTROLS]
status: draft
---

# Deck C controls: census, usage, proposal

Ledger item DECK-C-UNUSED-CONTROLS (thoughts/spot/todos.md:528). Code read only, nothing run in the browser.
Counts are rendered controls with a trackless deck C in audio mode; stem and loop controls vary with state.

## What deck C actually is (the decisive finding)

Two unrelated things share the name "Deck C":

1. `DeckEngine('C')` (src/engine/dj/DJEngine.ts:97) - a full third track deck on mixer `inputC`. Only a human feeds it (drop a file, browser "load to Deck C", playlist, DJModlandBrowser:664). The Auto DJ never loads it: `idleDeck` is only A/B (DJAutoDJ.ts:121,230-236), `ScratchExecutor` decks are typed `AB` (autoScratchRuntime.ts:34).
2. The scratch bus: `ScratchVoicePool` renders strokes into `createDeckCBus` and sums them on the mixer `samplerInput`, bypassing `inputC` and the crossfader (scratchVoicePool.ts:13, :140). DJScratchDJ -> `prepareRecords` (DJAutoDJ.ts:1803) -> voice pool -> `deckCMotion`. Nothing on this path touches `DeckEngine('C')`, `decks.C` playback fields, or any panel control.

What deck C's UI reads from the scratch path is display only: platter angle (`deckCMotion`, DeckTurntable.tsx:121, DeckCssTurntable.tsx:126), the Scratch Fader and Slip lanes (DeckCScratchLanes.tsx), and `decks.C.effectiveBPM`, written by `followSetTempo` from the master deck while deck C has no `fileName` (useDJStore.ts:985-997). A stroke on deck C reads `decks.C.effectiveBPM` (that comment).

So every control that acts on `DeckEngine('C')` (play, cue, pitch, loops, EQ, stems, FX, dub, beat jump) is inert for the scratch deck unless a human also loads a track onto it. Verified by routing in code; not measured with an audio probe.

## Census and classification

Classes: AUTO = USED-BY-AUTO, HAND = USED-BY-HAND, NONE = NO-EFFECT-ON-DECK-C, UNK = UNKNOWN.

| # | Control (file:line) | n | Class | Why |
|---|---|---|---|---|
| 1 | Deck label "Deck 3" (DJDeck.tsx:402) | 1 | AUTO | display |
| 2 | Scratch Fader lane, Slip lane (DeckCScratchLanes.tsx:41,47) | 2 | AUTO | `deckCMotion`, the stroke's own render |
| 3 | Platter / turntable display (DeckTurntable.tsx:121, DeckCssTurntable.tsx:126) | 1 | AUTO | follows strokes |
| 4 | BPM readout (DeckTrackInfo.tsx) | 1 | AUTO | `followSetTempo`, scratch stroke tempo |
| 5 | WAV drop on deck = scratch phrase (DJDeck.tsx:301-304) | 1 | HAND | `loadDeckCPhrase` -> `scratchPhrase` |
| 6 | Pitch slider + repitch lock (DeckPitchSlider.tsx:151,163) | 2 | UNK | moves `DeckEngine('C')` rate and maybe `decks.C.effectiveBPM`, which strokes read; whether `followSetTempo` overwrites it was not traced |
| 7 | Sync (DeckTransport.tsx:105) | 1 | UNK | same tempo field; not traced |
| 8 | Scratch tab: 19 gesture pads (DeckScratch.tsx:123-148, DJScratchEngine.ts:83) | 19 | UNK | pads take the `playDeckPattern('C')` branch (DjFxActions.ts:1832-1846) = scratch the track loaded on `DeckEngine('C')`; record strokes only when `opts.record`/CRATE. Behaviour with no track not read (`DeckEngine.playPattern` not opened). No record selector exists on the deck |
| 9 | Scope canvases click = mute/FX target, All, mode (DeckScopes.tsx:258,269,279) | 3 | NONE | `DeckEngine('C')` channels; scratch bus has none |
| 10 | Track info: name, key, genre, NRG (DeckTrackInfo.tsx:145,186,215,226) | 3 | NONE | "No track loaded" |
| 11 | Platter drag (DeckTurntable.tsx:281, DeckCssTurntable.tsx:292) | 1 | NONE | `TurntablePhysics` on a loaded track; HAND if a track is loaded |
| 12 | Track overview seek + beat grid (DeckTrackOverview.tsx:246, DeckBeatGrid) | 2 | NONE | no track |
| 13 | Visualizer prev / next / random / slideshow / fullscreen (DeckVisualizer.tsx:323-355) | 5 | NONE | gated on `hasFileLoaded` |
| 14 | Pattern display (DeckPatternDisplay.tsx:210) | 1 | NONE | gated on `hasFileLoaded` |
| 15 | Play / Cue / Key Lock (DeckTransport.tsx:67,88,124) | 3 | NONE | `DeckEngine('C')` playback; scratch bus plays independent of it |
| 16 | Nudge slower / faster (DeckNudge.tsx:46,64) | 2 | NONE | |
| 17 | Pads tab, FX page: High Pass, Low Pass, Filter reset, Echo out, Kill x3, Brake, Spinback, Rewind (DeckFXPads.tsx:48-57) | 10 | NONE | deck-targeted FX on `DeckEngine('C')` |
| 18 | Pads tab, Beat Jump page (DeckFXPads.tsx:154-161) | 8 | NONE | |
| 19 | Pads tab, Dub / Dub 2 / Dub 3 / Dub 4 pages (DeckFXPads.tsx:66-150) | 27 | NONE | dub sends tap `inputC` (DubActions.ts:469,504); scratch bus is not on it. Routing read, not measured |
| 20 | Pads tab page switcher FX / Beat Jump / Dub 1-4 (DeckFXPads.tsx:360-365) | 6 | NONE | |
| 21 | Scratch tab: Fader LFO Off, 1/4, 1/8, 1/16, 1/32 (DeckScratch.tsx:187-220) | 5 | NONE | `DeckEngine('C').startFaderLFO` on its own channel, not the scratch bus |
| 22 | Loop & Cue: loop toggle, IN, OUT, Clear, auto-loop 1/2/4/8 bars, slip (DeckLoopControls.tsx:184-302) | 9 | NONE | track loops. Tracker mode shows 6 row-loop sizes instead of the 4 auto-loop bars |
| 23 | Loop & Cue: hot cues (DeckCuePoints.tsx:9) | 0 | NONE | not rendered while trackless (returns null) |
| 24 | Loop & Cue: Quantize (DeckQuantize.tsx:37) | 1 | NONE | |
| 25 | Mix tab: Quick EQ presets (DeckQuickEQ.tsx, 8 in djEqPresets.ts) | 8 | NONE | |
| 26 | Mix tab: stems, Separate, stem mode, per stem volume/mute/solo/dub send + 4 dub ops (DeckStemControls.tsx:240,264,306-360) | ~34 | NONE | needs a track |
| 27 | Panel tab strip Pads / Scratch / Loop & Cue / Mix (DeckPanelTabs.tsx:32) | 4 | structural | follows what stays |

Totals: AUTO 4, HAND 1, UNK 22 (19 pads, pitch, repitch lock, Sync), NONE ~128 (approximate; stems and loop sizes vary), plus the 4 structural tabs.

Not on the deck but part of the scratch workflow: the crate record selector and scratch routines live in the Auto DJ / crate panels (DJCratePanel, DJAutoDJPanel), and deck C's channel strip volume is in DJMixer (crossfader is A/B only, "Deck C is thru", DJMixer.tsx:89). Not censused here.

## Proposed deck C layout (owner decides)

Premise: deck C is the scratch deck; a human wanting a third track deck uses A/B or a separate decision.

Stays:
- Deck label, BPM readout (follows master).
- Platter (turntable) display, driven by the strokes.
- DeckCScratchLanes (Scratch Fader, Slip).
- Drop target for a WAV phrase (DJDeck.tsx:301), with a visible hint "Drop a WAV: scratch phrase".
- Scratch tab content, once the 19 pads are resolved (see open question): pads that fire crate record strokes stay; Fader LFO row goes.
- Channel volume (in the mixer strip).

Goes (NO-EFFECT): scopes row, track info (name/key/genre/NRG), track overview, beat grid, visualizer buttons, pattern display, Play/Cue/Key Lock, Nudge, whole Pads tab (FX, Beat Jump, Dub 1-4), Fader LFO, whole Loop & Cue tab, whole Mix tab. Also the panel tab strip, since only one panel remains.

Needs the owner's call first (UNK):
- Pitch slider, repitch lock, Sync: remove unless strokes should follow a hand tempo on deck C; today `followSetTempo` sets the tempo from the master. Trace needed: does a user pitch change on C survive `followSetTempo`?
- 19 scratch pads: decide whether they should scratch a record from the crate (needs a record selector, which does not exist on the deck) or the `DeckEngine('C')` track (what they do now, per DjFxActions.ts:1832). Not verified what they do with no track: open `DeckEngine.playPattern`.
- Whether a human may load a real track onto deck C at all. If yes, the removals need to reappear when `decks.C.fileName` is set (conditional layout); if no, block the load (DJModlandBrowser:664, playlist, file browser) and remove the third-deck track path.

Recommended: scratch deck = scratch-only UI (list above), track controls appear only when a track is loaded on C. Cost: one conditional in DJDeck.tsx (`deckId === 'C' && !fileName`); no engine change.
