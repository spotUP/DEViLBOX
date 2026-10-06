---
date: 2026-10-06
topic: Jesper Olsen (.jo / JO.*) - song structures and the L/G driver, checked against UADE
tags: [formats, jesper-olsen, reverse-engineering, uade, grid, codec]
status: draft
---

# Jesper Olsen (.jo) format

Sources: bbmp-replayers `jo/clean-room/description.md` (a clean-room description of the
three game drivers, L = LollyPop, G = Georg Glaxo, H = Harald Hardtand; its model reproduced
55 register logs), the Wanted Team EaglePlayer `third-party/uade-3.05/amigasrc/players/
wanted_team/Jesper_Olsen/Jesper Olsen_v1.asm` (detection, which files carry their routine).

Code: `src/lib/import/formats/JesperOlsenModule.ts` (structures, byte-exact codec, the L/G
driver as `JoPlayer`), `jesperOlsenGrid.ts` (grid + in-place cell writes),
`jesperOlsenEffectGlyphs.ts` (private effects 0x80..0x8E), `JesperOlsenParser.ts`.

## Kinds of file (Check2)

| kind | corpus | routine | grid |
|---|---|---|---|
| offset-table song, driver L | lollypop-subgame 01.jo (x2: jesper-olsen/, formats/) | companion WantedTeam.bin (lollypop build) | DECODED |
| offset-table song, driver G | georg glaxo/JO.GeorgGlaxo title | companion WantedTeam.bin (georg glaxo build, differs) | DECODED |
| Format 0 ($6000 BRA chain, own routine) | guldkornsexpressen ingame.jo | in the file | not decoded (UADE scan) |
| Format 1 ($6000 chain + H routine) | none | in the file | not decoded |

L vs G: bbmp's FNV-1a hash list does not know the Wanted Team rip of Georg Glaxo title
(hash 0x90aff5c80f581c74); the tempo rule decides, but only over the lists the host plays
(subsongs 1..count): this file's unplayed list 2 has tempo 0.

Detection bug fixed: the Format 0 table scan is `lea 800(A0),A0; lea 900(A0),A1`, i.e.
[+800, +1700), not [+800, +900); guldkornsexpressen was "Not a Jesper Olsen module" before.

## Layout (L/G) - see the header of JesperOlsenModule.ts

List table, 10-byte start entries ($7FFF-ended), 68-byte voice records INSIDE the file
(driver state), instrument tables (words), 26-byte instruments, sequences (set-words +
pattern offset; $7FFF / $7FFE x), patterns (set-words + (a, b) rows, zero word ends),
programs (2-byte items), PCM (raw or IFF 8SVX). Instrument table length = highest index any
voice can select (record byte 1, `$80 i` set-words, program items to field 0).

Coverage, lollypop-subgame 01 (8484 bytes): every byte is a decoded structure, sample PCM,
or one of 3 small unreferenced spans (6 + 4 + 104 bytes; the 104 is an IFF header in front
of a raw-addressed sample). Georg Glaxo title: structures, PCM, eight 104-byte IFF headers
and a few 2-6 byte pads. Patterns may overlap (G: 0x3CE lies inside 0x3B4).

## Proof (2026-10-06, scratch harness; not yet a CI test)

- decode -> encode byte-exact on all 3 L/G corpus files (CI: jesperOlsenRoundtrip.test.ts).
- JoPlayer's Paula writes (LC as file offset, LEN, PER, VOL) == UADE's Paula log, per
  channel, the whole song: lollypop 8400/9288/8040/7948 writes, Georg Glaxo
  8564/8456/6972/6948 writes, zero differences (after UADE's 4 start-up writes).
- The four voice records in UADE chip RAM (module base + record offset), sampled after
  every render slice for the whole song, equal JoPlayer's state after tick c or c-1
  (c = uade_wasm_get_player_tick_count; the counter increments at the CIA-A timer B
  underflow, the play call runs later in the same tick): lollypop 8757/8784 voice samples,
  Georg Glaxo 8084/8104; every other sample is mid play call (bytes between the two
  states, or the row counter $33 = 0 between its count-down and the row read; G: $41
  between count and reload). Pointer bytes $2E-$31, $3C-$3F excluded (addresses).
- Grid = JoPlayer's row reads: notes per channel lollypop 449/149/150/156, Georg Glaxo
  195/191/226/223 (before: 0 notes, stub). Row clock: G every 3 ticks; L tempo $5A rows
  3,3,3,2... ticks apart (897 rows to the song end at tick 2548).
- gridVsPaula is blind here (the driver rewrites LC/LEN/PER every tick: 0 strict events):
  scores 0.67/0.74/0.36/0.34 and 0.69/0.32/0.38/0.38 measure the tool, not the grid.

## Grid

Row = a tick on which a voice's row was due; cut into 64-row patterns. Cell = the file row
the voice read: note = period index (a + transpose) - 47 (index 72 = 428 = C-2), $7F rest =
note cut (254), $7E release = note off (97), length bit 7 = L (tie), the last `$80 i`
set-word = instrument i + 1, other set-words private effects (step set-words on the step's
first row). Edits: `layout.writeCell` writes note byte / tie bit / values of set-words the
row has, in place (UADEChipEditor.patchPatternCell path); growing a row is not written.

## bbmp C++ replayer as our own engine?

Yes, for editability it is the better playback path for L/G (and H): the driver is ~400
lines, deterministic, and (per this work) fully specified - JoPlayer already reproduces
UADE's Paula writes exactly. Our own engine would take edits by swapping song bytes in its
writable copy (the song IS the driver's memory), support growing rows (re-layout + offset
relocation, impossible through chip RAM pokes), give an exact row clock for the playhead,
and drop the WantedTeam.bin companion requirement (the routines are not freely
redistributable; the C++ is GPL-3, compatible). UADE stays the oracle and plays Format 0/1
files (routine inside).
