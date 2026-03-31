// build_juce_dsp.cpp — WASM build for juce_dsp
// DSP primitives: FFT, convolution, filters, oscillators, etc.
#include "JuceWasmConfig.h"
#include <juce_dsp/juce_dsp.h>
// Convolution needs AudioFormatManager from juce_audio_formats
#include <juce_audio_formats/juce_audio_formats.h>

// All portable source files
#include <juce_dsp/filter_design/juce_FilterDesign.cpp>
#include <juce_dsp/frequency/juce_Convolution.cpp>
#include <juce_dsp/frequency/juce_FFT.cpp>
#include <juce_dsp/frequency/juce_Windowing.cpp>
#include <juce_dsp/maths/juce_LookupTable.cpp>
#include <juce_dsp/maths/juce_SpecialFunctions.cpp>
#include <juce_dsp/processors/juce_FIRFilter.cpp>
#include <juce_dsp/processors/juce_IIRFilter.cpp>
#include <juce_dsp/processors/juce_Oversampling.cpp>
