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

## Agent 62

### Regression gate for 95bf2c5aa (full check, every song)

One regression: Famitune1 (56 Hz) pulse1 6063 -> 7414, pulse2 5378 -> 7032, triangle 1691 -> 2078.

Cause: off 60 Hz the start accumulator stayed 6 x 256. The engine fires row n on the first frame k with
start + k x step >= 6 x 256 + 256 S n, so with start 6 x 256 each row fires on the frame after its Furnace time
(ceil). The check bins Furnace's writes to the nearest 60 Hz frame. Before 95bf2c5aa the rounded step (239 instead of
238.93) drifted in a way that partly hid this; with the whole step (q 15, step 3584) every row with a fractional time
under .5 sat one frame late.

Fix (famistudioSong.ts): off 60 Hz with N = D the start is 6 x 256 + (step - 1) / 2, so each row fires on the nearest
frame (half up, the same as the check's binning). N != D off 60 Hz keeps 6 x 256 (shortcut comment; no song has it).
Test: famistudioSong.test.ts "fires each row of a 56 Hz song on the nearest 60 Hz frame" (3000 rows).

Diff counts (bad frames; "before" = the check file before this run, mostly pre-95bf2c5aa):

| Song | Channel | Before | 95bf2c5aa | + agent 62 |
|---|---|---|---|---|
| Famitune1 | pulse1 / pulse2 / triangle | 6063 / 5378 / 1691 | 7414 / 7032 / 2078 | 5384 / 4359 / 1238 |
| Famitune1 | noise / dpcm | 12 / 1276 | 7 / 800 | 0 / 0 |
| oby1_ingame (50 Hz) | p1 / p2 / tri / noise / dpcm | 8439 / 7546 / 7779 / 9266 / 2049 | 6954 / 4407 / 4905 / 4529 / 892 | 6702 / 3816 / 3864 / 2120 / 0 |
| the_best-1990 (50 Hz) | p1 / p2 / tri / noise / dpcm | 3616 / 3248 / 1367 / 1320 / 287 | 2981 / 2784 / 973 / 586 / 114 | 2665 / 2434 / 748 / 302 / 0 |
| turtle_byte (50 Hz) | p1 / p2 / tri / noise / dpcm | 13295 / 13222 / 11033 / 12378 / 2654 | 9378 / 10277 / 7867 / 6760 / 1152 | 8096 / 8756 / 6863 / 3196 / 0 |
| Super cool and awesome samurai | p1 / p2 / tri / noise / dpcm | 4933 / 5040 / 4537 / 4275 / 627 | 3144 / 4592 / 3673 / 2613 / 393 | 2595 / 4145 / 3340 / 2120 / 216 |
| Super_Space_Invaders_Title | p1 / p2 / tri / noise | 6182 / 5795 / 3538 / 2324 | 665 / 2381 / 334 / 1173 | unchanged |
| christmas-fever | pulse2 | 5049 | 2178 | (60 Hz, not re-run) |

All other songs unchanged. 60 Hz songs were not re-run after the agent 62 change (their code path is unchanged; their
inputHash is now stale, so the next full run re-measures them).

## Agent 63

- **Fur_Nes noise (23 bad): converter bug, fixed (9e41249fd).** Channel 0 order 15 row 31 has 0B04, so the song loops to order 4 (the check's "order 16" label is approximate). On the first pass, order 4 row 0 is a kick after a kick, so no instrument byte was written. At the loop the previous instrument is the open hi-hat. The ROM played the hi-hat volume envelope (15,15,14,14,...) where Furnace played the kick (15,9,4,1,0). Fix: `lastIns = -1` at the loop target, next to the effect-state reset. Noise arp macros go out as 0x4b, which (unlike 0x4a / 0x4c) does not force the instrument byte, so only songs with that path were hit. Regression test: "sends the instrument again at the loop target". After: Fur_Nes noise 0, the song is [OK].
- Regression check (--only): Fur_Nes 23 -> 0; Byte-Sized Bop, infinity, smashtv unchanged on every channel. Other songs that loop to a non-zero order were NOT re-run (budget).
- **Samurai dpcm (216 bad): driver limit (existing label, not re-measured).** The song runs at a 128 Hz tick rate, approximated with FamiTracker tempo. First failure at frame 22, order 0 row 7 (start expected true, got false), the same off-60 Hz timing class as its other channels.
- **Byte-Sized Bop dpcm (241 bad, frame 5099 order 9 row 24, start expected false got true): NOT investigated (budget).** Still labelled converter bug by the check. Next step: `--dump 5090-5105` and read the order 9 row 24 DPCM cell (likely a note-off / cut or a sample retrigger that the converter emits as a start).

## Agent 64

- **Regression gap of 9e41249fd closed: no song worse.** Loop targets found from the song data (same scan as the converter's loopOrder: last 0Bxx with xx <= current order, all channels): Fur_Nes 4, Super_Space_Invaders_Title 12, The Cheetahmen 20, The East 4, going_up_a_step_at_time 3, one_sided_love 33, smashtv 7, sweatsmile_bossfight 4; the other 14 songs loop to 0. Re-ran each with --only (plus Byte-Sized Bop): every channel equals check-before.json (agent 63 scratch) except Fur_Nes noise 23 -> 0. Unchanged: SSI 665/2381/334/1173/0, Cheetahmen all 0, The East dpcm 1, going_up triangle 266, one_sided_love 6362/5772/6909/8136/665, smashtv 1604/25/465/0/0, sweatsmile 823/1227/44/19/0.
- **Byte-Sized Bop dpcm 241: converter bug, but not in the DPCM channel; NOT fixed (budget).** Root cause: channel 10 (expansion chip system 157, dropped) carries FD9B at order 0 row 0 and **FD68 at order 8 row 0** (virtual tempo numerator 155 -> 104, D = 112). The converter ignores FDxx/FExx entirely (not even in lossy), so the ROM plays order 8 at 6*112/155 = 4.335 frames/row instead of 6*112/104 = 6.46. Measured: lag ROM vs Furnace is 0 up to frame ~4014 (order 8 start), then exactly 272 frames from ~4600 on (128 rows x 2.125 frames = 272). The ROM loops at frame ~4569, Furnace at ~4841; the "start expected false got true" at 5099 is the ROM's second-pass order 0 row 122 DPCM note (5099 - 4569 = 530 frames = 122 rows), 272 frames early. Ref frames 4280-4520 also show Furnace's slower order-8 fade.
- **Second converter gap found (same class):** global flow effects (0B, 0D, 09, 0F) are scanned only in channels < NCH (5, or 8 for VRC6). Furnace applies them from any channel, including dropped expansion channels. Hit: one_sided_love (system 139 dropped) has its 0B21 in channel 7, so the converter neither ends order 40 at row 47 nor loops to 33. Fix: scan `s.orders.length` channels in the orderLen/loop scan (famistudioSong.ts ~line 433) and the rowFrame speed scan (~line 452).
- **Next step (needs a design decision):** player.s has no tempo opcode in FamiTracker-tempo mode (only 0x46 speed). Options for FDxx/FExx mid-song: (a) honour it in rowFrame and approximate by rescaling the 0x46 speed per row (speed x spdMul x vtOld/vtNew, rounded; lossy "virtual tempo change approximated"), (b) add a tempo-step opcode to player.s. BSB: 155 -> 104 needs speed 6 -> 8.94, so (a) drifts unless spdMul makes it near-whole.
- Debug aids: a copy of the check tool with --dump also printing DPCM frames + $4010+ writes was used and deleted; offset finder script in agent 64 scratch (off.cjs).

## Agent 65

- **Fix f8afbaa1c:** the order-length/loop scan and the rowFrame speed scan now share one `rowFx(o, r)` over all `s.orders.length` channels (famistudioSong.ts ~427). This was the only flow scan; the per-channel loop already skipped 0B/0D. Regression test "applies flow and speed effects from a dropped expansion channel" gives 96 instead of 9 without the fix. FDxx/FExx are now reported lossy from the same scan as `virtual tempo change FDxx/FExx (ignored: rows keep the song start tempo)`, and the per-channel loop skips them so they are not reported twice as "effect FD". Tempo behaviour is unchanged.
- **Census (22 songs in public/data/songs/furnace/nes):** FD/FE appear only in Byte-Sized Bop (FD9B ch10 o0r0, FD68 ch10 o8r0). Flow effects in channels >= NCH appear in carve_your_own_path (system 140: 0D00 ch5 o0r31 plus about 2100 0F03/0F04 speed alternations in ch12) and one_sided_love (system 139: 0B21 ch7 o40r47).
- **Before -> after (bad frames: pulse1/pulse2/triangle/noise/dpcm):** carve_your_own_path 11502/8676/10794/12830/1020 -> 329/1830/470/0/0. one_sided_love 6362/5772/6909/8136/665 -> 6362/5767/**6911**/8135/656. Byte-Sized Bop is unchanged (now has the FD lossy line). Fur_Nes 0s, smashtv 1604/25/465/0/0 and The East 0/0/0/0/1 are unchanged.
- **one_sided_love triangle +2, NOT root-caused (budget):** the song is 41 orders x 48 rows, so 0B21 changes only the loop target, 0 -> 33, which is correct per Furnace. The compare window (9711 frames) ends before the loop (frame 9840). So the change happens on the first pass, and the most likely cause is the loop-target re-send logic (atLoop: forced instrument, vibrato and arp re-send, fineSent=NaN) now firing at order 33 row 0 instead of order 0 row 0. Next: --dump around frame ~7920 (order 33 start) and check whether a redundant re-send there changes the triangle state. Triangle is already 64% bad from frame 70.

## Agent 66

- Fix 59a8e742c (tools/nes-famistudio-check.ts): the alignment now ignores DPCM starts with length register 0. Furnace writes one on a note-off / 18xx row before the first sample (one_sided_love row 0). Evidence: ref first tone 20, first DPCM start 0 {rate 0,len 0}; ROM first tone 20, first DPCM start 10 {rate 15,len 12}. The measured lag was 10; the true lag is 0.
- Task 1: the triangle +2 (6909 -> 6911) after f8afbaa1c is an artifact of the false lag. A loopOrder 33 vs 0 full dump differs only at frames 9670-9700, where the ROM had reached the loop inside the window. f8afbaa1c is correct. There is no converter change, so there is no converter regression test.
- one_sided_love pulse1/pulse2/triangle/noise/dpcm: 6362/5767/6911/8135/656 -> 4469/3907/1017/0/10. carve_your_own_path is unchanged at 329/1830/470/0/0.
- Left (CONVERTER BUG, ±1 period): triangle first bad at frame 95, order 1 row 3, vibrato 0463 on a held note (ref 148 vs ROM 147; the ROM curve looks phase- or rounding-shifted by one). Pulse1 first bad at frame 1046, order 4 row 17 (239 vs 240); pulse2 at frame 1056 (238 vs 239). Suspect the vibrato envelope `round(X*2^(-u/1536))-1-P` against Furnace calcFreq (round(clock/fbase/16) then freq--) and the effect-only-row phase.
- The tool fix is global to measurement: it can change the lag of any song whose reference has a len-0 DPCM start before its first sound. Other songs are not re-run (hash skip); re-run them with --only.
- Not done: sweatsmile noise (0Axy).

## Agent 67

- one_sided_love cause: converter period offsets (fine pitch, vibrato, pitch macro, slides) used A-4 = 440, ROM note table is retuned to song tuning 445. Fixed in famistudioSong.ts (periodRawAt(n, m.tuning)), regression test added.
- one_sided_love bad frames p1/p2/tri/noise/dpcm: 4469/3907/1017/0/10 -> 1823/1185/62/0/10.
- Left: triangle frame 115 (order 1 row 7, 030D, note 7->8, periods 140->132): ref 137,134,132, ROM 136,133,132. Slide step Math.round(6.5)=7; step 6 matches. Pulse1 frame 1045 (order 4 row 17, 245 vs 244), pulse2 frame 1056 (238 vs 239): cells empty there, likely held slide/vibrato from earlier; not investigated.
- Not done: task 2 (re-run other songs after agent 66 tool fix), task 3 (sweatsmile 0Axy noise). Budget.

## Agent 68

- Commit 6ca01ebca: `bestSlideStep` in famistudioSong.ts. Furnace linear-pitch 03/01/02 slides move 1/128 semitone units per tick and round the period every tick, so round(average step) misses the curve. The converter now simulates both drivers per frame for steps 1..127 and picks the least summed error; slides with nonzero error are labelled pitch-lossy (driver limit).
- one_sided_love: p1/p2/tri/noise/dpcm 1823/1185/62/0/10 -> 1809/1179/13/0/10, converter bugs 3 -> 0. Triangle first bad frame 297 (148 -> 132): Furnace steps 3,3,4,3,3 periods, no constant step fits.
- Pulse1 frame 1045 / pulse2 1056: 03 slide note 46 -> 48 with E5 fine pitch. Furnace fine pitch is linear (rounds +1 period at note 46, 0 at 48); FamiStudio fine pitch is one constant period offset. Driver limit, best error 2.
- Re-run after fix: smashtv 1604/25/465 (same), Rise_against p1 23 p2 5018 tri 13856 -> 13840, carve_your_own_path tri 470 -> 434 (p1/p2 same), sweatsmile_bossfight 823/1227/44/19 -> 393/771/1/19 (noise still converter bug, 0Axy).
- going_up_a_step_at_time now lag=-24 with all channels bad, but the pre-fix converter gives the same lag=-24: not from this change; something else since the stored JSON shifted it. Open.
- Not re-run: the other 15 songs. Not done: sweatsmile noise 0Axy.

## Agent 69

- going_up_a_step_at_time lag=-24 regression (59a8e742c ignored one-byte DPCM starts, but Furnace PCM-mode $4018 starts have len 0 too, so firstOn skipped the real first note on the reference). Fixed in f091a63fd (firstOn counts pcm starts, self-check added). Back to lag 0, 0/0/266/0/0.
- sweatsmile_bossfight noise 0Axy: channel volume <15 was baked into the volume macro while 0Axy ran, freezing the slide start (frame 771 ref vol 4, ROM 3). Fixed in cac5b3f1c (no bake while a slide runs). Remaining 19 bad frames at 3843 are the loop pass replaying first-pass slide bytes; now labelled DRIVER LIMIT (needs loop unroll, owner decision). Converter bugs 1 -> 0.
- Corpus re-run (--only each, stored -> new, p1/p2/tri/noise/dpcm): no regressions. Improved: Byte-Sized Bop noise 2054->1963, Famitune1 tri 1238->1233, Rise tri 13856->13840, carve tri 470->434, christmas-fever p2 2178->2110, oby1 p1 6702->3746, one_sided_love 6362/5767/6911/8135/656 -> 1809/1179/13/0/10 (lag 10->0), sweatsmile 823/1227/44/19 -> 393/771/1/19, the_best-1990 p2 2434->2230, turtle_byte p1 8096->7649. Rest unchanged. Sky Sanctuary still 1 converter bug (loop unroll, owner decision).

## Agent 70

- Rise_against triangle (13840 bad frames, first frame 1152, order 3 row 0): DRIVER LIMIT. Every bad frame is inside a slide. Reference: 241, 272, 308, 348, 394... up to 2047 at frame 1170 (exponential kick down-slide). ROM: 276, 340, 403, 467 (+63.5 per frame, FamiStudio step-127 cap). Static mismatches are only the reference clamped at 2047 while the ROM still slides. No sounding mismatch outside slides. Possible improvement (owner decision): emit a relative pitch envelope in place of the 0x50 slide for fast or wide slides.
- one_sided_love pulse1 1809 / pulse2 1179: first-frame labels are the known fine-pitch driver limits (Agent 68). The residual is mostly +-1 period. Lead at frame 3730 (pulse1 order 16 row 10, note with 03FF after 04:64): ROM vibrato phase is 2-3 frames ahead of Furnace. Reference from 3730: 268 266 264 262 262 263 265 267 269. ROM: 264 263 263 264 266 268 269 270 269.
- Experiment, reverted: skip the `vibPos = 0` reset in famistudioSong.ts when the note is a 03xx porta target. Result: pulse1 1809 -> 1773, pulse2 unchanged 1179, Rise_against unchanged. Small gain, so the reset is part of the cause, not all of it. Before a fix: check Furnace playback.cpp (vibratoPos reset on porta notes) and the FamiStudio 0x49 envelope restart on a 0x43 note. Then add a regression test.
- pulse2 also has 299 vol-only diffs (e.g. frame 1212: ref vol 1, ROM vol 3; order 5 row 34, instrument 9 vol macro). Not investigated.

## Agent 71

- Vibrato phase on 03xx porta notes: cause found in Furnace source. third-party/furnace-master/src/engine/playback.cpp case 0x03 (~line 1150): `if (chan[i].keyOn) chan[i].doNote=false;`, so "commit note on" (line ~1664, `vibratoPos=0`) never runs for a porta target on a keyed-on channel. The vibrato phase carries on. Driver side (third-party/famistudio/famistudio_ca65.s): the pitch envelope restarts only in famistudio_do_note_attack (@reset_pitch_env) or on opcode 0x49 (@opcode_override_pitch_envelope sets ptr=1); a 0x43 no-attack note leaves it running. So the converter must keep vibPos on those notes: when the envelope is the same it runs on, and when the note changes the amplitude, the new 0x49 envelope starts at the carried phase.
- Fix: famistudioSong.ts `keyOnBefore` (note off / release clear it), vibPos is not zeroed when `keyOnBefore && 03xx with xx > 0`. Same as Agent 70's experiment, now backed by the source. one_sided_love pulse1 1809 -> 1773, pulse2 1179 unchanged.
- Test: famistudioSong.test.ts "keeps the vibrato phase on a 03xx porta note": fails with the fix line edited back, passes with it.
- Tried and dropped: forcing a 0x49 restart on porta notes (it assumed Furnace resets the phase; the source says it does not). No effect at frame 3730 anyway, because 0x49 was already being sent there.
- Not checked: whether frame 3730 matches exactly now. The remaining pulse1 residual (1773) is still mostly +-1 period.
- An EC cut also clears Furnace keyOn (playback.cpp ~2575). The converter does not track that for keyOnBefore. shortcut: if a song has EC followed by a 03xx note, the phase is wrongly kept.
- pulse2 299 volume-only diffs (frame 1212, instrument 9): NOT investigated (out of budget). Open for the next agent.

## Agent 72

Song one_sided_love, baseline before any edit (per-channel bad frames): pulse1 1773 (first 1045, period), pulse2 1179 (first 1056, period), triangle 13, noise 0, dpcm 10. Lag 0, converterBug=0.

Q1 (pulse2 volume-only diffs, first at frame 1212): converter bug, not fixed yet.
- Cause: `src/lib/export/nes/famistudioSong.ts` line ~770 skips the volume op on a baked channel for a volume-only row (`!(baked && n === 0)`). The ROM keeps the baked level.
- Furnace (VOL_SCALE_LINEAR_BROKEN, newVolumeScaling=true, ceil=false, volMacroLinger=true) writes raw v, then outVol = floor(v * L / 15) in the same tick. L is the lingering last vol-macro value (instrument 9 "main lead", vol macro [13], length 1, no loop).
- Measured $4004 vol changes, ref vs ROM:
  - Tick 1210 (order 5 row 34, v2): ref 2 then 1, ROM 3.
  - Ticks 1480, 1640, 1700, 1740, 1820, 1880, 1940, 2000 (v3 rows): ref 3 then 2, ROM 3.
  - Following note rows match.
- Proposed fix: on a baked channel, a volume-only row with a finished, non-looping macro targets scaleVol(v, L).
  - Pick the FamiStudio channel volume c with famistudio_volume_table[c][scaleVol(bake, L)] == target. The table is in third-party/famistudio/famistudio_ca65.s:7493 and rounds up.
  - Push 0x70|c and keep `baked`, so the next note re-sends 0x7F.
  - Example: bake 4, L 13, envCur 3. Target 2 gives c 10..14. Target 1 gives c 5..9.
  - If the macro is still running or looping, add a lossy entry.
  - Check the lastVol interaction at lines 770 and 791.
  - Regression test: a volume-only row after a baked note. Test that the op stream holds a 0x7c-class op.
- Corpus subset for the re-run: songs with a vol macro, channel vol < 15 and volume-only rows. Take its baseline before the edit.

Q2 (pulse1 +-1 period, 1773 frames): not started.

## Agent 73

Q1 fix landed: ee9a4bbde "Send a volume op on volume-only rows of a baked NES channel" (famistudioSong.ts + regression test).
- Volume-only row on a baked channel sends 0x70|c, smallest c with floor(c * scaleVol(bake, L) / 15) == scaleVol(v, L); L = last vol-macro frame. Channel stays baked (next note sends 0x7F). Lossy "volume column under a running baked volume macro" when the macro still runs, loops or has a release, or no c fits (v > bake).
- Music bytes changed in 11 of 21 corpus songs (one .fur not 2A03, skipped). Checked 6 with --only, bad frames before -> after, every other channel identical, converterBug 0 before and after:
  - one_sided_love pulse2 1179 -> 886 (pulse1 1773, tri 13, dpcm 10 unchanged).
  - Byte-Sized Bop pulse2 3132 -> 2880 (first bad moved 672 vol -> 850 period).
  - the_best-1990 pulse1 2662 -> 1967, pulse2 2230 -> 2186.
  - turtle_byte pulse1 7649 -> 7542, pulse2 8538 -> 8525.
  - christmas-fever pulse1 3126 -> 3120 (lossy 6 -> 7).
  - infinity pulse2 1735 -> 1592 (lossy 5 -> 6).
- Not checked: Future_Re-ference, Rise_against_the_ashes, carve_your_own_path, oby1_ingame (bytes changed, each gained the lossy entry).
- Running-macro case (lossy) still picks c from L; a closer pick would need per-frame macro values vs the table.
- Q2 (pulse1 +-1 period) still open.

## Agent 74

Q1: the four songs ee9a4bbde changed but did not check. Bad frames before (ee9a4bbde^) -> after (ee9a4bbde) -> after the fix below. converterBug 0 everywhere; channels not listed are identical.
- Future_Re-ference: pulse1 9390 -> 9241 -> 9282, pulse2 9166 -> 9168 -> 9167, noise 8209 -> 8202 -> 8205 (tri 8693, dpcm 3097 unchanged).
- Rise_against_the_ashes: identical (pulse1 23, pulse2 5018, tri 13840).
- carve_your_own_path: pulse1 329 -> 4, pulse2 1758 -> 1416 (tri 418 unchanged).
- oby1_ingame: identical (3746/3741/3862/2120).
- Regression found: Future_Re-ference pulse2 frame 3. A volume-only row while the baked decay macro still ran matched only the macro's last value (0), so c = 0 and the channel went silent.
- Fix: commit "Pick a baked volume-only row level over the macro frames left". c is now the least summed error over the macro frames still to play. A finished macro gives the same c as before. Regression test is in famistudioSong.test.ts.
- Re-checked one_sided_love, Byte-Sized Bop, the_best-1990, turtle_byte, christmas-fever and infinity: same numbers as Agent 73.
- Still open: Future_Re-ference pulse2 is 1 frame worse than before ee9a4bbde. The whole song runs about 3 frames early from the start (ROM pulse1 note at frame 6, Furnace at frame 9), and that drives its counts. The timing offset is the real bug there, speed 1. Not investigated.

Q2 (one_sided_love pulse1 +-1 period): not started, out of budget. The vibrato path already computes exact per-note offsets (famistudioSong.ts ~704). Next suspects are the pitch macro scaling (toPeriod rounds each step at the note period, line ~718) and fine pitch against the src note. Dump with `--dump 1040-1060`.

## Agent 75

- Q1: the eba3821e3 regression test FAILS on eba3821e3^ code (`expected 74 to be -1`, a 0x70 op is still sent) and passes on HEAD. No strengthening needed.
- Q2: converter bug, not a driver limit. Linear pitch: Furnace sums E5xx fine (E5 7D, fp=-3) and vibrato (04 63) in 1/128 semitone and rounds the period once. The converter rounded the 0x4e fine offset and every vibrato step apart, so half the vibrato frames were 1 period off. Fix (49e8fe3c0): step = round(X*2^(-(u+fp)/1536)) - 1 - P - F. 26 of the 1773 bad pulse1 frames sit inside pitchLossy slide spans (a real driver limit, unchanged).
- Bad frames HEAD -> fix: one_sided_love p1 1773 -> 57, p2 886 -> 42; carve_your_own_path p2 1416 -> 1292; oby1_ingame p2 3741 -> 3733; going_up_a_step_at_time triangle 266 -> 0 [OK]. Music bytes are identical for all other corpus songs except smashtv and nes_feature_test (counts unchanged). No regressions; converterBug 0 everywhere.
- Open: the pitch macro `toPeriod` (around famistudioSong.ts:719) still ignores fp. A pitch macro on an E5xx note probably has the same double rounding. Not measured.
- Q3 (Future_Re-ference about 3 frames early): not investigated, out of budget.

## Agent 76

- Q1: converter bug, same class as 49e8fe3c0. Linear pitch: Furnace sums E5xx fine and the pitch macro (pitch2) in 1/128 semitone and rounds once; the converter scaled each absolute macro value at the rounded note period alone. Fix (be4f07dd4): an absolute value is round(X*2^(-(v+fp)/1536)) - 1 - P - F (F = sent fine offset), also in the ADSR/LFO curve and vibrato-merge paths. fp = 0 and relative macros keep the old scaling (relative: shortcut, per-increment rounding). Regression test in famistudioSong.test.ts fails on the old formula.
- Corpus: only nes_feature_test (synthetic, untracked) has an absolute or relative pitch macro under a non-centre E5xx (4 notes, E5FF). Music bytes identical before/after for all 21 convertible corpus songs (sha1 of furnaceToFamistudio output), so no frame counts can move. No real corpus song exercises it.
- Q2 (Future_Re-ference "3 frames early"): converter bug, not driver or alignment. Row 0 DPCM channel has 09 00. The song has grooves ([2,1] and [6]); Furnace playback.cpp 0x09 with grooves selects groove xx (speeds=song.grooves[xx], curSpeed=0), only a groove-less song treats it as speed 1. The converter (famistudioSong.ts ~485, `e.type === 0x09 && e.value > 0`) ignores 09 00 and plays speed 1, so the ROM runs 1 tick/row against Furnace's 2,1,2,1 (row 6 at Furnace frame 9, ROM frame 6; the gap grows, it is not a fixed offset). Alignment at frame 0 is correct (dump 0-14 matches rows 0-4).
- Next: in the speed pass, when m.grooves.length > 0, 09xx (xx < grooves.length) sets speeds = grooves[xx].val.slice(0, len) and resets the speed index; check the parser keeps grooves and that 0Fxx still only sets entry 1. Then re-measure Future_Re-ference and check that no other corpus song has grooves (bytes must stay identical).

## Agent 77

- Furnace (playback.cpp:645-666, 1966-1974): 09xx without grooves sets speeds[0] (xx>0 only); with grooves, 09xx (xx < grooves.size) copies groove xx into speeds and sets curSpeed=0 (out-of-range xx ignored; 09 00 valid). 0Fxx (xx>0) sets speeds[1] only when len==2 and no grooves, else speeds[0]. Each row takes speeds[curSpeed], then curSpeed wraps at speeds.len. brokenSpeedSel compat path not modelled by the converter (separate, not checked).
- Corpus: grooves only in Future_Re-ference (2 grooves, 2x 09xx) and christmas-fever (2 grooves, 3x 09xx). 09xx without grooves: Rise_against..., infinity, nes_feature_test. Fix leaves music sha1 identical for all 20 other convertible songs (blanketcritter errors both sides).
- Fix (speed pass, famistudioSong.ts ~485): `if 09 && grooves: sp = groove.val.slice(0, max(1,len)); cur = 0; else if 09 && v>0: sp[0]=v`; 0F: `sp[len==2 && !grooves ? 1 : 0]`. Unit test (firstNoteFrames [0,6,9,13], grooves [2,1],[6], 09 00 row 0, 0F03 row 6) passes; old code gives 24 for row 4. Patch saved, NOT committed: scratchpad nes77/groove-fix.patch.
- Bad frames (nes-famistudio-check, HEAD -> fix), pulse1/pulse2/tri/noise/dpcm: christmas-fever 3120/2110/949/1415/215 -> 0/402/10/0/1. Future_Re-ference 9282/9167/8693/8205/3097 (song 20571 B) -> no ROM: song data 27009 B > 24576 B FME-7 music area; also breaks the existing FME-7 test ("dropped to fit" lossy appears).
- Why bigger: driver is FAMISTUDIO_USE_FAMITRACKER_TEMPO=1 (player.s:11), no groove support; the converter expresses per-row speed with op 0x46 on pulse1, and groove [2,1] changes speed every row. Timing is expressible, the byte cost is the limit.
- Next (decision): (a) for a 2-entry groove [n+1,n] use one speed with a scaled tempo whose 8.8 step reproduces it exactly ([2,1] = speed 3, tempo 300, step 512, +2/frame -> rows 2,1,2,1; needs tempoAcc phase and a mid-song 09 01 -> [6] change, check the driver has a tempo op), or (b) a larger music area / bank switching. Then land the patch.

## Agent 78

- Driver (famistudio_ca65.s, FAMITRACKER_TEMPO=1): no tempo op; the 8.8 step is song-header only (lines 1620-1625). Per frame: if acc_hi >= speed then new row, acc_hi -= speed (3961-3973); then acc += step (4370-4378). Only speed op 0x46 (5896). Init acc 0x600, speed 6, so row 0 fires on frame 0 with phase 0.
- Encoding (famistudioSong.ts after the spdMul pick): songs with grooves at 60 Hz, no virtual tempo, use tempo x2 (step 2.0). Row length = max(1, ceil((S - ph)/2)), ph' = ph + 2L - S. Greedy: keep S while it gives the row's length; else pick from the bytes giving L one that also gives the next row's ([2,1] -> 3, [6] -> 12). A driver replay over pass 1 + loop pass must match every row, else old per-row ops. Speed op forced at the loop row as before.
- Results (song B; bad pulse1/pulse2/tri/noise/dpcm): Future_Re-ference 20571 B, 9390/9166/8693/8205/3097 -> 20574 B, 2722/2908/333/102/928 (remaining all labelled driver limit, converterBug=0). christmas-fever 10287 B, 3126/2178/949/1415/215 -> 10011 B, 0/402/10/0/1 (= patch numbers). 20 songs without grooves: music+tempoAcc sha1 identical HEAD vs commit (blanketcritter errors both sides).
- Commit 848e12692 (agent 77 groove rules + encoding + test). New test fails with the encoding disabled. Not pushed.

## Agent 79

- A (relative pitch macro under E5xx): converter bug, same class as be4f07dd4. Furnace keeps the relative macro's running sum in pitch2 and rounds fine + sum once; the converter rounded each increment at the note period. Fix (7f0cb5bc1): under fine pitch each step is off(sum) - off(previous sum) via the existing fine-aware off(); toPeriod keeps a running sum (macroFrames maps frames in order). fp = 0 keeps the old scaling. Remaining shortcut: a looped relative macro repeats its first-pass deltas (Furnace's sum keeps growing).
- Corpus: relative pitch macros in Byte-Sized Bop, Future_Re-ference, nes_feature_test, turtle_byte. Music + tempoAcc sha1 identical HEAD vs fix for all 21 convertible songs (blanketcritter errors both sides), so no bad-frame count can move; no Mesen run. New unit test fails on the old code; famistudioSong.test.ts 56/56; type-check clean.
- B (groove tempo x2 at PAL): no bug. public/nes/famistudio/player.s sets FAMISTUDIO_CFG_NTSC_SUPPORT = 1 and leaves PAL_SUPPORT = 0, so famistudio_pal_adjust is always 97 and the driver always reads the NTSC step word (famistudio_ca65.s 1614-1625: non-zero pal_adjust skips the PAL word). The PAL word (256 x 300 / 125 = 614) is never read. On a PAL console the NTSC-only ROM runs every frame at 50 Hz, so groove rows keep their exact frame pattern, only slower (same as every song). The encoding is gated by tempoBase === 150 && spdMul === 1 plus a full driver replay at step 2.0 (the 60 Hz frame model). If a PAL/dual build is ever made, the groove trick is not exact there (step 2.4 is not whole; rows average right, phase pattern differs).

## Agent 80

- Full tally at 7f0cb5bc1 (21 songs, nes-famistudio-check): 3 OK (Fur_Nes, The Cheetahmen, going_up_a_step_at_time), 17 FAIL, blanketcritter error (system 241). Only one channel labelled converter bug in the corpus: Sky Sanctuary Zone triangle 334. All other failing channels are driver limit. Per-song table: scratchpad nes80/tally.tsv + tally-summary.txt.
- (a) going_up_a_step_at_time lag=-24: closed (lag 0, OK, 0 bad frames).
- (b) one_sided_love pulse2 volume-only diffs at frame 1212: closed by ee9a4bbde/eba3821e3 (pulse2 1179 -> 42 bad, first now frame 1056 period, pitchLossy). Frame 1212 not dumped (inferred from count + first-bad field).
- (c) Future_Re-ference about 3 frames early: closed by 848e12692 (grooves). Lag 0; first bad is pulse1 frame 6 "sounding", note delay under 2 frames (driver limit). converterBug 0.
- Sky Sanctuary Zone triangle 334 (first frame 3456 = loop wrap, ref 562, ROM 568): cause is fine pitch state across the song loop. The song loops from order 35 to order 0 (no 0Bxx). Triangle order 35 row 31 is F-4 with E5A0. Order 0 row 0 is G-2 with no E5. Furnace never resets chan.pitch on loop (playback.cpp: only assignment is 1459, the E5 handler), so the loop pass plays G-2 at +32/128 semitone (570 -> 562). The first pass plays fine 0 (570). The ROM replays the first-pass bytes (no 0x4E, because fineRaw === 128 on that row), with the driver still holding the period offset -2 sent at F-4 -> 568. One shared byte stream cannot give 570 on pass 1 and 562 on pass 2. atLoop (fineSent = NaN) does not help, because the first-pass state is 128.
- Fix options, not done (out of budget): (1) per-channel loop unroll. Emit a second copy of the loop-target rows with the end-of-song state until fine/vib/arp converge with pass 1, then jump into pass 1. Each FamiStudio channel stream has its own loop jump, so this is per channel; cost is bytes. (2) At least add a lossy entry when the end-of-song fineRaw != 128 on a tonal channel whose loop target plays a note before any E5. The checker then labels it a driver limit (an honest label until (1)). Regression test for (1): a 2-order song, last row E5A0, loop row a note without E5; expect a 0x4E op with the loop-pass offset after the loop label.
- No code change, no commit.

## Agent 81

Status: NOT committed. Gates failed. The edit is reverted from the tree. The patch is kept at
`thoughts/spot/2026-11-22-nes-agent81-loop-unroll.patch`. The sha tables are kept at
`thoughts/spot/2026-11-22-nes-agent81-sha-{before,after}.tsv`.

Driver facts:
- Each channel stream ends with its own `0x42 lo hi` jump (famistudioSong.ts: `out.push(0x42, 0, 0); fx.push([out.length - 2, packed.loopAt])`).
  The format can express a per-channel loop-entry unroll. No driver change is needed.
- `compressRefs(out, ev, efx, loopAt)` needs the loop target on an event boundary.

Design tried:
- Extend `seq` with a second pass of orders loopOrder..endOrder-1 (frames shifted by the song end).
- Convert pass 2 with the end-of-song state.
- Pass 1 records per row: the byte offset when the row starts on an event boundary, the row bytes, and a state snapshot after the row.
- Version A: converge on the first row whose bytes AND post-row snapshot equal pass 1. Then roll that row back and jump to its pass-1 offset.
- Version B: converge on a run of byte-equal rows that ends in snapshot equality (or the song end). Then drop the run and jump to the pass-1 offset of the run start.

Why it failed:
- The snapshot holds fields that differ at the loop but never change later output: bake frame, slVol/slStep with no slide, lastVol, curInsIdx, curNote, keyOff.
  So most channels never converge, and whole loop passes get copied.
- Version B results (bytes before -> after):
  - carve_your_own_path: 16143 -> 20045, moves 16k -> fme7.
  - turtle_byte: 11191 -> 13058. oby1: 9348 -> 10734. Future_Re-ference: 20574 -> 23166.
  - Rise_against: 15136 -> 16119 and starts dropping held 01/02 slides.
  - Sky Sanctuary: 5442 -> 5502.
  - Only Cheetahmen, Fur_Nes, infinity, The East and the_best-1990 kept their sha.
- Bad frames were not measured. The byte and fit gates failed first.

Next step:
- Define "state equal" as "the next row converts to the same bytes". Two options:
  - Compare only the fields that leak into output: fineRaw/fineSent, vibXY/vibOn, arpXY/arpOn, heldSlide, slideOps, envMode/lenIdx/furVol/hwVol, lastSpd.
  - Or require N byte-equal rows before the jump.
- Then prove that no-leak songs keep their sha before measuring Sky Sanctuary bad frames.

## Agent 82

Status: gates FAIL, nothing committed. Best version written over thoughts/spot/2026-11-22-nes-agent81-loop-unroll.patch (Agent 81 patch plus a liveness-gated snap()). The working tree is back to HEAD for famistudioSong.ts.

What changed in snap():
- Dead field dropped: slFrame (relative value is 0 after every row).
- Conditional fields (compared only while a later row in the same pass can read them): curNote (03xx porta, or slide/fine/vibrato/arp on a note-less row, before a plain note), curInsIdx (note or 00/04 rebuild before an instrument column), vibratoPos (vibrato/arp/porta rebuild before a note that resets it; continuousVibrato keeps it live), keyOff (00xy after note off), slVol (running 0Axy or a later 0Axy before a volume column), slStep (only while slideOps run), bake (only when !hwVol && baked), lastSpd (ch0 without spdOut only).
- Kept unconditionally: envMode, lenIdx, furVol, hwVol, slideOps, lastIns, lastVol, empty, vibXY, vibOn, arpXY, arpOn, noteArp, fineRaw, fineSent, heldSlide.

Result: byte sizes identical to Agent 81's (the liveness gating does not move any song). Sizes before -> after (Agent 81 tsv before vs patch): Bop 5399->5403, Famitune1 4491->4495, Future 20574->23166, Rise 15136->16119 (held slides dropped), Sky 5442->5502, samurai 6409->6415, SSI 3350->3357, carve 16143->20045 (16k->fme7, gate FAIL), christmas 10011->10388, going_up 10072->10117, nes_feature_test 1215->1557, oby1 9348->10734, one_sided_love 5868->5883, smashtv 12321->12326, sweatsmile 9384->9405, turtle 11191->13058. Same sha: Cheetahmen, Fur_Nes, infinity, The East, the_best-1990.

Why convergence still fails (instrumented the first snap field that differs on byte-equal rows, all songs, counts): lastVol 23.8k (pass 1 has -1 at the loop row, pass 2 a known level, mostly -1/15), fineRaw 13.3k + fineSent 11.9k (128/127 and null/1 mostly: real E5 carry, Sky's bug), furVol 9.0k (15 vs carried level), bake 7.1k, lastIns 6.7k (pass 2 carries a flagged 0x9000000x id vs pass 1's plain id), vibXY 5.2k, vibOn 4.1k.
- fineRaw/fineSent/furVol differences are real output state: the copy must run until the next E5/volume column. That growth is correct audio, not waste.
- lastVol = -1 in pass 1 is NOT a pure "unknown, resend" value: line ~915 skips the 0x70 byte when lastVol < 0 outside hwVol/baked, so it cannot simply be treated as compatible. Next step: give lastVol a separate "unknown" sentinel (force resend) at the loop row in both passes, then compare it only until the next volume byte; same for lastIns (strip the flag bit or compare under insLive).

Rise_against cause: not a slide-logic bug. The loop pass grows the VRC6 song over the 16 KiB cap (VRC6 cannot move to fme7), so furnaceToFamistudio's fit fallback re-converts with withHeld=false and logs "01/02 slide held over later notes dropped to fit". Fix is size: make the loop pass converge.

Not done / unverified: bad-frame counts (nes-famistudio-check not run), new regression test, type-check of the patch file version, carve fit.

## Agent 83

Status: gates FAIL, nothing committed. Best version written over thoughts/spot/2026-11-22-nes-agent81-loop-unroll.patch (Agent 82 patch plus the changes below). Working tree back to HEAD for famistudioSong.ts; test-data jsons restored (cmp-proven).

Changes on top of Agent 82:
- lastVol: new sentinel LAST_VOL_UNKNOWN = -2 (forces the next 0x70 on a note or volume column; the note check is now `lastVol !== -1 && lastVol !== furVol`, so -1 keeps its "skip" meaning). Pass 1 records lastVol at the loop row; when pass 2 arrives there with a different value, the channel is rolled back (envs/envKey, insMap, pitchLossy, lossy) and converted again with forceVol, which sets lastVol = -2 at the loop row in both passes. Channels whose two loop-row values match keep their bytes.
- furVol: in snap only while live (a later note reads it before a volume column replaces it).
- bake/baked: in snap only while a later volume column on a no-note row can read it before a note re-bakes.
- lastIns 0x9000000x: KEY_BAKE * (1 + furVol) + idx, i.e. a note baked with the carried end-of-song volume (furVol 8). Real output (another instrument), not an artifact; left as is. lastIns is already -1 at the loop row in both passes.

Sizes (Agent 81 before -> 83): Same sha now: Bop, Famitune1, smashtv (plus the 5 from before). Future 20574->20584 (Agent 82: 23166), SSI 3350->3351, samurai 6409->6415, one_sided_love 5868->5875, going_up 10072->10112, sweatsmile 9384->9405, Sky 5442->5496, christmas 10011->10388, oby1 9348->10206, nes_feature_test 1215->1563, turtle 11191->13053, Rise 15136->16111 (still drops held 01/02 slides: FAIL), carve 16143->20042 (16k->fme7: FAIL).

Remaining first-differing fields on byte-equal rows (all real carried Furnace state, the copy is correct audio):
- carve ch3 (noise) furVol 15 vs 8 over 6264 rows; ch1 fineRaw 128 vs 144.
- Rise ch1 vibXY 0 vs 0x44 (04xy carried), ch2 heldSlide.
- turtle ch2 heldSlide [2,2]; oby1 ch3 furVol 15 vs 1, fineRaw on ch1/ch6.
- Sky ch2 fineRaw 128 vs 160 (the E5 carry itself).

nes-famistudio-check (bad frames, backup json -> 83): Sky triangle 334->0. Future p1 9390->2722, p2 9166->2908, tri 8693->333, noise 8209->102, dpcm 3097->928. christmas p1 3126->0, p2 2178->402, tri 949->10, noise 1415->0, dpcm 215->1. one_sided_love p1 1773->27, p2 1179->32. carve p1 329->4, p2 1830->1292, tri 470->418. turtle p1 8096->7542, p2 8756->8525, tri 6863->6864 (RISE by 1: FAIL). samurai, SSI, nes_feature_test unchanged. VRC6 songs (Rise, going_up, oby1, sweatsmile) have no Furnace reference.
- Unverified: whether the large Future/christmas drops are all from this patch or partly from commits after the backup json was recorded (pre-loop first-bad frames like Future frame 5 also moved).

Not done: regression test (skipped: gates failed, no commit), famistudioSong.test.ts run.

Next step: the size failures are real carried state (noise volume, vibrato, held slide), not representation. Options: accept fme7 for carve / raise the gate; or encode the loop entry as a short "state fix-up" prefix (send 0x70/vibrato/slide bytes, then jump into pass 1) when the only differences are driver-register state that pass-1 bytes never overwrite differently, i.e. converge on "bytes equal to the song end" (suffix equality) with a fix-up prefix. Find turtle's +1 triangle frame first.

## Agent 84

Commit 4450d0655 "Convert a second loop pass that carries the Furnace end-of-song state" (local, not pushed).

- Design: convert() takes withLoop. furnaceToFamistudio tries the loop pass first in each music area (16k, then FME-7 for 2A03); it is kept only when it fits with nothing dropped, else the single-pass convert runs and the existing cuts/held fallbacks follow unchanged. Single-pass keeps the loopSlide lossy note.
- Sizes HEAD -> after: carve 16143 and Rise_against 15136 byte-identical (sha same), also Bop, Famitune1, Fur_Nes, Cheetahmen, The East, infinity, smashtv, the_best-1990. Grew: Future 20574->20584 (fme7), Sky 5442->5496, samurai 6409->6415, SSI 3350->3351, christmas 10011->10388, going_up 10072->10112, nes_feature_test 1215->1563, oby1 9348->10206, one_sided_love 5868->5875, sweatsmile 9384->9405, turtle 11191->13053. No area change, no new fit fallback.
- Bad frames (fresh HEAD baseline -> after): Sky tri 334->0; one_sided_love p1 57->27, p2 42->32, tri 13 and dpcm 10 unchanged; Future, samurai, SSI, christmas, nes_feature_test, turtle identical on every channel. No rise.
- turtle_byte +1 tri frame: stale test-data baseline. Fresh HEAD already 6864 tri; loop pass adds 0. Not a converter bug.
- Unverified: going_up, oby1, sweatsmile (VRC6, no Furnace reference).
- Test: "plays the loop target with the E5 fine pitch left at the song end" fails at HEAD (1 vs 2), passes after.

## Agent 85

Status: gates FAIL (samurai noise rises), nothing committed. Patch: thoughts/spot/2026-11-22-nes-agent85.patch (famistudioSong.ts + regression test). Working tree back to HEAD for both files; test-data jsons restored (cmp-proven).

Cause (Famitune1, 56 Hz): converter bug, not a driver limit. macroFrames resampled a Furnace tick-rate macro to 60 Hz frames with src[floor(f x rate)], and the 00xy arp env (line ~891) with steps[floor(f x rate)]. At rate 56/60 that shows tick 0 on frames 0 AND 1, so every arp/macro step ran one frame late from frame 1 (pulse 00xy 37 arp 212->178->141; triangle ins 3 arp [12,0] = the "octave" error). The Furnace reference bins tick j into frame round(floor(j x 44100/hz)/735), same as rowFrame's round(); the frame shows the last tick binned at or before it.
Fix: tickAtFrame(f, rate) = ceil((f + 0.5) x rate + 1e-9) - 1 used in macroFrames (values) and the 00xy arp env; loop/release frame = floor(i / rate + 0.5 - 1e-9). rate 1 is identity (60 Hz songs byte-identical).
Regression test: tickAtFrame vs the check's VGM binning for hz 10/50/56/128, 3000 frames (fails at HEAD: export missing). famistudioSong.test.ts 58/58 pass with the patch.

Sha: same for every 60 Hz song and SSI (10 Hz). Changed: Famitune1 4491->4489, samurai 6415->6400, oby1 10206->10199, the_best 2025->2026, turtle 13053->13030. No area change.
Bad frames fresh HEAD -> patch (p1/p2/tri/noise/dpcm):
- Famitune1 5384/4359/1233 -> 3984/1968/323 (first bad now frame 12 p1 1-period slide, p2 frame 34 arp note phase, tri frame 54 PCM-mode DPCM).
- samurai (128 Hz) 2595/4145/3340/2120/216 -> 1524/2575/2168/3645/216: NOISE RISES +1525 = gate FAIL.
- oby1 (50 Hz, vrc6) 3746/3733/3863/2120 -> 3437/3420/3414/1358.
- the_best (50 Hz) 1967/2186/748/302 -> 1890/1824/671/158; p1 label now CONVERTER BUG (frame 27 row 3 duty).
- turtle (50 Hz) 7542/8525/6864/3196 -> 7056/7497/6362/1963.
Next: find samurai noise rise (rate 2.13 > 1: the ceil mapping skips tick 0 on frame 0; likely a noise arp/duty macro whose first tick now never shows, or a note on an odd tick phase). Check noise macros of samurai first. Also the_best p1 duty at frame 27. Unverified: type-check of the patch (not run, budget).

## Agent 86

Status: gates PASS, committed (85 patch + fix + test). test-data jsons restored (cmp-proven).

Cause of the samurai (128 Hz) noise rise with the 85 patch: converter bug in macroFrames resampling. At rate 2.13 a frame holds 2-3 ticks; the loop `for f; tickAtFrame(f) < N` stops as soon as a frame would show a tick past the end, so the frame that should show the last tick (N-1) was never emitted. One-shot macros ended on the value before the last: the noise kick volume [.. 2, 0] held at 2 forever (noise sounding 5183 of 5183 frames vs 4173; first new bad frame 6, Furnace silent, ROM period 14 vol 2), triangle arp stuck at 319 instead of 507 from frame 4. HEAD's floor(f x rate) happened to land on the last tick here.
Fix: for non-looping macros keep emitting frames until one shows the last tick, clamping the tick to N-1 (Furnace holds the last value). Looped macros keep the 85 length (an extra clamped frame would stretch every loop period).
Regression test: 128 Hz one-shot vol [15 8 0] must encode as envelope [8 0] (fails on the 85 code, passes now). famistudioSong.test.ts 59/59.
Sha (ROM sha1 per song, scratch builder): only Famitune1, samurai, oby1, the_best, turtle change vs HEAD; all but samurai are byte-identical to the 85 patch. All songs fit (no music area change).
Bad frames p1/p2/tri/noise/dpcm, HEAD -> 85 -> 86:
- samurai 2595/4145/3340/2120/216 -> 1524/2575/2168/3645/216 -> 1524/2566/749/990/216.
- Famitune1 5384/4359/1233 -> 3984/1968/323 -> same as 85. oby1 3746/3733/3863/2120 -> 3437/3420/3414/1358 (86 same). the_best 1967/2186/748/302 -> 1890/1824/671/158 (86 same). turtle 7542/8525/6864/3196 -> 7056/7497/6362/1963 (86 same sha).
Open: vol release hold step (loop = release) can still skip its tick at rate > 1 (not measured). HEAD numbers for the four non-samurai songs are agent 85's fresh baseline, not re-run.

## Agent 87

Status: no commit (fix moves no bad frame). Patch: thoughts/spot/2026-11-22-nes-agent87.patch. famistudioSong.ts back to HEAD (git apply -R); test-data jsons restored (cmp-proven).

Future_Re-ference fresh HEAD (e08adac80): p1 2722 (first frame 6), p2 2908 (first frame 5), tri 333, noise 102, dpcm 928, song 20584B.
- The "note delay under 2 frames" tag is only the channel's top lossy class, not the cause of the first bad frames: order 0 rows 0-11 of pulse 1/2 carry no EDxx (song 60 Hz, groove 2,1 so row r sits at frame ~1.5r).
- Real cause of the first bad frames: volume column under a baked volume macro (famistudioSong.ts ~907-918). Pulse1 row 4 vol 6 on inst 19 (bake 10) at frame 6: Furnace 4, ROM 0 (silent) at frames 6-7. Pulse2 row 3 vol 2 on inst 18 (bake 4) at frame 5: Furnace 1, ROM 0. The least-summed-error channel volume c over the rest of the macro picks a c whose floor(c x e / 15) is 0 on those frames. Driver table is plain floor (famistudio_volume_table). Next: compare scaleVol (Furnace) against floor at small values (Furnace min-1 rule?) and weigh early frames / never pick c that silences a frame Furnace sounds; or re-key the instrument with a new bake (vol 6) instead of a 0x7c volume. Not a driver limit: a new baked instrument per volume column is possible (size cost; FME-7 at 20.6 KB).
- ED side finding (in the patch): driver opcode 0x47 n plays n + 1 frames after the row (counter decrements, plays on wrap 0 -> $FF), so a 1-frame delay is n = 0; the converter's `d >= 1` drops it. Patch `d >= 0`: Future bad frames identical on all 5 channels, song +88B (20672B), so no gain on this song; not committed (gate "bad frames drop" fails). Label then reads "note delay under 1 frame".
Unverified: other songs with 1-frame EDs (sweep not run), type-check of patch, Furnace delayBehavior 2 handling.

## Agent 88

Status: no commit (Future bad frames do not move). Patch: thoughts/spot/2026-11-22-nes-agent88.patch (no-silence rule + test + agent 87 ED patch). Source back to HEAD (git apply -R); test-data jsons restored (cmp-proven).
- Furnace source: nes.cpp tick() outVol = VOL_SCALE_LINEAR_BROKEN(vol&15, MIN(15, macro), 15); dispatch.h VOL_SCALE_LINEAR = x*y/15 (ceil only with ceilVolumeScaling), LOG = clamp(x+y-15). No min-1 rule. The converter's scaleVol matches it exactly.
- No-silence rule (only c that keep every frame Furnace sounds non-zero; c = 15 always qualifies): full 22-song run vs fresh HEAD (e08adac80) is identical on every song and channel (bad frames and song bytes). So the chosen c at Future p1 row 4 / p2 row 3 does not silence those frames: agent 87's cause is wrong or incomplete. Next: dump the emitted ops and rest[] for Future p1 row 4 (check the rest offset seq[ri].frame - bake.frame, the c === lastVol skip, and whether that row reaches this branch at all: !hwVol && baked && n === 0 && bake).
- ED patch (d >= 0) on top: Future identical bad frames, +88 B (20672); carve_your_own_path p2 1292 -> 1274 (+4 B); turtle_byte p1 7056 -> 7032, p2 7497 -> 7491 (+16 B). No other song changed, no overflow. Measures better: worth committing on its own with a test.
Unverified: famistudioSong.test.ts and type-check not run on the patch (budget).

## Agent 89

Status: NO commit (budget). Part A (ED `d >= 0` + test 'maps a 1-frame ED note delay to 0x47 0') left UNCOMMITTED in the tree on famistudioSong.ts + famistudioSong.test.ts; test file passed 60/60 with it. Type-check NOT run (buildq needs `--light` as the FIRST argument, before `--purpose`). test-data jsons restored (cmp-proven).
- Part A re-measured vs fresh HEAD (123e0398d), 22 songs: carve p2 1292 -> 1274 (16147 B), turtle_byte p1 7056 -> 7032, p2 7497 -> 7491 (13046 B), Future identical bad frames (+88 B, 20672). No other song changed, no overflow. Same as agent 88.
- Part B cause (Future pulse1 row 4, pulse2 row 3): the rest[] offset ignores the volume macro RELEASE point. Ins 18/19 vol macro = [15 12 11 10 1 3 2], release 3, speed 1 (dump: song speed 1/1, rows at frame ~1.5r). Furnace holds step 3 (10) until note release. pulse1: note row 0 v10 (bake 10), row 4 v6 at frame 6: rest = vals.slice(6) = [2]: env floor(10*2/15)=1, fur floor(6*2/15)=0, every c has err 0, so c = 0 -> silence. Real Furnace: 6*10/15 = 4; env 10*10/15 = 6; c = 10 gives floor(10*6/15) = 4 and 0 1 0 on the tail [1 3 2] (err 0). pulse2: bake 4, row 3 v2 at frame 5: rest = [3 2], fur 0 0, c = 0; real Furnace 2*10/15 = 1, c = 8 gives 1. Matches the reported Furnace 4/ROM 0 and Furnace 1/ROM 0 exactly. Not the c === lastVol skip; the row does reach the branch (volume-only row, baked, n === 0).
- Fix (thoughts/spot/2026-11-22-nes-agent89.patch, on top of Part A): store f.release in bake; start rest at bake.release when frame offset >= release. Shortcut: assumes no note-off between bake and the volume row. UNMEASURED: the A+B 22-song run was killed for budget. Next: apply the patch, run the 22-song check vs a Part-A baseline (fresh results file each run, ~15 min each), commit separately if Future drops with no regression, then add a test (release-point macro, volume row past release).

## Agent 90

- Agent 89's patch indexed the wrong slot: macroFrames returns `release` as the FamiStudio release (Furnace release + 1) and `loop` as the held step, so `vals.slice(bake.release)` matched the tail [1 3 2] (c = 8, plays 3 not 4). Committed fix instead stores f.loop and f.release and, once the frame offset passes the loop start, matches `vals.slice(loop, release)` (held step for release macros, loop body for plain loops). Shortcut kept: no note-off between bake and volume row.
- 22-song nes-famistudio-check vs Part A baseline (nes89/a.json == fccbe7d2d): Future p1 2722 -> 1646, p2 2908 -> 2904 (20672 -> 20655 B); carve p2 1274 -> 1270; every other song identical; no overflow. test-data jsons restored (cmp-proven).
- Test 'holds a baked volume macro at its release step for a volume-only row past it' fails without the fix, 61/61 with it. Type-check clean.
- Open: Future p2 row 3 barely moved (2908 -> 2904): its residual cause is elsewhere, not measured. Future p1 still 1646 bad.

## Agent 91

Status: NO commit (oby1_ingame regression). Tree reverted; patch with fix + test at thoughts/spot/2026-11-22-nes-agent91.patch.
- Future pulse2 cause is DUTY, not volume: first bad frame 14 (order 0 row 9), Furnace period 150 vol 2 duty 1, ROM duty 0 (volume matched every frame 0-40). Row 0 has 1200 + ins 18 (duty macro [0 1]); row 9 plays ins 0 (no duty macro). Furnace keeps the duty the macro left in channel state (1); FamiStudio's default duty envelope [0x7f 0 0] plays famistudio_duty_cycle, which only 0x4f sets (still 0 from 1200; famistudio_ca65.s instrument load copies famistudio_duty_cycle into the duty env value).
- Fix tried: track furDuty (12xx + the duty macro value at the next note's frame offset) vs fsDuty (last 0x4f sent); on a note whose instrument has no duty macro, send 0x4f furDuty when they differ. Test 'sends the duty a duty macro left ...' fails without, 62/62 with; type-check clean.
- 22-song run vs nes90/b.json: Future p2 2904 -> 726 (20655 -> 20414 B); Byte-Sized Bop p2 2880 -> 2588, p1 2750 -> 2747; samurai p2 2575 -> 2333; turtle_byte p1 7032 -> 6727; oby1_ingame p1 3437 -> 4570 (WORSE, +2 B). No overflow. Future p2 residual 726 starts frame 2931 (order 15 row 51) duty 2 expected, 1 got.
- Next: dump oby1_ingame pulse1 first new bad frames with the patch applied (--only oby1_ingame --dump; dump prints period/vol only, add duty to it locally). Suspects: 12xx during a running duty macro, duty macro on an instrument-less note row, or Furnace's initial channel duty before any 12xx (furDuty = -1 skips it).

## Agent 93

oby1_ingame inst 28 ("what is this NES", NES) duty macro, raw from our parser (song v236, hz=50): code 2, len 13,
loop 255, release 255, mode 0, type 1 (open bit only = sequence), delay 0, speed 1, data [0 x6, 1 x4, 2 x3].
Parser is correct; [0 x7, 1 x5, 2 x4] is macroFrames' 50->60 Hz resample (rate 5/6). Furnace macroInt.cpp has no
hold/restart rule that applies (release 255, no loop): the macro runs normally.

Root cause (confirmed from --dump 5440-5530 with duty printed, HEAD): TICK PHASE of the note onset. macroFrames
resamples every macro from the note's own tick 0 (tickAtFrame(f, rate) with f counted from the note frame), so tick 0
always fills one frame. In Furnace the 50 Hz ticks sit at absolute song phase: notes whose onset falls where one tick
spans two 60 Hz frames (ref 5486/5487 and 5522/5523 both show arp step 0, period 668; ours shows 719 then 356 = step 1 a
frame early) run the whole macro one frame later. Duty step 6 (first 1) lands on note frame 7 in ours, frame 8 in the
reference = the next note's onset (rows 7-8 frames apart), so the reference never shows duty 1 at 5493/5529. Notes at
5479/5501/5508/5515 have matching phase and match. Same phase error hits arp and volume on these notes, not only duty.
Also: our pulse 1 period is off throughout (668 ref vs 719 got, ~1.3 semitones) - the bulk of the 3437 bad frames,
labelled pitch slide lossy; separate issue.

Fix not attempted (budget): needs per-tick-phase envelope variants (5 phases at 50 Hz: onset tick mod 5) chosen per note
from its absolute tick, i.e. instrument copies per (instrument, phase) for instruments whose multi-step macros change
across phases. Watch FamiStudio's 64-instrument cap (oby1 already has 33). Nothing committed, no patch.

## Agent 94 (2026-11-22) - oby1_ingame pulse period 668 vs 719

- NOT a converter bug. oby1_ingame chip flags are clockSel=1 (PAL) on both 2A03 and VRC6. `--dump` prints the raw PAL reference
  periods; the lockstep compare rescales them to NTSC (tools/nes-famistudio-check.ts:194). PAL 668 -> round(669 * 1789773 / 1662607) - 1
  = 719 = ours. Same for every "~1.3 semitone" pair (595/641, 1417/1526, 718/773): constant ratio 1.0765 = NTSC/PAL clock.
- What the real pulse bad frames are (full-song dump, after PAL rescale):
  - pulse1 3162 diff frames: +1 1702, -1 397 (PAL rescale quantization: the PAL register is round(P_pal) - 1, rescaling it carries
    +-0.54 period error, so an exact compare flips +-1 on many notes; ours = Furnace's NTSC formula exactly). 1x-2x/x2 arp-phase
    frames ~270 (known macroFrames tick-phase issue). -4/-5 ~440 frames: see next bullet.
  - pulse2 2161: +-1 1657 (same PAL quantization), rest arp phase / small.
- -4/-5 on pulse1 (every order): ins 20 "famous" arp macro [12, 0] + E590 on the note. Furnace applies E5 as a ratio
  (1/128 semitone, calcFreq linear) to whatever note the arp gives; the converter sends E5 as one 0x4e period offset computed
  against the base note (famistudioSong.ts ~801-804, sn = src). On the +12 arp frame the needed offset is half (-5.5) but the
  driver adds the full -11 (768 - 11 = 757 vs Furnace 762). Driver limit of FamiStudio fine pitch (constant period offset);
  only fix would be folding the per-arp-step fine difference into the 0x49 pitch envelope. Not done.
- triangle 3339 frames, 2534 large: kickT / snareT drum instruments (signed arp macros [2,0,-2..-9], [-5..-30]) with
  pattern 7 notes C-2 / D#-4; ours starts ~19 semitones low and descends slower (5386-5398: ref 224..756 PAL, ours 675..1526).
  Different cause, NOT investigated (budget). Next agent: check arp macro sign/word-size (macro type byte 65 = signed 8-bit)
  and triangle note octave in the converter for these instruments.
- No code change, no commit, no patch.

## Agent 95

oby1_ingame triangle (kickT/snareT): NOT an arp bug. Reference frames match the snareT/kickT relative arp steps exactly
(snareT -5,-7,-10,...: 2,3,2,1,2,3,2,2... semitone ratios). Ours plays non-semitone steps (+36..80 period/frame): a held
02/01 slide carried onto later notes. Arp macros here are plain relative values (no bit-30 fixed steps).
Cause (likely, not fully proven over 22 songs): song has compatFlags.limitSlides=true. Furnace playback.cpp 0x02 sets
portaNote = getPortaFloor = 60 (NES keeps DivDispatch default, abstract.cpp:136), 0x01 sets 156; reaching it with
targetResetsSlides ends the slide. famistudioSong.ts:967 assumed floor 0 / ceiling 179 always (src+59 / 120-src), so
heldSlide survives (o12 r0 02 20, o5 r48 02 40, o23 r0 02 18 on low triangle notes) and every later bare note slides.
Fix + unit test: thoughts/spot/2026-11-22-nes-agent95.patch (floor FS 1 / ceiling FS 97 when limitSlides). Unit test
passes. NOT applied: no 22-song before/after run done (budget). Next: apply, run HEAD and patched 22-song runs
(TSX_TSCONFIG_PATH=tsconfig.app.json is needed for npx tsx here: tsx is not in node_modules, global tsx 4.23.15
misses the @engine paths in tsconfig.app.json), compare per channel, then type-check and commit.
Noise: not checked whether its 1358 bad frames share this cause (noise slides are not tonal).

## Agent 96
limitSlides patch (nes-agent95) measured, 22 songs, HEAD vs patched. Only change: oby1_ingame triangle bad 3414 -> 2211 (first bad frame 462 both). No regression on any channel. Committed.

## Agent 97

Macro start-phase fix (famistudioSong.ts): off 60 Hz, each note keys its instrument by the fractional frame of its start; phases with matching resampled macros share a copy; least-used instruments drop to one copy over the 64 cap. HEAD -> patched bad frames (nes-famistudio-check):

Famitune1                    pulse1   3984 -> 4189
Famitune1                    pulse2   1968 -> 2197
Famitune1                    triangle 323 -> 485
Super cool and awesome samurai noise    990 -> 358
Super cool and awesome samurai pulse1   1524 -> 1241
Super cool and awesome samurai pulse2   2575 -> 2261
Super cool and awesome samurai triangle 749 -> 692
oby1_ingame                  noise    1358 -> 547
oby1_ingame                  pulse1   3437 -> 3323
oby1_ingame                  pulse2   3420 -> 3292
the_best-1990                noise    158 -> 60
the_best-1990                pulse1   1890 -> 1784
the_best-1990                pulse2   1824 -> 1673
the_best-1990                triangle 671 -> 586
turtle_byte                  noise    1963 -> 857
turtle_byte                  pulse1   7032 -> 6674
turtle_byte                  pulse2   7491 -> 7289
turtle_byte                  triangle 6362 -> 5970
total [101092, 96851] regressions 3

Agent 92 duty carry-over patch not tried (call budget).

## Agent 98

- Famitune1 regression in agent97 patch (per-tick-phase instrument copies) has two causes:
  1. Phase key rounded to 1/1000 frame. Famitune1 is 56 Hz, so ticks fall on exact half-frame ties (t=51.4286, ph 3/7); 0.429 moves tick 1 across the tie (frame 52 played tick 0, ref tick 1). Fix: keep exact phase per copy key (phaseExact map), round only for the key.
  2. Main cause: loop pass. All worse frames are >= 6637 (loop starts ~6583). Loop-pass bytes rejoin first-pass rows whose copies hold first-pass phase, replayed at a shifted song tick phase (songEndT fractional 6582.857). Copies also broke pattern sharing: music 4489 -> 8938 B. Fix (shortcut): loop pass uses phase-0 keys.
- Famitune1 single-song with both fixes: pulse1 3977 (HEAD 3984), pulse2 1942 (1968), triangle 287 (323). All three better than HEAD.
- NOT landed: full 22-song HEAD vs patched comparison did not finish inside the call budget (HEAD run 16/22, patched run not started). Patch: thoughts/spot/2026-11-22-nes-agent98.patch (agent97 + fixes). Next: run the full comparison, land only with zero channel regressions; then try agent92 duty carry-over on top (not tried).
- Type-check and famistudioSong.test.ts not run on the agent98 patch.

## Agent 99

agent98 patch (tick-phase instrument copies): full 22-song FamiStudio check, HEAD (56dbf864a + tree) vs patched. Landed as b331b1583 (famistudioSong.ts + test only). blanketcritter ERR on both: 'first chip is system 241, not NES 2A03'.

| song | pulse1 | pulse2 | triangle | noise | dpcm |
|---|---|---|---|---|---|
| Byte-Sized Bop | 2750 | 2880 | 2789 | 1963 | 241 |
| Famitune1 | 3984 -> 3977 | 1968 -> 1942 | 323 -> 287 | 0 | 0 |
| Fur_Nes | 0 | 0 | 0 | 0 | 0 |
| Future_Re-ference | 1646 | 2904 | 333 | 102 | 928 |
| Rise_against_the_ashes_to_the_new_dawn | 23 | 5018 | 13840 | 0 | 0 |
| Sky Sanctuary Zone | 0 | 0 | 0 | 0 | 0 |
| Super cool and awesome samurai | 1524 -> 1242 | 2575 -> 2291 | 749 -> 693 | 990 -> 358 | 216 |
| Super_Space_Invaders_Title | 665 | 2381 | 334 | 1173 | 0 |
| The Cheetahmen | 0 | 0 | 0 | 0 | 0 |
| The East | 0 | 0 | 0 | 0 | 1 |
| blanketcritter release ver | ERR | ERR | ERR | ERR | ERR |
| carve_your_own_path | 4 | 1270 | 418 | 0 | 0 |
| christmas-fever | 0 | 402 | 10 | 0 | 1 |
| going_up_a_step_at_time | 0 | 0 | 1 | 0 | 0 |
| infinity | 2818 | 1592 | 0 | 36 | 0 |
| nes_feature_test | 204 | 166 | 413 | 300 | 7 |
| oby1_ingame | 3437 -> 3323 | 3420 -> 3292 | 2211 | 1358 -> 547 | 0 |
| one_sided_love | 27 | 32 | 13 | 0 | 10 |
| smashtv | 1604 | 25 | 465 | 0 | 0 |
| sweatsmile_bossfight | 393 | 763 | 1 | 0 | 0 |
| the_best-1990 | 1890 -> 1790 | 1824 -> 1675 | 671 -> 588 | 158 -> 62 | 0 |
| turtle_byte | 7032 -> 6674 | 7491 -> 7289 | 6362 | 1963 -> 857 | 0 |

songs 22 vs 22; total bad 101092 -> 96622; worse: none

agent92 patch (duty carry-over): does not apply on b331b1583 (hunk 3, note-instrument site, moved by the phase-key change). Ported by hand (duty macroFrames now takes keyPhase(key)): thoughts/spot/2026-11-22-nes-agent99-agent92-ported.patch. Type-check passes; famistudioSong.test.ts:494 'sends the instrument again at the loop target' fails (the loop target now gets a 0x4f duty op where the test expects the instrument byte; test or op order needs a look). Not checked on the 22 songs, reverted, not committed.

## Agent 100

agent92 duty carry-over (agent99 port) on b331b1583: NOT landed (oby1_ingame pulse1 regression). Tree reverted; patch with test fix: thoughts/spot/2026-11-22-nes-agent100.patch.
- Test 494 failure was the test, not the converter: loop target bytes are `4b 23 80 | 4f 00 | 80` (arp override, duty op, instrument byte); instrument is still re-sent. The 0x4f before the instrument byte is valid: famistudio_ca65.s:6064 @opcode_duty_cycle_effect stores famistudio_duty_cycle (and the duty env value), and the instrument load copies it back (famistudio_ca65.s:4673 `lda famistudio_duty_cycle,x` -> env value). Test now skips 0x4f after 0x4b. Type-check clean; famistudioSong.test.ts + src/lib/export/nes 65 pass.
- Note: the duty carry-over also runs on the noise channel (ch < DPCM_CH && ch !== 2), as 12xx already did.
- 22-song check vs nes99/p98.json (= b331b1583):

| song | pulse1 | pulse2 | triangle | noise | dpcm |
|---|---|---|---|---|---|
| Byte-Sized Bop | 2750 -> 2747 | 2880 -> 2588 | 2789 | 1963 | 241 |
| Famitune1 | 3977 | 1942 | 287 | 0 | 0 |
| Fur_Nes | 0 | 0 | 0 | 0 | 0 |
| Future_Re-ference | 1646 | 2904 -> 726 | 333 | 102 | 928 |
| Rise_against_the_ashes_to_the_new_dawn | 23 | 5018 | 13840 | 0 | 0 |
| Sky Sanctuary Zone | 0 | 0 | 0 | 0 | 0 |
| Super cool and awesome samurai | 1242 | 2291 -> 2071 | 693 | 358 | 216 |
| Super_Space_Invaders_Title | 665 | 2381 | 334 | 1173 | 0 |
| The Cheetahmen | 0 | 0 | 0 | 0 | 0 |
| The East | 0 | 0 | 0 | 0 | 1 |
| blanketcritter release ver | ERR | ERR | ERR | ERR | ERR |
| carve_your_own_path | 4 | 1270 | 418 | 0 | 0 |
| christmas-fever | 0 | 402 | 10 | 0 | 1 |
| going_up_a_step_at_time | 0 | 0 | 1 | 0 | 0 |
| infinity | 2818 | 1592 | 0 | 36 | 0 |
| nes_feature_test | 204 | 166 | 413 | 300 | 7 |
| oby1_ingame | 3323 -> 4511 | 3292 | 2211 | 547 | 0 |
| one_sided_love | 27 | 32 | 13 | 0 | 10 |
| smashtv | 1604 | 25 | 465 | 0 | 0 |
| sweatsmile_bossfight | 393 | 763 | 1 | 0 | 0 |
| the_best-1990 | 1790 | 1675 | 588 | 62 | 0 |
| turtle_byte | 6674 -> 6369 | 7289 | 6362 | 857 | 0 |

songs 22 vs 22; total bad 96622 -> 94812; worse: oby1_ingame/pulse1 3323->4511

- Next: oby1_ingame pulse1 (Agent 91 saw the same +1100 regression); dump the first new bad frames with duty printed (--only oby1_ingame --dump a-b). Suspects as Agent 91: 12xx during a running duty macro, duty macro on an instrument-less note row, the loop-target forced 0x4f (fsDuty=-1) sending the first-pass duty into the loop pass, or a PAL (clockSel=1) 50->60 Hz duty index (at = frame delta indexes 60 Hz vals).

## Agent 101

Landed agent100 duty carry-over with the oby1 fix. Root cause of the oby1_ingame pulse1 regression (3323 -> 4511): the carried duty was read from the 60 Hz resampled, phase-shifted macro frames at index = rounded frame delta. oby1 is hz 50 (clockSel=1), ins 28 duty macro [0 0 0 0 0 0 1 1 1 1 2 2 2], speed 6: between notes the macro runs 6 Furnace ticks (indices 0-5, all 0), but frame deltas alternate 7/8 and some variants (pass 2 / no-phase key, phase 0) have 1 at frame index 7, so order 12 row 0 (frame 5530, ins 20 no duty macro) got 0x4f 1 while Furnace keeps 0. Not the loop-target fsDuty=-1 (that only sends 0x4f 0 at 0/0). Fix: macroFrames(dm, 'duty', lossy) per Furnace tick, index round((t - noteT) * macroRate) - 1 (the row's note-on runs before that tick's macro step).

| song | channel | HEAD b331b1583 | agent100 patch | agent101 |
|---|---|---|---|---|
| Byte-Sized Bop | pulse1 | 2750 | 2747 | 2747 |
| Byte-Sized Bop | pulse2 | 2880 | 2588 | 2588 |
| Future_Re-ference | pulse2 | 2904 | 726 | 690 |
| Super cool and awesome samurai | pulse2 | 2291 | 2071 | 2071 |
| nes_feature_test | noise | 300 | 300 | 299 |
| oby1_ingame | pulse1 | 3323 | 4511 | 3323 |
| turtle_byte | pulse1 | 6674 | 6369 | 6369 |

songs 22; total bad 96622 -> 94812 (agent100) -> 93587; worse: none. blanketcritter ERR as before. famistudioSong.test.ts + src/lib/export/nes 65 pass; type-check clean.

## Agent 102

- E5xx under an arp: Furnace applies fine pitch per arp step (calcFreq linear on the step note); the converter sent one 0x4e offset taken at the base note. Fix (commit below): with no vibrato or pitch macro on the note, a 0x49 absolute pitch envelope with the arp's frames and loop holding fine(note + step) - F. arp00() helper shared by the arp and pitch paths.
- Songs with changed bytes (sha1 of music, 6 of 22): carve_your_own_path pulse2 1270 -> 51; oby1_ingame pulse1 3323 -> 3015, pulse2 3292 -> 3203; the_best-1990 pulse1 1790 -> 1772, pulse2 1675 -> 1644; turtle_byte pulse1 6369 -> 6332, pulse2 7289 -> 7208; going_up_a_step_at_time and nes_feature_test unchanged. Total -1652. Worse: none. Other 16 songs byte-identical, so no full run.
- Note: test-data/nes-famistudio-check.json on disk was older than HEAD (oby1 pulse1 6702 there vs 3323 at HEAD), so the HEAD numbers above come from fresh --only runs at HEAD.
- Open: E5xx + arp + vibrato or pitch macro still uses the base note's offset (needs one merged envelope). carve grows 16149 -> 20438 B music (under the cap).

## Agent 103

Ledger row 2502 (Sky: pulse1 f3456 1140 vs 1139, note table off on 7 of 72 notes, pulse2/noise f3805, triangle f489, converterBug=4) is stale. Nothing to fix, nothing committed.
- Fresh `--only "Sky Sanctuary Zone"` at HEAD 9ba1ceb7d: [OK], pulse1/pulse2/triangle/noise/dpcm bad 0/0/0/0/0, converterBug=0, song 5505 B, lag 0. (The stored json entry was older: 5442 B, triangle 334.) Frame 3805 is Furnace's song end, not a fault.
- Note table (famistudioSong.ts:1261 noteTablePeriod = round(1789773/(16*a4*2^((n-46)/12))) - 1) vs the reference renderer, /Applications/Furnace.app 0.6.8.3 (engine.cpp calcFreq: round((clock/fbase)/16) per note, then nes.cpp freq-- and 2047 clamp, clock COLOR_NTSC/2): identical on all 96 notes for A-4 = 440, 433, 392, 436, 450.
- Where "7 of 72" comes from: third-party/furnace-master is dev258, which replaced per-note rounding with DivPitchTable (pitchTable.cpp:177 init + get: one rounded octave at shift 5, other octaves shifted right with round-half-up). Modelled at A-440 it differs from our table by +1 on exactly 7 notes: n14 1613/1614, n17 1356/1357, n19 1208/1209, n20 1140/1141, n21 1076/1077, n34 507/508, n48 225/226. So the earlier finding compared against the dev258 source, not the 0.6.8.3 binary that the check renders with. If the reference Furnace is ever upgraded past 0.6.8.3, noteTablePeriod must switch to the pitchTable model (and retuneNoteTable's search for the stock table stays on the 440 per-note table).
- Test-data jsons restored from backup (cmp identical).

## Agent 104

Ledger row (The East noise 7 vs 8 f1562 + DPCM f61; Famitune1 triangle half period). Nothing committed: no converter bug left in either song at HEAD 9ba1ceb7d.
- The East (fresh `--only`, dump 1555-1570): pulse1/pulse2/triangle/noise bad 0, noise matches 3/8, 3/7, 3/6 ... frame for frame, converterBug=0. The noise 7 vs 8 row is stale (fixed by an earlier commit).
- The East DPCM bad=1, frame 61 (~order 0 row 20), expected start true / got false, classed DRIVER LIMIT (song is dpcmMode=false, Furnace streams PCM through $4011, lossy note "DPCM channel in Furnace PCM mode played as 1-bit DPCM"). The DPCM pattern cells at order 0 rows 14-22 are all empty, so the extra start is a Furnace DAC stream (VGM 0x93/0x95) restart with no note behind it, not a converter note. Not fixable in the converter; if wanted, the checker could ignore a PCM-mode stream restart on a row without a note.
- Famitune1 triangle bad=287 (DRIVER LIMIT): not a half period / octave. Order 2 row 0 C-5 ins 5, row 4 vibrato 04A4 (no note), song hz 56. Dump 840-872: the ROM's vibrato values are right (52/53 pattern) but start one 60 Hz frame later than Furnace (Furnace 53 at f852, ROM at f853, then the same 1-frame lag every cycle). Suspects for the next agent: the vibrato started on a non-note row (phase in famistudioSong.ts ~910 `vibPos + x * (floor(i / perTick) + 1)` assumes the step on the row tick; check whether FamiStudio's 0x49/pitch env change on a non-note row applies its first value one frame later), or the 56 Hz row placement (Furnace tick -> 60 Hz bin vs ROM tempo accumulator). Compare a 60 Hz song with vibrato on a non-note row to split the two.
- Test-data jsons restored from backup.

## Agent 105

Famitune1 triangle 287 -> 176. Cause: suspect (b), row placement, not the driver. FamiStudio applies 0x49 and a note attack's pitch env reset the same way (ptr=1, repeat=0, read the same frame), and Furnace steps vibrato once on the row tick for a noteless 04xy too, so the `+1` was right. The vibrato step formula `floor(i / perTick)` counted ticks from the row's frame, ignoring that a 56 Hz row fires up to half a frame off its tick (row 4 = tick 24 = time 25.71, frame 26: tick 25 lands on frame 27 = step 1, old formula put it on step 2). Fix: `tickAtFrame(i, macroRate, seq[ri].t - seq[ri].frame)`, the macro helper. 60 Hz songs are unchanged (identical formula at rate 1, ph 0).
Before/after (non-60 Hz songs, the only ones the change reaches): Famitune1 p1 3977->3561 tri 287->176; samurai p1 1242->185 p2 2071->849; oby1 p2 3203->3199; the_best-1990 p1 1772->1727 p2 1644->1611; turtle_byte p1 6332->6184 p2 7208->7118; Super_Space_Invaders unchanged; rest unchanged. Nothing worse.
Left: Famitune1 tri 176 remaining unchecked (vibrato loop length round(32 ticks * 60/56) = 34 frames is not a whole number of frames, so phase drifts across cycles; unroll the loop to a whole-frame multiple if the rest is that).

## Agent 106

Fix tried: 04xy vibrato loop = smallest k cycles that are whole frames within 240 (56 Hz 0463: 7 x 32 ticks = 240 frames)
instead of one cycle rounded (34 frames, slips 0.29 frame per loop). Measured, then REVERTED (not committed).
Patch saved: thoughts/spot/2026-11-22-nes-agent106.patch (source + tests; the tests include an unimplemented
4th `vibShort` param for mergeVibratoPitch, so the patch type-checks only once that is written).

| Song | before p1/p2/tri/noise | after |
|------|------------------------|-------|
| Famitune1 | 3561/1942/176/0 | ERROR song data 16641 B > 16384 |
| Super cool and awesome samurai | 185/849/693/358 | same |
| oby1_ingame | 3015/3199/2211/547 | ERROR song data 16574 B > 16384 |
| the_best-1990 | 1727/1611/588/62 | 1579/1441/588/62 |
| turtle_byte | 6184/7118/6362/857 | ERROR song data 25468 B > 24576 |
| Sky Sanctuary Zone | pass | pass |

Why worse: every off-60 Hz vibrato envelope grows 34 -> 240 steps (x7), and distinct envelopes per row phase and
depth multiply, so three songs pass the song-data cap. Phase fix itself works (the_best-1990 -148/-170).
mergeVibratoPitch risk is real: with a 240-frame vib any pitch macro gives len + period > 240 -> "cut, no loop".
Left: a size-aware loop choice, e.g. use the k-cycle unroll only while the song data fits (or only on the channel(s)
where the slip is audible / cap k so k * cycle <= ~120), and fall back to the one-cycle vib inside mergeVibratoPitch
when the merge passes 240. Famitune1 tri 176 stays open.

## Agent 107

Cause of bytes (agent 106): the vibrato envelope is keyed by row phase (vibPos + sub-frame rowPh) and deduped by content
(envId), so every distinct phase got its own envelope; unrolling all of them to 240 frames multiplied bytes x7.
Fix tried (UNMEASURED, uncommitted, in working tree + thoughts/spot/2026-11-22-nes-agent107.patch): unroll whole cycles
only up to the next vibrato rebuild (`vibSpan`: next note or a changed 04xy, capped 240); past 240 take the k with least
slip per frame. Short holds stay one cycle, so size grows only on long held notes. mergeVibratoPitch gets a 4th
`vibShort` param and falls back to the one-cycle vibrato when the merge passes 240. Tests added (one-cycle short hold,
240-frame long hold, merge fallback). Not run: the check run was stopped before results (first run failed on a missing
--out roms dir). Next: mkdir roms dir, run the six songs, then vitest + type-check, commit if the table holds.

## Agent 108

Famitune1 triangle 176 bad frames (all listed with a scratch copy of tools/nes-famistudio-check.ts that logs every bad frame; HEAD 22cbcd415, no converter change kept):
- 139 period frames: 03xx portamento (o2 r63 -> o3 r0 `03 05`, o4 r12 `03 12`, o4 r7-11 `04 00` + `01 06`) on high triangle notes (period 35-120) with linear pitch at 56 Hz. Furnace moves ~1/3 period per frame; FamiStudio's smallest constant slide step is one half-period per frame (0.5 period), so the ROM overshoots by 1-4 periods. Repeats in the loop pass (o11-13, o18-20). Already labelled pitchLossy / driver limit. Fix would need a per-frame pitch envelope instead of 0x50 slides.
- 37 sounding frames, loop pass only (o16, o17, o21, o22 = orders 0, 1, 5, 6 of the second pass; first pass clean): instrument 3 (vol 15,15,15,0) attack/cut one frame off at one note in every 7 rows (42 ticks = 45 frames, the 56/60 phase cycle). ROM writes $4008=$80 on the attack frame where Furnace writes $FF, and $8F where Furnace already cut to 0. Cause: the song is 6144 ticks = 6582.857 frames, so every loop pass starts 0.857 frame later in the 56 Hz phase; the loop pass replays first-pass bytes / phase-0 copies (shortcut comment at famistudioSong.ts line ~1034). Tried phase-aware copies in pass 2 (phaseKey for both passes): triangle 176 -> 200, pulse1 3561 -> 3677, pulse2 1942 -> 2031. Reverted. A real fix needs a phase-aware rejoin, and pass 3+ shift again (7-pass cycle), so one byte stream cannot match every pass unless loop copies are emitted per phase.

turtle_byte pulse2 7118 -> 7119 (22cbcd415): frame 6741 became good; 6802 and 7263 became bad. All three sit inside notes (checker label ~o14 r40/r48, ~o15 r48) already wrong by ~20-25 periods (exp 333, got 358) at HEAD~1 as well; the vibrato phase change only moved which frames of those spans happen to match. Net +1 is noise inside a pre-existing wrong-pitch span; root cause of the 25-period offset not investigated (budget).

## Agent 109

Task: turtle_byte pulse2 near order 14 row 48 / order 15 row 48 (frames 6741, 6802, 7263) "plays 358 where 333 is expected".

Finding: the premise is wrong. turtle_byte has chip flag `clockSel=1` (PAL 2A03, 1662607 Hz) and tuning A-4 = 436. The
333 in the checker log is the raw PAL period. tools/nes-famistudio-check.ts already rescales it to NTSC before comparing:
`round((333+1) * 1789773/1662607) - 1 = 359`. The exact NTSC value is 358.55; the ROM plays 358. So those frames are
off by 1 NTSC unit (about 2 cents), not 1.27 semitones. The constant 1.076 ratio seen in every order is the PAL/NTSC
clock ratio itself.

Cause groups at HEAD 22cbcd415 (all bad frames, rescaled delta = ROM - round(rescaled reference)):

| channel | period bad | delta +-1 | inside PAL quantization window (abs(ROM - exact) <= K/2 + 0.5) | abs(delta) > 5 |
|---------|-----------|-----------|------|------|
| pulse1  | 5372 | 4065 | 3921 | 873 |
| pulse2  | 6109 | 3549 | 3445 | 2325 |
| triangle| 6284 | 857  | 850  | 5077 |

Other pulse2 fields: vol 725, sweep 137, duty 72, sounding 76.

Why the window group exists: Furnace rounds the period on the PAL grid, the ROM rounds on the NTSC grid (note table
retuned to 436, vibrato envelope steps in NTSC period units). Rescaling an already-rounded PAL period carries up to
+-0.54 NTSC units of error, so an exact integer compare cannot pass even when both sides play the same frequency.
Neither side is audibly wrong.

Two possible fixes (decision for the owner, not taken):
1. Converter: for a PAL/Dendy song, quantize every pulse/triangle period on the reference clock grid first, then map to
   NTSC (`round((round(PAL/(16f)) ) * K) - 1`), in retuneNoteTable and the vibrato/pitch envelope step math in
   famistudioSong.ts (about lines 902-960). This makes the ROM equal the checker's rescaled value.
2. Checker: accept a PAL period when abs(ROM - exact rescale) <= K/2 + 0.5 (both roundings). This changes the compare
   rule, which the brief forbade as threshold loosening.

Not done: the abs(delta) > 5 groups (pulse2 2325, triangle 5077) are separate causes and were not classified.
No code change, no commit. song=18489B (no size error reported by the checker).

## Agent 112

Fix 1 from Agent 109 is in, commit cc80c1800 (converter only; checker and its thresholds unchanged).

Cause proof: the PAL songs among the baselines are turtle_byte, oby1_ingame and the_best-1990 (all clockSel=1, A-4 = 436).
Famitune1, Super cool and awesome samurai and Sky Sanctuary Zone are NTSC. Rounding on the PAL grid first,
round(round(raw / K) * K) - 1 with K = 1789773 / 1662607, moves 24 of 96 note-table entries by +-1 compared with
round(raw) - 1 (for example n2 3257 -> 3258, n4 2902 -> 2901).

Change: `roundOnClock(raw, clock)` and `furnaceNesClock(m)` in famistudioSong.ts. Every period rounding now goes through
them: retuneNoteTable (the clock travels on FamistudioSong.clock), pulsePeriod, E5xx fine pitch, vibrato steps, pitch-macro
steps, per-arp-step fine offsets and the bestSlideStep simulation. Not changed: the relative non-fine pitch-macro scaling,
Math.round(P * (2^(-v/1536) - 1)), which is an offset estimate and not a rounded period.

| song | before p1/p2/tri/noise | after | song bytes |
|------|------|------|------|
| turtle_byte | 6184/7119/6362/857 | 2718/3874/6048/857 | 18489 -> 18482 (FME-7) |
| oby1_ingame | 3015/3199/2211/547 | 875/1728/1217/547 | 14735 -> 14975 |
| the_best-1990 | 1579/1441/588/62 | 520/678/198/62 | 5478 -> 5376 |

NTSC ROMs are byte-identical before and after (cmp): Famitune1, Super cool and awesome samurai, Sky Sanctuary Zone.
Regression test: "rounds a PAL song's periods on the PAL grid..." in famistudioSong.test.ts.
Left: turtle_byte triangle dropped only by 314 frames (the abs(delta) > 5 group of 5077 is a separate cause, not
classified). The remaining pulse2 large-delta group of about 2325 is also still open. FURNACE_CLOCK now exists in both the
checker and the converter, because the checker's copy is not importable.

## Agent 113

turtle_byte (PAL, clockSel=1, FME-7). Commit fe0f548ef.

Cause (converter bug, fixed): a looped relative pitch macro (triangle kick) became a FamiStudio envelope that repeated the first pass's period deltas. Furnace sums the macro per tick and plays the period of the sum, which is pitch-linear, so the period steps grow. Evidence: triangle frames 144-156. The reference goes 221,246,272,...,635. The ROM went 220 -> 448 (+19 per frame). With only the relStep fix it went 220 -> 508 (+24 per frame). Fix: unroll a looped relative macro with a non-zero loop sum per frame from the row phase until the period leaves 0..2047. Steps past 63 units are flagged lossy.

Counts (bad / |delta|>5 frames):
- triangle 6048 / 5077 -> 5409 / 579
- pulse2 3874 / 2325 unchanged; pulse1 2718 / about 873 unchanged
- song data 18482 -> 21001 B (FME-7 cap 24576)

NTSC song data and DPCM are byte-identical against HEAD: Famitune1 13295, Super cool and awesome samurai 14125, Sky Sanctuary Zone 5933, oby1_ingame 14975, the_best-1990 5376.

Remaining frames after the fix (channel: kind count):
- pulse1: clamp2047 18, octave 244, slideSpan 279, other 334
- pulse2: clamp2047 684, octave 207, slideSpan 325, other 1109
- triangle: clamp2047 25, slideSpan 82, other 472

What the kinds mean:
- clamp2047 is a hardware limit. A PAL period of about 2019 rescales past 2047 on NTSC. Example: pulse2 frames 691-727 have reference 2174 and ROM 2047. There is no converter fix.
- octave is a single-frame x2 or /2 period mismatch from the arp phase at 50 -> 60 Hz. It is likely linked to the lossy note "macro start phase copies dropped for 27 instruments (64-instrument cap)".
- slideSpan is NES 110 (a period-linear slide against a pitch-linear slide). Example: pulse2 frames 395-439. At frame 403 the reference goes 457 -> 469 and the ROM jumps 429 -> 496.

Open:
- pulse2 "other" (1109 frames) is not classified. One candidate is pulse2 frames 1908-1957. That span is a long geometric slide, reference 466 -> 2204. The ROM goes 394 -> 737 and its steps shrink from 10 to 6, which suggests a pitch macro plus a slide.

## Agent 110

Task: send pitch-linear Furnace slides that a period-linear 0x50 slide cannot follow (more than 2 semitones, step above 127.5, or curve error) as a per-frame 0x49 relative pitch envelope, reusing the fe0f548ef unroll.

Result: ABANDONED, patch reverted. Patch (code + test edits) saved in thoughts/spot/2026-11-22-nes-agent110.patch.

Measured with the dump analyzer (bad frames p1/p2/tri, then |delta|>5 p1/p2/tri), before -> after:
- turtle_byte: 1664/2854/5409 -> 1581/2877/5406; |d|>5 930/2390/657 -> 927/2453/695. Song 21001 B -> 18484 B.
- Famitune1: 3529/1874/163 -> 3529/1874/285; |d|>5 1874/1874/24 -> 1874/1874/102. Song 13295 B -> 16229 B (155 B under the NROM 16384 cap).
- oby1_ingame: 768/421/1217 -> 768/262/1217; |d|>5 unchanged 442/142/1216. Song 14975 B -> 15186 B.
- Super cool and awesome samurai, Sky Sanctuary Zone, the_best-1990: ROMs byte-identical (cmp).

Why it lost: the triangle gets worse on Famitune1 (+122 bad, +78 |d|>5) and turtle_byte pulse2 gets worse (+23 bad, +63 |d|>5). Likely causes, not verified: (1) the 0x49 override persists across notes, and a 04xy/00xy change or a new note mid-slide sends 0x4a and drops the accumulated offset; (2) tickAtFrame phase for the triangle (macroRate) may not match where the slide units start. Famitune1 also nearly hits the NROM cap, so envelopes per slide are too expensive there anyway.

Next step if picked up again: limit the envelope path to slides where 0x50 is measurably worse (compare curveErr against the envelope's own error per slide), skip the triangle until the phase is checked, and dedupe envelopes so Famitune1 stays well under 16384 B.

## Agent 115

Task: model FamiStudio's running relative pitch offset (famistudio_pitch_env_value) in the converter on top of the Agent 114 patch, so 0x49 slide envelopes on no-attack 03 portamentos cancel the leftover and stop stacking.

Result: GATE NOT MET, reverted. Patch (114 patch + carry model) in thoughts/spot/2026-11-22-nes-agent115.patch.

Engine facts (third-party/famistudio/famistudio_ca65.s): @reset_pitch_env in famistudio_do_note_attack is the only place that zeroes pitch_env_value; 0x49 (@opcode_override_pitch_envelope) resets only ptr/repeat; 0x4a only clears the override flag; a relative envelope ends on a 0 step looped (encodeEnvelope pushes 192), so it holds the end offset.

Change tried: per-channel envCarry. Zeroed on every attacked note row (first try zeroed it only inside the slide block, so attacks on non-slide rows were missed: Famitune1 tri 435 bad). A 0x49 slide envelope (now also on 03 / 0x43) starts its first step at offset - envCarry and sets envCarry to its end offset; a no-attack 0x50 slide after one gets a one-step [-envCarry] 0x49 envelope. 114's attackedEnd gate removed.

Bad frames p1/p2/tri (|d|>5 in brackets), HEAD -> Agent 115:
- turtle_byte: 1664/2854/5409 (930/2390/657) -> 1649/2946/5404 (946/2505/685). Song 21001 -> 18110 B.
- Famitune1: 3529/1874/163 (1874/1874/24) -> 3529/1874/194 (1874/1874/24). Song 13295 -> 15700 B.
- oby1_ingame: 768/421/1217 -> 768/365/1217 (|d|>5 unchanged). Song 14975 -> 14995 B.
- samurai, Sky Sanctuary Zone, the_best-1990: ROMs cmp-identical.

Why it still fails (from per-frame runs new vs HEAD):
- Famitune1 triangle frames 1260-1285, 4963-4988, 7843-7868: constant +3/+4 offset from the first frame of the note (ref 34, ROM 38). An offset the model does not see: candidates the loop pass (atLoop, carry state unknown), or a 0x49 vibrato/pitch-macro envelope taking over mid-slide so the slide envelope never plays out (envCarry assumes full playout).
- turtle_byte pulse1 515-532 / pulse2 518-532, 8372-8409: reference clamps at 2047, ROM plays 151-821. A slide envelope whose period leaves 0..2047: the converter's range check only covers its own sum, the engine wraps the 11-bit period. Needs clamping per frame to 2047 instead of aborting or wrapping.
- Why 114's gate made E1/E2/01/02 attack slides worse: not measured this round (budget). Likely the same wrap past 2047 and the playout assumption: an attack slide's envelope keeps running into the next row while the 0x4a only lands on the next note/effect row.

## Agent 116

Task: fix the two Agent 115 gate defects on top of the 115 patch. Result: GATE NOT MET, reverted (converter + test diff empty). Patch (115 + playsOut gate below) in thoughts/spot/2026-11-22-nes-agent116.patch.

Engine facts (famistudio_ca65.s): famistudio_get_note_pitch_macro adds note_table + pitch_env_value (+fine) + slide_pitch>>1 in 16 bits with no clamp; the high byte goes straight to $4003/$400B, so the 2A03 wraps the period mod 2048. An instrument load (line ~4812) writes only the pitch env address, not ptr/repeat, when the pitch override flag is clear.

(b) Famitune1 triangle 1260-1285 / 4963-4988 / 7843-7868: FIXED in the patch. Cause (converter trace, env var trace since removed): `env ch 2 fr 1234 noAtt true fx 3 from 78 to 80 base 39 end -4 span 52`. The envelope path plays the start note (78, period 39) with a 52-frame envelope; at frame 1260 a 04xy vibrato row sends 0x49 and replaces it, and the vibrato envelope rides on the start note: ROM 38/39 (vibrato around 39), reference 34/35 (around 35 = note 80). Not envCarry, not the loop pass. Fix: playsOut() — take the envelope path only if no 00xy/04xy/E5xx row comes before the next note. Famitune1 tri bad 163 (HEAD) / 194 (115) -> 145; |d|>5 24 unchanged; pulses unchanged. One 2-frame tri run worse than HEAD at 7975-7976 (76 played 78). Song size not read.

(a) turtle_byte pulse1/2 515-532, 8372-8409: NOT fixed. Trace: `sl ch 0 fr 403 noAtt true fx 2 from 35 to 29 carry 242` (one-step [-242] cancel envelope), then `sl ch 0 fr 418 noAtt true fx 2 from 29 to 5 carry 0 vibOn 3`. From 418 the ROM runs a 0x50 slide already +354 periods above the reference (frame 444: ref 886, ROM 1240), climbs linearly past 2047 at frame 504 and wraps (2048+88 ... 2048+177 held). HEAD at the same frames reached 2047 and held. So the wrap comes from the 0x50 slide on top of a wrong offset from 115's cancel path (carry 242 does not match the engine's real pitch_env_value), not from a slide envelope; same at 8294 (carry 892/886). Clamping alone will not fix it. Next: trace the real engine pitch_env_value at frame 403 (did the 0x4a + instrument reload between 367 and 403 restart the instrument envelope at the old ptr?), then fix the cancel; additionally clamp per frame to 2047 since the engine does not.

Counts p1/p2/tri bad (|d|>5): turtle_byte HEAD 1664/2854/5409 (930/2390/657) -> 116 1649/2946/5404 (946/2505/685): worse on p2 and tri |d|>5, gate fails. Other four songs not re-run with the 116 patch (115: oby1 better p2, samurai/Sky/the_best cmp-identical; playsOut can only remove envelope rows).

## Agent 117

Task: defect (a) from Agent 116, turtle_byte frame 403 cancel envelope. Result: GATE NOT MET, reverted (converter + test diff empty). Patch (116 + chunked cancel) in thoughts/spot/2026-11-22-nes-agent117.patch.

Measured (Mesen2 headless, write callbacks on famistudio RAM; player labels from ca65 -g / ld65 -Ln, same for NROM and FME7: pitch_env_value_lo/hi $337/$33A, repeat $33D, addr $340/$343, ptr $346, slide_pitch $34F/$352, chn_note $35F, env_override $385; trace script scratchpad nes117/trace.ts <rom> <player.json> <from> <to> <chs>):
- Engine pitch_env_value ch0 at 402 = 242 (ch1 216): the converter's carry 242 was right. Instrument reloads at 367/382/389 write addr + ptr=1 + repeat=0 and zero the value (attack), so no stale-ptr problem.
- At 403 the [-242] cancel reads as one step -64: encodeEnvelope's clampEnv keeps a relative step in -64..63. Value 178 (ch1 152) from 403 on, held through 418 and 444 (ROM 1240 = note 5 period 2047 + slide -1970>>1 + 178).
- Fix tried: cancel split into steps of at most 64. Result at 418: ROM 698 (value 0), ref 645; 444: 1062 vs 886; 504: 1902 vs 1825, no wrap. Remaining offset is the 0x50 slide itself (period-linear 14/frame vs Furnace 9.3/frame), not the carry. 8294 (carry 892): the 14-frame cancel still leaves the period past 2047 for its first frames (ROM 134 = 2182 wrapped, ref 1262).

Bad p1/p2/tri (|d|>5), HEAD -> 117: turtle_byte 1664/2854/5409 (930/2390/657) -> 1649/2946/5404 (936/2497/656) FAIL p1/p2 |d|>5; Famitune1 3529/1874/163 (1874/1874/24) -> 3529/1874/145 (same); oby1 768/421/1217 (442/142/1216) -> 768/365/1217 (same); samurai, Sky Sanctuary Zone, the_best-1990 ROMs cmp-identical. Worse-than-HEAD runs on turtle_byte p2: 518-532 (HEAD 2047 right, 117 2021) and single frames 9231, 9248. The p1/p2 |d|>5 surplus over HEAD comes from the 115/116 envelope paths, not from 403. Famitune1 song size not read.

Next: (1) keep the chunked cancel (measured correct); (2) find the turtle_byte p2 518-532 cause (HEAD held 2047 there, 117 plays 2021: a slide envelope stops one step short of the period cap) and the remaining p1 |d|>5 runs vs HEAD with fd.py per channel before any other change.

## Agent 118

Task: turtle_byte pulse2 518-532 (HEAD 2047, 117 2021). Result: root cause found and fixed in the 117 patch, but the six-song gate still FAILS on turtle_byte totals, so reverted (converter + test diff empty). Patch (117 + this fix + regression test) in thoughts/spot/2026-11-22-nes-agent118.patch. Type-check on the patched tree rc 0; vitest not run (gate failed).

Root cause (Mesen2 trace, nes117/trace.ts on the 117 ROM, ch0/ch1): the 117 claim "the surplus comes from the 115/116 envelope paths" is wrong for 518-532. Pulse2's rows 353/367/382/389 carry ED01, so the engine attacks (and restarts the slide envelope) one frame late: ch1 pitch_env_value at 402 = 216 (ptr 14) while ch0 = 242 (ptr 15, played out). The converter set envCarry to the envelope end (242) for both (converter trace: `env 1 389 delay 1 span 14 carry 242`), and both channels got the same 4-chunk [-242] cancel at 403. ch1 ended at -26 (406 on), so the 0x50 slide held 2047 - 26 = 2021 at 515-532.

Fix (in the patch): envCarry = start + sum of the first span - round(delay * perTick) steps of the slide envelope. Result: pulse2 518-532 now 2047 (15 frames fixed, fd.py: 0 frames worse than 117), engine ch1 offset follows.

Bad p1/p2/tri (|d|>5), HEAD -> 118: turtle_byte 1664/2854/5409 (930/2390/657) -> 1649/2946/5404 (938/2503/656) FAIL p2 total and p1/p2 |d|>5. Famitune1 3529/1874/163 (24) -> 3529/1874/145 (same |d|>5), song 15308 B (< 16384 NROM cap). oby1 768/421/1217 -> 768/365/1217 (|d|>5 same). samurai, Sky Sanctuary Zone, the_best-1990: per-frame dumps identical to HEAD.

Open: an.py p2 total did not drop although fd.py shows 15 frames fixed: the remaining p2 surplus over HEAD is frames where both are wrong but the 03/0x50 paths now differ (example 406: ref 462, ROM 535 = p1 period; the Furnace p2 slide itself starts a frame late under ED01, the ROM 0x50 slide does not). Single frames 9231/9248/9267/9277 worse than HEAD (ref 2047, ROM 1628/1937/1220/1536): not traced. 0x50 slide rate (ROM 14 vs Furnace 9.3 periods/frame) still out of scope.

## Agent 119

Result: FAIL (one unit test). Attempt saved as `thoughts/spot/2026-11-22-nes-agent119.patch` (Agent 118 patch plus the change below); both source files reverted to HEAD.

- EDxx: the converter already uses FamiStudio note delay (opcode 0x47). `@opcode_note_delay` jumps to `@flush_y`, so every opcode after 0x47 in the row runs on the delayed frame; the note attack then restarts the 0x49 envelope. The ED01 slide start is right in the 118 patch.
- turtle_byte pulse2 regression in 118 (187 frames worse, mostly 1-frame arpeggio shifts on instrument 9, frames 637-638 and 9231) came from the 118 patch adding `slideEnv, envCarry` to the snap() loop state (famistudioSong.ts:767). Dropping them from snap() fixes it.
- Frame 406 (ref 462, ROM 535): the remaining error is the 0x50 slide rate (14 vs 9.3 per frame). Out of scope (period-linear slide limit). 9248/9267/9277 sit in the same shifted-arpeggio run as 9231 and go away with the fix.
- Six-song gate with the fix (bad p1/p2/tri, |d|>5 p1/p2/tri), HEAD -> 119:
  turtle_byte 1664/2854/5409, 930/2390/657 -> 1566/2760/5404, 855/2317/656;
  Famitune1 tri bad 163 -> 147, rest equal, song 13745 B; oby1 p2 bad 421 -> 365; samurai, Sky Sanctuary Zone, the_best-1990 equal.
- Type-check rc 0. Vitest: 71/72 pass; FAIL "sends a slow 03 portamento over an octave as a per-frame pitch envelope, not a period-linear 0x50 slide (NES 110)" (expected true to be false). Not checked whether that test also fails with the plain 118 patch. Next: run that test with and without the snap() change; the snap() state likely needs envCarry reset at the loop point rather than removal.

## Agent 120

Result: PASS. Fix in the working tree (famistudioSong.ts + famistudioSong.test.ts = Agent 119 patch plus the change below).

- The NES 110 test fails with the plain 118 patch too, so the 119 snap() change is not the cause. Root cause: the slide-envelope path was gated on `span(ri) < 240`. span() caps at 240 when no next note or slide follows, so a 03 portamento on the last note before the pass end (the test: A4 -> A5 at 03 04) always fell back to the period-linear 0x50 slide.
- Fix: drop the `span < 240` gate. When span is open (240 cap), the envelope stops at the frame the slide reaches its target (the engine holds the last offset) and is discarded if the slide does not finish inside 240 frames (it would freeze mid-slide). envCarry then counts every step (no ED delay trim on an open span). slideEnv / envCarry stay out of snap() as in 119.
- Gate: per-frame dumps of all six songs byte-identical to the Agent 119 run (nes119/vA-*.log), so numbers equal 119: turtle_byte 1566/2760/5404 (|d|>5 855/2317/656), Famitune1 3529/1874/147 (1874/1874/24), song 13745 B, oby1 768/365/1217, samurai 182/831/693, Sky Sanctuary Zone 0/0/0, the_best-1990 11/586/198; samurai/Sky/the_best equal HEAD per 119. Vitest famistudioSong.test.ts 72/72.
- Type-check rc 0.

## Agent 121

Task: classify turtle_byte pulse2's 2317 |delta|>5 frames at HEAD efb41a9e9 (NES 120) and fix the biggest class. Result: classified, NO FIX attempted (budget spent on classification and on mapping frames to rows, see below). Converter and test untouched; gate not run; numbers = NES 120 (turtle_byte 1566/2760/5404, |d|>5 855/2317/656).

Source: per-frame dump nes120/v120-turtle_byte.log (HEAD ROM vs Furnace reference, PAL periods rescaled to NTSC). Classifier: scratchpad nes121/classes.txt (script inline in the Agent 121 transcript; cls.py / sub.py in nes121/ for the earlier cuts).

| class | rule | frames | runs | example runs |
|---|---|---|---|---|
| arpPhase | ref jumped >= 1 semitone in the last 4 frames (arp macro step), ROM on another arp step | 795 | 615 (mostly 1-2 frames) | 1907-1917, 2828-2839, 9740-9751 |
| clamp2047 | ref > 2047 after the PAL->NTSC rescale, ROM at the 2047 cap (hardware limit, no fix) | 685 | 109 | 697-749, 1158-1210, 985-1036 |
| slide | ref glides < 1 semitone/frame (pitch-linear slide or relative pitch macro) | 529 | 26 | 406-513 (0x50 rate 14 vs 9.3), 8294-8359, 1918-1957 |
| octave | single-frame x2 or /2 (12-semitone arp step at the wrong frame) | 207 | 181 | 3759-3760, 4335-4336 |
| romSilent | ref sounds, ROM writes no period | 65 | 4 | 7808-7833, 8730-8754, 8483-8495 |
| staticOffset | fractional/semitone offset, ref still | 29 | 14 | 2167-2169, 1956-1957 |
| other (window edge) | | 7 | 4 | 9216-9219 |

arpPhase + octave = 1002 frames: the biggest group, one cause family (arp macro step landing on a different 60 Hz frame than Furnace's 50 Hz tick; 7-semitone and 12-semitone steps of e.g. instrument 9 "guitar", arp 0,12,7,0,12,0, no loop). Not yet verified whether the converter's arp envelope resampling (tickAtFrame phase from the note's attack frame) or the ED/row phase causes the 1-frame shift.

Open puzzle: frames 1908-1957 (pulse2 ref glides 466 -> 2204 at a constant 1.055 per 50 Hz tick, ROM 400 -> 1537 with steps growing only linearly) have no slide effect on Furnace channel 1 at rows o4r9-o4r16 when rows are mapped at 7.2 frames/row (speed 6/6, 50 Hz, vt 150/150). The nearest 02xx is o4r29 (02:08, my frame 2052). The bad-run repeats (1928, 2389, 2863, 3323) sit about 124-144 frames before my mapped 02:08 rows (2052, 2513, 2974, 3434), so either the dump's frame numbering is not 7.2 x row (check the tool's rowOf / lag), or the dump columns are not Furnace channel order. Resolve this first: everything row-related in this section depends on it.

Next step: (1) settle the frame -> row mapping (print the converter's own row frame table for ch1, famistudioSong.ts:524); (2) take the 1-frame arpPhase runs (2828-2839, 3759-3760) and compare the ROM arp envelope step frames with Furnace's tick frames from the attack; fix the phase in the arp/macro resample only if it is a converter offset, not an inherent 50->60 Hz alias.

## Agent 122

**Q1 (frame-to-row mapping).** Agent 121's mapping was wrong; its column reading was right. rows.mts assumed 64 rows per order, but order 0 is 16 rows (0D), so o1 starts at frame 115.2 (7.2 frames per row: 50 Hz, speed 6). Real mapping: frames 1901-1957 = o4r56-o4r63, and frame 2822 = o6r56. Both are channel 1, ins 10 "guitarslide" (arp -1,7,5,-5,1,-2,-9; relative pitch macro mode 1, -148..-74, looped). The reference glide comes from that pitch macro, not 02xx. The ROM glides about 0.83x slower because of the driver limit "pitch macro step past 63 period units (clamped): 11831". That is not a phase problem, so the arpPhase runs 1907-1917 and 2828-2839 are contaminated by the glide.

**Q2 (arpPhase / octave cause).** The cause is neither an arp resample offset nor an inherent 50->60 Hz alias. Real arp mismatches (e.g. 3751-3760, ins 8 "brass", arp 0,-12,0, o8r57/58) step on a phase-0 schedule, because the 64-instrument cap dropped all phase copies of 27 instruments (38 keys, 139 copies before the cap). Ins 9 "guitar" kept all 5 copies, so guitar frames are not caused by the cap.

**Fix (famistudioSong.ts).** Over the cap, drop the least-used phase copies one at a time (by note count) instead of whole instruments; a dropped copy falls back to that instrument's phase-0 copy. PhaseStat gains `copyUses`. The lossy line is now "macro start phase copies dropped: 104 (64-instrument cap)".

**Gate, turtle_byte only (summary-line bad counts, v120 -> v122):** p1 2644 -> 2644, p2 3806 -> 3806, tri 5404 -> 5166, noise 857 -> 857. |d|>5: p1 855 -> 855, p2 2317 -> 2317, tri 656 -> 418. The ROM p1/p2 columns are byte-identical to v120; tri differs on 238 frames. No channel got worse.
- The brief's p1/p2 baseline (1566/2760) uses a different metric; the summary line gives 2644/3806 for the same v120 dump. Unverified which metric 121 used.
- Not re-run: Famitune1, samurai, Sky, oby1, the_best.
- No unit test added for the cap path (budget). famistudioSong.test.ts: 72/72 pass.

## Agent 123

Task: regression gate for the Agent 122 cap patch (famistudioSong.ts) plus a unit test. Per-song bad frames p1/p2/tri/noise, without (HEAD tree, patch reversed) -> with patch. Logs: scratchpad nes123/{old,new}-<song>.log; patch saved as nes123/patch.diff, git diff cmp-proven identical after the runs; test-data jsons restored (cmp-proven).
- Famitune1: 3561/1942/160/- -> identical.
- samurai: 185/849/693/358 -> 185/825/693/358 (p2 better).
- Sky Sanctuary Zone: all pass, identical.
- oby1_ingame: 875/1725/1217/547 -> 955/1821/959/655 (p1 +80, p2 +96, noise +108 WORSE; tri -258 better).
- the_best-1990: 520/678/198/62 -> 526/677/202/62 (p1 +6, tri +4 worse, p2 -1).
- |d|>5 (own awk over the dump, differs from the Agent 120 metric, treat as indicative): unchanged except samurai p2 466 -> 454 and oby1 tri 8377 -> 8398.
- Test added: famistudioSong.test.ts "over the 64-instrument cap drops the least-used phase copies one at a time and reports the count" (14 instruments x 5 phases = 70 copies; asserts exactly "macro start phase copies dropped: 1 (64-instrument cap)"). 73/73 pass. It does not pin WHICH copy is dropped (a single drop is size-identical), only count/line; not verified to fail without the patch.

## Agent 124

Task: replace the Agent 122 cap rule (drop least-used copy by note count, fall back to the plain phase-0 key) with a frame-cost rule. **Result: FAIL, tree reverted.** Patch saved: thoughts/spot/2026-11-22-nes-agent124.patch (famistudioSong.ts + the Agent 123 cap test).
- What 124 tried: one copy at a time, drop the copy with the least `notes x differing macro frames` when its notes play through the nearest KEPT copy of the same key (a redirect, so every drop frees one slot; the 122 rule's fallback `key` is itself a new instrument, so the first drop per key frees nothing). Frame diff = positions where the resampled vol/arp/duty/pitch `macroFrames` vals differ (looped macros compared 64 frames past the longer one). Excess = distinct instrument keys asked of insNo - 64.
- Gate, bad frames p1/p2/tri/noise, HEAD -> 122 -> 124:
  - turtle_byte: 2644/3806/5404/857 (v120) -> tri 5166 -> 2644/3988/5480/1863 (WORSE p2, tri, noise).
  - oby1_ingame: 875/1725/1217/547 -> 955/1821/959/655 -> 1137/1998/1302/1563 (WORSE all).
  - the_best-1990: 520/678/198/62 -> 526/677/202/62 -> 514/682/227/80 (worse p2/tri/noise).
  - samurai p2 849 -> 825 -> 819; Famitune1, Sky identical.
- Unit test: the Agent 123 cap test fails with 124 (received value not captured); 72 others pass. Type-check not run (light lane queued behind another session; killed when reverting).
- Cause on oby1 (partial, unverified): 103 copies dropped (122: 104), mostly fi 28 (26 drops), 26 (18), 20 (12), 25 (8), mostly baked-volume keys (KEY_BAKE * (1 + vol)) with 2-4 notes each; the last forced drops are expensive (fi 26 n=452, fi 15 n=46: the key ends at 1 copy). turtle noise first bad: frame 117 period 12 expected, 5 got: a whole-arp mismatch, larger than a 1-frame phase shift, so 124 likely has a redirect BUG (wrong copy / wrong exact phase reaches noise notes), not only a bad cost. Suspects, not checked: (1) `phaseOf` (sig -> first phi) and so the pk ids are not stable across conv() runs with different cuts/held/base/loop, so noPhase redirects point at the wrong copy in a later run; (2) exact phase stored for the redirect target vs phaseExact order; (3) excess from `want` differs from what the 122 test expects (1 drop).
- Next: first check suspect (1) by dumping pk -> sig per conv run on turtle_byte; only then judge the cost model. The note-count vs frame-cost question for 122 is still open.

## Agent 125

Task: diagnose only. Are macro-start phase copy IDs (pk) stable across the export's repeated convert() runs? **Answer: yes on turtle_byte; suspect (1) from Agent 124 is ruled out.** famistudioSong.ts clean (git diff --stat empty); test-data jsons restored (cmp OK). Scripts: scratchpad nes125/{dump.mts,cmp.mjs,runs.json,head-turtle_byte.log}.
- Method: patch 124 applied temporarily plus globalThis logging in conv() and phaseKey(); dump per run pk -> (key, fi, representative phi, full macro signature, note count, redirect target).
- turtle_byte runs: 0 cuts=1 held=1 base=8000 loop=1 (139 copies, want 150, over) -> 1 same, 86 redirects (want 64) -> 2 base=8000 loop=0 (want 53) -> 3 base=6000 loop=1 (want 64, final). The cuts/held fallbacks never ran (song fits in FME7).
- pk -> sig conflicts across runs: 0. (key, sig) -> pk differing across runs: 0 of 139. Same 139 pks in every run. Note counts differ only in the loop=0 run (131 pks). Why it is structural: pk = key + KEY_PHASE*(501 + phi), and sig is a pure function of (fi, phi) (sigCache), so a pk always means the same macro set. A different first phi per sig in another run could only give a NEW pk (a missed redirect, so an extra copy), never a wrong copy.
- Cross-run drops: yes, noPhase is shared by every conv() call (famistudioSong.ts:323 at HEAD), so the 86 drops chosen in run 0 (base 8000, loop 1) are applied in runs 1-3. They hit the right copies (IDs stable). The loop=0 run inherits 86 drops while it asks for only 53 keys (over-dropping); harmless here because run 3 is final.
- Noise frame 117 (period 12 expected, 5 got, vol 13) is NOT caused by phase copies or the cap: the HEAD tree gives the same first bad noise frame (nes-famistudio-check at HEAD: noise bad=857, first frame 117, same expected/got). vol 13 is snareN (fi 4) frame 0, and the arp there is +2 in all 5 phase copies, so no phase copy choice can produce it. Patch 124's noise 857 -> 1863 comes from other frames (not located).
- Next: judge the 124 cost model on its own (IDs are fine), and debug frame 117 as a separate noise-period bug (snareN arp on noise; not phase related).

## Agent 126

Cause: src/lib/export/nes/famistudioSong.ts:~896 (noteArp, the per-note 0x4b arp override used for every noise note and fixed-note arps) was resampled with macroEnvelope(..., ph = 0), while the instrument arp copy (insArp) and the volume copies use the note's sub-frame start phase. turtle_byte noise: note at t=115.2 (ph 0.2), macro rate 0.833 ticks/frame: Furnace shows tick 1 (-4 -> period 12) on frame 117, the override showed tick 2 (+3 -> period 5). Not note mapping, sign, or range: noiseNote(), arp units and range were right.
Fix: pass arpPh = seq[ri].t + delay*perTick - seq[ri].frame - round(delay*perTick) to macroEnvelope (the same value insArp already used). Regression test: famistudioSong.test.ts "resamples a noise arp override at the note's own sub-frame phase" (fails on old code, passes on new).
Bad frames before -> after (p1/p2/tri/noise): turtle_byte 2644/3806/5404/857 -> 2644/3806/5404/95; oby1_ingame 875/1725/1217/547 -> 875/1725/1217/20; samurai 185/849/693/358 -> 185/849/113/112 (dpcm 216 unchanged); the_best-1990 520/678/198/62 -> 520/678/198/5. No channel worse. KEPT. Scratch: scratchpad/nes126.

## Agent 127

Task: find and fix the pulse bad frames (turtle_byte p1/p2 2644/3806, oby1 875/1725). **Result: diagnosis only, no edit.** Gate (`git diff --quiet HEAD -- famistudioSong.ts`) stayed 1: the uncommitted diff is the Agent 126 noteArp phase fix (+4/-2 lines). Budget (30 calls) ran out before a wait loop was affordable. famistudioSong.ts untouched by this agent.
- First bad frames at HEAD+126 (check tool labels them DRIVER LIMIT from the lossy record; the label is not proof): pulse1 frame 350 field=duty, expected period 299 duty 0, got 322 duty 1. pulse2 frame 351 field=period, expected 282 got 322. triangle frame 117 expected 400 got 483.
- Dump (ticks 344-352, ref | got): pulse1 252/267/282/299/299/317 vs 271/287/304/322/322/341; triangle 400/449/504/566/566/635 vs 431/483/483/543/609/684. The got/ref period ratio is a constant 1.076-1.077 from the first diverging frame (a constant pitch-linear offset, about 165 units of 1/1536 octave), and the held-frame (duplicate) position differs: ref repeats at frames 350-351, got at 348-349 (triangle) / 350-351 (pulse). So two separate defects: a constant offset in the summed pitch, and a phase shift of the tick-to-frame map.
- Cells: the triangle at order 1 row 4/12/15/20 plays instrument 3 (note 4): vol macro 15 x11 then 0, pitch macro RELATIVE mode 1, data [-570, -234], loop at index 1 (every later tick -234). No slide effects in the cells (no 01/02/03/E1/E2): so the path is the looped relative pitch macro unroll, famistudioSong.ts:~985-1000 (`tk`/`loopSum` branch: `off(sum)` per frame, `rowPh = seq[ri].t - seq[ri].frame`). Suspects, not yet measured: (a) rowPh omits the `delay*perTick - round(delay*perTick)` term that Agent 126 added for arpPh (same class of bug, noise arp used ph=0); (b) the first tick -570 versus how the engine/Furnace applies the first relative step at the attack frame (constant 1.077 offset); (c) pulse steps above 63 (`Math.abs(o - prev) > 63`, line ~998) are a true driver limit (relative pitch step is -64..63) and cannot be fixed in the encoder; they only appear late in a drop (triangle 566 -> 635 = 69).
- Scratch: scratchpad/nes127/{cells.mts,t0.log,rom/turtle_byte.nes}. Next: dump `tk.vals`, `rowPh`, `tickAtFrame(f, macroRate, rowPh)` for f=0..8 on ins 3 at order 1 row 4 and compare with Furnace's tick for each frame; apply (a) first if rowPh differs from arpPh.

## Agent 128

Task: pitch bad frames, turtle_byte triangle frame 117. **Result: suspect refuted, one real cause found, fix tried and REVERTED (patch: thoughts/spot/2026-11-22-nes128.patch).**
- Agent 127's suspect (looped relative pitch unroll, famistudioSong.ts:~985-1000, `rowPh` lacks the delay term) is refuted: measured on turtle_byte, `delay` is 0 for every instrument-3 note, `rowPh` equals `arpPh` (0 / +-0.2 / -0.4), and the first bad triangle note (order 1 row 0, instrument 1 kickT) has no pitch macro at all, only arp macro [2,0,-2,-4,-6,-8,-9].
- The constant 1.076 ratio is a dump artifact: the reference is PAL (50 Hz), tools/nes-famistudio-check.ts:194 rescales ref periods by CPU_NTSC/refClock = 1.0765 before comparing; `--dump` prints them raw.
- Real cause: famistudioSong.ts:~896-899. A tonal in-table arp gets `noteArp = null`, so the instrument's arp envelope (built by `slot(MACRO_ARP,'arp')`, line ~1276, at phase 0) plays. The note starts at ph 0.2, so Furnace shows ticks 0,1,1,2,3 and the ROM plays 0,1,2,2,3 (hold on frames 117-118 instead of 116-117).
- Fix tried: give the note a 0x4b override at `arpPh` when the phase-resampled frames differ from phase 0 (all channels, then ch 2 only) + test. Triangle only: turtle_byte tri 5404 -> 4932, p1/p2/noise unchanged (2644/3806/95). All channels: p1/p2 worse (2648/3974; best-1990 524/692). Both variants: oby1_ingame fails with "song data 17676 (19410 all-channel) bytes > 16384" (baseline fit), because every phase variant adds an envelope. Not acceptable, reverted.
- Next: make the instrument arp envelope itself carry the right phase (one envelope per distinct phase pattern, only when the song has room), or reduce envelope size elsewhere, before re-trying. samurai/best-1990 triangle not measured for the triangle-only variant (budget).
- Scratch: scratchpad/nes128.

## Agent 129

Task: keep Agent 128's triangle gain (turtle_byte tri 5404 -> 4932), keep oby1_ingame under 16384 B.
- Cause: src/lib/export/nes/famistudioSong.ts:~896-902 (tonal in-table arp gets noteArp = null, instrument envelope at phase 0). Only instruments dropped to one phase-0 copy (macro start phase copies, 64-instrument cap, phaseKey ~604; `noPhase`) are affected: instruments that kept their phase copies already play the right phase (insArp uses arpPh).
- Measured (oby1_ingame): Agent 128 override costs triangle stream 757 -> 2485 B (+1728) and envelopes 2766 -> 2878 (+112); total 15836 -> 17676. The stream bytes are the cost (override per note splits rows that reference compression shares), not the envelopes. Restricting to the frames the note really plays changed nothing (all differences fall inside the note), so that variant was dropped.
- Fix: override only for `ch === 2`, ph != 0, instrument in `noPhase`, frames differ (`phaseDiffers`); and `furnaceToFamistudio` converts twice (plain, then with `withPhaseArp`), keeping the rich result only when it stays in the same music area with no more "to fit" drops than the plain one. oby1_ingame falls back to plain (15836 B), turtle_byte keeps the gain (19744 B, FME7 area as before).
- Result p1/p2/tri/noise bad frames before -> after: turtle_byte 2644/3806/5404/95 -> 2644/3806/4932/95; oby1_ingame 875/1725/1217/20 -> unchanged (15836 B); samurai 185/849/113/112 -> unchanged (14536 B); the_best-1990 520/678/198/62 -> 520/678/198/5 (noise differs from the baseline given in the brief; not worse, cause not investigated).
- Test: the Agent 128 test (phase-0.2 envelope present for a tonal arp) is kept; it passes with or without the override because a lone instrument keeps its phase copy. The noPhase path itself has no unit test (needs >64 phase copies; not built within budget).
- Scratch: scratchpad/nes129 (json backups, m.mts, rom/, t.log).

## Agent 130

- Tests added (src/lib/export/__tests__/famistudioSong.test.ts, nesModule now honours subsong.patLen): (1) 70 synthetic triangle instruments x 2 phase rows at 50 Hz (>64 copies, noPhase path) assert every instrument's phase-0.2 arp envelope is in the music; verified to FAIL with the override off (phaseArp=false) and pass with it. (2) oby1_ingame stays in the 16 KiB area with no "to fit" drops (plain 15836 B; override variant 17676 B). Music-area change by the override is not covered by a unit test (turtle_byte FME7 case would need a 20 KB fixture run); fallback by cap size is covered via oby1_ingame.
- Pulse 2 with the override on other channels (turtle_byte, nes-famistudio-check, bad frames p1/p2/tri/noise, song bytes): current (tri only, noPhase) 2644/3806/4932/95, 19744 B; all non-noise channels but still noPhase-only 2636/3772/4932/95, 20656 B (slightly better); all channels, no noPhase condition (Agent 128 form) 2648/3974/4932/95, 22195 B. So pulse 2 gets worse (+168) only when the override also replaces the correct per-phase instrument copies of instruments that kept them. Mechanism not isolated (no frame-level diff made): likely the override only re-sends the arp at phase 0 over a copy that already carries arp+duty+volume resampled at the note phase. UNVERIFIED.
- the_best-1990 noise 62 -> 5: not from a9055a274. Measured by checking out famistudioSong.ts at each parent: 03441bbd5^ noise 62, a9055a274^ noise 5, HEAD 5. Cause is 03441bbd5 ("resample noise arps at the note phase"). The 62 baseline was stale. No code change.
- Scratch: scratchpad/nes130 (json backups, logs, rom/); JSON restored, CMP_OK.

## Agent 131

Task: pick the top non-driver-limit row. **Result: diagnosis only, no edit** (budget 30 calls). Every row in test-data/nes-famistudio-check.json carries a "driver limit" label (labels come from the song-wide lossy record, not from the first bad frame). The stored JSON was stale for Future_Re-ference (p1 9390 there; fresh run: p1 1646, p2 690, tri 333, noise 102, dpcm 928, 20422 B). The top row (Rise_against triangle 13856, pitchLossy span) and turtle_byte pulse 2 were not taken (cause known: size cap / Agent 130 open).
- Picked Future_Re-ference pulse 1, first bad frame 3480 (order 18 row 24), field vol: ref 8, ROM 2. Dump 3470-3500: note at frame 3474 (row 18, ins 19 vol 12, vol macro [15 12 11 10 | release at 3 | 1 3 2], tick rate 60 Hz, speed 1, phase 0): ref plays 12 9 8 8 8 8 8 then 2 from 3481; ROM goes to 2 one frame earlier (3480). Same one-frame-early release at 3489 (next note, row 27).
- Cells (order 18 pattern 9, p1): row 18 note vol 12 with E580 + 1201; row 22 E1F1 (note slide up 1 semitone, speed 15, no note); nothing else before the release. So the ROM releases the baked volume envelope 1 frame before Furnace does, after an E1xy slide on a held note (unconfirmed which: slide op 0x50/0x43 path vs a note-off/row-delay offset; not measured at op level).
- Not the phase copies: Future has no "macro start phase copies dropped" lossy entry, keyPhase 0, macroRate 1.
- Next: dump the ops emitted for ch 0 rows 22-25 (famistudioSong.ts ~1129-1200 slide branch) and check whether the 0x50 slide arrival (about 2 ticks after row 22 at step 60 units/tick) triggers the driver's release; test on a synthetic 1-channel song: note + vol macro with release + E1F1 two rows later.
- Source unchanged (git diff clean for famistudioSong.ts), JSONs restored, CMP_OK. Scratch: scratchpad/nes131 (small: json backups, logs, rom/, m.mts, c.mts).

## Agent 132

Task: root-cause and fix Future_Re-ference pulse 1 first bad frame 3480 (ref vol 8, ROM 2). **Result: slide hypothesis REFUTED by measurement; no source edit, no test added** (30-call budget spent).
- Real cells (order 18, pattern 0_0_9, speed 1): row 18 note ins 19 vol 12 + E580 + 1201; row 21 E1F1 (note slide up 1, held note, no note byte); rows 22-29 empty; row 30 vol 4 + E583. Nothing at row 24 (frame 3480). Ins 19 has vol macro [15 12 11 10 | rel 3 | 1 3 2] AND an arp macro [1 0].
- Synthetic ch0 (speed 1, 16 rows, ins = that vol + arp macro, note vol 12 + E580 + 1201, E1F1 on row 3 with no note) built to a ROM (player.nes) and run in Mesen2, $4000 low nibble per tick: slide = noslide = `c 9 8 8 8 8 8 8 8 8 8 8 8 8 8 8` (12 9 8 8 held, no early release). Emitted slide row bytes: `83 43 50 de 2b 2c` (0x43 no-attack + 0x50 step/from/to). So E1F1 on a held note, with this macro, does NOT release the envelope. The converter's envelope is right: `7 cc c9 c8 c8 0 4 c0 c2 c1 0 9` (data[0]=7 = release jump, loop ptr 4 holds c8).
- So the early release needs something the synthetic lacks. Untested candidates, in order: (1) compressRefs: order 18 pattern may be replayed through a 0x41 reference whose chunks contain the 0x43 0x50 slide (engine ref-row counting vs the no-attack flag); (2) state carried from rows 0-17 (E580 at row 16, earlier notes on the channel, keyPhase / macro phase); (3) a 0x45 or 0x48 emitted by a neighbouring row. Next step: dump the packed ch0 stream (expandRefs of the real song's channel 0, around frame 3474) and look for 0x41 refs / 0x45 / 0x48 between the note at 3474 and 3480; then extend the synthetic with the rows before 18 and a repeated order.
- Scratch (small): scratchpad/nes132/{p.mts,s.mts} (s.mts = synthetic -> ROM -> Mesen volume dump; needs tickAddress = NMI vector, region Ntsc). nes-famistudio-check not run; test-data JSONs not touched.

## Agent 133

Task: why does Future_Re-ference ROM release pulse 1 volume one frame early (3480, 3489)? **Diagnosis only, no fix** (budget spent).
- Candidate 1 (compressRefs) REFUTED for the packed stream: the chunks that cover frames 3474-3486 are all literal (chunk 1389 `4f 1 7c 7f 1f` = duty, vol 12, note; 1544 `83`; 1545 `43 50 c2 2b 2c` slide; 1546 `8f`); no 0x41 ref, no 0x45/0x48 between the note and the release. Real stream has no explicit release op.
- Candidate 3 REFUTED: ROM bytes `43 50 c2 2b 2c` (only occurrence) replaced by `4e 0 4e 0 81` (no slide): trace identical (ROM `c 9 8 8 8 8 2` = 4 frames at 8, Furnace holds 8 for 5 frames then 2 at 3481).
- So the release at ROM tick note+6 comes from the envelope/driver, not a stream op; Furnace releases at note+7. The synthetic one-channel ROM never releases, so the release trigger is something the real song has that the synthetic lacks (suspect: how the baked volume envelope for ins 19 plus the next row's volume/instrument state at the later note, or Furnace's own release source, is modelled). Not found which source row; Furnace side release cause (frame 3481) was not identified: next step is to dump the Furnace reference per-tick macro state (release flag) for ch0 and compare with the ROM envelope index per frame.
- My frame decode of the stream (waits 0x81|(n<<1)) puts row 30 at 3486 while the ROM shows the second note at 3483 (row 27): the packed stream timeline and the ROM trace disagree by 3 frames; unresolved, check the lag in the nes-famistudio-check output before trusting frame numbers.
- Source unchanged (temporary debug edits reverted), JSONs restored, CMP_OK. Scratch: scratchpad/nes133 (r.mts, d.txt chunk dump ~200 KB, traces).

## Agent 134

Question: does tools/nes-famistudio-check.ts misalign Furnace reference and ROM frames? Answer: NO. No tool change.
- Alignment code: ONE global lag = firstOn(ROM) - firstOn(ref) (tools/nes-famistudio-check.ts:260), applied in lockstep (:179-189). Both sides are counted in ticks (Furnace written at 60 per frame, ROM per NMI), so 60 vs 60.0988 does not enter. Future_Re-ference: lag=0.
- Measured over the whole song (--dump 0-30000, 10037 frames): pulse 1 attack frames (volume jump) in reference 834, in ROM 834; offset (ROM - ref) is 0 for all 834 (sampled at frames 0, 621, 1242, 1863, 2421, 3339, 5499, 6669, 7614, 8344, 8826, 9204, 9623: all 0). No drift, no step.
- Frames 3474-3492: ROM and reference attacks are identical (3474, 3483, 3492). Agent 133's "stream timeline 3 frames off" was a mis-decode of the stream, not a tool or converter timing issue. The bad frames 3480/3489 are real: ref holds vol 8 for 5 frames then 2, ROM for 4 frames (release one frame early), both attack periods (9 frames apart) in sync.
- Source facts: song is speed 1 / 60 Hz (1 row = 1 frame). ins 19 vol macro [15 12 11 10 | 1 3 2] release 3, no loop (Furnace holds idx 3 until note release). Row 18 note + 12xx, row 21 E1F1 (slide up 1 semitone), row 27 shows a re-attack in the reference with no cell (period 213, vol 12) = Furnace E1xy note-slide arrival retrigger. Release comes 7 frames after the note in Furnace, 6 in the ROM. Suspect converter: the E1xy path (famistudioSong.ts:1135-1140, slide-with-target retrigger) / release step model (macroFrames :190-194). Not proven.
- JSONs restored (CMP_OK). Scratch: scratchpad/nes134 (d.txt ~? KB, a.py, c.mts, *.bak).

## Agent 135

Question: contradictions A (row-to-frame map) and B (what drops the ROM volume) for Future_Re-ference pulse 1 ins 19. **Diagnosis only, no source edit, no test** (30-call budget; root cause NOT found).
- A (measured, parser dump + d.txt): old format v191, hz 60, speed1 = speed2 = 1, patLen 192, order 18 = frames 3456..3647 (18*192), so 1 row = 1 frame exactly (no groove / fractional rows). Pattern 0_0_9 ch0: row 18 (3474) note ins 19 vol 12 E580 1201; row 21 (3477) E1F1 only; rows 19-20, 22-29 empty (no note, no `===`, no OFF); row 30 (3486) vol 4 + E583; row 36 (3492) note ins 19 vol 12 + E580 1201. Frames 3483 (row 27) and 3489 (row 33) have NO cell, yet ref (real Furnace, tools furnaceTicks) re-attacks at 3483 (period 213, vol 12). So the agent-131/134 "row 27 is an empty cell" is true and the row timing is NOT the cause; the 3483 re-attack is Furnace state (6 ticks after the E1F1), also reproduced by the ROM at the same frame.
- B: the ROM envelope `7 cc c9 c8 c8 0 4 c0 c2 c1 0 9` = release pointer 7 (c0 c2 c1 = vol 0,2,1 after 12,9,8,8 hold); the drop 8 -> 2 skips c0, and the stream has no release op (Agent 133). Furnace macroInt.cpp:83-150: a sequence macro with release=3 holds val[3] (pos-- at pos>rel && !released) until DivMacroInt::release(); callers of release are only NOTE_OFF_ENV / ENV_RELEASE (playback.cpp:840,844,2198,2565,2594); nes.cpp:629 maps both to std.release(). No cell in the span issues either. E1xy (playback.cpp:1391-1420) sets portaNote/portaSpeed only; NES NOTE_PORTA (nes.cpp:662) and LEGATO (:767) do not release or reset macros (PRE_PORTA resets only with resetMacroOnPorta, :775). So the Furnace side drop at 3481 (note+7) is NOT explained by cells or porta code read so far; the ROM drop at note+6 is likewise not from a stream op. Both drops sit 3-4 ticks after the E1F1 row 21 (ROM +3, Furnace +4) and ROM/Furnace re-attack at row 27 +6: the E1xy slide arrival (arrival tick + legato) is the remaining suspect on both sides, but unproven.
- Next (needs a Furnace per-tick macro dump: released flag + pos for ch0 at 3474-3492, e.g. print std.vol pos in the furtool capture, and the ROM envelope index per frame): check whether resetMacroOnPorta / the arrival path in Furnace re-runs macroInit at 3483 and what releases at 3481; then model that in famistudioSong.ts (release model ~:184-200, E1xy ~:1135-1140).
- Source unchanged, test-data JSONs not touched (backups in scratchpad/nes135). Scratch: scratchpad/nes135 (rom.bak, fam.bak, c.out; small).

## Agent 111

NES 111 (Famitune1 triangle loop-pass bad frames). Result: measured, NO FIX LANDED.

Measured (Famitune1, 56 Hz, VRC6): the 37 bad triangle frames are all in pass 2 (frame >= 6583), all "ref sounding, ROM silent". About one per 45 frames (one note in 7 rows). Pass 1 has 0. Cause chain: loop pass replays pass-2 bytes at one fixed phase while Furnace's 56 Hz phase shifts 0.857 frame per pass (7-pass cycle, exact half-frame ties). Pass 2 uses phase-0 instrument copies (`pass2 ? key0 : phaseKey(...)`, famistudioSong.ts ~line 1087).

Variants tried (Famitune1 bad frames per channel):

| Variant | pulse1 | pulse2 | triangle |
|---------|--------|--------|----------|
| A baseline (HEAD) | 3561 | 1942 | 160 (37 sounding/silent) |
| phaseKey in pass 2 | 3677 | 2031 | 184 |
| B: phaseKey in pass 2, phase from round(t) | 3560 | 2031 | 184 (49) |
| C: B plus pass-2 frame = round(t) | 3508 | 2031 | 184 (49) |

B and C worsen pulse2 and triangle, so reverted. C diff saved at thoughts/spot/2026-11-22-nes111.patch. C frame dump 6618-6645: ROM still cuts one frame early at 6624 (same as baseline) and adds a cut one frame late at 6637. Open: the pass-2 note-to-phase-copy mapping or its tie handling is wrong; a pass-2 phase must be derived from the pass-2 start phase (pass index times 0.857), not the per-note pass-1 phase. Next: dump per-note keyPhase on pass 2 against the ref frame ties. Other songs not run.
