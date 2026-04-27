---
date: 2026-04-27
topic: fil4-wasm-eq
tags: [dsp, wasm, eq, dub, master-fx]
status: final
---

# Fil4 WASM Parametric EQ — Design Spec

## Summary

Port Fons Adriaensen's `fil4.lv2` parametric equalizer to WASM, replacing the existing `ParametricEQWASM.cpp` / `ParametricEQEffect.ts`. Integrate as (a) the dub bus return EQ and (b) a new master FX plugin with a visual frequency response curve.

**Why fil4 over the existing code:**
- Regalia-Mitra lattice topology for parametric sections — stable during live coefficient changes (no ring artifacts when sweeping the EQ during a Tubby move)
- Full parameter smoothing on all 8 filter stages — no clicks on automation
- HP + LP pass filters not in current implementation
- Battle-tested DSP from professional broadcast environments

**Approach chosen:** Full fil4 port + WASM-computed magnitude response curve (Approach C).

---

## File Layout

```
fil4-wasm/
  src/
    iir.h / iir.c          # Fons Adriaensen shelf biquads — copy verbatim from x42/fil4.lv2
    filters.h              # Regalia-Mitra parametric sections — copy verbatim
    hip.h                  # High-pass filter — copy verbatim
    lop.h                  # Low-pass filter — copy verbatim
    fil4_wasm.c            # Thin WASM wrapper (replaces lv2.c; no LV2/Cairo deps)
  CMakeLists.txt
  build/                   # emcmake cmake .. && emmake make

public/fil4/
  Fil4.js                  # Emscripten glue (MODULARIZE=1, EXPORT_NAME='createFil4')
  Fil4.wasm
  Fil4.worklet.js          # AudioWorklet processor

src/engine/effects/
  Fil4EqEffect.ts          # ToneAudioNode wrapper — replaces ParametricEQEffect.ts

src/components/effects/
  Fil4EqPanel.tsx          # Master FX panel: curve + band controls
  Fil4EqCurve.tsx          # Canvas curve renderer

# Existing files that change:
src/engine/dub/DubBus.ts           # ParametricEQEffect → Fil4EqEffect (type rename + HP/LP wiring)
src/types/dub.ts                   # Add returnEqHp*/returnEqLp* fields to DubBusSettings
src/engine/tone/MasterEffectsChain.ts  # Add 'fil4eq' effect type
```

`parametric-eq-wasm/` is kept untouched until the new build is verified, then removed.

---

## WASM C API (`fil4_wasm.c`)

8 filter stages, each independently enabled. Processing order matches fil4.lv2:
HP → LowShelf → P1 → P2 → P3 → P4 → HighShelf → LP → output gain

```c
// Lifecycle
int  fil4_create(float sample_rate);    // returns handle 0..MAX_INSTANCES-1, or -1
void fil4_destroy(int handle);

// Processing — stereo, non-interleaved, in-place safe
void fil4_process(int handle, float* L, float* R, int n_samples);

// Band control
void fil4_set_hp(int h, int enabled, float freq_hz, float q);
void fil4_set_lp(int h, int enabled, float freq_hz, float q);
// which: 0=lowshelf, 1=highshelf
void fil4_set_shelf(int h, int which, int enabled,
                    float freq_hz, float gain_db, float q);
// band: 0–3 (four parametric sections, Regalia-Mitra)
void fil4_set_band(int h, int band, int enabled,
                   float freq_hz, float bandwidth, float gain_db);
// Master output gain (linear, default 1.0)
void fil4_set_gain(int h, float gain);

// Curve: writes n magnitude values (dB) into caller-allocated out_db[].
// log_freqs[]: n frequencies in Hz (log-spaced 20–20000 Hz, caller provides).
void fil4_get_magnitude(int h, float* log_freqs, float* out_db, int n);
```

**Build flags (CMakeLists.txt):**
```cmake
-s WASM=1
-s MODULARIZE=1
-s EXPORT_NAME='createFil4'
-s EXPORTED_FUNCTIONS=['_malloc','_free','_fil4_create','_fil4_destroy',
                        '_fil4_process','_fil4_set_hp','_fil4_set_lp',
                        '_fil4_set_shelf','_fil4_set_band','_fil4_set_gain',
                        '_fil4_get_magnitude']
-s INITIAL_MEMORY=4194304
-s ALLOW_MEMORY_GROWTH=1
-O3
```

---

## AudioWorklet (`Fil4.worklet.js`)

- Loads `Fil4.wasm` via `createFil4()`
- Creates a stereo instance at `AudioWorkletProcessor.sampleRate`
- Message protocol (main thread → worklet):

```
{ type: 'set_hp',    enabled, freq, q }
{ type: 'set_lp',    enabled, freq, q }
{ type: 'set_shelf', which, enabled, freq, gain, q }
{ type: 'set_band',  band, enabled, freq, bw, gain }
{ type: 'set_gain',  gain }
{ type: 'get_magnitude', id, freqs: Float32Array }  // freqs transferred
```

- Worklet → main thread:
```
{ type: 'magnitude_result', id, data: Float32Array }  // data transferred
```

- Audio: 128-frame stereo blocks, no latency
- State: worklet owns WASM heap; all parameters applied immediately via smoothing inside WASM

---

## `Fil4EqEffect.ts`

`extends Tone.ToneAudioNode`. Constructor: `new Fil4EqEffect()`.

**Parameter methods:**
```typescript
setHP(enabled: boolean, freq: number, q: number): void
setLP(enabled: boolean, freq: number, q: number): void
setLowShelf(enabled: boolean, freq: number, gainDb: number, q: number): void
setHighShelf(enabled: boolean, freq: number, gainDb: number, q: number): void
setBand(band: 0|1|2|3, enabled: boolean, freq: number, bw: number, gainDb: number): void
setMasterGain(linear: number): void

// Backwards-compat aliases for DubBus (maps to parametric band 0–3):
setB1Freq(hz: number): void    // → setBand(0, ...)
setB2Freq(hz: number): void    // → setBand(1, ...)
setB2Gain(db: number): void    // → setBand(1, ...)
setB2Q(q: number): void        // → setBand(1, ...)
setB3Freq(hz: number): void    // → setBand(2, ...)
setB3Gain(db: number): void    // etc.
setB4Freq(hz: number): void
setB4Gain(db: number): void

// Curve data (async, debounced)
getMagnitude(n: number): Promise<Float32Array>

// Event: fired when any parameter changes
on('params', (snapshot: Fil4Params) => void): void
```

**Internal state** — mirrors all parameters so `getMagnitude` can be called without round-tripping the worklet for display.

---

## `Fil4EqCurve.tsx`

Canvas component: `width=600` `height=160` (configurable via props).

**Rendering:**
- Background: `bg-dark-bgTertiary`
- Grid: vertical lines at 100, 200, 500, 1k, 2k, 5k, 10k Hz (text-muted labels); horizontal lines at ±6, ±12, ±18 dB
- 0 dB line: brighter
- Combined response: 512-point path in `accent-highlight` colour, 2px stroke
- Per-band handles: coloured draggable dots at (freq, gain) — HP/LP in `accent-primary`, shelves in `accent-secondary`, parametric in `accent-warning`
- Disabled bands: handles shown at 50% opacity, no contribution to curve

**Interaction:**
- Drag handle horizontally → updates freq; vertically → updates gain (parametric/shelf) or Q (pass)
- Right-click handle → toggle enabled
- No band selected on mount

**Data flow:**
```
Fil4EqEffect.on('params') → Fil4EqCurve
→ effect.getMagnitude(512)  (calls worklet via postMessage, ~1ms)
→ Float32Array              (transferred back)
→ drawCurve()               (rAF, 60 fps max)
```

---

## `Fil4EqPanel.tsx` (Master FX)

```
┌────────────────────────────────────────────────────────────────┐
│  [Fil4EqCurve — 600×160 canvas]                   GAIN [knob] │
├──────┬─────────┬──────┬──────┬──────┬──────┬─────────┬────────┤
│  HP  │ Lo Shf  │  P1  │  P2  │  P3  │  P4  │ Hi Shf  │   LP   │
│[freq]│[f][g][q]│[f][g]│[f][g]│[f][g]│[f][g]│[f][g][q]│[freq]  │
│[  q ]│[toggle] │[bw]  │[bw]  │[bw]  │[bw]  │[toggle] │[  q  ] │
│[tog] │         │[tog] │[tog] │[tog] │[tog] │         │[tog]   │
└──────┴─────────┴──────┴──────┴──────┴──────┴─────────┴────────┘
```

All knobs use the existing `Knob` component with `paramKey` where applicable.

---

## DubBus Integration

**`DubBusSettings` additions** (`dub.ts`):
```typescript
returnEqHpEnabled: boolean;   // false
returnEqHpFreq: number;       // 20 Hz
returnEqHpQ: number;          // 0.7
returnEqLpEnabled: boolean;   // false
returnEqLpFreq: number;       // 20000 Hz
returnEqLpQ: number;          // 0.7
```

**`DubBus.ts` changes:**
- `private returnEQ: Fil4EqEffect` (was `ParametricEQEffect`)
- Constructor: `this.returnEQ = new Fil4EqEffect()`
- Audio graph unchanged: `midScoop → returnEQ.input`, `returnEQ.output → lpf`
- `applySettings()`: map existing `returnEqB1-B4` fields to `setBand(0-3)`, add HP/LP from new fields

---

## Master FX Integration

**`MasterEffectsChain.ts`:**
- New case `'fil4eq'` in effect factory: `new Fil4EqEffect()`
- Connects via existing chain insertion pattern

**Master FX UI** (existing panel):
- New entry: `{ type: 'fil4eq', label: 'Parametric EQ' }`
- Renders `Fil4EqPanel` when selected

---

## Testing

**Automated:**
- Type-check must pass after all changes
- Existing DubBus tests must pass (backwards-compat aliases cover them)
- Contract test: verify `Fil4EqEffect` exposes all methods that `ParametricEQEffect` exposed

**Manual:**
- Load `world class dub.mod`, enable dub bus, verify no clicks when sweeping `returnEqFreq`
- Enable `fil4eq` master FX, move all 8 band knobs while song plays — no clicks, no silence
- Curve display updates smoothly at 60 fps as bands are moved
- HP + LP toggles work in the dub return path
- Save/load project preserves all EQ settings

---

## Open Questions (none — all resolved)

- Backwards compat: ✅ `setB1-B4` aliases maintained
- Existing tests: ✅ covered by aliases
- `parametric-eq-wasm/` removal: deferred until new build passes manual test
