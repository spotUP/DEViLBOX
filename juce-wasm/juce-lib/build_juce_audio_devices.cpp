// build_juce_audio_devices.cpp — WASM build for juce_audio_devices
// Audio/MIDI device management — stubs for WASM (we use Web Audio API in JS)
#include "JuceWasmConfig.h"

#define JUCE_CORE_INCLUDE_NATIVE_HEADERS 1

#include <juce_audio_devices/juce_audio_devices.h>

// Portable source files (must follow unity build order)
#include <juce_audio_devices/audio_io/juce_SampleRateHelpers.cpp>
#include <juce_audio_devices/midi_io/juce_MidiDeviceListConnectionBroadcaster.cpp>

// Skip all native audio/MIDI backends (ALSA, CoreAudio, WASAPI, CoreMIDI, etc.)
// These are handled by Web Audio API in our JavaScript layer

#include <juce_audio_devices/midi_io/juce_MidiDevices.cpp>
#include <juce_audio_devices/audio_io/juce_AudioDeviceManager.cpp>
#include <juce_audio_devices/audio_io/juce_AudioIODevice.cpp>
#include <juce_audio_devices/audio_io/juce_AudioIODeviceType.cpp>
#include <juce_audio_devices/midi_io/juce_MidiMessageCollector.cpp>
#include <juce_audio_devices/sources/juce_AudioSourcePlayer.cpp>
#include <juce_audio_devices/sources/juce_AudioTransportSource.cpp>

// ============================================================================
// WASM stubs for platform-specific audio/MIDI I/O
// ============================================================================
namespace juce {

// SystemAudioVolume — no system volume control in WASM
float SystemAudioVolume::getGain()          { return 1.0f; }
bool  SystemAudioVolume::setGain (float)    { return false; }
bool  SystemAudioVolume::isMuted()          { return false; }
bool  SystemAudioVolume::setMuted (bool)    { return false; }

// MidiInput — no native MIDI in WASM (our JS layer handles WebMIDI)
struct MidiInput::Pimpl {};
MidiInput::MidiInput (const String& nm, const String& id) : deviceInfo (nm, id) {}
MidiInput::~MidiInput() = default;
void MidiInput::start() {}
void MidiInput::stop() {}
Array<MidiDeviceInfo> MidiInput::getAvailableDevices() { return {}; }
StringArray MidiInput::getDevices() { return {}; }
int MidiInput::getDefaultDeviceIndex() { return -1; }
MidiDeviceInfo MidiInput::getDefaultDevice() { return {}; }
std::unique_ptr<MidiInput> MidiInput::openDevice (const String&, MidiInputCallback*) { return {}; }
// createNewDevice is guarded by JUCE_LINUX/MAC/IOS — not declared for WASM

// MidiOutput — no native MIDI out in WASM
struct MidiOutput::Pimpl {};
MidiOutput::~MidiOutput() { stopThread (2000); }
void MidiOutput::sendMessageNow (const MidiMessage&) {}
Array<MidiDeviceInfo> MidiOutput::getAvailableDevices() { return {}; }
StringArray MidiOutput::getDevices() { return {}; }
int MidiOutput::getDefaultDeviceIndex() { return -1; }
MidiDeviceInfo MidiOutput::getDefaultDevice() { return {}; }
std::unique_ptr<MidiOutput> MidiOutput::openDevice (const String&) { return {}; }
// createNewDevice is guarded by JUCE_LINUX/MAC/IOS — not declared for WASM

// MidiDeviceListConnection
MidiDeviceListConnection MidiDeviceListConnection::make (std::function<void()>) { return {}; }

} // namespace juce
