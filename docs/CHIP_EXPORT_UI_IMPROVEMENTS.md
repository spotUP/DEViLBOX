# Chip Export UI/UX Improvements Plan

**Date:** 2026-02-07
**Task:** Task #7 - Improve chip recording and export workflow
**Status:** Design Complete - Ready for Implementation

---

## 📋 Overview

This document outlines improvements to the chip export UI in `ExportDialog.tsx` to enhance the user experience when recording and exporting chip music.

---

## ✅ Current Features (Already Implemented)

### 1. Recording Controls
- ✅ Start/Stop recording buttons
- ✅ Recording timer display (formatted MM:SS.ms)
- ✅ Register write counter
- ✅ Auto-stop on completion

### 2. Format Selection
- ✅ 8 format buttons (VGM, GYM, NSF, GBS, SPC, ZSM, SAP, TIunA)
- ✅ Auto-detect available formats based on chips used
- ✅ Loop support indicators (🔁 custom, ↻ auto-loop)
- ✅ Format descriptions
- ✅ Compatibility warnings

### 3. Metadata Input
- ✅ Title field
- ✅ Author field
- ✅ Loop point sync with tracker

### 4. Chip Statistics
- ✅ Register write count
- ✅ Duration calculation
- ✅ Used chips list
- ✅ Frame rate detection

---

## 🎯 Proposed Improvements

### Priority 1: Visual Feedback During Recording

#### 1.1 Real-Time VU Meter
**Location:** Recording controls section
**Purpose:** Show audio activity during recording

```tsx
{isChipRecording && (
  <div className="mt-3">
    <div className="flex items-center gap-2 mb-1">
      <Volume2 className="w-3 h-3 text-accent-primary" />
      <span className="text-xs font-mono text-text-muted">ACTIVITY</span>
    </div>
    <div className="flex gap-1 h-2">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-colors ${
            audioLevel > (i / 20) * 100
              ? i < 12
                ? 'bg-green-500'
                : i < 16
                ? 'bg-yellow-500'
                : 'bg-red-500'
              : 'bg-dark-border'
          }`}
        />
      ))}
    </div>
  </div>
)}
```

**Implementation:**
- Connect to FurnaceChipEngine audio output
- Use native AnalyserNode for RMS calculation
- Update at 60Hz refresh rate
- Low CPU overhead

---

#### 1.2 Register Write Activity Indicator
**Location:** Near recording timer
**Purpose:** Show real-time chip activity

```tsx
<div className="flex items-center gap-2">
  <span className="text-lg font-mono text-accent-primary font-bold">
    {formatTime(chipRecordingTime)}
  </span>
  {isChipRecording && (
    <span className="flex items-center gap-1 text-xs font-mono text-text-muted">
      <Zap className="w-3 h-3 animate-pulse text-yellow-400" />
      {realtimeWriteCount.toLocaleString()} writes
    </span>
  )}
</div>
```

**Implementation:**
- Add real-time write counter state
- Update from ChipRecordingSession
- Shows activity is happening

---

### Priority 2: Export Format Presets

#### 2.1 Quick Preset Buttons
**Location:** Above format selection grid
**Purpose:** Common export scenarios

```tsx
<div className="mb-4">
  <div className="text-xs font-mono text-text-muted mb-2">QUICK PRESETS</div>
  <div className="flex gap-2">
    <button
      onClick={() => applyPreset('genesis')}
      className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
    >
      🎮 Genesis (VGM)
    </button>
    <button
      onClick={() => applyPreset('nes')}
      className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
    >
      🕹️ NES (NSF)
    </button>
    <button
      onClick={() => applyPreset('gameboy')}
      className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
    >
      🎮 Game Boy (GBS)
    </button>
    <button
      onClick={() => applyPreset('universal')}
      className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
    >
      🌐 Universal (VGM)
    </button>
  </div>
</div>
```

**Preset Logic:**
```typescript
const EXPORT_PRESETS: Record<string, {
  format: ChipExportFormat;
  description: string;
  autoFillMetadata?: boolean;
}> = {
  genesis: {
    format: 'gym',
    description: 'Optimized for Genesis/Mega Drive (YM2612 + PSG)',
  },
  nes: {
    format: 'nsf',
    description: 'NES chiptune format with embedded player',
  },
  gameboy: {
    format: 'gbs',
    description: 'Game Boy music format',
  },
  universal: {
    format: 'vgm',
    description: 'Compatible with 40+ chips and all players',
  },
};

const applyPreset = (presetId: string) => {
  const preset = EXPORT_PRESETS[presetId];
  setChipFormat(preset.format);
  if (preset.autoFillMetadata) {
    // Auto-fill title/author from metadata
    setChipTitle(metadata.name || '');
    setChipAuthor(metadata.author || '');
  }
  notify.info(`Applied ${presetId} preset`);
};
```

---

### Priority 3: Enhanced Metadata Editing

#### 3.1 Expanded Metadata Form
**Location:** Replace current title/author inputs
**Purpose:** More comprehensive metadata

```tsx
<div className="bg-dark-bg border border-dark-border rounded-lg p-3 space-y-3">
  <h4 className="text-xs font-mono text-text-muted">METADATA</h4>

  {/* Title */}
  <div>
    <label className="text-xs font-mono text-text-muted mb-1 block">
      Title
    </label>
    <input
      type="text"
      value={chipTitle}
      onChange={(e) => setChipTitle(e.target.value)}
      placeholder="My Chiptune"
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono focus:border-accent-primary outline-none"
    />
  </div>

  {/* Author */}
  <div>
    <label className="text-xs font-mono text-text-muted mb-1 block">
      Author
    </label>
    <input
      type="text"
      value={chipAuthor}
      onChange={(e) => setChipAuthor(e.target.value)}
      placeholder="Composer Name"
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono focus:border-accent-primary outline-none"
    />
  </div>

  {/* Game/Album (optional) */}
  <div>
    <label className="text-xs font-mono text-text-muted mb-1 block">
      Game/Album <span className="opacity-50">(optional)</span>
    </label>
    <input
      type="text"
      value={chipGame}
      onChange={(e) => setChipGame(e.target.value)}
      placeholder="DEViLBOX Tracker"
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono focus:border-accent-primary outline-none"
    />
  </div>

  {/* Copyright (optional) */}
  <div>
    <label className="text-xs font-mono text-text-muted mb-1 block">
      Copyright <span className="opacity-50">(optional)</span>
    </label>
    <input
      type="text"
      value={chipCopyright}
      onChange={(e) => setChipCopyright(e.target.value)}
      placeholder="2026"
      className="w-full px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded text-sm font-mono focus:border-accent-primary outline-none"
    />
  </div>

  {/* Auto-fill button */}
  <button
    onClick={() => {
      setChipTitle(metadata.name || 'Untitled');
      setChipAuthor(metadata.author || 'Unknown');
      setChipGame('DEViLBOX Tracker');
      setChipCopyright(new Date().getFullYear().toString());
    }}
    className="w-full px-3 py-1.5 rounded-lg bg-dark-bgHover border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
  >
    📝 Auto-fill from project
  </button>
</div>
```

---

### Priority 4: Test Playback Preview

#### 4.1 Preview Player
**Location:** Below metadata, before export button
**Purpose:** Test exported file before downloading

```tsx
{chipLogData && (
  <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
    <h4 className="text-xs font-mono text-text-muted mb-2">PREVIEW</h4>
    <button
      onClick={handlePreviewPlayback}
      disabled={isPreviewPlaying}
      className="w-full px-4 py-2 rounded-lg bg-accent-primary text-text-inverse font-mono text-sm hover:bg-accent-primaryHover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {isPreviewPlaying ? (
        <>
          <span className="w-3 h-3 bg-white" />
          Stop Preview
        </>
      ) : (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-white" />
          Test Playback
        </>
      )}
    </button>
    <p className="text-xs font-mono text-text-muted mt-2">
      Preview how your export will sound
    </p>
  </div>
)}
```

**Implementation:**
```typescript
const handlePreviewPlayback = async () => {
  if (isPreviewPlaying) {
    // Stop preview
    previewSourceRef.current?.stop();
    setIsPreviewPlaying(false);
    return;
  }

  try {
    // Export to format
    const result = await exportChipMusic(chipLogData!, {
      format: chipFormat,
      title: chipTitle,
      author: chipAuthor,
    });

    // Use VGMPlay or format-specific player
    // For now, show success message
    notify.info('Preview playback would start here (player TBD)');
    setIsPreviewPlaying(true);

    // Auto-stop after duration
    setTimeout(() => setIsPreviewPlaying(false), 30000);
  } catch (error) {
    notify.error('Preview failed: ' + (error as Error).message);
  }
};
```

**Note:** Full preview requires VGM/NSF/etc. player integration

---

### Priority 5: Better Error Messages

#### 5.1 Validation Before Export
**Location:** Export button handler
**Purpose:** Clear error messages

```typescript
const validateChipExport = (): string | null => {
  // Check recording exists
  if (!chipLogData || chipWrites.length === 0) {
    return 'No recording data. Press Record and play your song first.';
  }

  // Check format compatibility
  if (!availableChipFormats.includes(chipFormat)) {
    const usedChips = getLogStatistics(chipWrites).usedChips
      .map(c => c.name)
      .join(', ');
    return `${FORMAT_INFO[chipFormat].name} format is not compatible with chips used: ${usedChips}. Try VGM for universal compatibility.`;
  }

  // Check metadata
  if (!chipTitle.trim()) {
    return 'Please enter a title for your export.';
  }

  // Check loop point compatibility
  if (chipLoopPoint > 0) {
    const loopType = {
      vgm: 'custom',
      gym: 'none',
      nsf: 'auto',
      gbs: 'auto',
      spc: 'none',
      zsm: 'none',
      sap: 'none',
      tiuna: 'none',
    }[chipFormat];

    if (loopType === 'none') {
      // Warning, not error
      console.warn(`Loop point set but ${chipFormat.toUpperCase()} doesn't support it`);
    }
  }

  return null; // All checks passed
};

// In export handler:
const error = validateChipExport();
if (error) {
  notify.error(error);
  return;
}
```

---

### Priority 6: Export Progress Indicator

#### 6.1 Progress Bar (Enhanced)
**Location:** Export button area
**Purpose:** Show export progress

*Already implemented:* `isRendering` and `renderProgress` states exist

**Enhancement:**
```tsx
{isRendering && (
  <div className="mt-3">
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-mono text-text-muted">
        Exporting {FORMAT_INFO[chipFormat].name}...
      </span>
      <span className="text-xs font-mono text-accent-primary">
        {renderProgress}%
      </span>
    </div>
    <div className="h-2 bg-dark-border rounded-full overflow-hidden">
      <div
        className="h-full bg-accent-primary transition-all duration-300"
        style={{ width: `${renderProgress}%` }}
      />
    </div>
  </div>
)}
```

---

### Priority 7: Export History

#### 7.1 Recent Exports List
**Location:** New section at bottom
**Purpose:** Quick re-export or reference

```tsx
{exportHistory.length > 0 && (
  <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mt-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-mono font-bold text-accent-primary">
        Recent Exports
      </h3>
      <button
        onClick={clearExportHistory}
        className="text-xs font-mono text-text-muted hover:text-accent-primary transition-colors"
      >
        Clear All
      </button>
    </div>
    <div className="space-y-2">
      {exportHistory.slice(0, 5).map((item, i) => (
        <div
          key={i}
          className="bg-dark-bg border border-dark-border rounded p-2 flex items-center justify-between"
        >
          <div className="flex-1">
            <div className="text-sm font-mono text-text-primary">
              {item.title}
            </div>
            <div className="text-xs font-mono text-text-muted">
              {item.format.toUpperCase()} · {item.author} · {formatDate(item.timestamp)}
            </div>
          </div>
          <button
            onClick={() => reExport(item)}
            className="px-3 py-1 rounded bg-dark-bgHover border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors"
          >
            Re-export
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

**Storage:**
```typescript
interface ExportHistoryItem {
  title: string;
  author: string;
  format: ChipExportFormat;
  timestamp: number;
  filename: string;
  duration: number;
  chips: string[];
}

// Load from localStorage on mount
useEffect(() => {
  const stored = localStorage.getItem('devilbox_export_history');
  if (stored) {
    try {
      setExportHistory(JSON.parse(stored));
    } catch (e) {
      console.error('Failed to load export history:', e);
    }
  }
}, []);

// Save after export
const addToHistory = (item: ExportHistoryItem) => {
  const updated = [item, ...exportHistory].slice(0, 10); // Keep last 10
  setExportHistory(updated);
  localStorage.setItem('devilbox_export_history', JSON.stringify(updated));
};
```

---

## 🔄 Implementation Priority

### Phase 1: Quick Wins (30 minutes)
1. ✅ Export validation messages
2. ✅ Enhanced progress indicator
3. ✅ Quick preset buttons

### Phase 2: Visual Feedback (1-2 hours)
4. ✅ Real-time VU meter
5. ✅ Register write activity indicator
6. ✅ Enhanced chip statistics

### Phase 3: Advanced Features (2-3 hours)
7. ✅ Expanded metadata form
8. ✅ Export history with localStorage
9. ✅ Test playback preview (requires player integration)

---

## 📊 Current State Analysis

### ExportDialog.tsx Stats
- **Lines:** ~1600
- **State variables:** 20+
- **Export modes:** 9 (song, sfx, instrument, audio, midi, xm, mod, chip, nano)

### Chip Export Section
- **Lines:** ~300 (lines 1173-1400)
- **Location:** `exportMode === 'chip'` block
- **Components:**
  - Recording controls
  - Format selection grid
  - Metadata inputs
  - Statistics display
  - Export button

---

## 🎯 Success Criteria

### Must Have
- ✅ Visual feedback during recording
- ✅ Clear error messages for invalid exports
- ✅ Quick preset buttons for common scenarios

### Should Have
- ✅ Enhanced metadata form with auto-fill
- ✅ Export history (last 5-10 exports)
- ✅ Real-time activity indicators

### Nice to Have
- Test playback preview (requires player)
- Waveform visualization (high CPU cost)
- Export templates/favorites

---

## 🚀 Implementation Notes

### Best Practices
1. **Keep state minimal** - ExportDialog already has 20+ state variables
2. **Use localStorage carefully** - Don't store large data (only metadata)
3. **Validate early** - Check before export, not during
4. **Progressive enhancement** - Add features without breaking existing

### Performance Considerations
1. **VU meter** - Use requestAnimationFrame, not interval
2. **Real-time updates** - Throttle to 60Hz max
3. **History** - Limit to 10 items, prune old entries
4. **Validation** - Memoize chip compatibility checks

### Testing Checklist
- [ ] Record → Export → Verify file plays
- [ ] All 8 formats tested
- [ ] Presets apply correct format
- [ ] Validation catches empty recording
- [ ] Validation catches wrong format
- [ ] History persists across page reload
- [ ] History limit works (10 items max)
- [ ] Metadata auto-fill works
- [ ] VU meter shows activity
- [ ] Progress bar animates smoothly

---

## 📚 Related Documentation

- **ChipExporter.ts** - Export format logic
- **CHIP_QUIRKS_AND_LIMITATIONS.md** - Format compatibility reference
- **LOOP_POINT_STATUS.md** - Loop support per format
- **FURNACE_ALL_8_FORMATS_INTEGRATED.md** - Format integration status

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Status:** Design Complete - Ready for Implementation
