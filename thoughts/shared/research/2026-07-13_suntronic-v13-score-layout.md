---
date: 2026-07-13
topic: suntronic-v13-score-layout
tags: [uade, suntronic, reverse-engineering, format, byte-layout, phase1]
status: final
---

# SunTronic V1.3 — byte-level score layout specification

Phase 1 deliverable of `thoughts/shared/plans/2026-07-13-suntronic-editable-pilot.md`.
Every claim below traces to a decisive probe (P0-P4, tools in
`tools/suntronic-re/`). Reference module: `mule.src` (all hunk1-relative
offsets below are mule coordinates; per-module shifts in §3).

**CLASSIFICATION VERDICT: per-voice variable-length COMMAND STREAM**
(row-terminated), NOT a fixed grid. Per the plan's locked decision rule this
selects the Rob Hubbard recipe branch: `UADEVariablePatternLayout` +
`blockRows` + `blockRawBytes` carriers (`docs/FORMAT_COMMAND_STREAM_GRID.md`).
Rationale: track data is a byte stream where each row consumes a variable
number of bytes (0 or more events terminated by `0x00`), rows-per-position is
runtime-mutable per voice (commands `0x8C`/`0x8B`, up to 255), and the four
voices sequence independently — there is no fixed cell size or fixed
rows-per-pattern anywhere in the on-disk data.

## 0. Corpus and probe inventory

- Corpus: `public/data/songs/formats/SUNTronicTunes/` — 199 V1.3 modules
  (2-hunk executables; the handful of non-matching files in the directory are
  not V1.3 and are excluded by the `isV13()` signature check).
- Companions: `public/data/songs/formats/SUNTronicTunes/instr/` — 161
  external instrument files (`*.x`), loaded at runtime via dos.library.
- Probes (all runnable):
  - **P0** `tools/suntronic-re/p0-render.ts` — headless UADE render with
    MEMFS companions. Result: 3/3 modules render nonzero RMS
    (mule.src 0.030, kompo.pc, analgestic2.src). Oracle works.
  - **P1** `tools/suntronic-re/p1-corpus-diff.ts` — corpus shift-normalized
    per-offset variability map. Result: 199/199 modules fit the two-delta
    shift model, 0 outliers.
  - **P1b** `tools/suntronic-re/p1b-build-groups.ts` + operand analysis —
    build-variant grouping and per-song patch-site enumeration (§7).
  - **P2** `tools/suntronic-re/disasm.py` (capstone m68k, requires
    `/opt/homebrew/bin/python3.11`) — full disassembly of init/play/decoder/
    all 18 command handlers; plus `tools/suntronic-re/p2-score-walk.ts` —
    corpus-wide grammar validation: **199/199 modules parse cleanly, 4738
    tracks, 22660 notes, 0 grammar violations**.
  - **P3** `tools/suntronic-re/p3-trace.ts` — UADE module-read tracer.
    Result: known limitation confirmed — V1.3 are relocated hunk executables,
    tracer reports module size 0 / zero ranges (same class as
    coreDesign/fredGray). Not usable for this format; decisive semantic
    confirmation delegated to P4 (recorded deviation, §9).
  - **P4** `tools/suntronic-re/p4-poke.ts` — byte-poke render-compare on
    mule.src. Result: **4/4 as predicted** — note byte poke changes pitch
    (maxAbs 0.23), instrument byte poke swaps timbre (0.25), sequence
    transpose byte poke shifts pitch (0.25), control poke in runtime-cleared
    workspace is inert (0.00000). A fifth informative null result: poking the
    transpose of a voice whose track is the mute track produced exactly no
    change, confirming the per-voice sequence-entry structure.

## 1. Container: AmigaOS hunk executable

```
HUNK_HEADER (0x3F3), 2 hunks
hunk#0: HUNK_CODE 436 bytes at file 0x24  — DeliTracker wrapper ("DELIRIUM"
        signature, 0x70FF4E75 at start). 19 RELOC32 entries; 7 of them point
        into hunk#1 (these are the anchor pointers used to recover shifts).
hunk#1: HUNK_CODE (CHIP) at file 0x248    — replayer + score, one blob.
        RELOC32 (self, hunk#1→hunk#1): 73 entries in mule — 2 in code
        (0x224, 0x252: absolute stores) + 71 covering instrument-table and
        score pointers (0x1552+ region).
HUNK_END
```

File offset of any hunk1-relative offset X = `0x248 + X` (mule; hunk#1 file
offset is constant across the corpus because hunk#0 is constant-size).

## 2. The 7 hunk#0→hunk#1 anchor pointers (shift recovery)

Sorted ascending, they are (mule values): `0x1B0` init, `0x304` (interrupt/
sub-entry), `0x34A` subsong init, `0x414` stop, `0x442` per-frame play — all
shifted by **deltaA** — and `0xD8A` control word, `0xD9E` subsong table —
shifted by **deltaB**. Recovery per module:

```
deltaA = sortedPtrs[0] - 0x1B0
deltaB = sortedPtrs[6] - 0xD9E
```

## 3. Two-delta shift model (DEVIATION from the plan's single delta)

The plan assumed one name-block-length delta. Reality (P1, 199/199):

- **deltaA** = name-block length difference vs mule (verified: equals
  `nameBlockEnd(module) - 0x18` with 0/199 mismatches). Applies to everything
  in `[0, 0xD8A)`.
- **deltaB** applies from the 0xD8A control word onward.
- `gap = deltaB - deltaA ∈ {-2, 0, +28}` — exactly **3 replayer build
  variants** whose only length difference is the code block
  `[0x8BE, 0xD8A)` (1228 bytes in mule's build).

Region map (mule coords, corpus-wide P1 variability):

| hunk1 range | shifts with | content |
|---|---|---|
| 0x000-nameEnd | — | per-song instrument name strings (§6.3) + "dos.library" |
| 0x018-0x0E0 | deltaA | 50-entry external sample slot table (50 longs) + per-slot data at +0xE0 |
| 0x1B0-0x8BE | deltaA | replayer code part A — byte-identical corpus-wide EXCEPT enumerated patch sites (§7) |
| 0x8BE-0xD8A | deltaA | replayer code part B — 3 build variants (per-build identical except patch sites) |
| 0xD8A | deltaB | control word |
| 0xD8E-0xD9E | deltaB | defaults block (11 words copied to a6+0xA6E at init) |
| 0xD9E-0xE6E | deltaB | **subsong table**: fixed 52-slot area of longwords, null-terminated; per-song (§4) |
| 0xE6E-0x1492 | deltaB | workspace (cleared at init: 0x1B9 longs from 0xDAA) + static tables — file content irrelevant at runtime (P4 control poke inert) |
| 0x1492-0x1552 | deltaB | per-song arp/effect word tables (selected by command 0x9C via voice+0xE; code reads them through patched operands `lea $1192(a6)` / `lea $1DF7(pc)`) |
| 0x1552-end | deltaB | **per-song score data** (§4-§6) |

## 4. Score data (mule: 0x1552-0x209C)

All pointers inside the score are 32-bit big-endian **hunk1-relative values
covered by RELOC32** (i.e. absolute after load; in the file they read as
hunk1-relative offsets directly).

| mule offset | content |
|---|---|
| 0x1552 | synth instrument table — 0x24-byte records (§6.2) |
| 0x1606 | sampled instrument table — 0x1C-byte records, null-long-terminated (§6.1) |
| 0x1626 | sequence data (per subsong; §4.1) |
| ~0x171B | volume/frequency envelopes |
| 0x1801+ | freq/arpeggio tables |
| 0x1CC5+ | synth waveforms |
| 0x1E5B-0x209C | track command streams (§5) |

Subsong table (0xD9E): null-terminated longwords, each an **a6-relative**
offset to a sequence start, where `a6 = hunk1 + 0x318 + deltaA` (workspace
base loaded by `lea $318(pc)`-equivalent in code A). mule: single entry
`0x130E` → `0x318 + 0x130E = 0x1626`. Table area is a fixed 52-slot block
(max 52 subsongs), zero-filled beyond the terminator.

### 4.1 Sequence format

Array of **0x14 (20)-byte entries**, one per song position:

```
+0x00  u32 BE  voice 0 track pointer (relocated; file value = hunk1-relative)
+0x04  u32 BE  voice 1 track pointer
+0x08  u32 BE  voice 2 track pointer
+0x0C  u32 BE  voice 3 track pointer
+0x10  s8 x 4  per-voice note transpose (semitones, added to decoded pitch)
```

Terminators (tested on entry's FIRST long): `0x00000000` = restart song;
bit 31 set = stop voice (DMA off, voice flag 0xFE). Voices advance their
position counters (voice+0x2E) **independently** — a voice moves to its next
entry when its own row counter reaches its own rows/position.

Probe evidence: structure from P2 disasm of 0x34A/0x442; semantics confirmed
by P4 (transpose byte poke at seq[0]+0x10 audibly shifts voice 0 pitch;
same poke on a voice pointing at the mute track is inert).

### 4.2 Timing state (per voice, workspace at a6+0xA92, stride 0x1BA)

| voice offset | meaning | default (set at init 0x34A) |
|---|---|---|
| +0x30 | speed (ticks/row) | 6 — corpus-constant immediate |
| +0x31 | rows per position | **per-song** immediate byte at code offset 0x389 (mule: 0x20 = 32) |
| +0x2C/+0x2D | tick / row counters | 5 / 0xFF |
| +0x2E | position index | 0 |
| +0x23 | transpose (from seq entry) | — |
| +0x0C | volume | 0x40 |

## 5. Track command stream grammar

One stream per (position, voice), starting at the sequence entry's track
pointer. The decoder (P2: routine at hunk1+0x766) fetches bytes **once per
row** until a `0x00` terminator; after `rowsPerPosition` rows the voice's
next sequence entry is loaded. Track pointers may alias (voices/positions
share streams; the corpus even shares a common "mute track": `91 00` then
empty `00` rows).

| byte | meaning |
|---|---|
| `0x00` | end of row |
| `0x01-0x3F` | select sampled instrument `index-1` (table at 0x1606, 0x1C-byte records) |
| `0x40-0x7F` | select synth instrument `index & 0x3F` (table at 0x1552, 0x24-byte records; decoder does `bclr #6`) |
| `0x8B-0x9C` | command, followed by 0-2 argument bytes (table below) |
| `0xB8-0xFF` | note: `pitch = (~byte & 0xFF) - transpose` (raw range 0x00-0x47, 0xFF = lowest pitch value 0); MAY be followed by one instrument byte (`0x01-0x7F`) |
| `0x80-0x8A`, `0x9D-0xB7` | invalid — never emitted (0 occurrences in 199 modules) |

### 5.1 Command table (`CMD_ARGC` — jump table at hunk1+0x788, 18 a6-relative words; handlers 0x89E-0xA1A)

| cmd | args | semantics (P2 disasm) |
|---|---|---|
| 0x9C | 1 | set effect/arpeggio selector (voice+0x0E; indexes the per-song tables at 0x1492/0x1DF7-class) |
| 0x9B | 2 | pitch offset word (voice+0x0A) |
| 0x9A | 1 | volume slide (voice+0x0D, flag +0x32) |
| 0x99 | 1 | set volume (voice+0x0C) |
| 0x98 | 1 | set speed (ticks/row), ALL voices |
| 0x97 | 2 | filter/control word (a6+0xA7C, `eor #$7E28`) |
| 0x96 | 0 | restart volume envelope |
| 0x95 | 0 | restart frequency envelope |
| 0x94 | 1 | set pitch without retrigger (`~arg - transpose`) |
| 0x93 | 2 | global fade: speed + reload (a6+0xA6E/0xA70) |
| 0x92 | 1 | master volume (a6+0xA71) |
| 0x91 | 1 | per-voice DMA/mute flags (voice+0x38/0x39) |
| 0x90 | 1 | set finetune (voice+0x09) |
| 0x8F | 1 | set speed, THIS voice only |
| 0x8E | 2 | CIA tempo word (a6+0xA80 + SetTimer) |
| 0x8D | 2 | tempo slide word (a6+0xA82) |
| 0x8C | 1 | rows/position, ALL voices |
| 0x8B | 1 | rows/position, THIS voice |

Cross-validation: this exact grammar tiles every referenced track block in
all 199 modules with zero invalid bytes (P2 walk); observed overlaps are
always ≤1 byte (a track pointer aliasing the previous stream's `0x00`
terminator — composer-level byte sharing, legal).

P4 confirmation: note byte 0x1EB3 `0xB8→0xC4` = audible pitch change;
instrument byte 0x1EB4 `0x44→0x41` = audible timbre change.

## 6. Instrument encoding

### 6.1 Sampled instrument record (table 0x1606, 0x1C bytes, null-long-terminated)

```
+0x00  u32  envelope pointer (relocated)
+0x12  u32  external sample slot index (< 0x32); at init (code 0x1B0) each
            record whose +0x12 is a small index gets it REPLACED in memory by
            the chip-RAM address of the loaded sample — on disk it is the
            index into the 50-slot table at hunk1+0x18
+0x16  u16  sample length in words
+0x18  u16  loop start in words
+0x1A  u16  loop length in words
```

### 6.2 Synth instrument record (table 0x1552, 0x24 bytes)

```
+0x00  u32  volume-envelope pointer     +0x1A  u32  waveform pointer 1
+0x08  u32  envelope pointer            +0x1E  u32  waveform pointer 2
+0x12  u32  freq/arp table pointer      +0x21  u8   wave param
                                        +0x22  u8   wave param
                                        +0x23  u8   type (6 = skip/unused)
```

(All pointers relocated; the 71 self-RELOC32 entries in mule land in these
records and the score pointer fields — the reloc table is effectively a free
index of every pointer field in the score.)

### 6.3 External samples

Init (0x1B0) walks the name-string block at hunk1+0, `Open`s each as
`instr/<name>` via dos.library, `AllocMem(MEMF_CHIP|CLEAR)`, reads, and
patches addresses into the slot table at hunk1+0x18. Headless rendering must
therefore inject `instr/*.x` into UADE MEMFS before load
(`suntronicLib.addCompanions`, using `_uade_wasm_add_extra_file`).

## 7. Replayer code: template + enumerated per-song patch sites

The exit criterion "invariant code across ≥95% of modules" holds in the
refined form: within each of the 3 builds the code is **byte-identical
except an enumerable, closed set of patched operand bytes** (the composer's
save routine writes per-song values into instruction operands). Corpus-wide
variable byte runs inside code (from the P1 per-offset diff map):

- **Score-table LEA displacements (per-song, because the name block length
  moves the PC-relative distance):** 0x1B6 (`lea $1552(pc)` synth table),
  0x1BA + 0x1F2 (`lea $1606(pc)` sampled table, init x2), 0x7EC + 0x856
  (same two LEAs in the note decoder), 0x676 (`lea $1192(a6)` arp table),
  0x67A (`lea $1DF7(pc)` arp table 2), 0x285 (name-block-end displacement in
  the loader loop), 0x2CA (`lea $1606(pc)` third instance).
- **Per-song immediates:** 0x389 = default rows/position byte
  (`move.b #imm, $31(a2)` at 0x386); 0xD06/0xD12/0xD32 = synth-mixer
  constants in the frequency/volume math block; 0x8EE/0xA04/0xA24-area low
  bytes.
- **Per-build (gap ≠ 0) only:** absolute-store words at 0x224/0x252
  (RELOC32-covered), workspace LEAs (0x22A, 0x3E0, 0x416), a6-relative word
  displacements in the play path (odd bytes 0x44D-0x494, 0x519-0x545,
  0x5BF-0x5D5, 0x665-0x682), and the 18-entry jump table low bytes
  (0x78D-0x7AB).
- **Per-song data blocks inside the "code" span:** subsong table low words
  (0xDA0-0xE6E, stride 4) and the arp/effect tables 0x1492-0x1552.

Consequence for Phase 4 (compiler): the wrap template is one of 3 build
blobs + a small deterministic operand-patch pass (every patch value is a
function of the name-block length / score-table offsets the compiler itself
lays out). No other code bytes vary across 199 modules.

## 8. Grid mapping guidance (for Phase 2)

- Editable unit = (subsong, position, voice) track stream; rows within a
  stream = grammar rows. `blockRows` carrier per stream, `blockRawBytes` for
  verbatim-when-unedited round-trip (command-stream recipe).
- Row cell view: note = `~byte` (+ seq transpose applied at the SEQUENCE
  layer — keep transpose out of the cell, it is position metadata), instrument
  = select byte (sticky until changed), effects = the 18 commands.
- Rows-per-position: per-voice, default = code byte 0x389, mutable by
  0x8C/0x8B — the grid must treat position length as per-(position, voice)
  metadata, not a constant.

## 9. Deviations from the plan

1. **Single shift delta → two deltas + 3 build variants** (§3). Adapted:
   both deltas recover exactly from the 7 hunk#0 anchor pointers; 0 outliers.
2. **P3 tracer unusable for this format**: relocated hunk executables do not
   register a module region (`module size 0`, zero ranges) — the known
   coreDesign/fredGray limitation. The plan's "≥2 probes per claim" is still
   met everywhere via {P1 diff, P2 disasm, P2 corpus walk, P4 poke}.
3. **"Invariant code" refined** to "template + enumerated patch sites" (§7);
   without that refinement the literal ≥95% byte-identity criterion would be
   false at ~91 operand byte positions in code part A.
4. **Rows/position is not fixed at 32**: per-song default in a code operand
   (0x389) and runtime-mutable per voice (0x8C/0x8B). The score walk was
   rewritten from fixed-32-row tiling to grammar tiling (MAX 255 rows,
   ≤1-byte terminator-sharing overlap) — 199/199 clean.
5. Probe scripts live in `tools/suntronic-re/` as planned but are NOT
   committed this session (session constraint: no commits).
