# WASM Audio Effects — Porting Guide

> **Everything we've learned** about building, debugging, and deploying WASM-based
> audio effects in DEViLBOX. Follow this guide and you'll avoid every pitfall we've hit.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Two WASM Patterns](#two-wasm-patterns)
3. [Pattern A: Embind (C++ Class Binding)](#pattern-a-embind-c-class-binding)
4. [Pattern B: C-Style (EMSCRIPTEN_KEEPALIVE)](#pattern-b-c-style-emscripten_keepalive)
5. [The AudioWorklet — Memory Capture](#the-audioworklet--memory-capture)
6. [TypeScript Effect Class](#typescript-effect-class)
7. [Parameter Routing](#parameter-routing)
8. [Building & Deploying](#building--deploying)
9. [Checklist for New Effects](#checklist-for-new-effects)
10. [Known Pitfalls & Bugs We've Hit](#known-pitfalls--bugs-weve-hit)
11. [Testing & Verification](#testing--verification)
12. [File Locations Reference](#file-locations-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (React)                                                      │
│  MasterEffectsPanel → store → EffectParameterEngine              │
└────────────────────────┬────────────────────────────────────────┘
                         │ sendParam() / postMessage
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  AudioWorklet (runs on audio thread)                             │
│  - Receives params via port.onmessage                            │
│  - Copies audio to WASM heap → calls process() → copies back    │
│  - Shared WASM module (single instance, all processors share)    │
└────────────────────────┬────────────────────────────────────────┘
                         │ WASM function call
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  WASM DSP Engine (C/C++ compiled with Emscripten)                │
│  - Pure DSP: process(inL, inR, outL, outR, numSamples)          │
│  - Parameter storage and conversion                              │
│  - No audio API calls — purely computational                     │
└─────────────────────────────────────────────────────────────────┘
```

### Signal Flow in the Browser

```
Tone.js input → [rawInput GainNode]
                    ├→ [dryGain] → [output]
                    └→ [AudioWorkletNode (WASM)] → [wetGain] → [output]
```

The TS effect class manages dry/wet mixing via native GainNodes.
The worklet outputs 100% wet signal. Dry/wet is controlled outside the worklet.

---

## Two WASM Patterns

| Feature | Embind (Pattern A) | C-Style (Pattern B) |
|---------|-------------------|---------------------|
| **C++ API** | Class with virtual methods | Free functions with handle |
| **Binding** | `--bind` flag + `EMSCRIPTEN_BINDINGS` | `EMSCRIPTEN_KEEPALIVE` + `extern "C"` |
| **JS usage** | `new Module.EffectClass()` → `effect.process(...)` | `Module._effect_create(sr)` → handle |
| **State** | Managed by C++ object | Managed via opaque handle (int) |
| **Memory** | `_malloc`/`_free` for buffers | `_malloc`/`_free` for buffers |
| **Used by** | SpringReverb, MVerb, Leslie, MoogFilters, ShimmerReverb, GranularFreeze | RETapeEcho, SpaceyDelayer, KissOfShame, TapeSimulator |

**Choose Embind** for new effects — it's cleaner and the base class provides param metadata for free.

---

## Pattern A: Embind (C++ Class Binding)

### Step 1: C++ Effect Class

Create `YourEffect.cpp` in `juce-wasm/youreffect/`:

```cpp
#include "WASMEffectBase.h"
#include <cstring>
#include <cmath>
#include <algorithm>

namespace devilbox {

enum YourEffectParam {
    PARAM_DECAY   = 0,
    PARAM_MIX     = 1,
    PARAM_COUNT   = 2
};

static const char* PARAM_NAMES[PARAM_COUNT] = { "Decay", "Mix" };
static const float PARAM_MINS[PARAM_COUNT]  = { 0.0f, 0.0f };
static const float PARAM_MAXS[PARAM_COUNT]  = { 1.0f, 1.0f };
static const float PARAM_DEFAULTS[PARAM_COUNT] = { 0.5f, 0.5f };

class YourEffect : public WASMEffectBase {
public:
    YourEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~YourEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);  // MUST call base
        // Init your DSP state here
    }

    void process(float* inputL, float* inputR,
                float* outputL, float* outputR, int numSamples) override
    {
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_) {
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        const float mix = params_[PARAM_MIX];
        const float dry = 1.0f - mix;

        for (int i = 0; i < numSamples; ++i) {
            float wetL = /* your DSP */ inputL[i];
            float wetR = /* your DSP */ inputR[i];

            // ALWAYS soft clip output to prevent distortion
            outputL[i] = inputL[i] * dry + tanhf(wetL) * mix;
            outputR[i] = inputR[i] * dry + tanhf(wetR) * mix;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        params_[paramId] = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
    }

    float getParameter(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? params_[paramId] : 0.0f;
    }

    int getParameterCount() const override { return PARAM_COUNT; }
    const char* getParameterName(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_NAMES[paramId] : "";
    }
    float getParameterMin(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MINS[paramId] : 0.0f;
    }
    float getParameterMax(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MAXS[paramId] : 1.0f;
    }
    float getParameterDefault(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_DEFAULTS[paramId] : 0.0f;
    }

private:
    float params_[PARAM_COUNT];
};

// *** CRITICAL: This macro MUST be inside the namespace ***
#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(YourEffect)
#endif

} // namespace devilbox
```

### Step 2: CMakeLists.txt

Create `juce-wasm/youreffect/CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.15)
project(YourEffectWASM VERSION 1.0.0)

add_executable(YourEffectWASM YourEffect.cpp)

target_include_directories(YourEffectWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common    # For WASMEffectBase.h
)

set_target_properties(YourEffectWASM PROPERTIES
    OUTPUT_NAME "YourEffect"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/youreffect"
)

target_link_options(YourEffectWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createYourEffectModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(YourEffectWASM PRIVATE -O3 -std=c++17)
```

### Step 3: Build

```bash
mkdir -p juce-wasm/youreffect/build
cd juce-wasm/youreffect/build
emcmake cmake ..
emmake make -j4
# Output: public/youreffect/YourEffect.js + YourEffect.wasm
```

---

## Pattern B: C-Style (EMSCRIPTEN_KEEPALIVE)

For effects ported from C codebases or where you want a simpler API.

### C++ API

```cpp
#include <emscripten.h>

struct MyEffect { /* DSP state */ };

extern "C" {

EMSCRIPTEN_KEEPALIVE
int my_effect_create(int sampleRate) {
    auto* inst = new MyEffect();
    inst->init(sampleRate);
    return reinterpret_cast<int>(inst);  // return opaque handle
}

EMSCRIPTEN_KEEPALIVE
void my_effect_destroy(int handle) {
    delete reinterpret_cast<MyEffect*>(handle);
}

EMSCRIPTEN_KEEPALIVE
void my_effect_process(int handle, float* inL, float* inR,
                       float* outL, float* outR, int numSamples) {
    auto* inst = reinterpret_cast<MyEffect*>(handle);
    inst->process(inL, inR, outL, outR, numSamples);
}

EMSCRIPTEN_KEEPALIVE
void my_effect_set_param(int handle, float value) {
    auto* inst = reinterpret_cast<MyEffect*>(handle);
    inst->param = value;
}

} // extern "C"
```

### CMakeLists.txt (key differences from Embind)

```cmake
target_link_options(MyEffectWASM PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMyEffect'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_my_effect_create','_my_effect_destroy','_my_effect_process','_my_effect_set_param']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--no-entry"
    # NO --bind flag! C-style doesn't use Embind
)
```

**Note:** No `--bind` flag. Functions are exported by name via `EXPORTED_FUNCTIONS`.

---

## The AudioWorklet — Memory Capture

### ⚠️ CRITICAL: Emscripten 4.x Memory Access

**Emscripten 4.x no longer auto-exports `HEAPF32` on the module object.** This is the
single most common cause of silent WASM effects. If your worklet does `this.module.HEAPF32`
and gets `undefined`, all buffer views will fail and the worklet silently passes through.

### The Fix: WebAssembly.instantiate Interception

Every worklet **MUST** use this pattern to capture the WASM Memory object:

```javascript
// Polyfill URL for AudioWorklet scope (Emscripten needs it)
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path, base) {
      this.href = base ? (base + '/' + path) : path;
      this.pathname = path;
    }
    toString() { return this.href; }
  };
}

// Shared module singleton (one WASM instance per AudioWorklet scope)
let sharedModule = null;
let sharedModulePromise = null;

async function getOrCreateModule(wasmBinary, jsCode) {
  if (sharedModule) return sharedModule;
  if (sharedModulePromise) return sharedModulePromise;

  sharedModulePromise = (async () => {
    // Evaluate the Emscripten JS glue to get factory function
    const wrappedCode = jsCode + '\nreturn createYourEffectModule;';
    const createModule = new Function(wrappedCode)();

    if (typeof createModule !== 'function') {
      sharedModulePromise = null;
      throw new Error('Could not load module factory');
    }

    // *** THIS IS THE KEY PART ***
    // Intercept WebAssembly.instantiate to capture WASM Memory
    let capturedMemory = null;
    const origInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function(...args) {
      const result = await origInstantiate.apply(this, args);
      const instance = result.instance || result;
      if (instance.exports) {
        for (const value of Object.values(instance.exports)) {
          if (value instanceof WebAssembly.Memory) {
            capturedMemory = value;
            break;
          }
        }
      }
      return result;
    };

    let Module;
    try {
      Module = await createModule({ wasmBinary });
    } finally {
      WebAssembly.instantiate = origInstantiate;  // Always restore
    }

    // Store captured memory on Module
    if (capturedMemory && !Module.wasmMemory) {
      Module.wasmMemory = capturedMemory;
    }

    sharedModule = Module;
    return Module;
  })();

  return sharedModulePromise;
}
```

### Creating Buffer Views

After module init, create Float32Array views into WASM memory:

```javascript
// Allocate buffers
this.inPtrL = Module._malloc(128 * 4);  // 128 samples × 4 bytes/float
this.inPtrR = Module._malloc(128 * 4);
this.outPtrL = Module._malloc(128 * 4);
this.outPtrR = Module._malloc(128 * 4);

// Get memory buffer (with HEAPF32 fallback)
const wasmMem = Module.wasmMemory;
const heapBuffer = Module.HEAPF32
  ? Module.HEAPF32.buffer
  : (wasmMem ? wasmMem.buffer : null);

if (!heapBuffer) {
  throw new Error('Cannot access WASM memory buffer');
}

this._wasmMemory = wasmMem;

// Create typed array views
this.inBufL = new Float32Array(heapBuffer, this.inPtrL, 128);
this.inBufR = new Float32Array(heapBuffer, this.inPtrR, 128);
this.outBufL = new Float32Array(heapBuffer, this.outPtrL, 128);
this.outBufR = new Float32Array(heapBuffer, this.outPtrR, 128);
```

### Handle Memory Growth in process()

If `ALLOW_MEMORY_GROWTH=1`, the buffer can be detached on growth. Check every frame:

```javascript
process(inputs, outputs) {
  // Refresh views if memory grew (buffer detached)
  if (this._wasmMemory && this.inBufL
      && this.inBufL.buffer !== this._wasmMemory.buffer) {
    const buf = this._wasmMemory.buffer;
    this.inBufL = new Float32Array(buf, this.inPtrL, 128);
    this.inBufR = new Float32Array(buf, this.inPtrR, 128);
    this.outBufL = new Float32Array(buf, this.outPtrL, 128);
    this.outBufR = new Float32Array(buf, this.outPtrR, 128);
  }

  // Copy input → WASM heap
  this.inBufL.set(inputL.subarray(0, numSamples));
  this.inBufR.set(inputR.subarray(0, numSamples));

  // Call WASM process
  this.effect.process(this.inPtrL, this.inPtrR,
                      this.outPtrL, this.outPtrR, numSamples);

  // Copy WASM heap → output
  outputL.set(this.outBufL.subarray(0, numSamples));
  outputR.set(this.outBufR.subarray(0, numSamples));
  return true;
}
```

### Why Shared Module?

Each Emscripten module allocates ~16MB of memory. AudioWorklets can be instantiated
multiple times (e.g., multiple reverb instances). Sharing one WASM module prevents
memory exhaustion in the audio thread.

---

## TypeScript Effect Class

### Template (Embind pattern)

```typescript
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

// WASM parameter IDs (must match C++ enum exactly)
const PARAM_DECAY = 0;
const PARAM_MIX   = 1;

export interface YourEffectOptions {
  decay?: number;  // 0-1
  wet?: number;    // 0-1
}

// Static caches
let wasmBinary: ArrayBuffer | null = null;
let jsCode: string | null = null;
const loadedContexts = new Set<BaseAudioContext>();

export class YourEffect extends Tone.ToneAudioNode {
  readonly name = 'YourEffect';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private dryGain: Tone.Gain;
  private wetGain: Tone.Gain;
  private workletNode: AudioWorkletNode | null = null;
  private isWasmReady = false;
  private pendingParams: Array<{ paramId: number; value: number }> = [];
  private _options: Required<YourEffectOptions>;

  constructor(options: Partial<YourEffectOptions> = {}) {
    super();
    this._options = {
      decay: options.decay ?? 0.5,
      wet: options.wet ?? 1.0,
    };

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.dryGain = new Tone.Gain(1 - this._options.wet);
    this.wetGain = new Tone.Gain(this._options.wet);

    // Wire dry path immediately
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    // Start WASM init (async, non-blocking)
    this._initWorklet();
  }

  private async _initWorklet(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      await YourEffect.ensureInitialized(rawContext);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(rawContext, 'your-effect-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Listen for ready signal
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isWasmReady = true;
          // Send all initial params
          this.sendParam(PARAM_DECAY, this._options.decay);
          // Flush pending
          for (const p of this.pendingParams) {
            this.workletNode!.port.postMessage({
              type: 'parameter', paramId: p.paramId, value: p.value
            });
          }
          this.pendingParams = [];
          // Connect WASM into signal path
          this._swapToWasm();
        }
      };

      // Send init message with WASM binary
      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: rawContext.sampleRate,
        wasmBinary,
        jsCode,
      });
    } catch (err) {
      console.warn('[YourEffect] WASM init failed:', err);
    }
  }

  private _swapToWasm(): void {
    if (!this.workletNode) return;
    const rawInput = getNativeAudioNode(this.input);
    const rawWet = getNativeAudioNode(this.wetGain);
    if (!rawInput || !rawWet) return;

    // Connect WASM node
    rawInput.connect(this.workletNode);
    this.workletNode.connect(rawWet);

    // Keepalive: silent connection to destination ensures scheduling
    const rawContext = Tone.getContext().rawContext as AudioContext;
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    this.workletNode.connect(keepalive);
    keepalive.connect(rawContext.destination);
  }

  sendParam(paramId: number, value: number): void {
    if (!this.isWasmReady || !this.workletNode) {
      this.pendingParams.push({ paramId, value });
      return;
    }
    this.workletNode.port.postMessage({
      type: 'parameter', paramId, value
    });
  }

  // Public setters
  setDecay(value: number): void {
    this._options.decay = value;
    this.sendParam(PARAM_DECAY, value);
  }

  get wet(): number { return this._options.wet; }
  set wet(value: number) {
    this._options.wet = Math.max(0, Math.min(1, value));
    this.dryGain.gain.value = 1 - this._options.wet;
    this.wetGain.gain.value = this._options.wet;
  }

  private static async ensureInitialized(context: AudioContext): Promise<void> {
    if (loadedContexts.has(context)) return;
    const baseUrl = import.meta.env.BASE_URL || '/';

    await context.audioWorklet.addModule(`${baseUrl}youreffect/YourEffect.worklet.js`);

    if (!wasmBinary || !jsCode) {
      const [wasmResp, jsResp] = await Promise.all([
        fetch(`${baseUrl}youreffect/YourEffect.wasm`),
        fetch(`${baseUrl}youreffect/YourEffect.js`),
      ]);
      wasmBinary = await wasmResp.arrayBuffer();
      let code = await jsResp.text();
      code = code.replace(/import\.meta\.url/g, "'.'")
                 .replace(/export\s+default\s+\w+;?/g, '');
      jsCode = code;
    }

    loadedContexts.add(context);
  }

  dispose(): this {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
    }
    this.dryGain.dispose();
    this.wetGain.dispose();
    super.dispose();
    return this;
  }
}
```

---

## Parameter Routing

### EffectParameterEngine

When the user turns a knob, the store updates, `MasterEffectsChain.updateMasterEffectParams()`
detects the diff, and calls `EffectParameterEngine.updateEffectParams()`:

```typescript
// src/engine/tone/EffectParameterEngine.ts
case 'YourEffect':
  if (node instanceof YourEffect) {
    // Store values are in UI-friendly ranges
    // Convert to DSP ranges before sending
    if ('decay' in changed) node.setDecay(Number(changed.decay) / 100);
    if ('mix' in changed) node.setMix(Number(changed.mix) / 100);
  }
  break;
```

### EffectFactory

Register defaults and construction:

```typescript
// src/engine/factories/EffectFactory.ts

// In getDefaultEffectParameters():
case 'YourEffect':
  return { decay: 50, mix: 50 };  // UI-friendly ranges (0-100)

// In getDefaultEffectWet():
case 'YourEffect':
  return 100;  // Full wet by default

// In createEffectNode():
case 'YourEffect': {
  const { YourEffect } = await import('@engine/effects/YourEffect');
  node = new YourEffect({
    decay: (Number(p.decay) || 50) / 100,  // Convert UI → DSP range
    wet: wetValue,
  });
  break;
}
```

### Value Range Convention

| Layer | Range | Example |
|-------|-------|---------|
| UI Store (`effect.parameters`) | Human-readable | `decay: 70` (means 70%) |
| EffectParameterEngine | Converts | `node.setDecay(0.7)` |
| TS Effect class | 0-1 normalized | `sendParam(PARAM_DECAY, 0.7)` |
| WASM C++ | 0-1 internally | `params_[PARAM_DECAY] = 0.7f` |

**Rule: The TS effect class always receives 0-1. EffectParameterEngine does the conversion.**

---

## Building & Deploying

### Build Commands

```bash
# First build (creates build dir)
mkdir -p juce-wasm/youreffect/build
cd juce-wasm/youreffect/build
emcmake cmake ..
emmake make -j4

# Subsequent builds
cd juce-wasm/youreffect/build
emmake make -j4

# If you changed a HEADER file (CMake may not detect it):
rm -rf CMakeCache.txt CMakeFiles
emcmake cmake ..
emmake make -j4
```

### Output Locations

Some effects output directly to `public/`. Others output to `juce-wasm/public/` and
need manual copying:

```bash
# Check where it outputs:
grep RUNTIME_OUTPUT_DIRECTORY juce-wasm/youreffect/CMakeLists.txt

# If it outputs to juce-wasm/public/:
cp juce-wasm/public/youreffect/YourEffect.{js,wasm} public/youreffect/
```

### Browser Caching

After rebuilding WASM, the browser caches the old binary. Users (and you) **must
hard reload** (Cmd+Shift+R / Ctrl+Shift+R) to pick up new WASM files.

---

## Checklist for New Effects

### Files to Create

- [ ] `juce-wasm/youreffect/YourEffect.cpp` — C++ DSP
- [ ] `juce-wasm/youreffect/CMakeLists.txt` — Build config
- [ ] `public/youreffect/YourEffect.worklet.js` — AudioWorklet processor
- [ ] `src/engine/effects/YourEffect.ts` — TypeScript wrapper

### Files to Modify

- [ ] `src/constants/unifiedEffects.ts` — **Add to `AVAILABLE_EFFECTS` array** (THIS IS THE EFFECTS BROWSER — without it the effect won't appear in the UI!)
- [ ] `src/engine/factories/EffectFactory.ts` — Add to `getDefaultEffectParameters()`, `getDefaultEffectWet()`, `createEffectNode()`
- [ ] `src/engine/tone/EffectParameterEngine.ts` — Add case block for param routing
- [ ] `src/engine/tone/MasterEffectsChain.ts` — Add import if needed
- [ ] `src/types/instrument/effects.ts` — Add `'YourEffect'` to `AudioEffectType` union
- [ ] `src/components/effects/editors/` — Create UI editor component
- [ ] `src/components/effects/editors/index.tsx` — Register in `EFFECT_EDITORS` map + `ENCLOSURE_COLORS`

### Verification

- [ ] `npm run type-check` passes
- [ ] WASM binary loads in Node.js: `process` method exists
- [ ] Worklet captures memory (check console for init errors)
- [ ] Knobs change audio (measure RMS delta with MCP `get_audio_level`)
- [ ] No distortion at default settings
- [ ] No runaway feedback at extreme settings
- [ ] Hard reload in browser loads new WASM

---

## Known Pitfalls & Bugs We've Hit

### 1. Embind Base Class — `process()` undefined (CRITICAL)

**Symptom:** Effect loads, no errors, but audio passes through unchanged.
Knob changes have no effect on audio.

**Cause:** If `EXPORT_WASM_EFFECT` doesn't declare the base class relationship,
Embind silently drops methods defined only in the base class (like `process()`).
The worklet's `try/catch` in `process()` catches the TypeError and falls through
to passthrough mode.

**Fix:** The `EXPORT_WASM_EFFECT` macro must use `emscripten::base<WASMEffectBase>`:

```cpp
emscripten::class_<ClassName, emscripten::base<WASMEffectBase>>(#ClassName)
    .constructor<>();
```

**How to verify:** In Node.js, check that `effect.process` is `function`, not `undefined`.

### 2. HEAPF32 Missing in Emscripten 4.x (CRITICAL)

**Symptom:** Effect WASM loads, worklet initializes, `ready` message sent,
but audio is completely silent (not even passthrough).

**Cause:** Emscripten 4.x removed auto-export of `HEAPF32`. The worklet
can't create Float32Array views into WASM memory, so `process()` returns
without writing any output.

**Fix:** Use the WebAssembly.instantiate interception pattern to capture
the Memory object. See [Memory Capture section](#the-audioworklet--memory-capture).

### 3. processJS Signature — uintptr_t vs unsigned int

**Symptom:** Compilation error or undefined behavior on 64-bit WASM.

**Cause:** Emscripten Embind doesn't support `uintptr_t` as a parameter type.

**Fix:** Use `unsigned int` in the `processJS` wrapper signature:

```cpp
void processJS(unsigned int inLPtr, unsigned int inRPtr,
               unsigned int outLPtr, unsigned int outRPtr, int numSamples)
```

### 4. CMake Header Change Not Detected

**Symptom:** You changed `WASMEffectBase.h` but `emmake make` says "nothing to do."

**Fix:** Delete CMake cache and reconfigure:

```bash
cd juce-wasm/youreffect/build
rm -rf CMakeCache.txt CMakeFiles
emcmake cmake ..
emmake make -j4
```

### 5. No Output Soft Clipping → Distortion

**Symptom:** Effect works but produces harsh distortion at moderate settings,
especially with resonant filters or feedback loops.

**Fix:** Always `tanhf()` your wet output and feedback paths:

```cpp
// Feedback path — prevent energy buildup
feedback = tanhf(feedback);

// Output — prevent clipping to speakers
outputL[i] = inputL[i] * dry + tanhf(wetL) * mix;
```

### 6. Worklet Returns Without Writing Output

**Symptom:** Complete silence (not even dry signal through worklet).

**Cause:** Early return in `process()` before writing to outputs:

```javascript
// BAD: returns true without writing anything to output
if (!this.inBufL || !this.outBufL) {
  return true;  // outputs stay as zeros = silence
}
```

**Fix:** If buffer views aren't ready, pass through input:

```javascript
if (!this.inBufL || !this.outBufL) {
  // Passthrough until WASM is ready
  for (let ch = 0; ch < output.length; ch++) {
    if (input[ch]) output[ch].set(input[ch]);
  }
  return true;
}
```

### 7. Wrong Parameter Keys in EffectParameterEngine

**Symptom:** Knob visually moves but audio doesn't change.

**Cause:** The `case` block in EffectParameterEngine uses a different key
than what the store/UI sends. Example: store sends `drive` but engine checks
for `distortion`.

**Fix:** Always verify parameter keys match between:
- `getDefaultEffectParameters()` (key names)
- Editor component (`onUpdateParameter('keyName', value)`)
- EffectParameterEngine (`if ('keyName' in changed)`)

### 8. Decay/Feedback Range Too Wide

**Symptom:** Effect sounds OK at low settings but becomes a wall of noise at 70%+.

**Fix:** Map the 0-1 parameter to a musically useful range in C++:

```cpp
// BAD: full range = runaway at high values
const float decay = params_[PARAM_DECAY];  // 0 to 1.0

// GOOD: capped at safe maximum
const float decay = 0.3f + params_[PARAM_DECAY] * 0.45f;  // 0.3 to 0.75
```

---

## Testing & Verification

### Node.js WASM Test (Embind)

```javascript
// test-effect.mjs
import fs from 'fs';

const wasmBuf = fs.readFileSync('public/youreffect/YourEffect.wasm');
const jsCode = fs.readFileSync('public/youreffect/YourEffect.js', 'utf8');
const fn = new Function(jsCode + '; return createYourEffectModule;')();
const m = await fn({ wasmBinary: wasmBuf });

const e = new m.YourEffect();

// Verify all methods exist
console.log('process:', typeof e.process);       // must be "function"
console.log('setParameter:', typeof e.setParameter);
console.log('initialize:', typeof e.initialize);

// Test processing
e.initialize(48000);
e.setParameter(0, 0.8);  // decay

const sz = 128;
const inL = m._malloc(sz * 4);
const outL = m._malloc(sz * 4);
// ... (use setValue/getValue to write/read samples)

e.delete();  // Clean up Embind object
```

### Live Browser Test (MCP)

```
# Add the effect
add_master_effect(type: "YourEffect", position: 0)

# Wait for WASM init (5 seconds)
# Then measure audio level with effect on vs off
get_audio_level(durationMs: 2000)

# Change a param and re-measure
update_master_effect_param(effectIndex: 0, param: "decay", value: 80)
get_audio_level(durationMs: 2000)

# Compare RMS — if delta > 0.01, knobs are working
```

---

## File Locations Reference

| File | Purpose |
|------|---------|
| `juce-wasm/common/WASMEffectBase.h` | Base class + Embind macros |
| `juce-wasm/<effect>/` | C++ source + CMakeLists |
| `juce-wasm/<effect>/build/` | CMake build directory |
| `public/<effect>/Effect.js` | Emscripten JS glue |
| `public/<effect>/Effect.wasm` | Compiled WASM binary |
| `public/<effect>/Effect.worklet.js` | AudioWorklet processor |
| `src/engine/effects/<Effect>.ts` | TypeScript Tone.js wrapper |
| `src/engine/factories/EffectFactory.ts` | Defaults + construction |
| `src/engine/tone/EffectParameterEngine.ts` | Store → DSP param routing |
| `src/engine/tone/MasterEffectsChain.ts` | Effect chain management |
| `src/components/effects/editors/` | React knob/button UIs |

### Existing Embind Effects (reference implementations)

| Effect | Directory | Best Reference For |
|--------|-----------|-------------------|
| SpringReverb | `juce-wasm/springreverb/` | Complete example, clean code |
| MVerb | `juce-wasm/mverb/` | Third-party DSP integration |
| ShimmerReverb | `juce-wasm/shimmer-reverb/` | Feedback loops, soft clipping |
| MoogFilters | `juce-wasm/moogfilters/` | Multiple DSP models, drive |
| GranularFreeze | `juce-wasm/granular-freeze/` | Complex state management |
| Leslie | `juce-wasm/leslie/` | Modulation effects |

### Existing C-Style Effects

| Effect | Directory | Best Reference For |
|--------|-----------|-------------------|
| RETapeEcho | `re-tape-echo-wasm/` | Tape delay, C-style API |
| SpaceyDelayer | `spacey-delayer-wasm/` | Multi-tap delay |
| KissOfShame | `kissofshame-wasm/` | Complex DSP chain |
