# ModPlug Stereo Separation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the OpenMPT/ModPlug stereo separation algorithm as a user-selectable alternative to the existing PT2-clone algorithm, defaulting to 0% (mono).

**Architecture:** A new `StereoSeparationNode` class wraps the OpenMPT mid-side decomposition formula using Web Audio ChannelSplitter/GainNodes/ChannelMerger — mathematically identical to `Sndmix.cpp::ApplyStereoSeparation`. It is inserted permanently in the TrackerReplayer audio chain between `masterGain` and the downstream destination; in PT2 mode it is an identity (factor=1), and per-channel pan scaling handles the narrowing. In ModPlug mode the node is active and per-channel pans are not scaled.

**Tech Stack:** TypeScript, Tone.js, Web Audio API (ChannelSplitterNode, ChannelMergerNode, GainNode), Zustand + Immer (settings store), React (SettingsModal).

---

## Background: The Two Algorithms

### PT2-Clone (existing)
Scales each channel's pan *position* toward center before mixing:
```
actual_pan = basePan × (stereoSeparation / 100)
```
Range: 0–100%. Default for MOD: 20%. Default for XM/IT/S3M: 100%.

### ModPlug / OpenMPT (new)
Applies mid-side decomposition to the **post-mix stereo output** (exact algorithm from `OpenMPT/soundlib/Sndmix.cpp`):
```
mid    = (L + R) / 2
side   = (L − R) / 2
side  *= (separation / 128)        // 128 = internal identity value
L_out  = mid + side
R_out  = mid − side
```
User-facing range: **0–200%** (matching libopenmpt public API):
- 0%   → mono (side = 0)
- 100% → normal stereo (identity, no change)
- 200% → enhanced stereo width

Implemented via a gain matrix (mathematically identical to the M-S formula):
```
factor = percent / 100            // 0.0 – 2.0
gainLL = gainRR = (1 + factor) / 2
gainLR = gainRL = (1 − factor) / 2
```

---

## Task 1: Create `StereoSeparationNode`

**Files:**
- Create: `src/engine/StereoSeparationNode.ts`
- Test: `src/engine/__tests__/StereoSeparationNode.test.ts`

### Step 1: Write the failing test

```typescript
// src/engine/__tests__/StereoSeparationNode.test.ts
import { describe, it, expect } from 'vitest';
import { computeStereoGains } from '../StereoSeparationNode';

describe('computeStereoGains', () => {
  it('0% → mono (gainLL=gainRR=0.5, gainLR=gainRL=0.5)', () => {
    const g = computeStereoGains(0);
    expect(g.gainLL).toBeCloseTo(0.5);
    expect(g.gainRR).toBeCloseTo(0.5);
    expect(g.gainLR).toBeCloseTo(0.5);
    expect(g.gainRL).toBeCloseTo(0.5);
  });

  it('100% → identity (gainLL=gainRR=1, gainLR=gainRL=0)', () => {
    const g = computeStereoGains(100);
    expect(g.gainLL).toBeCloseTo(1);
    expect(g.gainRR).toBeCloseTo(1);
    expect(g.gainLR).toBeCloseTo(0);
    expect(g.gainRL).toBeCloseTo(0);
  });

  it('200% → enhanced (gainLL=gainRR=1.5, gainLR=gainRL=-0.5)', () => {
    const g = computeStereoGains(200);
    expect(g.gainLL).toBeCloseTo(1.5);
    expect(g.gainRR).toBeCloseTo(1.5);
    expect(g.gainLR).toBeCloseTo(-0.5);
    expect(g.gainRL).toBeCloseTo(-0.5);
  });

  it('clamps values below 0 to 0%', () => {
    const g = computeStereoGains(-50);
    expect(g.gainLL).toBeCloseTo(0.5);
  });

  it('clamps values above 200 to 200%', () => {
    const g = computeStereoGains(300);
    expect(g.gainLL).toBeCloseTo(1.5);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run src/engine/__tests__/StereoSeparationNode.test.ts
```
Expected: FAIL — `computeStereoGains` not found.

### Step 3: Implement `StereoSeparationNode`

```typescript
// src/engine/StereoSeparationNode.ts
/**
 * StereoSeparationNode — OpenMPT/ModPlug stereo separation algorithm.
 *
 * Implements the exact mid-side decomposition from Sndmix.cpp::ApplyStereoSeparation.
 * Inserted into the TrackerReplayer audio chain between masterGain and the destination.
 *
 * percent: 0-200 (libopenmpt public API scale)
 *   0%   = mono
 *   100% = normal stereo (identity)
 *   200% = enhanced stereo width
 */

import * as Tone from 'tone';

export interface StereoGains {
  gainLL: number; // Left  → Left
  gainRR: number; // Right → Right
  gainLR: number; // Left  → Right (crossfeed)
  gainRL: number; // Right → Left  (crossfeed)
}

/**
 * Pure function — computes the gain matrix for a given separation percentage.
 * Exported for unit testing; not dependent on Web Audio.
 */
export function computeStereoGains(percent: number): StereoGains {
  const f = Math.max(0, Math.min(200, percent)) / 100; // 0.0–2.0; 1.0 = identity
  return {
    gainLL: (1 + f) / 2,
    gainRR: (1 + f) / 2,
    gainLR: (1 - f) / 2,
    gainRL: (1 - f) / 2,
  };
}

export class StereoSeparationNode {
  /** Connect upstream Tone.js nodes here (replaces direct masterGain → dest connection). */
  readonly inputTone: Tone.Gain;
  /** Connect this to the downstream destination Tone.js node. */
  readonly outputTone: Tone.Gain;

  private readonly splitter: ChannelSplitterNode;
  private readonly merger: ChannelMergerNode;
  private readonly gainLL: GainNode;
  private readonly gainLR: GainNode;
  private readonly gainRL: GainNode;
  private readonly gainRR: GainNode;

  constructor() {
    const ctx = Tone.getContext().rawContext;

    this.inputTone  = new Tone.Gain(1);
    this.outputTone = new Tone.Gain(1);

    this.splitter = ctx.createChannelSplitter(2);
    this.merger   = ctx.createChannelMerger(2);
    this.gainLL   = ctx.createGain();
    this.gainLR   = ctx.createGain();
    this.gainRL   = ctx.createGain();
    this.gainRR   = ctx.createGain();

    // Wire the graph:
    // inputTone → splitter → [gain matrix] → merger → outputTone
    this.inputTone.connect(this.splitter as unknown as Tone.ToneAudioNode);

    // L channel (splitter output 0) → LL and LR gains
    this.splitter.connect(this.gainLL, 0);
    this.splitter.connect(this.gainLR, 0);
    // R channel (splitter output 1) → RL and RR gains
    this.splitter.connect(this.gainRL, 1);
    this.splitter.connect(this.gainRR, 1);

    // Merge into L output (merger input 0): LL + RL
    this.gainLL.connect(this.merger, 0, 0);
    this.gainRL.connect(this.merger, 0, 0);
    // Merge into R output (merger input 1): LR + RR
    this.gainLR.connect(this.merger, 0, 1);
    this.gainRR.connect(this.merger, 0, 1);

    // merger → outputTone's underlying AudioNode
    this.merger.connect(this.outputTone.input as AudioNode);

    // Start at identity (100% = normal stereo)
    this.setSeparation(100);
  }

  /**
   * Set stereo separation. percent: 0–200 (OpenMPT libopenmpt scale).
   * 0 = mono, 100 = identity, 200 = enhanced width.
   */
  setSeparation(percent: number): void {
    const g = computeStereoGains(percent);
    this.gainLL.gain.value = g.gainLL;
    this.gainRR.gain.value = g.gainRR;
    this.gainLR.gain.value = g.gainLR;
    this.gainRL.gain.value = g.gainRL;
  }

  dispose(): void {
    this.inputTone.dispose();
    this.splitter.disconnect();
    this.gainLL.disconnect();
    this.gainLR.disconnect();
    this.gainRL.disconnect();
    this.gainRR.disconnect();
    this.merger.disconnect();
    this.outputTone.dispose();
  }
}
```

### Step 4: Run tests to verify they pass

```bash
npx vitest run src/engine/__tests__/StereoSeparationNode.test.ts
```
Expected: 5 passing.

### Step 5: Commit

```bash
git add src/engine/StereoSeparationNode.ts src/engine/__tests__/StereoSeparationNode.test.ts
git commit -m "feat(audio): add StereoSeparationNode (OpenMPT M-S algorithm)"
```

---

## Task 2: Update Settings Store

**Files:**
- Modify: `src/stores/useSettingsStore.ts`

The store is at `src/stores/useSettingsStore.ts`. It uses Zustand + Immer + `persist`.

### Step 1: Add new state fields and actions to the interface (lines 9–41)

Add after the existing `stereoSeparation` line (line 18):
```typescript
stereoSeparationMode: 'pt2' | 'modplug';
modplugSeparation: number;    // 0–200% (OpenMPT scale; 0=mono, 100=normal, 200=enhanced)
```

Add after `setStereoSeparation` action (line 36):
```typescript
setStereoSeparationMode: (mode: 'pt2' | 'modplug') => void;
setModplugSeparation: (percent: number) => void;
```

### Step 2: Add initial state values (after line 52)

After `stereoSeparation: 20,` add:
```typescript
stereoSeparationMode: 'pt2' as const,
modplugSeparation: 0,         // Default: 0% = mono
```

### Step 3: Add action implementations (after `setStereoSeparation` action, ~line 87)

```typescript
setStereoSeparationMode: (stereoSeparationMode) =>
  set((state) => {
    state.stereoSeparationMode = stereoSeparationMode;
  }),

setModplugSeparation: (modplugSeparation) =>
  set((state) => {
    state.modplugSeparation = Math.max(0, Math.min(200, modplugSeparation));
  }),
```

### Step 4: Add new fields to `partialize` (lines 111–122)

Add after `stereoSeparation: state.stereoSeparation,`:
```typescript
stereoSeparationMode: state.stereoSeparationMode,
modplugSeparation: state.modplugSeparation,
```

### Step 5: Type-check

```bash
npx tsc -b --noEmit 2>&1 | grep -i "settingsStore\|stereoSeparation"
```
Expected: no errors.

### Step 6: Commit

```bash
git add src/stores/useSettingsStore.ts
git commit -m "feat(settings): add stereoSeparationMode and modplugSeparation fields"
```

---

## Task 3: Update TrackerReplayer

**Files:**
- Modify: `src/engine/TrackerReplayer.ts`

Key lines to know:
- Line 411: `private masterGain: Tone.Gain;` — field declarations area
- Line 469–477: stereoSeparation field and comment block
- Line 477: `private stereoSeparation = 100;`
- Line 486–497: constructor — where masterGain is created and connected
- Line 655–691: `setStereoSeparation`, `getStereoSeparation`, `applyChannelPan`, `applyPanEffect`
- Line 674–677: `applyChannelPan` body
- Line 685–691: `applyPanEffect` body
- Line 731: channel dispose loop
- Line 744: format-based separation default
- Line 812–819: `createChannel` — where panNode is created and connected
- Line 4107: `ch.panNode.dispose()` in destroy
- Line 4112: `this.masterGain.dispose()` in destroy

### Step 1: Add the import at the top of the file

Find the existing engine imports (near top of file). Add:
```typescript
import { StereoSeparationNode } from './StereoSeparationNode';
```

### Step 2: Add new private fields (near line 411, alongside `masterGain`)

```typescript
private readonly separationNode: StereoSeparationNode;
private stereoMode: 'pt2' | 'modplug' = 'pt2';
private modplugSeparation = 0;
```

### Step 3: Update the constructor (lines 486–497) to insert the separation node

Replace:
```typescript
this.masterGain = new Tone.Gain(1);
if (outputNode) {
  this.masterGain.connect(outputNode);
  this.isDJDeck = true;
} else {
  const engine = getToneEngine();
  this.masterGain.connect(engine.masterInput);
}
```

With:
```typescript
this.masterGain = new Tone.Gain(1);
this.separationNode = new StereoSeparationNode();
// Chain: masterGain → separationNode → destination
this.masterGain.connect(this.separationNode.inputTone);
if (outputNode) {
  this.separationNode.outputTone.connect(outputNode);
  this.isDJDeck = true;
} else {
  const engine = getToneEngine();
  this.separationNode.outputTone.connect(engine.masterInput);
}
```

### Step 4: Update `setStereoSeparation` (line 658)

The existing method handles PT2 mode. Add a guard so it only applies in PT2 mode:

Replace the body of `setStereoSeparation`:
```typescript
setStereoSeparation(percent: number): void {
  this.stereoSeparation = Math.max(0, Math.min(100, percent));
  if (this.stereoMode === 'pt2') {
    for (const ch of this.channels) {
      this.applyChannelPan(ch);
    }
  }
}
```

### Step 5: Add new methods after `getStereoSeparation` (~line 668)

```typescript
/**
 * Switch between PT2-clone and ModPlug stereo separation algorithms.
 * PT2:    per-channel pan positions are scaled toward center.
 * ModPlug: mid-side decomposition applied post-mix (OpenMPT algorithm).
 */
setStereoSeparationMode(mode: 'pt2' | 'modplug'): void {
  this.stereoMode = mode;
  if (mode === 'pt2') {
    // Bypass the post-mix node (identity) and restore per-channel pan scaling
    this.separationNode.setSeparation(100);
    for (const ch of this.channels) {
      this.applyChannelPan(ch);
    }
  } else {
    // Activate post-mix node; set all channels to full (unscaled) basePan
    this.separationNode.setSeparation(this.modplugSeparation);
    for (const ch of this.channels) {
      ch.panNode.pan.rampTo(ch.basePan, 0.02);
    }
  }
}

/**
 * Set ModPlug separation percentage (0–200).
 * Only has effect when stereoMode === 'modplug'.
 */
setModplugSeparation(percent: number): void {
  this.modplugSeparation = Math.max(0, Math.min(200, percent));
  if (this.stereoMode === 'modplug') {
    this.separationNode.setSeparation(this.modplugSeparation);
  }
}

getModplugSeparation(): number {
  return this.modplugSeparation;
}

getStereoSeparationMode(): 'pt2' | 'modplug' {
  return this.stereoMode;
}
```

### Step 6: Update `applyChannelPan` to respect mode (line 674)

Replace:
```typescript
private applyChannelPan(ch: ChannelState): void {
  const factor = this.stereoSeparation / 100;
  const actualPan = ch.basePan * factor;
  ch.panNode.pan.rampTo(actualPan, 0.02);
}
```

With:
```typescript
private applyChannelPan(ch: ChannelState): void {
  const actualPan = this.stereoMode === 'pt2'
    ? ch.basePan * (this.stereoSeparation / 100)
    : ch.basePan;
  ch.panNode.pan.rampTo(actualPan, 0.02);
}
```

### Step 7: Update `applyPanEffect` to respect mode (line 685)

Replace:
```typescript
private applyPanEffect(ch: ChannelState, pan255: number, time: number): void {
  const normalizedPan = (pan255 - 128) / 128;
  ch.basePan = normalizedPan;
  const factor = this.stereoSeparation / 100;
  const actualPan = normalizedPan * factor;
  ch.panNode.pan.setValueAtTime(actualPan, time);
}
```

With:
```typescript
private applyPanEffect(ch: ChannelState, pan255: number, time: number): void {
  const normalizedPan = (pan255 - 128) / 128;
  ch.basePan = normalizedPan;
  const actualPan = this.stereoMode === 'pt2'
    ? normalizedPan * (this.stereoSeparation / 100)
    : normalizedPan;
  ch.panNode.pan.setValueAtTime(actualPan, time);
}
```

### Step 8: Update `createChannel` to respect mode (lines 812–814)

Replace:
```typescript
// Apply stereo separation: actual pan = basePan * (separation / 100)
const factor = this.stereoSeparation / 100;
const panValue = basePan * factor;
```

With:
```typescript
const panValue = this.stereoMode === 'pt2'
  ? basePan * (this.stereoSeparation / 100)
  : basePan;
```

### Step 9: Dispose separation node in `destroy()` (near line 4112)

Find `this.masterGain.dispose();` and add before it:
```typescript
this.separationNode.dispose();
```

### Step 10: Type-check

```bash
npx tsc -b --noEmit 2>&1 | grep -i "TrackerReplayer\|StereoSeparation"
```
Expected: no errors.

### Step 11: Commit

```bash
git add src/engine/TrackerReplayer.ts src/engine/StereoSeparationNode.ts
git commit -m "feat(engine): insert StereoSeparationNode into audio chain; add ModPlug mode"
```

---

## Task 4: Update SettingsModal UI

**Files:**
- Modify: `src/components/dialogs/SettingsModal.tsx`

The existing Stereo Separation section spans lines 446–477. It imports `stereoSeparation` and `setStereoSeparation` from the settings store (lines 52–53).

### Step 1: Update store subscriptions at the top of the component

Find the block that reads `stereoSeparation` and `setStereoSeparation` from the store. Add alongside them:
```typescript
const stereoSeparationMode = useSettingsStore(s => s.stereoSeparationMode);
const modplugSeparation    = useSettingsStore(s => s.modplugSeparation);
const setStereoSeparationMode = useSettingsStore(s => s.setStereoSeparationMode);
const setModplugSeparation    = useSettingsStore(s => s.setModplugSeparation);
```

### Step 2: Add a helper to apply settings to all replayers

The existing code uses an inline `try/catch` with `require()` for DJ engine. Add a helper function inside the component (before `return`):

```typescript
const applyModeToReplayers = (mode: 'pt2' | 'modplug') => {
  getTrackerReplayer().setStereoSeparationMode(mode);
  try {
    const { getDJEngineIfActive } = require('@engine/dj/DJEngine');
    const djEngine = getDJEngineIfActive();
    if (djEngine) {
      djEngine.deckA.replayer.setStereoSeparationMode(mode);
      djEngine.deckB.replayer.setStereoSeparationMode(mode);
    }
  } catch { /* DJ engine not initialized */ }
};

const applyModplugSeparationToReplayers = (percent: number) => {
  getTrackerReplayer().setModplugSeparation(percent);
  try {
    const { getDJEngineIfActive } = require('@engine/dj/DJEngine');
    const djEngine = getDJEngineIfActive();
    if (djEngine) {
      djEngine.deckA.replayer.setModplugSeparation(percent);
      djEngine.deckB.replayer.setModplugSeparation(percent);
    }
  } catch { /* DJ engine not initialized */ }
};
```

### Step 3: Replace the Stereo Separation JSX block (lines 446–477)

Replace the entire `{/* Stereo Separation */}` block with:

```tsx
{/* Stereo Separation */}
<div className="flex flex-col gap-2">
  <div className="flex items-center justify-between">
    <label className="text-ft2-text text-xs font-mono">Stereo Separation:</label>
    {/* Mode toggle */}
    <div className="flex gap-1">
      {(['pt2', 'modplug'] as const).map((m) => (
        <button
          key={m}
          onClick={() => {
            setStereoSeparationMode(m);
            applyModeToReplayers(m);
          }}
          className={[
            'text-[9px] font-mono px-2 py-0.5 rounded border transition-colors',
            stereoSeparationMode === m
              ? 'bg-ft2-cursor border-ft2-cursor text-black'
              : 'bg-transparent border-ft2-border text-ft2-textDim hover:border-ft2-text',
          ].join(' ')}
        >
          {m === 'pt2' ? 'PT2-Clone' : 'ModPlug'}
        </button>
      ))}
    </div>
  </div>

  {stereoSeparationMode === 'pt2' ? (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 20% Amiga · 100% full</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={stereoSeparation}
          onChange={(e) => {
            const v = Number(e.target.value);
            setStereoSeparation(v);
            getTrackerReplayer().setStereoSeparation(v);
            try {
              const { getDJEngineIfActive } = require('@engine/dj/DJEngine');
              const djEngine = getDJEngineIfActive();
              if (djEngine) {
                djEngine.deckA.replayer.setStereoSeparation(v);
                djEngine.deckB.replayer.setStereoSeparation(v);
              }
            } catch { /* DJ engine not initialized */ }
          }}
          className="w-20 accent-ft2-cursor"
        />
        <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{stereoSeparation}%</span>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-ft2-textDim font-mono">0% mono · 100% normal · 200% wide</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={modplugSeparation}
          onChange={(e) => {
            const v = Number(e.target.value);
            setModplugSeparation(v);
            applyModplugSeparationToReplayers(v);
          }}
          className="w-20 accent-ft2-cursor"
        />
        <span className="text-ft2-text text-[10px] font-mono w-8 text-right">{modplugSeparation}%</span>
      </div>
    </div>
  )}
</div>
```

### Step 4: Type-check

```bash
npx tsc -b --noEmit 2>&1 | grep -i "SettingsModal\|stereoSeparation"
```
Expected: no errors.

### Step 5: Run all tests

```bash
npm test
```
Expected: all tests pass (including the new StereoSeparationNode tests).

### Step 6: Manual verification

1. Open Settings → find "Stereo Separation"
2. **PT2 mode**: slider shows 0–100%, behaviour unchanged from before
3. Switch to **ModPlug**: slider shows 0–200%, default is 0% (mono — all channels centered)
4. Drag to 100%: sound should be identical to original stereo signal
5. Drag to 200%: stereo image is wider than original
6. Load a MOD file with LRRL panning (e.g. any 4-channel MOD) — at 0% ModPlug the kick/snare are centred; at 100% they are at their original hard-panned positions
7. Switch back to PT2: slider reverts to its own value, per-channel pan scaling resumes
8. Check DJ decks (if active): both decks respond to mode/separation changes

### Step 7: Commit

```bash
git add src/components/dialogs/SettingsModal.tsx
git commit -m "feat(ui): add ModPlug stereo separation mode toggle and slider to Settings"
```

---

## Verification Summary

| Check | Expected |
|---|---|
| `computeStereoGains(0)` | gainLL=gainRR=0.5, gainLR=gainRL=0.5 |
| `computeStereoGains(100)` | gainLL=gainRR=1, gainLR=gainRL=0 (identity) |
| `computeStereoGains(200)` | gainLL=gainRR=1.5, gainLR=gainRL=-0.5 |
| PT2 mode slider | 0–100%, per-channel pans scale as before |
| ModPlug mode default | 0% (mono) |
| ModPlug 100% | Sounds identical to PT2 at 100% |
| TypeScript | `npx tsc -b --noEmit` → 0 errors in modified files |
| Test suite | `npm test` → all 1252+ tests pass |
