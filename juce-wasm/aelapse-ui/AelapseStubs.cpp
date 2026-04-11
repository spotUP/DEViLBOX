/**
 * AelapseStubs.cpp — Concrete PluginProcessor subclass + loadPlugin factory
 * for the DEViLBOX WASM UI build of ÆLAPSE.
 *
 * The upstream plugin has an abstract `aelapse::PluginProcessor` base with
 * two pure-virtual hooks (getRMSStack, getSwitchIndicator) that are satisfied
 * by `aelapse::DSP_ARCH_NAMESPACE::PluginProcessor` in PluginProcessorArch.cpp.
 * For the UI-only WASM we don't want the full DSP, so we provide a no-op
 * subclass that lets PluginEditor construct and interact with parameters
 * without ever actually processing audio.
 */

#include "PluginProcessor.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>
#include <atomic>

// SPRINGS_RMS_STACK_SIZE / SPRINGS_N_SPRINGS are set via -D at build time to
// match the DSP WASM module. 4 springs × 64 frames = 256 float slots.
#ifndef SPRINGS_RMS_STACK_SIZE
#define SPRINGS_RMS_STACK_SIZE 64
#endif
#ifndef SPRINGS_N_SPRINGS
#define SPRINGS_N_SPRINGS 4
#endif

namespace aelapse::wasm_ui
{

class StubPluginProcessor final : public aelapse::PluginProcessor
{
  public:
    StubPluginProcessor() = default;
    ~StubPluginProcessor() override = default;

    // ── AudioProcessor overrides ──
    // The editor never drives audio in the UI build, but JUCE's
    // AudioProcessor base class declares these as pure virtual so we must
    // satisfy them.
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
    using juce::AudioProcessor::processBlock;

    // ── aelapse::PluginProcessor overrides ──
    const float *getRMSStack() const override
    {
        return rmsStackStub_.data();
    }

    std::atomic<bool> &getSwitchIndicator() override
    {
        return switchIndicator_;
    }

  private:
    std::array<float, SPRINGS_RMS_STACK_SIZE * SPRINGS_N_SPRINGS> rmsStackStub_{};
    std::atomic<bool> switchIndicator_{false};
};

} // namespace aelapse::wasm_ui

// ── Factory expected by the aelapse plugin source ──────────────────────────
//
// PluginProcessor.cpp / the plugin wrapper sometimes call this to instantiate
// the processor. We return our stub so the editor has something to attach to.

namespace aelapse
{
juce::AudioProcessor *loadPlugin()
{
    return new wasm_ui::StubPluginProcessor();
}
} // namespace aelapse

// ═══════════════════════════════════════════════════════════════════════════
// JUCE platform stubs — libjuce-wasm leaves several gui_basics platform hooks
// undefined because they have no Web equivalent. Provide no-op implementations
// so the link step resolves. Same set that juce-wasm/obxf-ui/OBXfStubs.cpp
// provides — copied verbatim so every hardware-UI port shares the same
// behaviour.
// ═══════════════════════════════════════════════════════════════════════════

#include <juce_gui_basics/juce_gui_basics.h>
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

// ScopedMessageBox class stubs
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
