---
date: 2026-02-28
topic: supercollider-audio-debug
tags: [supercollider, audio-context, tone.js, wasm, audioworklet]
status: in-progress
---

# Handoff: SuperCollider Audio — No Sound on Key Press

## Task

Fix the SuperCollider (SC) default SynthDef producing no audio when playing the TestKeyboard.

## Status

**Root cause identified and fix applied. Fix NOT yet confirmed working** — awaiting a key press from user to verify the console log shows `[SC:Engine] /s_new nodeId:` and audio comes out.

---

## Critical References

| File | Purpose |
|------|---------|
| `src/engine/ToneEngine.ts` | `triggerNoteAttack` (line ~2428), `getSafeTime` (line ~1300), new `isContextActuallyRunning()` (line ~752), fixed `init()` (line ~585) |
| `src/engine/sc/SuperColliderSynth.ts` | `triggerAttack` — ignores `time` param (`void time;`), defers via `_enginePromise.then(engine => engine.noteOn(...))` |
| `src/engine/sc/SuperColliderEngine.ts` | `noteOn` → `sendOsc(oscNewSynth(...))` — sends `/s_new` to scsynth WASM |
| `src/components/instruments/shared/TestKeyboard.tsx` | `ensureContextRunning()` — fixed to use `isContextActuallyRunning()` instead of stale `getContextState()` |
| `src/stores/useInstrumentStore.ts` | `soundParamsChanging` — fixed in previous session to include `updates.superCollider` |
| `src/engine/registry/builtin/supercollider.ts` | Registers SC with `loadMode: 'eager'`, `useSynthBus: true` |
| `public/sc/DEViLBOX.SC.worklet.js` | AudioWorklet that runs scsynth WASM |

---

## Root Cause

**AudioContext stale state** — Tone.js wraps the native `AudioContext` and can cache a stale `'running'` state after the browser auto-suspends the context (page load before gesture, 30s silence, tab focus lost).

This caused a two-layer failure:

1. `ensureContextRunning()` in TestKeyboard called `engine.getContextState()` which uses `Tone.getContext().state`. When Tone.js's state was stale (`'running'`), the function short-circuited and returned `Promise.resolve()` immediately — skipping `engine.init()` and thus never resuming the native context.

2. `engine.init()` also checked only `Tone.getContext().state === 'suspended'` before calling `Tone.start()`. If Tone.js's state was stale, `Tone.start()` was never called.

3. `doAttack` fired with the native AudioContext still suspended.

4. `getSafeTime()` checked `Tone.context.state !== 'running'` → returned `null`.

5. `triggerNoteAttack` returned early when `safeTime === null` — **`instrument.triggerAttack` was never called**.

### Why SC ignores time but it still doesn't help

`SuperColliderSynth.triggerAttack` ignores the `time` parameter (`void time;`) and defers internally via `_enginePromise.then(engine => engine.noteOn(...))`. However, the note was being dropped at the `getSafeTime === null` check in `triggerNoteAttack`, BEFORE `triggerAttack` was ever called on the synth.

---

## Confirmed Working (from console logs)

From two separate sessions of console log analysis:

- ✅ Store fix: `[SC:Store] invalidateInstrument id: 1 binary length: 644 defName: mySynth`
- ✅ Note routing: `[SC:ToneEngine] triggerPolyNoteAttack called` → `triggerNoteAttack called`
- ✅ Synth creation: `[SC:Synth] _initEngine called, binary length: 644`
- ✅ Engine output wired: `[ToneEngine] Routed SuperCollider output → synthBus`
- ✅ SC engine boots: `SuperCollider 3 server ready. OSC endpoint ready on port 57110`
- ✅ Binary loaded: `[SC:Engine] /d_recv binary 483 bytes`
- ❌ Note never triggered: `getSafeTime: context state is 'suspended'` → early return

---

## Fix Applied (2026-02-28)

### 1. `ToneEngine.isContextActuallyRunning()` — new method

```typescript
// src/engine/ToneEngine.ts ~line 752
public isContextActuallyRunning(): boolean {
  return (
    Tone.getContext().state === 'running' &&
    (this._nativeContext?.state ?? 'suspended') === 'running'
  );
}
```

Checks BOTH Tone.js wrapper AND native `AudioContext` state. Only returns `true` when both agree.

### 2. `ToneEngine.init()` — fixed stale-state resume

```typescript
// src/engine/ToneEngine.ts ~line 585
const nativeCtx = this._nativeContext!;

// Resume if EITHER Tone.js or native context is not running
if (Tone.getContext().state === 'suspended' || nativeCtx.state !== 'running') {
  await Tone.start();
  // Belt-and-suspenders: also resume native context directly
  if (nativeCtx.state !== 'running') {
    await nativeCtx.resume().catch(() => {});
  }
}
```

### 3. `TestKeyboard.ensureContextRunning()` — use reliable check

```typescript
// src/components/instruments/shared/TestKeyboard.tsx ~line 170
if (engine.isContextActuallyRunning()) return Promise.resolve();
// (instead of: engine.getContextState() === 'running')
```

---

## SC Audio Chain (confirmed working up to the block point)

```
scsynth WASM (AudioWorklet)
  → SuperColliderEngine.output (shared GainNode)
    → SuperColliderSynth._gainNode (per-instance)
      → ToneEngine.synthBus (Tone.Gain)
        → masterEffectsInput
          → [master fx] → blepInput → masterChannel
            → AudioContext destination
```

---

## SC Architecture Notes

- **`SuperColliderEngine` is a singleton per `AudioContext`** — shared across all SC synth instances. Boot is idempotent via `WeakMap` cache on the AudioContext.
- **`SuperColliderSynth` is per-voice-channel** — `isSharedType = false` in `getInstrument`. Each live keyboard note (channelIndex ≥ 100) gets its own instance key.
- **Compile server** (`/api/sc/compile`) is a separate local process (not part of Vite dev server). Must be running for SynthDef recompilation. Existing binary survives restarts via project persistence.
- **SynthDef binary flow**: TypeScript base64 string → `atob()` → `Uint8Array` → OSC `/d_recv` → scsynth WASM
- **Note trigger flow**: `triggerAttack(note, time, velocity)` → `midiToHz(note)` → OSC `/s_new` with `{freq, amp, gate: 1}` + config params
- **Release**: sets `gate: 0` via OSC `/n_set` → EnvGen doneAction frees the node
- **Monophonic behaviour**: previous node gets `noteOff` before new `/s_new`

## Diagnostic Logging Still Present

The following logs were added for debugging and are still in the code. They should be removed once audio is confirmed working:

- `ToneEngine.ts`: `[SC:ToneEngine] triggerPolyNoteAttack called`, `triggerNoteAttack called`, `getInstrument` logs (lines ~2055–2068, ~2405–2416, ~1366–1368)
- `SuperColliderSynth.ts`: `[SC:Synth]` logs throughout `_initEngine`, `triggerAttack`
- `SuperColliderEngine.ts`: `[SC:Engine] /d_recv binary` log
- `useInstrumentStore.ts`: `[SC:Store] invalidateInstrument` log (line ~652)

---

## Next Steps (in order)

1. **Verify the fix works**: press a key on TestKeyboard and confirm:
   - `[SC:Synth] triggerAttack:` log appears
   - `[SC:Engine] /s_new nodeId:` log appears
   - Audio is audible

2. **If still no audio** after the above logs appear, the issue is downstream (synthBus routing, master effects, volume). Check:
   - `ToneEngine.synthBus` → `masterEffectsInput` connection is made
   - Master volume is not zero
   - SC engine output GainNode gain is 1.0

3. **If `/s_new` fires but no sound**: the SynthDef itself may be silent. The default SynthDef name is `mySynth`. Verify its source — it should produce an audible sine/saw wave on the `freq` control.

4. **Start the compile server** if needed for recompilation (separate process, currently `ERR_CONNECTION_REFUSED`).

5. **Clean up diagnostic logs** once audio is confirmed working (see list above).

6. **Consider adding `isLive: true`** to the SC instrument registry config so SC notes always use `getImmediateTime()` instead of `getSafeTime()` — this would be a more surgical long-term fix since SC ignores the time param entirely.

---

## Other Notes

- **PixiJS warnings** (`[Cache] already has key: -bitmap`) are unrelated noise — a known Pixi issue with bitmap fonts being registered twice.
- **iOS Audio Unlock** log appears on page load — something plays a silent buffer to pre-unlock the AudioContext. This is expected behavior.
- The previous session fixed `useInstrumentStore.ts` to include `updates.superCollider` in the `soundParamsChanging` invalidation check. This is what triggers the engine to reload the SynthDef binary when it changes.
