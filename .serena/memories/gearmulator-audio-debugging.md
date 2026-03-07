---
date: 2026-03-06
topic: gearmulator-audio-debugging
tags: [gearmulator, wasm, audio, esai, fix]
status: implemented
---

# Gearmulator WASM Audio Debugging Session

## Problem (Previous Session)
- Device boots from snapshot but `_gm_process()` produces zero audio output
- MIDI messages received but no sound generated
- Audio output buffer stayed at size 0

## Root Cause
**ESAI (audio interface) registers not re-applied after snapshot restore**
- Snapshot loaded raw X-memory values
- But C++ Esai class member variables remained disabled (TCR=0, RCR=0)
- Result: Audio subsystem disabled, no output

## Fix Deployed
Location: `third-party/gearmulator-main/source/virusLib/device.cpp:65-111`
```cpp
// After loading snapshot memory, re-apply ESAI registers
esai.writeTransmitControlRegister(tcr);   // enables TX
esai.writeReceiveControlRegister(rcr);    // enables RX
```
WASM rebuilt: 2026-03-06 13:33

## Architecture
- **Worker:** Instantiates WASM, calls `gm_process()`, writes to SharedArrayBuffer ring buffer
- **Worklet:** Reads from SAB, outputs to Web Audio (was disabled in old design)
- **Main:** Routes MIDI via Worker.postMessage()

## Changes Made (This Session)
1. Enabled render loop in `public/gearmulator/Gearmulator.worker.js`
   - Was disabled for diagnostics, now runs `startRenderLoop()`
2. Added diagnostic console logging
   - Logs audioIn/audioOut queue sizes every 2 seconds
   - First clear sign of success: `audioOut > 0`

## Expected Test Results
- ✓ Device boots in ~0.1s from snapshot
- ✓ Console shows `audioOut=128, 256, ...` (growing)
- ✓ Audio meter moves when note plays
- ✓ Hear sound from speakers

## Verification Commands
```bash
npm run type-check  # Passes ✓
```

## Test URL
http://localhost:5173/test-gearmulator.html

## Critical Symbols
- `gm_process(handle, outL, outR, numSamples)` - main DSP call
- `gm_getAudioOutputSize(handle)` - diagnostic: check if audio produced
- `gm_getAudioInputSize(handle)` - diagnostic: check input queue
- `loadMemorySnapshot()` in device.cpp - where ESAI fix is applied
