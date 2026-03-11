// WASM scalar fallback for simd.hpp
// Replaces Tunefish's SIMD operations with scalar equivalents

#ifndef WASM_SIMD_HPP
#define WASM_SIMD_HPP

#include <cmath>
#include <cstdint>

// Use the same types as types.hpp
typedef float eF32;
typedef int32_t eInt;

// Scalar float2 type
struct eF32x2 {
    eF32 x, y;
};

// SIMD operation macros - scalar implementations
#define eSimdSetAll(val)                            eF32x2{val, val}
#define eSimdSet2(val0, val1)                       eF32x2{val0, val1}
#define eSimdMul(v0, v1)                            eF32x2{v0.x * v1.x, v0.y * v1.y}
#define eSimdDiv(v0, v1)                            eF32x2{v0.x / v1.x, v0.y / v1.y}
#define eSimdSub(v0, v1)                            eF32x2{v0.x - v1.x, v0.y - v1.y}
#define eSimdAdd(v0, v1)                            eF32x2{v0.x + v1.x, v0.y + v1.y}
#define eSimdMax(v0, v1)                            eF32x2{fmaxf(v0.x, v1.x), fmaxf(v0.y, v1.y)}
#define eSimdMin(v0, v1)                            eF32x2{fminf(v0.x, v1.x), fminf(v0.y, v1.y)}
#define eSimdFma(add, mul0, mul1)                   eF32x2{add.x + mul0.x * mul1.x, add.y + mul0.y * mul1.y}
#define eSimdNfma(sub, mul0, mul1)                  eF32x2{sub.x - mul0.x * mul1.x, sub.y - mul0.y * mul1.y}
#define eSimdStore2(v, v0, v1)                      v0 = v.x; v1 = v.y;

enum eSimdArithmeticFlags
{
    eSAF_FTZ =  1, // flush to zero
    eSAF_DAZ =  2, // denormals are zero
    eSAF_RP  =  4, // round positive
    eSAF_RN  =  8, // round negative
    eSAF_RTZ = 16, // round to zero
    eSAF_RTN = 32  // round to nearest (default)
};

inline void eSimdSetArithmeticFlags(eInt flags) {
    (void)flags; // no-op in WASM
}

#endif // WASM_SIMD_HPP
