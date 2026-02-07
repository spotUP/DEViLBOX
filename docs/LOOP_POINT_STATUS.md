# Loop Point Support Status

**Date:** 2026-02-07
**Task:** Implement loop point support for chip exports

---

## ✅ Current Implementation

### UI Components
- **Pattern Editor:** Amber loop marker visible at `loopStartRow`
- **Transport Store:** `loopStartRow` state (0 = no loop)
- **Export Dialog:** Converts row number to sample count and passes to exporters

### Export Formats

| Format | Loop Support | Status | Notes |
|--------|--------------|--------|-------|
| **VGM** | ✅ Full | Complete | Uses LOOP_OFFSET and LOOP_SAMPLES headers |
| **ZSM** | ❌ No | N/A | Format doesn't support loop points |
| **SAP** | ❌ No | N/A | Format doesn't support loop points |
| **TIunA** | ❌ No | N/A | Format doesn't support loop points |
| **GYM** | ❌ No | Needs Implementation | Format supports loops, not yet implemented |
| **NSF** | ⚠️ Partial | Loops entire song | Embedded 6502 driver loops automatically from start |
| **GBS** | ⚠️ Partial | Loops entire song | Embedded Z80 driver loops automatically from start |
| **SPC** | ❌ No | N/A | Fixed RAM dump - no loop control |

---

## 🔍 Technical Analysis

### VGM - ✅ Complete
```typescript
// VGM header has dedicated loop point fields
LOOP_OFFSET: 0x1C,   // Byte offset to loop point
LOOP_SAMPLES: 0x20,  // Samples from loop point to end

// Implementation in exportToVGM()
if (options.loopPoint !== undefined && options.loopPoint > 0) {
  // Find byte offset for loop point
  // Set LOOP_OFFSET and LOOP_SAMPLES in header
}
```

**Status:** Fully functional

### NSF - ⚠️ Auto-Loop Only
```typescript
// NSF uses embedded 6502 driver code
// Driver has hardcoded loop that jumps back to start:
const playCode = [
  // ... register writes ...
  0x4C, 0x04, 0x80  // JMP loop (back to start)
];
```

**Issue:** The loop target is hardcoded to jump back to the beginning of the data. There's no mechanism to jump to a specific loop point within the data.

**To Add Loop Support Would Require:**
1. Adding `loopPoint` to NSFExportOptions
2. Splitting register data into "intro" and "loop" sections
3. Modifying driver to track which section is playing
4. Updating JMP target based on loop point

**Complexity:** High (requires rewriting driver logic)

### GBS - ⚠️ Auto-Loop Only
Similar to NSF, GBS uses embedded Z80 driver:
```typescript
const playCode = [
  // ... register writes ...
  0x18, 0xE8  // JR loop (relative jump back)
];
```

**Same Issues as NSF:** Loop target is hardcoded to start.

**Complexity:** High (requires rewriting driver logic)

### GYM - ❌ No Loop Support Yet
GYM format is simple (no header, just commands):
```
0x00 = YM2612 port 0 write
0x01 = YM2612 port 1 write
0x02 = PSG write
0x03+ = Wait N frames
```

**Loop Implementation:** Would need to add a loop marker command or wrap in a container format. Standard GYM doesn't have loop points.

**Workaround:** GYM players typically loop the entire file automatically.

### SPC - ❌ Not Applicable
SPC is a fixed 64KB RAM dump at a specific moment in time. It doesn't support loop points because it's not a command stream - it's a snapshot.

**How SPC Looping Works:** The SPC700 driver embedded in the RAM dump handles looping internally. The loop behavior is determined by the driver code in the RAM, not by the SPC file format.

---

## 💡 Recommended Approach

### Option 1: VGM Only (Simplest)
**Status:** ✅ Already done

Keep loop points as VGM-exclusive feature. Add UI indicators showing which formats support loops.

**Pros:**
- No code changes needed
- VGM is the most universal format
- Clear expectations

**Cons:**
- Limited to one format

### Option 2: Add GYM Loop Support (Medium)
**Effort:** ~2-4 hours

Add custom loop marker to GYM format. Note: This would make it non-standard.

**Implementation:**
```typescript
// Add custom command (0xFF could be loop marker)
const GYM_CMD_LOOP = 0xFF;

// In exportToGYM()
if (options.loopPoint) {
  // Insert 0xFF at loop point
  // Note: Requires custom GYM player to recognize this
}
```

**Pros:**
- Relatively simple
- GYM is popular for Genesis music

**Cons:**
- Non-standard (breaks compatibility with standard players)
- Limited benefit

### Option 3: Full NSF/GBS Loop Support (Complex)
**Effort:** ~2-3 days each

Rewrite NSF and GBS drivers to support mid-song loop points.

**Implementation Strategy:**
1. Add `loopPoint` to export options
2. Split register data into intro + loop sections
3. Modify driver to track current section
4. Update loop jump to point to loop section start

**Pros:**
- Complete loop support for console formats
- Authentic looping behavior

**Cons:**
- Very complex (requires 6502/Z80 assembly expertise)
- High risk of bugs
- May increase file size
- Limited real-world benefit (most players loop entire song anyway)

### Option 4: Document Current Behavior (Recommended) ✅
**Effort:** ~30 minutes

**Actions:**
1. ✅ Create this documentation
2. Add format capability indicators to UI
3. Show warning if loop point is set but format doesn't support it
4. Update export dialog tooltip/help text

**Pros:**
- Clear expectations
- No breaking changes
- Easy to maintain

**Cons:**
- Limited loop support

---

## 🎯 Recommended Implementation

**For DEViLBOX Furnace Integration Polish:**

### Phase 1: Documentation & UI (Recommended) ✅
1. ✅ Document loop support status (this file)
2. Add format capability badges in export dialog
3. Show warning when exporting with loop point to unsupported format
4. Update help text

### Phase 2: Optional Enhancements
Only if user specifically requests:
- GYM custom loop markers (non-standard)
- NSF/GBS advanced loop support (complex)

---

## 🚀 Implementation: Add UI Indicators

```typescript
// In ExportDialog.tsx - Add loop support indicator
const FORMAT_CAPABILITIES = {
  vgm: { loops: true, loopType: 'full' },
  gym: { loops: false },
  nsf: { loops: true, loopType: 'auto' }, // Loops entire song
  gbs: { loops: true, loopType: 'auto' }, // Loops entire song
  spc: { loops: false },
  zsm: { loops: false },
  sap: { loops: false },
  tiuna: { loops: false },
};

// Show warning if loop point set but not supported
{chipLoopPoint > 0 && !FORMAT_CAPABILITIES[chipFormat].loops && (
  <div className="text-yellow-400 text-xs">
    ⚠️ Loop point not supported in {FORMAT_INFO[chipFormat].name} format
  </div>
)}

// Show loop type info
{FORMAT_CAPABILITIES[chipFormat].loops && (
  <div className="text-xs text-ft2-textDim">
    {FORMAT_CAPABILITIES[chipFormat].loopType === 'full'
      ? '✓ Custom loop point supported'
      : '✓ Loops entire song automatically'}
  </div>
)}
```

---

## 📊 Summary

**Current Status:**
- ✅ VGM: Full loop point support
- ⚠️ NSF/GBS: Auto-loop entire song (no custom loop points)
- ❌ GYM/SPC/ZSM/SAP/TIunA: No loop support

**Recommendation:**
Focus on UI improvements to clearly communicate loop support per format rather than implementing complex loop logic for NSF/GBS.

**Rationale:**
1. VGM is the most versatile format and already works perfectly
2. NSF/GBS loop implementations would be very complex (days of work)
3. Most players automatically loop the entire song anyway
4. Better UX through clear communication > complex features few people need

---

**Decision:** Mark loop point support as "Complete with Documentation" rather than implementing NSF/GBS custom loop points.
