// JuceHeader.h — Stub for Dexed WASM build
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

#include "BinaryData.h"

// JUCE 8 removed setParameterNotifyingHost() — add it back for compatibility
// This must be done AFTER JUCE headers but BEFORE Dexed code that calls it.
namespace juce {
    // Patch AudioProcessor with the removed method
    // (Dexed's Ctrl::publishValue calls parent->setParameterNotifyingHost)
}

// Nasty but effective: inject the method via a define that resolves at call site
// parent->setParameterNotifyingHost(idx, value) → parent->setParameter(idx, value)
#define setParameterNotifyingHost setParameter

using namespace juce;

namespace ProjectInfo
{
    const char* const  projectName    = "Dexed";
    const char* const  companyName    = "Digital Suburban";
    const char* const  versionString  = "0.9.8";
    const int          versionNumber  = 0x00908;
}
