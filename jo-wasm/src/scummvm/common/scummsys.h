// Minimal stand-in for ScummVM's common/scummsys.h: only what audio/mods/paula.* needs.
#pragma once
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
typedef uint8_t byte;
typedef int8_t int8;
typedef uint8_t uint8;
typedef int16_t int16;
typedef uint16_t uint16;
typedef int32_t int32;
typedef uint32_t uint32;
typedef int64_t int64;
typedef uint64_t uint64;
typedef unsigned int uint;
template <typename T> inline T CLIP(T v, T lo, T hi) { return v < lo ? lo : (v > hi ? hi : v); }
template <typename T> inline T MIN(T a, T b) { return a < b ? a : b; }
template <typename T> inline T MAX(T a, T b) { return a > b ? a : b; }
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#define FORCEINLINE inline
