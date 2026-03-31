// build_juce_audio_processors.cpp — WASM build for juce_audio_processors
// Mirror the real unity build's include list, skipping plugin format types
// (VST, AU, LV2, ARA) which need host APIs not available in WASM.
#include "JuceWasmConfig.h"

// PluginHostType.cpp has #error for unknown platforms — pretend Linux
// Must be defined before any JUCE headers to persist through juce_TargetPlatform.h
#ifndef JUCE_LINUX
 #define JUCE_LINUX 1
#endif

// Workaround: AudioPluginInstance has a template constructor that passes
// a C array to AudioProcessor's initializer_list constructor. This doesn't
// compile with Clang/Emscripten (array decays to pointer, not initializer_list).
// Fix: pre-define the include guard of AudioPluginInstance.h to skip the original,
// then include our patched version after AudioProcessor is defined.

// Define a macro to mark the patched header as already included by original
// The juce_audio_processors.h module header does: #include "processors/juce_AudioPluginInstance.h"
// Since JUCE doesn't use include guards, we use a different trick: include the module header
// with the broken template constructor REMOVED via macro redefinition
#define JUCE_AUDIO_PLUGININSTANCE_TEMPLATE_CTOR_REMOVED 1

// Pre-include a patched copy that has the broken template removed
// It will be found first via the patches/ include directory
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include <juce_audio_processors/utilities/juce_FlagCache.h>

// Core processor/format infrastructure
#include <juce_audio_processors/format/juce_AudioPluginFormat.cpp>
#include <juce_audio_processors/format/juce_AudioPluginFormatManager.cpp>
#include <juce_audio_processors/format_types/juce_LegacyAudioParameter.cpp>

// Processor classes
#include <juce_audio_processors/processors/juce_AudioProcessorParameter.cpp>
#include <juce_audio_processors/processors/juce_AudioProcessor.cpp>
#include <juce_audio_processors/processors/juce_AudioProcessorListener.cpp>
#include <juce_audio_processors/processors/juce_AudioPluginInstance.cpp>
#include <juce_audio_processors/processors/juce_AudioProcessorEditor.cpp>
#include <juce_audio_processors/processors/juce_AudioProcessorGraph.cpp>
#include <juce_audio_processors/processors/juce_GenericAudioProcessorEditor.cpp>
#include <juce_audio_processors/processors/juce_PluginDescription.cpp>

// Scanning
#include <juce_audio_processors/scanning/juce_KnownPluginList.cpp>
#include <juce_audio_processors/scanning/juce_PluginDirectoryScanner.cpp>
#include <juce_audio_processors/scanning/juce_PluginListComponent.cpp>

// Parameter utilities
#include <juce_audio_processors/processors/juce_AudioProcessorParameterGroup.cpp>
#include <juce_audio_processors/utilities/juce_AudioProcessorParameterWithID.cpp>
#include <juce_audio_processors/utilities/juce_RangedAudioParameter.cpp>
#include <juce_audio_processors/utilities/juce_AudioParameterFloat.cpp>
#include <juce_audio_processors/utilities/juce_AudioParameterInt.cpp>
#include <juce_audio_processors/utilities/juce_AudioParameterBool.cpp>
#include <juce_audio_processors/utilities/juce_AudioParameterChoice.cpp>
#include <juce_audio_processors/utilities/juce_ParameterAttachments.cpp>
#include <juce_audio_processors/utilities/juce_AudioProcessorValueTreeState.cpp>
#include <juce_audio_processors/utilities/juce_PluginHostType.cpp>
#include <juce_audio_processors/utilities/juce_AAXClientExtensions.cpp>
#include <juce_audio_processors/utilities/juce_VST2ClientExtensions.cpp>
#include <juce_audio_processors/utilities/juce_VST3ClientExtensions.cpp>

// Skip plugin format types (VST, AU, LV2, ARA, LADSPA) — not needed in WASM
// #include <juce_audio_processors/format_types/juce_VSTPluginFormat.cpp>
// #include <juce_audio_processors/format_types/juce_VST3PluginFormat.cpp>
// #include <juce_audio_processors/format_types/juce_AudioUnitPluginFormat.mm>
// #include <juce_audio_processors/format_types/juce_LADSPAPluginFormat.cpp>
// #include <juce_audio_processors/format_types/juce_LV2PluginFormat.cpp>
// #include <juce_audio_processors/format_types/juce_ARACommon.cpp>
// #include <juce_audio_processors/format_types/juce_ARAHosting.cpp>

