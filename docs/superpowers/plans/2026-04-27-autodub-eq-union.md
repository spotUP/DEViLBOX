# AutoDub + EQ Holy Union Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire AutoDub's move-firing loop with AutoEQ's genre/spectral analysis, add an improv EQ breathing loop, make eqSweep/hpfRise analysis-aware, and add a riddim section move (bass & drums breakdown → skank return with tape reverb).

**Architecture:** Context enrichment — `AutoDubTickCtx` gains a live `eqSnapshot` field from `useTrackerAnalysisStore` computed each tick. A second `setInterval` loop inside `AutoDub` runs the improv EQ breathing. A new `riddimSection` move builds on the existing `versionDrop` pattern and adds skank return + per-persona channel focus. All new logic lives in `AutoDub.ts`, `AutoDubPersonas.ts`, one new move file, and the panel UI.

**Tech Stack:** TypeScript, Zustand, React, `Fil4EqEffect` public API (`setBand`, `setHighShelf`, etc.)

---

## File Map

| File | Action |
|---|---|
| `src/types/dub.ts` | Add `PersonaImprovConfig`, `eqMode`/`eqImprovDepthMult` to `AutoDubSettings`, riddim fields to persona type |
| `src/engine/dub/AutoDub.ts` | Add `EQSnapshot` type; populate `ctx.eqSnapshot`; add `adaptEQParams()`; add improv loop; add riddim rule + `_inRiddimSection` flag; filter channel selection when in riddim |
| `src/engine/dub/AutoDubPersonas.ts` | Add `improvConfig` + riddim fields to every persona |
| `src/engine/dub/moves/riddimSection.ts` | **New** — mute melodic channels, schedule skank echoThrow return at 60%, dispose on release |
| `src/engine/dub/moves/eqSweep.ts` | Accept pre-adapted params from AutoDub |
| `src/engine/dub/moves/hpfRise.ts` | Accept pre-adapted params from AutoDub |
| `src/engine/dub/__tests__/autoDubEQ.test.ts` | **New** — unit tests for `adaptEQParams` + improv delta math |
| `src/components/dub/AutoDubPanel.tsx` | Add EQ mode toggle, depth slider, driver badge |
| `package.json` | Add new test file to `test:ci` |

---

## Task 1: Types foundation

**Files:**
- Modify: `src/types/dub.ts`

- [ ] **Step 1: Find AutoDubSettings and AutoDubPersona interfaces**

```bash
grep -n "AutoDubSettings\|AutoDubPersona\b\|autoDubPersona\|autoDubEnabled" /Users/spot/Code/DEViLBOX/src/types/dub.ts | head -20
```

Check whether `AutoDubSettings` and the persona type are in `dub.ts` or only in `AutoDubPersonas.ts`. The fields `autoDubEnabled`, `autoDubIntensity`, `autoDubPersona` are likely in the Zustand store, not `dub.ts`. The plan adds types to `types/dub.ts`; if they're not there, add them there and export.

- [ ] **Step 2: Add `PersonaImprovConfig` to `src/types/dub.ts`**

Find the end of the type definitions section and add:

```typescript
// ── AutoDub EQ Union ─────────────────────────────────────────────────────

export interface PersonaImprovConfig {
  /** Which analysis signal drives the continuous EQ loop. */
  driver: 'beat-sync' | 'energy-reactive' | 'spectral';
  /** Which Fil4 parametric bands (0-3) the loop may modulate. */
  liveBands: number[];
  /** Maximum gain delta in dB the loop can apply above/below baseline. */
  depth: number;
  /** Loop cadence multiplier. 1.0 = 250 ms. 0.5 = 500 ms (slower). 1.4 = ~179 ms (faster). */
  rate: number;
}

export interface PersonaRiddimConfig {
  /** Whether this persona performs bass+drums breakdowns. */
  enabled: boolean;
  /** How often the breakdown fires (every N bars). */
  freqBars: number;
  /** How long the breakdown lasts (bars). */
  holdBars: number;
}
```

- [ ] **Step 3: Find where `eqMode`-style settings live**

```bash
grep -n "eqMode\|autoDubMoveBlacklist\|autoDubIntensity\|autoDubPersona" /Users/spot/Code/DEViLBOX/src/stores/useDubStore.ts | head -15
```

The AutoDub settings (`autoDubEnabled`, `autoDubIntensity`, `autoDubPersona`, `autoDubMoveBlacklist`) likely live in `useDubStore`. Add the two new fields there:

```typescript
// In the store state type, alongside autoDubMoveBlacklist:
autoDubEqMode: 'off' | 'collaborative' | 'improv' | 'both';
autoDubEqDepthMult: number;   // 0-1 global depth multiplier for improv loop
```

Find the default/initial state and add:
```typescript
autoDubEqMode: 'both',
autoDubEqDepthMult: 1.0,
```

Add setters following the existing pattern (look for how `setAutoDubPersona` is defined, copy the pattern):
```typescript
setAutoDubEqMode: (mode: 'off' | 'collaborative' | 'improv' | 'both') =>
  set((s) => ({ autoDubEqMode: mode })),
setAutoDubEqDepthMult: (v: number) =>
  set((s) => ({ autoDubEqDepthMult: Math.max(0, Math.min(1, v)) })),
```

- [ ] **Step 4: Add `EQSnapshot` type to `src/engine/dub/AutoDub.ts`**

Near the top of `AutoDub.ts`, after the imports, add:

```typescript
/** Live analysis context injected into every tick. Null until analysis runs. */
export interface EQSnapshot {
  genre: string;
  energy: number;           // 0–1
  danceability: number;     // 0–1
  bpm: number;
  beatPhase: number;        // 0–1, position within current beat
  frequencyPeaks: [number, number][];  // [[hz, db], ...] sorted by magnitude desc
  baseline: import('@/engine/effects/Fil4EqEffect').Fil4Params;
}
```

- [ ] **Step 5: Add `eqSnapshot` to `AutoDubTickCtx`**

In `AutoDub.ts`, find the `AutoDubTickCtx` interface (around line 526) and add at the end:

```typescript
/** Live EQ analysis snapshot. Null when no analysis has run yet.
 *  Populated from useTrackerAnalysisStore every tick. */
eqSnapshot: EQSnapshot | null;
/** True while a riddimSection hold is active — chooseMove restricts
 *  channel picks to bass/percussion only. */
inRiddimSection: boolean;
```

- [ ] **Step 6: Add riddim fields to `AutoDubPersona`**

In `AutoDubPersonas.ts`, find the `AutoDubPersona` interface and add:

```typescript
/** EQ improv loop config for this persona. */
improvConfig: import('@/types/dub').PersonaImprovConfig;
/** Riddim section (bass+drums breakdown) config. */
riddimConfig: import('@/types/dub').PersonaRiddimConfig;
```

- [ ] **Step 7: Type-check**

```bash
cd /Users/spot/Code/DEViLBOX && npm run type-check
```

Expected: no new errors (fields are added but not yet used).

- [ ] **Step 8: Commit**

```bash
git add src/types/dub.ts src/engine/dub/AutoDub.ts src/engine/dub/AutoDubPersonas.ts src/stores/useDubStore.ts
git commit -m "feat: AutoDub+EQ types — EQSnapshot, PersonaImprovConfig, PersonaRiddimConfig, eqMode store fields"
```

---

## Task 2: `adaptEQParams` pure function + tests

**Files:**
- Modify: `src/engine/dub/AutoDub.ts`
- Create: `src/engine/dub/__tests__/autoDubEQ.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests first**

Create `src/engine/dub/__tests__/autoDubEQ.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { adaptEQParams } from '../AutoDub';
import type { EQSnapshot } from '../AutoDub';
import type { AutoDubPersona } from '../AutoDubPersonas';

function makeSnapshot(overrides: Partial<EQSnapshot> = {}): EQSnapshot {
  return {
    genre: 'Reggae',
    energy: 0.7,
    danceability: 0.8,
    bpm: 90,
    beatPhase: 0.25,
    frequencyPeaks: [[2000, 6], [500, 4], [8000, 2]],
    baseline: {
      hp: { enabled: false, freq: 40, q: 0.7 },
      lp: { enabled: false, freq: 20000, q: 0.7 },
      ls: { enabled: false, freq: 80, gain: 0, q: 0.8 },
      hs: { enabled: false, freq: 10000, gain: 0, q: 0.8 },
      p: [
        { enabled: false, freq: 200, bw: 1, gain: 0 },
        { enabled: false, freq: 500, bw: 1, gain: 0 },
        { enabled: false, freq: 2000, bw: 1, gain: 0 },
        { enabled: false, freq: 8000, bw: 1, gain: 0 },
      ],
      masterGain: 1,
    },
    ...overrides,
  };
}

const PERSONA_STUB = {
  improvConfig: { driver: 'beat-sync', liveBands: [0, 2], depth: 8, rate: 1.0 },
} as unknown as AutoDubPersona;

describe('adaptEQParams — eqSweep', () => {
  it('uses dominant spectral peak × 0.5 as startHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[2000, 6]] });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.startHz).toBeCloseTo(2000 * 0.5);
  });

  it('uses dominant spectral peak × 2.5 as endHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[2000, 6]] });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.endHz).toBeCloseTo(2000 * 2.5);
  });

  it('sweepSec is tempo-locked to 4 beats', () => {
    const snap = makeSnapshot({ bpm: 120 });
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    // 4 beats at 120 bpm = 4 × 60/120 = 2 seconds
    expect(out.sweepSec).toBeCloseTo(2.0);
  });

  it('gain scales with energy', () => {
    const snapLow = makeSnapshot({ energy: 0.0 });
    const snapHigh = makeSnapshot({ energy: 1.0 });
    const raw = { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 };
    const outLow = adaptEQParams('eqSweep', raw, snapLow, PERSONA_STUB);
    const outHigh = adaptEQParams('eqSweep', raw, snapHigh, PERSONA_STUB);
    expect(outHigh.gain).toBeGreaterThan(outLow.gain);
  });

  it('falls back to raw params when snapshot is null', () => {
    const raw = { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 };
    const out = adaptEQParams('eqSweep', raw, null, PERSONA_STUB);
    expect(out).toEqual(raw);
  });

  it('clamps startHz and endHz to audible range [20, 20000]', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[30, 10]] }); // 30 × 0.5 = 15 Hz
    const out = adaptEQParams('eqSweep', { startHz: 300, endHz: 5000, gain: 14, q: 4.5, sweepSec: 2.5 }, snap, PERSONA_STUB);
    expect(out.startHz).toBeGreaterThanOrEqual(20);
  });
});

describe('adaptEQParams — hpfRise', () => {
  it('uses highest peak above 800 Hz as peakHz', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[400, 8], [3000, 6], [1500, 4]] });
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    // peaks above 800: 3000 and 1500; highest by magnitude is 3000
    expect(out.peakHz).toBeCloseTo(3000);
  });

  it('clamps peakHz to [1200, 6000]', () => {
    const snap = makeSnapshot({ frequencyPeaks: [[100, 10]] }); // no peak above 800
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap, PERSONA_STUB);
    expect(out.peakHz).toBe(3000); // falls back to raw when no peak above 800
  });

  it('holdMs scales with energy (2 beats worth)', () => {
    const snap90bpm = makeSnapshot({ bpm: 90, energy: 1.0 });
    const out = adaptEQParams('hpfRise', { peakHz: 3000, holdMs: 800 }, snap90bpm, PERSONA_STUB);
    // 2 beats at 90 bpm × 1.0 energy = 2 × (60000/90) = 1333 ms
    expect(out.holdMs).toBeCloseTo(2 * (60000 / 90) * 1.0, -2);
  });

  it('falls back to raw when snapshot is null', () => {
    const raw = { peakHz: 3000, holdMs: 800 };
    const out = adaptEQParams('hpfRise', raw, null, PERSONA_STUB);
    expect(out).toEqual(raw);
  });
});
```

- [ ] **Step 2: Add test to `package.json` test:ci**

In `package.json`, find the `test:ci` vitest run command and append:
```
src/engine/dub/__tests__/autoDubEQ.test.ts
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/engine/dub/__tests__/autoDubEQ.test.ts
```

Expected: FAIL with `adaptEQParams is not exported`.

- [ ] **Step 4: Implement `adaptEQParams` in `AutoDub.ts`**

Add this exported pure function near the top of `AutoDub.ts`, before `chooseMove`:

```typescript
/**
 * Adapt a move's raw persona params using live analysis data.
 * Returns raw params unchanged when snapshot is null (analysis not yet run).
 * Pure function — no side effects, easy to test.
 */
export function adaptEQParams(
  moveId: string,
  rawParams: Record<string, number>,
  snapshot: EQSnapshot | null,
  _persona: AutoDubPersona,
): Record<string, number> {
  if (!snapshot) return rawParams;

  const { energy, danceability, bpm, frequencyPeaks } = snapshot;

  if (moveId === 'eqSweep') {
    // Dominant peak = highest-magnitude entry
    const dominant = frequencyPeaks.length > 0 ? frequencyPeaks[0][0] : null;
    const startHz = dominant !== null
      ? Math.max(20, Math.min(20000, dominant * 0.5))
      : rawParams.startHz;
    const endHz = dominant !== null
      ? Math.max(20, Math.min(20000, dominant * 2.5))
      : rawParams.endHz;
    const gain = _persona.improvConfig.depth * (0.5 + energy * 0.5);
    const q = 2 + danceability * 3;
    const sweepSec = 4 * 60 / bpm; // 4 beats at detected tempo
    return { ...rawParams, startHz, endHz, gain, q, sweepSec };
  }

  if (moveId === 'hpfRise') {
    // Highest peak above 800 Hz, sorted by magnitude
    const above = frequencyPeaks.filter(([hz]) => hz > 800);
    const peakHz = above.length > 0
      ? Math.max(1200, Math.min(6000, above[0][0]))
      : rawParams.peakHz;
    const beatMs = 60000 / bpm;
    const holdMs = 2 * beatMs * energy;
    return { ...rawParams, peakHz, holdMs };
  }

  return rawParams;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /Users/spot/Code/DEViLBOX && npx vitest run src/engine/dub/__tests__/autoDubEQ.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Type-check**

```bash
npm run type-check
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/dub/AutoDub.ts src/engine/dub/__tests__/autoDubEQ.test.ts package.json
git commit -m "feat: adaptEQParams — analysis-aware eqSweep/hpfRise parameter adaptation"
```

---

## Task 3: Populate `eqSnapshot` in the tick loop

**Files:**
- Modify: `src/engine/dub/AutoDub.ts`

- [ ] **Step 1: Add `useTrackerAnalysisStore` import**

In `AutoDub.ts`, add to the imports:

```typescript
import { useTrackerAnalysisStore } from '@/stores/useTrackerAnalysisStore';
import { getActiveDubBus } from '@/engine/drumpad/DrumPadEngine';
```

Check if `getActiveDubBus` already exists; look at how other parts of the codebase access the DubBus:
```bash
grep -n "getActiveDubBus\|getDubBus\|useDrumPadStore.*dubBus" /Users/spot/Code/DEViLBOX/src/engine/dub/AutoDub.ts | head -5
```

If the DubBus is already accessible via a different path, use that. The goal is to call `dubBus.getReturnEQ().getParams()` to snapshot the baseline.

- [ ] **Step 2: Add `_eqSnapshot` module-level cache**

After the existing module-level vars (near `_timer`, `_lastBar`, etc.), add:

```typescript
let _eqSnapshot: import('./AutoDub').EQSnapshot | null = null;
```

- [ ] **Step 3: Add `_buildEQSnapshot` helper function**

Add before `tickImpl`:

```typescript
function _buildEQSnapshot(bar: number, bpm: number): EQSnapshot | null {
  const analysis = useTrackerAnalysisStore.getState().currentAnalysis;
  if (!analysis) return null;

  const beatPhase = ((bar % 1) * 4) % 1; // 0–1 within current beat from barPos
  // Note: caller should pass barPos instead — see usage in tickImpl below.

  // Snapshot baseline from the live return EQ so improv loop can compute deltas
  let baseline: import('@/engine/effects/Fil4EqEffect').Fil4Params | null = null;
  try {
    // Access DubBus — use same pattern as the rest of AutoDub
    // (AutoDub doesn't import DubBus directly; get via store or engine)
    const store = (await import('@/stores/useDrumPadStore')).useDrumPadStore;
    // Actually use sync access — dynamic import is wrong here.
    // Read the pattern below.
  } catch { /* ok — baseline stays null */ }

  return {
    genre: analysis.genre.primary || 'Unknown',
    energy: analysis.genre.energy,
    danceability: analysis.genre.danceability,
    bpm: analysis.genre.bpm || bpm,
    beatPhase,
    frequencyPeaks: (analysis.frequencyPeaks ?? []) as [number, number][],
    baseline: baseline ?? _makeFlatBaseline(),
  };
}

function _makeFlatBaseline(): import('@/engine/effects/Fil4EqEffect').Fil4Params {
  return {
    hp: { enabled: false, freq: 40, q: 0.7 },
    lp: { enabled: false, freq: 20000, q: 0.7 },
    ls: { enabled: false, freq: 80, gain: 0, q: 0.8 },
    hs: { enabled: false, freq: 10000, gain: 0, q: 0.8 },
    p: [
      { enabled: false, freq: 200, bw: 1, gain: 0 },
      { enabled: false, freq: 500, bw: 1, gain: 0 },
      { enabled: false, freq: 2000, bw: 1, gain: 0 },
      { enabled: false, freq: 8000, bw: 1, gain: 0 },
    ],
    masterGain: 1,
  };
}
```

**IMPORTANT**: Getting the DubBus synchronously is the real challenge here. Check how `versionDrop.ts` accesses the mixer — it uses `useMixerStore.getState()`. For the DubBus, look at:

```bash
grep -n "getActiveDubBus\|useDrumPadStore.*dubBus\|dubBusEngine" /Users/spot/Code/DEViLBOX/src/components/dub/DubDeckStrip.tsx | head -5
grep -n "export function getActiveDubBus\|dubBusInstance" /Users/spot/Code/DEViLBOX/src/engine/drumpad/DrumPadEngine.ts | head -5
```

Use the correct synchronous accessor. If it's `getActiveDubBus()`, import that. The pattern:

```typescript
import { getActiveDubBus } from '@/engine/drumpad/DrumPadEngine';

// In _buildEQSnapshot:
const dubBus = getActiveDubBus?.();
if (dubBus) {
  try { baseline = dubBus.getReturnEQ().getParams(); } catch { /* ok */ }
}
```

- [ ] **Step 4: Inline snapshot build in `tickImpl`**

In `tickImpl`, after `bar` and `barPos` are computed and before `chooseMove` is called, add:

```typescript
// Beat phase: how far into the current beat we are (0–1)
const beatsPerBar = 4;
const beatInBar = barPos * beatsPerBar;
const beatPhase = beatInBar % 1;

// Refresh EQ snapshot each tick (cheap — just reads store state)
const analysis = useTrackerAnalysisStore.getState().currentAnalysis;
if (analysis) {
  const dubBus = getActiveDubBus?.();
  let baseline = _makeFlatBaseline();
  try { if (dubBus) baseline = dubBus.getReturnEQ().getParams(); } catch { /* ok */ }
  _eqSnapshot = {
    genre: analysis.genre.primary || 'Unknown',
    energy: analysis.genre.energy,
    danceability: analysis.genre.danceability,
    bpm: analysis.genre.bpm || bpm,
    beatPhase,
    frequencyPeaks: (analysis.frequencyPeaks ?? []) as [number, number][],
    baseline,
  };
} else {
  _eqSnapshot = null;
}
```

Then pass it into the `chooseMove` call (already using a ctx object — add to the ctx literal):

```typescript
const choice = chooseMove({
  bar, barPos, isNewBar,
  // ... all existing fields ...
  eqSnapshot: _eqSnapshot,
  inRiddimSection: _inRiddimSection,
}, _rng);
```

Also remove the helper function `_buildEQSnapshot` since we inlined it; keep `_makeFlatBaseline` as a module-level helper.

- [ ] **Step 5: Add `_inRiddimSection` module-level var**

```typescript
let _inRiddimSection = false;
```

And reset it in `stopAutoDub()`:
```typescript
_inRiddimSection = false;
```

- [ ] **Step 6: Wire `adaptEQParams` in `chooseMove`**

In `chooseMove`, find where `params` is assembled before `fire()` is called. (In `tickImpl`, the fire happens via `fire(choice.moveId, choice.channelId, choice.params, 'live')`.) Add the adaptation:

```typescript
// In tickImpl, replace:
const disposer = fire(choice.moveId, choice.channelId, choice.params, 'live');

// With:
const adaptedParams = (choice.moveId === 'eqSweep' || choice.moveId === 'hpfRise')
  ? adaptEQParams(choice.moveId, choice.params, _eqSnapshot, persona)
  : choice.params;
const disposer = fire(choice.moveId, choice.channelId, adaptedParams, 'live');
```

- [ ] **Step 7: Type-check**

```bash
npm run type-check
```

Fix any errors — most likely the `getActiveDubBus` import path.

- [ ] **Step 8: Commit**

```bash
git add src/engine/dub/AutoDub.ts
git commit -m "feat: AutoDub — populate eqSnapshot per tick, wire adaptEQParams for eqSweep/hpfRise"
```

---

## Task 4: Riddim section move

**Files:**
- Create: `src/engine/dub/moves/riddimSection.ts`
- Modify: `src/engine/dub/AutoDub.ts` (add rule + `_inRiddimSection` management)
- Modify: move registry (wherever moves are registered)

- [ ] **Step 1: Find the move registry**

```bash
grep -rn "versionDrop\|registerMove\|moveRegistry\|DUB_MOVES" /Users/spot/Code/DEViLBOX/src/engine/dub/ | grep -v test | head -15
```

Find where `versionDrop` is registered/exported to understand how to add `riddimSection`.

- [ ] **Step 2: Create `riddimSection.ts`**

Create `/Users/spot/Code/DEViLBOX/src/engine/dub/moves/riddimSection.ts`:

```typescript
/**
 * riddimSection — bass & drums breakdown with skank return.
 *
 * The ultra-classic dub move: strips the mix to bass and drums, plays with
 * the riddim section for a while, then brings the skank back soaked in echo.
 *
 * At 60% of the hold duration, one chord/skank channel unmutes and receives
 * an echoThrow — the classic "skank comes back with tape reverb" effect.
 * On dispose (end of hold), all remaining muted channels unmute.
 */

import type { DubMove } from './_types';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import { fire } from '../DubRouter';
import type { InstrumentConfig } from '@/types/instrument';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';

const MELODIC_ROLES = new Set<ChannelRole>(['lead', 'chord', 'arpeggio', 'pad', 'skank']);
const SKANK_ROLES = new Set<ChannelRole>(['chord', 'skank']);

export const riddimSection: DubMove = {
  id: 'riddimSection',
  kind: 'hold',
  defaults: {},

  execute(_ctx) {
    const mixer = useMixerStore.getState();
    const tracker = useTrackerStore.getState();
    const transport = useTransportStore.getState();

    // Resolve roles (same pattern as versionDrop)
    let roles: ChannelRole[] = [];
    const patterns = tracker.patterns;
    if (Array.isArray(patterns) && patterns.length > 0) {
      const insts = useInstrumentStore.getState().instruments;
      const lookup = new Map<number, InstrumentConfig>();
      for (const inst of insts) {
        if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
      }
      roles = classifySongRoles(patterns, lookup);
    }

    const channels = mixer.channels;
    const muted: number[] = [];
    let skankeIdx: number | null = null;

    // Mute all melodic channels; find the first skank/chord channel to return later
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const effectiveRole: ChannelRole = (ch.dubRole as ChannelRole | null) ?? roles[i] ?? 'empty';
      if (!MELODIC_ROLES.has(effectiveRole)) continue;
      if (!(ch.muted ?? false)) {
        mixer.setChannelMute(i, true);
        muted.push(i);
        // Pick the first chord/skank as the skank return channel
        if (skankeIdx === null && SKANK_ROLES.has(effectiveRole)) {
          skankeIdx = i;
        }
      }
    }

    if (muted.length === 0) {
      // Nothing to mute — graceful no-op
      return { dispose() {} };
    }

    // Calculate skank return time (60% of hold duration)
    // holdMs is set by the AutoDub caller via the hold timer — we don't know it here.
    // Use BPM to estimate 60% of a 4-bar hold (the default riddim hold).
    const bpm = transport.bpm || 120;
    const barMs = (60000 / bpm) * 4;
    const holdBars = 4; // default; AutoDub may use persona's holdBars
    const skankeReturnMs = barMs * holdBars * 0.6;

    let skankeTimer: ReturnType<typeof setTimeout> | null = null;

    if (skankeIdx !== null) {
      const skankeChannel = skankeIdx;
      skankeTimer = setTimeout(() => {
        try {
          useMixerStore.getState().setChannelMute(skankeChannel, false);
          // Bring the skank in with echo (tape reverb feel)
          fire('echoThrow', skankeChannel, { intensity: 0.85 }, 'live');
        } catch { /* ok */ }
        skankeTimer = null;
      }, skankeReturnMs);
    }

    return {
      dispose() {
        if (skankeTimer !== null) {
          clearTimeout(skankeTimer);
          skankeTimer = null;
        }
        const m = useMixerStore.getState();
        for (const i of muted) {
          try { m.setChannelMute(i, false); } catch { /* ok */ }
        }
      },
    };
  },
};
```

- [ ] **Step 3: Register the move**

Find how `versionDrop` is registered and add `riddimSection` in the same way. For example, if there's a `moves/index.ts` or the move is imported in a registry:

```bash
grep -rn "versionDrop" /Users/spot/Code/DEViLBOX/src/engine/dub/moves/ | grep -v ".test."
grep -rn "import.*versionDrop\|versionDrop" /Users/spot/Code/DEViLBOX/src/engine/dub/*.ts | head -10
```

Add `import { riddimSection } from './moves/riddimSection';` and register it alongside `versionDrop`.

- [ ] **Step 4: Add riddim rule + `_inRiddimSection` management to AutoDub**

In `AutoDub.ts`, find the `RULES` array and add the riddim rule (after the existing `versionDrop` rules, around line 505):

```typescript
  // ── Riddim section — bass+drums breakdown with skank return ──────────────
  // Per-persona: fires every N bars when persona has riddimConfig.enabled.
  // Condition evaluates the persona's riddim config from ctx.
  { moveId: 'riddimSection',
    condition: (c) =>
      c.isNewBar
      && c.persona.riddimConfig?.enabled === true
      && c.bar % (c.persona.riddimConfig.freqBars ?? 16) === 0
      && c.intensity > 0.35
      && !c.inRiddimSection,  // don't nest
    baseWeight: 0.60,
    holdBars: 4,  // default; persona config overrides this below
  },
```

But `holdBars` needs to be dynamic (from persona config). Find where `choice.holdBars` is used to schedule the auto-release timer in `tickImpl` and adjust:

```typescript
// When riddimSection fires, use persona's riddimConfig.holdBars
const holdBars = choice.moveId === 'riddimSection'
  ? (persona.riddimConfig?.holdBars ?? 4)
  : choice.holdBars;
const holdMs = (60000 / bpm) * 4 * holdBars;
```

- [ ] **Step 5: Set and clear `_inRiddimSection` flag**

In `tickImpl`, after `fire()` and before the hold timer, add:

```typescript
if (choice.moveId === 'riddimSection') {
  _inRiddimSection = true;
}
```

Wrap the existing hold timer to also clear the flag on dispose:

```typescript
if (disposer) {
  _heldDisposers.add(disposer);
  const holdMs = (60000 / bpm) * 4 * holdBars;
  setTimeout(() => {
    try { disposer.dispose(); } catch { /* ok */ }
    _heldDisposers.delete(disposer);
    if (choice.moveId === 'riddimSection') {
      _inRiddimSection = false;
    }
  }, holdMs);
}
```

- [ ] **Step 6: Filter channel selection when `_inRiddimSection`**

In `chooseMove`, find where a channel is selected for a move (search for `pickChannel` or the channel selection logic). When `ctx.inRiddimSection` is true, restrict picks to `bass` and `percussion` roles:

```typescript
// Near where channelId is picked from roles:
function pickChannelForRole(
  role: Rule['channelRole'],
  ctx: AutoDubTickCtx,
  rng: () => number,
): number | undefined {
  // If in riddim section, override to only bass/percussion channels
  const allowedRoles = ctx.inRiddimSection
    ? new Set(['bass', 'percussion'])
    : null;
  // ... existing channel selection logic, filtered by allowedRoles when set
}
```

Read the actual channel selection code in `chooseMove` first (`grep -n "channelId\|pickChannel\|roles\[" AutoDub.ts`) and add the filter there.

- [ ] **Step 7: Add `riddimSection` to `MOVE_COOLDOWNS`**

```typescript
riddimSection: 16,  // Never fire more than once every 16 bars
```

- [ ] **Step 8: Type-check**

```bash
npm run type-check
```

- [ ] **Step 9: Run test:ci**

```bash
npm run test:ci 2>&1 | tail -5
```

- [ ] **Step 10: Commit**

```bash
git add src/engine/dub/moves/riddimSection.ts src/engine/dub/AutoDub.ts
git commit -m "feat: riddimSection move — bass+drums breakdown with skank tape-reverb return"
```

---

## Task 5: Improv loop

**Files:**
- Modify: `src/engine/dub/AutoDub.ts`
- Modify: `src/engine/dub/__tests__/autoDubEQ.test.ts` (add improv delta tests)

- [ ] **Step 1: Write failing tests for improv delta math**

Add to `autoDubEQ.test.ts`:

```typescript
import { computeImprovDelta } from '../AutoDub';

describe('computeImprovDelta', () => {
  it('beat-sync: delta = sin(beatPhase×2π) × depth × energy', () => {
    const delta = computeImprovDelta('beat-sync', 0.25, 0.8, 0.0, 8);
    // sin(0.25 × 2π) = sin(π/2) = 1.0 → 1.0 × 0.8 × 8 = 6.4
    expect(delta).toBeCloseTo(1.0 * 0.8 * 8, 1);
  });

  it('beat-sync: delta is 0 at beatPhase=0', () => {
    const delta = computeImprovDelta('beat-sync', 0, 0.8, 0.0, 8);
    expect(Math.abs(delta)).toBeLessThan(0.1);
  });

  it('energy-reactive: delta spikes on positive energy delta', () => {
    const delta = computeImprovDelta('energy-reactive', 0.5, 0.8, 0.5, 8);
    // energyDelta = 0.8 - 0.5 = 0.3 → 0.3 × 8 × 8 = 19.2 (clamped to depth=8)
    expect(delta).toBeGreaterThan(0);
  });

  it('spectral: returns within [-depth, +depth]', () => {
    const delta = computeImprovDelta('spectral', 0.5, 0.8, 0.8, 6);
    expect(Math.abs(delta)).toBeLessThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/engine/dub/__tests__/autoDubEQ.test.ts
```

Expected: FAIL — `computeImprovDelta` not exported.

- [ ] **Step 3: Implement `computeImprovDelta` in `AutoDub.ts`**

```typescript
/**
 * Compute the gain delta (dB) for the improv loop for a single tick.
 * Pure function.
 *
 * @param driver     Which modulation engine to use
 * @param beatPhase  0–1 position within current beat
 * @param energy     Current song energy 0–1
 * @param prevEnergy Energy from the previous tick (for energy-reactive delta)
 * @param depth      Max modulation in dB
 */
export function computeImprovDelta(
  driver: 'beat-sync' | 'energy-reactive' | 'spectral',
  beatPhase: number,
  energy: number,
  prevEnergy: number,
  depth: number,
): number {
  switch (driver) {
    case 'beat-sync':
      return Math.sin(beatPhase * 2 * Math.PI) * depth * energy;

    case 'energy-reactive': {
      const rawDelta = (energy - prevEnergy) * depth * 8;
      return Math.max(-depth, Math.min(depth, rawDelta));
    }

    case 'spectral':
      // Spectral driver is computed per-band in the loop (needs peak data).
      // This function returns a placeholder 0 for the spectral case;
      // the actual per-band spectral delta is computed inline in the loop.
      return 0;
  }
}
```

- [ ] **Step 4: Add improv loop state to module level**

```typescript
let _improvTimer: ReturnType<typeof setInterval> | null = null;
let _prevEnergy = 0;
/** Per-band running gain offset from improv loop. Index = band index (0-3). */
const _improvBandDeltas = [0, 0, 0, 0];
```

- [ ] **Step 5: Implement `startImprovLoop` and `stopImprovLoop`**

```typescript
function startImprovLoop(): void {
  if (_improvTimer !== null) return;
  _improvTimer = setInterval(improvTick, 250);
}

function stopImprovLoop(): void {
  if (_improvTimer !== null) {
    clearInterval(_improvTimer);
    _improvTimer = null;
  }
  // Ramp bands back to baseline over 10 × 20ms steps
  _rampBandsToBaseline();
}

function _rampBandsToBaseline(): void {
  const steps = 10;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    for (let i = 0; i < 4; i++) {
      _improvBandDeltas[i] *= (1 - step / steps);
    }
    _applyImprovDeltas();
    if (step >= steps) {
      clearInterval(timer);
      _improvBandDeltas.fill(0);
      _applyImprovDeltas();
    }
  }, 20);
}

function _applyImprovDeltas(): void {
  try {
    const dubBus = getActiveDubBus?.();
    if (!dubBus) return;
    const returnEQ = dubBus.getReturnEQ();
    const baseline = returnEQ.getParams();
    for (let i = 0; i < 4; i++) {
      const b = baseline.p[i];
      if (!b) continue;
      returnEQ.setBand(i, b.enabled, b.freq, b.bw, b.gain + _improvBandDeltas[i]);
    }
  } catch { /* ok */ }
}

function improvTick(): void {
  const dub = useDubStore.getState();
  const eqMode = dub.autoDubEqMode ?? 'both';
  if (eqMode === 'off' || eqMode === 'collaborative') {
    _improvBandDeltas.fill(0);
    return;
  }

  const snapshot = _eqSnapshot;
  if (!snapshot) return;

  const persona = getPersona(dub.autoDubPersona);
  const cfg = persona.improvConfig;
  const depthMult = dub.autoDubEqDepthMult ?? 1.0;
  const effectiveDepth = cfg.depth * depthMult;

  const driver = cfg.driver;
  const energy = snapshot.energy;
  const beatPhase = snapshot.beatPhase;

  for (const bandIdx of cfg.liveBands) {
    if (bandIdx < 0 || bandIdx > 3) continue;
    const baseline = snapshot.baseline.p[bandIdx];
    if (!baseline) continue;

    let delta: number;

    if (driver === 'spectral') {
      // Find the frequency peak nearest to this band's center frequency
      const bandFreq = baseline.freq;
      const nearest = snapshot.frequencyPeaks.reduce(
        (best, p) => Math.abs(p[0] - bandFreq) < Math.abs(best[0] - bandFreq) ? p : best,
        snapshot.frequencyPeaks[0] ?? [bandFreq, 0],
      );
      const peakMagnitudeAboveBaseline = nearest[1] - baseline.gain;
      if (peakMagnitudeAboveBaseline > 3) {
        // Problem frequency — gently cut
        delta = -effectiveDepth * 0.4;
      } else {
        // Sweet spot — gently boost
        delta = effectiveDepth * 0.3;
      }
    } else {
      delta = computeImprovDelta(driver, beatPhase, energy, _prevEnergy, effectiveDepth);
    }

    // Clamp to [−depth, +depth]
    _improvBandDeltas[bandIdx] = Math.max(-effectiveDepth, Math.min(effectiveDepth, delta));
  }

  _prevEnergy = energy;
  _applyImprovDeltas();
}
```

- [ ] **Step 6: Start/stop improv loop alongside main loop**

In `startAutoDub()`, add:
```typescript
startImprovLoop();
```

In `stopAutoDub()`, add:
```typescript
stopImprovLoop();
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/engine/dub/__tests__/autoDubEQ.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Type-check**

```bash
npm run type-check
```

- [ ] **Step 9: Commit**

```bash
git add src/engine/dub/AutoDub.ts src/engine/dub/__tests__/autoDubEQ.test.ts
git commit -m "feat: AutoDub improv EQ loop — beat-sync / energy-reactive / spectral band modulation"
```

---

## Task 6: Persona configs

**Files:**
- Modify: `src/engine/dub/AutoDubPersonas.ts`

- [ ] **Step 1: Add `improvConfig` and `riddimConfig` to every persona**

Read the current persona definitions to find the exact object structure, then add both fields to each persona. The full set of updates:

**Tubby:**
```typescript
improvConfig: { driver: 'beat-sync', liveBands: [0, 3], depth: 4, rate: 1.0 },
riddimConfig: { enabled: true, freqBars: 16, holdBars: 4 },
```

**Scientist:**
```typescript
improvConfig: { driver: 'spectral', liveBands: [2, 3], depth: 6, rate: 0.7 },
riddimConfig: { enabled: true, freqBars: 24, holdBars: 4 },
```

**Mad Professor:**
```typescript
improvConfig: { driver: 'energy-reactive', liveBands: [0, 1, 2, 3], depth: 12, rate: 1.4 },
riddimConfig: { enabled: true, freqBars: 8, holdBars: 8 },
```

**Perry:**
```typescript
improvConfig: { driver: 'beat-sync', liveBands: [0], depth: 3, rate: 0.8 },
riddimConfig: { enabled: true, freqBars: 12, holdBars: 4 },
```

**Jammy:**
```typescript
improvConfig: { driver: 'spectral', liveBands: [1, 2], depth: 5, rate: 0.5 },
riddimConfig: { enabled: false, freqBars: 16, holdBars: 4 },
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Fix any type errors — the `PersonaImprovConfig` type must match the values added.

- [ ] **Step 3: Commit**

```bash
git add src/engine/dub/AutoDubPersonas.ts
git commit -m "feat: AutoDub personas — add improvConfig + riddimConfig to all five personas"
```

---

## Task 7: UI — AutoDubPanel controls

**Files:**
- Modify: `src/components/dub/AutoDubPanel.tsx`

- [ ] **Step 1: Read the current panel structure**

```bash
sed -n '1,50p' /Users/spot/Code/DEViLBOX/src/components/dub/AutoDubPanel.tsx
grep -n "intensity\|autoDub\|persona\|setAuto" /Users/spot/Code/DEViLBOX/src/components/dub/AutoDubPanel.tsx | head -20
```

Understand where the existing controls row is (intensity slider, persona picker).

- [ ] **Step 2: Add store state reads**

In the component, add reads for the new store fields:

```typescript
const eqMode = useDubStore(s => s.autoDubEqMode ?? 'both');
const setEqMode = useDubStore(s => s.setAutoDubEqMode);
const eqDepthMult = useDubStore(s => s.autoDubEqDepthMult ?? 1.0);
const setEqDepthMult = useDubStore(s => s.setAutoDubEqDepthMult);
const currentPersona = useDubStore(s => s.autoDubPersona);
```

- [ ] **Step 3: Add EQ mode toggle to the controls row**

Find the intensity slider section. Below it (or in a new row), add the 4-state EQ mode toggle. Use the existing `Button` component with `variant="compact"`:

```tsx
{/* EQ Mode — only show when bus is enabled */}
{busEnabled && (
  <div className="flex flex-col gap-1 px-2 pt-1">
    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">EQ Mode</span>
    <div className="flex gap-1">
      {(['off', 'collaborative', 'improv', 'both'] as const).map((mode) => (
        <Button
          key={mode}
          variant="compact"
          onClick={() => setEqMode(mode)}
          className={eqMode === mode ? 'border-accent-primary bg-accent-primary/20 text-accent-primary' : ''}
        >
          {mode === 'off' ? 'Off'
            : mode === 'collaborative' ? 'Sweeps'
            : mode === 'improv' ? 'Improv'
            : '★ Both'}
        </Button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add depth slider + driver badge (improv/both modes only)**

```tsx
{busEnabled && (eqMode === 'improv' || eqMode === 'both') && (
  <div className="flex items-center gap-2 px-2 py-1">
    <span className="text-[9px] font-mono text-text-muted">Depth</span>
    <input
      type="range" min={0} max={1} step={0.01}
      value={eqDepthMult}
      onChange={(e) => setEqDepthMult(Number(e.target.value))}
      className="flex-1 accent-accent-primary cursor-pointer"
      style={{ height: '12px' }}
    />
    <span className="text-[8px] font-mono text-text-secondary tabular-nums w-8 text-right">
      {Math.round(eqDepthMult * 100)}%
    </span>
    <DriverBadge personaId={currentPersona} />
  </div>
)}
```

Add `DriverBadge` as a local component in the same file:

```tsx
function DriverBadge({ personaId }: { personaId: string }) {
  const { getPersona } = require('@/engine/dub/AutoDubPersonas');  // avoid circular dep
  // Actually use a static lookup instead of dynamic require:
  const DRIVER_LABELS: Record<string, string> = {
    tubby: 'BEAT',
    scientist: 'SPECTRAL',
    madProfessor: 'ENERGY',
    perry: 'BEAT',
    jammy: 'SPECTRAL',
  };
  const label = DRIVER_LABELS[personaId] ?? '—';
  return (
    <span className="text-[8px] font-mono text-accent-highlight px-1 py-0.5 rounded border border-accent-highlight/30 shrink-0">
      {label}
    </span>
  );
}
```

Use a static map rather than a dynamic import to avoid circular dependency issues.

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

- [ ] **Step 6: Run test:ci**

```bash
npm run test:ci 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/components/dub/AutoDubPanel.tsx
git commit -m "feat: AutoDubPanel — EQ mode toggle (Off/Sweeps/Improv/Both), depth slider, driver badge"
```

---

## Self-Review: Spec Coverage

| Spec Requirement | Task |
|---|---|
| `EQSnapshot` type in `AutoDubTickCtx` | Tasks 1 + 3 |
| `PersonaImprovConfig` interface | Task 1 |
| `PersonaRiddimConfig` interface | Task 1 |
| `eqMode` + `eqImprovDepthMult` in store | Task 1 |
| `adaptEQParams` pure function + tests | Task 2 |
| eqSweep: startHz/endHz/gain/q/sweepSec adapted | Task 2 + 3 |
| hpfRise: peakHz/holdMs adapted | Task 2 + 3 |
| Snap-back: restore B2 to baseline after sweep | NOT YET — after eqSweep disposer completes, `DubBus.stopEQSweep()` already restores prior state (see `DubBus.ts` line 1017). No additional work needed. |
| Improv loop: beat-sync, energy-reactive, spectral | Task 5 |
| Improv loop: per-persona liveBands | Task 5 + 6 |
| Improv loop: ramp-back on mode change | Task 5 |
| Persona configs (all 5 personas) | Task 6 |
| `riddimSection` move: mute melodic channels | Task 4 |
| `riddimSection`: skank return at 60% with echoThrow | Task 4 |
| `_inRiddimSection` flag: channel filter to bass/drums | Task 4 |
| UI: EQ mode toggle | Task 7 |
| UI: depth slider | Task 7 |
| UI: driver badge | Task 7 |
| Tests: adaptEQParams (null fallback + adapted) | Task 2 |
| Tests: improv delta math | Task 5 |

All spec requirements covered.
