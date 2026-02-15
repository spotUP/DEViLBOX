# Handoff: Swing/Groove Fixes + DB303 Import Issues

**Date**: 2026-02-10 (Last Updated)  
**Swing Status**: ✅ Fixed and verified  
**DB303 Import**: 🔄 Needs debugging (inaccurate sound)

> **Note:** For overall project status, see: [PROJECT_STATUS_2026-02-14.md](PROJECT_STATUS_2026-02-14.md)

---

## What Was Just Fixed

### 1. Critical Swing Calculation Bug ✅
**File**: `src/engine/TrackerReplayer.ts` (lines 508-547)

**Problem**: At swing=100 (supposed to be "straight" timing), the system was applying 33% delay
- OLD: `intensity = state.swing / 100` → At swing=100, applied full 33% triplet delay
- NEW: `intensity = (state.swing - 100) / 100` → At swing=100, applies 0% delay (truly straight)

**Fix Applied**:
```typescript
// For MANUAL SWING: swing is 0-200 where 100 = straight (no swing)
const swingIntensity = (state.swing - 100) / 100;
```

**Test Results**: Verified with `test-swing-timing-node.js` - ALL TESTS PASSED

---

### 2. Groove Template Intensity Bug ✅
**File**: `src/engine/TrackerReplayer.ts` (lines 520-527)

**Problem**: Groove templates (shuffle, funk, MPC, etc.) were being zeroed out at swing=100
- Templates were using `(swing - 100) / 100` which gives 0 at swing=100
- This meant templates had NO effect at the default swing setting

**Fix Applied**: Separated template vs manual swing intensity calculations
```typescript
if (grooveTemplate && grooveTemplate.id !== 'straight') {
  // For TEMPLATES: swing is 0-200 where 100 = full template effect
  const templateIntensity = state.swing / 100;
  const offset = getGrooveOffset(grooveTemplate, row, rowDuration) * templateIntensity;
  return offset;
} else {
  // For MANUAL SWING: swing is 0-200 where 100 = straight
  const swingIntensity = (state.swing - 100) / 100;
  // ... apply swing to odd rows
}
```

**Test Results**: User confirmed templates now audibly work - "Medium Shuffle" at swing=100 produces alternating 0ms/30ms offsets

---

### 3. Jitter/Humanization Working ✅
**File**: `src/engine/TrackerReplayer.ts` (lines 577-582)

**Verified**: Jitter applies random ±10ms timing variations per note at jitter=100

---

### 4. Disabled Auto-Swing from DB303 Imports ✅
**Files**: 
- `src/App.tsx` (lines 560-577) - commented out with explanation
- `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` (lines 790-820) - commented out

**Reason**: DB303 XML files contain swing values that were being auto-applied to tracker, causing double-swing and interference

---

## Test Patterns Created

### `public/test-patterns/swing-test-slow.xml`
- 8 steps at 80 BPM
- Continuous notes (no rests)
- User-confirmed: swing is audible and working correctly

### `test-swing-timing-node.js`
- Standalone mathematical verification script
- Tests swing calculations at 100/150/200 values
- ALL TESTS PASSED - swing=100 is straight, swing=200 is triplet

### `SWING_TIMING_TEST.md`
- Documentation of expected timing behavior

---

## Current Issue: DB303 XML Import Sound Mismatch 🔄

**User Report**: "Downloaded fresh preset and pattern from db303 site - we are very far from the correct sound"

### What Needs Investigation

1. **Parameter Import Accuracy**
   - Check if all DB303 XML parameters are being read correctly
   - Verify parameter mapping (DB303 values → our WASM values)
   - Look for missing or misinterpreted parameters

2. **Pattern/Timing Issues**
   - Are notes triggering at correct times?
   - Are slides being interpreted correctly?
   - Are accents working as expected?
   - Is BPM/tempo being imported correctly?

3. **Sound Quality Issues to Check**
   - Filter sound (cutoff/resonance mapping)
   - Envelope behavior (decay/envMod)
   - Waveform (saw/square/pwm)
   - Slide timing/curve
   - Accent behavior

### Key Files for DB303 Debugging

**Import Code**: `src/App.tsx` lines 410-702
- `parseDB303XML()` function - reads XML and extracts parameters
- Creates XM pattern from DB303 pattern data
- Maps DB303 preset to InstrumentConfig

**Instrument Creation**: `src/audio/InstrumentFactory.ts` lines 1577-1640
- `createDB303Synth()` - converts config to synth
- Parameter mapping happens here

**DB303 Synth**: `src/audio/synths/DB303Synth.ts`
- Main synth interface
- Worklet communication
- Note triggering logic (lines 310-390)

**WASM Engine**: `public/db303/DB303.worklet.js`
- Actual audio processing
- C++ engine bridged to JS

### How to Debug

1. **Get the XML files** from user
   - Both preset (.db303preset) and pattern (.db303pattern)
   - Load them in original DB303 app for reference sound

2. **Add logging to import**:
```typescript
// In src/App.tsx parseDB303XML function
console.log('[DB303 Import] Raw XML values:', {
  cutoff: cutoffValue,
  resonance: resonanceValue,
  envMod: envModValue,
  // ... all parameters
});

console.log('[DB303 Import] Mapped to config:', presetConfig);
```

3. **Compare pattern data**:
```typescript
// Log each step
pattern.rows.forEach((row, i) => {
  console.log(`Step ${i}: note=${row.note}, slide=${row.slide}, accent=${row.accent}`);
});
```

4. **Check parameter ranges**:
   - DB303 uses 0-127 for most knobs
   - We need to map to 0-1 or appropriate ranges
   - Verify mapping formulas match DB303 behavior

5. **Listen for specific issues**:
   - Too bright/dark → filter cutoff mapping wrong
   - Too resonant/not enough → resonance mapping wrong
   - Wrong dynamics → envelope/accent mapping wrong
   - Wrong pitch slides → slide time parameter wrong

---

## Build Status

Last build: ✅ Success (30.69s)
```bash
npm run build
# Output: ✓ built in 30.69s
```

Dev server ready:
```bash
npm run dev
# Vite server on http://localhost:5173
```

---

## Git Status

Changes ready to commit:
- ✅ Fixed swing calculation in TrackerReplayer.ts
- ✅ Fixed groove template intensity
- ✅ Verified jitter working
- ✅ Disabled DB303 auto-swing
- ✅ Removed debug logging
- ✅ Created test patterns and verification script

---

## Next Steps for Claude CLI

1. **Get XML files from user** (preset + pattern)
2. **Load them side-by-side** with original DB303 for comparison
3. **Add detailed import logging** to see what values are being extracted
4. **Identify the discrepancy**:
   - Wrong parameter values?
   - Missing parameters?
   - Incorrect mapping formula?
   - Timing/pattern interpretation issue?
5. **Fix the mapping** once identified
6. **Test with multiple patterns** to verify fix is general

---

## Important Context

### TB-303 Legato Behavior (Verified Correct ✅)
- Monophonic synth
- Overlapping notes create slides (pitch glide, no retrigger)
- Envelope only triggers on first note, continues through slides
- This is why volume decreases on subsequent held notes

### Swing System (Now Working Correctly ✅)
- Range: 0-200
- **Templates**: 100 = full template effect (0-200% scaling)
- **Manual swing**: 100 = straight, 200 = full triplet (33.3% delay)
- grooveSteps: 2=16th notes, 3=8th triplets, 4=32nd notes

### Current Swing Settings in Tracker
- Accessible via transport controls
- Presets: straight, light-shuffle, medium-shuffle, hard-shuffle, funk-16, etc.
- Resolution control affects which notes get swung

---

## Questions to Ask User

1. What specifically sounds wrong?
   - Filter too bright/dark?
   - Not enough/too much resonance?
   - Wrong dynamics (too loud/quiet)?
   - Timing off?
   - Slides too fast/slow?

2. Can you share the XML files?
   - Preset file (.db303preset)
   - Pattern file (.db303pattern)

3. Can you describe the difference?
   - Record both for comparison?
   - Specific notes that sound wrong?

---

## Contact Points

User is switching to **Claude CLI** to continue this work.
Session context preserved in this handoff document.
