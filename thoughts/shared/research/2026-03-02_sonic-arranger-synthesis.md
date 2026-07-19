---
date: 2026-03-02
topic: sonic-arranger-synthesis-engine
tags: [sonic-arranger, synthesis, wasm, amiga, research]
status: final
---

# Sonic Arranger Synthesis Engine — Complete Research

## Sources Consulted

| Priority | Source | Path / URL |
|----------|--------|------------|
| 1 (PRIMARY) | NostalgicPlayer C# worker | `Reference Code/NostalgicPlayer-main/Source/Agents/Players/SonicArranger/SonicArrangerWorker.cs` |
| 2 | NostalgicPlayer containers | `Reference Code/NostalgicPlayer-main/Source/Agents/Players/SonicArranger/Containers/*.cs` |
| 3 | Format spec | `Reference Code/NostalgicPlayer-main/Format_Descriptions/Sonic Arranger.txt` |
| 4 | DEViLBOX format doc | `docs/formats/SonicArranger.md` |
| 5 | 68k ASM replayer | `third-party/uade-3.05/amigasrc/players/wanted_team/Sonic_Arranger/Sonic Arranger_v1.asm` |
| 6 | Existing parser | `src/lib/import/formats/SonicArrangerParser.ts` |
| 7 | Pyrdacor standalone | https://github.com/Pyrdacor/SonicArranger (TrackState.cs) |

---

## A. Complete List of Synthesis Effect Modes

There are 18 modes total (0-17). Mode 0 is "no effect" (static waveform). Modes 1-17 mutate the waveform buffer each tick.

All effects operate on the **per-voice waveform buffer** (`VoiceInfo.WaveformBuffer`, 128 bytes of `int8`). This buffer is initialized from the instrument's waveform table entry when a synth note triggers, then mutated in-place each tick by the active synthesis effect.

### Effect Dispatch

From the ASM (lbC00117A), each tick:
1. Decrement `EffectDelayCounter`. If not zero, skip.
2. Reload `EffectDelayCounter` from `instr.EffectDelay`.
3. Read `instr.Effect` (0-17). If <= 0 or > 17, skip (RTS).
4. Jump to the effect handler via the jump table.

From NostalgicPlayer (`DoSynthEffects`, line 1808):
```csharp
voiceInfo.EffectDelayCounter--;
if (voiceInfo.EffectDelayCounter == 0) {
    voiceInfo.EffectDelayCounter = instr.EffectDelay;
    switch (instr.Effect) { ... }
}
```

### Shared Parameters

Every synthesis effect uses these fields from the instrument:
- **EffectArg1** (uint16): Effect-specific parameter (see per-effect below)
- **EffectArg2** (uint16): Typically "start position" or secondary param
- **EffectArg3** (uint16): Typically "stop position" or tertiary param
- **EffectDelay** (uint16): Ticks between effect applications (rate control)

Per-voice state:
- **SynthEffectPosition** (uint16): Current position cursor within effect range
- **SynthEffectWavePosition** (uint16): Secondary position cursor
- **Flag** (byte): Bit flags controlling effect behavior

### IncrementSynthEffectPosition Helper

Used by most effects. Increments `SynthEffectPosition`; if it reaches `EffectArg3` (stop), wraps to `EffectArg2` (start):
```
pos++; if (pos >= stop) pos = start;
```

---

### Mode 0: None (Fx Off)
- **Enum:** `SynthesisEffect.None` (0)
- **Algorithm:** No operation. Waveform stays static.
- **Parameters:** N/A

### Mode 1: Wave Negator
- **Enum:** `SynthesisEffect.WaveNegator` (1)
- **Algorithm:** Negates one byte per tick at `SynthEffectPosition`, then advances position.
- **Code:** `buffer[pos] = -buffer[pos]`
- **Parameters:** EffectArg1=unused, EffectArg2=start, EffectArg3=stop
- **ASM ref:** lbC0011AC — `NEG.B 0(A0,D0.W)`
- **Behavior:** Creates a progressive inversion sweep through the waveform range, producing a time-varying timbre change.

### Mode 2: Free Negator
- **Enum:** `SynthesisEffect.FreeNegator` (2)
- **Algorithm:** Uses a secondary waveform (EffectArg1) as a modulation source. Reads `waveform[wavePos] & 0x7F` as a threshold `waveVal`. Then walks the waveform buffer backward: bytes above the threshold are copied from the original source waveform; bytes below are negated copies.
- **Parameters:** EffectArg1=modulation waveform number, EffectArg2=wave length, EffectArg3=wave repeat
- **Per-voice state:** Uses `SynthEffectWavePosition` to step through the modulation waveform.
- **Stop condition:** When `wavePos > (waveLength + waveRepeat)`, wraps to `waveLength`. If `waveRepeat==0` and `waveVal==0`, sets Flag bit 2 (stops further processing).
- **Behavior:** Produces a dynamic partial-inversion effect modulated by a lookup waveform. The modulation waveform controls how much of the source is negated vs kept intact.
- **ASM ref:** lbC0011BC

### Mode 3: Rotate Vertical
- **Enum:** `SynthesisEffect.RotateVertical` (3)
- **Algorithm:** Adds a signed delta value to every byte in the range [start..stop]. This shifts the waveform vertically (DC offset shift).
- **Code:** `for i in [start..stop]: buffer[i] += delta`
- **Parameters:** EffectArg1=delta (cast to int8), EffectArg2=start, EffectArg3=stop
- **Behavior:** Progressive DC offset. With wrapping int8 arithmetic, this creates a brightness/harmonic change as the wave "rotates" vertically through amplitude space. Applied cumulatively each tick.
- **ASM ref:** lbC001280

### Mode 4: Rotate Horizontal
- **Enum:** `SynthesisEffect.RotateHorizontal` (4)
- **Algorithm:** Shifts all bytes in [start..stop] left by one position. The first byte wraps to the end.
- **Code:** `first = buf[start]; for i in [start..stop-1]: buf[i] = buf[i+1]; buf[stop] = first;`
- **Parameters:** EffectArg1=unused, EffectArg2=start, EffectArg3=stop
- **Behavior:** Circular left-rotate of the waveform. Produces a phase-shifting / PWM-like effect that cycles the waveform shape. Each tick shifts one sample position.
- **ASM ref:** lbC0012CE

### Mode 5: Alien Voice
- **Enum:** `SynthesisEffect.AlienVoice` (5)
- **Algorithm:** Adds a source waveform (EffectArg1) to the current buffer, sample by sample in [start..stop]. Accumulative.
- **Code:** `for i in [start..stop]: buffer[i] += sourceWave[i]`
- **Parameters:** EffectArg1=source waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Ring-modulation-like effect. Each tick adds the source waveform, causing the buffer to drift further from its original shape. Since int8 wraps, this creates increasingly distorted / "alien" timbres.
- **Note:** Does NOT call `IncrementSynthEffectPosition` — the effect applies globally to the range each tick.
- **ASM ref:** lbC0012F0

### Mode 6: Poly Negator
- **Enum:** `SynthesisEffect.PolyNegator` (6)
- **Algorithm:** Two operations per tick:
  1. Restores the original waveform value at `SynthEffectPosition` from the source waveform.
  2. Negates the NEXT byte `(position+1)` in the buffer (wrapping to start if at stop).
  Then increments position.
- **Code:**
  ```
  buffer[pos] = sourceWave[pos];
  if (pos >= stop) pos = start - 1;
  buffer[pos + 1] = -buffer[pos + 1];
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=unused, EffectArg2=start, EffectArg3=stop
- **Behavior:** Creates an alternating restore-and-negate pattern that sweeps through the waveform. Produces a choppy, harmonically rich effect.
- **ASM ref:** lbC00135A

### Mode 7: Shack Wave 1
- **Enum:** `SynthesisEffect.ShackWave1` (7)
- **Algorithm:** Reads one byte from source waveform at `[start + SynthEffectPosition]` as a delta, then adds that delta to ALL bytes in [start..stop]. Then increments position.
- **Code:**
  ```
  delta = sourceWave[start + pos];
  for i in [start..stop]: buffer[i] += delta;
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=source waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Time-varying DC shift where the shift amount is read from a waveform. Creates a tremolo-like amplitude modulation.
- **ASM ref:** lbC00138E

### Mode 8: Shack Wave 2
- **Enum:** `SynthesisEffect.ShackWave2` (8)
- **Algorithm:** Same as ShackWave1, PLUS negates one byte at `[start + SynthEffectWavePosition]` and advances `SynthEffectWavePosition`. Wraps `SynthEffectWavePosition` when it exceeds `(stop - start)`.
- **Parameters:** EffectArg1=source waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Combines ShackWave1's modulation with a progressive negation sweep — more aggressive timbral change.
- **ASM ref:** lbC0013F6

### Mode 9: Metamorph
- **Enum:** `SynthesisEffect.Metamorph` (9)
- **Algorithm:** Gradually morphs the waveform buffer toward a target waveform (EffectArg1). For each byte in [start..stop], if buffer != target, move 1 step closer (+1 or -1). When all bytes match, sets Flag bit 1 (morph complete).
- **Code:**
  ```
  for i in [start..stop]:
    if buffer[i] != target[i]:
      setFlag = true;
      buffer[i] += (buffer[i] < target[i]) ? 1 : -1;
  if (!setFlag) flag |= 0x02;
  ```
- **Parameters:** EffectArg1=target waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Smooth waveform morphing. Rate is controlled by EffectDelay. The morph stops when the buffer exactly matches the target. This is the primary waveform-crossfade effect.
- **Shared helper:** `MetamorphAndOszilatorHelper()` (also used by Mode 15: Oszilator)
- **ASM ref:** lbC001452

### Mode 10 (0x0A): Laser
- **Enum:** `SynthesisEffect.Laser` (10)
- **Algorithm:** Adds a signed detune value to `SlideValue` each tick, for up to `repeats` ticks. This modifies the pitch directly (SlideValue is subtracted from the period).
- **Code:**
  ```
  if (wavePos < repeats) { SlideValue += detune; wavePos++; }
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=unused, EffectArg2=detune (cast to int8), EffectArg3=repeats
- **Behavior:** Pitch sweep effect ("laser" sound). Does NOT modify waveform data — modifies pitch instead. The detune accumulates, creating a linear pitch ramp.
- **ASM ref:** lbC001552

### Mode 11 (0x0B): Wave Alias
- **Enum:** `SynthesisEffect.WaveAlias` (11)
- **Algorithm:** For each byte in [start..stop], compares with the NEXT byte. If current > next, subtract delta; if current <= next, add delta.
- **Code:**
  ```
  for i in [start..stop]:
    if buffer[i] > buffer[i+1]: buffer[i] -= delta;
    else: buffer[i] += delta;
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=delta (cast to int8), EffectArg2=start, EffectArg3=stop
- **Behavior:** Edge-detection/sharpening effect. Pushes each sample further from its neighbor, creating aliasing/distortion. With int8 wrapping, this produces increasingly harsh timbres.
- **ASM ref:** lbC00156E

### Mode 12 (0x0C): Noise Generator 1
- **Enum:** `SynthesisEffect.NoiseGenerator1` (12)
- **Algorithm:** XORs one byte at `SynthEffectPosition` with a random value, then advances.
- **Code:** `buffer[pos] ^= random(-128..127); IncrementSynthEffectPosition();`
- **Parameters:** EffectArg1=unused, EffectArg2=start, EffectArg3=stop
- **Behavior:** Progressive noise injection. One byte per tick gets corrupted with noise. Over time, the entire waveform becomes noise.
- **ASM ref:** lbC00160C

### Mode 13 (0x0D): Low Pass Filter 1
- **Enum:** `SynthesisEffect.LowPassFilter1` (13)
- **Algorithm:** For each adjacent pair in [start..stop] (wrapping: last compares to first), computes `|buf[i] - buf[i+1]|`. If this exceeds delta, smooths by +2 or -2 toward the neighbor.
- **Code:**
  ```
  for i in [start..stop]:
    next = (i == stop) ? buf[start] : buf[i+1];
    flag = (buf[i] <= next);
    diff = abs(buf[i] - next);
    if diff > delta:
      buf[i] += flag ? 2 : -2;
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=delta threshold, EffectArg2=start, EffectArg3=stop
- **Behavior:** Simple smoothing filter. Gradually removes sharp transitions from the waveform. Higher delta = more tolerance (less smoothing). Applied cumulatively, this eventually flattens the waveform toward a near-DC signal.
- **ASM ref:** lbC00164C

### Mode 14 (0x0E): Low Pass Filter 2
- **Enum:** `SynthesisEffect.LowPassFilter2` (14)
- **Algorithm:** Same as LPF1, but the delta threshold is read per-sample from a secondary waveform (EffectArg1), reading from `stopPosition` backward. The waveform value is `& 0x7F` (unsigned 0-127). Index wraps at 128.
- **Parameters:** EffectArg1=threshold waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Variable-threshold smoothing filter. The secondary waveform acts as a filter cutoff control — where the waveform has high values, less smoothing occurs. Creates a more musical, time-varying filter effect.
- **ASM ref:** lbC00169E

### Mode 15 (0x0F): Oszilator (Oscillator)
- **Enum:** `SynthesisEffect.Oszilator` (15)
- **Algorithm:** Alternates morphing between two waveforms (the instrument's base waveform and EffectArg1). Uses the same `MetamorphAndOszilatorHelper` as Metamorph. When morph completes (Flag bit 1), toggles Flag bit 3 to switch target, clears bit 1 to restart.
- **Code:**
  ```
  if (flag & 0x02): flag ^= 0x08; flag &= ~0x02;
  source = (flag & 0x08) ? baseWaveform : effectArg1Waveform;
  MetamorphAndOszilatorHelper(source);
  ```
- **Parameters:** EffectArg1=alternate waveform number, EffectArg2=start, EffectArg3=stop
- **Behavior:** Continuous oscillation between two waveforms. The buffer repeatedly morphs from wave A to wave B and back. Rate depends on waveform similarity and EffectDelay.
- **ASM ref:** lbC001422 (note: jump table maps mode 15 to this address)

### Mode 16 (0x10): Noise Generator 2
- **Enum:** `SynthesisEffect.NoiseGenerator2` (16)
- **Algorithm:** For each byte in [start..stop] (backward iteration):
  1. XOR with 0x05
  2. Rotate left by 2 bits
  3. Add a random value
- **Code:**
  ```
  for count = (stop-start) downto 0:
    val = buffer[start + count];
    val ^= 0x05;
    val = (val << 2) | (val >>> 6);  // rotate left 2
    val += random(-128..127);
    buffer[start + count] = val;
  ```
- **Parameters:** EffectArg1=unused, EffectArg2=start, EffectArg3=stop
- **Behavior:** Aggressive noise generation. Unlike NoiseGen1 (one byte per tick), this modifies the ENTIRE range each tick. The XOR + rotate creates a pseudo-random scrambling effect on top of the random addition. Good for percussion/metallic sounds.
- **ASM ref:** lbC001620

### Mode 17 (0x11): FM Drum
- **Enum:** `SynthesisEffect.FmDrum` (17)
- **Algorithm:** Modifies `SlideValue` (pitch) by subtracting a decrement each tick. When `SynthEffectWavePosition >= repeats`, resets SlideValue to `FineTuning` and wavePos to 0 (pitch cycle restart).
- **Code:**
  ```
  if (wavePos >= repeats): SlideValue = FineTuning; wavePos = 0;
  decrement = (factor << 8) | level;
  SlideValue -= decrement;
  wavePos++;
  IncrementSynthEffectPosition();
  ```
- **Parameters:** EffectArg1=level (byte, low 8 bits of decrement), EffectArg2=factor (high 8 bits of decrement), EffectArg3=repeats
- **Behavior:** FM-synthesis-style drum. Creates a rapid pitch sweep downward, then resets — producing kick/tom-like sounds. The decrement = `(factor << 8) | level` controls sweep speed. Does NOT modify waveform data — modifies pitch.
- **ASM ref:** lbC001524

---

## B. ADSR Envelope System

### Table Format
- **128 bytes per ADSR table** (unsigned `uint8`, values 0-255)
- Stored in the SYAR chunk
- Each byte represents a volume multiplier for that position in the envelope
- Multiple instruments can reference the same ADSR table

### Instrument ADSR Parameters
From `Instrument.cs` and the format spec (offsets in the 152-byte struct):

| Field | Offset | Size | Description |
|-------|--------|------|-------------|
| AdsrNumber | 0x24 | 2 | Index into ADSR table array |
| AdsrDelay | 0x26 | 2 | Ticks between advancing ADSR position |
| AdsrLength | 0x28 | 2 | Length of the "one-shot" portion |
| AdsrRepeat | 0x2A | 2 | Length of the loop portion |
| SustainPoint | 0x2C | 2 | Position in ADSR table where sustain holds |
| SustainDelay | 0x2E | 2 | Ticks to hold at sustain point (0 = hold forever) |

### Per-Tick Processing (DoAdsr, line 1623)

```
if (AdsrLength + AdsrRepeat == 0):
    // No ADSR table — use flat volume
    volume = (currentVolume * masterVolume) / 64
else:
    adsrVal = adsrTable[adsrPosition]  // 0-255
    volume = (masterVolume * currentVolume * adsrVal) / 4096
    clamp volume to 64

    // Sustain check: if note=0x80 (sustain command) and past sustain point
    if (note == 0x80) and (adsrPosition >= sustainPoint):
        if sustainDelay == 0: return  // Hold forever
        if sustainDelayCounter > 0: sustainDelayCounter--; return
        sustainDelayCounter = sustainDelay  // Reload and continue

    // Advance position
    adsrDelayCounter--
    if adsrDelayCounter == 0:
        adsrDelayCounter = adsrDelay  // Reload
        adsrPosition++
        if adsrPosition >= (adsrLength + adsrRepeat):
            adsrPosition = adsrLength  // Loop to repeat start
            if adsrRepeat == 0: adsrPosition--  // Stay at last position
            if (adsrRepeat == 0) and (volume == 0): flag |= 0x01  // Mute voice
```

### Key Behaviors
1. **Volume formula:** `(masterVolume * instrVolume * adsrTableValue) / 4096`. With max values (64 * 64 * 255) / 4096 = 25.5, but Amiga volume max is 64, so effective range is 0-64 after clamping.
2. **Sustain:** Note value 0x80 triggers sustain behavior. When the ADSR position reaches `sustainPoint`, playback pauses at that position for `sustainDelay` ticks (or forever if 0).
3. **Loop:** When position reaches `adsrLength + adsrRepeat`, it wraps to `adsrLength` (the loop start). If `adsrRepeat == 0`, it stays at the last position.
4. **Auto-mute:** If the envelope reaches the end with no repeat and the volume is 0, the voice flag bit 0 is set, which mutes the voice on the next tick.

---

## C. AMF Table System

### Table Format
- **128 bytes per AMF table** (signed `int8`, values -128..127)
- Stored in the SYAF chunk
- Each byte is a period offset value applied to the note's period

### Instrument AMF Parameters

| Field | Offset | Size | Description |
|-------|--------|------|-------------|
| AmfNumber | 0x1C | 2 | Index into AMF table array |
| AmfDelay | 0x1E | 2 | Ticks between advancing AMF position |
| AmfLength | 0x20 | 2 | Length of the one-shot portion |
| AmfRepeat | 0x22 | 2 | Length of the loop portion |

### Per-Tick Processing (DoAmf, line 1572)

```
if (AmfLength + AmfRepeat) != 0:
    amfVal = amfTable[amfPosition]  // signed int8
    period = period - amfVal        // Note: SUBTRACTED from period

    amfDelayCounter--
    if amfDelayCounter == 0:
        amfDelayCounter = amfDelay  // Reload
        amfPosition++
        if amfPosition >= (amfLength + amfRepeat):
            amfPosition = amfLength  // Loop
            if amfRepeat == 0: amfPosition--  // Stay at last
```

### Key Behaviors
1. **Period subtraction:** Positive AMF values DECREASE the period (higher pitch), negative values INCREASE the period (lower pitch). This is the opposite of what you might expect.
2. **Loop behavior:** Identical to ADSR — one-shot portion followed by optional loop.
3. **Delay controls rate:** AmfDelay ticks between each step. Higher = slower modulation.
4. **Use cases:** Primarily used for pitch modulation / arpeggiation effects that are more complex than the simple arpeggio tables.

---

## D. Per-Tick Synthesis Pipeline

The main player loop (Play(), line 170) runs at the song tempo (typically 50 Hz PAL):

### Step 1: Speed Counter Check
```
speedCounter++
if speedCounter >= currentSpeed:
    speedCounter = 0
    GetNextRow()  // Advance to next row and parse new notes
```

### Step 2: GetNextRow() (when speed counter fires)
For each of 4 voices:
1. Read track row data (note, instrument, flags, effect)
2. Apply transposes from position table (unless disabled)
3. `PlayVoice()`: Set up instrument, trigger sample/synth playback

### Step 3: UpdateEffects() (EVERY tick, including row-0)
For each of 4 voices, `UpdateVoiceEffect()`:

```
1. Check Flag bit 0 — if set or no instrument, MUTE and return

2. DoArpeggio()
   - If instrument arpeggio table active: apply signed offset from table, advance position
   - Else if track effect 0 (arpeggio) with arg: cycle through 0/hi/lo nibble offsets
   - Look up period from Tables.Periods[]
   - Also compute PreviousPeriod for portamento

3. DoPortamento()
   - If portamento speed > 0: slide current period toward target
   - Uses PreviousPeriod as the "from" value

4. DoVibrato()
   - If vibrato delay not 0xFF (disabled):
     - If delay > 0: decrement delay, skip
     - Else: apply vibrato = Tables.Vibrato[vibratoPosition] * 4 / vibratoLevel
     - Advance vibrato position by vibratoSpeed, wrap at 256

5. DoAmf()
   - Apply AMF table value (subtract from period)
   - Advance AMF position with delay counter

6. DoSlide()
   - Subtract SlideValue from period (clamped to min 113)
   - If not row-0 tick: SlideValue += SlideSpeed

7. SET AMIGA PERIOD (channel.SetAmigaPeriod)

8. DoSynthEffects() — ONLY for synth instruments
   - Decrement EffectDelayCounter
   - If zero: reload from EffectDelay, dispatch to synthesis effect handler
   - The effect modifies WaveformBuffer in place (or SlideValue for Laser/FmDrum)

9. DoAdsr()
   - Apply ADSR envelope to volume
   - Handle sustain, loop, auto-mute

10. DoVolumeSlide()
    - Add VolumeSlideSpeed to CurrentVolume, clamp 0-64
```

### Voice Initialization (PlaySynthInstrument, line 1366)
When a synth note triggers:
```
1. Copy waveform data from waveformData[instr.WaveformNumber] into voiceInfo.WaveformBuffer
2. Set channel to play WaveformBuffer with length = instr.WaveformLength * 2
3. Set loop: start=0, length=instr.WaveformLength*2 (always looped)
```

### Voice Initialization Common (SetSynthInstrument, line 1290)
When any note triggers on a synth instrument:
```
1. SlideValue = instr.FineTuning
2. AdsrDelayCounter = instr.AdsrDelay
3. AdsrPosition = 0
4. AmfDelayCounter = instr.AmfDelay
5. AmfPosition = 0
6. SynthEffectPosition = instr.EffectArg2  (typically start position)
7. SynthEffectWavePosition = 0
8. EffectDelayCounter = instr.EffectDelay
9. ArpeggioPosition = 0
10. Flag = 0x00  (clear all flags, voice is active)
```

---

## E. Instrument Binary Layout (152 bytes / 0x98)

All values are big-endian uint16 unless noted.

| Offset | Size | Field | NP Property | Notes |
|--------|------|-------|-------------|-------|
| 0x00 | 2 | Type | Type | 0=Sample, 1=Synth |
| 0x02 | 2 | Waveform number | WaveformNumber | Sample index (type=0) or wavetable index (type=1) |
| 0x04 | 2 | Waveform length | WaveformLength | One-shot length in WORDS (multiply by 2 for bytes) |
| 0x06 | 2 | Repeat length | RepeatLength | 0=loop all, 1=no loop, else=loop length in words |
| 0x08 | 8 | Unknown | (skipped) | Purpose unknown |
| 0x10 | 2 | Volume | Volume | 0-64 (only low byte used: `& 0xFF`) |
| 0x12 | 2 | Fine tuning | FineTuning | Signed int16, cast to int8 in NP |
| 0x14 | 2 | Portamento speed | PortamentoSpeed | |
| 0x16 | 2 | Vibrato delay | VibratoDelay | 0xFF = disabled |
| 0x18 | 2 | Vibrato speed | VibratoSpeed | |
| 0x1A | 2 | Vibrato level | VibratoLevel | Divisor for vibrato amplitude |
| 0x1C | 2 | AMF number | AmfNumber | Index into AMF table array |
| 0x1E | 2 | AMF delay | AmfDelay | Ticks between AMF steps |
| 0x20 | 2 | AMF length | AmfLength | One-shot portion length |
| 0x22 | 2 | AMF repeat | AmfRepeat | Loop portion length |
| 0x24 | 2 | ADSR number | AdsrNumber | Index into ADSR table array |
| 0x26 | 2 | ADSR delay | AdsrDelay | Ticks between ADSR steps |
| 0x28 | 2 | ADSR length | AdsrLength | One-shot portion length |
| 0x2A | 2 | ADSR repeat | AdsrRepeat | Loop portion length |
| 0x2C | 2 | Sustain point | SustainPoint | Position in ADSR table to hold |
| 0x2E | 2 | Sustain delay | SustainDelay | Ticks to hold at sustain (0=forever) |
| 0x30 | 16 | Unknown | (skipped) | Purpose unknown |
| 0x40 | 2 | Effect arg 1 | EffectArg1 | Synthesis effect parameter 1 |
| 0x42 | 2 | Effect number | Effect | SynthesisEffect enum (0-17) |
| 0x44 | 2 | Effect arg 2 | EffectArg2 | Synthesis effect parameter 2 |
| 0x46 | 2 | Effect arg 3 | EffectArg3 | Synthesis effect parameter 3 |
| 0x48 | 2 | Effect delay | EffectDelay | Ticks between effect applications |
| 0x4A | 48 | Arpeggio tables | Arpeggios[3] | 3 tables x 16 bytes each (see below) |
| 0x7A | 30 | Name | Name | Null-padded ASCII |

**Total: 0x98 = 152 bytes**

### Arpeggio Sub-Table (16 bytes each, 3 per instrument)
| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | Length (one-shot portion) |
| 1 | 1 | Repeat (loop portion) |
| 2 | 14 | Values (signed int8, semitone offsets) |

Usage: `maxLength = min(Length + Repeat, 13)`. When ArpeggioPosition > maxLength, wraps to Length.

### Unknown Fields (0x08-0x0F and 0x30-0x3F)
The 8 bytes at 0x08 and 16 bytes at 0x30 are skipped by NostalgicPlayer. The ASM replayer uses some of these for internal pointers and editor state. They are not needed for playback.

---

## F. Waveform Data

### Size and Count
- Each waveform is **exactly 128 bytes** of signed int8 PCM data (-128 to +127)
- Stored in the SYWT chunk
- Number of waveforms varies per song (typically 1-32)
- Waveforms are shared across instruments — multiple instruments can reference the same waveform

### How Waveforms Are Used

**For Sample Instruments (type=0):**
- `WaveformNumber` indexes into the `sampleData[]` array (NOT waveformData)
- The sample is played directly from the sample data buffer

**For Synth Instruments (type=1):**
- `WaveformNumber` indexes into the `waveformData[]` array
- On note trigger, 128 bytes (or `WaveformLength * 2`, whichever is appropriate) are COPIED from `waveformData[WaveformNumber]` into `VoiceInfo.WaveformBuffer`
- The channel plays from `WaveformBuffer` (not the original waveform data)
- Synthesis effects then mutate `WaveformBuffer` in place
- The original `waveformData[WaveformNumber]` is read-only and shared — effects like Metamorph, Oszilator, AlienVoice, etc. reference it as a source

### WaveformBuffer
- **128 bytes** of signed int8, per voice (4 total)
- Initialized from waveform table on note trigger
- Mutated in place by synthesis effects
- The Amiga audio DMA reads directly from this buffer
- The channel is set to loop the entire buffer (loop start=0, loop length = WaveformLength*2)

### WaveformLength vs Buffer Size
- `WaveformLength` is in WORDS (multiply by 2 for bytes)
- Typical values: 32 words (64 bytes) or 64 words (128 bytes)
- The channel plays only `WaveformLength * 2` bytes from the buffer
- Effects should operate within this range (EffectArg2/Arg3 define start/stop within the buffer)

---

## G. Comparison with Digital Mugician

### Architecture Summary

| Feature | Sonic Arranger | Digital Mugician |
|---------|---------------|-----------------|
| Channels | 4 (Amiga hardware) | 4 (Amiga hardware) |
| Waveform size | 128 bytes (fixed) | Up to 128 bytes |
| Instrument size | 152 bytes | Variable |
| Synthesis effects | 18 modes (0-17) | ~8 modes (wavetable cycling, morph) |
| ADSR | External 128-byte tables | Simpler built-in envelope |
| AMF/Pitch mod | External 128-byte tables | Arpeggio table (8 entries) |
| Arpeggio | 3 embedded tables x 14 entries | 1 table x 8 entries |
| Vibrato | Table-based (256-entry sine) | LFO-based |
| Portamento | Per-instrument | Per-instrument |
| Waveform morphing | Mode 9 (Metamorph) | Wave blend (4 slots) |

### Synthesis Mode Comparison

| SA Mode | Description | DigMug Equivalent | Reusable? |
|---------|-------------|-------------------|-----------|
| 0 None | Static waveform | Static playback | N/A |
| 1 Wave Negator | Negate one byte/tick | No equivalent | No |
| 2 Free Negator | Modulated partial inversion | No equivalent | No |
| 3 Rotate Vertical | DC offset shift | No equivalent | No |
| 4 Rotate Horizontal | Circular shift | No equivalent | No |
| 5 Alien Voice | Additive wave mixing | No equivalent | No |
| 6 Poly Negator | Alternating restore/negate | No equivalent | No |
| 7 Shack Wave 1 | Wave-modulated DC shift | No equivalent | No |
| 8 Shack Wave 2 | ShackWave1 + negate sweep | No equivalent | No |
| 9 Metamorph | Gradual waveform morph | Wave blend morph | Partially |
| 10 Laser | Pitch sweep | No direct equivalent | No |
| 11 Wave Alias | Edge sharpening | No equivalent | No |
| 12 Noise Generator 1 | Progressive noise injection | No equivalent | No |
| 13 Low Pass Filter 1 | Fixed-threshold smoothing | No equivalent | No |
| 14 Low Pass Filter 2 | Variable-threshold smoothing | No equivalent | No |
| 15 Oszilator | Oscillating morph | Wave cycling (partial) | Partially |
| 16 Noise Generator 2 | Full-range noise scramble | No equivalent | No |
| 17 FM Drum | Pitch-sweep drum | No equivalent | No |

### Code Reuse Assessment

**Can we reuse DigMug WASM code?** Very limited.

The DigMug WASM synth (`digmug-wasm/src/digmug_synth.c`) implements:
- Wavetable oscillator with phase accumulator
- Wave blend/morph between 4 slots
- Arpeggio (8-entry table)
- Vibrato (sine LFO)
- PCM sample playback with loop

**What can be reused:**
1. **WASM worklet architecture** — The AudioWorklet + WASM pattern (worklet posts messages, C processes audio) is directly reusable. The `format_synth_api.h` interface pattern is a good template.
2. **Phase accumulator** — The basic wavetable playback with period-to-frequency conversion can be adapted.
3. **Vibrato LFO** — SA uses a 256-entry sine table, which is similar enough to DigMug's sine LFO.

**What CANNOT be reused (must be written fresh):**
1. **All 17 synthesis effects** — None of SA's waveform manipulation effects exist in DigMug.
2. **ADSR envelope system** — SA's table-based envelope with sustain points is fundamentally different from DigMug's simpler model.
3. **AMF table system** — No equivalent in DigMug.
4. **Multi-table arpeggio** — SA has 3 x 14-entry tables vs DigMug's 1 x 8.
5. **Portamento** — SA's implementation (with previous-period tracking) is more complex.
6. **The whole per-tick pipeline** — The ordering and interaction of effects is SA-specific.

### Recommended Approach

Build a new WASM module from scratch (`sonic-arranger-wasm/`) using the DigMug module as an architectural template:
- Copy the Emscripten build system, AudioWorklet pattern, and TypeScript API layer
- Implement the SA-specific synthesis engine in C
- The C code should closely mirror the NostalgicPlayer worker's structure:
  - One `SAPlayer` struct per voice (4 total)
  - 128-byte `waveformBuffer` per voice
  - All 17 synthesis effects as functions that mutate the buffer
  - ADSR and AMF table processing
  - Period table, vibrato table

---

## H. Additional Notes

### Period Table
SA uses a 109-entry period table (index 0 = 0, indices 1-108 = descending periods from 13696 to 28). This spans 9 octaves. The table is identical to standard Amiga period tables (just extended range).

### Vibrato Table
256-entry signed int8 sine table. Standard Amiga vibrato. Range approximately -127 to +127.

### Flag Bits (VoiceInfo.Flag)
| Bit | Mask | Meaning |
|-----|------|---------|
| 0 | 0x01 | Voice is muted/dead |
| 1 | 0x02 | Metamorph/Oszilator morph complete |
| 2 | 0x04 | FreeNegator done |
| 3 | 0x08 | Oszilator target selection (0=EffectArg1 wave, 1=base wave) |

### Note 0x80 and 0x7F
- Note `0x80`: "Sustain" — does not trigger a new note, but activates sustain behavior in ADSR
- Note `0x7F`: "Force quiet" — mutes the voice immediately

### Random Number Generation (Noise effects)
NostalgicPlayer uses `RandomGenerator.GetRandomNumber(-128, 127)`. The ASM replayer likely uses the Amiga's hardware random or a simple LFSR. For WASM, any reasonable PRNG will work — the exact noise pattern is not musically critical.

### Pyrdacor Implementation Notes
The Pyrdacor SonicArranger project (https://github.com/Pyrdacor/SonicArranger) contains a parallel C# implementation in `TrackState.cs`. It implements all the same effects except Metamorph and Oscillator (marked as TODO). This confirms NostalgicPlayer's implementation is the most complete reference. The Pyrdacor project's file format documentation is also useful: https://github.com/Pyrdacor/SonicArranger/blob/main/Docs/PackedFileFormat.md

### Existing Parser Status
`src/lib/import/formats/SonicArrangerParser.ts` already extracts:
- Sub-songs, positions, track rows
- Instrument metadata (name, volume, type, waveform references)
- PCM sample data
- Waveform table data (128-byte waveforms)
- Converts to TrackerSong format with XM-style patterns

**What it does NOT extract (needed for WASM synth):**
- ADSR tables (SYAR chunk) — parsed but not stored
- AMF tables (SYAF chunk) — not parsed at all
- Synthesis effect parameters (EffectArg1-3, EffectDelay, Effect number)
- Instrument vibrato/portamento/arpeggio parameters
- Arpeggio sub-tables (3 x 16 bytes)
- Fine tuning

All of these will need to be extracted and passed to the WASM synth engine.
