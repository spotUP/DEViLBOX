---
date: 2026-02-28
topic: sunvox-integration
tags: [sunvox, wasm, emscripten, tracker, synth, framebuffer]
status: final
---

# SunVox Integration — Design

## Goal

Four features:
1. **WASM engine** — Emscripten port of `sunvox_engine` for audio playback
2. **SunVox channel type** — extend DEViLBOX's existing tracker pattern editor with SunVox-compatible channels (like TB-303)
3. **Synth module UIs** — both React parameter panels (from `psynth_control[]`) and hardware framebuffer editors (sundog window_manager compiled to WASM)
4. **Song/patch import-export** — `.sunvox` song and `.sunsynth` patch save/load via engine-native binary I/O

## Architecture

No TypeScript parsers for file formats. All binary I/O handled inside the WASM engine. Two WASM builds: one for audio (`SunVoxWrapper.c`), one for UI framebuffer (`SunVoxUI.c`). React components read parameter definitions live from WASM at mount time — no hardcoded parameter lists in TypeScript.

Source: `Reference Code/sunvox_sources-master/` (sunvox_engine + sundog_engine).

---

## Section 1: WASM Engine Layer

### Build (`sunvox-wasm/`)

```
sunvox-wasm/
  src/
    SunVoxWrapper.c       # Audio engine C bridge
    SunVoxUI.c            # sundog framebuffer UI C bridge
  build/
    Makefile              # emcc invocation → public/sunvox/
public/sunvox/
  SunVox.js + .wasm       # Audio engine binary
  SunVoxUI.js + .wasm     # Framebuffer UI binary
  SunVox.worklet.js       # AudioWorklet
```

### Exported functions (SunVoxWrapper.c)

```c
// Engine lifecycle
int  sunvox_init(int sample_rate);
void sunvox_destroy(int handle);

// Song operations
int  sunvox_load_song(int handle, void* data, int size);
int  sunvox_save_song(int handle, void** out_data, int* out_size);

// Module (synth) operations
int  sunvox_add_module(int handle, int type);
int  sunvox_load_synth(int handle, void* data, int size);
int  sunvox_save_synth(int handle, int module_id, void** out, int* size);
int  sunvox_get_control_count(int handle, int module_id);
void sunvox_get_control(int handle, int module_id, int ctl_id,
                        char* out_name, float* out_min, float* out_max, float* out_cur);
void sunvox_set_control(int handle, int module_id, int ctl_id, float value);

// Playback
void sunvox_note_on(int handle, int module_id, int note, int vel);
void sunvox_note_off(int handle, int module_id);
void sunvox_render(int handle, float* outL, float* outR, int frames);
```

### Exported functions (SunVoxUI.c)

```c
int   sunvox_ui_create(int width, int height);
void  sunvox_ui_destroy(int handle);
void  sunvox_ui_set_module(int handle, int module_id);
void  sunvox_ui_mouse_event(int handle, int type, int x, int y, int btn);
void  sunvox_ui_key_event(int handle, int key, int mod);
void  sunvox_ui_tick(int handle);
void* sunvox_ui_get_framebuffer(int handle);  // BGRA pixels
```

### AudioWorklet (`SunVox.worklet.js`)

Single-instance worklet. Receives `note-on`, `note-off`, `set-control` messages. Calls `sunvox_render()` per quantum. Same structure as `Hively.worklet.js`.

### TypeScript facade (`src/engine/sunvox/SunVoxSynth.ts`)

Loads the worklet, sends messages, exposes:
- `noteOn(moduleId, note, vel)`
- `noteOff(moduleId)`
- `setControl(moduleId, ctlId, value)`
- `loadSong(buffer: ArrayBuffer): Promise<void>`
- `saveSong(): Promise<ArrayBuffer>`
- `loadSynth(buffer: ArrayBuffer): Promise<number>` (returns moduleId)
- `saveSynth(moduleId: number): Promise<ArrayBuffer>`
- `getControls(moduleId: number): Promise<SunVoxControl[]>`

---

## Section 2: SunVox Channel in the Tracker

Following the TB-303 pattern exactly.

### Type changes

**`src/types/tracker.ts`** — add `'sunvox'` to `channelType`, `sunvoxModuleId` to `channelMeta`:

```typescript
channelMeta?: {
  channelType?: 'sample' | 'synth' | 'hybrid' | 'sunvox';
  sunvoxModuleId?: number;  // which psynth module this channel drives
}
```

No new `TrackerCell` fields. Reuse `flag1`/`flag2` for future use; effect column (`effTyp`/`eff`) carries SunVox FX commands.

### Auto-channel creation

When a SunVox instrument is inserted, one `'sunvox'` channel is created per module, tagged with `sunvoxModuleId`.

### Channel renderer (`src/pixi/views/sunvox/PixiSunVoxChannelView.tsx`)

- Note column: standard tracker note names (C-4, D#5, ===, ---)
- Velocity column: 2-hex digits
- FX column: SunVox effect code + parameter

### Playback routing

Song player checks `channelType === 'sunvox'`, routes note events to `SunVoxSynth.noteOn(moduleId, note, vel)` instead of sample playback.

---

## Section 3: Synth Module UIs

Both editors share the same WASM engine instance. Changing a knob in either updates the same `psynth_control` state.

### React parameter panel (`src/components/instruments/controls/SunVoxControls.tsx`)

At mount: calls `sunvox_get_control_count()` + `sunvox_get_control()` loop to build a `SunVoxControl[]` array. Renders a generic knob/slider grid. No hardcoded parameter lists — all psynth types work automatically.

For common modules (Generator, FM, SpectraVoice, Kicker, Sampler), an optional styled overlay component layers labeled knobs at correct positions, similar to `JC303StyledKnobPanel.tsx`.

### Hardware framebuffer UI (`src/components/instruments/controls/SunVoxFramebufferView.tsx`)

Canvas component. On mount: `sunvox_ui_create(w, h)` + `sunvox_ui_set_module(handle, moduleId)`. Each `rAF`:
1. `sunvox_ui_tick(handle)`
2. `sunvox_ui_get_framebuffer(handle)` → BGRA pixels
3. BGRA→RGBA byte swap → `ctx.putImageData()`

Mouse/key events forwarded to `sunvox_ui_mouse_event()` / `sunvox_ui_key_event()`.

For modules without a native `WINDOWPTR visual`, sundog renders the standard SunVox parameter grid from `psynth_control[]`.

### Toggle

Both editors always available. User toggles between them via a tab/button in the instrument editor panel.

---

## Section 4: Song / Patch Import-Export

### Song (`.sunvox`)

- **Import**: File picker → `ArrayBuffer` → `sunvox_load_song(handle, data, size)` → query modules + patterns from WASM → reconstruct DEViLBOX `TrackerSong`
- **Export**: `sunvox_save_song(handle, &out, &size)` → copy from WASM heap → `URL.createObjectURL(blob)` download

### Instrument patch (`.sunsynth`)

- **Save**: `sunvox_save_synth(handle, moduleId, &out, &size)` → download `<name>.sunsynth`
- **Load**: File picker → `sunvox_load_synth(handle, data, size)` → new `moduleId` replaces slot

### UI (InstrumentList.tsx)

- Per-instrument Download/Upload buttons for SunVox instruments (same pattern as Hively `.ahi` buttons)
- "Import from .sunvox…" button in action bar → file picker → `sunvox_load_song()` → dialog listing modules (reuse `HivelyImportDialog` pattern) → import selected into current song

No `parseModuleToSong.ts` changes — `.sunvox` is never routed through libopenmpt.

---

## Files

| File | Change |
|------|--------|
| `sunvox-wasm/src/SunVoxWrapper.c` | New — audio engine C bridge |
| `sunvox-wasm/src/SunVoxUI.c` | New — sundog framebuffer UI C bridge |
| `sunvox-wasm/build/Makefile` | New — Emscripten build |
| `public/sunvox/SunVox.worklet.js` | New — AudioWorklet |
| `src/engine/sunvox/SunVoxSynth.ts` | New — TS facade |
| `src/pixi/views/sunvox/PixiSunVoxChannelView.tsx` | New — channel cell renderer |
| `src/components/instruments/controls/SunVoxControls.tsx` | New — React parameter panel |
| `src/components/instruments/controls/SunVoxFramebufferView.tsx` | New — sundog canvas + rAF blit |
| `src/components/instruments/SunVoxImportDialog.tsx` | New — import-from-.sunvox modal |
| `src/types/tracker.ts` | Add `'sunvox'` channelType + `sunvoxModuleId` |
| `src/types/instrument.ts` | Add `SunVoxConfig`, `DEFAULT_SUNVOX` |
| `src/components/instruments/InstrumentList.tsx` | Download/Upload + import dialog for SunVox |
| `src/components/tracker/TrackerView.tsx` | Wire `showSunVoxImport` prop |
| Song player | Add `sunvox` channel type routing |

---

## Success Criteria

**Automated:**
- `npx tsc --noEmit` — zero errors
- WASM builds without error (`emmake make` in `sunvox-wasm/build/`)
- Unit tests: `SunVoxSynth` load/save round-trip, `getControls()` returns expected fields

**Manual:**
- Load a `.sunvox` file → song plays back with correct BPM and notes
- Open a SunVox instrument → React knob panel shows correct parameter names from WASM
- Toggle to hardware UI → sundog framebuffer renders the module's native editor
- Change a knob in React → hardware UI reflects the change on next tick
- Save instrument → `.sunsynth` opens in real SunVox without error
- Play a note in the tracker on a SunVox channel → audio from the WASM engine
