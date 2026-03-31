// juce_Messaging_wasm.cpp — WASM stub for JUCE message dispatch
// In single-threaded WASM, there's no OS message loop.
// Messages are queued and dispatched explicitly via dispatchPendingMessages().

#include <vector>

namespace juce
{

//==============================================================================
// Simple message queue — queues messages for deferred dispatch.
// This is critical because JUCE posts messages during object construction
// (e.g., Slider::init → setVisible → triggerAsyncUpdate), and calling
// messageCallback() synchronously on a half-constructed object crashes.
//==============================================================================

static std::vector<MessageManager::MessageBase::Ptr> g_pendingMessages;
static bool g_isDispatching = false;

void MessageManager::doPlatformSpecificInitialisation()  {}
void MessageManager::doPlatformSpecificShutdown()        {}

bool MessageManager::postMessageToSystemQueue (MessageManager::MessageBase* message)
{
    if (message != nullptr)
    {
        g_pendingMessages.push_back (message);
    }
    return true;
}

void MessageManager::broadcastMessage (const String&) {}

namespace detail
{
bool dispatchNextMessageOnSystemQueue (bool)
{
    if (g_isDispatching || g_pendingMessages.empty())
        return false;

    g_isDispatching = true;
    auto msg = g_pendingMessages.front();
    g_pendingMessages.erase (g_pendingMessages.begin());
    if (msg != nullptr)
        msg->messageCallback();
    g_isDispatching = false;
    return ! g_pendingMessages.empty();
}
} // namespace detail

} // namespace juce

// Public C API — called from MoniqueUIBridge.cpp each frame
extern "C" {
void juce_wasm_dispatch_messages()
{
    // Drain up to 1000 messages per frame to avoid infinite loops
    for (int i = 0; i < 1000 && !juce::g_pendingMessages.empty(); ++i)
    {
        juce::g_isDispatching = true;
        auto msg = juce::g_pendingMessages.front();
        juce::g_pendingMessages.erase (juce::g_pendingMessages.begin());
        if (msg != nullptr)
            msg->messageCallback();
        juce::g_isDispatching = false;
    }
}
}
