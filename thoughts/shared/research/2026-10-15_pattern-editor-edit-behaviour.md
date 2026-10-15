---
date: 2026-10-15
topic: Pattern editor cursor behaviour after data entry, per original tracker
tags: [tracker, pattern-editor, keymap, cursor, protracker, fasttracker2, impulse-tracker, openmpt]
status: final
---

# Pattern editor: what the cursor does after an entry, per original tracker

Owner report: keymap is ProTracker, but typing `C` in the effect column moves the cursor RIGHT; ProTracker moves DOWN in the same column.

## 1. Where DEViLBOX decides today

- Key routing: `src/hooks/tracker/useTrackerInput.ts` composes `input/useNoteInput.ts`, `input/useEffectInput.ts`, `input/useNavigationInput.ts`.
- Every instrument / volume / effect / probability / flag entry in `useEffectInput.ts` ends in `useCursorStore.applyEntryAdvance(columnType, digitIndex)` (`src/stores/useCursorStore.ts:263`), which calls the pure decider `computeNibbleAdvance` (`src/lib/tracker/nibbleAdvance.ts`). That is already ONE decision point for non-note columns.
- The decider hard-codes one model (commit a5f0748d5): first digit -> second digit in the same cell; effect command -> effect param (right); last digit -> down by edit step. Only gates are three booleans `advanceOnInstrument/Volume/Effect` in `EditorBehavior` (`src/engine/keyboard/EditorBehavior.ts`, all `true` except PT volume `false`). ProTracker's profile therefore behaves exactly like FT2's - the owner's report.
- Note entry advance is NOT in the decider: `useNoteInput.ts` (~l.305-420, `moveCursorToRow((row + editStep) % length)`) and `useTrackerInput.ts:540-587, 1429, 1636`. Notes always go down by edit step, which matches PT2, FT2, Schism and OpenMPT, so no profile value is needed there.
- Profile per keymap: `getBehaviorForScheme` (EditorBehavior.ts, end of file); `useEditorStore.activeBehavior`; set from `useGlobalKeyboardHandler.ts:1883` when the scheme JSON (`public/keyboard-schemes/*.json`) loads; `custom` uses `baseScheme`. Scheme choice: `useKeyboardStore.activeScheme` (persist key `keyboard-preferences`, no version), UI `SettingsModal.tsx:569-585` via `useSettingsDialog.ts:41 KEYBOARD_SCHEMES`.
- Canvas-owned format editors (`src/components/tracker/formatKeyboard.ts`, hively etc.) do their own entry and are out of scope; they do not call `applyEntryAdvance`.

## 2. Primary sources (read-only; not built)

### ProTracker 2 clone (`third-party/pt2-clone-master/src`)
- Cursor has 6 slots per channel: note, sample hi, sample lo, command, param hi, param lo (`pt2_keyboard.c:3019-3042`; Right/Left walk the slots and wrap 23 -> 0 across channels).
- ALL of sample hi/lo, command, param hi/lo: write the nibble, then `modSetPos(DONT_SET_ORDER, (currRow + editMoveAdd) & 63)` unless in RECORD (playing) mode (`pt2_edit.c:276-345`; the step is at `:285, :299, :313, :327, :341`). `cursor.mode` is never changed, so the cursor goes DOWN in the same column. **Owner's claim confirmed.**
- Command accepts 0-F in one keystroke (`pt2_edit.c:306-317`); sample hi accepts only 0-1 (`:280`).
- Note: down by editMoveAdd (`pt2_edit.c:176`); illegal note key deletes note+sample and also steps (`:201`). Delete key: clears note+sample (Alt keeps), Shift/Alt also clears command+param, then steps (`:354-373`). Default editMoveAdd = 1 (`pt2_main.c:528`), range 0-9, Ctrl+0..9 (`pt2_keyboard.c:1100-1330`). Row wraps at 64 (`& 63`). No note-off key. Tab: next channel note slot (`pt2_keyboard.c:3004`). Backspace is text-edit only (`:3461`).

### FastTracker 2 clone (`/Users/spot/Code/HippoPlayer/ft2-clone/src`)
- Instrument hi/lo, volume hi/lo, effect type, param hi/lo: write the nibble, then, only in PLAYMODE_EDIT, `setPos(-1, (row + editRowSkip) % numRows)`; the cursor object is not changed -> DOWN in the same column (`ft2_edit.c:171-264`). **This contradicts the nibble-right model DEViLBOX ships as "FT2" (commit a5f0748d5).**
- Note and note-off: down by edit skip (`ft2_edit.c:63, 471, 546`). Delete: clears per modifier and steps (`:596-626`). Default editRowSkip = 1 (`ft2_main.c:308`), range 0-16 (`ft2_keyboard.c:329-343`, backtick key). Left/Right: slot walk, skipping hidden volume column, wrapping channels (`ft2_pattern_ed.c:428-462`); Tab: next channel note slot (`:399-420`). Insert/Backspace: `ft2_keyboard.c:568, 577` (row insert/pull; not cursor-moving data entry).

### Schism Tracker (Impulse Tracker clone; `Reference Code/schismtracker-master/schism/page_patedit.c`)
- 2-digit instrument: first digit -> second digit (`current_position++`), second -> `advance_cursor(1,0)` (`:3493, :3499-3500`). Volume the same (`:3556-3559`). Effect command: `link_effect_column` (default 0, `:106`) ? move to param : advance row, staying in the command column (`:3575-3577`). Param hi -> lo; lo -> back to the command column and advance row (`:3605-3609`).
- `advance_cursor` (`:2515`): row += skip_value (default 1, `:104`; Alt+0-9 `:3647`, 0 means next channel); does NOT wrap at pattern end (`:2520`).
- Original IT: asm only (`impulse-tracker-main`), not read; Schism is the stated clone. IT default behaviour = verified via Schism only.

### OpenMPT (`third-party/openmpt-master/mptrack/View_pat.cpp`)
- Instrument (`TempEnterIns :5512-5535`), volume digit (`:5053-5130`), effect param (`:5231-5276`): the cursor does not move at all (instrument digits shift in: `instr*10+val`). Volume/effect COMMAND letter: step down by spacing only if setting `patternStepCommands` (default false, `TrackerSettings.cpp:266`; `View_pat.cpp:5145, 5219`). Note: down by spacing, wrap per ContinuousScrolling (`:5842-5846`). Left/Right only from navigation commands (`:4573-4577`).

### Furnace (`Reference Code/furnace-master/src/gui`)
- `gui.cpp:1500-1590 valueInput`: nibble toggle inside the field; after the last nibble `editAdvance()` (`cursor.cpp:510`, edit step, `wrapVertical` setting). Effect input is a user setting `effectCursorDir` 0 = down, 1 = to effect value else down (default, `gui.h:2222`), 2 = value/next effect wrap (`settings.cpp:2823-2832`). Precedent for a selectable behaviour.

## 3. Table: cursor after an entry (D = down by edit step in the SAME column, N = next digit in same cell, P = to effect param, S = stay)

| Tracker | note | instr/sample d1 | d2 | volume d1 | d2 | effect cmd | param d1 | param d2 | step default / wrap |
|---|---|---|---|---|---|---|---|---|---|
| ProTracker 2 (pt2-clone) | D `pt2_edit.c:176` | D `:285` | D `:299` | n/a | n/a | D `:313` | D `:327` | D `:341` | 1 (0-9) / wraps `&63` |
| NoiseTracker | unverified | unverified | | n/a | | unverified | | | unverified |
| FastTracker 2 (ft2-clone) | D `ft2_edit.c:471` | D `:263` | D | D | D | D | D | D | 1 (0-16) / `% rows` |
| ScreamTracker 3 | unverified | | | | | | | | |
| Impulse Tracker (via Schism) | D `page_patedit.c:3448` | N `:3493` | D `:3500` | N `:3556` | D `:3559` | D (P if link on) `:3575-3577` | N `:3605` | D, back to cmd col `:3609` | 1 / no wrap `:2520` |
| OpenMPT | D `View_pat.cpp:5842` | S | S | S | S | S (D if patternStepCommands) `:5145,5219` | S | S | 1 / ContinuousScrolling |
| Renoise | unverified (no source or manual in repo) | | | | | | | | |
| OctaMED | unverified | | | | | | | | |
| Digital Tracker | unverified | | | | | | | | |
| Furnace | D | N | D | N | D | per `effectCursorDir` (default P) | | | edit step / `wrapVertical` |

Note-off: PT none (`pt2_edit.c:201` deletes instead), FT2 `NOTE_OFF` key (`ft2_edit.c:43-63`). Delete steps down in PT2 and FT2. Neither FT2 nor PT2 steps while the song is playing in record mode (FT2 only in PLAYMODE_EDIT `ft2_edit.c:262`, PT2 `!= MODE_RECORD`), which DEViLBOX already does (`isPlaying` -> none).

## 4. Findings that change the plan

1. ProTracker: owner's claim is right. DEViLBOX is wrong for PT.
2. FT2: the shipped "FT2 nibble cursor" (a5f0748d5) does not match the FT2 clone either; FT2 steps down in the same column. IT (Schism) is the tracker that matches the shipped flow, except it returns to the command column after the last param digit and stays in the command column after the command.
3. Latent bug in the current decider: the `row` result goes through `moveCursorToRow`, which keeps `digitIndex`, so after a last nibble the cursor sits on digit 1 of the next row while the decider's own comment says it resets to 0 (to be proven by a test in stage 2).
