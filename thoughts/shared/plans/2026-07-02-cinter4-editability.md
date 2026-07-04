---
date: 2026-07-02
topic: cinter4-editability
tags: [cinter4, import, pattern-editor, decompile, wasm]
status: revised
---

# Plan: Make .cinter4 songs fully editable (decompile-to-MOD import)

> **REVISION 2026-07-02 (Path A, user-approved).** Phase 0 verified the note stream is
> **automation-dominated** (test-automatic.cinter4: 54.6% slide words, 22.2% absolute-note,
> only 23% clean triggers — see `thoughts/shared/research/2026-07-02_cinter4-music-section-bytemap.md`).
> Effects were pre-rendered into per-tick period/volume streams at compile time, so a
> plain-note MOD decompile is impossible without massive loss, and the existing MOD-based
> `Cinter4Exporter` (which re-derives slides from MOD effects) cannot round-trip real songs.
>
> **Approved approach:** lossless **tick-level** decode + **direct tick-stream exporter**.
> - Decode note words → the four per-tick streams `{notedata, perioddata, volumedata, offsetdata}`
>   per track by simulating the player's running state (accumulate slide/vol deltas to
>   absolute period/volume). This is the exact intermediate `Cinter4Exporter` already builds.
> - Re-encode by **extracting the exporter's back half** (`Cinter4Exporter.ts:400-586`, which
>   is format-agnostic to how the streams were produced) into `encodeFromStreams(...)`. The
>   MOD path keeps using it after its compile step; the decode path feeds decoded streams.
>   Single source of truth for note-word encoding — no duplicate logic.
> - **Playback is always the bit-exact WASM engine.** Untouched imports play the original
>   bytes; after an edit the song is re-encoded via `encodeFromStreams` and the WASM engine
>   reloads the new bytes. This resolves the old Phase 2 open question (no MOD-playback path).
> - Correctness anchor: **decode → encodeFromStreams → byte-identical songdata**, automated
>   on the real song, independent of the pattern-cell representation.
>
> The phases below are superseded by "## Phases (Path A)" further down; the "Verified format
> facts" section remains valid.

## Goal

Importing a `.cinter4` file today gives playback-only (WASM engine, `suppressNotes`,
one placeholder pattern). Goal: decompile the compiled songdata back into an editable
`TrackerSong` (notes, volumes, instruments per row) so Cinter songs are edited in the
normal pattern editor and re-exported via the EXISTING Cinter export path. No new
editor UI required.

## Why this works (architecture)

Cinter songs are authored as ProTracker MODs; `CinterConvert.py` crunches MOD →
`.cinter4`. DEViLBOX already has every other piece:

- Full MOD pattern editing (native).
- Cinter instrument editor + param decode: `src/lib/import/formats/cinter4Params.ts`
  (`cinter4WordsToParams`, `cinter4DetectVersion`), `src/engine/cinter4/cinter4Instrument.ts`
  (`buildCinter4Instrument`). The current parser ALREADY decodes instruments to
  editable configs — only the note/pattern data is missing.
- Binary-compatible `.cinter4` export: `src/lib/export/Cinter4Exporter.ts`,
  `Cinter4ModExporter.ts`, `Cinter4ModSave.ts` (task #2, done).
- Ground-truth renderer: fixed WASM player `cinter4-wasm/` (all 8 transpile/emulation
  bugs fixed — see `thoughts/shared/handoffs/2026-06-24_cinter4-wasm-player-fixes.md`).

Only missing piece: **decode the music section → patterns**.

## Verified format facts (from transpiled player `cinter4-wasm/src/cinter4/cinter4.c`)

All words big-endian. File layout:

1. **Optional raw-instrument header**: first i16 negative = `-N` raw instruments,
   then N × [length u16, replength u16]. Positive/zero first word = no raw section.
2. **Generated instruments**: i16 `count-1` (dbra convention), then per instrument
   11 words: length, replength, mpitch, mod, bpitch, attack, dist, decay,
   mpitchdecay, moddecay, bpitchdecay. (Parser handles this already —
   `Cinter4Parser.ts:104-170`.)
3. **Music header** (`CinterParseMusic`, cinter4.c:989-1052): word `TrackSize`,
   word `music length` (bytes to end), then music data. Player computes
   `MusicPointer = here`, `MusicEnd = here + length`, loop offset read via
   `MOVE.W -(A2)` after seeking to end (verify exact loop-word semantics against
   `CinterConvert.py` in Phase 0), `MusicLoop = end-relative + TrackSize offset`.
4. **Music data**: **4 parallel tracks, each `TrackSize` bytes, one u16 word per
   tick-line per track.** `CinterPlay1` (cinter4.c:1056-1197) reads the current
   line's 4 words at `MusicPointer + n*TrackSize` (track order in file = channels
   3,2,1,0 relative to Paula — verify sign/order in Phase 0), builds the DMACON
   trigger mask from bit 15 of each word.
5. **Note word encoding** (from `.trigger`/`_noteloop` in `CinterPlay2`):
   - bit 15: trigger flag (note-on)
   - bits 9–14: volume (6 bits)
   - bits 0–8: note value (`ROL.W #7` / `LSR.W #7` split)
   - **No instrument column.** Instrument is implicit: `_noteloop` walks the
     note-range table (`c_InstPointer`) subtracting each instrument's note-range
     size until the note fits; the surviving offset picks the instrument
     (×8 into `c_Instruments` at work+156). Decoder must replicate this walk.
     This is exactly the code fixed in Fix 5 (`SUB.W D4,D0` V-flag) — mirror it 1:1.
6. **Timing**: rows were expanded to 50 Hz ticks at compile time (CinterConvert
   bakes speed/BPM). One line = one tick. `c_waitline` (work+154) is the saved
   raster position (VHPOSR read, cinter4.c:1184-1195) used for DMA-on timing —
   NOT part of note encoding. There is no speed command in the format.
7. Period table: 37 words at work+12; periods derived from note value at trigger
   time (`CinterComputePeriods`).

## REVISION 2 — 2026-07-02 (Path B: decompile to MOD-like patterns)

User goal clarified: importing `.cinter4` should yield **MOD-level editable patterns**
(real notes + effect commands) with **realtime Cinter4Synth voices** (not samples), and
DEViLBOX must **save/export `.cinter4`**. No original MOD needed at runtime; the mod↔cinter4
pairs (upstream `examples/` MODs, basename-matched to the user's `~/Desktop/cinter-songs/*.cinter4`)
are used only to DEVELOP/VALIDATE the decompiler.

**Hard truth (told to user):** the compile is lossy — CinterConvert flattens effects into
per-tick period/volume streams; different MOD effect sequences yield identical `.cinter4`.
So no exact inverse. Notes+instruments+volume ARE exactly recoverable; effects are heuristic
(musically equivalent, not byte-identical to the original MOD).

**Analysis (Wasp-Octorubber pair, `scratchpad/pair.mts`):**
- MOD speed 6; GCD of trigger-tick spacing in the `.cinter4` = 6 on all 4 tracks →
  **speed is recoverable via GCD**; folding ticks→rows lands notes on rows.
- 3877 ticks / 6 ≈ 646 rows ≈ 10 patterns (MOD has 11). Triggers align (all deltas ×6).
- MOD effect usage: `Cxx` vol 1772, `Axy` volslide 355, `0xy` arp 70, `1xx/2xx` porta 41,
  `Fxx` 2. Small, recognizable set.

**Phase A (deterministic):** recover speed (GCD) → fold → clean note/instrument/volume cells
on rows. Validate notes vs paired MODs.
**Phase B (heuristic, validated on pairs):** recognize automation → `Cxx/Axy/0xy/1xx/2xx/7xx/4xx`.
**Phase C (DONE via existing path):** instrument name encodes params at export — `Cinter4ModSave`
derives it from live `parameters`; `Cinter4Controls` writes edits to `parameters`. No new work.
**Phase D (mostly exists):** save/export `.cinter4` via `exportCinterCrunched → encodeCinter4FromMod`
(byte-exact). Wire the export UI/menu for decompiled songs; confirm `ModuleExportPanel` (has
pre-existing WIP — coordinate).

**Supersedes:** the tick-level lossless round-trip (Path A). `decodeCinter4Music` /
`encodeFromStreams` become analysis tools + orphan fallback; export pivots to the MOD compiler.
The Path-A round-trip tests stay green but the *default* import switches to MOD-like folding.

**Part 1 side-fix (in progress):** re-play doubling — `Cinter4Engine.stop()` posts `stop` to the
worklet but the worklet keeps playing, so a stop→replay stacks a 2nd WASM instance (peak 3.4,
`activeVoices=0`). Suppression itself works (probes: `suppressNotes=true` both plays). The real
fix is the worklet honoring `stop`. User: "sounds almost perfect now, WASM issues later."

## Phases (Path A — superseded by Revision 2, kept for reference)

### Phase 1a — refactor Cinter4Exporter (extract encodeFromStreams)
Extract the stream→songdata back half of `encodeCinter4FromMod` (lines ~400-586) into
`encodeFromStreams({ notedata, perioddata, volumedata, offsetdata, instList, instParams,
instruments, stopped, restart })`. The MOD path builds those (parse + compile + sort instList)
then calls it. **Must NOT re-sort instList** inside encodeFromStreams (decode path supplies
file-order instList). Add the missing byte-exact regression test for `encodeCinter4FromMod`
first (guards the refactor): a real MOD → songdata compared byte-for-byte to a golden blob.

### Phase 1b — static decoder cinter4Music.ts
`decodeCinter4Music(bytes) → { streams[4], instList, restart, stopped, trackSize, noteRange }`.
Simulate player running-state per track: for each tick word, resolve trigger/abs-note/slide,
accumulate to absolute `period`/`volume`, populate `notedata` (inst index or 0), `perioddata`,
`volumedata`, `offsetdata`. Instrument via the note-range walk (byte-map §walk, port 1:1).

### Phase 1c — losslessness proof (the anchor)
Test: `decodeCinter4Music(orig) → encodeFromStreams → songdata === orig` byte-for-byte, on
`test-automatic.cinter4` (real song, automation-heavy). MUST pass. Wire into `test:ci`.

### Phase 2 — TrackerSong representation + wire into Cinter4Parser
Map decoded streams → 64-row patterns + songPositions + restartPosition:
- trigger tick → cell `{ note: MODnote, instrument: idx+1, volume }` (fully editable).
- non-trigger automation tick → carry the exact info in effect columns via app-internal
  Cinter effect codes (period-slide / abs-period / vol-delta). Opaque in the editor but
  visible and lossless. (These are carriers, not MOD effects — WASM playback never parses them.)
- Replace placeholder block `Cinter4Parser.ts:174-208`; keep `cinter4FileData` for WASM playback.
- Fix the `little-endian` docstring bug (`Cinter4Parser.ts:8`).
Round-trip test at this layer: parse → rebuild streams from patterns → encodeFromStreams →
byte-identical (proves the representation is lossless too).

### Phase 3 — edit→re-encode→WASM reload wiring + manual proof
On edit of a Cinter4 song: rebuild streams from patterns → `encodeFromStreams` → hand new
bytes to the Cinter4 WASM engine (reload). Manual: load, edit one trigger note, hear the edit.

---

## Superseded phases (original draft — kept for reference)

### Phase 0 — verify open details against CinterConvert.py (½ day) [DONE]

Read the reference: `github.com/askeksa/Cinter` → `CinterConvert.py` + `Cinter4.S`
(check for a local copy under `/Users/spot/Code/Reference Code/` first; clone if
absent — do NOT use `third-party/`). Nail down:
- Exact music-header layout (TrackSize word vs length word order; loop word).
- Track→channel order (file order 3,2,1,0 was observed during debugging; confirm).
- Note value ↔ period-table index ↔ MOD note number mapping.
- Note-range table (`c_InstPointer`) location + entry format in the FILE (it is
  built/consumed at init — confirm whether ranges are stored per instrument or
  derived from instrument headers).
- How CinterConvert expands one MOD row → N tick-lines (speed handling), and what
  it emits for volume-only changes (trigger bit clear + volume bits set?).
- Confirm loop word → restart position semantics.

Success: a written byte-map of the music section for `automatic_KNOWNGOOD.cinter4`
that accounts for every byte.

### Phase 1 — static music decoder (1–2 days)

New: `src/lib/import/formats/cinter4Music.ts` (pure functions, unit-testable):

- `decodeCinter4Music(bytes, instHeaders): Cinter4TickEvent[][4]` — walk the 4
  tracks, emit per-tick events `{tick, trigger, volume, note, instrument}`.
  Instrument via the `_noteloop` range-walk replicated in TS.
- `foldTicksToRows(events): {patterns, speed}` — recover rows from the tick
  stream. Strategy: GCD of inter-trigger tick deltas across all tracks → ticks
  per row (Cinter MODs are usually speed 6). If GCD = 1 (per-tick automation or
  odd speeds), fall back to speed 1, one row per tick — still 100% correct,
  just denser. Split into 64-row patterns + songPositions; map loop word →
  `restartPosition`.
- Note value → MOD note number via period table mapping from Phase 0.

Regression tests (real songs only — rule `feedback_real_songs_for_testing`):
`automatic_KNOWNGOOD.cinter4` (+ `.raw`) and at least one all-synth song.
Assert: total trigger count per track matches an independent count; instrument
indices in range; decoded instrument for known events matches what the WASM
selects (can cross-check via `player_work_addr` inspection of `c_MusicState`).

### Phase 2 — wire into parser (½ day)

`Cinter4Parser.ts`: replace the placeholder pattern block (lines 174-208) with
decoded patterns/positions/speed. Keep `cinter4FileData` (WASM playback of the
ORIGINAL file stays default for bit-exact playback). Instruments unchanged
(already decoded). Delete the "no editable tracker structure to recover" comment —
it is wrong.

Decision point (ask user): after import, does playback stay on the Cinter4 WASM
engine (bit-exact, `suppressNotes`) or switch to DEViLBOX MOD playback of the
decompiled song (editable-live)? Proposal: keep WASM for untouched imports; first
edit switches the song to the MOD path (standard DEViLBOX editing), export goes
through Cinter4Exporter.

### Phase 3 — round-trip export + proof (1 day)

- Wire decompiled song → existing `Cinter4Exporter.ts` path (it expects the
  MOD-side representation from the Save path — confirm interface, adapt if the
  imported TrackerSong needs the same shape `Cinter4ModSave.ts` produces).
- **100%-correctness proof** (automated test):
  1. import `.cinter4` → decompile → export → re-import → compare decoded
     patterns + instrument params (semantic equality).
  2. render original vs exported through the WASM player headless
     (`cinter4-wasm` harness pattern from the handoff) → per-50ms RMS compare.
- Manual verification: load JazzCat-Automatic, edit one note, export, play in
  the WASM player, hear the edit.

### Automated verification (every phase)

- `npm run type-check` (mandatory, `tsc -b --force`)
- `npm run test:ci` (new decoder tests wired into the CI glob)

## Known risks / notes

- Tick-folding is heuristic only for choosing row granularity, never for data:
  worst case = speed-1 import (correct but dense). Do NOT drop or merge events.
- Volume-without-trigger lines (if CinterConvert emits them) must map to volume
  column entries, not fake note-ons.
- Raw-instrument songs need the `.raw` companion at import (already wired:
  `cinter4RawData` through UnifiedFileLoader → store → engine; prompt fix from
  2026-06-24 session — verify it type-checks, was interrupted).
- `.cinter4` crunch is lossy vs the ORIGINAL authoring MOD (channel order,
  expanded effects). Decompiled song is semantically equivalent to the compiled
  song, which is the correct target. Round-trip proof is against the export,
  not the original MOD.
- Related in-flight work: task #3 (Cinter instrument editor 1:1 params) — same
  files, coordinate.

## References

- Player source (fixed): `cinter4-wasm/src/cinter4/cinter4.c` (CinterParseMusic
  :989, CinterPlay1 :1056, `_noteloop`/`.trigger` in CinterPlay2)
- Fix history + headless harness: `thoughts/shared/handoffs/2026-06-24_cinter4-wasm-player-fixes.md`
- Current parser: `src/lib/import/formats/Cinter4Parser.ts`
- Export: `src/lib/export/Cinter4Exporter.ts`, `Cinter4ModExporter.ts`, `Cinter4ModSave.ts`
- Upstream: github.com/askeksa/Cinter (CinterConvert.py, player/Cinter4.S)
