# SID Hardware Support — ASID + WebUSB

## Overview

DEViLBOX supports playback through real SID hardware (USB-SID-Pico, TherapSID) via two transports:

- **WebUSB (recommended)** — Direct USB connection with cycle-exact timing
- **ASID (legacy)** — MIDI SysEx protocol, no timing information

## Quick Start

### WebUSB (USB-SID-Pico)

1. **Connect Hardware** — Plug USB-SID-Pico into USB port
2. **Open Settings** → find "SID HARDWARE OUTPUT"
3. **Select "WebUSB"** from the transport dropdown
4. **Click "Connect USB-SID-Pico"** — browser shows device picker
5. **Play any SID file** — register writes go to real hardware with cycle-exact timing

### ASID (Legacy)

1. **Connect Hardware** — Plug USB-SID-Pico or TherapSID into USB, ensure MIDI output available
2. **Open Settings** → find "SID HARDWARE OUTPUT"
3. **Select "ASID"** from the transport dropdown
4. **Choose your MIDI device** and set device address (default 0x4D)
5. **Play SID files** with the **jsSID** engine

## Architecture

### Transport Layer (`src/lib/sid/`)
- **USBSIDPico.ts** — WebUSB driver: connection, buffered writes, cycle-exact writes, device commands
- **SIDHardwareManager.ts** — Unified abstraction over both transports with diff-based optimization
- **ASIDProtocol.ts** — MIDI SysEx message formatting
- **ASIDDeviceManager.ts** — MIDI device detection and management

### Engine Integration
- **JSSIDEngine.ts** — Supports both ASID and WebUSB (jsSID has native WebUSB bridge support)
- **GTUltraASIDBridge.ts** — Uses SIDHardwareManager for both transports
- **C64SIDEngine.ts** — High-level wrapper with hardware status tracking

### User Interface
- **PixiSettingsModal.tsx** — Pixi GL settings with unified SID Hardware Output panel
- **SettingsModal.tsx** — DOM settings with same unified panel
- **useSettingsStore.ts** — Persistent settings: `sidHardwareMode`, `webusbClockRate`, `webusbStereo`

## Technical Details

### WebUSB Protocol (USB-SID-Pico)

USB Vendor device (VID=0xCAFE, PID=0x4011), 64-byte packets:

| Write Type | Command Bits | Payload | Max per Packet |
|------------|-------------|---------|----------------|
| Simple write | `00` | `[reg, val]` pairs | 31 |
| Cycled write | `10` | `[reg, val, cycles_hi, cycles_lo]` | 15 |
| Command | `11` | config byte | 1 |

Register addressing: `(chip * 0x20) | register` — supports up to 4 SIDs.

Device commands: reset, pause/unpause, mute/unmute, set clock rate (PAL/NTSC/DREAN), mono/stereo toggle.

### ASID Protocol

MIDI SysEx format: `F0 2D <device> <reg> <data> F7`
- F0: SysEx start
- 2D: ASID manufacturer ID
- device: 0x4D (USB-SID-Pico default)
- reg: SID register (0x00-0x1F)
- data: Register value (0x00-0xFF)
- F7: SysEx end

### Engine Compatibility

| Engine | WebUSB | ASID | Notes |
|--------|--------|------|-------|
| jsSID | ✅ | ✅ | Native WebUSB bridge via `window.webusb` |
| GTUltra | ✅ | ✅ | Via SIDHardwareManager |
| WebSID | ❌ | ❌ | Software only |
| TinyRSID | ❌ | ❌ | Software only |

### Browser Support

| Feature | Chrome 61+ | Edge 79+ | Opera 48+ | Firefox | Safari |
|---------|-----------|---------|----------|---------|--------|
| WebUSB | ✅ | ✅ | ✅ | ❌ | ❌ |
| Web MIDI (ASID) | ✅ | ✅ | ✅ | ❌ | ❌ |

Both require HTTPS or localhost.

## Implementation Status

✅ **WebUSB driver** (USBSIDPico.ts) — connection, buffered writes, cycle-exact writes, device commands
✅ **Unified hardware manager** (SIDHardwareManager.ts) — abstracts both transports
✅ **ASID protocol** (ASIDProtocol.ts + ASIDDeviceManager.ts) — MIDI SysEx
✅ **jsSID integration** — WebUSB bridge + ASID support
✅ **GTUltra integration** — via SIDHardwareManager
✅ **Settings UI** — unified SID Hardware Output panel (Pixi + DOM)
✅ **Settings store** — persistent mode/clock/stereo preferences

## Files

```
src/
├── lib/sid/
│   ├── USBSIDPico.ts                        (NEW - WebUSB driver)
│   ├── SIDHardwareManager.ts                (NEW - unified manager)
│   ├── ASIDProtocol.ts                      (ASID MIDI SysEx)
│   └── ASIDDeviceManager.ts                 (MIDI device detection)
├── engine/
│   ├── deepsid/engines/JSSIDEngine.ts       (+ WebUSB bridge)
│   ├── gtultra/GTUltraASIDBridge.ts         (refactored to use manager)
│   └── C64SIDEngine.ts                      (+ hardware status)
├── pixi/dialogs/PixiSettingsModal.tsx       (+ unified SID Hardware UI)
├── components/dialogs/SettingsModal.tsx      (+ unified SID Hardware UI)
└── stores/useSettingsStore.ts               (+ WebUSB settings)
```

## Credits

- **USB-SID-Pico:** LouDnl — hardware, firmware, WebUSB reference driver
- **ASID Protocol:** Thomas Jansson (DeepSID)
- **jsSID Emulator:** Hermit (Mihaly Horvath)
- **Integration:** DEViLBOX 2026

## References

- USB-SID-Pico: https://github.com/LouDnl/USBSID-Pico
- USB-SID-Pico Driver: https://github.com/LouDnl/USBSID-Pico-driver
- SIDFactory2 ASID: https://github.com/Chordian/sidfactory2/tree/asid-support
- DeepSID: https://github.com/Chordian/deepsid
