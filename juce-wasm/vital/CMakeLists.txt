# Vital Spectral Warping Wavetable Synthesizer - WASM Build
# Based on Vital by Matt Tytel (GPL v3)
#
# Build:
#   cd juce-wasm/vital && mkdir build && cd build
#   emcmake cmake .. && emmake make
#
# This compiles the Vital synthesis engine to WebAssembly for DEViLBOX.
# The JuceHeader.h dependency is handled via a compatibility shim.

cmake_minimum_required(VERSION 3.15)
project(VitalWASM VERSION 1.0.0)

set(VITAL_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/vital-main")
set(VITAL_SRC "${VITAL_ROOT}/src")
set(VITAL_THIRD_PARTY "${VITAL_ROOT}/third_party")

# --- JUCE Compatibility Shim ---
# Vital's synthesis code includes JuceHeader.h for leak detection macros
# and expects it to transitively pull in common STL headers + JUCE utilities.
# We provide a minimal shim with stubs for the JUCE types actually referenced.
file(WRITE "${CMAKE_BINARY_DIR}/JuceHeader.h" [[
// Minimal JUCE shim for WASM build
#pragma once
#include <algorithm>
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <cstring>
#include <cmath>
#include <cstdint>
#include <cfloat>

// JUCE macro stubs
#define JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(className)
#define JUCE_DECLARE_NON_COPYABLE(className)
#define JUCE_LEAK_DETECTOR(className)

// FloatVectorOperations stub (only disableDenormalisedNumberSupport is used)
class FloatVectorOperations {
public:
    static void disableDenormalisedNumberSupport() {}
};

// String/StringArray stubs (used by tuning.h, sample_source.cpp)
class String : public std::string {
public:
    String() {}
    String(const char* s) : std::string(s) {}
    String(const std::string& s) : std::string(s) {}
    static String fromUTF8(const char* s, int len = -1) {
        return len >= 0 ? String(std::string(s, len)) : String(s ? s : "");
    }
    const char* toRawUTF8() const { return c_str(); }
    std::string toStdString() const { return *this; }
    bool isEmpty() const { return empty(); }
    bool isNotEmpty() const { return !empty(); }
    int length() const { return (int)size(); }
    String trim() const { return *this; }
    bool contains(const String&) const { return false; }
    String upToFirstOccurrenceOf(const String&, bool, bool) const { return *this; }
    String fromFirstOccurrenceOf(const String&, bool, bool) const { return *this; }
    float getFloatValue() const { return empty() ? 0.0f : std::atof(c_str()); }
    int getIntValue() const { return empty() ? 0 : std::atoi(c_str()); }
};

class StringArray : public std::vector<String> {
public:
    StringArray() {}
    void add(const String& s) { push_back(s); }
    int indexOf(const String& s) const {
        for (int i = 0; i < (int)size(); i++)
            if ((*this)[i] == s) return i;
        return -1;
    }
};

// MemoryOutputStream stub (used for sample serialization)
class MemoryOutputStream {
public:
    MemoryOutputStream(size_t sz = 0) : data_(sz, 0) {}
    void* getData() { return data_.data(); }
    const void* getData() const { return data_.data(); }
    size_t getDataSize() const { return data_.size(); }
private:
    std::vector<char> data_;
};

// Base64 stub (serialization not needed in WASM)
class Base64 {
public:
    static String toBase64(const void*, size_t) { return String(); }
    static bool convertFromBase64(MemoryOutputStream&, const std::string&) { return false; }
};

// File class stub (used in synth_base.h)
namespace juce { class File { public: File() {} File(const char*) {} }; }
using File = juce::File;
]])

# --- Vital Synthesis Sources ---
# All .cpp files from src/synthesis/ (the DSP engine)
file(GLOB_RECURSE VITAL_SYNTHESIS_SOURCES
    "${VITAL_SRC}/synthesis/*.cpp"
)

# Exclude effects_engine/ — it's a JUCE-heavy wrapper around the core engine.
# We use synth_engine/sound_engine.cpp (the pure DSP core) instead.
list(FILTER VITAL_SYNTHESIS_SOURCES EXCLUDE REGEX ".*/effects_engine/.*")

# Common sources needed for parameter lookup
# NOTE: tuning.cpp excluded — it uses JUCE String/File APIs extensively.
# SoundEngine only references Tuning via pointer (forward decl is sufficient).
set(VITAL_COMMON_SOURCES
    "${VITAL_SRC}/common/synth_parameters.cpp"
    "${VITAL_SRC}/common/synth_types.cpp"
    "${VITAL_SRC}/common/line_generator.cpp"
)

# KissFFT (header-only in this version, but may need compilation)
set(KISSFFT_SOURCES "")
if(EXISTS "${VITAL_THIRD_PARTY}/kissfft/kissfft.c")
    set(KISSFFT_SOURCES "${VITAL_THIRD_PARTY}/kissfft/kissfft.c")
endif()

# WASM Wrapper + stubs
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/VitalWASM.cpp"
    "${CMAKE_SOURCE_DIR}/tuning_stub.cpp"
)

add_executable(VitalWASMBuild
    ${WRAPPER_SOURCES}
    ${VITAL_SYNTHESIS_SOURCES}
    ${VITAL_COMMON_SOURCES}
    ${KISSFFT_SOURCES}
)

target_include_directories(VitalWASMBuild PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common                  # WASMSynthBase.h
    ${CMAKE_BINARY_DIR}                            # JuceHeader.h shim
    ${VITAL_SRC}
    ${VITAL_SRC}/common
    ${VITAL_SRC}/synthesis
    ${VITAL_SRC}/synthesis/effects
    ${VITAL_SRC}/synthesis/filters
    ${VITAL_SRC}/synthesis/framework
    ${VITAL_SRC}/synthesis/lookups
    ${VITAL_SRC}/synthesis/modulators
    ${VITAL_SRC}/synthesis/modules
    ${VITAL_SRC}/synthesis/producers
    ${VITAL_SRC}/synthesis/synth_engine
    ${VITAL_SRC}/synthesis/utilities
    ${VITAL_SRC}/interface/look_and_feel             # For synth_strings.h (effect names)
    ${VITAL_THIRD_PARTY}                           # For "kissfft/kissfft.h", "json/json.h"
    ${VITAL_THIRD_PARTY}/concurrentqueue
)

target_compile_definitions(VitalWASMBuild PRIVATE
    VITAL_WASM=1
    NDEBUG=1
)

set_target_properties(VitalWASMBuild PROPERTIES
    OUTPUT_NAME "Vital"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/vital"
)

target_link_options(VitalWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createVitalModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=67108864"  # 64MB initial (Vital needs more memory)
    "SHELL:--bind"
    -O3
)

# Enable SSE2 → WASM SIMD translation
target_compile_options(VitalWASMBuild PRIVATE
    -O3
    -std=c++17
    -msse2
    -msimd128
    -fno-exceptions  # Vital doesn't use exceptions
    # Force-include prelude — Vital headers rely on include ordering from the
    # JUCE build system. This prelude ensures commonly-needed types are available.
    -include ${CMAKE_SOURCE_DIR}/vital_wasm_prelude.h
)
