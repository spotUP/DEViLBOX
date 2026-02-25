# Tracker Scratch Bug — Progress Report

## Problem
Scratching in the tracker view (2-finger Mac trackpad scroll) causes playback to freeze/go silent for ~20 seconds after the scratch gesture ends. The user has to wait or restart playback.

## Root Causes Identified & Fixed

### 1. ✅ Scheduler `nextScheduleTime` pushed into the future
**File:** `TrackerReplayer.ts`
During scratch, `tempoMultiplier = 0.001` makes tick interval = `2.5 / (BPM × 0.001)` ≈ 20 seconds. The scheduler's `nextScheduleTime` accumulates far into the future. On exit, the scheduler waits for real time to catch up.
**Fix:** Added `resyncSchedulerToNow()` method that snaps `nextScheduleTime = Tone.now()`, called from `exitScratchMode()`.

### 2. ✅ Mac trackpad inertial scroll resets idle timer
**File:** `TrackerScratchController.ts`
Mac trackpad sends decaying scroll events for 2-3 seconds after lifting fingers. These reset `lastEventTime`, preventing the 300ms idle timeout from ever being met, so `exitScratchMode` never fires.
**Fix:** Added `SCROLL_SIGNIFICANT_THRESHOLD = 10` — only deltas ≥ 10px reset the idle timer. Smaller inertial decay events are ignored for idle detection.

### 3. ✅ Crash when scratch buffer not initialized
**File:** `TrackerScratchController.ts`
`exitScratchMode` fired before async `initScratchBuffer()` completed, causing `TypeError: Cannot read properties of undefined (reading 'gain')`.
**Fix:** Added null guards for `getMasterGain()` and `scratchBufferReady` check.

### 4. ✅ Inertial scroll re-enters scratch after exit
**File:** `TrackerScratchController.ts`
After `exitScratchMode` sets `_isActive = false`, the next inertial scroll event (even with delta > threshold) immediately re-enters scratch mode, causing rapid enter/exit oscillation. This made the tracker position jitter and audio go silent.
**Fix:** Added `SCRATCH_EXIT_COOLDOWN_MS = 1500` — after exiting scratch, ALL scroll events are ignored for 1.5 seconds.

### 5. ✅ Inertial impulses fight motor convergence
**File:** `TrackerScratchController.ts`
Even after idle timer expires, inertial events with delta > threshold still applied physics impulses, keeping the rate depressed at ~0.95 and preventing exit.
**Fix:** Once idle timer expires, consume events but DON'T apply impulses. This lets the motor converge unimpeded, matching the DJ vinyl view's behavior after pointer release.

### 6. ✅ Rate convergence exit condition unreliable for wheel input
**File:** `TrackerScratchController.ts`
The exit condition required `Math.abs(rate - 1.0) < 0.02` (2% tolerance). With Mac trackpad inertial scroll, the rate oscillates around 0.95 and never converges, trapping scratch mode forever.
**Fix:** Removed rate convergence requirement from exit condition. Exit now fires on idle timeout alone. The crossfade and `physics.reset()` handle the audio transition.

### 7. 🔄 Gain restore on exit (IN PROGRESS)
**File:** `TrackerScratchController.ts`
On scratch entry, replayer gain is set to 0 via raw Web Audio API (`setValueAtTime(0, now)`). On exit, the gain restore using Tone.js `rampTo()` may not work correctly because the Tone.js Signal wrapper is out of sync with the raw AudioParam.
**Fix (current attempt):** Changed to immediate gain restore (`masterGain.gain.value = 1`) instead of ramped crossfade. Still testing.

### 8. 🔄 Order of operations on exit (IN PROGRESS)
**File:** `TrackerScratchController.ts`
Previously: `setTempoMultiplier(1.0)` → `setSuppressNotes(false)` → `resyncSchedulerToNow()`. This could cause the scheduler to process a backlog of ticks at normal speed with notes unsuppressed, potentially wrapping the song position and firing `onSongEnd` repeatedly.
**Fix (current attempt):** Reordered to: `resyncSchedulerToNow()` → `setTempoMultiplier(1.0)` → `setSuppressNotes(false)`. Resync happens BEFORE tempo is restored, so no backlog exists when the scheduler resumes.

## Current Status

**Improved significantly** — scratch now enters cleanly, exits reliably after idle timeout, and doesn't get stuck in enter/exit loops. But still experiencing silence after exit in some cases. The latest fix (immediate gain restore + reordered exit ops) is awaiting testing.

## Key Architectural Difference: DJ vs Tracker Scratch

| Aspect | DJ View (works) | Tracker View (buggy) |
|--------|-----------------|---------------------|
| Input | Pointer events (mousedown/up) | Wheel events (scroll) |
| Stop signal | `pointerup` — clean, instant | Idle timeout — delayed, unreliable |
| Inertial events | None | 2-3 seconds of decaying deltas |
| Exit trigger | Rate convergence + not touching | Idle timeout only (rate check removed) |

The fundamental challenge is that wheel events have no clean "user stopped" signal like `pointerup`. All fixes are workarounds for this.

## Files Modified

- `src/engine/TrackerReplayer.ts` — Added `resyncSchedulerToNow()` method
- `src/engine/TrackerScratchController.ts` — Multiple fixes (thresholds, cooldown, impulse blocking, exit condition, gain restore, exit order)
- `src/components/vj/VJView.tsx` — Unrelated TS fix (null check for canvas in async closure)

## Debug Logging (temporary)

`console.warn` logs added at:
- Scratch entry: `[TrackerScratch] Entering scratch mode, delta=X`
- Scratch exit: `[TrackerScratch] Exiting scratch mode, rate=X`
- Gain restore: `[TrackerScratch] Gain restored to X`
- Cooldown block: `[TrackerScratch] Cooldown blocking re-entry, delta=X, remaining=Xms`

These should be removed or downgraded to `console.debug` once the issue is fully resolved.
