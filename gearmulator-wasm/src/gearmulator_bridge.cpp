/**
 * gearmulator_bridge.cpp — WASM bridge for all gearmulator synth engines.
 *
 * Provides a C API for creating synth devices, processing audio, and sending MIDI.
 * Each device runs the original firmware ROM via DSP56300 interpreter emulation.
 *
 * Synth types:
 *   0 = Virus A/B/C (Osirus)
 *   1 = Virus TI/TI2/Snow (OsTIrus)
 *   2 = Waldorf microQ (Vavra)
 *   3 = Waldorf Microwave II/XT (Xenia)
 *   4 = Nord Lead 2x (Nodal Red)
 *   5 = Roland JP-8000 (JE-8086)
 */

#include <cstdint>
#include <cstring>
#include <vector>
#include <memory>

#include "synthLib/device.h"
#include "synthLib/deviceTypes.h"
#include "synthLib/audioTypes.h"
#include "synthLib/midiTypes.h"

// Synth-specific device headers
#include "virusLib/device.h"
#ifndef GM_NO_WALDORF_MQ
#include "mqLib/device.h"
#endif
#ifndef GM_NO_WALDORF_XT
#include "xtLib/xtDevice.h"
#endif
#ifndef GM_NO_NORD
#include "nord/n2x/n2xLib/n2xdevice.h"
#endif
#ifndef GM_NO_JP8000
#include "ronaldo/je8086/jeLib/device.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

// ─── Synth type enum ─────────────────────────────────────────────────────────

enum GmSynthType : int32_t
{
    GM_VIRUS_ABC    = 0,
    GM_VIRUS_TI     = 1,
    GM_WALDORF_MQ   = 2,
    GM_WALDORF_XT   = 3,
    GM_NORD_LEAD_2X = 4,
    GM_ROLAND_JP8K  = 5,
};

// ─── Device wrapper ──────────────────────────────────────────────────────────

struct GmDevice
{
    std::unique_ptr<synthLib::Device> device;
    GmSynthType type;
    std::vector<synthLib::SMidiEvent> midiIn;
    std::vector<synthLib::SMidiEvent> midiOut;
};

static std::vector<std::unique_ptr<GmDevice>> g_devices;

// ─── C API ───────────────────────────────────────────────────────────────────

extern "C"
{

/**
 * Create a new synth device from a ROM file.
 * @param romData     Pointer to ROM file data
 * @param romSize     Size of ROM data in bytes
 * @param synthType   GmSynthType enum value
 * @param sampleRate  Desired sample rate (e.g., 44100)
 * @return            Device handle (>= 0) or -1 on failure
 */
EXPORT int32_t gm_create(const uint8_t* romData, uint32_t romSize, int32_t synthType, float sampleRate)
{
    synthLib::DeviceCreateParams params;
    params.romData.assign(romData, romData + romSize);
    params.hostSamplerate = sampleRate;
    params.preferredSamplerate = sampleRate;

    std::unique_ptr<synthLib::Device> device;

    try
    {
        switch (static_cast<GmSynthType>(synthType))
        {
        case GM_VIRUS_ABC:
            params.customData = 0; // DeviceModel::ABC
            device = std::make_unique<virusLib::Device>(params);
            break;
        case GM_VIRUS_TI:
            params.customData = static_cast<uint32_t>(virusLib::DeviceModel::TI);
            device = std::make_unique<virusLib::Device>(params);
            break;
#ifndef GM_NO_WALDORF_MQ
        case GM_WALDORF_MQ:
            device = std::make_unique<mqLib::Device>(params);
            break;
#endif
#ifndef GM_NO_WALDORF_XT
        case GM_WALDORF_XT:
            device = std::make_unique<xt::Device>(params);
            break;
#endif
#ifndef GM_NO_NORD
        case GM_NORD_LEAD_2X:
            device = std::make_unique<n2x::Device>(params);
            break;
#endif
#ifndef GM_NO_JP8000
        case GM_ROLAND_JP8K:
            device = std::make_unique<jeLib::Device>(params);
            break;
#endif
        default:
            return -1;
        }
    }
    catch (...)
    {
        return -1;
    }

    if (!device || !device->isValid())
        return -1;

    auto gm = std::make_unique<GmDevice>();
    gm->device = std::move(device);
    gm->type = static_cast<GmSynthType>(synthType);

    // Find an empty slot or append
    for (size_t i = 0; i < g_devices.size(); ++i)
    {
        if (!g_devices[i])
        {
            g_devices[i] = std::move(gm);
            return static_cast<int32_t>(i);
        }
    }

    g_devices.push_back(std::move(gm));
    return static_cast<int32_t>(g_devices.size() - 1);
}

/**
 * Destroy a synth device and free all resources.
 */
EXPORT void gm_destroy(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()))
        return;
    g_devices[handle].reset();
}

/**
 * Process audio. Fills outputL and outputR with float samples (one buffer per channel).
 * @param handle     Device handle
 * @param outputL    Pointer to left channel buffer (numSamples floats)
 * @param outputR    Pointer to right channel buffer (numSamples floats)
 * @param numSamples Number of samples to generate
 */
EXPORT void gm_process(int32_t handle, float* outputL, float* outputR, uint32_t numSamples)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return;

    auto& gm = *g_devices[handle];

    // Zero output buffers
    std::memset(outputL, 0, numSamples * sizeof(float));
    std::memset(outputR, 0, numSamples * sizeof(float));

    // Process directly into caller's buffers
    const synthLib::TAudioInputs inputs = {nullptr, nullptr, nullptr, nullptr};
    const synthLib::TAudioOutputs outputs = {
        outputL, outputR,
        nullptr, nullptr, nullptr, nullptr,
        nullptr, nullptr, nullptr, nullptr,
        nullptr, nullptr
    };

    gm.midiOut.clear();
    gm.device->process(inputs, outputs, numSamples, gm.midiIn, gm.midiOut);
    gm.midiIn.clear();
}

/**
 * Send a MIDI message to the device.
 * @param handle  Device handle
 * @param status  MIDI status byte (e.g., 0x90 for note on)
 * @param data1   First data byte (e.g., note number)
 * @param data2   Second data byte (e.g., velocity)
 */
EXPORT void gm_sendMidi(int32_t handle, uint8_t status, uint8_t data1, uint8_t data2)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return;

    auto& gm = *g_devices[handle];
    synthLib::SMidiEvent ev(synthLib::MidiEventSource::Host, status, data1, data2);
    gm.midiIn.push_back(ev);
}

/**
 * Send a sysex message to the device.
 */
EXPORT void gm_sendSysex(int32_t handle, const uint8_t* data, uint32_t size)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return;

    auto& gm = *g_devices[handle];
    synthLib::SMidiEvent ev;
    ev.source = synthLib::MidiEventSource::Host;
    ev.sysex.assign(data, data + size);
    gm.midiIn.push_back(ev);
}

/**
 * Get the device's actual sample rate.
 */
EXPORT float gm_getSamplerate(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0.0f;
    return g_devices[handle]->device->getSamplerate();
}

/**
 * Check if the device is valid (ROM loaded successfully).
 */
EXPORT int32_t gm_isValid(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;
    return g_devices[handle]->device->isValid() ? 1 : 0;
}

/**
 * Get the device state (preset/bank data) as a byte array.
 * Returns the size of the state data, or 0 on failure.
 * Call with stateOut=nullptr to query the size first.
 */
EXPORT uint32_t gm_getState(int32_t handle, uint8_t* stateOut, uint32_t maxSize)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;

    std::vector<uint8_t> state;
    if (!g_devices[handle]->device->getState(state, synthLib::StateTypeGlobal))
        return 0;

    if (stateOut && state.size() <= maxSize)
        std::memcpy(stateOut, state.data(), state.size());

    return static_cast<uint32_t>(state.size());
}

/**
 * Set the device state (restore preset/bank data).
 */
EXPORT int32_t gm_setState(int32_t handle, const uint8_t* stateData, uint32_t size)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;

    std::vector<uint8_t> state(stateData, stateData + size);
    return g_devices[handle]->device->setState(state, synthLib::StateTypeGlobal) ? 1 : 0;
}

/**
 * Set DSP clock percentage (for performance tuning).
 * 100 = full speed, lower = reduced CPU but potentially degraded audio.
 */
EXPORT int32_t gm_setDspClockPercent(int32_t handle, uint32_t percent)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;
    return g_devices[handle]->device->setDspClockPercent(percent) ? 1 : 0;
}

/**
 * Get the current DSP clock speed in Hz.
 */
EXPORT uint64_t gm_getDspClockHz(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;
    return g_devices[handle]->device->getDspClockHz();
}

/**
 * Debug: non-blocking process — push input but don't wait for output.
 * Returns 1 if input was pushed successfully, 0 otherwise.
 * Use gm_getAudioOutputSize to poll for output readiness.
 */
EXPORT int32_t gm_pushInput(int32_t handle, uint32_t numSamples)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;

    auto& gm = *g_devices[handle];
    auto* virusDev = dynamic_cast<virusLib::Device*>(gm.device.get());
    if (!virusDev) return 0;

    auto& audio = virusDev->getDSP()->getAudio();

    // Push silence into audio input (non-blocking since ring buffer is huge)
    for (uint32_t i = 0; i < numSamples; ++i)
    {
        if (audio.getAudioInputs().full())
            break;
        audio.getAudioInputs().push_back({});
    }
    return 1;
}

/**
 * Debug: check how many output frames the DSP has produced.
 */
EXPORT int32_t gm_getAudioOutputSize(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return -1;
    auto* virusDev = dynamic_cast<virusLib::Device*>(g_devices[handle]->device.get());
    if (!virusDev) return -2;
    auto size = static_cast<int32_t>(virusDev->getDSP()->getAudio().getAudioOutputs().size());
    printf("[EM] gm_getAudioOutputSize: %d samples in queue\n", size);
    return size;
}

/**
 * Debug: check how many input frames are queued.
 */
EXPORT int32_t gm_getAudioInputSize(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return -1;
    auto* virusDev = dynamic_cast<virusLib::Device*>(g_devices[handle]->device.get());
    if (!virusDev) return -2;
    auto size = static_cast<int32_t>(virusDev->getDSP()->getAudio().getAudioInputs().size());
    printf("[EM] gm_getAudioInputSize: %d samples in queue\n", size);
    return size;
}

} // extern "C"
