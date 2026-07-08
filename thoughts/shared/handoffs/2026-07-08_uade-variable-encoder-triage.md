---
date: 2026-07-08
topic: uade-variable-encoder-triage
tags: [uade, editability, encoder, phase-3, triage]
status: final
---

# UADE variable-encoder Phase-3 triage (benDaglish, hippelCoSo, it, s3m, xm, musicLine) + digiBooster

## Task

Phase 3 of `thoughts/shared/plans/2026-07-07-uade-full-native-editability.md`: resolve the
variable-layout re-packer encoders scoring ~0% on the encoder round-trip
(`src/engine/uade/__tests__/encoderRoundtrip.ratchet.json`), plus the digiBooster exporter
quick win. Per instructions, triage each ~0% as either **(A)** a real data-loss bug (fix at
root) or **(B)** a measurement artifact (re-serializer produces different-but-valid bytes
that still round-trip the cells → add an honest pattern-data tier, don't fake byte-exact).

## Result summary

- **digiBooster exporter — LANDED** (commit `87754fc85`). At its true max (99.94%),
  documented + regression-pinned. Not an off-by-one.
- **The six variable encoders — NEITHER clean A nor clean B.** Rigorous parse→encode probe
  proves every one is an **incomplete or non-invertible per-block encoder**, not a case-B
  re-serializer. Their real editability path is the **full-file exporter** (already
  measured by the exporter harness), not the per-block `encodePattern`. No fake pattern-data
  tier was added; no ratchet was loosened or faked.

## Evidence (parse→encode probe on each fixture)

Method: parse the committed fixture, take `song.uadeVariableLayout`, and for each mapped
file-pattern compare `encoder.encodePattern(rows, ch)` to the original block bytes
(lengths + hex). Findings:

| formatId | native block | encoder output | verdict |
|----------|--------------|----------------|---------|
| `it` | whole pattern, ALL 25 channels interleaved (channel bytes `0x81..0x90`) | ONE channel only (`0x81…`), ~40 B vs 56–485 B | encoder cannot represent the block (per-channel vs multi-channel) |
| `s3m` | whole pattern, all 8 channels interleaved (`a0…`, `81…`) | one channel, 78 B vs 201 B | same — per-channel vs multi-channel |
| `xm` | whole pattern, all 4 channels row-interleaved | one channel, 126 B vs 550 B | same — per-channel vs multi-channel |
| `musicLine` | packed variable-length (212 B, 9 B for 1-row patterns) | **fixed 1536 B** regardless of row count | encoder emits a fixed grid, not the packed stream |
| `benDaglish` | per-channel byte stream w/ `0x80+` sample-map + per-step transpose | notes kept but `0x80+` cmds dropped, durations re-derived | lossy: instrument (`0x80+`) + per-step transpose not invertible |
| `hippelCoSo` | per-channel stream w/ `fd/fe` loop cmds + per-step transpose | loops expanded to literal rows, notes shifted by transpose (orig `0x13`→re `0x1f`) | lossy: loop framing + per-step transpose not invertible |

Root causes:
- **it/s3m/xm**: `encodePattern(rows, channel)` is a *per-channel* API, but IT/S3M/XM store a
  pattern as one interleaved block over ALL channels. The encoder structurally produces
  ~1/N of the block, so both byte-exact AND parse-reparse fail. These are libopenmpt PC
  formats — not chip-RAM edited via `encodePattern` at all.
- **musicLine**: encoder emits a fixed-size grid; the native format is a packed
  variable-length stream (`MusicLineParser`). Encoder never matches.
- **benDaglish / hippelCoSo**: both bake a **per-song-step transpose** into the decoded cell
  note (`BenDaglishParser` `transposedNote = (note + transpose) & 0x7F`; `HippelCoSoParser`
  `cosoNoteToXM(noteVal, trackTransp)`). The per-block encoder has no transpose argument, so
  it cannot recover the stored note when the same block is shared across steps with
  different transposes. They also drop non-note framing (BD `0x80+` sample-mapping cmds;
  CoSo `fd/fe` loop cmds).

Conclusion: **case (A)-adjacent (genuinely lossy/incomplete), NOT case (B).** A pattern-data
tier over these encoders would either be circular (self-inverse proves nothing about the
replayer) or, via parser-reparse, score ~0 (single-channel splice corrupts the block). None
qualifies for the "editable, just re-serializes" honest remeasure.

## The real editability path already exists (and is measured)

Full-file exporters, measured by `exporterRoundtrip.ratchet.json`, ARE the editability
contract for these formats and already round-trip well:

- `hippelCoSo` → `HippelCoSoExporter.exportAsHippelCoSo`: **99.32%** (regression test exists).
- `musicLine` → `MusicLineExporter`: **76.84%**.
- `xm` → `XMExporter`; `hivelyHVL` → 100%.
- (`benDaglish`, `it`, `s3m` have no dedicated exporter yet.)

So the per-block variable encoders are a **secondary / partly-vestigial** mechanism. The
0% in the encoder ratchet is HONEST for what they are.

## digiBooster detail (landed)

`exportDigiBooster` writes DBM0; `rawNote = xmNote − 12`, parser reads `xmNote = rawNote + 12`
→ lowest DBM0 note is C-0 = app-note 13 (OpenMPT `Load_dbm.cpp`: `((note>>4)*12)+(note&0xF)+13`).
The 9 residual mismatches (0.06%) are all app-notes ≤12 (octave −1) that DBM0 cannot store —
they only appear because the committed fixture is a DigiBooster **1.x** `.digi` (period-table
parse → octave −1 bass) baked into a DBM0 export. A native `.dbm` has no such notes. This is
the true max, not a codec bug. Regression test asserts `badMismatch === 0` (only octave −1
losses); revert-check `note-12`→`note-13` makes `badMismatch` jump 0→1278. Doc:
`docs/formats/DigiBooster.md`.

## Recommendation for the next wave (not a one-session job)

1. **it/s3m/xm/musicLine**: either (a) route their editability through the full-file
   exporters (extend `XMExporter`; add IT/S3M exporters) and treat the per-block
   `encodePattern` as non-contractual, OR (b) rewrite `encodePattern` to a *whole-pattern
   (all-channel)* serializer and change the variable-layout contract to pass the full
   pattern, not one channel. Option (a) is the smaller, lower-risk path and matches how the
   app already edits these (libopenmpt re-export).
2. **benDaglish/hippelCoSo**: give the variable-layout / encoder the per-step transpose (and
   preserve `0x80+` / `fd/fe` framing) so the block is invertible, or accept that only the
   full-file exporter is the editability contract (hippelCoSo already at 99%).
3. Only after (1)/(2) is a pattern-data tier over the encoder harness meaningful.

## Files

- Commit `87754fc85`: `src/lib/export/__tests__/exporterRoundtripRegressions.test.ts` (+test),
  `docs/formats/DigiBooster.md`.
- Ratchets left UNCHANGED (no loosening, no fake numbers).
- Full `test:ci` green (145 files / 3441 tests). `npm run type-check` clean.
