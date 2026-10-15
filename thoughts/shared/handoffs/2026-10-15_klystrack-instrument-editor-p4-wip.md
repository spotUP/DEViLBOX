---
date: 2026-10-15
topic: Klystrack instrument editor - P1/P2/P3/P5 done, P4 WIP uncommitted, P6 open
tags: [klystrack, instrument-editor, synth-layouts, handoff]
status: draft
---

# Klystrack instrument editor - handoff

## Task(s)

- KLYS-INSTRUMENT-EDITOR (plan `thoughts/shared/plans/2026-10-15-klystrack-instrument-editor.md`): **19 of 27** done.
  - DONE: KIE-1.1..1.6, KIE-2.1..2.6, KIE-3.1..3.4, KIE-5.1..5.3.
  - OPEN: KIE-4.1..4.5 (WIP on disk, uncommitted), KIE-6.1..6.3.
- KLYS-CONFORM: committed (b63dfcc23 19277452b bc89c894a), owner test pending. That test gates the push.
- Nothing pushed this session. Live buildHash d3476ec4. Local unpushed: 308048b3e .. 7a02e490f (14 commits).

## Critical references

- Plan (KIE-4.1/4.3 revised today), research `thoughts/shared/research/2026-10-15_klystrack-instrument-model.md`.
- Ledger `thoughts/spot/todos.md`, last ~10 lines (KIE wave entries).
- Panel reference: DX7 block in `src/components/instruments/editors/SynthTypeDispatcher.tsx` (`getSynthLayout('DX7')` + `DOMSynthPanel`). `DOMSynthPanel` hands back the whole configKey root, so the adapter diffs before and after.

## Recent changes (commits, all unpushed)

- 5ff22b97d P2: WASM `klys_set_instrument_data`, wavetable info, `klys_preview_note_on/off` on channel 31 (`g_preview` decode gate), `klys_get_channel_program` (4 bytes per channel: instrument, program_counter, tick, running); program trimmed against NOP on save; worklet and KlysEngine wrappers; `packKlysInstrument`.
- 9b6af0984 P1: `klysInstrumentFields.ts` (KLYS_FIELDS, KLYS_FLAG_BITS ...), store undo stacks, `klysInstrumentEdit.ts` (one edit path, rAF-coalesced store write, immediate engine send), `KlysSynth(instrumentId)`, NKS params generated from the field table.
- 36151cce9 P3: `InstrumentTableEditor` (shared), `ColumnDef.readOnly`, `klysProgramCommands.ts` (63 rows from command.c), `klysProgramAdapter.ts`.
- aace02f56: format column colours given as design tokens reach the worker as the token value. The worker turned `var(--...)` into gray; the klystrack pattern view was affected too.
- 365e66a8c: program edits read the pending instrument (`readKlysInstrument`); the flush workaround is removed.
- 7a02e490f P5 + KIE-2.6: `instrumentsFrom` 'stub'/'engine'/'edited', reopened projects keep edits, schema 24 -> 25; keys preview on channel 31 (`klysNoteFromMidi` = clamp(midi - 12, 0, 95)); an unreadable instrument slot keeps its index.

## Uncommitted P4 WIP (agent stopped mid-way at "Now KlysControls (git mv first)")

- STAGED in the shared index: rename `src/components/klystrack/KlysInstrumentEditor.tsx -> src/components/instruments/controls/KlysControls.tsx`. The content is still the OLD editor and is not rewritten yet.
- Modified: `SynthTypeDispatcher.tsx`, `InstrumentTableEditor.tsx`, `src/constants/synthLayouts/index.ts`.
- New, untracked: `src/constants/synthLayouts/klystrack.ts`, `src/components/klystrack/klysLayoutAdapter.ts`, `src/components/klystrack/__tests__/klysLayoutAdapterReachesTheEditPath.test.ts`.
- State unknown. Run `npm run type-check` and review each file before continuing. Do not trust that these files are complete.
- The staged rename can be swept into another commit. Commit by path: `git commit -- <paths>`.

## Learnings

- `test:ci` lists `src/engine/__tests__/` as a directory, so new worklet tests there are covered automatically (one agent claimed otherwise; that claim is wrong).
- The tracker canvas renderers ignore `ColumnDef.formatter`. The program step's meaning is therefore shown as DOM text (cursor readout + command help), not as a canvas column.
- The plan's `-t KT` filter on the exporter harness matches nothing. Run the whole `exporterRoundtrip.harness.test.ts` (4 of 4 passed, ratchet unchanged).
- Dev server HMR picks up agents' half-written files. The owner saw a crash (`KLYS_FLAG_BITS` undefined) mid-P1. Tell the owner not to test while agents edit.
- Machine load hit 86. Other projects' sessions held FS-UAE (UP-Term), a Demo System pytest and AmiExpress jest. Agents must never search `/` or `$HOME`.

## Next steps (ordered)

1. Review the P4 WIP, then finish KIE-4.1..4.5 per the revised plan:
   - layout generated from KLYS_FIELDS + KLYS_FLAG_BITS, registered as KlysSynth;
   - `KlysControls` = glue (DOMSynthPanel + program section below);
   - playing-step marker from `subscribeProgramStatus`;
   - name edits through `renameKlysInstrument`;
   - test R1 + adapter test, red on revert.
2. P6: type-check, lint on touched files, test:ci membership, ledger 27 of 27, follow-up items (KLYS-WAVETABLE-EDITOR, KLYS-INSTRUMENT-FILES, KLYS-INSTRUMENT-SLOTS, DUP-AUDIT row 8 -> InstrumentTableEditor).
3. Owner manual test (plan "Verification > Manual", 8 steps) plus the KLYS-CONFORM test. Then push the batch, and confirm live via version.json buildHash.
4. Remaining queue: KLYS-EDITS-LOST-ON-PLAY, audit row 6 view shells (FormatInfoBar), PITCH-SLIDER-ALL-FORMATS S2, SF2-MATRIX-TRN-ENTRY, AUDIO-NODE-LEAKS, STARTUP-JINGLE-MISSING.

## Other notes

- Owner decisions today: use the established synth layouts UI (SynthPanelLayout + DOMSynthPanel) for the Klys editor, which supersedes the hand-built 3-column sections; audition on channel 31 stays approved.
