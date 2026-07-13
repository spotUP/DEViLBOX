---
date: 2026-07-13
topic: compiled-player-re-campaign
tags: [uade, reverse-engineering, editability]
status: draft
---

# Compiled-68k-player RE campaign — inventory + pilot deep-dives (21 formats)

Phase 1 research, documentary. Campaign goal: per format, pick ONE reference
player, reverse its score data layout, build editor grid + score compiler
targeting that player (new-song authoring first; existing modules editable
only when layout matches).

Precedents in repo:
- Sonix: full 68k→C transpile, `tools/asm68k-to-c/` (output/SonixMusicDriver_v1/).
- digitalSonixChrome: hand-located sequence table from
  `third-party/uade-3.05/amigasrc/players/wanted_team/DigitalSonixChrome_v1.asm`.
- `docs/FORMAT_COMMAND_STREAM_GRID.md` (188 lines): the Rob Hubbard recipe
  (command stream → blockRows carriers → tick grid) for davidWhittaker /
  hippel / benDaglish class.
- Prior triage: `thoughts/shared/research/2026-07-12_uade-stub-format-triage.md`
  (EASY/MEDIUM/HARD/OPAQUE buckets) and
  `thoughts/shared/research/2026-07-12_uade-opaque-tracer-wall.md` (tracer
  built at 45b7568eb; capabilities + why it cannot auto-decode).

## 1. Per-format inventory

Legend, "Module class" (from fixture hexdump + parser detection logic):
- **CODE** — module file begins with executable 68k (BRA/JMP jump table or
  MOVEM prologue): the module IS the player; the UADE eagleplayer is a thin
  DeliTracker adapter that JSRs the module's entry points.
- **DATA** — module is score/sample data; the eagleplayer binary contains the
  actual replayer.
- **HUNK** — AmigaOS hunk executable wrapper: first hunk is a 4-byte guard
  (`70ff 4e75` = `moveq #-1,d0; rts`) + ID string + pointer table; player
  and/or data live in later hunks (relocated at load — the "zero module
  reads" tracer bucket).

All eagleplayer.conf entries are plain `prefixes=` lines except customMade
(`ignore_player_check`), see `third-party/uade-3.05/eagleplayer.conf:23`.

| formatId | eagleplayer (bytes) | 68k source in amigasrc/players/ | Module class | Fixture (first bytes) | JS parser (real structure parsed?) |
|---|---|---|---|---|---|
| specialFX | Special-FX (2756) | wanted_team/SpecialFX/{Special FX_v2.asm 19.8K, Special FX.AMP.asm 20.9K} | CODE | wildwheels_ingame.jd — 7×BRA table + "'Wild Wheels' ingame music by Jonathan..." | SpecialFXParser.ts:41-74 — BRA sig; samples via LEA scan; stub grid |
| jasonBrooke | JasonBrooke (3476) | — none | DATA | sjs.jb — data header `8833 0700 0032...` | JasonBrookeParser.ts:23-34 — prefix-only; pure stub |
| soundPlayer | SoundPlayer (4844) | wanted_team/SoundPlayer/src/{SoundPlayer_v1.asm, SoundPlayer.AMP.asm} | DATA | sjs.awesome — 15-byte header, IFF 8SVX inside | SoundPlayerParser.ts:128-166 — header sig; 8SVX VHDR/BODY parsed; stub grid |
| desire | Desire (1992) | wanted_team/Desire/src/{Desire_v1.asm, Desire.AMP.asm} | DATA (0x00010101 longs at 8/24/40/56) | batmanreturns.dsr | DesireParser.ts:134-193 — magic scan; sample tables via 0xE341/0x47FA; stub grid |
| coreDesign | CoreDesign (2160) | wanted_team/CoreDesign/Core Design.asm (15.4K) | HUNK ("S.PHIPPS" tag) | dynamite dux.core, 156K | CoreDesignParser.ts:49-84 — hunk+tag sig; 14-byte sample-info table; stub grid |
| seanConnolly | SeanConnolly (4204) | — none | CODE | surf_ninjas.scn — BRA table + "Surf Ninjas music & player by Sean Connolly" (self-declared player) | SeanConnollyParser.ts:25-29 — byte[0]=0x60; stub |
| jesperOlsen | JesperOlsen (4056) | wanted_team/Jesper_Olsen/Jesper Olsen_v1.asm (29.3K) | DATA (pointer table) | lollypop-subgame_01.jo | JesperOlsenParser.ts:157-260 — 2 variants; IFF chunks extracted; stub grid |
| mikeDavies | MikeDavies (2600) | — none | DATA (zeros) | strider.md, 88K | SimpleAmigaStubParser.ts:88-90 — prefix `md.`; pure stub |
| jankoMrsicFlogel | JankoMrsicFlogel (2152) | wanted_team/JankoMrsic-Flogel/src/Janko Mrsic-Flogel_v1.asm | HUNK ("J.FLOGEL" tag) | spacestation.jmf, 3.8K | JankoMrsicFlogelParser.ts:36-65 — hunk+tag sig; pure stub |
| fredGray | FredGray (2112) | — none | HUNK ("FREDGRAY" tag) | eco.gray, 6.8K | FredGrayParser.ts:33-51 — magic at 0x24; sample offset/length pairs; stub grid |
| markCooksey | Mark_Cooksey (4392) / Mark_Cooksey_Old (1884) | wanted_team/Mark_Cooksey_Don_Adan/Mark Cooksey_v2.asm (31.7K) + mark_cooksey_old/MarkCookseyOld_mod.asm | CODE (`d040 d040 4efb` jump dispatch) | grand_national-title.mc | MarkCookseyParser.ts:68-190 — 3 sub-variants; LEA-scanned sample/song tables; stub grid |
| markII | MarkII (1488) | — none | CODE (`48e7 00f0` prologue) | astarrsonix.mk2, 181K | MarkIIParser.ts:18-25 — prefix-only; pure stub |
| jasonPage | JasonPage (13424 — largest, real replayer) | wanted_team/JasonPage/src/{Jason Page_v5.s, Jason Page.AMP_2.s} | DATA (pointer table, 1284 bytes! + companion .smp) | jpn.virocop-14 | JasonPageParser.ts:101-238 — 3 variants; sample table + companion SMP; stub grid |
| scumm | SCUMM (448 — pure adapter) | — none | CODE (68k at +4) | zaktitle.scumm, 51K (ripped LucasArts player) | SCUMMParser.ts:30-34 — byte[4]=0x60; stub |
| sonicArrangerSas | SpeedyA1System (4632) | — none (wanted_team/Sonic_Arranger asm covers regular SA only) | DATA (sequence words) | digital voyage.sas, 132K | SimpleAmigaStubParser.ts:76-78 — prefix `sas.`; pure stub |
| sunTronic | SUN-Tronic (1624 — thin adapter) | suntronic/suntronic_mod.asm (8.9K, FULL source of adapter) | CODE (`48e7 fffe 4dfa ...`) | msx-cracktro 2.sun, 4.2K | SunTronicParser.ts:59-68 — MOVEM+LEA sig (mirrors asm Check2); LEA 0x43EE/0x45EE pointer resolution; stub grid |
| steveBarrett | SteveBarrett (2240) | wanted_team/SteveBarrett/src/{Steve Barrett_v2.asm, .AMP.asm, .s} | CODE (BRA table) | street_fighter.sb — NOTE: embeds "(c)Wally Beben 1988 Ariston v4.1" — fixture is a Wally Beben Ariston rip matching the SteveBarrett signature | SteveBarrettParser.ts:31-76 — 4×BRA + 0x2A7C/0x00DFF0A8; stub |
| ashleyHogg | Ashley_Hogg (3096) | wanted_team/Ashley Hogg/SRC_AshleyHogg/{Ashley Hogg_v1.asm, .AMP.asm} | CODE (BRA table + HW writes) | ash.nobby the aardvark, 38K | AshleyHoggParser.ts:65-138 — 2 variants; old-format 0x2C-byte sample descriptors; stub grid |
| maniacsOfNoise | ManiacsOfNoise (1292 — adapter) | mon/mon (BINARY only, identical to players/ManiacsOfNoise) | CODE (`4efa` JMP table) | gyroscope.mon, 7.8K | ManiacsOfNoiseParser.ts:30-43 — prefix/ext; 6-byte sample entries via LEA scan; stub grid |
| customMade | CustomMade (3956) | wanted_team/CustomMade/{CustomMade_v1.asm 30.4K, CustomMade.AMP.asm} | CODE (`4ef9` JMP abs table) | cm.viking_child, 9.7K | CustomMadeParser.ts:87-146 — JMP sig + voice-clear sig; inline samples (len+period+PCM) extracted; stub grid |
| quartet | Quartet_PSG (2348) [.sqt]; also Quartet (4688), Quartet_ST | wanted_team/{Quartet/Quartet_v1.asm 34.5K, Quartet_PSG/Quartet PSG.asm 16.4K, QuartetST/Quartet ST_v1.asm 21.8K} | CODE (BRA table, .sqt) | warlock_the_avenger.sqt, 10.6K | QuartetParser.ts:135-356 — QPA/SQT/QTS variants; stub grid |

Source coverage summary: **14 of 21 have 68k ASM source** in
`third-party/uade-3.05/amigasrc/players/` (sunTronic, specialFX, soundPlayer,
desire, coreDesign, jesperOlsen, jankoMrsicFlogel, markCooksey×2, jasonPage,
steveBarrett, ashleyHogg, customMade, quartet×3, + Sonic Arranger v1 for the
non-SAS variant). **No source**: jasonBrooke, seanConnolly, mikeDavies,
fredGray, markII, scumm, sonicArrangerSas, maniacsOfNoise (binary only).
Every wanted_team dir also ships `EP_*.readme` + `WT_Customs.txt` (known-module
lists — corpus pointers).

Module-class split: CODE (module-is-player, eagleplayer = adapter): specialFX,
seanConnolly, markCooksey, markII, scumm, sunTronic, steveBarrett, ashleyHogg,
maniacsOfNoise, customMade, quartet (11). DATA (eagleplayer = replayer):
jasonBrooke, soundPlayer, desire, jesperOlsen, mikeDavies, jasonPage,
sonicArrangerSas (7). HUNK wrapper: coreDesign, jankoMrsicFlogel, fredGray (3)
— these are exactly 3 of the tracer's 4 "zero module reads / relocated"
formats (2026-07-12_uade-opaque-tracer-wall.md:34-36).

## 2. Pilot deep-dive A — sunTronic (CONFIRMED pilot)

### 2.1 Two module generations exist

1. **Raw rips** (fixture `public/data/songs/formats/msx-cracktro 2.sun`,
   4186 bytes): headerless 68k code starting `48E7 FFFE 4DFA 0468 4A2E 0010`
   — `movem.l d0-d7/a0-a6,-(sp); lea $468(pc),a6; tst.b $10(a6)`. All state is
   A6-relative; A6 base = pc+0x468. `dos.library` string at ~0x470 (loads
   external instruments), followed by header words
   `00fc 0cd8 040f 0500 001f 0005 196e` and an ascending word table at 0x4b6
   (`003e 0047 004b 0050 0055 005a ...` — pitch/period-increment table).
2. **DeliTracker custom modules** (new corpus
   `public/data/songs/formats/SUNTronicTunes/`, ~200 modules: *.src, *.pc,
   misc names; + `instr/` with 161 external instrument files `*.x`):
   AmigaOS hunk executables, `$VER: SunTronic music module V1.3 (13 Oct 96)`,
   "replay routine by Holger Benl, music composed by Felix Schmidt, adapted by
   Delirium".

### 2.2 Hunk structure of the V1.3 modules (parsed: mule.src, kompo.pc, analgestic2.src)

Uniform 2-hunk layout, all three modules:

```
HUNK_HEADER  hunks 0..1, memflags hunk1=CHIP
hunk#0 CODE  436 bytes (fileOff 0x24) + RELOC32 (19 relocs)   — DeliTracker wrapper
hunk#1 CODE  8348/9600/14888 bytes (fileOff 0x248) + RELOC32  — replayer + score
```

**Correction to the intake note**: there is NO HUNK_SYMBOL hunk. The
`8000 44xx` entries ("DU","DV","DX","DY","DZ","Ds","D^","Db","Dc","Dd","De",
"Df","Di") are DeliTracker **DTP tag longwords** in hunk#0's tag list (the
exact tag IDs used in suntronic_mod.asm:3-16), each paired with a hunk0-relative
offset. Decoded tag list (mule.src, offsets into hunk#0):

| Tag | Meaning (per suntronic_mod.asm EQUs) | Value |
|---|---|---|
| 0x80004455 DU | custom-player flag | 1 |
| 0x80004456 DV | (DeliBase-class) | 0x11 |
| 0x80004458 DX | DTP_PlayerVersion | 0x0001001E (v1.30) |
| 0x80004459 DY | DTP_PlayerName | 0xAA → "SunTronic" |
| 0x8000445A DZ | DTP_Creator | 0xB4 → credits string |
| 0x80004473 Ds | (volume/song hook) | 0x10A |
| 0x8000445E D^ | DTP_Interrupt | 0x118 |
| 0x80004462 Db | (StopInt-class) | 0x128 |
| 0x80004463 Dc | DTP_InitPlayer | 0x132 |
| 0x80004464 Dd | DTP_EndPlayer | 0x17A |
| 0x80004465 De | DTP_InitSound | 0x18E |
| 0x80004466 Df | DTP_EndSound | 0x1A0 |
| 0x80004469 Di | (Volume-class) | 0x1A8 |

hunk#0 also contains the literal string `instr/` (fileOff 0x134) and the
handler code. Key observed behaviour (hex at fileOff 0x146-0x1d8):
- DTP_InitPlayer (hunk0+0x132): `LEA (hunk1+0xD9E),A0` then scans longwords
  until 0, counting entries → **hunk1+0xD9E = null-terminated pointer table of
  instrument filenames**; count stored to hunk1+0x10E; then loops calling
  DeliTracker glue (`(a5)+0x40/0x48` — CopyDir/LoadFile class) with `instr/`
  prefix → **instruments are loaded at runtime from external files**.
- DTP_Interrupt (hunk0+0x118): `move.w 0x2C(a5),...; jsr (hunk1+0x34A)` — the
  per-frame play call into hunk#1.
- Other JSR targets into hunk#1: 0x1B0 (init), 0x304, 0x414, 0x442; plus
  `move.w →(hunk1+0xD8A)` (a control word, likely song select/timer).

### 2.3 hunk#1 layout (mule.src; uniform across modules modulo a shift)

- **+0x000**: instrument filename strings, null-terminated ("n-chord.x" —
  a real file in `instr/`), then `dos.library`, then a large zero region
  (runtime workspace / voice state, ~0x3F8-0x400 total prefix).
- **+0x1B0-ish**: replayer code (`2848 7E01 41FA 139C 43FA 144C ...`), with
  PC-relative LEAs into score data ~+0x1550 region and a workspace clear of
  0x1B9 longs at +~0xFF8.
- **+0xD8A / +0xD9E**: control word / instrument-pointer table (see above).
- Score data follows the replay code (PC-relative addressed).

**Cross-module diff (hunk#0, mule.src vs kompo.pc)**: only 7 bytes differ —
each the low byte of an absolute longword pointer into hunk#1, and ALL differ
by exactly +8 (kompo's instrument-name block is 8 bytes longer). I.e. the
replay layout is **uniform across the ~200-module corpus**, shifted by the
variable-length name table. This makes corpus-wide structural diffing (fix
the shift, diff hunk#1) a precise way to delimit code vs score vs tables.

### 2.4 instr/*.x format

`instr/ah.x` (5624 bytes): headerless signed 8-bit PCM — raw sample data from
byte 0 (no header magic; smooth waveform values). 161 files. Loop/length
metadata therefore lives in the module (instrument descriptors near the name
table), not in the .x file.

### 2.5 What suntronic_mod.asm (the UADE adapter) adds

`third-party/uade-3.05/amigasrc/players/suntronic/suntronic_mod.asm` targets
the RAW-rip generation ("SUNtronic player module V1.0 (20 Apr 97)", Felix
Schmidt / Mr.Larmer/Wanted Team). Findings:
- Check2 (lines 60-72) = exactly SunTronicParser.ts:59-68's signature:
  `48E7FFFE` at 0, `4DFA` at 4, `4A2E0018|4A2E0010` at 8 — byte at module+11
  (0x18 vs 0x10) distinguishes two replayer revisions with different
  per-voice-state strides (0x130 vs 0x68/0x62; initsound, lines 400-479).
- Module+6 word: offset to the module's state struct (`ADD.W (6,A1),A1;
  ADDQ.W #6`, lines 400-402).
- The adapter locates three internal pointers by scanning module code for
  `LEA d16(A6),A1` (0x43EE) and two `LEA d16(A6),A2` (0x45EE) opcodes
  (lines 84-120): lbL0000DA = **4-longword per-voice pointer table** (copied
  into voice state at init, lines 419-429), lbL0000E2/lbL0000D6 = bounds of a
  **relocation pointer list** the adapter rebases (lines 156-254).
- Song-end detection patches the module's replay loop in place (opcode
  pattern scan, lines 255-291) — confirms the loop structure
  (`move.w $1E(a6)` position counter, `clr $1e(a6)` = restart).
- interrupt = `JSR module+0` (line 483-488): module entry 0 is the per-frame
  play routine.

### 2.6 Pilot assets summary

Reference player choice: **the V1.3 Delirium module generation** — 200-module
uniform corpus, external instruments (clean sample story for an editor),
DeliTracker tag map giving exact entry points, and byte-identical replay code
across modules (after the +shift). Remaining RE = disassemble hunk#1's
~2-3KB replay code once (asm68k-to-c pipeline or manual), which then defines
the score tables for the entire corpus; the raw-rip generation (.sun fixture)
can be mapped afterwards via the adapter asm's A6-relative anchors.

## 3. Pilot deep-dive B — maniacsOfNoise (.mon)

- `players/ManiacsOfNoise` = `amigasrc/players/mon/mon` **byte-identical**
  (1292 bytes, AmigaOS loadseg binary). Strings: "$VER: MON player module V0.1
  for UADE (01.01.2002)", "$COPYRIGHT: Heikki Orsila", "$LICENSE: GNU LGPL",
  "MON player for UADE by shd (based on replayer by Frederick Hahn and
  Maniacs of Noise/Charles Deenen)". It is a thin adapter (1292 bytes ≈
  SunTronic's 1624-byte adapter); **no ASM source in-tree** (binary only in
  amigasrc) — but it is LGPL, so source exists upstream in the UADE
  distribution/repo.
- Fixture `public/data/songs/formats/gyroscope.mon` (7788 bytes): module IS
  the player — starts with a 3-entry PC-relative JMP table
  (`4EFA 000A / 4EFA 015C / 4EFA 0064` → init/play/etc.), then
  `LEA $660(pc),A5` (data base A5-relative, mirroring sunTronic's A6 idiom).
  No text strings; ~7.8KB total (code + score + tables; samples likely
  embedded — parser scans 6-byte sample entries, ManiacsOfNoiseParser.ts:30-43).
- Tracer bucket: TRACEABLE, 29% dense read region [1674,4580)
  (2026-07-12_uade-opaque-tracer-wall.md:40,57).
- Cost picture: no replayer source; RE = disassemble the module's own code
  (~7.8KB incl. data) with the tracer delimiting the hot score region.
  Musical value very high (Charles Deenen / Maniacs of Noise catalogue).

## 4. UADE dynamic tracer (45b7568eb) — role in this campaign

Per `2026-07-12_uade-opaque-tracer-wall.md`: `chipmem_{b,w,l}get` hooks mark a
per-byte coverage bitmap of the module region; exports
`enable_module_trace`/`get_module_bounds`/`get_module_ranges`; harness
`tools/uade-audit/traceModuleReads.ts`; oracle test in test:ci. Proven: it
rediscovers digitalSonixChrome's sequence region. Limits: read-frequency
conflates envelope/waveform tables with note streams; no monotonic score
cursor (whole working set stays hot per 2s window) — so it CANNOT
mechanically emit a grid. For this campaign it serves as: (a) playability
check per fixture, (b) region delimiter (code vs never-read padding vs
sample DMA vs control data) before disassembly, (c) validation oracle — a
compiled new song must produce a sensible read topology and audio. Caveats:
4 formats fail headless load (jasonPage, jasonBrooke, jesperOlsen,
soundPlayer) and 4 read from a relocated base (coreDesign, fredGray,
jankoMrsicFlogel, desire) — tracer needs loader/relocation work there.

## 5. Tractability ranking (all 21)

Scoring axes: (S) replayer/adapter source available, (M) module class
(DATA-module easiest: the eagleplayer asm literally reads the score;
CODE-module = disassemble the rip; HUNK = relocation handling first),
(T) tracer support today, (V) musical value (catalogue significance).

| # | formatId | S | Module | T | V | Notes |
|---|---|---|---|---|---|---|
| 1 | **sunTronic** | adapter asm | CODE | yes (48%) | mid | **PILOT (user-confirmed)**: 200-module uniform V1.3 corpus, external instruments, DTP tag map, cross-module diffability |
| 2 | jasonPage | player src (Jason Page_v5.s) | DATA | load-fails | high (Virocop, Uridium 2) | 13.4K real replayer w/ source; score modules tiny (1284 B!) — smallest possible score-compiler target |
| 3 | soundPlayer | player src | DATA | load-fails | mid (Scott Johnston) | 15-byte header already specified in parser; IFF 8SVX samples parsed |
| 4 | jesperOlsen | player src (29K asm) | DATA | load-fails | mid-high | IFF samples work; 3 variants |
| 5 | markCooksey | player src ×2 (v2 + old) | CODE | yes | high (Cooksey catalogue) | 3 sub-variants; sample/song tables already LEA-located |
| 6 | customMade | player src (30K asm) | CODE | yes (38%) | mid (Viking Child) | inline samples already extracted; ignore_player_check |
| 7 | quartet | player src ×3 variants | CODE (.sqt) | yes (22%) | mid | 3 variants QPA/SQT/QTS; pattern pointers partially located in parser |
| 8 | desire | player src | DATA | relocated-base | mid (Batman Returns) | opcode-discovery framework proven for samples |
| 9 | specialFX | player src ×2 | CODE | yes (sparse) | high (Jonathan Dunn) | patterns in code+tables per triage |
| 10 | ashleyHogg | player src ×2 | CODE | yes (sparse) | mid | 2 variants + Protracker packing |
| 11 | steveBarrett | player src ×3 | CODE | yes (25%) | mid — NB fixture is actually a Wally Beben Ariston rip | signature collision worth resolving first |
| 12 | coreDesign | player src (15K) | HUNK | relocated-base | mid-high | pointer chains mapped in parser |
| 13 | jankoMrsicFlogel | player src | HUNK | relocated-base | mid | small modules (3.8K) |
| 14 | maniacsOfNoise | adapter binary only (LGPL — source upstream) | CODE | yes (29%) | very high (Deenen/MON) | 7.8K self-contained modules; best no-source candidate |
| 15 | scumm | none (448 B pure adapter) | CODE | yes (sparse) | very high (LucasArts) | 51K ripped player — big disassembly; iMUSE-adjacent docs exist publicly |
| 16 | fredGray | none | HUNK | relocated-base | high | sample table partially parsed |
| 17 | markII | none | CODE | yes (24%) | mid | 181K modules, prefix-only detection |
| 18 | seanConnolly | none | CODE | yes (sparse) | low-mid | self-contained player+music rips |
| 19 | sonicArrangerSas | none (SA v1 asm is the non-SAS player) | DATA | yes (sparse) | mid | may be mappable from full SonicArrangerParser (real SA parser exists, SonicArrangerParser.ts:197+) |
| 20 | mikeDavies | none | DATA | yes (sparse) | low-mid (Strider) | pure stub, zero structure known |
| 21 | jasonBrooke | none | DATA | load-fails | mid | pure stub, no source, no tracer |

### Recommended pilot order (top 3)

1. **sunTronic** — user-confirmed. Adapter source + uniform 200-module corpus
   + external instruments + decoded DTP entry-point map (section 2). Highest
   information density per RE hour of all 21.
2. **jasonPage** — the only format where a full commented replayer source
   (`Jason Page_v5.s`) meets near-trivially small pure-data score modules
   (1.3KB): the score compiler target is tiny and the source names every
   table. (Tracer load-failure is irrelevant once the source is the map.)
3. **soundPlayer** — player source + the parser already documents the 15-byte
   header and extracts 8SVX instruments; remaining unknown is only the
   pattern chunk layout (2026-07-12_uade-stub-format-triage.md:39-40).

Next tier after pilots: markCooksey (value) → customMade → quartet.
maniacsOfNoise is the flagship no-source target once the upstream LGPL mon
player source is fetched.
