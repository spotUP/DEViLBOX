# TB-303 Debug & Test Scripts

This document lists all available test and debug scripts for TB-303 playback debugging.

## Quick Start

1. **Static Analysis Tests** (run in terminal):
   ```bash
   node test-playback-comparison.js   # Compare DEViLBOX vs DB303 event sequences
   node test-extreme-logging.js       # Multi-phase pipeline trace
   node test-byte-level.js            # Byte-level hex dump of all values
   node test-slide-detailed.js        # Slide flag state machine analysis
   ```

2. **Runtime Debug Logging** (in browser console):
   ```javascript
   window.TB303_DEBUG_ENABLED = true   // Enable detailed runtime logs
   // Then play a TB-303 pattern
   window.TB303_DEBUG_ENABLED = false  // Disable when done
   ```

---

## Test Scripts (Static Analysis)

### `test-playback-comparison.js`
Compares event sequences between DEViLBOX TrackerReplayer and DB303 internal sequencer.
Shows side-by-side comparison of noteOn, noteOff, and slide events.

**Output:**
- DEViLBOX event sequence
- DB303 reference sequence  
- Pass/Fail comparison
- Event-by-event table

### `test-extreme-logging.js`
7-phase analysis of the entire conversion pipeline:
1. RAW XML DATA ANALYSIS
2. MIDI → XM CONVERSION
3. XM → MIDI (TrackerReplayer reads)
4. SLIDE FLAG STATE MACHINE
5. SYNTH CALLS (ToneEngine)
6. DB303 REFERENCE COMPARISON
7. COMPLETE EVENT SEQUENCE

### `test-byte-level.js`
Shows hex/binary values for every piece of data:
- Raw XML values (key, octave, gate, accent, slide)
- MIDI calculation with hex
- XM pattern data with combined byte view
- Slide state machine bit-level tracking
- Synth triggerAttack parameters
- Frequency values (Hz)
- Final comparison with match indicators

### `test-slide-detailed.js`
Focused analysis of slide flag handling:
- Row-by-row slide state tracking
- previousSlideFlag vs currentSlide comparison
- slideActive calculation verification

---

## Runtime Debug Logging

### Enable in Browser Console
```javascript
window.TB303_DEBUG_ENABLED = true
```

### What You'll See

**Row Processing (TrackerReplayer):**
```
[Row  5] C2    ●ACC ►SLD [prev:1 curr:0] → SLIDE
```
- Row number
- Note name
- ●ACC = Accent active (purple)
- ►SLD = Slide active (yellow)
- prev/curr = Previous/current slide flags
- Action: TRIGGER or SLIDE

**Synth Calls (ToneEngine):**
```
└─► DB303.triggerAttack("C2", t=1.234, vel=1.00, acc=true, sld=true, ham=false)
```

**Worklet Messages (DB303Synth):**
```
└─► WORKLET: noteOn(midi=36 (C2), vel=127, slide=true, accent=true, hammer=false)
```

**Note-Off:**
```
[Row  3] ===   NOTE OFF (prevSlide cleared)
```

### Disable When Done
```javascript
window.TB303_DEBUG_ENABLED = false
```

---

## Understanding Slide Semantics

The TB-303's slide flag works **forward**:
- Slide flag on step N → pitch glides FROM step N TO step N+1
- Gate stays HIGH during slide (no retrigger)

| prev | curr | Action | Description |
|------|------|--------|-------------|
| 0 | 0 | TRIGGER | Normal note attack |
| 0 | 1 | TRIGGER | New note, NEXT note will slide |
| 1 | 0 | SLIDE | Glide from previous note |
| 1 | 1 | SLIDE | Continuous slide chain |

**REST/Note-off BREAKS the slide chain** (sets prev=0)

---

## Files Location

```
DEViLBOX/
├── test-playback-comparison.js    # Main comparison test
├── test-extreme-logging.js        # Multi-phase pipeline trace
├── test-byte-level.js             # Hex/binary value dump
├── test-slide-detailed.js         # Slide state machine analysis
└── public/
    └── enable-tb303-debug.js      # Runtime debug helper (copy to console)
```

---

## Conversion Pipeline

```
DB303 XML           →  Db303PatternConverter  →  TrackerCell (XM format)
─────────────────────────────────────────────────────────────────────────
key + octave + root →  MIDI note             →  XM note = MIDI - 11
gate = true         →  XM note               →  TrackerCell.note
gate = false        →  XM 97 (note-off)      →  TrackerCell.note = 97
accent              →  flag1 = 0x01          →  TrackerCell.flag1
slide               →  flag2 = 0x02          →  TrackerCell.flag2

TrackerReplayer reads TrackerCell:
─────────────────────────────────────────────────────────────────────────
XM note + 11        →  MIDI                  →  periodToNoteName
flag1 & 0x01        →  accent boolean        →  passed to synth
flag2 & 0x02        →  slide boolean         →  stored as previousSlideFlag
previousSlideFlag   →  slideActive           →  controls pitch glide
```
