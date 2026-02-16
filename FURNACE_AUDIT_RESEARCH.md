# Furnace Audit - Detailed Research Findings

**Companion document to FURNACE_AUDIT_HANDOFF_2026-02-16.md**

This document contains exact line references, byte layouts, and code patterns from the Furnace source that must be matched 1:1.

---

## 1. MACRO ENGINE DETAILS

### 1.1 Operator Macro Type Encoding (macroInt.cpp:520-550)

```cpp
// structByType decoding for operator macros
DivMacroStruct* DivMacroInt::structByType(unsigned char type) {
  if (type>=0x20) {
    unsigned char o=((type>>5)-1)&3;  // Extract operator index (0-3)
    switch (type&0x1f) {              // Extract base macro type (0-19)
      CONSIDER(op[o].am,DIV_MACRO_OP_AM)    // 0
      CONSIDER(op[o].ar,DIV_MACRO_OP_AR)    // 1
      CONSIDER(op[o].dr,DIV_MACRO_OP_DR)    // 2
      // ... etc for all 20
    }
  }
  // Common macros for type < 0x20
}
```

**Type encoding formula:**
- Operator 0: types 0x20-0x33 (32-51)
- Operator 1: types 0x40-0x53 (64-83) 
- Operator 2: types 0x60-0x73 (96-115)
- Operator 3: types 0x80-0x93 (128-147)

### 1.2 Macro Open Flag Bits (macroInt.cpp:43-44)

```cpp
void DivMacroStruct::prepare(DivInstrumentMacro& source, DivEngine* e) {
  has=had=actualHad=will=true;
  mode=source.mode;
  type=(source.open>>1)&3;        // Bits 1-2: 0=seq, 1=ADSR, 2=LFO
  activeRelease=source.open&8;    // Bit 3: active release
  linger=(source.macroType==DIV_MACRO_VOL && e->song.compatFlags.volMacroLinger);
  lfoPos=LFO_PHASE;
}
```

### 1.3 All 20 Operator Macro Types (instrument.h:130-151)

```cpp
enum DivMacroTypeOp: unsigned char {
  DIV_MACRO_OP_AM=32,    // 0 - Amplitude modulation
  DIV_MACRO_OP_AR,       // 1 - Attack rate
  DIV_MACRO_OP_DR,       // 2 - Decay rate
  DIV_MACRO_OP_MULT,     // 3 - Frequency multiplier
  DIV_MACRO_OP_RR,       // 4 - Release rate
  DIV_MACRO_OP_SL,       // 5 - Sustain level
  DIV_MACRO_OP_TL,       // 6 - Total level
  DIV_MACRO_OP_DT2,      // 7 - Detune 2 (OPM)
  DIV_MACRO_OP_RS,       // 8 - Rate scaling
  DIV_MACRO_OP_DT,       // 9 - Detune
  DIV_MACRO_OP_D2R,      // 10 - Decay 2 rate
  DIV_MACRO_OP_SSG,      // 11 - SSG-EG mode
  DIV_MACRO_OP_DAM,      // 12 - AM depth (OPZ)
  DIV_MACRO_OP_DVB,      // 13 - Vibrato depth (OPZ)
  DIV_MACRO_OP_EGT,      // 14 - Fixed frequency (OPZ)
  DIV_MACRO_OP_KSL,      // 15 - Key scale level (OPL)
  DIV_MACRO_OP_SUS,      // 16 - Sustain flag (OPL)
  DIV_MACRO_OP_VIB,      // 17 - Vibrato flag (OPL)
  DIV_MACRO_OP_WS,       // 18 - Waveform select (OPL)
  DIV_MACRO_OP_KSR,      // 19 - Key scale rate (OPL)
};
```

---

## 2. PATTERN DATA LAYOUT

### 2.1 Pattern Cell Structure (defines.h:35-40)

```cpp
#define DIV_PAT_NOTE 0
#define DIV_PAT_INS 1
#define DIV_PAT_VOL 2
#define DIV_PAT_FX(_x) (3+((_x)<<1))      // Effect type columns
#define DIV_PAT_FXVAL(_x) (4+((_x)<<1))   // Effect value columns
```

**Layout for row with 8 effects:**
| Index | Content |
|-------|---------|
| 0 | Note |
| 1 | Instrument |
| 2 | Volume |
| 3 | Effect 0 Type |
| 4 | Effect 0 Value |
| 5 | Effect 1 Type |
| 6 | Effect 1 Value |
| ... | ... |
| 17 | Effect 7 Type |
| 18 | Effect 7 Value |

### 2.2 PATN Format effectMask (fur.cpp:1991-2035)

```cpp
unsigned short effectMask=0;

// Read effect mask bytes
if (mask&32) {
  effectMask|=(unsigned char)reader.readC();   // Low byte
}
if (mask&64) {
  effectMask|=((unsigned short)reader.readC()&0xff)<<8;  // High byte
}
// Legacy bits for first two effects
if (mask&8) effectMask|=1;   // Effect 0 type present
if (mask&16) effectMask|=2;  // Effect 0 value present

// Read effect bytes - each bit corresponds to one byte
for (unsigned char k=0; k<16; k++) {
  if (effectMask&(1<<k)) {
    pat->newData[j][DIV_PAT_FX(0)+k]=(unsigned char)reader.readC();
  }
}
```

**Bit mapping:**
- Bit 0 → DIV_PAT_FX(0)+0 = index 3 (effect 0 type)
- Bit 1 → DIV_PAT_FX(0)+1 = index 4 (effect 0 value)
- Bit 2 → DIV_PAT_FX(0)+2 = index 5 (effect 1 type)
- Bit 3 → DIV_PAT_FX(0)+3 = index 6 (effect 1 value)
- etc.

---

## 3. TIMING AND PLAYBACK

### 3.1 Virtual Tempo (playback.cpp:2680-2700)

```cpp
// Calculate tick rate with virtual tempo
double calcTickRate() {
  // Base: 2.5 * hz gives rows per minute
  // virtualTempo/virtualTempoD is a multiplier
  return 2.5 * curSubSong->hz * 
         ((double)curSubSong->virtualTempo / (double)curSubSong->virtualTempoD);
}
```

### 3.2 Speed System (playback.cpp:2720-2740)

```cpp
// Speed alternation
if (speedAB) {
  nextSpeed = curSubSong->speed2;
  speedAB = false;
} else {
  nextSpeed = curSubSong->speed1;
  speedAB = true;
}
```

### 3.3 firstTick Logic (playback.cpp:580-620)

```cpp
bool firstTick = (ticks == 1);  // ticks counts down from speed

// Many effects skip first tick
if (!firstTick || song.compatFlags.noSlidesOnFirstTick) {
  // Apply slides, vibrato, etc.
}
```

### 3.4 Note Delay EDxx (playback.cpp:1200-1250)

```cpp
case 0xed: // Note delay
  if (effectVal > 0 && effectVal < ticks) {
    chan[i].noteDelay = effectVal;
    chan[i].noteDelayOn = true;
  }
  break;

// Later in tick processing:
if (chan[i].noteDelayOn && ticks == chan[i].noteDelay) {
  // Trigger the note NOW
  processNote(i);
  chan[i].noteDelayOn = false;
}
```

### 3.5 Note Values (playback.cpp:650-700)

```cpp
// Note values in pattern
DIV_NOTE_OFF = 100      // Note off (stop sound)
DIV_NOTE_REL = 101      // Release (trigger envelope release)  
DIV_MACRO_REL = 102     // Macro release only

// In new format:
180 = NOTE_OFF
181 = NOTE_REL
182 = MACRO_REL
```

---

## 4. COMPATIBILITY FLAGS

### 4.1 Flag Storage (song.h:200-300)

```cpp
struct DivSong {
  struct CompatFlags {
    bool noSlidesOnFirstTick;
    bool volMacroLinger;
    bool brokenOutVol;
    bool brokenOutVol2;
    bool e1e2StopOnSameNote;
    bool brokenPortaArp;
    bool snNoLowPeriods;
    unsigned char delayBehavior;  // 0/1/2
    unsigned char jumpTreatment;  // 0/1/2
    bool autoSystem;
    bool brokenSpeedSel;
    bool rowResetsArpPos;
    bool ignoreJumpAtEnd;
    bool buggyPortaAfterSlide;
    bool gbInsAffectsEnvelope;
    bool sharedExtStat;
    bool ignoreDACModeOutsideIntendedChannel;
    bool e1e2AlsoTakePriority;
    bool newInsTriggersInPorta;
    bool arp0Reset;
    bool brokenDACMode;
    bool oneTickCut;
    bool brokenFIR;
    bool brokenFIRNoNegative;
    bool oldOctaveBoundary;
    bool noOPN2Vol;
    bool newVolumeScaling;
    bool volMacroAsGlobalVolume;
    // ... 20+ more
  } compatFlags;
};
```

### 4.2 Version-Gated Flag Reading (fur.cpp:800-1200)

Each flag has a version threshold. Example:
```cpp
if (ds.version >= 37) {
  ds.song.compatFlags.volMacroLinger = reader.readC();
}
if (ds.version >= 43) {
  ds.song.compatFlags.brokenOutVol = reader.readC();
}
if (ds.version >= 46) {
  ds.song.compatFlags.e1e2StopOnSameNote = reader.readC();
}
// ... etc for ~50 flags
```

---

## 5. INSTRUMENT FEATURE BLOCKS (NEW FORMAT)

### 5.1 Feature Block Structure (instrument.cpp:1400+)

```cpp
// Each feature block: 4-byte magic + 2-byte size + data
while (reader.tellI < end) {
  char magic[4];
  reader.read(magic, 4);
  unsigned short size = reader.readS();
  
  if (memcmp(magic, "MA", 2) == 0) {
    // Standard macros
  } else if (memcmp(magic, "FM", 2) == 0) {
    // FM data - 8 bytes header
    fm.alg = reader.readC();
    fm.fb = reader.readC();
    fm.fms = reader.readC();
    fm.ams = reader.readC();
    fm.fms2 = reader.readC();
    fm.ams2 = reader.readC();
    fm.ops = reader.readC();
    fm.opllPreset = reader.readC();
    // Then per-operator: 24 bytes each (NOT 8!)
    for (int i = 0; i < 4; i++) {
      readOperator(fm.op[i]);  // 24 bytes
    }
  }
  // ... etc for each feature code
}
```

### 5.2 FM Operator Byte Layout (instrument.cpp:1520-1560)

```cpp
// Per operator: 24 bytes total
struct Operator {
  unsigned char am;       // byte 0
  unsigned char ar;       // byte 1
  unsigned char dr;       // byte 2
  unsigned char mult;     // byte 3
  unsigned char rr;       // byte 4
  unsigned char sl;       // byte 5
  unsigned char tl;       // byte 6
  unsigned char dt2;      // byte 7
  unsigned char rs;       // byte 8
  unsigned char dt;       // byte 9
  unsigned char d2r;      // byte 10
  unsigned char ssgEnv;   // byte 11
  unsigned char dam;      // byte 12 (OPZ)
  unsigned char dvb;      // byte 13 (OPZ)
  unsigned char egt;      // byte 14 (OPZ)
  unsigned char ksl;      // byte 15 (OPL)
  unsigned char sus;      // byte 16 (OPL)
  unsigned char vib;      // byte 17 (OPL)
  unsigned char ws;       // byte 18 (OPL)
  unsigned char ksr;      // byte 19 (OPL)
  unsigned char kvs;      // byte 20 (OPZ)
  unsigned char reserved[3];  // bytes 21-23
};
```

---

## 6. DISPATCH COMMANDS

### 6.1 Complete DIV_CMD Enum (dispatch.h:20-250)

```cpp
enum DivDispatchCmds {
  // Core commands (0-29)
  DIV_CMD_NOTE_ON=0,
  DIV_CMD_NOTE_OFF,
  DIV_CMD_NOTE_OFF_ENV,
  DIV_CMD_ENV_RELEASE,
  DIV_CMD_INSTRUMENT,
  DIV_CMD_VOLUME,
  DIV_CMD_GET_VOLUME,
  DIV_CMD_GET_VOLMAX,
  DIV_CMD_NOTE_PORTA,
  DIV_CMD_PITCH,
  DIV_CMD_PANNING,
  DIV_CMD_LEGATO,
  DIV_CMD_PRE_PORTA,
  DIV_CMD_PRE_NOTE,
  
  // Hints (30-49)
  DIV_CMD_HINT_VIBRATO,
  DIV_CMD_HINT_VIBRATO_RANGE,
  DIV_CMD_HINT_VIBRATO_SHAPE,
  DIV_CMD_HINT_PITCH,
  DIV_CMD_HINT_ARPEGGIO,
  DIV_CMD_HINT_VOLUME,
  DIV_CMD_HINT_VOL_SLIDE,
  DIV_CMD_HINT_PORTA,
  DIV_CMD_HINT_LEGATO,
  DIV_CMD_HINT_VOL_SLIDE_TARGET,
  DIV_CMD_HINT_TREMOLO,
  DIV_CMD_HINT_PANBRELLO,
  DIV_CMD_HINT_PAN_SLIDE,
  DIV_CMD_HINT_PANNING,
  
  // Sample (50-59)
  DIV_CMD_SAMPLE_MODE,
  DIV_CMD_SAMPLE_FREQ,
  DIV_CMD_SAMPLE_BANK,
  DIV_CMD_SAMPLE_POS,
  DIV_CMD_SAMPLE_DIR,
  
  // FM (60-120)
  DIV_CMD_FM_HARD_RESET,
  DIV_CMD_FM_LFO,
  DIV_CMD_FM_LFO_WAVE,
  DIV_CMD_FM_TL,
  DIV_CMD_FM_AM,
  DIV_CMD_FM_AR,
  DIV_CMD_FM_DR,
  DIV_CMD_FM_SL,
  DIV_CMD_FM_D2R,
  DIV_CMD_FM_RR,
  DIV_CMD_FM_DT,
  DIV_CMD_FM_DT2,
  DIV_CMD_FM_RS,
  DIV_CMD_FM_KSR,
  DIV_CMD_FM_VIB,
  DIV_CMD_FM_SUS,
  DIV_CMD_FM_WS,
  DIV_CMD_FM_SSG,
  DIV_CMD_FM_REV,
  DIV_CMD_FM_EXTCH,
  DIV_CMD_FM_FB,
  DIV_CMD_FM_MULT,
  DIV_CMD_FM_FINE,
  DIV_CMD_FM_FIXFREQ,
  DIV_CMD_FM_AM_DEPTH,
  DIV_CMD_FM_PM_DEPTH,
  DIV_CMD_FM_OP_MASK,
  
  // Platform-specific (120-227)
  DIV_CMD_GB_SWEEP_TIME,
  DIV_CMD_GB_SWEEP_DIR,
  DIV_CMD_NES_ENV_MODE,
  DIV_CMD_NES_LENGTH,
  DIV_CMD_NES_SWEEP,
  DIV_CMD_C64_CUTOFF,
  DIV_CMD_C64_RESONANCE,
  DIV_CMD_C64_FILTER_MODE,
  DIV_CMD_C64_RESET_TIME,
  DIV_CMD_C64_RESET_MASK,
  DIV_CMD_C64_FILTER_RESET,
  DIV_CMD_C64_DUTY_RESET,
  DIV_CMD_C64_EXTENDED,
  // ... many more
};
```

---

## 7. FILES MODIFIED SO FAR

| File | Changes |
|------|---------|
| `src/types/instrument.ts` | Added EX9, EX10, operator macro constants; changed `open` to number |
| `src/engine/MacroEngine.ts` | Added IntOp class, op[4] array, updated structByType() |
| `src/lib/import/formats/FurnaceSongParser.ts` | Fixed PATN effect parsing, fixed old INST macro read size |

---

## 8. VERIFICATION CHECKLIST

After implementing remaining fixes, verify:

- [ ] FM instruments with TL macros animate correctly
- [ ] AR/DR/RR operator macros work
- [ ] Effects are parsed with correct type/value pairing
- [ ] Old INST format loads without corruption
- [ ] Virtual tempo affects playback speed correctly
- [ ] firstTick flag affects slides/vibrato
- [ ] Note delay (EDxx) triggers notes on correct tick
- [ ] Compat flags are respected
- [ ] Feature blocks parse all instrument data
- [ ] All platform-specific effects route to chips

---

## 9. NEXT SESSION START COMMAND

To resume work:
```
Read FURNACE_AUDIT_HANDOFF_2026-02-16.md and FURNACE_AUDIT_RESEARCH.md in full.
Continue from Task 5 (TrackerReplayer timing).
Reference: playback.cpp:580-700 for firstTick, playback.cpp:2680-2740 for virtual tempo.
```
