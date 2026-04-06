# Making C64/SID Music in DEViLBOX

A complete guide to composing Commodore 64 music using the SID chip emulation in DEViLBOX. No prior SID experience needed.

---

## What is the SID Chip?

The SID (Sound Interface Device) is the legendary sound chip from the Commodore 64. It has:

- **3 voices** (oscillators) that can each play one note at a time
- **4 waveforms**: Triangle, Sawtooth, Pulse, and Noise
- **Hardware ADSR envelopes** on each voice (4-bit resolution, 0-15)
- **One shared filter** (low-pass, band-pass, high-pass) that any voice can route through
- **Ring modulation** and **oscillator sync** between voices
- **Pulse width modulation** for the pulse waveform

With just 3 voices, SID composers created some of the most memorable chiptune music ever made. The trick is using arpeggios, rapid waveform changes, and filter sweeps to make 3 voices sound like an entire band.

Two hardware revisions exist:
- **6581** (early C64): warm, gritty, slightly distorted filter. The classic sound.
- **8580** (later C64): cleaner, crisper, more accurate filter. Less character but more precise.

---

## DEViLBOX SID Options

DEViLBOX gives you three ways to work with SID:

| Mode | Best For | Editing? |
|------|----------|----------|
| **GoatTracker Ultra** (GTUltraSynth) | Composing new SID music from scratch | Full pattern + instrument editing |
| **Furnace SID** (FurnaceSID6581/8580) | Mixing SID with other chip sounds | Full Furnace tracker editing |
| **C64SID Playback** | Listening to .sid files from HVSC | Playback only (no editing) |

This tutorial focuses on **GoatTracker Ultra** since that's the primary SID composition tool.

---

## Your First SID Song: Step by Step

### Step 1: Create a New Project

Open DEViLBOX. If a song is already loaded, go to **File > New** (or press the hotkey) to start fresh.

### Step 2: Create Your First Instrument

1. Go to the **Instrument List** panel
2. Click **+** to create a new instrument
3. Change the **Synth Type** dropdown to **GTUltraSynth**
4. Name it "Bass"

You'll see the GT Ultra instrument editor appear with four tabs: **Instrument**, **Designer**, **Tables**, and **SID Monitor**.

### Step 3: Choose a Preset (Quick Start)

The fastest way to get started is to load a preset:

1. Click the **Preset** dropdown in the instrument header
2. Browse by category: Bass, Lead, Pad, Arp, Drum, FX
3. Select **"Classic Bass"** to start

This gives you a punchy sawtooth bass (A=0, D=9, S=0, R=0, Saw waveform).

### Step 4: Understand the ADSR

The SID's ADSR envelope is what gives each sound its shape. All four parameters are 0-15:

```
    Volume
    ^
    |   /\
    |  /  \___________
    | /    \           \
    |/      \           \
    +--------+-----+-----+--> Time
     Attack  Decay  Sust.  Release
```

| Parameter | Range | What It Does |
|-----------|-------|-------------|
| **Attack** | 0-15 | How fast the sound reaches full volume. 0 = instant snap (2ms), 15 = slow fade in (8 seconds) |
| **Decay** | 0-15 | How fast it drops from full volume to the sustain level |
| **Sustain** | 0-15 | The volume level held while you hold the note. 0 = silence, 15 = full volume |
| **Release** | 0-15 | How fast the sound fades out after you release the note |

**Quick recipes:**
- **Punchy bass**: A=0, D=9, S=0, R=0 (instant hit, medium decay, no sustain)
- **Smooth lead**: A=0, D=10, S=9, R=10 (instant attack, sustains, smooth release)
- **Soft pad**: A=8, D=12, S=8, R=12 (slow attack, long sustain, long release)
- **Snare drum**: A=0, D=0, S=0, R=0 (instant everything, shortest possible)

### Step 5: Choose Your Waveform

The SID has four waveforms, each with a distinct character:

| Waveform | Sound | Use For |
|----------|-------|---------|
| **Triangle** (TRI) | Soft, pure, flute-like | Basses, pads, gentle melodies |
| **Sawtooth** (SAW) | Bright, buzzy, rich harmonics | Leads, basses, brass sounds |
| **Pulse** (PUL) | Hollow, nasal, width-adjustable | Everything! The most versatile SID waveform |
| **Noise** (NOI) | White noise / static | Drums, hi-hats, explosions, wind |

In the instrument editor, toggle waveforms using the **TRI / SAW / PUL / NOI** buttons. You can combine them for hybrid tones (e.g., SAW + PUL creates a thick, detuned sound).

**The Pulse waveform is special** because you can change its **pulse width** (duty cycle):
- Width 0%: silence
- Width 25%: thin, nasal (clarinet-like)
- Width 50%: classic square wave (hollow, retro)
- Width 75%: same as 25% (mirrored)

Animating the pulse width over time (**Pulse Width Modulation / PWM**) creates the rich, swirling sound that defines classic SID music.

### Step 6: Write a Pattern

Switch to the **Tracker View** (the main pattern editor). You have 3 channels:

```
 Ch 1 (Voice 1)  |  Ch 2 (Voice 2)  |  Ch 3 (Voice 3)
 C-4 01 -- 000   |  --- -- -- 000   |  --- -- -- 000
 --- -- -- 000   |  E-4 02 -- 000   |  --- -- -- 000
 --- -- -- 000   |  --- -- -- 000   |  G-4 03 -- 000
```

Each cell has: **Note** / **Instrument** / **Volume** / **Effect**

To enter notes:
1. Click a cell in channel 1
2. Type a note on your keyboard (or use MIDI)
3. The current instrument number is auto-filled

**A simple bass line:**
```
Row  Ch1
00   C-3 01
04   C-3 01
08   E-3 01
0C   G-3 01
10   C-3 01
14   C-3 01
18   A#2 01
1C   G-2 01
```

### Step 7: Add More Instruments

Create two more GTUltraSynth instruments:

**Instrument 2: "Lead"**
- Load preset: **"Pulse Lead"**
- Or manually: A=0, D=9, S=10, R=9, Pulse waveform, Pulse Width ~1024

**Instrument 3: "Drums"**
- Load preset: **"Snare"** (A=0, D=0, S=0, R=0, Noise waveform)
- For kick: create another instrument with Triangle waveform, very short decay

Now you can write a 3-channel arrangement:
- **Channel 1**: Bass line
- **Channel 2**: Melody
- **Channel 3**: Drums (alternating kick/snare/hi-hat)

### Step 8: Add Pattern Effects

Pattern effects make your SID song come alive. Enter them in the effect column (rightmost part of each cell):

| Effect | Code | Example | What It Does |
|--------|------|---------|-------------|
| **Arpeggio** | 0xy | 037 | Rapidly cycles between the note, note+x, note+y semitones (fake chords!) |
| **Porta Up** | 1xx | 110 | Slide pitch upward |
| **Porta Down** | 2xx | 220 | Slide pitch downward |
| **Tone Porta** | 3xx | 310 | Smooth glide to the target note |
| **Vibrato** | 4xy | 486 | Oscillate pitch (x=speed, y=depth) |
| **Set A/D** | 5xx | 509 | Change Attack/Decay mid-note |
| **Set S/R** | 6xx | 6F0 | Change Sustain/Release mid-note |
| **Set Wave** | 7xx | 741 | Switch waveform instantly |
| **Filter Ctrl** | Bxx | B80 | Set filter type and routing |
| **Filter Cutoff** | Cxx | C40 | Set filter cutoff frequency |
| **Master Vol** | Dxx | D0F | Set master volume (0-15) |
| **Tempo** | Fxx | F06 | Set speed (ticks per row) |

**The arpeggio trick (effect 0xy):**

Since SID only has 3 voices, you can't play real chords. Instead, use arpeggio (effect 0) to rapidly cycle through notes, faking a chord:

```
C-4 01 -- 037   ← plays C, C+3 (Eb), C+7 (G) = C minor chord!
C-4 01 -- 047   ← plays C, C+4 (E), C+7 (G)  = C major chord!
```

At high speed, your ear blends the three notes into a single chord. This is THE signature SID technique.

---

## Sound Design: The Tables System

The real power of GoatTracker Ultra is its **4 programmable tables**: Wave, Pulse, Filter, and Speed. These are sequences of commands that execute on every frame (50 Hz PAL / 60 Hz NTSC), letting you create complex evolving sounds.

### Wave Table

Controls which waveform plays on each frame. Use it to create waveform morphing and instrument attacks:

**Example: Saw attack into pulse sustain** (the "Hubbard Bass")
```
Entry 00: SAW + gate   (bright attack)
Entry 01: delay 3      (hold for 3 frames)
Entry 02: PULSE + gate (switch to warmer pulse)
Entry 03: loop to 02   (stay on pulse forever)
```

This creates a sound that starts with a bright sawtooth "click" then immediately softens into a warm pulse. Rob Hubbard used this technique in almost every C64 game soundtrack.

### Pulse Table

Controls pulse width over time (PWM):

**Example: Classic PWM sweep**
```
Entry 00: pulse width 512   (thin sound)
Entry 01: +4 per frame       (sweep wider)
Entry 02: until width 3584   (wide sound)
Entry 03: -4 per frame       (sweep back)
Entry 04: until width 512    (thin again)
Entry 05: loop to 00          (repeat forever)
```

This creates the classic "swooshing" SID sound where the timbre constantly shifts.

### Filter Table

Controls the SID's filter cutoff and resonance:

**Example: Filter sweep down**
```
Entry 00: cutoff 2047, resonance 8, LP mode
Entry 01: -16 per frame
Entry 02: until cutoff 256
Entry 03: hold
```

This creates a bass sound that starts bright and sweeps to a dull, warm tone.

### Using Tables with Instruments

In the **Instrument** tab, set the table pointers:
- **Wave Ptr**: which wave table entry to start from (0 = disabled)
- **Pulse Ptr**: which pulse table entry to start from (0 = disabled)
- **Filter Ptr**: which filter table entry to start from (0 = disabled)

Each instrument can point to different parts of the same global tables, so you can reuse table sequences across instruments.

---

## Classic SID Composition Techniques

### Technique 1: The Arpeggiated Chord

With only 3 voices, use arpeggio (effect 0) to fake chords on a single channel:

```
Ch1 (bass)    Ch2 (arp chord)   Ch3 (melody)
C-2 01 ---    C-4 02 037        --- -- ---
--- -- ---    --- -- ---        G-4 03 ---
C-2 01 ---    E-4 02 037        A-4 03 ---
--- -- ---    --- -- ---        G-4 03 ---
```

Channel 2 plays rapid C-Eb-G arpeggios, sounding like a C minor chord.

### Technique 2: Drum Programming with Noise

The SID's noise waveform is your only real percussion source. Combine it with triangle for more variety:

| Sound | Recipe |
|-------|--------|
| **Kick** | Triangle, A=0 D=6 S=0 R=0, start at high note (C-5), use pitch-down effect (2xx) |
| **Snare** | Noise, A=0 D=3 S=0 R=0 |
| **Hi-Hat (closed)** | Noise, A=0 D=0 S=0 R=0, gate timer=1 |
| **Hi-Hat (open)** | Noise, A=0 D=8 S=0 R=0 |
| **Tom** | Triangle, A=0 D=7 S=0 R=0 |
| **Clap** | Noise, A=0 D=5 S=2 R=3 |

### Technique 3: The "Multispeed" Trick

Set a faster tempo (more ticks per second) to get finer control over arpeggios and effects. Standard SID music runs at 1x speed (one tick per frame = 50 Hz PAL). Many classic tunes use 2x or even 4x speed for smoother effects.

### Technique 4: Voice Stealing

Since you only have 3 voices, plan your arrangement carefully. Common allocation:

- **Voice 1**: Bass (plays on beats 1 and 3)
- **Voice 2**: Chords or arpeggios (fills between bass notes)
- **Voice 3**: Melody and drums (alternate — melody during verses, drums during fills)

Some composers "steal" a voice mid-pattern: the bass stops for a moment so that voice can play a drum hit or a harmony note, then returns to the bass.

### Technique 5: Ring Modulation for Metallic Sounds

Enable **Ring Mod** on one voice and play two voices at different intervals. Ring mod multiplies two oscillators, creating inharmonic overtones:

- Small intervals (1-2 semitones): bell-like tones
- Large intervals: harsh, metallic, alien sounds
- Perfect fifths: complex but musical harmonics

### Technique 6: Filter Routing

Route voices through the SID filter for tone shaping:

1. In the **Filter Table**, set filter mode (LP, BP, HP) and initial cutoff
2. Route specific voices through the filter (bits in the filter control byte)
3. Animate the cutoff for wah-wah effects, filter sweeps, or acid bass

**Important**: Only ONE filter exists, shared across all 3 voices. If you route multiple voices through it, they all get the same filter setting. Plan carefully which voices use the filter.

---

## Listen and Learn: HVSC Browser

The **High Voltage SID Collection** (HVSC) contains over 80,000 C64 SID tunes. Use it to study how the masters composed:

1. Open the **HVSC** browser (in the file/library panel)
2. Search for a composer or game:
   - `"Hubbard"` - Rob Hubbard (Commando, Monty on the Run, Delta)
   - `"Galway"` - Martin Galway (Arkanoid, Parallax, Wizball)
   - `"Tel"` - Jeroen Tel (Cybernoid II, Turbo Outrun, Myth)
   - `"DRAX"` - Thomas Mogensen / DRAX (legendary demoscene composer)
   - `"Laxity"` - Thomas Petersen / Laxity (modern SID master)
3. Click a tune to load and play it
4. Study the waveform visualizer and channel activity

---

## Furnace SID (Alternative Approach)

If you prefer the Furnace tracker interface or want to mix SID with other chips:

1. Create a new instrument, set type to **FurnaceSID6581** (warm/gritty) or **FurnaceSID8580** (clean)
2. Configure in the Furnace instrument editor:
   - Waveform toggles (TRI/SAW/PUL/NOI)
   - ADSR values (0-15 each)
   - Pulse width (0-4095)
   - Ring mod / Oscillator sync
   - Filter cutoff, resonance, mode
3. Use Furnace macros for parameter automation (more flexible than GT Ultra tables)
4. Mix with other Furnace chips (NES, Game Boy, Genesis) for cross-chip compositions

---

## Quick Reference: SID ADSR Timing

| Value | Attack | Decay/Release |
|-------|--------|---------------|
| 0 | 2 ms | 6 ms |
| 1 | 8 ms | 24 ms |
| 2 | 16 ms | 48 ms |
| 3 | 24 ms | 72 ms |
| 4 | 38 ms | 114 ms |
| 5 | 56 ms | 168 ms |
| 6 | 68 ms | 204 ms |
| 7 | 80 ms | 240 ms |
| 8 | 100 ms | 300 ms |
| 9 | 250 ms | 750 ms |
| 10 | 500 ms | 1.5 s |
| 11 | 800 ms | 2.4 s |
| 12 | 1 s | 3 s |
| 13 | 3 s | 9 s |
| 14 | 5 s | 15 s |
| 15 | 8 s | 24 s |

Note: values 0-7 are roughly linear, 8-15 jump exponentially. This non-linear curve is part of the SID's character.

---

## Quick Reference: Preset Recipes

| Sound | Waveform | A | D | S | R | Notes |
|-------|----------|---|---|---|---|-------|
| Punchy Bass | SAW | 0 | 9 | 0 | 0 | The default SID bass |
| Sub Bass | TRI | 0 | 10 | 0 | 0 | Deep and round |
| Acid Bass | PUL | 0 | 8 | 0 | 0 | Add filter table for acid sweep |
| Classic Lead | SAW | 0 | 10 | 9 | 10 | Bright melody voice |
| Pulse Lead | PUL | 0 | 9 | 10 | 9 | Add pulse table for PWM |
| Soft Pad | TRI | 8 | 12 | 8 | 12 | Slow, ambient |
| Snare | NOI | 0 | 0 | 0 | 0 | Quick noise burst |
| Kick | TRI | 0 | 9 | 0 | 0 | Use pitch-down effect (2xx) |
| Hi-Hat | NOI | 0 | 0 | 0 | 0 | Gate timer=1 for extra short |
| Arp Chord | PUL | 0 | 8 | 8 | 0 | Use effect 037/047 for chords |

---

## Saving Your Work

- **Save as .dbx**: Preserves everything (instruments, tables, patterns, synth configs). Always save as .dbx during work.
- **Export as .sng**: GoatTracker native format. Other GoatTracker users can open it.
- **Export as WAV**: Render the final audio for sharing.
- **Export as MIDI**: Pattern data only (no SID-specific sounds).

---

## Next Steps

Once you're comfortable with the basics:

1. **Study the presets**: Load each preset category and listen. Tweak parameters to understand what each does.
2. **Analyze HVSC tunes**: Load a Rob Hubbard tune and study the pattern data, effects, and instrument settings.
3. **Learn the tables**: The wave/pulse/filter tables are where SID sound design really happens. Start simple (one command) and build up.
4. **Experiment with ring mod and sync**: These create sounds no other chip can make.
5. **Try multispeed**: Faster tick rates unlock smoother arpeggios and vibrato.
6. **Join the community**: The C64 demoscene is still active. Sites like csdb.dk and the HVSC forums have decades of knowledge.
