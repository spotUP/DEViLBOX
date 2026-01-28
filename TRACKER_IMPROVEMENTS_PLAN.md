# DEViLBOX Tracker Improvements Plan

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

The pattern length is configurable. Could enhance: make per-pattern length more discoverable in UI.

**Minor Enhancement**: Add pattern length display/edit in pattern header.

---

### 3. Ping-Pong Loops
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| Sample loops | `'none' | 'forward' | 'pingpong'` |

Full XM loop modes supported in sample editor.

---

### 4. Instruments (ADSR, Pitch Envelopes, Drumkits)
| Status | **PARTIALLY IMPLEMENTED** |
|--------|---------------------------|

**Already have:**
- Full ADSR envelope (attack: 0-2000ms, decay: 0-2000ms, sustain: 0-100%, release: 0-5000ms)
- Filter envelope with modulation
- LFO with tempo sync (can target pitch)
- Per-instrument effects chain

**Missing - worth implementing:**
- **Drumkit/Keymap mode**: Map different samples to different note ranges
- **Dedicated pitch envelope**: Time-based pitch automation (not just LFO)
- **Sample layering**: Stack multiple samples per instrument

---

### 5. Note-Offs
| Status | **ALREADY IMPLEMENTED** |
|--------|-------------------------|
| Note value 97 | Note-off (triggers release) |
| Effect ECx | Note cut at tick x |

**Could add:**
- **Note-Fade (EFx)**: Gradual volume fade instead of cut
- **Better UI**: Show note-off as `===` or `OFF` in pattern

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
| Status | **PARTIALLY IMPLEMENTED** |
|--------|---------------------------|

**Already have:**
- `Gxx` - Set global volume (0-64)
- `Hxy` - Global volume slide

**Could add:**
- **Volume envelope on/off**: Runtime control (like IT's S77/S78)
- **Pitch envelope on/off**: Similar runtime control
- **Envelope reset**: Restart envelope from beginning

---

## Implementation Priority

### Phase 1: UI Polish (Easy Wins)
These features exist but could be more visible:

1. **Pattern Length in Header** *(1-2 hours)*
   - Show current pattern length next to pattern number
   - Click to edit inline
   - Right-click for common lengths (16, 32, 48, 64, 96, 128)

2. **Note-Off Display Enhancement** *(30 min)*
   - Display note 97 as `OFF` or `===` instead of `C-8` or similar
   - Color it differently (gray/muted)

3. **Ping-Pong Loop Indicator** *(30 min)*
   - Show loop mode icon in sample list
   - Visual indicator on waveform

### Phase 2: New Effects (Medium)

4. **Note-Fade Effect (EFx)** *(2-3 hours)*
   - Gradually fade volume over x ticks
   - More musical than hard cut
   - Implementation: Add to effect processor

5. **Envelope Control Effects** *(3-4 hours)*
   - `S77` - Volume envelope off
   - `S78` - Volume envelope on
   - `S79` - Pitch envelope off
   - `S7A` - Pitch envelope on
   - Like Impulse Tracker's S commands

### Phase 3: Drumkit Mode (Major Feature)

6. **Drumkit/Keymap Instrument Type** *(1-2 days)*
   - New instrument type: `DrumKit`
   - Maps note ranges to different samples
   - UI: Piano-roll style sample assignment
   - Each key can have:
     - Sample reference
     - Pitch offset
     - Volume offset
     - Panning

   ```typescript
   interface DrumKitConfig {
     keymap: Array<{
       noteRange: [number, number]; // e.g., [36, 36] for single key
       sampleId: string;
       pitchOffset: number;
       volumeOffset: number;
       pan: number;
     }>;
   }
   ```

7. **Auto-Slice to Drumkit** *(2-3 hours)*
   - Integration with Beat Slicer
   - "Create Drumkit from Slices" button
   - Maps slices to C-1, C#1, D-1, etc.

### Phase 4: Pitch Envelope (Advanced)

8. **Dedicated Pitch Envelope** *(4-6 hours)*
   - Time-based pitch modulation
   - Separate from LFO (one-shot vs. cyclic)
   - Attack: Pitch start offset
   - Decay: Time to reach target
   - Could also do breakpoint envelope

   ```typescript
   interface PitchEnvelopeConfig {
     enabled: boolean;
     startPitch: number;    // -24 to +24 semitones
     attackTime: number;    // ms to reach 0 (target)
     holdTime: number;      // ms at 0
     decayTime: number;     // ms to end pitch
     endPitch: number;      // -24 to +24 semitones
   }
   ```

---

## Additional Improvements (My Suggestions)

### Quality of Life

9. **Groove/Shuffle Templates** *(2-3 hours)*
   - Presets for swing feel
   - Adjustable shuffle amount (0-100%)
   - Common grooves: 16th swing, triplet feel, etc.

10. **Quick Pattern Length Shortcuts** *(1 hour)*
    - Keyboard shortcuts: Ctrl+L opens length dialog
    - Numpad shortcuts for common lengths

11. **Sample Preview in Pattern** *(1-2 hours)*
    - Right-click note to preview that sample
    - Spacebar preview at current row

### Performance

12. **Pattern Caching** *(2-3 hours)*
    - Pre-render patterns that don't change
    - Reduce CPU on large songs

13. **Voice Limiting** *(1-2 hours)*
    - Max voices per channel option
    - Prevent voice overload on dense patterns

---

## Recommended Implementation Order

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Note-Off display (`OFF`/`===`) | 30 min | High |
| 2 | Pattern length in header | 1-2 hr | High |
| 3 | Note-Fade effect (EFx) | 2-3 hr | Medium |
| 4 | Ping-pong indicator | 30 min | Low |
| 5 | Envelope control effects | 3-4 hr | Medium |
| 6 | Drumkit mode | 1-2 days | Very High |
| 7 | Auto-slice to drumkit | 2-3 hr | High |
| 8 | Pitch envelope | 4-6 hr | Medium |
| 9 | Groove templates | 2-3 hr | Medium |

---

## Summary

**Already Done (no work needed):**
- 128 instruments (vs. 31)
- Variable pattern lengths (1-256)
- Ping-pong loops
- Full ADSR envelopes
- Note-offs (value 97)
- Full volume column (25+ effects)
- Global volume control (Gxx, Hxy)

**Worth Adding:**
- Better note-off display in UI
- Pattern length more visible
- Note-fade effect
- Drumkit/keymap instruments
- Pitch envelope
- Envelope on/off effects

Your friends will be pleased to know most ProTracker limitations were solved in 1994!
