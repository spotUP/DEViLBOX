---
date: 2026-11-02
status: P1-P3 done, tests pass, type-check checked
---
# N16 P1-P3 result

Files changed: src/lib/import/formats/sidTraceDecode.ts (new, pure decode, MagPlaySID attribution in header: Music.cs NoteTable/Tuning, SidTranscriber.cs GridFitting/BestPhase), src/lib/import/formats/SIDParser.ts (captures per-voice freq/pulse/control/AD/SR + filter regs per frame; gate notes, inferred instruments, fitted grid; detectSpeed and framesToRows removed), src/lib/import/formats/SIDPatternCache.ts (cache v3, stores instruments), src/lib/import/__tests__/sidTraceDecodesNotes.test.ts (new).

- P1: one C64SID instrument (furnace.c64 config: waveforms, ADSR, pulse, ring/sync, filter route/mode/resonance/cutoff) per distinct signature (AD, SR, wave program, ring/sync, pulse static-or-moving, filter); coarsened if over 63. Names "Instrument N". Falls back to the 3 voice instruments if no notes.
- P2: gate rise to gate fall note; pitch from first settled frame, snapped with recovered tuning (circular mean of held freqs). Note-off skipped when next gate rise is within 2 frames (hard restart).
- P3: longest row length 2..16 putting 90% of starts on a row (+-1 frame from 4 up), origin phase. Funk tempo and shifting grids NOT ported.

Test: sidTraceDecodesNotes.test.ts on public/data/songs/sid/abaddon-starfish-test.sid via parseSIDFile. Before (old parser, run once): 3 instruments, 3965 note cells, speed 2, 39 patterns; test fails (instrument-name assertion). After: 32 instruments, 2020 note starts, speed 6, 15 patterns. SIDParser.test and sidSongHasEveryChipsVoices still pass (7 of 7).

Left: funk/shifting grid; pulse/filter/wave programs are summarised, not stored as tables (the instrument is a static C64 config, so playback still comes from c64SidFileData); P4-P6 untouched; only one real traced SID in the repo (starfish) is tested; effects (arpeggio/slide) not inferred. Scratch: MagPlaySID clone 2.7 MB left in scratchpad/magplaysid.
