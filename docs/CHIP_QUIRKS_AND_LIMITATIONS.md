# Chip Quirks and Limitations Guide

**Date:** 2026-02-07
**Purpose:** Comprehensive reference for all chip types in DEViLBOX

---

## 📋 Table of Contents

1. [Furnace Chips (WASM Emulation)](#furnace-chips)
2. [MAME Chips (Standalone Emulation)](#mame-chips)
3. [Export Format Compatibility](#export-format-compatibility)
4. [Macro Support Matrix](#macro-support-matrix)
5. [Best Practices](#best-practices)

---

## 🎹 Furnace Chips (WASM Emulation)

Full Furnace tracker compatibility with 113 chip types via WASM emulation.

### FM Chips

#### YM2612 (OPN2) - Sega Genesis/Mega Drive
**Voices:** 6 FM channels
**Operators:** 4 per voice
**Capabilities:**
- ✅ FM synthesis with 8 algorithms
- ✅ SSG-EG envelope
- ✅ LFO (global)
- ✅ DAC channel (channel 6)

**Export Compatibility:**
- ✅ VGM - Full support
- ✅ GYM - Native format
- ❌ NSF, GBS, SPC - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch, Panning
- Algorithm, Feedback, FMS, AMS
- Per-operator: TL, AR, DR, SL, RR, MULT, DT, SSG

**Known Quirks:**
- Channel 6 can be switched to DAC mode (disables FM)
- LFO is global (affects all channels)
- Phase reset is imprecise (timing-dependent)

**Best Practices:**
- Use Algorithm 7 for bass (all modulators → carrier)
- TL operator levels: Lower = louder (inverted)
- Velocity controls carrier TL, not all operators

---

#### YM2151 (OPM) - Arcade, X68000
**Voices:** 8 FM channels
**Operators:** 4 per voice
**Capabilities:**
- ✅ FM synthesis with 8 algorithms
- ✅ Per-channel LFO
- ✅ Noise generator (channel 8)
- ✅ Stereo panning

**Export Compatibility:**
- ✅ VGM - Full support
- ✅ ZSM - Native format (Commander X16)
- ❌ GYM, NSF, GBS, SPC - Wrong platform

**Macros Supported:**
- Same as YM2612 plus per-channel LFO control

**Known Quirks:**
- More flexible LFO than OPN2 (per-channel)
- Noise only on channel 8
- CT1/CT2 output pins (rarely used)

**Best Practices:**
- Use for arcade-style FM sounds
- LFO can create vibrato/tremolo per channel
- Algorithm 4 good for electric piano

---

#### YMF262 (OPL3) - Sound Blaster Pro 2
**Voices:** 18 voices (9 × 2 channels)
**Operators:** 2 or 4 per voice
**Capabilities:**
- ✅ 2-op or 4-op FM
- ✅ Percussion mode (5 rhythm channels)
- ✅ Stereo output
- ✅ 4 waveforms per operator

**Export Compatibility:**
- ✅ VGM - Full support
- ❌ All other formats - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch, Panning
- Algorithm (limited), Feedback
- Per-operator: TL, AR, DR, SL, RR, MULT, Waveform

**Known Quirks:**
- 4-op mode uses pairs of channels
- Percussion mode disables 5 channels
- Different algorithm numbering than OPN

**Best Practices:**
- Use percussion mode for drums
- 4-op mode for complex timbres
- Waveform variation adds character

---

### PSG Chips

#### SN76489 (PSG) - Genesis, SMS, BBC Micro
**Voices:** 3 square waves + 1 noise
**Capabilities:**
- ✅ Square wave oscillators
- ✅ Periodic/white noise
- ✅ Volume control per channel
- ❌ No hardware panning (mono)

**Export Compatibility:**
- ✅ VGM - Full support
- ✅ GYM - Paired with YM2612
- ❌ NSF, GBS, SPC - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch
- Duty (limited - noise mode only)

**Known Quirks:**
- Noise channel tapped from tone 3 (periodic mode)
- No duty cycle control (always 50%)
- Volume is 4-bit (16 levels)

**Best Practices:**
- Use periodic noise for bass drums
- White noise for hi-hats/cymbals
- Arpeggio macros for chords

---

#### AY-3-8910 - MSX, ZX Spectrum, Atari ST
**Voices:** 3 square waves + 1 noise
**Capabilities:**
- ✅ Square wave oscillators
- ✅ Noise generator
- ✅ Hardware envelope (1 shared)
- ✅ Mixer (tone+noise per channel)

**Export Compatibility:**
- ✅ VGM - Full support
- ❌ All other formats - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch
- Duty (noise/tone mix), Envelope

**Known Quirks:**
- Only 1 hardware envelope (shared)
- Envelope shapes: 16 patterns
- Noise is tapped from oscillator 1

**Best Practices:**
- Use hardware envelope for percussion
- Mix tone+noise for texture
- Envelope macro for dynamic sounds

---

### Nintendo Chips

#### NES APU (2A03)
**Voices:** 2 pulse + 1 triangle + 1 noise + 1 DMC
**Capabilities:**
- ✅ Pulse waves with 4 duty cycles
- ✅ Triangle wave (bass)
- ✅ Noise (percussion)
- ✅ DMC sample playback

**Export Compatibility:**
- ✅ VGM - Full support
- ✅ NSF - Native format
- ❌ GYM, GBS, SPC - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch, Duty
- Phase Reset (important for NES!)

**Known Quirks:**
- **Volume envelopes critical** - NES has no ADSR
- Triangle has no volume control (on/off only)
- DMC conflicts with controller reads (timing)
- Phase reset needed for consistent attacks

**Best Practices:**
- **Always use volume macros** for envelope
- Duty cycle macros for PWM effects
- Triangle for bass lines
- Noise + short volume envelope for drums

---

#### Game Boy DMG
**Voices:** 2 pulse + 1 wave + 1 noise
**Capabilities:**
- ✅ Pulse with sweep
- ✅ 32-sample wavetable
- ✅ Noise with 15/7-bit LFSR
- ✅ Stereo panning

**Export Compatibility:**
- ✅ VGM - Full support
- ✅ GBS - Native format
- ❌ NSF, GYM, SPC - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch, Duty, Panning
- Wavetable (wave channel)
- Phase Reset

**Known Quirks:**
- Wavetable updates cause clicks (update during silence)
- Volume is 4-bit (16 levels)
- Pulse sweep is mono-directional

**Best Practices:**
- Use wavetable for bass/leads
- Duty macros for vibrato effect
- Panning for stereo width
- Update wavetables during note-offs

---

### Wavetable/PCM Chips

#### PC Engine (HuC6280)
**Voices:** 6 wavetable channels
**Capabilities:**
- ✅ 32-sample wavetables
- ✅ Stereo panning
- ✅ LFO per channel
- ✅ Noise mode

**Export Compatibility:**
- ✅ VGM - Full support
- ❌ All other formats - Wrong platform

**Macros Supported:**
- Volume, Arpeggio, Pitch, Panning
- Wavetable index switching
- Phase Reset

**Known Quirks:**
- Wavetable updates cause clicks
- Shared wavetable RAM (256 samples total)
- DDA mode for PCM playback

**Best Practices:**
- Pre-load wavetables during init
- Use different waves per instrument
- LFO for vibrato/tremolo
- Noise for percussion

---

### Sample Playback (MAME Chips)

#### AICA - Dreamcast
**Voices:** 64 PCM channels
**RAM:** 2MB sample RAM
**Capabilities:**
- ✅ PCM sample playback
- ✅ ADSR envelopes
- ✅ Pitch/Amplitude LFO
- ✅ Stereo panning
- ✅ DSP effects

**Macros Supported:**
- Volume, Pitch, Panning
- ADSR parameters

**Known Quirks:**
- Requires sample data upload
- Large sample RAM (good for long samples)
- DSP is complex (16-step program)

**Best Practices:**
- Use for realistic instrument samples
- Short loops for sustained sounds
- DSP for reverb/echo effects

---

#### ES5503 DOC - Ensoniq Mirage/IIgs
**Voices:** 32 oscillators
**RAM:** 64KB wavetable RAM
**Capabilities:**
- ✅ Wavetable synthesis
- ✅ ADSR envelopes
- ✅ Stereo panning
- ✅ Oscillator sync

**Macros Supported:**
- Volume, Pitch, Panning, Wavetable

**Known Quirks:**
- Limited RAM (short samples only)
- Wavetables share RAM
- Oscillator sync for FM-like sounds

**Best Practices:**
- Use for 80s-style digital sounds
- Short wavetables (256-2048 samples)
- Sync for bell/metallic timbres

---

#### C352 - Namco System 22
**Voices:** 32 PCM channels
**RAM:** 16MB sample ROM
**Capabilities:**
- ✅ PCM playback
- ✅ ADSR envelopes
- ✅ Stereo panning
- ✅ High sample rate

**Macros Supported:**
- Volume, Pitch, Panning

**Known Quirks:**
- Very large ROM capacity
- Arcade-quality samples
- No built-in effects

**Best Practices:**
- Use for arcade game sounds
- High-quality samples possible
- Panning for stereo width

---

#### K054539 - Konami
**Voices:** 8 PCM channels
**RAM:** 8MB sample ROM
**Capabilities:**
- ✅ PCM playback
- ✅ ADSR envelopes
- ✅ Stereo panning
- ✅ Reverb effect

**Macros Supported:**
- Volume, Pitch, Panning

**Known Quirks:**
- Built-in reverb (DSP)
- Fewer voices than C352/AICA
- Used in Konami arcade games

**Best Practices:**
- Use reverb for depth
- Good for arcade drums/SFX
- Layer samples for thickness

---

### Complex/Hybrid Chips

#### SCSP - Sega Saturn
**Voices:** 32 channels
**Capabilities:**
- ✅ 4-operator FM
- ✅ PCM sample playback
- ✅ ADSR envelopes
- ✅ Pitch/Amplitude LFO
- ✅ DSP effects
- ✅ Stereo output

**RAM:** 512KB sample RAM

**Macros Supported:**
- FM: All FM macros
- PCM: Volume, Pitch, Panning

**Known Quirks:**
- Hybrid FM+PCM architecture
- Complex DSP programming
- Can mix FM and PCM voices

**Best Practices:**
- FM for leads/basses
- PCM for drums/realistic sounds
- Use DSP for reverb/chorus

---

#### YMF271 (OPX) - Yamaha
**Voices:** 12 channels
**Operators:** 4 per voice
**Capabilities:**
- ✅ 4-operator FM
- ✅ PCM playback
- ✅ ADSR envelopes
- ✅ LFO (pitch/amp)
- ✅ Reverb
- ✅ Stereo panning

**RAM:** 4MB sample ROM

**Macros Supported:**
- All FM macros + PCM macros

**Known Quirks:**
- **Fixed TL issue** (was silent, now working)
- Modulators need TL ~20 for sound
- Reverb is built-in DSP

**Best Practices:**
- Set modulator TL low (20-40)
- Carrier TL for volume control
- Use reverb for depth
- Mix FM and PCM for hybrid sounds

---

### Special Purpose Chips

#### TR-707 - Roland Drum Machine
**Voices:** 15 drum sounds
**ROM:** 128KB PCM samples
**Capabilities:**
- ✅ PCM drum samples
- ❌ No ADSR (one-shot samples)
- ❌ Limited pitch control

**Export Compatibility:**
- ❌ No export formats support TR-707

**Known Limitations:**
- **Requires ROM data** (not included)
- Cannot synthesize sounds (sample playback only)
- No real-time synthesis

**ROM Files Needed:**
- IC34+IC35: 64KB voice samples
- IC19: 32KB crash cymbal
- IC22: 32KB ride cymbal

**Status:** ⏸️ **Requires ROM dumps** (legal/licensing issues)

---

#### Speech Synthesizers

##### Votrax SC-01
**Type:** Phoneme-based speech
**Capabilities:**
- ✅ 64 phonemes
- ✅ Pitch control
- ✅ Inflection

**Known Quirks:**
- Requires phoneme sequences
- Not suitable for music (speech only)
- Used in old games for voice

##### MEA8000
**Type:** LPC speech synthesis
**Capabilities:**
- ✅ Linear Predictive Coding
- ✅ Speech frames

**Known Quirks:**
- Very robotic speech
- Complex parameter programming
- Not musical

##### TMS5220
**Type:** LPC speech (TI Speak & Spell)
**Capabilities:**
- ✅ Speech synthesis
- ✅ LPC frames

**Known Quirks:**
- Famous "Speak & Spell" sound
- Speech-only (not musical)

##### SP0250
**Type:** Phoneme-based (GI chip)
**Capabilities:**
- ✅ Allophone synthesis
- ✅ Used in Intellivision

**Known Quirks:**
- Limited phoneme set
- Arcade game speech

---

#### Sound Effects Chips

##### SN76477 - Complex Sound Generator
**Type:** Analog modeling
**Capabilities:**
- ✅ VCO (voltage-controlled oscillator)
- ✅ Noise generator
- ✅ Envelope generator
- ✅ Mixer

**Status:** 🔍 **Silent - Under investigation**

**Known Quirks:**
- Very complex parameter set
- Used in Space Invaders, Cosmic Conflict
- Requires careful initialization

---

### Virtual Analog

#### VASynth - Virtual Analog
**Voices:** 16
**Capabilities:**
- ✅ Wavetable oscillators
- ✅ ADSR envelopes
- ✅ Stereo panning
- ✅ Multiple waveforms

**Macros Supported:**
- Volume, Arpeggio, Pitch, Panning, Wavetable

**Best Practices:**
- Use for classic analog-style sounds
- Wavetable switching for timbral variety

---

## 📦 Export Format Compatibility

### VGM - Video Game Music (Universal)
**Supported Chips:** 40+ chips
**Loop Support:** ✅ Custom loop points
**Best For:** Multi-chip songs, authentic playback

**Compatible Chips:**
- ✅ OPN2, OPM, OPL3, PSG, AY, GB, NES, PCE, SCC, OPLL
- ❌ MAME chips (require MAME cores)

---

### GYM - Genesis YM2612 Music
**Supported Chips:** YM2612 + SN76489 only
**Loop Support:** ❌ No (players loop entire file)
**Best For:** Genesis/Mega Drive music

**Compatible Chips:**
- ✅ OPN2 (YM2612)
- ✅ PSG (SN76489)
- ❌ All others

---

### NSF - NES Sound Format
**Supported Chips:** NES APU only
**Loop Support:** ⚠️ Auto-loop entire song
**Best For:** NES chiptunes

**Compatible Chips:**
- ✅ NES (2A03 APU)
- ❌ All others

**Known Limitations:**
- Embedded 6502 driver
- Loops from start (no custom loop points)
- Requires rewriting driver for custom loops (complex)

---

### GBS - Game Boy Sound
**Supported Chips:** Game Boy DMG only
**Loop Support:** ⚠️ Auto-loop entire song
**Best For:** Game Boy chiptunes

**Compatible Chips:**
- ✅ GB (DMG)
- ❌ All others

**Known Limitations:**
- Embedded Z80 driver
- Loops from start (no custom loop points)
- Requires rewriting driver for custom loops (complex)

---

### SPC - SNES SPC700
**Supported Chips:** SNES only
**Loop Support:** ❌ N/A (RAM snapshot)
**Best For:** SNES music

**Compatible Chips:**
- ✅ SNES (SPC700)
- ❌ All others

**Known Limitations:**
- 64KB RAM dump (snapshot, not stream)
- Loop behavior in RAM driver (not file format)
- Not suitable for real-time composition

---

### ZSM - ZSound Music (Commander X16)
**Supported Chips:** YM2151 + VERA
**Loop Support:** ❌ No
**Best For:** X16 homebrew

**Compatible Chips:**
- ✅ OPM (YM2151)
- ✅ VERA PSG/PCM
- ❌ All others

---

### SAP - Slight Atari Player
**Supported Chips:** POKEY
**Loop Support:** ❌ No
**Best For:** Atari 8-bit music

**Compatible Chips:**
- ✅ POKEY (mapped from TIA in DEViLBOX)
- ❌ All others

---

### TIunA - Atari 2600 TIA
**Supported Chips:** TIA
**Loop Support:** ❌ No
**Best For:** Atari 2600 music

**Compatible Chips:**
- ✅ TIA (Atari 2600)
- ❌ All others

---

## 🎼 Macro Support Matrix

### Global Macros (All Chips)

| Macro | OPN2 | OPM | OPL3 | PSG | NES | GB | PCE | SCC | AY | MAME Chips |
|-------|------|-----|------|-----|-----|----|----|-----|----|-----------|
| **Volume** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Arpeggio** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Pitch** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Duty** | ❌ | ❌ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ⚠️ | Varies |
| **Wavetable** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | Varies |
| **Panning** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Phase Reset** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

⚠️ = Limited support (noise mode only for PSG/AY)

### FM-Specific Macros

| Macro | OPN2 | OPM | OPL3 | YMF271 | SCSP |
|-------|------|-----|------|--------|------|
| **Algorithm** | ✅ (0-7) | ✅ (0-7) | ⚠️ (2-op/4-op) | ✅ (0-7) | ✅ |
| **Feedback** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **FMS** | ✅ | ✅ | ❌ | ✅ | ✅ |
| **AMS** | ✅ | ✅ | ❌ | ✅ | ✅ |

### FM Operator Macros

All FM chips support per-operator macros:
- **TL** (Total Level) - Amplitude
- **MULT** (Multiplier) - Frequency ratio
- **AR** (Attack Rate)
- **DR** (Decay Rate)
- **SL** (Sustain Level)
- **RR** (Release Rate)
- **DT** (Detune)
- **SSG-EG** (SSG envelope) - OPN2 only

**Operators:** 4 per voice (Op0, Op1, Op2, Op3)

---

## 💡 Best Practices

### General Composition

1. **Choose the right chip:**
   - FM chips → Bright, metallic, bell-like sounds
   - PSG chips → Retro 8-bit, chip sounds
   - PCM chips → Realistic instruments, drums
   - Wavetable → Smooth, evolving timbres

2. **Use macros extensively:**
   - **Volume macros** for envelopes (critical for NES/GB!)
   - **Arpeggio macros** for chords and textures
   - **Pitch macros** for vibrato and portamento
   - **Duty macros** for pulse width modulation (NES/GB)

3. **Test export early:**
   - Not all chips support all export formats
   - VGM is most universal (40+ chips)
   - Platform-specific formats (NSF, GBS, GYM) are limited

### FM Synthesis Tips

1. **Algorithm selection:**
   - Algorithm 0-3: Parallel (organ-like)
   - Algorithm 4-5: Stacked (piano-like)
   - Algorithm 7: Full stack (bass, bells)

2. **Operator levels (TL):**
   - **Lower TL = Louder** (inverted scale!)
   - Modulators: 20-40 for audible FM
   - Carrier: 40-127 (velocity controls this)

3. **Envelope shaping:**
   - Fast AR for plucks, slow AR for pads
   - High DR for percussive decay
   - SL determines sustain volume
   - RR controls note tail

### PSG/Chiptune Tips

1. **Volume envelopes are critical:**
   - PSG has no built-in ADSR
   - Use volume macros to shape sound

2. **Arpeggio tricks:**
   - Fast arpeggios create "fat" chords
   - Slow arpeggios for bass lines

3. **Noise channel:**
   - Periodic noise for bass drum
   - White noise for hi-hats, cymbals
   - Short volume envelope for drums

### NES-Specific Tips

1. **Always use volume macros:**
   - NES has no ADSR
   - Volume macro = your envelope

2. **Phase reset matters:**
   - Use phase reset for consistent attacks
   - Important for percussive sounds

3. **Triangle limitations:**
   - No volume control (on/off only)
   - Good for bass lines only

4. **DMC channel:**
   - Can play samples
   - Conflicts with controller timing (lag)

### Game Boy-Specific Tips

1. **Wavetable updates:**
   - Update during silence to avoid clicks
   - Pre-load different waves

2. **Use stereo panning:**
   - GB has stereo output
   - Panning for width

3. **Volume is 4-bit:**
   - Only 16 volume levels
   - Less smooth than 8-bit chips

### Sample-Based Chips

1. **Sample quality matters:**
   - Higher sample rate = better quality
   - Balance quality vs. RAM usage

2. **Loop points:**
   - Set loop for sustained sounds
   - One-shot for drums

3. **ADSR for dynamics:**
   - Use envelopes to shape samples
   - Fast attack for drums, slow for pads

---

## 🔧 Troubleshooting

### Chip is Silent

**Common causes:**
1. ❌ **Wrong default parameters** (e.g., TL=127 = silent)
2. ❌ **Missing ROM data** (TR-707, speech chips)
3. ❌ **Incorrect initialization** (SN76477)
4. ❌ **Volume too low** (check volume macros)

**How to fix:**
- Check InstrumentFactory.ts for default patch
- Verify chip-specific parameters
- Test with known-working preset

### No Audio in Export

**Common causes:**
1. ❌ **Wrong export format** (chip not compatible)
2. ❌ **No loop point set** (some formats require it)
3. ❌ **Empty register log** (nothing recorded)

**How to fix:**
- Check export format compatibility table
- Use VGM for maximum compatibility
- Verify chip recording was enabled

### Macros Not Working

**Common causes:**
1. ❌ **Macro disabled** (check macro enabled flag)
2. ❌ **Empty macro data** (no points defined)
3. ❌ **Macro not supported** (check support matrix)

**How to fix:**
- Open MacroEditor and verify curve
- Check macro type is supported for chip
- Enable macro in instrument settings

---

## 📚 Additional Resources

### Furnace Documentation
- Full chip compatibility: FURNACE_COMPATIBILITY_PLAN.md
- 113 chip types with 100% compatibility
- All 227 dispatch commands

### MAME Chip Status
- MAME_CHIPS_BUILD_STATUS.md
- 23/24 chips working (96%)
- Known issues and fixes

### Export Formats
- LOOP_POINT_STATUS.md - Loop support per format
- FURNACE_ALL_8_FORMATS_INTEGRATED.md - Export integration

### Macro System
- MACRO_SYSTEM_TEST_STATUS.md - Testing procedures
- 452 Furnace demo files for testing
- Per-chip macro examples

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Maintainer:** DEViLBOX Development Team
