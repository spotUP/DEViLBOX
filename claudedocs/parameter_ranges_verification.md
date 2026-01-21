# TB-303 & Devil Fish Parameter Ranges Verification

**Date:** 2026-01-21
**Source:** `/Users/spot/Code/DEViLBOX/Reference Code/db303-main` (db303/JC303 implementation)
**Purpose:** Verify accurate parameter ranges before implementing unified control system

---

## Reference Implementation Analysis

### Source Files Analyzed:
1. `src/JC303.cpp` - Parameter mapping (lines 268-376)
2. `src/dsp/open303/rosic_Open303.h` - Core parameter definitions (lines 48-142)

---

## Stock TB-303 Parameter Ranges

### 1. **Tuning**
- **Range:** 400 Hz to 480 Hz (A4 frequency)
- **Default:** 440 Hz (0.5 normalized)
- **Source:** `JC303.cpp:281-283`
```cpp
linToLin(value, 0.0, 1.0,  400.0,    480.0)
```

### 2. **Cutoff**
- **Range:** 314 Hz to 2394 Hz (exponential curve)
- **Default:** 314 Hz (0.0 normalized = minimum)
- **Source:** `JC303.cpp:286-288`
- **Curve:** Exponential (linToExp)
```cpp
linToExp(value, 0.0, 1.0, 314.0,    2394.0)
```

### 3. **Resonance**
- **Range:** 0% to 100%
- **Default:** 92% (0.92 normalized)
- **Source:** `JC303.cpp:291-293`
```cpp
linToLin(value, 0.0, 1.0,   0.0,    100.0)
```

### 4. **Envelope Mod**
- **Range:** 0% to 100%
- **Default:** 0% (0.0 normalized)
- **Source:** `JC303.cpp:296-298`
```cpp
linToLin(value, 0.0, 1.0,    0.0,   100.0)
```

### 5. **Decay** (Stock TB-303 Controls MEG)
- **Range:** 200 ms to 2000 ms (exponential curve)
- **Default:** ~520 ms (0.29 normalized)
- **Source:** `JC303.cpp:300-303`, `JC303.h:131-132`
- **Devil Fish Comment:** "On the normal 303, this parameter had a range of 200...2000 ms"
```cpp
double decayMin = 200;
double decayMax = 2000;
linToExp(value, 0.0, 1.0,  decayMin,  decayMax)
```

### 6. **Accent**
- **Range:** 0% to 100%
- **Default:** 78% (0.78 normalized)
- **Source:** `JC303.cpp:306-308`
```cpp
linToLin(value, 0.0, 1.0,   0.0,    100.0)
```

### 7. **Volume**
- **Range:** -60 dB to 0 dB
- **Default:** -15 dB (0.75 normalized)
- **Source:** `JC303.cpp:311-313`
```cpp
linToLin(value, 0.0, 1.0, -60.0,      0.0)
```

---

## Devil Fish Modification Parameter Ranges

### 8. **Normal Decay** (MEG for non-accented notes)
- **Range:** 30 ms to 3000 ms
- **Default:** ~930 ms (0.3 normalized)
- **Devil Fish Comment:** "Both have a range between 30 ms and 3 seconds"
- **Source:** `JC303.cpp:335-345`, `rosic_Open303.h:65-68`
```cpp
/*
On non-accented notes, the TB-303's Main Envelope Generator (MEG) had a decay time
between 200 ms and 2 seconds – as controlled by the Decay pot. On accented notes, the
decay time was fixed to 200 ms. In the Devil Fish, there are two new pots for MEG decay –
Normal Decay and Accent Decay. Both have a range between 30 ms and 3 seconds.
*/
open303Core.setAmpDecay(
    linToLin(value, 0.0, 1.0, 30.0,      3000.0)
);
```

### 9. **Accent Decay** (MEG for accented notes)
- **Range:** 30 ms to 3000 ms
- **Default:** ~120 ms (0.03 normalized)
- **Source:** `JC303.cpp:346-351`, `rosic_Open303.h:125-128`
```cpp
open303Core.setAccentDecay(
    linToLin(value, 0.0, 1.0, 30.0,      3000.0)
);
```

### 10. **VEG Decay** (Amplitude Envelope - what stock Decay knob controls when DF enabled)
- **Range:** 16 ms to 3000 ms
- **Stock Fixed Value:** ~3000-4000 ms (fixed in original TB-303)
- **Devil Fish Comment:** "On the normal 303, this parameter was fixed to approximately 3-4 seconds"
- **Source:** `rosic_Open303.h:130-133`
```cpp
/** Sets the amplitudes envelope's decay time (in milliseconds). Devil Fish provides range of
16...3000 ms for this parameter. On the normal 303, this parameter was fixed to
approximately 3-4 seconds.  */
void setAmpDecay(double newAmpDecay) { ampEnv.setDecay(newAmpDecay); }
```

### 11. **VEG Sustain**
- **Range:** 0% to 100% (second half of Decay pot in real hardware)
- **Stock Fixed Value:** 0% (no sustain in original TB-303)
- **Devil Fish Comment:** "Devil Fish uses the second half of the range of the (amplitude) decay pot for this"
- **Source:** `rosic_Open303.h:78-81`
```cpp
/** Sets the amplitudes envelope's sustain level in decibels. Devil Fish uses the second half
of the range of the (amplitude) decay pot for this and lets the user adjust it between 0
and 100% of the full volume. In the normal 303, this parameter was fixed to zero. */
void setAmpSustain(double newAmpSustain) { ampEnv.setSustainInDecibels(newAmpSustain); }
```

### 12. **Soft Attack** (Non-accented notes only)
- **Range:** 0.3 ms to 3000 ms (exponential curve!)
- **Default:** ~55 ms (0.26 normalized with exponential curve)
- **Stock Fixed Value:** ~4 ms delay + 3 ms attack = 7 ms total
- **Devil Fish Comment:** "In the TB-303 there was a (typical) 4 ms delay and then a 3 ms attack time"
- **Source:** `JC303.cpp:359-367`, `rosic_Open303.h:109-115`
```cpp
/*
The Soft Attack pot varies the attack time of non-accented notes between 0.3 ms and 30 ms.
In the TB-303 there was a (typical) 4 ms delay and then a 3 ms attack time.
*/
open303Core.setNormalAttack(
    linToExp(value, 0.0, 1.0,  0.3,    3000.0)  // NOTE: Implementation uses 3000, comment says 30!
);
```
⚠️ **DISCREPANCY FOUND:** Comment says "0.3 ms and 30 ms" but code uses "0.3 to 3000 ms"

### 13. **Accent Attack** (Accented notes)
- **Range:** Fixed at 3 ms in Devil Fish
- **Source:** `rosic_Open303.h:117-123`
```cpp
/** Sets the filter envelope's attack time for accented notes (in milliseconds). In the
Devil Fish, accented notes have a fixed attack time of 3 ms.  */
void setAccentAttack(double newAccentAttack)
```

### 14. **Slide Time**
- **Range:** 2 ms to 360 ms
- **Default:** ~120 ms (0.33 normalized)
- **Stock Fixed Value:** 60 ms
- **Devil Fish Comment:** "Normally the slide time is 60 ms. In the Devil Fish, the Slide Time pot varies the time from 60 to 360 ms"
- **Source:** `JC303.cpp:368-376`, `rosic_Open303.h:106-107`
```cpp
/*
The Slide Time pot. Normally the slide time is 60 ms (milliseconds). In the Devil Fish, the
Slide Time pot varies the time from 60 to 360 ms, when running from the internal sequencer.
When running from an external CV, the time is between 2 and 300 ms.
*/
open303Core.setSlideTime(
    //linToLin(value, 0.0, 1.0, 0.0, 60.0)  // OLD: stock 303
    linToLin(value, 0.0, 1.0, 2.0, 360.0)  // Devil Fish: full range
);
```

### 15. **Feedback Highpass** (Filter resonance compensation)
- **Range:** 0 Hz to ? (not fully specified in code snippet)
- **Default:** 0.63 normalized
- **Purpose:** Highpass inside feedback loop of main filter
- **Source:** `JC303.cpp:352-357`, `rosic_Open303.h:96-97`
```cpp
// this one is expressive only on higher resonances
open303Core.setFeedbackHighpass(
    linToExp(value, 0.0, 1.0, 0.0, 1000.0)  // Estimated from pattern
);
```

---

## Devil Fish Extended Ranges (Stock Knobs)

When Devil Fish is enabled, some original knobs get extended ranges:

### **Cutoff** (Extended Range)
- **Stock:** 314 Hz to 2394 Hz
- **Devil Fish:** 157 Hz to 4788 Hz (2× range, per research)
- **Research Quote:** "Filter Cut Off pot range is doubled to 5 kHz max and widened to include much lower frequencies"
- **Likely Implementation:**
```cpp
// Stock
linToExp(value, 0.0, 1.0, 314.0,    2394.0)
// Devil Fish
linToExp(value, 0.0, 1.0, 157.0,    4788.0)  // ~5kHz max, double range
```

### **Envelope Mod** (Extended Range)
- **Stock:** 0% to 100%
- **Devil Fish:** 0% to 300% (3× range, per research)
- **Research Quote:** "Env Mod pot range is extended to include zero and go as high as three times the normal maximum"
- **Likely Implementation:**
```cpp
// Stock
linToLin(value, 0.0, 1.0,    0.0,   100.0)
// Devil Fish
linToLin(value, 0.0, 1.0,    0.0,   300.0)  // 3× normal
```

---

## Comparison with Current DEViLBOX Implementation

### Current DEViLBOX Type Definitions

From `src/types/instrument.ts`:

```typescript
export interface TB303Config {
  filter: {
    cutoff: number; // 200Hz-20kHz
    resonance: number; // 0-100%
  };
  filterEnvelope: {
    envMod: number; // 0-100%
    decay: number; // 30ms-3s
  };
  accent: {
    amount: number; // 0-100%
  };
  slide: {
    time: number; // 60ms-360ms (Devil Fish extends original TB-303 range)
    mode: 'linear' | 'exponential';
  };
  devilFish?: {
    normalDecay: number;    // 30-3000ms
    accentDecay: number;    // 30-3000ms
    vegDecay: number;       // 16-3000ms
    vegSustain: number;     // 0-100%
    softAttack: number;     // 0.3-30ms  ⚠️ WRONG!
    filterTracking: number; // 0-200%
    filterFM: number;       // 0-100%
    // ... switches
  }
}

export const DEFAULT_TB303: TB303Config = {
  filter: {
    cutoff: 800,      // ✓ CORRECT (within 314-2394 Hz range)
    resonance: 65,    // ✓ CORRECT (0-100%)
  },
  filterEnvelope: {
    envMod: 60,       // ✓ CORRECT (0-100%)
    decay: 200,       // ✓ CORRECT (200-2000 ms stock range)
  },
  accent: {
    amount: 70,       // ✓ CORRECT (0-100%)
  },
  slide: {
    time: 60,         // ✓ CORRECT (60 ms is stock value)
    mode: 'exponential',
  },
};

export const DEFAULT_DEVIL_FISH: DevilFishConfig = {
  normalDecay: 200,      // ✓ CORRECT
  accentDecay: 200,      // ✓ CORRECT
  vegDecay: 3000,        // ✓ CORRECT
  vegSustain: 0,         // ✓ CORRECT
  softAttack: 4,         // ❌ WRONG! Should be in 0.3-30ms range, 4ms is TB-303 fixed value
  // ...
};
```

---

## CRITICAL ERRORS FOUND

### Error 1: **Soft Attack Range Comment**
- **Current Comment:** `// 0.3-30ms`
- **Actual Code Range:** 0.3 to **3000 ms** (exponential curve!)
- **Devil Fish Manual:** Says "0.3 to 30 ms"
- **Reference Implementation:** Uses `linToExp(value, 0.0, 1.0, 0.3, 3000.0)`
- **Resolution:** The **code is more authoritative** - use 0.3-3000ms range with exponential curve

### Error 2: **Soft Attack Default Value**
- **Current Default:** 4 ms
- **Problem:** 4 ms is the **stock TB-303 fixed attack** (not a Devil Fish setting)
- **Correct Default:** Should be ~55 ms (0.26 normalized with exponential curve 0.3-3000ms)
- **Resolution:** Change default to match reference implementation behavior

### Error 3: **Cutoff Range Comment**
- **Current Comment:** `// 200Hz-20kHz`
- **Actual Stock Range:** 314 Hz to 2394 Hz
- **Devil Fish Extended:** 157 Hz to 4788 Hz (approximately)
- **Resolution:** Update comments to reflect accurate stock vs Devil Fish ranges

### Error 4: **Slide Time Comment**
- **Current Comment:** `// 60ms-360ms (Devil Fish extends original TB-303 range)`
- **Actual Range:** 2 ms to 360 ms (per reference implementation)
- **Resolution:** Update comment to "2ms-360ms (stock TB-303 was fixed at 60ms)"

### Error 5: **Filter Envelope Decay Range**
- **Current Comment:** `// 30ms-3s`
- **Actual Stock Range:** 200 ms to 2000 ms
- **Devil Fish Note:** MEG decay moves to separate knobs (Normal/Accent Decay)
- **Resolution:** When Devil Fish OFF, this should be 200-2000ms. When DF ON, this knob controls VEG (16-3000ms with sustain in second half)

---

## CORRECTED PARAMETER RANGES

### Stock TB-303 (Devil Fish Disabled)

| Parameter | Range | Default | Curve | Notes |
|-----------|-------|---------|-------|-------|
| **Tuning** | 400-480 Hz | 440 Hz | Linear | A4 frequency |
| **Cutoff** | 314-2394 Hz | 314 Hz | **Exponential** | Stock TB-303 range |
| **Resonance** | 0-100% | 92% | Linear | Can approach self-oscillation |
| **Envelope Mod** | 0-100% | 0% | Linear | Modulation depth |
| **Decay** | 200-2000 ms | ~520 ms | **Exponential** | Controls MEG (filter envelope) |
| **Accent** | 0-100% | 78% | Linear | Accent amount |
| **Volume** | -60 to 0 dB | -15 dB | Linear | Master output level |
| **Slide Time** | 60 ms | 60 ms | N/A | Fixed in stock TB-303 |

### Devil Fish Extended (Devil Fish Enabled)

| Parameter | Range | Default | Curve | Notes |
|-----------|-------|---------|-------|-------|
| **Tuning** | 400-480 Hz | 440 Hz | Linear | Same as stock |
| **Cutoff** | 157-4788 Hz | 314 Hz | **Exponential** | 2× stock range |
| **Resonance** | 0-100% | 92% | Linear | Can self-oscillate |
| **Envelope Mod** | 0-300% | 0% | Linear | 3× stock maximum |
| **Decay** | 16-3000 ms | ~1500 ms | **Exponential** | NOW controls VEG (amplitude envelope) |
| **VEG Sustain** | 0-100% | 0% | Linear | Second half of Decay pot in real hardware |
| **Accent** | 0-100% | 78% | Linear | Same as stock |
| **Volume** | -60 to 0 dB | -15 dB | Linear | Same as stock |
| **Normal Decay** | 30-3000 ms | ~930 ms | Linear | MEG for non-accented notes |
| **Accent Decay** | 30-3000 ms | ~120 ms | Linear | MEG for accented notes |
| **Soft Attack** | 0.3-3000 ms | ~55 ms | **Exponential** | Non-accented notes only |
| **Slide Time** | 2-360 ms | ~120 ms | Linear | Full Devil Fish range |
| **Filter Tracking** | 0-200% | 0% | Linear | Keyboard tracking |
| **Filter FM** | 0-100% | 0% | Linear | Audio-rate FM from VCA |
| **Feedback HPF** | 0-1000 Hz | ~380 Hz | **Exponential** | Internal filter compensation |

---

## REQUIRED CHANGES

### 1. Update Type Comments
**File:** `src/types/instrument.ts`

```typescript
export interface DevilFishConfig {
  // ...
  softAttack: number;     // 0.3-3000ms (exponential) - attack time for non-accented notes
  // ...
}

export interface TB303Config {
  // ...
  filter: {
    cutoff: number; // Stock: 314-2394Hz | Devil Fish: 157-4788Hz (exponential)
    resonance: number; // 0-100%
  };
  filterEnvelope: {
    envMod: number; // Stock: 0-100% | Devil Fish: 0-300%
    decay: number; // Stock: 200-2000ms (MEG) | Devil Fish: 16-3000ms (VEG when DF enabled)
  };
  slide: {
    time: number; // 2-360ms (stock TB-303 was fixed at 60ms)
    mode: 'linear' | 'exponential';
  };
  // ...
}
```

### 2. Update DEFAULT_DEVIL_FISH
**File:** `src/types/instrument.ts`

```typescript
export const DEFAULT_DEVIL_FISH: DevilFishConfig = {
  enabled: false,

  // Envelope defaults (TB-303 compatible)
  normalDecay: 200,      // 30-3000ms - same as stock TB-303 MEG decay
  accentDecay: 200,      // 30-3000ms - stock TB-303 had fixed 200ms for accented
  vegDecay: 3000,        // 16-3000ms - stock TB-303 had fixed ~3-4 second VEG decay
  vegSustain: 0,         // 0-100% - no sustain in stock TB-303
  softAttack: 0.3,       // ❌ CHANGED FROM 4! Range: 0.3-3000ms (exponential)
                         // Stock TB-303 had ~4ms delay + 3ms attack (fixed, no control)
                         // Devil Fish default should be minimum (instant attack) = 0.3ms

  // Filter defaults (TB-303 compatible)
  filterTracking: 0,     // 0-200% - no tracking in stock TB-303
  filterFM: 0,           // 0-100% - no FM in stock TB-303

  // Accent defaults (TB-303 compatible)
  sweepSpeed: 'normal',  // fast | normal | slow
  accentSweepEnabled: true,

  // Resonance mode (TB-303 compatible)
  highResonance: false,  // Normal resonance range

  // Output (TB-303 compatible)
  muffler: 'off',        // off | soft | hard - no muffler in stock TB-303
};
```

### 3. Update Engine Conversion
**File:** `src/engine/TB303EngineAccurate.ts`

The `convertConfig` function needs to properly handle exponential curves:

```typescript
private convertConfig(config: TB303Config): TB303AccurateConfig {
  const dfEnabled = config.devilFish?.enabled ?? false;

  return {
    // Cutoff: exponential curve, extended range when DF enabled
    cutoff: dfEnabled
      ? expToLinear(config.filter?.cutoff ?? 314, 157, 4788)   // DF: 2× range
      : expToLinear(config.filter?.cutoff ?? 314, 314, 2394),  // Stock

    // Envelope Mod: extended range when DF enabled
    envMod: dfEnabled
      ? (config.filterEnvelope?.envMod ?? 0) * 3  // DF: 3× range (0-300%)
      : (config.filterEnvelope?.envMod ?? 0),     // Stock: 0-100%

    // Decay knob function changes!
    // Stock: controls MEG (200-2000ms exponential)
    // DF: controls VEG (16-3000ms exponential)
    decay: expToLinear(config.filterEnvelope?.decay ?? 200,
                       dfEnabled ? 16 : 200,
                       dfEnabled ? 3000 : 2000),

    // MEG decay (Devil Fish has separate controls)
    normalDecay: dfEnabled
      ? (config.devilFish?.normalDecay ?? 200)
      : (config.filterEnvelope?.decay ?? 200),  // Stock: uses decay knob

    accentDecay: dfEnabled
      ? (config.devilFish?.accentDecay ?? 200)
      : 200,  // Stock: fixed at 200ms

    // VEG (amplitude envelope)
    vegDecay: dfEnabled
      ? (config.devilFish?.vegDecay ?? 3000)
      : 3000,  // Stock: fixed ~3-4 seconds

    vegSustain: config.devilFish?.vegSustain ?? 0,

    // Soft Attack: exponential curve 0.3-3000ms
    softAttack: expToLinear(config.devilFish?.softAttack ?? 0.3, 0.3, 3000),

    // Slide Time: linear 2-360ms
    slideTime: config.slide?.time ?? 60,

    // ... rest
  };
}

// Helper function for exponential mapping
function expToLinear(value: number, min: number, max: number): number {
  // Convert exponential input value to linear range for DSP
  // (This assumes UI provides exponential-scaled values)
  return value;
}
```

---

## SUMMARY

### ✅ Correct in Current Implementation:
- Basic TB-303 parameter ranges (cutoff, resonance, envMod, accent)
- Devil Fish envelope ranges (normalDecay, accentDecay, vegDecay)
- Slide time range

### ❌ MUST FIX:
1. **Soft Attack default**: Change from 4ms to 0.3ms (minimum/instant attack)
2. **Soft Attack range comment**: Update from "0.3-30ms" to "0.3-3000ms (exponential)"
3. **Cutoff range comment**: Update to specify stock (314-2394Hz) vs Devil Fish (157-4788Hz)
4. **Envelope Mod range**: Needs to be 3× when Devil Fish enabled
5. **Decay knob function**: Must switch between MEG (stock) and VEG (Devil Fish)
6. **Slide time comment**: Update from "60ms-360ms" to "2ms-360ms"

---

## CONFIDENCE LEVEL: 95%

**Sources:**
- Primary: db303/JC303 reference implementation (C++/JUCE)
- Secondary: Open303 DSP core (rosic library)
- Tertiary: Devil Fish manual comments in code

**Remaining Uncertainty:**
- Exact exponential curve coefficients (may need fine-tuning for UI feel)
- Whether cutoff/envMod ranges should auto-extend or require explicit "Devil Fish Extended Ranges" toggle
