/**
 * OPL3 WASM Bridge — Nuked OPL3 (YMF262) for Emscripten
 *
 * Standalone 18-channel FM synth. No ROM required.
 * Features: SBI patch loading, MIDI note on/off, pitch bend,
 *           sustain pedal, voice stealing, velocity sensitivity.
 *
 * Uses the Nuked OPL3 v1.8 core (Nuke.YKT, LGPL 2.1).
 */

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <array>
#include <string>

extern "C" {
#include "opl3.h"
}

#include <emscripten.h>

// ── SBI patch (11 OPL2 registers) ──────────────────────────────────────
struct SbiPatch {
    uint8_t modTVSKSRMult;   // 0x20 mod
    uint8_t carTVSKSRMult;   // 0x20 car
    uint8_t modKSLTL;        // 0x40 mod
    uint8_t carKSLTL;        // 0x40 car
    uint8_t modARDR;         // 0x60 mod
    uint8_t carARDR;         // 0x60 car
    uint8_t modSLRR;         // 0x80 mod
    uint8_t carSLRR;         // 0x80 car
    uint8_t modWF;           // 0xE0 mod
    uint8_t carWF;           // 0xE0 car
    uint8_t fbAlg;           // 0xC0 feedback/algo
};

// ── Voice slot ──────────────────────────────────────────────────────────
struct OplVoice {
    bool active = false;
    bool held = false;
    bool sustained = false;
    uint8_t midiNote = 0;
    uint64_t age = 0;
    float pitchBend = 0.0f;
};

// ── Engine ──────────────────────────────────────────────────────────────
static constexpr int NUM_CHANNELS = 18;
static constexpr float PITCH_BEND_RANGE = 2.0f;
static const uint8_t SLOT_OFFSET[9] = { 0, 1, 2, 8, 9, 10, 16, 17, 18 };

struct OPL3Engine {
    opl3_chip chip{};
    float sampleRate = 44100.0f;
    SbiPatch patch{};
    std::array<OplVoice, NUM_CHANNELS> voices{};
    uint64_t ageCounter = 0;
    bool sustainPedal = false;
    float globalPitchBend = 0.0f;
    int16_t* intBuf = nullptr;
    size_t intBufSize = 0;
    bool initialized = false;
};

static OPL3Engine* g_opl = nullptr;

// ── Helpers ─────────────────────────────────────────────────────────────
static void channelToBank(uint8_t ch, uint16_t& bank, uint8_t& chInBank) {
    if (ch < 9) { bank = 0x000; chInBank = ch; }
    else        { bank = 0x100; chInBank = static_cast<uint8_t>(ch - 9); }
}

static void writeReg(uint16_t reg, uint8_t val) {
    if (g_opl) OPL3_WriteRegBuffered(&g_opl->chip, reg, val);
}

static void applyPatch(uint8_t ch) {
    if (!g_opl) return;
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    const uint8_t so = SLOT_OFFSET[chInBank];
    const uint8_t sc = so + 3;
    const auto& p = g_opl->patch;

    writeReg(bank | (0x20 + so), p.modTVSKSRMult);
    writeReg(bank | (0x20 + sc), p.carTVSKSRMult);
    writeReg(bank | (0x40 + so), p.modKSLTL);
    writeReg(bank | (0x40 + sc), p.carKSLTL);
    writeReg(bank | (0x60 + so), p.modARDR);
    writeReg(bank | (0x60 + sc), p.carARDR);
    writeReg(bank | (0x80 + so), p.modSLRR);
    writeReg(bank | (0x80 + sc), p.carSLRR);
    writeReg(bank | (0xE0 + so), p.modWF);
    writeReg(bank | (0xE0 + sc), p.carWF);
    writeReg(bank | (0xC0 + chInBank), static_cast<uint8_t>(p.fbAlg | 0x30)); // L+R output
}

static void noteToFnumBlock(uint8_t note, float semitones, uint16_t& fnum, uint8_t& block) {
    const float freq = 440.0f * std::pow(2.0f, (static_cast<float>(note) - 69.0f + semitones) / 12.0f);
    block = 4;
    float fnumF = freq * (1 << (20 - block)) / 49716.0f;
    while (fnumF > 1023.0f && block < 7) { block++; fnumF /= 2.0f; }
    while (fnumF < 0.5f    && block > 0) { block--; fnumF *= 2.0f; }
    fnum = static_cast<uint16_t>(std::clamp(static_cast<int>(fnumF + 0.5f), 0, 1023));
}

static void oplKeyOn(uint8_t ch, uint8_t note, float pitchBend) {
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    applyPatch(ch);
    uint16_t fnum; uint8_t blk;
    noteToFnumBlock(note, pitchBend, fnum, blk);
    writeReg(bank | (0xA0 + chInBank), static_cast<uint8_t>(fnum & 0xFF));
    writeReg(bank | (0xB0 + chInBank), static_cast<uint8_t>(0x20 | ((blk & 7) << 2) | ((fnum >> 8) & 3)));
}

static void oplKeyOff(uint8_t ch) {
    if (!g_opl) return;
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    const auto& v = g_opl->voices[ch];
    uint16_t fnum; uint8_t blk;
    noteToFnumBlock(v.midiNote, v.pitchBend, fnum, blk);
    writeReg(bank | (0xA0 + chInBank), static_cast<uint8_t>(fnum & 0xFF));
    writeReg(bank | (0xB0 + chInBank), static_cast<uint8_t>(((blk & 7) << 2) | ((fnum >> 8) & 3)));
}

static void oplSetPitch(uint8_t ch, uint8_t note, float semitones) {
    if (!g_opl) return;
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    uint16_t fnum; uint8_t blk;
    noteToFnumBlock(note, semitones, fnum, blk);
    bool on = g_opl->voices[ch].held || g_opl->voices[ch].sustained;
    writeReg(bank | (0xA0 + chInBank), static_cast<uint8_t>(fnum & 0xFF));
    writeReg(bank | (0xB0 + chInBank), static_cast<uint8_t>((on ? 0x20 : 0) | ((blk & 7) << 2) | ((fnum >> 8) & 3)));
}

static uint8_t allocVoice() {
    if (!g_opl) return 0;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++)
        if (!g_opl->voices[i].active) return i;
    uint8_t best = 0; uint64_t bestAge = UINT64_MAX;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++) {
        if (!g_opl->voices[i].sustained && g_opl->voices[i].age < bestAge) {
            bestAge = g_opl->voices[i].age; best = i;
        }
    }
    oplKeyOff(best);
    g_opl->voices[best] = {};
    return best;
}

// ── Exported C API ──────────────────────────────────────────────────────
extern "C" {

// Forward declarations
EMSCRIPTEN_KEEPALIVE void oplNoteOff(uint8_t note);

EMSCRIPTEN_KEEPALIVE
int oplInit(float sampleRate) {
    if (g_opl) delete g_opl;
    g_opl = new OPL3Engine();
    g_opl->sampleRate = sampleRate;

    OPL3_Reset(&g_opl->chip, static_cast<uint32_t>(sampleRate));
    writeReg(0x105, 0x01); // OPL3 mode
    writeReg(0x001, 0x20); // waveform select

    // Default patch: bright electric piano sound
    g_opl->patch = { 0x01, 0x11, 0x4F, 0x00, 0xF1, 0xD2, 0x53, 0x74, 0x00, 0x00, 0x06 };

    g_opl->initialized = true;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void oplDestroy() {
    if (g_opl) { delete[] g_opl->intBuf; delete g_opl; g_opl = nullptr; }
}

EMSCRIPTEN_KEEPALIVE
void oplNoteOn(uint8_t note, uint8_t velocity) {
    if (!g_opl || !g_opl->initialized) return;
    if (velocity == 0) { oplNoteOff(note); return; }

    uint8_t ch = allocVoice();
    auto& v = g_opl->voices[ch];
    g_opl->ageCounter++;
    v.active = true; v.held = true; v.sustained = false;
    v.midiNote = note; v.age = g_opl->ageCounter;
    v.pitchBend = g_opl->globalPitchBend;

    // Velocity → carrier TL attenuation
    SbiPatch tmp = g_opl->patch;
    uint8_t velAtten = static_cast<uint8_t>((127 - velocity) * 32 / 127);
    uint8_t carTL = static_cast<uint8_t>(std::min(63, (tmp.carKSLTL & 0x3F) + velAtten));
    g_opl->patch.carKSLTL = static_cast<uint8_t>((tmp.carKSLTL & 0xC0) | carTL);
    oplKeyOn(ch, note, g_opl->globalPitchBend);
    g_opl->patch.carKSLTL = tmp.carKSLTL; // restore
}

EMSCRIPTEN_KEEPALIVE
void oplNoteOff(uint8_t note) {
    if (!g_opl) return;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++) {
        if (g_opl->voices[i].active && g_opl->voices[i].held && g_opl->voices[i].midiNote == note) {
            g_opl->voices[i].held = false;
            if (g_opl->sustainPedal) { g_opl->voices[i].sustained = true; }
            else { oplKeyOff(i); g_opl->voices[i].active = false; }
            break;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void oplSustainPedal(int on) {
    if (!g_opl) return;
    g_opl->sustainPedal = (on != 0);
    if (!g_opl->sustainPedal) {
        for (uint8_t i = 0; i < NUM_CHANNELS; i++) {
            if (g_opl->voices[i].active && g_opl->voices[i].sustained && !g_opl->voices[i].held) {
                oplKeyOff(i); g_opl->voices[i].active = false; g_opl->voices[i].sustained = false;
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void oplPitchBend(float semitones) {
    if (!g_opl) return;
    g_opl->globalPitchBend = semitones;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++) {
        if (g_opl->voices[i].active) {
            g_opl->voices[i].pitchBend = semitones;
            oplSetPitch(i, g_opl->voices[i].midiNote, semitones);
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void oplAllNotesOff() {
    if (!g_opl) return;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++) {
        if (g_opl->voices[i].active) { oplKeyOff(i); g_opl->voices[i] = {}; }
    }
    g_opl->sustainPedal = false;
}

EMSCRIPTEN_KEEPALIVE
int oplLoadSbi(const uint8_t* data, int size) {
    if (!g_opl || size < 47) return -1;
    if (data[0] != 'S' || data[1] != 'B' || data[2] != 'I') return -1;

    const uint8_t* r = data + 36;
    g_opl->patch.modTVSKSRMult = r[0];
    g_opl->patch.carTVSKSRMult = r[1];
    g_opl->patch.modKSLTL      = r[2];
    g_opl->patch.carKSLTL      = r[3];
    g_opl->patch.modARDR       = r[4];
    g_opl->patch.carARDR       = r[5];
    g_opl->patch.modSLRR       = r[6];
    g_opl->patch.carSLRR       = r[7];
    g_opl->patch.modWF         = r[8];
    g_opl->patch.carWF         = r[9];
    g_opl->patch.fbAlg         = r[10];

    // Re-apply to active voices
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++)
        if (g_opl->voices[ch].active) applyPatch(ch);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void oplSetPatchRegisters(uint8_t modTVSK, uint8_t carTVSK, uint8_t modKSL, uint8_t carKSL,
                          uint8_t modARDR, uint8_t carARDR, uint8_t modSLRR, uint8_t carSLRR,
                          uint8_t modWF, uint8_t carWF, uint8_t fbAlg) {
    if (!g_opl) return;
    g_opl->patch = { modTVSK, carTVSK, modKSL, carKSL, modARDR, carARDR, modSLRR, carSLRR, modWF, carWF, fbAlg };
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++)
        if (g_opl->voices[ch].active) applyPatch(ch);
}

EMSCRIPTEN_KEEPALIVE
void oplProcess(float* outL, float* outR, int numSamples) {
    if (!g_opl || !g_opl->initialized || numSamples <= 0) {
        if (outL) std::memset(outL, 0, numSamples * sizeof(float));
        if (outR) std::memset(outR, 0, numSamples * sizeof(float));
        return;
    }

    // Ensure scratch buffer
    size_t needed = static_cast<size_t>(numSamples) * 2;
    if (g_opl->intBufSize < needed) {
        delete[] g_opl->intBuf;
        g_opl->intBuf = new int16_t[needed];
        g_opl->intBufSize = needed;
    }

    OPL3_GenerateStream(&g_opl->chip, g_opl->intBuf, static_cast<uint32_t>(numSamples));

    constexpr float kScale = 4.0f / 32768.0f;
    for (int i = 0; i < numSamples; i++) {
        outL[i] = static_cast<float>(g_opl->intBuf[i * 2 + 0]) * kScale;
        outR[i] = static_cast<float>(g_opl->intBuf[i * 2 + 1]) * kScale;
    }
}

EMSCRIPTEN_KEEPALIVE
int oplGetActiveVoiceCount() {
    if (!g_opl) return 0;
    int count = 0;
    for (uint8_t i = 0; i < NUM_CHANNELS; i++)
        if (g_opl->voices[i].active) count++;
    return count;
}

} // extern "C"
