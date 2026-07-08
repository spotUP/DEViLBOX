# DigiBooster

**Status:** EDITABLE (export lossy at the format floor — see below)
**Parser:** `src/lib/import/formats/DigiBoosterParser.ts`
**Exporter:** `src/lib/export/DigiBoosterExporter.ts` (`exportDigiBooster`)
**Extensions:** `.digi` (DigiBooster 1.x), `.dbm` (DigiBooster Pro / DBM0)
**UADE name:** DigiBooster (via `DIGI`/`DBM0` prefix match)
**Reference:** `third-party/openmpt-master/soundlib/Load_dbm.cpp`

---

## Overview

`DigiBoosterParser.ts` handles two related formats:

- **DigiBooster 1.x** (`.digi`, magic `DIGI Booster`) — Amiga period-table note events.
  The parser decodes notes via the Amiga period table (`note = periodToNoteIndex + 1`),
  so its note range starts at app-note 1 = C-1.
- **DigiBooster Pro** (`.dbm`, magic `DBM0`) — chunked IFF (`INFO`/`SONG`/`INST`/`PATT`/
  `SMPL`). Pattern notes are stored as a raw byte and decoded as `xmNote = rawNote + 12`,
  so DBM0's lowest note is `rawNote 1 → app-note 13 = C-0`.

`exportDigiBooster` always writes the **DBM0** container (it is the modern, richer form).

---

## Export round-trip and the note floor

`exportDigiBooster` is the inverse of the DBM0 parse path: it writes
`rawNote = xmNote > 12 ? xmNote − 12 : 0`, which the parser reads back as
`(xmNote − 12) + 12 = xmNote`. Every app-note **≥ 13 round-trips exactly**, together
with instrument, effect type and effect parameter.

**App-notes 1..12 (octave −1) have no DBM0 encoding.** DBM0's note byte is
`raw + 12`, so the lowest representable note is `raw 1 → app-note 13 = C-0`. OpenMPT's
DBM loader confirms the same floor — it decodes the note as
`((note >> 4) * 12) + (note & 0x0F) + 13`, i.e. a `+13` base with no room below C-0.
An octave−1 note therefore cannot be stored; the exporter writes 0 (empty) and it
re-parses as an empty cell.

This is a **format limitation, not a codec bug.** It only surfaces here because the
committed fixture (`the day after.digi`) is a *DigiBooster 1.x* file whose period-table
parse produces octave−1 bass notes (app-notes 9 and 12) that are then baked into the
*DBM0* export. A native DBM0 source never contains octave−1 notes (its own parse floor is
C-0), so it exports byte-clean.

### Measured

- Exporter round-trip (parse → export → re-parse, cell-level): **99.94 %**
  (`exporterRoundtrip.ratchet.json` → `digiBooster`).
- The 0.06 % residual is exactly the octave−1 notes above — no note ≥ 13, and no
  instrument/effect, is lost. This is the **true maximum** for this cross-format bake.

Guarded by `src/lib/export/__tests__/exporterRoundtripRegressions.test.ts`
("DigiBooster export round-trips every representable cell…"): the test asserts the only
mismatches are dropped octave−1 notes (`badMismatch === 0`), so any real codec regression
(wrong note offset, dropped instrument/effect) fails it even though the headline % is
unchanged.

### Not fixed (deliberately)

Raising the number would require either a native `.dbm` fixture (which has no octave−1
notes) or reworking the shipped DBM0 parser's note base — a playback-pitch change out of
scope for the export round-trip and not warranted by the format.
