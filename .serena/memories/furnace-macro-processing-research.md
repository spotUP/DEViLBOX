---
date: 2026-03-07
topic: furnace-macro-system
tags: [furnace, macros, instrument, reference]
status: final
---

# Furnace Tracker - Instrument Macro Processing Pipeline

## Overview

Furnace's macro system is a comprehensive automation framework that applies per-tick modulation to instrument parameters. Macros run on every engine tick and can modulate volume, pitch, duty cycle, waveform, panning, FM parameters per-operator, and 10+ custom effect channels.

## Architecture

### 1. Data Structures

#### DivInstrumentMacro (instrument.h:286-310)
- **Array**: `int val[256]` — stores 256 macro values (sequence)
- **Mode**: `unsigned int mode` — bitfield for macro settings
- **Open**: `unsigned char open` — macro configuration flags
  - Bit 1-2: macro type (0=sequence, 1=ADSR, 2=LFO)
  - Bit 3: active release flag
- **Timing**:
  - `speed`: how many ticks per macro step (default 1)
  - `delay`: initial delay before macro starts
  - `loop`: loop start position
  - `rel`: release point (where macro jumps when note is released)
  - `len`: macro length (number of steps)
- **macroType**: DIV_MACRO_VOL (0), DIV_MACRO_ARP (1), DIV_MACRO_DUTY (2), DIV_MACRO_WAVE (3), DIV_MACRO_PITCH (4), DIV_MACRO_EX1-10, DIV_MACRO_ALG, DIV_MACRO_FB, DIV_MACRO_FMS, DIV_MACRO_AMS, DIV_MACRO_PAN_LEFT, DIV_MACRO_PAN_RIGHT, DIV_MACRO_PHASE_RESET, plus FM operator macros (DIV_MACRO_OP_AM, AR, DR, MULT, RR, SL, TL, DT2, RS, DT, D2R, SSG, DAM, DVB, EGT, KSL, SUS, VIB, WS, KSR)

#### DivMacroStruct (macroInt.h:27-61)
Per-voice runtime state for ONE macro:
- **State tracking**:
  - `pos`: current position in macro sequence
  - `lastPos`: previous position (for state machine)
  - `lfoPos`: LFO waveform position (0-1023)
  - `delay`: delay counter (counts down each tick)
  - `val`: current output value (0-255 typically)
- **Flags**:
  - `has`: macro is active/valid
  - `had`: macro was active in previous tick (edge detection)
  - `actualHad`: previous state before masking
  - `finished`: just transitioned to inactive (single-tick pulse)
  - `will`: will be active next tick
  - `linger`: for vol macro, hold last value after finishing
  - `began`: first tick of macro (initial delay applies)
  - `masked`: macro is disabled by mask command
  - `activeRelease`: release point is in effect
- **Timing**: `mode` (0=sequence, 1=ADSR, 2=LFO), `type` (subtypes), `macroType` (which parameter)

#### DivMacroInt (macroInt.h:63-190)
Main interpreter for a single voice's ALL macros:
- **Common macros**: `vol`, `arp`, `duty`, `wave`, `pitch`, `ex1-3`, `alg`, `fb`, `fms`, `ams`, `panL`, `panR`, `phaseReset`, `ex4-10`
- **FM operator macros** (4 operators × 20 params each):
  - Op 0-3: `am`, `ar`, `dr`, `mult`, `rr`, `sl`, `tl`, `dt2`, `rs`, `dt`, `d2r`, `ssg`, `dam`, `dvb`, `egt`, `ksl`, `sus`, `vib`, `ws`, `ksr`
- **Runtime state**:
  - `macroList[128]`: pointers to all active macros
  - `macroSource[128]`: pointers to their DivInstrumentMacro definitions
  - `macroListLen`: number of active macros
  - `subTick`: tick counter (subtick mode: runs macro every N ticks)
  - `released`: note off flag (triggers release envelopes)
  - `hasRelease`: instrument has any release point

### 2. Per-Channel Integration

Each platform channel extends `SharedChannel<T>` (chipUtils.h:11-65):
```cpp
template<typename T> struct SharedChannel {
  // ... frequency, note, pitch, etc.
  T vol, outVol;
  DivMacroInt std;  // ← ALL macros for this channel
  // ...
};
```

**Key**: Each channel has ONE DivMacroInt instance (`std`). That instance contains all 40+ macro structures.

### 3. Macro Execution Flow

#### Initialization (Note On)
1. **NES platform example** (platform/nes.cpp:580):
   ```cpp
   chan[c.chan].macroInit(parent->getIns(chan[c.chan].ins,DIV_INS_NES));
   ```
2. **DivMacroInt::init() called** (macroInt.cpp:349-512):
   - Clears all macro runtime state
   - Iterates through instrument's `std.volMacro`, `std.arpMacro`, etc.
   - For each macro with `len > 0`:
     - Calls `ADD_MACRO(macro_state, macro_source)`
     - Adds to `macroList[]` and `macroSource[]` arrays
   - Calls `prepare()` on each active macro:
     - Sets mode, type flags from macro definition
     - Initializes LFO phase
     - Sets `has=true` flag

#### Per-Tick Processing
1. **Tick function called every engine tick** (platform/nes.cpp:298-400):
   ```cpp
   void DivPlatformNES::tick(bool sysTick) {
     for (int i=0; i<4; i++) {
       chan[i].std.next();  // ← Execute all macros for this channel
   ```
2. **DivMacroInt::next() advances all macros** (macroInt.cpp:177-194):
   ```cpp
   void DivMacroInt::next() {
     subTick--;
     for (size_t i=0; i<macroListLen; i++) {
       if (macroList[i]!=NULL && macroSource[i]!=NULL) {
         macroList[i]->doMacro(*macroSource[i],released,subTick==0);
       }
     }
     if (subTick<=0) subTick=tickMult;  // subtick mode
   }
   ```
3. **DivMacroStruct::doMacro() executes each macro** (macroInt.cpp:50-175):
   - If `masked=true`, skip (macro disabled)
   - Handle initial delay (if `began=true` and source has delay)
   - Decrement `delay` counter, return if not zero yet
   - Process three macro modes:
     - **Type 0 (Sequence)**: Read `source.val[pos]` and advance position
       - Handle looping: if `pos > rel` and not released, jump to `loop`
       - If released and past loop, stay at last position (linger)
     - **Type 1 (ADSR)**: State machine with 5 states
       - 0 = attack: increment toward 255, then transition to decay
       - 1 = decay: decrement toward sustain level, then transition to sustain
       - 2 = sustain: very slow decay, then transition to release
       - 3 = release: decrement to 0
       - 4 = end: done
       - All rates configurable via macro parameters
     - **Type 2 (LFO)**: Generate waveform
       - 3 waveform shapes: triangle, saw, pulse
       - Frequency controlled by LFO_SPEED
       - Output range: 0-255
   - All three modes interpolate between `ADSR_LOW` and `ADSR_HIGH` limits

4. **Apply macro values to sound** (platform/nes.cpp:301-361):
   ```cpp
   if (chan[i].std.vol.had) {
     chan[i].outVol=VOL_SCALE_LINEAR_BROKEN(chan[i].vol&15,MIN(15,chan[i].std.vol.val),15);
     rWrite(0x4000+i*4,(chan[i].envMode<<4)|chan[i].outVol|((chan[i].duty&3)<<6));
   }
   if (chan[i].std.arp.had) {
     chan[i].baseFreq=parent->calcArp(chan[i].note,chan[i].std.arp.val);
     chan[i].freqChanged=true;
   }
   if (chan[i].std.duty.had) {
     chan[i].duty=chan[i].std.duty.val;
   }
   if (chan[i].std.pitch.had) {
     if (chan[i].std.pitch.mode)
       chan[i].pitch2+=chan[i].std.pitch.val;
     else
       chan[i].pitch2=chan[i].std.pitch.val;
   }
   ```

#### Note Off Processing
1. **Release trigger** (playback.cpp:2096-2110):
   - On note off, engine checks if instrument has release point: `if (macroInt->hasRelease && ...)`
   - Sends `DIV_CMD_NOTE_OFF_ENV` (instead of `DIV_CMD_NOTE_OFF`) if release exists
   - This signals the platform to release macros
2. **DivMacroInt::release() called** (macroInt.cpp:335-337):
   - Sets `released=true` flag
   - Next `doMacro()` calls check this flag and jump to release state
3. **Release behavior** (macroInt.cpp:60-64):
   - If released and macro is ADSR type: jump `pos` to `rel` (release point)
   - If released and macro is sequence: switch to release linger behavior

## Macro Types and Behavior

### Sequence Mode (type=0)
- Plays through array of values, one per tick (or every N ticks if speed > 1)
- Looping: At position > `rel`, if not released, jump to `loop` position
- Release: At position >= `len`, if not released, stays at last or loops; if released, stops
- Special: vol macro has `linger` flag to hold last value indefinitely

### ADSR Mode (type=1)
- 5-stage envelope: Attack → Decay → Sustain → Release → End
- **ADSR_AR** (val[2]): attack rate (increment per tick)
- **ADSR_DR** (val[4]): decay rate
- **ADSR_SR** (val[8]): sustain rate (slow decay)
- **ADSR_RR** (val[8]): release rate (when note off)
- **ADSR_SL** (val[5]): sustain level target
- **ADSR_HT** (val[3]): hold time at peak
- **ADSR_ST** (val[6]): sustain hold time
- **ADSR_LOW/HIGH** (val[0-1]): output range
- Sustain can decay to release if SR > 0
- Release can force decay path (released && lastPos < 3 forces stage 3)

### LFO Mode (type=2)
- Continuous waveform oscillation
- **LFO_SPEED** (val[11]): frequency (added to `lfoPos` each tick)
- **LFO_WAVE** (val[12]): 0=triangle, 1=saw, 2=pulse
- **LFO_PHASE** (val[13]): initial phase offset
- **LFO_LOOP** (val[14]): loop flag
- **LFO_GLOBAL** (val[15]): global sync flag
- Output range: interpolated between ADSR_LOW and ADSR_HIGH

## Parameter Mappings

### Common Macros (All Instruments)
- **Vol (0)**: Volume (0-127 typically)
- **Arp (1)**: Arpeggio (signed note offset, or fixed note if bit 0x40000000 set)
- **Duty (2)**: Duty cycle (0-255, platform-dependent)
- **Wave (3)**: Waveform selection (0-255)
- **Pitch (4)**: Pitch offset (signed, additive or absolute per mode)
- **Ex1-3 (5-7)**: Platform-specific effects
- **Alg/FB/FMS/AMS (8-11)**: FM-specific (algorithm, feedback, modulation)
- **PanL/PanR (12-13)**: Stereo panning
- **PhaseReset (14)**: Trigger phase reset on value=1
- **Ex4-10 (15-21)**: More platform-specific effects

### FM Operator Macros (4-Operator FM Synths)
Per-operator (types 0x20-0x9F, encoding operator as (type >> 5)):
- **AM/AR/DR/D2R/RR**: Amplitude/attack/decay/decay2/release rates
- **MULT/DT/DT2**: Frequency multiplier and detuning
- **SL/TL/RS**: Sustain level, total level, rate scaling
- **SSG/DAM/DVB/EGT/KSL/SUS/VIB/WS/KSR**: OPL-specific parameters

## Key Implementation Details

### Macro Masking
- `DivMacroInt::mask(id, enabled)` can disable individual macros
- Masked macros return `had=false` so values aren't applied that tick
- Used by pattern effects to override macros temporarily

### Macro Restart
- `DivMacroInt::restart(id)` resets a specific macro to its beginning
- Calls `macroState->init()` and `prepare()`
- Used by pattern effects (4xx command in Furnace)

### Per-Channel Platform Application
Every platform's `tick()` function follows this pattern:
1. Call `chan[i].std.next()` for each channel
2. Check `chan[i].std.VOL.had`, `chan[i].std.ARP.had`, etc.
3. If `.had` is true (macro produced a new value this tick), apply it:
   - Read `.val` for the new value
   - Scale/clamp to platform's value range
   - Write to register/driver

### Subtick Mode
- `DivMacroInt::subTick` enables macros to run every N engine ticks
- Controlled by `tickMult` (usually 1, but can be higher)
- Allows macros to run slower than engine tick rate
- Applies immediately on first tick of macro sequence

## Volume Macro Linger

Volume macro has special "linger" behavior (macroInt.cpp:46):
- If `compatFlags.volMacroLinger` is set:
  - When vol macro finishes, last value is held indefinitely
  - Not reset until note off or next note on
  - Allows vol macros to reach targets without explicit end value

## Data Flow Example: NES Pulse Wave with Vol Macro

```
Instrument with:
  volMacro: [127, 100, 70, 40, 20, 10]
  speed=1, loop=4, rel=3

Note ON at tick 0:
  → macroInit() adds vol macro to macroList
  → prepare() sets has=true, pos=0, delay=0

Tick 0: std.next() → doMacro(volMacro, false, true)
  → vol.val = volMacro.val[0] = 127
  → vol.had = true
  → tick(): outVol = VOL_SCALE(15, 127, 127) = 15
  → rWrite(0x4000, (envMode<<4)|15|...) writes duty+vol to APU

Tick 1: → doMacro()
  → vol.val = volMacro.val[1] = 100
  → vol.had = true
  → tick(): outVol = VOL_SCALE(15, 100, 127) = 12

Tick 2: → doMacro()
  → vol.val = volMacro.val[2] = 70
  → vol.had = true

Tick 3 (release point, before note off):
  → doMacro()
  → vol.val = volMacro.val[3] = 40
  → vol.had = true

Note OFF at tick 3:
  → DivMacroInt::release() sets released=true

Tick 4 (after note off, released=true):
  → doMacro(volMacro, true, true)
  → released && type==0 && pos < rel && rel < len && activeRelease
    → pos = rel = 3 (jumps to release point)
  → vol.val = volMacro.val[3] = 40 (stays at release)

Tick 5-∞: Stays at vol.val = 40 (or loops from 4)
```

## WASM Implementation Expectations

A correct WASM tracker engine should:
1. Store instrument macros in instrument data (matching DivInstrumentMacro structure)
2. Maintain per-voice DivMacroInt state (or equivalent):
   - Sequence position tracker
   - Delay counter
   - ADSR state machine (if using ADSR mode)
   - LFO position (if using LFO mode)
3. Call macro processor every tick:
   - Decrement delay
   - Advance position (or envelope state, or LFO phase)
   - Calculate output value (0-255 range)
4. Apply macro values to synth parameters:
   - Check `.had` flag (new value available)
   - Scale to synth's value range (e.g., 0-15 for vol on 4-bit chip)
   - Write to audio parameter immediately
5. Handle note release:
   - Detect note off
   - Set released flag
   - Jump macros to release point (if defined)
   - Allow sustained/looping behavior after release

## Test Vectors

For auditing WASM implementation, verify:
- Volume macro controls output amplitude smoothly
- Arpeggio macro plays correct note offsets in sequence
- Duty macro changes waveform on each step
- Pitch macro produces detectable frequency changes
- ADSR macros have proper attack/decay/sustain/release envelopes
- Macro looping works (sequence repeats at loop point)
- Macro release works (jumps to release point on note off)
- Simultaneous macros on same channel don't interfere
