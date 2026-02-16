# Furnace Dispatch Command System Audit

**Date:** 2026-02-16  
**Files Audited:**
- `/Reference Code/furnace-master/src/engine/dispatch.h` - Command definitions
- `/Reference Code/furnace-master/src/engine/platform/*.cpp` - Chip implementations
- `/src/engine/furnace-dispatch/FurnaceDispatchEngine.ts` - DEViLBOX commands
- `/src/engine/furnace-dispatch/FurnaceEffectRouter.ts` - Effect routing
- `/furnace-wasm/common/FurnaceDispatchWrapper.cpp` - WASM wrapper

---

## EXECUTIVE SUMMARY

The DEViLBOX DivCmd enum in `FurnaceDispatchEngine.ts` is **complete** (227 commands matching dispatch.h). However, there are significant gaps in:

1. **Effect routing** - FurnaceEffectRouter only handles ~40% of platform-specific effects
2. **Command argument handling** - Many commands have incorrect value/value2 formats
3. **getVolMax implementations** - Different per-chip but not exposed uniformly
4. **Pitch calculation** - Linear vs non-linear pitch not handled per-chip correctly
5. **Missing macro command routing** - Extended macros (ex9, ex10) not processed chip-specifically

---

## GAP #1: Incomplete FM Effect Routing

**Reference:** genesis.cpp lines 1298-1700+ handle all FM commands:
- `DIV_CMD_FM_ALG` (value = algorithm 0-7)
- `DIV_CMD_FM_FB` (value = feedback 0-7)
- `DIV_CMD_FM_FMS` (value = frequency sens 0-7)
- `DIV_CMD_FM_AMS` (value = amplitude sens 0-3)
- `DIV_CMD_FM_MULT` (value = operator 0-3, value2 = multiplier 0-15)
- `DIV_CMD_FM_TL` (value = operator 0-3, value2 = total level 0-127)
- `DIV_CMD_FM_AR` (value = operator 0-3 or -1 for all, value2 = attack 0-31)
- `DIV_CMD_FM_DR` (value = operator 0-3 or -1 for all, value2 = decay 0-31)
- `DIV_CMD_FM_D2R` (value = operator 0-3, value2 = decay2 0-31)
- `DIV_CMD_FM_RR` (value = operator 0-3, value2 = release 0-15)
- `DIV_CMD_FM_SL` (value = operator 0-3, value2 = sustain 0-15)
- `DIV_CMD_FM_RS` (value = operator 0-3, value2 = rate scaling 0-3)
- `DIV_CMD_FM_DT` (value = operator 0-3, value2 = detune 0-7)
- `DIV_CMD_FM_DT2` (value = operator 0-3, value2 = detune2 0-3) [OPM only]
- `DIV_CMD_FM_AM` (value = operator 0-3, value2 = AM enable 0-1)
- `DIV_CMD_FM_SSG` (value = operator 0-3, value2 = SSG-EG mode 0-15)
- `DIV_CMD_FM_OPMASK` (value = operator mask bits)

**DEViLBOX:** FurnaceEffectRouter.ts lines 477-550 only routes:
- FM_LFO, FM_TL, FM_AR, FM_DR, FM_MULT, FM_RR, FM_SL, FM_DT, FM_SSG
- FM_FB (incorrectly combining with algorithm in 0x18)
- FM_AM_DEPTH, FM_PM_DEPTH

**Impact:** Missing FM_ALG, FM_FMS, FM_AMS, FM_RS, FM_D2R, FM_AM, FM_DT2, FM_OPMASK, FM_FINE, FM_FIXFREQ, FM_EXTCH, FM_HARD_RESET effects do not route. FM synths lose per-operator control for these parameters.

**Fix:** Add routing for all FM_* commands:
```typescript
case 0x1C: // FM_ALG
  commands.push({ cmd: DivCmd.FM_ALG, chan, val1: param & 7, val2: 0 });
  break;
case 0x1D: // FM_FMS
  commands.push({ cmd: DivCmd.FM_FMS, chan, val1: param & 7, val2: 0 });
  break;
```

---

## GAP #2: FM Effect Argument Order Mismatch

**Reference:** genesis.cpp DIV_CMD_FM_AR handler (line 1335):
```cpp
case DIV_CMD_FM_AR: {
  if (c.value<0) {  // value=-1 means ALL operators
    for (int i=0; i<4; i++) {
      op.ar=c.value2&31;
      ...
    }
  } else if (c.value<4) {
    DivInstrumentFM::Operator& op=chan[c.chan].state.op[orderedOps[c.value]];
    op.ar=c.value2&31;
    ...
  }
```

**DEViLBOX:** FurnaceEffectRouter.ts line 495:
```typescript
case 0x12: // 12xy - Set operator AR (x=op, y=value)
  commands.push({ cmd: DivCmd.FM_AR, chan, val1: x, val2: y * 2 });
```

**Impact:** 
- DEViLBOX multiplies y by 2 (`y * 2`), but reference uses `c.value2&31` directly
- The `* 2` is only correct for some FM chips (OPN) but not others (OPL uses 4-bit AR)

**Fix:** Value scaling should be chip-dependent:
- OPN chips (YM2612, YM2203, YM2608, etc.): AR is 5-bit (0-31), effect should be `y*2`
- OPL chips (OPL2, OPL3, OPLL): AR is 4-bit (0-15), effect should be `y`

---

## GAP #3: Missing N163 Effect Commands

**Reference:** n163.cpp lines 454-510:
- `DIV_CMD_N163_WAVE_POSITION` (value = position, value2 = flags: bit0=update curPos, bit1=update wavePos)
- `DIV_CMD_N163_WAVE_LENGTH` (value = length, value2 = flags: bit0=update curLen, bit1=update waveLen)
- `DIV_CMD_N163_GLOBAL_WAVE_LOAD` (value = wave index)
- `DIV_CMD_N163_GLOBAL_WAVE_LOADPOS` (value = position)
- `DIV_CMD_N163_CHANNEL_LIMIT` (value = max channels 0-7)

**DEViLBOX:** FurnaceEffectRouter.ts lines 805-823 routes basic N163 commands but:
- Does NOT pass value2 flags for wave position/length commands
- Missing N163_WAVE_LOADLEN, N163_WAVE_LOADPOS (load target position)

**Impact:** N163 wave RAM management effects don't work correctly. Wave position latching and per-channel wave loading fail.

**Fix:** Update routeNamcoEffect to pass value2:
```typescript
case 0x11: // Set wave position
  commands.push({ cmd: DivCmd.N163_WAVE_POSITION, chan, val1: param, val2: 3 }); // Both flags
  break;
```

---

## GAP #4: Missing ES5506 Filter Commands

**Reference:** es5506.cpp handles 11 unique commands:
- `DIV_CMD_ES5506_FILTER_MODE` (0-3: off, LP, K2 to LP, HP to K2 to LP)
- `DIV_CMD_ES5506_FILTER_K1` (value = 16-bit K1, value2 = update mask)
- `DIV_CMD_ES5506_FILTER_K2` (value = 16-bit K2, value2 = update mask)
- `DIV_CMD_ES5506_FILTER_K1_SLIDE` (value = speed, value2 = direction)
- `DIV_CMD_ES5506_FILTER_K2_SLIDE` (value = speed, value2 = direction)
- `DIV_CMD_ES5506_ENVELOPE_COUNT` (value = envelope count 0-511)
- `DIV_CMD_ES5506_ENVELOPE_LVRAMP` (value = left vol ramp)
- `DIV_CMD_ES5506_ENVELOPE_RVRAMP` (value = right vol ramp)
- `DIV_CMD_ES5506_ENVELOPE_K1RAMP` (value = K1 ramp, value2 = slowdown)
- `DIV_CMD_ES5506_ENVELOPE_K2RAMP` (value = K2 ramp, value2 = slowdown)
- `DIV_CMD_ES5506_PAUSE` (value = pause flag)

**DEViLBOX:** FurnaceEffectRouter.ts lines 838-853 only routes:
- ES5506_FILTER_MODE (0x14)
- ES5506_FILTER_K1 (0x15 - high byte only, wrong mask format)
- ES5506_FILTER_K2 (0x16 - high byte only, wrong mask format)

**Impact:** ES5506 envelope ramps, filter slides, and pause don't work. Filter K1/K2 only receive high byte with incorrect mask.

**Fix:** Add complete ES5506 effect routing and fix K1/K2 mask handling:
```typescript
case 0x20: // ES5506 envelope count
  commands.push({ cmd: DivCmd.ES5506_ENVELOPE_COUNT, chan, val1: param, val2: 0 });
  break;
case 0x21: // K1 slide
  commands.push({ cmd: DivCmd.ES5506_FILTER_K1_SLIDE, chan, val1: param & 0x7F, val2: (param >> 7) & 1 });
  break;
```

---

## GAP #5: Missing SNES Effect Commands

**Reference:** snes.cpp dispatch function handles:
- `DIV_CMD_SNES_ECHO` (value = enable)
- `DIV_CMD_SNES_PITCH_MOD` (value = enable)
- `DIV_CMD_SNES_INVERT` (value = bits: upper=invertL, lower=invertR)
- `DIV_CMD_SNES_GAIN_MODE` (value = 0:ADSR, 1:direct, 2:dec linear, 3:dec log, 4:inc linear, 5:inc bent)
- `DIV_CMD_SNES_GAIN` (value = gain 0-127 or 0-31 depending on mode)
- `DIV_CMD_SNES_ECHO_ENABLE` (value = global echo on/off)
- `DIV_CMD_SNES_ECHO_DELAY` (value = delay 0-15)
- `DIV_CMD_SNES_ECHO_VOL_LEFT` (value = signed -128 to 127)
- `DIV_CMD_SNES_ECHO_VOL_RIGHT` (value = signed -128 to 127)
- `DIV_CMD_SNES_ECHO_FEEDBACK` (value = signed feedback)
- `DIV_CMD_SNES_ECHO_FIR` (value = FIR index 0-7, value2 = coefficient)
- `DIV_CMD_SNES_GLOBAL_VOL_LEFT` (value = master L vol)
- `DIV_CMD_SNES_GLOBAL_VOL_RIGHT` (value = master R vol)

**DEViLBOX:** FurnaceEffectRouter.ts lines 616-667 routes all basic SNES effects but:
- Missing SNES_ECHO_ENABLE global control
- Missing signed value handling for echo volumes (-128 to 127)
- FIR routing doesn't use value2 for coefficient

**Impact:** SNES echo DSP effects have limited control. FIR filter coefficients can't be set individually.

**Fix:**
```typescript
case 0x1A: // Echo enable (global)
  commands.push({ cmd: DivCmd.SNES_ECHO_ENABLE, chan, val1: param, val2: 0 });
  break;
case 0x15: // FIR coefficient
  const firIndex = (param >> 4) & 7;
  const firCoef = (param & 0xF) * 16 - 128; // Convert to signed
  commands.push({ cmd: DivCmd.SNES_ECHO_FIR, chan, val1: firIndex, val2: firCoef });
  break;
```

---

## GAP #6: C64 Extended Commands Missing

**Reference:** c64.cpp dispatch handles:
- `DIV_CMD_C64_CUTOFF` (value = coarse 0-100 → scaled to 0-2047)
- `DIV_CMD_C64_FINE_CUTOFF` (value = raw 0-2047)
- `DIV_CMD_C64_RESONANCE` (value = 0-15)
- `DIV_CMD_C64_FILTER_MODE` (value = bits: LP|BP|HP)
- `DIV_CMD_C64_RESET_TIME` (value = test bit timing)
- `DIV_CMD_C64_RESET_MASK` (value = channel mask)
- `DIV_CMD_C64_FILTER_RESET` (value = upper nibble=after, lower=now)
- `DIV_CMD_C64_DUTY_RESET` (value = upper nibble=after, lower=now)
- `DIV_CMD_C64_EXTENDED` (value = command<<4|param: 0x=attack, 1x=decay, 2x=sustain, 3x=release, 4x=ring, 5x=sync, 6x=ch3off)
- `DIV_CMD_C64_AD` (value = attack<<4|decay)
- `DIV_CMD_C64_SR` (value = sustain<<4|release)
- `DIV_CMD_C64_PW_SLIDE` (value = speed, value2 = direction)
- `DIV_CMD_C64_CUTOFF_SLIDE` (value = speed, value2 = direction)

**DEViLBOX:** FurnaceEffectRouter.ts routes basic C64 effects but:
- C64_RESET_TIME, C64_RESET_MASK not routed
- C64_PW_SLIDE, C64_CUTOFF_SLIDE not routed (lines 700-710 in c64.cpp)
- C64_FINE_DUTY uses wrong scaling

**Impact:** SID test bit timing (essential for hard sync), pulse width slides, and filter cutoff slides don't work.

**Fix:** Add pulse width and cutoff slide routing:
```typescript
case 0x20: // PW slide
  commands.push({ cmd: DivCmd.C64_PW_SLIDE, chan, val1: Math.abs(param), val2: param < 0 ? 1 : 0 });
  break;
case 0x21: // Cutoff slide
  commands.push({ cmd: DivCmd.C64_CUTOFF_SLIDE, chan, val1: Math.abs(param), val2: param < 0 ? 1 : 0 });
  break;
```

---

## GAP #7: Volume Scaling Per-Chip (GET_VOLMAX)

**Reference:** Each platform returns different GET_VOLMAX:
| Platform | VOLMAX | Scaling Type |
|----------|--------|--------------|
| GB | 15 | Linear |
| NES | 15 | Linear |
| C64/SID | 15 | Linear |
| SNES | 127 | Linear |
| Genesis FM | 127 | Logarithmic |
| OPL/OPL2 | 63 | Logarithmic |
| OPL3 | 63 | Logarithmic |
| PCE | 31 | Linear |
| AY/YM2149 | 15 | Linear |
| Amiga | 64 | Linear |
| ES5506 | 65535 | Linear 16-bit |
| QSound | 16383 | Linear |

**DEViLBOX:** FurnaceEffectRouter.ts uses fixed volume scaling (0-255 range) without querying GET_VOLMAX per platform.

**Impact:** Volume commands may clip or underflow on platforms with non-15 VOLMAX.

**Fix:** Query GET_VOLMAX on platform init and scale volume accordingly:
```typescript
private volMax: number = 15;

setPlatform(platformType: number): void {
  switch (platformType) {
    case FurnaceDispatchPlatform.SNES: this.volMax = 127; break;
    case FurnaceDispatchPlatform.YM2612: this.volMax = 127; break;
    // ...
  }
}
```

---

## GAP #8: Pitch Calculation Method Per-Chip

**Reference:** dispatch.h macros:
- `NOTE_PERIODIC(x)` - For period-based chips (GB, NES, Amiga, etc.)
- `NOTE_FREQUENCY(x)` - For frequency-based chips (C64, etc.)
- `NOTE_FNUM_BLOCK(x,bits,blk)` - For FM chips with F-num/block registers

Each chip's `dispatch()` uses the appropriate method based on hardware.

**DEViLBOX:** FurnaceEffectRouter.ts doesn't differentiate between pitch calculation methods when routing portamento and pitch effects.

**Impact:** Portamento slides at wrong rates on period-based vs frequency-based chips. FM chips with block registers may overflow.

**Fix:** The WASM dispatch handles this correctly (it calls the chip's dispatch() which uses the correct method). No change needed in TypeScript if effects use DivCmd.NOTE_PORTA correctly.

---

## GAP #9: Missing MultiPCM Commands

**Reference:** dispatch.h defines 15 MultiPCM-specific commands:
- `DIV_CMD_MULTIPCM_MIX_FM` / `_PCM`
- `DIV_CMD_MULTIPCM_LFO`, `_VIB`, `_AM`
- `DIV_CMD_MULTIPCM_AR`, `_D1R`, `_DL`, `_D2R`, `_RC`, `_RR`
- `DIV_CMD_MULTIPCM_DAMP`, `_PSEUDO_REVERB`, `_LFO_RESET`, `_LEVEL_DIRECT`

**DEViLBOX:** FurnaceEffectRouter.ts has NO routing for MultiPCM effects.

**Impact:** MultiPCM (Sega Model 2 PCM) chip cannot use any of its unique DSP features.

**Fix:** Add entire MultiPCM effect routing section.

---

## GAP #10: Missing SID3 Commands

**Reference:** dispatch.h defines 13 SID3 commands (SID3 is a hypothetical enhanced SID):
- `DIV_CMD_SID3_SPECIAL_WAVE`
- `DIV_CMD_SID3_RING_MOD_SRC`, `_HARD_SYNC_SRC`, `_PHASE_MOD_SRC`
- `DIV_CMD_SID3_WAVE_MIX`
- `DIV_CMD_SID3_LFSR_FEEDBACK_BITS`
- `DIV_CMD_SID3_1_BIT_NOISE`
- `DIV_CMD_SID3_FILTER_*` (distortion, output volume, connection, matrix, enable)
- `DIV_CMD_SID3_CHANNEL_INVERSION`
- `DIV_CMD_SID3_PHASE_RESET`, `_NOISE_PHASE_RESET`, `_ENVELOPE_RESET`
- `DIV_CMD_SID3_CUTOFF_SCALING`, `_RESONANCE_SCALING`

**DEViLBOX:** No SID3 effect routing exists.

**Impact:** SID3 platform (if used) loses all unique features.

**Fix:** Add SID3 routing to C64 family effects (SID3 uses same family).

---

## GAP #11: Missing DAVE Commands

**Reference:** dispatch.h:
- `DIV_CMD_DAVE_HIGH_PASS`
- `DIV_CMD_DAVE_RING_MOD`
- `DIV_CMD_DAVE_SWAP_COUNTERS`
- `DIV_CMD_DAVE_LOW_PASS`
- `DIV_CMD_DAVE_CLOCK_DIV`

**DEViLBOX:** No DAVE effect routing exists.

**Impact:** Enterprise 64/128 DAVE chip loses DSP control.

**Fix:** Add DAVE to 'other' platform family routing.

---

## GAP #12: Missing PowerNoise Commands

**Reference:**
- `DIV_CMD_POWERNOISE_COUNTER_LOAD` (value = which counter, value2 = load value)
- `DIV_CMD_POWERNOISE_IO_WRITE` (value = port, value2 = data)

**DEViLBOX:** No PowerNoise routing.

**Impact:** PowerNoise chip (TPT99 / Fake PSG) loses counter control.

---

## GAP #13: Missing Bifurcator Commands

**Reference:**
- `DIV_CMD_BIFURCATOR_STATE_LOAD` (value = state)
- `DIV_CMD_BIFURCATOR_PARAMETER` (value = param index, value2 = value)

**DEViLBOX:** No Bifurcator routing.

**Impact:** Bifurcator chaos synth chip can't be controlled.

---

## GAP #14: Missing Sound Unit Commands

**Reference:** dispatch.h:
- `DIV_CMD_SU_SWEEP_PERIOD_LOW`, `_HIGH`
- `DIV_CMD_SU_SWEEP_BOUND`
- `DIV_CMD_SU_SWEEP_ENABLE`
- `DIV_CMD_SU_SYNC_PERIOD_LOW`, `_HIGH`

**DEViLBOX:** No Sound Unit (tildearrow Sound Unit) routing in sample family.

---

## GAP #15: Missing X1-010 Commands

**Reference:**
- `DIV_CMD_X1_010_ENVELOPE_SHAPE`, `_ENABLE`, `_MODE`, `_PERIOD`, `_SLIDE`
- `DIV_CMD_X1_010_AUTO_ENVELOPE`
- `DIV_CMD_X1_010_SAMPLE_BANK_SLOT`

**DEViLBOX:** X1-010 platform exists in enum but no effect routing.

**Impact:** Seta X1-010 hardware envelope features don't work.

---

## GAP #16: Gate/Trigger Behavior Differences

**Reference:** PRE_NOTE and gate handling varies:
- C64: Uses PRE_NOTE for test bit timing before note (c64.cpp line 512)
- GB: Uses hardware sequences with WAIT_REL
- FM: Uses DIV_CMD_FM_HARD_RESET for operator envelope reset

**DEViLBOX:** PRE_NOTE is routed (FurnaceEffectRouter.ts line 392) but:
- Only delays note, doesn't handle C64's test bit reset sequence
- Doesn't interact with FM hard reset properly

**Impact:** Test bit sequences on SID and hard reset envelopes on FM don't trigger correctly.

---

## GAP #17: Sample Command Routing

**Reference:** dispatch.h sample commands:
- `DIV_CMD_SAMPLE_MODE` (value = mode)
- `DIV_CMD_SAMPLE_FREQ` (value = frequency)
- `DIV_CMD_SAMPLE_BANK` (value = bank number)
- `DIV_CMD_SAMPLE_POS` (value = position)
- `DIV_CMD_SAMPLE_DIR` (value = direction: 0=forward, 1=backward, 2=pingpong)

**DEViLBOX:** FurnaceEffectRouter.ts routes these in sample family (lines 830-843) but:
- SAMPLE_FREQ is not routed
- SAMPLE_POS only gets high byte shifted (`param << 8`)

**Impact:** Sample frequency changes and precise position seeking don't work.

**Fix:** Add SAMPLE_FREQ routing and full 16-bit position:
```typescript
case 0x1F: // Sample frequency
  commands.push({ cmd: DivCmd.SAMPLE_FREQ, chan, val1: param, val2: 0 });
  // For 16-bit: use two effects 1Fxx (high) + 1Exx (low)
  break;
```

---

## GAP #18: ESFM Effect Commands

**Reference:**
- `DIV_CMD_ESFM_OP_PANNING` (value = operator, value2 = pan)
- `DIV_CMD_ESFM_OUTLVL` (value = operator, value2 = output level)
- `DIV_CMD_ESFM_MODIN` (value = operator, value2 = modulation input)
- `DIV_CMD_ESFM_ENV_DELAY` (value = operator, value2 = delay)

**DEViLBOX:** No ESFM routing exists.

**Impact:** ESFM (ESS FM) per-operator panning and modulation routing don't work.

---

## GAP #19: FDS Modulation Commands

**Reference:**
- `DIV_CMD_FDS_MOD_DEPTH`
- `DIV_CMD_FDS_MOD_HIGH`, `_LOW` (modulator speed)
- `DIV_CMD_FDS_MOD_POS`
- `DIV_CMD_FDS_MOD_WAVE`
- `DIV_CMD_FDS_MOD_AUTO` (automatic modulation mode)

**DEViLBOX:** FurnaceEffectRouter.ts NES family (line 727-739) routes MOD_DEPTH, MOD_HIGH, MOD_LOW but:
- Missing FDS_MOD_POS
- Missing FDS_MOD_WAVE
- Missing FDS_MOD_AUTO

**Impact:** FDS modulation table loading and position control don't work.

---

## GAP #20: WonderSwan Commands

**Reference:**
- `DIV_CMD_WS_SWEEP_TIME` (value = time)
- `DIV_CMD_WS_SWEEP_AMOUNT` (value = amount)
- `DIV_CMD_WS_GLOBAL_SPEAKER_VOLUME` (value = speaker vol multiplier)

**DEViLBOX:** No WonderSwan routing exists.

**Impact:** WonderSwan sweep effects and speaker volume control don't work.

---

## GAP #21: QSound Surround Command

**Reference:**
- `DIV_CMD_QSOUND_ECHO_FEEDBACK`
- `DIV_CMD_QSOUND_ECHO_DELAY`
- `DIV_CMD_QSOUND_ECHO_LEVEL`
- `DIV_CMD_QSOUND_SURROUND` (value = surround mode)

**DEViLBOX:** FurnaceEffectRouter.ts routes echo commands (lines 855-862) but:
- QSOUND_SURROUND is routed (line 862) ✓
- QSOUND_ECHO_DELAY is NOT routed

**Impact:** QSound echo delay changes don't work.

**Fix:** Add QSOUND_ECHO_DELAY:
```typescript
case 0x1B: // Echo delay
  commands.push({ cmd: DivCmd.QSOUND_ECHO_DELAY, chan, val1: param, val2: 0 });
  break;
```

---

## GAP #22: Macro Control Commands Not Chip-Aware

**Reference:** 
- `DIV_CMD_MACRO_OFF` (value = macro type bitmask)
- `DIV_CMD_MACRO_ON` (value = macro type bitmask)
- `DIV_CMD_MACRO_RESTART` (value = macro type)

Macro types are chip-specific (ex1-ex10 meanings vary by platform).

**DEViLBOX:** FurnaceEffectRouter routes MACRO_ON (line 397) generically but doesn't map macro types per-chip.

**Impact:** Macro on/off commands may target wrong macros on certain platforms.

---

## GAP #23: Lynx LFSR Command

**Reference:**
- `DIV_CMD_LYNX_LFSR_LOAD` (value = LFSR seed value)

**DEViLBOX:** No Lynx routing exists.

**Impact:** Atari Lynx LFSR (noise) seeding doesn't work.

---

## GAP #24: PCE LFO Commands Incomplete

**Reference:**
- `DIV_CMD_PCE_LFO_MODE` (value = 0:off, 1:add, 2:mul)
- `DIV_CMD_PCE_LFO_SPEED` (value = 0-255)

**DEViLBOX:** Routes both (lines 747-756) ✓

**Status:** COMPLETE.

---

## GAP #25: AY Commands Incomplete

**Reference:**
- `DIV_CMD_AY_ENVELOPE_SET`, `_LOW`, `_HIGH`, `_SLIDE`
- `DIV_CMD_AY_NOISE_MASK_AND`, `_OR`
- `DIV_CMD_AY_AUTO_ENVELOPE`, `_AUTO_PWM`
- `DIV_CMD_AY_IO_WRITE` (value = port, value2 = data)

**DEViLBOX:** Routes envelope commands (lines 770-793) but:
- AY_NOISE_MASK_AND/OR not routed
- AY_AUTO_PWM not routed
- AY_IO_WRITE not routed

**Impact:** AY extended noise and I/O port features don't work.

---

## GAP #26: SAA Envelope Command

**Reference:**
- `DIV_CMD_SAA_ENVELOPE` (value = envelope mode)

**DEViLBOX:** No SAA1099 routing (falls through to PSG family but SAA_ENVELOPE not handled).

**Impact:** SAA1099 hardware envelope doesn't work.

---

## GAP #27: Amiga Filter/AM/PM

**Reference:**
- `DIV_CMD_AMIGA_FILTER` (value = LED filter on/off)
- `DIV_CMD_AMIGA_AM` (value = amplitude modulation)
- `DIV_CMD_AMIGA_PM` (value = phase modulation)

**DEViLBOX:** No specific Amiga routing (sample family doesn't include these).

**Impact:** Amiga LED filter control and modulation don't work.

---

## SUMMARY TABLE

| Category | Commands in Reference | Routed in DEViLBOX | Gap |
|----------|----------------------|-------------------|-----|
| Core (NOTE_ON, etc.) | 14 | 14 | 0 |
| HINT_* (ROM export) | 14 | 8 | 6 |
| Sample | 5 | 3 | 2 |
| FM Core | 30 | 14 | 16 |
| GB | 2 | 2 | 0 |
| NES/FDS | 8 | 5 | 3 |
| C64 | 14 | 8 | 6 |
| AY | 9 | 5 | 4 |
| SNES | 13 | 10 | 3 |
| N163 | 10 | 4 | 6 |
| ES5506 | 11 | 3 | 8 |
| QSound | 4 | 3 | 1 |
| MultiPCM | 15 | 0 | 15 |
| SID3 | 13 | 0 | 13 |
| DAVE | 5 | 0 | 5 |
| PowerNoise | 2 | 0 | 2 |
| Bifurcator | 2 | 0 | 2 |
| X1-010 | 7 | 0 | 7 |
| Sound Unit | 6 | 0 | 6 |
| ESFM | 4 | 0 | 4 |
| WonderSwan | 3 | 0 | 3 |
| Amiga | 3 | 0 | 3 |
| Lynx | 1 | 0 | 1 |
| SAA | 1 | 0 | 1 |
| PCE | 2 | 2 | 0 |
| Macro Control | 3 | 2 | 1 |
| **TOTAL** | ~227 | ~90 | **~137** |

---

## PRIORITY FIXES

### P0 - Critical (Breaks imported files)
1. **GAP #2**: FM effect value scaling is chip-dependent
2. **GAP #3**: N163 wave position/length flags missing
3. **GAP #6**: C64 slide effects missing

### P1 - High (Major features broken)
1. **GAP #1**: Complete FM effect routing
2. **GAP #4**: ES5506 envelope/filter
3. **GAP #5**: SNES FIR and global volume
4. **GAP #7**: Volume scaling per-chip

### P2 - Medium (Platform-specific)
1. **GAP #9**: MultiPCM effects
2. **GAP #17**: Sample frequency
3. **GAP #19**: FDS modulation
4. **GAP #25**: AY noise mask

### P3 - Low (Rare platforms)
1. All chip-specific gaps for less common platforms (DAVE, Bifurcator, SID3, etc.)
