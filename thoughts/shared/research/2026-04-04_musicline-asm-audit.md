---
date: 2026-04-04
topic: musicline-asm-deep-audit
tags: [musicline, asm, editor, audit]
status: final
---

# MusicLine v1.16 ASM Deep Audit

Source: `/Users/spot/Downloads/vasm-mline (3)/Mline116.asm` — 32790 lines of 68000 assembly.

## Key Architecture Findings

### Pattern Editor
- Uses Amiga OS graphics (Move/Text/SetAPen), NOT direct bitplane access
- Two fonts: Font7 (6px, tune list) and Font8 (8px, pattern editor)
- 16 visible rows in pattern editor, 8 visible rows in tune list
- Row = 12 bytes: Note(1) + Instrument(1) + 5x Effect(2 bytes each)
- **5 simultaneous effect slots per row** (not 1 like ProTracker)
- 128 rows max per pattern, 256 positions max per channel
- Scrolling during playback uses hardware ClipBlit for smooth 1-row scrolls

### Per-Channel Speed System
- Each channel has: `ch_Spd`, `ch_Grv`, `ch_SpdPart`, `ch_GrvPart`, `ch_SpdCnt`
- Speed counter decremented each tick; when 0, channel advances to next row
- Groove: alternates between `ch_Spd` and `ch_Grv` each row (swing)
- Effect 40xx: set speed for ONE channel (sets ch_SpdPart flag)
- Effect 42xx: set speed for ALL channels (skips channels with ch_SpdPart set)
- When part wraps, per-channel speed resets to global

### Per-Channel Position System
- Each of 8 channels has own tune list pointer (tune_Ch1Ptr..tune_Ch8Ptr)
- Each channel has own `ch_TunePos` (0-255) — advances independently
- Tune entry format (16-bit word): pattern number (10 bits) + transpose (5 bits) OR special command
- Special commands: End (stop channel), Jump (loop), Wait (hold N ticks)
- Channels can be at completely different positions in their tune lists

### Playback Follow Modes
- `_ScrollPart` = 0: no follow, 1: follow pattern, 2: follow tune position
- `_FollowChannel`: follows only the SELECTED channel, not all
- During follow, cursor up/down keys are blocked; left/right still work
- Only redraws when the followed channel's position changes

### Instrument System
- 11 effect modules per instrument, each independently enabled:
  1. ADSR Envelope (Attack/Decay/Sustain/Release with Length/Speed/Volume each)
  2. Vibrato (Dir, Wave, Speed, Delay, Attack, Depth)
  3. Tremolo (same params as vibrato)
  4. Arpeggio (table reference, speed, groove)
  5. Loop (Start, Repeat, RepEnd, Length, LpStep, Wait, Delay, Turns)
  6. Transform (5 waveform morphing targets + speed)
  7. Phase (modulation)
  8. Mix (mix another waveform)
  9. Resonance (Amp, filter boost)
  10. Filter (Type, speed)
  11. Loop Stop variant

### Arpeggio System
- 256 arpeggio tables, each up to 128 rows x 6 bytes
- Each row: Note + WaveSample + 2 sub-effects
- Sub-effects: pitch slide up/down, set volume, volume slide, restart
- Per-arpeggio speed counter with groove

### Display Layout
- Screen: 640x256 HiRes with AutoScroll
- Window 1 (Sequencer): tune list (top, 8 rows) + pattern editor (bottom, 16 rows)
- Window 2 (Instrument): params + arpeggio editor (right side, 12 rows)
- Channel status display above tune list: tune pos, part num, step pos, transpose per channel
- 8 channels displayed in tune list, 56px per channel column

### Effect Command List (76 total)
- 00-0B: Pitch effects (slide, portamento, vibrato, finetune)
- 10-1A: Instrument volume (set, slide, tremolo)
- 20-27: Channel volume (set, slide, set all)
- 30-36: Master volume (set, slide)
- 40-4B: System (per-channel speed, groove, arpeggio, sustain, filter, sample offset)
- E1-EB: ProTracker compatibility effects

### 4ch vs 8ch Modes
- 4ch: direct Paula DMA hardware
- 8ch: software mixing (channels 1+5, 2+6, 3+7, 4+8 share DMA pairs)
