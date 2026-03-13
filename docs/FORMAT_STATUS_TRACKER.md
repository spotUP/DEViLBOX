# Format Status Tracker — Agent Guide

## Overview

DEViLBOX supports 188+ music formats. A live status tracker at `http://localhost:4444/` tracks which formats work, which are broken, and what needs fixing. The server persists state across sessions at `/tmp/format-status-live.json`.

## Starting the Status Server

The server runs from `/tmp/format-monitor-server-v2.js`. If not running:

```bash
# Check if running
lsof -i :4444

# Start if not running
node /tmp/format-monitor-server-v2.js &
```

The HTML dashboard is served from `tools/format-status.html`. Open `http://localhost:4444/` in a browser.

## Server API

All endpoints accept JSON and return JSON. CORS enabled.

### Read

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /` | GET | HTML dashboard |
| `GET /get-data` | GET | All format status data as JSON object `{ formatKey: { status, notes, lastModified } }` |
| `GET /stats` | GET | Summary counts by status |
| `GET /events` | GET (SSE) | Server-Sent Events stream for live updates |

### Write

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `POST /update` | POST | `{ format, status, notes }` | Update a single format |
| `POST /push-updates` | POST | `{ formatKey: { status, notes }, ... }` | Bulk update multiple formats |

### Status Values

| Status | Meaning |
|--------|---------|
| `untested` | Never tested |
| `works` | Fully functional — audio, pattern display, instruments all correct |
| `partial` | Plays but has issues (wrong pattern sync, missing effects, etc.) |
| `broken` | Loads but doesn't work properly (wrong data, no audio, etc.) |
| `silent` | Loads but produces no audio output |
| `wrong-synth` | Wrong synthesis engine assigned |
| `crashes` | Causes app crash or infinite hang |
| `retest` | Was changed, needs human re-testing |

### Example: Update from CLI

```bash
# Single format
curl -X POST http://localhost:4444/update \
  -H 'Content-Type: application/json' \
  -d '{"format":"okt","status":"works","notes":"Fixed: was missing channel count"}'

# Bulk update
curl -X POST http://localhost:4444/push-updates \
  -H 'Content-Type: application/json' \
  -d '{"okt":{"status":"works","notes":"Fixed"},"med":{"status":"partial","notes":"Subsong 2 broken"}}'
```

## How to Debug a Broken Format

### Step 1: Identify the Format Pipeline

Every format goes through this pipeline:

```
File dropped/loaded
  → parseModuleToSong() in src/lib/import/parseModuleToSong.ts
    → tryRouteFormat() in src/lib/import/parsers/AmigaFormatParsers.ts
      → Format-specific parser (e.g., OktalyzerParser.ts)
      → OR UADE engine (UADEParser.ts → UADEEngine.ts)
      → OR libopenmpt (via OpenMPT WASM)
    → Returns TrackerSong object
  → ToneEngine loads instruments from TrackerSong
  → Pattern data displayed in editor
```

### Step 2: Find the Format in the Registry

The master registry is in `src/lib/import/FormatRegistry.ts`. Search for the format key:

```typescript
// Each format entry looks like:
{
  key: 'okt',                    // Internal key
  label: 'Oktalyzer',           // Display name
  family: 'amiga-native',       // Format family
  matchMode: 'ext',             // How to detect: 'ext', 'magic', 'prefix'
  extRegex: /\.okt$/i,          // Extension matching
  nativeParser: OktalyzerParser, // Native TS parser (or null)
  uadeFallback: true,           // Can UADE play this?
  prefKey: 'okt',               // Key in user preferences
}
```

### Step 3: Check the Engine Preference

The user's engine choice is in `src/stores/useSettingsStore.ts` under `FormatEnginePreferences`. The routing decision happens in `src/lib/import/parsers/withFallback.ts`:

- **`withNativeDefault()`** — Tries native parser first, falls back to UADE on failure
- **`withNativeThenUADE()`** — UADE is default, native only if user explicitly selects it
- **`withNativeOnly()`** — No UADE fallback

### Step 4: Test Loading

1. Open DEViLBOX at `http://localhost:5173`
2. Find a test file for the format. Sources:
   - Modland (use the Modland tab in File Browser)
   - `/Users/spot/Code/DEViLBOX/public/demo/` for bundled demos
   - UADE test files at `third-party/uade-wasm/test-files/`
3. Load the file and observe:
   - Does it load without errors? (check browser console)
   - Does audio play?
   - Do patterns display correctly?
   - Are instruments listed?
   - Do instrument previews work?
   - Does pattern scrolling sync with audio?

### Step 5: Common Issues & Fixes

#### "Silent" — No Audio Output

1. **Check ToneEngine errors** in console — look for `EncodingError: Unable to decode audio data`
   - This means sample data is corrupt or in an unsupported format (e.g., raw 8-bit signed needs conversion)
   - Fix: Check the parser's sample extraction — ensure PCM is converted to WAV properly

2. **Check if UADE mode works** — Switch engine preference in Settings → Format Engines
   - If UADE works but native is silent, the native parser's sample handling is broken

3. **Check instrument creation** — Ensure the synth type exists in `InstrumentFactory.ts`
   - Search for the `synthType` string in the switch statement (line ~116)
   - If missing, the instrument won't produce sound

#### "Broken" — Wrong Pattern Data

1. **Compare with UADE** — Load in UADE mode and compare pattern output
2. **Check the parser** — Find it in `src/lib/import/parsers/` or `src/lib/import/formats/`
3. **Reference implementations:**
   - OpenMPT: `third-party/openmpt-master/soundlib/Load_*.cpp` (most accurate)
   - NostalgicPlayer: `thoughts/shared/research/nostalgicplayer/sources/`
   - libxmp: `Reference Code/libxmp-master/`

#### "Partial" — Plays But Has Issues

- **Pattern desync**: The parser's row timing doesn't match UADE. Check BPM/speed/rows-per-beat calculation.
- **Missing effects**: Effects are defined per-format. Compare with reference implementation.
- **Wrong instruments**: Check sample loop points, finetune, volume in parser output.

#### "Crashes" — App Hangs or Errors

1. Check for infinite loops in pattern parsing (song length, pattern count bounds)
2. Check for buffer overflows reading binary data (DataView bounds checks)
3. Check WASM module crashes (Furnace, UADE)

### Step 6: Update the Status

After fixing or investigating, update the status tracker:

```bash
curl -X POST http://localhost:4444/update \
  -H 'Content-Type: application/json' \
  -d '{"format":"okt","status":"works","notes":"Fixed sample loop points"}'
```

## Key Source Files

| File | Purpose |
|------|---------|
| `src/lib/import/FormatRegistry.ts` | Master format registry (188 entries) |
| `src/lib/import/parseModuleToSong.ts` | Main entry point for loading any format |
| `src/lib/import/parsers/AmigaFormatParsers.ts` | Format detection + routing |
| `src/lib/import/parsers/withFallback.ts` | UADE/native/libopenmpt fallback logic |
| `src/lib/import/formats/UADEParser.ts` | UADE catch-all parser (native route table at line ~441) |
| `src/engine/uade/UADEEngine.ts` | UADE WASM engine singleton |
| `src/engine/uade/UADESynth.ts` | UADE playback synth wrapper |
| `src/engine/InstrumentFactory.ts` | Creates synth instances from config |
| `src/engine/registry/SynthRegistry.ts` | New synth registration system |
| `src/stores/useSettingsStore.ts` | User engine preferences (native/uade/libopenmpt per format) |
| `src/lib/import/parsers/*.ts` | Individual format parsers |
| `src/lib/import/formats/*.ts` | More format parsers (newer) |

## Format Parser File Naming

Parsers live in two directories:
- `src/lib/import/parsers/` — Older parsers (MOD, HVL, OKT, MED, etc.)
- `src/lib/import/formats/` — Newer parsers (SoundFX, SidMon, TFMX, etc.)

Look for `{FormatName}Parser.ts` in both.

## Reference Code Locations

In priority order (most accurate first):

1. **OpenMPT** — `third-party/openmpt-master/soundlib/Load_*.cpp`
2. **NostalgicPlayer** — `thoughts/shared/research/nostalgicplayer/sources/{FormatName}/`
3. **libxmp** — `Reference Code/libxmp-master/`
4. **FlodJS** — `Reference Code/FlodJS/` (ActionScript-era Amiga replayers)
5. **UADE** — `third-party/uade-wasm/` (68k assembly eagleplayers — hardest to read)

## Current Status Summary

Run this to get a quick overview:

```bash
curl -s http://localhost:4444/stats
# Returns: { total, stats: { works: N, broken: N, ... }, sseClients: N }

# Or get full data and filter:
curl -s http://localhost:4444/get-data | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const c = {}; for (const v of Object.values(d)) { c[v.status] = (c[v.status]||0)+1; }
  console.log(c);
  // Show broken formats:
  Object.entries(d).filter(([k,v]) => v.status==='broken').forEach(([k,v]) => console.log(k, '-', v.notes));
"
```
