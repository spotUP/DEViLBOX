# Modland Hash Algorithm - Technical Specification

This document describes the exact algorithm used by `modland_hash` tool to generate file hashes, pattern hashes, and sample hashes for the Modland database.

**Source**: https://github.com/emoon/modland_hash

---

## Overview

The modland_hash tool uses **three types of hashes**:

1. **File Hash (SHA-256)** - Hash of the entire module file
2. **Pattern Hash (FNV-1a 64-bit)** - Hash of only the NOTE values (melody fingerprint)
3. **Sample Hash (SHA-256)** - Hash of each sample's raw PCM data

---

## 1. File Hash (SHA-256)

**Purpose**: Unique identifier for the exact file (byte-for-byte)

**Algorithm**: Standard SHA-256 of the complete file contents

**Implementation** (Rust):
```rust
let mut file_data = Vec::new();
file.read_to_end(&mut file_data).unwrap();
let hash = sha2::Sha256::digest(&file_data);
let sha256_hash = format!("{:x}", hash); // 64-char hex string
```

**Database**: Stored in `files.hash_id` column (TEXT, 64 characters)

---

## 2. Pattern Hash (FNV-1a 64-bit)

**Purpose**: "Melody fingerprint" to find similar tunes, remixes, and covers

**Key Insight**: Only hashes **NOTE values** (not instruments, volumes, or effects). This allows finding the same melody played with different instruments or effects.

**Algorithm**: FNV-1a 64-bit hash

**Constants**:
- `FNV_OFFSET_BASIS = 14695981039346656037` (unsigned 64-bit)
- `FNV_PRIME = 1099511628211` (unsigned 64-bit)

**Pseudocode**:
```
hash = FNV_OFFSET_BASIS

for each subsong:
    for each order in subsong:
        pattern_index = get_order_pattern(order)
        num_rows = get_pattern_num_rows(pattern_index)
        
        for each row in pattern:
            for each channel in row:
                note = get_note_value(pattern, row, channel)
                
                // Special case: Invalid module detection
                if effect == 1 AND parameter == 0xFF:
                    return 1  // Invalid marker
                
                // Only hash non-zero notes
                if note != 0:
                    hash = hash XOR note
                    hash = hash * FNV_PRIME

return hash
```

**C++ Implementation** (from `interface.cpp`):
```cpp
static uint64_t hash_patterns(openmpt::module& mod, int dump_patterns) {
    uint64_t hash = 14695981039346656037ull;  // FNV offset basis
    
    const int32_t num_channels = mod.get_num_channels();
    const int32_t num_songs = mod.get_num_subsongs();
    
    for (auto s = 0; s < num_songs; s++) {
        mod.select_subsong(s);
        if (mod.get_current_order() != 0) {
            continue;  // Skip hidden subsongs
        }
        
        const auto num_orders = mod.get_num_orders();
        for (auto o = 0; o < num_orders; o++) {
            const int32_t p = mod.get_order_pattern(o);
            const int32_t num_rows = mod.get_pattern_num_rows(p);
            
            for (auto r = 0; r < num_rows; r++) {
                for (auto c = 0; c < num_channels; c++) {
                    const uint8_t note = mod.get_pattern_row_channel_command(
                        p, r, c, openmpt::module::command_note
                    );
                    
                    const uint8_t effect = mod.get_pattern_row_channel_command(
                        p, r, c, openmpt::module::command_effect
                    );
                    
                    const uint8_t parameter = mod.get_pattern_row_channel_command(
                        p, r, c, openmpt::module::command_parameter
                    );
                    
                    // Invalid module check
                    if (effect == 1 && parameter == 0xff) {
                        return 1;
                    }
                    
                    // Only hash non-zero notes
                    if (note != 0) {
                        hash ^= note;
                        hash *= 1099511628211ull;  // FNV prime
                    }
                }
            }
        }
    }
    
    return hash;
}
```

**Database**: Stored in `files.pattern_hash` column (INTEGER, 64-bit unsigned)

**Special Values**:
- `1` = Invalid module (contains 0x1ff effect)
- `NULL` = No pattern data / couldn't extract patterns

**Why Only Notes?**
- Same melody with different instruments → same hash
- Remixes that keep the melody → same hash
- Covers in different formats → same hash
- Speed/tempo changes don't affect the hash

---

## 3. Sample Hash (SHA-256)

**Purpose**: Identify identical samples across different modules

**Algorithm**: SHA-256 of the raw PCM sample data

**Implementation** (Rust):
```rust
for sample in samples {
    let sha256_hash = if let Some(data) = sample.get_data() {
        let hash = sha2::Sha256::digest(data);
        format!("{:x}", hash)  // 64-char hex string
    } else {
        "NULL"
    };
}
```

**Sample Data Structure** (from libopenmpt):
```c
struct CSampleData {
    uint8_t* data;              // Raw PCM data
    uint8_t* sample_text;       // Sample name
    uint32_t length_bytes;      // Size in bytes
    uint32_t length;            // Length in samples
    uint32_t sample_id;         // 1-based sample ID
    uint16_t global_vol;        // Global volume (0-64)
    uint8_t bits_per_sample;    // 8 or 16
    uint8_t stereo;             // 0=mono, 1=stereo
    uint16_t pan;               // Pan (0-256)
    uint16_t volume;            // Volume (0-256)
    uint32_t c5_speed;          // Frequency (IT/S3M/MPTM)
    int8_t relative_tone;       // Relative note (MOD/XM)
    int8_t fine_tune;           // Finetune (-128 to 127)
    uint8_t vib_type;           // Vibrato type
    uint8_t vib_sweep;          // Vibrato sweep
    uint8_t vib_depth;          // Vibrato depth
    uint8_t vib_rate;           // Vibrato rate
};
```

**Database**: Stored in `samples` table with columns:
- `hash_id` (TEXT) - Sample SHA-256 hash
- `song_id` (INTEGER) - Foreign key to files.song_id
- `song_sample_id` (INTEGER) - Sample ID within the song (1-based)
- `text` (TEXT) - Sample name
- `length_bytes` (INTEGER) - Size in bytes
- `length` (INTEGER) - Length in samples

---

## Database Schema

```sql
CREATE TABLE files (
    song_id INTEGER PRIMARY KEY,
    hash_id TEXT NOT NULL,           -- File SHA-256 (64 chars)
    pattern_hash INTEGER,            -- Pattern FNV-1a (64-bit unsigned)
    url TEXT NOT NULL                -- Modland path
);

CREATE TABLE samples (
    hash_id TEXT NOT NULL,           -- Sample SHA-256 (64 chars)
    song_id INTEGER NOT NULL,        -- Foreign key
    song_sample_id INTEGER NOT NULL, -- 1-based sample index
    text TEXT,                       -- Sample name
    length_bytes INTEGER,            -- Size in bytes
    length INTEGER,                  -- Length in samples
    PRIMARY KEY (hash_id, song_id, song_sample_id)
);

CREATE TABLE instruments (
    hash_id TEXT NOT NULL,           -- Not used yet
    song_id INTEGER NOT NULL,
    text TEXT
);
```

---

## Implementation Notes

### FNV-1a Algorithm
- **Why FNV-1a?** Fast, good distribution, simple to implement
- **64-bit vs 32-bit**: 64-bit chosen to minimize collisions in 727K+ files
- **Order matters**: Hashing in sequence order preserves song structure
- **Endianness**: Little-endian on all platforms (x86/ARM)

### Pattern Extraction
Uses **libopenmpt** to parse all tracker formats:
- MOD, XM, IT, S3M, MTM, UMX, MO3, MPTM, etc.
- 70+ formats supported
- Handles multi-subsong modules (e.g., UADE formats)
- Skips hidden subsongs

### Performance
- File hash: ~50-200ms for typical 50-500KB modules
- Pattern hash: ~10-50ms (depends on pattern count)
- Sample hash: ~5-20ms per sample
- Total: ~100-500ms per module

### Edge Cases
- **Empty patterns**: Contribute nothing to hash (no notes)
- **Note-off events**: Usually have note value > 0, so they ARE hashed
- **Pattern breaks**: Not considered (full pattern is hashed)
- **Loop points**: Not considered (full order list is hashed)
- **Invalid modules**: Return hash=1 if 0x1ff effect detected

---

## Usage Examples

### Finding Duplicates
```bash
# Exact duplicates (same file hash)
SELECT url FROM files WHERE hash_id = '<sha256>';

# Similar tunes (same melody, different instruments)
SELECT url FROM files WHERE pattern_hash = <fnv_hash>;

# Same sample in different files
SELECT f.url FROM files f
JOIN samples s ON f.song_id = s.song_id
WHERE s.hash_id = '<sample_sha256>';
```

### Finding Remixes
```sql
-- Find all files with the same melody fingerprint
SELECT 
    f1.url AS original,
    f2.url AS remix
FROM files f1
JOIN files f2 ON f1.pattern_hash = f2.pattern_hash
WHERE f1.song_id != f2.song_id
  AND f1.pattern_hash IS NOT NULL
  AND f1.pattern_hash != 1;
```

### Sample Reuse Detection
```sql
-- Find which songs use a specific sample
SELECT 
    f.url,
    s.song_sample_id,
    s.text AS sample_name
FROM samples s
JOIN files f ON s.song_id = f.song_id
WHERE s.hash_id = '<sample_sha256>'
ORDER BY f.url;
```

---

## References

- **modland_hash source**: https://github.com/emoon/modland_hash
- **FNV hash spec**: http://www.isthe.com/chongo/tech/comp/fnv/
- **libopenmpt**: https://lib.openmpt.org/libopenmpt/
- **Modland archive**: https://ftp.modland.com/
- **Database download**: https://www.dropbox.com/scl/fi/gtk2yri6iizlaeb6b0j0j/modland_hash.db.7z

---

## Implementation Status in DEViLBOX

- ✅ File hash (SHA-256) - Implemented in `ModlandHasher.ts`
- ✅ Sample hash (SHA-256) - Implemented in `PatternHasher.ts::hashSampleData()`
- ⚠️  Pattern hash (FNV-1a) - Skeleton implemented in `PatternHasher.ts`
  - ✅ Algorithm correct
  - ⚠️  Needs format-specific pattern extraction (Furnace, MOD, XM, IT)
  - ⚠️  Needs integration with module loaders

**Next Steps**:
1. Add pattern extraction for Furnace modules
2. Add pattern extraction for MOD/XM/IT (via existing parsers)
3. Compute pattern hash during import
4. Store in local IndexedDB or send to server
5. Query server for remixes/covers via `/api/modland/pattern-matches/:hash`
