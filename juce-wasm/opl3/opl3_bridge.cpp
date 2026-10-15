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
    SbiPatch patch{};  // per-voice patch (set at note-on time)
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

static void applyPatch(uint8_t ch, const SbiPatch& p) {
    if (!g_opl) return;
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    const uint8_t so = SLOT_OFFSET[chInBank];
    const uint8_t sc = so + 3;

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

/**
 * The patch as the chip must hold it for a note of this velocity: the stored patch with the velocity attenuation added
 * to the carrier's total level (and to the modulator's too in the additive connection, where both slots reach the
 * output). The stored patch itself is never changed: attenuating it in place made every retrigger of a channel
 * quieter than the last until the patch was sent again.
 */
static SbiPatch patchForVelocity(const SbiPatch& base, uint8_t velocity) {
    SbiPatch p = base;
    const uint8_t velAtten = static_cast<uint8_t>((127 - velocity) * 32 / 127);
    const uint8_t carTL = static_cast<uint8_t>(std::min(63, (p.carKSLTL & 0x3F) + velAtten));
    p.carKSLTL = static_cast<uint8_t>((p.carKSLTL & 0xC0) | carTL);
    if (p.fbAlg & 1) {
        const uint8_t modTL = static_cast<uint8_t>(std::min(63, (p.modKSLTL & 0x3F) + velAtten));
        p.modKSLTL = static_cast<uint8_t>((p.modKSLTL & 0xC0) | modTL);
    }
    return p;
}

static void oplKeyOn(uint8_t ch, uint8_t note, float pitchBend, const SbiPatch& patch) {
    uint16_t bank; uint8_t chInBank;
    channelToBank(ch, bank, chInBank);
    applyPatch(ch, patch);
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

/**
 * Output level. The chip's int16 output peaks near 4096 (-18 dBFS) for ONE voice at full level, which left the synth
 * about 12 dB below the other synths of the app (CZ-101: -6.5 dBFS peak for a held note). kOutputGainDb lifts a note to a
 * comparable level; softLimit keeps a chord of many voices inside full scale (the chip itself clips its int16 sum at
 * 8 full voices, as the hardware does) instead of handing the master bus 2-3x full scale.
 */
static constexpr float kOutputGainDb = 11.0f;
static const float kOutputScale = std::pow(10.0f, kOutputGainDb / 20.0f) / 32768.0f;

static inline float softLimit(float x) {
    constexpr float knee = 0.8f;
    const float a = std::fabs(x);
    if (a <= knee) return x;
    const float y = knee + (1.0f - knee) * std::tanh((a - knee) / (1.0f - knee));
    return x < 0 ? -y : y;
}

// ── Exported C API ──────────────────────────────────────────────────────
extern "C" {

// Forward declarations
EMSCRIPTEN_KEEPALIVE void oplNoteOff(uint8_t note);
EMSCRIPTEN_KEEPALIVE void oplChannelNoteOff(uint8_t ch);

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

    // Copy current global patch to voice; the chip gets it with the velocity attenuation
    v.patch = g_opl->patch;
    oplKeyOn(ch, note, g_opl->globalPitchBend, patchForVelocity(v.patch, velocity));
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

// ── Channel-addressed API (for multi-timbral tracker playback) ─────────
// Unlike the keyboard API (noteOn/noteOff) which uses voice allocation,
// these functions address OPL channels directly: tracker channel N = OPL voice N.

EMSCRIPTEN_KEEPALIVE
void oplChannelSetPatch(uint8_t ch, uint8_t modTVSK, uint8_t carTVSK,
                        uint8_t modKSL, uint8_t carKSL,
                        uint8_t modARDR, uint8_t carARDR,
                        uint8_t modSLRR, uint8_t carSLRR,
                        uint8_t modWF, uint8_t carWF, uint8_t fbAlg) {
    if (!g_opl || ch >= NUM_CHANNELS) return;
    g_opl->voices[ch].patch = { modTVSK, carTVSK, modKSL, carKSL, modARDR, carARDR, modSLRR, carSLRR, modWF, carWF, fbAlg };
}

EMSCRIPTEN_KEEPALIVE
void oplChannelNoteOn(uint8_t ch, uint8_t note, uint8_t velocity) {
    if (!g_opl || !g_opl->initialized || ch >= NUM_CHANNELS) return;
    if (velocity == 0) { oplChannelNoteOff(ch); return; }

    // Key-off old note if voice was active
    if (g_opl->voices[ch].active) oplKeyOff(ch);

    auto& v = g_opl->voices[ch];
    g_opl->ageCounter++;
    v.active = true; v.held = true; v.sustained = false;
    v.midiNote = note; v.age = g_opl->ageCounter;
    v.pitchBend = g_opl->globalPitchBend;

    oplKeyOn(ch, note, g_opl->globalPitchBend, patchForVelocity(v.patch, velocity));
}

EMSCRIPTEN_KEEPALIVE
void oplChannelNoteOff(uint8_t ch) {
    if (!g_opl || ch >= NUM_CHANNELS) return;
    if (g_opl->voices[ch].active) {
        g_opl->voices[ch].held = false;
        g_opl->voices[ch].active = false;
        oplKeyOff(ch);
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
        if (g_opl->voices[i].active) {
            uint16_t bank; uint8_t chInBank;
            channelToBank(i, bank, chInBank);
            const uint8_t so = SLOT_OFFSET[chInBank];
            const uint8_t sc = so + 3;
            // Set maximum release rate for instant silence
            writeReg(bank | (0x80 + so), static_cast<uint8_t>((g_opl->voices[i].patch.modSLRR & 0xF0) | 0x0F));
            writeReg(bank | (0x80 + sc), static_cast<uint8_t>((g_opl->voices[i].patch.carSLRR & 0xF0) | 0x0F));
            oplKeyOff(i);
            g_opl->voices[i] = {};
        }
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

    // Only updates global patch — next noteOn will use it
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void oplSetPatchRegisters(uint8_t modTVSK, uint8_t carTVSK, uint8_t modKSL, uint8_t carKSL,
                          uint8_t modARDR, uint8_t carARDR, uint8_t modSLRR, uint8_t carSLRR,
                          uint8_t modWF, uint8_t carWF, uint8_t fbAlg) {
    if (!g_opl) return;
    // Update global patch — will be applied to the NEXT noteOn voice only
    g_opl->patch = { modTVSK, carTVSK, modKSL, carKSL, modARDR, carARDR, modSLRR, carSLRR, modWF, carWF, fbAlg };
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

    for (int i = 0; i < numSamples; i++) {
        outL[i] = softLimit(static_cast<float>(g_opl->intBuf[i * 2 + 0]) * kOutputScale);
        outR[i] = softLimit(static_cast<float>(g_opl->intBuf[i * 2 + 1]) * kOutputScale);
    }
}

/**
 * Envelope state of every chip channel, for the editor's live markers: 18 channels x 12 bytes at `out`.
 *   [0]      1 when the channel holds a sounding voice (key on, or released and still ringing), else 0
 *   [1]      MIDI note of the voice
 *   [2]      modulator slot envelope stage (Nuked eg_gen: 0 attack, 1 decay, 2 sustain, 3 release)
 *   [3]      carrier slot envelope stage
 *   [4..5]   modulator eg_rout, uint16 LE: envelope attenuation 0 (full) .. 0x1FF (silent), 1/32 octave per unit
 *   [6..7]   carrier eg_rout
 *   [8..11]  voice age, uint32 LE: the note-on counter, so the newest voice has the largest value
 * After the 18 channels: [216] tremolopos (0..209), [217] vibpos (0..7), [218..219] timer & 0x3FF (uint16 LE, the
 * position inside one vibrato step), read from the same chip so the LFO curves' markers sit where the chip is.
 * The slots are read straight from the Nuked chip (opl3_chip::channel[c].slotz[0|1]); nothing is estimated.
 * Returns 220, or 0 before init.
 */
EMSCRIPTEN_KEEPALIVE
int oplGetChannelEnvelopes(uint8_t* out) {
    if (!g_opl || !g_opl->initialized || !out) return 0;
    int n = 0;
    for (int c = 0; c < NUM_CHANNELS; c++) {
        const OplVoice& v = g_opl->voices[c];
        const opl3_slot* mod = g_opl->chip.channel[c].slotz[0];
        const opl3_slot* car = g_opl->chip.channel[c].slotz[1];
        const bool ringing = v.active || (car->eg_rout & 0x1F8) != 0x1F8;
        out[n++] = ringing ? 1 : 0;
        out[n++] = v.midiNote;
        out[n++] = mod->eg_gen;
        out[n++] = car->eg_gen;
        out[n++] = static_cast<uint8_t>(mod->eg_rout & 0xFF);
        out[n++] = static_cast<uint8_t>(mod->eg_rout >> 8);
        out[n++] = static_cast<uint8_t>(car->eg_rout & 0xFF);
        out[n++] = static_cast<uint8_t>(car->eg_rout >> 8);
        const uint32_t age = static_cast<uint32_t>(v.age);
        out[n++] = static_cast<uint8_t>(age & 0xFF);
        out[n++] = static_cast<uint8_t>((age >> 8) & 0xFF);
        out[n++] = static_cast<uint8_t>((age >> 16) & 0xFF);
        out[n++] = static_cast<uint8_t>((age >> 24) & 0xFF);
    }
    out[n++] = g_opl->chip.tremolopos;
    out[n++] = g_opl->chip.vibpos;
    const uint16_t timerLow = static_cast<uint16_t>(g_opl->chip.timer & 0x3FF);
    out[n++] = static_cast<uint8_t>(timerLow & 0xFF);
    out[n++] = static_cast<uint8_t>(timerLow >> 8);
    return n;
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
