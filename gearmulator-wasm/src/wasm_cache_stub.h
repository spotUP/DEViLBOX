// Stub for __builtin___clear_cache on Emscripten/WASM
// WASM has no instruction cache, so this is a no-op.
// This file is force-included before any asmjit compilation to patch the issue.

#pragma once

#ifdef __EMSCRIPTEN__
// Override the builtin to avoid the "llvm.clear_cache is not supported on wasm" error.
// WASM doesn't have an instruction cache, so flushing is unnecessary.
#define __builtin___clear_cache(start, end) ((void)(start), (void)(end))
#endif
