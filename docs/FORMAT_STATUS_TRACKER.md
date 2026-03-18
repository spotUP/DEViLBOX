# Format Status Tracker — Agent Guide

## Overview

DEViLBOX supports 188+ music formats. A live status tracker at `http://localhost:4444/` tracks which formats work, which are broken, and what needs fixing. The server persists state to `tools/format-state.json`.

## Starting the Status Server

```bash
# Check if running
lsof -nP -iTCP:4444 -sTCP:LISTEN

# Start if not running
npx tsx tools/format-server.ts &
```

The HTML dashboard is served from `tools/format-status.html`. Open `http://localhost:4444/` in a browser.

## Server API

All endpoints accept JSON and return JSON. CORS enabled.

### Read

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /` | GET | HTML dashboard |
| `GET /get-data` | GET | All format status data as JSON object `{ formatKey: { auditStatus, envCorr, notes, ... } }` |
| `GET /events` | GET (SSE) | Server-Sent Events stream — sends `connected`, `update`, and `bulk-update` events |

### Write

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `POST /update` | POST | `{ key\|format, ...data }` | Update a single entry |
| `POST /push-updates` | POST | `{ key: data, ... }` | Bulk update multiple entries |

Both endpoints persist to disk AND broadcast SSE events to all connected browsers. The page updates live — no refresh needed.

### Key Naming Convention

Audit entries follow the pattern `fur-<chip>-<songname>`:
- `fur-gameboy-cheap` → Game Boy song "cheap"
- `fur-nes-thecheetahmen` → NES song "The Cheetahmen"
- `fur-genesis-sonicgreen` → Genesis song

The chip prefix maps to display families:
| Prefix | Family | Display Name |
|--------|--------|-------------|
| `gameboy` | `furnace-audit-gb` | Game Boy |
| `nes` | `furnace-audit-nes` | NES |
| `genesis` | `furnace-audit-genesis` | Genesis (OPN2) |
| `snes` | `furnace-audit-snes` | SNES (SPC700) |
| `c64` | `furnace-audit-c64` | C64 (SID) |
| `arcade` | `furnace-audit-arcade` | Arcade |
| `a2600` | `furnace-audit-a2600` | Atari 2600 (TIA) |
| `amiga` | `furnace-audit-amiga` | Amiga (Paula) |
| `opl` | `furnace-audit-opl` | OPL |
| `opm` | `furnace-audit-opm` | OPM (YM2151) |
| `pce` | `furnace-audit-pce` | PC Engine |
| `ay8910` | `furnace-audit-ay` | AY-8910 |
| `ay8930` | `furnace-audit-ay8930` | AY8930 |
| `esfm` | `furnace-audit-esfm` | ESFM |
| `msx` | `furnace-audit-msx` | MSX (OPLL) |
| `opz` | `furnace-audit-opz` | OPZ (YM2414) |
| `virtualboy` | `furnace-audit-vb` | Virtual Boy (VSU) |
| `sn7` | `furnace-audit-sn7` | SN76489 |
| `lynx` | `furnace-audit-lynx` | Lynx (MIKEY) |
| `x68000` | `furnace-audit-x68000` | X68000 |
| `pc98` | `furnace-audit-pc98` | PC-98 |
| `specs2` | `furnace-audit-specs2` | ZX Spectrum |
| `vic20` | `furnace-audit-vic20` | VIC-20 |
| `wonderswan` | `furnace-audit-ws` | WonderSwan |
| `x16` | `furnace-audit-x16` | Commander X16 |
| `ymz280b` | `furnace-audit-ymz280b` | YMZ280B |
| `multichip` | `furnace-audit-multi` | Multichip |
| `misc` | `furnace-audit-blank` | Blank/Misc |
| `blank` | `furnace-audit-blank` | Blank/Misc |

New keys pushed to the server automatically create rows in the dashboard — no HTML changes needed.

### Audit Data Fields

Each audit entry can have these fields:

| Field | Type | Description |
|-------|------|-------------|
| `auditStatus` | `"fixed"\|"fail"\|"unknown"\|"untested"\|"investigating"\|"known-issue"\|"wont-fix"` | Overall status |
| `envCorr` | `number` (0-1) | Envelope correlation vs reference (>=0.90 = PASS) |
| `rmsDbDiff` | `number` | RMS difference in dB |
| `correlation` | `number` (0-1) | Sample-level cross-correlation |
| `pass` | `boolean` | Whether envCorr >= 0.90 threshold |
| `divergeAt` | `number` | Seconds where audio first diverges (-1 = no divergence) |
| `notes` | `string` | Free-text notes (e.g. "17/17 pass", "9 silent instruments") |
| `consoleAuditStatus` | `"works"\|"crashes"\|"pageCrash"\|"fail"` | Console error audit result |

### Format Status Fields (non-audit entries)

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"untested"\|"works"\|"partial"\|"broken"\|"silent"\|"wrong-synth"\|"crashes"\|"retest"` | Format status |
| `notes` | `string` | Free-text notes |

## Pushing Updates from Agents

### Single entry update
```bash
curl -X POST http://localhost:4444/update \
  -H 'Content-Type: application/json' \
  -d '{"format":"fur-gameboy-cheap","auditStatus":"fixed","envCorr":0.993,"notes":"17/17 pass"}'
```

### Bulk update (preferred for batch operations)
```bash
curl -X POST http://localhost:4444/push-updates \
  -H 'Content-Type: application/json' \
  -d '{
    "fur-gameboy-cheap": {"auditStatus":"fixed","envCorr":0.993,"notes":"17/17 pass"},
    "fur-gameboy-minos": {"auditStatus":"fixed","envCorr":0.760,"notes":"7/7 pass"}
  }'
```

### From TypeScript/Node
```typescript
await fetch('http://localhost:4444/push-updates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    'fur-gameboy-cheap': { auditStatus: 'fixed', envCorr: 0.993, notes: '17/17 pass' }
  })
});
```

## Live Updates (SSE)

The dashboard connects to `GET /events` via Server-Sent Events. When you POST updates, all connected browsers update instantly:
- `event: update` — single entry changed (from `POST /update`)
- `event: bulk-update` — multiple entries changed (from `POST /push-updates`)
- New keys automatically create rows without page refresh

## How to Debug a Broken Format

### Step 1: Identify the Format Pipeline

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

The master registry is in `src/lib/import/FormatRegistry.ts`.

### Step 3: Test Loading

1. Open DEViLBOX at `http://localhost:5173`
2. Load a test file and observe: audio, patterns, instruments, sync
3. Check browser console for errors

### Step 4: Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Silent | Sample data corrupt or wrong PCM conversion | Check parser's sample extraction |
| Wrong patterns | Parser offset errors | Compare with OpenMPT reference loader |
| Crashes | Buffer overflow or WASM panic | Add bounds checks in parser |
| Partial | Missing effects or wrong timing | Compare effect handling with reference |

### Step 5: Update the Status

```bash
curl -X POST http://localhost:4444/update \
  -H 'Content-Type: application/json' \
  -d '{"format":"okt","status":"works","notes":"Fixed sample loop points"}'
```

## Key Source Files

| File | Purpose |
|------|---------|
| `tools/format-server.ts` | Server source (port 4444, REST + SSE) |
| `tools/format-status.html` | Dashboard HTML (served by server) |
| `tools/format-state.json` | Persisted state (auto-saved on every update) |
| `src/lib/import/FormatRegistry.ts` | Master format registry (188 entries) |
| `src/lib/import/parseModuleToSong.ts` | Main entry point for loading any format |
| `src/lib/import/parsers/AmigaFormatParsers.ts` | Format detection + routing |

## Audit Tools (`tools/furnace-audit/`)

| Tool | Purpose |
|------|---------|
| `render-reference.sh` | Render reference WAVs via Furnace CLI |
| `render-devilbox.ts` | Headless WASM renderer for DEViLBOX |
| `compare-wavs.ts` | Compare WAVs (RMS, envelope correlation, divergence) |
| `test-synths.ts` | Per-instrument silence/audio testing |
