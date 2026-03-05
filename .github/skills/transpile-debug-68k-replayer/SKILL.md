---
name: transpile-debug-68k-replayer
description: Transpile 68k assembly music replayers to C and debug waveform mismatches against UADE reference output. Use this when transpiling Amiga replayer assembly, debugging transpiled replayer output, or comparing waveforms with UADE.
---

# Transpile and Debug 68k Replayer Waveform Mismatch

Transpile 68k assembly music replayers to C and systematically debug waveform mismatches between a transpiled C replayer and the UADE reference rendering. **UADE is the ground truth** -- it runs the original 68k assembly on an accurate Amiga emulator. The transpiled C code is correct when its output is near-binary-identical to UADE's output. Uses binary bisection of effects to isolate the problem, then printf-based debugging to fix it.

Applies to **any** transpiled Amiga music replayer (SNX, TFMX, Fred, Hippel, SidMon, SoundMon, JamCracker, etc.).

## Ground Truth

- **UADE rendering = truth.** Render the module through UADE to produce a reference WAV.
- **Transpiled C = candidate.** Render the same module through the transpiled native player.
- **Goal: waveform 1:1 match.** The transpiled output is done when its waveform matches UADE's (allowing only for expected phase offset from DMA timing differences).

## Arguments

- `PLAYER_FORMAT`: replayer format name (e.g. `snx`, `tfmx`, `fred`, `hippel`)
- `SONG_PATH`: path to the module file
- `CHANNEL`: channel number (0-3 for 4-channel Amiga replayers; 0-7 for multi-channel)

## Constants

```
PROJECT_DIR   = <replayer project root — contains build/, players/, tools/>
PLAYER        = $PROJECT_DIR/build/${PLAYER_FORMAT}_play
COMPARE_WAV   = $PROJECT_DIR/build/compare_wav
WAVEFORM_PNG  = $PROJECT_DIR/build/waveform_png
PATCH_TOOL    = $PROJECT_DIR/tools/${PLAYER_FORMAT}_patch_effects.py  (if available)
WORK_DIR      = /tmp/${PLAYER_FORMAT}_debug_ch${CHANNEL}
C_SOURCE      = $PROJECT_DIR/players/${PLAYER_FORMAT}/${PLAYER_FORMAT}_player.c
ASM_SOURCE    = $PROJECT_DIR/players/${PLAYER_FORMAT}/<OriginalDriver>.asm
SAMPLE_RATE   = 48000
SHORT_DUR     = 15
```

Adjust paths based on the actual replayer project structure. The transpiled C source
lives alongside the original assembly source it was generated from.

## Procedure

Follow these phases in order. Use a task list to track progress.

### Phase 0: Setup

1. Build: `cd $PROJECT_DIR && mkdir -p build && cd build && cmake .. && make -j$(nproc) ${PLAYER_FORMAT}_play compare_wav waveform_png`
2. Clean work dir: `rm -rf $WORK_DIR && mkdir -p $WORK_DIR`
3. Verify song loads: `$PLAYER $SONG_PATH` -- confirm it parses OK and shows instrument/song info.
4. Read both `$C_SOURCE` and `$ASM_SOURCE` to understand the replayer's architecture:
   - How channels are processed (per-tick, per-frame, per-interrupt)
   - What effects the replayer supports (volume, portamento, vibrato, arpeggio, etc.)
   - How instruments/samples are loaded and triggered

### Phase 1: Baseline -- all effects disabled

**Goal:** Confirm native and UADE match when no effects are active.

If a patch tool exists for this format:
1. Patch all effects off: `python3 $PATCH_TOOL "$SONG_PATH" $WORK_DIR/patched_none --disable-all`
2. Render both backends with the patched file.

If no patch tool exists:
1. Temporarily modify `$C_SOURCE` to skip all effect processing (comment out effect handlers).
2. Render both backends with the original song file.

Render:
```
$PLAYER <song> -c $CHANNEL --wav $WORK_DIR/baseline_native.wav --duration $SHORT_DUR
$PLAYER <song> -c $CHANNEL --wav $WORK_DIR/baseline_uade.wav --uade --duration $SHORT_DUR
```

Compare: `$COMPARE_WAV $WORK_DIR/baseline_native.wav $WORK_DIR/baseline_uade.wav`

Parse output: `activity=X rms=X env=X fft=X transient=X local=X passed=X`
- **passed=1**: Proceed to Phase 2.
- **passed=0**: Problem is fundamental (note playback, sample decoding, period tables). Generate diagnostics (overview + zoom PNGs), report to user, ask whether to continue debugging at this level.

### Phase 2: Effect bisection -- find the culprit

**Goal:** Re-enable effects one at a time until the comparison breaks.

First, enumerate all effects the replayer supports by reading the source code. Common Amiga replayer effects include:
- **Volume commands** (set volume, volume slide)
- **Tempo/speed commands** (set BPM, set tick speed)
- **Portamento** (pitch slide up/down, tone portamento)
- **Vibrato** (periodic pitch modulation)
- **Arpeggio** (rapid note cycling)
- **Tremolo** (periodic volume modulation)
- **Sample offset** (start playback from offset)
- **Pattern break/jump** (flow control)
- **Retrigger** (re-trigger note within a row)
- **Note delay** (delay note start by N ticks)
- **Filter control** (LED filter on/off)
- **Synth/waveform effects** (format-specific)

For each effect:
1. Re-enable ONLY that effect (all others still disabled).
2. Render both backends, compare.
3. **passed=1**: Effect is fine, continue to next.
4. **passed=0**: This effect causes mismatch. Generate diagnostics (overview, zoom, spectrogram PNGs).

Report which effects pass/fail individually. If multiple fail, test combinations to find interactions.

### Phase 3: Debug with printf instrumentation

**Goal:** Add targeted debug prints to narrow down the root cause.

1. Read the failing effect's implementation in `$C_SOURCE` (the transpiled C).
2. Read the equivalent code in `$ASM_SOURCE` (the original 68k assembly).
3. Add `fprintf(stderr, ...)` in the C code at key decision points:
   - Channel number, tick count, effect parameters
   - Resulting state changes (period, volume, sample pointer)
4. Add matching `printf` in the assembly at the equivalent locations using the `printf.i` macro.
5. Rebuild.
6. Render both backends with the UNPATCHED song, capturing stderr:
   ```
   $PLAYER "$SONG_PATH" -c $CHANNEL --wav $WORK_DIR/debug_native.wav --duration $SHORT_DUR 2>$WORK_DIR/debug_native.log
   $PLAYER "$SONG_PATH" -c $CHANNEL --wav $WORK_DIR/debug_uade.wav --uade --duration $SHORT_DUR 2>$WORK_DIR/debug_uade.log
   ```
7. Compare the debug logs side-by-side. Look for the first point of divergence.
8. The divergence reveals the bug. Fix the C code.

**Assembly printf syntax:** `printf "format",reg1,reg2` -- see `uade/player/printf.i`
- `%ld` (32-bit signed), `%hd` (16-bit signed), `%lx` (32-bit hex), `%hx` (16-bit hex)

**Debug loop:** Hypothesize -> Fix C code -> Rebuild -> Re-render -> Re-compare -> Repeat until passed=1.

### Phase 4: Full-duration validation

Render 120s (or full song length) with both backends, compare. If passed=0, generate overview to find divergence point, zoom in, return to Phase 3 for the new issue.

### Phase 5: Unpatched song validation

Render the ORIGINAL song (no patching, all effects enabled) full duration. If passed=0, an effect interaction is the cause -- cross-reference Phase 2 results.

### Phase 6: Visual verification

Generate final PNG proof: overview, zoom (start/mid/end), spectrogram. View all images. Check:
- Waveform shapes match (cycle width, amplitude, envelope)
- No unexpected silence or noise regions
- Phase shift is acceptable (expected, see notes)
- Spectrogram shows similar frequency content

### Phase 7: Regression check

Find 2-3 other module files of the same format. Render and compare each. Report results.

### Phase 8: Cleanup and report

1. Remove all debug printfs from C and ASM
2. Rebuild clean
3. Final render + compare to confirm
4. Summarize: failing effect(s), root cause, fix details, final metrics, regression results, image paths

## Important Notes

- **Phase shift between UADE and native is expected and irrelevant.** Compare shape (cycle width, envelope, amplitude), not starting position.
- **Pass criteria for compare_wav:** activity>=0.90, rms>=0.60, transient>=0.55, fft>=0.50, local>=0.50
- **Always view generated images** -- use the Read tool on PNG files.
- **Keep debug printfs minimal and targeted.** Too many prints slow UADE rendering significantly.
- Match printf locations in C and ASM exactly so logs can be compared line-by-line.
- When no patch tool exists for a format, create one or manually disable effects in the transpiled C source. The patch tool pattern (copy module + disable specific effect byte patterns) can be adapted to any format.
- **Cross-reference with original 68k ASM** -- the transpiled C should match the assembly 1:1. When the C diverges from UADE, the bug is in how the transpiler (or manual port) translated a specific instruction sequence. Always read both sources side-by-side.
- For replayers with complex synth/waveform generation (e.g. SidMon, SonicArranger), the "effects" may include waveform table processing, ADSR envelopes, and filter calculations. Bisect these as individual subsystems.
