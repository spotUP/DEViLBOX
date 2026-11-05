# apb.dw goes silent after note deletes (2026-11-05)

Cause: a delete has no in-place byte write (applyDwGridEdits warns "a note removed ... needs a different command").
editedModuleForPlay then sees the exporter output unchanged and falls back to patchModuleByVariableLayout
(src/lib/export/layoutPatch.ts), which re-packs each edited voice block with davidWhittakerEncoder. That encoder
concatenates per-row carriers (cell.cutoff/period/pan/resonance) which the tick grid cells do not have, so it encodes
an empty block and the patch zero-fills the block's slot (12 bytes on the smallest delete in apb.dw). Zeroed
track bytes: the module scan no longer finds the song (no grid; dw_create fails).

Invariant: an edit with no byte form must leave the module byte-identical.
Fix: VariableLengthEncoder.canEncode (UADEPatternEncoder.ts); DW returns true only when rows carry command bytes;
patchModuleByVariableLayout skips blocks the encoder cannot encode.
Test: src/engine/__tests__/davidWhittakerDeleteNote.test.ts (fails with the guard removed: 12 bytes changed).
Open: deleting a note is still not persisted (needs a rest/removal command; applyDwGridEdits warns). Grid shows the
note again after reload. Separate feature.

## Rest write

Command: the mute track command, byte 0x82 (track byte & 0x7f = DW_EFFECT_MUTE = 2): davidwhittaker-wasm/src/davidwhittaker.c:24 (enum),
:1781-1784 (do_effects: walk event DW_WALK_MUTE, mixer_mute, `return true` = ends the read run), :1890-1915 (do_track_command routes
bytes >= 0x80 that are not wait/sample/envelope/arpeggio to do_effects). The note path (:1948-1953) breaks the read run the same way,
so a note and a mute are both one byte that ends the run and is timed by the wait in force (:1892-1895). Replacing the note byte with 0x82
keeps block length and every later onset. Parser table says the same: DavidWhittakerParser.ts:489 (-126 rest / note-off, 1 byte).
Old player (oldPlayer layout): effect 2 is a no-op there (:1757), so no write; a warning stays.
Write: davidWhittakerEdits.ts, the `n < 1 || n > 96` branch (note removed or note-off) writes DW_MUTE_BYTE over the note command byte;
the instrument diff of a rested cell is skipped (the sample no longer plays). Kept warnings: mute/hold slot edited to 0, old player.
Shared blocks: every pass that replays the block loses the note (module structure, as for other edits).
Test: davidWhittakerDeleteNote.test.ts 'apb.dw: deleting the first note of voice 1 ...' (length unchanged, byte 0x82, other onsets equal, reparsed cell 0/97).
Revert check: write disabled -> test fails (expected 28 to be 130). Restored -> passes with dwGridMatchesPaula (5 of 5).

### Export path check (owner saw deletes stay gone at bcd1f4bc8)
Export route: nativeExportRouter.ts 'layoutExporter' (~line 385) -> exportDavidWhittaker -> DavidWhittakerExporter.ts:56-66 path 1 = applyDwGridEdits only; no re-pack, no layoutPatch.
Measured at HEAD (copy of HEAD davidwhittakerEdits.ts run on apb.dw, voice 1 row 0 deleted): patched 0, 2 warnings "needs a different command; not written".
So the HEAD export writes no delete; the persisted deletion the owner saw did not come from the module bytes (likely the silent session restore of the edited grid; unverified).
No conflict or double apply: patchModuleByVariableLayout (editedModuleForPlay.ts:41) only runs when the exporter output equals the loaded bytes; with the mute write the exporter output differs, so the fallback is skipped.

## Sync offset after edit

Status: STOPPED, no fix. Owner correction: the offset is probably there on a plain load too.

Offline measure (plain apb.dw tune 0, UADE Paula note-ons vs grid onsets, first 18 s, scratch test since deleted):
- voice 1: 64 grid notes, all 64 paired to a Paula note-on, mean signed offset (paula - grid) +3.8 ms, range -18..+20 ms.
- voice 2: 64 of 64 paired, mean +4.3 ms, range -18..+20 ms. First onset grid 0.000 s, Paula 0.000 s.
- voices 3 and 4: silent in the grid, as in dwGridMatchesPaula (Paula's 8.5 s notes there are UADE's next tune).
- The +-20 ms spread is the oracle's 20 ms chunk. The grid is therefore NOT offset against the original player (about 4 ms). The edit path was not measured, because the plain-load offset already points elsewhere.

Candidates for the live offset (not measurable offline, not verified live):
1. The David Whittaker WASM engine reports no position (DavidWhittaker.worklet.js has no position message; DavidWhittakerEngine.ts has no onPositionUpdate). So coordinator.hasActiveDispatch stays false and the grid cursor is driven by the TS scheduler (TrackerReplayer.ts:2799-2815 falls through to startScheduler). The scheduler clock starts at Tone.now()+0.02 (TrackerReplayer.ts:3050), AFTER the worklet got its play message (NativeEngineRouting.ts:654 instance.play()), with awaits in between (openEngineRouting, awaitPendingLoads, the rest of play()). Audio and cursor are two free-running clocks started at different instants; the gap is a constant offset for the whole run, and the cursor lags the sound by that gap. The cursor is queued at scheduled time + outputLatencySec (TrackerReplayer.ts:3187, audioLatency.ts), but the worklet audio goes through the same output latency itself, so the latency term does not cancel the start gap.
2. Edited-module restart (swapModule, DavidWhittakerEngine.ts:112 / worklet.js:145-170) catches the new handle up to framesPlayed, so it keeps the audio position; the grid cursor is not re-anchored by it.
Formats that report position (HVL, MusicLine, Klystrack, TFMX via reportEnginePosition) do not have this gap: their cursor is the engine position. Fix level would be: DW worklet reports its row/position (frames played mapped through the grid), like the other engines, or the scheduler is anchored to the worklet start. Needs a live measure of the gap first (instance.play() time vs startScheduler time) via MCP in Chrome.

## Sync offset live fix

Status: NOT FIXED. Live gap not measured; no code changed.

Found (code):
- Engines that report position (HVL, TFMX, Hippel, MusicLine, Nuade, ~25 others) expose `onPositionUpdate` and NativeEngineRouting.ts:749-770 feeds `reportEnginePosition` -> coordinator.markDispatchActive -> TS scheduler skipped (TrackerReplayer.ts:2811). Nuade maps its player tick to a grid row ('tick' follow mode, NuadeEngine.ts:35,162). No per-format hand-tuned time constants were searched exhaustively (only the position-report pattern was confirmed).
- DW: the WASM exports (dw_create, dw_render_multi, dw_select_subsong, dw_has_ended, ...) expose no row/tick position. The worklet only knows `framesPlayed` (JS side). A position report needs either a new C export (davidwhittaker-wasm rebuild) or frames -> ticks -> row through stepRowClock with the song's speed changes.

Live attempt (apb.dw, MCP play): worklet 'play' message was observed (MessagePort hook). The page-side probes could not reach the app's own TrackerReplayer / transport store: `import('/src/...')` from evaluate_script yields a second module copy (peekTrackerReplayer() null while playing, store never changed, startScheduler wrap never fired). So the audio-start vs cursor-start gap is still unmeasured. A probe needs an MCP tool or a window hook exposing the app's replayer.getStateAtTime(peek) and the worklet play time (AudioContext.currentTime), then compare.

Next step: add a read-only MCP/window probe for the real replayer display state, measure the gap, then decide between (a) worklet frame-count position report mapped via stepRowClock, (b) C-side tick counter export.

## Sync offset position report

Cause: the David Whittaker engine reported no play position, so TrackerReplayer used the free-running TS scheduler for the grid playhead; it drifted against the audio on apb.dw.
Fix: dw_played_ticks (C export, counts processed play_tick calls, reset in initialize_sound) -> worklet posts 'playTick' when it changes -> DavidWhittakerEngine maps ticks to {songPos,row} with the song's row clock (dwGridPosition) and exposes onPositionUpdate -> NativeEngineRouting's generic path calls reportEnginePosition. The clock (speed changes + pass length) rides on TrackerSong.davidWhittakerClock and reaches the engine through getLoadArgs for loadTune and swapModule.
Test: src/engine/__tests__/davidWhittakerPlayheadFollowsEngineTick.test.ts; fails with the worklet change reverted and with the engine emit removed.
Live MCP check: not done, the browser kept disconnecting from the MCP bridge. Human check: http://localhost:5174, load apb.dw, play, the cursor must stay on the audible row.
Found: davidWhittakerGridEdits.test.ts "an edit the module cannot hold is refused" (2 cases) fails; it expects a note removal to be refused, but commit 902e9767b now writes it as a mute command. Stale test, not touched here.
