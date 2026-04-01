/*
 * Odin2Stubs.cpp — Stub implementations for Odin2 WASM UI-only build.
 * Replaces: ConfigFileManager, UIAssetManager (sync), ImpulseResponseCreator,
 *           and platform-specific JUCE functions.
 */

#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "ConfigFileManager.h"
#include "gui/UIAssetManager.h"
#include "gui/UIAssetsData.h"
#include "gui/UIAssetsSize.h"

#include <emscripten.h>

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigFileManager — WASM stub (no filesystem, return defaults)
// ═══════════════════════════════════════════════════════════════════════════════

ConfigFileManager::ConfigFileManager() {}

void ConfigFileManager::saveDataToFile() {}
void ConfigFileManager::setOptionBigGUI(bool) {}
bool ConfigFileManager::getOptionBigGUI() { return false; }
void ConfigFileManager::setOptionShowTooltip(bool) {}
bool ConfigFileManager::getOptionShowTooltip() { return true; }
void ConfigFileManager::setOptionGuiScale(int p_scale) { m_gui_scale = p_scale; }
int ConfigFileManager::getOptionGuiScale() { return m_gui_scale; }
void ConfigFileManager::setOptionTuningDir(String) {}
String ConfigFileManager::getOptionTuningDir() { return "/"; }
void ConfigFileManager::setOptionSoundbankDir(String) {}
String ConfigFileManager::getOptionSoundbankDir() { return "/"; }
void ConfigFileManager::setOptionPatchDir(String) {}
String ConfigFileManager::getOptionPatchDir() { return "/"; }
int ConfigFileManager::getNumGuiOpens() { return 99; }
void ConfigFileManager::incrementNumGuiOpens() {}
void ConfigFileManager::setOptionSplineAd1Seen(bool) {}
bool ConfigFileManager::getOptionSplineAd1Seen() { return true; }
void ConfigFileManager::setOptionSplineAd2Seen(bool) {}
bool ConfigFileManager::getOptionSplineAd2Seen() { return true; }
void ConfigFileManager::createDirIfNeeded() {}

// ═══════════════════════════════════════════════════════════════════════════════
// UIAssetManager — WASM stub (synchronous loading, no threads, no disk cache)
// ═══════════════════════════════════════════════════════════════════════════════

JUCE_IMPLEMENT_SINGLETON(UIAssetManager)

UIAssetManager::UIAssetManager()
    : m_asset_folder(juce::File()), m_rescaler_thread(m_is_rescaling) {}

UIAssetManager::~UIAssetManager() {
    clearSingletonInstance();
}

juce::Image UIAssetManager::getUIAsset(UIAssets::Indices p_index, unsigned int) {
    return m_image_storage[int(p_index)];
}

bool UIAssetManager::isCurrentlyRescaling() const { return false; }

bool UIAssetManager::launchImageCreationThreads(unsigned int p_zoom) {
    // Synchronous loading in WASM (no threading)
    std::atomic<float> progress{0.0f};
    createScaledImageAssets(p_zoom, 0, progress);
    return false; // false = no overlay needed (already done)
}

void UIAssetManager::createScaledImageAssets(unsigned int p_zoom, int, std::atomic<float>& p_progress) {
    for (int i = 0; i < int(UIAssets::Indices::NumIndices); ++i) {
        p_progress.store(float(i) / float(UIAssets::Indices::NumIndices));

        auto unscaled = juce::ImageCache::getFromMemory(
            UIAssetsData::Data[i], UIAssetsSize::Size[i]);

        if (unscaled.isNull()) continue;

        const auto newW = (unscaled.getWidth() / int(GuiScale::Z200)) * p_zoom;
        const auto newH = (unscaled.getHeight() / int(GuiScale::Z200)) * p_zoom;

        m_image_storage[i] = unscaled.rescaled(newW, newH, juce::Graphics::mediumResamplingQuality);
    }
    p_progress.store(1.0f);
}

void UIAssetManager::registerEditor(OdinEditor* p) {
    juce::SpinLock::ScopedLockType lock(m_register_editor_lock);
    m_registered_editors.push_back(p);
}
void UIAssetManager::unregisterEditor(OdinEditor* p) {
    juce::SpinLock::ScopedLockType lock(m_register_editor_lock);
    m_registered_editors.erase(
        std::remove(m_registered_editors.begin(), m_registered_editors.end(), p),
        m_registered_editors.end());
}
void UIAssetManager::setAllEditorOverlaysVisible(bool) {}
void UIAssetManager::setAllEditorZoomSize(GuiScale) {}
void UIAssetManager::setAllRescaleProgress(float) {}
bool UIAssetManager::assetFolderExistsAndContainsImages() const { return false; }
void UIAssetManager::popuplateStorageFromFolder() {}

// UIRescalerThread — stub (no threading in WASM)
UIRescalerThread::UIRescalerThread(std::atomic<bool>& p) : juce::Thread("rescaler"), m_is_rescaling(p) {}
void UIRescalerThread::run() {}
void UIRescalerThread::setZoom(unsigned int p) { m_zoom = p; }

// UIRescalerWorkerThread — stub
UIRescalerWorkerThread::UIRescalerWorkerThread(std::atomic<float>& p, int idx)
    : juce::Thread("worker"), m_progress(p), m_thread_index(idx), m_zoom(6) {}
void UIRescalerWorkerThread::run() {}
void UIRescalerWorkerThread::setZoom(unsigned int p) { m_zoom = p; }

// ═══════════════════════════════════════════════════════════════════════════════
// TuningComponent — WASM stub (no filesystem for .scl/.kbm files)
// TuningComponent.h is included via PluginEditor.h (no #pragma once in header)
// ═══════════════════════════════════════════════════════════════════════════════

TuningComponent::TuningComponent(OdinAudioProcessor& p)
    : m_processor(p), m_tuning_dropdown("Tuning") {
    m_tuning_dropdown.setInlay(1);
    addAndMakeVisible(m_tuning_dropdown);
}

void TuningComponent::resized() {
    m_tuning_dropdown.setBounds(getLocalBounds());
}

void TuningComponent::importSCLFile() {}
void TuningComponent::importKBMFile() {}
void TuningComponent::exportSCLFileWithFileBrowser() {}
void TuningComponent::exportKBMFileWithFileBrowser() {}
void TuningComponent::restoreSCL() {}
void TuningComponent::restoreKBM() {}
void TuningComponent::resetEntireTuning() {}
void TuningComponent::importSCLFromFileBrowser(String, String, String, int) {}
void TuningComponent::importKBMFromFileBrowser(String, String, String, int) {}

// ═══════════════════════════════════════════════════════════════════════════════
// JUCE Platform Stubs (same as OBXf)
// ═══════════════════════════════════════════════════════════════════════════════

#include <juce_gui_basics/detail/juce_ScopedMessageBoxInterface.h>
#include <juce_gui_basics/detail/juce_WindowingHelpers.h>

namespace juce
{
bool Process::openDocument(const String&, const String&) { return false; }
void File::revealToUser() const {}
String File::getNativeLinkedTarget() const { return getFullPathName(); }

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

ScopedMessageBox::ScopedMessageBox() = default;
ScopedMessageBox::ScopedMessageBox(std::shared_ptr<detail::ScopedMessageBoxImpl>) {}
ScopedMessageBox::~ScopedMessageBox() noexcept = default;
ScopedMessageBox::ScopedMessageBox(ScopedMessageBox&&) noexcept = default;
ScopedMessageBox& ScopedMessageBox::operator=(ScopedMessageBox&&) noexcept = default;

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

MessageBoxOptions MessageBoxOptions::makeOptionsYesNoCancel(
    MessageBoxIconType, const String&, const String&,
    const String&, const String&, const String&, Component*) {
    return MessageBoxOptions();
}

} // namespace juce
