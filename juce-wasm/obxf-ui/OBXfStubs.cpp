/*
 * OBXfStubs.cpp — Stub implementations for OB-Xf WASM UI-only build.
 * Stubs out: DSP/audio processing, file I/O, MIDI handling, state management.
 * Keeps: parameter system, UI components.
 */

#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "Utils.h"
#include "StateManager.h"
#include "MidiHandler.h"
#include "KeyCommandHandler.h"

#include <emscripten.h>

// ═══════════════════════════════════════════════════════════════════════════════
// ObxfAudioProcessor — Stubbed constructor and audio methods
// ═══════════════════════════════════════════════════════════════════════════════

ObxfAudioProcessor::ObxfAudioProcessor()
    : AudioProcessor(BusesProperties()
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      utils(std::make_unique<Utils>()),
      paramCoordinator(std::make_unique<ParameterCoordinator>(*this, *this, *this, synth)),
      paramAlgos(std::make_unique<ParameterAlgos>(*paramCoordinator)),
      midiHandler(synth, bindings, *paramCoordinator),
      state(std::make_unique<StateManager>(this))
{
    isHostAutomatedChange = true;
    initializeCallbacks();
}

ObxfAudioProcessor::~ObxfAudioProcessor() = default;

void ObxfAudioProcessor::prepareToPlay(double, int) {}
void ObxfAudioProcessor::releaseResources() {}
void ObxfAudioProcessor::processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) {}

bool ObxfAudioProcessor::hasEditor() const { return true; }

juce::AudioProcessorEditor* ObxfAudioProcessor::createEditor()
{
    return new ObxfAudioProcessorEditor(*this);
}

const juce::String ObxfAudioProcessor::getName() const { return "OB-Xf"; }
bool ObxfAudioProcessor::acceptsMidi() const { return true; }
bool ObxfAudioProcessor::producesMidi() const { return false; }
bool ObxfAudioProcessor::isMidiEffect() const { return false; }
double ObxfAudioProcessor::getTailLengthSeconds() const { return 0.0; }

int ObxfAudioProcessor::getNumPrograms()
{
    return (int)utils->patchesAsLinearList.size() + 1; // +1 for Init
}

int ObxfAudioProcessor::getCurrentProgram() { return currentDawProgram; }

void ObxfAudioProcessor::setCurrentProgram(int index)
{
    if (index < 0 || index > (int)utils->patchesAsLinearList.size())
        return;
    currentDawProgram = index;
    if (index == 0)
    {
        utils->initializePatch();
        processActiveProgramChanged();
    }
    else
    {
        utils->loadPatch(utils->patchesAsLinearList[index - 1]);
    }
}

const juce::String ObxfAudioProcessor::getProgramName(int index)
{
    if (index == 0) return "Init";
    int i = index - 1;
    if (i >= 0 && i < (int)utils->patchesAsLinearList.size())
        return utils->patchesAsLinearList[i]->displayName;
    return "ERR";
}

void ObxfAudioProcessor::getStateInformation(juce::MemoryBlock&) {}
void ObxfAudioProcessor::setStateInformation(const void*, int) {}

#ifndef JucePlugin_PreferredChannelConfigurations
bool ObxfAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}
#endif

void ObxfAudioProcessor::processActiveProgramChanged() {}
void ObxfAudioProcessor::handleMIDIProgramChange(int) {}
void ObxfAudioProcessor::updateUIState() {}
void ObxfAudioProcessor::randomizeToAlgo(RandomAlgos) {}
void ObxfAudioProcessor::panSetter(PanAlgos) {}
void ObxfAudioProcessor::resetLastLoadedProgramTo(int idx)
{
    lastLoadedProgram = idx;
    if (idx >= 0 && idx < (int)utils->patchesAsLinearList.size())
        lastLoadedPatchNode = utils->patchesAsLinearList[idx];
    else
        lastLoadedPatchNode.reset();
}
int ObxfAudioProcessor::resetLastLoadedProgramByName(const std::string&, bool) { return -1; }

void ObxfAudioProcessor::setEngineParameterValue(const juce::String&, float, bool) {}

void ObxfAudioProcessor::applyActiveProgramValuesToJUCEParameters() {}

void ObxfAudioProcessor::sendChangeMessageWithUndoSuppressed() {}

void ObxfAudioProcessor::initializeCallbacks() {}
void ObxfAudioProcessor::initializeMidiCallbacks() {}
void ObxfAudioProcessor::initializeUtilsCallbacks() {}

// ═══════════════════════════════════════════════════════════════════════════════
// Utils — Stubbed (no filesystem access in WASM)
// ═══════════════════════════════════════════════════════════════════════════════

Utils::Utils() : configLock("__OBXf_WASMConfigLock__")
{
    // Set theme to embedded mode (no filesystem)
    currentTheme = {EMBEDDED, "Default Vector", embeddedThemeSentinel};
    // Populate themeLocations so loadThemeFilesAndCheck() doesn't show AlertWindow (which deadlocks WASM)
    themeLocations.push_back(currentTheme);
}

Utils::~Utils() {}

juce::File Utils::getFactoryFolderInUse() const { return juce::File(); }
void Utils::resolveFactoryFolderInUse() {}
juce::File Utils::getSystemFactoryFolder() const { return juce::File(); }
juce::File Utils::getLocalFactoryFolder() const { return juce::File(); }
juce::File Utils::getDocumentFolder() const { return juce::File(); }
void Utils::createDocumentFolderIfMissing() {}

juce::File Utils::getMIDIProgramsFolder() const { return juce::File(); }
std::vector<juce::File> Utils::getThemeFolders() const { return {}; }
juce::File Utils::getThemeFolderFor(LocationType) const { return juce::File(); }

const std::vector<Utils::ThemeLocation>& Utils::getThemeLocations() const
{
    return themeLocations;
}

Utils::ThemeLocation Utils::getCurrentThemeLocation() const
{
    return currentTheme;
}

void Utils::setCurrentThemeLocation(const ThemeLocation& loc) { currentTheme = loc; }
void Utils::scanAndUpdateThemes() {}

juce::File Utils::getPatchFolderFor(LocationType) const { return juce::File(); }
const Utils::PatchTreeNode& Utils::getPatchRoot() const
{
    static PatchTreeNode root;
    root.isFolder = true;
    root.displayName = "Patches";
    return root;
}
void Utils::rescanPatchTree() {}
void Utils::scanPatchFolderInto(const PatchTreeNode::ptr_t&, LocationType, juce::File&) {}

juce::File Utils::getMidiFolderFor(LocationType) const { return juce::File(); }
std::vector<juce::File> Utils::getMidiFolders() const { return {}; }

void Utils::setGuiSize(int s) { gui_size = s; }
void Utils::scanAndUpdatePatchList() {}
void Utils::setDefaultZoomFactor(float) {}
float Utils::getDefaultZoomFactor() const { return 1.0f; }
void Utils::setUseSoftwareRenderer(bool) {}
bool Utils::getUseSoftwareRenderer() const { return false; }

bool Utils::loadPatch(const PatchTreeNode::ptr_t& node)
{
    if (!node) return false;
    // Notify JS to load this preset in the OBXd audio worklet
    EM_ASM({
        if (typeof window !== 'undefined' && window._obxfUIProgramCallback)
            window._obxfUIProgramCallback($0);
    }, node->index);
    if (hostUpdateCallback) hostUpdateCallback(node->index);
    return true;
}
bool Utils::loadPatch(const juce::File&) { return false; }
bool Utils::savePatch(const juce::File&) { return false; }
void Utils::initializePatch() const
{
    // Notify JS to load Init preset (index -1)
    EM_ASM({
        if (typeof window !== 'undefined' && window._obxfUIProgramCallback)
            window._obxfUIProgramCallback(-1);
    });
}

void Utils::copyPatch() {}
void Utils::pastePatch() {}
bool Utils::isPatchInClipboard() { return false; }

juce::File Utils::fsPathToJuceFile(const fs::path& p) const { return juce::File(p.string()); }
fs::path Utils::juceFileToFsPath(const juce::File& f) const { return fs::path(f.getFullPathName().toStdString()); }

void Utils::setDefaultPatch(const juce::String&) {}
juce::String Utils::getDefaultPatch() const { return ""; }
void Utils::setLastPatchAuthor(const juce::String&) {}
juce::String Utils::getLastPatchAuthor() const { return ""; }
void Utils::setLastPatchLicense(const juce::String&) {}
juce::String Utils::getLastPatchLicense() const { return ""; }

void Utils::updateConfig() {}
bool Utils::serializePatchAsFXPOnto(juce::MemoryBlock&) const { return false; }
bool Utils::isMemoryBlockAPatch(const juce::MemoryBlock&) { return false; }

// ═══════════════════════════════════════════════════════════════════════════════
// MidiHandler — Stubbed
// ═══════════════════════════════════════════════════════════════════════════════

// Define LagHandler so unique_ptr destructor can see the full type
struct MidiHandler::LagHandler {
    ~LagHandler() = default;
};

MidiHandler::MidiHandler(SynthEngine& s, MidiMap& b, ParameterCoordinator& p)
    : synth(s), bindings(b), paramCoordinator(p) {}

MidiHandler::~MidiHandler() = default;

void MidiHandler::setSampleRate(double) {}
void MidiHandler::prepareToPlay() {}
void MidiHandler::processMidiPerSample(juce::MidiBufferIterator*, const juce::MidiBuffer&, int) {}
bool MidiHandler::getNextEvent(juce::MidiBufferIterator*, const juce::MidiBuffer&, int) { return false; }
// setMidiControlledParamSet, setLastMovedController, getLastUsedParameter,
// clearLastUsedParameter, saveBindingsTo, getMidiMap, getLastMovedController,
// getMidiControlledParamSet, getCurrentMidiPath are all inline in header
void MidiHandler::setLastUsedParameter(const juce::String&) {}
void MidiHandler::snapLags() {}
void MidiHandler::processLags() {}

// ═══════════════════════════════════════════════════════════════════════════════
// StateManager — Stubbed (constructor is inline in header)
// ═══════════════════════════════════════════════════════════════════════════════

StateManager::~StateManager() = default;

bool StateManager::loadFromMemoryBlock(juce::MemoryBlock&) { return false; }
void StateManager::getPluginStateInformation(juce::MemoryBlock&) const {}
void StateManager::setPluginStateInformation(const void*, int) {}
void StateManager::getProgramStateInformation(juce::MemoryBlock&) const {}
void StateManager::setProgramStateInformation(const void*, int) {}
void StateManager::collectDAWExtraStateFromInstance() {}
void StateManager::applyDAWExtraStateToInstance() {}
void StateManager::getActiveProgramStateOnto(juce::XmlElement&) const {}
void StateManager::setActiveProgramStateFrom(const juce::XmlElement&, uint64_t) {}

// ═══════════════════════════════════════════════════════════════════════════════
// KeyCommandHandler — Stubbed (no explicit dtor — compiler generates it)
// ═══════════════════════════════════════════════════════════════════════════════

KeyCommandHandler::KeyCommandHandler() {}
void KeyCommandHandler::getAllCommands(juce::Array<juce::CommandID>&) {}
void KeyCommandHandler::getCommandInfo(juce::CommandID, juce::ApplicationCommandInfo&) {}
bool KeyCommandHandler::perform(const InvocationInfo&) { return false; }

// ═══════════════════════════════════════════════════════════════════════════════
// JUCE 8 Platform Stubs
// ═══════════════════════════════════════════════════════════════════════════════

#include <juce_gui_basics/detail/juce_ScopedMessageBoxInterface.h>
#include <juce_gui_basics/detail/juce_WindowingHelpers.h>

namespace juce
{
bool Process::openDocument(const String&, const String&) { return false; }
void File::revealToUser() const {}

bool DragAndDropContainer::performExternalDragDropOfFiles(const StringArray&, bool, Component*, std::function<void()>) { return false; }
bool DragAndDropContainer::performExternalDragDropOfText(const String&, Component*, std::function<void()>) { return false; }

std::shared_ptr<FileChooser::Pimpl> FileChooser::showPlatformDialog(FileChooser&, int, FilePreviewComponent*) { return nullptr; }

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

    Image WindowingHelpers::createIconForFile(const File&) { return Image(); }
}

// ScopedMessageBox — full class stubs
ScopedMessageBox::ScopedMessageBox() = default;
ScopedMessageBox::ScopedMessageBox(std::shared_ptr<detail::ScopedMessageBoxImpl>) {}
ScopedMessageBox::~ScopedMessageBox() noexcept = default;
ScopedMessageBox::ScopedMessageBox(ScopedMessageBox&&) noexcept = default;
ScopedMessageBox& ScopedMessageBox::operator=(ScopedMessageBox&&) noexcept = default;

MessageBoxOptions MessageBoxOptions::makeOptionsYesNoCancel(
    MessageBoxIconType, const String&, const String&,
    const String&, const String&, const String&, Component*) {
    return MessageBoxOptions();
}

MessageBoxOptions MessageBoxOptions::makeOptionsOk(
    MessageBoxIconType, const String&, const String&,
    const String&, Component*) {
    return MessageBoxOptions();
}

MessageBoxOptions MessageBoxOptions::makeOptionsOkCancel(
    MessageBoxIconType, const String&, const String&,
    const String&, const String&, Component*) {
    return MessageBoxOptions();
}

} // namespace juce

// ═══════════════════════════════════════════════════════════════════════════════
// fmt stubs — minimal fmt::format support
// ═══════════════════════════════════════════════════════════════════════════════

// fmt is used by Utils.h inline functions (humanReadableVersion).
// We include fmt header-only mode.
