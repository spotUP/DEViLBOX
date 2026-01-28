# 🏁 Furnace & DefleMask Parity: Progress Report & Handoff

**Status:** Phase 2 (Capture Infrastructure) Complete. Phase 3 (Packaging & Song Import) Ready to Start.

## 🚀 Recent Accomplishments

### 1. Hardware Register Logging (HAL)
- **File:** `src/engine/chips/FurnaceChips.cpp`
- **Logic:** Every call to `furnace_chip_write` now records to a `std::vector<RegisterWrite>` when `logging_enabled` is true.
- **Struct Definition (12 bytes packed):**
  ```cpp
  struct RegisterWrite {
      uint32_t timestamp; // In samples
      uint8_t chipType;   // Our internal ID (0-50)
      uint32_t port;      // Register address
      uint8_t data;       // Value
  };
  ```
- **Bridge:** `public/FurnaceChips.worklet.js` handles the `getLog` message by copying the WASM heap memory into a `Uint8Array` and sending it to the main thread.

### 2. DefleMask Clean-Room Parser
- **File:** `src/lib/import/formats/DefleMaskParser.ts`
- **Implemented:**
  - System ID mapping (mapped 10 primary platforms).
  - `.dmp` (Patch) parsing for FM and Standard instruments.
  - `.dmw` (Wavetable) raw data extraction.
  - Initial `.dmf` header and version detection (Beta 1 to v1.1.7).

### 3. Store & UI Integration
- **Store:** `src/stores/useInstrumentStore.ts` now has `loadDefleMaskInstrument` and `loadDefleMaskWavetable`.
- **UI:** `src/components/instruments/InstrumentPanel.tsx` import button now supports `.fui`, `.fur`, `.dmp`, and `.dmw`.

## 🛠️ Critical Technical Notes

- **Chip IDs:** We use a custom mapping between Furnace/DefleMask IDs and our internal WASM IDs. See `DefleMaskParser.SYSTEM_MAP`.
- **Memory Management:** Logging is disabled by default to save memory. Call `engine.setLogging(true)` before starting a capture (e.g., during song playback or a specialized render pass).
- **Type-Check:** The codebase is 100% clean (`npm run type-check` passes).

## 📋 Roadmap for Next Session

### 1. Implement VGM Packager (`VGMPackager.ts`)
- Take the `Uint8Array` from `engine.getLog()`.
- Sort by timestamp.
- Write the VGM header (identifying used chips).
- Convert our internal `RegisterWrite` into VGM commands (e.g., `0x52` for YM2612).

### 2. Specialized Retro Exporters
- **ZSM:** Group YM2151 and VERA writes.
- **SAP (Type R):** Extract POKEY register stream.
- **TIunA:** Extract TIA stream.

### 3. Full DMF Song Import
- Complete the pattern/row parsing in `DefleMaskParser.parseDMF`.
- This requires mapping DefleMask effect commands (0-F, Exx) to our internal effect handlers.

### 4. Audio File Export
- Implement an offline `OfflineAudioContext` render pass that renders the song to a `WAV` file using the WASM chip engines.

---
*Generated on 2026-01-27*
