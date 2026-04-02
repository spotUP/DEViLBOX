/*
 * SurgeStubs.cpp — Minimal stubs for Surge XT WASM UI-only build.
 * Only stub: JUCE 8 platform APIs that have no implementation in WASM
 * and Surge-specific features disabled for WASM (OSC, CLAP, etc).
 */

#include <emscripten.h>
#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_utils/juce_audio_utils.h>

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

// ═══════════════════════════════════════════════════════════════════════════════
// DatagramSocket stubs (networking not available in WASM)
// ═══════════════════════════════════════════════════════════════════════════════

namespace juce {

DatagramSocket::DatagramSocket(bool, const SocketOptions&) {}
DatagramSocket::~DatagramSocket() {}
bool DatagramSocket::bindToPort(int) { return false; }
bool DatagramSocket::bindToPort(int, const String&) { return false; }
int DatagramSocket::getBoundPort() const noexcept { return -1; }
int DatagramSocket::waitUntilReady(bool, int) { return -1; }
int DatagramSocket::read(void*, int, bool) { return -1; }
int DatagramSocket::read(void*, int, bool, String&, int&) { return -1; }
int DatagramSocket::write(const String&, int, const void*, int) { return -1; }
void DatagramSocket::shutdown() {}
bool DatagramSocket::joinMulticast(const String&) { return false; }
bool DatagramSocket::leaveMulticast(const String&) { return false; }
bool DatagramSocket::setMulticastLoopbackEnabled(bool) { return false; }
bool DatagramSocket::setEnablePortReuse(bool) { return false; }

// MemoryMappedFile stub
void MemoryMappedFile::openInternal(const File&, AccessMode, bool) {}
MemoryMappedFile::~MemoryMappedFile() {}

} // namespace juce
