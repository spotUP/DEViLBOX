/**
 * Force-included header for OB-Xf WASM build.
 * Pre-defines include guards to skip headers with heavy dependencies
 * that aren't needed for DSP processing.
 */
#pragma once

// Skip Program.h (needs ParameterList → SynthParam → sst::basic_blocks)
#define OBXF_SRC_ENGINE_PARAMETERS_H
class Program {
public:
    Program() {}
    ~Program() {}
    void setToDefaultPatch() {}
};

// Skip MidiMap.h (needs juce_audio_basics, juce::XmlElement, juce::File)
#define OBXF_SRC_ENGINE_MIDIMAP_H

// Skip Utils.h (needs juce_audio_processors, fmt, filesystem)
#define OBXF_SRC_UTILS_H
