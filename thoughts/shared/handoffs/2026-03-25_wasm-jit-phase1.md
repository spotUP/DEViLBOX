---
date: 2026-03-25
topic: dsp56300-wasm-jit-phase1
tags: [gearmulator, dsp56300, wasm, jit]
status: in-progress
---

# DSP56300 WASM JIT — Phase 1 Complete

## What Was Done

### Phase 1 Infrastructure (7 tasks, all complete)

1. **WasmBinaryBuilder** — Minimal WASM binary format emitter. LEB128, sections, ~40 instruction opcodes. Validated with Node.js (i32 add + i64 add tests pass).

2. **WasmDspState** — Fixed-layout struct (436 bytes) with all DSP56300 registers at stable offsets. Includes accumulator sub-registers (a0/a1/a2), hardware stack (ss[16]), modular addressing helpers (mMask/mModulo). Sync functions to/from DspRegs. 36 static_asserts for offset verification.

3. **WasmJitCache** — PC→slot mapping with hot counting (threshold=3), slot allocation with free-list recycling, blacklisting for un-compilable PCs, cache invalidation on P-memory writes.

4. **JS Bridge** — EM_JS functions: `wasmJitInit` (creates WebAssembly.Table), `wasmJitCompileBlock` (WebAssembly.Module + instantiate), `wasmJitCallBlock` (table dispatch), `wasmJitFreeSlot` (recycle). Native stubs for host testing.

5. **WasmJitEmitter** — Translates DSP56300 → WASM bytecode. Phase 1 opcodes: ADD (7 source variants), SUB, CLR. Register-to-register MOVE stubbed. 56-bit sign extension, CCR dirty flag.

6. **Interpreter Integration** — Hit counting in `execOp()`, `tryCompileBlock()` walks P-memory and emits via WasmJitEmitter, `op_ExecJitBlock` syncs state and dispatches via `wasmJitCallBlock`, cache invalidation hooked into `notifyProgramMemWrite`. CMakeLists updated.

7. **Validation** — WASM builds cleanly. Synth boots and runs correctly (3.5s boot, audio rendering). No regressions. No JIT blocks compiled yet (expected — Phase 1 opcodes are too few to form blocks >= 4 instructions).

### Key Files

```
dsp56kEmu/wasmjit/
  WasmBinaryBuilder.h/.cpp    — WASM binary emitter (13KB)
  WasmDspState.h/.cpp         — Register state struct + sync (10KB)
  WasmJitCache.h/.cpp         — Hot counting + slot management (4KB)
  WasmJitBridge.h/.cpp        — EM_JS compile/call/free (3KB)
  WasmJitEmitter.h/.cpp       — DSP56300 → WASM translator (14KB)
  test_wasm_builder.cpp       — Node.js validation test
  test_wasm_emitter.cpp       — Emitter validation test
```

Modified:
- `dsp.h` — JIT members (#ifdef __EMSCRIPTEN__)
- `dsp.cpp` — op_ExecJitBlock, tryCompileBlock, hit counting in execOp
- `gearmulator-wasm/CMakeLists.txt` — wasmjit sources added

### Key Discovery: Interpreter Produces Identical Audio

Before starting JIT work, we confirmed that the **native interpreter produces audio identical to the native JIT** (cross-correlation = 1.0000). This means the interpreter IS accurate — the previous "wrong sound" was from the broken snapshot, not the interpreter.

The real-time throughput problem (~5% real-time at 100% clock) is purely a speed issue — the interpreter dispatches ~30 MIPS but needs ~108 MIPS. The JIT should close this gap by eliminating per-instruction dispatch overhead.

## Next Steps — Phase 2

Phase 2 is where the real speedup happens. Priorities:

1. **Parallel move decoding** — The dominant instruction format in DSP56300. ALU+MOVE combined instructions with register latching semantics.
2. **Addressing modes** — Post-increment, immediate, absolute (with modular arithmetic).
3. **DO/ENDDO + REP** — Hardware loops, the inner audio processing construct.
4. **Remaining ALU** — CMP, NEG, ABS, AND, OR, EOR, shifts.
5. **Block chaining** — JIT block → JIT block without interpreter dispatch.

The Virus B firmware's audio inner loop is dominated by MAC/MPY with parallel moves. Phase 2 coverage should capture 80-90% of executed instructions.

### Performance target
- Phase 1: ~30 MIPS (interpreter baseline, no JIT blocks compiled)
- Phase 2 target: >108 MIPS (real-time audio)

## Spec & Plan

- Spec: `docs/superpowers/specs/2026-03-25-dsp56300-wasm-jit-design.md`
- Plan: `docs/superpowers/plans/2026-03-25-dsp56300-wasm-jit.md`

## Notes

- `printf` from DSP pthread doesn't appear in browser console (Emscripten proxy issue). Use `EM_ASM({ console.log(...) })` or write to a shared buffer for JIT diagnostics.
- The test page (`test-gearmulator.html`) has broken inline script handlers when served via Vite HMR. Works when clicking manually via DevTools evaluate_script or when served without Vite.
- Accumulator sub-register ccrAluResult is at offset 432 (not 428 as originally planned) due to 8-byte alignment padding.
