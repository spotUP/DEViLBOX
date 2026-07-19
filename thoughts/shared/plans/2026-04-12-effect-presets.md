---
date: 2026-04-12
topic: per-effect-parameter-presets
tags: [effects, presets, ui]
status: final
---

# Per-Effect Parameter Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every effect in DEViLBOX gets factory parameter presets AND user-saveable presets, selectable via a dropdown in the editor header.

**Architecture:** Add `presets` field to `EffectDescriptor`. Factory presets live in the registry files alongside each effect's descriptor. User presets are saved to localStorage keyed by effect type. A shared `EffectPresetSelector` component reads both sources and applies params via `onUpdateParameters`. The selector is injected into each editor's header via the `VisualEffectEditorWrapper`.

**Tech Stack:** TypeScript, React, Zustand (read-only), localStorage, existing Knob/SectionHeader components.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/engine/registry/EffectDescriptor.ts` | Add `presets?: EffectPreset[]` field |
| `src/types/instrument/effects.ts` | Add `EffectPreset` type |
| `src/engine/registry/EffectRegistry.ts` | Add `getPresets(type)` helper |
| `src/lib/effectPresetStorage.ts` | NEW — localStorage user presets CRUD |
| `src/components/effects/editors/EffectPresetSelector.tsx` | NEW — dropdown UI (factory + user) |
| `src/components/effects/editors/index.tsx` | Inject selector into `VisualEffectEditorWrapper` header |
| `src/engine/registry/effects/tonejs.ts` | Add presets to 31 Tone.js effect descriptors |
| `src/engine/registry/effects/wasm.ts` | Add presets to 81 WASM effect descriptors |
| `src/engine/registry/effects/buzzmachine.ts` | Add presets to 23 Buzzmachine descriptors |
| `src/components/effects/editors/NeuralEditor.tsx` | Add presets for 37 Neural models |
| `src/constants/effectPresets.ts` | DELETE (replaced by registry-driven approach) |
| `src/components/effects/editors/EffectPresetDropdown.tsx` | DELETE (replaced by EffectPresetSelector) |

---

### Task 1: Types + EffectDescriptor field

**Files:**
- Modify: `src/types/instrument/effects.ts`
- Modify: `src/engine/registry/EffectDescriptor.ts`
- Modify: `src/engine/registry/EffectRegistry.ts`

- [ ] **Step 1: Add EffectPreset type**

In `src/types/instrument/effects.ts`, add at the end (before closing):

```typescript
/** Per-effect parameter preset (factory or user-saved) */
export interface EffectPreset {
  name: string;
  params: Record<string, number | string>;
}
```

- [ ] **Step 2: Add presets field to EffectDescriptor**

In `src/engine/registry/EffectDescriptor.ts`, add after `bpmSyncParams`:

```typescript
  /** Factory presets — named parameter configurations */
  presets?: import('@typedefs/instrument').EffectPreset[];
```

- [ ] **Step 3: Add getPresets helper to EffectRegistry**

In `src/engine/registry/EffectRegistry.ts`, add a static method:

```typescript
static getPresets(type: string): EffectPreset[] {
  const desc = EffectRegistry.get(type);
  return desc?.presets ?? [];
}
```

Import `EffectPreset` from `@typedefs/instrument`.

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/types/instrument/effects.ts src/engine/registry/EffectDescriptor.ts src/engine/registry/EffectRegistry.ts
git commit -m "feat: add EffectPreset type and presets field to EffectDescriptor"
```

---

### Task 2: User preset storage (localStorage)

**Files:**
- Create: `src/lib/effectPresetStorage.ts`

- [ ] **Step 1: Create the storage module**

```typescript
/**
 * Per-effect user preset storage — localStorage CRUD.
 * Key: 'devilbox:fx-presets:<effectType>' → JSON array of EffectPreset.
 */

import type { EffectPreset } from '@typedefs/instrument';

const KEY_PREFIX = 'devilbox:fx-presets:';

export function getUserPresets(effectType: string): EffectPreset[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + effectType);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveUserPreset(effectType: string, preset: EffectPreset): void {
  const presets = getUserPresets(effectType);
  // Replace if name exists, else append
  const idx = presets.findIndex(p => p.name === preset.name);
  if (idx >= 0) presets[idx] = preset;
  else presets.push(preset);
  localStorage.setItem(KEY_PREFIX + effectType, JSON.stringify(presets));
}

export function deleteUserPreset(effectType: string, name: string): void {
  const presets = getUserPresets(effectType).filter(p => p.name !== name);
  localStorage.setItem(KEY_PREFIX + effectType, JSON.stringify(presets));
}
```

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/lib/effectPresetStorage.ts
git commit -m "feat: per-effect user preset localStorage storage"
```

---

### Task 3: EffectPresetSelector UI component

**Files:**
- Create: `src/components/effects/editors/EffectPresetSelector.tsx`

- [ ] **Step 1: Create the selector component**

A dropdown that shows:
- Factory presets (from EffectRegistry) — non-deletable
- User presets (from localStorage) — deletable
- "Save Current" button at the bottom
- Name input dialog for saving

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import { getUserPresets, saveUserPreset, deleteUserPreset } from '@lib/effectPresetStorage';
import type { EffectPreset, EffectConfig } from '@typedefs/instrument';
import { Save, Trash2, X } from 'lucide-react';

interface Props {
  effect: EffectConfig;
  onApply: (params: Record<string, number | string>) => void;
  color?: string;
}

export const EffectPresetSelector: React.FC<Props> = ({ effect, onApply, color = '#6366f1' }) => {
  const [open, setOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [userPresets, setUserPresets] = useState<EffectPreset[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const effectType = effect.type ?? '';

  const factoryPresets = EffectRegistry.getPresets(effectType);

  // Refresh user presets when opening
  useEffect(() => {
    if (open) setUserPresets(getUserPresets(effectType));
  }, [open, effectType]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSave(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasPresets = factoryPresets.length > 0 || userPresets.length > 0;

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveUserPreset(effectType, { name: saveName.trim(), params: { ...effect.parameters } });
    setUserPresets(getUserPresets(effectType));
    setSaveName('');
    setShowSave(false);
  };

  const handleDelete = (name: string) => {
    deleteUserPreset(effectType, name);
    setUserPresets(getUserPresets(effectType));
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-0.5 text-[9px] uppercase font-bold rounded-full border transition-colors"
        style={{ color, borderColor: `${color}60`, background: open ? `${color}15` : 'transparent' }}
      >
        Presets ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
          {/* Factory Presets */}
          {factoryPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-text-muted font-bold uppercase tracking-wider bg-dark-bgTertiary">
                Factory
              </div>
              {factoryPresets.map(p => (
                <button key={p.name} onClick={() => { onApply(p.params); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-text-primary hover:bg-dark-bgHover transition-colors">
                  {p.name}
                </button>
              ))}
            </>
          )}
          {/* User Presets */}
          {userPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-text-muted font-bold uppercase tracking-wider bg-dark-bgTertiary border-t border-dark-border">
                User
              </div>
              {userPresets.map(p => (
                <div key={p.name} className="flex items-center hover:bg-dark-bgHover group">
                  <button onClick={() => { onApply(p.params); setOpen(false); }}
                    className="flex-1 text-left px-3 py-1.5 text-[11px] text-text-primary">
                    {p.name}
                  </button>
                  <button onClick={() => handleDelete(p.name)}
                    className="px-2 text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </>
          )}
          {/* Save Current */}
          <div className="border-t border-dark-border">
            {showSave ? (
              <div className="p-2 flex gap-1">
                <input value={saveName} onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Preset name" autoFocus
                  className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1 text-[10px] text-text-primary" />
                <button onClick={handleSave} className="px-2 py-1 bg-accent-primary/20 text-accent-primary rounded text-[10px]">
                  <Save size={10} />
                </button>
                <button onClick={() => setShowSave(false)} className="px-1 text-text-muted">
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSave(true)}
                className="w-full text-left px-3 py-1.5 text-[10px] text-accent-primary hover:bg-dark-bgHover transition-colors flex items-center gap-1">
                <Save size={10} /> Save Current
              </button>
            )}
          </div>
          {/* No presets message */}
          {!hasPresets && !showSave && (
            <div className="px-3 py-3 text-[10px] text-text-muted text-center">
              No presets yet — save your first!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/components/effects/editors/EffectPresetSelector.tsx
git commit -m "feat: EffectPresetSelector — factory + user preset dropdown"
```

---

### Task 4: Inject selector into VisualEffectEditorWrapper

**Files:**
- Modify: `src/components/effects/editors/index.tsx`

- [ ] **Step 1: Import EffectPresetSelector**

Add import at the top of index.tsx:

```typescript
import { EffectPresetSelector } from './EffectPresetSelector';
```

- [ ] **Step 2: Add selector to the pedal header**

In `VisualEffectEditorWrapper`, after the LED indicator / status text `<p>` tag, add:

```tsx
<EffectPresetSelector
  effect={effect}
  onApply={(params) => onUpdateParameters?.(params)}
  color={enc.accent}
/>
```

- [ ] **Step 3: Run type-check + test visually in browser**

Verify the dropdown shows "No presets yet — save your first!" for any effect (since we haven't added factory presets yet). Verify saving/loading user presets works.

- [ ] **Step 4: Commit**

```bash
git add src/components/effects/editors/index.tsx
git commit -m "feat: inject EffectPresetSelector into effect editor header"
```

---

### Task 5: Delete old hardcoded files

**Files:**
- Delete: `src/constants/effectPresets.ts`
- Delete: `src/components/effects/editors/EffectPresetDropdown.tsx`

- [ ] **Step 1: Delete files and remove any imports**

```bash
rm src/constants/effectPresets.ts src/components/effects/editors/EffectPresetDropdown.tsx
```

Grep for and remove any remaining imports of these files.

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old hardcoded effect preset files"
```

---

### Task 6: Factory presets — Tone.js effects (31 effects)

**Files:**
- Modify: `src/engine/registry/effects/tonejs.ts`

- [ ] **Step 1: Add presets to each Tone.js effect descriptor**

For each of the 31 effects in tonejs.ts, add a `presets: [...]` array to its descriptor. 3-5 presets per effect. Group by category:

**Dynamics:** Compressor (Gentle Glue / Punchy / Brick Wall / Transparent), EQ3 (Bass Boost / Treble Boost / V-Shape / Vocal Presence / Flat)

**Distortion:** Distortion (Subtle / Warm Crunch / Heavy / Fuzz), BitCrusher (8-Bit / 4-Bit Lo-Fi / Telephone / Extreme), Chebyshev (Warm / Gritty / Extreme), TapeSaturation (Subtle / Warm Tape / Hot / Destroyed)

**Reverb:** Reverb (Small Room / Large Hall / Cathedral / Plate), JCReverb (Tight / Medium / Large)

**Delay:** Delay (Slapback / Quarter Note / Dotted Eighth / Long Ambient), FeedbackDelay (Slapback / Echo / Dub / Runaway), PingPongDelay (Tight / Wide / Spacious)

**Modulation:** Chorus (Subtle / Lush / 80s Synth), Phaser (Slow Sweep / Jet / Subtle), Tremolo (Gentle / Surf / Helicopter), Vibrato (Subtle / Classic / Wide), AutoPanner (Slow / Fast / Subtle)

**Filter:** Filter (Dark / Bright / Mid Scoop / Telephone), AutoFilter (Slow Wah / Fast Wobble / Subtle), AutoWah (Funk / Quack / Subtle)

**Spatial:** StereoWidener (Subtle / Wide / Ultra), PitchShift (Octave Up / Down / Fifth / Detune), FrequencyShifter (Subtle / Robot / Metallic)

**Creative:** VinylNoise (Clean / Old Record / Destroyed), BiPhase, DubFilter, AmbientDelay, SpaceEcho, SidechainCompressor, MoogFilter

Each preset is `{ name: 'Name', params: { key: value, ... } }`. Use the `getDefaultParameters()` output as the starting point and vary 1-3 params per preset.

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/engine/registry/effects/tonejs.ts
git commit -m "feat: factory presets for 31 Tone.js effects"
```

---

### Task 7: Factory presets — WASM effects (81 effects)

**Files:**
- Modify: `src/engine/registry/effects/wasm.ts`

- [ ] **Step 1: Add presets to each WASM effect descriptor**

81 WASM effects across categories: dynamics (20+), distortion/saturation (10+), modulation (6+), reverb/delay (15+), EQ/filter (10+), stereo/spatial (5+), creative (5+). 3-4 presets per effect.

Since many WASM effects share parameter patterns within a category (e.g. all compressors have threshold/ratio/attack/release), define reusable preset templates per category, then customize per effect.

Pattern for dynamics effects:
```typescript
presets: [
  { name: 'Gentle', params: { threshold: -20, ratio: 2, attack: 10, release: 100 } },
  { name: 'Punchy', params: { threshold: -15, ratio: 6, attack: 1, release: 50 } },
  { name: 'Heavy', params: { threshold: -10, ratio: 12, attack: 0.5, release: 30 } },
],
```

Pattern for reverb effects:
```typescript
presets: [
  { name: 'Small Room', params: { decay: 0.3, damping: 0.6, mix: 0.2 } },
  { name: 'Large Hall', params: { decay: 0.7, damping: 0.3, mix: 0.4 } },
  { name: 'Infinite', params: { decay: 0.95, damping: 0.1, mix: 0.5 } },
],
```

Read each effect's `getDefaultParameters()` to know the exact param keys and ranges. Vary meaningfully — each preset should sound distinctly different.

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/engine/registry/effects/wasm.ts
git commit -m "feat: factory presets for 81 WASM effects"
```

---

### Task 8: Factory presets — Buzzmachine effects (23 effects)

**Files:**
- Modify: `src/engine/registry/effects/buzzmachine.ts`

- [ ] **Step 1: Add presets from BUZZMACHINE_INFO**

Buzzmachine params are indexed (0, 1, 2...). Use `BUZZMACHINE_INFO[machineType].parameters` to get param names and ranges. Create 3 presets per effect: a mild, moderate, and extreme version.

For each machine, generate presets like:
```typescript
presets: [
  { name: 'Mild', params: { '0': lowVal, '1': midVal, ... } },
  { name: 'Medium', params: { '0': midVal, '1': midVal, ... } },
  { name: 'Extreme', params: { '0': highVal, '1': highVal, ... } },
],
```

Use the defaultValue as "medium" and calculate mild (25% of range) and extreme (85% of range) from min/max.

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/engine/registry/effects/buzzmachine.ts
git commit -m "feat: factory presets for 23 Buzzmachine effects"
```

---

### Task 9: Factory presets — Neural/GuitarML (37 models)

**Files:**
- Modify: `src/components/effects/editors/NeuralEditor.tsx`

- [ ] **Step 1: Add model-specific presets**

Neural presets are tricky — they depend on the model's parameter schema (PEDAL_OVERDRIVE, AMP, AMP_EQ). Since there are 37 models, create schema-level presets that apply to all models sharing that schema:

For PEDAL_OVERDRIVE (most pedals):
```typescript
{ name: 'Clean Boost', params: { drive: 15, tone: 50, level: 70, dryWet: 100 } },
{ name: 'Light Crunch', params: { drive: 40, tone: 55, level: 60, dryWet: 100 } },
{ name: 'Full Drive', params: { drive: 75, tone: 45, level: 50, dryWet: 100 } },
{ name: 'Max Gain', params: { drive: 100, tone: 40, level: 40, dryWet: 100 } },
```

For AMP:
```typescript
{ name: 'Clean', params: { drive: 10, presence: 50, level: 70, dryWet: 100 } },
{ name: 'Edge of Breakup', params: { drive: 40, presence: 60, level: 55, dryWet: 100 } },
{ name: 'Cranked', params: { drive: 80, presence: 50, level: 45, dryWet: 100 } },
```

For AMP_EQ (bass amps):
```typescript
{ name: 'Flat Clean', params: { drive: 10, bass: 50, mid: 50, treble: 50, presence: 50, level: 70, dryWet: 100 } },
{ name: 'Scooped', params: { drive: 40, bass: 70, mid: 20, treble: 60, presence: 40, level: 55, dryWet: 100 } },
{ name: 'Mid Push', params: { drive: 50, bass: 40, mid: 70, treble: 50, presence: 60, level: 50, dryWet: 100 } },
```

Since Neural effects aren't in the EffectRegistry (they use `neuralModelIndex`), add these as constants in `NeuralEditor.tsx` and render them in the EffectPresetSelector by passing them as an additional prop or reading them from a constant.

- [ ] **Step 2: Run type-check**

- [ ] **Step 3: Commit**

```bash
git add src/components/effects/editors/NeuralEditor.tsx
git commit -m "feat: factory presets for Neural/GuitarML effects"
```

---

### Task 10: Pixi/GL mirror (if needed)

**Files:**
- Check: `src/pixi/dialogs/PixiMasterEffectsModal.tsx`

- [ ] **Step 1: Verify Pixi effects modal uses the same editor wrapper**

Check if the Pixi/GL master effects UI uses `VisualEffectEditorWrapper` (which now includes the preset selector). If it uses a separate implementation, add the selector there too.

- [ ] **Step 2: Run type-check + visual test in both DOM and GL modes**

- [ ] **Step 3: Commit if changes needed**

---

## Verification

After all tasks:
1. Load any song → add Compressor → see "Presets ▾" in the editor header
2. Click → see factory presets (Gentle Glue, Punchy, etc.)
3. Select "Punchy" → threshold/ratio/attack/release all change
4. Tweak knobs to custom values → click "Save Current" → enter name → saved
5. Reload page → add Compressor again → see your saved preset under "User" section
6. Delete user preset → gone
7. Repeat for Buzzmachine effect → see Mild/Medium/Extreme presets
8. Repeat for Neural effect → see Clean Boost/Light Crunch/etc.
9. Check Pixi/GL mode → same presets visible
