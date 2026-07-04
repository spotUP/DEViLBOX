---
date: 2026-04-21
topic: ui-coverage-audit-followups
tags: [ui-audit, dj, repitchlock, effect-columns, polish]
status: draft
---

# UI Coverage Audit — Follow-ups

## Task

Ran an app-wide audit for engine features that lack UI exposure. Shipped four
fixes, uncovered one real latent bug, and deferred one proper feature. Next
session needs to pick up the latent bug (Repitchlock is cosmetic) and decide
whether to tackle the effect-columns feature.

## Recent Changes — LANDED in main

All type-check clean on `npm run type-check`.

1. **SuperSaw +12 params** — `src/components/instruments/editors/VisualSynthEditorContent.tsx:817`
   Added spread curve, phase mode, analog drift, sub osc group (octave/wave/level),
   PWM group (width/rate/depth), filter key tracking, pitch envelope (amount/attack/decay).
   Everything in the `SuperSawConfig` interface is now editable.

2. **SpaceEcho mid band** — three files:
   - `src/engine/effects/SpaceEchoEffect.ts:222` — added `setMid()` method
   - `src/engine/tone/EffectParameterEngine.ts:259` — added `'mid' in changed` dispatch
   - `src/components/effects/editors/DelayVariantEditors.tsx:399` — added Mid knob between Bass and Treble

3. **Tracker per-channel dub send** — `src/components/tracker/ChannelContextMenu.tsx`
   Added "Dub Send" submenu (Off / 25% / 50% / 75% / Full) to both edit-mode and
   live-mode menus. Uses existing `useMixerStore.setChannelDubSend(channel, amount)`
   which was already fully wired to the ChannelRoutedEffects manager.

4. **DJ Filter Q knob** — three files:
   - `src/stores/useDJStore.ts` — added `setDeckFilterResonance` store setter
   - `src/engine/dj/DJActions.ts:setDeckFilterResonance` — action + engine bridge
   - `src/components/dj/MixerFilter.tsx` — second knob (Q, range 0.5–15, MIDI CC `dj.deckA.filterQ`/`dj.deckB.filterQ`)

## Recent Changes — ATTEMPTED and REVERTED

**DJ Repitchlock toggle button** — added a LOCK chip to `DeckPitchSlider.tsx`,
user reverted. The file is back to its original state. See Learnings for why.

## Learnings

### Four "audit gaps" turned out to be false positives

When pulling the next audit items, verify the claim BEFORE planning the fix.
My initial audit synthesis had four stale claims:

| Claim | Reality |
|---|---|
| Geonkick at ~20% coverage | `GeonkickControls.tsx` is 981 lines with 3 tabs, 9 oscillators, 82 presets across 7 bundles — fully covered |
| TB-303 missing 4 params | `duffingAmount`, `filterInputDrive`, `diodeCharacter`, `softAttack` are on MOJO/DEVILFISH tabs in `JC303StyledKnobPanel.tsx` — by design. Adding them to main panel breaks the iconic 303 layout |
| Furnace chip flags (`useNP`, `useYMFM`, `extMode`) missing UI | Flags exist in C++ WASM wrapper (per `memory/furnace_uninit_bool_pattern.md`) but NOT in TS `FurnaceConfig` (src/types/instrument/furnace.ts). Nothing to expose until someone propagates them to the TS layer |
| Sidechain source picker missing | Already fully wired on Compressor/Gate/Limiter at `FilterEffectEditors.tsx:486`, `DynamicsEditors.tsx:610,668`. Source selector is a `CustomSelect` with all tracker channels |

Next time: spend 2 min checking the actual file before planning the fix.

### Repitchlock is a stored-but-unread flag — THE REAL BUG

`src/stores/useDJStore.ts:59` declares `repitchLock: boolean` on `DeckState`.
`src/components/dj/DJKeyboardHandler.tsx:194-196` and `:288-289` toggle it on
Tab (Deck A) and Backslash (Deck B). BUT:

```
grep -R "repitchLock" src/engine/dj/
→ no matches
```

No engine code reads the flag. The keyboard shortcut flips a boolean that
nobody consumes. Adding a UI toggle (as I did, then reverted) would just add
a second no-op interaction.

**Root-cause fix required, not UI.** Either:
- **(A)** wire `repitchLock` into `DeckEngine.setPitchOffset` so that when true,
  pitch slider moves don't change playback rate (freeze the sounding rate,
  let the user physically move the fader without audible effect — useful
  for setting up a cue or lining up the fader visually without touching the
  running mix), OR
- **(B)** remove the flag and its keyboard shortcuts entirely as dead code.

My read: (A) is the intended behavior — the name "repitchLock" semantically
means "lock the current pitch output regardless of fader motion." But until
engine wiring exists, don't add more UI on top of a dead flag.

### DeckPitchSlider was reverted by user

When I proposed a LOCK chip next to the pitch readout, the user reverted.
The user is aware repitchLock is cosmetic (I flagged it in the same turn)
and presumably doesn't want another no-op button in the UI. Handle this by
fixing the engine first, THEN revisit the toggle.

## Critical References

### Repitchlock wiring (for next-session fix)

- `src/stores/useDJStore.ts:59` — `repitchLock: boolean` declaration
- `src/stores/useDJStore.ts:186` — default `false`
- `src/components/dj/DJKeyboardHandler.tsx:194-196` — Tab toggles Deck A
- `src/components/dj/DJKeyboardHandler.tsx:288-289` — Backslash toggles Deck B
- `src/engine/dj/DeckEngine.ts:1291-1335` — `setFilterPosition` and `setFilterResonance` (for reference pattern on how pitch offset is applied)
- `src/engine/dj/DeckEngine.ts` — find `setPitchOffset` / `pitchBend` / whatever reads `pitchOffset` from store; that's where the `if (repitchLock) return;` or equivalent needs to go
- `src/engine/dj/DJActions.ts:setDeckPitch` — action that both the slider and keyboard call; may be the best central place to gate

### Effect columns 3–8 (deferred feature)

Store + data path is already dynamic per-channel; canvas renderer is the gap.

- `src/types/tracker.ts:163` — `effectCols?: number` in `ChannelData.channelMeta` (default 2)
- `src/types/tracker.ts:85-90` — `TrackerCell` already has `effTyp3..effTyp8`, `eff3..eff8` fields
- `src/components/tracker/PatternEditorCanvas.tsx:369-370` — width math already handles `effectCols * (CW * 3 + 4)`
- `src/components/tracker/PatternEditorCanvas.tsx:542` — reads `effectCols = channel?.channelMeta?.effectCols ?? 2`
- `src/components/tracker/PatternEditorCanvas.tsx:567-570` — hitTest only resolves `effTyp`/`effTyp2`, not 3+

Needs: render fn extension, hitTest extension, keyboard routing extension,
and a column-count selector in the channel header or `ChannelContextMenu`.
Half-day+ with a proper plan — not a one-shot edit.

## Next Steps

Ordered:

1. **Fix the real Repitchlock bug** (root cause, not UI polish)
   - Read `DeckEngine` to find where `pitchOffset` is applied to the audio graph
   - Decide: gate the setter OR compute an effective-pitch value that ignores further changes while `repitchLock === true`
   - Match the TD-3 / SL-1200 semantics: turntable DJs want to slide the fader back to zero without the tempo changing. So `repitchLock` should probably snapshot the current `pitchOffset` into a private `_lockedPitch` field and keep applying `_lockedPitch` while `repitchLock === true`, even as the store's `pitchOffset` changes
   - THEN add the UI toggle back to `DeckPitchSlider.tsx` — same placement, but now it's functional
   - Regression test in `src/engine/dj/__tests__/` asserting `setPitchOffset(5)` then `setRepitchLock(true)` then `setPitchOffset(10)` leaves the audible rate at 5-semitone state

2. **Decide on effect columns 3–8** — if you want it, spawn a planning session.
   Feature-sized, not polish. Handoff covers the file:line map above.

3. **Nice-to-haves still in the audit** (low priority):
   - Wire `repitchLock` into MIDI mapper as well (symmetric with keyboard)
   - XM frequency type (linear/amiga) is locked in engine; expose a toggle
     somewhere in tracker settings. Low-value but trivial.

## Other Notes

- `src/lib/export/exporters.ts` showed transient TS6133 errors during this
  session that vanished on re-run. Stale `tsc -b` cache. Not a real problem,
  just flag it if it recurs — the file IS using `useDubStore` and
  `useDrumPadStore` at lines 282/289.
- All four landed changes are in-tree, not yet committed. Working state:
  `git status` shows modifications to the 4 files listed above plus a few
  leftover dub-work files. User prefers direct push to main — commit these
  when ready (see `memory/feedback_no_prs_push_to_main.md`).
- Geonkick is NOT in the "needs UI" list any more. Update the audit memo
  if you regenerate it.
