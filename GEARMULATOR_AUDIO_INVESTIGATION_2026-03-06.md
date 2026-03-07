# Gearmulator Audio Investigation — Session Continuation

**Date:** 2026-03-06 (continued)
**Status:** ESAI initialization simplified, audio still not producing output
**Next:** Determine why DSP firmware isn't generating audio samples despite ESAI being enabled

---

## Current State

### ✅ What's Working
1. **Device Initialization** — Snapshot loads and device boots in 0.1s
2. **ESAI Enabled** — Writes TCR=0x0000A0 successfully (logs show register write execution)
3. **Render Loop Active** — `_gm_process()` is being called regularly
4. **MIDI Routing** — Note On/Off messages reach the worker and firmware loads presets
5. **Microcontroller** — Running, loading "Single Taurus" patch into part 64

### ❌ Still Broken
1. **No Audio Output** — Despite ESAI being enabled and _gm_process running, no audio is heard
2. **Diagnostic Messages Silent** — DIAG console messages aren't appearing (audio queue sizes not logged)
3. **Sample Rate Mismatch** — Requests 44100 Hz, device reports 46875 Hz (1.0625x ratio)

---

## Code Changes Made This Session

### device.cpp (simplified ESAI init)
**Location:** `Reference Code/gearmulator-main/source/virusLib/device.cpp:739-750`

**Previous approach:** Tried to read TCR from memory (failed with "get@177: Memory Read ffffb5"), then conditionally enabled ESAI.

**New approach:** Removed the failing mem.get() read, unconditionally enable ESAI with TCR=0x0000A0.

```cpp
// Enable ESAI audio interface - snapshot typically has it disabled (TCR=0)
// Always explicitly configure ESAI for audio output
auto& periphX = m_dsp->getPeriphX();
auto& esai = periphX.getEsai();

printf("[EM] Enabling ESAI for audio output...\n");
esai.writeTransmitControlRegister(0x0000A0);  // TE=1, TSHFD=1
esai.writeTransmitClockControlRegister(0x000000);
esai.writeReceiveControlRegister(0x000000);
esai.writeReceiveClockControlRegister(0x000000);
printf("[EM] ESAI configuration complete\n");
```

### WASM Rebuilt
- Built with `-j4`: 30 seconds
- Output: `/Users/spot/Code/DEViLBOX/public/gearmulator/gearmulator_wasm.wasm` (1.1MB)
- Deployed and tested in browser

---

## Browser Test Results

### Console Output (Full Initialization)
```
[EM] Loading Virus B snapshot...
[EM] Enabling ESAI for audio output...
[EM] writeTransmitControlRegister@124: Write ESAI TCR 0000a0
[EM] writeSlotToFrame@311: ESAI transmit underrun, written is 000000, enabled is 000020
[EM] writeTransmitClockControlRegister@138: Write ESAI TCCR 000000
[EM] writeReceiveControlRegister@109: Write ESAI RCR 000000
[EM] writeReceiveClockControlRegister@152: Write ESAI RCCR 000000
[EM] ESAI configuration complete
[EM] Snapshot loaded: P/X/Y memory loaded, boot skipped
[EM] writeSingle@985: Loading Single Taurus  JS to part 64
[EM] sendPreset@337: Send to DSP: Single to program 64
[Gearmulator Worker] Device ready — handle=0, sampleRate=46875, type=0
[Gearmulator Worker] Starting render loop...
```

### MIDI Test
```
[Gearmulator Test] Note On: C4 (60) vel=100
[Gearmulator Test] Note Off: C4
```

✓ MIDI messages sent and received
✗ No audio output heard
✗ Diagnostic DIAG messages not appearing in console

---

## Investigation Hypotheses

### Hypothesis 1: Sample Rate Mismatch (46875 vs 44100)
The device reports 46875 Hz when requested 44100 Hz.
- **Calculation:** 46875 / 44100 ≈ 1.0625 (which is 17/16)
- **Possible causes:** Incorrect DSP clock configuration, PLL not locked to correct frequency, or firmware expects different clock
- **Impact:** Could cause timing sync issues between DSP and Web Audio

### Hypothesis 2: DSP Firmware Not Generating Audio
The snapshot was taken from a booted device, but might be in an idle state.
- **Evidence:** "writeSingle@985: Loading Single Taurus JS to part 64" appears AFTER snapshot loads
- **Possible cause:** Firmware loads preset, but might need additional trigger or initialization
- **Impact:** DSP might be running but not actually producing audio samples

### Hypothesis 3: ESAI Configuration Incomplete
The TCR value 0x0000A0 might not be the correct configuration for audio.
- **Bits set:** TE (bit 7) + TSHFD (bit 5)
- **Bits NOT set:** PADC (bit 4), audio slot config
- **Possible fix:** Try TCR=0x0000C0 or TCR=0x0000F0 (more bits enabled)

### Hypothesis 4: Transmit Underrun During Init
The console shows "transmit underrun, written is 000000, enabled is 000020"
- **Meaning:** ESAI is looking for audio data but buffer is empty
- **Normal behavior:** Expected on first frame while DSP hasn't written data yet
- **Issue:** If underrun persists, firmware might not be writing to transmitter

### Hypothesis 5: Diagnostic Timer Broken
DIAG console messages aren't appearing, even though render loop is running.
- **Expected:** `[Gearmulator Worker DIAG] audioIn=X, audioOut=Y` every 2 seconds
- **Actual:** No DIAG messages in console
- **Possible causes:**
  - Worker console output not being captured
  - Diagnostic timer clearing early (module or handle < 0)
  - Functions `_gm_getAudioInputSize` / `_gm_getAudioOutputSize` returning error codes

---

## Next Debugging Steps (Priority Order)

### 1. Fix Diagnostic Timer (Enables Visibility)
**Goal:** Get audio queue sizes visible in console
**Steps:**
1. Check if `_gm_getAudioInputSize` / `_gm_getAudioOutputSize` are being called
2. Verify they return valid sizes (not error codes -1, -2)
3. Add printf debug to gearmulator_bridge.cpp to log what these functions return
4. Rebuild WASM and check if DIAG messages now appear

**Expected output if working:**
```
[Gearmulator Worker DIAG] audioIn=0, audioOut=256
[Gearmulator Worker DIAG] audioOut=512
[Gearmulator Worker DIAG] ✓ ESAI producing output!
```

### 2. Investigate Sample Rate Mismatch
**Goal:** Understand why 44100 becomes 46875
**Steps:**
1. Check `DspSingle::setSamplerate()` / `getSamplerate()` in reference code
2. Look for clock divider configurations (PCTL, clock multipliers)
3. Verify PLL initialization in snapshot
4. Check if Virus B firmware has a known sample rate adjustment

### 3. Test Alternative ESAI Configurations
**Goal:** Find the correct TCR value
**Options to try:**
- TCR=0x00C0 (TE + TSHFD, no others)
- TCR=0x00F0 (TE + TSHFD + extra bits)
- TCR=0x0090 (TE + PADC, the original attempted value)

### 4. Add Audio Data Validation
**Goal:** Confirm DSP is writing audio to ESAI
**Steps:**
1. Add debug output in writeSlotToFrame to log actual audio values
2. Check if m_tx buffer contains non-zero values
3. Verify DMA is being triggered for transmit data
4. Check if firmware is in expected state

---

## Files Modified

| File | Status | Changes |
|------|--------|---------|
| `Reference Code/gearmulator-main/source/virusLib/device.cpp` | ✅ Modified | Simplified ESAI init (lines 739-750) |
| `gearmulator-wasm/build/gearmulator_wasm.wasm` | ✅ Rebuilt | Contains simplified ESAI code |
| `gearmulator-wasm/build/gearmulator_wasm.js` | ✅ Rebuilt | Emscripten glue code |
| `public/gearmulator/gearmulator_wasm.wasm` | ✅ Updated | Deployed to static files |
| `public/gearmulator/gearmulator_wasm.js` | ✅ Updated | Deployed to static files |

---

## Commits

- **b149367cd:** feat: simplify Gearmulator ESAI initialization for snapshot loading
  - Removed failing mem.get() read
  - Always enable ESAI unconditionally
  - Added diagnostic logging

---

## Key Insight: ESAI is Being Enabled, But DSP May Not Be Producing Audio

The ESAI peripheral itself is working — the console shows successful register writes. The issue is likely:
1. The DSP firmware isn't generating audio samples, OR
2. The firmware is generating samples but they're not reaching ESAI, OR
3. The ESAI configuration isn't quite right for the Virus B firmware expectations

The next critical debugging step is **enabling the DIAG logging** to see if the audio output queue is actually accumulating samples. That single piece of information will dramatically narrow down where the problem is.

---

## Test Page URL

http://localhost:5173/test-gearmulator.html

**Steps to reproduce:**
1. Click "Initialize" → Device boots in ~0.1s
2. Check console for ESAI configuration messages
3. Click "Play C4" → MIDI note on/off sent
4. Listen for audio (should hear synthesizer tone)
5. Check console for DIAG messages about audio output

