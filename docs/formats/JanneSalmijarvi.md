# Janne Salmijarvi Optimizer

**Status:** DETECTION_ONLY — parser extracts metadata; UADE synthesizes audio
**Parser:** `src/lib/import/formats/JanneSalmijarviParser.ts`
**Extensions:** `JS.*` (prefix-based)
**UADE name:** JanneSalmijarvi
**Reference files:** (Amiga demo music — rare)
**Replayer reference:** `Reference Code/uade-3.05/players/JanneSalmijarvi`

---

## Overview

Janne Salmijarvi Optimizer is a ProTracker MOD variant with a 4-byte marker `"JS92"`
inserted at offset 1080 (immediately after the standard 31-sample MOD header + 128-entry
order table). The format requires file size > 2112 bytes.

Detection is ported from `Janne Salmijarvi Optimizer.asm DTP_Check2`.

---

## File Layout

The Janne Salmijarvi Optimizer format follows ProTracker MOD layout through the first
1080 bytes (20-byte song name + 31×30-byte sample headers + 128-byte order table +
extra bytes), then inserts a 4-byte identification marker.

```
Offset  Size   Description
------  ----   -----------
0       20     Song name (MOD-standard, space-padded)
20      31×30  Sample headers (MOD-standard, 31 × 30 bytes = 930 bytes)
950     1      numOrders (uint8)
951     1      Song end position (uint8)
952     128    Pattern order table (MOD-standard, 128 bytes)
1080    4      Magic: "JS92" (0x4A533932)
1084+   ...    Pattern data + sample PCM (MOD-standard format)
```

**Minimum file size:** > 2112 bytes (1084 + 1024 + 4).

---

## Detection Algorithm

```
1. buf.length > 2112    (strictly greater than, from assembly BLE check)
2. u32BE(1080) == 0x4A533932   → "JS92" marker
```

---

## Reference Implementations

- **Parser source:** `src/lib/import/formats/JanneSalmijarviParser.ts`
- **Wanted Team asm:** `Reference Code/uade-3.05/amigasrc/players/wanted_team/JanneSalmijarvi/src/Janne Salmijarvi Optimizer.asm`
- **UADE player:** `Reference Code/uade-3.05/players/JanneSalmijarvi`

---

## Implementation Notes

**Current status:** DETECTION_ONLY

The parser validates the `JS92` marker and minimum file size, then routes playback
to UADE. The `JS.*` prefix is the primary routing key. Standard MOD-style placeholder
instruments are created.

The `"JS92"` marker at offset 1080 serves as the only unique identifier — the
surrounding MOD-format data is standard ProTracker and cannot be used for identification
on its own.
