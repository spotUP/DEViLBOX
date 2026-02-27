---
date: 2026-02-27
topic: hively-ahx-export-instrument-io
tags: [hively, ahx, hvl, export, instrument, io]
status: final
---

# HivelyTracker AHX Export + Instrument I/O — Design

## Goal

Three features:
1. **Song export** — download the current HivelyTracker song as `.hvl` or `.ahx`
2. **Instrument .ahi save/load** — download one instrument as a real `.ahi` file; load a `.ahi` file into an instrument slot
3. **Instrument import from HVL/AHX** — pick instruments from an existing `.hvl` or `.ahx` file and copy them into the current song

## Architecture

No new WASM. All logic is pure TypeScript. `HivelyExporter.ts` already writes `.hvl`/`.ahx` binaries. `HivelyParser.ts` already parses them. We extend these two modules and wire them into the UI.

## Section 1: Song Export (HVL / AHX)

`HivelyExporter.ts` already implements `exportAsHively(song, { format })`. Wire two download buttons — "Export HVL" and "Export AHX" — into the HivelyTracker song view toolbar. Clicking calls `exportAsHively` and triggers a browser file download via `URL.createObjectURL`.

No new exporter code. UI only.

## Section 2: Instrument .ahi Save / Load

### Binary Format

Real AHX/HivelyTracker `.ahi` format. Two variants auto-selected at save time:

| Magic | Plist entry size | When used |
|-------|-----------------|-----------|
| `THXI` | 4 bytes | No effect codes > 5 in plist (after 12→6, 15→7 mapping) |
| `HVLI` | 5 bytes | Any effect code > 5 present |

**26-byte fixed header:**
```
[0-3]   Magic: "THXI" or "HVLI"
[4]     Volume (0-64)
[5]     FilterSpeed[4:0] in bits 7-3 | WaveLength in bits 2-0
[6]     aFrames
[7]     aVolume
[8]     dFrames
[9]     dVolume
[10]    sFrames
[11]    rFrames
[12]    rVolume
[13-15] Reserved (0)
[16]    FilterSpeed[6:5] in bits 7-6 | FilterLowerLimit in bits 5-0
[17]    VibratoDelay
[18]    HardCutRelease flag (bit7) | HardCutReleaseFrames (bits 6-4) | VibratoDepth (bits 3-0)
[19]    VibratoSpeed
[20]    SquareLowerLimit
[21]    SquareUpperLimit
[22]    SquareSpeed
[23]    FilterUpperLimit (6 bits)
[24]    PList speed
[25]    PList length (entry count)
```

Then `PList length` plist entries (4 or 5 bytes each depending on variant), then a null-terminated instrument name string.

### New Functions

**`src/lib/export/HivelyExporter.ts`** — add:
```typescript
export function exportAsAhi(config: HivelyConfig, name: string): Uint8Array
```
Returns raw `.ahi` bytes. Auto-selects THXI vs HVLI based on plist FX codes.

**`src/lib/import/formats/HivelyParser.ts`** — add:
```typescript
export function parseAhiFile(buffer: ArrayBuffer): { config: HivelyConfig; name: string }
```
Reads THXI or HVLI magic, parses header + plist entries, reconstructs `HivelyConfig`.

### UI

In `InstrumentList.tsx`, when a HivelyTracker instrument is selected: show two icon buttons alongside the instrument name:
- 💾 **Save .ahi** — calls `exportAsAhi(instrument.hively, instrument.name)`, downloads `<name>.ahi`
- 📂 **Load .ahi** — opens a `<input type="file" accept=".ahi">`, calls `parseAhiFile(buffer)`, replaces the instrument's `hively` config and name in the song state

## Section 3: Import Instruments from HVL/AHX

A button "Import from HVL/AHX…" in the HivelyTracker instrument panel opens a `<input type="file" accept=".hvl,.ahx">`. The buffer is passed to the existing `parseHivelyBinary()` from `HivelyParser.ts` to extract the instrument list without constructing a full `TrackerSong`.

A modal dialog lists the instruments found (index + name). User checks one or more. On confirm, selected instruments are copied into the current song's instrument slots starting at the currently selected slot, overwriting.

**New function in `HivelyParser.ts`:**
```typescript
export function extractInstrumentsFromHvl(
  buffer: ArrayBuffer
): Array<{ name: string; config: HivelyConfig }>
```
Internally reuses the existing binary instrument extraction logic.

## Files

| File | Change |
|------|--------|
| `src/lib/export/HivelyExporter.ts` | Add `exportAsAhi()` |
| `src/lib/import/formats/HivelyParser.ts` | Add `parseAhiFile()`, `extractInstrumentsFromHvl()` |
| `src/components/instruments/InstrumentList.tsx` | Add save/load .ahi buttons for HivelyTracker instruments |
| HivelyTracker song view toolbar component | Add Export HVL / Export AHX buttons |
| New: `src/components/instruments/HivelyImportDialog.tsx` | Instrument picker modal for import-from-HVL |

## Success Criteria

**Automated:**
- `npx tsc --noEmit` — zero errors
- Unit tests for `exportAsAhi` + `parseAhiFile` round-trip (encode then decode, verify all fields)
- Unit test for `extractInstrumentsFromHvl` using a reference `.hvl` file

**Manual:**
- Export a loaded HVL song → download → reopen in DEViLBOX → song plays identically
- Save an instrument as `.ahi` → file opens in real HivelyTracker without error
- Load a `.ahi` from real HivelyTracker → instrument sounds correct in DEViLBOX
- Import instruments from another HVL file → dialog lists correct names → imported instruments play correctly
