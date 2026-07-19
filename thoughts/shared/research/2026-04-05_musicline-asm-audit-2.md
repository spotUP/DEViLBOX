---
date: 2026-04-05
topic: musicline-asm-deep-audit-2
tags: [musicline, asm, editor, audit, gaps]
status: final
---

# MusicLine v1.16 ASM Deep Audit #2 — Remaining Gaps

## Critical Missing Features

### 1. Multi-Resolution Waveforms (FixWaveLength)
- Waveforms stored in 5 octave variants: 256/128/64/32/16 bytes
- Higher octaves use shorter waveforms to avoid aliasing
- Type 1-5 selects resolution, type 0 = raw sample
- Wave length selection: 16/32/64/128/256 bytes
- We likely don't handle multi-resolution properly

### 2. Real-Time Waveform Visualizer (DrawVisual)
- VBlank interrupt draws actual playing waveform data
- 256x64 pixel display at screen position (368, 176)
- Reads from ch_WsRepPointer (live repeat pointer)
- Toggle between WsPara (parameters) and Visual (waveform) mode
- We have no waveform visualizer for MusicLine instruments

### 3. Block/Mark Operations (Pattern, Tune, Arpeggio)
- Mark mode with rectangular selection (bit flags in _MarkEd)
- Cut/Copy/Paste/Swap with type-tagged copy buffer
- Column-aware: can't paste notes onto effects
- Pattern block ops: full pattern or marked region
- Voice (tune) block ops: multi-channel rectangular selection
- Arpeggio block ops: same pattern
- Instrument copy/swap (no mark mode, direct copy/swap/cut)

### 4. Song Metadata (Info Window)
- 9 editable fields: Title, Author, Date, Duration, Info 1-5
- Separate window (Window6, 486x119 pixels)
- Separate from per-tune title (32 chars)

### 5. Channel Mute System
- _ChannelsOn bitfield (8 bits)
- Individual channel on/off toggles
- In 4ch mode, channels 5-8 forced off
- No solo mode — only toggle

### 6. Mono/Poly Keyboard Mode
- Mono: one note at a time on current channel
- Poly: notes auto-spread across channels 1-4 or 1-8
- Poly rotation with key-up tracking per channel

### 7. MakeTuneSmpl (Render to Sample)
- Renders entire tune to a single PCM sample
- Creates new instrument + wavesample
- Tick-by-tick software rendering

### 8. RemoveUnused Operations
- RemoveUnusedParts: scan all tunes, free unreferenced patterns
- RemoveUnusedWavesamples: scan all instruments/arps/patterns
- RemoveEqualWavesamples: merge duplicates by byte comparison

## Tune Entry Encoding (CORRECTED)

Previous understanding was approximate. Exact encoding:

Word: `HHHHHHHH LLLLLLLL` (high byte, low byte)

If low byte bit 5 = 0 (PATTERN ENTRY):
- Part number = (low_bits_6_7 << 8) | high_byte = 10-bit (0-1023)
- Transpose = (low_bits_0_4) - $10 = signed (-16 to +15)

If low byte bit 5 = 1 (COMMAND):
- Bits 6-7 of low byte select command:
  - 01 = END (stop voice)
  - 10 = JUMP (target = high byte, loop count = bits 0-4)
  - 11 = WAIT (tick count = high byte, speed = bits 0-4 if nonzero)

JUMP has loop counter: decrements each pass, falls through when zero.
WAIT can override channel speed via bits 0-4.
Empty entry = $0010 (pattern 0, transpose 0), NOT $0000.

## Effect Parameter Details

- Volume: 0-64, stored as value << 4 internally (0-1024)
- Speed: 1-31 for speed, 32+ for tempo (BPM) in effect 42xx
- Sample Offset: value << 7 words
- Vibrato/Tremolo waves: 0=Sine, 1=RampDown, 2=SawTooth, 3=Square

## Instrument Editor Selector Gadgets

We need these cycle/dropdown selectors:
- Wave Type: Sine/RampDown/SawTooth/Square
- Wave Length: 10/20/40/80/100 (hex)
- Count Way: Two-Way/One-Way
- Phase Type: Old/High/Med/Low
- Filter Type: Normal/Resonance
- Arpeggio Mode: Transpose/FixNote
- Direction: Forward/Backward
- Vib/Tre Direction: Downward/Upward
- Sustain: Normal/Hold

## Config System

Config file: Mline:Mline.config
Saves: screen mode, window positions, VU state, pack samples,
keyboard layout, play mode, scroll mode, follow channel,
edit mode, arp edit mode, 8 directory paths.

## Subsong System

- Up to 256 tunes per module
- Each tune independently: title, tempo, speed, groove, volume, playmode, 8 channel pointers
- AddTune/RemoveTune operations
- Per-tune 4ch/8ch mode

## File Format

IFF-like with MLED magic:
- MODL: header + history
- VERS: version
- TUNE: per-tune data (size-optimized channels)
- PART: pattern data (delta-compressed)
- ARPG: arpeggio tables
- INST: instrument params
- SMPL: wavesample data (optional delta packing)
