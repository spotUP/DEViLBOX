---
name: transpile-debug-68k-replayer
description: Transpile 68k assembly music replayers to C and debug waveform mismatches against UADE reference output. Use this when transpiling Amiga replayer assembly, debugging transpiled replayer output, comparing waveforms with UADE, or integrating transpiled replayers into DEViLBOX with full editing, instrument editors, import/export, and live parameter control.
---

# Transpile and Debug 68k Replayer Waveform Mismatch

Transpile 68k assembly music replayers to C and systematically debug waveform mismatches between a transpiled C replayer and the UADE reference rendering. Then integrate the transpiled replayer into DEViLBOX as a fully editable format with import/export, instrument editors, live parameter control, and dual DOM/Pixi views. **UADE is the ground truth** -- it runs the original 68k assembly on an accurate Amiga emulator. The transpiled C code is correct when its output is near-binary-identical to UADE's output. Uses binary bisection of effects to isolate the problem, then printf-based debugging to fix it.

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

### Phase 9: WASM Module for DEViLBOX

**Goal:** Build the transpiled C replayer as an Emscripten WASM module for browser playback and editing.

The WASM module lives in `${PLAYER_FORMAT}-wasm/` at the DEViLBOX project root. Follow the established pattern from existing modules (e.g., `jamcracker-wasm/`, `sonic-arranger-wasm/`).

1. Create `${PLAYER_FORMAT}-wasm/` directory with:
   - `CMakeLists.txt` — Emscripten build targeting `public/${PLAYER_FORMAT}/` output
   - `src/${PLAYER_FORMAT}_wrapper.c` — Bridge exposing `EMSCRIPTEN_KEEPALIVE` functions:
     - `load(uint8_t* data, int len)` — parse module file into internal state
     - `render(float* buf, int frames)` — render N frames of audio
     - `get_position()` / `set_position(int order, int row)` — playback position
     - `get_num_channels()`, `get_num_orders()`, `get_num_instruments()`
     - **Editing setters** (see Phase 11)
     - **Serialization** (see Phase 13)
   - Copy the transpiled C source and any required headers from `$PROJECT_DIR/players/${PLAYER_FORMAT}/`

2. Build: `cd ${PLAYER_FORMAT}-wasm/build && emcmake cmake .. && emmake make`
3. Verify output: `public/${PLAYER_FORMAT}/${PLAYER_FORMAT^}.js` + `.wasm` exist and load in browser.
4. Create AudioWorklet: `public/${PLAYER_FORMAT}/${PLAYER_FORMAT^}.worklet.js` — instantiates WASM, handles `render()` calls in audio thread, receives edit messages from main thread.

**Key constraint:** The WASM module must expose ALL internal state needed for editing — pattern data, instrument parameters, sequence/order list, song metadata. Read-only accessors are not enough; every field that can be imported must also be settable.

### Phase 10: TypeScript Engine + Import/Export

**Goal:** Create the TypeScript engine class and file format parser/exporter.

**Engine class** (`src/engine/${PLAYER_FORMAT}/${PLAYER_FORMAT^}Engine.ts`):
- Singleton pattern: `static getInstance()`, private constructor
- `load(data: ArrayBuffer)` — sends file data to AudioWorklet → WASM
- `play()`, `stop()`, `setPosition(order, row)`
- Edit methods that forward to worklet (see Phase 11)
- `serialize(): ArrayBuffer` — requests WASM to serialize current state back to file format

**Parser** (`src/lib/import/${PLAYER_FORMAT^}Parser.ts`):
- Parse the binary module file into DEViLBOX's internal `TrackerModule` / instrument structures
- Extract: song name, instruments (with all parameters), patterns (notes, effects, volumes), sequence/order list, sample data
- **Every field the format supports must be parsed** — do not skip "obscure" parameters. Read the format spec and the transpiled C loader thoroughly.
- Register in `src/lib/import/ImportRegistry.ts`

**Exporter** (`src/lib/export/${PLAYER_FORMAT^}Exporter.ts`):
- Serialize DEViLBOX state back to the native binary format
- Two modes:
  1. **WASM serialization** (preferred): Call `engine.serialize()` which uses the transpiled C code's own save routine — guarantees format correctness
  2. **TypeScript serialization** (fallback): Reconstruct the binary from parsed structures — needed when WASM engine isn't running
- Register in `src/lib/export/ExportRegistry.ts`

**Test with round-trip:** Import a module → export it → re-import → compare. Pattern data, instrument parameters, and sample data must survive the round-trip intact.

### Phase 11: Full Pattern Editing

**Goal:** Make the format fully editable in DEViLBOX's pattern editor — note entry, effect entry, instrument assignment, pattern/order management.

**WASM setter bindings** — Add `EMSCRIPTEN_KEEPALIVE` functions to the wrapper:
```c
void ${FORMAT}_set_pattern_step(int pattern, int row, int channel,
    int note, int instrument, int volume, int effect_cmd, int effect_val);
void ${FORMAT}_set_sequence_entry(int channel, int position, int pattern);
void ${FORMAT}_insert_pattern(int after_index);
void ${FORMAT}_delete_pattern(int index);
```

**Worklet message handlers** — Each setter gets a corresponding message type in the worklet:
```js
case 'setPatternStep': wasm._${FORMAT}_set_pattern_step(...msg.args); break;
```

**Engine edit methods** — TypeScript methods that post messages to the worklet:
```typescript
setPatternStep(pattern: number, row: number, channel: number, note: number, ...): void {
    this.worklet.port.postMessage({ type: 'setPatternStep', args: [...] });
    // Also update the local TrackerStore state for immediate UI feedback
}
```

**Pattern editor integration:**
- If the format uses a standard tracker layout (rows × channels with note/inst/vol/fx columns), integrate with the existing `PatternEditor.tsx` by providing a format-specific column definition
- If the format has a unique layout (e.g., JamCracker's 4-channel fixed, Klystrack's 5 sub-columns), create a dedicated `${Format}PatternEditor.tsx` in `src/components/tracker/`
- Wire keyboard input: note entry (Z-M / Q-P octaves), hex entry for effect values, Delete/Backspace to clear, record mode toggle
- Each keystroke → engine edit method → WASM state update → store update → UI re-render

**Format view** — Create both DOM and Pixi views:
- DOM: `src/components/tracker/${Format}View.tsx` — toolbar, order list, pattern grid
- Pixi: `src/pixi/views/${format}/Pixi${Format}View.tsx` — same layout using Pixi components
- Wire into `TrackerView.tsx` and `PixiTrackerView.tsx` routing (`editorMode === '${format}'`)
- **DOM and Pixi views must be visually 1:1** — same information, same layout, same controls

### Phase 12: Instrument Editor with Live Parameters

**Goal:** Create a dedicated instrument editor that exposes ALL parameters and supports live editing during playback.

**Enumerate all instrument parameters** by reading:
1. The format's instrument structure in the transpiled C source
2. The original 68k ASM instrument data layout
3. The parser's instrument extraction code
4. Reference documentation for the format (if available)

**Every parameter must be exposed.** Common Amiga instrument parameters include:
- Sample data (waveform, loop start, loop length, loop type)
- Volume envelope (ADSR, multi-point, sustain/release)
- Pitch envelope / arpeggio table
- Vibrato (speed, depth, delay, waveform)
- Filter parameters (cutoff, resonance, type, envelope)
- Waveform table / synth sequence (for synth-based formats like SidMon, SonicArranger)
- Portamento / glide settings
- Panning
- Format-specific: FM operator parameters, ring modulation, hard sync, PWM, etc.

**WASM setter for instrument parameters:**
```c
void ${FORMAT}_set_instrument_param(int instrument_index, int param_offset, int value);
// OR for complex params:
void ${FORMAT}_set_instrument_envelope(int instrument_index, uint8_t* data, int len);
void ${FORMAT}_set_instrument_sample(int instrument_index, int8_t* data, int len);
```

**Instrument editor component** (`src/components/instruments/controls/${Format}Controls.tsx`):
- Knobs/sliders for continuous parameters (volume, cutoff, resonance, etc.)
- Dropdowns for discrete choices (waveform type, filter mode)
- Envelope visualizer (graphical ADSR or point editor)
- Waveform display (sample waveform or synth waveform table)
- Arpeggio/sequence table editor (for formats with programmable sequences)
- **Use the configRef pattern** for all callbacks (see CLAUDE.md — Knob/Control Handling Pattern)

**Live parameter editing:**
- When the engine is playing, parameter changes must take effect IMMEDIATELY — no stop/restart
- onChange → engine.setInstrumentParam() → worklet message → WASM setter → DSP state updated
- The transpiled C code's instrument structure must be writable at runtime, not just at load time
- If the original replayer reads instrument data from a ROM-like buffer, the WASM wrapper must redirect reads to a mutable copy
- Verify live editing works: change a parameter while a note is sustaining and confirm the sound changes in real-time

**Wire into DEViLBOX instrument editor panel:**
- Register the controls component in `src/components/instruments/InstrumentPanel.tsx` (or equivalent router)
- The instrument editor appears when the user selects an instrument of this format type
- Support both DOM and Pixi rendering (create `Pixi${Format}Controls.tsx` if needed, or use the DOM overlay approach)

### Phase 13: Export and Serialization

**Goal:** Ensure the edited module can be saved back to the native binary format with all changes preserved.

**WASM serialization function:**
```c
int ${FORMAT}_serialize(uint8_t* out_buffer, int max_bytes);
// Returns actual byte count written, or -1 on error
```

This function reconstructs the native binary format from the current in-memory state — including all pattern edits, instrument parameter changes, sequence modifications, and metadata updates. It uses the same data structures the transpiled C code operates on, guaranteeing format correctness.

**Exporter integration:**
1. If WASM engine is running: call `serialize()` → get ArrayBuffer → return as Blob
2. If WASM engine is NOT running: reconstruct binary from TypeScript structures (parser's inverse)
3. Register format in the export dialog's format selector
4. Support "Save" (overwrite) and "Save As" (new filename) workflows

**Round-trip validation:**
1. Load a reference module
2. Make specific edits (change notes, modify instrument params, reorder sequence)
3. Export to native format
4. Re-import the exported file
5. Verify all edits are preserved — pattern data, instrument parameters, sequence, metadata
6. Render audio from the re-imported file and compare waveform to pre-export rendering

**Instrument import/export:**
- Individual instruments must be extractable (export single instrument to file)
- Instruments from one module must be importable into another module of the same format
- Cross-format instrument import where applicable (e.g., raw samples between any format)

## Important Notes

- **Phase shift between UADE and native is expected and irrelevant.** Compare shape (cycle width, envelope, amplitude), not starting position.
- **Pass criteria for compare_wav:** activity>=0.90, rms>=0.60, transient>=0.55, fft>=0.50, local>=0.50
- **Always view generated images** -- use the Read tool on PNG files.
- **Keep debug printfs minimal and targeted.** Too many prints slow UADE rendering significantly.
- Match printf locations in C and ASM exactly so logs can be compared line-by-line.
- When no patch tool exists for a format, create one or manually disable effects in the transpiled C source. The patch tool pattern (copy module + disable specific effect byte patterns) can be adapted to any format.
- **Cross-reference with original 68k ASM** -- the transpiled C should match the assembly 1:1. When the C diverges from UADE, the bug is in how the transpiler (or manual port) translated a specific instruction sequence. Always read both sources side-by-side.
- For replayers with complex synth/waveform generation (e.g. SidMon, SonicArranger), the "effects" may include waveform table processing, ADSR envelopes, and filter calculations. Bisect these as individual subsystems.

## DEViLBOX Integration Notes

- **DOM and Pixi views must be visually 1:1.** Every format view, instrument editor, and dialog must exist in both rendering modes with identical layout and functionality. No GL/DOM gaps by design.
- **Use the configRef pattern** for all knob/slider callbacks in instrument editors. See CLAUDE.md "Knob/Control Handling Pattern" — use `configRef.current` (not the config prop) to avoid stale state when multiple controls change rapidly.
- **Instrument editors must expose ALL parameters.** Do not hide or skip parameters because they seem obscure. If the format's instrument structure has a field, the editor must have a control for it.
- **Live editing is mandatory.** Parameter changes while playing must take effect immediately without restarting playback. This requires the WASM module's internal state to be mutable at runtime.
- **Store architecture:** Use `useFormatStore` for format-specific state (native data, patterns, instruments), `useTrackerStore` for core tracker state (positions, current instrument), `useEditorStore` for editor state (record mode, edit step).
- **Engine routing:** Register the format in `NativeEngineRouting.ts` with `suppressNotes = true` (the WASM engine plays the entire song, DEViLBOX doesn't trigger individual notes).
- **Factory registration:** Register the synth in `InstrumentFactory.ts` so the instrument picker can create instances.
- **Round-trip integrity is the acceptance test for export.** Import → edit → export → re-import must preserve all data. Render audio before and after export and compare waveforms.
