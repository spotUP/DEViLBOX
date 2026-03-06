# Gearmulator WASM Audio Debugging Report
**Date:** 2026-03-06
**Status:** ESAI fix deployed and render loop enabled — **Ready for browser testing**

---

## Summary

The previous session identified and deployed a critical fix for Gearmulator audio output. The issue was that ESAI audio interface registers were not being re-applied after the memory snapshot restore, leaving the audio subsystem disabled (TCR/RCR = 0 = disabled).

**This session:** Enabled the render loop and added diagnostics to verify the fix is working.

---

## Problem Statement (From Previous Session)

### Symptoms
- Device boots successfully from ROM (0.1 second via snapshot)
- Device reports `handle=0, sampleRate=46875`
- MIDI messages (note on/off) reach the Worker correctly
- **BUT:** `_gm_process()` call never produces audio output
- Audio output buffer stays at size 0 forever

### Root Cause (Identified & Fixed)
The **snapshot restore** in `loadMemorySnapshot()` (device.cpp:30-117):
1. Loaded P/X/Y memory from snapshot
2. Restored CPU registers
3. **BUT FAILED** to re-apply ESAI peripheral C++ objects

When ESAI register values were loaded into raw X-memory, the C++ `Esai` class member variables (`m_tcr`, `m_rcr`, `m_tccr`, `m_rccr`, etc.) remained at their default (0 = disabled) state.

**Critical discovery:** The fix re-applies ESAI registers via proper C++ write methods:
```cpp
// Read ESAI values from X-memory (restored by snapshot)
auto tcr = mem.get(MemArea_X, Esai::M_TCR);
auto rcr = mem.get(MemArea_X, Esai::M_RCR);
// ... etc for all ESAI regs

// Re-apply via proper methods (activates C++ state)
esai.writeTransmitControlRegister(tcr);  // enables TX
esai.writeReceiveControlRegister(rcr);   // enables RX
```

---

## Fix Deployment Status

### ✅ C++ Source (device.cpp)
**Status:** DEPLOYED
**Location:** `Reference Code/gearmulator-main/source/virusLib/device.cpp:65-111`
**Verification:**
```cpp
// ESAI register restoration after snapshot (lines 65-111)
// ✓ Reads ESAI registers from X-memory
// ✓ Re-applies via writeTransmitControlRegister/writeReceiveControlRegister
// ✓ Restores PLL clock (PCTL) for correct sample timing
// ✓ Includes printf diagnostics for logging
```

### ✅ WASM Module Rebuilt
**Status:** REBUILT 2026-03-06 13:33
**Files:**
- `public/gearmulator/gearmulator_wasm.wasm` (825KB)
- `public/gearmulator/gearmulator_wasm.js` (80KB)

---

## Render Loop Architecture

### Previous Session (Diagnostic Mode)
- ❌ Render loop was **disabled** for debugging
- ✓ Polling loop was running to check `audioIn`/`audioOut` queue sizes
- Purpose: Diagnose if DSP is producing output

### This Session (Production Mode)
- ✅ Render loop is now **enabled**
- ✅ Diagnostic polling reports to console every 2 seconds for first 10 seconds
- ✓ fillRingBuffer() calls `_gm_process()` continuously
- ✓ Audio written to SharedArrayBuffer ring buffer
- ✓ Worklet reads from SAB and outputs to Web Audio

### Key Code Flow
```
Main Thread (GearmulatorSynth.ts)
  ↓ Creates Worker + SAB + Worklet
  ↓ sends { type: 'init', romData, wasmBinary, synthType, sab }
  ↓
DSP Worker (Gearmulator.worker.js)
  ↓ Instantiates WASM + creates device (via gm_create)
  ↓ Starts render loop on first connection
  ↓ fillRingBuffer() → calls gm_process(handle, outL, outR, 128)
  ↓ Writes interleaved L/R to SAB ring buffer
  ↓ Atomics.store(writePos) signals data available
  ↓
AudioWorklet (Gearmulator.worklet.js)
  ↓ Monitors writePos/readPos in SAB header
  ↓ Reads interleaved samples from ring buffer
  ↓ Writes to WebAudio outputs[0]
  ↓
WebAudio Destination (speakers)
```

---

## Changes Made This Session

### 1. Enable Render Loop (Gearmulator.worker.js)
**Commit:** (pending)
**Change:** Removed diagnostic polling, enabled `startRenderLoop(actualRate)` call
```javascript
// BEFORE (debug mode)
// DEBUG: Don't start render loop yet — let polling diagnose
// startRenderLoop(actualRate);

// AFTER (production)
console.log('[Gearmulator Worker] Starting render loop...');
startRenderLoop(actualRate);
```

### 2. Add Diagnostic Monitoring
**Location:** startRenderLoop() function
**Purpose:** Log audio queue sizes every 2 seconds for first 10 seconds
```javascript
const diagTimer = setInterval(() => {
  const inSize = module._gm_getAudioInputSize(handle);
  const outSize = module._gm_getAudioOutputSize(handle);
  console.log(`[Gearmulator Worker DIAG] audioIn=${inSize}, audioOut=${outSize}`);
  if (outSize > 0) {
    console.log('[Gearmulator Worker DIAG] ✓ ESAI producing output!');
  }
}, 2000);
```

---

## Expected Test Results

### If ESAI Fix is Working ✅
When test-gearmulator.html runs:
1. Click "Initialize" button
2. Device boots in ~0.1 seconds
3. Status shows "✅ Ready"
4. Console shows: `[Gearmulator Worker DIAG] audioOut=N` (N > 0)
5. Play note with "Play C4" button
6. Audio meter shows movement (green bar rises)
7. You should hear synthesizer sound through speakers

### If ESAI Fix Failed ❌
1. Device boots successfully
2. Console shows: `[Gearmulator Worker DIAG] audioOut=0`
3. Audio meter does not move
4. Suggested next steps: Check WASM build, verify printf output

---

## Diagnostic Output Expectations

### Console Output (Success Case)
```
[Gearmulator Worker] Device ready — handle=0, sampleRate=46875, type=0
[Gearmulator Worker] Starting render loop...
[Gearmulator Worker DIAG] audioIn=0, audioOut=128
[Gearmulator Worker DIAG] audioOut=256
[Gearmulator Worker DIAG] ✓ ESAI producing output!
[Gearmulator Worker] Calling _gm_process #0 (128 samples)...
[Gearmulator Worker] _gm_process #0 returned
```

The `audioOut` number is the total accumulated output frames in the DSP's internal ring buffer. When `> 0`, it means ESAI is enabled and actively producing samples.

### WASM Diagnostics (from device.cpp)
When device boots with snapshot, console should show:
```
[WASM] Restoring ESAI registers: SAICR=... TCR=... TCCR=... RCR=... RCCR=...
[WASM] Restoring PCTL=...
[WASM] Snapshot loaded: P/X/Y memory + registers restored, boot skipped
```

---

## File Manifest

| File | Status | Note |
|------|--------|------|
| `Reference Code/gearmulator-main/source/virusLib/device.cpp` | ✅ Fixed | ESAI register restoration (lines 65-111) |
| `Reference Code/gearmulator-main/source/virusLib/device.h` | ✅ Updated | Added `getDSP()` public accessor |
| `gearmulator-wasm/src/gearmulator_bridge.cpp` | ✅ Has diagnostics | Debug exports: `gm_pushInput`, `gm_getAudioInputSize/OutputSize` |
| `public/gearmulator/gearmulator_wasm.wasm` | ✅ Rebuilt | Contains ESAI fix (825KB) |
| `public/gearmulator/gearmulator_wasm.js` | ✅ Rebuilt | Emscripten wrapper (80KB) |
| `public/gearmulator/Gearmulator.worker.js` | ✅ Modified | Render loop enabled, diagnostics added |
| `public/gearmulator/Gearmulator.worklet.js` | — | No changes (reads from SAB) |
| `src/engine/gearmulator/GearmulatorSynth.ts` | — | No changes (already has Worker+SAB architecture) |
| `test-gearmulator.html` | ✓ Ready | Browser test page for manual verification |

---

## Next Steps

### Immediate (Testing)
1. **Open test page:** http://localhost:5173/test-gearmulator.html
2. **Click "Initialize"** → Device should boot (0.1s)
3. **Check console** → Look for `audioOut=N` (N > 0)
4. **Play note** → Click "Play C4"
5. **Verify audio** → Meter moves + hear sound

### If Audio Works ✅
1. Remove diagnostic console logging from startRenderLoop()
2. Test full Gearmulator UI integration
3. Parameter binding (knobs → WASM CC#)
4. Patch saving/loading
5. Tone integration with ToneEngine

### If Audio Still Silent ❌
1. Check WASM printf output for ESAI register values
2. Verify snapshot load is happening (`"Snapshot loaded"` message)
3. Check if PCTL (PLL clock) is being restored correctly
4. Consider hardware variant differences (Virus B vs C vs TI vs Waldorf)

---

## Previous Session Notes

From `progress-report-2026-03-06.md`:
- **Problem identified:** ESAI disabled after snapshot restore
- **Root cause:** Memory values loaded but C++ peripheral state not updated
- **Solution:** Re-apply ESAI registers via writeTransmitControlRegister/writeReceiveControlRegister
- **Status:** Fix compiled into WASM, ready for testing

---

## Verification Checklist

- [x] Type check passes
- [x] WASM module rebuilt with ESAI fix
- [x] Render loop enabled in Worker
- [x] Diagnostic logging added
- [ ] Browser test (pending)
- [ ] Audio output confirmed (pending)
- [ ] Parameter binding (pending)
- [ ] UI integration (pending)

---

**Ready for testing!** 🎛️
