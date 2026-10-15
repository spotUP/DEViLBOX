---
date: 2026-10-15
topic: Selectable pattern-entry cursor behaviour (EntryAdvanceProfile) following the keymap
tags: [tracker, pattern-editor, keymap, settings, cursor]
status: implemented
---

# Plan: pattern editor edit behaviour

Research: `thoughts/shared/research/2026-10-15_pattern-editor-edit-behaviour.md`.

## Problem (invariant violated)
The cursor move after a data entry is one hard-coded model in `computeNibbleAdvance` (digit right, command -> param, then down), gated only by booleans. Original editors differ (ProTracker 2 and FT2 clones: always down in the same column; Schism/IT: digit, then down, command stays in its column; OpenMPT: stay). The keymap changes keys but not this rule.

## Level of the fix
Levels: (a) more booleans in `EditorBehavior` (cannot express stay/down/digit/param; band-aid), (b) if/else per scheme in handlers (scatters), (c) DATA profile consumed by the one existing decider. Chosen: (c).

## Design
- `src/lib/tracker/entryAdvanceProfiles.ts` (pure): `EntryMove = 'stay' | 'down' | 'nextDigit' | 'toParam' | 'downToCommand'`; `EntryAdvanceProfile { id, label, description, instrument: [d1, d2], volume: [d1, d2], effectCommand, effectParam: [d1, d2] }`; built-ins `devilbox` (current behaviour), `protracker`, `fasttracker2`, `impulse-tracker`, `openmpt`; `EDIT_BEHAVIOUR_CHOICES` = `follow-keymap | follow-format | <profile id>`; `resolveEntryProfile({choice, keymap, sourceFormat})`.
- `computeNibbleAdvance` takes the profile; it stays the single decision point (`useCursorStore.applyEntryAdvance`). The three `advanceOn*` booleans leave `EditorBehavior`.
- Setting `editBehaviour` in `useKeyboardStore` (default `follow-keymap`), persist version 1 + migration.
- Keymap -> profile: protracker -> protracker, impulse-tracker -> impulse-tracker, openmpt -> openmpt, fasttracker2 -> devilbox (see Decisions), octamed / renoise / custom base -> devilbox (their rows are unverified).
- Settings UI: "Edit behaviour" select under Keyboard in `SettingsModal.tsx`, options from the same list, one-line description of the effective profile.

## Checklist
- [x] P1 Profile type + five built-in profiles, each cell sourced in the research doc
- [x] P2 `resolveEntryProfile` (explicit > follow-format > follow-keymap)
- [x] P3 `computeNibbleAdvance` consumes the profile; new `columnType` result resets digit on `down`
- [x] P4 `applyEntryAdvance` resolves the profile (choice, active keymap, song source format)
- [x] P5 Remove `advanceOnInstrument/Volume/Effect` from `EditorBehavior`
- [x] P6 `editBehaviour` in `useKeyboardStore` with persist version 1 and migration
- [x] P7 Settings UI select
- [x] P8 Tests: table-driven transitions per profile; resolution; migration; reachability through `useTrackerInput`
- [x] P9 Revert-check: reachability test red on old decider
- [x] P10 `npm run type-check` clean for touched files; tests wired in `test:ci`

## Verification
Automated: the new test files plus `nibbleAdvance`/`useKeyboardStore`/`useCursorStore` tests; `npm run type-check`.
Manual (owner): LOCAL `http://localhost:5174/`, Settings > Keyboard: set ProTracker, load a .mod, enter record mode, move to the effect column, press `C`: PASS = cursor lands one row down in the effect command column; FAIL = it moves to the parameter. Then set Edit behaviour "DEViLBOX default" and press `C`: cursor moves to the parameter.

## Decisions for the owner
1. Follow keymap with the FastTracker 2 keymap (the default): keep today's flow (recommended: nothing changes unasked; "FastTracker 2" stays selectable) or switch to FT2-clone behaviour (down in the same column, per `ft2_edit.c:263`)? Today's flow was added deliberately in a5f0748d5 but the FT2 source disagrees with it.
2. Should Follow keymap also consider the song's format (a .mod under the FT2 keymap edits like ProTracker)? Shipped as a separate choice "Follow song format"; default remains Follow keymap.
3. Renoise, OctaMED, NoiseTracker, ScreamTracker 3, Digital Tracker have no source or manual in the repo; they use the DEViLBOX default until someone supplies one.

## Execution notes (2026-10-15, second agent)
- Earlier ticks were premature: no tests existed. Now written and run: `nibbleAdvance.test.ts` (per-profile numbers), `entryAdvanceProfiles.test.ts` (resolution + migration), `hooks/tracker/input/__tests__/editBehaviourReachability.test.tsx` (the one reachability test through `useEffectInput`). Revert-check done: mapping ProTracker keymap -> devilbox fails the reachability test. All three added to `test:ci`.
- Decision: `down` keeps the digit slot (PT2/FT2 never change `cursor.mode`); new `downFirstDigit` for the DEViLBOX default and IT, which start a fresh entry. `row` result now carries `digitIndex`.
- Profiles done: devilbox, protracker, fasttracker2, impulse-tracker, openmpt. Open: Furnace (`effectCursorDir`), klystrack, GoatTracker/GTUltra, SID Factory II (canvas-owned format editors do not call `applyEntryAdvance`; not verifiable in the research table).
