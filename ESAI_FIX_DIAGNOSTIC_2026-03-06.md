# ESAI Audio Interface Fix — Root Cause Diagnosis
**Date:** 2026-03-06
**Status:** Root cause identified, fix ready to be compiled

---

## Critical Error Found

From test-gearmulator.html console output:
```
[EM] WARNING: Could not get Peripherals56362 for ESAI restore
```

**This message means:** The ESAI register restoration code is NOT executing because the dynamic_cast is failing.

---

## Root Cause

### The Broken Code (device.cpp:71)
```cpp
auto* periph = dynamic_cast<dsp56k::Peripherals56362*>(dsp.getPeriph(0));
if (periph)
{
    // ... ESAI restoration happens here ...
}
else
{
    printf("WARNING: Could not get Peripherals56362 for ESAI restore\n");  // ← We're here
}
```

**Why it fails:**
- `dsp.getPeriph(0)` returns the wrong type (probably `PeripheralsNop*` or a different peripheral)
- `dynamic_cast<Peripherals56362*>` returns `nullptr`
- The entire ESAI restoration block is skipped
- Result: Audio stays disabled

### The Fix (Applied Today)
```cpp
// FIXED: Use direct accessor instead of dynamic_cast
auto& periphX = _dsp.getPeriphX();  // Guaranteed to return Peripherals56362&
auto& esai = periphX.getEsai();

// Now ESAI registers are restored properly...
```

**Why this works:**
- `DspSingle::getPeriphX()` is a direct accessor that always returns `Peripherals56362&`
- No dynamic_cast needed
- No nullptr possibility
- ESAI restoration **always** executes

### File Changed
**Location:** `Reference Code/gearmulator-main/source/virusLib/device.cpp:70-110`

**Status:**
✅ C++ code fixed (lines 70-110 rewritten)
⏳ WASM needs to be rebuilt with fixed C++

---

## What Needs to Happen Next

### Step 1: Rebuild Gearmulator WASM
The Emscripten WASM module must be rebuilt with the fixed C++ code:

```bash
cd Reference\ Code/gearmulator-main
mkdir -p build && cd build
emcmake cmake ..
emmake make
# Outputs: gearmulator.wasm + gearmulator.js
cp gearmulator.wasm ../../public/gearmulator/gearmulator_wasm.wasm
cp gearmulator.js ../../public/gearmulator/gearmulator_wasm.js
```

**Critical:** The current WASM (825KB, 6 Mar 13:33) still has the broken dynamic_cast. It needs to be rebuilt.

### Step 2: Test the Fixed WASM
After rebuilding, test-gearmulator.html should show:
```
✓ [EM] Restoring ESAI-X registers: SAICR=... TCR=... TCCR=...
✓ [EM] Restoring PCTL=...
✓ [EM] ESAI restoration complete
```

**Instead of:**
```
❌ [EM] WARNING: Could not get Peripherals56362 for ESAI restore
```

### Step 3: Verify Audio Output
After fix is compiled:
1. Open http://localhost:5173/test-gearmulator.html
2. Click "Initialize"
3. **Check console** for "ESAI restoration complete"
4. Click "Play C4"
5. **Audio should now be heard**

---

## Technical Details

### DspSingle Peripheral Accessors
From `Reference Code/gearmulator-main/source/virusLib/dspSingle.h`:
```cpp
class DspSingle {
public:
    dsp56k::Peripherals56362& getPeriphX() { return m_periphX362; }
    dsp56k::Peripherals56367& getPeriphY() { return m_periphY367; }
    dsp56k::PeripheralsNop& getPeriphNop() { return m_periphNop; }

    // DON'T use this — returns wrong type
    // dsp56k::Peripheral* getPeriph(int index);  // Returns wrong type for our use case

private:
    dsp56k::Peripherals56362 m_periphX362;  // Has ESAI!
    dsp56k::Peripherals56367 m_periphY367;
    dsp56k::Peripherals56303 m_periphX303;
    dsp56k::PeripheralsNop m_periphNop;
};
```

### Why `getPeriph(0)` Fails
The `getPeriph(int)` method returns a polymorphic pointer to some peripheral, but NOT necessarily `Peripherals56362*`. In some configurations it might return `Peripherals56303*` or `PeripheralsNop*`, causing the dynamic_cast to fail.

**Solution:** Use the typed accessor `getPeriphX()` which is guaranteed to return the correct type.

---

## Audio Pipeline with Fix

```
Device boots with snapshot
    ↓
loadMemorySnapshot() called
    ↓
[OLD] Dynamic_cast fails → ESAI NOT restored → Audio disabled ❌
[NEW] getPeriphX() succeeds → ESAI restored → Audio enabled ✅
    ↓
DSP thread produces audio frames
    ↓
fillRingBuffer() calls gm_process() → reads audio output
    ↓
SharedArrayBuffer populated with audio
    ↓
Worklet reads SAB → outputs to Web Audio
    ↓
Speakers play sound ✓
```

---

## Prevention

### How to Avoid This in Future
1. **Prefer direct accessors over dynamic_cast** when the type is known
2. **Document which peripheral types are used where**
3. **Test with multiple synth types** (Virus A, B, C, TI, Waldorf, Nord)
4. **Add validation** that ESAI registers are actually restored:
   ```cpp
   // After restoration, read back the register value
   auto tcr_after = mem.get(MemArea_X, Esai::M_TCR);
   if (tcr_after == 0) printf("ERROR: TCR still 0 after restore!\n");
   ```

---

## Summary

| Item | Status |
|------|--------|
| Root cause identified | ✅ Dynamic_cast fails |
| Fix implemented | ✅ Use getPeriphX() directly |
| C++ code modified | ✅ device.cpp:70-110 |
| WASM rebuilt | ⏳ Needs compilation |
| Tested with new WASM | ⏳ Pending rebuild |

**Next action:** Rebuild Gearmulator WASM with the fixed C++ code.
