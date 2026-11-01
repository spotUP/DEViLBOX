---
date: 2026-11-01
topic: Import ANSI music (.ANS) and MONOTONE (.MON) PC-speaker songs
status: Part A A0-A9 done, A10-A11 open; Part B B1-B7 done, B8 open (2026-11-01)
research:
  - thoughts/shared/research/2026-11-01-ansi-music.md
  - thoughts/shared/research/2026-11-01-ansi-music-spec-sources.md
  - thoughts/shared/research/2026-11-01-monotone-mon-format.md
  - thoughts/shared/research/2026-11-01-ansi-mon-codebase-map.md
  - thoughts/shared/research/2026-11-01-mon-samples/ (PRELUDE, NO_ROADS, SWINGIN1 .MON)
---

# ANSI music + MONOTONE import

## Owner decisions (2026-11-01)

- D1. ANSI music: import only, no export. One subsong per music block.
- D2. .MON: port MONOTONE's own player (MT_PLAY.PAS / MT_OUTP.PAS, Unlicense)
  to C, build to WASM, own engine. Track rotation, one-tick output delay and
  Hz-per-tick slides must match the original. Grid edits save back byte-exact.
  PC speaker output only (Tandy/Adlib modes not in scope).
- D3. ANSI pitch: checked against Microsoft's GW-BASIC source (GWSTS.ASM NOTTAB):
  same table as CTerm, A440 = O2 A, C0..C6 = 65.4..4186 Hz. No octave shift.
  GW-BASIC rounds each divided frequency half up (`ADC BX,0` adds the bit
  shifted out): 1046.5 -> 1047, 3951 stays 3951.
  GW-BASIC vs CTerm still differ on N (GW: 0-84, N0 = rest, N1 = C in O0;
  CTerm: 0-71, N0 = C0) and dots (GW: cumulative, 1.5x per dot; CTerm: not
  cumulative). Gate confirmed in GW source: MN 7/8, MS 3/4, ML full, remainder
  is a rest. Semantics choice: see D5.
- D4. ANSI tests: 4 real files found (discmaster.textfiles.com), committed in
  `src/lib/import/__tests__/fixtures/ansi-music/`:
  - `MUSIC_pavt199.ANS` (61 B, ctrom5b PAVT199/MUSIC.ANS): 1 block, clean;
    same tune as LOGO.ANS written with `<` `>`. First reachability fixture.
  - `!ANSIMUS.ANS` (3375 B, PC World Interactive 1 1997, ansi.zip): 4 blocks, clean.
  - `RELIGIOU.MUS` (7019 B, Wildcat Files 2, alotmusi.zip): 52 blocks; 10 hold
    CR/LF inside the string (strings wrap lines) and one `"`. A CTerm-strict
    parser voids them; an import that treats CR/LF as whitespace plays them.
  - `ANSIPL20_INTRO.ANS` (16650 B, megacd_rom_1 MUSIC/ANSIPL20.ZIP): 23 blocks,
    22 hold `;` (SMILE `MF freq;dur;cycles;delay;var` sound effects, D-SMILE
    out of scope). Proves the void rule matters.
- D8. Void rule (owner, 2026-11-01): match vtcon. Inside a PLAY string, skip
  CR, LF, `"` and any other byte outside the PLAY set, and keep playing; no
  block is voided. SO (0x0E) ends the string; ESC, CAN and SUB end it early.
  A string that contains `;` is a SMILE sound effect: it imports as no
  subsong (zero notes), same as vtcon's zero-note expectation in the vectors.
  All 10 wrapped RELIGIOU.MUS blocks import.
- D5. ANSI semantics follow GW-BASIC (owner, 2026-11-01): N 0-84, N0 = rest,
  N1 = C in O0; dots cumulative (1.5x per dot). Pitch: GW-BASIC table with
  its integer round-up. 90s terminals copied BASIC PLAY.
- D6. ANSI rules shared with vtcon (UP-Term, engine/ansimusic.c) as rules +
  golden test vectors, not shared code (owner, 2026-11-01). Each project keeps
  its own parser. Vector file: JSON, per vector the PLAY string bytes, then per
  event Hz (whole Hz after GW round-up), duration ms, gate ms, rest yes/no;
  optional `"void": true` for strings that must not play, with a per-host flag
  where vtcon (CTerm character set) and DEViLBOX (GW) differ. vtcon ledger row
  ANSI-MUSIC-VECTORS waits for the file path. DCTelnet (dctelnet-db, src/ansimusic.c)
  joined 2026-11-01 and writes the vector file; DEViLBOX does not write a
  second one. File location (owner, 2026-11-01):
  DEViLBOX repo, `src/lib/import/__tests__/fixtures/ansi-music/vectors.json`;
  vtcon, DCTelnet and AmiExpress read it from there. (First proposed
  `test-data/ansi-music/`, but `test-data/` is gitignored, so the file would
  never be committed and DEViLBOX tests could not read it in CI.)
- D7. Part A starts now (owner, 2026-11-01), while the ANSI file search runs.

## Checklist

### Part A - MONOTONE (.MON)

Progress (tick here, with commit): A0 copy MONOTONE source (Unlicense) from the
session scratchpad into `monotone-wasm/reference/` so the port has a durable
reference. Done: A0 (5dedbd1ae), A1 + A2 (217ca4b24), A3 + A4 + A8 (this commit).
Open from A4: MONOTONE note 88 maps to grid note 97 (notes map n+9), which is
NOTE_OFF. Unedited cells keep their word, so imports and unedited exports are
exact, but a grid edit cannot tell note 88 from note off. Fix in A5 together
with the engine: the grid needs a note range that ends before 97 or a
separate note-off value. Also open: Fxx with data 0 (MT_SONG.PAS stores 1);
'MON' must join the TrackerFormat union and the song needs a raw file data
field for the engine (A5).
Progress: A5-A7 done (MonotoneEngine, monotoneFileData, monotone-module live
edits, MonotoneExporter; PRELUDE.MON exports byte-exact; worklet replaceModule
now calls mt_replace_song). Note 88: kept as is. MON notes 1-87 map to grid
10-96; note 88 lies past the grid's last note, so the editable range ends at
87 and an unedited note-88 cell keeps its raw word. Fxx data 0 still open.
Progress: A9 + B7 reachability done (monotoneAnsiReachability.test.ts, this
commit): real PRELUDE.MON and LOGO.ANS through parseModuleToSong, sentinel is a
passthrough spy on parseMonotoneFile / parseAnsiMusicFile; both tests fail with
their dispatch disabled; plain ART.ANS stays out. Deviation: the sentinel proves
the parser ran, not the WASM player; the WASM run is proven live in A11.
Notes from A1: API prefix is `mt_`; output in `public/monotone/` (like
`public/actionamics/`); PRELUDE first note 262 Hz, divisor 4554; unedited
export byte-identical for all 3 fixtures; PITfreq 1193182 still unverified;
the 3 fixtures have empty titles (header bytes 9..91 are zero), so A9 asserts
title "" or the filename fallback.

- A1. `monotone-wasm/src/monotone.c|h`: port of MT_PLAY.PAS player + MT_OUTP.PAS
  PC-speaker output. 60 Hz tick, speed = max(tracks,4) at start, one track per
  tick rotating, rotation reset at row start, equalShare=false behaviour
  (inactive track keeps previous pitch), output one tick late, 8 sub-steps per
  semitone note table with the original integer rounding, square wave at
  PIT clock / divisor. Effects 0xy 1xx 2xx 3xx 4xy Bxx Dxx Fxx exactly as the
  Pascal. Before coding verify: PITfreq comes from Trixter's TInterrupts unit
  (not in the MONOTONE repo; believed $1234DD = 1193181, unverified; find
  Trixter's TInterrupts source). equalShare = false is verified: the editor
  creates PPCSpeakerSimple with Init(MyPlayer,false) (MT_EDIT.PAS:205; the
  true variant is commented out at :204).
- A2. `monotone-wasm/build.sh` modelled on `actionamics-wasm/build.sh`; output
  `public/monotone/Monotone.js`, `.wasm`, `.worklet.js`.
- A3. `src/lib/import/formats/MonotoneParser.ts`: header (offset 0 length byte
  0x08 + "MONOTONE", title 41 B at 9, comment 41 B at 50, version 91,
  patterns 92, tracks 93, cellsize 94, 256-byte order list at 95, 0xFF end,
  patterns from 351: pattern, row (64), track, 16-bit LE `nnnnnnne eedddddd`).
  Note 0 none, 1 = A0, 127 = note off (maps to NOTE_OFF 97). Reject files whose
  size is not 351 + patterns*64*tracks*2 or version != 1.
- A4. `src/lib/import/formats/monotoneGrid.ts` + effect glyphs: carrier for
  byte-exact round trip, following `actionamicsGrid.ts` /
  `docs/FORMAT_COMMAND_STREAM_GRID.md`.
- A5. Engine `src/engine/monotone/MonotoneEngine.ts` + `monotoneModuleEdits.ts`,
  mirroring `src/engine/actionamics/` file by file. Register in
  `src/types/formatEngine.ts` and the native engine routing so
  `playingEngineFor()` on a real .MON returns the Monotone engine.
- A6. Registry entry in `src/lib/import/formatRegistryData.ts` (ext `mon`,
  content check on the "MONOTONE" ID - `.mon` may clash; grep the registry
  before adding), dispatch next to the Actionamics branch, editable-format
  entry in `src/lib/formats/EditableFormatRegistry.builtins.ts`.
- A7. Exporter `src/lib/export/MonotoneExporter.ts` + `nativeExportRouter.ts`
  entry: writes the edited grid back to .MON bytes.
- A8. Tests: parser + round trip on all 3 real .MON fixtures (byte-identical
  re-export unedited); copy fixtures to `src/lib/import/__tests__/fixtures/`.
- A9. Reachability test: real .MON through the top-level import entry
  (`importTrackerModule` path, see `oneParsePath.contract.test.ts`), asserts
  engine = Monotone, a sentinel proves the WASM player ran, and title, track
  count (PRELUDE 4, SWINGIN1 3) and pattern count match the header.
- A10. Pitch proof: render PRELUDE's first row in the WASM, measure the output
  period, compare with the Pascal table value for note 40 (one number, stated
  in the test).
- A11. Live check via MCP in Chrome (load_file PRELUDE.MON, get_audio_level,
  stop). Owner listens: Blocked-on-me item with URL.

### Part B - ANSI music (.ANS)

- B1. `src/lib/import/formats/AnsiMusicParser.ts`: byte scanner for intros
  CSI M / CSI N / CSI | (accept all three on import: a file is not a live
  terminal, so the Delete Line clash only needs the CSI M disambiguation rule:
  first char in `BbFfLlSs` or `N/n` without digit = M-command, anything that
  is a PLAY char = music, else not music). Bytes outside the PLAY set are
  skipped, never void (D8); a `;` block is SMILE and yields no subsong.
  Terminator 0x0E; ESC, CAN, SUB end the string early. SAUCE record gives
  title/author when present.
- B2. PLAY interpreter: A-G with stacked #/+/-, length digits, dots (1.5x,
  cumulative per D5), O 0-6 clamped, < >, N 0-84 with N0 = rest (D5),
  L 1-64, P, T 32-255 clamped, MN/ML/MS gate (7/8, 3/4, full; GW source),
  MF/MB ignored.
Progress: B1 + B2 done (ansiMusic.ts, 37 tests, all 32 vectors pass).
Open from B2: the octave-6 table between C 4186 and B 7902 uses equal-temperament
values; the vectors pin only C and B, so GWSTS.ASM NOTTAB is not yet checked
for those notes. vtcon (c21dc2ae) holds at most 8 spaces after a bare CSI M
before deciding M-command vs music. Resolved under D8 (match vtcon): the
scanner now skips at most 8 spaces; vectors intro-m-8-spaces and
intro-m-9-spaces pin it (34 vectors).
Progress: B3-B6 done (AnsiMusicParser.ts, .ans registry entry, subsongs via
tryChipDumpParse, 7 tests). .mus is not registered: it clashes with Karl
Morton and UFO/MicroProse. Known loss: a gate end is rounded to a row, so at
coarse grids a 7/8 gate can round to the full row and lose its note-off.

- B3. Grid: one channel, ticks per row derived from the finest length in the
  block (whole note = 64 or 96 x dot factor), BPM from T; T changes become
  0x0F effect on channel 0 (MDXParser.ts:542-559 pattern, rowTempo.ts helper);
  gate becomes NOTE_OFF 97 at the gate end row.
- B4. Instrument: existing FurnacePCSPKR preset
  (`src/constants/furnaceChipPresets.ts:286-294`), no new synth.
- B5. Subsongs: one per music block via the `subsong` argument of
  `tryChipDumpParse` (ChipDumpParsers.ts:19-40, as parseGameMusicFile).
- B6. Registry: `.ans` with a content check that a music block exists, so
  plain ANSI art does not open as an empty song. Do not touch `.asc` (ZX AY,
  formatRegistryData.ts:1999). Dispatch branch in ChipDumpParsers.ts:86-89.
- B7. Tests: interpreter unit tests (lengths, dots, gate, tempo, octave clamp,
  CR/LF skip on RELIGIOU, SMILE `;` block yields no subsong on ANSIPL20)
  on the LOGO.ANS string; reachability test through the
  top-level import entry with the fixture file, asserting note count, BPM 120
  and the first note's pitch (LOGO.ANS starts O3 C = 523.25 Hz).
- B8. Live check via MCP: load_file the fixture, get_audio_level, stop.

### Part C - ANSI music in the AmiExpress BBS (owner, 2026-11-01)

- C1. After Part B lands: add ANSI music playback to the BBS project
  /Users/spot/Code/AmiExpress/amiexpress-web (its own repo and rules; read its
  CLAUDE.md / RULES.md first). Research where it renders ANSI (web client
  terminal, `web/`, `packages/`) before planning. Same rules (D5) and the
  shared golden vectors (D6). Not started; no files touched there yet.

## Automated verification

- `npm run type-check`
- `nice -n 19 npx vitest run src/lib/import/__tests__/<new tests> --maxWorkers=2`
- `monotone-wasm/build.sh` exits 0 and writes the three public files.

## Manual verification (owner)

- Listen to PRELUDE.MON and NO_ROADS.MON at http://localhost:5174 against
  the original (DOSBox MONOTONE or a recording).
- Listen to the ANSI fixture.

## Order

Part A first (real fixtures in hand, decisions final). Part B starts after D3
and D4 report.
