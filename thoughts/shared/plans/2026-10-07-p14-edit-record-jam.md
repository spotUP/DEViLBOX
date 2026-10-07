---
date: 2026-10-07
topic: P14 edit / record / jam in every editor mode, one store per view
tags: [editor, hively, keyboard, record, pt2-clone, ft2-clone]
status: implemented
---

# P14 - edit / record / jam, one store per view

Owner 2026-10-07 (amanda.ahx, editorMode 'hively', record mode on): keys wrote notes into the tracker store
(pattern 0 channel 0 rows 0-13) but the Hively view showed none of them, and a red square stepped down per key.
"use the protracker and ft2 sources and see how they do it".

## 1. How the reference trackers do it

| Behaviour | ft2-clone | pt2-clone |
|---|---|---|
| Edit mode | `playMode == PLAYMODE_EDIT` (`ft2_edit.c` `testNoteKeys` l.41: `editmode \|\| PLAYMODE_RECPATT \|\| PLAYMODE_RECSONG` gates the write) | `editor.currMode == MODE_EDIT \|\| MODE_RECORD` (`pt2_edit.c` l.164, 195, 224) |
| Edit off = jam only | `testNoteKeys` triggers the note via `recordNote(noteNum, -1)`; the pattern write inside `recordNote` (l.332) needs `editmode \|\| recmode` | `jamAndPlaceSample` (l.89) plays the sample; the pattern write is under the `MODE_EDIT/MODE_RECORD` test |
| Stopped + edit: write at cursor, step | `setPos(-1, (row + editor.editRowSkip) % numRows, true)` when `PLAYMODE_EDIT` (l.62, 262, 621) | `modSetPos(DONT_SET_ORDER, (song->currRow + editor.editMoveAdd) & 63)` (l.176, 201, 229 ...) |
| Recording while playing | row from `evaluateTimeStamp` (l.272): playback row, quantized by `config.recQuant / recQuantRes`; cursor not moved | `quantizeCheck(song->currRow)` (l.53, used l.95); `didQuantize` |
| Hex / delete | `editmode` only | `MODE_EDIT` only |
| One buffer | `pattern[]` is both what `drawPatternData` draws and what the replayer reads; `cursor` is drawn in that one view | `song->patterns` likewise |

DEViLBOX rule now (one function, `src/lib/tracker/formatEntryPlan.ts`: `planNoteEntry`, `planCursorEntry`, `quantizeRecordRow`):
edit off = nothing written (the jam is the window handler's `previewNote`); edit on and stopped = write at the cursor row and move
by the edit step, wrapping; recording while playing = write at the playback row (record quantize), cursor stays; hex digits and
Delete only when stopped in edit mode. The classic `useNoteInput.enterNote` and the format canvas both call it.

## 2. Editor-mode table (13 modes, counted from the `EditorMode` union in `src/types/tracker.ts`)

Entry owner = `ENTRY_OWNER` in `src/lib/tracker/formatModeKeyOwnership.ts` (a `Record<EditorMode, ...>`: a new mode cannot be added without choosing).

| Mode | View | Cells the view draws | Who writes a typed key (after) | Cursor | Split before? |
|---|---|---|---|---|---|
| classic | TrackerEditorWithBg (PatternEditorCanvas, store-driven) | tracker patterns | window handler -> tracker store | useCursorStore | no |
| furnace | FurnaceView (store-driven canvas) | tracker patterns (setCell syncs the native song) | window handler | useCursorStore | no |
| suntronic | SunTronicView (store-driven canvas) | tracker patterns (setCell -> applySunTronicGridNote) | window handler | useCursorStore | no |
| tfmx | TFMXView (store-driven canvas) | tracker patterns (setCell patches tfmxFileData) | window handler | useCursorStore | no |
| hively | HivelyView (format canvas) | `hivelyNative.tracks` | canvas -> `hivelyEdit.editHivelyCell` -> hivelyNative + projection into every tracker pattern that plays the track | canvas `formatCursor` | YES: view had no write path; window handler wrote tracker patterns |
| klystrack | KlysView (format canvas) | `klysNative` | canvas -> KlysView.handleCellChange (klysNative + KlysEngine.setPatternStep) | canvas `formatCursor` | window handler also wrote the tracker store (stray) |
| jamcracker | JamCrackerView (format canvas) | JamCrackerEngine pattern data | canvas -> handleCellChange (JamCrackerEngine.setPatternCell) | canvas `formatCursor` | stray window write |
| sidfactory2 | SF2View (format canvas) | useSF2FormatData | canvas -> handleCellChange of that hook | canvas `formatCursor` (+ onFormatCursorChange) | stray window write |
| cheesecutter | CheeseCutterView (format canvas) | useCheeseCutterFormatData | canvas -> its handleCellChange | canvas `formatCursor` | stray window write |
| musicline | MusicLineView (one format canvas per channel) | MusicLine engine data via mlFormatData | canvas -> mlFormatData.handleCellChange | per-channel canvas `formatCursor` | stray window write |
| goattracker | GTUltraView (format canvas) | useGTUltraStore via useGTUltraFormatData | canvas -> handleCellChange; GTKeyboardHandler is a second handler (NOT audited, see open items) | canvas `formatCursor` | stray window write |
| maxtrax | MaxTraxView (MaxTraxGrid, double-click edit) | `maxTraxData` | none: no keyboard entry; typing only jams | none | window handler wrote the tracker store |
| sc68 | Sc68Visualizer (no editor) | none | none (jam only) | none | window handler wrote the tracker store |

## 3. What was wrong, and the level of the fix

Invariant violated: the song has one copy of each cell per view. Hively had two (native tracks drawn, tracker patterns written) and
the Hively view had no write path (`PatternEditorCanvas` got no `onFormatCellChange`), so every key reached only the copy nobody drew.
The same window handler wrote the tracker store in all 13 modes, and the format canvas wrote with a fixed `+1` row step, ignored
edit mode, record mode, edit step and playback row, kept its own octave (jam and write disagreed) and wrote the same 0-based number
for every format (Hively, GoatTracker, SID Factory II and MusicLine drew it one semitone low, CheeseCutter three, JamCracker
outside its range).

Levels considered: (a) make the Hively view draw the tracker patterns - rejected: the grid is a lossy projection (HVL effects map
many-to-one onto XM columns, two effects fold into one cell, per-position transpose folded into the note), the export reads
`hivelyNative`; (b) sync tracker -> native on every setCell - rejected for the same reason (uninvertible); (c) CHOSEN: the
native data owns the cell, the view draws and edits it, and the tracker patterns are projected from it with the importer's own
function (`hivelyStepToCell`, extracted from `convertHivelyToTrackerSong`) into every position that plays the edited track.
That also closes G17 for Hively (the grid shows what plays) and trips the grid-edited signal G19 reads.

## 4. Changes

- `formatEntryPlan.ts` (new): the edit/record/jam rule; `typedPitch` (FT2 key layout, one table: NOTE_MAP).
- `formatModeKeyOwnership.ts`: `ENTRY_OWNER`, `windowHandlerWritesCells`.
- `useNoteInput.ts`: window handler only jams unless it owns the mode; `enterNote` uses `planNoteEntry`. `useTrackerInput.ts`: effect/instrument digits likewise.
- `PatternEditorCanvas.handleFormatKeyDown`: note, hex and Delete entry follow the plan; octave is the editor store's; hex columns take their digits before the cursor moves (it moved a row per digit).
- `ColumnDef.noteBase / noteMin / noteCount` + `typedNoteValue`: the value of C-0 per format (Hively, GT, SF2, MusicLine 1; CheeseCutter 3; JamCracker C-1..B-3; Hively B-4 top).
- `hivelyEdit.ts` (new), `HivelyView` passes `onFormatCellChange`; undo, redo, insert row, delete row also project.
- `useTrackerStore.setCell(..., patternIndex?)`: an edit that echoes into another position.

## 5. Tests (all in test:ci globs: src/engine/__tests__, src/hooks/__tests__)

- `formatEditEntry.test.ts`: the plan (edit off / stopped+step+wrap / recording+quantize / hex), `ENTRY_OWNER` covers all 13 modes counted from the union, and per canvas-owned mode (7) a typed C-3 / F#2 is drawn as typed by that mode's own formatter.
- `hivelyEditOneStore.test.ts` (real amanda.ahx): a typed note shows in the rendered view data and in every tracker pattern that plays the track (transpose folded); fx; undo; insert row; shared tracks.
- `formatModeKeysDoNotWriteTrackerGrid.test.tsx`: through the real window handler (renderHook useTrackerInput): classic writes at the cursor and steps; hively writes nothing and leaves the cursor; record off writes nothing. Revert-checked (gate forced open: the hively case fails).

## 6. Open items (each is a new line in the fix-all plan)

- P14b Engine hearing of a Hively edit is G19's row for Hively: the edit now lands in hivelyNative (what the exporter writes) and in the tracker grid, but no test plays the edited song through the Hively engine.
- P14c GTKeyboardHandler (GoatTracker's own handler) was not audited against the rule (edit step, record at the playback row).
- P14d Per-mode "typing writes the engine's data at the cursor row" is tested for Hively only; the other canvas modes are tested for the value they write and for the window handler staying out, not through their engines.
- P14e MaxTrax has no keyboard entry (double-click only): decide whether it should get one.
- P14f Klystrack's handleCellChange mutates `klysNative` in place and re-spreads it (no undo); not changed.
