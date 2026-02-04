/**
 * MAME Chip Base - Common interface for MAME sound chip WASM emulation
 *
 * This provides a unified C API that can be bound to JavaScript via Emscripten.
 * Each chip implements this interface to provide consistent access from TypeScript.
 */

#ifndef MAME_CHIP_BASE_H
#define MAME_CHIP_BASE_H

#include <cstdint>
#include <cstring>
#include <cmath>

// Sample rate for audio processing
#define SAMPLE_RATE 44100

// Common type definitions matching MAME
typedef int8_t s8;
typedef uint8_t u8;
typedef int16_t s16;
typedef uint16_t u16;
typedef int32_t s32;
typedef uint32_t u32;
typedef int64_t s64;
typedef uint64_t u64;

// Clamp functions
inline s32 clip16(s32 x) {
    if (x < -32768) return -32768;
    if (x > 32767) return 32767;
    return x;
}

inline s32 clip18(s32 x) {
    if (x < -131072) return -131072;
    if (x > 131071) return 131071;
    return x;
}

// Fixed-point constants
#define SHIFT 12
#define FIX(v) ((u32)((float)(1 << SHIFT) * (v)))

#define EG_SHIFT 16
#define LFO_SHIFT 8
#define LFIX(v) ((u32)((float)(1 << LFO_SHIFT) * (v)))

// Convert dB to amplitude multiplier
#define DB(v) LFIX(powf(10.0f, (v) / 20.0f))

// Convert cents to frequency multiplier
#define CENTS(v) LFIX(powf(2.0f, (v) / 1200.0f))

#endif // MAME_CHIP_BASE_H
