---
date: 2026-11-18
topic: NES FamiStudio converter bug rows (ledger "NES agent report 2026-11-18")
status: partial
---

# NES FamiStudio converterBug rows

Checker: `tools/nes-famistudio-check.ts` (Furnace -vgmout vs Mesen2 APU writes per frame).

## Sky Sanctuary Zone: period off by 1 (pulse1, triangle)

Two root causes, both in `src/lib/export/nes/famistudioSong.ts`.

1. E5xx fine pitch used an approximation (0.0595 x period x (xx-128)/128). Furnace (engine.cpp calcFreq, linear
   pitch) adds chan.pitch = xx-0x80 in 1/128 semitone to the note, then rounds the period and subtracts 1 (nes.cpp).
   Fix: offset = round(rawPeriod x 2^(-(xx-128)/1536)) - 1 - tablePeriod; non-linear pitch subtracts xx-128 raw.
   Triangle bad 757 -> 334, first failure moved from frame 489 to the loop point.
2. Loop target state: the converter dedups effect state (04xy vibrato override, 00xy arp override, E5 fine pitch)
   against the first pass. The loop jump enters the loop target with the end-of-song state, so a `0400` on loop
   row 0 was never sent and the vibrato kept running in the ROM. Fix: at the loop target's row 0 the override
   state is unknown (vibOn/arpOn = -2, fineSent = NaN), so the row's effects are always sent.
   Pulse1 bad 264 -> 0.

Left: triangle bad=334 from frame 3456 (loop). Order 0 row 0 has a G-2 with no E5; the song ends on E5A0. Furnace
keeps E5A0 as channel state across the loop, so its loop pass is pitched differently from its first pass. One
stream cannot hold both unless the loop target is unrolled once (second copy converted with the end-of-song state).
Not done: costs song size; needs a decision. (The ROM also plays fine 0 there, not the end offset: unverified why,
look at player.s 0x4e handling on note start.)

## sweatsmile: noise volume 4 vs 3

Not fixed. Lead: noise order 3 row 56 starts 0A20 (volume slide up); order 4 row 0 sets instrument 7 + volume 10,
which the converter bakes into the instrument envelope (KEY_BAKE) and then re-sends the slide on top of volume 15.
A baked channel volume with a running 0Axy slide is wrong: the slide must run on the channel volume, not on a
pre-scaled envelope. Next step: `--only sweatsmile_bossfight --dump 765-775` and the bake/slideOps block
(`baked`, `hwVol`, `slideOps`) in famistudioSong.ts.

## Fur_Nes (noise vol 9 vs 15), Byte-Sized Bop (silent from frames 26/529), infinity (triangle silent from frame 78)

Not investigated (agent budget spent on Sky).

## Future_Re-ference pulse1 (bad=9386, "note delay under 2 frames")

Not confirmed. Not investigated in this run.

## Commits

Commit: c6ae00ad6 (not pushed yet).

## 2026-11-21: tempo phase + drift fix (Byte-Sized Bop, infinity)

Root cause: two errors in row timing under virtual tempo N/D.
- Drift: the FamiTracker tempo step 256 x tempo / 150 was rounded. For 155/112 that gives 354 instead of 354.29, so rows slip a frame every ~50 rows (1859 of 2000 rows were wrong).
- Phase: Furnace adds N to its accumulator before the first tick. With N > D its first frame already holds part of the next tick. The engine starts at a fixed 6 x 256, so the ROM played row 3 one frame late (frame 14 against Furnace frame 13).

Fix:
- famistudioSong.ts scales the speeds and the tempo by the smallest q that makes the step whole. The limits are speed x q <= 127 (bit 7 means paused) and an 8-bit accumulator. The old 32..255 tempo clamp is replaced by the step-fit limit. When no q works, the song gets a lossy note.
- The song carries `tempoAcc` = 0x600 - 256 q + step. player.s `fs_tacc` (meta `taccAddr`) is written to famistudio_tempo_acc after each famistudio_music_play. The default 0x600 keeps the old behaviour (N = D gives 0x600).
- Proof: ROM row n fires on the first frame k with k x step >= 256 (6 q n + q) - step. That is the same frame as Furnace's first k with N (k + 1) >= D (6 n + 1). A regression test checks this over 3000 rows.

| Row | Before | After |
|---|---|---|
| Byte-Sized Bop pulse1 | 4553 converter bug | 2812 driver limit (vol macro cut at 240 frames) |
| Byte-Sized Bop noise | 3572 converter bug | 2054 driver limit (vol macro cut) |
| Byte-Sized Bop dpcm | 620 | 241 converter bug, first failure frame 5099, order 9 row 24: start expected false, got true (not investigated) |
| infinity triangle | 1793 | 0 |

Unchanged:
- Fur_Nes noise: 23 bad, frame 3073, order 16 row 0, vol 9 against 15. Not investigated.
- sweatsmile noise: 19 bad. The lead is still the 0Axy slide on the baked volume (see above).
- Sky Sanctuary triangle: 334 bad. This one needs a decision on unrolling the loop target.

Not run: the other songs in the check. Every song whose virtual tempo is not N = D at 60 Hz now gets a different step and start accumulator. Run `--failed` or a full check before landing.
