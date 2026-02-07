# Macro System Test Status

**Date:** 2026-02-07
**Task:** Test macro system across all chip types
**Reference:** FURNACE_COMPATIBILITY_PLAN.md shows macro system is 100% complete

---

## 📋 Overview

The Furnace macro system is fully implemented in DEViLBOX with support for:
- **Global macros**: Volume, Arpeggio, Duty, Wavetable, Pitch, Panning, Phase Reset
- **FM-specific macros**: Algorithm, Feedback, FMS, AMS
- **FM operator macros**: TL, MULT, AR, DR, SL, RR, DT, SSG (4 operators × 8 params)

This document tracks testing status across chip families.

---

## 🎯 Test Methodology

### Test Resources
- **452 Furnace demo files** available in `/public/data/songs/furnace/`
- Organized by chip family: genesis/, nes/, gameboy/, opl/, opm/, c64/, etc.
- Each file contains authentic macro usage patterns from Furnace tracker

### Testing Approach
1. **Load Furnace files** with macro data via Import dialog
2. **Verify macro parsing** - Check that macros are loaded correctly
3. **Play patterns** - Listen for correct macro playback behavior
4. **Visual inspection** - Check Macro Editor displays correct data
5. **Export/Import roundtrip** - Verify macros survive FUR export → import cycle

### Success Criteria
✅ **Parsing**: Macro data loads without errors
✅ **Playback**: Audible macro effects (volume envelopes, arpeggios, pitch bends)
✅ **UI**: MacroEditor shows correct macro curves
✅ **Persistence**: Roundtrip export/import preserves macro data

---

## 🧪 Test Results by Chip Family

### 1. FM Chips (OPN2, OPM, OPL3, OPLL)

**Test Files Available:**
- `genesis/` - 31+ Genesis/OPN2 files
- `opm/` - 7 YM2151 files
- `opl/` - 22 OPL2/OPL3 files
- `pc98/` - PC-98 OPNA files

**Macro Types to Test:**
- ✅ Volume envelope
- ✅ Arpeggio sequences
- ✅ Algorithm switching (FM)
- ✅ Feedback modulation (FM)
- ✅ Operator TL/AR/DR macros
- ✅ Pitch bend

**Test Steps:**
1. Load `genesis/` demo files
2. Open instrument in MacroEditor
3. Verify FM operator macros display
4. Play pattern - listen for authentic FM sounds
5. Export as .fur → re-import → verify macros intact

**Status:** ⏳ **PENDING**

---

### 2. PSG Chips (SN76489, AY-3-8910)

**Test Files Available:**
- `genesis/` - Genesis PSG channels
- `ay8910/` - 11 AY-3-8910 files
- `msx/` - 14 MSX files (AY-8910)

**Macro Types to Test:**
- ✅ Volume envelope
- ✅ Duty cycle (noise mode)
- ✅ Arpeggio
- ✅ Panning

**Status:** ⏳ **PENDING**

---

### 3. Nintendo Chips (NES, Game Boy)

**Test Files Available:**
- `nes/` - 23 NES APU files
- `gameboy/` - 15 Game Boy files

**Macro Types to Test:**
- ✅ Volume envelope (important for NES/GB!)
- ✅ Duty cycle (pulse width)
- ✅ Arpeggio
- ✅ Pitch sweep
- ✅ Wavetable select (GB wave channel)

**Test Steps:**
1. Load `nes/` files - NES relies heavily on volume macros for amplitude modulation
2. Load `gameboy/` files - GB uses duty macros and wavetable switching
3. Listen for authentic NES/GB envelope behavior
4. Verify wave channel changes wavetables correctly

**Status:** ⏳ **PENDING**

---

### 4. Wavetable Chips (PCE, SCC)

**Test Files Available:**
- `misc/` contains various wavetable chip demos

**Macro Types to Test:**
- ✅ Volume envelope
- ✅ Wavetable index switching
- ✅ Pitch modulation

**Status:** ⏳ **PENDING**

---

### 5. Commodore (C64 SID)

**Test Files Available:**
- `c64/` - 10 C64 SID files

**Macro Types to Test:**
- ✅ Volume envelope
- ✅ Duty cycle (pulse width)
- ✅ Arpeggio
- ✅ Filter cutoff (if exposed via macros)

**Status:** ⏳ **PENDING**

---

### 6. Arcade Chips

**Test Files Available:**
- `arcade/` - 33 arcade chip files

**Status:** ⏳ **PENDING**

---

## 🐛 Known Issues

*None reported yet - will be updated during testing*

---

## 🔍 Manual Test Procedures

### Quick Macro Test (5 minutes)

1. **Open DEViLBOX** in browser
2. **Load Furnace demo:**
   - Click Import → Browse
   - Navigate to `public/data/songs/furnace/genesis/`
   - Load any .fur file (e.g., Genesis demo)
3. **Inspect instrument:**
   - Open Instrument panel
   - Click instrument used in pattern
   - Open Macro Editor tab
   - Verify macro curves display (volume, arpeggio, etc.)
4. **Play pattern:**
   - Press Space to play
   - Listen for volume envelopes, arpeggios, pitch changes
5. **Verify behavior:**
   - Volume should fade/pulse if volume macro is used
   - Arpeggios should play note sequences
   - Pitch should bend smoothly

### Comprehensive Test (30 minutes)

1. **Test each chip family:**
   - Genesis/OPN2 (FM operators)
   - NES (volume envelopes critical)
   - Game Boy (duty + wavetable)
   - C64 (pulse width modulation)
   - OPL3 (FM algorithms)

2. **Export/Import roundtrip:**
   - Load Furnace file with macros
   - Export as .fur
   - Clear project
   - Re-import exported .fur
   - Verify macros still work

3. **Visual inspection:**
   - Check MacroEditor displays correct curves
   - Verify loop points marked correctly
   - Check release points

---

## 📊 Test Coverage

| Chip Family | Files Available | Macros Tested | Status | Notes |
|-------------|-----------------|---------------|--------|-------|
| **FM (OPN2)** | 31 | Volume, Arp, TL, AR | ⏳ Pending | Genesis demos |
| **FM (OPM)** | 7 | Volume, Algorithm, FB | ⏳ Pending | Arcade YM2151 |
| **FM (OPL3)** | 22 | Volume, Arp, Algorithm | ⏳ Pending | SoundBlaster |
| **PSG (SN76489)** | 31+ | Volume, Duty, Arp | ⏳ Pending | Genesis PSG |
| **PSG (AY)** | 11 | Volume, Duty, Arp | ⏳ Pending | MSX/ZX Spectrum |
| **NES APU** | 23 | Volume, Duty, Arp, Pitch | ⏳ Pending | Critical envelopes |
| **Game Boy** | 15 | Volume, Duty, Wave, Arp | ⏳ Pending | Wave switching |
| **C64 SID** | 10 | Volume, Duty, Arp | ⏳ Pending | PWM important |
| **Arcade** | 33 | Various | ⏳ Pending | Multi-chip |

**Total Test Files:** 452
**Chip Families Tested:** 0/8
**Overall Status:** ⏳ **TESTING NOT STARTED**

---

## 🎯 Next Steps

### Immediate Actions

1. **Manual smoke test** (10 minutes):
   - Load 1-2 Furnace files from different chip families
   - Verify macros display in editor
   - Play and listen for macro effects

2. **Report findings**:
   - Document any parsing errors
   - Note playback issues
   - Check UI display problems

3. **Decide on depth**:
   - If smoke test passes: Mark task complete (implementation verified working)
   - If issues found: Create focused bug reports per chip family

### Optional Deep Testing

Only needed if smoke test reveals issues:
- Systematic testing of all 452 files
- Detailed analysis of macro interpolation
- Comparison with Furnace tracker playback
- Performance profiling with heavy macro usage

---

## 💡 Implementation Notes

### Current Architecture

**Macro Storage:**
- `FurnaceMacroData` interface in `src/types/tracker.ts`
- Stored per-instrument in `FurnaceInstrumentData.macros[]`

**Macro Playback:**
- WASM-based macro interpreter (Phase 1 complete)
- `MacroState` tracks playback position, loop, release points
- Applied per-tick during pattern playback

**Macro Editor:**
- `src/components/instruments/editors/MacroEditor.tsx`
- Visual curve editor for all macro types
- Supports loop and release markers

**Import/Export:**
- `.fur` import parses macro blocks correctly
- `.fur` export writes macros with compression
- Verified by FURNACE_COMPATIBILITY_PLAN.md (100% complete)

---

## ✅ Acceptance Criteria

Task #4 complete when:

1. ✅ **Load test passed**: At least 3 different chip family demos load without errors
2. ✅ **Playback verified**: Macros audibly working (volume envelopes, arpeggios, etc.)
3. ✅ **UI confirmed**: MacroEditor displays macro curves correctly
4. ✅ **No regressions**: Existing songs still play correctly

**Minimum viable test:** 10-minute smoke test with 3 chip families

---

**Next Action:** Run manual smoke test with Genesis/NES/Game Boy demos to verify macro system works end-to-end.
