---
date: 2026-10-06
topic: Sound Master grid - owner follow-up ("almost correct, not correct")
tags: [formats, sound-master, handoff]
status: draft
---

# Sound Master - handoff

## Done
- c2cc825a8: grid decoded from the module's own replayer data; byte-exact; every UADE note-on matched
  (period + tick) over whole songs; writeCell edits; player-tick playhead. Research:
  thoughts/shared/research/2026-10-06_sound-master-format.md
- Follow-up commit (this one): the info byte's non-musical bits are no longer shown as effects. K00
  (info bit 7, no transposes - the note shown is already the played note) was on 3412 rackney cells and
  I0x (info bits the player ignores on note-less rows) on 493; both are kept from the stored row by
  writeCell / the exporter. Round trip still byte-exact, all 12 Sound Master tests pass.

## Evidence on the owner's items (rackney'sisland 4.sm)
1. Note names: 0 of 7828 cells have a note whose ProTracker period differs from the player's table period;
   UADE plays exactly those periods (whole-song test).
2. Missing notes: the instruments rackney uses have no arpeggio/wave tables (byte 10 = 0 for all 11
   used); every UADE note-on (2038/1851/1503/2436) has a grid cell at its row; transposes, the per-voice
   instrument offset and finetune are applied to the shown note.
3. Extra notes: rackney has no legato or portamento rows; the shown note count per voice equals UADE's
   note-on count.
4. Effects/volume: the K/I pseudo-effects were the wrong-looking effects (fixed). Volume column = info
   bit 6 volume; instrument volume (attack level, envelope) is in the instrument, not the pattern.

## Next steps
1. Ask the owner for one concrete pattern/row/channel that is still wrong after this commit (with the
   app reloaded on localhost) - the measurements above show no note-level divergence for rackney.
2. Test asked for by the coordinator, not yet written: walk every DISPLAYED cell (not the raw bytes) ->
   shown note == played note, and every Paula note-on -> a shown cell at its row. The existing whole-song
   test derives the expected list from row bytes; switch gridNoteOns to the cells (note > 0, no L) and
   assert periodToNote(paula period) == cell.note.
3. Instrument envelopes/arpeggio/wave tables are not editable; doofus/futureshock use tables
   (instrument byte 10) - audible pitch changes from them are not in the grid.
4. Mirroring an edit to other steps showing the same pattern row (redraw) is open.
