# DEViLBOX Tracker Improvement Plan
## Based on OpenMPT Wiki Deep Analysis

**Research Date:** 2026-02-04
**Source:** https://wiki.openmpt.org/Main_Page
**Scope:** Comprehensive tracker enhancement across all manifolds

---

## Executive Summary

After deep analysis of the OpenMPT wiki and comparison with DEViLBOX's current implementation, I've identified **47 improvement opportunities** across 9 categories. The improvements range from critical missing effects to advanced features that would position DEViLBOX as a professional-grade web tracker.

### Current State Assessment
DEViLBOX has a solid foundation with:
- ✅ 36+ FT2 effects implemented
- ✅ XM/MOD/IT/S3M format support
- ✅ Tick-based architecture
- ✅ Automation system
- ✅ MIDI integration
- ✅ TB-303 specific features (accent, slide)

### Key Gaps Identified
- ❌ Missing IT-specific effects (New Note Actions, filter macros)
- ❌ No Zxx MIDI macro system
- ❌ Limited envelope system (no pitch/filter envelopes)
- ❌ No tempo swing/groove templates
- ❌ Missing Parameter Control Events
- ❌ No visual parameter editor
- ❌ Limited playback compatibility modes

---

## Category 1: Effect Commands Enhancement

### Priority: CRITICAL

#### 1.1 Missing IT Format Effects

| Effect | Code | Description | Implementation Effort |
|--------|------|-------------|----------------------|
| **Set Filter Cutoff** | Zxx (Z00-Z7F) | Direct filter cutoff control | Medium |
| **Set Filter Resonance** | Zxx (Z80-Z8F) | Direct resonance control | Medium |
| **Filter Mode** | Z90-Z9F | Switch lowpass/highpass | Low |
| **S70-S76** | Sxx | Past Note/NNA controls | High |
| **S77-S7C** | Sxx | Envelope on/off controls | Medium |
| **Vxx** | Vxx | Global Volume (00h-80h) | Low |
| **Smooth MIDI Macro** | \xx | Interpolated Zxx | Medium |

#### 1.2 Missing S3M Effects

| Effect | Code | Description |
|--------|------|-------------|
| **Mxx** | Mxx | Set Channel Volume |
| **Fine Porta** | EFx/EEx | Extra Fine Portamento |
| **Oxx** | Oxx | Sample Offset (high byte) |

#### 1.3 Missing MPTM Effects (Advanced)

| Effect | Code | Description |
|--------|------|-------------|
| **Finetune** | +xx | ±1 semitone fine adjustment |
| **Smooth Finetune** | *xx | Interpolated finetune |
| **Parameter Extension** | #xx | Stack effects across rows |
| **Sample Cue Points** | o0x | Jump to cue point |

#### 1.4 Implementation Plan

```typescript
// src/engine/EffectCommands.ts - Add new effect types

export enum ExtendedEffect {
  // Zxx Macros (IT/MPTM)
  FILTER_CUTOFF = 0x5A00,    // Z00-Z7F
  FILTER_RESONANCE = 0x5A80, // Z80-Z8F
  FILTER_MODE = 0x5A90,      // Z90-Z9F
  PLUGIN_DRYWET = 0x5AA0,    // ZA0-ZAF

  // S7x Past Note Actions
  NNA_CUT_NOTE = 0x0E70,
  NNA_CONTINUE = 0x0E71,
  NNA_NOTE_OFF = 0x0E72,
  NNA_NOTE_FADE = 0x0E73,
  DNC_NOTE = 0x0E74,
  DNC_SAMPLE = 0x0E75,
  DNC_INSTRUMENT = 0x0E76,

  // Envelope Controls
  ENV_VOL_OFF = 0x0E77,
  ENV_VOL_ON = 0x0E78,
  ENV_PAN_OFF = 0x0E79,
  ENV_PAN_ON = 0x0E7A,
  ENV_PITCH_OFF = 0x0E7B,
  ENV_PITCH_ON = 0x0E7C,
}
```

---

## Category 2: Zxx MIDI Macro System

### Priority: HIGH

OpenMPT's Zxx macro system is extremely powerful. DEViLBOX should implement:

#### 2.1 Parametered Macros (Z00-Z7F)

```typescript
// src/engine/ZxxMacroProcessor.ts

interface ZxxMacro {
  type: 'filter' | 'plugin' | 'midi';
  messages: number[];  // MIDI bytes or internal commands
}

const DEFAULT_MACROS: ZxxMacro[] = [
  // SF0: Filter cutoff sweep
  { type: 'filter', messages: [0xF0, 0xF0, 0x00, 'z'] },
  // SF1: Filter resonance sweep
  { type: 'filter', messages: [0xF0, 0xF0, 0x01, 'z'] },
];

// 16 parametered macros, selectable via SFx/EFx
export class ZxxMacroProcessor {
  private activeMacro: number = 0;

  selectMacro(index: number): void {
    this.activeMacro = Math.min(15, Math.max(0, index));
  }

  executeMacro(value: number): FilterCommand | PluginCommand | MIDICommand {
    const macro = this.macros[this.activeMacro];
    // Execute macro with 'z' replaced by value (0x00-0x7F)
  }
}
```

#### 2.2 Fixed Macros (Z80-ZFF)

```typescript
// 128 fixed macros for quick parameter access
const FIXED_MACROS: ZxxMacro[] = [
  // Z80-Z8F: Resonance (default)
  ...Array(16).fill({ type: 'filter', messages: [0xF0, 0xF0, 0x01, 'z'] }),
  // Z90-ZFF: Customizable (128 slots)
  ...Array(112).fill(null),
];
```

#### 2.3 Internal Filter Messages

| Message | Effect |
|---------|--------|
| F0 F0 00 xx | Set cutoff (00h-7Fh) |
| F0 F0 01 xx | Set resonance (00h-7Fh) |
| F0 F0 02 00 | Lowpass filter mode |
| F0 F0 02 10 | Highpass filter mode |
| F0 F0 03 xx | Plugin dry/wet ratio |

---

## Category 3: Instrument System Enhancement

### Priority: HIGH

#### 3.1 New Note Actions (NNA)

Currently missing. Critical for polyphonic playback:

```typescript
// src/types/instrument.ts

export enum NewNoteAction {
  CUT = 0,       // Instantly stop old note
  CONTINUE = 1,  // Move to background, keep playing
  NOTE_OFF = 2,  // Release sustain loops
  NOTE_FADE = 3, // Gradual fade-out
}

export enum DuplicateNoteCheck {
  DISABLED = 0,
  NOTE = 1,
  SAMPLE = 2,
  INSTRUMENT = 3,
  PLUGIN = 4,
}

interface InstrumentConfig {
  nna: NewNoteAction;
  dnc: DuplicateNoteCheck;
  dna: NewNoteAction;  // Duplicate Note Action
  fadeOut: number;     // 32768 / value = ticks to fade
}
```

#### 3.2 Enhanced Envelope System

OpenMPT has three envelope types. DEViLBOX currently has basic volume automation:

```typescript
// src/types/instrument.ts

interface Envelope {
  points: EnvelopePoint[];
  loopStart?: number;
  loopEnd?: number;
  sustainStart?: number;
  sustainEnd?: number;
  releaseNode?: number;
  carry: boolean;      // Continue from previous note
}

interface InstrumentEnvelopes {
  volume: Envelope;    // 0-100%
  panning: Envelope;   // ±32 from center
  pitch: Envelope;     // ±16 semitones OR filter cutoff
}
```

#### 3.3 Pitch/Pan Separation

```typescript
interface PitchPanSeparation {
  enabled: boolean;
  separation: number;  // -32 to +32
  center: number;      // MIDI note (60 = C4)
}
```

#### 3.4 Random Variation (Humanization)

```typescript
interface RandomVariation {
  volumeSwing: number;     // ± percentage
  panSwing: number;        // Random pan shift
  cutoffSwing?: number;    // MPTM only
  resonanceSwing?: number; // MPTM only
}
```

---

## Category 4: Tempo & Groove System

### Priority: MEDIUM-HIGH

#### 4.1 Tempo Modes

```typescript
// src/types/tracker.ts

export enum TempoMode {
  CLASSIC = 'classic',      // 24 ticks/beat (traditional)
  ALTERNATIVE = 'alt',      // 60 ticks/beat
  MODERN = 'modern',        // No rounding errors, fractional BPM
}
```

#### 4.2 Tempo Swing / Groove Templates

This is a killer feature OpenMPT has that DEViLBOX lacks:

```typescript
// src/engine/TempoSwing.ts

interface GrooveTemplate {
  name: string;
  rowDurations: number[];  // Relative durations per row in beat
}

const BUILT_IN_GROOVES: GrooveTemplate[] = [
  { name: 'Straight', rowDurations: [1, 1, 1, 1] },
  { name: 'Shuffle 50%', rowDurations: [1.5, 0.5, 1.5, 0.5] },
  { name: 'Shuffle 66%', rowDurations: [1.66, 0.34, 1.66, 0.34] },
  { name: 'Triplet Feel', rowDurations: [1.33, 0.67, 1, 1] },
  { name: 'Lazy Swing', rowDurations: [1.4, 0.6, 1.4, 0.6] },
  { name: 'Human 1', rowDurations: [1.05, 0.98, 1.02, 0.95] },
];

export class TempoSwingProcessor {
  private groove: GrooveTemplate;
  private rowsPerBeat: number;

  getRowDuration(rowInBeat: number): number {
    return this.groove.rowDurations[rowInBeat % this.groove.rowDurations.length];
  }
}
```

#### 4.3 Tap Tempo

Already in OpenMPT, should add to DEViLBOX toolbar.

---

## Category 5: Pattern Editor Enhancements

### Priority: HIGH

#### 5.1 Advanced Paste Operations

OpenMPT has 5 paste modes. DEViLBOX should add:

```typescript
// src/hooks/tracker/BlockOperations.ts

export enum PasteMode {
  OVERWRITE = 'overwrite',        // Replace all
  MIX = 'mix',                    // Only overwrite empty cells
  MIX_IT_STYLE = 'mix_it',        // Leave effects untouched
  FLOOD = 'flood',                // Paste until pattern end
  PUSH_FORWARD = 'push',          // Insert, push existing down
}

export function pasteBlock(
  pattern: Pattern,
  clipboard: TrackerCell[][],
  mode: PasteMode,
  startRow: number,
  startChannel: number
): Pattern {
  // Implementation based on mode
}
```

#### 5.2 Interpolation System

Critical for smooth automation:

```typescript
// src/hooks/tracker/BlockOperations.ts

export function interpolateSelection(
  pattern: Pattern,
  selection: Selection,
  field: 'volume' | 'effect' | 'note' | 'instrument'
): Pattern {
  const { startRow, endRow, startChannel, endChannel } = selection;

  for (let ch = startChannel; ch <= endChannel; ch++) {
    const startVal = pattern.channels[ch].rows[startRow][field];
    const endVal = pattern.channels[ch].rows[endRow][field];

    for (let row = startRow + 1; row < endRow; row++) {
      const t = (row - startRow) / (endRow - startRow);
      pattern.channels[ch].rows[row][field] = lerp(startVal, endVal, t);
    }
  }
  return pattern;
}
```

#### 5.3 Find and Replace

Powerful bulk editing:

```typescript
// src/components/tracker/FindReplace.tsx

interface FindCriteria {
  note?: { min: number; max: number } | number;
  instrument?: { min: number; max: number } | number;
  volume?: { min: number; max: number } | number;
  effect?: number;
  effectParam?: { min: number; max: number } | number;
}

interface ReplaceCriteria extends FindCriteria {
  mode: 'absolute' | 'add' | 'multiply';
}

interface SearchScope {
  patterns: 'current' | 'selection' | 'all';
  channels?: { min: number; max: number };
}
```

#### 5.4 Parameter Editor (Visual)

OpenMPT's graphical effect editor:

```typescript
// src/components/tracker/ParameterEditor.tsx

interface ParameterEditorProps {
  pattern: Pattern;
  channel: number;
  effectType: number;
  selection: { startRow: number; endRow: number };
  editMode: 'overwrite' | 'fill_blanks' | 'pc_note' | 'preserve_type';
}

// Displays vertical bars for effect values
// Click+drag to paint values
// Right-click for single-row precision
```

---

## Category 6: Playback Compatibility

### Priority: MEDIUM

OpenMPT has 100+ compatibility flags. DEViLBOX should support key ones:

#### 6.1 Format-Specific Quirks

```typescript
// src/engine/PlaybackCompatibility.ts

interface CompatibilityFlags {
  // MOD
  proTrackerMode: boolean;          // Amiga quirks
  vblankTiming: boolean;            // Speed as VBlank count
  oneShotLoops: boolean;            // Full playback before loop

  // XM
  ft2VolumeRamping: boolean;        // Smooth ramping
  ft2ArpeggioBug: boolean;          // Backwards arpeggio
  ft2RetrigBug: boolean;            // Erratic retrig
  ft2PeriodWrapping: boolean;       // Broken period handling

  // IT
  itOldEffects: boolean;            // Legacy effect emulation
  itCompatibleGxx: boolean;         // Portamento memory isolation
  itFilterQuirks: boolean;          // IT's filter coefficients
  itEnvelopeRetrigger: boolean;     // Envelope on instrument change

  // S3M
  s3mSharedEffectMemory: boolean;   // Most effects share memory
  s3mGusPortamento: boolean;        // GUS sample swapping
}
```

#### 6.2 Resampling Algorithm Selection

```typescript
export enum ResamplingMode {
  NONE = 'none',           // Lo-fi/chiptune
  LINEAR = 'linear',       // 2-tap, harsh
  CUBIC = 'cubic',         // 4-tap, moderate
  SINC_8TAP = 'sinc8',     // High quality
  SINC_LOWPASS = 'sinc_lp' // Best for downsampling
}
```

#### 6.3 Amiga Resampler

For authentic MOD playback:

```typescript
export enum AmigaMode {
  OFF = 'off',
  A500 = 'a500',     // Dull (LED filter)
  A1200 = 'a1200',   // Bright
  UNFILTERED = 'unfiltered'
}
```

---

## Category 7: Sample Handling Improvements

### Priority: MEDIUM

#### 7.1 Enhanced Loop Types

```typescript
interface SampleLoop {
  type: 'off' | 'forward' | 'bidirectional';
  start: number;
  end: number;
}

interface SampleConfig {
  loop: SampleLoop;
  sustainLoop?: SampleLoop;  // Plays until note-off
}
```

#### 7.2 Auto Vibrato

```typescript
interface AutoVibrato {
  waveform: 'sine' | 'square' | 'ramp_up' | 'ramp_down' | 'random';
  depth: number;    // 1/64ths of semitone
  rate: number;     // Speed of oscillation
  sweep: number;    // Fade-in time
}
```

#### 7.3 Sample Processing Tools

Add to sample editor:
- Crossfade loop points
- Remove DC offset
- Stereo separation adjustment
- Pitch shift / time stretch
- Draw mode for chip samples

---

## Category 8: Channel Management

### Priority: MEDIUM

#### 8.1 Channel Manager Dialog

```typescript
// src/components/tracker/ChannelManager.tsx

interface ChannelManagerProps {
  channels: ChannelData[];
  onReorder: (newOrder: number[]) => void;
  onBulkMute: (indices: number[], muted: boolean) => void;
  onBulkSolo: (indices: number[]) => void;
  onRecordGroupAssign: (indices: number[], group: 1 | 2) => void;
  onPluginToggle: (indices: number[], enabled: boolean) => void;
}
```

#### 8.2 Record Groups

Allow grouping channels for simultaneous recording:

```typescript
interface RecordGroup {
  id: 1 | 2;
  channels: number[];
}
```

#### 8.3 Quick Channel Settings

Right-click channel header for quick access to:
- Volume/Pan adjustment
- Effect chain assignment
- Mute/Solo toggle
- Color selection

---

## Category 9: MIDI & Plugin Integration

### Priority: MEDIUM

#### 9.1 Enhanced MIDI Mapping

```typescript
// src/midi/MIDIMapping.ts

interface MIDIMapping {
  channel: number | 'any';
  eventType: 'cc' | 'aftertouch' | 'pitchbend';
  controller?: number;

  target: {
    plugin: string;
    parameter: number;
  };

  recordToPattern: boolean;  // Write as Parameter Control Events
  capture: boolean;          // Prevent downstream routing
}

interface MIDIMappingManager {
  mappings: MIDIMapping[];
  learnMode: boolean;

  learn(event: MIDIEvent): void;
  process(event: MIDIEvent): void;
}
```

#### 9.2 Parameter Control Events (MPTM Style)

```typescript
// src/types/tracker.ts

interface ParameterControlEvent {
  type: 'PC' | 'PCs';  // Absolute vs Smooth
  plugin: number;       // Plugin slot (0-249)
  parameter: number;    // Parameter index (0-999)
  value: number;        // Value (0-999, decimal)
}

// In pattern: PC/PCs in note column, plugin in instrument,
// param in volume, value in effect columns
```

---

## Implementation Roadmap

### Phase 1: Core Effects (2-3 weeks)
1. Implement Zxx macro system
2. Add missing IT effects (S70-S7C, Vxx)
3. Add smooth MIDI macro (\xx)
4. Implement filter mode switching

### Phase 2: Instrument System (2 weeks)
1. New Note Actions
2. Pitch/Filter envelopes
3. Random variation/humanization
4. Pitch/Pan separation

### Phase 3: Pattern Editor (2 weeks)
1. Advanced paste modes
2. Interpolation system
3. Find and Replace dialog
4. Visual Parameter Editor

### Phase 4: Tempo & Playback (1-2 weeks)
1. Tempo swing/groove templates
2. Tempo modes (classic/modern)
3. Tap tempo
4. Basic compatibility flags

### Phase 5: Sample & Channel (1-2 weeks)
1. Sustain loops
2. Auto vibrato
3. Channel Manager dialog
4. Record groups

### Phase 6: MIDI & Plugins (1 week)
1. Enhanced MIDI mapping
2. Parameter Control Events
3. MIDI learn mode

---

## Quick Wins (Low Effort, High Impact)

| Feature | Effort | Impact | Description |
|---------|--------|--------|-------------|
| Tap Tempo | 2h | High | Add to toolbar |
| Paste Flood | 4h | Medium | Paste until pattern end |
| Interpolation | 4h | High | Interpolate effect values |
| Groove Presets | 8h | High | Built-in shuffle/swing |
| Channel Colors | 2h | Medium | Already partial, enhance |
| Keyboard Hints | 4h | Medium | Show shortcuts in UI |

---

## Technical Debt to Address

1. **Effect Memory Isolation** - Currently shared, should be per-column for IT compatibility
2. **Period vs Frequency** - Need proper period table for MOD playback
3. **Envelope Carry** - Not implemented for NNA Continue
4. **Volume Column Memory** - Should be separate from effect column

---

## Sources

- OpenMPT Wiki: https://wiki.openmpt.org/
- OpenMPT Effect Reference: https://wiki.openmpt.org/Manual:_Effect_Reference
- OpenMPT Zxx Macros: https://wiki.openmpt.org/Manual:_Zxx_Macros
- OpenMPT Instruments: https://wiki.openmpt.org/Manual:_Instruments
- OpenMPT Compatible Playback: https://wiki.openmpt.org/Manual:_Compatible_Playback
- OpenMPT Tempo Swing: https://wiki.openmpt.org/Manual:_Tempo_Swing_Settings
- OpenMPT Parameter Editor: https://wiki.openmpt.org/Manual:_Parameter_Editor
- OpenMPT Parameter Control: https://wiki.openmpt.org/Manual:_Parameter_Control_Events

---

*Report generated by Claude Code research agent*
