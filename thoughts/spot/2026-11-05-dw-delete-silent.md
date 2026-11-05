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
