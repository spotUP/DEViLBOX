---
name: play-file
description: "Load and play a music file from disk (188+ formats supported)"
---

# /play-file — Load & Play a Music File

Load any music file from disk into DEViLBOX and start playback. Supports 188+ formats.

## Usage

```
/play-file <path to file>
```

Examples: `/play-file ~/Music/mods/enigma.mod`, `/play-file /tmp/test.xm`

## Supported Formats

MOD, XM, IT, S3M, FUR (Furnace), HVL/AHX (Hively), SID, VGM, TFMX, FC (Future Composer),
MED, OKT, DBM, PTK, DIGI, AHX, BP (SoundMon), JamCracker, Hippel, Art of Noise, Sonix,
NSF, GBS, KSS, HES, SAP, SC68, SNDH, PT3, VTX, PSG, and many more.

## Steps

1. **Load**: Call `load_file` with the file path:
   ```
   load_file(path: "<absolute path to file>")
   ```

2. **Play**: Call `play` to start playback:
   ```
   play()
   ```

3. **Verify audio**: Call `wait_for_audio(timeoutMs: 5000)` to confirm sound.

4. **Report**: Call `get_song_info` to show what was loaded — format, channels, BPM, pattern count.

## Options

- **Subsong**: For multi-song formats: `load_file(path: "...", subsong: 2)`
- **Force libopenmpt**: For PC tracker formats: `load_file(path: "...", useLibopenmpt: true)`
- **Play mode**: `play(mode: "song")` plays through all patterns, `play(mode: "pattern")` loops current pattern.

## Troubleshooting

- "No browser connected" → Browser must be open at localhost:5173
- "Failed to read file" → Check the path exists and is absolute
- No audio → `get_audio_state` to check AudioContext. Click in browser to unlock.
