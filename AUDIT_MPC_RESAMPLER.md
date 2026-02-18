# MPC Resampler Code Audit Report

**Date:** 2026-02-18
**Auditor:** Claude (Sonnet 4.5)
**Scope:** All new MPC Resampler code

---

## Executive Summary

**Status:** ⚠️ **CRITICAL ISSUES FOUND** - Requires immediate fixes
**Total Issues:** 15 (4 Critical, 6 High, 5 Medium)

### Critical Issues (Must Fix)
1. **Memory leak** in DSP module (AudioContext not closed)
2. **Clipping bug** in quantization algorithm
3. **Missing input validation** on keyboard shortcuts
4. **Type safety violations** (use of `any`)

### High Priority Issues
5. Missing error handling in localStorage operations
6. Potential clipping in warmth/gain stages
7. Duplicate code in preset loading
8. Missing useCallback dependencies

---

## Detailed Findings

### 🔴 CRITICAL Issues

#### 1. Memory Leak - AudioContext Not Closed
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:186`
**Severity:** CRITICAL
**Impact:** Memory accumulates on every resample operation

```typescript
// ❌ WRONG - Creates memory leak
const audioContext = new AudioContext();
const resampled = audioContext.createBuffer(...);
// audioContext is never closed!
```

**Fix:**
```typescript
// ✅ CORRECT - Use OfflineAudioContext
const offlineCtx = new OfflineAudioContext(
  buffer.numberOfChannels,
  newLength,
  targetRate
);
const resampled = offlineCtx.createBuffer(...);
// OfflineAudioContext is automatically cleaned up
```

**Why this matters:** Each `AudioContext` allocates audio threads and system resources. After 10-20 resamples, the browser will run out of audio contexts (limit is 6-32 depending on browser). This causes processing to fail.

---

#### 2. Clipping Bug in Quantization
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:225`
**Severity:** CRITICAL
**Impact:** Produces values outside valid 16-bit range, causes distortion

```typescript
// ❌ WRONG - Can produce 32768 (out of range)
let sample16 = Math.floor(data[i] * 32768);
// When data[i] = 1.0: sample16 = 32768 (INVALID, should be 32767)
```

**Fix:**
```typescript
// ✅ CORRECT - Clamp to valid range
let sample16 = Math.floor(data[i] * 32768);
sample16 = Math.max(-32768, Math.min(32767, sample16));
```

**Why this matters:** 16-bit signed integers range from -32768 to 32767. The value 32768 causes integer overflow, wrapping to -32768. This creates a loud "pop" artifact on peaks.

**Test case:**
```typescript
// Input: sample at exactly 1.0 (0 dBFS)
// Current: 1.0 * 32768 = 32768 → wraps to -32768 (LOUD POP!)
// Fixed: 1.0 * 32768 = 32768 → clamped to 32767 (correct)
```

---

#### 3. Keyboard Event Not Filtered by Target
**File:** `src/components/instruments/MpcResamplerModal.tsx:334`
**Severity:** CRITICAL
**Impact:** Space bar triggers A/B toggle even when typing in input fields

```typescript
// ❌ WRONG - Intercepts space in ALL inputs
const handleKeyPress = (e: KeyboardEvent) => {
  if (e.code === 'Space' && !e.repeat && previewBuffer) {
    e.preventDefault();  // Blocks space in text inputs!
    handleABToggle();
  }
};
```

**Fix:**
```typescript
// ✅ CORRECT - Only trigger on non-input elements
const handleKeyPress = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

  if (e.code === 'Space' && !e.repeat && !isInput && previewBuffer) {
    e.preventDefault();
    handleABToggle();
  }
};
```

**Why this matters:** Users cannot type spaces in the "Save preset" field! This is a broken UX that will frustrate users immediately.

---

#### 4. Type Safety Violations (use of `any`)
**Files:**
- `MpcResamplerModal.tsx:237, 424, 461`
**Severity:** CRITICAL
**Impact:** Runtime errors if localStorage data is malformed

```typescript
// ❌ WRONG - No validation, assumes data structure
const presets = JSON.parse(saved);
setSavedPresets(presets.map((p: any) => ({  // 'any' = no type safety
  name: p.name,  // Could be undefined!
  options: { ... }
})));
```

**Fix:**
```typescript
// ✅ CORRECT - Validate and type-check
interface StoredPreset {
  name: string;
  targetRate: number;
  bitDepth: number;
  antiAlias: boolean;
  warmth: number;
  dither: boolean;
  model: string;
  timestamp: number;
}

function isValidPreset(p: unknown): p is StoredPreset {
  return (
    typeof p === 'object' && p !== null &&
    'name' in p && typeof p.name === 'string' &&
    'targetRate' in p && typeof p.targetRate === 'number' &&
    'bitDepth' in p && typeof p.bitDepth === 'number' &&
    // ... validate all required fields
  );
}

const presets = JSON.parse(saved);
const validPresets = Array.isArray(presets)
  ? presets.filter(isValidPreset)
  : [];
setSavedPresets(validPresets.map(p => ({ ... })));
```

**Why this matters:** If localStorage is corrupted or manually edited, the app will crash with "Cannot read property 'name' of undefined" instead of gracefully handling bad data.

---

### 🟠 HIGH Priority Issues

#### 5. Missing Error Handling in localStorage Write
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:404-422, 433-436`
**Severity:** HIGH
**Impact:** Crashes if localStorage quota exceeded or disabled

```typescript
// ❌ WRONG - No try-catch
export function savePreset(...) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
  // Throws QuotaExceededError if storage full!
}
```

**Fix:**
```typescript
// ✅ CORRECT - Handle errors gracefully
export function savePreset(...): boolean {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
    }
    return false;
  }
}
```

---

#### 6. Potential Clipping in Warmth Stage
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:305`
**Severity:** HIGH
**Impact:** Output can exceed [-1, 1] range, causes clipping

```typescript
// ❌ RISKY - Can exceed 1.0
data[i] = x >= 0
  ? Math.tanh(x) * 0.95 + x * 0.02  // When x=10: tanh(10)*0.95 + 10*0.02 = 1.15!
  : Math.tanh(x * 0.85);
```

**Fix:**
```typescript
// ✅ SAFE - Clamp output
const processed = x >= 0
  ? Math.tanh(x) * 0.95 + x * 0.02
  : Math.tanh(x * 0.85);
data[i] = Math.max(-1, Math.min(1, processed));
```

**Calculation:**
- At `warmth = 1.0`: `drive = 3.0`
- For sample `data[i] = 0.5`: `x = 1.5`
- Output: `tanh(1.5) * 0.95 + 1.5 * 0.02 = 0.905 * 0.95 + 0.03 = 1.06` ✅ OK
- For sample `data[i] = 1.0`: `x = 3.0`
- Output: `tanh(3.0) * 0.95 + 3.0 * 0.02 = 0.995 * 0.95 + 0.06 = 1.005` ⚠️ CLIPS

---

#### 7. Gain Compensation Can Cause Clipping
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:318`
**Severity:** HIGH
**Impact:** Loud samples clip after 8-bit quantization

```typescript
// ❌ RISKY - No headroom check
const compensation = 1 + (16 - bitDepth) * 0.05; // +5% per bit below 16
// At 8-bit: compensation = 1.4 (40% gain boost!)
for (...) {
  data[i] *= compensation;  // Can easily exceed 1.0
}
```

**Fix:**
```typescript
// ✅ SAFE - Soft limit or warn user
const compensation = 1 + (16 - bitDepth) * 0.05;
const maxPeak = Math.max(...Array.from(data).map(Math.abs));
const safeFactor = maxPeak * compensation > 0.95
  ? 0.95 / (maxPeak * compensation)
  : 1.0;

for (...) {
  data[i] *= compensation * safeFactor;
}
```

---

#### 8. Duplicate Preset Loading Code
**Files:**
- `MpcResamplerModal.tsx:237-249` (modal open)
- `MpcResamplerModal.tsx:424-437` (save)
- `MpcResamplerModal.tsx:461-474` (delete)

**Severity:** HIGH
**Impact:** Code duplication, hard to maintain

**Fix:** Extract to shared function:
```typescript
function loadPresetsFromStorage(): Array<{ name: string; options: MpcResampleOptions }> {
  try {
    const saved = localStorage.getItem('devilbox-mpc-presets');
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isValidPreset)
      .map(p => ({
        name: p.name,
        options: {
          targetRate: p.targetRate,
          bitDepth: p.bitDepth,
          quantize12bit: p.bitDepth === 12,
          antiAlias: p.antiAlias,
          warmth: p.warmth,
          useDither: p.dither,
          autoGain: true,
          exactRates: false,
          model: p.model as MpcResampleOptions['model'],
        }
      }));
  } catch (err) {
    console.error('Failed to load presets:', err);
    return [];
  }
}
```

---

#### 9. Missing Dependency in useEffect
**File:** `MpcResamplerModal.tsx:259`
**Severity:** HIGH
**Impact:** ESLint warning, potential stale closure

```typescript
// ❌ WRONG - Missing stopPlayback dependency
useEffect(() => {
  if (isOpen) { ... }
  return () => {
    stopPlayback();  // Not in dependency array!
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen]);
```

**Fix:**
```typescript
// ✅ CORRECT - Include all dependencies
useEffect(() => {
  if (isOpen) { ... }
  return () => {
    stopPlayback();
  };
}, [isOpen, stopPlayback]);
```

---

#### 10. Type Inconsistency in MpcPreset
**File:** `src/engine/mpc-resampler/MpcResamplerDSP.ts:50`
**Severity:** HIGH
**Impact:** Type safety lost, allows invalid models

```typescript
// ❌ WRONG - Too permissive
export interface MpcPreset {
  model: string;  // Allows any string!
}
```

**Fix:**
```typescript
// ✅ CORRECT - Strict type
export interface MpcPreset {
  model: 'MPC60' | 'MPC3000' | 'SP1200' | 'MPC2000XL';
}
```

---

### 🟡 MEDIUM Priority Issues

#### 11. Hardcoded Values in Preset Loading
**Files:** `MpcResamplerModal.tsx:246, 433, 470`
**Severity:** MEDIUM
**Impact:** autoGain and exactRates always reset to same values

```typescript
// ❌ SUBOPTIMAL - Overwrites user settings
options: {
  autoGain: true,      // Always true
  exactRates: false,   // Always false
  // ... other fields from storage
}
```

**Fix:** Store and restore these fields:
```typescript
// In save handler
const preset = {
  // ... existing fields
  autoGain: options.autoGain,
  exactRates: options.exactRates,
};

// In load handler
options: {
  autoGain: p.autoGain ?? true,
  exactRates: p.exactRates ?? false,
  // ...
}
```

---

#### 12. No Bounds Check on Custom Rate Input
**File:** `MpcResamplerModal.tsx:545`
**Severity:** MEDIUM
**Impact:** Invalid sample rates accepted

```typescript
// ❌ INCOMPLETE - Allows invalid ranges
onChange={e => updateOption('targetRate',
  Math.max(1000, Math.min(48000, parseInt(e.target.value) || 40000))
)}
```

**Issue:** What if user types "abc" or negative number?

**Fix:**
```typescript
onChange={e => {
  const parsed = parseInt(e.target.value);
  if (isNaN(parsed)) return; // Don't update on invalid input
  const clamped = Math.max(1000, Math.min(48000, parsed));
  updateOption('targetRate', clamped);
}}
```

---

#### 13. Canvas Context Not Checked for Null
**File:** `MpcResamplerModal.tsx:101`
**Severity:** MEDIUM
**Impact:** Potential crash if canvas rendering disabled

```typescript
const ctx = canvas.getContext('2d');
if (!ctx) return;  // Good, but...
```

**Current:** Silently fails
**Better:** Log warning for debugging
```typescript
const ctx = canvas.getContext('2d');
if (!ctx) {
  console.warn('Failed to get 2D context for waveform canvas');
  return;
}
```

---

#### 14. No Validation on Bit Depth Range
**File:** `MpcResamplerDSP.ts:215-237`
**Severity:** MEDIUM
**Impact:** Incorrect behavior if bitDepth < 1 or > 32

```typescript
function quantizeNbit(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  if (bitDepth >= 16) return buffer;
  // What if bitDepth is 0, -1, or 100?
```

**Fix:**
```typescript
function quantizeNbit(buffer: AudioBuffer, bitDepth: number): AudioBuffer {
  if (bitDepth < 1 || bitDepth > 16) {
    console.warn(`Invalid bitDepth ${bitDepth}, clamping to [1, 16]`);
    bitDepth = Math.max(1, Math.min(16, bitDepth));
  }
  if (bitDepth >= 16) return buffer;
  // ...
}
```

---

#### 15. Performance: Unnecessary Buffer Copies
**File:** `MpcResamplerDSP.ts:334-396`
**Severity:** MEDIUM
**Impact:** Extra memory allocations, slower processing

**Current:** Each DSP function potentially creates new buffer
**Optimization:** Mutate in-place where safe
```typescript
// Current
processed = applyWarmth(processed, options.warmth);

// Optimized (warmth already mutates in-place, so this is fine)
if (options.warmth > 0) {
  applyWarmth(processed, options.warmth); // Returns same buffer reference
}
```

---

## Code Quality Issues (Non-Blocking)

### ✅ Good Practices Found
- Comprehensive error handling in most places
- Good code documentation and comments
- Proper use of TypeScript types (mostly)
- Appropriate use of React hooks
- Good separation of concerns

### 📝 Style Suggestions
1. Extract magic numbers to constants (e.g., `32768`, `0.707`)
2. Add JSDoc comments to public functions
3. Consider using Zod or similar for runtime validation
4. Add unit tests for DSP functions

---

## Security Audit

### ✅ No Security Issues Found
- No use of `eval()` or `Function()` constructor
- No XSS vulnerabilities (all user input sanitized)
- localStorage access properly scoped
- No sensitive data exposed

---

## Recommendations

### Immediate Actions (Before Production)
1. **FIX CRITICAL #1:** Replace AudioContext with OfflineAudioContext
2. **FIX CRITICAL #2:** Clamp quantization output to valid range
3. **FIX CRITICAL #3:** Filter keyboard events by target element
4. **FIX CRITICAL #4:** Add type validation for localStorage data

### Short-term Improvements
5. Add try-catch to all localStorage operations
6. Add output clamping to warmth stage
7. Extract duplicate preset loading code
8. Fix useEffect dependencies

### Long-term Enhancements
9. Add unit tests for DSP functions
10. Add integration tests for modal
11. Add input validation on all user inputs
12. Consider Web Worker for long processing

---

## Test Coverage Needed

### Unit Tests
- [ ] `quantizeNbit()` with edge cases (0, 1, -1, 0.5)
- [ ] `nearestNeighborResample()` with various ratios
- [ ] `applyWarmth()` output range validation
- [ ] `applyGainCompensation()` no clipping check

### Integration Tests
- [ ] Preset save/load/delete workflow
- [ ] A/B toggle during playback
- [ ] Keyboard shortcut in input vs. modal
- [ ] Processing long samples (>10 seconds)

### Manual Testing Checklist
- [ ] Resample 1-second kick drum (MPC60, SP-1200, MPC3000)
- [ ] Bit depth 8, 10, 12, 14, 16 (check for pops/clicks)
- [ ] Save preset, reload page, verify persistence
- [ ] Type space in "Save preset" field (should work)
- [ ] Process 100+ times (check for memory leak)
- [ ] Fill localStorage quota (check error handling)

---

## Conclusion

The MPC Resampler implementation is **feature-complete and well-structured**, but has **4 critical bugs** that must be fixed before production use:

1. Memory leak (every resample leaks an AudioContext)
2. Clipping bug (produces invalid 16-bit values)
3. Broken keyboard UX (space bar blocks text input)
4. Type safety holes (localStorage corruption risk)

**Estimated fix time:** 2-3 hours for critical issues

**Risk assessment after fixes:**
- LOW risk for crashes/data loss
- MEDIUM risk for audio quality issues (gain/warmth clipping)
- HIGH confidence in core DSP algorithm correctness

---

**Next Steps:**
1. Apply critical fixes (see detailed fixes above)
2. Run TypeScript type check: `npm run type-check`
3. Test manually with checklist above
4. Consider adding unit tests for DSP functions
