/**
 * WASMExports.h - Macros for exporting synth classes to JavaScript
 * Provides Emscripten bindings for AudioWorklet communication
 */
#pragma once

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

// Macro to export a synth class with standard interface
#define EXPORT_WASM_SYNTH(ClassName) \
    EMSCRIPTEN_BINDINGS(ClassName##_bindings) { \
        emscripten::class_<ClassName>(#ClassName) \
            .constructor<>() \
            .function("initialize", &ClassName::initialize) \
            .function("isInitialized", &ClassName::isInitialized) \
            .function("getSampleRate", &ClassName::getSampleRate) \
            .function("noteOn", &ClassName::noteOn) \
            .function("noteOff", &ClassName::noteOff) \
            .function("allNotesOff", &ClassName::allNotesOff) \
            .function("setParameter", &ClassName::setParameter) \
            .function("getParameter", &ClassName::getParameter) \
            .function("controlChange", &ClassName::controlChange) \
            .function("pitchBend", &ClassName::pitchBend) \
            .function("programChange", &ClassName::programChange) \
            .function("process", &ClassName::processJS); \
    }

// Macro for synths with SysEx support (like DX7)
#define EXPORT_WASM_SYNTH_WITH_SYSEX(ClassName) \
    EMSCRIPTEN_BINDINGS(ClassName##_bindings) { \
        emscripten::class_<ClassName>(#ClassName) \
            .constructor<>() \
            .function("initialize", &ClassName::initialize) \
            .function("isInitialized", &ClassName::isInitialized) \
            .function("getSampleRate", &ClassName::getSampleRate) \
            .function("noteOn", &ClassName::noteOn) \
            .function("noteOff", &ClassName::noteOff) \
            .function("allNotesOff", &ClassName::allNotesOff) \
            .function("setParameter", &ClassName::setParameter) \
            .function("getParameter", &ClassName::getParameter) \
            .function("controlChange", &ClassName::controlChange) \
            .function("pitchBend", &ClassName::pitchBend) \
            .function("programChange", &ClassName::programChange) \
            .function("loadSysEx", &ClassName::loadSysExJS) \
            .function("process", &ClassName::processJS); \
    }

// Macro for synths using the VSTBridge framework (param metadata + extension commands)
// BindName must be a simple identifier (no colons) for token pasting.
// ClassName can be fully qualified (e.g. devilbox::VitalSynth).
// JSName is the string name exposed to JavaScript.
#define EXPORT_WASM_SYNTH_EXTENDED_EX(BindName, ClassName, JSName) \
    EMSCRIPTEN_BINDINGS(BindName##_bindings) { \
        emscripten::class_<ClassName>(JSName) \
            .constructor<>() \
            .function("initialize", &ClassName::initialize) \
            .function("isInitialized", &ClassName::isInitialized) \
            .function("getSampleRate", &ClassName::getSampleRate) \
            .function("noteOn", &ClassName::noteOn) \
            .function("noteOff", &ClassName::noteOff) \
            .function("allNotesOff", &ClassName::allNotesOff) \
            .function("setParameter", &ClassName::setParameter) \
            .function("getParameter", &ClassName::getParameter) \
            .function("controlChange", &ClassName::controlChange) \
            .function("pitchBend", &ClassName::pitchBend) \
            .function("programChange", &ClassName::programChange) \
            .function("getParameterCount", &ClassName::getParameterCount) \
            .function("getParameterName", &ClassName::getParameterNameJS) \
            .function("getParameterMin", &ClassName::getParameterMin) \
            .function("getParameterMax", &ClassName::getParameterMax) \
            .function("getParameterDefault", &ClassName::getParameterDefault) \
            .function("handleCommand", &ClassName::handleCommandJS) \
            .function("process", &ClassName::processJS); \
    }

// Convenience: when ClassName is a simple identifier (no namespace)
#define EXPORT_WASM_SYNTH_EXTENDED(ClassName) \
            .constructor<>() \
            .function("initialize", &ClassName::initialize) \
            .function("isInitialized", &ClassName::isInitialized) \
            .function("getSampleRate", &ClassName::getSampleRate) \
            .function("noteOn", &ClassName::noteOn) \
            .function("noteOff", &ClassName::noteOff) \
            .function("allNotesOff", &ClassName::allNotesOff) \
            .function("setParameter", &ClassName::setParameter) \
            .function("getParameter", &ClassName::getParameter) \
            .function("controlChange", &ClassName::controlChange) \
            .function("pitchBend", &ClassName::pitchBend) \
            .function("programChange", &ClassName::programChange) \
            .function("getParameterCount", &ClassName::getParameterCount) \
            .function("getParameterName", &ClassName::getParameterNameJS) \
            .function("getParameterMin", &ClassName::getParameterMin) \
            .function("getParameterMax", &ClassName::getParameterMax) \
            .function("getParameterDefault", &ClassName::getParameterDefault) \
            .function("handleCommand", &ClassName::handleCommandJS) \
            .function("process", &ClassName::processJS); \
    }

#else
// No-op when not building with Emscripten
#define EXPORT_WASM_SYNTH(ClassName)
#define EXPORT_WASM_SYNTH_WITH_SYSEX(ClassName)
#define EXPORT_WASM_SYNTH_EXTENDED(ClassName)
#define EXPORT_WASM_SYNTH_EXTENDED_EX(BindName, ClassName, JSName)
#endif
