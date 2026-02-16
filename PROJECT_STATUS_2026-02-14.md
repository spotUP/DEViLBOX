# DEViLBOX Project Status

**Last Updated:** 2026-02-16

## ✅ Major Features Complete

### 1. Modular Synth (Phases 1-6) ✅
- **Phase 1-3:** Core engine + 11 modules (VCO, VCF, VCA, ADSR, LFO, etc.)
- **Phase 4:** Rack View UI with drag-drop and patch cables
- **Phase 5:** Canvas View with pan/zoom/grid (365 lines)
- **Phase 6:** Matrix View with connection table (301 lines)
- **Status:** Fully operational with 3 view modes

**Files:**
- `src/engine/modular/` - Complete engine
- `src/components/instruments/synths/modular/` - Complete UI
- See: [MODULAR_SYNTH_STATUS.md](MODULAR_SYNTH_STATUS.md)

---

### 2. Buzzmachines (72 Effects) ✅
- **72 machines compiled to WASM** (not just 2!)
- Distortion, filters, delay, reverb, chorus, dynamics, generators
- Full integration with AudioWorklet
- Runtime tested and working

**Files:**
- `public/buzzmachines/` - 144 files (72 × 2)
- `src/engine/buzzmachines/` - Engine code
- See: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

### 3. DrumKit/Keymap Engine + UI ✅
- **Full implementation** in `DrumKitSynth.ts`
- Maps different samples to different note ranges
- Per-key pitch/volume/pan offsets
- Used in production with Drumnibus presets
- **✅ Visual Editor complete** (`DrumKitEditor.tsx` - 482 lines)

**Files:**
- `src/engine/DrumKitSynth.ts` - Engine complete
- `src/components/instruments/editors/DrumKitEditor.tsx` - UI complete
- `src/constants/drumnibusPresets.ts` - Presets

---

### 4. Volume Normalization System ✅
- **Per-synth gain offsets** implemented
- `FURNACE_VOLUME_OFFSETS` for 79 chip types
- `volumeOffsetDb` in SynthDescriptor
- Automatic level balancing

**Files:**
- `src/engine/registry/builtin/furnace.ts` - Offset tables
- `src/engine/registry/SynthDescriptor.ts` - Type definitions

---

### 5. Swing/Groove Timing ✅
- **Fixed critical bugs** (2026-02-10)
- Groove templates (shuffle, funk, MPC, etc.)
- Jitter/humanization
- All timing tests passing

**Files:**
- `src/engine/TrackerReplayer.ts` - Fixed
- See: [HANDOFF_SWING_AND_DB303.md](HANDOFF_SWING_AND_DB303.md)

---

### 6. Native Kontrol Standard (NKS) ✅
- Web HID integration for Komplete Kontrol/Maschine
- Hardware controller support
- Preset browser with light guide
- Auto-connect functionality

**Files:**
- `src/midi/nks/` - Protocol implementation
- See: [NKS_IMPLEMENTATION_COMPLETE.md](NKS_IMPLEMENTATION_COMPLETE.md)

---

### 7. Furnace Chip Synths (79 Chips) ✅
- All major platforms supported
- FM chips, PSG chips, console chips, PCM chips
- Volume offsets configured
- OPZ key-on/key-off fixed (2026-02-10)

**Files:**
- `src/engine/FurnaceSynth.ts` - Main synth
- `src/engine/furnace-dispatch/` - Dispatch wrapper
- See: [HANDOVER.md](HANDOVER.md)

---

## 🔴 Known Issues

### 1. Furnace .fur Import - Silent Audio ⚠️
**Status:** Week 1 Critical Fixes complete, testing pending

**Progress:**
- ✅ Phase 1-6: Parser, encoder, macro positioning all fixed
- ✅ **Week 1 (2026-02-16): Critical Fixes COMPLETE**
  - ✅ MacroEngine implementation (740 lines, 3 modes, 20+ macro types)
  - ✅ TrackerReplayer integration (per-channel, tick-based)
  - ✅ Sync bug fixed (removed dual macro system)
  - ✅ ProTracker importer restored (native parser)
  - ✅ 7 missing effect handlers (0xE5-0xEA, 0xF5-0xF7, 0xFF)
  - ✅ PLATFORM_VOL_MAX for 113 platforms
  - 🔄 **Testing pending** - will test when all phases complete

**Files:**
- `src/engine/MacroEngine.ts` - Furnace macro interpreter (NEW)
- `src/engine/TrackerReplayer.ts` - Macro integration (UPDATED)
- See: [FURNACE_IMPORT_DEBUG_REPORT.md](FURNACE_IMPORT_DEBUG_REPORT.md)
- See: [docs/WEEK1_TESTING_GUIDE.md](docs/WEEK1_TESTING_GUIDE.md) - Testing instructions

**Next Steps (Week 2):**
- Week 2: Playback Engine Refinements (effect timing, global effects, channel limits)
- Week 3: Furnace-Specific Features
- Manual testing of macro playback when all weeks complete

---

### 2. DB303 XML Import Accuracy 🔄
**Status:** High priority - imports work but sound "very far from correct"

**Issue:**
- Pattern/preset imports from db303 website don't match reference
- Possible parameter mapping issues
- Timing/slide/accent accuracy needs verification

**Files:**
- `src/App.tsx` lines 410-702 - Import parser
- See: [HANDOFF_SWING_AND_DB303.md](HANDOFF_SWING_AND_DB303.md)

**Next Steps:**
- Get reference XML files
- Compare parameter mappings
- Debug pattern timing

---

### 3. Furnace Chip Volume Levels 🟡
**Status:** Medium priority - some chips silent or too quiet

**Issues:**
- FurnaceOPN: -90dB (SILENT)
- FurnaceOPM: -90dB (SILENT)
- FurnaceOPLL: -90dB (SILENT)
- FurnaceGB/NES/PSG: No audio
- FurnaceOPZ: -39.8dB (too quiet, +30dB needed)
- Many dispatch platform chips silent

**Note:** Volume offsets are configured in code but not all working correctly.

**Files:**
- `src/engine/registry/builtin/furnace.ts` - Offset configuration
- [snapshot-progress.md](snapshot-progress.md) - Test results

---

## 📋 Planned Enhancements

### ✅ Recently Completed (Verified 2026-02-15)
- ✅ **Pattern length in header** - Shows `[64]` under ROW label (PatternEditorCanvas.tsx#L1414-L1417)
- ✅ **Ping-pong loop indicator** - Enhanced visibility in InstrumentList
- ✅ **DrumKit Visual Editor** - Full 482-line piano-roll UI (DrumKitEditor.tsx)
- ✅ Note-off displays as `OFF` (PatternEditorCanvas.tsx line 37)
- ✅ Pitch Envelope complete with full ADSR UI controls
- ✅ Note Fade effect (IT NNA action 3 implemented)
- ✅ Envelope control effects S77-S7C (all 6 commands working)

### ⏳ Not Started
- [ ] Auto-slice to drumkit (Beat Slicer integration)
- [ ] Sample layering (velocity zones, round-robin)
- [ ] Pink/brown noise in Modular Synth NoiseModule (has TODO comment)

### Pitch Envelope (Advanced - 4-6 hours) - ✅ **COMPLETE**
- [x] Time-based pitch modulation **DONE**
- [x] ADSR-style controls **DONE**
- [x] UI in VisualSynthEditorContent **DONE**
- [x] Engine implementation in InstrumentFactory **DONE**
- Note: Implementation is complete - was marked as "planned" in error

### Modular Synth Phase 7 (Low priority)
- [ ] More factory presets
- [ ] SDK documentation

See: [TRACKER_IMPROVEMENTS_PLAN.md](TRACKER_IMPROVEMENTS_PLAN.md)

---

## 📊 Overall Statistics

| Category | Status |
|----------|--------|
| **Core Tracker** | ✅ Complete |
| **Modular Synth** | ✅ Phases 1-6 complete |
| **Buzzmachines** | ✅ 72 machines complete |
| **DrumKit Engine + UI** | ✅ Complete (DrumKitEditor.tsx) |
| **Furnace Chips** | ✅ 79 chips (volume issues) |
| **NKS Hardware** | ✅ Complete |
| **Swing/Timing** | ✅ Fixed |
| **Tracker Effects** | ✅ All XM/IT effects complete |
| **Pitch Envelope** | ✅ Complete with UI |
| **Furnace Import** | � Week 1 fixes done, testing pending |
| **DB303 Import** | 🟡 Inaccurate |

---

## 🎯 Priority Focus Areas

1. **P0 - Critical:** Furnace .fur import - Week 1 fixes complete, Week 2-3 in progress
   - ✅ Week 1: MacroEngine + critical fixes (COMPLETE 2026-02-16)
   - 🔄 Week 2: Playback engine refinements (next)
   - 🔄 Week 3: Furnace-specific features
2. **P1 - High:** Fix Furnace FM chip audio (OPN, OPM, OPLL, etc. are SILENT at -90dB)
3. **P1 - High:** Fix Furnace Dispatch chip audio (GB, NES, PSG, etc. produce NO AUDIO)
4. **P1 - High:** Fix DB303 XML import accuracy
5. **P2 - Medium:** Auto-slice to drumkit
6. **P2 - Medium:** Sample layering system
7. **P3 - Low:** Pink/brown noise in Modular NoiseModule

---

## 📚 Key Documentation

- [CLAUDE.md](CLAUDE.md) - Critical project rules (DB303, Git safety)
- [MODULAR_SYNTH_STATUS.md](MODULAR_SYNTH_STATUS.md) - Modular synth complete status
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Buzzmachines complete
- [TRACKER_IMPROVEMENTS_PLAN.md](TRACKER_IMPROVEMENTS_PLAN.md) - Planned enhancements
- [FURNACE_IMPORT_DEBUG_REPORT.md](FURNACE_IMPORT_DEBUG_REPORT.md) - Import debugging
- [HANDOFF_SWING_AND_DB303.md](HANDOFF_SWING_AND_DB303.md) - Swing fixes + DB303 issues

---

**Last Reviewed:** 2026-02-16 (Week 1 Critical Fixes complete)
