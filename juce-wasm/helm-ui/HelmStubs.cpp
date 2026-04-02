/*
 * HelmStubs.cpp — Minimal stubs for Helm WASM UI-only build.
 * We compile the REAL mopo engine, synth engine, and all UI code.
 * Only stub: JUCE 8 platform APIs that have no implementation in WASM.
 */

#include <emscripten.h>
#include "JuceHeader.h"

#include <juce_gui_basics/detail/juce_ScopedMessageBoxInterface.h>
#include <juce_gui_basics/detail/juce_WindowingHelpers.h>

// ═══════════════════════════════════════════════════════════════════════════════
// JUCE 8 platform stubs (required by libjuce-wasm.a)
// ═══════════════════════════════════════════════════════════════════════════════

namespace juce {

// File I/O stubs
String File::getNativeLinkedTarget() const { return getFullPathName(); }
void File::revealToUser() const {}

// Process / URL
bool Process::openDocument(const String&, const String&) { return false; }

// Drag and drop
bool DragAndDropContainer::performExternalDragDropOfFiles(const StringArray&, bool, Component*, std::function<void()>) { return false; }
bool DragAndDropContainer::performExternalDragDropOfText(const String&, Component*, std::function<void()>) { return false; }

// File chooser
std::shared_ptr<FileChooser::Pimpl> FileChooser::showPlatformDialog(FileChooser&, int, FilePreviewComponent*) { return nullptr; }

// Bluetooth MIDI
bool BluetoothMidiDevicePairingDialogue::isAvailable() { return false; }
bool BluetoothMidiDevicePairingDialogue::open(ModalComponentManager::Callback*, Rectangle<int>*) { return false; }

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
