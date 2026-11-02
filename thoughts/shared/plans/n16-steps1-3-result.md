# N16 steps 1-3 result

Design: `thoughts/shared/plans/n16-editing-design.md`. Nothing committed.

## Files

- `src/lib/import/formats/SIDParser.ts` (edited): exported `SidTrace` and pure `traceSid(buffer)`. `runSIDEmulation` now also returns the raw 32-byte register image of every chip per frame (`chipRegs`). `parseSIDFile` goes through `traceSid`.
- `src/lib/import/formats/sidTraceToGoatTracker.ts` (new): trace to `GTSongData` (notes, per-note or shared wave and pulse programs, one global filter program, key-off rows, tempo command, 32-row patterns, orderlists).
- `src/lib/import/formats/sidTraceScore.ts` (new): headless GTUltra replay (`createHeadlessGT`, `scoreSidTrace`), score per register class, exact and plus/minus 1 frame, best global lag in -3..3 reported.
- `src/lib/import/__tests__/sidTraceToGoatTracker.test.ts` (new): synthetic arpeggio and pulse sweep, `parseGoatTrackerSng(writeGoatTrackerSng(song))` round trip, real eco-fog conversion.
- `src/lib/import/__tests__/sidTraceScore.test.ts` (new): scores all 11 tunes over the first 3000 frames; asserts the GT core produced the frames (sentinel) and changes > 0. No score threshold.

Searched and reused: `runSIDEmulation` and `Cpu6502` (SIDParser), `sidTraceDecode.ts` (`segmentNotes`, `inferInstruments`, `fitGrid`, `rowOfFrame`), `GoatTrackerSid.ts` (`GTSongData`, parse/write, constants), `src/test/wasm/webBundle.ts` and `gtultraRendersCorpus.test.ts` (headless GT loader), `gplay.c` and `GTUltraBridge.cpp` (`gt_get_sid_registers`).

## Results

- `npm run type-check`: 0 errors.
- vitest, `sidTraceDecodesNotes` + `sidTraceToGoatTracker` + `sidTraceScore`: 14 of 14 pass (the 15-test first run had 8 failures, fixed below).
- Fixes made while running: (1) filter program could exceed the 255-row table; limit lowered. (2) program length cap was overridden by the gate-fall extension, so long notes overflowed the wave table; the cap is now strict and a gate fall beyond it is a key-off (0xBE) pattern row. (3) sentinel assertion compared against frames without the frame offset.

## Score table (first 3000 frames, share of register-value changes reproduced; exact / plus-minus 1 frame)

Columns: rows per frame (fpr), frame offset, notes, instruments, program frames, total exact, total tolerant, lag, changes.

| tune | fpr | off | notes | ins | prog | exact | tol | lag | changes |
|---|---|---|---|---|---|---|---|---|---|
| abaddon-starfish-test | 6 | 10 | 5782 | 32 | 16 | 0.165 | 0.185 | 0 | 26719 |
| bax-hc-dmc4 | 16 | 1 | 867 | 6 | 64 | 0.087 | 0.143 | 3 | 20607 |
| cmp-dns-jchnewplayer20 | 10 | 84 | 927 | 12 | 32 | 0.143 | 0.197 | -2 | 8146 |
| eco-fog-goattracker2 | 6 | 6 | 2152 | 41 | 16 | 0.128 | 0.135 | 1 | 13597 |
| galway-wizball | 16 | 0 | 1 | 1 | 64 | 0.151 | 0.416 | 3 | 917 |
| hubbard-commando | 6 | 0 | 4100 | 9 | 64 | 0.172 | 0.187 | 0 | 20186 |
| jch-awry-sidfactory2 | 8 | 4 | 2875 | 15 | 64 | 0.190 | 0.291 | 3 | 19551 |
| jch-tyne-cheesecutter2 | 6 | 34 | 1801 | 22 | 64 | 0.180 | 0.193 | 0 | 19686 |
| lees-last-ninja | 7 | 1 | 4 | 3 | 64 | 0.080 | 0.081 | 3 | 16898 |
| proton-cybernoid-goattracker2 | 6 | 7 | 4365 | 26 | 64 | 0.211 | 0.231 | 0 | 19745 |
| tel-cybernoid-futurecomposer | 6 | 0 | 4354 | 9 | 64 | 0.209 | 0.279 | 0 | 24539 |

Per class, exact / tolerant:

| tune | freq | pulse | control | adsr | filter |
|---|---|---|---|---|---|
| abaddon-starfish-test | .027/.033 | .200/.235 | .357/.387 | .208/.213 | 0/.500 |
| bax-hc-dmc4 | .005/.005 | .092/.211 | .051/.051 | .312/.312 | .037/.037 |
| cmp-dns-jchnewplayer20 | .049/.053 | .244/.344 | .175/.268 | .282/.282 | .029/.029 |
| eco-fog-goattracker2 | .191/.192 | .070/.084 | .138/.140 | .180/.180 | .025/.025 |
| galway-wizball | .075/.075 | .193/.370 | 0/0 | 0/0 | .128/.477 |
| hubbard-commando | .128/.143 | .109/.136 | .386/.386 | .306/.306 | 0/0 (1 change) |
| jch-awry-sidfactory2 | .181/.220 | .077/.251 | .311/.495 | .305/.305 | none |
| jch-tyne-cheesecutter2 | .041/.043 | .197/.217 | .261/.277 | .422/.422 | .001/.001 |
| lees-last-ninja | .048/.048 | .091/.092 | .046/.046 | .190/.190 | .141/.142 |
| proton-cybernoid-goattracker2 | .187/.209 | .120/.163 | .444/.453 | .412/.412 | .001/.001 |
| tel-cybernoid-futurecomposer | .084/.169 | .306/.396 | .458/.471 | .426/.426 | .004/.017 |

The two required GT2 tunes: eco-fog 12.8 percent exact (13.5 tolerant), proton-cybernoid 21.1 percent (23.1 tolerant). No threshold was applied; these are the measured numbers. The score is low everywhere: the current builder reproduces the note skeleton, not the register stream.

## Misses by tune (what the builder does not reproduce)

Evidence: `warnings` and `firstMisses` per tune in the test output; causes below are inferred from the builder's documented limits and from the register class that misses, not yet confirmed per frame.

- All tunes: freq is the largest miss class (3 to 19 percent hit). Vibrato, pitch slides and portamento between semitones are not expressed; wave rows only carry whole-semitone upward offsets.
- Every tune with more than 63 distinct per-note programs (9 of 11) fell back to one shared program per inferred instrument and a program length of 16 to 64 frames. Per-note detail (pulse sweeps, per-note arpeggio) is lost there. Only galway-wizball and lees-last-ninja stay unshared.
- eco-fog, proton-cybernoid, cmp-dns, jch-awry, jch-tyne: "filter used but no note starts it": filter program dropped, so filter changes are missed entirely (filter 0 to 3 percent). The filter owner must be a routed note within 8 frames of the first filter frame.
- bax-hc-dmc4: freq 0.5 percent, control 5 percent: 16 frames per row grid with 867 notes; lag 3 suggests the tempo or first-row timing is off by a few frames.
- jch-tyne-cheesecutter2: "pattern limit reached: song truncated" in the first 3000 frames window, so later frames cannot match.
- lees-last-ninja and galway-wizball: only 4 and 1 notes segmented; the tunes are digi or register-driven (sample playback through volume or control), so a note model does not describe them. adsr and control at 0.
- Intra-note AD/SR and master-volume changes are not expressed (adsr stays near 20 to 40 percent everywhere).
- Chips beyond the first: no filter program; hubbard-commando and others use one chip only here, no multi-SID tune in the set was checked separately.
- Tunes with under 3 frames per row would clamp to 3; none of the 11 hit that.

## Open problems

- Timing semantics of GT were not verified one row at a time: one wave or pulse row per frame, set row consuming one frame, gatetimer 0x40 as "no hard restart". Lag of 3 on four tunes (bax, galway, lees, awry) is the cap of the searched range, so the true offset may be larger: widen the search or fix the first-row alignment.
- Scoring uses the first 3000 frames only (about 60 s PAL).
- Raw override track (D5) and export (D4) not in scope.

## Scratch

No large scratch files created; nothing to delete. Logs in the session scratchpad: `n16-test.log`, `n16-tsc.log`, `n16-scores.jsonl` (small).
