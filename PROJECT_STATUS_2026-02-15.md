# DEViLBOX Project Status

**Last Updated:** 2026-02-15 (Current Session)

## ✅ Major Features Complete & Recently Fixed

### 1. Modular Synth (Visibility & Logic Fixed) ✅
- **Visibility Fix:** Replaced non-standard Tailwind classes (e.g., `bg-surface-primary`) with theme-aware variables (`bg-dark-bg`).
- **Initialization Fix:** Added explicit `registerBuiltInModules()` in `ModularSynthEditor.tsx` so UI can render modules before engine starts.
- **Camera Fix:** Implemented auto-fit on mount in `ModularCanvasView.tsx` to prevent off-screen rendering.
- **Connection Fix:** Fixed coordinate system mismatch between container-space and world-space for patch cables.
- **Interaction Fix:** Fixed wiring preview mouse-move coordinate logic.
- **Status:** Fully operational across Rack, Canvas, and Matrix views.

### 2. UI Refinements & Documentation ✅
- **Toolbar:** Renamed "Cmds" button to "Reference" for better UX.
- **Help System:** Added "CHIP EFFECTS" tab to `HelpModal` with dynamic detection of Furnace chip types from selected instrument.
- **Style Audit:** Verified removal of all legacy `surface-` CSS classes across the entire `src` directory.
- **Tracker:** Updated `MacroLanes` to support variable channel widths and collapsed channel states.

### 3. Recently Completed (Verified 2026-02-15) ✅
- ✅ **Pattern length in header** - Shows `[64]` under ROW label.
- ✅ **Ping-pong loop indicator** - Enhanced visibility in InstrumentList.
- ✅ **DrumKit Visual Editor** - Full piano-roll UI.
- ✅ Note-off displays as `OFF`.
- ✅ Pitch Envelope complete with full ADSR UI controls.
- ✅ Note Fade effect (IT NNA action 3).
- ✅ Envelope control effects S77-S7C.

---

## 🔴 Known Issues (Pending)

### 1. Furnace .fur Import - Silent Audio ⚠️
**Status:** Critical issue - instruments load but produce no sound.
**Next Steps:** Deep dive into WASM message passing and sample rate conversions.

### 2. DB303 XML Import Accuracy 🔄
**Status:** High priority - sound is inaccurate.
**Issue:** Parameter mapping and slide/accent timing need verification against reference files.

### 3. Furnace Chip Volume Levels 🟡
**Status:** Medium priority - some chips are silent (-90dB) or too quiet.
**Target Chips:** OPN, OPM, OPLL, GB, NES, PSG.

---

## 📋 Planned Enhancements

### ⏳ Not Started
- [ ] Auto-slice to drumkit (Beat Slicer integration).
- [ ] Sample layering (velocity zones, round-robin).
- [ ] Pink/brown noise in Modular Synth NoiseModule.

---

## 📊 Overall Statistics

| Category | Status |
|----------|--------|
| **Core Tracker** | ✅ Complete |
| **Modular Synth** | ✅ Fixed & Visible |
| **Buzzmachines** | ✅ 72 machines complete |
| **DrumKit Engine + UI** | ✅ Complete |
| **Furnace Chips** | ✅ 79 chips (volume issues) |
| **NKS Hardware** | ✅ Complete |
| **Swing/Timing** | ✅ Fixed |
| **Tracker Effects** | ✅ All XM/IT effects complete |
| **Pitch Envelope** | ✅ Complete |
| **Furnace Import** | 🔴 Broken (silent audio) |
| **DB303 Import** | 🟡 Inaccurate |

---

## 📚 Key Documentation

- [CLAUDE.md](CLAUDE.md) - Critical project rules.
- [MODULAR_SYNTH_STATUS.md](MODULAR_SYNTH_STATUS.md) - Modular synth details.
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Buzzmachines summary.
- [TRACKER_IMPROVEMENTS_PLAN.md](TRACKER_IMPROVEMENTS_PLAN.md) - Future roadmap.
- [FURNACE_IMPORT_DEBUG_REPORT.md](FURNACE_IMPORT_DEBUG_REPORT.md) - Debugging logs.

---

**Last Reviewed:** 2026-02-15 (Turn context documented for restart)
