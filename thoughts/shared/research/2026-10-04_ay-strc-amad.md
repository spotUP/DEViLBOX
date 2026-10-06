---
date: 2026-10-04
topic: ZXAY container - how .ay/.emul play today, and what STRC / AMAD would need (ledger F15)
tags: [formats, ay, zx-spectrum, research]
status: final
---

# ZXAY: EMUL today, STRC / AMAD tomorrow

## The path `.ay` / `.emul` takes

- `src/lib/import/parsers/ChipDumpParsers.ts` ~51: `/\.(ay|emul)$/` ->
  `parseAYFile` (`src/lib/import/formats/AYParser.ts`).
- The parser is the whole engine: it loads the ZXAY memory blocks into a
  64 KB array, runs the song's Init once and its Interrupt routine 300 times
  on the TypeScript Z80 (`src/lib/import/cpu/CpuZ80.ts`), captures the AY
  registers after each call (OUT to 0xFFFD selects, 0xBFFD writes), and
  turns the 300 frames into one 3-channel pattern (`framesToPattern`). The
  song returns three `FurnaceAY` instruments and NO file-data key: playback
  is the tracker scheduler voicing that pattern through the Furnace AY
  chip. There is no native AY engine; `zxtuneFileData` is a different route
  (`ZxtuneParser`, PT3/PSG/YM/VTX in `zxtune-wasm/src/zxtune_wrapper.c`,
  which detects `ZXAYEMUL` but then treats the file as a YM register dump -
  wrong for a Z80 image; that route is not what `.ay` uses).
- Measured 2026-10-04 (`npx tsx` probe over `parseAYFile`):
  `spring.emul` -> `rows=16 noteCells=0` - the STUB pattern. The Z80 never
  ran: `parseSongDescriptor` reads the song data as
  `[2-3 init][4-5 intr][6-7 stack][10+ blocks]`, which is not the Project AY
  layout. So `.emul` "played" silence before this work too; the 09-24 change
  only made the file detect.

## The Project AY layout (verified against spring.emul)

All pointers are signed big-endian 16-bit, relative to their own position
(Amiga DeliTracker origin, Motorola byte order).

```
Header
  +0  'ZXAY'            +4  TypeID 'EMUL' | 'STRC' | 'AMAD'
  +8  FileVersion u8    +9  PlayerVersion u8
  +10 PSpecialPlayer    +12 PAuthor        +14 PMisc
  +16 NumOfSongs-1 u8   +17 FirstSong u8   +18 PSongsStructure
SongStructure (4 bytes per song)
  +0  PSongName         +2  PSongData
SongData (EMUL)
  +0..3 ChanA ChanB ChanC Noise
  +4  SongLength u16    +6  FadeLength u16
  +8  HiReg u8          +9  LoReg u8
  +10 PPoints -> Stack u16, Init u16, Interrupt u16
  +12 PAddresses -> { Address u16, Length u16, POffset } ... until Address == 0
```

spring.emul: author "Il/4D 1999" (the PAuthor pointer lands mid-string in the
file as shipped - the file's own quirk), song "Spring", Stack 0, Init 0xC000,
Interrupt 0xC005, one block 0xC000+9832. Init 0 means "the first block's
address"; Interrupt 0 means the player hooks the IM1 vector itself, so the
frame call goes to 0x0038 (aylet's rule).

## What STRC and AMAD are

Same header and SongStructure; the SongData is NOT a Z80 image:

- `aztec theme.amad` (550 bytes, author Patrik Rak - the author of DeliAY):
  `c0 00 1f 01 20 6c 00 00 00 64 00 03 02 01 ...` - Amadeus song data,
  played by DeliAY's / AY_Emul's built-in Amadeus replayer (AY_Emul's own
  doc calls AMAD "an analog of FXM"). `PSpecialPlayer` is 0: the player is
  expected in the host, not in the file.
- `mega mix 1.strc` (4917 bytes): `00 01 02 03 c6 7e 00 00 00 32 06 40 82 c7
  d8 c7 ...` - a structure with Z80-address-shaped pointers (0xC782 ...),
  again for a host-side replayer ("STRC" = the Deli Player "structure"
  type).

Searched for an implementation to reuse (2026-10-04): `third-party/**`,
`node_modules/**` (grep ZXAYSTRC / ZXAYAMAD: none); zxtune-wasm (EMUL
detection only, no Z80); aylet / libayemu / ayfly / deadbeef's AY plugin
all document EMUL only. Project AY's `ayformat.htm` and AY_Emul's
documentation were unreachable from this machine (404 / 403 / connection
refused). No STRC or AMAD replayer exists in reach; AY_Emul (Sergey Bulba,
Delphi) has them built in.

## What this means

1. `.emul` / `.ay` now play through aylet 0.5 (Russell Marks, Ian Collier;
   GPL-2.0-or-later), vendored under `third-party/aylet-0.5` with its COPYING
   and compiled to wasm in `aylet-wasm/` (`public/aylet/`). The owner's
   instruction was to reuse a player rather than write one; aylet was chosen
   because it is a complete ZXAYEMUL player in ~2000 lines of C (a Z80 from
   xz80 plus an AY/beeper renderer), with no dependencies, and plays the
   file as the Spectrum would: the tune's own code runs. ayfly and
   libayemu need a separate Z80 core (z80ex) and ZXTune's AY module is far
   larger; deadbeef's plugin is a wrapper over the same ideas. One change
   to aylet's code: `z80.c`'s endless loop became `aylet-wasm/src/z80_frame.c`,
   re-entrant one 1/50 s frame per call, because aylet blocks inside
   `do_interrupt()` to play and an AudioWorklet pulls samples instead.
   `sound.c` and the opcode tables are used unchanged from `third-party/`.
   Measured headless (`src/engine/__tests__/ayletPlaysEmul.test.ts`):
   `spring.emul` RMS 0.16 with every channel on, 0 with every channel
   muted, each solo between.
2. The tracker grid is drawn from the SAME wasm (`AyletWasmExtractor`): the
   tune runs 300 frames and the registers after each frame become the
   pattern. The TypeScript Z80 (`src/lib/import/cpu/CpuZ80.ts`) was tried
   first, with the layout fixed: `spring.emul` carries a Pro Tracker 3
   player, whose register dump goes through `OUTI` (a NOP in CpuZ80 until
   now - fixed, with tests) and whose init uses undocumented IX/IY
   half-register ops the TypeScript Z80 skips, so its grid stayed empty.
   One Z80 for playback and grid means the grid shows what plays; CpuZ80 has
   no caller left besides its own tests.
3. STRC and AMAD still have no replayer: aylet refuses them
   (`main.c:508`, `ZXAYEMUL` only), as do ayfly, libayemu, ZXTune and
   deadbeef. They are registered (`ayStructured`) so the refusal names the
   payload and the missing replayer instead of "Unsupported file format".
   What would close them: the AY_Emul (Sergey Bulba, Delphi) or DeliAY
   sources for the Amadeus and "structure" replayers, ported to C beside
   aylet and fed the SongData. Neither source was reachable from this
   machine on 2026-10-04.
