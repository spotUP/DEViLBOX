# Musicline Playback - Claude Context

This project is a C++ port of the Musicline Amiga music player, with A/B comparison testing against UADE (Unix Amiga Delitracker Emulator).

## Project Structure

- `musicline/` - C++ port of the Musicline player
- `musicline/uade/` - Modified UADE for reference playback
- `musicline/player/` - Player tool (`mline_play`)
- `musicline/asm-version/` - Original Amiga assembly source (`Mline116.asm`)
- `musicline/docs/` - Technical documentation

## Key UADE Modifications

### Audio Init Glitch Fix (audio.c)

**Problem:** The original Amiga player has an audio-silence-audio glitch at song start:
1. InitTune enables DMA with vol=63 - audio starts
2. First tick (`_PlayTune==2`) writes VOL=0 - silence
3. Second tick onwards - audio resumes normally

This creates ~10-20ms of audio, then silence, then the real playback.

**Solution:** State machine in `musicline/uade/uade/src/audio.c` that suppresses audio until the glitch completes:

```c
// State: 0=waiting, 1=seen VOL>0, 2=seen VOL=0 after VOL>0, 3=enabled
static int ml_init_state = 0;
static int ml_init_state2_count = 0;  // perchan_count when state 2 was entered
```

The hack waits for the pattern VOL>0 → VOL=0 → VOL>0 before enabling audio output. This skips the spurious first burst of audio.

**Important:** The 2→3 transition requires a minimum sample gap (300 samples) to prevent premature triggering. Without this, when the active note is on a non-ch0 channel, different channels' volume writes within the same tick can trigger the full 0→1→2→3 sequence in a single tick, causing the per-channel capture to start before the DMA restart completes.

See `musicline/docs/early-silence-mismatch.md` for detailed analysis.

### Other UADE Modifications

- Filter disabled for raw Paula output matching
- Resampler set to "none" for direct output
- DMA/volume tracing added for debugging (can be removed)

## IMPORTANT: NTSC Timing - DO NOT CHANGE

**Both UADE and MLINE use NTSC CIA timing (latch value 14318), NOT PAL.**

This is intentional and correct. The Musicline player was designed for NTSC timing. Previous Claude instances have repeatedly tried to "fix" this by switching to PAL timing - **DO NOT DO THIS**.

- **NTSC CIA latch:** 14318
- **PAL CIA latch:** 14187

The timing affects:
- Tick rate (how fast the song plays)
- Sample output rate
- A/B comparison alignment

If you see timing mismatches, the solution is NOT to change NTSC to PAL. Look for other causes.

## Common Commands

```bash
# Build
cd build && make -j8

# Play with MLINE backend (real-time audio)
./bin/mline_play ../musicline/songs/coyote.ml -m --audio-out

# Write WAV with MLINE backend
./bin/mline_play ../musicline/songs/coyote.ml -m -w /tmp/test --duration 5

# Write WAV with per-channel mono WAVs
./bin/mline_play ../musicline/songs/coyote.ml -m -w /tmp/test --duration 5 --per-channel

# Write WAV with UADE backend
./bin/mline_play ../musicline/songs/coyote.ml -u -w /tmp/test --duration 5
```

## Player Tool

The player tool (`mline_play`) supports both UADE and MLINE backends with real-time audio output (via miniaudio) and WAV file rendering. Per-channel mono WAVs can be generated for the MLINE backend.

### Key C++ fixes for ASM compatibility

**InitPlay PlayTune** (`module.cpp` InitTune): The ASM's InitPlay calls PlayTune before CIA interrupts start, processing row 0 (notes, instruments, ADSR initialization). The C++ now replicates this with `_bPlay = false; PlayTune();` in InitTune.

**Dma1 volume write** (`playinst_render.cpp` PlayDma): In the ASM, volume is written on every tick via two paths:
- Non-note ticks: PerVolPlay computes and writes volume (ch_Play bit 0 clear)
- New-note ticks: PerVolPlay skips (bit 0 set), but Dma1 (CIA timer handler, MusiclineEditor.asm:3718-3730) fires between ticks, clears bit 0, and writes the newly initialized instrument's volume

The C++ `newNoteTrigger` path now computes the volume from Volume3/CVolume/MasterVol (matching Dma1) instead of skipping the volume write entirely.

## ASM Debugging with printf

The assembly player source (`musicline/uade/player/MusiclineEditor.asm`) has access to a `printf` macro via `printf.i` that outputs debug text through UADE's trap interface at `$f0ff14`. This prints to stderr on the host.

```asm
    include printf.i

    ; Usage examples:
    printf "value: %ld",d0              ; print 32-bit signed from d0
    printf "pos=%hd per=%hd",d2,d3      ; print two 16-bit values
    printf "ptr=%lx len=%ld",a0,d1      ; hex pointer + decimal value
```

Format specifiers: `%d` `%u` `%x` `%X` `%s` `%%`
Size prefixes: `l`=32-bit (default), `h`=16-bit, `b`=8-bit
Up to 8 register/value arguments.

**Use this to trace ASM execution and compare behavior against the C++ port.** For example, add printf inside `FixWaveLength`, `DmaPlay`, or `PlayVoice` to see exactly what the ASM player does at specific points.

After adding printf statements, rebuild the player with `tools/build_player.sh`.

## ASM Reference

Key assembly routines in `MusiclineEditor.asm` (UADE version):
- `PlayMusic` (line ~1527): Main playback entry — dispatches `_PlayTune==2` (init volumes), `_PlayTune==1` (normal playback)
- `PlayTune` (line ~1552): Processes notes/instruments for current row
- `PerVolPlay` (line ~3485): Volume/period write to Paula — skips when ch_Play bit 0 is set
- `DmaPlay` (line ~3617): Two-phase DMA restart — phase 1 sets up DMA and starts CIA timer
- `Dma1` (line ~3718): CIA timer handler — clears ch_Play bit 0, writes volume/period/pointers
- `Dma2` (line ~3825): CIA timer phase 2 — writes repeat pointers

The `_PlayTune==2` check causes the first tick to write initial volumes and skip PlayTune (init glitch).

## Key File Reference

| File | Role |
|------|------|
| `player/main.cpp` | Player tool: WAV output, real-time audio playback |
| `module.cpp` InitTune | Song init — calls PlayTune() to match ASM InitPlay behavior |
| `module.cpp` UpdateChannel | Channel processing, per-channel WAV capture |
| `module.h` MLDebugFlags | Struct holding debug isolation flags |
| `playinst_render.cpp` PlayDma | Volume computation — handles both normal ticks (PerVolPlay) and new-note ticks (Dma1) |
| `uade/uade/src/audio.c` | Per-channel capture, init glitch handler |
| `uade/player/MusiclineEditor.asm` | UADE's ASM player — has printf debug traces (can be removed) |
| `sfx.cpp` StoreMix/NormalMix | Paula emulation for actual audio output (not used for comparison) |

