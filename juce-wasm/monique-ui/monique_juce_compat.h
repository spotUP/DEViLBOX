// monique_juce_compat.h — Compatibility fixes for Monique with JUCE 8
// Patches removed/changed JUCE APIs that Monique's code still references.
#pragma once

// sendParamChangeMessageToListeners was removed in JUCE 8.
// Monique's Processor.cpp calls it as a member function on AudioProcessor.
// We inject it as an inline no-op.
#ifndef MONIQUE_JUCE_COMPAT_DEFINED
#define MONIQUE_JUCE_COMPAT_DEFINED

// This gets force-included, so we can patch the class after JUCE headers
// are processed. But we need a different approach — use a macro.
// The calls are: sendParamChangeMessageToListeners(id, value)
// They're unqualified member calls in MoniqueAudioProcessor methods.
#define sendParamChangeMessageToListeners(paramIndex, newValue) ((void)0)

#endif
