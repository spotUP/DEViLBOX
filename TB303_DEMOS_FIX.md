# TB-303 Demos Format Fix

**Date**: 2026-01-22
**Files**: All 10 TB-303 demo files in `/public/demos/tb303/` and `/dist/demos/tb303/`
**Status**: ✅ ALL FIXED

---

## Problem

All 10 TB-303 demo files (`.dbox` format) used **old format** that violated XM standards:

### Issues Found:

1. **Instrument ID 0** - Should be 1 (XM: 0=no instrument, 1-128=valid)
2. **String notes** - e.g., "D-2", "C#2" instead of numeric values
3. **Old volume format** - Direct value 64 instead of XM format 0x50
4. **Null effects** - Should be `effTyp: 0, eff: 0` instead of `effect: null`

---

## Files Fixed

✅ All 10 TB-303 demo files updated:

1. `1-fatboy-slim-everybody-needs-a-303.dbox`
2. `2-josh-wink-high-state-of-consciousness.dbox`
3. `3-christophe-just-i-m-a-disco-dancer-part-1-.dbox`
4. `4-christophe-just-i-m-a-disco-dancer-part-2-.dbox`
5. `5-claustrophobic-sting-the-prodigy.dbox`
6. `6-josh-wink-are-you-there.dbox`
7. `7-cut-paste-forget-it-part-1-.dbox`
8. `8-cut-paste-forget-it-part-2-.dbox`
9. `9-public-energy-three-o-three-part-1-.dbox`
10. `10-public-energy-three-o-three-part-2-.dbox`

---

## Fix Script

Created automated fix script: `/scripts/fixTB303Demos.ts`

**What it does:**
- ✅ Fixes instrument IDs: 0 → 1
- ✅ Converts string notes to numeric: "D-2" → 27
- ✅ Converts volumes to XM format: 64 → 0x50 (80)
- ✅ Converts null effects to numeric: `null` → `effTyp: 0, eff: 0`

---

## Example Fix

### Before:
```json
{
  "instruments": [
    { "id": 0, "name": "TB-303 (SQUARE)" }
  ],
  "patterns": [{
    "channels": [{
      "rows": [{
        "note": "D-2",
        "instrument": 0,
        "volume": 64,
        "effect": null,
        "accent": true,
        "slide": true
      }]
    }]
  }]
}
```

### After:
```json
{
  "instruments": [
    { "id": 1, "name": "TB-303 (SQUARE)" }
  ],
  "patterns": [{
    "channels": [{
      "rows": [{
        "note": 27,
        "instrument": 1,
        "volume": 80,
        "effTyp": 0,
        "eff": 0,
        "accent": true,
        "slide": true
      }]
    }]
  }]
}
```

---

## Verification

✅ **Instrument IDs**: Now 1 (was 0)
✅ **Notes**: Numeric (e.g., 27 for D-2)
✅ **Volumes**: XM format (0x50 = 80 for volume 64)
✅ **Effects**: `effTyp: 0, eff: 0` (was `effect: null`)
✅ **Build**: Dist folder updated successfully

---

## Format Details

### Note Conversion
- String format: "D-2", "C#3", etc.
- XM format: Numeric 1-96 (C-0 to B-7)
- Example: "D-2" → 27

Formula: `note = (octave * 12) + semitone + 1`

### Volume Conversion
- Old format: 0-64 (direct volume)
- XM format: 0x10-0x50 (set volume 0-64)
- Formula: `xmVolume = 0x10 + oldVolume`
- Example: 64 → 0x10 + 64 = 0x50 (80 decimal)

### Instrument IDs
- Old: 0 (invalid in XM)
- New: 1 (first valid instrument)
- XM standard: 0=no instrument, 1-128=valid

---

## Commands Used

```bash
# Run fix script
npx tsx scripts/fixTB303Demos.ts

# Rebuild dist
npm run build

# Verify fixes
jq '.instruments[].id' public/demos/tb303/*.dbox
# Output: All show "1" ✅

jq '.patterns[0].channels[0].rows[0]' public/demos/tb303/1-fatboy-slim-everybody-needs-a-303.dbox
# Output: Shows numeric note, XM volume, effTyp/eff ✅
```

---

## Impact

These fixes ensure:
- ✅ Correct instrument playback (ID 1 instead of 0)
- ✅ Proper XM format compliance
- ✅ Consistent with other demo songs
- ✅ No runtime migration needed (.dbox files should be current format)

---

## Related Documentation

- **SAMPLAB_MATHEW_FIX.md** - Similar fix for .song.json file
- **DEMO_SONGS_AUDIT.md** - Demo songs audit (old format with migration)
- **SONG_FILES_MIGRATION_FIX.md** - Migration system for old format
- **AUDIT_REPORT.md** - XM format audit

---

## Conclusion

**All 10 TB-303 demos fixed successfully.** Files now use correct XM-compatible format with 1-indexed instruments, numeric notes, XM volume encoding, and numeric effect format.

No migration needed - `.dbox` files are now in the correct current format.
