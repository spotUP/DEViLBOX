// monique_access_hack.h — Makes Monique's private/protected members accessible
// Required because our wrapper needs direct access to internal state.
// This MUST be included AFTER all JUCE headers but BEFORE Monique headers.
#pragma once

// Open access to Monique internals for WASM wrapper
#define private public
#define protected public
