// MxcsrFlagGuard stub for WASM
// The SSE FTZ/DAZ flags don't apply to WASM, so this is a no-op

#include <WaveSabreCore/MxcsrFlagGuard.h>

namespace WaveSabreCore
{
    MxcsrFlagGuard::MxcsrFlagGuard()
    {
        // No-op for WASM - no SSE control register
        mxcsrRestore = 0;
    }

    MxcsrFlagGuard::~MxcsrFlagGuard()
    {
        // No-op
    }
}
