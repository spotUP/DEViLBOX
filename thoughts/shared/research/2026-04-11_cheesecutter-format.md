---
date: 2026-04-11
topic: cheesecutter-ct-format
tags: [sid, c64, cheesecutter, format-research]
status: final
---

# CheeseCutter (.ct) Format — Complete Technical Reference

## Overview

CheeseCutter v2 is a C64 SID music tracker written in D language by Abaddon (Thomas Mogensen / DRAX).
Based on JCH NewPlayer 21.G4 by Laxity/VIB. Uses reSID for audio emulation.

- **File extension**: `.ct` (the only extension used)
- **Magic bytes**: `CC2` (first 3 bytes of file)
- **Compression**: Rest of file after magic is zlib-compressed
- **Channels**: 3 (single SID chip — the code mentions stereo SID files exist with `ver >= 128` but are not supported by the editor)
- **GitHub**: https://github.com/theyamo/CheeseCutter
- **License**: GPL
- **Current song revision**: 12

## Relationship to GoatTracker

CheeseCutter is heavily inspired by GoatTracker (GT), sharing concepts like:
- Wave tables, pulse tables, filter tables
- Track lists with transpose values
- Sequence-based pattern system
- 6502 player routine for C64 playback

Key difference: CheeseCutter's player is based on JCH NewPlayer (by Laxity), not GT's player.
The instrument and table formats are CheeseCutter-specific.

## Binary File Format

### File Structure

```
Offset  Size     Content
0x00    3        Magic: "CC2" (ASCII)
0x03    ...      zlib-compressed data blob
```

### Decompressed Data Layout

The decompressed blob is exactly 167,832 bytes (per the uncompress call: `std.zlib.uncompress(inbuf[3..$], 167832)`).

```
Offset       Size      Content
0x00000      65536     C64 memory image (contains assembled player + all music data)
0x10000      1         Version byte (ver)
0x10001      1         Clock (PAL/NTSC)
0x10002      1         Multiplier (1-16, for multispeed)
0x10003      1         SID model (0=6581, 1=8580)
0x10004      1         Filter preset index (fppres)
0x10005      32        Song speeds array (one byte per subtune, up to 32 subtunes)
0x10025      1         Highlight value (if ver > 10)
0x10026      1         Highlight offset (if ver > 10)

--- DatafileOffset.Title = 0x10000 + 256 + 5 = 0x10105 ---
0x10105      32        Title (padded with spaces)
0x10125      32        Author (padded with spaces)
0x10145      32        Release (padded with spaces)
0x10165      32        Message (padded with spaces)

--- DatafileOffset.Insnames = Title + 40*4 = 0x10105 + 160 = 0x101A5 ---
0x101A5      1536      Instrument names (48 instruments * 32 chars each)
                       (stored as 1024*2 = 2048 bytes allocated)

--- DatafileOffset.Subtunes = Insnames + 1024*2 = 0x101A5 + 2048 = 0x109A5 ---
0x109A5      98304     Subtune data (32 subtunes * 3 voices * 1024 bytes)
```

### Header After 64K Memory Image (offset 0x10000)

```
Byte 0: ver (song revision, currently 12)
Byte 1: clock (0=PAL, 1=NTSC)
Byte 2: multiplier (1=normal, 2-16=multispeed)
Byte 3: sidModel (0=6581, 1=8580)
Byte 4: fppres (filter preset index)
Bytes 5-36: songspeeds[32] (speed per subtune)
Byte 37: highlight (if ver > 10)
Byte 38: highlightOffset (if ver > 10)
```

## C64 Memory Layout (first 64KB)

The player binary loads at `$0E00` and the music data occupies specific addresses.
All data addresses are discovered via the **offset table** at `$0FA0`.

### Offset Table ($0FA0)

Located at `$0FA0` in the C64 memory image. Contains 16-bit little-endian pointers:

```
$0FA0: features pointer
$0FA2: volume pointer
$0FA4: editorflag pointer
$0FA6: songsets pointer
$0FA8: playspeed pointer
$0FAA: subnoteplay pointer
$0FAC: submplayplay pointer
$0FAE: instrumentDescriptionsHeader
$0FB0: pulseDescriptionsHeader
$0FB2: filterDescriptionsHeader
$0FB4: waveDescriptionsHeader
$0FB6: cmdDescriptionsHeader
$0FB8: freqtable (dummy)
$0FBA: finetune (dummy)
$0FBC: arp1 (wave table byte 1)
$0FBE: arp2 (wave table byte 2)
$0FC0: filttab (filter table)
$0FC2: pulstab (pulse table)
$0FC4: inst (instrument table)
$0FC6: track1
$0FC8: track2
$0FCA: track3
$0FCC: seqlo (sequence pointer low bytes)
$0FCE: seqhi (sequence pointer high bytes)
$0FD0: cmd1 (super/command table)
$0FD2: s00 (first sequence)
$0FD4: speed
$0FD6: tracklo
$0FD8: voice
$0FDA: gate
$0FDC: chord (chord table)
$0FDE: trans
$0FE0: chordindex (chord index table)
$0FE2: shtrans
$0FE6: dummy
$0FE8: dummy
$0FEA: dummy
$0FEC: dummy
$0FEE: newseq
```

**Player version string** at `$0FEE`: 6 bytes, e.g. `"cc4.07"`.

### Player Entry Points ($1000)

```
$1000: init (JSR subinit) — A = subtune number
$1003: play (JSR subplay) — called once per frame (PAL: 50Hz)
$1006: mplay (JSR submplay) — multispeed sound-only frame
$1009: subnoteplay — note preview (editor keyjam)
```

## Data Structures

### Sequences (Patterns)

Up to 128 sequences (`MAX_SEQ_NUM = 0x80`), each up to 64 rows (`MAX_SEQ_ROWS = 0x40`).

#### Raw (Editor) Format — 4 bytes per row

```
Byte 0: Instrument     ($C0 + instrument number 0-$2F, or $F0 = no instrument)
Byte 1: Tie flag       ($5F = tied note, $F0 = normal)
Byte 2: Note           ($60 + note value, where note 0=rest, 1=keyoff, 2=keyon, 3-$5E=notes C-0 to B-7)
Byte 3: Command        (command byte, 0 = no command)
```

**End marker**: `$BF` at byte position `rows * 4`.

**Note encoding**: Note values 0-$5E are stored as `value + $60` in the raw byte. Actual notes start at 3 (C-0). Values 0=empty, 1=keyoff (===), 2=keyon (+++).

**Instrument encoding**: Values $C0-$EF map to instruments 0-$2F. $F0 = no instrument set.

#### Compact (Player) Format — Variable-length byte stream

The compact format is what the 6502 player reads. It uses run-length encoding for delays:

```
$00-$5E: Note value (if preceded by note >= $60, the raw note - $60)
$5F:     Tie flag (next byte is the note)
$60-$BE: Note with command following (note = byte - $60, next byte is command)
$BF:     End of sequence marker
$C0-$EF: Set instrument to (byte - $C0)
$F0-$FF: Set duration/delay to (byte & $0F)
```

### Track Lists (Order Lists)

Each of the 3 voices has a track list of up to 512 entries (`TRACK_LIST_LENGTH = 0x200`).
Each entry is 2 bytes:

```
Byte 0: Transpose value
Byte 1: Sequence number (0-$7F)
```

**Transpose byte encoding**:
- `$80`: No transpose change (use previous)
- `$81-$BF`: Transpose value ($A0 = no transpose, values above/below shift pitch)
- `$F0-$FF`: Song wrap marker — wraps back to a position in the track list

**Song wrap**: When transpose >= $F0, the next byte combined with the wrap marker forms a pointer back to an earlier position.

### Subtunes

Up to 32 subtunes (`SUBTUNE_MAX = 32`). Each subtune has its own set of 3 track lists (1024 bytes per voice = 3072 bytes per subtune).

**Songsets structure** (in C64 memory):
```
Per subtune (8 bytes):
  Word: track1 pointer
  Word: track2 pointer
  Word: track3 pointer
  Byte: speed value
  Byte: voice mask (bit flags for channel on/off)
```

### Instrument Table

48 instruments (`INSNO = 48`), 8 parameters each. Stored column-major (all param 0 for all instruments, then all param 1, etc.).

```
Total size: 8 * 48 = 384 bytes

Parameter layout (per instrument, offset = param_index * 48 + instrument_number):
INS_AD    (0 * 48): Attack/Decay      — SID ADSR attack (high nibble) + decay (low nibble)
INS_SR    (1 * 48): Sustain/Release    — SID ADSR sustain (high nibble) + release (low nibble)
INS_HR    (2 * 48): Hard restart type / arp delay
                     Bits 7-6: $00=3-frame restart, $40=soft restart, $80=hard restart
                     Bits 3-0: Arpeggio delay value
INS_4     (3 * 48): Hard restart waveform
INS_FLTP  (4 * 48): Filter table pointer (0 = no filter)
INS_PULSP (5 * 48): Pulse table pointer ($00-$3F, or high bit set = direct pulse value)
INS_7     (6 * 48): Hard restart SR envelope value
INS_ARP   (7 * 48): Wave table pointer
```

### Wave Table (Arpeggio Table)

256 entries, 2 bytes each (stored as two separate 256-byte arrays: wave1 and wave2).

```
Wave1 (arp1): Transpose / control
  $00-$5F: Relative transpose up
  $80-$DF: Absolute tuning (unaffected by note/transpose)
  $7E:     Loop to previous row
  $7F:     Loop to row specified in Wave2

Wave2 (arp2): Waveform / wave delay / loop pointer
  $00:     Do nothing
  $01-$0F: Override instrument's wave delay for this row
  $10-$DF: Waveform (SID control register value)
  $E0-$EF: SID control register value $00-$0F
  $00-$FF: Loop pointer (when Wave1 = $7F)
```

### Pulse Table

64 entries, 4 bytes each (256 bytes total). Controls pulse width modulation.

```
Byte 0: Duration and direction ($00-$7F = add, $80-$FF = subtract)
Byte 1: Add/subtract value
Byte 2: Initial pulse value (nibbles reversed! $48 = $8400)
Byte 3: Pointer to next set ($00-$3F) or $7F = stop
```

### Filter Table

64 entries, 4 bytes each (256 bytes total). Controls SID filter.

```
Byte 0: Duration ($00-$7F) or filter type ($90-$F0)
Byte 1: Add value or filter resonance + channel mask
Byte 2: Initial filter value or $FF = skip
Byte 3: Pointer to next set ($00-$3F) or $7F = stop
```

### Command Table (Super Table)

Three parallel 64-byte arrays (cmd1, cmd2, cmd3) = 192 bytes total.
Commands $00-$3F reference entries in this table.

```
cmd1[n]: Command type
cmd2[n]: Parameter 1
cmd3[n]: Parameter 2

Command types:
$00: Slide up      — speed in cmd2:cmd3 (signed 16-bit)
$01: Slide down    — speed in cmd2:cmd3 (signed 16-bit)
$02: Hi-fi vibrato — cmd2 low nibble: vibrato 'feel'; cmd3 high: speed, low: depth divider
$03: Detune        — signed 16-bit offset
$04: Set ADSR      — cmd2=AD, cmd3=SR
$05: Lo-fi vibrato — speed/depth
$06: Set waveform  — waveform in last param byte
$07: Portamento    — speed (runs until command $08)
$08: Stop portamento/slide
```

### Sequence Command Bytes (in-pattern)

Commands embedded in sequence data have ranges:

```
$00:     No command
$01-$3F: Reference command table entry
$40-$5F: (reserved)
$60-$7F: Filter commands
$80-$9F: Chord commands (low nibble = chord index)
$A0-$AF: Set Attack
$B0-$BF: Set Decay
$C0-$CF: Set Sustain
$D0-$DF: Set Release
$E0-$EF: Set Volume
$F0-$FF: Set Speed ($F0/$F1 also trigger swing mode)
```

### Chord Table

128 bytes. Chord programs referenced by chord commands ($80-$9F).

### Chord Index Table

32 bytes. Maps chord command values to offsets in the chord table.

## Playback Architecture

### How Playback Works

CheeseCutter does NOT use a traditional replayer-in-JS approach. Instead:

1. The `.ct` file contains a **full 64KB C64 memory image** with an assembled 6502 player
2. A **6502 CPU emulator** (in D, `com/cpu.d`) executes the player code
3. The player writes to **SID registers** at `$D400-$D418` in the emulated memory
4. After each frame, the SID register values are fed to **reSID** for audio synthesis

### Frame Execution Flow

```
Each frame (50Hz PAL / 60Hz NTSC):
1. CPU executes JSR $1003 (play routine)
2. Player reads track lists, sequences, processes effects
3. Player writes SID registers to $D400-$D418
4. Host reads sidbuf[0..0x19] → feeds to reSID
5. reSID generates audio samples
```

### Multispeed

When multiplier > 1, the CIA timer is adjusted (`PAL_CLOCK / multiplier = $4CC7 / n`).
Per real frame:
- Frame 0: Call $1003 (full play — track + sequence + sound)
- Frames 1..n-1: Call $1006 (mplay — sound update only)

### SID Register Mapping

The player writes to a 25-byte SID buffer at $D400:

```
$D400-$D406: Voice 1 (freq lo/hi, pulse lo/hi, control, AD, SR)
$D407-$D40D: Voice 2
$D40E-$D414: Voice 3
$D415-$D418: Filter cutoff lo/hi, filter resonance/routing, volume/filter mode
```

## PSID Export

CheeseCutter can export to PSID v2 format (the standard SID file format). The `build.d` file shows:

1. Data is dumped to ACME assembler source
2. ACME assembles it to binary
3. A 124-byte PSID header (`$7C` bytes) is prepended
4. Player is relocated to the specified address
5. Unused effects are conditionally excluded (reduces player size)

**PSID header offsets used**:
- `$08`: Load address
- `$0A`: Init address
- `$0C`: Play address
- `$0E`: Number of songs (subtunes)
- `$10`: Start song
- `$12`: Speed flags
- `$16`: Title (32 bytes)
- `$36`: Author (32 bytes)
- `$56`: Release (32 bytes)
- `$76`: Flags (PAL + SID model)

## Porting Strategy for DEViLBOX

### Option A: Direct .ct Parser + 6502 Emulation (Recommended)

Since .ct files contain a full C64 memory image with a 6502 player:

1. **Parse .ct**: Read magic "CC2", zlib-decompress, extract 64KB memory + metadata
2. **Run 6502 CPU**: Port the CPU emulator (simple — 56 opcodes, ~600 lines)
3. **Feed SID registers to reSID/WebSID**: After each CPU frame, read $D400-$D418
4. **Use existing reSID WASM**: DEViLBOX already has reSID for SID playback

This is the most accurate approach — it runs the ACTUAL CheeseCutter player code.

### Option B: PSID Conversion

Convert .ct to .sid at load time using the build logic, then play via existing SID infrastructure.
Problem: Requires embedding the ACME assembler.

### Option C: JavaScript Replayer Port

Port the 6502 player_v4.acme to JavaScript. Very complex — the player is ~800 lines of 6502 assembly with many conditional features.

### Recommendation

**Option A** is best. The CPU emulator is trivial (the D source is self-contained, ~400 lines of actual logic). The .ct file already contains everything needed — the assembled player binary + all music data. Just:

1. Decompress
2. Tick the CPU
3. Read SID registers
4. Feed to reSID

This is essentially the same pattern as SC68 (run 68k CPU, read YM2149 registers) or UADE (run 68k CPU, read Paula registers).

### Can Existing Players Play .ct?

- **HVSC**: No — HVSC stores `.sid` files, not `.ct` files
- **UADE**: No — UADE is Amiga-only
- **libsidplayfp**: No — only plays `.sid`/`.mus`/`.prg` files
- **sidplay2**: No
- **Modland**: Does not appear to have .ct files in its archive

The .ct format is CheeseCutter-specific. Files must be either converted to .sid first (using ct2util) or played natively with a 6502 emulator + reSID.

## Key Constants

```
MAX_SEQ_ROWS = 64         (0x40)
MAX_SEQ_NUM = 128         (0x80)
TRACK_LIST_LENGTH = 512   (0x200)
SUBTUNE_MAX = 32
INSNO = 48
SEQ_END_MARK = 0xBF
SONG_REVISION = 12
PAL_CLOCK = 0x4CC7        (19655 — CIA timer value for PAL)
```

## Sample Files

14 .ct files in the repository's `tunes/` directory, including works by Abaddon, Dr.Vector, Scarzix, Vent, and Wisdom.
