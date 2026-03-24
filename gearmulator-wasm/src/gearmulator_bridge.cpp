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

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>
#include <vector>
#include <memory>

#include "synthLib/device.h"
#include "synthLib/deviceTypes.h"
#include "synthLib/deviceException.h"
#include "synthLib/audioTypes.h"
#include "synthLib/midiTypes.h"
#include "dsp56kEmu/audio.h"
#include "dsp56kEmu/dsp.h"
#include "virusLib/dspSingle.h"

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
#ifdef __EMSCRIPTEN__
namespace jeLib { extern std::vector<uint8_t> g_cachedRam; }
#endif
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

// ─── ROM pre-processing helpers ─────────────────────────────────────────────

/**
 * Byte-swap 16-bit words in ROM data.
 * Some EPROM dumps store data in big-endian 16-bit words, but the microQ
 * firmware expects little-endian byte order (e.g., "2.23" at offset 0).
 */
static void byteSwap16(std::vector<uint8_t>& data)
{
    for (size_t i = 0; i + 1 < data.size(); i += 2)
        std::swap(data[i], data[i + 1]);
}

/**
 * Pre-process microQ ROM: detect byte-swapped EPROM dumps.
 * A valid microQ ROM starts with "2.23" (ASCII). Byte-swapped dumps
 * start with ".232" instead — swap 16-bit words to fix.
 */
static void preprocessMicroQRom(std::vector<uint8_t>& romData)
{
    if (romData.size() < 4)
        return;
    // Already valid? ("2.23" at offset 0)
    if (romData[0] == '2' && romData[1] == '.' && romData[2] == '2' && romData[3] == '3')
        return;
    // Byte-swapped? (".232" at offset 0 → swap to get "2.23")
    if (romData[0] == '.' && romData[1] == '2' && romData[2] == '3' && romData[3] == '2')
    {
        std::cerr << "gm_create: microQ ROM is byte-swapped, fixing...\n";
        byteSwap16(romData);
    }
}

/**
 * Pre-process Nord Lead 2x ROM: fix case mismatch in firmware identifier.
 * Some ROM dumps have "Nr2\0NL2\0" (uppercase N) but the n2x validation
 * expects "nr2\0nL2\0" (lowercase n). Patch in-place.
 */
static void preprocessNordRom(std::vector<uint8_t>& romData)
{
    constexpr uint8_t upper[] = {'N', 'r', '2', 0, 'N', 'L', '2', 0};
    constexpr uint8_t lower[] = {'n', 'r', '2', 0, 'n', 'L', '2', 0};

    auto it = std::search(romData.begin(), romData.end(), std::begin(upper), std::end(upper));
    if (it != romData.end())
    {
        std::cerr << "gm_create: Nord ROM has uppercase identifiers, patching...\n";
        std::copy(std::begin(lower), std::end(lower), it);
    }
}

// ─── C API ───────────────────────────────────────────────────────────────────

extern "C"
{

/**
 * Pre-load JP-8000 RAM dump data (factory reset state).
 * Must be called before gm_create with synthType=5 to avoid slow WASM factory reset.
 * @param ramData  Pointer to 256KB RAM dump
 * @param ramSize  Size (must be 262144 = 256*1024)
 */
EXPORT void gm_loadJP8kRam(const uint8_t* ramData, uint32_t ramSize)
{
#ifndef GM_NO_JP8000
#ifdef __EMSCRIPTEN__
    if (ramData && ramSize == 256 * 1024)
        jeLib::g_cachedRam.assign(ramData, ramData + ramSize);
#endif
#endif
}

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
    params.romName = "rom.bin"; // Must be non-empty — Nord RomData uses filename emptiness as validity check
    params.hostSamplerate = sampleRate;
    params.preferredSamplerate = sampleRate;

    // Pre-process ROM data for synths that need it
    if (synthType == GM_WALDORF_MQ || synthType == GM_WALDORF_XT)
        preprocessMicroQRom(params.romData);
    else if (synthType == GM_NORD_LEAD_2X)
        preprocessNordRom(params.romData);

    std::unique_ptr<synthLib::Device> device;

    try
    {
        switch (static_cast<GmSynthType>(synthType))
        {
        case GM_VIRUS_ABC:
            params.customData = static_cast<uint32_t>(virusLib::DeviceModel::ABC); // ABC = C = 2
            device = std::make_unique<virusLib::Device>(params);
            break;
        case GM_VIRUS_TI:
            params.customData = static_cast<uint32_t>(virusLib::DeviceModel::TI);
            device = std::make_unique<virusLib::Device>(params);
            break;
#ifndef GM_NO_WALDORF_MQ
        case GM_WALDORF_MQ:
            printf("[EM] gm_create: creating microQ device...\n");
            device = std::make_unique<mqLib::Device>(params);
            printf("[EM] gm_create: microQ device created!\n");
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
    catch (const synthLib::DeviceException& e)
    {
        std::cerr << "gm_create: DeviceException: " << e.what() << '\n';
        return -1;
    }
    catch (const std::exception& e)
    {
        std::cerr << "gm_create: exception: " << e.what() << '\n';
        return -1;
    }
    catch (...)
    {
        std::cerr << "gm_create: unknown exception\n";
        return -1;
    }

    if (!device || !device->isValid())
        return -1;

    auto gm = std::make_unique<GmDevice>();
    gm->device = std::move(device);
    gm->type = static_cast<GmSynthType>(synthType);

    // Find an empty slot or append
    int32_t handle = -1;
    for (size_t i = 0; i < g_devices.size(); ++i)
    {
        if (!g_devices[i])
        {
            g_devices[i] = std::move(gm);
            handle = static_cast<int32_t>(i);
            break;
        }
    }
    if (handle < 0)
    {
        g_devices.push_back(std::move(gm));
        handle = static_cast<int32_t>(g_devices.size() - 1);
    }

    // Warm-up: process several blocks to let the DSP drain the HDI08 queue
    // from createDefaultState() (preset load). Without this, the preset data
    // is still pending when the first MIDI event arrives, causing HDI08
    // protocol desynchronization and silent output.
    {
        constexpr uint32_t warmupSamples = 64;
        std::vector<float> dummyL(warmupSamples, 0.0f);
        std::vector<float> dummyR(warmupSamples, 0.0f);
        std::vector<float> dummyBuf(warmupSamples, 0.0f);

        auto& dev = *g_devices[handle];
        const synthLib::TAudioInputs inputs = {dummyBuf.data(), dummyBuf.data(), dummyBuf.data(), dummyBuf.data()};
        const synthLib::TAudioOutputs outputs = {
            dummyL.data(), dummyR.data(),
            dummyBuf.data(), dummyBuf.data(), dummyBuf.data(), dummyBuf.data(),
            dummyBuf.data(), dummyBuf.data(), dummyBuf.data(), dummyBuf.data(),
            dummyBuf.data(), dummyBuf.data()
        };

        std::vector<synthLib::SMidiEvent> noMidi;
        for (int i = 0; i < 32; ++i)
        {
            dev.midiOut.clear();
            dev.device->process(inputs, outputs, warmupSamples, noMidi, dev.midiOut);
        }
        printf("[EM] gm_create: warm-up complete (32 x %u samples)\n", warmupSamples);
    }

    return handle;
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
// Scratch buffers for unused input/output channels (avoids null pointer deref in MicroQ)
static std::vector<float> g_dummyIn;
static std::vector<float> g_dummyOut;

static void ensureDummyBuffers(uint32_t numSamples)
{
    if (g_dummyIn.size() < numSamples)
    {
        g_dummyIn.resize(numSamples, 0.0f);
        g_dummyOut.resize(numSamples, 0.0f);
    }
    else
    {
        std::memset(g_dummyIn.data(), 0, numSamples * sizeof(float));
        std::memset(g_dummyOut.data(), 0, numSamples * sizeof(float));
    }
}

EXPORT void gm_process(int32_t handle, float* outputL, float* outputR, uint32_t numSamples)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return;

    auto& gm = *g_devices[handle];

    // Zero output buffers
    std::memset(outputL, 0, numSamples * sizeof(float));
    std::memset(outputR, 0, numSamples * sizeof(float));

    // Ensure dummy buffers for unused channels (microQ reads 2 inputs, writes 6 outputs)
    ensureDummyBuffers(numSamples);
    float* dummy = g_dummyOut.data();
    float* dummyIn = g_dummyIn.data();

    const synthLib::TAudioInputs inputs = {dummyIn, dummyIn, dummyIn, dummyIn};
    const synthLib::TAudioOutputs outputs = {
        outputL, outputR,
        dummy, dummy, dummy, dummy,
        dummy, dummy, dummy, dummy,
        dummy, dummy
    };

    const auto midiInSize = gm.midiIn.size();
    gm.midiOut.clear();
    gm.device->process(inputs, outputs, numSamples, gm.midiIn, gm.midiOut);
    const auto midiOutSize = gm.midiOut.size();
    if (midiInSize > 0 || midiOutSize > 0)
        printf("[EM] gm_process: midiIn=%d midiOut=%d numSamples=%u\n",
               static_cast<int>(midiInSize), static_cast<int>(midiOutSize), numSamples);
    gm.midiIn.clear();
}

/**
 * Non-blocking: push audio input only, don't wait for output.
 * Returns number of input frames successfully pushed.
 */
EXPORT int32_t gm_pushAudioInput(int32_t handle, uint32_t numSamples)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return -1;

    auto* virusDev = dynamic_cast<virusLib::Device*>(g_devices[handle]->device.get());
    if (!virusDev) return -2;

    auto& audio = virusDev->getDSP()->getAudio();
    auto& inputs = audio.getAudioInputs();

    uint32_t pushed = 0;
    for (uint32_t i = 0; i < numSamples && !inputs.full(); ++i)
    {
        inputs.push_back({});
        ++pushed;
    }
    return static_cast<int32_t>(pushed);
}

/**
 * Non-blocking: pull audio output if available.
 * Returns number of frames actually read (may be less than requested).
 */
EXPORT int32_t gm_pullAudioOutput(int32_t handle, float* outputL, float* outputR, uint32_t numSamples)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return -1;

    auto* virusDev = dynamic_cast<virusLib::Device*>(g_devices[handle]->device.get());
    if (!virusDev) return -2;

    auto& audio = virusDev->getDSP()->getAudio();
    auto& outputs = audio.getAudioOutputs();

    uint32_t read = 0;
    while (read < numSamples && !outputs.empty())
    {
        outputs.pop_front([&](dsp56k::Audio::TxFrame& frame)
        {
            // Frame contains slots; slot 0 has TX0-TX5 (6 channels)
            // TX0 = L, TX1 = R for main stereo pair
            if (!frame.empty())
            {
                auto& slot = frame[0];
                // DSP56k 24-bit signed → float conversion
                auto toFloat = [](dsp56k::TWord w) -> float
                {
                    int32_t s = static_cast<int32_t>(w << 8) >> 8;
                    return static_cast<float>(s) / 8388608.0f;
                };
                if (outputL) outputL[read] = toFloat(slot[0]);
                if (outputR) outputR[read] = toFloat(slot[1]);
            }
            else
            {
                if (outputL) outputL[read] = 0.0f;
                if (outputR) outputR[read] = 0.0f;
            }
        });
        ++read;
    }
    return static_cast<int32_t>(read);
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
    printf("[EM] gm_sendMidi: handle=%d status=0x%02X data1=%d data2=%d queueSize=%d\n",
           handle, status, data1, data2, static_cast<int>(gm.midiIn.size()));
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
    return static_cast<int32_t>(virusDev->getDSP()->getAudio().getAudioOutputs().size());
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
    return static_cast<int32_t>(virusDev->getDSP()->getAudio().getAudioInputs().size());
}

// ─── Async Boot API ─────────────────────────────────────────────────────────
// For synths with long boot times (microQ, XT, Nord), gm_create blocks for
// 10+ minutes in WASM interpreter mode. These functions let the Worker run
// boot in a background thread so it stays responsive for status messages.

static std::atomic<int32_t> g_asyncResult{-2};  // -2 = not started
static std::atomic<bool> g_asyncDone{false};

/**
 * Start device creation asynchronously in a background thread.
 * Poll gm_is_boot_done() and retrieve result with gm_get_async_result().
 */
EXPORT void gm_create_async(const uint8_t* romData, uint32_t romSize, int32_t synthType, float sampleRate)
{
    auto rom = new std::vector<uint8_t>(romData, romData + romSize);
    g_asyncDone = false;
    g_asyncResult = -2;

    std::thread([rom, synthType, sampleRate]() {
        int32_t h = gm_create(rom->data(), static_cast<uint32_t>(rom->size()), synthType, sampleRate);
        delete rom;
        g_asyncResult.store(h);
        g_asyncDone.store(true);
    }).detach();
}

/** Returns 1 when async boot is complete, 0 while still booting. */
EXPORT int32_t gm_is_boot_done()
{
    return g_asyncDone.load() ? 1 : 0;
}

/** Returns the device handle from async boot (>= 0 success, -1 failure). */
EXPORT int32_t gm_get_async_result()
{
    return g_asyncResult.load();
}

/**
 * Check if MC68K firmware boot has completed for snapshot-booted synths.
 * For synths that use hybrid snapshot+MC68K boot (microQ, XT), the DSP starts
 * immediately from snapshot but MIDI won't work until the MC68K firmware finishes
 * initializing. Returns 1 when boot is complete, 0 while still booting.
 * For non-snapshot synths, always returns 1 (boot completed during gm_create).
 */
EXPORT int32_t gm_isBootCompleted(int32_t handle)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;

    auto& dev = g_devices[handle];

#ifndef GM_NO_WALDORF_MQ
    if (dev->type == GM_WALDORF_MQ)
    {
        auto* mqDev = dynamic_cast<mqLib::Device*>(dev->device.get());
        if (mqDev)
            return mqDev->isMc68kReady() ? 1 : 0;
    }
#endif

    // Non-snapshot synths are always "boot completed" after gm_create returns
    return 1;
}

/**
 * Run MC68K cycles for inline-processing synths (microQ FullSnapshot).
 * Called from a separate setTimeout loop in the Worker, decoupled from audio.
 * Runs up to _maxCycles MC68K instructions or _timeLimitMs milliseconds,
 * whichever comes first. Returns number of cycles actually executed.
 */
EXPORT int32_t gm_processUc(int32_t handle, int32_t _maxCycles, int32_t _timeLimitMs)
{
    if (handle < 0 || handle >= static_cast<int32_t>(g_devices.size()) || !g_devices[handle])
        return 0;

#ifndef GM_NO_WALDORF_MQ
    auto& dev = g_devices[handle];
    if (dev->type == GM_WALDORF_MQ)
    {
        auto* mqDev = dynamic_cast<mqLib::Device*>(dev->device.get());
        if (mqDev)
        {
            auto* hw = mqDev->getHardware();
            if (hw)
            {
                hw->processUcCyclesInline(static_cast<uint32_t>(_maxCycles));
                return _maxCycles;
            }
        }
    }
#endif
    return 0;
}

} // extern "C"
