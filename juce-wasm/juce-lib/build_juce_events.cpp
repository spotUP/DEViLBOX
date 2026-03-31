// build_juce_events.cpp — Unity build for juce_events module
// We include the real juce_events.cpp but provide WASM messaging stubs.

#include "JuceWasmConfig.h"

// The real juce_events.cpp has no #elif JUCE_WASM case for messaging.
// We handle this by providing our own build that includes the portable parts
// and our WASM stubs for the platform-specific parts.

#include <juce_events/juce_events.h>

// Portable source files from juce_events (included directly)
#include <juce_events/messages/juce_ApplicationBase.cpp>
#include <juce_events/messages/juce_DeletedAtShutdown.cpp>
#include <juce_events/messages/juce_MessageListener.cpp>
#include <juce_events/messages/juce_MessageManager.cpp>
#include <juce_events/broadcasters/juce_ActionBroadcaster.cpp>
#include <juce_events/broadcasters/juce_AsyncUpdater.cpp>
#include <juce_events/broadcasters/juce_LockingAsyncUpdater.cpp>
#include <juce_events/broadcasters/juce_ChangeBroadcaster.cpp>
#include <juce_events/timers/juce_MultiTimer.cpp>
#include <juce_events/timers/juce_Timer.cpp>
#include <juce_events/interprocess/juce_ChildProcessManager.cpp>
#include <juce_events/interprocess/juce_InterprocessConnection.cpp>
#include <juce_events/interprocess/juce_InterprocessConnectionServer.cpp>
#include <juce_events/interprocess/juce_ConnectedChildProcess.cpp>
#include <juce_events/interprocess/juce_NetworkServiceDiscovery.cpp>
#include <juce_events/native/juce_ScopedLowPowerModeDisabler.cpp>

// WASM-specific messaging implementation
#include "wasm_stubs/juce_Messaging_wasm.cpp"
