---
date: 2026-03-07
topic: furnace-dual-macro-engine-conflict
tags: [furnace, wasm, macro, bug, c64]
status: draft
---

# Furnace WASM: Dual Macro Engine Conflict

## Critical Bug

Two macro engines run simultaneously every tick, causing:
- Double register writes (ADSR, waveform, filter)
- Volume/waveform glitches ("bleep" on note start)
- Volume drift on replay (volume gets lower each play)

## Architecture

### Wrapper's Engine (runs FIRST)
- File: `furnace-wasm/common/FurnaceDispatchWrapper.cpp`
- Function: `processChannelMacros()` (lines 1450-1751)
- Stores own macro data in `g_instrumentMacros[]`
- Stores per-channel state in `ChannelMacroState`
- Dispatches DIV_CMD_VOLUME, DIV_CMD_WAVE, DIV_CMD_C64_AD, DIV_CMD_C64_SR, etc.

### Platform's Engine (runs SECOND, inside tick())
- File: `macroInt.cpp` (compiled in, CMakeLists.txt line 37)
- Each platform calls `chan[i].std.next()` in tick()
- Reads `chan[i].std.vol.had`, `chan[i].std.wave.had`, etc.
- Writes same registers AGAIN with potentially different values

### Tick Flow
```
furnace_dispatch_tick():
  1. processChannelMacros() → sends DIV_CMD_* for vol, wave, ADSR, filter
  2. dispatch->tick(true)  → platform's tick() calls std.next() and processes macros AGAIN
```

## Fix Options

### Option A: Disable platform's macro processing (RECOMMENDED)
- Stub out `macroInit()` so platforms never initialize their macro engine
- Platform's `std.next()` runs but all macros inactive (`.had = false`)
- Wrapper's engine handles everything via dispatch commands
- Least invasive — platforms still work, just skip macro blocks

### Option B: Disable wrapper's macro engine
- Remove `processChannelMacros()` call from tick
- Ensure platforms can access instruments via `parent->getIns()`
- More "correct" architecturally but requires verifying instrument access path

### Option C: Remove macroInt.cpp from build
- Nuclear option — breaks any platform code that references std.*
- Not recommended

## Symptoms
- C64 "bleep" on note start (waveform briefly wrong)
- Volume decreasing on replay (volume macro accumulating/conflicting)
- Clicks between notes (ADSR double-written)

## Files
- `furnace-wasm/common/FurnaceDispatchWrapper.cpp:1450-1833` (wrapper macro engine + tick)
- `furnace-wasm/CMakeLists.txt:37` (macroInt.cpp compiled in)
- `third-party/furnace-master/src/engine/platform/c64.cpp:217-370` (platform tick with std.next())
