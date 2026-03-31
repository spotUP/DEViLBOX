// Stub juce_audio_utils module for WASM builds
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>

namespace juce
{
// MidiMessageCollector is from juce_audio_devices which we don't compile
class MidiMessageCollector : public MidiKeyboardState::Listener {
public:
    void reset(double) {}
    void addMessageToQueue(const MidiMessage&) {}
    void removeNextBlockOfMessages(MidiBuffer&, int) {}
    void handleNoteOn(MidiKeyboardState*, int, int, float) override {}
    void handleNoteOff(MidiKeyboardState*, int, int, float) override {}
};

class AudioDeviceManager {
public:
    MidiMessageCollector* getMidiMessageCollector() { return nullptr; }
};
class AudioProcessorPlayer {
public:
    void setProcessor(AudioProcessor*) {}
    MidiMessageCollector& getMidiMessageCollector() { static MidiMessageCollector c; return c; }
};
class AudioIODevice {
public:
    virtual ~AudioIODevice() = default;
    virtual String getName() const { return {}; }
};
class AudioIODeviceType {
public:
    virtual ~AudioIODeviceType() = default;
};
} // namespace juce
