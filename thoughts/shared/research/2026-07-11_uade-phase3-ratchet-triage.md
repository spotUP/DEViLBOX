---
date: 2026-07-11
topic: uade-phase3-ratchet-triage
tags: [uade, editability, phase3, ratchet, codec, triage]
status: final
---

# UADE editability Phase 3 — ratchet triage (actionable worklist)

Source: `src/engine/uade/__tests__/encoderRoundtrip.ratchet.json` (Phase 1 harness,
shipped 2026-07-08). This is the "review the initial ratchet report — it IS the
Phase 3 worklist" deferred step from Task 1.1.

## Read the method column first — it changes what a low % means

The harness measures three ways (`encoderRoundtrip.harness.test.ts:50-56`):

- **`decode-encode`** — `encodeCell(decodeCell(bytes)) === bytes`. PURE codec test.
  A sub-100% here IS a genuine encoder/decoder defect. **These are the real Phase 3
  targets.** (61 lossy.)
- **`encode-parsed`** — layout has no `decodeCell`, so it tests
  `encodeCell(parsedCell) === bytes`. This folds in parser normalization; a sub-100%
  is NOT proof the codec is lossy (the parser may legitimately drop info the cell
  can't hold). Investigate the parser first, not the codec. (3 lossy.)
- **`encode-pattern`** — variable-length block encoder vs the original pattern block.
  A whole-block miss can be framing/packing, not per-cell loss. (24 lossy.)

Counts: 4 byte-exact, 61 decode-encode/lossy, 24 encode-pattern/lossy,
3 encode-parsed/lossy, 41 registered-but-unexercised (no fixture).

## Caveat: compiled-composer "codecs" may be meaningless

Several `decode-encode/lossy` formatIds are Group-A COMPILED 68k composers whose
pattern offsets are runtime-determined (see `project_uade_editability_todo` memory):
robHubbard, fredGray, jasonPage, jasonBrooke, markCooksey, steveBarrett, coreDesign,
seanConnolly, wallyBeben, ronKlaren, davidWhittaker, daveLowe, benDaglish, etc. A
high match % for these can be UADE tick-reconstruction coincidence, not a truly
editable static layout. The plan's ground rule: "Never trust UADE tick-reconstruction
as pattern truth." Verify a format is a genuine static tracker layout BEFORE investing
a session — do not chase wallyBeben 99.6% just because it is close.

## Surgical quick-wins (genuine tracker formats, closest to byte-exact)

Highest match % = smallest defect = likely one field/effect-mapping bug. Confirm the
format is a real static-layout tracker (not a compiled composer) before starting.

| format | match% | cells | note |
|--------|-------:|------:|------|
| deltaMusic2 | 99.8% | 7168 | ~14 cells wrong — DeltaMusic 2 synth-tracker (dm1 already byte-exact-tested) |
| symphoniePro | 99.3% | 20480 | large fixture; already has an exporter regression test |
| soundfx | 96.9% | 256 | SoundFX — classic ST clone, small |
| graoumfTracker2_gt2 | 96.8% | 3072 | GT2 |
| stp | 96.0% | 4864 | SoundTracker Pro |
| jamCracker | 94.7% | 1280 | plan names it: note range 1-36 clamp (Task 3.x known target) |
| activisionPro | 91.9% | 1176 | Activision Pro |

## Zero-% pure-codec defects (bigger, but unambiguous)

`decode-encode` at 0.0% = the codec never round-trips a single cell. Either a real
inverse bug or a layout/offset mismatch. cells count in parens:
glueMon(171), midiLoriciel(256), plm(12288), ronKlaren(125, compiled), sidmon1(1536),
soundControl(2491), soundFactory(398). Then stm(0.2%), format669(0.3%),
digitalMugician(0.5%), infogrames(0.8%).

Note `stm`/`plm`/`far`/`mtm` are libopenmpt-family — check whether a UADE chip-RAM
codec is even the right editing path for them before treating as a Phase-3 codec fix.

## Per-session template (from the plan, Phase 3 Task 3.x)

1. Read the ratchet diff for the format — WHICH cells mis-round-trip (probe the real
   fixture; a per-cell diff of `encodeCell(decodeCell(bytes))` vs `bytes`).
2. Read the UADE ASM (`third-party/uade-3.05/amigasrc/players/…`) or OpenMPT
   `Load_*.cpp` (`/Users/spot/Code/Reference Code/openmpt-master`) for true cell
   semantics. NEVER guess.
3. Fix the codec/parser at the root (note range, effect map, packed framing).
4. Regenerate the ratchet (`DEVILBOX_GEN_RATCHET=1`), confirm the format improves and
   nothing regresses, commit ratchet + fix together. Add a regression test.

One format per fresh session (plan execution notes).
