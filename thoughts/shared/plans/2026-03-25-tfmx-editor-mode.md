---
date: 2026-03-25
topic: tfmx-editor-mode
tags: [tfmx, editor, position-sync, uade]
status: draft
---

# TFMX Editor Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix TFMX pattern scrolling to sync with UADE playback, and add a TFMX-aware position tracker that handles variable-length rows and EFFE trackstep commands.

**Architecture:** TFMX has variable-length pattern rows (each command carries its own wait time via F3 commands). The current `framesPerRow` formula assumes fixed row timing (125 BPM / speed 6) which is wrong for TFMX. We pre-compute a cumulative jiffy→(trackstep, row) timing table during parsing, then use UADE's `totalFrames` callback to look up the current display position in that table during playback.

**Tech Stack:** TypeScript, UADE WASM worklet (existing), usePatternPlayback hook, TFMXParser

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/import/formats/TFMXParser.ts` | Modify | Build timing table mapping cumulative jiffies → (pattern index, row) |
| `src/hooks/audio/usePatternPlayback.ts` | Modify | Use timing table for TFMX position calculation instead of fixed framesPerRow |
| `src/stores/useFormatStore.ts` | Modify | Store `tfmxTimingTable` for playback hook to consume |
| `src/engine/TrackerReplayer.ts` | Modify | Add `tfmxTimingTable` to TrackerSong interface |

---

### Task 1: Build TFMX Timing Table in Parser

**Files:**
- Modify: `src/lib/import/formats/TFMXParser.ts` (after pattern decoding, before return)
- Modify: `src/engine/TrackerReplayer.ts` (TrackerSong interface)

The timing table maps cumulative jiffies to (trackerPatternIndex, row). For each tracker pattern (one per trackstep), walk the decoded commands and accumulate wait times.

- [ ] **Step 1: Add `tfmxTimingTable` to TrackerSong interface**

In `src/engine/TrackerReplayer.ts`, add to the TrackerSong interface:

```typescript
/** TFMX timing table: cumulative jiffies at each (patternIndex, row) for position sync */
tfmxTimingTable?: { patternIndex: number; row: number; cumulativeJiffies: number }[];
```

- [ ] **Step 2: Build timing table in TFMXParser**

After the tracker patterns are built (after the `channelOffsetMaps` loop), add timing table construction. Walk each tracker pattern's channel 0 commands and accumulate jiffies from F3 (wait) and note-with-wait (byte 0 >= 0x80) commands:

```typescript
// Build timing table: cumulative jiffies → (patternIndex, row)
const tfmxTimingTable: { patternIndex: number; row: number; cumulativeJiffies: number }[] = [];
let cumulativeJiffies = 0;

for (let patIdx = 0; patIdx < trackerPatterns.length; patIdx++) {
  const pat = trackerPatterns[patIdx];
  const numRows = pat.channels[0]?.rows.length ?? 0;

  for (let row = 0; row < numRows; row++) {
    tfmxTimingTable.push({ patternIndex: patIdx, row, cumulativeJiffies });
    // Estimate jiffies per row from the pattern command data
    // Each TFMX command with wait (byte0 0x80-0xBF) carries wait in byte3
    // F3 commands carry explicit wait (byte1 + 1)
    // Commands without wait (byte0 < 0x80) have 0 jiffies
    // We stored the raw commands in channelOffsetMaps — read from buffer
    const offsetMap = channelOffsetMaps[patIdx]?.[0]; // channel 0
    if (offsetMap && row < offsetMap.length && offsetMap[row] >= 0) {
      const cmdOff = offsetMap[row];
      const b0 = buf[cmdOff];
      const b3 = buf[cmdOff + 3];
      if (b0 >= 0xF0 && (b0 & 0x0F) === 3) {
        // F3: wait (b1 + 1) jiffies
        cumulativeJiffies += buf[cmdOff + 1] + 1;
      } else if (b0 >= 0x80 && b0 < 0xC0) {
        // Note with wait: b3 + 1 jiffies
        cumulativeJiffies += b3 + 1;
      } else {
        // Immediate command (no wait) — add 1 jiffy minimum for display
        cumulativeJiffies += 1;
      }
    } else {
      cumulativeJiffies += 1; // empty row fallback
    }
  }
}
```

- [ ] **Step 3: Return timing table in song object**

Add `tfmxTimingTable` to the return object alongside existing fields:

```typescript
return {
  name: ...,
  format: 'MOD' as TrackerFormat,
  tfmxTimingTable,
  // ... rest of fields
};
```

- [ ] **Step 4: Run `npm run type-check`**

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/formats/TFMXParser.ts src/engine/TrackerReplayer.ts
git commit -m "feat(tfmx): build timing table for position sync"
```

---

### Task 2: Store Timing Table in Format Store

**Files:**
- Modify: `src/stores/useFormatStore.ts`

- [ ] **Step 1: Add `tfmxTimingTable` state field**

In the FormatStore interface (around line 66), add:

```typescript
tfmxTimingTable: { patternIndex: number; row: number; cumulativeJiffies: number }[] | null;
```

Initial state: `tfmxTimingTable: null`

- [ ] **Step 2: Populate in `applyEditorMode()`**

In the `applyEditorMode` function (around line 439), add:

```typescript
state.tfmxTimingTable = (song as any).tfmxTimingTable ?? null;
```

- [ ] **Step 3: Clear in `reset()`**

```typescript
state.tfmxTimingTable = null;
```

- [ ] **Step 4: Run `npm run type-check` and commit**

```bash
git add src/stores/useFormatStore.ts
git commit -m "feat(tfmx): store timing table in format store"
```

---

### Task 3: Use Timing Table for TFMX Position Sync

**Files:**
- Modify: `src/hooks/audio/usePatternPlayback.ts`

The existing UADE position code (lines ~257-273) uses `framesPerRow = 44100 * 2.5 * 6 / 125`. For TFMX, replace this with a timing table lookup.

- [ ] **Step 1: Read timing table from format store**

Add to the `useFormatStore` selector (around line 59):

```typescript
tfmxTimingTable: s.tfmxTimingTable,
```

- [ ] **Step 2: Modify UADE channel data handler for TFMX**

In the `onChannelData` callback (around line 257), before the existing `framesPerRow` calculation, add TFMX-specific position lookup:

```typescript
// TFMX: use timing table for position sync instead of fixed framesPerRow
if (tfmxTimingTable && tfmxTimingTable.length > 0) {
  // Convert totalFrames to jiffies (TFMX VBlank = 50 Hz on PAL Amiga)
  const jiffies = Math.floor(totalFrames / (44100 / 50));

  // Binary search the timing table for current position
  let lo = 0, hi = tfmxTimingTable.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tfmxTimingTable[mid].cumulativeJiffies <= jiffies) lo = mid;
    else hi = mid - 1;
  }

  const entry = tfmxTimingTable[lo];
  const patternIdx = entry.patternIndex;
  const rowInPattern = entry.row;

  const store = useTrackerStore.getState();
  if (patternIdx !== store.currentPositionIndex && patternIdx < store.patternOrder.length) {
    startTransition(() => {
      setCurrentPosition(patternIdx, true);
      setCurrentPattern(store.patternOrder[patternIdx] ?? patternIdx, true);
    });
  }
  setCurrentRowThrottled(rowInPattern, store.patterns[0]?.length ?? 64, true);
  return; // Skip standard framesPerRow calculation
}
```

- [ ] **Step 3: Run `npm run type-check` and commit**

```bash
git add src/hooks/audio/usePatternPlayback.ts
git commit -m "feat(tfmx): use timing table for accurate pattern scrolling"
```

---

### Task 4: Pass Timing Table Through AmigaFormatParsers Merge

**Files:**
- Modify: `src/lib/import/parsers/AmigaFormatParsers.ts`

The TFMX merge code in AmigaFormatParsers needs to preserve the timing table from `parseTFMXFile`.

- [ ] **Step 1: Include timing table in merged song**

In the TFMX handler (around line 462), the `nativeSong` already contains `tfmxTimingTable`. The spread `...nativeSong` preserves it. Verify this by checking the return:

```typescript
return {
  ...nativeSong,           // ← includes tfmxTimingTable
  format: 'UADE' as TrackerFormat,
  uadeEditableFileData: buffer.slice(0),
  uadeEditableFileName: originalFileName,
  instruments: uadeInstr
    ? [uadeInstr, ...nativeSong.instruments]
    : nativeSong.instruments,
};
```

The `...nativeSong` spread already carries `tfmxTimingTable` through. No code change needed — just verify.

- [ ] **Step 2: Verify end-to-end with test file**

Load `mdat.turrican loader` + `smpl.turrican loader` and confirm:
1. Song name shows correctly (no "mdat", no "CIA unreliable")
2. Pattern editor shows notes (not empty)
3. Playback streams audio through UADE
4. Pattern scrolling is approximately synced to playback

- [ ] **Step 3: Commit**

```bash
git add -A  # if any changes needed
git commit -m "feat(tfmx): verify timing table passes through merge"
```

---

## Future Work (not in this plan)

- **TFMX Editor Mode UI**: Dedicated trackstep matrix + pattern editor (like HivelyView two-pane layout)
- **Per-voice row tracking**: Use `currentRowPerChannel[]` for independent voice positions
- **TFMX macro editor**: Visual editor for TFMX macro command sequences
- **EFFE command display**: Show tempo changes, loops, volume fades in the arrangement
- **TFMX export**: Round-trip editing back to mdat format
