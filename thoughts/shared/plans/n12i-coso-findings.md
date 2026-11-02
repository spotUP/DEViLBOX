---
date: 2026-11-02
topic: N12i Hippel CoSo blank template, typed note silent
status: fixed (uncommitted)
---

# N12i: typed note on the blank Hippel CoSo template does not sound

## Symptom
New Song > Hippel CoSo, type C-3 instrument 1 on row 0, Play: silent (first play one blip, rms avg 0.000007).
Console: `[rowPreviewPrefetch] Error: nuade open failed (-2): not a valid Jochen Hippel COSO module` and
`[NativeEngineRouting] Failed to start Nuade: DataCloneError: ... Value at index 0 does not have a transferable type.`

## Cause 1: template song table has no end entry (writer bug)
- .hipc plays on nuade by default (src/engine/nuade/nuadeFormats.ts row `hippel`, nuadeVerdicts.ts `defaultEngine "nuade"`).
- nuade COSO player, third-party/nuade/players/hippel/hippel.c uade_module_valid (line ~623):
  `subsong_count = (samples(0x18) - subsongs(0x14)) / 6 - 1`, must be >= 1.
- Real files end the song table with an all-zero 6-byte entry (prehistoric_tale.hipc 0x3cc: `0000 001d 0007 | 0000 0000 0000`).
- buildCoSoFile (src/lib/export/HippelCoSoExporter.ts) wrote `songsSectionSize = 6`: one entry, no end entry, so
  the template (24932 B, songs 0x622, sample table 0x628) had 0 subsongs and nuade refused it.
- Invariant: an exported COSO module carries subsongs + 1 song-table entries, the last all zero.
- Fix: songsSectionSize = 12 (output is zero-filled, so the end entry is zero). Template regenerated with
  `DEVILBOX_GEN_TEMPLATES=1 DEVILBOX_GEN_FORCE=hippelCoSo` (24938 B, song table `0000001d0006 000000000000`).
  Our parser (HippelCoSoParser numSongs, readCoSoSongs skips length <= 12 entries) tolerates the end entry.

## Cause 2: engine load gets a Uint8Array view (routing bug, all engines)
- engineLoadArgs (src/engine/replayer/NativeEngineRouting.ts) copied an edited module that came back as a
  Uint8Array (editedModuleForPlay layout writers) with `Uint8Array.slice(0)`: still a view. NuadeEngine.loadTune
  posts it with a transfer list `[moduleData]`: DataCloneError, Nuade never starts after any grid edit.
- Invariant: engines load an ArrayBuffer of their own (loadTune(moduleData: ArrayBuffer)), as engineModuleSwap already does.
- Fix: engineLoadArgs returns `fileData.slice().buffer` for a Uint8Array; return type `data: ArrayBuffer`.

## Tests (both fail with the fixes reverted, pass with them)
- src/lib/export/__tests__/hippelCoSoTemplateTypedNoteSounds.test.ts: cleared-grid export of prehistoric_tale
  has player subsong count 1 and the zero end entry; shipped template has subsong count 1.
- src/engine/replayer/__tests__/engineLoadArgsAreWhatPlayLoads.test.ts: added assertion that loadTune receives
  an ArrayBuffer (fails "edited since the load" on revert).

## Live (MCP, localhost:5174)
new_song hippelCoSo, set_cell ch0 row0 C-3 instr 1, play: rms avg 0.0777 (max 0.154), console "Nuade loaded & playing",
no Nuade errors. Stop, play again: rms avg 0.130. Stopped, notes released.

## Open
- Unverified: a note typed while the song plays (engine-swap live edit on Nuade); only typed-then-play measured.
- clickPerMillion 2205-3365 on the play; not checked against the source song.
