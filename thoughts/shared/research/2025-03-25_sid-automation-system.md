---
date: 2025-03-25
topic: SID Automation System Architecture & Extension
tags: [automation, SID, GT-Ultra, GoatTracker, parameter-mapping]
status: final
---

# SID Automation System — Complete Architecture & Extension Analysis

## Executive Summary

DEViLBOX has a **dual-mode automation system**:

1. **Automation Curves** (per-pattern, per-channel, per-parameter) — Independent curves with points/interpolation
2. **Macro Lanes** (inline tracker columns) — Per-row parameter automation stored in TrackerCell fields

These are **completely separate systems**. SID parameters could be automated via either system, but there's currently **no NKS parameter mapping for GT Ultra SID**, which blocks proper automation discovery/UI.

---

## Part 1: Current Automation Architecture

### 1.1 Automation Curves System

**Files:**
- `src/types/automation.ts` — Type definitions
- `src/stores/useAutomationStore.ts` — State management (Zustand with Immer)
- `src/engine/AutomationPlayer.ts` — Playback engine
- `src/hooks/useChannelAutomationParams.ts` — Parameter resolution via NKS
- `src/components/tracker/AutomationLanes.tsx` (DOM) — Rendering
- `src/pixi/views/tracker/PixiAutomationLanes.tsx` (WebGL) — Rendering

**Data Model:**

```typescript
// Single automation curve
interface AutomationCurve {
  id: string;
  patternId: string;                    // Which pattern
  channelIndex: number;                 // Which channel
  parameter: AutomationParameter;       // NKS param id (e.g., 'tb303.cutoff')
  mode: 'steps' | 'curve' | 'keyframes';
  interpolation: 'linear' | 'exponential' | 'easeIn' | 'easeOut' | 'easeBoth';
  points: AutomationPoint[];            // { row, value (0-1) }
  enabled: boolean;
}

// Store structure (nested maps for fast lookup)
AutomationData = {
  [patternId]: {
    [channelIndex]: {
      [parameter]: AutomationCurve
    }
  }
}
```

**Key Features:**

- **Per-channel parameter selection** — Each channel can automate a different parameter (stored in `useAutomationStore.channelLanes`)
- **0-1 normalized values** — All values are 0.0-1.0 (WASM engines handle conversion to real ranges)
- **Interpolation modes** — Linear, exponential, easing curves
- **Ghost curves** — Previous/next pattern automation shown at 50% alpha for context
- **Lazy curve creation** — Curves only created when first point is added

**Rendering:**

- **DOM** (`AutomationLanes`): 20px wide lane per channel, click to add points, drag to edit, double-click to remove
- **Pixi** (`PixiAutomationLanes`): Same interaction model, rendered to Graphics object each frame

**Playback Integration:**

`AutomationPlayer` reads curves during playback:
```typescript
processPatternRow(row) {
  // For each channel, check both column values AND curve values
  // Column values (TrackerCell.cutoff, etc.) take precedence
  // Then apply to synth via instrument.set(parameter, value)
}
```

### 1.2 Macro Lanes System (Inline Columns)

**Files:**
- `src/components/tracker/MacroLanes.tsx` (DOM)
- `src/pixi/views/tracker/PixiMacroLanes.tsx` (WebGL)

**Data Model:**

Stored **inline in TrackerCell**:
```typescript
// From TrackerCell interface (src/types/tracker.ts)
interface TrackerCell {
  cutoff?: number;        // 0x00-0xFF
  resonance?: number;     // 0x00-0xFF
  envMod?: number;        // 0x00-0xFF
  pan?: number;           // 0x00-0xFF
}
```

**Key Differences from Curves:**

- Values are stored **per-row** in the pattern (not separately)
- Values are **0-255** (not 0-1)
- **Not parameterizable** — Always the same 4 parameters across all synths
- **Column visibility controlled** by `useEditorStore.columnVisibility`
- **Read during playback** via `AutomationPlayer.getColumnValue()` (lines 64-100)

**Interaction:**

- Click to place value at a row
- Drag to draw continuous values
- Shift-click to clear
- SVG path visualization showing all values in lane

---

## Part 2: Parameter Resolution via NKS

### 2.1 How Parameters Are Discovered

`useChannelAutomationParams` hook (lines 1-156) implements parameter discovery:

```typescript
// For a channel, get its instrument
channelIndex → pattern.channels[channelIndex].instrumentId

// Then resolve NKS parameters for that synth
instrumentId → instrument.synthType → getNKSParametersForSynth(synthType)

// Filter to only automatable ones
nksParams.filter(p => p.isAutomatable)

// Group by NKSSection (FILTER, ENVELOPE, SYNTHESIS, etc.)
```

### 2.2 NKS Parameter Structure

`src/midi/performance/synthParameterMaps.ts` contains ALL synth parameters:

```typescript
interface NKSParameter {
  id: string;                    // Unique key (e.g., 'tb303.cutoff')
  name: string;                  // Display name
  section: NKSSection;           // FILTER, ENVELOPE, SYNTHESIS, etc.
  type: NKSParameterType;        // FLOAT, INT, BOOLEAN, SELECTOR
  min: number;
  max: number;
  defaultValue: number;
  unit: string;                  // '%', 'Hz', 'ms', etc.
  formatString: string;          // For display
  page: number;                  // NKS page number (8 params per page)
  index: number;                 // Position on page
  ccNumber?: number;             // MIDI CC for hardware
  isAutomatable: boolean;        // **KEY FLAG** — Must be true to appear in AutomationPanel
}
```

### 2.3 Current SID Support

**TB-303 has full NKS mapping:**
```typescript
TB303_NKS_PARAMETERS = [
  { id: 'tb303.cutoff', isAutomatable: true, ... },
  { id: 'tb303.resonance', isAutomatable: true, ... },
  { id: 'tb303.envMod', isAutomatable: true, ... },
  { id: 'tb303.decay', isAutomatable: true, ... },
  { id: 'tb303.accent', isAutomatable: true, ... },
  { id: 'tb303.tuning', isAutomatable: true, ... },
  { id: 'tb303.waveform', isAutomatable: true, ... },
  { id: 'tb303.volume', isAutomatable: true, ... },
  // + delay, reverb, distortion effects
]
```

**Furnace SID (6581/8580) uses generic `FURNACE_PSG_NKS_PARAMETERS`** — Only 8 basic params, not SID-specific.

**GT Ultra (GoatTracker) — NO NKS MAPPING** — This is the gap that blocks automation UI.

---

## Part 3: GT Ultra Commands & Automatable Parameters

### 3.1 GT Ultra Command System

GT Ultra tracks have **Command/Data columns** for dynamic control:

```
Command | Data | Description
--------|------|--------------------
0x0A    | 00-FF | FiCut — Set filter cutoff (0-255)
0x0B    | 00-F0 | FiRes — Set filter resonance (0-15, in upper nibble)
0x0C    | 00-0F | Vol   — Set volume (0-15)
0x05    | 00-FF | ADset — Set Attack/Decay (4-bit nibbles)
0x06    | 00-FF | SRset — Set Sustain/Release (4-bit nibbles)
0x07    | 00-FF | WvTbl — Wave table pointer
0x08    | 00-FF | PlTbl — Pulse table pointer
0x09    | 00-FF | FiTbl — Filter table pointer
0x0D    | 00-FF | SpTbl — Speed table pointer
0x01-03 | 00-FF | Portamento (up/down/tone)
0x04    | 00-FF | Vibrato (speed/depth)
0x0E    | ??    | Tempo
0x0F    | 00-FF | Gate timer
```

**From `GTVisualMapping.ts` (lines 197-214):**
- `GT_COMMANDS` array with hex, name, description, paramDesc

### 3.2 Per-Tick Automation via Tables

GT Ultra's **table system IS a form of automation**:

```typescript
// From gtuAdapter.ts (lines 188-206)
// After pattern channels, FormatChannel includes 4 "table" channels:
result.push({
  label: 'WAVE',    // Wave table (L=index, R=control byte)
  rows: 255,        // 255 entries = per-row automation
}, ...);
```

**Tables are shared across ALL channels** — They're global modulation sources, not per-channel.

Tables use **two columns (L/R)** but are displayed as `note`/`instrument`:
- **Wave table**: L=table index (0-255), R=waveform control bits
- **Pulse table**: L=PW low byte, R=PW high byte (11-bit PW value)
- **Filter table**: L=cutoff low 3 bits, R=cutoff high 8 bits (11-bit combined)
- **Speed table**: L=speed value, R=unused

### 3.3 SID Register Layout (from GTVisualMapping.ts)

```typescript
// Decode filter registers (0x15-0x18) into friendly structure
interface FilterInfo {
  cutoff: number;          // 11-bit value (0-2047)
  resonance: number;       // 4-bit value (0-15)
  filterVoice1: boolean;   // Routing to voice 1
  filterVoice2: boolean;   // Routing to voice 2
  filterVoice3: boolean;   // Routing to voice 3
  filterExt: boolean;      // Routing to ext input
  lowPass: boolean;
  bandPass: boolean;
  highPass: boolean;
  mute3: boolean;          // Mute voice 3
  volume: number;          // Master volume (0-15)
}
```

### 3.4 ADSR from GTVisualMapping.ts

```typescript
// Attack time in milliseconds for SID attack values 0-15
ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];

// Decay/Release time in milliseconds for SID decay/release values 0-15
DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];

// Encode/decode helpers
decodeAD(byte) → { attack: 4-bits, decay: 4-bits }
decodeSR(byte) → { sustain: 4-bits, release: 4-bits }
```

---

## Part 4: Automatable SID Parameters — Complete List

### 4.1 Per-Instrument Parameters (set via Command column)

```
Parameter            | Command | Data Range | Display Range | Notes
--------------------|---------|------------|---------------|------------------
Filter Cutoff        | 0x0A    | 0x00-0xFF  | 314-2394 Hz   | 8-bit; in table it's 11-bit
Filter Resonance     | 0x0B    | 0x00-0xF0  | 0-15          | 4-bit; upper nibble of res byte
Volume               | 0x0C    | 0x00-0x0F  | 0-15 (db?)    | 4-bit
Attack (ADSR)        | 0x05    | 0xA0       | 0-15 idx      | Upper 4 bits of AD byte
Decay (ADSR)         | 0x05    | 0x0F       | 0-15 idx      | Lower 4 bits of AD byte
Sustain (ADSR)       | 0x06    | 0xF0       | 0-15          | Upper 4 bits of SR byte
Release (ADSR)       | 0x06    | 0x0F       | 0-15 idx      | Lower 4 bits of SR byte
Vibrato Speed        | 0x04    | 0xX0       | 0-15          | Upper nibble of vibrato byte
Vibrato Depth        | 0x04    | 0x0X       | 0-15          | Lower nibble of vibrato byte
Portamento Speed     | 0x01-03 | 0x00-0xFF  | 0-255         | Actual speed value
```

### 4.2 Global/Table Parameters (shared across channels)

```
Parameter            | Table       | Range  | Notes
--------------------|-------------|--------|------------------------------------------
Waveform Control     | Wave (R)    | 0-255  | Bits 4-7: TRI, SAW, PUL, NOI
Pulse Width          | Pulse (L+R) | 0-2047 | 11-bit; PWM modulation table
Filter Cutoff        | Filter (L+R)| 0-2047 | 11-bit; global modulation
Speed                | Speed       | 0-255  | Speed table for dynamics
```

### 4.3 Range Conversions for Automation

Since automation is 0-1 normalized, conversions would be:

| Parameter | 0-1 Range | Real Range | Conversion |
|-----------|-----------|------------|-----------|
| Cutoff    | 0.0-1.0   | 314-2394Hz | cutoffHz = 314 + value * (2394-314); then to 8-bit register |
| Resonance | 0.0-1.0   | 0-15       | resonance = value * 15; shift to upper nibble for register |
| Volume    | 0.0-1.0   | 0-15       | volume = value * 15 |
| Attack    | 0.0-1.0   | 0-15 (table idx) | attackIdx = value * 15 |
| Decay     | 0.0-1.0   | 0-15 (table idx) | decayIdx = value * 15 |
| PW        | 0.0-1.0   | 0-2047     | pw = value * 2047; split to 11-bit |

---

## Part 5: Extension Strategy for SID Automation

### 5.1 Path #1: Macro Lanes (Simplest, Current Implementation)

**Current state:** 4 fixed parameters (cutoff, resonance, envMod, pan) are in TrackerCell.

**Pros:**
- Already integrated into tracking workflow
- Fast to render/interact
- No new UI needed
- Compatible with all formats

**Cons:**
- Limited to 4 parameters
- Always the same 4 across all synths
- Not discoverable (users must know they exist)
- Not grouped by synth type

**Implementation:**
- Add `gtFilterCutoff`, `gtFilterRes`, `gtVolume`, `gtAttack` to TrackerCell
- Add corresponding column visibility flags
- Render in PixiMacroLanes/MacroLanes (parallel lanes)
- Read in AutomationPlayer during playback

### 5.2 Path #2: NKS Parameter Mapping (Recommended)

**Create GT Ultra NKS parameter set** — Enables full automation curve UI.

**Files to create/modify:**

1. **`src/midi/performance/synthParameterMaps.ts`** — Add:
   ```typescript
   export const GTULTRA_NKS_PARAMETERS: NKSParameter[] = [
     // Page 0: Filter
     { id: 'gtultra.filterCutoff', name: 'Filter Cutoff', 
       section: NKSSection.FILTER, type: NKSParameterType.FLOAT,
       min: 0, max: 1, defaultValue: 0.5, isAutomatable: true, ... },
     { id: 'gtultra.filterResonance', name: 'Filter Resonance',
       section: NKSSection.FILTER, type: NKSParameterType.FLOAT,
       min: 0, max: 1, defaultValue: 0, isAutomatable: true, ... },
     { id: 'gtultra.volume', name: 'Master Volume',
       section: NKSSection.OUTPUT, type: NKSParameterType.FLOAT,
       min: 0, max: 1, defaultValue: 0.5, isAutomatable: true, ... },
     // Page 1: ADSR
     { id: 'gtultra.attack', name: 'Attack',
       section: NKSSection.ENVELOPE, type: NKSParameterType.INT,
       min: 0, max: 15, defaultValue: 0, isAutomatable: true, ... },
     { id: 'gtultra.decay', name: 'Decay',
       section: NKSSection.ENVELOPE, type: NKSParameterType.INT,
       min: 0, max: 15, defaultValue: 0, isAutomatable: true, ... },
     { id: 'gtultra.sustain', name: 'Sustain',
       section: NKSSection.ENVELOPE, type: NKSParameterType.INT,
       min: 0, max: 15, defaultValue: 15, isAutomatable: true, ... },
     { id: 'gtultra.release', name: 'Release',
       section: NKSSection.ENVELOPE, type: NKSParameterType.INT,
       min: 0, max: 15, defaultValue: 0, isAutomatable: true, ... },
     // Page 2: Modulation
     { id: 'gtultra.vibratoSpeed', name: 'Vibrato Speed', ... },
     { id: 'gtultra.vibratoDepth', name: 'Vibrato Depth', ... },
     { id: 'gtultra.pwmAmount', name: 'PWM/Pulse Width', ... },
   ];
   
   // Add to synthParameterMap
   getNKSParametersForSynth('gtultra') → GTULTRA_NKS_PARAMETERS
   ```

2. **`src/engine/AutomationPlayer.ts`** — Add GT Ultra handling:
   ```typescript
   private applyParameter(instrumentId, parameter, value, channelIndex) {
     const shortName = parameter.split('.').pop(); // 'gtultra.cutoff' → 'cutoff'
     
     switch (shortName) {
       case 'filterCutoff':
         // Convert 0-1 to GT cutoff command (0x0A data byte)
         // Store in pattern as Command/Data, or send to GT engine
         break;
       case 'filterResonance':
         // Convert 0-1 to resonance (0x0B, upper nibble)
         break;
       // ... etc for all GT parameters
     }
   }
   ```

3. **`src/lib/gtultra/GTVisualMapping.ts`** — Add encoding helpers:
   ```typescript
   export function cutoffValueToCommand(value: number): number {
     // 0-1 → 0x00-0xFF
     return Math.round(value * 255);
   }
   
   export function resonanceValueToCommand(value: number): number {
     // 0-1 → 0x00-0xF0 (upper nibble)
     return (Math.round(value * 15) << 4);
   }
   // ... similar for other params
   ```

**Pros:**
- Full automation curve UI available immediately
- Grouped by NKS section in AutomationPanel
- Discoverable via parameter browser
- Hardware mappable via MIDI CC (if desired)
- Consistent with other synths (TB-303, etc.)

**Cons:**
- Requires mapping every GT parameter properly
- Must handle Command/Data encoding during playback
- Conversion logic needs validation

### 5.3 Path #3: Hybrid (Best of Both)

- Use **Macro Lanes** for fast per-row editing (existing 4 params)
- Add **NKS mapping** for full curve automation
- AutomationPlayer reads both, curves override columns

---

## Part 6: Key Integration Points

### 6.1 Playback Integration (AutomationPlayer.ts)

Current flow:
```typescript
// During pattern row playback
processPatternRow(row) {
  pattern.channels.forEach((channel, channelIndex) => {
    // 1. Check column values first (highest priority)
    const columnValue = getColumnValue(cell, 'cutoff');
    
    // 2. Fall back to curve value
    const curveValue = getCurveValue(patternId, channelIndex, 'cutoff', row);
    
    // 3. Apply to synth
    applyParameter(instrumentId, 'cutoff', value);
  });
}
```

For GT Ultra, the same flow works, but the command must be **either**:
- Stored as a Command/Data in the pattern (live command execution)
- Applied via GT engine API if one exists

### 6.2 Rendering Integration

**DOM + Pixi both need updates:**

`AutomationLanes` (DOM) / `PixiAutomationLanes` (Pixi):
- Per-channel active parameter selected from store
- Per-channel color based on NKS section
- Interpolation between keyframes
- Interactive editing

Both already support this architecture — just need parameter discovery to work.

### 6.3 Parameter Display/Grouping

`useChannelAutomationParams` returns:
```typescript
{
  params: AutomatableParamInfo[],      // All parameters for this channel's instrument
  groups: ParameterGroup[],            // Grouped by NKSSection
  synthType: string,
  instrumentName: string
}
```

`AutomationPanel` uses these to:
- Display parameter buttons grouped by section
- Show which parameters have data (orange indicator)
- Allow clicking to select parameter for editing

---

## Part 7: Macro Lane Implementation Details

### 7.1 Current Macro Lane Storage

TrackerCell stores 4 optional fields (all 0-255):
```typescript
interface TrackerCell {
  cutoff?: number;       // Column visible if columnVisibility.cutoff
  resonance?: number;    // Column visible if columnVisibility.resonance
  envMod?: number;       // Column visible if columnVisibility.envMod
  pan?: number;          // Column visible if columnVisibility.pan
}
```

### 7.2 Macro Lane Rendering

**DOM (MacroLanes.tsx):**
- For each visible parameter, overlay a lane at right of channel
- Lane width = 14px
- Draw SVG path from row values
- Click/drag to edit, shift-click to clear

**Pixi (PixiMacroLanes.tsx):**
- Same lanes computed from width/channelCount
- Drawn to Graphics object each frame
- Direct value 0-255 → pixel mapping

### 7.3 Read During Playback

`AutomationPlayer.getColumnValue()` (lines 58-100):
```typescript
switch (shortName) {
  case 'cutoff':
    rawValue = cell.cutoff;  // 0-255
    return rawValue / 0xff;  // Normalize to 0-1
  // ... same for resonance, envMod, pan
}
```

---

## Part 8: Comparison: Macros vs. Curves vs. Commands

| Feature | Macro Lanes | Automation Curves | GT Commands |
|---------|-------------|-------------------|------------|
| Storage | Inline (TrackerCell) | Separate (AutomationStore) | Pattern cells (Command col) |
| Per-row? | Yes | No (interpolated) | Yes |
| Per-pattern? | Yes | Yes | Yes |
| Per-channel? | Yes | Yes | Yes (but global if table) |
| Parameters | 4 fixed (cutoff, res, envMod, pan) | Any with NKS mapping | 16+ GT commands |
| Interaction | Click/drag/shift-click | Click to add, drag points | Direct hex input |
| Values | 0-255 | 0-1 normalized | Command/data pairs |
| UI Discovery | Hidden (must toggle column) | AutomationPanel selector | Direct in pattern |
| Lookup speed | O(1) — field access | O(log N) — curve lookup + interpolate | O(1) — cell access |

---

## Part 9: Files Requiring Changes for SID Automation

### Core Additions:
1. `src/midi/performance/synthParameterMaps.ts` — GT Ultra NKS params
2. `src/engine/AutomationPlayer.ts` — Handle GT parameter application
3. `src/lib/gtultra/GTVisualMapping.ts` — Encoding/decoding helpers

### Optional (Macro Lane Expansion):
4. `src/types/tracker.ts` — Add GT macro fields to TrackerCell
5. `src/stores/useEditorStore.ts` — Add GT macro column visibility
6. `src/components/tracker/MacroLanes.tsx` / `PixiMacroLanes.tsx` — Render GT lanes

### Documentation:
7. `src/constants/gtultraPresets.ts` — Document parameter ranges
8. Create `docs/GT_ULTRA_AUTOMATION.md` — User guide

---

## Part 10: Validation Checklist

- [ ] GT Ultra NKS parameters grouped by section (FILTER, ENVELOPE, SYNTHESIS, etc.)
- [ ] All parameters marked `isAutomatable: true`
- [ ] AutomationPanel can resolve parameters for GT Ultra channel
- [ ] Automation curves appear in PixiAutomationLanes overlay
- [ ] AutomationPlayer converts 0-1 values to GT command format
- [ ] Playback applies automation values via GT engine API
- [ ] Both DOM and Pixi renderers display curves correctly
- [ ] Per-channel parameter selection works (store.channelLanes)
- [ ] Interpolation modes work (linear, exponential, easing)
- [ ] Presets support GT automation (wave, pulse, filter, speed tables)

---

## Summary

The **automation system is fully prepared** for SID parameter automation. The main gap is **NKS parameter mapping for GT Ultra**. Once that mapping exists:

1. AutomationPanel UI auto-discovers parameters
2. PixiAutomationLanes render curves overlay
3. AutomationPlayer applies values during playback
4. Both DOM and Pixi views work identically

The macro lane system provides an **orthogonal option** for fast per-row editing if full curve automation is too heavyweight. They can coexist — curves override columns at runtime.

**Recommended approach:** Start with NKS mapping (unlocks full UI), then optionally add macro lane helpers for quick in-pattern tweaking.
