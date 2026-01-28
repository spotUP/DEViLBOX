# Hardcoded Problems - Quick Reference Checklist

## Files to Audit/Fix

### High Priority Files

- [ ] `/src/constants/factoryPresets.ts`
  - [ ] Lines 15-462: Remove 36 hardcoded `id:` fields
  - [ ] Lines 15-462: Extract 88 duplicate `effects: [], volume: -12, pan: 0` patterns
  - [ ] Lines 15-105: Replace duplicate TB-303 presets with imports from tb303Presets.ts

- [ ] `/src/stores/useInstrumentStore.ts`
  - [ ] Lines 96-101: Extract duplicate instrument ID generation code
  - [ ] Lines 135-140: Extract duplicate instrument ID generation code
  - [ ] Lines 96, 100, 135, 139: Replace hardcoded `256` with `MAX_INSTRUMENTS` constant
  - [ ] Line 159: Replace `effect-${Date.now()}` with `idGenerator.generate('effect')`
  - [ ] Line 215: Replace `preset-${Date.now()}` with `idGenerator.generate('preset')`

- [ ] `/src/stores/useTransportStore.ts`
  - [ ] Line 8: Fix import - remove `type` keyword for constants
  - [ ] Line 34: Replace hardcoded `135` with `DEFAULT_BPM`
  - [ ] Line 43: Replace hardcoded `20` with `MIN_BPM`
  - [ ] Line 43: Replace hardcoded `999` with `MAX_BPM`

- [ ] `/src/engine/EffectCommands.ts`
  - [ ] Line 169: Replace `255` with `AUDIO_CONSTANTS.PAN.SCALE`
  - [ ] Line 186: Replace `0x40` with `AUDIO_CONSTANTS.VOLUME.MAX_VALUE`
  - [ ] Line 187: Replace `-40` with `AUDIO_CONSTANTS.VOLUME.MIN_DB`
  - [ ] Line 233: Extract `20` as `ARPEGGIO_REFRESH_MS` constant
  - [ ] Line 286: Replace `-40` with `AUDIO_CONSTANTS.VOLUME.MIN_DB`
  - [ ] Line 300: Replace `1200` with `AUDIO_CONSTANTS.PORTAMENTO.CENTS_PER_OCTAVE`
  - [ ] Line 309: Replace `1200` with `AUDIO_CONSTANTS.PORTAMENTO.CENTS_PER_OCTAVE`

- [ ] `/src/engine/AutomationPlayer.ts`
  - [ ] Line 68: Replace `0x40` with `AUDIO_CONSTANTS.VOLUME.MAX_VALUE`
  - [ ] Line 70: Replace `0xff` with `AUDIO_CONSTANTS.PAN.SCALE`
  - [ ] Line 184: Replace `200` with `AUDIO_CONSTANTS.FILTER.MIN_CUTOFF_HZ`
  - [ ] Line 184: Replace `100` with `AUDIO_CONSTANTS.FILTER.EXP_BASE`
  - [ ] Line 207: Replace `-40` with `AUDIO_CONSTANTS.VOLUME.MIN_DB`

### Medium Priority Files

- [ ] `/src/stores/useProjectStore.ts`
  - [ ] Line 27: Replace `project-${Date.now()}` with `idGenerator.generate('project')`
  - [ ] Line 66: Replace `project-${Date.now()}` with `idGenerator.generate('project')`

- [ ] `/src/stores/useTrackerStore.ts`
  - [ ] Line 56: Replace hardcoded `64` with `DEFAULT_PATTERN_LENGTH`
  - [ ] Line 56: Replace hardcoded `4` with `DEFAULT_NUM_CHANNELS`
  - [ ] Line 57: Replace `pattern-${Date.now()}` with `idGenerator.generate('pattern')`
  - [ ] Line 334: Replace hardcoded `64` with `DEFAULT_PATTERN_LENGTH`
  - [ ] Line 355: Replace `pattern-${Date.now()}` with `idGenerator.generate('pattern')`

- [ ] `/src/stores/useAutomationStore.ts`
  - [ ] Line 78: Replace `curve-${Date.now()}` with `idGenerator.generate('curve')`

- [ ] `/src/stores/useHistoryStore.ts`
  - [ ] Line 77: Replace complex ID generation with `idGenerator.generate('action')`

- [ ] `/src/engine/ToneEngine.ts`
  - [ ] Line 285: Replace `200` with `AUDIO_CONSTANTS.FILTER.MIN_CUTOFF_HZ`
  - [ ] Line 285: Replace `100` with `AUDIO_CONSTANTS.FILTER.EXP_BASE`
  - [ ] Line 288: Replace `200` with `AUDIO_CONSTANTS.FILTER.MIN_CUTOFF_HZ`
  - [ ] Line 288: Replace `100` with `AUDIO_CONSTANTS.FILTER.EXP_BASE`
  - [ ] Line 311: Replace `-40` with `AUDIO_CONSTANTS.VOLUME.MIN_DB`

### Files to Create

- [ ] `/src/constants/audioConstants.ts` - New file
  ```typescript
  export const MAX_INSTRUMENTS = 256;
  export const MAX_INSTRUMENT_ID = 0xFF;
  
  export const AUDIO_CONSTANTS = {
    VOLUME: {
      MAX_VALUE: 0x40,
      MIN_DB: -40,
      MAX_DB: 0,
    },
    PAN: {
      MIN: -1,
      MAX: 1,
      SCALE: 255,
    },
    FILTER: {
      MIN_CUTOFF_HZ: 200,
      MAX_CUTOFF_HZ: 20000,
      EXP_BASE: 100,
    },
    PORTAMENTO: {
      CENTS_PER_OCTAVE: 1200,
    },
    EFFECT: {
      ARPEGGIO_REFRESH_MS: 20,
      ARPEGGIO_REFRESH_HZ: 50,
    },
  };
  ```

- [ ] `/src/utils/idGenerator.ts` - New file
  ```typescript
  type EntityType = 'project' | 'effect' | 'preset' | 'pattern' | 'curve' | 'action';
  
  class IdGenerator {
    private counters: Map<EntityType, number> = new Map();
    
    generate(type: EntityType): string {
      const counter = (this.counters.get(type) || 0) + 1;
      this.counters.set(type, counter);
      return `${type}-${Date.now()}-${counter}`;
    }
    
    reset(type?: EntityType): void {
      if (type) {
        this.counters.delete(type);
      } else {
        this.counters.clear();
      }
    }
  }
  
  export const idGenerator = new IdGenerator();
  ```

- [ ] `/src/constants/trackerConstants.ts` - New file (optional)
  ```typescript
  export const DEFAULT_PATTERN_LENGTH = 64;
  export const DEFAULT_NUM_CHANNELS = 4;
  ```

## Issue Summary by Category

### 1. Hardcoded IDs (36 instances)
**Location:** `/src/constants/factoryPresets.ts`
- All presets have manual sequential IDs from 0 to 35

### 2. Duplicate TB-303 Presets (8 presets)
**Locations:** 
- `/src/constants/tb303Presets.ts` (canonical)
- `/src/constants/factoryPresets.ts` (duplicates)

### 3. Magic Numbers (30+ instances)
**Locations:**
- `/src/engine/EffectCommands.ts` (10+ instances)
- `/src/engine/AutomationPlayer.ts` (5+ instances)
- `/src/engine/ToneEngine.ts` (5+ instances)
- `/src/stores/useInstrumentStore.ts` (4 instances)
- `/src/stores/useTransportStore.ts` (3 instances)

### 4. Duplicate Code (2 blocks)
**Location:** `/src/stores/useInstrumentStore.ts`
- `createInstrument` method (lines 96-101)
- `cloneInstrument` method (lines 135-140)

### 5. Timestamp-Based IDs (6 patterns)
**Locations:**
- `/src/stores/useProjectStore.ts` (2 instances)
- `/src/stores/useInstrumentStore.ts` (2 instances)
- `/src/stores/useTrackerStore.ts` (2 instances)
- `/src/stores/useAutomationStore.ts` (1 instance)
- `/src/stores/useHistoryStore.ts` (1 instance)

### 6. Duplicate Defaults (88 instances)
**Location:** `/src/constants/factoryPresets.ts`
- Pattern: `effects: [], volume: -12, pan: 0`

### 7. Console Messages (58 instances)
**Various locations** - Lower priority

### 8. Pattern Defaults (2 instances)
**Location:** `/src/stores/useTrackerStore.ts`
- Default length: 64
- Default channels: 4

## Verification Commands

```bash
# Count hardcoded IDs in presets
grep -n "id:" src/constants/factoryPresets.ts | wc -l

# Find all magic number 256
grep -rn "256\|0xFF" src --include="*.ts" | grep -v node_modules

# Find all Date.now() patterns
grep -rn "Date.now()" src --include="*.ts"

# Find duplicate volume/pan defaults
grep -rn "volume: -12,\|pan: 0," src/constants --include="*.ts" | wc -l

# Find all magic numbers in audio engine
grep -rn "0x40\|-40\|255\|200\|1200" src/engine --include="*.ts"
```

## Testing Checklist

After refactoring:

- [ ] All presets load correctly
- [ ] Instrument creation works
- [ ] Audio engine produces correct output
- [ ] BPM changes work properly
- [ ] Pattern creation/cloning works
- [ ] Effect commands function correctly
- [ ] No console errors
- [ ] All existing tests pass

## Migration Notes

For existing projects with saved data:
- Preset IDs will change (0-35 sequence maintained)
- No breaking changes to serialization format
- Effect/preset/pattern IDs will have new format
- Consider version migration if needed

---

**Last Updated:** 2026-01-13  
**Total Issues:** 200+  
**Files Affected:** 15+  
**Estimated Effort:** 40 hours
