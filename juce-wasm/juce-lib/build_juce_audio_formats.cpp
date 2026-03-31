// build_juce_audio_formats.cpp — WASM build for juce_audio_formats
// Uses the real JUCE unity build with WASM-compatible includes
#include "JuceWasmConfig.h"

// These defines must come before the module header (same as juce_audio_formats.cpp)
#define JUCE_CORE_INCLUDE_COM_SMART_PTR 1
#define JUCE_CORE_INCLUDE_JNI_HELPERS 1
#define JUCE_CORE_INCLUDE_NATIVE_HEADERS 1

#include <juce_audio_formats/juce_audio_formats.h>

// WASM has no platform-specific audio format APIs — just include portable codecs
// juce_AudioFormat.cpp must be first (defines StringMap used by WavAudioFormat)
#include <juce_audio_formats/format/juce_AudioFormat.cpp>
#include <juce_audio_formats/format/juce_AudioFormatManager.cpp>
#include <juce_audio_formats/format/juce_AudioFormatReader.cpp>
#include <juce_audio_formats/format/juce_AudioFormatReaderSource.cpp>
#include <juce_audio_formats/format/juce_AudioFormatWriter.cpp>
#include <juce_audio_formats/format/juce_AudioSubsectionReader.cpp>
#include <juce_audio_formats/format/juce_BufferingAudioFormatReader.cpp>
// juce_MemoryMappedAudioFormatReader has no .cpp — header-only

#include <juce_audio_formats/codecs/juce_AiffAudioFormat.cpp>
#include <juce_audio_formats/codecs/juce_FlacAudioFormat.cpp>
#include <juce_audio_formats/codecs/juce_LAMEEncoderAudioFormat.cpp>
#include <juce_audio_formats/codecs/juce_MP3AudioFormat.cpp>
#include <juce_audio_formats/codecs/juce_OggVorbisAudioFormat.cpp>
#include <juce_audio_formats/codecs/juce_WavAudioFormat.cpp>

#include <juce_audio_formats/sampler/juce_Sampler.cpp>
