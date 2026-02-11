/**
 * JUCE shim for OB-Xf WASM build.
 * Provides minimal replacements for juce:: types used in engine headers.
 */
#pragma once

#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <algorithm>
#include <atomic>
#include <unordered_map>
#include <vector>
#include <array>
#include <cassert>
#include <iostream>
#include <sstream>

namespace juce {

template<typename T>
struct MathConstants {
    static constexpr T pi = T(3.14159265358979323846);
    static constexpr T twoPi = T(2.0) * pi;
    static constexpr T halfPi = pi / T(2.0);
};

template<typename T> inline T jmin(T a, T b) { return std::min(a, b); }
template<typename T> inline T jmax(T a, T b) { return std::max(a, b); }
template<typename T> inline T jlimit(T lo, T val, T hi) { return std::clamp(val, lo, hi); }

inline int roundToInt(float x) { return (int)std::lround(x); }
inline int roundToInt(double x) { return (int)std::lround(x); }

class Random {
    unsigned int seed_ = 12345;
public:
    static Random& getSystemRandom() { static Random r; return r; }
    float nextFloat() {
        seed_ = seed_ * 1103515245 + 12345;
        return (float)(seed_ & 0x7FFFFFFF) / (float)0x7FFFFFFF;
    }
};

namespace ByteOrder {
    inline uint32_t littleEndianInt(const char* bytes) {
        return (uint32_t)(uint8_t)bytes[0] | ((uint32_t)(uint8_t)bytes[1] << 8) |
               ((uint32_t)(uint8_t)bytes[2] << 16) | ((uint32_t)(uint8_t)bytes[3] << 24);
    }
    inline uint32_t bigEndianInt(const char* bytes) {
        return ((uint32_t)(uint8_t)bytes[0] << 24) | ((uint32_t)(uint8_t)bytes[1] << 16) |
               ((uint32_t)(uint8_t)bytes[2] << 8) | (uint32_t)(uint8_t)bytes[3];
    }
    inline uint32_t swap(uint32_t v) {
        return ((v >> 24) & 0xFF) | ((v >> 8) & 0xFF00) |
               ((v << 8) & 0xFF0000) | ((v << 24) & 0xFF000000);
    }
    inline uint32_t swapIfLittleEndian(uint32_t v) { return swap(v); }
}

// Minimal String shim — OB-Xf engine uses juce::String in Program.h
using String = std::string;

} // namespace juce

#ifndef JUCE_LITTLE_ENDIAN
#define JUCE_LITTLE_ENDIAN 1
#endif

// Suppress JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR
#define JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(x)

// DBG macro (no-op in WASM)
#ifndef DBG
#define DBG(x)
#endif
