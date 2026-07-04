---
date: 2026-04-04
topic: automation-lanes-cross-format
tags: [automation, visualization, gtultra, uade, sunvox, furnace]
status: draft
---

# Automation Lanes — Cross-Format Parameter Visualization

## What
Visual automation lanes that show real-time parameter changes during playback — filter sweeps, pulse width modulation, volume envelopes, pitch bends, waveform switches. Like DAW automation lanes but driven by chip register writes instead of MIDI CC.

## Why
SID/Amiga/chip music constantly modulates parameters via tables, macros, and performance lists. These modulations are invisible in the pattern editor (they happen at sub-row tick resolution). Showing them as colored lanes gives users a visual understanding of what the engine is doing and enables direct editing of these curves.

## Formats Ready Now (have register capture bridges)

### 1. GoatTracker Ultra
- **Bridge**: `GTUltraASIDBridge.ts` — `onAsidWrite(chip, reg, value)` callback
- **Registers**: SID $D400-$D418 (3 voices × 7 regs + 4 filter regs)
- **Useful lanes**: Pulse Width (reg 2-3 per voice), Filter Cutoff (reg 21-22), Waveform (reg 4), Volume/ADSR (reg 5-6)
- **Tick source**: worklet `position` message has row + songPos

### 2. UADE (130+ Amiga formats)
- **Bridge**: `UADEEngine.ts` — `getPaulaLog()` returns `PaulaLogEntry[]`
- **Registers**: Paula $DFF0A0-$DFF0DF (4 channels: period, volume, sample addr, length)
- **Useful lanes**: Volume (per channel), Period/Pitch (per channel), DMA trigger
- **Types**: `PaulaLogEntry` at `src/engine/uade/UADEEngine.ts`

### 3. SunVox
- **Bridge**: `SunVoxEngine.ts` — `getModuleScope(handle, moduleId, channel)` + `getModuleLevels(handle, moduleIds)`
- **Useful lanes**: Per-module output level, waveform scope
- **Note**: Scope is audio waveform, not parameter automation. Module controller values need new API.

## Formats Needing Bridge Work

### 4. Furnace (all chip types)
- **Current**: DivCommand dispatch in WASM, no per-tick register exposure
- **Needed**: Add register write callback to FurnaceDispatchWrapper.cpp (like ASID bridge pattern)
- **Registers**: Varies per chip (OPN: operators, OPL: channels, SID: same as GTUltra, PSG: tone/noise/vol)
- **Approach**: `furnace_dispatch_get_register_log()` that returns writes since last call

### 5. Hively/AHX
- **Current**: WASM engine with no register exposure
- **Needed**: Add Paula register capture to Hively worklet (same pattern as UADE)
- **Registers**: Paula (4 channels: period, volume)

### 6. C64 SID (DeepSID)
- **Current**: Multiple emulators (jssid, websid, tinyrsid), no register write logging
- **Needed**: Add SID register callback to whichever emulator is active
- **Registers**: Same as GTUltra ($D400-$D418)

## Architecture

### Data Layer: `AutomationCapture`
```
src/engine/automation/AutomationCapture.ts

- Ring buffer per parameter lane (fixed size, e.g. 8192 entries)
- Each entry: { tick: number, value: number }
- Engines push entries via: capture.push(paramId, tick, value)
- UI reads via: capture.getRange(paramId, startTick, endTick) → Float32Array
- Parameter IDs are format-specific strings: "sid.0.pulseWidth", "paula.2.volume"
```

### Parameter Registry: `AutomationParams`
```
src/engine/automation/AutomationParams.ts

- Maps format → available parameter lanes
- Each param: { id, label, color, min, max, unit }
- GTUltra: sid.{voice}.pulseWidth, sid.filter.cutoff, sid.filter.resonance, sid.{voice}.waveform
- UADE: paula.{ch}.period, paula.{ch}.volume
- Furnace: chip.{ch}.volume, chip.{ch}.pitch, chip.{ch}.duty, chip.filter.cutoff
```

### Engine Integration Points
```
GTUltra:  onAsidWrite(chip, reg, value) → decode reg → capture.push()
UADE:     getPaulaLog() per frame → capture.push() for each entry
SunVox:   getModuleLevels() per frame → capture.push()
Furnace:  new register log API → capture.push()
```

### UI Component: `AutomationLaneView`
```
src/components/shared/AutomationLaneView.tsx (DOM)
src/pixi/components/PixiAutomationLanes.tsx (Pixi)

- Horizontal lanes below the pattern editor (or in DAW bottom panel)
- Each lane: colored line/area chart, parameter label, value readout
- Synced to pattern playback position (same scroll as pattern editor)
- Click lane header to solo/mute the parameter
- Future: drag-to-edit the curve (writes back to tables/macros)
```

### Layout Integration
```
GTUltraView.tsx / GTDAWView.tsx:
  ┌─ Toolbar ─────────────────────────┐
  ├─ Order Matrix ────────────────────┤
  ├─ Pattern Editor ──────────────────┤
  ├─ Automation Lanes (new) ──────────┤  ← collapsible strip
  └───────────────────────────────────┘

TrackerView.tsx (for UADE/Furnace/Hively):
  Same position — below pattern editor, above bottom panel
```

## Implementation Phases

### Phase 1: Capture infrastructure + GTUltra
1. Create `AutomationCapture.ts` — ring buffer with push/getRange
2. Create `AutomationParams.ts` — parameter registry
3. Wire GTUltra ASID bridge → capture (decode SID registers to params)
4. Create `AutomationLaneView.tsx` — basic DOM canvas lanes
5. Add collapsible lane strip to `GTUltraView.tsx`
6. **Verify**: Play a GT song, see pulse width / filter cutoff lanes animate

### Phase 2: UADE integration
7. Wire `getPaulaLog()` → capture (decode Paula registers)
8. Add lane strip to `TrackerView.tsx` for UADE editor mode
9. **Verify**: Play an Amiga module, see volume/period lanes

### Phase 3: Furnace integration
10. Add register write log to `FurnaceDispatchWrapper.cpp`
11. Expose via worklet → engine → capture
12. **Verify**: Play a .fur file, see chip-specific parameter lanes

### Phase 4: Pixi GL version + editing
13. Create `PixiAutomationLanes.tsx` for GL renderer
14. Add drag-to-edit: draw on a lane to modify the underlying table/macro
15. **Verify**: Edit a filter curve in the lane, hear it change

## Key Files to Read First
- `src/engine/gtultra/GTUltraASIDBridge.ts` — existing ASID register capture pattern
- `src/engine/uade/UADEEngine.ts` — PaulaLogEntry type + getPaulaLog()
- `src/types/arrangement.ts` — existing TimelineAutomationLane type (may reuse)
- `src/engine/FormatPlaybackState.ts` — how playback position syncs to UI
- `src/components/tracker/TrackerView.tsx` — where to insert lane strip

## Open Questions
- Should lanes capture at audio-rate (44100 Hz) or tick-rate (~50 Hz)? Tick-rate is enough for visualization and much less data.
- Should the ring buffer be in a SharedArrayBuffer (for worklet→main thread zero-copy) or use postMessage? Start with postMessage, optimize later if needed.
- How many lanes visible by default? Suggest: auto-show the 3-4 most active parameters, let user add/remove.
