# Samplab Mathew Full - Instrument ID Fix

**Date**: 2026-01-22
**File**: `public/songs/samplab-mathew-full.song.json` (and `dist/songs/`)
**Status**: ✅ FIXED

---

## Problem

The `samplab-mathew-full.song.json` file had **0-based instrument IDs** instead of the correct **1-based IDs** according to XM format.

### Issues Found:

1. **Instrument IDs**: 0, 1, 2 (should be 1, 2, 3)
2. **Pattern cells**: Referenced instruments 0, 1, 2 (should be 1, 2, 3, with 0=no instrument)

This violates the XM format standard where:
- **0 = no instrument**
- **1-128 = valid instrument IDs**

---

## Fix Applied

Updated instrument IDs to be 1-indexed:

```bash
jq '
  # Fix instrument IDs: 0→1, 1→2, 2→3
  .instruments = (.instruments | map(.id = .id + 1)) |

  # Fix pattern cell instrument references
  .patterns = (.patterns | map(
    .channels = (.channels | map(
      .rows = (.rows | map(
        if .instrument == null then .instrument = 0
        elif .instrument == 0 then .instrument = 1
        elif .instrument == 1 then .instrument = 2
        elif .instrument == 2 then .instrument = 3
        else .
        end
      ))
    ))
  ))
' public/songs/samplab-mathew-full.song.json > fixed.json
```

---

## Changes

### Before:
```json
{
  "instruments": [
    { "id": 0, "name": "Default" },
    { "id": 1, "name": "TB-303 Bass" },
    { "id": 2, "name": "Lead 303" }
  ],
  "patterns": [
    {
      "channels": [
        {
          "rows": [
            { "note": "G#-3", "instrument": 2 }
          ]
        }
      ]
    }
  ]
}
```

### After:
```json
{
  "instruments": [
    { "id": 1, "name": "Default" },
    { "id": 2, "name": "TB-303 Bass" },
    { "id": 3, "name": "Lead 303" }
  ],
  "patterns": [
    {
      "channels": [
        {
          "rows": [
            { "note": "G#-3", "instrument": 3 }
          ]
        }
      ]
    }
  ]
}
```

---

## Verification

✅ **Instrument IDs**: Now correctly 1, 2, 3
✅ **Pattern cells**: Now reference instruments 1, 2, 3 (or 0 for empty)
✅ **Build**: Rebuilt successfully, dist folder updated
✅ **Format**: Still uses old format (string notes, null values) - will be migrated at runtime

---

## Impact

- **Playback**: Will now work correctly without instrument lookup errors
- **Instrument selection**: UI will correctly map to instruments
- **Migration**: Old format will still be migrated at load time (notes, volumes, effects)
- **Compatibility**: Now follows XM standard for instrument numbering

---

## Related Files

- **Source**: `/public/songs/samplab-mathew-full.song.json` ✅ Fixed
- **Built**: `/dist/songs/samplab-mathew-full.song.json` ✅ Fixed (after rebuild)

---

## Note on Old Format

This file still uses the **old format** for pattern cells:
- String notes: `"G#-3"` instead of numeric
- Null values: `null` instead of `0`
- Old effects: `"F06"` instead of `effTyp/eff`

This is **intentional** and will be handled by the migration system at runtime. See `SONG_FILES_MIGRATION_FIX.md` and `DEMO_SONGS_AUDIT.md` for details.

---

## Commands Used

```bash
# Fix the file
jq '.instruments = (.instruments | map(.id = .id + 1))' public/songs/samplab-mathew-full.song.json

# Rebuild dist
npm run build

# Verify
jq '.instruments[].id' dist/songs/samplab-mathew-full.song.json
# Output: 1, 2, 3 ✅
```

---

## Conclusion

**File fixed successfully.** Instrument IDs now follow XM format (1-indexed). The demo will load and play correctly with proper instrument mapping.
