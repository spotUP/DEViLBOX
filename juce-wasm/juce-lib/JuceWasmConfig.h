// JuceWasmConfig.h — JUCE module configuration for Emscripten/WASM builds
// This header is force-included before any JUCE code to configure the build.

#pragma once

// Emscripten header for emscripten_get_now() used by juce_SystemStats_wasm.cpp
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

// Silence the "no global header" error
#define JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED 1

// Module availability — tells JUCE which modules are present
#define JUCE_MODULE_AVAILABLE_juce_core                 1
#define JUCE_MODULE_AVAILABLE_juce_audio_basics          1
#define JUCE_MODULE_AVAILABLE_juce_data_structures       1
#define JUCE_MODULE_AVAILABLE_juce_events                1
#define JUCE_MODULE_AVAILABLE_juce_graphics              1
#define JUCE_MODULE_AVAILABLE_juce_gui_basics            1
#define JUCE_MODULE_AVAILABLE_juce_gui_extra             1
#define JUCE_MODULE_AVAILABLE_juce_audio_processors      1
#define JUCE_MODULE_AVAILABLE_juce_audio_formats         1
#define JUCE_MODULE_AVAILABLE_juce_audio_devices         1
#define JUCE_MODULE_AVAILABLE_juce_audio_utils           1
#define JUCE_MODULE_AVAILABLE_juce_dsp                   1
#define JUCE_MODULE_AVAILABLE_juce_audio_plugin_client   0
#define JUCE_MODULE_AVAILABLE_juce_opengl                0
#define JUCE_MODULE_AVAILABLE_juce_video                 0
#define JUCE_MODULE_AVAILABLE_juce_cryptography          0
#define JUCE_MODULE_AVAILABLE_juce_javascript            0
#define JUCE_MODULE_AVAILABLE_juce_midi_ci               0
#define JUCE_MODULE_AVAILABLE_juce_product_unlocking     0
#define JUCE_MODULE_AVAILABLE_juce_animation             0
#define JUCE_MODULE_AVAILABLE_juce_analytics             0
#define JUCE_MODULE_AVAILABLE_juce_box2d                 0
#define JUCE_MODULE_AVAILABLE_juce_osc                   0

// Disable features we don't need in WASM
#define JUCE_USE_CURL               0
#define JUCE_WEB_BROWSER            0
#define JUCE_USE_CAMERA             0
#define JUCE_USE_CDBURNER           0
#define JUCE_USE_CDREADER           0
#define JUCE_PLUGINHOST_VST         0
#define JUCE_PLUGINHOST_VST3        0
#define JUCE_PLUGINHOST_AU          0
#define JUCE_PLUGINHOST_LADSPA      0
#define JUCE_PLUGINHOST_LV2         0
#define JUCE_PLUGINHOST_ARA         0
#define JUCE_USE_WINRT_MIDI         0
#define JUCE_ASIO                   0
#define JUCE_WASAPI                 0
#define JUCE_DIRECTSOUND            0
#define JUCE_ALSA                   0
#define JUCE_JACK                   0
#define JUCE_BELA                   0
#define JUCE_USE_ANDROID_OBOE       0
#define JUCE_USE_ANDROID_OPENSLES   0
#define JUCE_USE_FLAC               0
#define JUCE_USE_OGGVORBIS          0
#define JUCE_USE_MP3AUDIOFORMAT     0
#define JUCE_USE_LAME_AUDIO_FORMAT  0
#define JUCE_USE_WINDOWS_MEDIA_FORMAT 0
#define JUCE_DISPLAY_SPLASH_SCREEN  0
#define JUCE_REPORT_APP_USAGE       0
#define JUCE_STRICT_REFCOUNTEDPOINTER 1
#define JUCE_CATCH_UNHANDLED_EXCEPTIONS 0
#define JUCE_UNIT_TESTS             0

// No SIMD optimizations in WASM (use scalar fallbacks)
#define JUCE_USE_SSE_INTRINSICS     0
#define JUCE_USE_ARM_NEON           0
#define JUCE_USE_VDSP_FRAMEWORK     0

// Disable features that cause compile issues in WASM
#define JUCE_CONTENT_SHARING        0
#define JUCE_PUSH_NOTIFICATIONS     0
#define JUCE_SUPPORT_CARBON         0
#define JUCE_ETW_TRACELOGGING       0

// Workaround: JUCE's ThreadPriorities has no WASM case.
// We patch it by making JUCE_LINUX appear true for that header only.
// But actually, easier approach: the table uses #if conditionals, so
// for WASM we define a fallback via JUCE_LINUX being false.
// Instead, we add the missing WASM entries by injecting them.

// Release mode
#ifndef NDEBUG
#define NDEBUG 1
#endif
