# 🏁 Furnace Integration Progress Report & Handoff

**Status:** All Phases Complete (1-5). 8 chip export formats + full macro system operational.

## 🚀 Accomplishments

### 1. Unified Sound Engine (WASM)
- **File:** `src/engine/chips/FurnaceChips.cpp` / `public/FurnaceChips.wasm`
- **Coverage:** 100% of requested chips (51 engines total).
- **Major Cores:** OPN2 (Genesis), OPM (Arcade), OPL3, SID, NES, Game Boy, PCE, SCC, N163, VRC6, AY, TIA, POKEY, SAA1099, WonderSwan, OKI, ES5506, SPC700 (SNES), Mikey (Lynx), OPL4, SegaPCM, YMZ280B, RF5C68, GA20, QSound, VERA, etc.
- **Custom Logic:** Implemented a manual Wavetable Renderer for the **Konami Bubble System** (K005289) since `vgsound_emu` only provided the timer.

### 2. High-Performance Bridge
- **Engine:** `src/engine/chips/FurnaceChipEngine.ts` (Singleton).
- **Renderer:** `public/FurnaceChips.worklet.js` (AudioWorklet).
- **Features:** Supports multi-chip mixing and live Wavetable/PCM injection via `furnace_set_wavetable`.

### 3. Universal Instrument Parser
- **File:** `src/lib/import/formats/FurnaceParser.ts`
- **Format Support:** 
  - Modern Feature-based (`FINS`, `INS2`).
  - Legacy Binary (`-Furnace instr.-`).
- **Data Mapping:** Correctly extracts FM parameters, Wavetables, and metadata.

### 4. Dynamic "Omnibus" Editor
- **File:** `src/components/instruments/FurnaceEditor.tsx`
- **Logic:** Automatically reconfigures the UI based on `chipType`:
  - **FM:** 4-Operator Grid + Algorithm routing visualizer.
  - **PSG:** Pulse Duty/Width + Noise Mode selection.
  - **Wavetable:** Interactive wave previews.
  - **PCM:** Sample properties (Rate, Loop, Bit Depth).

### 5. Factory Presets
- **File:** `src/constants/furnacePresets.ts`
- **Included:** Genesis E. Bass, OPL3 Slap Bass, TIA Snare, VERA Arp Lead, and Gradius Bubble Lead (all extracted from authentic Furnace libraries).

## 🛠️ Current Codebase Health
- **Type-Check:** 100% Clean (`npm run type-check` passes).
- **Build:** `scripts/build-furnace-chips.sh` is optimized for Emscripten 4.0+.

## ✅ Phase 2 Complete: Exporters Implemented

### 1. Universal Importer (`DefleMaskParser.ts`) ✅
- [x] Clean-room parsing for `.dmf` (versions 3 to 27)
- [x] Support `.dmp` (DefleMask Patches) and `.dmw` (Wavetables)
- [x] Full pattern matrix and channel parsing
- [ ] Module Downgrader logic (planned)

### 2. Hardware Capture System ✅
- [x] `RegisterWrite` struct in `FurnaceChips.cpp` captures timestamp, chipType, port, data
- [x] `furnace_set_logging(bool)` enables/disables capture
- [x] `furnace_get_log_data()` retrieves captured register stream
- [x] `FurnaceChipEngine.ts` provides `setLogging()` and `getLog()` APIs

### 3. Specialized Exporters ✅
| Format | File | Status | Description |
|--------|------|--------|-------------|
| **VGM** | `VGMExporter.ts` | ✅ Complete | Universal format (40+ chips) |
| **ZSM** | `ZSMExporter.ts` | ✅ Complete | Commander X16 (YM2151 + VERA) |
| **SAP** | `SAPExporter.ts` | ✅ Complete | Atari 8-bit POKEY (Type R) |
| **TIunA** | `TIunAExporter.ts` | ✅ Complete | Atari 2600 TIA |

### 4. Unified Export Manager ✅
- [x] `ChipExporter.ts` - Single entry point for all chip exports
- [x] `ChipRecordingSession` - Start/stop recording workflow
- [x] Format detection and availability checking
- [x] Log statistics and chip usage analysis

### 5. Advanced Macro Implementation
- [ ] Map parsed Furnace Macros to `ToneEngine` tick loop
- [ ] Real-time operator-level macro playback

---

## ✅ Phase 3 Complete: UI Integration

### 1. Chip Export Mode in ExportDialog ✅
- [x] Added 'chip' export mode with recording controls
- [x] Real-time recording timer display
- [x] Format selection based on captured chip types
- [x] Metadata input (title, author)
- [x] Chip statistics display (writes, duration, chips used)

### 2. Recording Workflow ✅
- [x] `ChipRecordingSession` class for start/stop workflow
- [x] Recording indicator in export panel
- [x] Format availability updates after recording stops

---

## ✅ Phase 4 Complete: Enhanced Formats

All new exporters implemented with embedded playback drivers:

| Format | File | Status | Description |
|--------|------|--------|-------------|
| **GYM** | `GYMExporter.ts` | ✅ Complete | Genesis YM2612 + PSG log format |
| **NSF** | `NSFExporter.ts` | ✅ Complete | NES Sound Format (embedded 6502 driver) |
| **GBS** | `GBSExporter.ts` | ✅ Complete | Game Boy Sound (embedded Z80 driver) |
| **SPC** | `SPCExporter.ts` | ✅ Complete | SNES SPC700 (embedded SPC700 driver) |

### Total Supported Formats: 8
- **VGM** - Universal (40+ chips)
- **ZSM** - Commander X16
- **SAP** - Atari 8-bit POKEY
- **TIunA** - Atari 2600 TIA
- **GYM** - Sega Genesis
- **NSF** - NES/Famicom
- **GBS** - Game Boy
- **SPC** - SNES

---

## ✅ Phase 5 Complete: Macro System Integration

Full Furnace macro support implemented in `FurnaceSynth.ts`:

### Global Macros (per-tick modulation)
- **Volume** (type 0): Output gain modulation (0-127)
- **Arpeggio** (type 1): Frequency shift in semitones
- **Duty Cycle** (type 2): PSG/NES/GB pulse width control
- **Wavetable** (type 3): Dynamic wavetable switching
- **Pitch** (type 4): Fine pitch modulation in cents
- **Panning** (type 5): Stereo position (-127 to 127)
- **Phase Reset** (type 6): Oscillator retrigger

### Operator Macros (FM synthesis control)
- **TL** (Total Level): Per-operator amplitude
- **MULT** (Multiplier): Frequency ratio (0-15)
- **AR** (Attack Rate): Envelope attack speed
- **DR** (Decay Rate): Envelope decay speed
- **SL** (Sustain Level): Envelope sustain point
- **RR** (Release Rate): Envelope release speed

### Chip Support
- **OPN2** (Genesis): Full FM + macro support
- **OPM** (Arcade): Full FM + macro support
- **NES**: Pulse duty, volume, key-on/off
- **Game Boy**: Pulse duty, wave, volume, key-on/off
- **PSG** (SN76489): Volume macros

---

## 📋 Future Enhancements (Optional)

### Loop Point Support
- [ ] Add loop point marker in pattern editor
- [ ] Pass loop point to VGM/NSF/GBS exporters

### Module Downgrader
- [ ] Convert between module formats with intelligent parameter mapping

### Velocity Modulation
- [ ] Scale initial macro values by note velocity
- [ ] Velocity-sensitive operator TL scaling

---
*Updated on 2026-01-27 - Phases 3, 4 & 5 Complete*
