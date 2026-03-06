/**
 * virusb_fastboot.h — Pre-loaded Virus B device that skips DSP boot.
 *
 * Uses a P/X/Y memory snapshot captured from a native JIT boot to
 * eliminate the 20+ minute WASM interpreter boot sequence.
 */
#pragma once

#include "virusLib/device.h"
#include "virusLib/dspSingle.h"
#include "virusLib/microcontroller.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/dsp.h"

#include "virusb_snapshot.h"

namespace virusLib
{

class DeviceFastBoot : public Device
{
public:
    // Factory method: creates a pre-booted Virus B device
    static std::unique_ptr<DeviceFastBoot> create(const synthLib::DeviceCreateParams& _params)
    {
        auto dev = std::unique_ptr<DeviceFastBoot>(new DeviceFastBoot(_params));
        if (!dev || !dev->isValid())
            return nullptr;
        return dev;
    }

private:
    DeviceFastBoot(const synthLib::DeviceCreateParams& _params)
        : Device(_params, true) // pass flag to skip boot
    {
    }
};

} // namespace virusLib
