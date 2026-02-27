# SAP (Slight Atari Player)

**Status:** FULLY_NATIVE — 6502 CPU + POKEY chip emulation via FurnacePOKEY
**Parser:** `src/lib/import/formats/SAPParser.ts`
**Extensions:** `.sap`
**UADE name:** N/A (native engine)
**Reference files:** `Reference Music/SAP/`
**Synth types:** `FurnacePOKEY`

---

## Overview

SAP is the native music format for Atari 8-bit computers (400/800/XL/XE), emulating the
POKEY (Potentiometer/Keyboard) sound chip. The format uses a plain ASCII text header
(key-value pairs) followed by a 6502 binary payload. DEViLBOX emulates a 6502 CPU and
intercepts POKEY register writes to extract note and parameter data.

POKEY has 4 audio channels, each with its own frequency divider, distortion/waveform
control, and volume. The chip also supports 16-bit frequency mode by linking channels 1+2
or 3+4.

---

## File Layout

SAP files begin with an ASCII header block, terminated by a double 0xFF marker, followed
by raw 6502 binary data.

```
[ASCII header lines]
[0xFF 0xFF]
[6502 binary payload]
```

### ASCII Header Format

Each line is: `KEY VALUE\r\n` (or `\n`). Keys are case-insensitive.

```
KEY         VALUE         Description
----------  ------------  -----------
SAP                       File type identifier (must be first line)
AUTHOR      "string"      Composer name (quoted)
NAME        "string"      Song/game name (quoted)
DATE        "string"      Release date (quoted)
SONGS       N             Number of subsongs (default 1)
DEFSONG     N             Default subsong index (0-based)
TYPE        X             Player type (B, C, D, or S)
FASTPLAY    N             Play interrupt rate (default 312 = 50Hz VBlank)
MUSIC       $XXXX         Load address (hex, type B only: loaded at this addr)
INIT        $XXXX         Init routine address
PLAYER      $XXXX         Play routine address
COVOX                     File uses COVOX stereo DAC (no POKEY)
STEREO                    File has two POKEYs (stereo) at $D200/$D210
NTSC                      File uses NTSC timing (default is PAL)
```

### Player Types

| Type | Description |
|------|-------------|
| B    | Binary — loaded at MUSIC address; PLAYER points to play routine |
| C    | CMC (Chaos Music Composer) player |
| D    | Double-frame player (play called every 2 VBlanks) |
| S    | Stereo player (two POKEYs) |

---

## Detection Algorithm

```
1. buf.length >= 4
2. buf.slice(0,3) == "SAP"   (magic at start of ASCII header)
```

The `SAP` keyword must appear at the beginning of the file (first 3 bytes). Full header
parsing then extracts all key-value pairs until the `0xFF 0xFF` terminator.

---

## POKEY Register Map

POKEY occupies $D200–$D20F (read) / $D200–$D20F (write):

```
$D200  AUDF1   Channel 1 frequency divider (low byte)
$D201  AUDC1   Channel 1 control: vol[3:0], dist[6:5], vol-only[4]
$D202  AUDF2   Channel 2 frequency divider
$D203  AUDC2   Channel 2 control
$D204  AUDF3   Channel 3 frequency divider
$D205  AUDC3   Channel 3 control
$D206  AUDF4   Channel 4 frequency divider
$D207  AUDC4   Channel 4 control
$D208  AUDCTL  Audio control:
                bit 7 = 179kHz clock (else 64kHz/15kHz)
                bit 6 = 1.79MHz to ch1 (else base clock)
                bit 5 = 1.79MHz to ch3
                bit 4 = ch1+2 16-bit (link ch1 MSB, ch2 LSB)
                bit 3 = ch3+4 16-bit
                bit 2 = ch1 hi-pass filter via ch3
                bit 1 = ch2 hi-pass filter via ch4
                bit 0 = 15kHz base clock (else 64kHz)
```

### Frequency Calculation

**Standard (64kHz clock, AUDCTL=0):**
```
freq_hz = 63921 / (2 * (AUDF + 1))
```

**High-rate clock (1.79MHz):**
```
freq_hz = 1789772.5 / (2 * (AUDF + 1))
```

**16-bit mode (channels linked):**
```
freq_hz = clock / (2 * ((AUDF_hi << 8 | AUDF_lo) + 1))
```

### Distortion Modes (AUDC bits 6–5)

| Bits | Waveform     | Character            |
|------|--------------|----------------------|
| 00   | 17-bit poly  | noise-like           |
| 01   | 5-bit poly   | buzzy                |
| 10   | 5-bit + 17   | mixed poly           |
| 11   | pure tone    | square (no distort)  |

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/SAPParser.ts`
- **Furnace POKEY platform:** `Reference Code/furnace-master/src/engine/platform/pokey.cpp`
- **SAP spec:** `asap.sourceforge.net` (ASAP project documentation)

---

## Implementation Notes

**STEREO flag:** When `STEREO` is present, the file uses two POKEY chips. DEViLBOX
instantiates two `FurnacePOKEY` instruments for 8 total channels (4+4).

**FASTPLAY:** The play interrupt rate in Atari scan-line units. Default 312 = 50Hz
(PAL VBlank). NTSC default = 262. Files with `FASTPLAY` use a CIA-style timer interrupt
faster than VBlank for higher temporal resolution.

**NTSC vs PAL:** SAP defaults to PAL. The `NTSC` keyword switches timing and frequency
calculations. PAL POKEY runs at slightly different frequencies.

**Type D:** Double-frame player calls play() every 2 VBlanks (25Hz PAL), producing
longer effective notes at half the temporal resolution.

