# Knob Responsiveness Audit Report
## Date: 2026-02-17

This audit identifies React components with Knob onChange handlers and evaluates their responsiveness patterns.

---

## Executive Summary

**Total Components Audited:** 23  
**Using GOOD Pattern (Refs):** 11  
**Using BAD Pattern (No Refs):** 12  
**Critical Issues Found:** VisualEffectEditors (75+ effect editors affected)

---

## Responsiveness Pattern Reference

### ✅ GOOD PATTERN (from JC303StyledKnobPanel)
```typescript
// 1. Use ref for config
const configRef = useRef(config);
useEffect(() => { configRef.current = config; }, [config]);

// 2. Use configRef.current in handlers (NOT config prop)
const updateParameter = (key: string, value: number) => {
  onChange({ ...configRef.current, [key]: value });
};

// 3. Remove config from dependencies (keep only onChange)
const handleKnobChange = useCallback((value: number) => {
  updateParameter('key', value);
}, [onChange]); // NO config in deps!
```

### ❌ BAD PATTERN
```typescript
// Problem: Uses stale config/state from closure
const handleChange = (value: number) => {
  onChange({ ...config, someParam: value }); // ← BUG: stale config!
};
```

**Why It Matters:**  
When knobs change rapidly (user dragging), React may batch updates. Handlers without refs capture stale state from previous renders, causing:
- Knobs interfering with each other (moving one knob resets others)
- Sluggish/laggy controls
- Lost parameter changes
- Frustrating user experience

---

## Detailed Audit Results

### ✅ GOOD PATTERN - Using Refs (11 files)

#### 1. [src/components/instruments/controls/JC303StyledKnobPanel.tsx](src/components/instruments/controls/JC303StyledKnobPanel.tsx)
- **Pattern:** `configRef.current` in all handlers
- **Status:** ✅ REFERENCE IMPLEMENTATION
- **Lines:** 62-63 (ref setup), handlers use configRef throughout

#### 2. [src/components/instruments/synths/modular/views/ModularRackView.tsx](src/components/instruments/synths/modular/views/ModularRackView.tsx)
- **Pattern:** `configRef.current` in handlers
- **Status:** ✅ FIXED (2026-02-14)
- **Lines:** 37-41

#### 3. [src/components/demo/TB303View.tsx](src/components/demo/TB303View.tsx)
- **Pattern:** `tb303ConfigRef.current` in all parameter handlers
- **Status:** ✅ CORRECT
- **Lines:** 150-156 (ref setup), 217+ (handlers)

#### 4. [src/components/instruments/LFOControls.tsx](src/components/instruments/LFOControls.tsx)
- **Pattern:** `lfoRef.current` in updateLFO
- **Status:** ✅ CORRECT
- **Lines:** 31-32

#### 5. [src/components/instruments/controls/DexedControls.tsx](src/components/instruments/controls/DexedControls.tsx)
- **Pattern:** `configRef.current` in updateOperator
- **Status:** ✅ CORRECT
- **Lines:** 42-43

#### 6. [src/components/instruments/controls/OBXdControls.tsx](src/components/instruments/controls/OBXdControls.tsx)
- **Pattern:** `configRef.current`
- **Status:** ✅ CORRECT
- **Lines:** 23-24

#### 7. [src/components/instruments/controls/SynareControls.tsx](src/components/instruments/controls/SynareControls.tsx)
- **Pattern:** `configRef.current` in all update helpers
- **Status:** ✅ CORRECT
- **Lines:** 23-24

#### 8. [src/components/instruments/controls/ChipSynthControls.tsx](src/components/instruments/controls/ChipSynthControls.tsx)
- **Pattern:** `parametersRef.current`
- **Status:** ✅ CORRECT
- **Lines:** 40-41

#### 9. [src/components/instruments/controls/MAMEControls.tsx](src/components/instruments/controls/MAMEControls.tsx)
- **Pattern:** `configRef.current` in handleRegisterWrite
- **Status:** ✅ CORRECT
- **Lines:** 31-32

#### 10. [src/components/instruments/controls/SurgeControls.tsx](src/components/instruments/controls/SurgeControls.tsx)
- **Pattern:** Uses `setParam` with state map (custom pattern, but safe)
- **Status:** ✅ ACCEPTABLE (state-based, but updates are batched safely)
- **Lines:** 125-132

#### 11. [src/components/instruments/controls/TonewheelOrganControls.tsx](src/components/instruments/controls/TonewheelOrganControls.tsx)
- **Pattern:** Uses `setParam` with state array (custom pattern, but safe)
- **Status:** ✅ ACCEPTABLE (state-based, but updates are batched safely)
- **Lines:** 105-113

---

### ❌ BAD PATTERN - NOT Using Refs (12 files)

#### 🔴 CRITICAL: [src/components/effects/VisualEffectEditors.tsx](src/components/effects/VisualEffectEditors.tsx) **[HIGHEST PRIORITY]**
- **Problem:** All 75+ effect editors use `effect` prop directly
- **Impact:** ALL effect knobs (Reverb, Delay, Chorus, Phaser, Flanger, etc.) have stale state issues
- **Pattern Used:** 
  ```typescript
  const drive = getParam(effect, 'drive', 0.4);
  // ...
  onChange={(v) => onUpdateParameter('drive', v)}
  ```
- **Lines:** 42-52 (getParam helper), 85+ (all editor components)
- **Fix Required:** Add `effectRef` at top level, use in all editors
- **Estimated Effort:** High (affects 20+ editor components)

#### 🟡 MODERATE: [src/components/effects/EffectParameterEditor.tsx](src/components/effects/EffectParameterEditor.tsx)
- **Problem:** Passes `effect` directly to child editors (neural effects)
- **Impact:** Neural effect knobs have stale state
- **Lines:** 85-120 (NeuralEffectEditor)
- **Fix Required:** Add ref in NeuralEffectEditor
- **Estimated Effort:** Medium

#### 🟡 MODERATE: [src/components/instruments/controls/HarmonicSynthControls.tsx](src/components/instruments/controls/HarmonicSynthControls.tsx)
- **Problem:** No ref for `config`, uses prop directly in callbacks
- **Impact:** Harmonic synth knobs may interfere with each other
- **Lines:** 145+ (setHarmonicFromMouse, knob onChange handlers)
- **Fix Required:** Add `configRef`
- **Estimated Effort:** Low

#### 🟢 LOW: [src/components/instruments/ArpeggioEditor.tsx](src/components/instruments/ArpeggioEditor.tsx)
- **Problem:** `config` used directly in `updateConfig` callback
- **Impact:** Minor (arpeggio knobs don't change rapidly)
- **Lines:** 104-107 (updateConfig)
- **Fix Required:** Add `configRef` if issues reported
- **Estimated Effort:** Low

#### 🟢 LOW: [src/components/instruments/synths/modular/views/ModularMatrixView.tsx](src/components/instruments/synths/modular/views/ModularMatrixView.tsx)
- **Problem:** No ref for `config` in parameter change handlers
- **Impact:** Minor (modular param changes are infrequent)
- **Lines:** 109-116 (handleParameterChange)
- **Fix Required:** Add `configRef` if issues reported
- **Estimated Effort:** Low

#### 🟢 LOW: [src/components/instruments/synths/modular/widgets/ModulePanel.tsx](src/components/instruments/synths/modular/widgets/ModulePanel.tsx)
- **Problem:** No ref for `module`, passes directly to onChange
- **Impact:** Minor (controlled component pattern, parent may handle correctly)
- **Lines:** 226+ (Knob onChange)
- **Fix Required:** Monitor for issues
- **Estimated Effort:** Low

#### 🟢 LOW: [src/components/instruments/synths/modular/widgets/RackStrip.tsx](src/components/instruments/synths/modular/widgets/RackStrip.tsx)
- **Problem:** No ref for `module`, passes directly to onChange
- **Impact:** Minor (controlled component pattern, parent may handle correctly)
- **Lines:** 167+ (Knob onChange)
- **Fix Required:** Monitor for issues
- **Estimated Effort:** Low

#### 🟢 LOW: [src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx](src/components/instruments/controls/MAMEVFXVoiceMatrix.tsx)
- **Problem:** Uses `voiceParams` state directly (no ref)
- **Impact:** Minor (direct write to MAME engine, state is secondary)
- **Lines:** 142-149 (inline Knob onChange)
- **Status:** Likely acceptable (writes go directly to engine)

#### 🟢 LOW: [src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx](src/components/instruments/controls/MAMEDOCVoiceMatrix.tsx)
- **Problem:** Uses `oscParams` state directly (no ref)
- **Impact:** Minor (direct write to MAME engine, state is secondary)
- **Lines:** 105-110 (inline Knob onChange)
- **Status:** Likely acceptable (writes go directly to engine)

#### 🟢 LOW: [src/components/instruments/controls/MAMERSAVoiceMatrix.tsx](src/components/instruments/controls/MAMERSAVoiceMatrix.tsx)
- **Problem:** Uses state directly (no ref)
- **Impact:** Minor (direct write to MAME engine)
- **Status:** Likely acceptable (writes go directly to engine)

#### 🟢 LOW: [src/components/instruments/controls/V2SpeechControls.tsx](src/components/instruments/controls/V2SpeechControls.tsx)
- **Problem:** Inline onChange calls without ref
- **Impact:** Minor (simple parameter updates, infrequent changes)
- **Lines:** 120-136 (Knob components)
- **Fix Required:** Monitor for issues

#### 🟢 LOW: [src/components/instruments/controls/VSTBridgePanel.tsx](src/components/instruments/controls/VSTBridgePanel.tsx)
- **Problem:** Generic parameter panel, no ref
- **Impact:** Minor (generic VST parameters, fallback panel)
- **Lines:** 165+ (Knob onChange)
- **Fix Required:** Monitor for issues

---

## Priority Fix List

### 🔴 CRITICAL (Fix Immediately)

1. **VisualEffectEditors.tsx** - Affects ALL effect knobs in the app
   - Add `effectRef` at component level
   - Update all editor components to use ref
   - Test with rapid knob dragging on Reverb, Delay, Chorus

### 🟡 MODERATE (Fix Soon)

2. **EffectParameterEditor.tsx** - Neural effect knobs
3. **HarmonicSynthControls.tsx** - Harmonic synth knobs

### 🟢 LOW (Monitor & Fix If Issues Reported)

4. **ArpeggioEditor.tsx** - Arpeggio knobs
5. **ModularMatrixView.tsx** - Modular parameter knobs
6. **ModulePanel.tsx** - Module knobs (controlled)
7. **RackStrip.tsx** - Rack module knobs (controlled)
8. **MAME voice matrix controls** - Direct engine writes (likely okay)

---

## Testing Checklist

After fixing each component:

- [ ] Rapid knob dragging (1-2 seconds continuous drag)
- [ ] Drag one knob, immediately drag another
- [ ] Verify no parameter resets occur
- [ ] Check browser console for errors
- [ ] Test with both mouse and touch input

---

## Implementation Notes

### Standard Fix Pattern

```typescript
// 1. Add ref at component level
const configRef = useRef(config);
useEffect(() => { configRef.current = config; }, [config]);

// 2. Replace direct config usage with configRef.current
const handleChange = useCallback((key: string, value: number) => {
  onChange({ ...configRef.current, [key]: value });
}, [onChange]); // Remove config from deps

// 3. For nested objects, spread carefully
const handleNestedChange = useCallback((key: string, value: number) => {
  onChange({
    ...configRef.current,
    nested: {
      ...configRef.current.nested,
      [key]: value
    }
  });
}, [onChange]);
```

### For VisualEffectEditors.tsx

The file exports 20+ editor components. The fix should:
1. Add `effectRef` to each editor component
2. Update `getParam` to accept `effectRef` instead of `effect`
3. Update all `onUpdateParameter` calls to use `effectRef.current`
4. Remove `effect` from all `useCallback` dependencies

---

## Related Issues

- **Root Cause:** React batches state updates during rapid user input. Closures capture stale state.
- **Historical Context:** ModularRackView was fixed on 2026-02-14 using this same pattern.
- **Documentation:** See CLAUDE.md "CRITICAL: Knob/Control Handling Pattern" section.

---

## Contact

For questions or assistance implementing fixes, refer to:
- Reference implementation: [JC303StyledKnobPanel.tsx](src/components/instruments/controls/JC303StyledKnobPanel.tsx)
- Project memory: [CLAUDE.md](CLAUDE.md) (Knob/Control Handling Pattern)
