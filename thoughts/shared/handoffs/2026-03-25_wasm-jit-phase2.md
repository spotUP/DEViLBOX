---
date: 2026-03-25
topic: dsp56300-wasm-jit-phase2
tags: [gearmulator, dsp56300, wasm, jit]
status: in-progress
---

# DSP56300 WASM JIT — Phase 2 Progress

## What Was Done

### Phase 2: Parallel Moves + MOVE Variants

1. **Opcode profiler** — Built a static analysis tool (`profile_opcodes.cpp`) that scans the Virus B firmware's P-memory and counts instruction types. Results saved at `thoughts/shared/research/2026-03-25_virus-opcode-profile.md`. Key finding: 55% of instructions are MOVE variants, 10% are ALU with parallel moves.

2. **WasmJitEmitter expanded** — The Phase 2 opus agent added:
   - Opcodes class integration for opcode decoding (same tables as interpreter)
   - Parallel instruction dispatch with register latching (exec_parallel semantics)
   - Movexy (dual XY parallel moves — 19.2% of firmware)
   - Move_xx (immediate — 7.1%)
   - Movex_ea / Movey_ea (effective address — ~10%)
   - Movex_aa / Movey_aa (absolute address — ~5.4%)
   - Mover (register-to-register — 1.5%)
   - Additional ALU: TFR, ABS, NEG, TST
   - ddddd register decoding for all 5-bit register encodings
   - Memory access helpers (emitMemRead, emitMemWrite)
   - AGU address computation (2-bit MM, 3-bit MMM addressing modes)

3. **JS Bridge fixes** — Three bugs found and fixed:
   - **Shared memory**: JIT-generated modules must import shared memory (flags=0x03 with max pages) to match Emscripten's SharedArrayBuffer
   - **Pthread scope**: `Module._jitTable` is not shared between pthreads — each pthread has its own `globalThis`. Fixed with lazy init on DSP thread.
   - **HEAPU8 unavailable**: In pthread EM_JS context, `HEAPU8` is undefined. Fixed with `new Uint8Array(wasmMemory.buffer, ptr, len)`.

### Current State

**JIT blocks ARE compiling and executing** — we see:
- `[WASM JIT] Initialized table with 256 slots` (main thread)
- `[WASM JIT] Lazy init on DSP thread` (DSP pthread)
- Compilation succeeds (no compile errors)
- **But execution crashes with `memory access out of bounds`**

This means the WasmBinaryBuilder produces valid WASM and the instantiation works, but the **generated code accesses invalid memory addresses**. The emitter's memory access patterns (loading from X/Y memory via WasmDspState base pointers) produce addresses that fall outside the WASM linear memory bounds.

## Root Cause of Crash

The `memory access out of bounds` error likely comes from one of:
1. **WasmDspState base pointers not set correctly** — `syncToWasmState` computes `pMemBase`/`xMemBase`/`yMemBase` from `mem.getMemAreaPtr()` which returns a C++ pointer. This pointer is a valid address within the Emscripten linear memory heap. The JIT code uses this as a base and adds `address * 4` to get the WASM linear memory offset. If the base pointer is wrong (e.g., it's a native pointer instead of a WASM heap offset), the access goes OOB.
2. **The statePtr itself** — `wasmJitCallBlock(slot, &m_wasmDspState)` passes the address of the state struct. If the struct is on the C++ stack (which is in WASM linear memory), the pointer should be valid. But if it's on a pthread stack that's outside the main heap... this could be the issue.
3. **emitMemRead/emitMemWrite** in the emitter may be computing addresses incorrectly.

## Debug Next Steps

1. Add a try/catch in `_wasm_jit_call` to log which block crashed (pass PC as second arg to the compiled function)
2. Dump the first compiled block's WASM bytes to validate them with `wasm-dis` or `wasm-tools`
3. Check that `syncToWasmState` produces valid WASM heap addresses for the memory base pointers
4. Try executing a simpler block first — e.g., one that only does register-to-register moves (no memory access)

## Files Modified in This Session

| File | Changes |
|------|---------|
| `wasmjit/WasmJitEmitter.h` | Expanded with Opcodes class, parallel move methods, addressing modes |
| `wasmjit/WasmJitEmitter.cpp` | Full parallel instruction support, 6 MOVE variants, additional ALU |
| `wasmjit/WasmJitBridge.cpp` | globalThis for pthread, wasmMemory access, shared memory, lazy init |
| `wasmjit/WasmBinaryBuilder.cpp` | Shared memory import (flags=0x03 + max pages) |
| `dsp.cpp` | Debug printf in tryCompileBlock + execOp |
| `gearmulator-wasm/CMakeLists.txt` | wasmjit sources, profile_opcodes tool |

## Key Findings

1. **Interpreter is 100% accurate** — native interpreter produces audio identical to JIT (correlation=1.0)
2. **~43% of firmware instructions** now have emitter support (MOVEs + basic ALU)
3. **Emscripten pthread EM_JS** has isolated `globalThis` per thread — can't share state via Module properties
4. **SharedArrayBuffer memory** requires `flags=0x03` (shared + has_max) in WASM memory import

## Spec & Plan

- Spec: `docs/superpowers/specs/2026-03-25-dsp56300-wasm-jit-design.md`
- Plan: `docs/superpowers/plans/2026-03-25-dsp56300-wasm-jit.md`
- Opcode profile: `thoughts/shared/research/2026-03-25_virus-opcode-profile.md`
