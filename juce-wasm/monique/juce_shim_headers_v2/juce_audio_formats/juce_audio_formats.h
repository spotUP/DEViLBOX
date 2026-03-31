// Stub juce_audio_formats module for WASM builds
#pragma once
#include <juce_audio_basics/juce_audio_basics.h>

namespace juce
{
// NOTE: AudioDataConverters is already in real juce_audio_basics. Don't redefine.

class AudioFormatReader {
public:
    virtual ~AudioFormatReader() = default;
    double sampleRate = 44100;
    int64 lengthInSamples = 0;
    unsigned int numChannels = 0;
    unsigned int bitsPerSample = 0;
};
class AudioFormatManager {
public:
    void registerBasicFormats() {}
    AudioFormatReader* createReaderFor(const File&) { return nullptr; }
};
} // namespace juce
