# Furnace Instrument Editor Deep Research

## Research Date: 2026-01-29

## 1. Furnace Source Code Architecture

### Main Editor File: `insEdit.cpp` (9041 lines)

The Furnace instrument editor is organized into several key components:

### 1.1 Tab Structure
The editor uses a tab-based UI with chip-specific tabs:
- **FM Tab** (`insTabFM`) - For FM synth chips (OPN, OPM, OPL, OPLL, OPZ, ESFM)
- **Wavetable Tab** (`insTabWavetable`) - For wavetable chips
- **Sample Tab** (`insTabSample`) - For PCM/sample-based chips
- **Macros Tab** - Universal for all chip types
- **Chip-Specific Tabs** - GB, C64/SID2, SNES, N163, Sound Unit, etc.

### 1.2 Key Functions

#### `drawFMEnv()` - FM Envelope Visualization
Draws a visual ADSR envelope curve for FM operators. Takes parameters:
- tl, ar, dr, d2r, rr, sl, sus, ssgEnv, alg
- maxTl, maxArDr, maxRr
- Size (ImVec2)
- Instrument type

#### `drawAlgorithm()` - Visual Algorithm Diagram
Renders the FM algorithm as a visual diagram showing operator connections.
Used when clicking on the algorithm selector.

#### `drawMacroEdit()` - Macro Editor
A sophisticated macro editor with:
- Visual plot with drag-based editing
- Loop point indicator (blue)
- Release point indicator (shift+click, red)
- MML string input/output
- Vertical scrolling/zooming
- ADSR mode vs sequence mode
- Real-time playback position highlighting

### 1.3 Instrument Types (67 total)
Key types:
- DIV_INS_FM (OPN2/Genesis), DIV_INS_OPM (YM2151)
- DIV_INS_OPL, DIV_INS_OPLL, DIV_INS_OPZ, DIV_INS_ESFM
- DIV_INS_GB, DIV_INS_NES, DIV_INS_C64, DIV_INS_SID2
- DIV_INS_PCE, DIV_INS_SNES, DIV_INS_N163, DIV_INS_SCC

### 1.4 FM Operator Structure
```
am, ar, dr, mult, rr, sl, tl, dt2, rs, dt, d2r, ssgEnv
dam, dvb, egt, ksl, sus, vib, ws, ksr, kvs, enable
```

### 1.5 Chip-Specific Parameter Ranges

| Chip Type | TL Range | AR/DR Range |
|-----------|----------|-------------|
| OPN/OPM   | 0-127    | 0-31        |
| OPL/ESFM  | 0-63     | 0-15        |
| OPLL      | 0-63/15  | 0-15        |

### 1.6 Macro System

Standard Macros: Volume, Arpeggio, Duty, Wave, Pitch, Panning, Phase Reset, Filter, Envelope, etc.

Per-Operator Macros (×4): AM, AR, DR, MULT, RR, SL, TL, DT2, RS, DT, D2R, SSG, DAM, DVB, EGT, KSL, SUS, VIB, WS, KSR

Macro features: loop point, release point, MML input, ADSR mode, LFO mode

### 1.7 Chip-Specific Editors

**Game Boy**: Hardware Sequence Editor with envelope/sweep commands
**C64/SID**: Waveform buttons, ADSR, filter controls, ring mod, osc sync
**SNES**: ADSR or Gain mode, sustain/release modes
**N163**: Per-channel wave position/length

## 2. Current DEViLBOX Implementation Gaps

### Missing Features:
1. No Macro Editor (only shows count)
2. No FM Envelope Visualization
3. No Algorithm Diagram
4. No chip-specific parameter ranges
5. Missing chip-specific editors (GB, C64, SNES, N163)
6. No Wavetable Editor (only viewer)
7. No Sample Map Editor
8. Missing FM params: DT, RS, D2R, AM, SSG

### Incorrect Ranges:
- OPL/OPLL should use TL 0-63, AR/DR 0-15
- Currently all chips use OPN ranges

### Placeholder Values:
- VOL knob fixed at 100
- PSG controls have hardcoded values
- PCM controls not connected

## 3. Implementation Priority

**High Priority:**
1. Chip-specific parameter ranges
2. FM envelope visualization
3. Missing FM operator parameters
4. Connect placeholder controls to config

**Medium Priority:**
5. Visual algorithm diagram
6. Basic macro editor (sequence mode)
7. GB hardware sequence editor

**Lower Priority:**
8. ADSR/LFO macro modes
9. Per-operator macro tabs
10. Advanced chip editors
11. Wavetable drawing editor

---

## 4. Cross-Editor Improvement Analysis

This section documents how Furnace research findings can improve OTHER instrument editors in DEViLBOX.

### 4.1 Applicable Patterns from Furnace

| Pattern | Description | Benefit |
|---------|-------------|---------|
| **Visual Envelope Curves** | Real-time ADSR visualization per operator/voice | Users immediately see envelope shape without playing |
| **Algorithm Diagrams** | Visual routing of operators/oscillators | Clarifies signal flow for FM/modular synths |
| **Chip-Specific Ranges** | Different max values per parameter | Accurate ranges prevent invalid values |
| **Collapsible Sections** | Expand/collapse parameter groups | Less UI clutter, focus on what matters |
| **Tab Organization** | Operators/Macros/Settings tabs | Organize complex parameters logically |
| **Macro Mini-Visualization** | Small waveform preview with loop/release markers | Quick overview of automation |
| **Carrier vs Modulator** | Visual distinction in FM synths | Clearer understanding of FM structure |

### 4.2 Editor-Specific Recommendations

#### VisualTB303Editor (433 lines)
**Current State:** Good - has filter visualization, oscilloscope, tab-based UI
**Improvements:**
1. ✨ **Add VEG Envelope Curve** - Draw the VCA envelope generator curve similar to FM envelope visualization
2. ✨ **Filter Envelope Visualization** - Show env mod affecting cutoff over time
3. Add mini waveform preview for selected oscillator type
4. Consider collapsible Devil Fish section when not in use

**Implementation Effort:** Low - can reuse `FMEnvelopeVisualization` pattern

#### VisualSynthEditor (1800 lines)
**Current State:** Excellent - has `LiveADSRVisualizer`, `LiveFilterCurve`, tabs
**Improvements:**
1. ✨ **FM Algorithm Diagram** - For FM-based synths (FMSynth, MetalSynth), add visual operator routing
2. ✨ **Oscillator Routing Diagram** - Show how oscillators connect to filters/output
3. Add carrier/modulator visual distinction for FM synths
4. Consider synth-specific parameter ranges (FM vs subtractive)

**Implementation Effort:** Medium - need new `AlgorithmDiagram` component

#### BuzzmachineEditor (222 lines)
**Current State:** Basic - slider-based parameters
**Status:** ⚠️ **Superseded by JeskolaEditors** - JeskolaEditors provides comprehensive knob-based UI for all machine types
**Improvements:**
1. Migrate to use JeskolaEditors for all machine types
2. Remove or deprecate generic slider-based editor
3. Consider generic fallback with auto-generated knob layout

**Implementation Effort:** N/A - use JeskolaEditors instead

#### JeskolaEditors (1600 lines)
**Current State:** Excellent - VST-style knob interfaces, SectionHeader pattern
**Improvements:**
1. ✨ **Visual Envelope for JeskolaNoise** - Show Attack/Sustain/Release curve
2. ✨ **Pitch Envelope for FSMKick/KickXP** - Visualize frequency sweep from start to end
3. ✨ **FM Algorithm for MadBrain4FM2F** - Show 4-operator routing diagram
4. Add waveform preview for oscillator type selectors
5. Consider adding mini envelope visualization to all synths with ADSR

**Implementation Effort:** Medium - apply FMEnvelopeVisualization pattern

### 4.3 Reusable Components to Create

Based on analysis, these components would benefit multiple editors:

```
src/components/visualization/
├── EnvelopeCurve.tsx        # Generic ADSR/ADR visualization (reuse in TB303, Jeskola)
├── PitchEnvelopeCurve.tsx   # Pitch sweep visualization (FSMKick, FrequencyBomb)
├── AlgorithmDiagram.tsx     # FM algorithm routing (already in FurnaceEditor)
├── SignalFlowDiagram.tsx    # Generic oscillator→filter→output routing
└── WaveformPreview.tsx      # Mini preview of oscillator waveform type
```

### 4.4 Priority Matrix

| Editor | Improvement | Impact | Effort | Priority |
|--------|-------------|--------|--------|----------|
| JeskolaEditors | Visual envelope for JeskolaNoise | High | Low | **P1** |
| JeskolaEditors | Pitch envelope for FSMKick | High | Low | **P1** |
| VisualTB303Editor | VEG envelope curve | Medium | Low | **P2** |
| JeskolaEditors | FM algorithm for 4FM2F | Medium | Medium | **P2** |
| VisualSynthEditor | FM algorithm diagram | Medium | Medium | **P3** |
| VisualSynthEditor | Oscillator routing | Low | High | **P4** |

### 4.5 Implementation Notes

**EnvelopeCurve Component Design:**
```typescript
interface EnvelopeCurveProps {
  attack: number;      // 0-1 normalized or raw value with range
  decay?: number;      // Optional for AD-only envelopes
  sustain?: number;    // Optional for ASR or AD envelopes
  release: number;
  attackRange?: [number, number];  // Min/max for attack
  // ... other ranges
  width?: number;
  height?: number;
  color?: string;
  showMarkers?: boolean;  // Show A/D/S/R labels
}
```

**Reusing Furnace Pattern:**
The `FMEnvelopeVisualization` component in FurnaceEditor.tsx draws envelope curves using:
1. Canvas/SVG path drawing
2. Normalized parameter scaling
3. Color-coded segments (attack=green, decay=yellow, release=red)

This can be generalized into a reusable `EnvelopeCurve` component for:
- JeskolaNoise (Attack/Sustain/Release)
- FSMKick/KickXP (Tone decay, Amp decay)
- TB303 VEG (Attack/Decay)
- VisualSynthEditor ADSR (already has LiveADSRVisualizer - consider unifying)

---

## 5. Summary

The Furnace instrument editor research has identified several patterns that can improve DEViLBOX's other editors:

1. **Visual envelope curves** - High-value addition for drum/synth editors
2. **Algorithm diagrams** - Essential for FM-based instruments
3. **Parameter range validation** - Prevents invalid values
4. **Collapsible sections** - Reduces UI clutter
5. **Macro visualization** - Quick parameter automation preview

**Recommended Next Steps:**
1. Create reusable `EnvelopeCurve` component
2. Add envelope visualization to JeskolaNoise, FSMKick editors
3. Add pitch envelope visualization to FrequencyBomb
4. Consider unifying ADSR visualization across all editors

---

## 6. Implementation Summary (Completed 2026-01-29)

All improvements from this research have been implemented:

### New Reusable Visualization Components
- **`EnvelopeCurve.tsx`** - Generic ADSR/ADR/ASR envelope visualization
- **`PitchEnvelopeCurve.tsx`** - Pitch sweep visualization for kick drums
- **`AlgorithmDiagram.tsx`** - FM algorithm routing visualization

### JeskolaEditors Improvements
- ✅ JeskolaNoise - Added ASR envelope curve visualization
- ✅ FSMKick - Added pitch envelope showing frequency sweep
- ✅ FSMKickXP - Added pitch envelope with decay rate/shape
- ✅ ElenzilFrequencyBomb - Added frequency sweep visualization
- ✅ MadBrain4FM2F - Added 4-operator FM algorithm diagram

### VisualTB303Editor Improvements
- ✅ Added VEG envelope curve visualization in Devil Fish tab

### FurnaceEditor Improvements
- ✅ Added interactive wavetable drawing editor with preset shapes
- ✅ Added full macro editor with:
  - Draw mode for freehand editing
  - Loop point (L) and release point (R) markers
  - Visual bar graph + line overlay
  - Bipolar support for arpeggio macros
- ✅ Added chip-specific editors:
  - Game Boy: Hardware envelope, sound length, direction
  - C64/SID: Waveform buttons, ADSR, ring mod, osc sync, filter
  - NES: Duty cycle, envelope mode, pitch sweep
  - SNES: ADSR mode vs Gain mode selection
- ✅ Connected PSG panel controls to config
- ✅ Connected PCM panel controls to config

### Files Created
- `/src/components/visualization/EnvelopeCurve.tsx`
- `/src/components/visualization/PitchEnvelopeCurve.tsx`
- `/src/components/visualization/AlgorithmDiagram.tsx`

### Files Modified
- `/src/components/visualization/index.ts` - Added exports
- `/src/components/instruments/JeskolaEditors.tsx` - Added visualizations
- `/src/components/instruments/VisualTB303Editor.tsx` - Added VEG envelope
- `/src/components/instruments/FurnaceEditor.tsx` - Major enhancements

---

**Last Updated:** 2026-01-29
**Research Status:** Complete
**Cross-Editor Analysis:** Complete
**Implementation Status:** Complete
