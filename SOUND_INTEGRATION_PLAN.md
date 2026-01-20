# Sound Integration & Instrument Editor Plan

## Design Philosophy

**Core Principle: FastTracker II Workflow with Modern Synthesis**

Musicians should be able to:
1. Use authentic FT2 effect commands (they already know them)
2. Pick and tweak instruments visually (synths are more complex than samples)
3. Hear changes instantly (real-time audio feedback)
4. Export to Tone.js JSON for BBS doors
5. Full FT2 keyboard workflow preserved

---

## Part 1: Tracker → Sound Architecture

### 1.1 Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRACKER GRID                              │
│  Row  │ Ch1: Note Inst Vol Eff │ Ch2: Note Inst Vol Eff │ ...   │
├───────┼───────────────────────┼───────────────────────┼─────────┤
│  00   │ C-4  01  40  ---      │ ---  --  --  ---      │         │
│  01   │ ---  --  --  ---      │ E-4  02  32  ---      │         │
│  02   │ D-4  01  --  A0F      │ ---  --  --  ---      │         │
└───────┴───────────────────────┴───────────────────────┴─────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PLAYBACK ENGINE                             │
│  • Reads rows at tempo (BPM ÷ Speed)                            │
│  • For each cell with a note:                                    │
│    1. Look up Instrument by number                               │
│    2. Apply Volume (scaled 0-64 → 0-1)                          │
│    3. Process Effect command                                     │
│    4. Trigger Tone.js synth                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INSTRUMENT BANK                               │
│  Inst 01: "Fat Bass"     → Tone.MonoSynth + Distortion          │
│  Inst 02: "Soft Pad"     → Tone.PolySynth + Reverb + Chorus     │
│  Inst 03: "Drum Kit"     → Tone.Sampler (kick, snare, hat...)   │
│  Inst 04: "Pluck Lead"   → Tone.PluckSynth + Delay              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AUDIO OUTPUT                                  │
│  Master Channel → Limiter → Speakers                            │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Column Definitions (User-Friendly Names)

| Column | Display | What Musicians See | Internal |
|--------|---------|-------------------|----------|
| Note | `C-4` | The note + octave | MIDI note number |
| Inst | `01` | Which instrument/sound | Index into instrument bank |
| Vol | `40` | Volume (0-64) | Gain value (0-1) |
| Eff | `A0F` | Effect command | Effect type + parameter |

### 1.3 Effect Commands (Full FT2 Standard)

Authentic FastTracker II effect commands mapped to Tone.js:

| Cmd | Effect | FT2 Behavior | Tone.js Implementation |
|-----|--------|--------------|------------------------|
| `0xy` | Arpeggio | Cycle note/+x/+y semitones | Rapid `triggerAttack` with pitch offset |
| `1xx` | Porta Up | Slide pitch up xx units/tick | `frequency.rampTo()` upward |
| `2xx` | Porta Down | Slide pitch down xx units/tick | `frequency.rampTo()` downward |
| `3xx` | Tone Porta | Slide to note at speed xx | `frequency.rampTo(targetNote)` |
| `4xy` | Vibrato | Pitch oscillation (x=speed, y=depth) | LFO on `detune` parameter |
| `5xy` | Porta + Vol Slide | Tone porta + volume slide | Combined 3xx + Axy |
| `6xy` | Vibrato + Vol Slide | Vibrato + volume slide | Combined 4xy + Axy |
| `7xy` | Tremolo | Volume oscillation (x=speed, y=depth) | LFO on `volume` parameter |
| `8xx` | Set Pan | Stereo position (00=L, 80=C, FF=R) | `panner.pan.value` |
| `9xx` | Sample Offset | Start at offset xx*256 | `sampler.start(offset)` |
| `Axy` | Vol Slide | Slide up x or down y | `volume.rampTo()` |
| `Bxx` | Position Jump | Jump to order position xx | Sequence index change |
| `Cxx` | Set Volume | Volume 00-40 (0-64 decimal) | `volume.value = xx/64` |
| `Dxx` | Pattern Break | Break to row xx of next pattern | Pattern + row change |
| `Exx` | Extended | See E-commands below | Various |
| `Fxx` | Set Speed/BPM | xx<20: speed, xx≥20: BPM | `Transport.bpm` or tick rate |

**Extended E-commands (FT2 Standard):**

| Cmd | Effect | Implementation |
|-----|--------|----------------|
| `E1x` | Fine Porta Up | Small pitch increase |
| `E2x` | Fine Porta Down | Small pitch decrease |
| `E3x` | Glissando Control | Quantize porta to semitones |
| `E4x` | Vibrato Waveform | 0=sine, 1=ramp, 2=square |
| `E5x` | Set Finetune | Detune instrument |
| `E6x` | Pattern Loop | Set/execute loop |
| `E7x` | Tremolo Waveform | 0=sine, 1=ramp, 2=square |
| `E8x` | Set Panning (coarse) | 16 pan positions |
| `E9x` | Retrigger | Retrigger note every x ticks |
| `EAx` | Fine Vol Slide Up | Small volume increase |
| `EBx` | Fine Vol Slide Down | Small volume decrease |
| `ECx` | Note Cut | Cut note after x ticks |
| `EDx` | Note Delay | Delay note x ticks |
| `EEx` | Pattern Delay | Delay pattern x rows |
| `EFx` | Invert Loop | (Legacy, not implemented) |

**Additional XM Extended Commands:**

| Cmd | Effect | Implementation |
|-----|--------|----------------|
| `Gxx` | Set Global Volume | Master volume 00-40 |
| `Hxy` | Global Vol Slide | Master volume slide |
| `Kxx` | Key Off | Release envelope at tick xx |
| `Lxx` | Set Envelope Pos | Jump to envelope position |
| `Pxy` | Panning Slide | Pan left (x) or right (y) |
| `Rxy` | Retrig + Vol Slide | Retrigger with volume change |
| `Txy` | Tremor | On x ticks, off y ticks |
| `X1x` | Extra Fine Porta Up | Very fine pitch up |
| `X2x` | Extra Fine Porta Down | Very fine pitch down |

### 1.4 Effect Entry (Standard FT2 Hex Input)

Direct hex entry in effect column - your musicians already know this:

**Keyboard Entry (FT2 Style):**
- Type `4` → cursor shows `4--`
- Type `8` → cursor shows `48-`
- Type `6` → effect is `486` (Vibrato, speed 8, depth 6)
- `Delete` clears the effect
- Arrow keys navigate between columns

**Column Layout per Channel:**
```
│C-4 01 40 486│
 ^^^ ^^ ^^ ^^^
 │   │  │  └── Effect: 4xy (Vibrato)
 │   │  └───── Volume: 40 (64 decimal, full volume)
 │   └──────── Instrument: 01
 └──────────── Note: C-4

Special note values:
--- = Empty (no note)
=== = Key off (release)
^^^ = Note fade (if supported)
```

**Status Bar Shows Effect Name:**
When cursor is on effect column, status bar displays:
```
┌────────────────────────────────────────────────────────┐
│ Row 0C │ Ch 1 │ Effect: 486 = Vibrato (spd:8 dep:6)   │
└────────────────────────────────────────────────────────┘
```

---

## Part 2: Instrument/Synth Editor

### 2.1 Design Goals

**Why visual for instruments (but hex for effects):**

FT2 musicians know effect commands, but Tone.js synths have parameters that don't exist in classic trackers:
- Oscillator type (sine/square/saw/triangle/custom)
- FM synthesis (harmonicity, modulation index)
- Filter types and envelope amounts
- Multiple effect chains per instrument

The instrument editor is visual because these parameters need it. The tracker itself stays pure FT2.

**Goals:**
1. **Instant feedback** - Every change plays immediately
2. **Presets** - Start from sounds, tweak later
3. **Visual envelopes** - Drag ADSR points
4. **Signal flow view** - See oscillator → filter → effects chain
5. **F3 shortcut** - Open instrument editor (like FT2)

### 2.2 Instrument Editor Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INSTRUMENT EDITOR                                              [?] [x]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PRESETS                                          [Save] [Copy]     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │  🎸      │ │  🎹      │ │  🥁      │ │  🎺      │ │  🎻      │  │   │
│  │  │  Bass    │ │  Keys    │ │  Drums   │ │  Brass   │ │ Strings  │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │                                                                     │   │
│  │  Bass Presets:                                                      │   │
│  │  [Fat Sub] [Acid 303] [Wobble] [Pluck] [Fingered] [Slap] [More...] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────┐ │
│  │  OSCILLATOR               │  │  ENVELOPE (ADSR)                       │ │
│  │                           │  │                                        │ │
│  │   ∿∿∿    ⊓⊓⊓    ╱╲╱╲      │  │       ╱╲                              │ │
│  │   Sine   Square  Saw      │  │      ╱  ╲____                         │ │
│  │                           │  │     ╱       ╲                         │ │
│  │   ╲╱╲╱   ░░░░   Custom    │  │    ╱         ╲____                    │ │
│  │  Triangle Noise  [Draw]   │  │   A    D    S    R                    │ │
│  │                           │  │                                        │ │
│  │  Detune: ████░░░░  +5ct   │  │  Attack:  ██░░░░░░░░  50ms            │ │
│  │  Octave: ◀ 0 ▶            │  │  Decay:   ████░░░░░░  200ms           │ │
│  │                           │  │  Sustain: ██████░░░░  60%             │ │
│  └───────────────────────────┘  │  Release: ████████░░  800ms           │ │
│                                 └────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────┐ │
│  │  FILTER                   │  │  EFFECTS CHAIN                         │ │
│  │                           │  │                                        │ │
│  │  Type: [Lowpass ▼]        │  │  ┌────────┐   ┌────────┐   ┌────────┐ │ │
│  │                           │  │  │Distort │ → │ Delay  │ → │ Reverb │ │ │
│  │  ┌─────────────────────┐  │  │  │ [ON]   │   │ [ON]   │   │ [OFF]  │ │ │
│  │  │    ╱‾‾‾‾‾╲          │  │  │  └────────┘   └────────┘   └────────┘ │ │
│  │  │   ╱      ╲____      │  │  │                                        │ │
│  │  │  ╱            ╲____ │  │  │  [+ Add Effect]                        │ │
│  │  └─────────────────────┘  │  │                                        │ │
│  │                           │  │  ──────────────────────────────────────│ │
│  │  Cutoff:    ██████░░░░    │  │  Distortion:                          │ │
│  │  Resonance: ████░░░░░░    │  │    Drive: ██████░░░░  60%             │ │
│  │  Envelope:  ██░░░░░░░░    │  │    Tone:  ████░░░░░░  40%             │ │
│  │                           │  │                                        │ │
│  └───────────────────────────┘  └────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  TEST                                              Volume: ████████░│   │
│  │  🎹 [C] [D] [E] [F] [G] [A] [B] [C]    Octave: ◀ 4 ▶    [▶ Play]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Breakdown

#### A. Preset Browser (Top Section)

**Purpose:** Musicians can start making music immediately without understanding synthesis.

**Features:**
- **Category tabs** with icons (Bass, Keys, Drums, etc.)
- **Visual preset cards** showing waveform thumbnail + name
- **Search bar** for finding sounds by name
- **Favorites** system (star to save)
- **"Randomize"** button for inspiration
- **Factory presets** that ship with app (50-100 sounds)
- **User presets** saved locally

**Interaction:**
1. Click category → shows presets
2. Hover preset → auto-preview plays a note
3. Click preset → loads into editor
4. All parameters update visually

#### B. Oscillator Section

**Purpose:** Choose the basic sound character.

**Visual Design:**
- Large clickable waveform icons (not dropdown)
- Animated waveform shows current selection
- Simple controls with musical labels

**Controls:**
| Control | What User Sees | Range | Default |
|---------|---------------|-------|---------|
| Waveform | Visual icons | Sine/Square/Saw/Triangle/Noise | Saw |
| Detune | "Detune" slider | -100 to +100 cents | 0 |
| Octave | -2 / -1 / 0 / +1 / +2 buttons | -2 to +2 | 0 |

**Advanced (collapsed by default):**
- Pulse Width (for square wave)
- Phase
- Unison voices + spread

#### C. Envelope (ADSR) Section

**Purpose:** Shape how the sound evolves over time.

**Visual Design:**
- **Interactive envelope graph** - drag points to adjust
- Real-time visualization of envelope shape
- Time markers showing actual milliseconds
- "What does this do?" tooltips

**Controls:**
| Control | Label | Range | Unit | Default |
|---------|-------|-------|------|---------|
| Attack | "Attack" | 0-2000 | ms | 10ms |
| Decay | "Decay" | 0-2000 | ms | 100ms |
| Sustain | "Sustain" | 0-100 | % | 70% |
| Release | "Release" | 0-5000 | ms | 300ms |

**Interactive Graph:**
```
     ╱╲
    ╱  ╲
   ╱    ╲________
  ╱              ╲
 ╱                ╲
●─────●──────●─────●
A     D      S     R
(drag points to adjust)
```

#### D. Filter Section

**Purpose:** Shape the tone/brightness.

**Visual Design:**
- Filter curve visualization (like EQ)
- Animated response to playing notes
- Type selector with visual icons

**Filter Types (shown visually):**
```
Lowpass    Highpass   Bandpass   Notch
  ╱‾‾╲         ╱‾      ╱‾╲        ‾╲╱‾
 ╱    ╲___  __╱       ╱  ╲      __╱╲__
```

**Controls:**
| Control | Label | Range | Default |
|---------|-------|-------|---------|
| Cutoff | "Brightness" / "Cutoff" | 20Hz - 20kHz | 5000Hz |
| Resonance | "Resonance" / "Peak" | 0-100% | 0% |
| Env Amount | "Filter Envelope" | -100 to +100% | 0% |
| Key Track | "Key Tracking" | 0-100% | 0% |

**Presets for filter:**
- "Bright" → Cutoff high, Res low
- "Warm" → Cutoff medium, Res low
- "Acid" → Cutoff medium, Res high
- "Muffled" → Cutoff low, Res low

#### E. Effects Chain Section

**Purpose:** Add space, character, and polish.

**Visual Design:**
- **Drag-and-drop signal flow** visualization
- Each effect is a "pedal" that can be:
  - Toggled on/off (click)
  - Reordered (drag)
  - Removed (X button)
  - Edited (click to expand)

**Available Effects:**

| Effect | Icon | Key Parameters | Use Case |
|--------|------|---------------|----------|
| **Distortion** | 🔥 | Drive, Tone | Add grit/edge |
| **Chorus** | 🌊 | Rate, Depth, Mix | Thicken sound |
| **Delay** | 📢 | Time, Feedback, Mix | Echoes |
| **Reverb** | 🏛️ | Size, Decay, Mix | Space/ambience |
| **Phaser** | 🌀 | Rate, Depth | Sweeping effect |
| **Tremolo** | 📳 | Rate, Depth | Volume wobble |
| **Compressor** | 📊 | Threshold, Ratio | Even out dynamics |
| **EQ** | 📈 | Low/Mid/High | Tone shaping |
| **Bitcrusher** | 👾 | Bits, Rate | Lo-fi/retro |

**Effect Detail View (expands on click):**
```
┌─────────────────────────────────┐
│  DELAY                    [x]   │
├─────────────────────────────────┤
│                                 │
│  Sync to BPM: [ON]              │
│                                 │
│  Time: [1/4 ▼] (or 375ms)       │
│        ████████████░░░░         │
│                                 │
│  Feedback: ████████░░░░  60%    │
│  (How many echoes)              │
│                                 │
│  Mix: ██████░░░░░░░░  40%       │
│  (Dry ←──────→ Wet)             │
│                                 │
│  [Reset to Default]             │
└─────────────────────────────────┘
```

#### F. Test Keyboard Section

**Purpose:** Always be able to hear your changes.

**Features:**
- On-screen piano keys (clickable)
- Keyboard shortcuts (QWERTY → notes)
- Octave selector
- Master volume for preview
- "Hold" toggle for sustained notes
- Visual velocity indicator

---

## Part 3: Synth Types (User-Friendly Names)

Map Tone.js synths to musician-friendly categories:

### 3.1 Synth Selection UI

```
┌─────────────────────────────────────────────┐
│  SYNTH TYPE                                 │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Basic  │ │   FM    │ │   AM    │       │
│  │  Synth  │ │  Synth  │ │  Synth  │       │
│  │ Simple, │ │ Bells,  │ │ Harsh,  │       │
│  │ clean   │ │ metallic│ │ complex │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Mono   │ │  Duo    │ │ Pluck   │       │
│  │  Synth  │ │  Synth  │ │ Synth   │       │
│  │ Classic │ │ Layered │ │ Guitar- │       │
│  │ mono    │ │ sounds  │ │ like    │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Metal   │ │Membrane │ │ Sampler │       │
│  │ Synth   │ │ Synth   │ │         │       │
│  │ Bells,  │ │ Drums,  │ │ Load    │       │
│  │ metallic│ │ toms    │ │ samples │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
└─────────────────────────────────────────────┘
```

### 3.2 Synth Type Details

| Tone.js Synth | User Name | Description | Best For |
|---------------|-----------|-------------|----------|
| `Synth` | "Basic Synth" | Clean, simple | Leads, basses, learning |
| `MonoSynth` | "Mono Synth" | Classic monophonic | Bass, leads |
| `DuoSynth` | "Duo Synth" | Two oscillators | Thick pads, leads |
| `FMSynth` | "FM Synth" | Frequency modulation | Bells, electric piano, bass |
| `AMSynth` | "AM Synth" | Amplitude modulation | Harsh, evolving sounds |
| `PluckSynth` | "Pluck" | Karplus-Strong | Guitar, harp, pizzicato |
| `MetalSynth` | "Metal" | Inharmonic | Bells, metallic hits |
| `MembraneSynth` | "Membrane" | Drum synthesis | Kicks, toms, percussion |
| `NoiseSynth` | "Noise" | Noise generator | Hi-hats, snares, FX |
| `Sampler` | "Sampler" | Sample playback | Drums, recorded sounds |

### 3.3 Synth-Specific Parameters

Each synth type shows only relevant parameters:

**Basic Synth:**
- Oscillator (waveform, detune)
- Envelope (ADSR)
- Filter (optional)

**FM Synth (simplified):**
```
┌─────────────────────────────────────────────┐
│  FM SYNTH                                   │
├─────────────────────────────────────────────┤
│                                             │
│  Brightness (Modulation Index):             │
│  Dark ████████████░░░░░░░░ Bright           │
│                                             │
│  Harmonicity:                               │
│  ◉ 0.5  ○ 1  ○ 2  ○ 3  ○ 4                 │
│  (sub)  (unison) (octave) (fifth) (2 oct)   │
│                                             │
│  Character:                                 │
│  [Bell] [E-Piano] [Bass] [Pluck] [Pad]     │
│                                             │
└─────────────────────────────────────────────┘
```

**Membrane Synth (for drums):**
```
┌─────────────────────────────────────────────┐
│  MEMBRANE SYNTH (Drum)                      │
├─────────────────────────────────────────────┤
│                                             │
│  Pitch:                                     │
│  Low ████████░░░░░░░░░░░░ High              │
│  C1        Current: E1        C4            │
│                                             │
│  Pitch Drop:                                │
│  None ██████████████░░░░░░ Deep             │
│                                             │
│  Decay:                                     │
│  Short ████████░░░░░░░░░░░ Long             │
│                                             │
│  Presets: [Kick] [Tom] [808] [Perc]        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Part 4: Sampler/Sample Browser

For musicians who want to use recorded sounds:

### 4.1 Sample Browser UI

```
┌─────────────────────────────────────────────────────────────────┐
│  SAMPLE BROWSER                                          [x]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐│
│  │  CATEGORIES  │  │  SAMPLES                                 ││
│  │              │  │                                          ││
│  │  > Drums     │  │  🔊 kick_808.wav          [▶] [+]        ││
│  │    > Kicks   │  │  🔊 kick_acoustic.wav     [▶] [+]        ││
│  │    > Snares  │  │  🔊 kick_deep.wav         [▶] [+]        ││
│  │    > Hi-hats │  │  🔊 kick_punchy.wav       [▶] [+]        ││
│  │    > Cymbals │  │  🔊 kick_vinyl.wav        [▶] [+]        ││
│  │  > Bass      │  │                                          ││
│  │  > Keys      │  │  ──────────────────────────────────────  ││
│  │  > Pads      │  │                                          ││
│  │  > FX        │  │  PREVIEW:                                ││
│  │  > Vocals    │  │  ┌────────────────────────────────────┐  ││
│  │              │  │  │ ▁▂▃▅▆▇█▇▆▅▃▂▁▁▂▃▅▆█▇▅▃▂▁          │  ││
│  │  [+ Import]  │  │  └────────────────────────────────────┘  ││
│  │              │  │  kick_808.wav  |  0.8s  |  44.1kHz       ││
│  └──────────────┘  └──────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  DRAG SAMPLES TO KEYBOARD TO MAP:                           ││
│  │                                                             ││
│  │  🎹 [ C ] [ D ] [ E ] [ F ] [ G ] [ A ] [ B ] [ C ]         ││
│  │       ↑                                                     ││
│  │    (Drop here)                                              ││
│  │                                                             ││
│  │  Current mapping:                                           ││
│  │  C1: kick_808.wav                                           ││
│  │  D1: snare_tight.wav                                        ││
│  │  E1: (empty)                                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Drum Kit Builder (Simplified Sampler)

For non-coders, a visual drum kit interface:

```
┌─────────────────────────────────────────────────────────────────┐
│  DRUM KIT BUILDER                                        [x]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ┌─────────┐                                  │
│                    │ CRASH   │                                  │
│                    │  [C3]   │                                  │
│                    └─────────┘                                  │
│        ┌─────────┐           ┌─────────┐                       │
│        │ HI-HAT  │           │  RIDE   │                       │
│        │  [F#2]  │           │  [D#3]  │                       │
│        └─────────┘           └─────────┘                       │
│                                                                 │
│    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│    │  TOM 1  │  │  TOM 2  │  │  TOM 3  │  │  TOM 4  │         │
│    │  [D2]   │  │  [B1]   │  │  [A1]   │  │  [G1]   │         │
│    └─────────┘  └─────────┘  └─────────┘  └─────────┘         │
│                                                                 │
│        ┌─────────┐           ┌─────────┐                       │
│        │  SNARE  │           │  KICK   │                       │
│        │  [D1]   │           │  [C1]   │                       │
│        └─────────┘           └─────────┘                       │
│                                                                 │
│  ───────────────────────────────────────────────────────────── │
│  Click a pad to change sample, or drag from browser above      │
│                                                                 │
│  Kit Presets: [808 Kit] [Acoustic] [Rock] [Electronic] [Lo-Fi] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Instrument List in Tracker

### 5.1 Side Panel Design

```
┌─────────────────────────────────────┐
│  INSTRUMENTS                   [+]  │
├─────────────────────────────────────┤
│                                     │
│  01 │ 🎸 Fat Bass                   │
│     │ MonoSynth + Distortion        │
│     │ ████████████░░░  ▶ ✎ ✕       │
│  ─────────────────────────────────  │
│  02 │ 🎹 Soft Pad                   │
│     │ DuoSynth + Reverb             │
│     │ ██████░░░░░░░░░  ▶ ✎ ✕       │
│  ─────────────────────────────────  │
│  03 │ 🥁 Drums                      │
│     │ Sampler (8 samples)           │
│     │ ████████████████  ▶ ✎ ✕       │
│  ─────────────────────────────────  │
│  04 │ 🎺 Lead                       │
│     │ FMSynth + Delay               │
│     │ ██████████░░░░░  ▶ ✎ ✕       │
│  ─────────────────────────────────  │
│                                     │
│  [+ Add Instrument]                 │
│                                     │
│  ─────────────────────────────────  │
│  Current: 01 (Fat Bass)             │
│  Click instrument to select for     │
│  note entry in tracker              │
│                                     │
└─────────────────────────────────────┘

Legend:
████ = Volume meter (real-time)
▶ = Preview/play button
✎ = Edit button
✕ = Delete button
```

### 5.2 Quick Instrument Selection

**In tracker:** When user types instrument column:
- Show dropdown of available instruments
- Number keys (0-9) select directly
- Tab cycles through instruments
- Visual indicator shows current selection

```
┌─────────────────────────────────────┐
│  SELECT INSTRUMENT                  │
├─────────────────────────────────────┤
│  01  Fat Bass         ⌨ Press 1    │
│  02  Soft Pad         ⌨ Press 2    │
│  03  Drums            ⌨ Press 3    │
│  04  Lead             ⌨ Press 4    │
│  --  (No instrument)  ⌨ Press 0    │
└─────────────────────────────────────┘
```

---

## Part 6: Real-Time Audio Feedback

### 6.1 Visual Feedback Everywhere

| Action | Visual Feedback | Audio Feedback |
|--------|----------------|----------------|
| Click preset | Highlight preset | Play sample note |
| Adjust slider | Animated slider | Note re-triggers |
| Select waveform | Waveform animates | Tone changes |
| Toggle effect | On/Off indicator | Sound updates |
| Play row in tracker | Row highlights | Notes play |
| Navigate tracker | Cursor visible | Note previews |

### 6.2 "Preview Mode" Toggle

```
┌─────────────────────────────────────┐
│  PREVIEW MODE: [ON] / OFF           │
├─────────────────────────────────────┤
│  When ON:                           │
│  • Moving cursor plays notes        │
│  • Changing parameters re-triggers  │
│  • Hovering presets plays preview   │
│                                     │
│  When OFF:                          │
│  • Silent editing                   │
│  • Only plays when you press Play   │
└─────────────────────────────────────┘
```

---

## Part 7: Parameter Automation & Filter Columns

### 7.1 Extended Tracker Columns

Beyond standard FT2 columns, add **parameter automation columns** for real-time filter sweeps and knob control:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PATTERN EDITOR (Extended View)                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Row │ Note Inst Vol Eff │ CUT  RES  ENV  PAN │ Note Inst Vol Eff │ ...        │
│  ────┼───────────────────┼────────────────────┼───────────────────┼────         │
│  00  │ C-2  01  40  ---  │  50   80   --  80  │ ---  --  --  ---  │             │
│  01  │ ---  --  --  ---  │  55   --   --  --  │ E-4  02  32  ---  │             │
│  02  │ C-2  01  --  ---  │  60   --   --  --  │ ---  --  --  ---  │             │
│  03  │ ---  --  --  ---  │  70   75   --  --  │ ---  --  --  ---  │             │
│  04  │ Eb-2 01  --  ---  │  80   --   --  --  │ G-4  02  --  ---  │             │
│  05  │ ---  --  --  ---  │  90   70   --  --  │ ---  --  --  ---  │             │
│  06  │ ---  --  --  ---  │  A0   --   --  --  │ ---  --  --  ---  │             │
│  07  │ C-2  01  --  ---  │  B0   65   --  --  │ ---  --  --  ---  │             │
│  08  │ ---  --  --  ---  │  C0   --   --  --  │ ---  --  --  ---  │  ← Filter   │
│  09  │ ---  --  --  ---  │  B0   60   --  --  │ ---  --  --  ---  │    sweep!   │
│  0A  │ G-2  01  --  ---  │  A0   --   --  --  │ ---  --  --  ---  │             │
│  0B  │ ---  --  --  ---  │  80   55   --  --  │ ---  --  --  ---  │             │
│  0C  │ ---  --  --  ---  │  60   --   --  --  │ ---  --  --  ---  │             │
│  ────┴───────────────────┴────────────────────┴───────────────────┴────         │
│                                                                                  │
│  CUT = Filter Cutoff (00-FF)      RES = Resonance (00-FF)                       │
│  ENV = Filter Envelope Amount     PAN = Panning                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Available Automation Columns

Each channel can have **optional automation columns** that can be shown/hidden:

| Column | Abbrev | Range | Parameter | Tone.js Mapping |
|--------|--------|-------|-----------|-----------------|
| **Filter Cutoff** | CUT | 00-FF | Filter frequency | `filter.frequency` (20Hz-20kHz log scale) |
| **Resonance** | RES | 00-FF | Filter Q | `filter.Q` (0.1-20) |
| **Filter Env** | ENV | 00-FF | Envelope amount | `filterEnvelope.octaves` |
| **Panning** | PAN | 00-FF | Stereo position | `panner.pan` (-1 to +1) |
| **Distortion** | DST | 00-FF | Drive amount | `distortion.distortion` |
| **Delay Mix** | DLY | 00-FF | Delay wet/dry | `delay.wet` |
| **Reverb Mix** | REV | 00-FF | Reverb wet/dry | `reverb.wet` |
| **LFO Rate** | LFO | 00-FF | LFO speed | `lfo.frequency` |
| **Pitch Bend** | PIT | 00-FF | Pitch offset | `detune` (-1200 to +1200 cents) |
| **Attack** | ATK | 00-FF | Envelope attack | `envelope.attack` |
| **Decay** | DEC | 00-FF | Envelope decay | `envelope.decay` |
| **Volume** | VOL | 00-FF | Channel volume | `volume.value` |

### 7.3 Column Visibility Toggle

```
┌─────────────────────────────────────────────────────────────────┐
│  COLUMN VISIBILITY (per channel)                           [x]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Channel 1: Acid Bass                                           │
│                                                                 │
│  Standard:        [✓] Note  [✓] Inst  [✓] Vol  [✓] Effect      │
│                                                                 │
│  Filter:          [✓] Cutoff  [✓] Resonance  [ ] Env Amount    │
│                                                                 │
│  Effects:         [ ] Distortion  [ ] Delay  [ ] Reverb        │
│                                                                 │
│  Modulation:      [ ] LFO Rate  [ ] Pitch  [ ] Pan             │
│                                                                 │
│  Envelope:        [ ] Attack  [ ] Decay                         │
│                                                                 │
│  Presets:  [303 Acid] [Full Mix] [Minimal] [Custom...]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Automation Curve Editor (Visual Mode)

For more precise control, open an **automation lane** below the pattern:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  AUTOMATION: Channel 1 - Filter Cutoff                              [x] Close  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Mode: ○ Steps  ● Curve  ○ Keyframes       Snap: [1/16 ▼]  [Copy] [Paste]      │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 20kHz ┤                                           ●───●                   │  │
│  │       │                                      ●───●     ╲                  │  │
│  │       │                                 ●───●           ╲                 │  │
│  │  5kHz ┤                            ●───●                 ╲                │  │
│  │       │                       ●───●                       ╲               │  │
│  │       │                  ●───●                             ╲●───●        │  │
│  │  1kHz ┤             ●───●                                       ╲        │  │
│  │       │        ●───●                                             ╲       │  │
│  │       │   ●───●                                                   ●───●  │  │
│  │ 200Hz ┼───●                                                             │  │
│  │       └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴───  │  │
│  │       00   04   08   0C   10   14   18   1C   20   24   28   2C   30     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Draw: [✏️ Pencil] [📐 Line] [〰️ Curve] [⬜ Select]    [Smooth] [Quantize]       │
│                                                                                  │
│  Quick Shapes: [Ramp ↗] [Ramp ↘] [Triangle] [Sine] [Random] [Clear]            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Drawing Tools

**Pencil Tool (✏️)**
- Click and drag to draw freehand curves
- Values snap to grid based on snap setting
- Hold Shift for straight horizontal lines

**Line Tool (📐)**
- Click start point, click end point
- Creates linear ramp between points
- Perfect for filter sweeps

**Curve Tool (〰️)**
- Click to add control points
- Drag points to create bezier curves
- Double-click to finish

**Select Tool (⬜)**
- Click and drag to select region
- Move, copy, paste, delete selections
- Scale selection vertically/horizontally

### 7.6 Quick Shape Presets

| Shape | Description | Use Case |
|-------|-------------|----------|
| **Ramp Up ↗** | Linear rise from current to max | Filter open |
| **Ramp Down ↘** | Linear fall from current to min | Filter close |
| **Triangle △** | Up then down | Filter sweep |
| **Sine ~** | Smooth oscillation | Wobble effect |
| **Saw ╱╱** | Repeated ramps | Rhythmic sweep |
| **Random** | Random values | Glitchy textures |
| **S-Curve** | Slow-fast-slow | Natural movement |

### 7.7 Keyframe Mode

For precise control, use **keyframes** with interpolation:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  KEYFRAMES: Filter Cutoff                                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │         ◆                               ◆───────◆                       │    │
│  │        ╱ ╲                             ╱         ╲                      │    │
│  │       ╱   ╲                           ╱           ╲                     │    │
│  │      ╱     ╲                         ╱             ╲                    │    │
│  │     ╱       ╲           ◆───────────◆               ╲                   │    │
│  │    ╱         ╲         ╱                             ╲                  │    │
│  │ ◆─╱           ╲───────◆                               ╲◆                │    │
│  │  00    04    08    0C    10    14    18    1C    20    24               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Keyframe List:                                                                  │
│  ┌──────┬───────┬──────────────┬────────────────┐                               │
│  │ Row  │ Value │ Interpolation│ Actions        │                               │
│  ├──────┼───────┼──────────────┼────────────────┤                               │
│  │ 00   │ 20%   │ Linear       │ [Edit] [Del]   │                               │
│  │ 04   │ 80%   │ Ease Out     │ [Edit] [Del]   │                               │
│  │ 08   │ 30%   │ Linear       │ [Edit] [Del]   │                               │
│  │ 10   │ 50%   │ Hold         │ [Edit] [Del]   │                               │
│  │ 18   │ 90%   │ Ease In-Out  │ [Edit] [Del]   │                               │
│  │ 20   │ 90%   │ Ease In      │ [Edit] [Del]   │                               │
│  │ 24   │ 20%   │ Linear       │ [Edit] [Del]   │                               │
│  └──────┴───────┴──────────────┴────────────────┘                               │
│                                                                                  │
│  [+ Add Keyframe]    Interpolation: [Linear ▼] [Ease In] [Ease Out] [Hold]     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.8 Interpolation Types

| Type | Curve | Behavior |
|------|-------|----------|
| **Linear** | `╱` | Constant rate change |
| **Hold** | `┐` | Jump at keyframe, hold until next |
| **Ease In** | `╱` (slow→fast) | Accelerating curve |
| **Ease Out** | `╱` (fast→slow) | Decelerating curve |
| **Ease In-Out** | `∼` | S-curve, smooth both ends |
| **Exponential** | `⌒` | Logarithmic (good for frequency) |

### 7.9 303-Style Acid Workflow

**Classic acid bassline automation pattern:**

```
Step 1: Enter notes in tracker
┌──────────────────────────────┐
│ Row │ Note │ Inst │ Vol │    │
│ 00  │ C-2  │  01  │  40 │    │
│ 04  │ C-2  │  01  │  -- │    │
│ 08  │ Eb-2 │  01  │  -- │    │
│ 0C  │ C-2  │  01  │  -- │    │
│ 10  │ G-2  │  01  │  -- │    │
└──────────────────────────────┘

Step 2: Open automation lane for Filter Cutoff

Step 3: Draw the classic acid sweep:
┌─────────────────────────────────────────┐
│ 100% │              ●●●●                │
│      │           ●●●    ●●●             │
│      │        ●●●          ●●●          │
│  50% │     ●●●                ●●●       │
│      │  ●●●                      ●●●    │
│   0% │●●                            ●●● │
│      └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──  │
│        00 04 08 0C 10 14 18 1C 20       │
└─────────────────────────────────────────┘

Step 4: Add resonance automation for extra squelch:
┌─────────────────────────────────────────┐
│ 100% │   ●●●●●●●●●●●●●●●●●●●●●●●       │
│      │ ●●                        ●●●    │
│  50% │●                              ●● │
│      └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──  │
└─────────────────────────────────────────┘
```

### 7.10 Automation Export Format

Automation data is included in the JSON export:

```json
{
  "patterns": [
    {
      "id": "pattern-0",
      "channels": [
        {
          "notes": [...],
          "automation": {
            "filterCutoff": {
              "mode": "curve",
              "points": [
                { "row": 0, "value": 0.2 },
                { "row": 4, "value": 0.8, "curve": "easeOut" },
                { "row": 8, "value": 0.3, "curve": "linear" },
                { "row": 16, "value": 0.9, "curve": "easeInOut" },
                { "row": 24, "value": 0.2, "curve": "easeIn" }
              ]
            },
            "resonance": {
              "mode": "steps",
              "values": [80, 80, 85, 85, 90, 90, 85, 80, 75, 70, 65, 60]
            },
            "panning": {
              "mode": "keyframes",
              "keyframes": [
                { "row": 0, "value": 0.5, "interpolation": "hold" },
                { "row": 16, "value": 0.3, "interpolation": "linear" },
                { "row": 32, "value": 0.7, "interpolation": "linear" }
              ]
            }
          }
        }
      ]
    }
  ]
}
```

### 7.11 Real-Time Automation Playback

```typescript
// Automation processor in playback engine
class AutomationProcessor {
  processRow(channel: Channel, row: number, time: number) {
    const automation = channel.automation;

    if (automation.filterCutoff) {
      const value = this.interpolate(automation.filterCutoff, row);
      const freq = this.valueToFrequency(value); // 0-1 → 20Hz-20kHz (log)
      channel.synth.filter.frequency.setValueAtTime(freq, time);
    }

    if (automation.resonance) {
      const value = this.interpolate(automation.resonance, row);
      const q = value * 20; // 0-1 → 0-20
      channel.synth.filter.Q.setValueAtTime(q, time);
    }

    if (automation.panning) {
      const value = this.interpolate(automation.panning, row);
      const pan = (value - 0.5) * 2; // 0-1 → -1 to +1
      channel.panner.pan.setValueAtTime(pan, time);
    }
  }

  interpolate(automation: AutomationData, row: number): number {
    if (automation.mode === 'steps') {
      return automation.values[row] / 255;
    }

    if (automation.mode === 'curve' || automation.mode === 'keyframes') {
      const points = automation.points || automation.keyframes;
      // Find surrounding keyframes and interpolate
      const prev = points.filter(p => p.row <= row).pop();
      const next = points.find(p => p.row > row);

      if (!prev) return next?.value ?? 0;
      if (!next) return prev.value;

      const t = (row - prev.row) / (next.row - prev.row);
      return this.applyCurve(prev.value, next.value, t, next.curve);
    }

    return 0;
  }

  applyCurve(start: number, end: number, t: number, curve: string): number {
    switch (curve) {
      case 'hold': return start;
      case 'linear': return start + (end - start) * t;
      case 'easeIn': return start + (end - start) * (t * t);
      case 'easeOut': return start + (end - start) * (1 - (1 - t) * (1 - t));
      case 'easeInOut': return start + (end - start) * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
      default: return start + (end - start) * t;
    }
  }

  valueToFrequency(value: number): number {
    // Logarithmic scale: 0 = 20Hz, 1 = 20kHz
    return 20 * Math.pow(1000, value);
  }
}
```

### 7.12 Mobile Automation Editing

On mobile devices, automation editing uses a simplified interface:

```
┌─────────────────────────────────────────┐
│  AUTOMATION: Filter Cutoff              │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │       ●                           │  │
│  │      ╱ ╲         ●────●           │  │
│  │     ╱   ╲       ╱      ╲          │  │
│  │    ╱     ╲─────●        ╲         │  │
│  │ ●─●       ╲              ╲●       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Tap to add point • Drag to move        │
│  Long-press for options                 │
│                                         │
│  Quick: [↗ Ramp] [↘ Fall] [△ Tri]      │
│                                         │
│  Row: [08]  Value: [75%]  Curve: [Ease] │
│                                         │
│              [Done]                     │
└─────────────────────────────────────────┘
```

---

## Part 8: TB-303 Emulation (Authentic Acid)

The tracker MUST include a **dedicated TB-303 emulation mode** that captures all the quirks and behaviors that make the 303 sound like a 303. Your musicians know the real thing - give them the real thing.

### 8.1 The 303 Sound: What Makes It Special

The TB-303 Bass Line has a distinctive sound due to several unique characteristics that differ from standard synthesizers:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TB-303 SIGNAL PATH                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────┐    ┌─────────────────────┐    ┌────────────┐    ┌──────────┐   │
│  │ OSCILLATOR │───▶│  18dB/oct FILTER    │───▶│    VCA     │───▶│  OUTPUT  │   │
│  │            │    │   (3-pole!)         │    │            │    │          │   │
│  │  SAW  SQR  │    │                     │    │  Envelope  │    │          │   │
│  │   ○    ○   │    │  Cutoff   Resonance │    │  + Accent  │    │          │   │
│  └────────────┘    │    ▲         ▲      │    └────────────┘    └──────────┘   │
│                    │    │         │      │           ▲                          │
│                    │  ┌─┴─────────┴─┐    │           │                          │
│                    │  │ FILTER ENV  │    │     ┌─────┴─────┐                    │
│                    │  │ + Env Mod   │    │     │  ACCENT   │                    │
│                    │  │ + Accent!   │    │     │  CIRCUIT  │                    │
│                    │  └─────────────┘    │     └───────────┘                    │
│                    └─────────────────────┘                                      │
│                                                                                  │
│  KEY: Accent boosts BOTH filter envelope AND VCA simultaneously!                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 TB-303 Critical Specifications

| Parameter | 303 Spec | Standard Synth | Why It Matters |
|-----------|----------|----------------|----------------|
| **Filter Slope** | **18dB/octave (3-pole)** | 24dB/oct (4-pole) | Brighter, more harmonics bleed through |
| **Filter Type** | Lowpass only | Multiple types | Characteristic squelch |
| **Resonance** | Self-oscillates at max | Often doesn't | Creates whistling tones |
| **Envelope** | Decay only (instant attack) | Full ADSR | Punchy, immediate |
| **Oscillators** | Saw OR Square only | Multiple | Limited but classic |
| **Accent** | Boosts vol + filter env | Usually just volume | The 303 "bite" |
| **Slide** | Portamento on tied notes | Global glide | Liquid acid lines |

### 8.3 TB-303 Tracker Columns

Add **303-specific columns** to the tracker for authentic acid programming:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  303 ACID MODE - Extended Columns                                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Row │ Note │ Inst │ ACC │ SLD │ CUT  │ RES  │ ENV  │ DEC  │ Vol │ Eff │        │
│  ────┼──────┼──────┼─────┼─────┼──────┼──────┼──────┼──────┼─────┼─────┤        │
│  00  │ C-2  │  01  │  ●  │     │  40  │  80  │  60  │  30  │  40 │ --- │        │
│  01  │ C-2  │  --  │     │     │  50  │  --  │  --  │  --  │  -- │ --- │ ← Tie  │
│  02  │ Eb-2 │  --  │  ●  │  ●  │  70  │  --  │  --  │  --  │  -- │ --- │ ← Slide│
│  03  │ ---  │  --  │     │     │  --  │  --  │  --  │  --  │  -- │ --- │ ← Rest │
│  04  │ G-2  │  01  │     │     │  80  │  --  │  --  │  --  │  -- │ --- │        │
│  05  │ G-2  │  --  │     │  ●  │  90  │  --  │  --  │  --  │  -- │ --- │        │
│  06  │ C-3  │  --  │  ●  │  ●  │  A0  │  90  │  --  │  --  │  -- │ --- │← Accent│
│  07  │ ---  │  --  │     │     │  --  │  --  │  --  │  --  │  -- │ --- │  +Slide│
│  ────┴──────┴──────┴─────┴─────┴──────┴──────┴──────┴──────┴─────┴─────┘        │
│                                                                                  │
│  Legend:                                                                         │
│  ACC = Accent (● = on) - Boosts volume AND filter envelope                      │
│  SLD = Slide (● = on) - Glide to this note from previous                        │
│  CUT = Filter Cutoff (00-FF → 200Hz-20kHz, logarithmic)                         │
│  RES = Resonance (00-FF → 0-100%, self-oscillates at ~90%+)                     │
│  ENV = Envelope Mod (00-FF → how much envelope opens filter)                    │
│  DEC = Decay (00-FF → envelope decay time 30ms-3000ms)                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Accent Behavior (Critical!)

The TB-303's accent is NOT just a volume boost. It has a **complex interaction** with the filter:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ACCENT BEHAVIOR                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  NORMAL NOTE                          ACCENTED NOTE                              │
│  ────────────                          ─────────────                              │
│                                                                                  │
│  Volume:  ████████░░░░ 60%            Volume:  ████████████ 100%                 │
│                                                                                  │
│  Filter Envelope:                     Filter Envelope:                           │
│  ┌────────────────────┐               ┌────────────────────┐                    │
│  │      ╱╲            │               │    ╱╲              │                    │
│  │     ╱  ╲           │               │   ╱  ╲             │ ← Higher peak!     │
│  │    ╱    ╲____      │               │  ╱    ╲            │                    │
│  │   ╱          ╲____ │               │ ╱      ╲____       │                    │
│  │__╱                 │               │╱            ╲_____ │ ← Longer decay!    │
│  └────────────────────┘               └────────────────────┘                    │
│  Env Mod: 50%                         Env Mod: 80%+ (boosted!)                   │
│  Decay: 200ms                         Decay: 400ms (stretched!)                  │
│                                                                                  │
│  Implementation:                                                                 │
│  - Accent increases VCA volume by ~50%                                          │
│  - Accent increases filter envelope amount by ~50-100%                          │
│  - Accent extends filter envelope decay                                         │
│  - All three combine for the characteristic "bite"                              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Accent Implementation (Tone.js):**

```typescript
interface TB303State {
  accentAmount: number;      // 0-1, typically 0.5-0.8
  baseEnvMod: number;        // Base filter envelope amount
  baseDecay: number;         // Base envelope decay
  baseVolume: number;        // Base VCA level
}

function triggerNote(note: string, accent: boolean, state: TB303State) {
  const synth = get303Synth();

  if (accent) {
    // Boost volume
    synth.volume.value = state.baseVolume + (6 * state.accentAmount); // +6dB max

    // Boost filter envelope
    synth.filterEnvelope.octaves = state.baseEnvMod * (1 + state.accentAmount);

    // Extend decay
    synth.filterEnvelope.decay = state.baseDecay * (1 + state.accentAmount * 0.5);

    // Accent also has its own decay behavior
    synth.envelope.decay = state.baseDecay * (1 + state.accentAmount * 0.3);
  } else {
    // Normal note - use base values
    synth.volume.value = state.baseVolume;
    synth.filterEnvelope.octaves = state.baseEnvMod;
    synth.filterEnvelope.decay = state.baseDecay;
    synth.envelope.decay = state.baseDecay;
  }

  synth.triggerAttack(note);
}
```

### 8.5 Slide/Glide Behavior

The 303's slide only works between **tied notes**. This creates the liquid, connected acid lines:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SLIDE BEHAVIOR                                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  WITHOUT SLIDE:                       WITH SLIDE:                                │
│  ──────────────                       ───────────                                │
│                                                                                  │
│  Note: C2    E2    G2                 Note: C2 → E2 → G2                        │
│        │     │     │                        │    ╱    ╱                          │
│  Pitch:│     │     │                  Pitch:│___╱____╱                           │
│        └─────┴─────┘                        └─────────────                       │
│  (Separate attacks)                   (Continuous glide)                         │
│                                                                                  │
│  Key Rule: Slide ONLY happens when:                                              │
│  1. Current note has SLIDE flag set                                              │
│  2. Previous note is TIED (no new attack)                                        │
│                                                                                  │
│  Slide Time: ~60ms (fixed in original 303)                                       │
│  In our tracker: Configurable 30-200ms                                           │
│                                                                                  │
│  CLASSIC 303 SLIDE PATTERN:                                                      │
│  ──────────────────────────                                                      │
│  Row │ Note │ ACC │ SLD │                                                        │
│  ────┼──────┼─────┼─────┤                                                        │
│  00  │ C-2  │     │     │  ← Attack C2                                           │
│  01  │ C-2  │     │     │  ← Tie (hold C2)                                       │
│  02  │ E-2  │     │  ●  │  ← SLIDE to E2 (no new attack!)                        │
│  03  │ E-2  │     │     │  ← Tie (hold E2)                                       │
│  04  │ G-2  │  ●  │  ●  │  ← SLIDE to G2 with ACCENT                            │
│  05  │ ---  │     │     │  ← Rest (note released)                                │
│  06  │ C-2  │     │     │  ← New attack (no slide - previous was rest)          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Slide Implementation:**

```typescript
function processSlide(currentNote: string, slide: boolean, time: number) {
  const synth = get303Synth();

  if (slide && isNotePlaying()) {
    // Glide to new note without retriggering envelope
    synth.frequency.rampTo(noteToFreq(currentNote), 0.06, time); // 60ms glide
  } else {
    // Normal attack
    synth.triggerAttack(currentNote, time);
  }
}
```

### 8.6 The 18dB/Octave Filter (3-Pole)

The 303 uses a **3-pole (18dB/oct)** filter, not the common 4-pole (24dB/oct). This is crucial for the sound:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  FILTER SLOPE COMPARISON                                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  24dB/oct (Moog-style)                18dB/oct (303-style)                       │
│  ─────────────────────                ────────────────────                       │
│                                                                                  │
│  ┌────────────────────┐               ┌────────────────────┐                    │
│  │ 0dB ════════╗      │               │ 0dB ════════╗      │                    │
│  │             ║      │               │             ╚══╗   │                    │
│  │-12dB        ║      │               │-12dB           ╚═══│ ← More bleed!      │
│  │             ║      │               │                    │                    │
│  │-24dB        ╚══════│               │-18dB            ═══│                    │
│  │                    │               │                    │                    │
│  │-48dB        ═══════│               │-36dB         ══════│                    │
│  └────────────────────┘               └────────────────────┘                    │
│  Cutoff →                             Cutoff →                                   │
│                                                                                  │
│  Result:                              Result:                                    │
│  - Cleaner cutoff                     - More harmonics bleed through            │
│  - Darker when closed                 - Brighter, buzzier character             │
│  - Less "scream"                      - That distinctive 303 "scream"           │
│                                                                                  │
│  TONE.JS IMPLEMENTATION:                                                         │
│  Since Tone.js Filter doesn't have 18dB mode, use workaround:                   │
│                                                                                  │
│  Option 1: Use -12dB rolloff + slight EQ boost above cutoff                     │
│  Option 2: Custom biquad filter chain (two 6dB + one 6dB)                       │
│  Option 3: Use -24dB but adjust envelope/resonance curves                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Tone.js 18dB Filter Approximation:**

```typescript
// Option 1: Two cascaded filters to approximate 18dB
class TB303Filter {
  private filter1: Tone.Filter;
  private filter2: Tone.Filter;

  constructor() {
    // First filter: 12dB/oct
    this.filter1 = new Tone.Filter({
      type: "lowpass",
      frequency: 1000,
      rolloff: -12,
      Q: 1
    });

    // Second filter: 6dB/oct (one-pole)
    this.filter2 = new Tone.OnePoleFilter({
      frequency: 1000,
      type: "lowpass"
    });

    // Chain them
    this.filter1.connect(this.filter2);
  }

  set cutoff(freq: number) {
    this.filter1.frequency.value = freq;
    this.filter2.frequency.value = freq;
  }

  set resonance(q: number) {
    // Only first filter has resonance
    this.filter1.Q.value = q;
  }
}

// Option 2: Use -24dB but compensate with resonance curve
function create303Filter(): Tone.Filter {
  return new Tone.Filter({
    type: "lowpass",
    frequency: 1000,
    rolloff: -24,
    Q: 8  // Higher base Q to compensate for steeper slope
  });
}
```

### 8.7 Resonance & Self-Oscillation

The 303's resonance can push into **self-oscillation**, creating pitched whistles:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  RESONANCE BEHAVIOR                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Resonance:  0%         50%         75%         90%        100%                 │
│              │          │           │           │          │                     │
│              ▼          ▼           ▼           ▼          ▼                     │
│                                                                                  │
│  Filter     ╱‾‾‾       ╱‾\         ╱█╲        ╱███╲      ████                   │
│  Response: ╱           ╱  ╲       ╱   ╲      ╱     ╲     SINE                   │
│           ╱_____      ╱____╲     ╱_____╲    ╱_______╲    WAVE!                  │
│                                                                                  │
│  Sound:    Flat      Slight     Pronounced  SCREAMING   Self-                   │
│                       peak        peak        ACID!      oscillating            │
│                                                                                  │
│  303 CHARACTER ZONES:                                                            │
│  ─────────────────────                                                           │
│  0-30%:   Warm, round - good for dub techno                                      │
│  30-60%:  Musical resonance - classic acid house                                 │
│  60-80%:  Aggressive squelch - hard acid                                         │
│  80-95%:  Screaming, near oscillation - THAT sound                              │
│  95-100%: Self-oscillation - use cutoff as pitch!                               │
│                                                                                  │
│  ⚠️ WARNING: Self-oscillation can be LOUD. Apply limiter!                        │
│                                                                                  │
│  CLASSIC ACID RESONANCE SETTINGS:                                                │
│  ────────────────────────────────                                                │
│  Phuture "Acid Tracks": ~70-80%                                                  │
│  Hardfloor: 80-90%                                                               │
│  Josh Wink "Higher State": 85-95%                                                │
│  Plastikman: 60-75% (more subtle)                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.8 Envelope Modulation & Decay

The filter envelope is the soul of the acid sound:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  FILTER ENVELOPE PARAMETERS                                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  The 303 envelope is DECAY-ONLY (attack is essentially instant ~3ms)             │
│                                                                                  │
│  ┌─ ENVELOPE MOD (how much envelope opens filter) ─────────────────────────┐    │
│  │                                                                          │    │
│  │  0%              50%               100%              (with accent)       │    │
│  │                                                                          │    │
│  │  Cutoff          Cutoff            Cutoff            Cutoff             │    │
│  │  ════            ╱‾‾╲              ╱‾‾‾‾╲            ╱‾‾‾‾‾‾╲           │    │
│  │                 ╱    ╲            ╱      ╲          ╱        ╲          │    │
│  │  ────          ╱──────╲          ╱────────╲        ╱──────────╲         │    │
│  │  (static)     (subtle)          (classic)        (maximum squelch)      │    │
│  │                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─ DECAY (how fast filter closes) ────────────────────────────────────────┐    │
│  │                                                                          │    │
│  │  Short (30ms)    Medium (200ms)    Long (800ms)     Very Long (2s+)     │    │
│  │                                                                          │    │
│  │  ╱╲              ╱╲                ╱╲                ╱‾‾‾╲               │    │
│  │ ╱  ╲            ╱  ╲              ╱  ╲              ╱     ╲              │    │
│  │╱────╲          ╱────╲____        ╱────╲________    ╱───────╲_______     │    │
│  │                                                                          │    │
│  │ "Plucky"       "Classic"         "Swell"          "Evolving"            │    │
│  │ Fast acid      303 default       Slower acid      Ambient acid          │    │
│  │                                                                          │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  DECAY RANGES (in tracker column):                                               │
│  00 = 30ms (instant pluck)                                                       │
│  40 = 200ms (default 303)                                                        │
│  80 = 600ms (slow sweep)                                                         │
│  C0 = 1500ms (very slow)                                                         │
│  FF = 3000ms (ambient)                                                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.9 303 Oscillator Section

Only two waveforms - but they're distinct:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  303 OSCILLATORS                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────┐  ┌────────────────────────────┐                 │
│  │      SAWTOOTH              │  │       SQUARE               │                 │
│  │                            │  │                            │                 │
│  │   ╱│  ╱│  ╱│  ╱│  ╱│      │  │   ┌──┐  ┌──┐  ┌──┐        │                 │
│  │  ╱ │ ╱ │ ╱ │ ╱ │ ╱ │      │  │   │  │  │  │  │  │        │                 │
│  │ ╱  │╱  │╱  │╱  │╱  │      │  │ ──┘  └──┘  └──┘  └──      │                 │
│  │                            │  │                            │                 │
│  │ Rich harmonics             │  │ Hollow, woody              │                 │
│  │ Classic 303 sound          │  │ Different character        │                 │
│  │ More "aggressive"          │  │ More "mellow"              │                 │
│  │ Better for screaming leads │  │ Better for basslines       │                 │
│  │                            │  │                            │                 │
│  │ Used in: Most acid tracks  │  │ Used in: Hardfloor,        │                 │
│  │                            │  │ Some Aphex Twin            │                 │
│  └────────────────────────────┘  └────────────────────────────┘                 │
│                                                                                  │
│  NOTE: Original 303 square wave is NOT a perfect 50% duty cycle.                 │
│  It's slightly asymmetric, adding subtle harmonic character.                     │
│  Consider adding a "303 Square" option with ~48% pulse width.                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.10 Complete 303 Synth Engine

The tracker should include a **dedicated TB303 synth type** in the instrument editor:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TB-303 SYNTH ENGINE                                                    [ACID!] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─ OSCILLATOR ─────────────────┐  ┌─ FILTER ────────────────────────────────┐ │
│  │                              │  │                                          │ │
│  │  Waveform:  ◉ SAW   ○ SQR   │  │  Cutoff Frequency:                       │ │
│  │                              │  │  20Hz ████████████████░░░░░░░░ 20kHz    │ │
│  │  Tuning:    █████░░░░ 0ct   │  │         ▲                                │ │
│  │             [-12 to +12]    │  │      800 Hz (current)                    │ │
│  │                              │  │                                          │ │
│  └──────────────────────────────┘  │  Resonance:                              │ │
│                                    │  0% ████████████████████░░░░ 100%        │ │
│  ┌─ ENVELOPE ───────────────────┐  │         ▲                                │ │
│  │                              │  │        75% ⚠️ (near self-osc)           │ │
│  │  Filter shape (decay only): │  │                                          │ │
│  │  ┌────────────────────────┐ │  │  Envelope Mod:                           │ │
│  │  │ ╱╲                     │ │  │  0% ██████████████░░░░░░░░░░░ 100%       │ │
│  │  │╱  ╲______              │ │  │         ▲                                │ │
│  │  └────────────────────────┘ │  │        60% (how much env opens filter)   │ │
│  │                              │  │                                          │ │
│  │  Decay:     ████████░░░ 200ms│  │  Decay:                                  │ │
│  │             [30ms - 3000ms] │  │  30ms ██████████░░░░░░░░░░░░ 3000ms      │ │
│  │                              │  │         ▲                                │ │
│  └──────────────────────────────┘  │       300ms                              │ │
│                                    │                                          │ │
│  ┌─ ACCENT ─────────────────────┐  └──────────────────────────────────────────┘ │
│  │                              │                                                │
│  │  Accent Amount:              │  ┌─ SLIDE ─────────────────────────────────┐ │
│  │  0% ████████████████░░░ 100% │  │                                          │ │
│  │         ▲                    │  │  Slide Time:                             │ │
│  │        70%                   │  │  10ms ████████░░░░░░░░░░░░░░░ 200ms     │ │
│  │                              │  │         ▲                                │ │
│  │  (boosts vol + filter env)   │  │        60ms (original 303 ~60ms)        │ │
│  │                              │  │                                          │ │
│  └──────────────────────────────┘  │  Slide Mode: ○ Linear  ◉ Exponential    │ │
│                                    │                                          │ │
│                                    └──────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─ EFFECTS (303 style) ────────────────────────────────────────────────────┐   │
│  │                                                                           │   │
│  │  [✓] Distortion    Drive: ████████░░░ 40%     Classic acid saturation    │   │
│  │  [ ] Delay         Time:  1/8       Feedback: 50%                        │   │
│  │  [ ] Reverb        Decay: 1.5s      Mix: 25%                             │   │
│  │                                                                           │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─ PRESETS ────────────────────────────────────────────────────────────────┐   │
│  │                                                                           │   │
│  │ [Classic 303] [Squelchy] [Screamer] [Deep] [Bubbly] [TB-303 Init]        │   │
│  │                                                                           │   │
│  │ [Phuture Style] [Hardfloor] [Plastikman] [AFX Acid] [Josh Wink]          │   │
│  │                                                                           │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.11 303 Effect Commands (FT2 Extended)

Add 303-specific effect commands to the tracker:

| Cmd | Effect | Parameter | Description |
|-----|--------|-----------|-------------|
| `A0x` | **Accent** | x = 0/1 | 0 = off, 1 = accent on for this row |
| `A1x` | **Slide** | x = 0/1 | 0 = off, 1 = slide to this note |
| `A2x` | **Cutoff** | x = 0-F | Set cutoff (maps to 00-FF range) |
| `A3x` | **Resonance** | x = 0-F | Set resonance |
| `A4x` | **Env Mod** | x = 0-F | Set envelope modulation amount |
| `A5x` | **Decay** | x = 0-F | Set envelope decay time |
| `A6x` | **Accent Amt** | x = 0-F | Set accent intensity |
| `A7x` | **Slide Time** | x = 0-F | Set portamento time |
| `A8x` | **Waveform** | x = 0/1 | 0 = saw, 1 = square |

**Usage Example:**
```
Row │ Note │ Eff │ Description
────┼──────┼─────┼─────────────────────────────────
00  │ C-2  │ A01 │ Accent ON
01  │ C-2  │ A28 │ Set cutoff to middle (8/F)
02  │ Eb-2 │ A11 │ Slide ON (glide to Eb)
03  │ ---  │ A2C │ Set cutoff high (C/F) during rest
04  │ G-2  │ A00 │ Accent OFF, normal note
```

### 8.12 Classic 303 Patterns

Include these as template patterns musicians can load:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CLASSIC 303 PATTERN TEMPLATES                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  PATTERN 1: "Phuture" Style (Acid Tracks)                                        │
│  ─────────────────────────────────────────                                       │
│  Row │ Note │ ACC │ SLD │ Notes                                                  │
│  00  │ C-2  │  ●  │     │ Accented root                                          │
│  01  │ ---  │     │     │ Rest                                                   │
│  02  │ C-2  │     │     │ Normal                                                 │
│  03  │ C-2  │     │  ●  │ Slide (tie)                                            │
│  04  │ Eb-2 │  ●  │  ●  │ Slide + accent                                         │
│  05  │ ---  │     │     │ Rest                                                   │
│  06  │ C-2  │     │     │                                                        │
│  07  │ ---  │     │     │                                                        │
│  08  │ G-2  │  ●  │     │ Accent                                                 │
│  09  │ G-2  │     │  ●  │ Slide                                                  │
│  0A  │ F-2  │     │  ●  │ Continue slide                                         │
│  0B  │ ---  │     │     │                                                        │
│  0C  │ C-2  │     │     │                                                        │
│  0D  │ C-2  │     │     │                                                        │
│  0E  │ Eb-2 │  ●  │     │                                                        │
│  0F  │ ---  │     │     │                                                        │
│                                                                                  │
│  PATTERN 2: "Hardfloor" Style                                                    │
│  ────────────────────────────                                                    │
│  Row │ Note │ ACC │ SLD │ CUT                                                    │
│  00  │ C-2  │  ●  │     │  30                                                    │
│  01  │ C-2  │     │     │  40                                                    │
│  02  │ C-2  │  ●  │     │  60                                                    │
│  03  │ C-2  │     │     │  80                                                    │
│  04  │ Eb-2 │  ●  │  ●  │  A0  ← Slide up with filter opening                   │
│  05  │ Eb-2 │     │     │  B0                                                    │
│  06  │ G-2  │  ●  │  ●  │  C0  ← Continue slide with accent                     │
│  07  │ G-2  │     │     │  A0                                                    │
│  08  │ C-2  │  ●  │  ●  │  80  ← Slide back down                                │
│  09  │ C-2  │     │     │  60                                                    │
│  0A  │ C-2  │     │     │  40                                                    │
│  0B  │ ---  │     │     │  30                                                    │
│  0C  │ C-3  │  ●  │     │  50  ← Octave jump, accented                          │
│  0D  │ C-3  │     │  ●  │  70                                                    │
│  0E  │ C-2  │  ●  │  ●  │  90  ← Slide back down octave                         │
│  0F  │ ---  │     │     │  40                                                    │
│                                                                                  │
│  PATTERN 3: "Minimal" (Deep Techno)                                              │
│  ──────────────────────────────────                                              │
│  Row │ Note │ ACC │ SLD │ CUT                                                    │
│  00  │ C-1  │     │     │  30  ← Low octave, closed filter                       │
│  01  │ ---  │     │     │  --                                                    │
│  02  │ C-1  │     │     │  40                                                    │
│  03  │ ---  │     │     │  --                                                    │
│  04  │ C-1  │     │     │  50                                                    │
│  05  │ ---  │     │     │  --                                                    │
│  06  │ G-1  │  ●  │     │  70  ← Subtle accent                                   │
│  07  │ ---  │     │     │  50                                                    │
│  (repeat with subtle variations)                                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.13 TB-303 Implementation (Tone.js)

Complete Tone.js implementation of the 303:

```typescript
import * as Tone from 'tone';

interface TB303Options {
  waveform: 'sawtooth' | 'square';
  cutoff: number;           // 200-20000 Hz
  resonance: number;        // 0-1 (self-oscillates ~0.9+)
  envMod: number;           // 0-1 (envelope modulation amount)
  decay: number;            // 0.03-3 seconds
  accentAmount: number;     // 0-1
  slideTime: number;        // 0.01-0.2 seconds
}

class TB303Synth {
  private oscillator: Tone.Oscillator;
  private filter: Tone.Filter;
  private filterEnv: Tone.Envelope;
  private vca: Tone.Gain;
  private vcaEnv: Tone.Envelope;
  private output: Tone.Gain;

  private options: TB303Options;
  private currentNote: string | null = null;
  private isPlaying: boolean = false;

  constructor(options: Partial<TB303Options> = {}) {
    this.options = {
      waveform: 'sawtooth',
      cutoff: 800,
      resonance: 0.6,
      envMod: 0.5,
      decay: 0.2,
      accentAmount: 0.7,
      slideTime: 0.06,
      ...options
    };

    // Create oscillator
    this.oscillator = new Tone.Oscillator({
      type: this.options.waveform,
      frequency: 'C2'
    });

    // 303 filter: approximate 18dB with 24dB + adjusted resonance
    this.filter = new Tone.Filter({
      type: 'lowpass',
      frequency: this.options.cutoff,
      Q: this.resonanceToQ(this.options.resonance),
      rolloff: -24  // Use -24 as base, adjust with Q
    });

    // Filter envelope (decay only, instant attack)
    this.filterEnv = new Tone.Envelope({
      attack: 0.003,   // 3ms attack (essentially instant)
      decay: this.options.decay,
      sustain: 0,
      release: this.options.decay * 0.5,
      attackCurve: 'exponential',
      decayCurve: 'exponential'
    });

    // VCA envelope
    this.vcaEnv = new Tone.Envelope({
      attack: 0.003,
      decay: this.options.decay * 1.2,
      sustain: 0,
      release: this.options.decay,
      attackCurve: 'exponential',
      decayCurve: 'exponential'
    });

    // VCA
    this.vca = new Tone.Gain(0);

    // Output gain
    this.output = new Tone.Gain(0.7);

    // Connect signal chain
    this.oscillator.connect(this.filter);
    this.filter.connect(this.vca);
    this.vca.connect(this.output);

    // Connect filter envelope to filter frequency
    this.filterEnv.connect(this.filter.frequency);

    // Connect VCA envelope to VCA gain
    this.vcaEnv.connect(this.vca.gain);

    // Scale filter envelope by envelope mod amount
    this.updateFilterEnvScale();

    // Start oscillator
    this.oscillator.start();
  }

  private resonanceToQ(resonance: number): number {
    // Map 0-1 resonance to 303-like Q curve
    // Q gets exponentially higher as resonance increases
    // Self-oscillation around 0.9-1.0
    const minQ = 0.5;
    const maxQ = 30;  // High enough for self-oscillation
    return minQ + (maxQ - minQ) * Math.pow(resonance, 2);
  }

  private updateFilterEnvScale(): void {
    // Scale filter envelope based on envMod
    // envMod determines how many octaves the filter sweeps
    const octaves = this.options.envMod * 4;  // 0-4 octaves

    // Disconnect and reconnect with new scaling
    this.filterEnv.disconnect();

    const envScale = new Tone.Gain(this.options.cutoff * (Math.pow(2, octaves) - 1));
    this.filterEnv.connect(envScale);
    envScale.connect(this.filter.frequency);
  }

  triggerNote(
    note: string,
    time: number = Tone.now(),
    accent: boolean = false,
    slide: boolean = false
  ): void {
    const noteFreq = Tone.Frequency(note).toFrequency();

    if (slide && this.isPlaying && this.currentNote) {
      // SLIDE: Glide to new note without retriggering envelope
      this.oscillator.frequency.rampTo(noteFreq, this.options.slideTime, time);
    } else {
      // NORMAL NOTE: Set frequency and trigger envelopes
      this.oscillator.frequency.setValueAtTime(noteFreq, time);

      // Apply accent modifications
      if (accent) {
        // Boost filter envelope
        const accentedDecay = this.options.decay * (1 + this.options.accentAmount * 0.5);
        this.filterEnv.decay = accentedDecay;
        this.vcaEnv.decay = accentedDecay * 1.2;

        // Boost envelope modulation
        const accentedEnvMod = Math.min(1, this.options.envMod * (1 + this.options.accentAmount));
        this.updateFilterEnvScaleWithMod(accentedEnvMod);

        // Boost VCA
        this.output.gain.setValueAtTime(0.7 + (0.3 * this.options.accentAmount), time);
      } else {
        // Normal note values
        this.filterEnv.decay = this.options.decay;
        this.vcaEnv.decay = this.options.decay * 1.2;
        this.updateFilterEnvScaleWithMod(this.options.envMod);
        this.output.gain.setValueAtTime(0.7, time);
      }

      // Trigger envelopes
      this.filterEnv.triggerAttack(time);
      this.vcaEnv.triggerAttack(time);
    }

    this.currentNote = note;
    this.isPlaying = true;
  }

  releaseNote(time: number = Tone.now()): void {
    this.filterEnv.triggerRelease(time);
    this.vcaEnv.triggerRelease(time);
    this.isPlaying = false;
    this.currentNote = null;
  }

  private updateFilterEnvScaleWithMod(envMod: number): void {
    const octaves = envMod * 4;
    // Update envelope scaling...
  }

  // Parameter setters
  set cutoff(freq: number) {
    this.options.cutoff = freq;
    this.filter.frequency.value = freq;
  }

  set resonance(res: number) {
    this.options.resonance = res;
    this.filter.Q.value = this.resonanceToQ(res);
  }

  set envMod(mod: number) {
    this.options.envMod = mod;
    this.updateFilterEnvScale();
  }

  set decay(time: number) {
    this.options.decay = time;
    this.filterEnv.decay = time;
    this.vcaEnv.decay = time * 1.2;
  }

  set waveform(wave: 'sawtooth' | 'square') {
    this.options.waveform = wave;
    this.oscillator.type = wave;
  }

  connect(destination: Tone.InputNode): this {
    this.output.connect(destination);
    return this;
  }

  disconnect(): this {
    this.output.disconnect();
    return this;
  }

  dispose(): void {
    this.oscillator.dispose();
    this.filter.dispose();
    this.filterEnv.dispose();
    this.vca.dispose();
    this.vcaEnv.dispose();
    this.output.dispose();
  }
}

// Export for use in tracker
export { TB303Synth, TB303Options };
```

### 8.14 303 Presets (Additional)

Add these to the factory preset library:

```json
[
  {
    "id": "303-classic",
    "name": "TB-303 Classic",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 800,
      "resonance": 0.65,
      "envMod": 0.6,
      "decay": 0.2,
      "accentAmount": 0.7,
      "slideTime": 0.06
    },
    "tags": ["303", "acid", "classic", "techno"]
  },
  {
    "id": "303-squelch",
    "name": "TB-303 Maximum Squelch",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 1200,
      "resonance": 0.85,
      "envMod": 0.8,
      "decay": 0.35,
      "accentAmount": 0.9,
      "slideTime": 0.06
    },
    "tags": ["303", "acid", "squelchy", "screaming"]
  },
  {
    "id": "303-deep",
    "name": "TB-303 Deep & Subtle",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 400,
      "resonance": 0.4,
      "envMod": 0.3,
      "decay": 0.4,
      "accentAmount": 0.5,
      "slideTime": 0.08
    },
    "tags": ["303", "deep", "minimal", "techno"]
  },
  {
    "id": "303-square",
    "name": "TB-303 Square Wave",
    "type": "TB303",
    "options": {
      "waveform": "square",
      "cutoff": 600,
      "resonance": 0.7,
      "envMod": 0.65,
      "decay": 0.25,
      "accentAmount": 0.7,
      "slideTime": 0.06
    },
    "tags": ["303", "square", "hollow", "woody"]
  },
  {
    "id": "303-screamer",
    "name": "TB-303 Screamer",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 2000,
      "resonance": 0.92,
      "envMod": 0.95,
      "decay": 0.5,
      "accentAmount": 1.0,
      "slideTime": 0.04
    },
    "effects": [
      { "type": "Distortion", "options": { "distortion": 0.5, "wet": 0.6 } }
    ],
    "tags": ["303", "hard", "distorted", "aggressive"]
  },
  {
    "id": "303-bubbly",
    "name": "TB-303 Bubbly",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 1000,
      "resonance": 0.75,
      "envMod": 0.7,
      "decay": 0.08,
      "accentAmount": 0.6,
      "slideTime": 0.05
    },
    "tags": ["303", "bubbly", "fast", "house"]
  },
  {
    "id": "303-self-osc",
    "name": "TB-303 Self-Oscillating",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 1500,
      "resonance": 0.98,
      "envMod": 0.5,
      "decay": 0.3,
      "accentAmount": 0.6,
      "slideTime": 0.06
    },
    "tags": ["303", "self-osc", "experimental", "whistling"]
  },
  {
    "id": "303-plastikman",
    "name": "303 Plastikman Style",
    "type": "TB303",
    "options": {
      "waveform": "sawtooth",
      "cutoff": 600,
      "resonance": 0.55,
      "envMod": 0.45,
      "decay": 0.35,
      "accentAmount": 0.5,
      "slideTime": 0.07
    },
    "tags": ["303", "minimal", "plastikman", "deep"]
  }
]
```

---

## Part 9: Keyboard Shortcuts (FT2 Standard)

### 7.1 Global Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Stop |
| `Enter` | Play from current row |
| `Ctrl+Enter` | Play pattern from start |
| `Right Ctrl` | Play pattern (hold to play) |
| `Esc` | Stop |
| `F1-F7` | Set octave 1-7 |
| `F9` | Jump to row 00 |
| `F10` | Jump to row 10 (16) |
| `F11` | Jump to row 20 (32) |
| `F12` | Jump to row 30 (48) |

### 7.2 Pattern Editor Shortcuts

| Key | Action |
|-----|--------|
| `Arrow Keys` | Navigate cursor |
| `Tab` | Next channel |
| `Shift+Tab` | Previous channel |
| `Page Up/Down` | Jump 16 rows |
| `Ctrl+Page Up/Down` | Previous/next pattern |
| `Home` | Go to row 0 |
| `End` | Go to last row |
| `Insert` | Insert row (push down) |
| `Backspace` | Delete row (pull up) |
| `Delete` | Clear current field |

### 7.3 Block Operations (FT2 Style)

| Key | Action |
|-----|--------|
| `Alt+B` | Mark block begin |
| `Alt+E` | Mark block end |
| `Alt+C` | Copy block |
| `Alt+P` | Paste block |
| `Alt+X` | Cut block |
| `Alt+Z` | Unmark block |
| `Alt+U` | Unmark block |
| `Alt+I` | Insert block |
| `Alt+D` | Delete block in selection |
| `Alt+R` | Raise notes in block |
| `Alt+F` | Lower notes in block |
| `Alt+Q` | Transpose block up |
| `Alt+A` | Transpose block down |
| `Alt+S` | Set instrument in block |
| `Alt+V` | Set volume in block |

### 7.4 Instrument/Sample Shortcuts

| Key | Action |
|-----|--------|
| `F3` | Open instrument editor (cut to sample) |
| `F4` | Open instrument editor (copy to sample) |
| `Numpad +` | Next instrument |
| `Numpad -` | Previous instrument |
| `Ctrl+Numpad +` | Next sample |
| `Ctrl+Numpad -` | Previous sample |

### 7.5 Note Entry (FT2 Layout)

```
 2 3   5 6 7   9 0   =
Q W E R T Y U I O P [ ]   ← Upper octave
 S D   G H J   L ;
Z X C V B N M , . /       ← Lower octave

A = Note off (===)
` = Note off (===)
1 = Note off (===)
```

---

## Part 8: Technical Implementation Notes

### 8.1 State Structure

```typescript
interface Instrument {
  id: number;                    // 01-FF
  name: string;                  // User-given name
  icon: string;                  // Emoji or icon
  type: SynthType;              // Which Tone.js synth

  // Simplified parameters (mapped to Tone.js internally)
  oscillator: {
    waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
    detune: number;             // -100 to +100 cents
    octave: number;             // -2 to +2
  };

  envelope: {
    attack: number;             // 0-2000 ms
    decay: number;              // 0-2000 ms
    sustain: number;            // 0-100 %
    release: number;            // 0-5000 ms
  };

  filter: {
    enabled: boolean;
    type: 'lowpass' | 'highpass' | 'bandpass';
    cutoff: number;             // 20-20000 Hz
    resonance: number;          // 0-100 %
  };

  effects: Effect[];            // Chain of effects

  // For samplers
  samples?: Record<string, string>;  // Note -> URL mapping
}

interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}
```

### 8.2 Parameter Mapping (User → Tone.js)

```typescript
// User-friendly → Tone.js translation
function mapEnvelopeToTone(envelope: UserEnvelope): Tone.EnvelopeOptions {
  return {
    attack: envelope.attack / 1000,      // ms → seconds
    decay: envelope.decay / 1000,
    sustain: envelope.sustain / 100,     // % → 0-1
    release: envelope.release / 1000,
  };
}

function mapFilterToTone(filter: UserFilter): Tone.FilterOptions {
  return {
    type: filter.type,
    frequency: filter.cutoff,
    Q: filter.resonance * 0.15,          // Scale to reasonable Q range
  };
}
```

### 8.3 Preset System

```typescript
interface Preset {
  name: string;
  category: 'bass' | 'keys' | 'drums' | 'brass' | 'strings' | 'fx';
  tags: string[];               // For search
  instrument: Partial<Instrument>;
  author?: string;
  favorite?: boolean;
}

// Example preset
const fatBassPreset: Preset = {
  name: "Fat Bass",
  category: "bass",
  tags: ["sub", "heavy", "electronic"],
  instrument: {
    type: 'MonoSynth',
    oscillator: { waveform: 'sawtooth', detune: 0, octave: -1 },
    envelope: { attack: 10, decay: 200, sustain: 80, release: 100 },
    filter: { enabled: true, type: 'lowpass', cutoff: 800, resonance: 30 },
    effects: [
      { type: 'distortion', enabled: true, params: { drive: 40 } }
    ]
  }
};
```

---

## Part 9: Implementation Priority

### Phase 1: Core Tracker
1. Pattern editor with FT2 column layout (Note/Inst/Vol/Eff)
2. Standard FT2 keyboard navigation
3. Hex effect entry
4. Pattern sequence/order list
5. Play/stop with Tone.js Transport

### Phase 2: Sound Engine
1. Tone.js synth integration
2. Note triggering from tracker rows
3. All FT2 effect commands mapped to Tone.js
4. Instrument volume and panning
5. Speed/BPM control (Fxx command)

### Phase 3: Instrument Editor
1. Visual synth parameter editor (F3 to open)
2. Oscillator/waveform selection
3. ADSR envelope with drag points
4. Filter section
5. Per-instrument effect chain

### Phase 4: Export System
1. Export full song as .song.json
2. Export sound effects as .sfx.json
3. Export instrument presets as .inst.json
4. Bundled Tone.js player library
5. BBS door integration examples

### Phase 5: Polish
1. Sample/wavetable import
2. Preset library (30+ synths, drums)
3. Block operations (Alt+B/E/C/P/X)
4. Undo/redo
5. Save/load projects

---

## Summary

This plan provides:

1. **Authentic FT2 workflow** - Standard hex effects, keyboard layout, block operations
2. **Tone.js synthesis** - Modern web audio with visual instrument editor
3. **BBS door export** - Standalone JSON + player library
4. **Visual where needed** - Instrument params (oscillator, ADSR, filter, effects)
5. **Hex where familiar** - Effect column uses standard FT2 commands

The tracker stays true to FastTracker II. The instrument editor adds visual controls only for Tone.js-specific parameters that don't exist in classic trackers (FM synthesis, filter envelopes, etc.).
