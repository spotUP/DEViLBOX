---
date: 2026-04-20
topic: dub-chainswap-toast-pending
tags: [dub, handoff, blocked, multi-agent, pending]
status: blocked
---

# Dub chain-swap guard + TOAST DJ button — blocked on multi-agent races

## TL;DR

Two verified-open items from the dub audit (#5 chain-swap self-oscillation
guard, #9 TOAST in DJ view) were **implemented three times** this session,
but each attempt lost the source code before landing. A parallel Claude
agent working on the `dbx-export-dublane-test` branch kept switching the
working-tree branch and reverting my edits between `git add` and `git commit`.
**PR #59 merged with my commit message attached to the wrong files** — see
git log entry `0e08991da fix(dub): chain-swap self-oscillation guard +
TOAST hold-button in DJ view (#59)`, which actually contains DubLaneTimeline
+ moveRegistryContract + parameterRouter edits, not my DubBus/TOAST work.

**Result: neither fix is on main.** Reapply in a single-agent session.

## Fix #1 — `DubBus.setReverseChainOrder` self-oscillation guard

**File**: `src/engine/dub/DubBus.ts` (~line 2602, method `setReverseChainOrder`)

**Symptom**: toggling reverb↔delay order at runtime can spark audible
self-oscillation. Web Audio topology changes settle at the next processing
quantum (~3 ms at 44.1 kHz); the old code did raw `Tone.disconnect` →
`Tone.connect` with no gain guard, so the quantum between the two calls
had BOTH routings (`echo→spring` AND `spring→echo`) momentarily live.
With high echo feedback + high spring Q that's enough to spark a brief
self-oscillation feedback loop.

**Fix**: mute `return_.gain` to 0 BEFORE the splice, defer the splice via
`setTimeout` until the mute lands, ramp back to the snapshotted level
after. Total dip is ~50 ms of wet bus, well within dub tolerance.

### Exact edit

Replace the current method body starting at `setReverseChainOrder(on: boolean): void {` with:

```ts
private _reverseChainOrder = false;
setReverseChainOrder(on: boolean): void {
  if (on === this._reverseChainOrder) return;
  const springIn = this.spring.input as unknown as Tone.InputNode;
  const echoIn = (this.echo as unknown as { input: Tone.InputNode }).input;
  const echoOut = (this.echo as unknown as { output: Tone.ToneAudioNode }).output;
  const springOut = (this.spring as unknown as { output: Tone.ToneAudioNode }).output;

  const ctx = this.context;
  const priorGain = this.return_.gain.value;
  const RAMP_SEC = 0.02;
  const SWAP_DELAY_MS = RAMP_SEC * 1000 + 5;

  // Ramp return to 0 FIRST so the splice window runs silent.
  try {
    const now = ctx.currentTime;
    this.return_.gain.cancelScheduledValues(now);
    this.return_.gain.setValueAtTime(priorGain, now);
    this.return_.gain.linearRampToValueAtTime(0, now + RAMP_SEC);
  } catch { /* ok */ }

  setTimeout(() => {
    try {
      if (on) {
        // Normal → Reverse: was tapeSat→echo→spring→sidechain.
        // Want tapeSat→spring→echo→sidechain.
        Tone.disconnect(this.tapeSatBypass, echoIn);
        Tone.disconnect(this.tapeStackMix, echoIn);
        Tone.disconnect(echoOut, springIn);
        Tone.disconnect(springOut, this.sidechain as unknown as Tone.InputNode);
        Tone.connect(this.tapeSatBypass, springIn);
        Tone.connect(this.tapeStackMix, springIn);
        Tone.connect(springOut, echoIn);
        Tone.connect(echoOut, this.sidechain as unknown as Tone.InputNode);
      } else {
        // Reverse → Normal: the mirror operation.
        Tone.disconnect(this.tapeSatBypass, springIn);
        Tone.disconnect(this.tapeStackMix, springIn);
        Tone.disconnect(springOut, echoIn);
        Tone.disconnect(echoOut, this.sidechain as unknown as Tone.InputNode);
        Tone.connect(this.tapeSatBypass, echoIn);
        Tone.connect(this.tapeStackMix, echoIn);
        Tone.connect(echoOut, springIn);
        Tone.connect(springOut, this.sidechain as unknown as Tone.InputNode);
      }
      this._reverseChainOrder = on;
    } catch (err) {
      console.warn('[DubBus] setReverseChainOrder swap failed:', err);
    }
    try {
      const now2 = ctx.currentTime;
      this.return_.gain.cancelScheduledValues(now2);
      this.return_.gain.setValueAtTime(0, now2);
      this.return_.gain.linearRampToValueAtTime(priorGain, now2 + RAMP_SEC);
    } catch { /* ok */ }
  }, SWAP_DELAY_MS);
}
```

Also update the method docblock to say "mute → disconnect → reconnect →
unmute" and explain the self-oscillation rationale (see previous attempts
in the git reflog for exact wording).

### Regression test

**File**: `src/engine/dub/__tests__/chainSwapGuard.test.ts` (already referenced in `package.json` test:ci glob from PR #59)

Static source-contract test (happy-dom can't simulate Web Audio). Five
grep-based invariants:
1. `setReverseChainOrder` method body is findable (> 100 chars)
2. `return_.gain` ramps to 0 BEFORE the first `Tone.disconnect`
3. the splice is deferred via `setTimeout`
4. `priorGain` is captured pre-mute + `linearRampToValueAtTime(priorGain`
   appears post-splice
5. the docblock mentions `self-oscillation`/`feedback`/`mute`/`splice`/`quantum`

## Fix #2 — TOAST hold-button in DJ view

**File**: `src/components/dj/DJMicControl.tsx`

**Symptom**: TOAST is a dub move (`kind: 'hold'`) that taps the live mic
into the dub wet chain (`toast.ts`). Before this fix the DJ view's only
way to fire it was via MCP, which blocks live use.

**Fix**: add a press-and-hold TOAST button inside DJMicControl that only
shows when `micEnabled`. Mouse-down / touchstart fires
`DubRouter.fire('toast', undefined, {}, 'live')`; mouse-up / mouse-leave
/ touchend disposes the returned hold handle. Store the handle in a
`useRef` so concurrent React re-renders can't orphan it.

### Exact edit

1. Add imports:
   ```ts
   import React, { useState, useCallback, useRef } from 'react';
   import { fire } from '@/engine/dub/DubRouter';
   ```

2. Inside the component function body, after the existing state declarations:
   ```ts
   const [toasting, setToasting] = useState(false);
   const toastHandleRef = useRef<{ dispose(): void } | null>(null);
   ```

3. Above the existing `handleGainChange`:
   ```ts
   const startToast = useCallback(() => {
     if (toastHandleRef.current) return;
     const handle = fire('toast', undefined, {}, 'live');
     if (handle) {
       toastHandleRef.current = handle;
       setToasting(true);
     }
   }, []);

   const stopToast = useCallback(() => {
     if (!toastHandleRef.current) return;
     try { toastHandleRef.current.dispose(); } catch { /* ok */ }
     toastHandleRef.current = null;
     setToasting(false);
   }, []);
   ```

4. In the return's JSX, after the existing `<input type="range">` block
   and before `{error && …}`:
   ```tsx
   {micEnabled && (
     <button
       onMouseDown={startToast}
       onMouseUp={stopToast}
       onMouseLeave={stopToast}
       onTouchStart={(e) => { e.preventDefault(); startToast(); }}
       onTouchEnd={(e) => { e.preventDefault(); stopToast(); }}
       className={`
         px-2 py-1 rounded text-xs font-bold transition-colors select-none
         ${toasting
           ? 'bg-accent-primary text-text-inverse'
           : 'bg-dark-bgTertiary hover:bg-dark-bgHover border border-dark-border text-text-primary'
         }
       `}
       title="Hold to TOAST — mic voice through dub bus (echo + spring)"
     >
       TOAST
     </button>
   )}
   ```

## How to land it

Single-agent session only — the multi-agent race is unrecoverable via
sequential edits.

1. Confirm no other Claude Code session is running.
2. Checkout a fresh branch off current `origin/main`.
3. Apply both edits above (DubBus method + DJMicControl additions +
   create chainSwapGuard.test.ts).
4. `npm run type-check && npm run test:ci` — all green. CI gate already
   expects `chainSwapGuard.test.ts` (PR #59 added it to the glob even
   though the file itself wasn't committed).
5. Commit + push + PR + merge without another agent racing.

## Other open items (unchanged from previous audit)

From the verified list:
- #1 Furnace gain-staging audit — detector only, no fix
- #4 per-FX bassLock on DJ master FX
- #7 MIDI CC trigger-route type for dub moves
- #8b Mad Professor PCM-70 plate reverb DSP
