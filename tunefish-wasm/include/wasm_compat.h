// WASM compatibility header - force-included before all source files
// Provides scalar SIMD implementations for Tunefish

#ifndef WASM_COMPAT_H
#define WASM_COMPAT_H

#include <cmath>
#include <cstdint>

// Define eF32x2 type and operations BEFORE simd.hpp is included
// This matches the Apple SIMD interface that Tunefish expects

typedef float eF32;
typedef int32_t eInt;

struct eF32x2 {
    eF32 x, y;
    eF32x2() : x(0), y(0) {}
    eF32x2(eF32 a, eF32 b) : x(a), y(b) {}
};

inline eF32x2 operator*(eF32x2 a, eF32x2 b) { return eF32x2{a.x * b.x, a.y * b.y}; }
inline eF32x2 operator/(eF32x2 a, eF32x2 b) { return eF32x2{a.x / b.x, a.y / b.y}; }
inline eF32x2 operator+(eF32x2 a, eF32x2 b) { return eF32x2{a.x + b.x, a.y + b.y}; }
inline eF32x2 operator-(eF32x2 a, eF32x2 b) { return eF32x2{a.x - b.x, a.y - b.y}; }

inline eF32x2 eSimdFmax(eF32x2 a, eF32x2 b) { return eF32x2{fmaxf(a.x, b.x), fmaxf(a.y, b.y)}; }
inline eF32x2 eSimdFmin(eF32x2 a, eF32x2 b) { return eF32x2{fminf(a.x, b.x), fminf(a.y, b.y)}; }
inline eF32x2 eSimdFma_fn(eF32x2 a, eF32x2 b, eF32x2 c) { return eF32x2{a.x * b.x + c.x, a.y * b.y + c.y}; }

// Now define the macros that simd.hpp would normally define
#define eSimdSetAll(val)                            eF32x2{val, val}
#define eSimdSet2(val0, val1)                       eF32x2{val0, val1}
#define eSimdMul(v0, v1)                            ((v0) * (v1))
#define eSimdDiv(v0, v1)                            ((v0) / (v1))
#define eSimdSub(v0, v1)                            ((v0) - (v1))
#define eSimdAdd(v0, v1)                            ((v0) + (v1))
#define eSimdMax(v0, v1)                            eSimdFmax(v0, v1)
#define eSimdMin(v0, v1)                            eSimdFmin(v0, v1)
#define eSimdFma(add, mul0, mul1)                   eSimdFma_fn(mul0, mul1, add)
#define eSimdNfma(sub, mul0, mul1)                  ((sub) - ((mul0) * (mul1)))
#define eSimdStore2(v, v0, v1)                      v0 = v.x; v1 = v.y;

enum eSimdArithmeticFlags
{
    eSAF_FTZ =  1,
    eSAF_DAZ =  2,
    eSAF_RP  =  4,
    eSAF_RN  =  8,
    eSAF_RTZ = 16,
    eSAF_RTN = 32
};

inline void eSimdSetArithmeticFlags(eInt flags) { (void)flags; }

// Guard to prevent simd.hpp from being included (we already defined everything)
#define SIMD_HPP

#endif // WASM_COMPAT_H

