// build_juce_audio_utils.cpp — WASM build for juce_audio_utils
#include "JuceWasmConfig.h"
#include <juce_audio_utils/juce_audio_utils.h>

// Portable source files
#include <juce_audio_utils/gui/juce_AudioAppComponent.cpp>
#include <juce_audio_utils/gui/juce_AudioDeviceSelectorComponent.cpp>
#include <juce_audio_utils/gui/juce_AudioThumbnail.cpp>
#include <juce_audio_utils/gui/juce_AudioThumbnailCache.cpp>
#include <juce_audio_utils/gui/juce_AudioVisualiserComponent.cpp>
#include <juce_audio_utils/gui/juce_KeyboardComponentBase.cpp>
#include <juce_audio_utils/gui/juce_MidiKeyboardComponent.cpp>
#include <juce_audio_utils/gui/juce_MPEKeyboardComponent.cpp>

#include <juce_audio_utils/players/juce_AudioProcessorPlayer.cpp>
#include <juce_audio_utils/players/juce_SoundPlayer.cpp>
