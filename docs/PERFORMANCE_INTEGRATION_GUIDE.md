# Performance Optimization Integration Guide

This document provides step-by-step instructions for integrating the three optional performance optimizations that were created but not yet integrated.

---

## 1. DirtyTracker Integration (Differential localStorage Saves)

**Status**: Infrastructure ready, integration not implemented
**Expected gain**: 80-90% faster saves (200ms → <20ms for typical edits)
**Risk level**: Medium (requires careful testing to ensure no data loss)

### Implementation Steps

#### Step 1: Initialize DirtyTracker in useProjectPersistence.ts

```typescript
import { DirtyTracker } from '@/persistence/DirtyTracker';

// Create singleton instance
const dirtyTracker = new DirtyTracker();
```

#### Step 2: Add Store Subscriptions with Selectors

Replace the current reference-based subscriptions with selector-based tracking:

```typescript
// OLD (reference-based, causes false dirty marks)
useEffect(() => {
  const unsubscribe = useTrackerStore.subscribe((state, prevState) => {
    if (state.patterns !== prevState.patterns) {
      markAsModified();
    }
  });
  return unsubscribe;
}, []);

// NEW (selector-based with dirty tracking)
useEffect(() => {
  const unsubscribe = useTrackerStore.subscribe(
    (state) => state.patterns,
    (patterns, prevPatterns) => {
      // Find which patterns changed
      patterns.forEach((pattern, idx) => {
        if (pattern !== prevPatterns[idx]) {
          dirtyTracker.markPatternDirty(pattern.id);
          markAsModified();
        }
      });
    },
    { equalityFn: shallow }
  );
  return unsubscribe;
}, []);
```

#### Step 3: Implement Differential Save

```typescript
function saveDifferentialProject(): boolean {
  if (!dirtyTracker.hasDirty()) {
    return true; // Nothing to save
  }

  const dirtyPatterns = dirtyTracker.getDirtyPatterns();
  const dirtyInstruments = dirtyTracker.getDirtyInstruments();

  // Load existing saved project
  const existingData = localStorage.getItem(STORAGE_KEY);
  const savedProject: SavedProject = existingData
    ? JSON.parse(existingData)
    : createEmptyProject();

  // Update only dirty patterns
  if (dirtyPatterns.size > 0) {
    const currentPatterns = useTrackerStore.getState().patterns;
    savedProject.patterns = savedProject.patterns.map((p) =>
      dirtyPatterns.has(p.id)
        ? currentPatterns.find((cp) => cp.id === p.id) || p
        : p
    );
  }

  // Update only dirty instruments
  if (dirtyInstruments.size > 0) {
    const currentInstruments = useInstrumentStore.getState().instruments;
    savedProject.instruments = savedProject.instruments.map((inst, idx) =>
      dirtyInstruments.has(idx) ? currentInstruments[idx] : inst
    );
  }

  // Update metadata if dirty
  if (dirtyTracker.isMetadataDirty()) {
    savedProject.metadata = useProjectStore.getState().metadata;
    savedProject.bpm = useTransportStore.getState().bpm;
  }

  // Save to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProject));
    dirtyTracker.clear();
    return true;
  } catch (error) {
    console.error('[Persistence] Differential save failed:', error);
    return false;
  }
}
```

#### Step 4: Use Differential Save in Auto-Save

```typescript
// Modify saveProjectToStorage to use differential saves
export function saveProjectToStorage(): boolean {
  // Try differential save first
  if (dirtyTracker.hasDirty()) {
    return saveDifferentialProject();
  }

  // Full save as fallback (or for manual saves)
  return saveFullProject();
}
```

#### Step 5: Add Full Save Fallback Every 5 Minutes

```typescript
let lastFullSave = Date.now();
const FULL_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

function saveWithFallback(): boolean {
  const now = Date.now();
  const shouldFullSave = (now - lastFullSave) > FULL_SAVE_INTERVAL;

  if (shouldFullSave) {
    const success = saveFullProject();
    if (success) {
      lastFullSave = now;
      dirtyTracker.clear();
    }
    return success;
  }

  return saveDifferentialProject();
}
```

### Testing Checklist

- [ ] Edit single cell → verify only that pattern saved
- [ ] Edit multiple patterns → verify all dirty patterns saved
- [ ] Verify no data loss (compare full save vs differential save)
- [ ] Test localStorage quota handling
- [ ] Verify auto-save still works after page reload

---

## 2. requestIdleCallback Integration (Idle-Time Auto-Save)

**Status**: Ready to implement
**Expected gain**: No UI blocking during active editing
**Risk level**: Low

### Implementation Steps

#### Step 1: Replace Fixed Timer with Idle Callback

```typescript
// OLD (blocks UI during active editing)
useEffect(() => {
  const interval = setInterval(() => {
    if (isModified) {
      saveProjectToStorage();
    }
  }, 30000);
  return () => clearInterval(interval);
}, [isModified]);

// NEW (runs during browser idle time)
useEffect(() => {
  let timeoutId: number;
  let idleCallbackId: number;

  const scheduleIdleSave = () => {
    if (!isModified) {
      timeoutId = window.setTimeout(scheduleIdleSave, 30000);
      return;
    }

    // Use requestIdleCallback to save during browser idle time
    idleCallbackId = requestIdleCallback(
      (deadline) => {
        if (deadline.timeRemaining() > 100) {
          // At least 100ms available - safe to save
          saveProjectToStorage();
        } else {
          // Not enough idle time, reschedule
          timeoutId = window.setTimeout(scheduleIdleSave, 5000);
        }
      },
      { timeout: 60000 } // Force save after 60s max
    );
  };

  timeoutId = window.setTimeout(scheduleIdleSave, 30000);

  return () => {
    clearTimeout(timeoutId);
    if (idleCallbackId) {
      cancelIdleCallback(idleCallbackId);
    }
  };
}, [isModified]);
```

#### Step 2: Add Safari Fallback

Safari doesn't support requestIdleCallback, so add a polyfill:

```typescript
// Add at top of file
const requestIdleCallback =
  window.requestIdleCallback ||
  ((cb: IdleRequestCallback) => setTimeout(() => cb({
    didTimeout: false,
    timeRemaining: () => 50
  }), 1));

const cancelIdleCallback =
  window.cancelIdleCallback ||
  ((id: number) => clearTimeout(id));
```

### Testing Checklist

- [ ] Edit patterns rapidly → verify saves happen during pauses
- [ ] Verify UI remains smooth during active editing
- [ ] Test on Safari (polyfill)
- [ ] Test on Chrome/Firefox (native requestIdleCallback)
- [ ] Verify force-save after 60s timeout works

---

## 3. BufferPool Integration (Audio Buffer Pooling)

**Status**: Infrastructure ready, integration not implemented
**Expected gain**: Reduced GC pauses, smoother audio
**Risk level**: Medium (requires finding all buffer allocations)

### Implementation Steps

#### Step 1: Add BufferPool to ToneEngine

```typescript
import { BufferPool } from './audio/BufferPool';

export class ToneEngine {
  private bufferPool = new BufferPool(10); // Max 10 buffers per size

  // ... rest of class
}
```

#### Step 2: Find Float32Array Allocations

Search for patterns like:
```bash
grep -r "new Float32Array" src/engine/
grep -r "new Uint8Array" src/engine/
```

#### Step 3: Replace Allocations with Pool

```typescript
// OLD
const tempBuffer = new Float32Array(1024);
// ... use buffer
// ... buffer gets GC'd

// NEW
const tempBuffer = this.bufferPool.acquire(1024);
try {
  // ... use buffer
} finally {
  this.bufferPool.release(tempBuffer);
}
```

#### Step 4: Add Pool Cleanup

```typescript
// In ToneEngine.dispose()
public dispose(): void {
  // ... existing disposal code
  this.bufferPool.clear();
}
```

#### Step 5: Add Periodic Pool Trimming

```typescript
// Trim pool during idle time to prevent memory bloat
setInterval(() => {
  this.bufferPool.trim(5); // Keep max 5 buffers per size
}, 60000); // Every minute
```

### Common Buffer Allocation Locations

1. **Audio analysis** - FFT, waveform processing
2. **Sample processing** - Resampling, normalization
3. **Effect processing** - Temporary buffers for DSP
4. **WASM interop** - Data transfer buffers

### Testing Checklist

- [ ] Profile GC pauses before/after integration
- [ ] Verify no memory leaks (check bufferPool.getStats())
- [ ] Test with heavy audio usage (many instruments)
- [ ] Verify pool trimming works (memory doesn't grow unbounded)
- [ ] Check buffer pool statistics in console

---

## Performance Measurement

### Before Optimization Baseline

```typescript
// In browser console:
performance.mark('save-start');
saveProjectToStorage();
performance.mark('save-end');
performance.measure('save', 'save-start', 'save-end');
console.log(performance.getEntriesByName('save'));
```

### After Optimization Comparison

```typescript
// Track save times
const saveTimes: number[] = [];

function saveWithTiming(): boolean {
  const start = performance.now();
  const result = saveProjectToStorage();
  const duration = performance.now() - start;

  saveTimes.push(duration);
  console.log(`Save took ${duration.toFixed(2)}ms (avg: ${
    (saveTimes.reduce((a, b) => a + b, 0) / saveTimes.length).toFixed(2)
  }ms)`);

  return result;
}
```

### Expected Results

| Optimization | Before | After | Improvement |
|-------------|--------|-------|-------------|
| Pattern clone | 50ms | 12ms | 76% faster |
| Full save | 200ms | 200ms | Same (no change) |
| Differential save | N/A | <20ms | 90% faster |
| Effect update | Full rebuild | Fast path | 80-90% faster |
| Copy large selection | Spread | structuredClone | 60-75% faster |

---

## Rollback Plan

If any integration causes issues:

1. **Immediate rollback**: Revert the specific changes
2. **Verify baseline**: Test that app works without the optimization
3. **Debug**: Identify root cause of the issue
4. **Re-attempt**: Fix and retry the integration

### Safety Tips

- Test each integration independently
- Keep old code commented out for easy rollback
- Add console logs to track behavior
- Monitor browser DevTools Performance tab
- Watch for localStorage quota errors

---

## Next Steps

1. **Choose an integration** - Start with #2 (requestIdleCallback) as it's lowest risk
2. **Test thoroughly** - Run through all testing checklists
3. **Measure improvement** - Use Performance API to verify gains
4. **Document results** - Update this guide with actual measurements
5. **Move to next** - Once one works, proceed to the next integration

---

## Support

If you encounter issues during integration:

1. Check browser console for errors
2. Verify localStorage quota not exceeded
3. Test in incognito mode (clean state)
4. Check Performance tab in DevTools
5. Verify store subscriptions working correctly
