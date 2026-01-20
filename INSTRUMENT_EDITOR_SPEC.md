# Instrument Editor Specification

## Design Goal

Expose **100% of Tone.js synthesis capabilities** through visual controls. Musicians should be able to create any sound Tone.js can make, without writing code.

**Philosophy:** Every Tone.js parameter gets a knob, slider, dropdown, or visual editor. Group related parameters logically. Show signal flow visually.

---

## Part 1: Synth Engine Selection

### 1.1 Synth Type Picker

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SYNTH ENGINE                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ ∿ SYNTH    │ │ ∿ MONO     │ │ ∿∿ DUO     │ │ FM SYNTH   │           │
│  │             │ │   SYNTH    │ │    SYNTH   │ │             │           │
│  │ Basic osc + │ │ Mono with  │ │ Two layered│ │ Frequency   │           │
│  │ envelope    │ │ filter     │ │ voices     │ │ modulation  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ AM SYNTH   │ │ ⊕ PLUCK    │ │ ◊ METAL    │ │ ◯ MEMBRANE │           │
│  │             │ │   SYNTH    │ │   SYNTH    │ │   SYNTH    │           │
│  │ Amplitude   │ │ Karplus-   │ │ Inharmonic │ │ Drum       │           │
│  │ modulation  │ │ Strong     │ │ metallic   │ │ synthesis  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │ ░ NOISE    │ │ ♪ SAMPLER  │ │ ▶ PLAYER   │                           │
│  │   SYNTH    │ │             │ │             │                           │
│  │ Noise      │ │ Multi-note  │ │ Single     │                           │
│  │ generator  │ │ sampler     │ │ audio file │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
│                                                                             │
│  Selected: FM SYNTH                                                         │
│  "Two oscillators where one modulates the frequency of the other,          │
│   creating complex harmonic content. Great for bells, basses, and pads."   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 All Tone.js Synth Engines

| Engine | Tone.js Class | Description | Best For |
|--------|---------------|-------------|----------|
| **Synth** | `Tone.Synth` | Single oscillator + amplitude envelope | Simple tones, learning |
| **MonoSynth** | `Tone.MonoSynth` | Oscillator + filter + filter envelope | Bass, leads |
| **DuoSynth** | `Tone.DuoSynth` | Two MonoSynths with harmonicity control | Thick pads, layered sounds |
| **FMSynth** | `Tone.FMSynth` | Carrier + modulator FM synthesis | Bells, e-piano, bass |
| **AMSynth** | `Tone.AMSynth` | Amplitude modulation synthesis | Tremolo sounds, textures |
| **PluckSynth** | `Tone.PluckSynth` | Karplus-Strong string synthesis | Guitar, harp, plucked |
| **MetalSynth** | `Tone.MetalSynth` | Inharmonic FM for metallic sounds | Bells, cymbals, hits |
| **MembraneSynth** | `Tone.MembraneSynth` | Pitched membrane with decay | Kicks, toms, drums |
| **NoiseSynth** | `Tone.NoiseSynth` | Filtered noise generator | Hi-hats, snares, FX |
| **TB303** | Custom (see Part 12) | Authentic acid bass emulation | Acid, techno, house |
| **Sampler** | `Tone.Sampler` | Multi-sample playback instrument | Drums, realistic instruments |
| **Player** | `Tone.Player` | Single audio file playback | One-shots, loops |

---

## Part 2: Signal Flow View

### 2.1 Visual Signal Chain

Show the complete signal path as draggable/configurable blocks:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SIGNAL FLOW                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────┐ │
│  │   OSC    │───▶│  FILTER  │───▶│   AMP    │───▶│ EFFECTS  │───▶│ OUT  │ │
│  │          │    │          │    │          │    │          │    │      │ │
│  │ ∿ Saw    │    │ LP 800Hz │    │ ADSR     │    │ Reverb   │    │ -6dB │ │
│  │ +5 cent  │    │ Q: 2.0   │    │ 10/100/  │    │ Delay    │    │ Pan:0│ │
│  │          │    │          │    │ 70/300   │    │          │    │      │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────┘ │
│       │              │               │               │                     │
│    [Edit]         [Edit]          [Edit]          [Edit]                   │
│                                                                             │
│  Click any block to edit its parameters                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 FM/AM Synth Signal Flow (More Complex)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FM SYNTH SIGNAL FLOW                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODULATOR                          CARRIER                                 │
│  ┌──────────────────┐              ┌──────────────────┐                    │
│  │ ┌──────┐ ┌─────┐ │              │ ┌──────┐ ┌─────┐ │    ┌──────────┐   │
│  │ │ OSC  │─│ ENV │─┼──────────────┼▶│ OSC  │─│ ENV │─┼───▶│ EFFECTS  │──▶│
│  │ │ sine │ │ADSR │ │   mod freq   │ │ sine │ │ADSR │ │    │          │   │
│  │ └──────┘ └─────┘ │              │ └──────┘ └─────┘ │    └──────────┘   │
│  └──────────────────┘              └──────────────────┘                    │
│                                                                             │
│  Harmonicity: ████████░░ 3.0       Mod Index: ██████████░░ 10              │
│  (Modulator frequency = Carrier × Harmonicity)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Oscillator Section (Full Tone.js Options)

### 3.1 Oscillator Type Selector

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OSCILLATOR                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Type:  ○ Basic    ○ PWM    ○ Pulse    ○ Fat    ○ AM    ○ FM    ● Custom  │
│                                                                             │
│  ┌─ BASIC WAVEFORM ─────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │  │
│  │  │  ∿∿∿   │ │  ⊓⊓⊓   │ │  ╱╲╱╲  │ │  ╲╱╲╱  │ │  ▓▓▓▓  │             │  │
│  │  │  sine  │ │ square │ │sawtooth│ │triangle│ │ custom │             │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘             │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ CUSTOM PARTIALS (for custom waveform) ──────────────────────────────┐  │
│  │                                                                       │  │
│  │  Harmonic:  1    2    3    4    5    6    7    8    9   10   11  12  │  │
│  │            ████ ██░░ █░░░ ░░░░ █░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░│  │
│  │  Level:    1.0  0.5  0.25  0   0.1   0    0    0    0    0    0    0 │  │
│  │                                                                       │  │
│  │  [Saw] [Square] [Triangle] [Organ] [Brass] [Clear] [Randomize]       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Phase:     ░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░  0°                       │
│  Detune:    ░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░  0 cents    [-100 → +100] │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Advanced Oscillator Types

**Fat Oscillator** (multiple detuned voices):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FAT OSCILLATOR                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Base Waveform: [Sawtooth ▼]                                                │
│                                                                             │
│  Voices (Count): ◀ [  5  ] ▶                                               │
│  Creates multiple detuned copies of the oscillator                          │
│                                                                             │
│  Spread:  ░░░░░████████████░░░░░  40 cents                                 │
│  Total detune spread across all voices                                      │
│                                                                             │
│  ┌─ VISUAL: Voice Spread ───────────────────────────────────────────────┐  │
│  │     -40¢  -20¢   0¢   +20¢  +40¢                                     │  │
│  │       │     │     │     │     │                                       │  │
│  │       ∿     ∿     ∿     ∿     ∿                                       │  │
│  │      v1    v2    v3    v4    v5                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**PWM Oscillator** (pulse width modulation):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PWM OSCILLATOR                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ WAVEFORM PREVIEW ───────────────────────────────────────────────────┐  │
│  │  ___      ___      ___                                                │  │
│  │ |   |    |   |    |   |     Width = 50% (square)                      │  │
│  │ |   |____|   |____|   |                                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Width:  ░░░░░░░░░░████████████░░░░░░░░░░  50%                             │
│          Narrow (thin)  ←──────→  Wide (fat)                                │
│                                                                             │
│  Modulation Frequency:  ████████░░░░░░░░░░░░░░░░  0.5 Hz                   │
│  Speed of width modulation (0 = static)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**FM/AM Oscillator** (oscillator-level modulation):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FM OSCILLATOR                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Carrier Waveform:    [Sine ▼]                                              │
│  Modulator Waveform:  [Sine ▼]                                              │
│                                                                             │
│  Harmonicity:  ████████████░░░░░░░░  3.0                                   │
│  Modulator frequency = Carrier frequency × this value                       │
│  (Integer values = harmonic, decimal = inharmonic/bell-like)                │
│                                                                             │
│  Modulation Index:  ████████████████░░░░  10                               │
│  Amount of frequency modulation (higher = more harmonics)                   │
│                                                                             │
│  ┌─ SPECTRUM PREVIEW ───────────────────────────────────────────────────┐  │
│  │  ▁▃▅▇█▇▅▃▁▁▂▃▂▁▁▁▂▁                                                  │  │
│  │  Fundamental    Sidebands                                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 All Oscillator Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `type` | dropdown | sine/square/sawtooth/triangle/custom | Base waveform |
| `partials` | array editor | 0-64 harmonics | Custom waveform harmonics |
| `phase` | slider | 0-360° | Starting phase |
| `detune` | slider | -1200 to +1200 cents | Pitch offset |
| `volume` | slider | -∞ to +6 dB | Oscillator level |
| `mute` | toggle | on/off | Mute this oscillator |

**Fat oscillator additions:**
| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `count` | number | 1-8 | Number of voices |
| `spread` | slider | 0-100 cents | Detune spread |

**PWM oscillator additions:**
| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `width` | slider | 0-1 | Pulse width |
| `modulationFrequency` | slider | 0-10 Hz | PWM speed |

**FM oscillator additions:**
| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `harmonicity` | slider | 0.1-10 | Freq ratio |
| `modulationIndex` | slider | 0-100 | FM amount |
| `modulationType` | dropdown | sine/square/etc | Modulator wave |

---

## Part 4: Envelope Section (Full ADSR + Curves)

### 4.1 Visual Envelope Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AMPLITUDE ENVELOPE                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ ENVELOPE SHAPE (drag points to adjust) ─────────────────────────────┐  │
│  │                                                                       │  │
│  │  1.0 ┤        ●───────────────────●                                  │  │
│  │      │       ╱                     ╲                                  │  │
│  │      │      ╱                       ╲                                 │  │
│  │      │     ╱                         ╲                                │  │
│  │  0.5 ┤    ╱                           ╲                               │  │
│  │      │   ╱                             ╲                              │  │
│  │      │  ╱                               ╲                             │  │
│  │      │ ╱                                 ╲                            │  │
│  │  0.0 ┼●─────────────────────────────────────●                        │  │
│  │      └─┴────────┴──────────┴────────────────┴────────────────────    │  │
│  │        A        D          S                R                         │  │
│  │       10ms    100ms       70%             500ms                       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Attack:   ████░░░░░░░░░░░░░░░░  10 ms     Curve: [Linear ▼]               │
│  Decay:    ██████░░░░░░░░░░░░░░  100 ms    Curve: [Exponential ▼]          │
│  Sustain:  ██████████████░░░░░░  70%                                       │
│  Release:  ██████████░░░░░░░░░░  500 ms    Curve: [Exponential ▼]          │
│                                                                             │
│  Presets: [Pluck] [Pad] [Organ] [Perc] [Swell] [Gate]                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Envelope Curve Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ATTACK CURVE                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │   ╱    │ │   ╱──  │ │  ──╱   │ │   )    │ │   (    │ │  ╱╲    │        │
│  │  ╱     │ │  ╱     │ │    ╱   │ │  )     │ │  (     │ │ ╱  ╲   │        │
│  │ ╱      │ │ ╱      │ │   ╱    │ │ )      │ │ (      │ │╱    ╲  │        │
│  │linear  │ │exp     │ │ sine   │ │ cosine │ │bounce  │ │ripple  │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
│                                                                             │
│  Available curves: linear, exponential, sine, cosine, bounce,               │
│                    ripple, step, custom array                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 All Envelope Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `attack` | slider + number | 0-10s | Attack time |
| `decay` | slider + number | 0-10s | Decay time |
| `sustain` | slider | 0-1 | Sustain level |
| `release` | slider + number | 0-10s | Release time |
| `attackCurve` | dropdown | linear/exponential/sine/cosine/bounce/ripple/step | Attack shape |
| `decayCurve` | dropdown | linear/exponential | Decay shape |
| `releaseCurve` | dropdown | linear/exponential | Release shape |

---

## Part 5: Filter Section (Full Tone.js Filter)

### 5.1 Filter Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILTER                                                          [Enabled] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Type:                                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │  ╱‾‾   │ │   ‾‾╲  │ │  ╱‾╲   │ │  ╲__╱  │ │  ╱‾    │ │   ‾╲   │        │
│  │ ╱      │ │      ╲  │ │ ╱  ╲  │ │        │ │ ╱      │ │     ╲  │        │
│  │lowpass │ │highpass│ │bandpass│ │ notch  │ │lowshelf│ │highshelf│       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
│                                                                             │
│  ┌────────┐ ┌────────┐                                                     │
│  │  ╱‾╲   │ │  ╲_╱   │                                                     │
│  │ ╱   ╲  │ │        │                                                     │
│  │peaking │ │allpass │                                                     │
│  └────────┘ └────────┘                                                     │
│                                                                             │
│  ┌─ FREQUENCY RESPONSE ─────────────────────────────────────────────────┐  │
│  │  +12dB ┤                                                              │  │
│  │        │                    ╱‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲                         │  │
│  │   0dB ─┼───────────────────╱                 ╲─────────────────────   │  │
│  │        │                  ╱                   ╲                        │  │
│  │  -12dB ┤                 ╱                     ╲                       │  │
│  │        │                ╱                       ╲____                  │  │
│  │  -24dB ┤_______________╱                             ╲_____________   │  │
│  │        └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴───   │  │
│  │        20   50  100  200  500  1k   2k   5k  10k  20k  Hz              │  │
│  │                           ▲                                            │  │
│  │                        Cutoff                                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Frequency:  ████████████████░░░░░░░░░░░░░░░░  2000 Hz   [20 → 20000]      │
│  Q (Resonance):  ████████░░░░░░░░░░░░░░░░░░░░  2.0       [0.1 → 20]        │
│  Gain:  ░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░  0 dB       [-24 → +24]       │
│  Rolloff:  ○ -12dB  ● -24dB  ○ -48dB  ○ -96dB  (per octave)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Filter Envelope

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILTER ENVELOPE                                                 [Enabled] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ FILTER SWEEP ───────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  20kHz ┤           ●                                                  │  │
│  │        │          ╱ ╲                                                 │  │
│  │   1kHz ┤         ╱   ╲─────────────●                                  │  │
│  │        │        ╱                   ╲                                 │  │
│  │  100Hz ┤───────●                     ╲                                │  │
│  │        │                              ╲                               │  │
│  │   20Hz ┤                               ●                              │  │
│  │        └─────┴───────┴───────────────────┴────────────────────────   │  │
│  │              A       D        S          R                            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Attack:   ████░░░░░░░░░░░░░░░░  50 ms                                     │
│  Decay:    ████████░░░░░░░░░░░░  300 ms                                    │
│  Sustain:  ██████████████░░░░░░  70%                                       │
│  Release:  ██████████░░░░░░░░░░  500 ms                                    │
│                                                                             │
│  Base Frequency:  ████░░░░░░░░░░░░░░░░░░░░░░░░  100 Hz                     │
│  (Starting frequency before envelope)                                       │
│                                                                             │
│  Octaves:  ████████████░░░░░░░░░░░░░░░░░░░░░░  4                           │
│  (How many octaves the envelope sweeps)                                     │
│                                                                             │
│  Exponent:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░  2                           │
│  (Curve shape: 1=linear, 2=exponential)                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 All Filter Parameters

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `type` | dropdown | lowpass/highpass/bandpass/notch/lowshelf/highshelf/peaking/allpass | Filter type |
| `frequency` | slider | 20-20000 Hz | Cutoff frequency |
| `Q` | slider | 0.1-20 | Resonance/quality factor |
| `gain` | slider | -24 to +24 dB | Boost/cut (shelf/peak only) |
| `rolloff` | dropdown | -12/-24/-48/-96 dB/oct | Slope steepness |

**Filter envelope:**
| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `attack` | slider | 0-10s | Envelope attack |
| `decay` | slider | 0-10s | Envelope decay |
| `sustain` | slider | 0-1 | Envelope sustain |
| `release` | slider | 0-10s | Envelope release |
| `baseFrequency` | slider | 20-20000 Hz | Starting freq |
| `octaves` | slider | 0-10 | Sweep range |
| `exponent` | slider | 1-5 | Curve shape |

---

## Part 6: Synth-Specific Parameters

### 6.1 FMSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FM SYNTHESIS                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ MODULATOR ──────────────────────┐  ┌─ CARRIER ──────────────────────┐  │
│  │                                  │  │                                │  │
│  │  Waveform: [Sine ▼]              │  │  Waveform: [Sine ▼]            │  │
│  │                                  │  │                                │  │
│  │  ┌─ Envelope ─────────────────┐  │  │  ┌─ Envelope ─────────────────┐│  │
│  │  │ A: ██░░  D: ████  S: ████  │  │  │  │ A: █░░░  D: ██░░  S: ██░░  ││  │
│  │  │ R: ██░░                    │  │  │  │ R: ████                    ││  │
│  │  └────────────────────────────┘  │  │  └────────────────────────────┘│  │
│  │                                  │  │                                │  │
│  │  Volume:  ████████░░░░  0 dB     │  │  Volume:  ████████░░░░  0 dB   │  │
│  │                                  │  │                                │  │
│  └──────────────────────────────────┘  └────────────────────────────────┘  │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Harmonicity:  ████████████░░░░░░░░░░░░░░░░░░░░  3.0                       │
│  Ratio of modulator frequency to carrier frequency                          │
│  Common values: 1 (unison), 2 (octave), 3 (fifth+octave), 0.5 (sub)        │
│                                                                             │
│  Modulation Index:  ████████████████░░░░░░░░░░░░  10                       │
│  Amount of frequency modulation applied                                     │
│  Low (0-2): subtle, High (10+): harsh/metallic                              │
│                                                                             │
│  FM Presets: [Electric Piano] [DX Bass] [Bell] [Organ] [Metallic]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 DuoSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DUO SYNTH (Two Layered Voices)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ VOICE 0 ────────────────────────┐  ┌─ VOICE 1 ────────────────────────┐│
│  │                                  │  │                                  ││
│  │  Oscillator: [Sawtooth ▼]        │  │  Oscillator: [Square ▼]          ││
│  │                                  │  │                                  ││
│  │  Filter:                         │  │  Filter:                         ││
│  │  Cutoff:  ████████████░░  2kHz   │  │  Cutoff:  ██████░░░░░░  800Hz    ││
│  │  Q:       ████░░░░░░░░░░  2.0    │  │  Q:       ██████░░░░░░  4.0      ││
│  │                                  │  │                                  ││
│  │  Envelope (Amp):                 │  │  Envelope (Amp):                 ││
│  │  A: █░░░  D: ██░░  S: ████       │  │  A: ███░  D: ████  S: ████       ││
│  │  R: ████                         │  │  R: ██████                       ││
│  │                                  │  │                                  ││
│  │  Volume:  ████████░░░░  -6 dB    │  │  Volume:  ████████░░░░  -6 dB    ││
│  │                                  │  │                                  ││
│  └──────────────────────────────────┘  └──────────────────────────────────┘│
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Harmonicity:  ████████████████░░░░░░░░░░░░░░░░  2.0                       │
│  Frequency ratio between voice 0 and voice 1                                │
│  1 = unison, 2 = octave apart, 1.5 = fifth apart                           │
│                                                                             │
│  Vibrato:                                                                   │
│  Rate:   ████████░░░░░░░░░░░░░░░░░░░░░░  5 Hz                              │
│  Depth:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░  0.1 semitones                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 MetalSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  METAL SYNTH (Inharmonic FM)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frequency:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░  200 Hz                    │
│  Base frequency of the sound                                                │
│                                                                             │
│  Harmonicity:  ██████████████░░░░░░░░░░░░░░░░░░  5.1                       │
│  Non-integer values create inharmonic/bell-like tones                       │
│  Try: 1.4 (bell), 5.1 (metallic), 0.5 (gong)                               │
│                                                                             │
│  Modulation Index:  ████████████████████░░░░░░░░  32                       │
│  Higher values = more metallic harmonics                                    │
│                                                                             │
│  Octaves:  ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░  1.5                       │
│  Range of frequency modulation in octaves                                   │
│                                                                             │
│  Resonance:  ████████████░░░░░░░░░░░░░░░░░░░░░░  4000 Hz                   │
│  Resonant filter frequency for body                                         │
│                                                                             │
│  ┌─ ENVELOPE ───────────────────────────────────────────────────────────┐  │
│  │  A: █░░░░░░░░░  D: ████████████████  S: ░░░░░░░░░░  R: ██████████░░  │  │
│  │     1ms           1500ms               0%             1000ms          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Presets: [Hi-Hat] [Crash] [Bell] [Gong] [Chime] [Industrial]              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 MembraneSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MEMBRANE SYNTH (Drum Synthesis)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pitch:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  C2 (65 Hz)                │
│  Starting pitch of the drum hit                                             │
│                                                                             │
│  Pitch Decay:  ██████████████████░░░░░░░░░░░░░░  0.4 seconds               │
│  How long it takes for pitch to drop                                        │
│                                                                             │
│  Octaves:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░  6                         │
│  How many octaves the pitch drops                                           │
│  (Higher = more "punch", lower = more "boom")                               │
│                                                                             │
│  ┌─ AMPLITUDE ENVELOPE ─────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Attack:   █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.001s (instant)       │  │
│  │  Decay:    ████████████████████░░░░░░░░░░░░░  0.8s                    │  │
│  │  Sustain:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 (percussive)         │  │
│  │  Release:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░  0.4s                    │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Presets: [Kick] [Deep Kick] [Tom High] [Tom Low] [808 Kick] [Timpani]     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.5 PluckSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PLUCK SYNTH (Karplus-Strong)                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Attack Time:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.01s                     │
│  How quickly the pluck reaches full volume                                  │
│                                                                             │
│  Release Time:  ████████████████████░░░░░░░░░░░  1.0s                      │
│  How long the string rings out                                              │
│                                                                             │
│  Resonance:  ██████████████░░░░░░░░░░░░░░░░░░░░  0.9                       │
│  Feedback amount (0-1, higher = longer sustain)                             │
│  Warning: Values near 1.0 may cause infinite sustain                        │
│                                                                             │
│  Dampening:  ████████████░░░░░░░░░░░░░░░░░░░░░░  4000 Hz                   │
│  Lowpass filter frequency (lower = duller tone)                             │
│                                                                             │
│  ┌─ TONE CHARACTER ─────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Bright ░░░░░░░░░░░░████████████░░░░░░░░░░░░ Dull                    │  │
│  │          Steel strings    Nylon strings                               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Presets: [Acoustic Guitar] [Electric Clean] [Harp] [Banjo] [Pizzicato]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.6 NoiseSynth Parameters

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NOISE SYNTH                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Noise Type:                                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                              │
│  │ ░░░░░░░░░░ │ │ ▓▓▒▒░░▒▒▓▓ │ │ ▓▓▓▓░░░░░░ │                              │
│  │   white    │ │    pink    │ │   brown    │                              │
│  │ All freqs  │ │ -3dB/oct   │ │ -6dB/oct   │                              │
│  │ equal      │ │ (natural)  │ │ (rumbly)   │                              │
│  └────────────┘ └────────────┘ └────────────┘                              │
│                                                                             │
│  ┌─ ENVELOPE ───────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Attack:   ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.005s                  │  │
│  │  Decay:    ████████░░░░░░░░░░░░░░░░░░░░░░░░░  0.1s                    │  │
│  │  Sustain:  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0                       │  │
│  │  Release:  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.01s                   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Presets: [Hi-Hat Closed] [Hi-Hat Open] [Snare] [Crash] [Wind] [Static]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Effects Section (All Tone.js Effects)

### 7.1 Effect Chain Builder

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EFFECT CHAIN                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Signal path (drag to reorder):                                             │
│                                                                             │
│  [SYNTH]──▶┌────────┐──▶┌────────┐──▶┌────────┐──▶[OUTPUT]                 │
│            │Distort │   │ Chorus │   │ Reverb │                             │
│            │  [ON]  │   │  [ON]  │   │ [OFF]  │                             │
│            └────────┘   └────────┘   └────────┘                             │
│                 │            │            │                                  │
│              [Edit]       [Edit]       [Edit]                               │
│                                                                             │
│  [+ Add Effect ▼]                                                           │
│                                                                             │
│  ┌─ AVAILABLE EFFECTS ──────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  DISTORTION        MODULATION         DELAY/REVERB      DYNAMICS     │  │
│  │  ○ Distortion      ○ Chorus           ○ Reverb          ○ Compressor │  │
│  │  ○ BitCrusher      ○ Phaser           ○ JCReverb        ○ Limiter    │  │
│  │  ○ Chebyshev       ○ Tremolo          ○ Freeverb        ○ Gate       │  │
│  │  ○ Waveshaper      ○ Vibrato          ○ FeedbackDelay   ○ MultibandC │  │
│  │                    ○ AutoFilter       ○ PingPongDelay                 │  │
│  │  PITCH             ○ AutoPanner                         UTILITY      │  │
│  │  ○ PitchShift      ○ AutoWah          FILTER            ○ EQ3        │  │
│  │  ○ FreqShifter                        ○ Filter          ○ StereoWide │  │
│  │                                       ○ LowpassCombF    ○ MidSideSpl │  │
│  │                                       ○ FeedbackCombF                 │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Effect Parameter Panels

**Distortion:**
```
┌─────────────────────────────────────────────────────────────────┐
│  DISTORTION                                        [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Distortion:  ████████████████░░░░░░░░░░░░░░░░  0.4            │
│  Amount of clipping (0 = clean, 1 = destroyed)                  │
│                                                                 │
│  Oversample:  ○ none   ● 2x   ○ 4x                             │
│  Higher = cleaner distortion, more CPU                          │
│                                                                 │
│  Wet/Dry:  ████████████████░░░░░░░░░░░░░░░░  50%               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Reverb:**
```
┌─────────────────────────────────────────────────────────────────┐
│  REVERB                                            [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Decay:  ████████████████████░░░░░░░░░░░░░░░░  2.5 seconds     │
│  How long the reverb tail lasts                                 │
│                                                                 │
│  Pre-Delay:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.01 seconds    │
│  Time before reverb starts                                      │
│                                                                 │
│  Wet/Dry:  ████████████░░░░░░░░░░░░░░░░░░░░░░  30%             │
│                                                                 │
│  Presets: [Small Room] [Large Hall] [Cathedral] [Plate]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Chorus:**
```
┌─────────────────────────────────────────────────────────────────┐
│  CHORUS                                            [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frequency:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░  1.5 Hz        │
│  Speed of the LFO modulation                                    │
│                                                                 │
│  Delay Time:  ██████████░░░░░░░░░░░░░░░░░░░░░░░  3.5 ms        │
│  Base delay time                                                │
│                                                                 │
│  Depth:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  0.7           │
│  Amount of pitch modulation                                     │
│                                                                 │
│  Spread:  ████████████████░░░░░░░░░░░░░░░░░░░░░  180°          │
│  Stereo spread of the effect                                    │
│                                                                 │
│  Wet/Dry:  ████████████████░░░░░░░░░░░░░░░░░░░░  50%           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**FeedbackDelay:**
```
┌─────────────────────────────────────────────────────────────────┐
│  FEEDBACK DELAY                                    [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Delay Time:  ████████████████░░░░░░░░░░░░░░░░  0.25 seconds   │
│               OR sync to BPM: [1/4 note ▼]                      │
│                                                                 │
│  Feedback:  ████████████████░░░░░░░░░░░░░░░░░░  0.5            │
│  Amount fed back (0 = one echo, 0.9 = many echoes)             │
│  ⚠️ Values above 0.9 may cause runaway feedback                │
│                                                                 │
│  Max Delay:  ████████████████████░░░░░░░░░░░░░░  1 second      │
│                                                                 │
│  Wet/Dry:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░  40%           │
│                                                                 │
│  Presets: [Slapback] [Dotted 8th] [Long Echo] [Dub]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**BitCrusher:**
```
┌─────────────────────────────────────────────────────────────────┐
│  BITCRUSHER                                        [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bits:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  8              │
│  Bit depth reduction (16 = CD quality, 1 = extreme)            │
│                                                                 │
│  ┌─ BIT DEPTH EXAMPLES ─────────────────────────────────────┐  │
│  │  16 bits: Clean           8 bits: Retro game             │  │
│  │   4 bits: Lo-fi           2 bits: Extreme distortion     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Wet/Dry:  ████████████████░░░░░░░░░░░░░░░░░░░░  100%          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Compressor:**
```
┌─────────────────────────────────────────────────────────────────┐
│  COMPRESSOR                                        [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Threshold:  ████████████████░░░░░░░░░░░░░░░░░░  -24 dB        │
│  Level where compression starts                                 │
│                                                                 │
│  Ratio:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  4:1           │
│  Compression amount (1:1 = none, ∞:1 = limiter)                │
│                                                                 │
│  Attack:  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.003s        │
│  How fast compression kicks in                                  │
│                                                                 │
│  Release:  ████████████░░░░░░░░░░░░░░░░░░░░░░░░  0.25s         │
│  How fast compression releases                                  │
│                                                                 │
│  Knee:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10 dB         │
│  Soft knee width (0 = hard knee)                               │
│                                                                 │
│  ┌─ GAIN REDUCTION METER ───────────────────────────────────┐  │
│  │  0dB ████████████████████████████████████████████░░░ -6dB│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**PitchShift:**
```
┌─────────────────────────────────────────────────────────────────┐
│  PITCH SHIFT                                       [ON] [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Pitch:  ░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░  0 semitones   │
│  Range: -24 to +24 semitones                                    │
│                                                                 │
│  Quick: [-12] [-7] [-5] [0] [+5] [+7] [+12]                    │
│         (oct) (5th)(4th)    (4th)(5th)(oct)                    │
│                                                                 │
│  Window Size:  ████████████░░░░░░░░░░░░░░░░░░░░  0.1 seconds   │
│  Larger = smoother but more latency                            │
│                                                                 │
│  Delay Time:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 seconds     │
│                                                                 │
│  Feedback:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  0             │
│                                                                 │
│  Wet/Dry:  ████████████████████░░░░░░░░░░░░░░░░  100%          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 All Tone.js Effects Reference

| Effect | Key Parameters | Description |
|--------|---------------|-------------|
| **AutoFilter** | frequency, depth, baseFrequency, octaves, filter.type | LFO-controlled filter |
| **AutoPanner** | frequency, depth | LFO-controlled panning |
| **AutoWah** | baseFrequency, octaves, sensitivity, Q | Envelope-controlled filter |
| **BitCrusher** | bits | Bit depth reduction |
| **Chebyshev** | order | Waveshaping distortion |
| **Chorus** | frequency, delayTime, depth, spread | Detuned delay modulation |
| **Compressor** | threshold, ratio, attack, release, knee | Dynamics compression |
| **Convolver** | url (impulse response) | Convolution reverb |
| **Distortion** | distortion, oversample | Hard clipping |
| **EQ3** | low, mid, high, lowFrequency, highFrequency | 3-band EQ |
| **FeedbackDelay** | delayTime, feedback, maxDelay | Echo with feedback |
| **Freeverb** | roomSize, dampening | Freeverb algorithm |
| **FrequencyShifter** | frequency | Shift all frequencies |
| **Gate** | threshold, attack, release | Noise gate |
| **JCReverb** | roomSize | JC reverb algorithm |
| **Limiter** | threshold | Brick-wall limiter |
| **MidSideCompressor** | low/mid/high settings | Multiband compression |
| **Phaser** | frequency, octaves, baseFrequency, Q | Allpass filter sweep |
| **PingPongDelay** | delayTime, feedback | Stereo bouncing delay |
| **PitchShift** | pitch, windowSize, delayTime, feedback | Pitch shifting |
| **Reverb** | decay, preDelay | Simple reverb |
| **StereoWidener** | width | Stereo field manipulation |
| **Tremolo** | frequency, depth | Volume modulation |
| **Vibrato** | frequency, depth | Pitch modulation |

---

## Part 8: Sampler Configuration

### 8.1 Sample Mapping Interface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SAMPLER                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─ KEYBOARD MAPPING ───────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │    ┌──┐┌──┐   ┌──┐┌──┐┌──┐   ┌──┐┌──┐   ┌──┐┌──┐┌──┐   ┌──┐┌──┐    │  │
│  │    │C#││D#│   │F#││G#││A#│   │C#││D#│   │F#││G#││A#│   │C#││D#│    │  │
│  │  ┌─┴──┴┴──┴─┬─┴──┴┴──┴┴──┴─┬─┴──┴┴──┴─┬─┴──┴┴──┴┴──┴─┬─┴──┴┴──┴─┐  │  │
│  │  │ C1 │ D1 │ E1 │ F1 │ G1 │ A1 │ B1 │ C2 │ D2 │ E2 │ F2 │ G2 │  │  │
│  │  │kick│snre│    │hat │    │clap│    │kick│snre│    │hat │    │  │  │
│  │  │ ▓▓ │ ▓▓ │    │ ▓▓ │    │ ▓▓ │    │ ▓▓ │ ▓▓ │    │ ▓▓ │    │  │  │
│  │  └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘  │  │
│  │                                                                       │  │
│  │  Click a key to assign sample, or drag from browser below             │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ SAMPLE LIST ────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Note  │ Sample              │ Actions                                │  │
│  │  ──────┼─────────────────────┼─────────────────────                   │  │
│  │  C1    │ kick_808.wav        │ [▶] [Edit] [✕]                        │  │
│  │  D1    │ snare_tight.wav     │ [▶] [Edit] [✕]                        │  │
│  │  F#1   │ hihat_closed.wav    │ [▶] [Edit] [✕]                        │  │
│  │  A1    │ clap_909.wav        │ [▶] [Edit] [✕]                        │  │
│  │                                                                       │  │
│  │  [+ Add Sample]  [Load Preset Kit ▼]  [Clear All]                    │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ SAMPLE SETTINGS ────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Selected: C1 - kick_808.wav                                          │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ ▁▂▃▅▇█▇▆▅▄▃▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  Attack:  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.01s          │  │
│  │  Release: ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.5s           │  │
│  │                                                                       │  │
│  │  Base URL: [./samples/drums/________________]                         │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 9: Output Section

### 9.1 Master Output Controls

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OUTPUT                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Volume:  ████████████████████░░░░░░░░░░░░░░░░░░░░  0 dB    [-60 → +6]    │
│                                                                             │
│  Pan:     ░░░░░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░░░░░  0    [L ←──→ R]   │
│                                                                             │
│  ┌─ OUTPUT METER ───────────────────────────────────────────────────────┐  │
│  │  L: ████████████████████████████░░░░░░░░░░░░░░░░░░  -6 dB            │  │
│  │  R: ██████████████████████████░░░░░░░░░░░░░░░░░░░░  -8 dB            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Portamento:  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.05s             │
│  Time to glide between notes (0 = instant)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 10: Preset System

### 10.1 Preset Browser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRESETS                                                     [Save] [Copy] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Category: [All ▼]  Search: [________________]  [★ Favorites]              │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  BASS                                                                │  │
│  │  ├─ Acid Bass 303        ├─ Deep Sub           ├─ Wobble Bass       │  │
│  │  ├─ Fat Saw Bass         ├─ Pluck Bass         ├─ Reese Bass        │  │
│  │  ├─ FM Bass              ├─ Octave Bass        ├─ Distorted Bass    │  │
│  │                                                                      │  │
│  │  LEADS                                                               │  │
│  │  ├─ Classic Lead         ├─ Supersaw Lead      ├─ Sync Lead         │  │
│  │  ├─ FM Bell Lead         ├─ Portamento Lead    ├─ Detuned Lead      │  │
│  │                                                                      │  │
│  │  PADS                                                                │  │
│  │  ├─ Warm Pad             ├─ String Pad         ├─ Glass Pad         │  │
│  │  ├─ Dark Pad             ├─ Evolving Pad       ├─ Choir Pad         │  │
│  │                                                                      │  │
│  │  KEYS                                                                │  │
│  │  ├─ Electric Piano       ├─ DX Piano           ├─ Clav              │  │
│  │  ├─ Organ                ├─ Wurlitzer          ├─ Rhodes            │  │
│  │                                                                      │  │
│  │  DRUMS                                                               │  │
│  │  ├─ 808 Kit              ├─ 909 Kit            ├─ Acoustic Kit      │  │
│  │  ├─ Lo-Fi Kit            ├─ Electronic Kit     ├─ Percussion        │  │
│  │                                                                      │  │
│  │  FX / SFX                                                            │  │
│  │  ├─ Rise                 ├─ Fall               ├─ Impact            │  │
│  │  ├─ Laser                ├─ Explosion          ├─ Notification      │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Hover to preview • Click to load • Right-click for options                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Save Preset Dialog

```
┌─────────────────────────────────────────────────────────────────┐
│  SAVE PRESET                                              [x]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Name:      [Fat Acid Bass_________________]                    │
│                                                                 │
│  Category:  [Bass ▼]                                            │
│                                                                 │
│  Tags:      [acid, 303, squelchy, electronic]                   │
│             (comma-separated)                                   │
│                                                                 │
│  Author:    [Your Name____________________]                     │
│                                                                 │
│  Notes:     [Classic 303-style acid bass with____________]      │
│             [resonant filter and distortion______________]      │
│                                                                 │
│  □ Add to favorites                                             │
│                                                                 │
│                              [Cancel]  [Save]                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 11: Factory Presets (32 Instruments)

The tracker must ship with **32 production-ready instrument presets** covering modern electronic dance music styles: **Techno, House, Drum'n'Bass, Hip-Hop, and EDM**.

### 11.1 Bass Presets (12)

| # | Name | Style | Synth Type | Character |
|---|------|-------|------------|-----------|
| 01 | **808 Sub** | Hip-Hop/Trap | MembraneSynth | Deep sine sub with long decay, pitch drop |
| 02 | **Acid Bass Classic** | Techno/Acid | MonoSynth | Classic 303 saw, high resonance, squelchy |
| 03 | **Acid Bass Square** | Techno/Acid | MonoSynth | 303 square wave variant, hollow tone |
| 04 | **Acid Bass Screamer** | Hard Acid | MonoSynth + Distortion | Distorted 303, extreme resonance |
| 05 | **Acid Bass Deep** | Deep Techno | MonoSynth | Lower octave 303, subtle resonance |
| 06 | **Acid Bass Bubbly** | Acid House | MonoSynth | Fast filter decay, bubbly character |
| 07 | **Reese Bass** | DnB | DuoSynth | Two detuned saws, phasing, dark |
| 08 | **House Pluck** | House | MonoSynth | Short decay, filtered saw, punchy |
| 09 | **Wobble Bass** | Dubstep | MonoSynth + AutoFilter | LFO on filter cutoff, aggressive |
| 10 | **FM Bass** | Techno | FMSynth | Punchy FM with fast decay |
| 11 | **Hoover** | Rave/DnB | DuoSynth | Detuned pulse waves, portamento |
| 12 | **Distorted Sub** | Industrial | MonoSynth + Distortion | Sine with heavy saturation |

### 11.2 Lead Presets (8)

| # | Name | Style | Synth Type | Character |
|---|------|-------|------------|-----------|
| 09 | **Supersaw Lead** | EDM/Trance | FatOscillator | 7 voice detuned saws, bright |
| 10 | **Acid Lead** | Techno | MonoSynth | Square wave, resonant filter, glide |
| 11 | **FM Stab** | House | FMSynth | Short attack, bell-like harmonics |
| 12 | **Sync Lead** | Electro | Synth | Hard sync sound, aggressive |
| 13 | **Chip Lead** | Chiptune/EDM | Synth | Pure square, fast arpeggio-ready |
| 14 | **Trance Pluck** | Trance | PluckSynth + Delay | Bright pluck with dotted delay |
| 15 | **Detuned Lead** | DnB | DuoSynth | Two voices, slight detune, fat |
| 16 | **Filtered Lead** | Techno | MonoSynth | Filter envelope sweep, evolving |

### 11.3 Pad/Atmosphere Presets (4)

| # | Name | Style | Synth Type | Character |
|---|------|-------|------------|-----------|
| 17 | **Ambient Pad** | Ambient/House | DuoSynth + Reverb | Slow attack, lush reverb, warm |
| 18 | **Dark Pad** | Techno/DnB | AMSynth + Filter | Low-passed, evolving, ominous |
| 19 | **String Pad** | Trance | DuoSynth + Chorus | Saw-based, detuned, wide stereo |
| 20 | **Noise Sweep** | EDM | NoiseSynth + Filter | Filtered noise risers/falls |

### 11.4 Drum Presets (8)

| # | Name | Style | Synth Type | Character |
|---|------|-------|------------|-----------|
| 21 | **TR-808 Kick** | Hip-Hop/Trap | MembraneSynth | Long decay, sub-heavy, boomy |
| 22 | **TR-909 Kick** | Techno/House | MembraneSynth | Punchy, mid-focused, tight |
| 23 | **Hardcore Kick** | Gabber/Hard | MembraneSynth + Distortion | Distorted, punishing attack |
| 24 | **DnB Snare** | Drum'n'Bass | NoiseSynth + Filter | Sharp transient, tight decay |
| 25 | **Clap Stack** | House | NoiseSynth | Layered clap, reverb tail |
| 26 | **Closed Hat** | All | MetalSynth | Short, crisp, high-frequency |
| 27 | **Open Hat** | All | MetalSynth | Longer decay, sizzle |
| 28 | **Crash** | All | MetalSynth + Reverb | Long metallic decay |

### 11.5 FX/Utility Presets (4)

| # | Name | Style | Synth Type | Character |
|---|------|-------|------------|-----------|
| 29 | **Riser** | EDM | NoiseSynth + AutoFilter | White noise sweep up |
| 30 | **Downlifter** | EDM | NoiseSynth + AutoFilter | Filtered noise sweep down |
| 31 | **Impact** | All | MetalSynth + MembraneSynth | Big hit with sub thump |
| 32 | **Laser Zap** | Electro | Synth | Fast pitch drop, sci-fi |

### 11.2 Preset Implementation Details

Each preset should be fully configured with:

```json
{
  "id": 1,
  "name": "808 Sub",
  "category": "bass",
  "tags": ["808", "sub", "hip-hop", "trap", "deep"],
  "style": "Hip-Hop/Trap",

  "type": "MembraneSynth",
  "options": {
    "pitchDecay": 0.08,
    "octaves": 6,
    "oscillator": { "type": "sine" },
    "envelope": {
      "attack": 0.001,
      "decay": 0.8,
      "sustain": 0.01,
      "release": 0.5
    }
  },
  "effects": [],
  "volume": 0,

  "preview": {
    "notes": ["C1", "C1", "G1", "C1"],
    "pattern": "x--- x--- x--- x-x-"
  }
}
```

```json
{
  "id": 2,
  "name": "Acid Bass Classic",
  "category": "bass",
  "tags": ["acid", "303", "techno", "squelchy", "resonant", "saw"],
  "style": "Techno/Acid",

  "type": "MonoSynth",
  "options": {
    "oscillator": { "type": "sawtooth" },
    "envelope": {
      "attack": 0.005,
      "decay": 0.2,
      "sustain": 0.4,
      "release": 0.1
    },
    "filter": {
      "type": "lowpass",
      "frequency": 800,
      "Q": 12,
      "rolloff": -24
    },
    "filterEnvelope": {
      "attack": 0.005,
      "decay": 0.3,
      "sustain": 0.2,
      "release": 0.1,
      "baseFrequency": 200,
      "octaves": 3,
      "exponent": 2
    }
  },
  "effects": [],
  "volume": -3,

  "preview": {
    "notes": ["C2", "C2", "Eb2", "C2", "F2", "C2", "G2", "C2"],
    "pattern": "x-x- x-x- x-x- xxxx"
  }
}
```

```json
{
  "id": 3,
  "name": "Acid Bass Square",
  "category": "bass",
  "tags": ["acid", "303", "techno", "square", "hollow"],
  "style": "Techno/Acid",

  "type": "MonoSynth",
  "options": {
    "oscillator": { "type": "square" },
    "envelope": {
      "attack": 0.003,
      "decay": 0.15,
      "sustain": 0.3,
      "release": 0.08
    },
    "filter": {
      "type": "lowpass",
      "frequency": 600,
      "Q": 15,
      "rolloff": -24
    },
    "filterEnvelope": {
      "attack": 0.003,
      "decay": 0.25,
      "sustain": 0.15,
      "release": 0.08,
      "baseFrequency": 150,
      "octaves": 3.5,
      "exponent": 2
    }
  },
  "effects": [],
  "volume": -3,

  "preview": {
    "notes": ["C2", "C2", "C2", "Eb2", "C2", "C2", "G2", "F2"],
    "pattern": "x-x- x-xx x-x- x-x-"
  }
}
```

```json
{
  "id": 4,
  "name": "Acid Bass Screamer",
  "category": "bass",
  "tags": ["acid", "303", "hard", "distorted", "aggressive"],
  "style": "Hard Acid",

  "type": "MonoSynth",
  "options": {
    "oscillator": { "type": "sawtooth" },
    "envelope": {
      "attack": 0.002,
      "decay": 0.25,
      "sustain": 0.5,
      "release": 0.15
    },
    "filter": {
      "type": "lowpass",
      "frequency": 1200,
      "Q": 18,
      "rolloff": -24
    },
    "filterEnvelope": {
      "attack": 0.002,
      "decay": 0.4,
      "sustain": 0.3,
      "release": 0.1,
      "baseFrequency": 300,
      "octaves": 4,
      "exponent": 2
    }
  },
  "effects": [
    {
      "type": "Distortion",
      "options": { "distortion": 0.6, "wet": 0.7 }
    }
  ],
  "volume": -6,

  "preview": {
    "notes": ["C2", "C3", "C2", "Eb2", "C2", "G2", "C2", "C3"],
    "pattern": "x-x- x-x- xxxx x-x-"
  }
}
```

```json
{
  "id": 5,
  "name": "Acid Bass Deep",
  "category": "bass",
  "tags": ["acid", "303", "deep", "subtle", "minimal"],
  "style": "Deep Techno",

  "type": "MonoSynth",
  "options": {
    "oscillator": { "type": "sawtooth" },
    "envelope": {
      "attack": 0.01,
      "decay": 0.3,
      "sustain": 0.5,
      "release": 0.2
    },
    "filter": {
      "type": "lowpass",
      "frequency": 400,
      "Q": 6,
      "rolloff": -24
    },
    "filterEnvelope": {
      "attack": 0.01,
      "decay": 0.4,
      "sustain": 0.3,
      "release": 0.2,
      "baseFrequency": 80,
      "octaves": 2,
      "exponent": 2
    }
  },
  "effects": [],
  "volume": 0,

  "preview": {
    "notes": ["C1", "C1", "G1", "C1", "Eb1", "C1", "F1", "C1"],
    "pattern": "x--- x--- x--- x---"
  }
}
```

```json
{
  "id": 6,
  "name": "Acid Bass Bubbly",
  "category": "bass",
  "tags": ["acid", "303", "bubbly", "house", "bouncy"],
  "style": "Acid House",

  "type": "MonoSynth",
  "options": {
    "oscillator": { "type": "sawtooth" },
    "envelope": {
      "attack": 0.001,
      "decay": 0.08,
      "sustain": 0.2,
      "release": 0.05
    },
    "filter": {
      "type": "lowpass",
      "frequency": 1000,
      "Q": 14,
      "rolloff": -24
    },
    "filterEnvelope": {
      "attack": 0.001,
      "decay": 0.12,
      "sustain": 0.1,
      "release": 0.05,
      "baseFrequency": 250,
      "octaves": 3,
      "exponent": 3
    }
  },
  "effects": [],
  "volume": -3,

  "preview": {
    "notes": ["C2", "C2", "C2", "C2", "Eb2", "Eb2", "G2", "F2"],
    "pattern": "xxxx xxxx x-x- x-x-"
  }
}
```

```json
{
  "id": 9,
  "name": "Supersaw Lead",
  "category": "lead",
  "tags": ["supersaw", "trance", "edm", "big", "bright"],
  "style": "EDM/Trance",

  "type": "Synth",
  "options": {
    "oscillator": {
      "type": "fatsawtooth",
      "count": 7,
      "spread": 30
    },
    "envelope": {
      "attack": 0.01,
      "decay": 0.3,
      "sustain": 0.7,
      "release": 0.4
    }
  },
  "effects": [
    {
      "type": "Chorus",
      "options": { "frequency": 2, "depth": 0.5, "wet": 0.3 }
    },
    {
      "type": "Reverb",
      "options": { "decay": 2, "wet": 0.25 }
    }
  ],
  "volume": -6,

  "preview": {
    "notes": ["C4", "E4", "G4", "C5"],
    "pattern": "x--- x--- x--- x---"
  }
}
```

```json
{
  "id": 21,
  "name": "TR-808 Kick",
  "category": "drums",
  "tags": ["808", "kick", "hip-hop", "trap", "sub"],
  "style": "Hip-Hop/Trap",

  "type": "MembraneSynth",
  "options": {
    "pitchDecay": 0.05,
    "octaves": 8,
    "oscillator": { "type": "sine" },
    "envelope": {
      "attack": 0.001,
      "decay": 0.6,
      "sustain": 0.01,
      "release": 0.4,
      "attackCurve": "exponential"
    }
  },
  "effects": [],
  "volume": 0,

  "preview": {
    "notes": ["C1"],
    "pattern": "x--- x--- x--- x---"
  }
}
```

```json
{
  "id": 29,
  "name": "Riser",
  "category": "fx",
  "tags": ["riser", "build", "edm", "tension", "sweep"],
  "style": "EDM",

  "type": "NoiseSynth",
  "options": {
    "noise": { "type": "white" },
    "envelope": {
      "attack": 4.0,
      "decay": 0.1,
      "sustain": 1,
      "release": 0.5
    }
  },
  "effects": [
    {
      "type": "AutoFilter",
      "options": {
        "frequency": 0.1,
        "baseFrequency": 200,
        "octaves": 6,
        "filter": { "type": "lowpass", "Q": 8 },
        "wet": 1
      }
    },
    {
      "type": "Reverb",
      "options": { "decay": 3, "wet": 0.4 }
    }
  ],
  "volume": -6
}
```

### 11.3 Style Coverage

The 32 presets ensure coverage of major electronic genres:

| Genre | # Presets | Coverage |
|-------|-----------|----------|
| **Techno** | 8+ | Acid bass, kicks, leads, dark pads |
| **House** | 6+ | Pluck bass, FM stabs, claps, pads |
| **Drum'n'Bass** | 6+ | Reese bass, snares, hoover, leads |
| **Hip-Hop/Trap** | 6+ | 808 sub, 808 kick, leads |
| **EDM/Trance** | 6+ | Supersaw, risers, plucks, pads |

### 11.4 Preset Organization in UI

```
┌─────────────────────────────────────────────────────────────────┐
│  FACTORY PRESETS                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BASS (8)                                                       │
│  [808 Sub] [Acid Bass] [Reese] [House Pluck]                   │
│  [Wobble] [FM Bass] [Hoover] [Distorted Sub]                   │
│                                                                 │
│  LEAD (8)                                                       │
│  [Supersaw] [Acid Lead] [FM Stab] [Sync Lead]                  │
│  [Chip Lead] [Trance Pluck] [Detuned] [Filtered]               │
│                                                                 │
│  PAD (4)                                                        │
│  [Ambient Pad] [Dark Pad] [String Pad] [Noise Sweep]           │
│                                                                 │
│  DRUMS (8)                                                      │
│  [808 Kick] [909 Kick] [HC Kick] [DnB Snare]                   │
│  [Clap Stack] [Closed Hat] [Open Hat] [Crash]                  │
│                                                                 │
│  FX (4)                                                         │
│  [Riser] [Downlifter] [Impact] [Laser Zap]                     │
│                                                                 │
│  Filter by style: [All▼] [Techno] [House] [DnB] [Hip-Hop] [EDM]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 12: TB-303 Acid Synth Engine

The tracker includes a **dedicated TB-303 emulation** as a synth engine option. This is not just a MonoSynth preset - it's a purpose-built acid machine with all the quirks that make the 303 special.

### 12.1 TB-303 Signal Path

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TB-303 SYNTH ENGINE                                                    [ACID!] │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Signal Flow:                                                                    │
│                                                                                  │
│  ┌────────────┐    ┌────────────────────────┐    ┌──────────┐    ┌──────────┐  │
│  │ OSCILLATOR │───▶│  18dB/oct FILTER       │───▶│   VCA    │───▶│  OUTPUT  │  │
│  │            │    │                        │    │          │    │          │  │
│  │ ◉ SAW      │    │  Cutoff ────────●──────│    │  Normal  │    │  Volume  │  │
│  │ ○ SQUARE   │    │            ↑   ↑      │    │    +     │    │    +     │  │
│  │            │    │            │   │      │    │  ACCENT  │    │  Pan     │  │
│  │  Tune: 0   │    │  Resonance │   │      │    │  boost   │    │          │  │
│  └────────────┘    │  (self-osc)│   │      │    └──────────┘    └──────────┘  │
│                    │            │   │      │          ▲                        │
│                    │    ┌───────┴───┴──┐   │          │                        │
│                    │    │ FILTER ENV   │   │    ┌─────┴──────┐                 │
│                    │    │ (decay only) │   │    │ VCA ENV    │                 │
│                    │    │              │   │    │ + ACCENT   │                 │
│                    │    │ EnvMod amt   │   │    │ modifier   │                 │
│                    │    └──────────────┘   │    └────────────┘                 │
│                    └────────────────────────┘                                   │
│                                                                                  │
│  KEY DIFFERENCES FROM STANDARD SYNTH:                                            │
│  • 18dB/oct (3-pole) filter, NOT 24dB                                           │
│  • Envelope is DECAY-ONLY (3ms attack, no sustain)                              │
│  • ACCENT boosts BOTH volume AND filter envelope                                │
│  • SLIDE only works on tied notes                                               │
│  • Filter self-oscillates at high resonance                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 TB-303 Parameter Editor

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TB-303 ACID SYNTHESIZER                                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─ OSCILLATOR ──────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  Waveform:    ◉ SAWTOOTH              ○ SQUARE                            │  │
│  │                  ╱│  ╱│  ╱│              ┌──┐  ┌──┐                        │  │
│  │                 ╱ │ ╱ │ ╱ │              │  │  │  │                        │  │
│  │                ╱  │╱  │╱  │            ──┘  └──┘  └                        │  │
│  │               Rich harmonics            Hollow, woody                      │  │
│  │                                                                            │  │
│  │  Tuning:  -12 ░░░░░░░░░░░████░░░░░░░░░░░ +12  semitones                   │  │
│  │                           ▲                                                │  │
│  │                           0 (concert pitch)                                │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ FILTER (18dB/oct Lowpass) ───────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  ┌─ FREQUENCY RESPONSE ────────────────────────────────────────────────┐  │  │
│  │  │                          ╱█╲                                         │  │  │
│  │  │  0dB ═══════════════════╱███╲══════════════════════════════════════ │  │  │
│  │  │                        ╱     ╲                                       │  │  │
│  │  │ -18dB                 ╱       ╲                                      │  │  │
│  │  │ -36dB                ╱         ╲_____                                │  │  │
│  │  │        20Hz  100   500  1k  2k  5k  10k  20kHz                       │  │  │
│  │  │                         ▲                                            │  │  │
│  │  │                      Cutoff                                          │  │  │
│  │  └──────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                            │  │
│  │  Cutoff Frequency:                                                         │  │
│  │  200Hz ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 20kHz             │  │
│  │                    ▲                                                       │  │
│  │                  800 Hz                                                    │  │
│  │                                                                            │  │
│  │  Resonance:                                                                │  │
│  │  0% ████████████████████████████████░░░░░░░░░░░░░░░░░░ 100%               │  │
│  │                              ▲                                             │  │
│  │                            65%  (75%+ = near self-oscillation)            │  │
│  │                                 (90%+ = SCREAMING)                        │  │
│  │                                 (95%+ = self-oscillating sine)            │  │
│  │                                                                            │  │
│  │  ⚠️ WARNING: High resonance can be LOUD. Limiter recommended!             │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ FILTER ENVELOPE ─────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  The 303's envelope is DECAY-ONLY. Attack is instant (~3ms).              │  │
│  │                                                                            │  │
│  │  ┌─ ENVELOPE SHAPE ─────────────────────────────────────────────────────┐ │  │
│  │  │                                                                       │ │  │
│  │  │  Peak ┤   ╱╲                                                          │ │  │
│  │  │       │  ╱  ╲                                                         │ │  │
│  │  │       │ ╱    ╲                                                        │ │  │
│  │  │       │╱      ╲                                                       │ │  │
│  │  │  Base ┼────────╲______________                                        │ │  │
│  │  │       └──┴──────┴───────────────────────                              │ │  │
│  │  │          A      Decay                                                 │ │  │
│  │  │        (3ms)                                                          │ │  │
│  │  └───────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                            │  │
│  │  Envelope Modulation:  (how much envelope opens filter)                    │  │
│  │  0% ██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 100%               │  │
│  │                        ▲                                                   │  │
│  │                      60% (classic acid)                                    │  │
│  │                                                                            │  │
│  │  Decay Time:                                                               │  │
│  │  30ms ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 3000ms             │  │
│  │               ▲                                                            │  │
│  │             200ms (default 303)                                            │  │
│  │                                                                            │  │
│  │  Decay Presets: [Plucky 30ms] [Classic 200ms] [Swell 600ms] [Ambient 2s]  │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ ACCENT ──────────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  Accent Amount:  (how much accent boosts volume + filter envelope)         │  │
│  │  0% ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░ 100%               │  │
│  │                          ▲                                                 │  │
│  │                        70%                                                 │  │
│  │                                                                            │  │
│  │  When ACCENT is triggered on a note:                                       │  │
│  │  • Volume increases by up to +6dB                                          │  │
│  │  • Filter envelope peak is boosted                                         │  │
│  │  • Filter envelope decay is extended                                       │  │
│  │  = That characteristic 303 "BITE"                                          │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ SLIDE (Portamento) ──────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  Slide Time:                                                               │  │
│  │  10ms ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 200ms              │  │
│  │              ▲                                                             │  │
│  │            60ms (original 303 fixed glide time)                           │  │
│  │                                                                            │  │
│  │  Slide Curve:  ○ Linear     ◉ Exponential                                 │  │
│  │                (constant)   (natural, musical)                            │  │
│  │                                                                            │  │
│  │  NOTE: Slide only activates between TIED notes in the tracker.            │  │
│  │  Set the SLIDE flag (SLD column) on the target note.                      │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ OUTPUT ──────────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  Volume:  -∞dB ████████████████████████████░░░░░░░░░░░░░░░░░░ +6dB        │  │
│  │                                     ▲                                      │  │
│  │                                    0dB                                     │  │
│  │                                                                            │  │
│  │  [✓] Apply limiter (recommended for high resonance)                       │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ EFFECTS (Classic Acid Chain) ────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  [303]──▶[DISTORTION]──▶[DELAY]──▶[REVERB]──▶[OUT]                        │  │
│  │              │             │           │                                   │  │
│  │            [ON]          [OFF]       [OFF]                                 │  │
│  │                                                                            │  │
│  │  Distortion:                                                               │  │
│  │  Drive: ████████████████░░░░░░░░░░░░░░░░░░░░░░ 40%                        │  │
│  │  Type: ○ Soft clip  ◉ Hard clip  ○ Fuzz                                   │  │
│  │                                                                            │  │
│  │  [+ Add Effect]                                                            │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 12.3 TB-303 Presets

| # | Name | Cutoff | Resonance | Env Mod | Decay | Accent | Character |
|---|------|--------|-----------|---------|-------|--------|-----------|
| 01 | **303 Classic** | 800Hz | 65% | 60% | 200ms | 70% | The original sound |
| 02 | **303 Squelchy** | 1200Hz | 85% | 80% | 350ms | 90% | Maximum acid |
| 03 | **303 Deep** | 400Hz | 40% | 30% | 400ms | 50% | Subtle, minimal |
| 04 | **303 Square** | 600Hz | 70% | 65% | 250ms | 70% | Hollow, woody |
| 05 | **303 Screamer** | 2000Hz | 92% | 95% | 500ms | 100% | Hard acid + distortion |
| 06 | **303 Bubbly** | 1000Hz | 75% | 70% | 80ms | 60% | Fast decay, bouncy |
| 07 | **303 Self-Osc** | 1500Hz | 98% | 50% | 300ms | 60% | Whistling filter |
| 08 | **303 Plastikman** | 600Hz | 55% | 45% | 350ms | 50% | Minimal techno |

### 12.4 Tracker Integration

The TB-303 synth integrates with the tracker through dedicated columns:

| Column | Code | Range | Function |
|--------|------|-------|----------|
| **ACC** | ● / blank | On/Off | Accent flag for this row |
| **SLD** | ● / blank | On/Off | Slide to this note |
| **CUT** | 00-FF | 200Hz-20kHz | Filter cutoff (log) |
| **RES** | 00-FF | 0-100% | Resonance |
| **ENV** | 00-FF | 0-100% | Envelope mod amount |
| **DEC** | 00-FF | 30ms-3s | Decay time |

**Example Pattern:**
```
Row │ Note │ Inst │ ACC │ SLD │ CUT │ RES │
────┼──────┼──────┼─────┼─────┼─────┼─────┤
00  │ C-2  │  01  │  ●  │     │  40 │  80 │  ← Accented C
01  │ C-2  │  --  │     │     │  50 │  -- │  ← Tied note
02  │ Eb-2 │  --  │  ●  │  ●  │  70 │  -- │  ← Slide up + accent
03  │ ---  │  --  │     │     │  -- │  -- │  ← Rest
04  │ G-2  │  01  │     │     │  90 │  -- │  ← Normal note, high cutoff
05  │ G-2  │  --  │     │  ●  │  A0 │  -- │  ← Slide preparation
06  │ C-3  │  --  │  ●  │  ●  │  B0 │  90 │  ← Slide octave up + accent
```

---

## Summary

This instrument editor exposes **every Tone.js synthesis parameter** through visual controls:

### Synth Engines (12 types)
- Synth, MonoSynth, DuoSynth, FMSynth, AMSynth
- PluckSynth, MetalSynth, MembraneSynth, NoiseSynth
- **TB303** (dedicated acid bass emulation)
- Sampler, Player

### Oscillator Options
- 5 basic types + fat/PWM/FM/AM oscillators
- Custom partials editor (up to 64 harmonics)
- Phase, detune, voice count, spread

### Envelopes
- Visual drag-point ADSR editor
- 7 curve types (linear, exponential, sine, cosine, bounce, ripple, step)
- Separate amp and filter envelopes

### Filters
- 8 filter types with visual frequency response
- Full filter envelope with base frequency, octaves, exponent

### Effects (25+ types)
- Drag-and-drop effect chain
- Every effect fully parameterized
- BPM sync for delays

### Sampler
- Visual keyboard mapping
- Waveform preview
- Multi-sample support

**All without writing a single line of code.**
