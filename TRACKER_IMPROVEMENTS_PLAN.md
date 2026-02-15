# DEViLBOX Tracker Improvements Plan

**Last Updated:** 2026-02-15 (status verified against code)

> **Note:** For overall project status, see: [PROJECT_STATUS_2026-02-14.md](PROJECT_STATUS_2026-02-14.md)

---

## Feature Request Analysis

Your musician friends are describing **ProTracker limitations** that were solved in FastTracker II (1994). DEViLBOX is XM-based, so most of these already exist!

---

## Status of Requested Features

### 1. Increase Amount of Samples
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| ProTracker | 31 samples max |
| DEViLBOX | **128 instruments** (XM-compatible) |

Each instrument can be a sample OR a synth. No work needed.

---

### 2. Variable Pattern Lengths  
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| ProTracker | 64 rows fixed, use break commands |
| DEViLBOX | **1-256 rows per pattern** |

The pattern length is configurable and displayed in the header as `[64]` under the ROW label.

---

### 3. Ping-Pong Loops
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| Sample loops | `'none' | 'forward' | 'pingpong'` |

Full XM loop modes supported in sample editor.

**Minor Enhancement**: Add visual indicator in sample list.

---

### 4. Instruments (ADSR, Pitch Envelopes, Drumkits)
| Status | **COMPLETE** |
|--------|------------------------|

**Already have:**
- Full ADSR envelope (attack: 0-2000ms, decay: 0-2000ms, sustain: 0-100%, release: 0-5000ms)
- Filter envelope with modulation
- LFO with tempo sync (can target pitch)
- Per-instrument effects chain
- **✅ Drumkit/Keymap mode**: Full implementation in `DrumKitSynth.ts`
  - Maps different samples to different note ranges
  - Per-key pitch/volume/pan offsets
  - Used in production with Drumnibus presets
- **✅ Dedicated pitch envelope**: Full ADSR pitch modulation (src/components/instruments/editors/VisualSynthEditorContent.tsx)
  - Enable/disable toggle
  - Amount: -48 to +48 semitones
  - Full ADSR controls
  - Integrated with all synth types

**Missing - worth implementing:**
- **Sample layering**: Stack multiple samples per instrument
- **Auto-slice to drumkit**: Create drumkit from beat slicer output

---

### 5. Note-Offs
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| Note value 97 | Note-off (triggers release) - displays as `OFF` |
| Effect ECx | Note cut at tick x |

**Implementation complete:**
- Note-off (97) displays as `OFF` in PatternEditorCanvas (not as `===`)
- ECx (note cut) fully functional
- Note fade (IT NNA action 3) also implemented

---

### 6. Volume Column
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| XM volume column | 25+ effects including: |
| | - Direct volume (0-64) |
| | - Volume slides up/down |
| | - Fine volume adjust |
| | - Vibrato depth/speed |
| | - Tone portamento |
| | - Panning + pan slides |

Full FastTracker II volume column with all effects.

---

### 7. New Effects (Global Volume, Envelope Control)
| Status | **ALL IMPLEMENTED** |
|--------|---------------------|

**Already have:**
- `Gxx` - Set global volume (0-64)
- `Hxy` - Global volume slide
- **`S77-S7C` - Full envelope control suite:**
  - S77: Volume Envelope Off
  - S78: Volume Envelope On
  - S79: Panning Envelope Off
  - S7A: Panning Envelope On
  - S7B: Pitch/Filter Envelope Off
  - S7C: Pitch/Filter Envelope On

**Implementation:** See `src/engine/EffectCommands.ts` lines 607-626

---

## Implementation Priority

### Phase 1: UI Polish (Easy Wins) - ✅ COMPLETE

1. **Pattern Length in Header** *(✅ DONE)*
   - ✅ Shows current pattern length below "ROW" label
   - Pattern length displayed as `[64]` in accent color
   - Hoverable tooltip shows full label

2. **Ping-Pong Loop Indicator** *(✅ DONE)*
   - ✅ Enhanced visibility in InstrumentList
   - Shows larger icon (12px) with direction arrow
   - Blue for ping-pong (↔), green for forward (→)

### Phase 2: Drumkit UI (Medium Feature) - ✅ COMPLETE

3. **Drumkit/Keymap Visual Editor** *(✅ DONE)*
   - ✅ **Full piano-roll UI implemented** (`DrumKitEditor.tsx`)
   - ✅ 96-note keyboard (C0-C8) with visual mappings
   - ✅ Color-coded sample assignments
   - ✅ Per-key parameter editing:
     - Pitch offset (-48 to +48 semitones)
     - Fine tune (-100 to +100 cents)
     - Volume offset (-12 to +12 dB)
     - Pan offset (-100 to +100, L/C/R)
   - ✅ Sample selection from instrument list
   - ✅ Live preview/testing
   - ✅ Global settings (polyphony, max voices, note cut)
   - ✅ Integrated into UnifiedInstrumentEditor

4. **Auto-Slice to Drumkit** *(2-3 hours)*
   - Integration with Beat Slicer
   - "Create Drumkit from Slices" button
   - Maps slices to C-1, C#1, D-1, etc.
   - **Uses existing DrumKitSynth engine**

### Phase 3: Sample Layering (Advanced Feature)

5. **Multi-Sample Instrument Layers** *(3-4 days)*
   - Stack multiple samples per instrument
   - Per-layer volume/pan/tuning
   - Velocity zones for dynamic layering
   - Round-robin sample rotation

---

## Additional Enhancements (Future)

### Quality of Life

6. **Quick Pattern Length Shortcuts** *(1 hour)*
   - Keyboard shortcuts: Ctrl+L opens length dialog
   - Numpad shortcuts for common lengths

7. **Sample Preview in Pattern** *(1-2 hours)*
   - Right-click note to preview that sample
   - Spacebar preview at current row

### Performance

8. **Pattern Caching** *(2-3 hours)*
   - Pre-render patterns that don't change
   - Reduce CPU on large songs

9. **Voice Limiting** *(1-2 hours)*
   - Max voices per channel option
   - Prevent voice overload on dense patterns

---

## Recommended Implementation Order

| Priority | Feature | Effort | Impact | Status |
|----------|---------|--------|--------|--------|
| 1 | Note-Off display (`OFF`) | ~~30 min~~ | High | ✅ **DONE** |
| 2 | Pattern length in header | ~~1-2 hr~~ | High | ✅ **DONE** (2026-02-14) |
| 3 | Note-Fade effect (EFx) | ~~2-3 hr~~ | Medium | ✅ **DONE** (IT NNA action 3) |
| 4 | Ping-pong indicator | ~~30 min~~ | Low | ✅ **DONE** (2026-02-14) |
| 5 | Envelope control effects | ~~3-4 hr~~ | Medium | ✅ **DONE** (S77-S7C) |
| 6 | **Drumkit engine** | ~~1-2 days~~ | Very High | ✅ **DONE** |
| 7 | Drumkit visual editor UI | ~~1-2 days~~ | High | ✅ **DONE** (2026-02-14) |
| 8 | Auto-slice to drumkit | 2-3 hr | High | ⬜ Todo |
| 9 | Pitch envelope | ~~4-6 hr~~ | High | ✅ **DONE** (2026-02-14) |

**Already Done (no work needed):**
- ✅ 128 instruments (vs. 31)
- ✅ Variable pattern lengths (1-256)
- ✅ Ping-pong loops
- ✅ Full ADSR envelopes
- ✅ Note-offs (value 97) - displays as `OFF`
- ✅ Full volume column (25+ effects)
- ✅ Global volume control (Gxx, Hxy)
- ✅ **Drumkit/keymap engine** (full implementation)
- ✅ **Groove templates** (shuffle, funk, MPC, etc.)
- ✅ **Volume gain offsets** (per-synth normalization)
- ✅ **Pitch envelope** (full ADSR with UI)
- ✅ **Note-fade effect** (IT NNA action 3)
- ✅ **Envelope control effects** (S77-S7C)

**Worth Adding:**
- Auto-slice to drumkit (integration with Beat Slicer)
- Sample layering (velocity zones, round-robin)
- Pink/brown noise in Modular Synth NoiseModule

Your friends will be pleased to know most ProTracker limitations were solved in 1994, and DEViLBOX goes even further with drumkits and groove templates!
