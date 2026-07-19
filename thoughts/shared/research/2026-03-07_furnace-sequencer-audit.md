---
date: 2026-03-07
topic: furnace-wasm-sequencer-deep-audit
tags: [furnace, wasm, sequencer, audit]
status: implemented
---

# Furnace WASM Sequencer Deep Audit

All issues from 5 audit rounds have been fixed and verified. Audit #5 found zero issues.

## Audit #1: 20 issues (ALL FIXED)

### HIGH (1-5)
1. Surround panning wrong command format
2. YM2203/YM2608 missing AY post-effects 0x20-0x2f
3. C64/SID2 PRE_NOTE fires unconditionally without porta/legato/EDxx check
4. C64/SID2 PRE_NOTE missing +addition for EDxx delay
5. Initial groove patterns len>2 truncated to 2 speeds

### MEDIUM (6-15)
6. dispatch->tick(false) should be tick(true)
7. prevSpeed not updated in broken speed sel path
8. repeatPattern priority over shallStopSched
9. Missing getLegacyAlwaysSetVolume() check
10. Missing HINT_PORTA in note-off stopOnOff
11. Missing HINT_PORTA in note-cut stopOnOff + missing scheduledSlideReset
12. Non-EXT YM2610_FULL/YM2610B/YM2612_DUALPCM missing from FM effect switch
13. 0x0f speed effect checks !useGroove instead of numGrooves==0
14. Missing tempoAccum overflow guard
15. YM2608 missing ADPCMA_GLOBAL_VOLUME 0x1f post-effect

### LOW (16-20)
16. OPL/OPLL drum variants missing (0x18 drum mode toggle)
17. YM2151/ARCADE and OPZ no effect handlers
18. Loop reset doesn't replay from beginning
19. Dead groovePos field
20. ESFM, VRC7, QSound, N163, FDS, SCC chip effects not implemented

## Audit #2: 9 issues (ALL FIXED)

1. Portamento 0x03 wrong if/else-if/else control flow
2. Portamento 0x06 same control flow bug
3. E1E2 shorthand porta unconditional portaNote update
4. Note cut/off/release keyOffAffectsPorta scope
5. OPZ missing FMS2 (0x64) and AMS2 (0x65) effects
6. Volume slide dispatch order wrong
7. Missing keyHit flag
8. Missing midiAftertouch flag
9. Compat flags verified complete

## Audit #3: 4 issues (ALL FIXED)

1. Wrong keyHit on instrument+porta change — removed
2. Duplicate HINT_PORTA for effect 0x06 — removed trailing duplicate
3. Missing getPortaFloor bounds check — added chanChipId!=0 guard
4. SID2 missing effect handlers — added full post-effect map

## Audit #4: 2 issues (ALL FIXED)

1. **Double PRE_NOTE for C64/SID2** — WASM dispatched PRE_NOTE immediately in note-on block (line 2087) AND via post-row scheduling. Reference only uses post-row scheduling (playback.cpp:1944). Removed the extra immediate dispatch to match reference.

2. **HINT_PORTA dispatch order when porta target reached** — WASM sent HINT_PORTA after LEGATO/HINT_LEGATO/state changes. Reference sends HINT_PORTA immediately after portaSpeed=0, before state changes (playback.cpp:2442). Reordered to match.

### Audit #4 verified clean:
- Delay/cut/legato processing: all matching
- Arpeggio tick processing: all matching (all 4 arp compat flags correct)
- Vibrato tick processing: all matching (all 11 waveform shapes correct)
- Order jump/loop logic: all matching
- Instrument change logic: all matching
- Virtual tempo accumulator: all matching
- Speed/groove cycling: all matching

## Audit #5: 0 issues (CLEAN)

Deep verification of DIV_CMD enum alignment, all chip effect handlers, serializer bridge, and pre-effect handlers.

### DIV_CMD Enum Verification
Every explicitly assigned enum value in FurnaceSequencer.cpp was compared against the reference dispatch.h auto-incrementing enum. **All values match exactly.** The WASM enum omits ~77 commands for unimplemented chip handlers (X1_010, WonderSwan, Sound Unit, ES5506, PowerNoise, Dave, MinMod, Bifurcator, MultiPCM, SID3) — these are never dispatched, so their absence causes no misalignment. The WASM uses explicit integer assignments (not auto-increment), making it immune to insertion-order drift.

### Verified areas:
- FM chip effects (6 families: Genesis/YM2612, YM2203, YM2608, YM2610, OPL/OPLL, OPZ): ALL CORRECT
- Console/PSG chip effects (15 chips: SMS, GB, NES, PCE, C64, SID2, AY variants, SNES, N163, FDS, QSound, ESFM, SAA, Lynx, Amiga): ALL CORRECT
- Serializer bridge (compat flags, note conversion, effect columns, groove upload, chip type mapping): ALL CORRECT
- Pre-effect handlers (all chip-specific pre-effect routing): ALL CORRECT
- DIV_CMD enum values (all ~90 dispatched commands): ALL MATCH reference dispatch.h

## Chip Dispatch Audit

All 143 Furnace platforms compile 1:1 into WASM. 50 chips have per-system effect handlers in the sequencer. 10 high-priority chips spot-checked (Genesis, SMS, GB, NES, PCE, C64, AY, OPN2, OPLL, OPL) — all verified correct.
