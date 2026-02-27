# ZoundMonitor

**Status:** DETECTION_ONLY — parser identifies format, synthesis falls back to UADE
**Parser:** `src/lib/import/formats/ZoundMonitorParser.ts`
**Extensions:** `sng` (prefixed as `sng.songname`), UADE eagleplayer
**Reference files:** `Reference Music/Zoundmonitor/` (61 files)

---

## Overview

ZoundMonitor is an Amiga music format where module files are single-file 68k binaries
combining player code and song data in one executable blob. The format has a maximum of
15 sample slots (`MI_MaxSamples = 15` in the replayer assembly).

Because the file embeds its own player code, parsing requires working around the 68k
machine code prefix to find the music data structures. The parser performs metadata
extraction only — UADE runs the embedded 68k player for synthesis.

**Detection:** ZoundMonitor files are typically named `sng.<songname>` (UADE prefix
convention). The binary check uses a structural offset computed from the first two
bytes of the file to find a signature tag.

---

## Detection Algorithm

From `ZoundMonitor_v1.asm` DTP_Check2 routine:

```
D1 = (byte[0] + 1) × 16          ; lsl #4
D0 = (byte[1] + 1) × 128         ; lsl #7
D1 = D1 + D0 + 869               ; total offset into file
if D1 >= fileSize → NOT a ZoundMonitor file

At file offset D1, check for either:
  "df?:" pattern → byte[D1]=='d', byte[D1+1]=='f', byte[D1+3]==':'
  "?amp" pattern → byte[D1+1]=='a', byte[D1+2]=='m', byte[D1+3]=='p'
```

Both patterns correspond to Amiga DOS device path strings embedded in the player
binary (e.g., `"df0:"` = Disk Floppy 0, or `"ramp"` for RAM pointer references).

---

## Binary Layout Notes

The file starts with 68k player code. Relevant structures (from ZoundMonitor_v1.asm):
- **Sample data:** Maximum 15 PCM samples, 8-bit signed
- **Pattern data:** Standard 4-voice Amiga tracker pattern layout
- **Song position list:** Linear position sequence

Because the file is a relocatable binary, all internal pointers are Amiga absolute
addresses that are relocated at load time. The parser cannot safely extract PCM data
without knowing the load address.

---

## Reference Implementations

- **Assembly source:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/ZoundMonitor/src/ZoundMonitor_v1.asm`
- **UADE player:** `Reference Code/uade-3.05/players/ZoundMonitor` (eagleplayer binary)

---

## Implementation Notes

**Current status:** DETECTION_ONLY — `ZoundMonitorParser.ts` creates 15 `'Synth' as const`
placeholder instruments. UADE runs the embedded 68k player for all audio.

**Path to NATIVE_SAMPLER:**
The same challenge as BenDaglish and other compiled-binary formats: absolute Amiga
memory pointers must be recovered from the player's init code. Specifically:
1. Identify the relocation/init routine in the embedded 68k code
2. Find `LEA (d16,PC), An` instructions that establish the base address
3. Use the computed base address to convert absolute sample pointers to file offsets
4. Extract PCM at those offsets

The ZoundMonitor_v1.asm assembly source (in UADE's amigasrc directory) is the
definitive reference for this analysis.
