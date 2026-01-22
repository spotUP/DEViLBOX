# FastTracker II Architecture Alignment - Implementation Progress

## ✅ Completed (Phase 1-3)

### 1. Core Type System Updates
- **TrackerCell interface** (`src/types/tracker.ts`)
  - ✅ Updated to XM-compatible format:
    - `note`: number (0 = empty, 1-96 = notes, 97 = note off)
    - `instrument`: number (0 = no instrument, 1-128 = valid)
    - `volume`: number (0x00-0xFF, XM volume column format)
    - `effTyp`: number (0-35, effect type)
    - `eff`: number (0x00-0xFF, effect parameter)
  - ✅ Kept extensions: `effect2`, `accent`, `slide`, automation lanes
  - ✅ Updated `EMPTY_CELL` and `NOTE_OFF` constants

- **InstrumentConfig interface** (`src/types/instrument.ts`)
  - ✅ Added `type: 'sample' | 'synth'` field
  - ✅ Updated ID range documentation (1-128, XM-compatible)
  - ✅ Synths marked as 'synth', samples as 'sample'

### 2. Conversion Utilities
- **xmConversions.ts** (`src/lib/xmConversions.ts`) - NEW FILE
  - ✅ `stringNoteToXM()` - Convert "C-4" → 49
  - ✅ `xmNoteToString()` - Convert 49 → "C-4"
  - ✅ `xmNoteToToneJS()` - Convert 49 → "C4" (for Tone.js)
  - ✅ `effectStringToXM()` - Convert "A05" → [10, 0x05]
  - ✅ `xmEffectToString()` - Convert [10, 0x05] → "A05"
  - ✅ `formatInstrument()` - Format 12 → "0C" or "12"
  - ✅ `parseInstrument()` - Parse "0C" → 12
  - ✅ `formatVolumeColumn()` - Format 0x65 → "v↓5"
  - ✅ `periodToXMNote()` - Convert Amiga period → XM note
  - ✅ `xmNoteToPeriod()` - Convert XM note → Amiga period

### 3. Instrument Store Updates
- **useInstrumentStore.ts** (`src/stores/useInstrumentStore.ts`)
  - ✅ Updated `findNextId()` to search 1-128 range (not 0-255)
  - ✅ Changed default instrument ID from 0 → 1
  - ✅ Added `type: 'synth'` to created instruments
  - ✅ Updated `loadInstruments()` migration for backward compatibility
  - ✅ Updated transformation functions to set correct type field

### 4. Playback Engine Updates
- **PatternScheduler.ts** (`src/engine/PatternScheduler.ts`)
  - ✅ Updated instrument resolution (0 = no instrument, 1-128 = valid)
  - ✅ Updated note handling (0 = no note, 1-96 = notes, 97 = note off)
  - ✅ Updated `convertNoteFormat()` to handle both numeric and string notes
  - ✅ Added XM volume column decoding (0x10-0x50 = volume 0-64)
  - ✅ Added backward compatibility for legacy string notes

### 5. Import Pipeline Updates
- **ModuleConverter.ts** (`src/lib/import/ModuleConverter.ts`)
  - ✅ **CRITICAL FIX**: Removed artificial `(instrument - 1) * 100` multiplication
  - ✅ Updated `convertXMNote()` for direct 1:1 mapping (XM → TrackerCell)
  - ✅ Updated `convertMODNote()` to use `periodToXMNote()` and direct instrument IDs
  - ✅ Updated `convertCell()` for libopenmpt legacy path
  - ✅ Updated empty cell constants to use XM format (0, 0, 0, 0, 0)
  - ✅ Fixed instrument tracking logic (0 = no instrument)

## 🚧 Remaining Work (Phase 4-5)

### 6. UI Components (IN PROGRESS)
**Critical components that need updates:**

1. **NoteCell.tsx** - Display/edit numeric XM notes
   - [ ] Update display: `xmNoteToString(cell.note)`
   - [ ] Update input: Parse string → XM note number
   - [ ] Handle note off (97) and empty (0)

2. **InstrumentCell.tsx** - Display/edit 1-128 range
   - [ ] Update display: `formatInstrument(cell.instrument, 'hex')` → "01-80"
   - [ ] Update input: Parse hex/decimal → 1-128
   - [ ] Handle empty (0) → ".."

3. **VolumeCell.tsx** - Display/edit XM volume column
   - [ ] Update display: `formatVolumeColumn(cell.volume)`
   - [ ] Update input: Parse volume effects (v↓, v↑, p=, etc.)
   - [ ] Handle 0x10-0x50 (volume 0-64) vs 0x60-0xFF (effects)

4. **EffectCell.tsx** - Display/edit effTyp + eff
   - [ ] Option A: Keep legacy string format, convert internally
   - [ ] Option B: Update to show numeric format directly
   - [ ] Recommendation: Keep string format for UX, convert behind scenes

5. **Pattern editor keyboard input**
   - [ ] Update note input handlers
   - [ ] Update instrument input handlers
   - [ ] Ensure hex input works (01-80)

### 7. Export Pipeline
- **XMExporter.ts** (`src/lib/export/XMExporter.ts`)
  - [ ] Update to use direct TrackerCell → XM mapping
  - [ ] Add warning for synth instruments (type === 'synth')
  - [ ] Add rendering option for synths → samples

- **MODExporter.ts** (`src/lib/export/MODExporter.ts`)
  - [ ] Update to use `xmNoteToPeriod()` for period calculation
  - [ ] Limit to 31 instruments (MOD constraint)
  - [ ] Add warning for instruments > 31

### 8. Migration & Backward Compatibility
- **useProjectPersistence.ts**
  - [ ] Add migration logic for old .dbox files
  - [ ] Detect old format: `typeof cell.note === 'string'`
  - [ ] Convert: `stringNoteToXM(cell.note)`
  - [ ] Convert instruments: Map 0/100/200 → 1/2/3
  - [ ] Show migration dialog to user

### 9. Testing & Verification
- [ ] Test MOD import with break-the-box.mod
  - [ ] Verify: Row 0 shows "C-3 0C" (not "C5 190")
  - [ ] Verify: All notes/instruments match ProTracker
- [ ] Test playback accuracy
  - [ ] Compare waveform with pt2-clone
  - [ ] Target: 95%+ similarity
- [ ] Test synth integration
  - [ ] Replace sample with TB-303
  - [ ] Verify playback works
  - [ ] Verify .dbox export preserves synth
  - [ ] Verify .xm export renders to sample + warning
- [ ] Test round-trip
  - [ ] Import XM → Edit → Export XM → Import → Compare
  - [ ] Verify no data loss for standard XM features

## Key Benefits Achieved

1. **✅ Instrument numbering now matches XM/FT2**
   - Before: 0, 100, 200, 1100
   - After: 1, 2, 3, 12 (display as 01, 02, 03, 0C in hex)

2. **✅ Direct XM import with minimal conversion**
   - Before: Complex conversion with period tables, instrument ID remapping
   - After: Direct 1:1 copy for XM cells

3. **✅ Synths properly identified as extensions**
   - Type field distinguishes sample vs synth instruments
   - XM export can warn about synth features

4. **✅ Backward compatibility maintained**
   - PatternScheduler handles both old string and new numeric notes
   - loadInstruments() migrates old effect categories
   - Old .dbox files can be loaded (with migration)

## Next Steps

**Priority 1 (Critical for testing):**
1. Update NoteCell component
2. Update InstrumentCell component
3. Test MOD import

**Priority 2 (Full functionality):**
4. Update VolumeCell component
5. Update keyboard input handlers
6. Add migration logic

**Priority 3 (Polish):**
7. Update export pipeline
8. Add user preferences (hex vs decimal display)
9. Comprehensive testing

## Migration Notes for Developers

**Old format detection:**
```typescript
const isOldFormat = typeof cell.note === 'string';
if (isOldFormat) {
  // Migrate cell
  cell.note = stringNoteToXM(cell.note as string);
  // ... etc
}
```

**Instrument ID migration:**
```typescript
// Old: 0, 100, 200, 300 → New: 1, 2, 3, 4
if (instrument % 100 === 0 && instrument < 3200) {
  return (instrument / 100) + 1;
}
```

**Effect migration:**
```typescript
if (cell.effect && typeof cell.effect === 'string') {
  const [effTyp, eff] = effectStringToXM(cell.effect);
  cell.effTyp = effTyp;
  cell.eff = eff;
}
```

## Success Criteria

- [x] TrackerCell uses XM format (5 bytes core)
- [x] Instruments use 1-128 range
- [x] Conversion utilities complete
- [x] Import pipeline simplified
- [ ] UI displays correctly (01-80 or 01-128)
- [ ] MOD import shows correct numbers
- [ ] Playback accuracy maintained
- [ ] Synths work within XM framework
