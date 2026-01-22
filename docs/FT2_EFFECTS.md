# FastTracker II Effect Commands

DEViLBOX uses FastTracker II effect commands natively for 100% MOD/XM compatibility.

## Effect Column Format

Format: `XYZ` where:
- `X` = Effect command (0-F)
- `YZ` = Parameter (00-FF hexadecimal)

Example: `A0F` = Volume slide up with speed 0F

## Volume Column Format (XM only)

Format: Single byte (0x00-0xFF):
- `0x10-0x50`: Set volume (0-64)
- `0x60-0x6F`: Volume slide down
- `0x70-0x7F`: Volume slide up
- `0x80-0x8F`: Fine volume slide down
- `0x90-0x9F`: Fine volume slide up
- `0xA0-0xAF`: Set vibrato speed
- `0xB0-0xBF`: Vibrato (depth)
- `0xC0-0xCF`: Set panning (0-15)
- `0xD0-0xDF`: Panning slide left
- `0xE0-0xEF`: Panning slide right
- `0xF0-0xFF`: Tone portamento

## Main Effect Commands

### 0xy - Arpeggio
Rapidly cycles between three notes. **Processes every tick.**
- x = First semitone offset (0-F)
- y = Second semitone offset (0-F)
- Cycle: base note (tick 0) → +x semitones (tick 1) → +y semitones (tick 2) → repeat

**Parameter Memory:** No (000 = off)

**Example:** `037` = Major chord arpeggio (0-3-7 semitones)

---

### 1xx - Pitch Slide Up
Slides pitch up. **Processes every tick except tick 0.**
- xx = Slide speed (01-FF)
- Speed in linear frequency units per tick

**Parameter Memory:** Yes (100 reuses last speed)

**Example:** `110` = Slow pitch slide up

---

### 2xx - Pitch Slide Down
Slides pitch down. **Processes every tick except tick 0.**
- xx = Slide speed (01-FF)

**Parameter Memory:** Yes (200 reuses last speed)

**Example:** `220` = Medium pitch slide down

---

### 3xx - Tone Portamento
Slides current note to target note. **Processes every tick except tick 0.**
- xx = Slide speed (01-FF)
- If a note is present, it becomes the target
- If no note, continues sliding to previous target

**Parameter Memory:** Yes (300 reuses last speed)

**Example:** `320` + note C-5 = Slide to C-5 at speed 20

**Usage Pattern:**
```
Row 0: C-4 .. ... ...  // Play C-4
Row 4: E-4 .. ... 320  // Slide from C-4 to E-4
```

---

### 4xy - Vibrato
Oscillates pitch. **Processes every tick except tick 0.**
- x = Speed (0-F)
- y = Depth (0-F)

**Parameter Memory:** Yes (400 reuses last speed+depth, 420 reuses speed+sets depth)

**Waveform:** Uses last waveform set by E4x (default: sine)

**Example:** `488` = Medium speed, deep vibrato

---

### 5xy - Tone Portamento + Volume Slide
Combines effect 3 (portamento) with A (volume slide). **Processes every tick except tick 0.**
- x = Volume slide up speed (0-F)
- y = Volume slide down speed (0-F)
- Portamento uses last 3xx speed

**Parameter Memory:** Portamento uses 3xx memory, volume slide parameter is explicit

**Example:** `502` = Continue portamento + volume slide down (speed 2)

---

### 6xy - Vibrato + Volume Slide
Combines effect 4 (vibrato) with A (volume slide). **Processes every tick except tick 0.**
- x = Volume slide up speed (0-F)
- y = Volume slide down speed (0-F)
- Vibrato uses last 4xy parameters

**Parameter Memory:** Vibrato uses 4xx memory, volume slide parameter is explicit

**Example:** `610` = Continue vibrato + volume slide up (speed 1)

---

### 7xy - Tremolo
Oscillates volume. **Processes every tick except tick 0.**
- x = Speed (0-F)
- y = Depth (0-F)

**Parameter Memory:** Yes (700 reuses last speed+depth)

**Waveform:** Uses last waveform set by E7x (default: sine)

**Example:** `746` = Medium speed, medium depth tremolo

---

### 8xx - Set Panning
Sets channel panning. **Processes on tick 0 only.**
- xx = Panning position (00-FF)
- 00 = Hard left
- 80 = Center
- FF = Hard right

**Parameter Memory:** No

**Example:** `880` = Center panning

---

### 9xx - Sample Offset
Sets sample playback start position. **Processes on tick 0 only.**
- xx = Offset (00-FF)
- Actual offset = xx * 256 sample frames

**Parameter Memory:** Yes (900 reuses last offset)

**Example:** `920` = Start playback at position 0x2000

---

### Axy - Volume Slide
Slides channel volume. **Processes every tick except tick 0.**
- x = Slide up speed (0-F)
- y = Slide down speed (0-F)
- Only one of x or y should be non-zero

**Parameter Memory:** Yes (A00 reuses last parameter)

**Special cases:**
- `A0F` = Volume slide down (speed F)
- `AF0` = Volume slide up (speed F)
- `A00` = Continue last volume slide

---

### Bxx - Position Jump
Jumps to pattern in order list. **Processes on tick 0 only.**
- xx = Position in order list (00-FF)

**Parameter Memory:** No

**Example:** `B00` = Jump to first pattern in order

**Note:** If position >= song length, loops to start

---

### Cxx - Set Volume
Sets channel volume. **Processes on tick 0 only.**
- xx = Volume (00-40)
- 00 = Silent
- 40 = Maximum

**Parameter Memory:** No

**Example:** `C20` = Set volume to 50% (32/64)

---

### Dxx - Pattern Break
Breaks to next pattern at specific row. **Processes on tick 0 only.**
- xx = Row to jump to (00-FF, decimal BCD format)
- 00 = First row of next pattern
- 16 = Row 16 (written as hex 0x10, but interpreted as decimal)

**Parameter Memory:** No

**Example:** `D00` = Jump to next pattern, row 0

**BCD Format:** `D32` = row 32 (not hex 0x32 = 50)

---

### Exy - Extended Commands
Extended effects, subdivided by x. **Varies by subcommand.**

#### E0x - Set Filter (Amiga only)
Legacy command, generally ignored on modern systems.

#### E1x - Fine Pitch Slide Up
Slides pitch up once on tick 0 only.
- x = Slide amount (0-F)

**Example:** `E12` = Fine slide up by 2

#### E2x - Fine Pitch Slide Down
Slides pitch down once on tick 0 only.
- x = Slide amount (0-F)

**Example:** `E24` = Fine slide down by 4

#### E3x - Set Glissando Control
Controls portamento behavior (FT2: mostly ignored).
- 0 = Off (smooth)
- 1 = On (semitone steps)

#### E4x - Set Vibrato Waveform
Sets vibrato waveform for effect 4.
- 0 = Sine (default)
- 1 = Ramp down (sawtooth)
- 2 = Square
- 3 = Random
- +4 = Don't retrigger waveform on new note

**Example:** `E41` = Ramp down vibrato

#### E5x - Set Finetune
Overrides sample finetune.
- x = Finetune (-8 to +7, wrap around in hex 0-F)

#### E6x - Pattern Loop
Loops section of pattern. **Processes on tick 0 only.**
- E60 = Set loop start point
- E6x (x>0) = Loop back x times

**Example:**
```
Row 0: ... E60  // Set loop start
Row 4: ... E63  // Loop 3 times (play 4 times total)
```

#### E7x - Set Tremolo Waveform
Sets tremolo waveform for effect 7.
- Same values as E4x

#### E8x - Set Panning (Coarse)
Sets panning (legacy, use 8xx instead).
- x = Panning (0-F)
- 0 = Left, 8 = Center, F = Right

#### E9x - Retrigger Note
Retriggers note every x ticks. **Processes on tick x, 2x, 3x, etc.**
- x = Retrigger interval (1-F ticks)

**Example:** `E93` = Retrigger every 3 ticks

#### EAx - Fine Volume Slide Up
Slides volume up once on tick 0 only.
- x = Slide amount (0-F)

**Example:** `EA4` = Fine volume up by 4

#### EBx - Fine Volume Slide Down
Slides volume down once on tick 0 only.
- x = Slide amount (0-F)

**Example:** `EB2` = Fine volume down by 2

#### ECx - Note Cut
Cuts note (sets volume to 0) at tick x.
- x = Tick to cut (0-F)
- EC0 = Cut immediately (tick 0)

**Example:** `EC3` = Cut note at tick 3

#### EDx - Note Delay
Delays note trigger until tick x.
- x = Delay in ticks (0-F)

**Example:** `ED2` = Delay note by 2 ticks

#### EEx - Pattern Delay
Delays pattern by x rows. **Processes on tick 0 only.**
- x = Number of rows to delay (0-F)

**Example:** `EE2` = Delay pattern by 2 rows (repeats current row 2 extra times)

#### EFx - Set Active Macro (FT2: Invert Loop)
FT2: Inverts loop (Amiga-specific, generally ignored).
Modern trackers: Often repurposed for macros.

---

### Fxx - Set Speed/BPM
Sets playback speed or tempo. **Processes on tick 0 only.**
- 00-1F = Set speed (ticks per row)
- 20-FF = Set BPM

**Parameter Memory:** No

**Examples:**
- `F06` = 6 ticks per row (classic tracker speed)
- `F7D` = 125 BPM
- `F03` = 3 ticks per row (fast)

**Default:** F06 (6 ticks/row) at 125 BPM

---

## Effect Processing Order

### Tick 0 (Row Start)
1. Trigger new notes
2. Process tick-0 effects:
   - Bxx (position jump)
   - Dxx (pattern break)
   - Fxx (set speed/BPM)
   - Cxx (set volume)
   - 8xx (set panning)
   - 9xx (sample offset)
   - E1x, E2x (fine pitch slides)
   - EAx, EBx (fine volume slides)
   - E6x (pattern loop)
   - EEx (pattern delay)
   - EC0 (note cut if x=0)
   - EDx (note delay setup)

### Tick N (N > 0)
1. Process continuous effects:
   - 0xy (arpeggio)
   - 1xx (pitch slide up)
   - 2xx (pitch slide down)
   - 3xx (tone portamento)
   - 4xy (vibrato)
   - 5xy (portamento + vol slide)
   - 6xy (vibrato + vol slide)
   - 7xy (tremolo)
   - Axy (volume slide)
   - E9x (retrigger)
   - ECx (note cut if tick matches)
   - EDx (note delay if tick matches)

## Parameter Memory

Effects with parameter memory reuse the last non-zero parameter when given 00:

- **1xx, 2xx, 3xx** - Slide effects
- **4xy** - Vibrato
- **7xy** - Tremolo
- **9xx** - Sample offset
- **Axy** - Volume slide

Example:
```
Row 0: C-4 01 ... 320  // Portamento speed 20
Row 4: E-4 01 ... 300  // Reuses speed 20
Row 8: G-4 01 ... 310  // New speed 10
```

## Volume Column Effects (XM Only)

The volume column can contain:
- Direct volume (0x10-0x50): Sets volume 0-64
- Effect shortcuts (0x60-0xFF): Abbreviated effects

**Conversion Table:**
- `0x60-0x6F` → `A0y` (volume slide down)
- `0x70-0x7F` → `Ay0` (volume slide up)
- `0x80-0x8F` → `EBy` (fine volume down)
- `0x90-0x9F` → `EAy` (fine volume up)
- `0xB0-0xBF` → `40y` (vibrato depth)
- `0xF0-0xFF` → `3xy` (tone portamento)

**Example:** Volume column `0x72` = Volume slide up (speed 2) = `A20`

## DEViLBOX Extensions

DEViLBOX adds extra columns while maintaining FT2 compatibility:

### Additional Columns
- **effect2**: Second effect column (same FT2 format)
- **accent**: TB-303 accent (boolean)
- **slide**: TB-303 slide (boolean)
- **cutoff**: Filter cutoff automation (00-FF)
- **resonance**: Filter resonance automation (00-FF)
- **envMod**: Envelope modulation automation (00-FF)
- **pan**: Panning automation (00-FF)

### Effect Priority
When both main effect and volume column effects are present:
- Main effect → `effect` column
- Volume column effect → `effect2` column

## Implementation Notes

1. **Tick Counter**: Increments at rate: `(BPM * 2.5) / 60` Hz (default 6 ticks at 125 BPM = ~31.25 ticks/sec)
2. **Speed Change**: Takes effect on next row
3. **BPM Change**: Takes effect immediately
4. **Pattern Break + Position Jump**: Position jump takes priority
5. **Multiple Row Breaks**: Only first break in row executes
6. **Note Delay + Other Effects**: Other effects process on tick 0, note triggers on delay tick

## References

- FastTracker II replay routine (`ft2play.c`)
- FastTracker II source code (`replayer/`)
- BassoonTracker effect implementations
- XM Format Specification v1.04
