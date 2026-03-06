---
date: 2026-03-06
topic: available-skills
tags: [skills, workflow]
status: final
---

# Available Project Skills

## transpile-debug-68k-replayer

**Purpose:** Transpile 68k assembly music replayers to C and debug waveform mismatches against UADE reference output.

**When to use:**
- Transpiling Amiga replayer assembly to C
- Debugging transpiled replayer output vs UADE
- Comparing waveforms with UADE reference
- Integrating transpiled replayers into DEViLBOX with full editing, import/export

**Ground truth:** UADE rendering is authoritative. Transpiled C is correct when waveforms match UADE's output (allowing for expected phase offset).

**Key phases:**
1. **Phase 0:** Setup — build project, verify song loads
2. **Phase 1:** Baseline — all effects disabled, confirm native/UADE match
3. **Phase 2:** Effect bisection — enable effects one-at-a-time to find culprit
4. **Phase 3:** Debug with printf instrumentation — add targeted debug prints in C and ASM
5. **Phase 4-5:** Validation — full duration and unpatched song
6. **Phase 6:** Visual verification — PNG proof (overview, zoom, spectrogram)
7. **Phase 7:** Regression check — test 2-3 other modules
8. **Phase 8:** Cleanup — remove debug code, final render
9. **Phase 9:** WASM module — build Emscripten WASM for browser
10. **Phase 10:** TypeScript engine + import/export
11. **Phase 11:** Full pattern editing
12. **Phase 12:** Instrument editor with live parameters
13. **Phase 13:** Export and serialization

**Pass criteria for compare_wav:**
- activity>=0.90
- rms>=0.60
- transient>=0.55
- fft>=0.50
- local>=0.50

**DEViLBOX integration notes:**
- DOM and Pixi views must be 1:1 identical
- Use configRef pattern for knob callbacks (see CLAUDE.md)
- Instrument editors must expose ALL parameters
- Live editing is mandatory (parameter changes take effect immediately)
- Round-trip integrity: import → edit → export → re-import must preserve all data
