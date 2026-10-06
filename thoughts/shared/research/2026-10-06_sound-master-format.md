---
date: 2026-10-06
topic: Sound Master (Michiel Soede, sm/sm3/smpro) - the song data the module's own replayer reads
tags: [formats, sound-master, reverse-engineering, grid, uade, amiga]
status: implemented
---

# Sound Master song format

A Sound Master module is its own replayer: a BRA.W jump table, the 68k player and its variables, then the
song. The Wanted Team eagleplayer (`third-party/uade-3.05/amigasrc/players/wanted_team/SoundMaster/Sound
Master_v1.asm`) only calls into it (InitSound jumps to +0, Interrupt calls the entry at +4) and patches it;
the song structures are what the module's own code reads. Reversed by disassembling each corpus module's
player (capstone, `tools/suntronic-re/disasm-raw.py <file> 0`).

Corpus (3 distinct modules; `formats/rackney'sisland_4.sm` is a copy of the first):

| file | player | layout | A3 (vars) | speed | rows/pattern | start..end |
|---|---|---|---|---|---|---|
| `sound-master/rackney'sisland 4.sm` | Sound Master 1.x | offsets | $9DE | 3 | 16 | 1..19 |
| `sound-master-ii-v3/doofus 3.sm3` | Sound Master II v3 | offsets | $930 | 4 | 16 | 0..34 |
| `sound-master-ii-v1/futureshock-level 3.smpro` | Sound Master II v1 | fixed | $810 | 6 | 16 | 0..20 |

Code: `src/lib/import/formats/SoundMasterModule.ts` (module <-> model), `soundMasterGrid.ts` (walk, row codec,
edits), `soundMasterEffectGlyphs.ts`, `SoundMasterParser.ts`, `src/lib/export/SoundMasterExporter.ts`.

## Locating the song (every address from the instruction that reads it)

- A3: the play entry (BRA.W at +4) starts `lea $dff000,a6; moveq #3,d7; lea A3(pc),a3` in all three players.
- Period table: `asl.b #1,d0; lea table(pc),a0; move.w (a0,d0.l),d0`. 46 words in 1.x / II v3 (`cmpi.b #$2e`
  before it), 64 in II v1.
- 'offsets' layout (1.x, II v3): the block read `lea data(a3),a0; adda.l blocks(a3),a0; adda.l (a5),a0;
  move.b (a0,d1.l),d0; move.b 1(a0,d1.l),$31(a5)` gives the data start and the first header long; the speed
  read `move.b speed(a3),-9(a3)` the header start. Checked: data = header + $23, the pattern-length and
  pattern-offset reads (`move.b patLen(a3),d1; mulu.w d0,d1; lea data(a3),a0; adda.l pat(a3),a0`) land on
  header+1 and header+21.
- 'fixed' layout (II v1): position read `lea pos(a3),a0; lea cur(a3),a1; moveq #2,d4; move.b (a0,d3.l),(a1)+`,
  block read `lea blk(a3),a0; adda.l (a5),a0; move.b (a0,d1.l),d0; adda.l #$400,a0`, instruments
  `mulu.w #14,d0; lea ins(a3),a4`, arpeggio `lea arp(a3),a2; move.b (a2,d0.l),d1`, wave `lea wave(a3),a1;
  move.b (a1,d0.l),d0`, patterns `move.b patLen(a3),d1; mulu.w d0,d1; lea pat(a3),a0`, sample lengths
  `lea len(a3),a0; adda.l patSize(a3),a0`, speed/start/end/filter from init and the advance routine.
  Checked: blk = pos + $200, ins = blk + $800, arp = ins + 64*14, wave = arp + 256, pat = wave + 256,
  len = pat + $80 (+ patSize).

A player without these instruction sequences is refused (no grid).

## 'offsets' layout (Sound Master 1.x, II v3)

| where | what |
|---|---|
| [0, H) | jump table, player, variables (voice structs $36 / $34 bytes at A3, A3+$36.., voice offsets 0/2/4/6) |
| H+0 | speed (ticks per row) |
| H+1 | pattern length in bytes (2 per row) |
| H+2 | restart = first position played (song mode, init d0 = 31 from the eagleplayer) |
| H+3 | end: positions played are [restart, end) |
| H+4 | filter (0 = LED filter on) |
| H+5.. | 7 longs from D: blocks, instruments, arpeggio table, wave table, patterns, sample data (from the sample table), sample table |
| H+33 | pad word |
| D = H+$23 | positions: 8 bytes (first block, last block, transpose, volume/fade, 4 x voice instrument offset) |
| D+blocks | blocks: 8 bytes = 4 x (pattern, transpose) |
| D+instruments | 16-byte instruments: +0 sample (bit 7: start at loop), +1 attack speed, +2 attack level, +3 decay speed, +4 sustain level, +5 vibrato delay, +6 vibrato depth, +7 vibrato speed/step nibbles, +9 wave/arp table start, +10 table end (0 = no table), +11 table loop point, +12 the note an arpeggio $81 plays, +13 finetune (added to the note) |
| D+arpeggio | bytes added to the note per tick ($80 = no change, $81 = the instrument's byte-12 note) |
| D+wave | sample per tick (bit 7: retrigger) |
| D+patterns | patterns, `patLen` bytes each |
| D+sample table | 10-byte slots: long offset from the sample data, word length (words), word loop start (bytes), word loop length (words). Built-in slots (offset negative) are pointed at waves in the player by its init |
| ... | sample data to the end of the file |

All seven offsets are contiguous in both modules, so the encoder recomputes them from the section sizes.

## 'fixed' layout (Sound Master II v1)

| where (from A3) | what |
|---|---|
| [0, A3+$E8) | jump table, player, variables; A3+$D9 volume, +$DB current speed, +$DD speed, +$DE pattern length, +$DF start, +$E0 end, +$E1 filter, +$E2 long pattern bytes |
| A3+$E8 | positions: 7 columns of 64 (first, last, transpose, volume/fade, 4 x voice instrument offset) + 64 unused |
| A3+$2E8 | blocks: 4 pattern columns of 256, then 4 transpose columns of 256 (voice offsets 0/$100/$200/$300) |
| A3+$AE8 | 64 instruments of 14 bytes (as above with +8 vibrato delay, +13 finetune) |
| A3+$E68 / $F68 | arpeggio / wave tables, 256 bytes each |
| A3+$1068 | patterns (`patterns bytes` / pattern length of them) |
| + patterns | 32 longs sample offset, 32 words length, 32 words loop start, 32 words loop length |
| + $140 | sample data to the end of the file |

## The walk (advance routine, one call per 50 Hz interrupt)

Tick counter, row (byte offset, +2), block, position. On the last tick of a row the row advances; after the
last row of a pattern the block advances: `cmp.b last,d2; beq next position; addq.b #1,d2` (a byte, so a
position's blocks are first, first+1, ... until equal to last). After the last block the position advances;
`position + 1 == end` goes back to the start position (the eagleplayer patches this spot to report song
end), resets the speed and the fade. Every voice reads row r on tick 0 of the row: the voices are in step,
one block = one grid pattern of patLen/2 rows. The block pointer of each voice is set from the block table
on the tick a block starts.

II v1 only: note byte $FD sets the speed to the info byte (from this row), $FE ends the block after this row.

## Row = [note, info]

| note | meaning |
|---|---|
| 0 | no note; the envelope falls to the sustain level (a row without a note releases) |
| $FF | hold: no note, the envelope keeps attacking; the info byte is not read |
| bits 0-5 | the note; bit 6 portamento to it (speed = info & $7F, the sample still restarts), bit 7 legato (pitch only: no DMA restart; II v1 also keeps the instrument) |

| info (with a note, no portamento) | meaning |
|---|---|
| bit 6 | volume = info & $3F, instrument unchanged |
| else | instrument = (info + voice's position offset) & 63 |
| bit 7 | the note is not transposed |

Pitch: `(note + block transpose + position transpose + instrument finetune) & 63` is the II v1 table index;
1.x / II v3 subtract 18 and use the first period when the result is >= 46. Both tables put period 856 at
index 24 (II v1 table: 3424 at 0), so the grid note is index - 11 in ProTracker naming (24 -> 13 = C-1). The
finetune is that of the instrument started by the note (legato keeps the previous).

## Grid

- One pattern per block played, in song order from the start position until the song is back at it; order
  = 0..n-1, restart 0. Rows = patLen / 2 (a $FE row ends the pattern), speed = header speed, 125 BPM.
- Cell: note + period from the player's table; instrument column = instrument + 1; info bit 6 = volume
  column $10 + v; portamento = XM 3xx; $FD = Fxx, $FE = D00 (II v1). Private block 0x74..0x76
  (`soundMasterEffectGlyphs.ts`): H hold (info kept), L legato, N a note byte whose pitch is outside the
  table. Info bit 7 (no transposes) is not shown - the note shown is already the played one - and the
  info bits the player ignores on a row without a note are not shown; both stay in the module and are
  kept by writeCell from the stored row (owner 2026-10-06: K00 on 3412 and I0x on 493 rackney cells read
  as wrong effects).
- Every grid cell re-encodes to its own two bytes in its context (transposes, the voice's instrument
  offset, the instrument it holds) on all three modules.

## Edits and export

A cell's bytes depend on the step's transposes, so the layout writes through `writeCell`
(`SmSong.edit`): the row's two bytes at their file offset, which UADEChipEditor pokes at module base +
offset (the player reads patterns in place). Steps after it are walked again (instrument held, finetune).
The exporter decodes the loaded module, writes every cell that differs from the decode (so a pattern row
shown by several steps keeps the edit made in any of them), and encodes: byte-exact when unedited.

## Verification (2026-10-06)

- Byte-exact decode -> encode on all four corpus files; exporter ratchet `soundMaster` byte-exact.
- UADE Paula log read with the replayer's own note-on burst (a voice's AUDxLC written twice - the per-tick
  loop pointer, then the note's sample - before its AUDxPER): every note-on of every voice over the whole
  song equals the grid's, period-exact (portamento notes start at the glide's origin, not compared) and
  within 30 ms (one tick + the 10 ms render grain): rackney 2038/1851/1503/2436, futureshock
  964/880/496/282 (24 + 4 legato rows do not restart the sample), doofus 2896/2077/1837/0 up to UADE's
  512 s subsong timeout (the song is 532 s).
  `src/engine/__tests__/soundMasterGridMatchesPlayer.test.ts`.
- Playhead: with `uadePlayerTickGrid` the row the app shows (playerTickGridPosition of the worklet's player
  interrupt count) holds every note Paula starts in that block (rackney 20 s, futureshock 15 s),
  `src/engine/__tests__/soundMasterPlayheadFollowsUade.test.ts`.
- Edits: a grid edit through UADEChipEditor.patchPatternCell at 1 s is the note UADE plays when the row is
  reached, every other note unchanged.
- Before: the parser scanned the module for words in the Amiga period range and dealt them out over four
  channels (192/176/160/160 notes on rackney against 2038/1851/1503/2436 played).
- gridVsPaula (loose, tool unchanged) before -> after: rackney 0.57/0.45/0.47/0.58 -> 0.82/0.55/0.42/0.80,
  doofus 0.49/0.51/0.49/0.45 -> 0.61/0.62/0.43/-, futureshock 0.51/0.49/0.47/0.49 -> 0.57/0.45/0.47/0.34.
  The tool reads ~6500 Paula "notes" per voice where the player starts ~2000: this replayer writes every
  voice's sample pointer and period on every tick, so the tool's arm-on-pointer rule fires each tick and
  its interval sequence is mostly zeros. The exact reading above matches every note; the shared tool is
  not changed (it would move every format's score).

## Open

- Pattern rows shared by several steps: an edit is written once (one set of bytes) but the other grid cells
  showing that row are not redrawn until the song is loaded again.
- Instruments are shown as samplers of the sample they start with; the envelope, vibrato, arpeggio and wave
  tables are not instrument parameters in the editor (they are kept byte-exact).
- II v1 speed rows ($FD) change the speed mid-song; the player-tick playhead mapping assumes one speed. No
  corpus module has one.
- Sound effects (the entry at +$C, 1.x only) and the fade entry are not part of the song and not modelled.
