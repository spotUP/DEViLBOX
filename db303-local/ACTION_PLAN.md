# DB303 Feature Implementation Action Plan

## Current Status

### What We Have:
✅ Downloaded and analyzed db303.pages.dev site
✅ Extracted all resources (WASM, presets, patterns, docs)
✅ Documented all missing parameters
✅ Created parameter mapping guide
✅ Identified 30+ missing parameters

### Why We're Not Using Their WASM:
- db303.pages.dev WASM (148KB) requires matching Emscripten glue code
- Their JS glue code is bundled/minified in their app bundle
- Extracting it would require reverse-engineering
- Our current WASM (66KB) works perfectly with our build system
- Better approach: Add missing parameters to our existing implementation

## Implementation Strategy

### Phase 1: Core Missing Parameters (High Priority)

#### 1.1 LFO System (CRITICAL - Major Feature Gap)
**Location:** `src/types/instrument.ts` - Add to TB303Config
```typescript
lfo?: {
  waveform: 0 | 1 | 2;      // 0=sine, 1=triangle, 2=square
  rate: number;              // 0-1 (LFO speed)
  contour: number;           // 0-1 (envelope contour)
  pitchDepth: number;        // 0-1 (pitch modulation)
  pwmDepth: number;          // 0-1 (PWM modulation)
  filterDepth: number;       // 0-1 (filter modulation)
};
```

**Implementation:**
- Add LFO parameters to `DB303Synth.ts` param enum
- Add setter methods: `setLfoWaveform()`, `setLfoRate()`, etc.
- Update `InstrumentFactory.createDB303()` to apply LFO settings
- Add UI controls to `JC303StyledKnobPanel.tsx`
- WASM support: Check if rosic::Open303 already has LFO (likely yes)

#### 1.2 Extended Devil Fish Parameters
**Add to existing devilFish config:**
```typescript
devilFish?: {
  // ... existing parameters ...
  softAttack?: number;              // 0-1 (normal note soft attack)
  accentSoftAttack?: number;        // 0-1 (accent soft attack)
  passbandCompensation?: number;    // 0-1 (filter passband compensation)
  resTracking?: number;             // 0-1 (resonance frequency tracking)
  duffingAmount?: number;           // 0-1 (non-linear filter effect)
  lpBpMix?: number;                 // 0-1 (lowpass/bandpass mix)
  stageNLAmount?: number;           // 0-1 (per-stage non-linearity)
  ensembleAmount?: number;          // 0-1 (built-in ensemble effect)
  oversamplingOrder?: 0 | 1 | 2 | 3 | 4;  // oversampling quality
  filterSelect?: number;            // 0-255 (filter mode selection)
  diodeCharacter?: number;          // diode ladder character
};
```

**Implementation:**
- Add param IDs to `DB303Param` enum (continue from 31+)
- Add setter methods to `DB303Synth.ts`
- Update `InstrumentFactory.createDB303()`
- Add UI section for advanced Devil Fish parameters
- Test with default-preset.xml values

### Phase 2: Oscillator Enhancements (Medium Priority)

#### 2.1 Pulse Width Modulation
```typescript
oscillator: {
  type: 'sawtooth' | 'square';
  pulseWidth?: number;      // 0-1 (PWM control)
  subOscGain?: number;      // 0-1 (sub-oscillator level)
  subOscBlend?: number;     // 0-1 (sub-oscillator mix)
};
```

**Implementation:**
- Add PWM param to DB303Param enum
- Add `setPulseWidth()`, `setSubOscGain()`, `setSubOscBlend()`
- UI: Add PWM knob to oscillator section
- UI: Add sub-oscillator controls

### Phase 3: Built-in Effects (Lower Priority)

#### 3.1 Chorus
```typescript
chorus?: {
  mode: 0 | 1 | 2;    // chorus mode selection
  mix: number;        // 0-1 (dry/wet)
};
```

#### 3.2 Phaser
```typescript
phaser?: {
  rate: number;       // 0-1 (speed)
  width: number;      // 0-1 (depth)
  feedback: number;   // 0-1
  mix: number;        // 0-1 (dry/wet)
};
```

#### 3.3 Delay
```typescript
delay?: {
  time: number;       // delay time
  feedback: number;   // 0-1
  tone: number;       // 0-1 (filter)
  mix: number;        // 0-1 (dry/wet)
  spread: number;     // 0-1 (stereo)
};
```

**Implementation:**
- Add effects params to DB303Param enum
- Add setter methods for each effect parameter
- UI: Add effects section to panel
- Consider: Use Tone.js effects vs WASM effects

### Phase 4: Pattern Sequencer (Future)

#### 4.1 XML Import/Export
- Create `convertDb303PresetToTB303Config()` function
- Create `convertTB303ConfigToDb303Preset()` function
- Create `convertDb303PatternToTB303Pattern()` function
- Create `convertTB303PatternToDb303Pattern()` function

#### 4.2 Pattern Format
```typescript
interface TB303Pattern {
  numSteps: number;  // 1-32 (variable length)
  steps: Array<{
    index: number;
    key: number;      // 0-11 (chromatic)
    octave: number;   // -2 to +2
    gate: boolean;
    accent: boolean;
    slide: boolean;
  }>;
}
```

## Implementation Order (Recommended)

### Sprint 1: LFO System (1-2 days)
1. Add LFO types to `instrument.ts`
2. Add LFO params to `DB303Synth.ts`
3. Add LFO setters
4. Update `InstrumentFactory`
5. Add basic LFO UI (rate, depth controls)
6. Test with modulation

### Sprint 2: Extended Devil Fish (1-2 days)
1. Add extended DF params to types
2. Add param IDs (32-42)
3. Add setter methods
4. Update factory
5. Add UI section for advanced DF
6. Test with default-preset.xml values

### Sprint 3: Oscillator Enhancements (1 day)
1. Add PWM/sub-osc types
2. Add params and setters
3. Add UI controls
4. Test PWM sweep and sub-osc mix

### Sprint 4: Built-in Effects (2-3 days)
1. Decide: WASM effects vs Tone.js effects
2. Add effect types
3. Add params and setters
4. Add effects UI section
5. Test each effect independently
6. Test effects chain

### Sprint 5: Preset Import/Export (1 day)
1. Create XML parser
2. Create conversion functions
3. Test with default-preset.xml
4. Add import/export UI buttons
5. Add preset browser

## Testing Strategy

### Unit Tests
- Parameter setters work correctly
- Range conversions (0-1 ↔ 0-100)
- WASM communication

### Integration Tests
- Load default-preset.xml successfully
- All parameters apply correctly
- LFO modulation works
- Effects chain works

### Manual Tests
- Compare sound to db303.pages.dev
- Test extreme parameter values
- Test parameter combinations
- Test preset switching

## WASM Compatibility Notes

### Parameter ID Mapping
Our DB303Param enum currently goes up to ID 31. We need to:
1. Verify rosic::Open303 supports new parameters
2. If not, patch rosic source and rebuild WASM
3. Maintain backward compatibility with existing presets

### Potential WASM Rebuild Needed For:
- LFO system (if not in rosic::Open303)
- Some advanced Devil Fish params
- Built-in effects (if using WASM implementation)

### Can Be Implemented in TypeScript Only:
- Preset import/export
- Pattern sequencer
- UI enhancements
- Range conversions

## Files to Modify

### Types
- `src/types/instrument.ts` - Add all new config interfaces

### Engine
- `src/engine/db303/DB303Synth.ts` - Add params, setters
- `src/engine/InstrumentFactory.ts` - Update `createDB303()`

### UI
- `src/components/instruments/controls/JC303StyledKnobPanel.tsx` - Add UI controls

### Utils
- `src/lib/import/Db303PresetConverter.ts` (new) - XML conversion

## Success Metrics

- [ ] All 30+ missing parameters implemented
- [ ] LFO system fully functional
- [ ] Can load default-preset.xml successfully
- [ ] Sound closely matches db303.pages.dev
- [ ] UI has all parameter controls
- [ ] Preset import/export works
- [ ] No regressions in existing functionality
- [ ] TypeScript compilation clean
- [ ] All tests pass

## Resources

- **Reference Presets:** `Reference Code/db303-pages-dev/default-preset.xml`
- **Parameter Mapping:** `Reference Code/db303-pages-dev/PARAMETER_MAPPING.md`
- **Feature Analysis:** `Reference Code/db303-pages-dev/ANALYSIS.md`
- **rosic Source:** `Reference Code/db303-main/rosic/` (if WASM rebuild needed)

## Risks & Mitigation

### Risk: rosic::Open303 doesn't support some parameters
**Mitigation:** Check rosic source code, add parameters if needed, rebuild WASM

### Risk: WASM API incompatibility
**Mitigation:** Keep param IDs sequential, test incrementally

### Risk: UI becomes too complex
**Mitigation:** Use tabs/sections, add "Advanced" toggle

### Risk: Performance impact from 30+ new parameters
**Mitigation:** Profile, optimize setter calls, batch updates

## Next Immediate Steps

1. ✅ Download and analyze db303.pages.dev ← DONE
2. ✅ Document all missing features ← DONE
3. ✅ Create action plan ← DONE
4. ⬜ Start Sprint 1: Implement LFO system
5. ⬜ Add LFO UI controls
6. ⬜ Test LFO with actual audio
