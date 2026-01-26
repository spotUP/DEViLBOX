# DEViLBOX Development Handoff

**Date:** 2026-01-23
**Session Focus:** Performance Optimization for TrackerReplayer Playback

---

## Executive Summary

Major performance issues were identified and fixed in the TrackerReplayer playback system. The app was "too heavy for M1 Mac" with FPS dropping to 8-14 during playback. Root causes were identified at both the audio engine level (Tone.js synth performance) and UI level (React re-render storms).

---

## Problem Statement

After implementing the TrackerReplayer (tick-based playback needed for proper MOD/XM tracker effect support), playback became extremely slow and jerky. The PatternScheduler approach (pre-scheduling all notes) was smoother but couldn't handle real-time tracker effects like portamento, vibrato, and arpeggio.

---

## Root Causes Identified

### Audio Engine Issues
1. **MetalSynth** - Tone.js voice accumulation bug causing 700-5400ms per note (progressively worse)
2. **MembraneSynth** - 117-122ms per note (too slow for real-time)
3. **Dynamic require()** - `require('./effects/PeriodTables')` in hot path extremely slow in ES modules
4. **Instrument cache miss** - Key format mismatch (`config.id` vs `"3--1"` string keys)

### UI Performance Issues
5. **VU Meters** - Animation loops running even when component returned `null`
6. **VU Polling** - Interval-based polling creating React state update overhead
7. **PatternEditor re-renders** - 1500+ line component re-rendering 12x/sec due to `currentRow` subscription
8. **FT2Toolbar re-renders** - 800+ line component re-rendering 12x/sec due to `currentRow` subscription

---

## Fixes Implemented

### ToneEngine.ts
- Replaced `MetalSynth` with `NoiseSynth` internally (lines 467-481)
- Replaced `MembraneSynth` with `Synth` internally (lines 483-496)
- Changed dynamic `require()` to static ES `import` (line 12)
- Fixed `preloadInstruments` key format bug (line 142)
- Added synth warm-up during preload (lines 171-200)

### ChannelVUMeters.tsx
- Added `DISABLE_VU_METERS = true` flag (line 40)
- Check flag before starting animation loops (lines 151-157, 169-171)

### PatternEditor.tsx
- Created `SteppedScroller` component to isolate `currentRow` subscription (lines 37-78)
- Removed `currentRow` from main component's store subscription (lines 154-165)
- Removed inline stepped scrolling useEffect (lines 335-336)
- Added `SteppedScroller` to JSX (lines 1211-1217)

### FT2Toolbar.tsx
- Created `RowDisplay` component to isolate `currentRow` subscription (lines 35-50)
- Removed `currentRow` from main component's store subscription (lines 176-188)
- Replaced inline row display with `RowDisplay` component (line 828)

---

## Current State

### What's Working
- TrackerReplayer playback with full tracker effect support
- Smooth scrolling mode (uses requestAnimationFrame, no React re-renders)
- Stepped scrolling mode (isolated to small component)
- MOD/XM file import and playback
- All synth types functional (with performance-safe replacements)

### What's Disabled/Degraded
- **VU Meters**: Disabled via `DISABLE_VU_METERS = true` in `ChannelVUMeters.tsx:40`
- **VU Polling**: Disabled via `DISABLE_VU_POLLING = true` in `PatternEditor.tsx`
- **MetalSynth**: Uses NoiseSynth internally (different timbre)
- **MembraneSynth**: Uses Synth internally (different timbre)

### Known Limitations
- TrackerReplayer's tick-based approach (50 callbacks/sec) is inherently more CPU-intensive than PatternScheduler's pre-scheduling
- BassoonTracker achieves better performance by using raw WebAudio with sample playback instead of Tone.js synthesizers

---

## Architecture Notes

### TrackerReplayer vs PatternScheduler

| Feature | TrackerReplayer | PatternScheduler |
|---------|----------------|------------------|
| Timing | Tick callbacks (50/sec) | Pre-scheduled via Tone.Part |
| Effects | Full support (portamento, vibrato, arpeggio) | Limited (no real-time effects) |
| CPU Usage | Higher (JS callbacks in audio thread) | Lower (audio thread only) |
| Use Case | MOD/XM playback | Simple pattern playback |

The user explicitly stated: **"the pattern scheduler is not good enough to play modules"** - TrackerReplayer must be used for proper tracker playback.

### React Re-render Isolation Pattern

To prevent expensive re-renders from frequently-updating state (like `currentRow`), we use isolated components:

```tsx
// BAD: Entire component re-renders 12x/sec
const BigComponent = () => {
  const { currentRow } = useTransportStore();
  // ... 1500 lines of JSX
};

// GOOD: Only tiny component re-renders
const RowDisplay = React.memo(() => {
  const currentRow = useTransportStore((state) => state.currentRow);
  return <span>{currentRow}</span>;
});

const BigComponent = () => {
  // ... 1500 lines of JSX
  <RowDisplay />
};
```

---

## Next Steps / Recommendations

### To Re-enable VU Meters
1. Set `DISABLE_VU_METERS = false` in `ChannelVUMeters.tsx:40`
2. Set `DISABLE_VU_POLLING = false` in `PatternEditor.tsx`
3. Test performance - may need to reduce update frequency or simplify rendering

### To Improve Synth Performance
1. Consider using `Tone.Sampler` or `Tone.Player` for drums instead of synthesizers
2. Pre-render drum sounds to audio buffers during load
3. Investigate Web Audio Worklet for offloading synthesis to audio thread

### To Match BassoonTracker Performance
BassoonTracker uses raw WebAudio API with sample-based playback:
- All sounds are samples (no real-time synthesis)
- Audio processing happens on audio thread
- JavaScript only sends messages to audio thread

This architectural approach would require significant refactoring but would achieve the best performance.

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `src/components/tracker/PatternEditor.tsx` | Added `SteppedScroller`, removed `currentRow` subscription |
| `src/components/tracker/FT2Toolbar/FT2Toolbar.tsx` | Added `RowDisplay`, removed `currentRow` subscription |

## Files Modified Previous Session

| File | Changes |
|------|---------|
| `src/engine/ToneEngine.ts` | Synth replacements, import fix, cache fix, warm-up |
| `src/engine/TrackerReplayer.ts` | Performance diagnostics (added then removed) |
| `src/components/tracker/ChannelVUMeters.tsx` | Disabled via flag |
| `src/components/tracker/PatternEditor.tsx` | VU polling disabled |
| `src/components/instruments/SamplePackBrowser.tsx` | Fixed nested button HTML error |

---

## Testing Checklist

- [ ] Load a MOD/XM file and verify playback is smooth
- [ ] Verify tracker effects work (portamento, vibrato, arpeggio)
- [ ] Check FPS during playback (should be 30+ now)
- [ ] Verify row indicator updates in FT2Toolbar
- [ ] Test both smooth and stepped scrolling modes
- [ ] Verify no console errors during playback
