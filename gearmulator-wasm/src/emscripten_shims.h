// Emscripten platform shims for gearmulator
// Provides stubs for platform-specific APIs not available in WASM

#pragma once

#ifdef __EMSCRIPTEN__

// Provide SYS_gettid stub (threadtools.cpp uses syscall(SYS_gettid))
#ifndef SYS_gettid
#define SYS_gettid 0
#endif

// Stub syscall for Emscripten
#include <unistd.h>
#include <sys/types.h>
#ifndef __EMSCRIPTEN_SYSCALL_STUB__
#define __EMSCRIPTEN_SYSCALL_STUB__
static inline long emscripten_syscall_stub(long num, ...) { (void)num; return 1; }
// Override syscall only if not already defined
#include <sys/syscall.h>
#endif

#endif // __EMSCRIPTEN__
