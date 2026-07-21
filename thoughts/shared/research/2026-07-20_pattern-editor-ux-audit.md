---
date: 2026-07-20
topic: pattern-editor-ux-audit
tags: [tracker, pattern-editor, ux, ft2-parity, keyboard-input, audit]
status: final
---

# Pattern Editor UX + Editing Audit vs Fast Tracker 2

Read-only audit. Five parallel agents covered: note input, effect/volume/instrument
column editing, navigation/selection/clipboard, row/pattern ops + editor UX, and
known-bugs + architecture. Every HIGH finding was verified directly against source.

The grid is **canvas-rendered** (GL primary: `TrackerGLRenderer.ts`; Canvas2D
fallback: `TrackerCanvas2DRenderer.ts`), not DOM cells. Input flows through two
window-level capture-phase pipelines (see H6).

---

## Executive summary — why it feels shaky

The data model and the GL caret already support FT2 sub-column/nibble editing.
The failures are in the **entry and placement layer**:

1. **Typing a hex digit never advances the nibble cursor** — it writes one nibble
   then jumps to the next row. Two-digit instrument/param entry in place is
   impossible; effect type→param is not a continuous typing flow. This is the
   single biggest cause of "editing doesn't work like FT2." (H1)
2. **Clicking a cell always lands on digit 0**, and the effect *param* column
   can't be clicked at all. (H2)
3. **Two independent global keydown pipelines** plus a **duplicate BlockOperations
   handler** fight over the same keys, mediated only by an untyped, untested
   `__handled` sentinel. (H4, H6)
4. **Block operations spam one undo entry per cell** — a single transpose needs
   ~256 Ctrl+Z to undo. (H5)
5. **Pattern resize silently destroys rows, non-undoable, no cursor clamp.** (H7)

The entire keyboard-input pipeline (~4,300 lines across `useTrackerInput`,
`useGlobalKeyboardHandler`, and the three `input/*` sub-hooks) has **zero direct
test coverage**, which is why these regress and stay broken.

---

## HIGH severity

### H1 — Hex/effect typing never advances the nibble cursor (THE core editing bug)
`src/hooks/tracker/input/useEffectInput.ts:41-53` (`advanceIfAllowed`), entry
handlers at `:76-84` (instrument), `:126-164` (effTyp/effParam), `:168-243`
(effTyp2/effParam2).

FT2 model is a **nibble cursor**: typing a hex digit writes that nibble AND moves
the caret one nibble right; only after the last nibble does it advance a row.
DEViLBOX instead writes the nibble then calls `advanceIfAllowed` → jumps straight
to the next row. `digitIndex` is only ever mutated by arrow keys
(`useCursorStore.ts:117,147,170,175`), never by typing.

Consequences:
- Two-digit instrument in place is impossible — 2nd keystroke lands on the next
  row's high nibble.
- Effect entry `A`,`0`,`F` (type then two param nibbles) is not continuous — after
  the type char the cursor leaves the cell; you must arrow-right to the param.
- Volume low-nibble path fabricates a `1x` set-volume command
  (`useEffectInput.ts:108-115`): when `digitIndex===1` and stored `<0x10` it does
  `0x10 + hexDigit`, silently rewriting the command class instead of replacing
  just the low nibble.

Root fix lives entirely in `useEffectInput.ts`: on a nibble write, if not on the
last nibble, set `digitIndex+1` instead of advancing the row.

### H2 — Click-to-place ignores digit position; effect param unreachable by click
`src/components/tracker/PatternEditorCanvas.tsx:570-626` (`getCellFromCoords`),
`:786` (`handleMouseDown`), `src/stores/useCursorStore.ts:264`
(`moveCursorToChannelAndColumn` hardcodes `digitIndex: 0`).

The hit-test returns `{rowIndex, channelIndex, noteColumnIndex, columnType}` and
never computes `digitIndex` from click X. For the effect region it only ever
assigns `effTyp`/`effTyp2`/`flag`/`probability` — never `effParam`. So:
- Clicking the 2nd nibble of instrument/volume/effect always drops on digit 0 →
  next typed digit overwrites the wrong nibble.
- The effect **parameter** nibbles cannot be reached with the mouse at all.

The GL renderer already draws a per-digit caret (`TrackerGLRenderer.ts:618-630`,
`digitIndex * CHAR_WIDTH`) — only click placement is disconnected. Fix: compute
`digitIndex` and distinguish `effParam` in `getCellFromCoords`, thread through
`moveCursorToChannelAndColumn`. Closes both H2 sub-issues with one localized change.

### H3 — Canvas2D fallback draws no per-nibble caret (cursor spans whole channel)
`src/engine/renderer/TrackerCanvas2DRenderer.ts:373-382`.

The Canvas2D cursor is a `strokeRect` spanning the full channel width; it ignores
`columnType` and `digitIndex`. On the fallback path (iOS / no-WebGL) there is zero
indication of which sub-column/nibble the cursor is on. GL path is correct;
Canvas2D must mirror the GL per-column/nibble caret math.

### H4 — Duplicate BlockOperations global keydown handler collides with primary
`src/components/tracker/BlockOperations.ts:472-556`.

`BlockOperations` registers its own `window` keydown listener for
Alt+B/E/C/V/X/T/R/D while `useTrackerInput.ts:591-1013` already handles scheme-aware
Alt+C/V/X/B. Both fire for the same event → double copy, double status message,
scheme ignored by the second. Also the Alt+T branch (`:525`) lacks a `!e.shiftKey`
guard and `return`s, so **Alt+Shift+T (transpose down) is unreachable** — it hits
the up-transpose branch first. Fix: delete this listener; route these hotkeys
through `useTrackerInput` only (the F7/F8 transpose there is already correct).

### H5 — Block ops push one undo entry PER CELL
`src/components/tracker/BlockOperations.ts:134-467` (`transposeBlock`,
`amplifyBlock`, `interpolateBlock`, `reverseBlock`, `expandBlock`, `shrinkBlock`,
`mathBlock`, `duplicateBlock`).

Each loops calling `setCell`, and `useTrackerStore.ts:478` pushes an `EDIT_CELL`
undo entry every call. A transpose over 4ch × 64 rows = 256 undo entries — one
Alt+T needs 256 Ctrl+Z to reverse. The `TrackerView` toolbar buttons
(`TrackerView.tsx:982-986`) route through these, so the toolbar has the same defect.
Store-level equivalents (`transposeSelection` `useTrackerStore.ts:1081`,
`interpolateSelection` `:1151`) correctly push ONE snapshot. Fix: route
BlockOperations through the store actions or wrap each op in a single snapshot.

### H6 — Two window capture-phase keydown pipelines, sentinel-mediated, untested
`src/hooks/useGlobalKeyboardHandler.ts:2049` (capture keydown, mounted
`App.tsx:398` AND re-mounted `PatternEditorEmbed.tsx:82`) and
`src/hooks/tracker/useTrackerInput.ts:1684` (capture keydown, mounted per tracker
view via `useTrackerView.ts:28`).

Both capture-phase on `window`, so `stopPropagation` can't separate them (code says
so at `useGlobalKeyboardHandler.ts:2044-2046`). The only thing preventing
double-execution is an untyped sentinel `(e as any).__handled = true` (`:2047`),
checked downstream (`useTrackerInput.ts:229`, `useNoteInput.ts:282`,
`useNavigationInput.ts:85`, `useEffectInput.ts:58`). It is ordering-dependent
(relies on registration order, not DOM position), untyped, and untested. Embed mode
mounts a second global handler → up to three coexisting. Long-term: unify behind the
existing `CommandRegistry`/`KeyboardRouter` (`src/engine/keyboard/`). Short-term:
regression test the `__handled` contract.

### H7 — Pattern resize: silent, non-undoable data loss + no cursor clamp
`src/stores/useTrackerStore.ts:1377-1404` (`resizePattern`), `:1406-1425`
(`resizeAllPatterns`).

Shrinking does `channel.rows.splice(newLength)` — permanently discards trailing
rows, pushes **no** undo action (unlike `insertRow`/`deleteRow`), and never clamps
the cursor (can point past pattern end). FT2 resize is undoable and clamps.

---

## MEDIUM severity

### M1 — Plain arrow move never clears an existing block selection
`src/hooks/tracker/input/useNavigationInput.ts:321-459`, `useCursorStore.ts:82-229`
(`moveCursor` never touches `selection`). Only Escape (`useTrackerInput.ts:1493`)
and Ctrl+Shift+A (`:670`) clear it. A stale block persists after unmodified
navigation → subsequent Ctrl+C/paste/transpose operates on a block the user thinks
they abandoned. FT2: unmodified cursor move discards the mark.

### M2 — Instrument auto-stamp writes raw (0-based) id, not the 1-based number
`src/hooks/tracker/input/useNoteInput.ts:212` (`cellUpdate.instrument =
currentInstrumentId`). Cell column is XM-style where 0 = "no instrument"
(`InstrumentCell.tsx:2-3,21`), but `currentInstrumentId` defaults to 0 and first
instrument typically has id 0. Block-set paths correctly do `instIdx + 1`
(`useTrackerInput.ts:1130,1553`). So a note entered with the first instrument
selected can stamp `instrument = 0` → renders as "no instrument". The two paths
disagree; make them consistent (1-based).

### M3 — All cursor navigation hard-disabled during playback
`src/hooks/tracker/input/useNavigationInput.ts:113-213,322` (`if (isPlaying)
return false`). Arrows, PageUp/Down, Home/End, F9-F12 all bail while playing.
Combined with record-at-playback-row (`useNoteInput.ts:188`), you can't reposition
the edit cursor while the song plays. Deliberate, but diverges from FT2 live-edit.

### M4 — Keyboard selection loses multi-column span (vs mouse)
`src/stores/useCursorStore.ts:308-343`. `endSelection` (Shift+arrow,
`useNavigationInput.ts:336`) updates end row/channel/column but NOT `columnTypes`;
the richer span logic is mouse-drag-only (`updateSelection:314-332`). So keyboard
Shift-select across note→inst→vol produces a different clipboard shape than mouse
drag (`clipboardActions.ts:66`).

### M5 — Numeric toolbar fields cannot be typed
`src/components/tracker/FT2Toolbar/FT2NumericInput.tsx:133-163`. Renders a `<span>`
+ arrow buttons, not a text input. Edit Step / BPM / Speed / Pattern Length /
Position / Song Len are ±1 nudge or right-click preset only — setting length 13
means ~51 clicks. FT2 lets you type. (Upside: can't leak keys into the grid.)

### M6 — Muted channels not dimmed in the note grid body
`src/components/tracker/PatternEditorCanvas.tsx:1688-1689,2392` collect
`muted`/`solo` into the render snapshot, but the canvas cell-drawing never reads
them — only the channel header dims (`opacity-50`). FT2 greys the whole muted
column. (Muted channels stay editable — correct.)

### M7 — Volume second-nibble command-class corruption
`src/hooks/tracker/input/useEffectInput.ts:108-115` — see H1; the `<0x10` branch
discards the existing high-nibble command. FT2 keeps the command, replaces only the
value nibble.

---

## LOW severity

- `useNavigationInput.ts:276-283` — Shift+Tab only jumps channel when cursor is on
  the note column; forward Tab has no such gate (asymmetry vs FT2).
- `clipboardActions.ts:66,137` — `columnTypes.length > 8` magic sentinel to mean
  "full cell" is fragile; a boolean flag is clearer.
- `useTrackerInput.ts:257` — in format-editor modes Ctrl+Z/Y + Ctrl+Arrow delegate
  away but Ctrl+C/X/V don't → potential double-handling if a format has its own
  clipboard.
- `useEffectInput.ts:127` / `inputConstants.ts:108-116` — effect-type map accepts
  a–z (36 commands) with no per-format gating; unsupported effects accepted
  silently → non-round-trippable (may be intentional given multi-format scope).
- `useNoteInput.ts:100` — note keys become dead keys (no preview, no entry) when
  `currentInstrumentId === null`. FT2 always previews.
- `useEffectInput.ts:82` — instrument clamp to 128 (0x80) surprises the two-nibble
  UI (typing F,F yields 0x80).
- recordMode changes nothing in the canvas itself (no red border/tint like FT2) —
  only the toolbar dot signals edit mode.

---

## What already matches FT2 (do not touch)

- Piano key layout Z-row/Q-row incl. black keys (`inputConstants.ts:22-55`).
- Keyjazz preview always plays, even outside record mode (`useNoteInput.ts:437-467`).
- Held-key repeat: suppressed for preview, re-enters notes in edit mode
  (`useNoteInput.ts:110-112,470-479`). Polyphonic preview honored.
- Note-off `===` via CapsLock, note-cut, note-fade (`useNoteInput.ts:291-329`).
- Spacebar edit/jam toggle (`useTrackerInput.ts:1518-1539`), visible via toolbar dot.
- Edit-step advance + wrap, F1-F7 direct octave, numpad +/- octave.
- Replace-vs-insert on occupied cells (overwrite default; insertMode pushes row).
- Arrow-key nibble traversal within a field (`useCursorStore.ts:117,175`) — the
  navigation half of the nibble cursor is correct; only typing/click are broken.
- Delete = clear field at cursor, behavior-aware (`useTrackerInput.ts:161-218`).
- Full clipboard superset: copy/cut/paste + pasteMix/Flood/PushForward/swap/
  track-only/commands-only/kill-to-end, mask-aware (`clipboardActions.ts`);
  OpenMPT text interop.
- Store-level undo: one snapshot per op across ~35 action types
  (`useTrackerStore.ts:478-1310`) — better than FT2. (Defeated only by H5.)
- F7/F8 transpose track/pattern/block, Ctrl+I interpolate — single-undo store paths.
- Insert/delete row per-channel, correct FT2 semantics (`patternEditActions.ts:63-99`).
- Scroll: current row centered, wheel moves cursor not viewport (no fighting).
- Beat/measure row shading every 4th/16th (`TrackerGLRenderer.ts:463-464,551-553`).
- Focus capture guards `input`/`textarea`/`contentEditable`/`select`/modals — grid
  doesn't eat text-field keys.

---

## Test coverage gap (cross-cutting)

No test imports `useTrackerInput`, `useGlobalKeyboardHandler`, `useNoteInput`,
`useNavigationInput`, or `useEffectInput`. `useTrackerStore.test.ts` covers only
deletePattern + loadPatterns — no cursor movement, cell entry, insert/delete-row,
paste, transpose, or column navigation. The `__handled` dedup contract is untested.
This absence is why the input layer regresses silently.

---

## Recommended fix order (root-cause, cheapest-highest-impact first)

1. **H1** — nibble auto-advance on typing (`useEffectInput.ts`). Single file,
   biggest felt improvement. Ship with a hook-level regression test (first test of
   the input pipeline).
2. **H2** — click computes `digitIndex` + reaches `effParam`
   (`getCellFromCoords` + `moveCursorToChannelAndColumn`). One localized change,
   renderer already supports it.
3. **H4 + H5** — delete the duplicate BlockOperations keydown listener AND make
   block ops atomic-undo. Fixes collision, Alt+Shift+T dead branch, and 256-undo in
   one pass.
4. **H7** — resize: push undo + clamp cursor.
5. **H3** — Canvas2D per-nibble caret (parity with GL).
6. **M1** — clear selection on unmodified cursor move.
7. **M2** — 1-based instrument stamp.
8. Remaining M/L as UX polish.

Each item is a distinct, small, testable PR — do not batch. Every fix ships with a
fails-on-revert test wired into `test:ci` (the input pipeline currently has none).
