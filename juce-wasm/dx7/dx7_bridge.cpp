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

// ── Read access to the EGS envelope generators ────────────────────────────
// EGS keeps its 6x16 Envelope array private. The editor's live markers need each voice's operator envelope level
// and stage, and a vendored third-party header should stay unedited, so the member is reached through the
// explicit-instantiation access idiom (standard C++: template arguments of an explicit instantiation are not
// access-checked).
template <typename Tag, typename Tag::type Member>
struct PrivateAccess { friend typename Tag::type privateMember(Tag) { return Member; } };
struct EgsEnvTag {
    using type = dx7Emu::Envelope (dx7Emu::EGS::*)[6][16];
    friend type privateMember(EgsEnvTag);
};
template struct PrivateAccess<EgsEnvTag, &dx7Emu::EGS::env>;

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

// The DX7 keyboard has 61 keys: MIDI 36 (C2) .. 96 (C7). A key is either down or up; the firmware allocates a fresh
// voice for every key-down it is sent, so a second key-down of a key that is still down (a lost key-up: window blur,
// a dropped release, a double trigger) sounded the pitch twice and left one voice stuck after the single key-up.
static constexpr int kDx7Keys = 61;
static constexpr int kDx7FirstNote = 36;
static bool g_keyDown[kDx7Keys] = {};


extern "C" {

EMSCRIPTEN_KEEPALIVE
int dx7Init() {
    if (g_dx7) delete g_dx7;
    g_dx7 = new DX7Engine();
    for (int i = 0; i < kDx7Keys; i++) g_keyDown[i] = false;
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
    if (note < kDx7FirstNote || note >= kDx7FirstNote + kDx7Keys) return;
    const int key = note - kDx7FirstNote;
    g_keyDown[key] = false;
    g_dx7->toSynthPtr->key_off(static_cast<uint8_t>(key));
}

EMSCRIPTEN_KEEPALIVE
void dx7NoteOn(uint8_t note, uint8_t velocity) {
    if (!g_dx7 || !g_dx7->initialized) return;
    if (velocity == 0) { dx7NoteOff(note); return; }
    if (note < kDx7FirstNote || note >= kDx7FirstNote + kDx7Keys) return;
    const int key = note - kDx7FirstNote;
    // midiVelocity has 128 entries: a larger value read past the table and the key sounded nothing (200, 255) or noise.
    if (velocity > 127) velocity = 127;
    if (g_keyDown[key]) g_dx7->toSynthPtr->key_off(static_cast<uint8_t>(key));
    g_keyDown[key] = true;
    g_dx7->toSynthPtr->key_on(static_cast<uint8_t>(key), g_dx7->midiVelocity[velocity]);
}

EMSCRIPTEN_KEEPALIVE
void dx7AllNotesOff() {
    if (!g_dx7 || !g_dx7->initialized) return;
    for (int i = 0; i < kDx7Keys; i++) {
        g_keyDown[i] = false;
        g_dx7->toSynthPtr->key_off(static_cast<uint8_t>(i));
    }
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

/**
 * Envelope state of every voice and operator, for the editor's live markers.
 * Writes 16 voices x 6 operators x 4 bytes to `out` (voice-major, operator index in EGS order: 0 = OP6 ... 5 = OP1):
 *   int16 LE  level    EGS attenuation, 0 = full volume, 0xFF0 = silent (Envelope::level, 1/256 octave steps)
 *   uint8     stage    0..3 = EG segment 1..4 (3 is the release segment)
 *   uint8     flags    bit 0 = key released
 * Returns the number of bytes written (384), or 0 before the firmware has booted.
 */
EMSCRIPTEN_KEEPALIVE
int dx7GetEnvelopeState(uint8_t* out) {
    if (!g_dx7 || !g_dx7->initialized || !out) return 0;
    const auto& env = g_dx7->dx7.egs.*privateMember(EgsEnvTag{});
    int n = 0;
    for (int voice = 0; voice < 16; voice++) {
        for (int op = 0; op < 6; op++) {
            const dx7Emu::Envelope& e = env[op][voice];
            const uint16_t level = static_cast<uint16_t>(e.level);
            out[n++] = static_cast<uint8_t>(level & 0xFF);
            out[n++] = static_cast<uint8_t>(level >> 8);
            out[n++] = static_cast<uint8_t>(e.stage);
            out[n++] = e.keyoff ? 1 : 0;
        }
    }
    return n;
}

/**
 * Copy of the EGS register file (256 bytes at 0x3000): detune 0x30, EG rates 0x40, EG levels 0x60,
 * operator output levels 0x80 (6 x 16 voices), sensitivity/scaling 0xE0. The envelope curves are checked against
 * what the firmware wrote here for a given voice.
 */
EMSCRIPTEN_KEEPALIVE
int dx7GetEgsRegisters(uint8_t* out) {
    if (!g_dx7 || !g_dx7->initialized || !out) return 0;
    std::memcpy(out, g_dx7->dx7.memory + 0x3000, 256);
    return 256;
}

/** Copy `len` bytes of the 6303 address space starting at `addr` (the firmware's RAM: edit buffer, voice memory). */
EMSCRIPTEN_KEEPALIVE
int dx7ReadMemory(int addr, int len, uint8_t* out) {
    if (!g_dx7 || !g_dx7->initialized || !out || addr < 0 || len < 0 || addr + len > 0x10000) return 0;
    std::memcpy(out, g_dx7->dx7.memory + addr, len);
    return len;
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
