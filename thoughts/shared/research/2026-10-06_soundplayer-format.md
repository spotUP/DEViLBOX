---
date: 2026-10-06
topic: Sound Player (Scott Johnston, SJS.* + SMP.*) - the song data the replayer reads
tags: [formats, soundplayer, reverse-engineering, grid, eagleplayer, amiga]
status: implemented
---

# Sound Player (SJS.*) song format

Source: `third-party/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/src/SoundPlayer_v1.asm`
("SoundPlayer V4.05", Scott Johnston 1991, the Lemmings CDTV replayer, Wanted Team adaptation).
Line numbers below are in that file. Corpus: `public/data/songs/formats/Scott Johnston/` (31 `sjs.*` + 31 `smp.*`).
Code: `src/lib/import/formats/soundPlayerCodec.ts` (codec + walk), `SoundPlayerParser.ts` (grid), `soundPlayerEffectGlyphs.ts`.

## Files

- `SJS.<tune>`: the song (below). Loaded by DTP_InitPlayer as list entry 0 (`InitPlayer`, :420).
- `SMP.<tune>`: the samples, opened by DTP_ExtLoad (ExtLoad :341, CopyName, which rewrites the `SJS` of the file name to `SMP`), list entry 1.

## Song file

| offset | size | meaning | evidence |
|---|---|---|---|
| 0 | 1 | CIA timer, low byte | InitSound :515-524: `move.w (A2),D0; rol.w #8,D0; move.w D0,dtg_Timer` -> timer = byte1 << 8 \| byte0 |
| 1 | 1 | CIA timer, high byte | same; Check2 (:296) requires $0B..$A0 |
| 2 | 1 | voice mask (bit N = Paula voice N played) | lbC0639D6 (:764) copies it to $3A of the song struct; lbC063A96/lbC063AF8 (:825-861) attach voice N only when bit N is set; Check2 accepts 7 or 15. InitPlayer reports 4 voices for 15, else 3 |
| 3 | 12 x n | rows: per voice v, 3 bytes at +3v: note, instrument, command | lbC063D4E (:1041) reads `0(A1,D0)`, `1(..)`, `2(..)` with D0 = 0/3/6/9 per voice |

There is no order list, pattern table or track table: the row array is the whole song. The file is
always 3 + 12 n bytes in the corpus (no tail). What the old detector called the "15-byte header" is the
3-byte header plus row 0, which in every song is a command-only row (Check2 asks bytes 3,4 / 6,7 / 9,10 / 12,13
= 0 and the same command at 5, 8, 11 [, 14] - every corpus song starts with a volume command on each voice).

GetPosition (:126) reports `(pointer - (module - 9)) / 600`: a "position" is 50 rows, a display convention
of the player, not a structure in the data.

### Per-voice walk (the timing)

- lbC0639D6 (:764) points all four voice structs (14 bytes each at lbL0643F4+$214: +0 pointer, +4 loop
  pointer, +8 start, +12 loop count, +13 wait) at `module - 9`, i.e. one row before row 0.
- Play (lbC063CE6, :1004) every player tick: volume slides (lbC063E0A), DMA start of the notes set on the
  previous tick (lbC063DAA), then the row counter (lbC063D18: reload 5, count down; rows run when it reaches 0
  -> one row tick every 6 player ticks). On a row tick: lbC063D70 advances each voice, lbC063D2C reads each
  voice's 3 bytes, lbC063EA8 sets up notes, lbC063F1E runs commands.
- Advance (lbC063D8A :1060): if the voice's wait byte is non-zero, decrement it; while still non-zero the
  pointer stays and the row is not read (lbC063D4E tests the same byte). Otherwise pointer += 12.
- So each voice is its own stream over the shared row array: waits, loops and the song end move only that
  voice's pointer. The grid is therefore a row-tick timeline per voice (`walkSoundPlayerVoice`), one grid row =
  one row tick = 6 player ticks; a row the voice spends waiting has no bytes behind it.
- Note-on: lbC063ECE (:1183) on a row with note != 0: period = lbW0642A6[note-1], sample = slot `instrument`;
  Paula is started on the next player tick (lbC063DAA), i.e. player tick 6(t+1)+1 for row tick t.

Measured (UADE Paula log vs grid, `scratchpad timing.ts`, 5 songs, whole song): every note-on within one
player tick (15-25 ms) of 6(t+1)+1 player ticks -> the grid is row-exact.

### Note byte

1..39 -> period lbW0642A6 (:1585): $434 $3F8 $3C0, then $358 (856, ProTracker C-1) up to $71 (113, B-3).
So notes 1-3 are G#0/A-0/A#0 and 4..39 are C-1..B-3 (no B-0). 0 = no note. Bytes > 39 would read past the table
(into the command table); none in the corpus. Grid naming: `periodToNote` (ProTracker naming).

### Instrument byte

Sample slot (1-based); only read with a note (lbC063ECE: `$40(A5,D2)` index into the 14-byte sample structs).

### Command byte (jump table lbW0642F4 :1624, handlers :1288-1424)

| bytes | effect | grid |
|---|---|---|
| $00 | none | - |
| $01 / $02 | BSET / BCLR #1,$BFE001 (filter off / on) | E01 / E00 |
| $03-$42 | volume = byte - 3 (0..63) | Cxx |
| $43 | this voice's DMA off (note cut) | EC0 |
| $57-$88 | wait: hold the voice on this row for byte - $56 row ticks (1..50) | Wxx (private) |
| $A7-$B0 | volume +1 every byte - $A6 player ticks, up to 63 | Ax0 |
| $B1-$BA | volume -1 every byte - $B0 player ticks, down to 0 | A0x |
| $BB-$CE | set game sync flag byte - $BB (lbW064178+$11A) | Sxx |
| $CF / $D0 | hold on / off: sample not re-pointed to its loop / empty sample after the one-shot (lbC063E82 :1158) | H01 / H00 |
| $D1 | clear all 20 sync flags | SFF |
| $D2-$DB | loop start, count byte - $D1 (armed only when no loop is running) | L01..L0A |
| $DC | loop end: count 0 -> idle, else count-1 and back to the loop-start row | L00 |
| $DD | pointer -= 12: the voice re-reads this row forever | P00 |
| $DE | pointer = start (row 0 next), dtg_SongEnd | B00 |
| $DF-$E4 | ADKCON $8000 \| 1,2,4,$10,$20,$40 (modulation on) | M81..MC0 |
| $E5-$F8 | clear sync flag byte - $E5 | S80..S93 |
| $F9-$FD | ADKCON 1,2,4,$10,$20 (modulation off) | M01..M20 |
| $44-$56, $89-$A6, $FE, $FF | table entry 0 = RTS: ignored by V4.05 (they occur: 600+ in played voices) | Nxx (raw byte) |

Private grid effect ids 0x63..0x69 (`soundPlayerEffectGlyphs.ts`); every byte decodes to a distinct
(effTyp, eff) and encodes back (test: all 256).

### Song length / loop

Every voice ends its pass with $DE; in all 31 corpus songs all played voices reach it on the same row tick
(the song length, 305..1025 row ticks). Voices then restart at row 0 (loop state survives). No subsongs
(InitSound always initialises song 0; no DTP_SubSongRange).

### Bytes the player never reads

- In voice-mask-7 songs the fourth 3-byte column of every row: voice 4's struct is never attached (its
  pointer stays 0; Paula voice 4 stays silent in every UADE render). Mostly leftover data.
- Rows past a voice's $DE in that voice's column.
Both are kept verbatim by the module codec (`decodeSoundPlayerModule` holds all four columns of every row).

## Samples file (SMP.*)

InstallSamples (lbC0639BE :732): walk from offset 0 in 4-byte steps, slot number +1 per step; at a `FORM`
call lbC06392C (:677, fill the slot) and jump past the chunk (FORM + 8 + length). Slot numbers therefore skip where
the file has 4-byte gaps (sjs.tune6: slots 1, 2, 5, 12, 13). lbC06392C: VHDR (searched in the first $400
bytes) one-shot length and repeat length (bytes / 2 -> words), BODY (first $800 bytes) start; loop start =
BODY + one-shot. At most 38 slots. Playback: one-shot part, then the repeat part loops (or an empty word when
repeat = 0, unless hold $CF).

## Verification (2026-10-06)

- Byte-exact decode -> encode: 31/31 files; every grid cell re-encodes to its own 3 bytes
  (`src/engine/__tests__/soundPlayerGridIsThePlayersWalk.test.ts`); encoder ratchet soundPlayer lossy 0.39 -> byte-exact 1.0.
- gridVsPaula (no --secs): 1.00 on every played channel of all 31 songs (sjs.jb via --grid-json: the tool's
  content detector picks Jason Brooke for the `.jb` suffix; the app's router sends `sjs.*` to Sound Player first).
  Note-on counts equal Paula's; 6 voices have one note more in the grid = the last row's note, which UADE cuts
  at the song end before it reaches Paula.
- Before: the native parser drew one empty pattern (0 notes); the app then used UADE's scan grid or, if
  UADE's `formatName` matched NATIVE_ROUTES['SoundPlayer'], that same empty grid (not measured: needs the browser).
- Edits: `soundPlayerEditReachesRunner.test.ts` - the store edit path writes the re-encoded cell into the
  module the eagleplayer runner plays (`ep_wasm_write_module`), and the runner plays the new pitch.
