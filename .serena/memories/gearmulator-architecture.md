---
date: 2026-03-07
topic: Gearmulator WASM Architecture
tags: [gearmulator, audio, wasm, worklet, vu-meters]
status: final
---

# Gearmulator WASM Architecture & Per-Channel Level Extraction

## Summary
Gearmulator is a multi-synth VA engine (Access Virus, Waldorf, Nord, Roland) that runs the original firmware via DSP56300 interpreter in WASM. Audio flows through a SharedArrayBuffer (SAB) ring buffer from a Worker (DSP) to an AudioWorklet (playback).

**Current Architecture:** Stereo only (L/R channels) with running peak tracking in the worker.
**Channel Count:** Always 2 (L/R) for output. MIDI input accepts 16 channels but output is stereo.

## File Paths

### Core Files
- **TypeScript Engine:** `/Users/spot/Code/DEViLBOX/src/engine/gearmulator/GearmulatorSynth.ts`
- **C++ Bridge (WASM API):** `/Users/spot/Code/DEViLBOX/gearmulator-wasm/src/gearmulator_bridge.cpp`
- **DSP Worker (Ring Buffer Manager):** `/Users/spot/Code/DEViLBOX/public/gearmulator/Gearmulator.worker.js`
- **AudioWorklet (SAB Reader):** `/Users/spot/Code/DEViLBOX/public/gearmulator/Gearmulator.worklet.js`

## Audio Architecture

### SharedArrayBuffer Layout
```
Header (4 Int32s = 16 bytes):
  [0] = writePos (atomic, worker writes)
  [1] = readPos (atomic, worklet reads/updates)
  [2] = bufferSize (in frames, typically 8192)
  [3] = peakSeen × 1000 (integer, worker writes)

Audio Data (Float32):
  [4..] = interleaved L/R samples (frameCount × 2 floats)
```

### Signal Flow
```
MIDI Input (16 channels)
  → Worker (Gearmulator.worker.js)
    → gm_process(handle, *outL, *outR, numSamples)
    → outputs to HEAP buffers
    → writes interleaved L/R to SAB ring buffer
    → stores peak to SAB[3] for diagnostics
  → SAB Ring Buffer
    → Worklet (Gearmulator.worklet.js)
      → reads from SAB with resampling if needed
      → outputs to AudioWorkletNode (2 channels)
      → AudioWorkletNode connects to this.output (GainNode)
```

### Key Implementation Details

1. **Worker Render Loop (Gearmulator.worker.js:250-273)**
   - Uses `setTimeout(0)` to yield to event loop
   - Renders up to 16 blocks per tick (2048 samples max)
   - Calls `gm_process(handle, outputPtrL, outputPtrR, RENDER_BLOCK)`
   - Interleaves samples into SAB: `sabFloat32[audioOffset + frameIdx * 2] = L, [frameIdx * 2 + 1] = R`
   - Tracks running peak: `if (absL > peakSeen) peakSeen = absL`, etc.
   - Stores peak to SAB[3]: `Atomics.store(sabInt32, 3, Math.round(peakSeen * 1000))`

2. **Worklet Process() (Gearmulator.worklet.js:47-124)**
   - Reads from SAB ring buffer
   - Fast path: direct copy if resampleRatio ≈ 1.0
   - Slow path: linear interpolation resampling if DSP rate ≠ context rate
   - Detects underruns and fills with silence
   - Atomically updates readPos

3. **C++ API (gearmulator_bridge.cpp)**
   - `gm_process()` is the only audio output function (lines 208-231)
   - Takes `float* outputL, float* outputR, uint32_t numSamples`
   - Constructs `TAudioOutputs` struct with [L, R, null, null, ...] (12 ptrs total)
   - All other synth types (Virus, Waldorf, etc.) support only stereo output

## Peak Tracking (Currently Implemented)

The worker already computes a **running peak** per sample:
```cpp
// Worker line 307-308
const absL = sL < 0 ? -sL : sL;
const absR = sR < 0 ? -sR : sR;
if (absL > peakSeen) peakSeen = absL;
if (absR > peakSeen) peakSeen = absR;
```

Stored to SAB[3] every tick (line 322):
```javascript
Atomics.store(sabInt32, 3, Math.round(peakSeen * 1000));
```

This is **stereo-combined** (not per-channel). Can be read from TypeScript:
```javascript
const peakInt = Atomics.load(sabInt32, 3);
const peak = peakInt / 1000.0; // Back to float
```

## Per-Channel Level Extraction Options

### Option 1: Dual Ring Buffers (Recommended)
Create separate SAB ring buffers for L and R channels, update SAB[3] with L peak and SAB[4] with R peak, or extend header to `[writePos, readPos, bufSize, peakL×1000, peakR×1000]` (20 bytes).

**Pros:**
- No additional computation in worker (already tracking L/R separately)
- Just two additional Atomics.store() calls
- Can be polled from TypeScript at any frequency
- No overhead in worklet

**Cons:**
- Requires header extension from 16 to 20 bytes
- Worklet needs to know both peaks (post-message if needed)

### Option 2: RMS Averaging Window
In worker, compute RMS over the last 128 samples per channel, store to SAB as two floats in a rotation buffer or separate slots.

**Pros:**
- Smoother level representation than peak
- More accurate for metering

**Cons:**
- More worker CPU
- Need to manage circular history buffer

### Option 3: AudioWorklet AnalyserNode
Connect a secondary AnalyserNode to the worklet output, call `getByteFrequencyData()` from TypeScript RAF loop.

**Pros:**
- Follows existing pattern in ToneEngine (see ChannelRouting.ts:getChannelLevels)

**Cons:**
- Requires AudioWorklet to expose AnalyserNode via port.postMessage
- Higher latency (one-frame delay)
- Less elegant

## Existing VU Meter Infrastructure

DEViLBOX has well-established per-channel metering:

1. **ToneEngine Pattern** (`src/engine/tone/ChannelRouting.ts:593`)
   ```typescript
   export function getChannelLevels(ctx, numChannels): number[] {
     for (let i = 0; i < numChannels; i++) {
       const db = channelOutput.meter.getValue();
       const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
       levels.push(normalized);
     }
   }
   ```
   - Converts dB to 0-1 range using formula: `(dB + 60) / 60`
   - Used by PixiMixerView, MixerPanel

2. **VU Meter Components:**
   - `src/components/tracker/ChannelVUMeter.tsx` — React component with 12 LED segments
   - `src/components/visualization/ChannelLevelsCompact.tsx` — Canvas-based compact meters
   - `src/pixi/views/tracker/PixiChannelVUMeters.tsx` — Pixi v8 WebGL meters with ProTracker-style swing
   - Animation pattern: DECAY_RATE ≈ 0.88-0.92, decay interval ≈ 35ms

## Recommended Implementation Path

1. **Minimal Change:** Extend SAB header to 20 bytes, add `peakL` and `peakR` (two more Int32 slots)
2. **Worker update:** Store L and R peaks separately:
   ```javascript
   Atomics.store(sabInt32, 3, Math.round(peakL * 1000));
   Atomics.store(sabInt32, 4, Math.round(peakR * 1000));
   ```
3. **TypeScript polling:** Read peaks in RAF loop or on-demand:
   ```typescript
   const peakL = Atomics.load(sabInt32, 3) / 1000;
   const peakR = Atomics.load(sabInt32, 4) / 1000;
   const normalized = [peakL, peakR].map(p => Math.max(0, Math.min(1, (Math.log10(p + 0.0001) * 20 + 60) / 60)));
   ```
4. **UI:** Use existing ChannelVUMeter or ChannelLevelsCompact with normalized levels

## Notes on Channel Count

- **DSP Output:** Strictly stereo (L/R only). Gearmulator processes as a 2-channel device
- **MIDI Input:** Supports 16 MIDI channels for note/CC routing, but output is always mixed to stereo
- **No Per-MIDI-Channel Output:** Cannot extract separate audio streams per MIDI channel
- This is fundamental to the synth architecture — all channels produce one audio output

## Testing Infrastructure

Test file exists at `/Users/spot/Code/DEViLBOX/test-gearmulator-wasm.js` and `test-gearmulator.html` for benchmarking and validation.
