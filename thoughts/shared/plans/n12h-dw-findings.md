---
date: 2026-11-02
topic: N12h David Whittaker New Song template - a typed note on any row
status: partial
---

# N12h findings

## Measured (template = apb.dw blanked, 45810 B, 16-bit pointers, new player)
- Grid row = one replayer tick. Subsong 0 header at file offset 2194: u8 speed 3, u8 delay speed 0x18, then the
  four position-list pointers 08e2 08e6 08f8 08fc (2274, 2278, 2296, 2300).
- Speed 3 plus the global delay counter (davidwhittaker.c play_tick: a frame skipped when the counter passes 255)
  plus 2 unit waits put the slots at ticks 0,6,13,19,26,33,39,46: rows 4, 8, 12 were refused ("between them").
- A split grows the track at file end; the file is past 0x8000 and a 16-bit list word with bit 15 set ends the list
  (load_position_list), so the split fails ("past the 32 KiB").
- 0x83 (DW_EFFECT_WAIT_UNTIL_NEXT_ROW, walk kind waitRow) ends the read run without muting: a hold slot.
- Voice 1's track 2304 has 8 slots and loops; its list repeats it. Tracks are shared by passes (G17).

## Violated invariant
In the blank template every grid row of the first pattern must be its own note slot the replayer reads (no frame
skipped, no slot shared with another row), and a typed note must sustain. Fix level: the template bytes (generator),
plus the edit path and parser treating the hold as a note slot.

## Done (uncommitted)
- makeNewSongTemplates.test.ts: dwEveryRowASlot after dwBlankTemplate - subsong 0 speed 1, delay speed 0, every wait
  1 unit, every mute -> 0x83 hold; verified by re-walk. public/templates/davidWhittaker.dw regenerated (verdict
  written in 2026-11-01-new-song-templates.json).
- davidWhittakerEdits.ts: isNoteSlot and the in-place note lookup accept waitRow.
- DavidWhittakerParser.ts: a walk of holds only still opens as a grid.
- davidWhittakerAddNote.test.ts: test "a note typed on ANY row of the blank New Song template ..." (rows 0,1,4,8,12)
  replaces the old mute-only template test. Fails on the old template (no hold on any typed row).

## Still failing
With the new template every row is a slot, but voice 1's track has only 8 slots and loops: row 8 and row 0 are the
same byte ("conflicts with ... row 0 note on the same command byte"). Rows 0..7 work; rows 8.. alias.

## Next step (not done)
Give each voice of subsong 0 its own 64-slot track below 0x8000: [sample/envelope commands in force][0xe0][0x83 x 64]
[0x80], repoint the voice's first list entry, end the list after it. apb.dw has no room below 0x8000 except by
overwriting the track region 2304..~3700 (other subsongs would then have to be dropped from the header), so either
source the template from a small 16-bit module (garfield2+.dw, 14602 B, leaves ~18 KB pointer headroom) via a
generator-local source override, or rewrite the track region and keep only subsong 0.

## Rebuild result (INCOMPLETE, hand-back)

State: generator code written, template NOT regenerated (public/templates/davidWhittaker.dw still the old 45810-byte apb file).

Changed (uncommitted):
- src/lib/export/__tests__/makeNewSongTemplates.test.ts: generate() uses DW_TEMPLATE_SOURCE (garfield2+.dw) for davidWhittaker; dwEveryRowASlot builds per voice a track (prologue, wait 1, 64 x 0x83, end), appends it, writes a one-entry position list over the voice's own list in place, sets speed 1 / delay 0. Self-checks pass on the built bytes (subsong 0 walks 65 ticks, no note, waitRow on ticks 0..63 for all 4 voices; ~35 ms).
- src/lib/import/formats/davidWhittakerEdits.ts, DavidWhittakerParser.ts (waitRow-only walk opens as grid), src/engine/__tests__/davidWhittakerAddNote.test.ts (rows 0,1,4,8,12 test): earlier work, unchanged this round. Debug traces removed.

Open blocker: generator hangs (100% CPU, >400 s) in the reparse step, inside parseDavidWhittakerFile before the grid step.
Measured: with position lists appended at file end, dwSubsongCount returned 17 (original 3) because the C replayer ends the subsong table where the lowest position list starts (davidwhittaker.c ~1186 min_position_offset); repointing raised that minimum, so garbage "subsongs" 3..16 were read and walkDavidWhittaker on s3 never returned (chooseFileSubsong walks every subsong). Fix applied: lists written in place so header pointers stay low. Hang STILL occurs after that fix, so cause unconfirmed; next step is a probe printing dwSubsongCount and per-subsong walk timing on the bytes the generator builds (dump `out` to scratchpad before parseAs), and timing scanDWStructures / chooseFileSubsong separately.
Not run: AddNote test, newSongTemplateDispatch test, type-check, revert check.

## Rebuild result 2

**Hanging loop.** Not the reparse (garfield2+.dw reparses in 4-5 ms per subsong). The hang is the final `walkDavidWhittaker` of the built bytes, inside WASM `dw_walk` -> `play_tick` -> `read_track_commands` -> `do_track_command(0x80)` -> `do_effects` -> `handle_end_of_track_effect`. Found with a native clang build of `davidwhittaker.c` plus lldb.

**Cause.** The built file's voice 4 track ended on the file's last byte. `load_track` refuses such a track (commit 3a8e8134a: two spare bytes), so `load_position_list` failed and left `position_list_length == 0`. That voice stands on the one-byte `empty_track[] = {0x80}`; its end-of-track command wraps to the same empty track, so no command ever ends the row and one tick never returns. The tick loop was bounded by max_ticks, a single tick was not. Any file with a zero list pointer or a refused track froze the app.

**Fix.**
1. `davidwhittaker-wasm/src/davidwhittaker.c`, `read_track_commands`: `if (ch->position_list_length == 0) return;` (a voice with no track is left alone). Rebuilt with `davidwhittaker-wasm/build.sh`; only `public/davidwhittaker/DavidWhittaker.wasm` changed.
2. Generator (`dwEveryRowASlot` in `src/lib/export/__tests__/makeNewSongTemplates.test.ts`): append two spare bytes, and leave the vibrato start out of each voice's copied prologue (voice 2 on the wrap tick ran loop + envelope + transpose + vibrato (2 entries) + row wait = 6 entries for 5 effect columns, so the song opened with no grid).
3. `public/templates/davidWhittaker.dw` regenerated (14882 bytes, was the 45810-byte apb file).

**Test.** New `src/lib/import/formats/__tests__/davidWhittakerNoTrackVoice.test.ts`: garfield2+.dw with voice 4's subsong-0 pointer zeroed must walk in under 5 s with no events on voice 4 and unchanged events on the others. Old wasm: hangs (timeout rc 124). New wasm: tens of ms. Generator before fix: more than 400 s, no result; after: under the 200 s test timeout.

**Results.** `davidWhittakerAddNote.test.ts`, `formatInstrumentSets.test.ts`, `davidWhittakerNoTrackVoice.test.ts` pass; DW rows 0, 1, 4, 8, 12 take a typed note. `newSongTemplateDispatch.test.ts` has one failure outside DW: "every starter instrument a system preset offers carries audio" (Lead has no audio), the instrument work of another agent.
