# OB-Xd DSP Source

This directory contains the DSP engine for the OB-Xd synthesizer.

## Implementation Notes

The current OBXdSynth.cpp file contains a complete standalone implementation
inspired by the OB-Xd architecture. For a more authentic emulation, you can
integrate the actual OB-Xd source code.

## Getting the Original Source (Optional)

For the authentic OB-Xd DSP engine:

```bash
git clone https://github.com/reales/OB-Xd.git temp-obxd
cp -r temp-obxd/Source/* ./
rm -rf temp-obxd
```

Key files from the original:
- `Engine/Voice.h/cpp` - Voice management
- `Engine/Oscillator.h/cpp` - Oscillator generation
- `Engine/Filter.h/cpp` - Filter emulation
- `Engine/SynthEngine.h/cpp` - Main engine

## License

OB-Xd is GPL-3.0 licensed. The standalone implementation in OBXdSynth.cpp
is also GPL-3.0 for compatibility.

## Features Implemented

- 8-voice polyphony with voice stealing
- Dual oscillators (Saw, Pulse, Triangle, Noise)
- Hard sync and XOR (ring mod)
- 24dB cascaded lowpass filter
- Two ADSR envelopes (filter, amp)
- LFO with multiple waveforms
- Velocity sensitivity
- Pan spread
