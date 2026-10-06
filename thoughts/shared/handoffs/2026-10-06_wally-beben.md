---
date: 2026-10-06
topic: Wally Beben grid reverse-engineering - stopped at the research stage (usage limit)
tags: [formats, wally-beben, reverse-engineering, grid, eagleplayer, handoff]
status: draft
---

# Wally Beben (.wb) - handoff

Stopped early (owner: weekly usage limit). No code changed. This note holds what was reversed from
the module's own player so the next session starts from it, not from the old guesses.

## Task (unchanged)
Replace the guessed grid in `src/lib/import/formats/WallyBebenParser.ts` with the song the module's
own replayer walks: decoder + encoder (byte-exact), note-ons against the eagleplayer runner, edits to the
runner, player-tick playhead, subsongs through the one switch, provenance row -> A. Same acceptance as
Sound Master (c2cc825a8), Fred Editor (e4d9eb725), Hippel ST (c5a654764), Sound Player (d7895285b).

## Corpus
- `public/data/songs/wally-beben/wicked.wb` (= `formats/wicked.wb`), the only committed song.
- Local only (gitignored): `server/data/modland-cache/files/pub__modules__Wally Beben__Wally Beben__ballgame.wb`.
- The 2026-04-05 research doc lists 21 files (dark side, total eclipse, ...) that are not in the repo.

## Critical references
- Eagleplayer: `third-party/uade-3.05/amigasrc/players/wanted_team/WallyBeben/src/Wally Beben_v1.asm`
  (InitPlayer: how SongsPtr / VoicesPtr / SamplesPtr / PeriodBase are located; InitSound: subsong byte
  written to SubSongPtr, then `jsr (module)`; Interrupt: `jsr 4(module)`).
- Disassemble: `python3.11 tools/suntronic-re/disasm-raw.py public/data/songs/wally-beben/wicked.wb 0`.
- Runner: `src/engine/eagleplayer/` (WallyBeben is `isDefault: true`, 0.9958 vs UADE), edits via
  `ep_wasm_write_module` (see `src/engine/__tests__/soundPlayerEditReachesRunner.test.ts`), playhead via
  `eaglePlayerTickGrid` / `src/lib/tracker/tickGridPosition.ts` (d9a200f36).

## What the player in wicked.wb does (origin 0: addresses = file offsets, "moveq"/old format)

Entry: +0 `bra $7fe` (init: volumes off, clear $bb7 speed counter, clear $bb5 playing). +4 interrupt ->
$14: byte $12 is the subsong request (eagleplayer writes dtg_SndNum there). $12 = 1..9 -> init subsong
($30: `move.l #$a,d1` bound; songs table `lea $e14` + 16*(n-1) -> 4 seq pointers copied to $c02), first
interrupt only initialises; then $12 = $ff = play. $12 = 0 -> silence.

Per-voice variables are byte arrays with stride 4: voice v field F at $b30 + F + v.
$00 Paula offset (0/$10/$20/$30), $04 arpeggio-buffer base, $08 current note, $0c sequence position,
$10 duration, $14 duration countdown, $18/$1c arpeggio mode/flags, $20 transpose, $24/$28 portamento
target/param, $2c/$30 semitone slide down/up per row, $38 arpeggio index, $3c/$40 vibrato, $44/$48
vibrato delay, $4c sample*8 (table $c8e, 8-byte entries), $50 envelope*8 (table $d0c), $60 volume
(= $b90+v, written to AUDxVOL each tick), $64 DMA bit, $68 vibrato param, $6c release, $70 env param.
Globals: $bb6 speed, $bb7 speed counter, $bbb bytes consumed by this event, $bbe voices gated off,
$bf2+4v pattern pointer, $ac6 period table (note*2, byte index; $6b0 ... $71).

Sequence (per voice, $8e): byte 0..$c0 = pattern index (table $ea4, longs; table ends at the lowest seq
pointer, wicked: 87 patterns), $c1..$fe = transpose (b+$20)&$ff (so $e0 = 0), $ff = back to position 0.

Pattern events ($1e8), prefix bytes then a note:
- $ff end of pattern -> next sequence entry; $fe stop song; $fc nn start subsong nn;
- $f0-$fb speed $bb6 = b&$f (global; ticks per row = speed+1); $e0-$ef sample (b&$f);
  $c0-$df envelope (b&$1f); $80-$bf duration (b&$3f);
- $7f / $7e slide down / up, then note; $7d nn / $7c nn arpeggio from bit mask nn (table $e0c), then note;
  $7b tt pp portamento to tt+transpose, param pp, then note; $7a dd vibrato delay dd, then note;
- note byte (<= $5f, $60-$79 also taken as notes): note+transpose -> $08, every event restarts DMA + sample
  + envelope (note 0 is a real period, not a rest).
Timing: row tick when $bb7 == 0 at the start of the interrupt (first interrupt after init is one);
$14 -= 1 per row tick; when negative the voice reads its next event and $14 = duration, so an event
lasts duration+1 row ticks; gate-off ($bbe) on its last row when env param $70 = 0. Voices are not in
step: grid = one row per row tick per voice (Sound Player shape), speed changes as Fxx (speed+1) on the
row that sets them.

## Next steps (ordered)
1. Write `thoughts/shared/research/2026-10-06_wally-beben-format.md` from the above; locate every table
   from the instruction that reads it (as Sound Master did), and check ballgame.wb (old format, origin
   -12) and the "new" ($4CF9 at +20) variant code paths if a file can be found.
2. `WallyBebenModule.ts` (module <-> model, byte-exact; events kept verbatim incl. unread bytes),
   `wallyBebenGrid.ts` (walk per voice per subsong, tick-exact), effect glyphs, parser on it.
3. Edits: in-place byte writes only (note byte minus transpose; prefix bytes that exist); write through
   the eagleplayer edit path in `liveCellEdits.ts`. Lengths never change (absolute addresses in code).
4. Tests: round trip; runner note-ons (period/voice, `ep_wasm_voice_state` per tick) vs grid for every
   subsong; edit reaches runner; playhead vs note-ons (needs per-row tick counts since speed is global and
   can change - extend TickGrid if a song changes speed).
5. Provenance row (`2026-10-06_grid-provenance-per-format.md`:167) -> A with numbers.

## Other notes
- Before numbers: ledger S2 wicked.wb 0.45/0.82/0.77/0.63; owner saw "bogus patterns".
- The current parser's assumptions (0x00-0x23 notes, 0x24-0x7F rests, $E0 instrument +1, phrase table
  right after nSubsongs*16 using the $223C immediate as count) are wrong against the code above
  ($223C immediate is count+1; $24-$5f are notes; $7a-$7f are effect prefixes).
