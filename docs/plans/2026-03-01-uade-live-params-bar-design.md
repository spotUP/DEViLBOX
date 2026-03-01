---
date: 2026-03-01
topic: uade-live-params-bar
tags: [uade, controls, pixi, dom]
status: final
---

# UADELiveParamsBar Design

## Goal

For UADE enhanced-scan instruments whose parameter addresses were discovered by
`UADEFormatAnalyzer` (i.e. `uadeChipRam.sections.volume` and/or
`uadeChipRam.sections.period` are set), expose live Volume and Finetune knobs
that write back to chip RAM via `UADEChipEditor`. Both UIs need the component:

- **DOM UI** — React + Tailwind, visual editor style (matches RobHubbardControls)
- **GL UI** — PixiJS knobs via `PixiKnob`, rendered in `PixiInstrumentEditor`

## Context

### Discovered addresses (from UADEFormatAnalyzer)

```typescript
instrument.uadeChipRam = {
  sections: {
    volume:    <chip RAM byte addr>,  // AUDxVOL, uint8, 0–64
    period:    <chip RAM word addr>,  // AUDxPER, uint16 BE, Amiga period
    samplePtr: <chip RAM addr>,
  },
  ...
}
```

Native-route formats (SidMon, Fred, FC, etc.) keep their existing dedicated
controls — `UADELiveParamsBar` only appears for enhanced-scan instruments where
`UADEFormatAnalyzer` populated these sections.

### Write-back pattern (from RobHubbardControls / SidMonControls)

1. Read initial value from chip RAM on mount via `UADEChipEditor.readBytes()`
2. On knob change: `UADEChipEditor.writeU8(sections.volume, v)` or
   `UADEChipEditor.writeU16(sections.period, newPeriod)`
3. Changes take effect on the next note trigger — no module reload needed

### Two controls

| Knob | Range | Chip RAM | Conversion |
|------|-------|----------|------------|
| Volume | 0–64 (integer) | `sections.volume` | `writeU8(addr, v)` |
| Finetune | −128..+127 ct | `sections.period` | `writeU16(addr, round(base * 2^(−f/1200)))` |

Period direction: higher Amiga period = lower pitch, so `newPeriod = basePeriod * 2^(−finetune/1200)`.

---

## Component 1: `UADELiveParamsBar` (DOM)

**File:** `src/components/instruments/controls/UADELiveParamsBar.tsx`

React component following the `RobHubbardControls` visual editor style:
- Dark panel (`bg-[#000e1a] border-blue-900/30` or cyan variant)
- Theme accent colors from `useThemeStore`
- `Knob` components from `@components/controls/Knob`
- `UADEChipEditor` for reads/writes

**Props:**
```typescript
interface UADELiveParamsBarProps {
  instrument: InstrumentConfig;
}
```

No `onChange` needed — these are pure chip RAM live edits, not persisted to
`InstrumentConfig`. Local state only.

**State:**
- `volume: number` — seeded from `readU8(sections.volume)` on mount, defaults to 64
- `basePeriod: number` — seeded from `readU16(sections.period)` on mount; held
  as reference so finetune is always relative to original pitch
- `finetune: number` — cents offset, initialized to 0

**Integration:** `SampleEditor.tsx` — rendered as a sibling above the waveform
canvas, conditioned on `instrument.uadeChipRam?.sections` having at least one
of `volume` or `period`. No routing changes in `UnifiedInstrumentEditor`.

---

## Component 2: `PixiUADELiveParams` (GL)

**File:** `src/pixi/views/instruments/PixiUADELiveParams.tsx`

A standalone PixiJS React component (not a `SynthPanelLayout` descriptor —
those are purely declarative and don't support async chip RAM side effects).
Uses `PixiKnob` directly.

**Props:**
```typescript
interface PixiUADELiveParamsProps {
  sections: Record<string, number>;  // uadeChipRam.sections
}
```

Same state and write-back logic as the DOM version.

**Integration:** `PixiInstrumentEditor.tsx` — extract `uadeChipRam` from
`config` (which is the full instrument, cast to `Record<string, unknown>`).
Render `PixiUADELiveParams` below the existing `PixiSynthPanel` when
`uadeChipRam?.sections` has `volume` or `period`.

```tsx
// In PixiInstrumentEditor.tsx
const uadeChipRam = (config as InstrumentConfig).uadeChipRam;
const hasSections = uadeChipRam?.sections?.volume != null
                 || uadeChipRam?.sections?.period != null;
...
{hasSections && <PixiUADELiveParams sections={uadeChipRam!.sections} />}
```

---

## Data Flow

```
Mount
  └─ UADEChipEditor.readBytes(sections.volume, 1) → seed volume (default 64)
  └─ UADEChipEditor.readBytes(sections.period, 2) → seed basePeriod (big-endian)

Volume knob → v (0–64)
  └─ setVolume(v)
  └─ UADEChipEditor.writeU8(sections.volume, v)

Finetune knob → f (cents, −128..+127)
  └─ setFinetune(f)
  └─ newPeriod = Math.round(basePeriod * 2 ** (−f / 1200))
  └─ UADEChipEditor.writeU16(sections.period, newPeriod)
```

---

## What Is NOT Changed

- Native-route UADE formats keep their existing dedicated controls
- `InstrumentConfig` is not modified — purely live chip RAM edits
- `SYNTH_LAYOUTS` / `SynthPanelLayout` system is not modified
- `SampleEditor.tsx` waveform editing is unchanged

---

## Success Criteria

**Automated:** `tsc --noEmit` passes

**Manual:**
- Load a non-native UADE format (e.g. `.jh` Jochen Hippel) in enhanced-scan mode
- DOM editor: Volume + Finetune knobs appear above waveform; moving Volume knob → next note plays at new volume
- GL editor: same two knobs appear below the standard SAMPLER panel; functional
- Native-route formats (SidMon, Fred, etc.) are unaffected
- Instruments without discovered sections show no extra controls
