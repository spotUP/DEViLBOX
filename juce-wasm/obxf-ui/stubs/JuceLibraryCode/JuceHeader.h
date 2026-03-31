// JuceHeader.h — Stub for OB-Xf WASM UI build
// Replaces the Projucer-generated JuceHeader.h
#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_dsp/juce_dsp.h>

#include "BinaryData.h"

using namespace juce;

namespace ProjectInfo
{
    const char* const  projectName    = "OB-Xf";
    const char* const  companyName    = "Surge Synth Team";
    const char* const  versionString  = "0.2025.01";
    const int          versionNumber  = 0x002501;
}
