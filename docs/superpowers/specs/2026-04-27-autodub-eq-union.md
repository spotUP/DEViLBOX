---
date: 2026-04-27
topic: autodub-eq-union
tags: [autodub, eq, fil4, autoeq, improv, analysis]
status: final
---

# AutoDub + EQ Holy Union

## Goal

Wire AutoDub's move-firing loop and AutoEQ's genre/spectral analysis pipeline so they share a live context snapshot. Two new behaviours result:

1. **Collaborative mode** — `eqSweep` and `hpfRise` adapt their parameters from real-time analysis (spectral peaks, energy, BPM) instead of using hardcoded persona values. Sweeps land where the music actually lives, snap back to the AutoEQ baseline after.

2. **Improv mode** — a second continuous loop inside AutoDub breathes the Fil4EQ's live bands in real time, driven by one of three engines (beat-sync, energy-reactive, spectral). Which bands move and how wild they go is persona-defined.

Both modes are switchable via a 4-state control (`OFF / SWEEPS / IMPROV / BOTH`). `BOTH` is the default when the bus is enabled.

---

## Architecture: Context Enrichment (Approach B)

No new classes or adapters. `AutoDubTickCtx` gains a live `eqSnapshot` field populated each tick from `useTrackerAnalysisStore`. The improv loop is a second subscriber inside `AutoDub` running alongside the existing 250ms move-firing loop. All EQ intelligence lives in one file.

---

## Data Model

### `EQSnapshot` (new, added to `AutoDubTickCtx`)

```typescript
interface EQSnapshot {
  genre: string;
  energy: number;                    // 0–1 from analysis.genre.energy
  danceability: number;              // 0–1 from analysis.genre.danceability
  bpm: number;                       // detected BPM
  beatPhase: number;                 // 0–1 position within current beat (transport row + BPM)
  frequencyPeaks: [number, number][]; // [[hz, db], ...] sorted by magnitude desc
  baseline: Partial<Fil4Params>;     // current AutoEQ-set band positions (snapshot, not live ref)
}
```

`EQSnapshot` is `null` when no analysis has run yet. All adaptive logic falls back to persona defaults when `snapshot` is null.

`beatPhase` is computed from `currentRow`, pattern length, BPM, and sample rate — no new store dependency.

### `PersonaImprovConfig` (new, added to each persona in `AutoDubPersonas.ts`)

```typescript
interface PersonaImprovConfig {
  driver: 'beat-sync' | 'energy-reactive' | 'spectral';
  liveBands: ('p0' | 'p1' | 'p2' | 'p3' | 'ls' | 'hs')[]; // which Fil4 bands the loop may touch
  depth: number;   // max gain modulation in dB
  rate: number;    // loop speed multiplier (1.0 = normal cadence)
}
```

**Default configs per persona:**

| Persona | Driver | Live bands | Depth | Rate |
|---|---|---|---|---|
| Tubby | beat-sync | p0, p3 | 4 dB | 1.0 |
| Scientist | spectral | p2, hs | 6 dB | 0.7 |
| Mad Professor | energy-reactive | p0, p1, p2, p3, ls, hs | 12 dB | 1.4 |
| Perry | beat-sync | p0 | 3 dB | 0.8 |
| Jammy | spectral | p1, p2 | 5 dB | 0.5 |

### `AutoDubSettings` extension

Add to `AutoDubSettings`:
- `eqMode: 'off' | 'collaborative' | 'improv' | 'both'` — default `'both'`
- `eqImprovDepthMult: number` — global depth multiplier for improv loop, default `1.0`

---

## Collaborative Mode — eqSweep / hpfRise Adaptation

A single pure function `adaptEQParams(moveId, rawParams, snapshot, persona)` is added to `AutoDub.ts`. It takes the persona's raw params and returns analysis-informed versions. Falls back to `rawParams` unchanged when `snapshot` is null.

### eqSweep adaptation

| Param | Fallback (no analysis) | Adapted |
|---|---|---|
| `startHz` | persona hardcoded | `dominantPeak × 0.5` (start one octave below the dominant peak) |
| `endHz` | persona hardcoded | `dominantPeak × 2.5` (sweep past it) |
| `gain` | persona hardcoded | `persona.improvConfig.depth × (0.5 + energy × 0.5)` |
| `q` | persona hardcoded | `2 + danceability × 3` (tighter on danceable music) |
| `sweepSec` | persona hardcoded | `4 × 60 / bpm` — exactly 4 beats at detected tempo |

`dominantPeak` = highest-magnitude entry in `frequencyPeaks`. If no peaks, falls back unchanged.

### hpfRise adaptation

| Param | Fallback | Adapted |
|---|---|---|
| `peakHz` | 3000 | highest `frequencyPeak` above 800 Hz, clamped [1200, 6000] |
| `holdMs` | persona hardcoded | `(2 × beat_duration_ms) × energy` |

### Snap-back

After a collaborative move completes its disposer, AutoDub restores the sweep band (B2) to `snapshot.baseline.p[1]` (P2 = the dedicated sweep band). This is a single `returnEQ.setBand(1, ...)` call — the gesture is done, AutoEQ holds the shape.

---

## Improv Loop

A second loop inside `AutoDub` runs on its own cadence (`baseCadenceMs × (1 / persona.improvConfig.rate)`, where `baseCadenceMs = 250`). It applies smooth gain deltas to the persona's `liveBands` ON TOP of the AutoEQ baseline — additive, never replacing.

### Delta computation per driver

**Beat-sync:**
```
delta_db = sin(beatPhase × 2π) × depth × energy
```
All live bands receive the same delta (breathing in unison with the groove).

**Energy-reactive:**
```
energyDelta = currentEnergy - prevEnergy   (sampled each loop tick)
delta_db = energyDelta × depth × 8
```
Spikes on transients, decays with a 400ms RC time constant stored in loop state.

**Spectral:**
For each live band, find the `frequencyPeak` nearest to the band's center frequency. If the peak is above the `baseline` gain by > 3 dB (problem frequency), apply a gentle cut (`-depth × 0.4`). If the peak is at or below baseline (sweet spot), apply a gentle boost (`+depth × 0.3`). This nudges the EQ toward where the music lives.

### Application

Deltas are added to `baseline` gain values and clamped to `[baseline_gain - depth, baseline_gain + depth]`. Applied via `returnEQ.setBand(i, enabled, freq, bw, newGain)` — only the gain changes, freq/bw/enabled stay at baseline.

### Ramp-back

On mode change to `'off'` or `'collaborative'`, or on bus disable: ramp all live bands back to `baseline` over 200 ms (10 steps × 20ms).

---

## UI — `AutoDubPanel.tsx`

**EQ Mode toggle** — added to the existing controls row, visible only when bus is enabled:

```
[ OFF ]  [ SWEEPS ]  [ IMPROV ]  [ BOTH ★ ]
```

Uses the existing `Button` design system component with `variant="compact"`.

**Depth slider** — compact horizontal slider (0–100%), stored as `eqImprovDepthMult: number` in `AutoDubSettings` (default 1.0). The improv loop multiplies each persona's base `improvConfig.depth` by this value. Visible only when mode is `IMPROV` or `BOTH`. Label: `"Depth"`. This is also added to `AutoDubSettings`.

**Driver badge** — small read-only text badge next to the depth slider showing `BEAT` / `ENERGY` / `SPECTRAL`. Derived from the current persona's `improvConfig.driver` read from `useAutoDubStore`. No user interaction.

Visual feedback in EQ tab is automatic — `Fil4EqCurve` redraws whenever `returnEQ` changes, so the curve visibly breathes during improv mode. No extra rendering code.

---

## Riddim Section — Bass & Drums Breakdown

The ultra-classic dub move: strip the mix to bass and drums for a phrase, play with them, then bring the skank back with tape reverb.

### Behaviour

1. **Drop** — on entering riddim section, `channelMute` fires on every channel with role `lead`, `chord`, `arpeggio`, or `pad`. The bus is now bass + drums only.
2. **Play** — while in riddim section, AutoDub only targets channels with role `bass` or `percussion` for move selection. Echo throws, channel throws, and filter drops land on the rhythm section.
3. **Skank return** — at `riddimSectionHoldBars × 0.6` bars in, AutoDub un-mutes exactly one `chord`-role channel (the skank) and immediately fires `echoThrow` on it. The skank enters soaked in tape reverb.
4. **Full return** — at `riddimSectionHoldBars` bars, all remaining mutes release and the full mix returns.

### New persona fields

```typescript
riddimSectionEnabled: boolean;       // whether this persona does breakdowns
riddimSectionFreqBars: number;       // how often (every N bars). Default 16.
riddimSectionHoldBars: number;       // how long the breakdown lasts. Default 4.
```

Default values per persona:
| Persona | Enabled | Freq | Hold |
|---|---|---|---|
| Tubby | true | 16 | 4 |
| Scientist | true | 24 | 4 |
| Mad Professor | true | 8 | 8 |
| Perry | true | 12 | 4 |
| Jammy | false | — | — |

Jammy is too sparse to benefit from a riddim section (there's already nothing there).

### New move: `riddimSection`

```typescript
// src/engine/dub/moves/riddimSection.ts
// kind: 'hold'
// On fire: mute all non-bass/drum channels; schedule skank return at 60% of hold duration
// On dispose: release all managed mutes
```

The move manages all internal disposers. It stores the muted-channel disposers and the skank-return timer. On dispose (when hold ends), it clears the timer and releases all remaining mutes.

### AutoDub changes

- New rule fires `riddimSection` when `c.isNewBar && c.bar % persona.riddimSectionFreqBars === 0 && c.intensity > 0.35 && persona.riddimSectionEnabled`
- New `_inRiddimSection` flag set while the hold is active
- When `_inRiddimSection`, `chooseMove` filters candidate channel IDs to `bass`/`percussion` roles only

## File Map

| File | Change |
|---|---|
| `src/engine/dub/AutoDub.ts` | Add `EQSnapshot` type; populate `ctx.eqSnapshot` each tick; add `adaptEQParams()` pure function; add improv loop; add riddim rule + `_inRiddimSection` flag |
| `src/engine/dub/AutoDubPersonas.ts` | Add `improvConfig: PersonaImprovConfig` + riddim fields to each persona |
| `src/engine/dub/moves/eqSweep.ts` | Read adapted params from ctx |
| `src/engine/dub/moves/hpfRise.ts` | Read adapted params from ctx |
| `src/engine/dub/moves/riddimSection.ts` | **New** — bass & drums breakdown move |
| `src/components/dub/AutoDubPanel.tsx` | Add EQ mode toggle, depth slider, driver badge |
| `src/types/dub.ts` | Add `eqMode`/`eqImprovDepthMult` to `AutoDubSettings`; add `PersonaImprovConfig` interface; add riddim fields to persona type |

---

## What Is Not Changing

- `AutoEQ.ts` — no changes; it continues running its own analysis subscription independently
- `Fil4EqEffect.ts` — no changes; improv loop uses the same public API as AutoEQ
- `DubBus._applyAutoEQ()` — no changes; still applies the static baseline on analysis updates
- `useAutomationStore` / `DubRecorder` — not touched
- The `eqSnapshot.baseline` is a **snapshot** (copy) taken each tick, not a live reference — the improv loop cannot corrupt the AutoEQ state

---

## Testing

**Automated:**
- `adaptEQParams` unit test: given a snapshot with specific peaks/energy/bpm, assert correct startHz/endHz/gain/q/sweepSec values
- `adaptEQParams` fallback test: null snapshot returns rawParams unchanged
- Improv delta computation: beat-sync delta at beatPhase=0.25 produces expected value; energy-reactive delta decays correctly

**Manual:**
1. Load `world class dub.mod`, enable bus, set mode to BOTH — confirm EQ curve moves in EQ tab during playback
2. Switch persona Tubby→Mad Professor — confirm depth and live-band movement increases dramatically
3. Switch to SWEEPS only — confirm improv breathing stops, eqSweep still fires
4. Switch to OFF — confirm EQ is static, only AutoEQ baseline applies
5. Load a song with no analysis yet — confirm eqSweep fires with persona hardcoded fallback values (no crash)
6. Load `world class dub.mod`, set Tubby persona, play for 16 bars — confirm riddim section fires: lead/chord channels mute, only bass+drums audible, then skank returns wet with echo
7. During riddim section, confirm AutoDub only fires moves on bass/drum channels (check automation lanes)
8. Mad Professor at 8-bar frequency — riddim section fires more frequently, holds 8 bars
