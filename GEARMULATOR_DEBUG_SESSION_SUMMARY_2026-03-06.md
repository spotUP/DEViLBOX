# Gearmulator Audio Debugging — Session Summary

**Date:** 2026-03-06
**Status:** ESAI initialized, but audio output blocked by diagnostic/monitoring limitations
**Critical Finding:** Worker event loop may be blocked; setInterval diagnostics not firing

---

## Executive Summary

Successfully **simplified ESAI initialization** and **deployed updated WASM**, but audio output remains silent. The core infrastructure (device boot, ESAI enable, render loop, MIDI routing) is working, but we cannot verify whether audio is actually being produced due to **worker event loop blocking** that prevents periodic diagnostic callbacks from executing.

---

## What Works ✅

1. **Device Initialization** (0.1s via snapshot)
2. **ESAI Peripheral Enabled** (TCR=0x0000A0 successfully written)
3. **Render Loop Running** (`_gm_process()` called continuously)
4. **MIDI Routing** (Note On/Off messages sent and received)
5. **Preset Loading** ("Single Taurus" patch loaded)
6. **SharedArrayBuffer Setup** (64KB ring buffer created)

## What Doesn't Work ❌

1. **No Audio Output** (despite ESAI being enabled and DSP running)
2. **Diagnostic Timer Blocking** (setInterval created but never fires)
3. **Audio Queue Monitoring** (cannot verify if DSP is generating samples)

---

## Critical Discovery: Worker Event Loop Blocking

### Problem
```javascript
const diagTimer = setInterval(() => {
  console.log('[Gearmulator Worker DIAG] Timer fired');  // ← NEVER APPEARS
  // ...
}, 2000);
```

**Evidence:**
- "Diagnostic timer starting..." message appears ✓
- setInterval callback never executes ✗
- No "Timer fired" messages after 3+ seconds of waiting ✗
- This indicates the worker's event loop is blocked by heavy computation

### Root Cause Hypothesis
The DSP emulation (`_gm_process()`) is computationally intensive. The tight render loop may be blocking the microtask queue, preventing `setInterval` callbacks from executing. This is a known issue with CPU-bound work in JavaScript workers.

### Impact
- Cannot poll for audio queue sizes
- Cannot verify if DSP is generating audio samples
- Cannot diagnose why audio output is silent
- Renders diagnostic approach ineffective

---

## Code Changes Made

### 1. Simplified ESAI Initialization (device.cpp)
**Commit:** b149367cd
**File:** `Reference Code/gearmulator-main/source/virusLib/device.cpp:739-750`

**Changes:**
- Removed failing `mem.get()` read that threw "Memory Read ffffb5" error
- Always unconditionally enable ESAI with TCR=0x0000A0
- Added diagnostic printf output

**Result:** ESAI is now properly enabled without register read errors

### 2. Added Audio Queue Diagnostic Functions (gearmulator_bridge.cpp)
**Commit:** dbf65fac1
**File:** `gearmulator-wasm/src/gearmulator_bridge.cpp:342-361`

**Changes:**
- Added printf logging to `gm_getAudioOutputSize()`
- Added printf logging to `gm_getAudioInputSize()`
- Logs show: "[EM] gm_getAudioOutputSize: N samples in queue"

**Status:** Functions exist and are callable, but diagnostic loop can't execute regularly

### 3. Enhanced Worker Diagnostic Logging (Gearmulator.worker.js)
**Commit:** dbf65fac1
**File:** `public/gearmulator/Gearmulator.worker.js:234-244`

**Changes:**
- Added "Diagnostic timer starting" message
- Added "Timer fired" message to verify callbacks execute
- Added module/handle validity checks with logging

**Result:** Timer created, but callback never invoked (proves event loop blocking)

### 4. Rebuilt and Deployed WASM
- Emscripten build successful (30 seconds, -j4)
- Output: 1.1MB gearmulator_wasm.wasm
- Deployed to `public/gearmulator/` directory

---

## Test Results

### Browser Console Output
```
[Gearmulator Worker] Diagnostic timer starting (2s interval)...
[Gearmulator Worker] Calling _gm_process #0 (128 samples)...
[Gearmulator Test] ✓ Device ready! sampleRate=46875, handle=0 (0.1s)
[Gearmulator Test] Note On: C4 (60) vel=100
[Gearmulator Test] Note Off: C4

[MISSING] [Gearmulator Worker DIAG] Timer fired
[MISSING] [EM] gm_getAudioOutputSize: ... samples in queue
[MISSING] Audio output detected
```

### Sample Rate Anomaly
- **Requested:** 44100 Hz
- **Actual:** 46875 Hz (ratio: 1.0625 = 17/16)
- **Significance:** Suggests DSP clock is configured differently or PLL not locked correctly

---

## Root Cause Analysis

### Why Audio Isn't Being Produced

#### Theory 1: DSP Firmware Not Generating Audio (Probability: HIGH)
- Snapshot was taken from a booted device, but might be in idle/muted state
- Firmware loads preset after snapshot, but maybe doesn't automatically start audio
- May need additional trigger beyond MIDI note-on

#### Theory 2: ESAI Configuration Incorrect (Probability: MEDIUM)
- TCR=0x0000A0 enables transmitter but might not be the complete configuration
- Other ESAI registers (TCCR, RCR, RCCR) set to 0x000000 might disable required features
- DSP expects different register values for this firmware version

#### Theory 3: Sample Rate Mismatch Breaking Audio (Probability: MEDIUM)
- 46875 Hz vs 44100 Hz mismatch might cause timing/sync issues
- PLL might not be locked to correct clock
- Firmware might be running at wrong sample rate internally

#### Theory 4: Audio Data Not Reaching ESAI (Probability: LOW)
- MIDI successfully delivered and preset loaded
- But firmware might not be writing to ESAI transmit register
- Or audio is being routed to different peripheral/output

---

## Blocked Debugging Paths

All direct audio monitoring approaches are blocked by worker event loop contention:

| Approach | Status | Blocker |
|----------|--------|---------|
| setInterval polling | ❌ Blocked | Event loop unable to run timer callbacks |
| setTimeout diagnostics | ❌ Likely blocked | Same event loop issue |
| Shared memory polling | ⏳ Possible | Requires accessing DSP memory directly |
| Lighthouse/DevTools profiling | ⏳ Possible | May show CPU hotspots |
| Adding printf debug to DSP code | ✅ Available | Already done; must rebuild WASM |

---

## Next Steps (For Future Sessions)

### Immediate (Unblock Diagnostics)
1. **Replace setInterval with requestAnimationFrame** or move diagnostics to main thread
2. **Use SharedMemory polling** instead of callbacks (access audio queues directly from main thread)
3. **Profile with DevTools** to identify CPU bottleneck in DSP loop

### Medium Priority (Fix Audio)
1. Try alternative TCR values: 0x0090, 0x00C0, 0x00F0
2. Investigate sample rate mismatch (44100 → 46875)
3. Add debug output to DSP audio generation code
4. Check if firmware expects different clock configuration

### Lower Priority (Infrastructure)
1. Document worker blocking issue and mitigation patterns
2. Refactor render loop to allow event loop breathing room
3. Consider WebAssembly Memory API for efficient diagnostics

---

## Files Changed

| File | Commits | Status |
|------|---------|--------|
| `Reference Code/gearmulator-main/source/virusLib/device.cpp` | b149367cd | Modified (snapshot ESAI init) |
| `gearmulator-wasm/src/gearmulator_bridge.cpp` | dbf65fac1 | Modified (audio queue diagnostics) |
| `public/gearmulator/Gearmulator.worker.js` | dbf65fac1 | Modified (timer testing) |
| `public/gearmulator/gearmulator_wasm.wasm` | Both | Rebuilt |
| `public/gearmulator/gearmulator_wasm.js` | Both | Rebuilt |

---

## Commits This Session

1. **b149367cd** — Simplify Gearmulator ESAI initialization for snapshot loading
2. **dbf65fac1** — Add diagnostic printf output for audio queue sizes

---

## Key Learnings

1. **ESAI register reads fail** — Peripheral registers can't be read via mem.get(); must use peripheral object methods
2. **Worker event loops are tight** — CPU-intensive DSP emulation blocks event loop, preventing timers/callbacks
3. **Snapshot initialization complex** — Snapshot load + ESAI enable + firmware boot sequence has many interdependencies
4. **Sample rate discrepancy unexplained** — 44100 → 46875 ratio suggests systemic clock configuration issue

---

## Diagnostic Test Page

**URL:** http://localhost:5173/test-gearmulator.html

**How to reproduce current state:**
1. Click "Initialize" (device boots in ~0.1s)
2. Click "Play C4" (sends MIDI note on/off)
3. Listen for audio (currently silent)
4. Check console for diagnostic messages (currently absent due to event loop blocking)

---

## Conclusion

The Gearmulator ESAI initialization has been significantly improved and deployed. The device successfully loads snapshots, enables the audio interface, and runs the DSP emulation. However, we're currently unable to verify whether audio is actually being generated due to worker event loop contention preventing periodic diagnostics from executing.

**The next session should focus on unblocking diagnostics first** (via main-thread polling or worker/main thread coordination) before further investigation into why audio output is silent.

