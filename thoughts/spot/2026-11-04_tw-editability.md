---
date: 2026-11-04
topic: TW (Tony Williams / Sound Images) editability, phase 1 findings
status: phase 2 built for future basketball (same-length edits); relocation and variants open
---

# TW editability, phase 1

Verdict: per-channel command stream FOUND. Class = Rob Hubbard recipe
(docs/FORMAT_COMMAND_STREAM_GRID.md). Sibling to copy: davidWhittaker
(DavidWhittakerParser.ts 815 lines, davidWhittakerGrid.ts 149, davidWhittakerEdits.ts 259).

## Corpus
- public/data/songs/formats/: `future basketball main.tw` (102144 B), `blinkys scary school-sfx.tw` (76738 B)
- server/data/modland-cache/files/: also `chuckie egg 2.tw` (30166 B, header `6000 008c`),
  `warinthegulf.tw` (53854 B, header `b27a 003c ...` = a DIFFERENT player variant, not yet looked at)
- Extension routing today: 'tw' in src/lib/import/uadeExtensions.ts:223, formatRegistryData.ts:2549 (UADE only, no parser).
- Header: `6000 xxxx` bra to interrupt code; string "(c) 1990 Tiny" style credits. Variants differ in the bra target
  (fb: 0x9c, blinkys: 0x8c? chuckie: 0xa0), so locate tables by scanning code, not by fixed offsets.

## Disassembly method
`m68k-elf-objdump -D -b binary -m 68000 file.tw` works (brew binutils). Analysed `future basketball main.tw` only
(offsets below are for THAT file; other variants must be re-derived; a5 = global state, a0 = voice struct,
a1 = stream pointer). All offsets file-relative.

## Structure (future basketball)
- Song init at 0x90e: d0 = songNo*10; record at `0x97c + songNo*10`: 4 words = per-voice list offsets
  (relative to 0x97c), then 1 word = speed/tempo (`0606`: high byte -> a5+18 tempo, written at 0x92e-0x936).
  Song 0 at 0x97c: lists at 0x97c+{0x14,0x32,0x4e,0x6a}.
- Voice list (voice->a0@(14)): array of big-endian words, each = stream offset from 0x97c; word 0 = end of list,
  at which the player reads byte at 0x7ab (value 0x82) as a command, i.e. "0x82 = jump list": reads word, sets list
  pointer = 0x97c+word (loop). Handler 0x51a/0x526.
- Stream (a0@(18)) is read at 0x1c4. Byte < 0x80 = NOTE (transposed by a0@(70), period table at 0x634, 64 words?);
  duration is STICKY: a0@(55) set by 0xE0-0xFF (len = b - 0xDF, 1..32), counter reloaded at 0x250.
  Note itself carries no duration.

## Opcode table (command byte >= 0x80)
| byte | handler | operands | meaning (from code) |
|---|---|---|---|
| 00-7F | 0x1ca | 0 | note (+transpose a0@70), sets period, triggers |
| 80 | 0x526 | 0 | end of pattern: fetch next word from voice list |
| 81 | 0x1be | 0 | a0@25 = -1 (no-retrigger/tie flag), continue |
| 82 | 0x51a | 2 (word) | set list pointer = base+word (loop point) |
| 83 | 0x61c | 0 | song end / stop |
| 84 | 0x5a0 | 2 | volume envelope params (a0@42, nibbles to @62/63/41) |
| 85 | 0x250 | 0 | clear volume a0@9 then reload |
| 86 | 0x270 | 0 | same as 85 variant |
| 87 | 0x1aa | 1 | a0@70 = transpose |
| 88 | 0x1b0 | 3 | a0@64,46,47 (portamento/slide params) |
| 89 | 0x5be | 5 | vibrato/modulation params a0@53,52,51,50,54; sets flag bit2 |
| 8A | 0x1a2 | 0 | clear flag bit2 (vibrato off) |
| 8B | 0x5ee | 3 | flag bit1 + a0@51,50,49 |
| 8C | 0x5e6 | 3 | flag bit5 + a0@51,50,49 |
| 8D | 0x5dc | 0 | clear flag bit5 |
| 8E / 8F | 0x25c / 0x266 | 0 | set / clear flag bit4 |
| 90 | 0x344 | 0 | clear flag bit0 |
| 91 / 92 | 0x34e / 0x35e | 0 | volume down / up one step (clamped 0..15) |
| 93 | 0x370 | 0 | a5@4 = 0x3838 (fade) |
| 94 | 0x37a | 0 | stop song, DMA off |
| A0-AF | 0x2be | 0 | arp/pattern pointer from table at 0x2e4 (word offsets) |
| B0-BF | 0x2b2 | 0 | a0@36 = b-0xB0 (volume) |
| C0-CF | 0x556 | 3 | a0@36 = b-0xC0; envelope nibbles a0@37,38,39,40,58-61 |
| D0-DF | 0x6da | 0 | instrument: 12-byte entries at 0x704 (long ptr+word len, long loop ptr+word loop len), ptrs relative to a5 (file base) |
| E0-FF | 0x2a6 | 0 | duration = b - 0xDF ticks |
Operand counts are read from the handlers (each `moveb %a1@+`); the word operands of 82/84 are read from the
handler bodies, 82 via `movew %a1@,%d0` (not post-increment: confirm it consumes 2 bytes - the list terminator path
at 0x54e re-enters 0x276 with a1 untouched, so 82 operand is read from the LIST, not the stream). UNVERIFIED.
Table decode: dispatch table words at 0x31a (21 entries, 0x80-0x94), jump = 0x31a + word.

## Unknowns to settle before coding
1. Whether 82's word is in the stream or the list (see above). Verify by walking song 0 voice 0 from 0x990.
2. Instrument table (0x704) base/count and whether D0-DF index is relative to a block-start; envelope nibble semantics.
3. Variants: blinkys, chuckie egg 2 share `6000 xxxx` header; warinthegulf has a different header (maybe different player).
   Need per-variant offset discovery (scan for `4a2d`/`0x97c`-style lea chains; recipe 5 in the doc).
4. Per-song tempo/speed word and how many songs (record count = (first list offset)/10 patterns?).

## Build plan (copy davidWhittaker, 4 files)
1. `TonyWilliamsParser.ts`: detect (`6000` bra + player signature scan), locate song table via the init routine
   (`muluw #10` + `lea pc@(x,d0)`), decode 4 voice lists -> blocks -> decoded tick events using the table above.
   Emit `blockRows` carrier (verbatim bytes per block, byte-exact) like DavidWhittakerParser.
2. `tonyWilliamsGrid.ts`: events -> tick grid (note, sticky duration expanded to rows, instrument D0, vol B0/C0),
   `tonyWilliamsEffectGlyphs.ts` for remaining ops.
3. `tonyWilliamsEdits.ts`: grid edit -> re-encode block, shifting stream & updating list/song-table offsets
   (all offsets are base-relative words, so growth needs a relocation pass; shrink can pad with 0x80? no: pad needs an
   end-of-pattern, so prefer in-place same-length edits first, same as DW's first cut).
4. Wire: route 'tw' in the UADE import map to the parser (grep how DW is hooked: formatRegistryData + import router),
   playback stays on UADE with chip-RAM patching (see reference_uade_chipram_editing memory) unless a nuade port follows.
5. Test: real-song round trip (edit a note -> export -> reparse, assert bytes identical outside the edit), on
   future basketball + blinkys + chuckie egg 2; one reachability test via the import entry point with call sentinel.
Size estimate: parser ~500 lines + grid/edits/glyphs ~400 + test ~150; 1-2 agent days; relocation on growth is the risk.

## Phase 2 results (2026-11-04)
RESOLVED: 0x82 operand is the loop word in the voice LIST after the 0x0000 terminator, not in the stream.
List = first-block word, block words..., 0, loop word (all relative to the base). Song count = (first list offset of record 0)/10 (2 in future basketball).
Base: scan for `c0fc 000a` then `43fb` lea; base = ext-word PC + int8. Instrument table: same scan with `c0fc 000c`, 12 bytes per entry, D0-DF index = b-0xD0 (max 16).
Pitch: 36-word PT period table at 0x634, index (byte+transpose)&63, tracker note = 13+index. Duration E0-FF sticky = b-0xDF ticks. Operand lengths: 82:2(list) 84:2 87:1 88:3 89:5 8B:3 8C:3 C0-CF:3, rest 0.
Built: tonyWilliamsWalk/Grid/Edits/EffectGlyphs (effTyp block 0x90..0x9F), TonyWilliamsParser, TonyWilliamsEncoder, TonyWilliamsExporter, `tw` branch in AmigaFormatParsers, glyph hooks in xmConversions + both renderers, corpus test.
Edits written back same-length: note (shifts note byte), instrument (D0 byte), duration/volume/envelope/arp command byte, one-byte operand of 84/87/88/89.
OPEN: length-changing edits need list/block relocation (all offsets base-relative words; the code is fused with data, so growth moves the sample data at 0x1404 unless padded). Instruments are placeholders (no sample extraction, UADE plays). Subsong >0 wired through parser arg only.
Variants: blinkys scary school-sfx and chuckie egg 2 (`6000 xxxx`) need the base locator verified (same muluw scan may fail if the init differs) and their pitch/instrument tables re-derived; warinthegulf (`b27a 003c`) is a different player: needs its own disassembly pass (header, song table, opcode table).

## Phase 3 (2026-11-04, follow-up agent)
Done: top-level import reachability test (TonyWilliams.reachability.test.ts: parseModuleToSong -> TW parser call count 1, 4 voices with notes, native export byte-identical); note-edit test now asserts exactly one differing byte, value = old+1, at a walked note offset.
BUG FOUND AND FIXED by the reachability test: buildTwGrid swept `walk.events` as if tick-ordered, but the walk emits one voice after another, so the sweep stopped at voice 1's tail and voices 2 and 3 had ZERO notes in the grid (counts were 662/233/0/0, now 662/233/315/537). Export was still byte-exact because the carriers do not depend on the grid. Fix: stable tick sort in the grid.

### Length-changing edits: NOT implemented (analysis)
Layout, future basketball: base 0x97c; song records 10 bytes (4 list offsets + tempo word); voice lists = block words (base-relative), 0x0000, loop word. Blocks occupy 0xa14..~0x13xx and sample data starts 0x1404: there is NO slack between the last block and the samples. Any insert grows the stream, so these must move together:
1. every block after the edit point (block words in all four voice lists, and the loop word after each terminator, are base-relative words: all lists share blocks, so one pass over the 4 lists plus loop words);
2. all sample data from 0x1404 on (the whole tail of the file);
3. the instrument table (12-byte entries: long sample ptr + word len, long loop ptr + word loop len, pointers relative to file base): every pointer must be + delta;
4. any other absolute or base-relative reference into the tail: UNVERIFIED. The arp/pattern table at 0x2e4 (A0-AF) holds word offsets whose base is not yet established; code in the fused player could hold `lea`/`move.l #abs` into the samples; the DMA start reads use the table pointers only if no other path exists. Not proven by grep or disassembly.
5. Word limits: lists and loop words are 16 bit, fine (file 102 KB but base-relative < 64 KB from 0x97c only if the tail is below 0x1097c; samples above that are referenced by LONG pointers only, so nothing to change in word fields).
Why stopped: (4) cannot be proven exact without a disassembly pass over every reference to the sample region plus an audible/register-level check in UADE (the headless oracle for TW does not exist yet), and the spec requires exact-or-stop. Decision for the owner: accept relocation of the tail with the instrument-table patch (risk: an unlisted sample reference breaks playback silently) or keep edits same-length only (current).
Safe middle path if wanted later: shrink-only edits (delete an event, pad the block with the neutral byte 0x81/0x85-class no-op or an unused duration repeat) keep every offset fixed; needs a verified neutral opcode (0x81 = tie flag changes retrigger, so NOT neutral; 0x90 clears flag bit0 and may be neutral) before use.

### Variants (2026-11-04)
Only two .tw files are in public/data/songs/formats: future basketball main (parses, grid 4 voices, export byte-exact) and blinkys scary school-sfx. chuckie egg 2 and warinthegulf are not in the repo; Modland path not found by guess (404), not fetched.
blinkys scary school-sfx.tw: header `6000 00a0`, both `c0fc 000a`/`c0fc 000c` scans succeed (base 0x932, 5 songs, instrument table found) but the walker returns null: different song-table layout. Record = `0032 0034 0036 0000 0202`: three voice words, the 4th is 0 (unused voice), and each word points at ONE block word (0x38, 0x5b, 0x59) with no 0x0000 terminator and no loop word; the "lists" overlap and run straight into stream data. So the list format differs (sound-effect player variant: a single block per voice, ended by an end opcode); not an offset or signature change. Needs: list parse mode "one block word per voice", zero word = unused voice, verification of 0x80/0x83 end handling. Result: parses NO, grid n/a, export n/a (falls back to UADE, original bytes untouched).
warinthegulf (`b27a 003c`): not available, different player, not attempted.
