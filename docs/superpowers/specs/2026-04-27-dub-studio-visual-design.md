---
date: 2026-04-27
topic: dub-studio-visual
tags: [dub, eq, automation, pattern-editor, vertical-faders]
status: final
---

# Dub Studio Visual — Vertical EQ Faders + Unified Dub Automation Lanes

## Goal

Two interlocked improvements to the dub studio experience:

1. **Vertical EQ faders** — King Tubby mixer-desk style gain faders in the Fil4EQ panel, with draggable curve handles for frequency.
2. **Dub events → automation store** — unify `pattern.dubLane.events[]` into `useAutomationStore` so dub moves appear as editable step-curves in the pattern editor automation lanes, with a dedicated master dub lane column to the left of channel 0.

## Architecture

### Part 1 — Fil4EQ Panel: Draggable Curve + Vertical Gain Faders

**`Fil4EqCurve.tsx` — interactive band handles overlay**

The canvas keeps drawing magnitude + grid. A `position:absolute; inset:0` div overlays 8 handle circles — one per band (HP, LoShelf, P1–P4, HiShelf, LP). Each handle:

- Position: `x = freqToX(band.freq, plotW)`, `y = dbToY(band.gain, plotH)` — both functions already exported from this file.
- **Drag horizontal** → updates `freq` via `onBandChange` callback prop.
- **Drag vertical** → updates `gain`. HP and LP handles have no gain axis — locked on the 0 dB line, horizontal drag only.
- **Scroll wheel on handle** → adjusts Q or BW ±0.1 per notch.
- Dragging a disabled band auto-enables it.
- Disabled bands render at 50% opacity but remain draggable.
- Each band has a distinct colour: HP/LP = `COLOR_PASS` (#4F8EF7), LoShelf/HiShelf = `COLOR_SHELF` (#A855F7), P1–P4 = `COLOR_PARA` (#F59E0B).
- Handle = 8px filled circle + 12px transparent hit area. Active handle gets a 2px white ring.

New prop added to `Fil4EqCurve`:
```ts
onBandChange?: (bandId: 'hp'|'lp'|'ls'|'hs'|'p0'|'p1'|'p2'|'p3', patch: { freq?: number; gain?: number; q?: number; bw?: number }) => void;
```

Drag events attach to `document` on mousedown (to handle drag-outside-canvas), cleaned up on mouseup.

**`Fil4EqPanel.tsx` — vertical gain faders per band**

Each band column now contains:
- Band label (HP, Lo Shelf, P1–P4, Hi Shelf, LP)
- **Tall vertical gain fader** — `<input type="range">` with CSS `writing-mode: vertical-lr; direction: rtl; height: 80px; width: 20px`. This makes bottom = min, top = max natively in all browsers.
- dB readout below the fader.
- **Enable toggle** button (ON/OFF).
- **Small horizontal Q/BW slider** — secondary, compact, below the toggle.

Frequency is no longer in the band column — it is controlled exclusively via curve handle dragging.

Column layout (conceptual):
```
[ HP ]  [Lo Shelf]  [ P1 ]  [ P2 ]  [ P3 ]  [ P4 ]  [Hi Shelf]  [ LP ]
  |        |          |       |       |       |          |           |    ← vertical gain fader (80px)
 dB       dB         dB      dB      dB      dB         dB          dB   ← readout
 ON        ON         ON      ON      ON      ON         ON          ON   ← toggle
          [Q]        [BW]   [BW]   [BW]   [BW]         [Q]              ← Q/BW slider
```

HP and LP columns have no gain fader (they have no gain parameter) — just freq label, Q slider, and toggle.

Master gain stays as the existing horizontal strip below the curve.

---

### Part 2 — Dub Events Unified with Automation Store

#### Data layer

**`DubRecorder.ts`** — rewritten to write to `useAutomationStore` instead of `pattern.dubLane.events[]`.

On every `subscribeDubRouter` fire event:
1. Determine `patternId` (current pattern) and `channelIndex` (from `event.channelId ?? -1`; -1 = master lane).
2. Look up or create an `AutomationCurve` in the store for `(patternId, channelIndex, parameter)` where `parameter = 'dub.' + event.moveId` (e.g. `'dub.channelMute'`, `'dub.echoThrow'`).
3. Write step point: `addPoint(curveId, event.row, 1)`.

On `subscribeDubRelease` for hold-kind moves:
4. Write release point: `addPoint(curveId, releaseRow, 0)`.

For impulse moves (non-hold), write a single-row pulse: `addPoint(curveId, event.row, 1)` + `addPoint(curveId, event.row + 1, 0)`.

All `dub.*` curves are created with `mode: 'steps'` and `interpolation: 'linear'`.

Dub recording writes on **every fire**, regardless of record-arm state. The record arm button in DubDeckStrip becomes "auto-clear previous events before recording this pass" (i.e. clears existing dub curves for the current pattern before playback starts) rather than a gate on writing.

**`pattern.dubLane` migration:**
- Keep the `dubLane?: DubLane` field on `Pattern` for backwards compatibility.
- In the project load path (`useProjectPersistence.ts`), after loading: iterate all patterns, convert any `dubLane.events[]` into automation store curves using the same `'dub.' + event.moveId` → step-curve logic, then clear `pattern.dubLane`.
- New saves will have no `dubLane` field.

#### Visual layer — no new rendering components

**`AutomationLane.tsx`** — recognise `dub.*` parameters:
- When `parameter.startsWith('dub.')`, extract `moveId = parameter.slice(4)`.
- Colour the curve and points using `MOVE_COLOR[moveId]` (imported from `DubLaneTimeline.tsx` — the constant, not the component).
- Force `mode: 'steps'` for all `dub.*` curves regardless of stored mode.
- Label the lane header with the move name (e.g. "Echo Throw") rather than the raw parameter string.

**Master dub lane — `MasterDubLane.tsx`** (new, ~60 lines):
- Thin wrapper around `GlobalAutomationLane` (which already uses `channelIndex=-1`).
- Renders in a new **48px column to the left of channel 0** in the pattern grid.
- Shows all `dub.*` curves at `channelIndex=-1` (global/master moves).
- Header label: "DUB" with accent-highlight styling.
- Visible only when `dubBus?.enabled`.

**`PatternEditorCanvas.tsx`** — new left slot:
- Add `MASTER_DUB_LANE_WIDTH = 48` constant (0 when dubBus disabled).
- All `channelOffsets[]` shift right by `MASTER_DUB_LANE_WIDTH` when the lane is active.
- Render `<MasterDubLane>` as an absolute overlay at `left: LINE_NUMBER_WIDTH, width: 48, top: scrollY, height: patternLength * rowHeight`.
- Per-channel dub lanes appear automatically via the existing per-channel `AutomationLane` infrastructure — no extra changes needed; they show `dub.channelMute` etc. once those curves exist in the store.

#### Effect command baking

**`AutomationBaker.ts`** — add `dub.*` parameter mappings:

| Parameter | Effect written | Notes |
|---|---|---|
| `dub.channelMute` | `Cxx` volume: value=1 → vol=0, value=0 → vol=full | Per-channel |
| `dub.echoThrow` | `Exx` echo delay command (format-specific) | Per-channel |
| `dub.skankEchoThrow` | Same as echoThrow with shorter delay | Per-channel |
| `dub.echoBuildUp` | `E0x`–`EFx` ascending echo feedback | Global |
| `dub.channelThrow` | `Cxx` volume spike (brief loud) | Per-channel |
| `dub.eqSweep` | `Zxx` filter cutoff (IT/S3M only) | Global |

Other `dub.*` moves that have no direct effect command equivalent are silently skipped by the baker (same as unsupported automation params today).

#### DubDeckStrip cleanup

**`DubDeckStrip.tsx`** — PERFORM tab:
- Remove `<DubLaneTimeline>` render entirely.
- PERFORM tab content: move type selector row + per-channel rows (mute/throw/echo/etc buttons).

**`DubLaneTimeline.tsx`** — deleted. `MOVE_COLOR` constant extracted to `src/engine/dub/moveColors.ts` before deletion so `AutomationLane.tsx` can import it without pulling in the full timeline component.

---

## File Map

| File | Change |
|---|---|
| `src/components/effects/Fil4EqCurve.tsx` | Add draggable band handles overlay, export `freqToX`/`dbToY`, add `onBandChange` prop |
| `src/components/effects/Fil4EqPanel.tsx` | Vertical gain faders, remove freq sliders from columns, wire `onBandChange` |
| `src/engine/dub/DubRecorder.ts` | Rewrite: write step curves to `useAutomationStore` on fire/release |
| `src/engine/dub/moveColors.ts` | New: `MOVE_COLOR` constant extracted from `DubLaneTimeline.tsx` |
| `src/components/tracker/AutomationLane.tsx` | Colour + label `dub.*` parameters using `MOVE_COLOR` |
| `src/components/tracker/MasterDubLane.tsx` | New: wrapper around GlobalAutomationLane, left-column positioned |
| `src/components/tracker/PatternEditorCanvas.tsx` | `MASTER_DUB_LANE_WIDTH` slot, render `MasterDubLane`, shift `channelOffsets` |
| `src/lib/export/AutomationBaker.ts` | Add `dub.*` effect mappings |
| `src/hooks/useProjectPersistence.ts` | Migrate `pattern.dubLane.events[]` → automation store on load |
| `src/components/dub/DubDeckStrip.tsx` | Remove `DubLaneTimeline` from PERFORM tab |
| `src/components/dub/DubLaneTimeline.tsx` | **Deleted** (after `MOVE_COLOR` extracted) |

---

## What Is Not Changing

- `useAutomationStore` schema — no changes to `AutomationCurve` type; `dub.*` are just string parameters.
- `AutomationBaker` format routing — existing format detection unchanged; dub mappings added as new cases.
- `GlobalAutomationLane` — used as-is by `MasterDubLane`; no internal changes.
- The existing per-channel `AutomationLane` infrastructure — dub curves appear automatically once they're in the store.
- `AutomationParameter` type — already `string`, no changes.

---

## Testing

**Automated:**
- `DubRecorder` unit test: fire a mock `DubFireEvent`, assert step curve written to automation store at correct row and channelIndex.
- Migration test: pattern with `dubLane.events[]` loads and produces correct automation curves, `dubLane` cleared.
- `AutomationBaker` test: `dub.channelMute` curve bakes to `Cxx volume=0` at the correct row.

**Manual:**
1. Load `world class dub.mod`, enable dub bus, play. Confirm dub events appear as coloured step curves in per-channel automation lanes.
2. Confirm master dub lane column appears to the left of channel 0 when dub bus is on.
3. In Fil4EQ panel (dub deck EQ tab): drag a band handle on the curve — confirm frequency updates live. Scroll wheel on handle — confirm Q changes.
4. Vertical gain fader: drag up/down — confirm gain updates and curve redraws.
5. Export to XM: confirm `dub.channelMute` events baked as `Cxx` volume-zero rows.
6. Load an old save with `pattern.dubLane.events[]` — confirm migration produces correct automation curves.
