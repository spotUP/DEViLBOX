# Codebase Audit Report - Hardcoded Problems

**Date:** 2026-01-13  
**Scope:** All TypeScript/JavaScript files in the `scribbleton-react` project

---

## 1. Hardcoded ID Fields in Preset Files

### Critical Issue: Manual ID Assignment in Factory Presets

**File:** `/src/constants/factoryPresets.ts`

**Problem:** All 36 factory presets have manually assigned sequential IDs (0-35):
```typescript
{ id: 0, name: '303 Classic', ... },
{ id: 1, name: '303 Squelchy', ... },
{ id: 2, name: '303 Deep', ... },
// ... continues to id: 35
```

**Impact:**
- Adding/removing presets requires manual renumbering
- Risk of ID conflicts or gaps
- Error-prone maintenance

**Recommendation:**
- Use auto-generated IDs or array indices
- Remove hardcoded IDs from preset definitions
- Generate IDs at runtime when presets are loaded

---

## 2. Duplicate TB-303 Presets

### Critical Issue: TB-303 Presets Duplicated Across Files

**Files:**
- `/src/constants/tb303Presets.ts` (8 presets, no IDs)
- `/src/constants/factoryPresets.ts` (8 TB-303 presets with IDs 0-7)

**Problem:** The same TB-303 presets appear in both files with slight formatting differences:

**tb303Presets.ts:**
```typescript
export const TB303_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 800, resonance: 65 },
      // ...
    }
  }
]
```

**factoryPresets.ts:**
```typescript
{
  id: 0,
  name: '303 Classic',
  synthType: 'TB303',
  tb303: {
    oscillator: { type: 'sawtooth' },
    filter: { cutoff: 800, resonance: 65 },
    // ...
  }
}
```

**Differences Found:**
- Different formatting (inline vs. expanded)
- Minor parameter value differences (e.g., decay: 200 vs 350)
- `tb303Presets.ts` uses `Omit<InstrumentConfig, 'id'>`
- One preset has effects (`'303 Screamer'` has distortion)

**Impact:**
- Code duplication (maintenance burden)
- Risk of presets diverging over time
- Unclear which version is authoritative

**Recommendation:**
- Choose single source of truth for TB-303 presets
- Import TB-303 presets into factory presets instead of duplicating
- Example:
```typescript
// In factoryPresets.ts
import { TB303_PRESETS } from './tb303Presets';

export const BASS_PRESETS: InstrumentConfig[] = [
  ...TB303_PRESETS.map((preset, index) => ({ ...preset, id: index })),
  // Other bass presets...
];
```

---

## 3. Magic Numbers and Hardcoded Limits

### 3.1 Instrument ID Limit (256)

**File:** `/src/stores/useInstrumentStore.ts`

**Occurrences:**
```typescript
// Line 96-101
while (existingIds.includes(newId) && newId < 256) {
  newId++;
}
if (newId >= 256) {
  console.warn('Maximum number of instruments reached (256)');
  return newId;
}

// Line 135-140 (duplicate code)
while (existingIds.includes(newId) && newId < 256) {
  newId++;
}
if (newId >= 256) {
  console.warn('Maximum number of instruments reached (256)');
  return newId;
}
```

**Recommendation:**
- Define constant: `const MAX_INSTRUMENTS = 256`
- Extract ID generation into reusable function
- Reference in type comments (already has `0x00-0xFF` comments)

---

### 3.2 Audio Engine Magic Numbers

**File:** `/src/engine/EffectCommands.ts`

**Problems:**
```typescript
// Line 186-187: Volume calculations
const volume = Math.min(param, 0x40); // Clamp to 0x40
const volumeDb = -40 + (volume / 0x40) * 40; // Map to -40dB to 0dB

// Line 169: Pan calculation
const panValue = (param / 255) * 2 - 1; // Map 0x00-0xFF to -1 to 1

// Line 286: Volume range
const newVol = Math.max(-40, Math.min(0, currentVol + delta));

// Line 300, 309: Portamento
const newFreq = state.portaUp.currentFreq * Math.pow(2, state.portaUp.speed / 1200);
```

**File:** `/src/engine/AutomationPlayer.ts`

```typescript
// Line 68
return rawValue / 0x40; // Volume is 0x00-0x40

// Line 184
const cutoffHz = 200 * Math.pow(100, value);

// Line 207
const volumeDb = -40 + value * 40;
```

**Recommendation:**
Create audio constants file:
```typescript
// src/constants/audioConstants.ts
export const AUDIO_CONSTANTS = {
  // Volume
  MAX_VOLUME_VALUE: 0x40,
  MIN_VOLUME_DB: -40,
  MAX_VOLUME_DB: 0,
  
  // Filter
  MIN_CUTOFF_HZ: 200,
  MAX_CUTOFF_HZ: 20000,
  CUTOFF_EXP_BASE: 100,
  
  // Pan
  MIN_PAN: -1,
  MAX_PAN: 1,
  PAN_SCALE: 255,
  
  // Portamento
  CENTS_PER_OCTAVE: 1200,
  
  // Instruments
  MAX_INSTRUMENTS: 256,
  MAX_INSTRUMENT_ID: 0xFF,
};
```

---

### 3.3 BPM Limits

**File:** `/src/stores/useTransportStore.ts`

**Problem:**
```typescript
// Line 34: Hardcoded default BPM
bpm: 135, // DEFAULT_BPM

// Line 43-44: Hardcoded limits
state.bpm = Math.max(20, Math.min(999, bpm)); // MIN_BPM, MAX_BPM
```

**File:** `/src/types/audio.ts`

**Good:** Constants are defined:
```typescript
export const DEFAULT_BPM = 135;
export const DEFAULT_MASTER_VOLUME = -6;
export const MIN_BPM = 20;
export const MAX_BPM = 999;
```

**Issue:** Constants are imported with `type` in transport store, preventing their use:
```typescript
import type { TransportState, DEFAULT_BPM, MIN_BPM, MAX_BPM } from '@types/audio';
```

**Recommendation:**
- Remove `type` keyword for constants import
- Use imported constants instead of hardcoded values

---

### 3.4 Pattern Defaults

**File:** `/src/stores/useTrackerStore.ts`

```typescript
// Line 56
const createEmptyPattern = (length: number = 64, numChannels: number = 4): Pattern => ({

// Line 334
addPattern: (length = 64) =>
```

**Recommendation:**
```typescript
const DEFAULT_PATTERN_LENGTH = 64;
const DEFAULT_NUM_CHANNELS = 4;
```

---

## 4. Hardcoded ID Generation Patterns

### Issue: Timestamp-Based ID Generation

**Pattern Found in Multiple Stores:**

```typescript
// useProjectStore.ts (lines 27, 66)
id: `project-${Date.now()}`

// useInstrumentStore.ts (lines 159, 215)
id: `effect-${Date.now()}`
id: `preset-${Date.now()}`

// useTrackerStore.ts (lines 57, 355)
id: `pattern-${Date.now()}`

// useAutomationStore.ts (line 78)
id: `curve-${Date.now()}`

// useHistoryStore.ts (line 77)
id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
```

**Problems:**
- Timestamp-based IDs can collide if created rapidly
- Hardcoded string prefixes scattered throughout codebase
- Inconsistent ID formats (some use random suffix, some don't)
- Not friendly for debugging/serialization

**Recommendation:**
Create centralized ID generator utility:

```typescript
// src/utils/idGenerator.ts
let counters: Record<string, number> = {};

export function generateId(type: string): string {
  if (!counters[type]) {
    counters[type] = 0;
  }
  counters[type]++;
  return `${type}-${Date.now()}-${counters[type]}`;
}

// Usage:
generateId('effect')  // "effect-1736803200000-1"
generateId('preset')  // "preset-1736803200000-2"
```

Or use UUID library:
```typescript
import { v4 as uuidv4 } from 'uuid';
id: `effect-${uuidv4()}`
```

---

## 5. Duplicate Default Values

### Issue: Repeated Default Values in Presets

**Analysis:**
```bash
$ grep -rn "volume: -\|pan: 0" src/constants --include="*.ts" | wc -l
88
```

**Example from factoryPresets.ts:**
Nearly every preset has:
```typescript
volume: -12,
pan: 0,
```

**Impact:**
- 88 lines of duplicate default values
- Changing defaults requires mass search/replace
- Inconsistent volume levels across presets

**Recommendation:**
- Define preset defaults at module level
- Use object spread for common defaults:

```typescript
const PRESET_DEFAULTS = {
  effects: [],
  volume: -12,
  pan: 0,
};

export const BASS_PRESETS: InstrumentConfig[] = [
  {
    id: 0,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: { /* ... */ },
    ...PRESET_DEFAULTS,
  },
  // ...
];
```

---

## 6. Console Message Strings

### Issue: 58 Hardcoded Console Messages

**Examples:**
```typescript
console.warn('Maximum number of instruments reached (256)');
console.log('History cleared');
console.warn('No block selected');
console.error('Failed to initialize audio engine:', error);
console.log(`Set BPM: ${param}`);
```

**Recommendation:**
- For user-facing messages, create message constants
- For debug logs, consider structured logging
- For production, implement proper logging levels

```typescript
// src/constants/messages.ts
export const ERROR_MESSAGES = {
  MAX_INSTRUMENTS: 'Maximum number of instruments reached (256)',
  NO_BLOCK_SELECTED: 'No block selected',
  NO_CLIPBOARD: 'No clipboard data',
  AUDIO_INIT_FAILED: 'Failed to initialize audio engine',
};
```

---

## 7. Arpeggio and Effect Timing

**File:** `/src/engine/EffectCommands.ts`

```typescript
// Line 233: Hardcoded 20ms arpeggio refresh rate
}, 20); // 50Hz refresh rate
```

**Recommendation:**
```typescript
const ARPEGGIO_REFRESH_MS = 20; // 50Hz
const ARPEGGIO_REFRESH_HZ = 50;
```

---

## 8. Hardcoded String Literals in Types

**File:** `/src/types/instrument.ts`

```typescript
export type SynthType =
  | 'Synth'
  | 'MonoSynth'
  | 'DuoSynth'
  | 'FMSynth'
  | 'AMSynth'
  | 'PluckSynth'
  | 'MetalSynth'
  | 'MembraneSynth'
  | 'NoiseSynth'
  | 'TB303'
  | 'Sampler'
  | 'Player';
```

**Status:** This is acceptable for TypeScript types, but consider:

**Recommendation:**
Create runtime array for validation/iteration:
```typescript
export const SYNTH_TYPES = [
  'Synth',
  'MonoSynth',
  'DuoSynth',
  // ...
] as const;

export type SynthType = typeof SYNTH_TYPES[number];
```

This enables:
- Runtime validation
- Dropdown menus
- Iteration over types

---

## Summary of Recommendations

### High Priority

1. **Remove hardcoded IDs from factoryPresets.ts** - Use auto-generation
2. **Eliminate TB-303 preset duplication** - Single source of truth
3. **Create audio constants file** - Centralize magic numbers
4. **Fix BPM constant imports** - Use actual constants, not type imports
5. **Create centralized ID generator** - Replace Date.now() pattern

### Medium Priority

6. **Extract preset defaults** - Reduce duplication
7. **Extract instrument ID limit** - Create MAX_INSTRUMENTS constant
8. **Create error message constants** - For user-facing messages
9. **Define timing constants** - For arpeggio and effect refresh rates

### Low Priority

10. **Create synth type arrays** - For runtime validation
11. **Structured logging** - Replace console.* calls
12. **Pattern defaults** - Extract DEFAULT_PATTERN_LENGTH

---

## Metrics

- **Total preset IDs to fix:** 36
- **Duplicate preset count:** 8 TB-303 presets
- **Magic numbers found:** ~30+
- **ID generation patterns:** 5 different types
- **Duplicate default values:** 88 instances
- **Console messages:** 58 instances
- **Instrument ID limit references:** 4 (2 duplicate code blocks)

---

## Next Steps

1. Create constants files:
   - `src/constants/audioConstants.ts`
   - `src/constants/messages.ts`
   - `src/utils/idGenerator.ts`

2. Refactor preset files:
   - Remove hardcoded IDs from factoryPresets.ts
   - Consolidate TB-303 presets
   - Use preset defaults

3. Update stores:
   - Replace magic numbers with constants
   - Use centralized ID generation
   - Fix constant imports

4. Create migration guide for existing projects
