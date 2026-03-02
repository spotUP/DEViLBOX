# Modland Archive Integration

DEViLBOX integrates with the Modland archive (ftp.modland.com) - the world's largest collection of tracker music files.

## Architecture: Server-Side Hash Database

All Modland data is hosted on the server. Clients hash files locally and query the server API for verification and metadata.

```
Client imports file → Hash locally (50-200ms) → 
  POST /api/modland/lookup-hash → 
    Server queries SQLite (865MB DB) → JSON response
```

**Benefits:**
- ✅ No 865MB client download
- ✅ No 865MB in git/deployment  
- ✅ Works immediately, no DB initialization
- ✅ Server keeps DB updated daily
- ✅ Consistent with existing Modland API pattern

## Features

### 1. File Browsing & Discovery
**Location:** FileBrowser "Modland" tab  
**Uses:** Server file catalog API

- Search by filename, artist, format
- Filter by format (MOD, XM, IT, etc.)
- Direct download from Modland FTP
- FTS5 full-text search

### 2. Hash-Based Verification
**Location:** Automatic during file import  
**Uses:** Server hash database API

- SHA-256 hash matching
- Sample metadata (5.6M samples)
- Pattern similarity detection
- Automatic "✓ Verified" notifications

## API Endpoints

### POST /api/modland/lookup-hash
Find file metadata by SHA-256 hash

**Request:**
```json
{
  "hash": "a1b2c3d4..." // 64-char hex
}
```

**Response (match):**
```json
{
  "match": true,
  "file": {
    "song_id": 12345,
    "url": "pub/modules/Protracker/Artist/song.mod",
    "pattern_hash": 98765,
    "sample_count": 12
  }
}
```

### GET /api/modland/samples/:song_id
Get all samples for a file

**Response:**
```json
{
  "samples": [
    {
      "song_sample_id": 0,
      "text": "BassDrum01",
      "length_bytes": 8192,
      "length": 4096
    }
  ]
}
```

### GET /api/modland/pattern-matches/:pattern_hash
Find files with same pattern data (remixes, variations)

**Response:**
```json
{
  "matches": [
    {
      "song_id": 12345,
      "url": "pub/modules/...",
      "hash_id": "a1b2..."
    }
  ]
}
```

### GET /api/modland/hash-stats
Get database statistics

**Response:**
```json
{
  "files": 727138,
  "samples": 5611951,
  "unique_patterns": 180000
}
```

## Usage

### For Users

**Browse Modland:**
1. Open FileBrowser (Load button)
2. Click "Modland" tab
3. Search or filter
4. Click file to download and import

**Hash Verification:**
- Automatic during file import
- Shows: "✓ Verified Modland File: [title] by [artist] • [N] samples"
- Non-blocking (~100-300ms)

### For Developers

```typescript
import { lookupFileByHash, getSamplesBySongId } from '@/lib/modlandApi';
import { hashFile } from '@/lib/modland/ModlandHasher';

// Verify file
const hash = await hashFile(file);
const result = await lookupFileByHash(hash);

if (result.match && result.file) {
  console.log('Found:', result.file.url);
  const samples = await getSamplesBySongId(result.file.song_id);
}
```

## File Structure

### Server-Side
- `server/src/routes/modland.ts` - API routes (browse + hash endpoints)
- `server/src/services/modlandIndexer.ts` - File catalog management
- `server/src/services/modlandHash.ts` - Hash database queries
- `server/data/modland_hash.db` - 865MB SQLite database

### Client-Side
- `src/lib/modlandApi.ts` - API client (browse + hash methods)
- `src/lib/modland/ModlandHasher.ts` - SHA-256 hashing (Web Crypto)
- `src/lib/modland/ModlandMetadata.ts` - Path parsing utilities
- `src/lib/modland/ModlandDetector.ts` - Auto-detection hook
- `src/lib/file/UnifiedFileLoader.ts` - Calls detector during import

## Performance

- Hash computation: 50-200ms (client-side, Web Crypto API)
- API roundtrip: <100ms (server SQLite query)
- Total overhead: ~100-300ms (non-blocking)
- Database: 865MB (server-side only)
- Catalog search: <50ms (FTS5)

## Database Schema

### File Catalog
```sql
CREATE TABLE modland_files (
  id INTEGER PRIMARY KEY,
  format TEXT,
  author TEXT,
  filename TEXT,
  full_path TEXT UNIQUE,
  extension TEXT
);
```

### Hash Database
```sql
CREATE TABLE files (
  song_id INTEGER PRIMARY KEY,
  hash_id TEXT,           -- SHA-256
  pattern_hash INTEGER,   -- Pattern similarity
  url TEXT                -- Modland path
);

CREATE TABLE samples (
  hash_id TEXT,
  song_id INTEGER,
  song_sample_id INTEGER,
  text TEXT,              -- Sample name
  length_bytes INTEGER,
  length INTEGER
);
```

## Maintenance

**Update hash database:**
```bash
# Automatic daily updates on server
# Manual update:
curl -X POST https://devilbox.uprough.net/api/modland/reindex
```

**Database location:** `server/data/modland_hash.db`  
**Download source:** https://www.dropbox.com/... (see deployment docs)  
**Update frequency:** Daily (automated)
