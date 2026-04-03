/**
 * DX7 WASM Bridge — VDX7 cycle-accurate DX7 emulation for Emscripten
 *
 * Bypasses synthLib::Device. Directly wraps the DX7 core (HD6303R MCU +
 * EGS envelope generator + OPS operator) with a simple C API.
 *
 * Requires a 16384-byte (16KB) DX7 firmware ROM to operate.
 * Optionally loads factory voice banks (8 × 4096 bytes = 32KB).
 *
 * Audio output at native 49096.354 Hz — the worklet resamples to host rate.
 */

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <vector>

#include "dx7.h"
#include "Message.h"

#include <emscripten.h>

static constexpr float kNativeSamplerate = 49096.354f;
static constexpr int kBufSize = 512;

struct DX7Engine {
    dx7Emu::ToSynth* toSynthPtr = nullptr;
    dx7Emu::ToGui* toGuiPtr = nullptr;
    dx7Emu::App_ToSynth appToSynth;
    dx7Emu::NullToGui nullToGui;
    dx7Emu::DX7 dx7;

    float volume = 1.0f;
    float midiExpression = 0.0f;
    double cpuCyclesPerSample = 0.0;
    double cycCount = 0.0;

    float internalBuffer[kBufSize] = {};
    float discardBuffer[kBufSize] = {};
    int discardCnt = 0;

    uint8_t midiVelocity[128] = {};

    // Factory voices data (kept alive)
    std::vector<uint8_t> voicesData;

    bool initialized = false;

    DX7Engine() : dx7(toSynthPtr, toGuiPtr) {
        toSynthPtr = &appToSynth;
        toGuiPtr = &nullToGui;

        // CPU cycles per sample: DX7 master clock 9.4265 MHz / 2 / 4 = 1,178,312.5 Hz
        cpuCyclesPerSample = (9.4265e6 / 2.0 / 4.0) / static_cast<double>(kNativeSamplerate);

        // Default velocity curve (0.4 = convex, matches VDX7 default)
        setVelocityCurve(0.4f);
    }

    void setVelocityCurve(float c) {
        if (c < 0.25f || c > 4.0f) c = 1.0f;
        for (int i = 0; i < 128; i++)
            midiVelocity[i] = static_cast<uint8_t>(127.0f * std::pow(static_cast<float>(i) / 127.0f, c) + 0.5f);
    }

    int fillBuffer(float* outBuffer, int maxSamples) {
        cycCount += cpuCyclesPerSample * maxSamples;
        int outCnt = 0;
        discardCnt = 0;
        dx7Emu::Message msg;

        while (cycCount > 0) {
            if (!dx7.haveMsg)
                if (toSynthPtr->pop(msg)) processMessage(msg);

            dx7.run();
            const int cycles = dx7.inst->cycles;

            if (outCnt < maxSamples)
                dx7.egs.clock(outBuffer, outCnt, 4 * cycles);
            else
                dx7.egs.clock(discardBuffer, discardCnt, 4 * cycles);

            cycCount -= (cycles > 0) ? cycles : 1;
        }
        return outCnt;
    }

    void processMessage(dx7Emu::Message msg) {
        switch (dx7Emu::Message::CtrlID(msg.byte1)) {
            case dx7Emu::Message::CtrlID::volume:
                volume = static_cast<float>(std::pow(2.0, msg.byte2 / 127.0) - 1.0);
                break;
            case dx7Emu::Message::CtrlID::sustain:
                dx7.sustain(msg.byte2 != 0);
                break;
            case dx7Emu::Message::CtrlID::porta:
                dx7.porta(msg.byte2 != 0);
                break;
            case dx7Emu::Message::CtrlID::cartridge:
                dx7.cartPresent(msg.byte2 != 0);
                break;
            case dx7Emu::Message::CtrlID::cartridge_num:
                dx7.setBank(msg.byte2, true);
                break;
            case dx7Emu::Message::CtrlID::protect:
                dx7.cartWriteProtect(msg.byte2 != 0);
                break;
            default:
                // Key events: velocity is inverted for DX7 internal keyboard
                if (msg.byte1 > 158 && msg.byte2 != 0)
                    msg.byte2 = 128 - msg.byte2;
                dx7.msg = msg;
                dx7.haveMsg = true;
                break;
        }
    }
};

static DX7Engine* g_dx7 = nullptr;

extern "C" {

EMSCRIPTEN_KEEPALIVE
int dx7Init() {
    if (g_dx7) delete g_dx7;
    g_dx7 = new DX7Engine();
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void dx7Destroy() {
    delete g_dx7;
    g_dx7 = nullptr;
}

EMSCRIPTEN_KEEPALIVE
int dx7LoadFirmware(const uint8_t* data, int size) {
    if (!g_dx7 || !data || size != 16384) return -1;
    if (!g_dx7->dx7.loadFirmware(data, size)) return -2;

    // Set midi volume filter
    g_dx7->dx7.midiFilter.set_f(10.6f / kNativeSamplerate);

    // Start the emulated CPU
    g_dx7->dx7.start();

    // Run boot cycles to initialize firmware (~3M instructions)
    for (int i = 0; i < 3000000; i++)
        g_dx7->dx7.run();

    g_dx7->initialized = true;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int dx7LoadVoices(const uint8_t* data, int size) {
    if (!g_dx7 || !data || size < 4096) return -1;
    g_dx7->voicesData.assign(data, data + size);
    g_dx7->dx7.loadVoices(g_dx7->voicesData.data(), g_dx7->voicesData.size());
    // Load bank 0 as default cartridge
    g_dx7->dx7.setBank(0, true);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int dx7LoadSysex(const uint8_t* data, int size) {
    if (!g_dx7 || !data) return -1;
    // DX7 32-voice bulk dump: 4104 bytes
    if (size == 4104) {
        // Write to internal RAM AND update the cartridge data so the firmware
        // reads from the correct source regardless of cartridge state.
        std::memcpy(g_dx7->dx7.memory + 0x1000, data + 6, 4096);
        // Also update the voicesData cartridge (bank 0) so program changes work
        if (g_dx7->voicesData.size() < 4096)
            g_dx7->voicesData.resize(4096);
        std::memcpy(g_dx7->voicesData.data(), data + 6, 4096);
        g_dx7->dx7.loadVoices(g_dx7->voicesData.data(), g_dx7->voicesData.size());
        g_dx7->dx7.setBank(0, true);
        g_dx7->dx7.midiSerialRx.flush();
        // Send program change to reload voice 0 into EGS
        g_dx7->dx7.midiSerialRx.write(0xC0);
        g_dx7->dx7.midiSerialRx.write(0x00);
        return 0;
    }
    // Forward other sysex through serial
    for (int i = 0; i < size; i++)
        g_dx7->dx7.midiSerialRx.write(data[i]);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void dx7NoteOff(uint8_t note) {
    if (!g_dx7 || !g_dx7->initialized) return;
    if (note >= 34)
        g_dx7->toSynthPtr->key_off(note - 34);
}

EMSCRIPTEN_KEEPALIVE
void dx7NoteOn(uint8_t note, uint8_t velocity) {
    if (!g_dx7 || !g_dx7->initialized) return;
    if (velocity == 0) { dx7NoteOff(note); return; }
    if (note >= 34)
        g_dx7->toSynthPtr->key_on(note - 34, g_dx7->midiVelocity[velocity]);
}

EMSCRIPTEN_KEEPALIVE
void dx7AllNotesOff() {
    if (!g_dx7 || !g_dx7->initialized) return;
    for (int i = 0; i < 61; i++)
        g_dx7->toSynthPtr->key_off(static_cast<uint8_t>(i));
}

EMSCRIPTEN_KEEPALIVE
void dx7Sustain(int on) {
    if (!g_dx7 || !g_dx7->initialized) return;
    g_dx7->toSynthPtr->analog(dx7Emu::Message::CtrlID::sustain, on ? 127 : 0);
}

EMSCRIPTEN_KEEPALIVE
void dx7PitchBend(uint8_t msb) {
    if (!g_dx7 || !g_dx7->initialized) return;
    g_dx7->toSynthPtr->analog(dx7Emu::Message::CtrlID::pitchbend, msb);
}

EMSCRIPTEN_KEEPALIVE
void dx7ModWheel(uint8_t value) {
    if (!g_dx7 || !g_dx7->initialized) return;
    g_dx7->toSynthPtr->analog(dx7Emu::Message::CtrlID::modulate, value);
}

EMSCRIPTEN_KEEPALIVE
void dx7SetBank(int bank) {
    if (!g_dx7 || !g_dx7->initialized) return;
    g_dx7->dx7.setBank(bank % 8, true);
}

EMSCRIPTEN_KEEPALIVE
void dx7ProgramChange(int program) {
    if (!g_dx7 || !g_dx7->initialized) return;
    // Send program change via MIDI serial (the firmware handles voice selection)
    g_dx7->dx7.midiSerialRx.write(0xC0);
    g_dx7->dx7.midiSerialRx.write(static_cast<uint8_t>(program & 0x1F));
}

EMSCRIPTEN_KEEPALIVE
void dx7SetVolume(float vol) {
    if (!g_dx7) return;
    g_dx7->volume = std::clamp(vol, 0.0f, 2.0f);
}

EMSCRIPTEN_KEEPALIVE
float dx7GetNativeSamplerate() {
    return kNativeSamplerate;
}

EMSCRIPTEN_KEEPALIVE
int dx7IsReady() {
    return (g_dx7 && g_dx7->initialized) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void dx7Process(float* outL, float* outR, int numSamples) {
    if (!g_dx7 || !g_dx7->initialized || numSamples <= 0) {
        if (outL) std::memset(outL, 0, numSamples * sizeof(float));
        if (outR) std::memset(outR, 0, numSamples * sizeof(float));
        return;
    }

    // Generate at native rate into internal buffer, then copy
    // The worklet handles resampling from 49096 Hz to host rate
    const int n = std::min(numSamples, kBufSize);
    const int generated = g_dx7->fillBuffer(g_dx7->internalBuffer, n);

    const float mv = std::min(1.0f,
        g_dx7->dx7.midiVolTab[g_dx7->dx7.midiVolume] + g_dx7->midiExpression + 1e-18f);

    for (int i = 0; i < n; i++) {
        float sample = 0.0f;
        if (i < generated) {
            sample = g_dx7->internalBuffer[i] * g_dx7->volume * g_dx7->dx7.midiFilter.operate(mv);
        }
        outL[i] = sample;
        outR[i] = sample;
    }
}

EMSCRIPTEN_KEEPALIVE
const char* dx7GetPatchName(int voiceIndex) {
    static char nameBuf[16];
    std::memset(nameBuf, 0, sizeof(nameBuf));
    if (!g_dx7) return nameBuf;
    // Voice data at internal RAM: 32 voices × 128 bytes, starting at 0x1000
    // Name at offset 118, length 10
    int offset = 0x1000 + voiceIndex * 128;
    for (int i = 0; i < 10; i++) {
        char c = static_cast<char>(g_dx7->dx7.memory[offset + 118 + i]);
        nameBuf[i] = (c >= 32 && c <= 126) ? c : ' ';
    }
    // Trim trailing spaces
    for (int i = 9; i >= 0; i--) {
        if (nameBuf[i] == ' ') nameBuf[i] = 0;
        else break;
    }
    return nameBuf;
}

} // extern "C"
