# Master FX Bug Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix ~22 reported issues with DEViLBOX master effects — broken knobs, silent effects, bad defaults, UI layout problems, and neural model differentiation.

**Architecture:** Most fixes are targeted edits to `ToneEngine.ts` (parameter routing), effect class files, and registry defaults. UI fixes are in `VisualEffectEditors.tsx` and CSS. WASM effect fixes require investigating the ready-signaling path.

**Tech Stack:** TypeScript, React 19, Tone.js, AudioWorklet + WASM, WAM 2.0 plugins, GuitarML / NeuralEffectWrapper

---

## Root Cause Summary

| Issue | Root Cause | File |
|-------|-----------|------|
| DubFilter knobs broken | ToneEngine uses property assignment instead of method calls | `ToneEngine.ts:5201` |
| Phaser barely audible | Missing `baseFrequency` in ToneEngine diff handler | `ToneEngine.ts:5064` |
| Neural effects do nothing on knob move | No `case 'Neural':` in `applyEffectParametersDiff` | `ToneEngine.ts` |
| All neural effects sound identical | All map to same `condition` param at default 50% | `NeuralParameterMapper.ts` |
| SpaceEcho sync preset no effect | `updateBpmSyncedEffects` not called on syncDivision change | `ToneEngine.ts` |
| MVerb/Leslie/SpringReverb/MoogFilter knobs broken | `isWasmReady` never becomes `true` → `sendParam` is no-op | `*Effect.ts` files |
| JCReverb silent at 100% wet | Tone.js JCReverb wet=1.0 causes comb filter runaway/silence | `ToneEngine.ts` / registry |
| StereoWidener silent at 100% width | Phase cancellation of mono material at width=1.0 | registry |
| SpaceyDelayer/RETapeEcho silent at 100% wet | WASM not in signal path at 100% wet (dry=0, wasm not ready) | `*Effect.ts` files |
| VinylNoise/Tumult fade out | Regression from recent commit — likely playing-state signal | investigate |
| WAM UI centering/sizing | `scaleToFit()` CSS not correct per WAM plugin | `VisualEffectEditors.tsx` |
| TapeSimulator UI too tall | 703px KissOfShame UI overflows effects browser | `VisualEffectEditors.tsx` |
| SpringReverb UI not centered | Editor div missing `mx-auto` or `flex justify-center` | `VisualEffectEditors.tsx` |
| AutoPanner barely audible | Default depth too low and frequency mapping too subtle | registry defaults |

---

## Task 1: Fix DubFilter Knobs (ToneEngine Property → Method)

**Files:**
- Modify: `src/engine/ToneEngine.ts` (around line 5201)

**Context:** `applyEffectParametersDiff` case `'DubFilter'` casts to a fake interface `{ cutoff: number; resonance: number; gain: number }` and tries to set properties directly. `DubFilterEffect` only exposes `setCutoff()`, `setResonance()`, and `setGain()` methods — no property setters. TypeScript silently ignores the assignment.

**Step 1: Read the current broken code**

File: `src/engine/ToneEngine.ts`, around line 5201:
```typescript
case 'DubFilter':
  if (node instanceof DubFilterEffect) {
    const dubFilter = node as unknown as { cutoff: number; resonance: number; gain: number };
    if ('cutoff' in changed) dubFilter.cutoff = Number(changed.cutoff);
    if ('resonance' in changed) dubFilter.resonance = Number(changed.resonance);
    if ('gain' in changed) dubFilter.gain = Number(changed.gain);
  }
  break;
```

**Step 2: Replace with method calls**

```typescript
case 'DubFilter':
  if (node instanceof DubFilterEffect) {
    if ('cutoff' in changed) node.setCutoff(Number(changed.cutoff));
    if ('resonance' in changed) node.setResonance(Number(changed.resonance));
    if ('gain' in changed) node.setGain(Number(changed.gain));
  }
  break;
```

**Step 3: Verify DubFilterEffect has these methods**

Check `src/engine/effects/DubFilterEffect.ts` has `setCutoff(val)`, `setResonance(val)`, `setGain(val)` — confirmed from earlier read.

**Step 4: Commit**
```bash
git add src/engine/ToneEngine.ts
git commit -m "fix(effects): DubFilter knobs — use method calls instead of property assignment"
```

---

## Task 2: Fix Phaser Missing baseFrequency Update

**Files:**
- Modify: `src/engine/ToneEngine.ts` (Phaser case in `applyEffectParametersDiff`)

**Context:** The Phaser case handles `frequency` and `octaves` but not `baseFrequency`. The editor exposes a `baseFrequency` knob that does nothing.

**Step 1: Find the Phaser case** (~line 5064)

Look for `case 'Phaser':` in `applyEffectParametersDiff`.

**Step 2: Add baseFrequency handling**

Add this line inside the `if (node instanceof Tone.Phaser)` block:
```typescript
if ('baseFrequency' in changed) node.baseFrequency = Number(changed.baseFrequency);
```

The final Phaser block should handle: `frequency`, `octaves`, `baseFrequency`, `Q`.

**Step 3: Commit**
```bash
git add src/engine/ToneEngine.ts
git commit -m "fix(effects): Phaser — add baseFrequency to parameter diff handler"
```

---

## Task 3: Add Neural Effect Handler in ToneEngine

**Files:**
- Modify: `src/engine/ToneEngine.ts` (add `case 'Neural':` to `applyEffectParametersDiff`)

**Context:** There is NO `case 'Neural':` in `applyEffectParametersDiff`. When any neural effect knob changes (drive, gain, bass, treble, presence, etc.), the diff is computed but never applied because the switch falls through to `default:` which does nothing. `NeuralEffectWrapper.setParameter(key, value)` handles all params and maps to GuitarML condition + EQ.

**Step 1: Import NeuralEffectWrapper** at top of ToneEngine.ts

```typescript
import { NeuralEffectWrapper } from './effects/NeuralEffectWrapper';
```

**Step 2: Add case to switch** (before the closing `default:` case):

```typescript
case 'Neural':
  if (node instanceof NeuralEffectWrapper) {
    for (const [key, value] of Object.entries(changed)) {
      node.setParameter(key, Number(value));
    }
  }
  break;
```

**Step 3: Commit**
```bash
git add src/engine/ToneEngine.ts
git commit -m "fix(effects): add Neural case to applyEffectParametersDiff — knobs now route to NeuralEffectWrapper"
```

---

## Task 4: Update Reverb Defaults

**Files:**
- Modify: `src/engine/registry/effects/tonejs.ts` (Reverb entry)

**Context:** User reports reverb sounds "very muffled." Target defaults: decay=8.6, preDelay=0.4s (400ms), mix=50%.

**Step 1: Find the Reverb registry entry** in `tonejs.ts`

Look for `id: 'Reverb'` — it creates `new Tone.Reverb({...})`.

**Step 2: Update defaults**

Change `getDefaultParameters: () => ({ ... })` to:
```typescript
getDefaultParameters: () => ({ decay: 8.6, preDelay: 0.4 }),
```

And change the `create` factory default wet from whatever it is to `c.wet / 100` where the default `EffectConfig.wet` should be 50. Check how the default `wet` is set on the EffectConfig — the registry's `getDefaultParameters` only covers `parameters`, not `wet`. The `wet` default on EffectConfig is set when a new effect is added to the chain (in the effects browser or store). Find where the initial `wet` is set when adding a Reverb to the chain and ensure it defaults to 50 (= 50%).

**Step 3: Verify the create factory uses defaults correctly**

The create function should be something like:
```typescript
create: async (c: EffectConfig) => {
  const p = c.parameters;
  return new Tone.Reverb({
    decay: Number(p.decay) || 8.6,
    preDelay: Number(p.preDelay) || 0.4,
    wet: c.wet / 100,
  });
},
```

**Step 4: Check where default wet is set for new effects**

Search for where `EffectConfig` is created when adding an effect. Usually something like:
```typescript
const newEffect: EffectConfig = { id, type, category, enabled: true, wet: 100, parameters: descriptor.getDefaultParameters() }
```
Change `wet: 100` → `wet: 50` for reverb-type effects, OR add a `defaultWet` field to the descriptor.

**Step 5: Commit**
```bash
git add src/engine/registry/effects/tonejs.ts
git commit -m "fix(effects): Reverb — update defaults to decay=8.6, preDelay=0.4, wet=50%"
```

---

## Task 5: Update SpaceEcho Defaults + Fix BPM Sync Trigger

**Files:**
- Modify: `src/engine/registry/effects/tonejs.ts` (SpaceEcho entry)
- Modify: `src/engine/ToneEngine.ts` (`updateMasterEffectParams` — trigger BPM sync on param change)

### Part A: Update SpaceEcho defaults

**Context:** Current defaults: mode=4, rate=300, intensity=0.5, echoVolume=0.8, reverbVolume=0.3, bass=0, treble=0. User wants: mode=8, intensity=0.74 (74%), echoVolume=0.8 (already correct), reverbVolume=0.4 (40%), bass=4, treble=4, bpmSync enabled.

**Step 1: Update SpaceEcho registry**

In `tonejs.ts`, find the SpaceEcho entry and change `getDefaultParameters`:
```typescript
getDefaultParameters: () => ({
  mode: 8,
  rate: 300,
  intensity: 0.74,
  echoVolume: 0.8,
  reverbVolume: 0.4,
  bass: 4,
  treble: 4,
  wow: 0.15,
  bpmSync: 1,
  syncDivision: '1/8',
}),
```

Also update the `create` factory to use these new defaults:
```typescript
create: async (c: EffectConfig) => {
  const p = c.parameters;
  return new SpaceEchoEffect({
    mode: Number(p.mode) || 8,
    rate: Number(p.rate) || 300,
    intensity: Number(p.intensity) || 0.74,
    echoVolume: Number(p.echoVolume) || 0.8,
    reverbVolume: Number(p.reverbVolume) || 0.4,
    bass: Number(p.bass) || 4,
    treble: Number(p.treble) || 4,
    wow: Number(p.wow) || 0.15,
    wet: c.wet / 100,
  });
},
```

### Part B: Fix BPM sync not triggering on division change

**Context:** `updateBpmSyncedEffects(bpm)` is only called when BPM changes in the transport. But when the user changes `syncDivision` or toggles `bpmSync`, the div change goes through `updateMasterEffectParams` → `applyEffectParametersDiff` → `case 'SpaceEcho':` where `bpmSync`/`syncDivision` keys are IGNORED. The computed synced rate is never applied.

**Step 1: Find `updateMasterEffectParams`** in ToneEngine.ts (line ~4947)

**Step 2: After the call to `applyEffectParametersDiff`**, add BPM sync re-application:
```typescript
// If bpmSync or syncDivision changed, immediately recompute synced params
if ('bpmSync' in changedParams || 'syncDivision' in changedParams) {
  const currentBpm = Tone.getTransport().bpm.value;
  // Fire async, don't await
  this.updateBpmSyncedEffects(currentBpm).catch(() => {});
}
```

**Step 3: Also do this in the instrument effect update path** (~line 5011-5022) if it has the same pattern.

**Step 4: Commit**
```bash
git add src/engine/registry/effects/tonejs.ts src/engine/ToneEngine.ts
git commit -m "fix(effects): SpaceEcho — update defaults, fix BPM sync immediate trigger on division change"
```

---

## Task 6: Investigate + Fix WASM Effect Knobs (MVerb, Leslie, SpringReverb, MoogFilter)

**Files:**
- Investigate: `src/engine/effects/MVerbEffect.ts`, `LeslieEffect.ts`, `SpringReverbEffect.ts`, `MoogFilterEffect.ts`
- Possibly modify each file's `sendParam` to queue params before WASM is ready

**Context:** These four effects all share the same pattern:
1. Start a JS fallback immediately (ScriptProcessorNode)
2. Asynchronously load WASM worklet
3. On `workletNode.port.onmessage({ type: 'ready' })`, set `isWasmReady = true`, send all params, call `swapToWasm()`
4. `sendParam` is a no-op unless `isWasmReady === true`

Hypothesis: If `isWasmReady` never becomes `true`, `sendParam` calls from ToneEngine are silently dropped. Effects DO process audio (JS fallback) but knobs do nothing.

WASM files exist: `public/mverb/MVerb.wasm`, `public/leslie/Leslie.wasm`, `public/springreverb/SpringReverb.wasm`, `public/moogfilters/MoogFilters.wasm` ✓

**Step 1: Add a console.log diagnostic** temporarily to MVerbEffect

In `MVerbEffect.initWasm()`, add:
```typescript
console.log('[MVerb] Starting WASM init...');
// ...
this.workletNode.port.onmessage = (event) => {
  console.log('[MVerb] Worklet message:', event.data.type, event.data);
  if (event.data.type === 'ready') {
    console.log('[MVerb] WASM ready! isWasmReady = true');
    this.isWasmReady = true;
    ...
```

Also add in `sendParam`:
```typescript
private sendParam(paramId: number, value: number) {
  if (!this.isWasmReady) {
    console.debug('[MVerb] sendParam called but WASM not ready, dropping param:', paramId, value);
  }
  if (this.workletNode && this.isWasmReady) {
    ...
```

**Step 2: Check browser console** — does "[MVerb] WASM ready!" appear? If not, the worklet's WASM init is failing.

**Step 3a: If worklet never sends 'ready'** — open the worklet file `public/mverb/MVerb.worklet.js` and check the WASM init path. Look for `this.port.postMessage({ type: 'ready' })`. If the init path is inside an async function that fails silently, add try/catch.

**Step 3b: If WASM sends 'ready' but sendParam still doesn't work** — check the param ID constants in MVerbEffect match what the worklet expects. The worklet's `onmessage` handler decodes `paramId` and calls the corresponding WASM function.

**Step 4: Fix — param queueing before ready**

As a robust fix regardless of timing, add a pending-params queue:

```typescript
private pendingParams: Array<{ paramId: number; value: number }> = [];

private sendParam(paramId: number, value: number) {
  if (this.workletNode && this.isWasmReady) {
    this.workletNode.port.postMessage({ type: 'parameter', paramId, value });
  } else {
    // Queue param for after WASM is ready
    this.pendingParams = this.pendingParams.filter(p => p.paramId !== paramId);
    this.pendingParams.push({ paramId, value });
  }
}
```

And flush on ready:
```typescript
if (event.data.type === 'ready') {
  this.isWasmReady = true;
  // Flush any queued params (from before ready)
  for (const { paramId, value } of this.pendingParams) {
    this.workletNode!.port.postMessage({ type: 'parameter', paramId, value });
  }
  this.pendingParams = [];
  this.swapToWasm();
}
```

Apply this pattern to ALL FOUR files: `MVerbEffect.ts`, `LeslieEffect.ts`, `SpringReverbEffect.ts`, `MoogFilterEffect.ts`.

**Step 5: Remove diagnostic console.logs**

**Step 6: Commit**
```bash
git add src/engine/effects/MVerbEffect.ts src/engine/effects/LeslieEffect.ts \
  src/engine/effects/SpringReverbEffect.ts src/engine/effects/MoogFilterEffect.ts
git commit -m "fix(effects): WASM effects — add param queue for pre-ready delivery; fix knob response for MVerb/Leslie/SpringReverb/MoogFilter"
```

---

## Task 7: Fix JCReverb Silent at 100% Wet

**Files:**
- Investigate: `src/engine/registry/effects/tonejs.ts` (JCReverb entry)
- Investigate: how JCReverb wet is applied in ToneEngine

**Context:** User reports "the more mix I add, the more silent it gets." JCReverb uses a comb filter design. The Tone.js `JCReverb.wet` Signal should work — but if `roomSize` is set to a value approaching 1.0, feedback approaches infinity causing a DC runaway that gets clipped/silenced.

**Step 1: Check JCReverb registry entry** in `tonejs.ts`

Find `id: 'JCReverb'`. Check what `roomSize` default it uses.

**Step 2: Check if roomSize approaching 1.0**

If `roomSize > 0.95`, the comb filters saturate. Keep `roomSize <= 0.9`. Update default:
```typescript
getDefaultParameters: () => ({ roomSize: 0.7 }),
// In create:
return new Tone.JCReverb({ roomSize: Math.min(0.9, Number(p.roomSize) || 0.7), wet: c.wet / 100 });
```

**Step 3: Check ToneEngine wet handling for JCReverb**

Tone.js `JCReverb.wet` is a `Signal` (not a plain number). In ToneEngine's `updateMasterEffectParams`:
```typescript
if ('wet' in node && node.wet instanceof Tone.Signal) {
  node.wet.rampTo(wetValue, 0.02);  // This should work
}
```

Verify this branch is being reached for JCReverb (it should be, since `JCReverb.wet` IS a `Tone.Signal`).

**Step 4: Test** — load JCReverb, set mix to 0%, 50%, 100%, listen at each step. At 0% should be silent (dry only), at 50% reverb should be audible, at 100% should be full reverb.

**Step 5: Also check roomSize clamping in applyEffectParametersDiff**

Find the JCReverb case and ensure:
```typescript
case 'JCReverb':
  if (node instanceof Tone.JCReverb) {
    if ('roomSize' in changed) node.roomSize.value = Math.min(0.9, Number(changed.roomSize));
  }
  break;
```

**Step 6: Commit**
```bash
git add src/engine/registry/effects/tonejs.ts src/engine/ToneEngine.ts
git commit -m "fix(effects): JCReverb — clamp roomSize to 0.9 max, fix wet-increasing-silence issue"
```

---

## Task 8: Fix StereoWidener Silent at 100% Width

**Files:**
- Modify: `src/engine/registry/effects/tonejs.ts` (StereoWidener entry)

**Context:** `Tone.StereoWidener` at `width=1.0` applies full mid-side separation. For mono signals, `mid` cancels completely with the inverted `side` channel → silence. The fix is to limit width to a practical range (e.g., 0-0.9) OR use the dry/wet mix pattern instead of relying on width alone.

**Step 1: Check StereoWidener registry**

Find `id: 'StereoWidener'` in `tonejs.ts`. Note it creates `new Tone.StereoWidener({ width })` — no `wet` parameter. The StereoWidener's `wet` Signal should be available though.

**Step 2: Clamp width in create factory**

```typescript
create: async (c: EffectConfig) => {
  const p = c.parameters;
  const width = Math.min(0.9, Math.max(0, Number(p.width) || 0.5));
  return new Tone.StereoWidener({ width, wet: c.wet / 100 });
},
```

**Step 3: Clamp in diff handler**

Find `case 'StereoWidener':` in `applyEffectParametersDiff`. Add clamping:
```typescript
case 'StereoWidener':
  if (node instanceof Tone.StereoWidener) {
    if ('width' in changed) node.width.value = Math.min(0.9, Number(changed.width));
  }
  break;
```

**Step 4: Update registry defaults**

```typescript
getDefaultParameters: () => ({ width: 0.5 }),
```

**Step 5: Commit**
```bash
git add src/engine/registry/effects/tonejs.ts src/engine/ToneEngine.ts
git commit -m "fix(effects): StereoWidener — clamp width to 0.9 max to prevent mono cancellation silence"
```

---

## Task 9: Fix SpaceyDelayer + RETapeEcho at 100% Wet

**Files:**
- Investigate: `src/engine/effects/SpaceyDelayerEffect.ts`, `RETapeEchoEffect.ts`

**Context:** User says these effects are "broken at 100% mix — output is probably broken." At wet=100% (UI value 100 → `c.wet/100 = 1.0`), `dryGain = 0` and `wetGain = 1.0`. If the WASM worklet hasn't loaded or isn't producing output, the signal is silent. At 50% wet there's always dry signal → sounds fine.

**Step 1: Add diagnostic logging** to `SpaceyDelayerEffect._initWorklet()`:
```typescript
console.log('[SpaceyDelayer] Worklet init starting...');
// After successful connection:
console.log('[SpaceyDelayer] Worklet connected. wet=', this._options.wet);
// In workletNode.port.onmessage:
console.log('[SpaceyDelayer] Worklet message:', event.data.type);
```

**Step 2: Test at 100% wet and check console** — does the worklet connect? Does it post a ready message?

**Step 3a: If WASM doesn't connect** — check the worklet JS file URL in the effect:

In `SpaceyDelayerEffect.ts`, find the `addModule()` call and confirm the URL resolves correctly at `${BASE_URL}spaceydelayer/SpaceyDelayer.worklet.js`.

**Step 3b: If WASM connects but outputs silence** — the WASM may be outputting a dry+wet mix internally AND expecting to be in 100% wet path. Check if the worklet has its own internal wet knob and if it's set to 100%.

**Step 4: Practical fix** — ensure the dry signal is never fully cut until WASM is confirmed ready:

```typescript
// In constructor, initialize dryGain to 0.3 minimum until WASM confirms ready
this.dryGain = new Tone.Gain(Math.max(0.3, 1 - this._options.wet));

// On WASM ready:
private onWasmReady() {
  // Now safe to apply true wet value
  this.dryGain.gain.value = 1 - this._options.wet;
  this.wetGain.gain.value = this._options.wet;
}
```

OR: Add a keepalive at `1 - wet` minimum so the effect always passes some dry signal as fallback.

**Step 5: Commit fix**
```bash
git add src/engine/effects/SpaceyDelayerEffect.ts src/engine/effects/RETapeEchoEffect.ts
git commit -m "fix(effects): SpaceyDelayer/RETapeEcho — ensure dry signal fallback until WASM ready at 100% wet"
```

---

## Task 10: Investigate and Fix VinylNoise + Tumult Fade-Out

**Files:**
- Investigate: `src/engine/effects/VinylNoiseEffect.ts`, `TumultEffect.ts`
- Investigate: `src/engine/ToneEngine.ts` (`_notifyNoiseEffectsPlaying`)

**Context:** User says "vinyl noise and tumult just fades out, probably due our earlier fix." These effects have `setPlaying(bool)` that sends `playing: 1/0` to the AudioWorklet. The dry path (original audio) in VinylNoise is always at `dryGain = 1.0` — it should never fade out. The wet (noise) path is controlled by `wet` parameter.

**Step 1: Check `_notifyNoiseEffectsPlaying`** in ToneEngine.ts

Search for this method. It's called after `rebuildMasterEffects`. Verify it sends the correct `playing` state and doesn't accidentally zero the gain.

**Step 2: Check if ToneEngine's gain ramp-down** (for track stop events) is affecting VinylNoise

In ToneEngine, there's a pattern where instruments ramp to `-Infinity` on `releaseAll`. If VinylNoise is being treated as an instrument rather than a static effect, its gain could be ramp-downed and not restored.

**Step 3: Check git diff for recent changes to VinylNoiseEffect or TumultEffect**

```bash
git diff HEAD~3 -- src/engine/effects/VinylNoiseEffect.ts src/engine/effects/TumultEffect.ts
```

**Step 4: Check if the `wet` property is being set incorrectly**

In ToneEngine `updateMasterEffectParams`, the wet path:
```typescript
} else if ('wet' in node && typeof (node as Record<string, unknown>).wet === 'number') {
  (node as Record<string, unknown>).wet = wetValue;
}
```

For VinylNoise, `wet` setter sets `wetGain.gain.value = this._wet`. The `dryGain` is NOT touched. Dry should stay at 1.0.

**Step 5: Check the worklet's response to `playing: 0`**

The VinylNoise worklet (`public/vinylnoise/VinylNoise.worklet.js`) — on `playing: 0`, it likely stops noise generation but should not affect the INPUT signal pass-through. If the worklet is in the signal path (not just a noise adder), stopping "playing" would silence everything.

Verify the worklet's signal routing: ideally it ADDS noise to the signal rather than routing through it.

**Step 6: If playing=false silences the effect input** — fix by ensuring the worklet passes through input unchanged when `playing=false`, only stopping noise generation.

**Step 7: Commit fix**
```bash
git add src/engine/effects/VinylNoiseEffect.ts src/engine/effects/TumultEffect.ts
git commit -m "fix(effects): VinylNoise/Tumult — fix fade-out regression, ensure audio passes through when playing=false"
```

---

## Task 11: Fix WAM UI — WAMTS9 Horizontal Centering

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx` (WAMEffectEditor component, ~line 1240)

**Context:** The WAM TS9 plugin renders a native HTML element via `node.createGui()`. The `scaleToFit()` function applies CSS `transform: scale()` and positions the element inside a container div. The issue is the container doesn't center horizontally.

**Step 1: Find WAMEffectEditor** in `VisualEffectEditors.tsx` (~line 1240)

Find the container div where the WAM GUI element is inserted.

**Step 2: Apply flex centering** to the container

Change the container div style to include:
```typescript
style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
```

OR: In the `scaleToFit()` function, after computing the scale, set the element's CSS:
```javascript
element.style.transformOrigin = 'top center';
element.style.marginLeft = 'auto';
element.style.marginRight = 'auto';
```

**Step 3: Test with WAMTS9** — the UI should center in the effects browser panel.

**Step 4: Commit**
```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "fix(ui): WAM effects — center TS9 GUI horizontally in effects browser"
```

---

## Task 12: Fix WAMQuadraFuzz — Zoom In + Center

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx` (WAMEffectEditor, `scaleToFit()`)

**Context:** QuadraFuzz GUI needs to be zoomed in (scale up slightly, e.g., 1.2-1.4x) AND centered. The `scaleToFit()` function currently scales DOWN to fit. For QuadraFuzz we want to scale UP.

**Step 1: Understand current `scaleToFit()`**

Read the function. It likely computes `scale = containerWidth / guiWidth` and uses `Math.min(1, scale)` to only scale down.

**Step 2: Add per-effect scale override**

Create a map of WAM effect types to preferred scales:
```typescript
const WAM_SCALE_OVERRIDES: Record<string, number> = {
  WAMQuadraFuzz: 1.3,
  WAMBigMuff: 1.0,
  WAMTS9: 1.0,
  WAMVoxAmp: 1.2,
};
```

In `scaleToFit()`, after computing the natural scale, apply the override:
```typescript
const preferredScale = WAM_SCALE_OVERRIDES[effectType] ?? 1.0;
const finalScale = naturalScale * preferredScale;
```

**Step 3: Apply centering** (same as Task 11)

**Step 4: Commit**
```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "fix(ui): WAMQuadraFuzz — zoom in 1.3x and center horizontally"
```

---

## Task 13: Fix VoxAmp — Size Up + Center

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx` (WAMEffectEditor)

**Context:** VoxAmp GUI is too small and not centered. Needs to be scaled up to fill the available height.

**Step 1: Add `WAMVoxAmp: 1.2` to the scale overrides** from Task 12 (do this in Task 12 already, or add here if Task 12 is done separately).

**Step 2: Check the WAMEffectEditor container height**

The effects browser panel has a fixed height. The `scaleToFit()` should scale to fill available height, not just width. Ensure the function considers height:
```typescript
const scaleByWidth = containerWidth / guiWidth;
const scaleByHeight = containerHeight / guiHeight;
const naturalScale = Math.min(scaleByWidth, scaleByHeight);
```

**Step 3: Commit** (can be part of Task 12 commit if done together)

---

## Task 14: Fix TapeSimulator UI — Scale to Fit

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx` (KissOfShameEditor component, ~line 2995)

**Context:** The KissOfShame tape simulator has a filmstrip-style UI that is 703px tall (full-reels view) or 266px (no-reels). The effects browser panel is likely ~400-500px. The UI overflows.

**Step 1: Read KissOfShameEditor** (~line 2995)

Check the current implementation. The editor renders a 703px tall custom UI.

**Step 2: Option A — CSS Scale**

Wrap the KissOfShame UI in a container and apply CSS transform:
```tsx
<div style={{ overflow: 'hidden', height: '100%', position: 'relative' }}>
  <div style={{
    transform: `scale(${SCALE})`,
    transformOrigin: 'top left',
    width: `${100 / SCALE}%`,
    height: `${100 / SCALE}%`,
  }}>
    {/* existing KissOfShame UI */}
  </div>
</div>
```

Where `SCALE = containerHeight / 703` (computed dynamically with a ResizeObserver or hardcoded to 0.6).

**Step 3: Option B — Hide reels by default**

The effect has a "with reels" (703px) and "without reels" (266px) view. Default to the shorter view (266px) which would fit in the effects browser.

Check if there's a `showReels` state or prop, and default it to `false`.

**Step 4: Choose simpler option** — Option B (hide reels by default) is simpler and avoids CSS scaling issues.

**Step 5: Commit**
```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "fix(ui): TapeSimulator — hide reels by default to fit effects browser height"
```

---

## Task 15: Fix SpringReverb Editor UI — Horizontal Centering

**Files:**
- Modify: `src/components/effects/VisualEffectEditors.tsx` (SpringReverbEditor component, ~line 2879)

**Context:** The SpringReverb editor's knob panel is not centered horizontally in the effects browser.

**Step 1: Find SpringReverbEditor** (~line 2879)

Find the root `<div>` of the SpringReverbEditor.

**Step 2: Add centering classes**

Change the outer div from something like `<div className="p-4">` to:
```tsx
<div className="p-4 flex flex-col items-center">
```

or add `mx-auto` to the knob grid container.

**Step 3: Commit** (can batch with other UI fixes)
```bash
git add src/components/effects/VisualEffectEditors.tsx
git commit -m "fix(ui): SpringReverb editor — center knob panel horizontally"
```

---

## Task 16: Fix AutoPanner Weak Response + Improve Phaser Defaults

**Files:**
- Modify: `src/engine/registry/effects/tonejs.ts` (AutoPanner and Phaser entries)
- Check: `src/engine/ToneEngine.ts` (AutoPanner case in diff handler)

### AutoPanner

**Context:** `Tone.AutoPanner` pans the signal L→R with an LFO. Default `depth=1, frequency=1Hz` should produce clear panning effect. But if the editor maps `depth` to a range like 0-0.2 by default, the effect is barely audible.

**Step 1: Check AutoPanner registry defaults**

Find `id: 'AutoPanner'` in `tonejs.ts`. Check `getDefaultParameters()`.

**Step 2: Check the ToneEngine AutoPanner diff handler**

Find `case 'AutoPanner':`. Verify it handles `frequency`, `depth`, AND `type` (the LFO waveform).

**Step 3: Update defaults for stronger effect**

```typescript
getDefaultParameters: () => ({ frequency: 1, depth: 0.8, type: 'sine' }),
```

**Step 4: Verify Tone.AutoPanner.start() is called**

In InstrumentFactory (~line 996), `autopanner.start()` must be called — confirmed from summary. Verify this is in the registry create factory too.

### Phaser

**Step 5: Update Phaser defaults for more dramatic effect**

```typescript
getDefaultParameters: () => ({ frequency: 0.5, octaves: 3, baseFrequency: 1000, Q: 10 }),
```

**Step 6: Commit**
```bash
git add src/engine/registry/effects/tonejs.ts src/engine/ToneEngine.ts
git commit -m "fix(effects): AutoPanner — default depth=0.8, Phaser — add baseFrequency handler + better defaults"
```

---

## Task 17: Fix BigMuff WAM Default Preset

**Files:**
- Investigate: WAM BigMuff API parameters
- Modify: `src/engine/registry/effects/wam.ts` (WAMBigMuff entry)

**Context:** BigMuff currently has no default parameters (`getDefaultParameters: () => ({})`). The WAM plugin loads at its own defaults which may be "cranked" with heavy distortion.

**Step 1: Find WAM BigMuff entry** in `wam.ts`

Check if it has `getDefaultParameters`.

**Step 2: Research BigMuff WAM parameters**

The WAM BigMuff plugin typically has these parameters:
- `sustain` (or `gain`/`distortion`): 0-100 — set to ~40 for moderate distortion
- `tone`: 0-100 — set to ~50
- `volume`: 0-100 — set to ~70

Read the WAM plugin's parameter list. In the WAMEffectEditor, the plugin is loaded and `node.getParameters()` or similar is called. Look in the WAM plugin source if available, or introspect via browser dev tools.

**Step 3: Set sensible defaults**

```typescript
getDefaultParameters: () => ({
  sustain: 40,   // Not cranked
  tone: 50,      // Neutral
  volume: 70,    // Unity-ish
}),
```

**Step 4: Verify these params are applied on create**

In the WAMBigMuff create factory, check if parameters are applied:
```typescript
create: async (c: EffectConfig) => {
  const node = await WAMEffectNode.create('WAMBigMuff', audioContext);
  for (const [key, value] of Object.entries(c.parameters)) {
    node.setParameter(key, Number(value));
  }
  return node;
},
```

**Step 5: Commit**
```bash
git add src/engine/registry/effects/wam.ts
git commit -m "fix(effects): BigMuff WAM — set sensible default preset (sustain=40, tone=50, volume=70)"
```

---

## Task 18: Improve Neural Effect Differentiation

**Files:**
- Modify: `src/engine/registry/effects/neural.ts` (or individual model descriptors)
- Modify: `src/engine/effects/NeuralParameterMapper.ts`
- Modify: `src/constants/unifiedEffects.ts` (neural model list + defaults)

**Context:** All ~25 neural amp/pedal models share the same processing chain: `drive/gain → GuitarML condition`. At default `condition=0.5`, all models produce similar mid-gain distortion. Knobs don't work because ToneEngine has no `case 'Neural':` handler (fixed in Task 3). But even after Task 3 is fixed, differentiation needs improvement.

**Step 1: Verify Task 3 is complete** — neural knobs now route to `NeuralEffectWrapper.setParameter()`.

**Step 2: Check `unifiedEffects.ts`** for the neural model list

Find `GUITARML_MODEL_REGISTRY` or equivalent. Each model entry should have:
- `name`: display name
- `modelIndex`: integer index into WASM model list
- Optionally: `defaultDrive`, `defaultGain`, `suggestedBass`, `suggestedTreble`

**Step 3: Add per-model default parameters to the neural registry entry**

In `neural.ts`, the `getDefaultParameters` returns `{}`. Update it to return model-specific defaults based on the `neuralModelIndex`:

```typescript
getDefaultParameters: (modelIndex?: number) => {
  const MODEL_DEFAULTS: Record<number, Record<string, number>> = {
    0:  { drive: 45, gain: 50, bass: 50, treble: 55 },  // TS808
    1:  { drive: 60, gain: 55, bass: 45, treble: 50 },  // DOD 250
    2:  { drive: 50, gain: 50, bass: 50, treble: 50 },  // BluesBreaker
    3:  { drive: 55, gain: 50, bass: 50, treble: 60 },  // Klon
    // ... etc for all models
  };
  return MODEL_DEFAULTS[modelIndex ?? 0] ?? { drive: 50, gain: 50, bass: 50, treble: 50 };
},
```

Note: The `EffectDescriptor.getDefaultParameters` signature may not accept `modelIndex`. If not, add a `getDefaultParametersForModel(index: number)` method, or store defaults in `unifiedEffects.ts` alongside the model registry.

**Step 4: Apply defaults when neural effect is added to chain**

When a user selects a neural model in the effects browser and adds it to the master chain, the `EffectConfig` is created. The default parameters need to come from the model-specific defaults. Trace the code path for how `neuralModelIndex` gets set and where `getDefaultParameters` is called.

**Step 5: Verify EQ knobs work** (after Task 3 fix)

In `NeuralEffectWrapper.setParameter`:
- `bass`/`mid`/`treble` → `eq3.low/mid/high.value`
- `presence` → `presenceFilter.gain.value`
- `drive`/`gain` → `guitarML.setCondition(val/100)`

**Step 6: Commit**
```bash
git add src/engine/registry/effects/neural.ts src/constants/unifiedEffects.ts
git commit -m "fix(effects): neural amps — per-model default parameters for better out-of-box differentiation"
```

---

## Task 19: Fix MoogFilter Resonance Double-Division Bug

**Files:**
- Modify: `src/engine/ToneEngine.ts` (MoogFilter case, ~line 5213)
- Check: `src/engine/registry/effects/wasm.ts` (MoogFilter create)

**Context:** In ToneEngine: `node.setResonance(Number(changed.resonance) / 100)`. In the registry create: `resonance: (Number(p.resonance) || 10) / 100`. If the UI knob sends values in the 0-100 range (as stored in `parameters`), ToneEngine divides by 100 → correct (0-1 to WASM). But the registry creates with `resonance / 100` already applied. This might cause a double-division on create.

**Step 1: Check the MoogFilter knob range in the editor**

Find the `MoogFilterEditor` in `VisualEffectEditors.tsx`. Check what range the resonance knob uses (0-100 or 0-1).

**Step 2: If resonance knob is 0-100:**
- Registry `create` divides by 100: creates WASM with `resonance=0.1` (for default 10) ✓
- ToneEngine `setResonance(changed.resonance / 100)`: if changed.resonance is 50, sends 0.5 ✓
- Consistent! No bug.

**Step 3: If resonance knob is 0-1:**
- Registry creates with `resonance = 0.1/100 = 0.001` ← WRONG
- ToneEngine sends `0.5/100 = 0.005` ← WRONG
- Fix: Remove the `/100` from both places

**Step 4: Verify and fix**

If it's 0-1: change registry to `resonance: Number(p.resonance) || 0.1` and ToneEngine to `node.setResonance(Number(changed.resonance))`.

**Step 5: Commit**
```bash
git add src/engine/ToneEngine.ts src/engine/registry/effects/wasm.ts
git commit -m "fix(effects): MoogFilter — correct resonance range handling (0-100 UI → 0-1 WASM)"
```

---

## Quick-Win Batch Commit Opportunity

After Tasks 1, 2, 3 are done (all in ToneEngine.ts), they can be committed together as a single "fix knob routing" commit if preferred, instead of separate commits.

---

## Testing Checklist

After completing all tasks:

- [ ] DubFilter: Move cutoff knob → filter frequency changes audibly
- [ ] Phaser: Move baseFrequency knob → phaser center frequency changes
- [ ] Neural effects: Move drive knob → distortion amount changes
- [ ] SpaceEcho: Enable BPM sync → delay syncs to tempo immediately
- [ ] SpaceEcho: Default is mode 8 with bass/treble boost
- [ ] Reverb: Default is airier (decay 8.6, preDelay 0.4)
- [ ] JCReverb: Mix at 100% → reverb is loud, not silent
- [ ] StereoWidener: Width at 100% → stereo but not silent
- [ ] SpaceyDelayer/RETapeEcho: Mix at 100% → delay effect audible
- [ ] VinylNoise: Audio doesn't fade out during playback
- [ ] Tumult: Audio doesn't fade out during playback
- [ ] MVerb: All 9 knobs change reverb character
- [ ] Leslie: Speed switch + all knobs affect the rotary simulation
- [ ] SpringReverb: Decay/damping/tension knobs work
- [ ] MoogFilter: Cutoff + resonance knobs work
- [ ] WAMTS9: GUI is horizontally centered
- [ ] WAMQuadraFuzz: GUI is zoomed in and centered
- [ ] VoxAmp: GUI fits the panel height
- [ ] TapeSimulator: UI fits the effects browser (no overflow)
- [ ] SpringReverb editor: Knobs are centered horizontally
- [ ] AutoPanner: Audible stereo panning at default depth
- [ ] BigMuff: Moderate distortion by default (not cranked)
- [ ] All neural models: Audibly different from each other at default settings
