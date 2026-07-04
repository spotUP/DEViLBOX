---
date: 2026-04-13
topic: Unified SID editor, CC WASM bridge, bug fixes, dead code cleanup
tags: [sid, cheesecutter, gtultra, sf2, wasm, cleanup]
status: final
---

# Session Handoff: Unified SID Editor + Bug Fixes

## Completed

### 1. Unified SID Editor — Wired Up (3 formats)

**CheeseCutter** — auto-detected as primary editor when CC store is loaded + synthType is C64SID.
- `UnifiedInstrumentEditor.tsx`: checks `useCheeseCutterStore.loaded`
- `SynthTypeDispatcher.tsx`: `'cheesecutter'` editor mode → `<CheeseCutterControls>`
- Wrapper: `CheeseCutterControls.tsx` → `CheeseCutterAdapter` → `UnifiedSIDEditor`

**GoatTracker Ultra** — "SID" toggle button in EditorHeader switches between original GTUltra editor and unified SID view.
- `SynthTypeDispatcher.tsx`: `sidViewMode` state toggles between `GTUltraControls` and `GTUltraUnifiedControls`
- Adapter: `GTUltraAdapter.ts` — full read/write, 4 tables (wave/pulse/filter/speed), SID register monitoring

**SID Factory II** — full editor rewrite matching unified quality.
- `SF2Controls.tsx` rewritten: tabbed layout (Instrument/Tables/SID Monitor), interactive ADSR sliders, accent-colored panels, live SID register monitor from C64 memory polling

**SidMon II** — NOT wired to unified SID editor (it's Amiga/Paula, not C64 SID). Existing dedicated editor preserved unchanged.

### 2. CheeseCutter WASM Bridge — Live Editing

**C bridge** (`cheesecutter-wasm/src/cc_bridge.cpp`):
- `cc_write_byte(addr, value)` — write single byte to CPU RAM
- `cc_read_byte(addr)` — read single byte
- `cc_get_ram()` — pointer to full 64KB RAM

**Worklet** (`public/cheesecutter/CheeseCutter.worklet.js`):
- `writeByte`, `writeBytes`, `readBytes`, `getSidRegs` message handlers

**Engine** (`src/engine/cheesecut/CheeseCutterEngine.ts`):
- `writeByte()`, `writeBytes()`, `requestSidRegs()` public API

**Adapter** (`CheeseCutterAdapter.ts`):
- ADSR editing writes to column-major instrument table in CPU RAM
- Table editing writes to wave/pulse/filter table addresses via pointer table
- SID register monitor polls `cc_get_sid_regs` from worklet

**Store** (`useCheeseCutterStore.ts`):
- Added `pointerTable: number[]` field populated by parser

### 3. Song Load Cleanup — CheeseCutter Engine Stop

**Root cause:** Loading a new song via drag-and-drop or MCP didn't stop native engines.
- `UnifiedFileLoader.ts`: Added `getTrackerReplayer().stop()` to both `loadSongFile()` and `importTrackerModule()`
- `NativeEngineRouting.ts`: Added CheeseCutter to `stopNativeEngines()` — always checks singleton, no song guard

### 4. XM Volume Envelope Fix

**Root cause:** `importTrackerModule()` ran OpenMPT WASM before native parser, losing envelope data.
- `UnifiedFileLoader.ts`: Added `&& !info.nativeData` guard to OpenMPT WASM path — native parser runs first when it has data

### 5. Channel Routing Format Gating

**UI gating** already in place — `supportsChannelIsolation()` gates buttons to `classic` + `furnace` modes only.
**Fallback fix:** Effects with `selectedChannels` on unsupported formats now treated as global instead of silently dropped.
- `MasterEffectsChain.ts`: checks `isolationAvailable` before splitting global vs channel-targeted effects

### 6. KlysView Silent-First-Play Fix

Added `ToneEngine.stop()` + 60ms wait before `KlysEngine.play()` — was already committed by another agent.

### 7. Dead Code Cleanup

Deleted: `WebSIDEngine.ts`, `TinyRSIDEngine.ts`, `WebSIDPlayEngine.ts` — old standalone SID engines, nothing imported them. Already committed by another agent.

### 8. SID AudioWorklet

`public/deepsid/SID.worklet.js` — ring-buffer AudioWorklet for click-free DeepSID playback (from prior session, was untracked, now committed).

## Files Created
- `src/components/instruments/controls/CheeseCutterControls.tsx`
- `src/components/instruments/controls/GTUltraUnifiedControls.tsx`
- `src/components/instruments/sid/SIDInstrumentAdapter.ts`
- `src/components/instruments/sid/SIDEnvelopeSection.tsx`
- `src/components/instruments/sid/SIDWaveformSection.tsx`
- `src/components/instruments/sid/SIDRegisterMonitor.tsx`
- `src/components/instruments/sid/UnifiedSIDEditor.tsx`
- `src/components/instruments/sid/adapters/CheeseCutterAdapter.ts`
- `src/components/instruments/sid/adapters/GTUltraAdapter.ts`
- `src/lib/sid/sidConstants.ts`
- `public/deepsid/SID.worklet.js`

## Files Modified
- `src/components/instruments/controls/SF2Controls.tsx` (full rewrite)
- `src/components/instruments/editors/SynthTypeDispatcher.tsx`
- `src/components/instruments/editors/UnifiedInstrumentEditor.tsx`
- `src/components/klystrack/KlysView.tsx`
- `src/engine/cheesecut/CheeseCutterEngine.ts`
- `src/engine/replayer/NativeEngineRouting.ts`
- `src/engine/tone/MasterEffectsChain.ts`
- `src/lib/file/UnifiedFileLoader.ts`
- `src/lib/import/formats/CheeseCutterParser.ts`
- `src/stores/useCheeseCutterStore.ts`
- `cheesecutter-wasm/src/cc_bridge.cpp`
- `public/cheesecutter/CheeseCutter.worklet.js`
- `public/cheesecutter/CheeseCutter.js` + `.wasm` (rebuilt)

## Files Deleted
- `src/engine/deepsid/engines/WebSIDEngine.ts`
- `src/engine/deepsid/engines/TinyRSIDEngine.ts`
- `src/engine/deepsid/engines/WebSIDPlayEngine.ts`

## Remaining
- **Soak test before April 18 gig** — 2+ hour stress test for memory/GPU leaks under sustained DJ+VJ load
