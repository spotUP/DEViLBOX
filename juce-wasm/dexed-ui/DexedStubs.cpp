/**
 * DexedStubs.cpp — Minimal stubs for Dexed WASM UI-only build
 *
 * Provides stub implementations for:
 * - DexedAudioProcessor (the full audio engine is NOT compiled)
 * - SysexComm (MIDI I/O not needed in WASM)
 * - CartManager (file browser not available in WASM)
 * - ParamDialog / TuningShow (settings dialogs skipped)
 * - PluginFx (DSP filter)
 * - EngineMkI / EngineOpl (engine variants)
 * - msfa engine components (Lfo, Dx7Note, FmCore, Env, etc.)
 * - Tuning system
 * - dexed_trace
 */

#include <emscripten.h>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <memory>

// Forward declare surgesynthteam namespace BEFORE TuningShow.h is included
namespace surgesynthteam {
    class TuningTableListBoxModel {};
}

// Include the real headers (they define the class structures)
#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "CartManager.h"
#include "ParamDialog.h"
#include "TuningShow.h"
#include "Dexed.h"
#include "BinaryData.h"

// msfa includes — but NOT lfo.h (already included via PluginProcessor.h → msfa/lfo.h)
#include "msfa/exp2.h"
#include "msfa/sin.h"
#include "msfa/freqlut.h"
#include "msfa/env.h"
#include "msfa/pitchenv.h"
#include "msfa/fm_core.h"
#include "msfa/fm_op_kernel.h"
#include "msfa/dx7note.h"
// lfo.h already included via PluginProcessor.h
#include "msfa/porta.h"

//==============================================================================
// dexed_trace
//==============================================================================
void dexed_trace(const char *source, const char *fmt, ...) {
    // No-op in WASM release builds
    (void)source; (void)fmt;
}

//==============================================================================
// msfa engine stubs
//==============================================================================

// Exp2
int32_t exp2tab[EXP2_N_SAMPLES << 1] = {};
void Exp2::init() {}

// Tanh
int32_t tanhtab[TANH_N_SAMPLES << 1] = {};
void Tanh::init() {}

// Sin
int32_t sintab[SIN_N_SAMPLES << 1] = {};
void Sin::init() {}
int32_t Sin::compute(int32_t) { return 0; }
int32_t Sin::compute10(int32_t) { return 0; }
Sin::Sin() {}

// Freqlut
void Freqlut::init(double) {}
int32_t Freqlut::lookup(int32_t) { return 0; }

// Env
uint32_t Env::sr_multiplier = 1;
Env::Env() : initialised_(false), level_(0), targetlevel_(0), rising_(false), ix_(0), inc_(0), down_(false) {
    memset(rates_, 0, sizeof(rates_));
    memset(levels_, 0, sizeof(levels_));
    outlevel_ = 0;
    rate_scaling_ = 0;
#ifdef ACCURATE_ENVELOPE
    staticcount_ = 0;
#endif
}
void Env::init(const int[4], const int[4], int, int) {}
void Env::update(const int[4], const int[4], int, int) {}
int32_t Env::getsample() { return 0; }
void Env::keydown(bool) {}
int Env::scaleoutlevel(int outlevel) { return outlevel; }
void Env::getPosition(char *step) { *step = 0; }
void Env::init_sr(double) {}
void Env::transfer(Env&) {}
bool Env::isActive() { return false; }

// PitchEnv
int PitchEnv::unit_ = 1;
const uint8_t pitchenv_rate[] = { 0 };
const int8_t pitchenv_tab[] = { 0 };
void PitchEnv::init(double) {}
void PitchEnv::set(const int[4], const int[4]) {}
int32_t PitchEnv::getsample() { return 0; }
void PitchEnv::keydown(bool) {}
void PitchEnv::getPosition(char *step) { *step = 0; }

// FmOpKernel
void FmOpKernel::compute(int32_t*, const int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void FmOpKernel::compute_pure(int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void FmOpKernel::compute_fb(int32_t*, int32_t, int32_t, int32_t, int32_t, int32_t*, int, bool) {}

// FmCore
const FmAlgorithm FmCore::algorithms[32] = {};
void FmCore::dump() {}
bool FmCore::isCarrier(int, int) { return false; }
void FmCore::render(int32_t*, FmOpParams*, int, int32_t*, int32_t) {}

// EngineMkI
EngineMkI::EngineMkI() {}
void EngineMkI::render(int32_t*, FmOpParams*, int, int32_t*, int32_t) {}
void EngineMkI::compute(int32_t*, const int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void EngineMkI::compute_pure(int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void EngineMkI::compute_fb(int32_t*, int32_t, int32_t, int32_t, int32_t, int32_t*, int, bool) {}
void EngineMkI::compute_fb2(int32_t*, FmOpParams*, int32_t, int32_t, int32_t*, int) {}
void EngineMkI::compute_fb3(int32_t*, FmOpParams*, int32_t, int32_t, int32_t*, int) {}

// EngineOpl
void EngineOpl::render(int32_t*, FmOpParams*, int, int32_t*, int32_t) {}
void EngineOpl::compute(int32_t*, const int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void EngineOpl::compute_pure(int32_t*, int32_t, int32_t, int32_t, int32_t, bool) {}
void EngineOpl::compute_fb(int32_t*, int32_t, int32_t, int32_t, int32_t, int32_t*, int, bool) {}

// Lfo
uint32_t Lfo::lforatio_ = 0;
uint32_t Lfo::unit_ = 0;
void Lfo::init(double) {}
void Lfo::reset(const uint8_t[6]) {}
int32_t Lfo::getsample() { return 0; }
int32_t Lfo::getdelay() { return 0; }
void Lfo::keydown() {}

// Dx7Note
const int32_t Dx7Note::mtsLogFreqToNoteLogFreq = 0;
Dx7Note::Dx7Note(std::shared_ptr<TuningState>, MTSClient*) : initialised_(false) {}
void Dx7Note::init(const uint8_t[156], int, int, int, const Controllers*) {}
void Dx7Note::initPortamento(const Dx7Note&) {}
void Dx7Note::compute(int32_t*, int32_t, int32_t, const Controllers*) {}
void Dx7Note::keyup() {}
bool Dx7Note::isPlaying() { return false; }
void Dx7Note::update(const uint8_t[156], int, int, int) {}
void Dx7Note::updateBasePitches() {}
void Dx7Note::peekVoiceStatus(VoiceStatus&) {}
void Dx7Note::transferState(Dx7Note&) {}
void Dx7Note::transferSignal(Dx7Note&) {}
void Dx7Note::transferPhase(Dx7Note&) {}
void Dx7Note::oscSync() {}

// Porta
int32_t Porta::rates[128] = {};
int32_t Porta::rates_glissando[128] = {};
void Porta::init_sr(double) {}

// Tuning
std::shared_ptr<TuningState> createStandardTuning() {
    class StandardTuning : public TuningState {
    public:
        int32_t midinote_to_logfreq(int midinote) override { return 0; }
    };
    return std::make_shared<StandardTuning>();
}
std::shared_ptr<TuningState> createTuningFromSCLData(const std::string&) { return createStandardTuning(); }
std::shared_ptr<TuningState> createTuningFromKBMData(const std::string&) { return createStandardTuning(); }
std::shared_ptr<TuningState> createTuningFromSCLAndKBMData(const std::string&, const std::string&) { return createStandardTuning(); }

//==============================================================================
// PluginFx stubs
//==============================================================================
PluginFx::PluginFx() : s1(0), s2(0), s3(0), s4(0), sampleRate(44100), sampleRateInv(1.0f/44100.0f),
    d(0), c(0), R24(0), rcor24(0), rcor24Inv(0), bright(0), mm(0), mmt(0), mmch(0),
    rCutoff(0), rReso(0), rGain(1), pReso(0), pCutoff(0), pGain(1),
    bandPassSw(false), rcor(0), rcorInv(0), R(0), dc_id(0), dc_od(0), dc_r(0),
    uiCutoff(1.0f), uiReso(0.0f), uiGain(1.0f) {}
void PluginFx::init(int) {}
void PluginFx::process(float*, int) {}

//==============================================================================
// SysexComm stubs
//==============================================================================
SysexComm::SysexComm() : sysexChl(0), inputOutput(false), listener(nullptr) {
#ifdef IMPLEMENT_MidiMonitor
    inActivity = false;
    outActivity = false;
#endif
}
bool SysexComm::setInput(String) { return false; }
bool SysexComm::setOutput(String) { return false; }
void SysexComm::setChl(int chl) { sysexChl = chl; }
String SysexComm::getInput() { return ""; }
String SysexComm::getOutput() { return ""; }
int SysexComm::getChl() { return sysexChl; }
bool SysexComm::isInputActive() { return false; }
bool SysexComm::isOutputActive() { return false; }
int SysexComm::send(const MidiMessage&) { return 0; }
void SysexComm::playBuffer(MidiBuffer&, int) {}

//==============================================================================
// CartManager stubs
//==============================================================================
CartManager::CartManager(DexedAudioProcessorEditor *editor) : mainWindow(editor) {
    // Create minimal buttons so the editor constructor doesn't crash
    closeButton = std::make_unique<TextButton>("CLOSE");
}
CartManager::~CartManager() {}
void CartManager::paint(Graphics&) {}
void CartManager::buttonClicked(Button*) {}
void CartManager::selectionChanged() {}
void CartManager::fileClicked(const File&, const MouseEvent&) {}
void CartManager::fileDoubleClicked(const File&) {}
void CartManager::browserRootChanged(const File&) {}
void CartManager::setActiveProgram(int, String) {}
void CartManager::resetActiveSysex() {}
void CartManager::updateCartFilename() {}
void CartManager::resized() {}
void CartManager::programSelected(ProgramListBox*, int) {}
void CartManager::programRightClicked(ProgramListBox*, int) {}
void CartManager::programDragged(ProgramListBox*, int, char*) {}
bool CartManager::keyPressed(const KeyPress&, Component*) { return false; }
void CartManager::initialFocus() {}
void CartManager::hideCartridgeManager() {}
std::unique_ptr<ComponentTraverser> CartManager::createKeyboardFocusTraverser() { return nullptr; }

//==============================================================================
// ParamDialog stubs
//==============================================================================
ParamDialog::ParamDialog() {}
ParamDialog::~ParamDialog() {}
void ParamDialog::paint(Graphics&) {}
void ParamDialog::resized() {}
void ParamDialog::sliderValueChanged(Slider*) {}
void ParamDialog::comboBoxChanged(ComboBox*) {}
void ParamDialog::buttonClicked(Button*) {}
void ParamDialog::setDialogValues(Controllers&, SysexComm&, int, bool, float) {}
bool ParamDialog::getDialogValues(Controllers&, SysexComm&, int*, bool*, float*) { return true; }
void ParamDialog::setIsStandardTuning(bool) {}
void ParamDialog::timerCallback() {}

// TuningShow stubs (surgesynthteam namespace already forward-declared above)
//==============================================================================
TuningShow::TuningShow() {}
TuningShow::~TuningShow() {}
void TuningShow::setTuning(const Tunings::Tuning&) {}
void TuningShow::paint(Graphics&) {}
void TuningShow::resized() {}

//==============================================================================
// DexedAudioProcessor — stub implementation for UI-only WASM build
// Note: dexedAppDir, dexedCartDir, setupStartupCart, getStateInformation,
// setStateInformation, copyToClipboard, pasteOpFromClipboard, etc. are
// defined in the real PluginData.cpp which we compile.
// getParameter, setParameter, getNumParameters, getNumPrograms,
// getCurrentProgram, setCurrentProgram, loadPreference, savePreference etc.
// are defined in the real PluginParam.cpp.
//==============================================================================

DexedAudioProcessor::DexedAudioProcessor()
    : AudioProcessor(BusesProperties().withOutput("output", AudioChannelSet::stereo(), true))
{
    // Initialize basic state
    synthTuningState = createStandardTuning();
    synthTuningStateLast = createStandardTuning();
    lastStateSave = 0;
    currentNote = -1;
    engineType = DEXED_ENGINE_MARKI;
    vuSignal = 0;
    monoMode = false;
    refreshVoice = false;
    normalizeDxVelocity = false;
    sendSysexChange = false;
    forceRefreshUI = false;
    showKeyboard = true;
    zoomFactor = 1.0f;
    extra_buf_size = 0;
    sustain = false;
    currentProgram = 0;
    nextKeydownSeq = 0;
    nextMidi = nullptr;
    midiMsg = nullptr;
    hasMidiMessage = false;
    midiEventPos = 0;
    mtsClient = nullptr;

    memset(&voiceStatus, 0, sizeof(VoiceStatus));
    memset(data, 0, sizeof(data));
    memset(extra_buf, 0, sizeof(extra_buf));

    for (int i = 0; i < MAX_ACTIVE_NOTES; i++) {
        voices[i].dx7_note = nullptr;
        voices[i].keydown = false;
        voices[i].sustained = false;
        voices[i].live = false;
        voices[i].channel = 0;
        voices[i].midi_note = 0;
        voices[i].velocity = 0;
        voices[i].keydown_seq = 0;
        voices[i].mpePitchBend = 0;
    }

    controllers.values_[kControllerPitchRangeUp] = 3;
    controllers.values_[kControllerPitchRangeDn] = 3;
    controllers.values_[kControllerPitchStep] = 0;
    controllers.masterTune = 0;

    // Initialize controls (this creates all the Ctrl objects the UI binds to)
    initCtrl();

    // Set initial program
    setCurrentProgram(0);
}

DexedAudioProcessor::~DexedAudioProcessor() {}

// Audio processing stubs (not used in UI-only build)
void DexedAudioProcessor::prepareToPlay(double, int) {}
void DexedAudioProcessor::releaseResources() {}
void DexedAudioProcessor::processBlock(AudioSampleBuffer&, MidiBuffer&) {}
void DexedAudioProcessor::panic() {}

void DexedAudioProcessor::setMonoMode(bool mode) {
    monoMode = mode;
}

bool DexedAudioProcessor::peekVoiceStatus() {
    return false;
}

void DexedAudioProcessor::updateUI() {
    // Trigger UI refresh
    forceRefreshUI = true;
}

AudioProcessorEditor* DexedAudioProcessor::createEditor() {
    return new DexedAudioProcessorEditor(this);
}

bool DexedAudioProcessor::hasEditor() const { return true; }

const String DexedAudioProcessor::getName() const { return "Dexed"; }
bool DexedAudioProcessor::acceptsMidi() const { return true; }
bool DexedAudioProcessor::producesMidi() const { return false; }
bool DexedAudioProcessor::silenceInProducesSilenceOut() const { return false; }
double DexedAudioProcessor::getTailLengthSeconds() const { return 0; }
const String DexedAudioProcessor::getInputChannelName(int) const { return ""; }
const String DexedAudioProcessor::getOutputChannelName(int) const { return ""; }
bool DexedAudioProcessor::isInputChannelStereoPair(int) const { return true; }
bool DexedAudioProcessor::isOutputChannelStereoPair(int) const { return true; }
bool DexedAudioProcessor::isBusesLayoutSupported(const BusesLayout&) const { return true; }

int DexedAudioProcessor::getEngineType() { return engineType; }
void DexedAudioProcessor::setEngineType(int tp) {
    engineType = tp;
    // Set the engine core pointer (UI reads this for algorithm display)
    switch (engineType) {
        case DEXED_ENGINE_MARKI: controllers.core = &engineMkI; break;
        case DEXED_ENGINE_OPL: controllers.core = &engineOpl; break;
        default: controllers.core = &engineMsfa; break;
    }
}

void DexedAudioProcessor::handleAsyncUpdate() {
    forceRefreshUI = true;
}

void DexedAudioProcessor::handleIncomingMidiMessage(MidiInput*, const MidiMessage&) {}

bool DexedAudioProcessor::getNextEvent(MidiBuffer::Iterator*, const int) { return false; }
void DexedAudioProcessor::processMidiMessage(const MidiMessage*) {}
void DexedAudioProcessor::keydown(uint8_t, uint8_t, uint8_t) {}
void DexedAudioProcessor::keyup(uint8_t, uint8_t, uint8_t) {}

// Tuning stubs
void DexedAudioProcessor::applySCLTuning() {}
void DexedAudioProcessor::applyKBMMapping() {}
void DexedAudioProcessor::applySCLTuning(File) {}
void DexedAudioProcessor::applyKBMMapping(File) {}
void DexedAudioProcessor::applySCLTuning(std::string) {}
void DexedAudioProcessor::applyKBMMapping(std::string) {}
void DexedAudioProcessor::retuneToStandard() {
    synthTuningState = createStandardTuning();
}
void DexedAudioProcessor::resetTuning(std::shared_ptr<TuningState>) {}
int DexedAudioProcessor::tuningTranspositionShift() { return 0; }
void DexedAudioProcessor::setZoomFactor(float f) { zoomFactor = f; }

//==============================================================================
// JUCE 8 platform stubs (needed for modal dialogs and missing platform code)
//==============================================================================

// Include the interface header so we can implement it
#include <juce_gui_basics/detail/juce_ScopedMessageBoxInterface.h>

namespace juce {
    bool Process::openDocument(const String&, const String&) { return false; }

    namespace detail {
        struct WasmMessageBox final : public ScopedMessageBoxInterface {
            WasmMessageBox(const MessageBoxOptions&) {}
            void runAsync(std::function<void(int)> cb) override { if (cb) cb(0); }
            int runSync() override { return 0; }
            void close() override {}
        };

        std::unique_ptr<ScopedMessageBoxInterface> ScopedMessageBoxInterface::create(const MessageBoxOptions& opts) {
            return std::make_unique<WasmMessageBox>(opts);
        }
    }

    MessageBoxOptions MessageBoxOptions::makeOptionsYesNoCancel(
        MessageBoxIconType, const String&, const String&,
        const String&, const String&, const String&, Component*) {
        return MessageBoxOptions();
    }
}
