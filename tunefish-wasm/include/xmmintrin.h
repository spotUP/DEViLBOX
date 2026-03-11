// WASM scalar fallback for xmmintrin.h (SSE intrinsics)
// Provides minimal implementations needed by Tunefish runtime

#ifndef WASM_XMMINTRIN_H
#define WASM_XMMINTRIN_H

#include <cstdint>
#include <cmath>

// Fake __m128 type - just use float for scalar operations
typedef float __m128;

// _mm_load_ss - load a single float
inline __m128 _mm_load_ss(const float* p) {
    return *p;
}

// _mm_cvtt_ss2si - convert float to int with truncation
inline int _mm_cvtt_ss2si(__m128 a) {
    return static_cast<int>(a);
}

// _mm_setcsr - set MXCSR register (no-op in WASM)
inline void _mm_setcsr(unsigned int a) {
    (void)a;
}

// _mm_getcsr - get MXCSR register (return default)
inline unsigned int _mm_getcsr() {
    return 0x1f80; // default value
}

#endif // WASM_XMMINTRIN_H
