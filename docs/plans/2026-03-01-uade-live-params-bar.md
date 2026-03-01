---
date: 2026-03-01
topic: uade-live-params-bar
tags: [uade, controls, pixi, dom]
status: final
---

# UADELiveParamsBar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live Volume and Finetune knobs for UADE enhanced-scan instruments whose chip RAM parameter addresses were auto-discovered by UADEFormatAnalyzer.

**Architecture:** Two parallel UI components — a DOM component (`UADELiveParamsBar`) using React/Tailwind following the `RobHubbardControls` pattern, and a GL component (`PixiUADELiveParams`) using `PixiKnob` directly. Both read initial values from chip RAM on mount and write back via `UADEChipEditor` on each knob change. Both are conditionally rendered based on whether `instrument.uadeChipRam?.sections` has `volume` or `period` addresses.

**Tech Stack:** React, TypeScript, Tailwind CSS, `Knob` component (DOM), `PixiKnob` (GL), `UADEChipEditor`, `UADEEngine`

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `src/components/instruments/controls/RobHubbardControls.tsx` | DOM reference pattern — theme colors, Knob usage, chip editor pattern |
| `src/components/instruments/controls/SidMonControls.tsx` | `updWithChipRam` pattern — chip write callback style |
| `src/pixi/components/PixiKnob.tsx` | GL knob props: `value`, `min`, `max`, `onChange`, `label`, `bipolar`, `formatValue` |
| `src/pixi/views/PixiInstrumentEditor.tsx` | GL integration point — receives `config: Record<string, unknown>` |
| `src/components/instruments/SampleEditor.tsx` | DOM integration point — receives `instrument: InstrumentConfig` |
| `src/engine/uade/UADEChipEditor.ts` | `readBytes(addr, n)`, `readU16(addr)`, `writeU8(addr, v)`, `writeU16(addr, v)` |
| `src/types/instrument.ts` | `InstrumentConfig.uadeChipRam.sections: Record<string, number>` |

## Key Concepts

- **Volume control:** AUDxVOL, uint8, range 0–64. Write: `writeU8(sections.volume, v)`.
- **Finetune control:** AUDxPER, uint16 big-endian. UI shows cents (−128..+127). Write: `writeU16(sections.period, Math.round(basePeriod * 2 ** (−f / 1200)))`. Higher Amiga period = lower pitch, so a positive finetune raises pitch → smaller period value.
- **`basePeriod`:** Read once from chip RAM at mount; all finetune adjustments are relative to this original value (never drift).
- **No `onChange` prop:** These are purely live chip RAM edits, not persisted to `InstrumentConfig`. State is component-local only.
- **`UADEChipEditor` does NOT have `readU8`** — use `readBytes(addr, 1)[0]` for single-byte reads.

---

## Task 1: Create `UADELiveParamsBar.tsx` (DOM)

**Files:**
- Create: `src/components/instruments/controls/UADELiveParamsBar.tsx`

### Step 1: Create the file with this exact content

```tsx
/**
 * UADELiveParamsBar — Live Volume and Finetune knobs for UADE enhanced-scan instruments.
 *
 * Appears when UADEFormatAnalyzer has discovered chip RAM addresses for volume and/or period.
 * All edits are live chip RAM writes — not persisted to InstrumentConfig.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { InstrumentConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface UADELiveParamsBarProps {
  instrument: InstrumentConfig;
}

export const UADELiveParamsBar: React.FC<UADELiveParamsBarProps> = ({ instrument }) => {
  const [volume, setVolume] = useState(64);
  const [finetune, setFinetune] = useState(0);
  const basePeriodRef = useRef(0);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback((): UADEChipEditor => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const sections = instrument.uadeChipRam?.sections;

  // Seed initial values from chip RAM on mount / instrument change
  useEffect(() => {
    if (!sections) return;
    const editor = getEditor();
    if (sections.volume != null) {
      editor.readBytes(sections.volume, 1)
        .then((b) => setVolume(b[0]))
        .catch(() => { /* default 64 */ });
    }
    if (sections.period != null) {
      editor.readU16(sections.period)
        .then((p) => { basePeriodRef.current = p; })
        .catch(() => { /* basePeriod stays 0 */ });
    }
    setFinetune(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument.id]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  if (!sections || (sections.volume == null && sections.period == null)) return null;

  const handleVolumeChange = (v: number) => {
    const rounded = Math.round(v);
    setVolume(rounded);
    if (sections.volume != null) {
      getEditor().writeU8(sections.volume, rounded).catch(console.error);
    }
  };

  const handleFinetuneChange = (f: number) => {
    setFinetune(f);
    if (sections.period != null && basePeriodRef.current > 0) {
      const newPeriod = Math.round(basePeriodRef.current * Math.pow(2, -f / 1200));
      getEditor().writeU16(sections.period, newPeriod).catch(console.error);
    }
  };

  return (
    <div className={`rounded-lg border p-3 ${panelBg} flex items-center gap-6`}>
      <div className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: accent, opacity: 0.7, minWidth: 60 }}>
        Live Params
      </div>
      <div className="flex items-center gap-4">
        {sections.volume != null && (
          <Knob
            value={volume}
            min={0}
            max={64}
            step={1}
            label="Volume"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
            onChange={handleVolumeChange}
          />
        )}
        {sections.period != null && (
          <Knob
            value={finetune}
            min={-128}
            max={127}
            step={1}
            label="Finetune"
            color={knob}
            size="sm"
            bipolar
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`}
            onChange={(v) => handleFinetuneChange(Math.round(v))}
          />
        )}
      </div>
      <div className="text-[9px] font-mono ml-auto"
        style={{ color: dim === '#004444' ? '#006666' : '#224466' }}>
        chip RAM live
      </div>
    </div>
  );
};
```

### Step 2: Verify TypeScript compiles

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | grep UADELiveParams
```

Expected: no errors mentioning UADELiveParamsBar.

### Step 3: Commit

```bash
git add src/components/instruments/controls/UADELiveParamsBar.tsx
git commit -m "feat(uade): add UADELiveParamsBar DOM component — live volume/finetune knobs for enhanced-scan instruments"
```

---

## Task 2: Integrate `UADELiveParamsBar` into `SampleEditor.tsx`

**Files:**
- Modify: `src/components/instruments/SampleEditor.tsx`

The `SampleEditor` renders in this order (in the JSX return):
1. Header (line ~892)
2. Waveform canvas section (line ~985: `{/* ─── Waveform canvas ─────────────────────── */}`)

Insert `UADELiveParamsBar` **between the header and the waveform canvas**.

### Step 1: Add the import

At the top of the file, after the existing imports (around line 46), add:

```typescript
import { UADELiveParamsBar } from './controls/UADELiveParamsBar';
```

### Step 2: Insert the component in JSX

Find the comment `{/* ─── Waveform canvas` (around line 985) and insert above it:

```tsx
      {/* ─── UADE Live Params (enhanced-scan instruments only) ──────── */}
      {(instrument.uadeChipRam?.sections?.volume != null ||
        instrument.uadeChipRam?.sections?.period != null) && (
        <UADELiveParamsBar instrument={instrument} />
      )}

      {/* ─── Waveform canvas ─────────────────────────────────────── */}
```

### Step 3: Verify TypeScript compiles

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | grep -E "SampleEditor|UADELive"
```

Expected: no errors.

### Step 4: Commit

```bash
git add src/components/instruments/SampleEditor.tsx
git commit -m "feat(uade): integrate UADELiveParamsBar into SampleEditor above waveform"
```

---

## Task 3: Create `PixiUADELiveParams.tsx` (GL)

**Files:**
- Create: `src/pixi/views/instruments/PixiUADELiveParams.tsx`

### Step 1: Look up PixiKnob's `defaultValue` prop requirement

```bash
grep -n "defaultValue" /Users/spot/Code/DEViLBOX/src/pixi/components/PixiKnob.tsx | head -5
```

Note the exact prop name (it may be `defaultValue` or omitted — use the actual signature).

### Step 2: Create the file with this exact content

> **Note:** If `PixiKnob` requires a `defaultValue` prop, add `defaultValue={0}` (or `64` for volume). Check the actual interface before writing.

```tsx
/**
 * PixiUADELiveParams — GL (PixiJS) live Volume and Finetune knobs.
 *
 * Standalone component using PixiKnob directly (not SynthPanelLayout, which
 * does not support async chip RAM side effects).
 * Reads initial values from chip RAM on mount; writes back on each knob change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob } from '../../components';
import { UADEChipEditor } from '../../../engine/uade/UADEChipEditor';
import { UADEEngine } from '../../../engine/uade/UADEEngine';

interface PixiUADELiveParamsProps {
  instrumentId: string;          // used as effect dependency so we re-seed on instrument change
  sections: Record<string, number>;
}

export const PixiUADELiveParams: React.FC<PixiUADELiveParamsProps> = ({
  instrumentId,
  sections,
}) => {
  const [volume, setVolume] = useState(64);
  const [finetune, setFinetune] = useState(0);
  const basePeriodRef = useRef(0);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback((): UADEChipEditor => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  // Seed from chip RAM when instrument changes
  useEffect(() => {
    const editor = getEditor();
    if (sections.volume != null) {
      editor.readBytes(sections.volume, 1)
        .then((b) => setVolume(b[0]))
        .catch(() => { /* default 64 */ });
    }
    if (sections.period != null) {
      editor.readU16(sections.period)
        .then((p) => { basePeriodRef.current = p; })
        .catch(() => { /* basePeriod stays 0 */ });
    }
    setFinetune(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentId]);

  const handleVolumeChange = useCallback((v: number) => {
    const rounded = Math.round(v);
    setVolume(rounded);
    if (sections.volume != null) {
      getEditor().writeU8(sections.volume, rounded).catch(console.error);
    }
  }, [sections, getEditor]);

  const handleFinetuneChange = useCallback((f: number) => {
    const rounded = Math.round(f);
    setFinetune(rounded);
    if (sections.period != null && basePeriodRef.current > 0) {
      const newPeriod = Math.round(basePeriodRef.current * Math.pow(2, -rounded / 1200));
      getEditor().writeU16(sections.period, newPeriod).catch(console.error);
    }
  }, [sections, getEditor]);

  const fmtVolume = useCallback((v: number) => Math.round(v).toString(), []);
  const fmtFinetune = useCallback((v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}ct`, []);

  return (
    <pixiContainer
      layout={{
        flexDirection: 'column',
        gap: 6,
        paddingTop: 8,
        paddingLeft: 8,
        paddingRight: 8,
        paddingBottom: 8,
      }}
    >
      <pixiContainer layout={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {sections.volume != null && (
          <PixiKnob
            value={volume}
            min={0}
            max={64}
            defaultValue={64}
            label="VOLUME"
            size="sm"
            formatValue={fmtVolume}
            onChange={handleVolumeChange}
          />
        )}
        {sections.period != null && (
          <PixiKnob
            value={finetune}
            min={-128}
            max={127}
            defaultValue={0}
            label="FINETUNE"
            size="sm"
            bipolar
            formatValue={fmtFinetune}
            onChange={handleFinetuneChange}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
```

### Step 3: Verify TypeScript compiles

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | grep PixiUADE
```

Expected: no errors.

### Step 4: Commit

```bash
git add src/pixi/views/instruments/PixiUADELiveParams.tsx
git commit -m "feat(uade): add PixiUADELiveParams GL component — live volume/finetune knobs"
```

---

## Task 4: Integrate `PixiUADELiveParams` into `PixiInstrumentEditor.tsx`

**Files:**
- Modify: `src/pixi/views/PixiInstrumentEditor.tsx`

`PixiInstrumentEditor` receives `config: Record<string, unknown>` which is the full `InstrumentConfig`. Need to:
1. Import `InstrumentConfig` from `@/types/instrument`
2. Import `PixiUADELiveParams`
3. Extract `uadeChipRam` from `config`
4. Pass `PixiUADELiveParams` after the content area when sections are present

### Step 1: Add imports

At the top of `src/pixi/views/PixiInstrumentEditor.tsx`, add after existing imports:

```typescript
import type { InstrumentConfig } from '@/types/instrument';
import { PixiUADELiveParams } from './instruments/PixiUADELiveParams';
```

### Step 2: Extract uadeChipRam

Inside the component body, after `const layout = getSynthLayout(synthType);`, add:

```typescript
const instrConfig = config as InstrumentConfig;
const uadeChipRam = instrConfig.uadeChipRam;
const hasSections = uadeChipRam?.sections?.volume != null
                 || uadeChipRam?.sections?.period != null;
const instrumentId = instrConfig.id ?? '';
```

### Step 3: Add PixiUADELiveParams to JSX

The current JSX ends with `</pixiContainer>` after the content area. Modify the outer container so that `PixiUADELiveParams` appears as a sibling below the content area.

Find this closing pattern (the last `</pixiContainer>` in the return):
```tsx
      </pixiContainer>
    </pixiContainer>
  );
```

And insert before the final two closing tags:
```tsx
      {/* UADE live params (enhanced-scan instruments only) */}
      {hasSections && (
        <PixiUADELiveParams
          instrumentId={instrumentId}
          sections={uadeChipRam!.sections}
        />
      )}
```

So the final JSX looks like:
```tsx
      {/* Content area */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {layout ? (
          <PixiSynthPanel layout={layout} config={config} onChange={onChange} />
        ) : (
          <pixiContainer ...>
            ...
          </pixiContainer>
        )}
      </pixiContainer>

      {/* UADE live params (enhanced-scan instruments only) */}
      {hasSections && (
        <PixiUADELiveParams
          instrumentId={instrumentId}
          sections={uadeChipRam!.sections}
        />
      )}
    </pixiContainer>
  );
```

### Step 4: Verify TypeScript compiles (full check)

```bash
cd /Users/spot/Code/DEViLBOX && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors. If there are errors, fix them before committing.

### Step 5: Commit

```bash
git add src/pixi/views/PixiInstrumentEditor.tsx
git commit -m "feat(uade): integrate PixiUADELiveParams into PixiInstrumentEditor GL editor"
```

---

## Success Criteria

**Automated:**
- `tsc --noEmit` passes with zero errors

**Manual:**
1. Load a non-native UADE format file (e.g. a Jochen Hippel `.jh`) in enhanced-scan mode
2. Open the instrument in the DOM UI (visual editor). The UADELiveParamsBar should appear **above the waveform canvas** if `uadeChipRam.sections.volume` or `uadeChipRam.sections.period` is set
3. Move the Volume knob — next triggered note should play at the new volume
4. Move the Finetune knob — next triggered note should play at adjusted pitch
5. Open the instrument in the GL UI. The `PixiUADELiveParams` knobs should appear below the SAMPLER panel
6. Knobs function identically to the DOM version
7. Load a native-route format (SidMon, RobHubbard, etc.) — no extra knobs appear
8. Load a Sampler instrument without `uadeChipRam` — no extra knobs appear
