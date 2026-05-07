# Kontakt Bridge

Native WebSocket bridge for hosting Kontakt 8 from outside the browser and streaming stereo float audio blocks into DEViLBOX.

## Features

- WebSocket server on `ws://localhost:4009`
- macOS Audio Unit host for Kontakt 8 Player / Kontakt 8
- Windows VST3 scaffolding stub in `vst3host.cpp`
- Stereo float streaming (`KBRG` magic + left/right channels)
- JSON MIDI control protocol (`note_on`, `note_off`, `cc`, `load_preset`, `get_status`)

## Build

### macOS

```bash
cd /Users/spot/Code/DEViLBOX/tools/kontakt-bridge
./build.sh
./build/kontakt-bridge
```

### Windows

```bat
cd C:\path\to\DEViLBOX\tools\kontakt-bridge
build.bat
build\Release\kontakt-bridge.exe
```

## Browser integration

DEViLBOX connects from `src/engine/kontakt/KontaktBridge.ts` and plays incoming stereo audio with a `ScriptProcessorNode`.

## Notes

- On macOS the bridge scans `/Library/Audio/Plug-Ins/Components/` for a Kontakt AU.
- Kontakt preset loading first tries `kAudioUnitProperty_ClassInfoFromDocument`, then falls back to `kAudioUnitProperty_PresentPreset`.
- The Windows VST3 path is intentionally stubbed until the Steinberg interfaces are wired in on a Windows workstation.
