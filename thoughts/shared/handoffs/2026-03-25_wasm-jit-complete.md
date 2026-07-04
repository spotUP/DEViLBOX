---
date: 2026-03-25
topic: dsp56300-wasm-jit
tags: [gearmulator, dsp56300, wasm, jit, handoff]
status: in-progress
---

# DSP56300 WASM JIT — Complete Session Handoff

## Goal

Make the Access Virus B synth play in real-time in the browser. The DSP56300 interpreter runs at ~5% real-time (30 MIPS, needs 108 MIPS). A WASM JIT dynamically compiles hot DSP56300 basic blocks to WebAssembly modules at runtime using the "late linking" technique.

## Key Discovery: Interpreter Is Accurate

The native interpreter produces audio **identical** to the native JIT (cross-correlation = 1.0000). The problem was never interpreter accuracy — it's purely throughput. The previous session's "wrong sound" was from a broken snapshot, not the interpreter.

## What Was Built

### Phase 1: Infrastructure (complete, working)

All files at `third-party/gearmulator-main/source/dsp56300/source/dsp56kEmu/wasmjit/`:

| File | Size | Purpose |
|------|------|---------|
| `WasmBinaryBuilder.h/.cpp` | 16KB | Emits valid WASM binary modules (LEB128, sections, 40+ opcodes) |
| `WasmDspState.h/.cpp` | 10KB | Fixed-layout 436-byte struct for JIT register access, sync to/from DspRegs |
| `WasmJitCache.h/.cpp` | 4KB | PC→slot mapping, hot counting (threshold=3), free-list slot recycling |
| `WasmJitBridge.h/.cpp` | 3KB | EM_JS bridge for WebAssembly.Module() compile + table dispatch |
| `WasmJitEmitter.h/.cpp` | 16KB | DSP56300→WASM opcode translator |

Integration in dsp56kEmu:
- `dsp.h` — `WasmJitCache` + `WasmDspState` members, `op_ExecJitBlock` method (all `#ifdef __EMSCRIPTEN__`)
- `dsp.cpp` — `op_ExecJitBlock`, `tryCompileBlock`, hit counting in `execOp()`, cache invalidation in `notifyProgramMemWrite`
- `gearmulator-wasm/CMakeLists.txt` — wasmjit sources added to dsp56kEmu for Emscripten builds

### Phase 2: Opcode Coverage (implemented, has runtime bug)

The emitter now handles:
- **Parallel instruction dispatch** with register latching (exec_parallel semantics)
- **Movexy** — dual XY parallel moves (19.2% of firmware)
- **Move_xx** — 8-bit immediate (7.1%)
- **Movex_ea / Movey_ea** — effective address with MMMRRR addressing (10%)
- **Movex_aa / Movey_aa** — 6-bit absolute address (5.4%)
- **Mover** — register-to-register via ddddd encoding (1.5%)
- **ALU**: ADD, SUB, CLR, TFR, ABS, NEG, TST
- Uses the `Opcodes` class for decoding (same opcode tables as the interpreter)

Total coverage: ~43% of Virus B firmware instruction mix.

## Current Status: JIT Blocks Compile But Crash On Execution

### What works
- Hot block detection: blocks reach hit threshold and trigger compilation
- WASM module generation: `WasmBinaryBuilder` produces valid WASM binaries
- Module compilation: `WebAssembly.Module()` succeeds (shared memory import fixed)
- Table management: slots allocated, functions stored in `WebAssembly.Table`
- Graceful fallback: try/catch in `_wasm_jit_call` catches crashes, returns sentinel, interpreter continues

### What fails
- **Block execution crashes with `memory access out of bounds`**
- Slots 35 and 36 are the first compiled blocks, both crash
- statePtr = 0x55F9B20 (~86MB) — valid within 128MB WASM heap
- The crash is inside the generated WASM code, not in the bridge

### Likely root cause
The `emitMemRead` function computes `xMemBase + address * 4` where:
- `xMemBase` is loaded from WasmDspState (a C++ heap pointer, valid in WASM)
- `address` comes from an address register R[n]

If R[n] contains a large or garbage value, the computed address goes OOB. This could be:
1. A bug in the emitter's register encoding (wrong ddddd → offset mapping)
2. A bug in the addressing mode computation (wrong MM/MMM field parsing)
3. The state sync not copying all register values correctly
4. An issue with how the emitter handles the first instruction in a block (statePtr might not be loaded correctly)

## Three JS Bridge Bugs Fixed This Session

1. **Shared memory mismatch**: JIT modules declared non-shared memory import but Emscripten uses SharedArrayBuffer with pthreads. Fix: memory import flags=0x03 (shared + has_max) with max=8192 pages.

2. **Pthread globalThis isolation**: Each Emscripten pthread is a separate Web Worker. `Module._jitTable` set on one thread is invisible to another. Fix: use `globalThis._jitTable` + lazy init in `_wasm_jit_compile`.

3. **HEAPU8 unavailable in pthreads**: `HEAPU8` global doesn't exist in pthread EM_JS context. Fix: use `new Uint8Array(wasmMemory.buffer, ptr, len)` to access memory directly.

## Debug Steps for Next Session

### 1. Dump and disassemble the crashing block

Add code to `tryCompileBlock` to save the WASM bytes to a file:
```cpp
// After auto wasmBytes = emitter.finalize();
// Write to a debug file for inspection
FILE* dbg = fopen("/tmp/jit_block.wasm", "wb");
fwrite(wasmBytes.data(), 1, wasmBytes.size(), dbg);
fclose(dbg);
```

Then disassemble: `wasm-dis /tmp/jit_block.wasm` or `wasm-tools print /tmp/jit_block.wasm`

### 2. Check register encoding

Verify that `getDddddRegInfo()` returns correct WasmDspState offsets for all 32 register encodings. Cross-reference with the DSP56300 manual's 5-bit register table.

### 3. Add bounds checking to emitMemRead

Before the final `i32.load(0)`, add a bounds check:
```
// if (absAddr >= memorySize) return sentinel
local.tee(tmpAddr)
i32.const(MAX_WASM_MEMORY)
i32.ge_u
if (i32)
  i32.const(-1)  // sentinel
  return
end
local.get(tmpAddr)
i32.load(0)
```

### 4. Simplify: test with register-only blocks first

Temporarily disable memory-accessing instructions in the emitter (return false for all MOVE variants that touch X/Y memory). Only allow register-to-register moves and ALU. If those blocks work, the memory access codegen is the bug.

## Files Modified This Session

| File | What Changed |
|------|-------------|
| `dsp56kEmu/wasmjit/WasmBinaryBuilder.cpp` | Shared memory import (flags=0x03 + max pages) |
| `dsp56kEmu/wasmjit/WasmJitBridge.cpp` | globalThis for pthread, wasmMemory direct access, lazy init, try/catch |
| `dsp56kEmu/wasmjit/WasmJitEmitter.h` | Opcodes class, parallel move methods, 7 i32 + 4 i64 locals |
| `dsp56kEmu/wasmjit/WasmJitEmitter.cpp` | Full parallel move support, 6 MOVE variants, ddddd register decoding |
| `dsp56kEmu/wasmjit/WasmDspState.h` | Accumulator sub-registers, sc/vba/sz/ep, offset constants |
| `dsp56kEmu/wasmjit/WasmDspState.cpp` | Sync functions, static_asserts |
| `dsp56kEmu/wasmjit/WasmJitCache.h/.cpp` | Hot counting, blacklisting, slot management |
| `dsp56kEmu/dsp.h` | JIT members (#ifdef __EMSCRIPTEN__) |
| `dsp56kEmu/dsp.cpp` | op_ExecJitBlock, tryCompileBlock, hit counting, debug logging |
| `gearmulator-wasm/CMakeLists.txt` | wasmjit sources, profile_opcodes tool |

## Virus B Firmware Opcode Profile

Full profile at `thoughts/shared/research/2026-03-25_virus-opcode-profile.md`.

Top categories:
- MOVE variants: 55% (Movexy 19.2%, Move_xx 7.1%, Movex/y_ea ~10%, Movex/y_aa ~5.4%)
- ALU with parallel moves: 10% (MACR, MAC, MPY, MPYR with XY moves)
- Transfer conditional (Tcc): 5.6%
- Control flow (Jcc, JMP, RTS, Bcc): 7%

## Specs & Plans

- Spec: `docs/superpowers/specs/2026-03-25-dsp56300-wasm-jit-design.md`
- Plan: `docs/superpowers/plans/2026-03-25-dsp56300-wasm-jit.md`
- Opcode profile: `thoughts/shared/research/2026-03-25_virus-opcode-profile.md`

## Earlier Session: Gearmulator Synth Fixes

Before the JIT work, this session also:
- Confirmed interpreter produces identical audio to JIT (correlation=1.0)
- Fixed the snapshot dumper (memory size 64K→256K, peripheral register capture)
- Identified that snapshot restoration crashes due to C++ runtime state (callbacks, interrupt queues)
- Reverted to full boot mode (which produces correct audio)
- Set clock to 100% and removed 0.25x gain compensation
- Offline "Render & Play" at 100% clock sounds correct (user confirmed)
