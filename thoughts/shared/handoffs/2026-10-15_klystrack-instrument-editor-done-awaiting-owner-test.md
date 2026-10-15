---
date: 2026-10-15
topic: Klystrack instrument editor - 27 of 27 done, owner test pending, push held
tags: [klystrack, instrument-editor, synth-layouts, handoff]
status: final
---

# Klystrack instrument editor - handoff (session 3)

## Task(s)

- KLYS-INSTRUMENT-EDITOR (plan `thoughts/shared/plans/2026-10-15-klystrack-instrument-editor.md`, status implemented): **27 of 27 done**. KIE-4.1..4.5 and KIE-6.1..6.3 closed this session in `ed8fccfd7`.
- KLYS-CONFORM: committed (b63dfcc23 19277452b bc89c894a), owner test still pending.
- Nothing pushed. Live buildHash `4f41c8da`. Local unpushed: `308048b3e..ed8fccfd7` (15 commits). Both owner tests gate the push.

## Critical references

- Plan above; research `thoughts/shared/research/2026-10-15_klystrack-instrument-model.md`; previous handoff `2026-10-15_klystrack-instrument-editor-p4-wip.md`.
- Ledger `thoughts/spot/todos.md` (gitignored), last ~5 lines.
- Editor: `src/components/instruments/controls/KlysControls.tsx` (glue), `src/constants/synthLayouts/klystrack.ts` (layout from KLYS_FIELDS + KLYS_FLAG_BITS), `src/components/klystrack/klysLayoutAdapter.ts` (values + diff -> editKlysField / toggleKlysBit), header rename in `SynthTypeDispatcher.tsx` klystrack block.
- Tests: `src/components/klystrack/__tests__/klysLayoutAdapterReachesTheEditPath.test.ts`, `src/components/instruments/__tests__/klystrackInstrumentEditorReachesTheSave.test.tsx` (R1). Both in `test:ci`, both revert-checked red.

## Recent changes

- `ed8fccfd7`: P4 editor. R1 drives UnifiedInstrumentEditor -> Cutoff knob (ArrowUp x3), Filter switch, program step via the mocked canvas's `onFormatCellChange` -> real worklet -> serializeSong -> fresh worklet reload. Only `PatternEditorCanvas` is mocked.
- Type-check clean; eslint clean on the new files.

## Learnings

- DOMSynthPanel draws a toggle as an ON/OFF button under a label, not `aria-label`. Test finds it via the label text's parent (section header has the same word).
- macOS `sed -i` needs `-i ''`; `sed -i "script"` eats the script as the backup suffix.
- `thoughts/spot/` is gitignored: ledger edits never enter a commit.
- The commit swept earlier uncommitted dispatcher changes with it.
- Pre-existing lint in `SynthTypeDispatcher.tsx`: 2 errors (`any`, lines ~702, ~706), many hook-dep warnings. Untouched.
- Not verified in a real browser this session.

## Next steps (ordered)

1. Owner manual test at `http://localhost:5174` (LOCAL): reload tab, load `Ocean Loader III.kt`, open instrument 2. Cutoff knob and Filter switch audible while playing; type a program step, marker follows playback; rename in header; piano-key audition; save, reload, edits persist. Plan "Verification > Manual" has the 8 steps. Plus KLYS-CONFORM: scopes, VU meters, matrix step, no extra view buttons. PASS = all work; do not test while an agent edits (HMR crash risk).
2. On pass: push batch (use ServerAliveInterval; confirm via `git ls-remote`), confirm live via `version.json` buildHash.
3. Follow-ups (not started): KLYS-WAVETABLE-EDITOR, KLYS-INSTRUMENT-FILES, KLYS-INSTRUMENT-SLOTS, DUP-AUDIT row 8 -> InstrumentTableEditor.
4. Queue: KLYS-EDITS-LOST-ON-PLAY, audit row 6 view shells (FormatInfoBar), PITCH-SLIDER-ALL-FORMATS S2, SF2-MATRIX-TRN-ENTRY, AUDIO-NODE-LEAKS, STARTUP-JINGLE-MISSING.

## Other notes

- Owner decisions: use the house synth layout UI (SynthPanelLayout + DOMSynthPanel); audition on channel 31 approved.
- Many unrelated untracked files in the tree (third-party/aylet-0.5, other research docs). Commit by path only.
