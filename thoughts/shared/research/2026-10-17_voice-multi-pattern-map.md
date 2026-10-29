---
date: 2026-10-17
topic: Voice to Notes multi-pattern take (VNR-27) - undo consumers and take bounds
---

# Voice multi-pattern map

## A. Undo/redo consumers

`useHistoryStore.ts:130-175`: `undo()` returns `action.beforeState`, `redo()` returns `action.afterState`. No index returned; every caller applies it itself (five copies).

| file:line | index used | how |
|---|---|---|
| `src/App.tsx:532,541` | `currentPatternIndex` (render capture) | `replacePattern` |
| `FT2Toolbar.tsx:115,121` | `currentPatternIndex` (getState) | `replacePattern`; NavBar.tsx:199-200 calls it via ft2Actions |
| `bridge/handlers/writeHandlers.ts:1302-1322` | `currentPatternIndex` | `replacePattern`; MCPBridge.ts:387 |
| `hooks/tracker/useTrackerInput.ts:282,295,311` | `action.patternIndex` via getLastAction | only correct caller |
| `engine/keyboard/commands/history.ts:12,33` | `currentPatternIndex` | `replacePattern` + status |
| `hooks/useMIDIActions.ts:131,134` | none, result discarded | pattern never applied (bug) |
| `components/tracker/UndoHistoryPanel.tsx:51,60,90,120` | none, result discarded | stacks move, nothing applied (bug) |

`applySong.ts:217` only `clearHistory()`. 43 `pushAction` calls, each one `patternIndex`.

## B. Take bounds

- `VoiceToNotesPanel.tsx:196` rowCount = current pattern length.
- `:434` rowLength = rowSeconds(bpm, speed); `quantise.ts:68` = speed*2.5/bpm.
- `:436` patternSpan = max(0, rowCount - startRow) * rowLength.
- `:609-616` waveform spanSeconds=patternSpan; NoteRoll max(patternSpan, live/take seconds); label "pattern X s from row N".
- `:295` handleStop manual only; no auto-stop at pattern end.
- `:360-378` handleCommit target {channelIndex, startRow, instrumentId}; toast "N past the end of the pattern".
- `:427-430` preview via drumPreview/melodyPreview with rowCount.
- `voiceToNotes.ts:42-56`, `drumToNotes.ts:125-136` call writeNotesToPattern.
- `writeToPattern.ts:70-150` takeCells is the only bound; writeNotesToPattern = bulkBlockEdit on current pattern.
- `takePreview.ts:18-20` snapshot calls takeCells.
