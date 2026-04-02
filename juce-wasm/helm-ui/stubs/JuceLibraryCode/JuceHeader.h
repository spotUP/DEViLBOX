/*
 * JuceHeader.h — WASM UI build replacement for Helm.
 * Points to real JUCE 8 modules + our OpenGL stubs.
 */
#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_utils/juce_audio_utils.h>

// Stub OpenGL module (no real OpenGL in WASM framebuffer build)
#include "juce_opengl/juce_opengl.h"

#include "BinaryData.h"

using namespace juce;

// JUCE 8 still has ScopedPointer (deprecated). Suppress the deprecation warning.
// No need to redefine it.
// Note: SliderListener was removed in JUCE 8 — Helm's sole use in formant_response.h
// is patched directly to use Slider::Listener instead.

namespace ProjectInfo
{
    const char* const  projectName    = "Helm";
    const char* const  versionString  = "0.9.0";
    const int          versionNumber  = 0x900;
}
