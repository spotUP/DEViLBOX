# Plan: SID Factory II — Full 1:1 Integration

## Vision

Port SID Factory II as a **full-featured editor** in DEViLBOX — not just a viewer/player.
Same architecture as the original: C64 memory image is the single source of truth,
6502 CPU runs the driver, edits poke directly into emulated RAM, changes heard immediately.

## Architecture (from SF2 source study)

```
C64 Memory (64KB Uint8Array) — SINGLE SOURCE OF TRUTH
    ├── Driver code ($1000-$1FFF) — 6502 replay routine
    ├── Instrument/Command tables ($2000-$3FFF)
    ├── Order lists ($4000-$4FFF)
    ├── Sequences ($5000-$6FFF)
    └── SID registers ($D400-$D418) — written by driver

Edit Flow:
  User edits cell → DataSource.push() → CPUMemory[addr] = value
  → 6502 runs driver code next frame → driver reads new data → writes SID regs
  → reSID generates audio → immediate audible change

Display Flow:
  CPUMemory → DataSource.pull() → UI renders current state
  DriverState reads tick/row/orderpos from known memory addresses
```

## Key SF2 Concepts

- **Drivers**: 21+ versions, each a complete 6502 replay kernel. Song embeds ONE driver.
  Header blocks describe memory layout (table addresses, sizes, column counts).
- **TableDefinition**: Driver-defined data tables (instruments, commands, waveforms, etc.)
  with row/column-major layout, color rules, insert/delete cascade rules, action rules.
- **DataSources**: Typed views into CPUMemory — sequence unpacker, order list, table accessor.
  Each has PullDataFromSource() and PushDataToSource() for bidirectional sync.
- **Flight Recorder**: Captures SID register writes each frame for waveform visualization.
- **Packer**: Serializes edited memory back to .sf2 PRG file for export.

## Phases

### Phase 1: Core Infrastructure ✅ DONE
- [x] SIDFactory2Parser.ts — file detection, header parsing, PSID wrapping
- [x] FormatRegistry + AmigaFormatParsers routing
- [x] useSF2Store — Zustand store for SF2 state
- [x] sf2Adapter + useSF2FormatData — FormatChannel[] conversion
- [x] SF2View (DOM) + PixiSF2View (GL) — pattern display
- [x] applyEditorMode wiring + TrackerView routing
- [x] SF2Config type, SynthType, SynthTypeDispatcher routing
- [x] SF2Controls (DOM) — basic hex byte instrument editor
- [x] SF2KeyboardHandler — note entry, hex editing, navigation
- [x] SID register automation mapping

### Phase 2: 6502 Emulation Engine (CRITICAL)
The heart of live editing. Must run the SF2 driver's 6502 code in real-time.

- [ ] **sf2-6502-emulation** — Port or wrap a 6502 CPU emulator to WASM/JS.
      Options: (a) Use existing reSID/WebSID 6502, (b) Build lightweight 6502 in TS,
      (c) Compile SF2's cpumos6510.cpp to WASM via Emscripten.
      Need: CPU.run(cycles), CPUMemory read/write, JSR to driver vectors.

- [ ] **sf2-sid-emulation** — SID chip emulation for audio output.
      Options: (a) Use existing WebSID/jsSID from C64SIDEngine,
      (b) Compile SF2's reSIDfp to WASM.
      Need: clock(cycles) → PCM samples, register write capture.

- [ ] **sf2-execution-handler** — AudioWorklet that runs the driver each frame:
      1. Execute queued actions (init/stop/mute)
      2. JSR to driver's updateAddress
      3. Clock SID for each CPU cycle
      4. Output PCM buffer
      5. Capture SID register state for flight recorder

- [ ] **sf2-memory-bridge** — Bridge between main thread (store) and worklet (CPUMemory):
      SharedArrayBuffer or MessagePort for real-time memory patching.
      Editor writes → worklet reads on next frame → driver plays new data.

### Phase 3: DataSources (Bidirectional Memory Sync)
Port SF2's DataSource pattern: typed views into the C64 memory image.

- [ ] **sf2-datasource-sequence** — Unpack/pack sequence events from/to C64 memory.
      Variable-length encoding: [cmd?][inst?][dur?]<note>. Lossless round-trip.
      PullDataFromSource() → Event[]. PushDataToSource() → pack & write back.

- [ ] **sf2-datasource-orderlist** — Order list read/write with transposition.
      Packed format: 0x80+ = transpose, <0x80 = seq index, 0xFE/0xFF = end/loop.

- [ ] **sf2-datasource-table** — Generic table accessor for driver-defined tables.
      Supports row-major and column-major layouts.
      Instrument table (type 0x80), Command table (type 0x81), generic (0x00).

### Phase 4: Full Table Editor UI
Replicate SF2's table editor — the instrument/command/wavetable hex grid.

- [ ] **sf2-table-editor-dom** — DOM component: hex grid with color rules,
      insert/delete with cascade rules, Enter action rules (jump to linked table),
      text fields for instrument names. One component per TableDefinition.

- [ ] **sf2-table-editor-gl** — GL equivalent using Pixi bitmap text grid.

- [ ] **sf2-table-layout** — Dynamic table positioning: horizontal/vertical stacking
      based on driver's m_PropertyLayoutVertically flag.

- [ ] **sf2-color-rules** — Conditional cell coloring from driver's TableColorRules.

- [ ] **sf2-action-rules** — Enter key behavior: extract index from cell, jump to
      linked table row (e.g., instrument → wavetable row).

- [ ] **sf2-insert-delete-rules** — Cascading insert/delete: when a row is inserted
      in one table, update references in other tables.

### Phase 5: Flight Recorder & Visualization
- [ ] **sf2-flight-recorder** — Capture SID register writes each frame (25 regs × 2048 frames).
      Display waveform timeline, gate on/off, filter state, CPU usage.

- [ ] **sf2-sid-visualizer** — Real-time SID register display (frequency, ADSR, waveform,
      filter cutoff/resonance per voice).

### Phase 6: Export & Converters
- [ ] **sf2-packer** — Pack edited memory state back to .sf2 PRG file.
      Extract only used sequences/tables, relocate addresses, produce runnable PRG.

- [ ] **sf2-converters** — Import from other formats (GT, JCH, MOD) like SF2's
      screen_convert.cpp. Low priority — focus on native editing first.

## Current Status

Phase 1 complete. Need to decide on Phase 2 approach (6502 emulation strategy)
before proceeding — this is the critical path that enables everything else.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/import/formats/SIDFactory2Parser.ts` | Parser + PSID builder |
| `src/stores/useSF2Store.ts` | Zustand store |
| `src/components/sidfactory2/` | SF2View, adapter, hook, keyboard |
| `src/pixi/views/sidfactory2/PixiSF2View.tsx` | GL view |
| `src/types/instrument/exotic.ts` | SF2Config |
| `Reference Code/sidfactory2-master/` | Original C++ source (golden truth) |

## Reference Source Locations

| SF2 Component | Reference File |
|---------------|----------------|
| Editor main | `source/runtime/editor/editor_facility.cpp` |
| Main screen | `source/runtime/editor/screens/screen_edit.cpp` (2244 lines) |
| Track component | `source/runtime/editor/components/component_track.cpp` (94KB!) |
| Table component | `source/runtime/editor/components/component_table_row_elements.cpp` |
| Sequence DS | `source/runtime/editor/datasources/datasource_sequence.cpp` |
| Order list DS | `source/runtime/editor/datasources/datasource_orderlist.cpp` |
| Table DS | `source/runtime/editor/datasources/datasource_table.cpp` |
| Driver info | `source/runtime/editor/driver/driver_info.cpp` |
| Driver state | `source/runtime/editor/driver/driver_state.cpp` |
| CPU memory | `source/runtime/emulation/cpumemory.cpp` |
| 6502 CPU | `source/runtime/emulation/cpumos6510.cpp` |
| SID proxy | `source/runtime/emulation/sid/` |
| Execution | `source/runtime/execution/executionhandler.cpp` |
| Flight recorder | `source/runtime/execution/flightrecorder.cpp` |
| Packer | `source/runtime/editor/packer/` |

