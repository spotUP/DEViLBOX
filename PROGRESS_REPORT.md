# DEViLBOX Progress Report

**Date:** 2026-01-23
**Sprint/Task:** Performance Optimization
**Status:** ✅ Completed

---

## Objective

Fix performance issues causing playback to be "too heavy for M1 Mac" with FPS dropping to 8-14.

---

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| MetalSynth note trigger | 700-5400ms | ~1ms (NoiseSynth) |
| MembraneSynth note trigger | 117-122ms | ~1ms (Synth) |
| PatternEditor re-renders/sec | ~12 | 0 (isolated) |
| FT2Toolbar re-renders/sec | ~12 | 0 (isolated) |
| VU Meter overhead | High (60 state updates/sec) | None (disabled) |

---

## Completed Tasks

### High Priority (Audio Engine)
- [x] Identified MetalSynth as primary performance culprit
- [x] Replaced MetalSynth with NoiseSynth (performance workaround)
- [x] Replaced MembraneSynth with Synth (performance workaround)
- [x] Fixed dynamic `require()` in hot path
- [x] Fixed instrument cache key mismatch
- [x] Added synth warm-up during preload

### High Priority (UI Performance)
- [x] Disabled VU meters (temporary)
- [x] Disabled VU polling (temporary)
- [x] Isolated `currentRow` subscription in PatternEditor
- [x] Isolated `currentRow` subscription in FT2Toolbar

### Verification
- [x] TypeScript compilation passes
- [x] Production build succeeds
- [x] No console errors

---

## Deferred Tasks

| Task | Reason | Priority |
|------|--------|----------|
| Re-enable VU meters | Need further optimization | Medium |
| Restore MetalSynth timbre | Requires Tone.js fix or alternative | Low |
| Restore MembraneSynth timbre | Requires optimization | Low |
| Sample-based drums | Architectural change | Future |

---

## Technical Debt Introduced

1. **MetalSynth sounds like NoiseSynth** - Different timbre than expected
2. **MembraneSynth sounds like Synth** - Kick drums have different character
3. **VU meters disabled** - Visual feedback missing during playback
4. **Hardcoded disable flags** - `DISABLE_VU_METERS` and `DISABLE_VU_POLLING` should be user settings

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User notices different drum sounds | Medium | Low | Document in release notes |
| User misses VU meters | Low | Low | Can be re-enabled when optimized |
| Performance still not smooth | Low | High | Further profiling if reported |

---

## Recommendations

### Short Term
1. Test on various devices to confirm performance improvement
2. Add performance quality setting to control VU meter rendering
3. Consider reducing `currentRow` update frequency from 12/sec to 6/sec

### Long Term
1. Investigate sample-based drum playback for better performance
2. Consider Web Audio Worklet for synthesis offloading
3. Profile and optimize GranularSynth/Sampler if issues arise

---

## Files Changed

### This Session
```
src/components/tracker/PatternEditor.tsx
  + SteppedScroller component (lines 37-78)
  - currentRow from store subscription
  + SteppedScroller in JSX

src/components/tracker/FT2Toolbar/FT2Toolbar.tsx
  + RowDisplay component (lines 35-50)
  - currentRow from store subscription
  + RowDisplay in JSX
```

### Previous Session (Context)
```
src/engine/ToneEngine.ts
  ~ MetalSynth → NoiseSynth
  ~ MembraneSynth → Synth
  + Static import for PeriodTables
  ~ Fixed preloadInstruments cache key
  + Synth warm-up

src/components/tracker/ChannelVUMeters.tsx
  + DISABLE_VU_METERS flag

src/components/tracker/PatternEditor.tsx
  + DISABLE_VU_POLLING flag
```

---

## Build Status

```
✓ TypeScript: No errors
✓ Vite Build: Success (6.25s)
✓ Bundle Size: 2,118.87 kB (gzip: 556.44 kB)
```

---

## Sign-off

Performance optimizations complete. Playback should now be significantly smoother. VU meters are disabled as a temporary measure - recommend testing before re-enabling.

The TrackerReplayer architecture is inherently more demanding than PatternScheduler due to tick-based callbacks, but is required for proper MOD/XM effect support. The optimizations above reduce overhead to acceptable levels.
