# NovoTrade Packer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/NovoTradePackerParser.ts`
**Extensions:** `NTP.*` (prefix)
**UADE name:** NovoTradePacker
**Reference files:** (Amiga game music — Castlevania, Konami/NovoTrade)
**Replayer reference:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/NovoTradePacker/src/NovoTrade Packer_v1.asm`

---

## Overview

NovoTrade Packer is an Amiga music format originally used in *Castlevania* (1990) by
NovoTrade/Konami. It uses a `"MODU"` magic header with indirect chunk tags (`"BODY"`,
`"SAMP"`) located at offsets computed from header fields.

---

## File Layout

```
Offset  Size  Description
------  ----  -----------
0x00    4     "MODU" magic (0x4D, 0x4F, 0x44, 0x55)
0x04    ...   Header data
0x10    2     D1 = body offset (u16BE, > 0, even, non-negative)
0x16    2     sample count (u16BE)
0x18    2     D2 = song length / sample data size (u16BE)
0x1A    2     pattern count (u16BE)
4+D1    4     "BODY" chunk marker
4+D1+D2 4    "SAMP" chunk marker
```

---

## Detection

Based on `NovoTrade Packer_v1.asm DTP_Check2`:

```
bytes[0..3] == "MODU"
D1 = u16BE(16): > 0, even, non-negative (bit 15 clear)
D2 = u16BE(24): > 0, even, non-negative (bit 15 clear)
bytes[4+D1..4+D1+3] == "BODY"
bytes[4+D1+D2..4+D1+D2+3] == "SAMP"
file size >= 32
```

---

## Metadata

```
u16BE(22) = sample count
u16BE(24) = song length
u16BE(26) = pattern count
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/NovoTradePackerParser.ts`
- **UADE player asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/NovoTradePacker/src/NovoTrade Packer_v1.asm`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The `"MODU"` + indirect `"BODY"` + `"SAMP"` check reliably identifies NovoTrade
Packer files. UADE synthesizes audio.
