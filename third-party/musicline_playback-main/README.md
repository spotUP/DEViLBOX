# Musicline Playback

C++ port of the Musicline Amiga music player, with UADE (Unix Amiga Delitracker Emulator) as a reference backend.

## Building

Requires CMake 3.16+ and a C++17 compiler.

```bash
mkdir build
cd build
cmake ..
cmake --build . --parallel
```

The binary is output to `build/bin/mline_play`.

### Dependencies

- **Linux:** pthread, dl, m (linked automatically)
- **macOS:** CoreAudio (used by miniaudio, no extra setup needed)
- **Windows:** MSVC 2022+

No external library installs are required. UADE is built from source as a subdirectory, and [miniaudio](https://miniaud.io/) is included as a header-only library in `ext/`.

## Usage

```
mline_play <file.ml> [options]
```

### Backends

| Option | Description |
|--------|-------------|
| `-m, --mline` | Use MLINE (C++ port) backend (default) |
| `-u, --uade` | Use UADE (Amiga emulation) backend |
| `-s, --subsong <n>` | Select subsong (default: 0) |
| `--uade-data <path>` | Path to UADE data directory |

### Audio output

| Option | Description |
|--------|-------------|
| `--audio-out` | Real-time audio playback |
| `--rate <hz>` | Sample rate (default: 28150) |
| `--stereo-sep <0-1>` | Stereo separation, 0=mono, 1=full (default: 1.0) |

### WAV output

| Option | Description |
|--------|-------------|
| `-w, --wav <prefix>` | Write WAV file(s) and exit |
| `--per-channel` | Also write per-channel mono WAVs |
| `--duration <sec>` | Render duration in seconds (default: 30) |

### Examples

```bash
# Real-time playback with MLINE backend
./bin/mline_play song.ml --audio-out

# Real-time playback at 48kHz
./bin/mline_play song.ml --audio-out --rate 48000

# Render 10 seconds to WAV
./bin/mline_play song.ml -w /tmp/output --duration 10

# Render with per-channel WAVs (creates output_mline.wav + output_mline_ch0..chN.wav)
./bin/mline_play song.ml -w /tmp/output --duration 10 --per-channel

# Use UADE backend
./bin/mline_play song.ml -u -w /tmp/output --duration 10

# Play subsong 1
./bin/mline_play song.ml -s 1 --audio-out
```

### Keyboard controls (during --audio-out)

| Key | Action |
|-----|--------|
| `1` | Switch to UADE backend |
| `2` | Switch to MLINE backend |
| `c` | Cycle through channels (solo) |
| `a` | All channels (unmute) |
| `q` | Quit |

## Project Structure

```
musicline/          C++ port of the Musicline player
musicline/player/   Player tool (mline_play)
musicline/uade/     Modified UADE for reference playback
ext/                Third-party headers (miniaudio)
```

