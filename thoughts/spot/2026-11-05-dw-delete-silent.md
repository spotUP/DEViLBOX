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
