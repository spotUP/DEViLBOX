# ASID Hardware Support - Implementation Complete

## Overview

DEViLBOX now supports playback through real SID hardware (USB-SID-Pico, TherapSID) via the ASID protocol. Users can route C64 SID file playback to authentic MOS 6581/8580 chips instead of software emulation.

## Quick Start

1. **Connect Hardware**
   - Plug USB-SID-Pico or TherapSID into USB port
   - Ensure device appears as MIDI output

2. **Enable in Settings**
   - Open Settings → C64 SID PLAYER ENGINE
   - Find "ASID HARDWARE OUTPUT" section
   - Toggle ON and select your device

3. **Play SID Files**
   - Import any .sid file
   - Choose **jsSID** engine
   - Hardware plays automatically

## Architecture

### Protocol Layer (`src/lib/sid/`)
- **ASIDProtocol.ts** - MIDI SysEx message formatting
- **ASIDDeviceManager.ts** - Device detection and management

### Engine Integration
- **JSSIDEngine.ts** - ASID-enabled SID emulator (jsSID by Hermit)
- **C64SIDEngine.ts** - High-level wrapper with ASID status tracking

### User Interface
- **SettingsModal.tsx** - ASID hardware configuration panel
- **useSettingsStore.ts** - Persistent ASID settings

## Technical Details

### ASID Protocol
MIDI SysEx format: `F0 2D <device> <reg> <data> F7`
- F0: SysEx start
- 2D: ASID manufacturer ID
- device: 0x4D (USB-SID-Pico default)
- reg: SID register (0x00-0x1F)
- data: Register value (0x00-0xFF)
- F7: SysEx end

### Engine Compatibility
- ✅ **jsSID** - Full ASID support
- ❌ WebSID, TinyRSID, WebSIDPlay, JSIDPlay2 - Software only

### Browser Support
- ✅ Chrome 43+, Edge 79+, Opera 30+
- ❌ Firefox, Safari (no Web MIDI API)

## Implementation Phases

✅ **Phase 1** - ASID Protocol implementation
✅ **Phase 2** - Settings UI
✅ **Phase 3** - jsSID integration  
✅ **Phase 4** - C64SIDEngine wrapper
⏳ **Phase 5** - Tracker integration (future)

## Files Modified

```
src/
├── lib/sid/
│   ├── ASIDProtocol.ts                    (NEW - 215 lines)
│   └── ASIDDeviceManager.ts               (NEW - 236 lines)
├── engine/
│   ├── C64SIDEngine.ts                    (+ ASID status)
│   └── deepsid/engines/JSSIDEngine.ts     (+ ASID integration)
├── components/dialogs/SettingsModal.tsx   (+ ASID settings UI)
└── stores/useSettingsStore.ts             (+ ASID state)
```

## Credits

- **ASID Protocol:** Thomas Jansson (DeepSID)
- **jsSID Emulator:** Hermit (Mihaly Horvath)
- **USB-SID-Pico:** LouDnl
- **Integration:** DEViLBOX 2026-03-03

## References

- USB-SID-Pico: https://github.com/LouDnl/USBSID-Pico
- SIDFactory2 ASID: https://github.com/Chordian/sidfactory2/tree/asid-support
- DeepSID: https://github.com/Chordian/deepsid
