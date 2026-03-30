/**
 * MoniqueProcessorStub.cpp - Minimal MoniqueAudioProcessor for WASM
 *
 * The Monique voice's renderNextBlock() dereferences audio_processor for:
 *   - get_current_pos_info()   (BPM, timeInSamples, isPlaying)
 *   - amp_painter              (null-checked before use)
 *   - peak_meter               (null-checked before use)
 *
 * This stub provides the minimum constructor/destructor so we can create
 * a valid MoniqueAudioProcessor* for the voice without compiling the full
 * monique_core_Processor.cpp or mono_AudioDeviceManager.cpp.
 */

#include "../common/WASMSynthBase.h"
#include "monique_core_Synth.h"
#include "monique_core_Datastructures.h"
#include "core/mono_AudioDeviceManager.h"
#include "monique_core_Processor.h"

// --- mono_AudioDeviceManager stubs ---
// Not compiling mono_AudioDeviceManager.cpp; provide minimal implementations.
mono_AudioDeviceManager::mono_AudioDeviceManager(
    RuntimeNotifyer *const runtime_notifyer_) noexcept
    : RuntimeListener(runtime_notifyer_), runtime_notifyer(runtime_notifyer_)
{
}

mono_AudioDeviceManager::~mono_AudioDeviceManager() noexcept {}

void mono_AudioDeviceManager::sample_rate_or_block_changed() noexcept {}

void mono_AudioDeviceManager::clear_feedback_and_shutdown() noexcept {}

// --- MoniqueAudioProcessor::standalone_features definition ---
// The header forward-declares this; we need the full type for unique_ptr destructor.
struct MoniqueAudioProcessor::standalone_features {
    // Unused in WASM — just needs to be a complete type
};

// --- MoniqueAudioProcessor stubs ---
MoniqueAudioProcessor::MoniqueAudioProcessor() noexcept
    : mono_AudioDeviceManager(new RuntimeNotifyer()),
      stored_note(-1), stored_velocity(0),
      peak_meter(nullptr), force_sample_rate_update(false),
      sampleReader(nullptr), samplePosition(0),
      lastBlockTime(0), blockTimeCheckCounter(0),
      restore_time(-1), amp_painter(nullptr)
{
    // current_pos_info is value-initialized with defaults:
    //   bpm=120, isPlaying=false, timeInSamples=0
    // amp_painter and peak_meter are nullptr (voice checks before use)
}

MoniqueAudioProcessor::~MoniqueAudioProcessor() noexcept {}

// Virtual overrides declared in the Processor header
void MoniqueAudioProcessor::processBlock(juce::AudioSampleBuffer&, juce::MidiBuffer&) {}
void MoniqueAudioProcessor::processBlockBypassed(juce::AudioSampleBuffer&, juce::MidiBuffer&) {}
void MoniqueAudioProcessor::prepareToPlay(double, int) {}
void MoniqueAudioProcessor::releaseResources() {}
void MoniqueAudioProcessor::reset() {}
void MoniqueAudioProcessor::reset_pending_notes() {}
void MoniqueAudioProcessor::sample_rate_or_block_changed() noexcept {}
bool MoniqueAudioProcessor::hasEditor() const { return false; }
juce::AudioProcessorEditor* MoniqueAudioProcessor::createEditor() { return nullptr; }
const juce::String MoniqueAudioProcessor::getName() const { return "Monique"; }
bool MoniqueAudioProcessor::isInputChannelStereoPair(int) const { return true; }
bool MoniqueAudioProcessor::isOutputChannelStereoPair(int) const { return true; }
bool MoniqueAudioProcessor::isBusesLayoutSupported(const juce::AudioProcessor::BusesLayout&) const { return true; }
bool MoniqueAudioProcessor::acceptsMidi() const { return true; }
bool MoniqueAudioProcessor::producesMidi() const { return false; }
bool MoniqueAudioProcessor::silenceInProducesSilenceOut() const { return false; }
double MoniqueAudioProcessor::getTailLengthSeconds() const { return 0; }
int MoniqueAudioProcessor::getNumPrograms() { return 1; }
int MoniqueAudioProcessor::getCurrentProgram() { return 0; }
void MoniqueAudioProcessor::setCurrentProgram(int) {}
const juce::String MoniqueAudioProcessor::getProgramName(int) { return ""; }
void MoniqueAudioProcessor::changeProgramName(int, const juce::String&) {}
void MoniqueAudioProcessor::getStateInformation(juce::MemoryBlock&) {}
void MoniqueAudioProcessor::setStateInformation(const void*, int) {}
int MoniqueAudioProcessor::getNumParameters() { return 0; }
bool MoniqueAudioProcessor::isParameterAutomatable(int) const { return false; }
float MoniqueAudioProcessor::getParameter(int) { return 0; }
void MoniqueAudioProcessor::setParameter(int, float) {}
const juce::String MoniqueAudioProcessor::getParameterName(int) { return ""; }
const juce::String MoniqueAudioProcessor::getParameterText(int) { return ""; }
juce::String MoniqueAudioProcessor::getParameterLabel(int) const { return ""; }
int MoniqueAudioProcessor::getParameterNumSteps(int) { return 1; }
float MoniqueAudioProcessor::getParameterDefaultValue(int) { return 0; }
bool MoniqueAudioProcessor::isMetaParameter(int) const { return false; }

// ParameterListener virtual overrides
void MoniqueAudioProcessor::parameter_value_changed(Parameter*) noexcept {}
void MoniqueAudioProcessor::parameter_value_changed_always_notification(Parameter*) noexcept {}
void MoniqueAudioProcessor::parameter_value_on_load_changed(Parameter*) noexcept {}
void MoniqueAudioProcessor::parameter_modulation_value_changed(Parameter*) noexcept {}

void MoniqueAudioProcessor::init_automatable_parameters() noexcept {}
void MoniqueAudioProcessor::set_peak_meter(Monique_Ui_SegmentedMeter*) noexcept {}
void MoniqueAudioProcessor::clear_peak_meter() noexcept {}
