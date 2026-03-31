/**
 * OpenWurli WASM Bridge — Standalone wrapper for Emscripten
 *
 * Bypasses synthLib::Device and directly wraps the OpenWurli DSP classes
 * (Voice, Tremolo, Preamp, Speaker, Oversampler, PowerAmp) into a simple
 * C API suitable for an AudioWorklet.
 *
 * Signal chain matches device.cpp exactly:
 *   Voices → sum → [upsample2x →] per-sample(tremolo→preamp) [→ downsample2x]
 *   → volume(audio taper) → powerAmp → speaker → POST_SPEAKER_GAIN
 */

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <array>
#include <vector>

// OpenWurli DSP headers (all header-only except tables)
#include "owVoice.h"
#include "owMelangePreamp.h"
#include "owTremolo.h"
#include "owOversampler.h"
#include "owPowerAmp.h"
#include "owSpeaker.h"
#include "owTables.h"

#include <emscripten.h>

static constexpr size_t MAX_VOICES = 64;
static constexpr size_t MAX_BLOCK = 4096;

enum class VoiceState { Free, Held, Releasing };

struct VoiceSlot {
    openWurli::Voice voice;
    openWurli::Voice stealVoice;
    VoiceState state = VoiceState::Free;
    uint8_t midiNote = 0;
    uint64_t age = 0;
    bool hasStealVoice = false;
    uint32_t stealFade = 0;
    uint32_t stealFadeLen = 0;
};

struct OpenWurliEngine {
    std::array<VoiceSlot, MAX_VOICES> voices;
    uint64_t ageCounter = 0;

    openWurli::MelangePreamp preamp;
    openWurli::Tremolo tremolo;
    openWurli::Oversampler oversampler;
    openWurli::PowerAmp powerAmp;
    openWurli::Speaker speaker;

    float volume = 1.0f;
    float tremoloDepth = 0.5f;
    float speakerCharacter = 0.0f;
    bool mlpEnabled = true;
    int velocityCurve = 2;

    double sampleRate = 44100.0;
    double osSampleRate = 88200.0;
    bool oversample = true;

    // Scratch buffers
    std::vector<double> voiceBuf;
    std::vector<double> sumBuf;
    std::vector<double> upBuf;
    std::vector<double> outBuf;

    bool sustainPedal = false;
    uint8_t sustainedNotes[128];

    bool initialized = false;
};

static OpenWurliEngine* g_engine = nullptr;

static size_t allocateVoice(OpenWurliEngine* e) {
    size_t bestIdx = 0;
    uint64_t bestPriority = UINT64_MAX;

    for (size_t i = 0; i < MAX_VOICES; i++) {
        if (e->voices[i].state == VoiceState::Free)
            return i;

        // Releasing voices have lower priority (steal first)
        const uint64_t priority = (e->voices[i].state == VoiceState::Releasing)
            ? e->voices[i].age
            : e->voices[i].age + UINT64_MAX / 2;

        if (priority < bestPriority) {
            bestPriority = priority;
            bestIdx = i;
        }
    }
    return bestIdx;
}

extern "C" {

// Forward declarations
EMSCRIPTEN_KEEPALIVE void owNoteOff(uint8_t note);

EMSCRIPTEN_KEEPALIVE
int owInit(float sampleRate) {
    if (g_engine) delete g_engine;
    g_engine = new OpenWurliEngine();
    auto* e = g_engine;

    e->sampleRate = sampleRate;
    e->oversample = sampleRate < 88200.0;
    e->osSampleRate = e->oversample ? sampleRate * 2.0 : sampleRate;

    e->preamp.init(e->osSampleRate);
    e->tremolo.init(e->tremoloDepth, e->osSampleRate);
    e->oversampler.init();
    e->speaker.init(e->sampleRate);

    e->voiceBuf.resize(MAX_BLOCK, 0.0);
    e->sumBuf.resize(MAX_BLOCK, 0.0);
    e->upBuf.resize(MAX_BLOCK * 2, 0.0);
    e->outBuf.resize(MAX_BLOCK, 0.0);

    std::memset(e->sustainedNotes, 0, sizeof(e->sustainedNotes));
    e->initialized = true;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void owDestroy() {
    delete g_engine;
    g_engine = nullptr;
}

EMSCRIPTEN_KEEPALIVE
void owNoteOn(uint8_t note, uint8_t velocity) {
    if (!g_engine || !g_engine->initialized) return;
    auto* e = g_engine;

    if (velocity == 0) { owNoteOff(note); return; }

    const uint8_t clampedNote = std::clamp(note, openWurli::MIDI_LO, openWurli::MIDI_HI);
    const double rawVel = static_cast<double>(velocity) / 127.0;

    // Apply velocity curve
    double vel;
    switch (e->velocityCurve) {
        case 0: vel = rawVel; break;                          // Linear
        case 1: vel = rawVel * rawVel; break;                 // Soft (square)
        case 2: vel = rawVel; break;                          // Medium (engine S-curve)
        case 3: vel = std::sqrt(rawVel); break;               // Hard (sqrt)
        case 4: vel = 0.75; break;                            // Fixed (mezzo-forte)
        default: vel = rawVel; break;
    }

    size_t slotIdx = allocateVoice(e);
    auto& slot = e->voices[slotIdx];

    // Voice stealing crossfade
    if (slot.state != VoiceState::Free) {
        const uint32_t fadeSamples = static_cast<uint32_t>(e->sampleRate * 0.005);
        slot.stealVoice = slot.voice;
        slot.hasStealVoice = true;
        slot.stealFade = fadeSamples;
        slot.stealFadeLen = fadeSamples;
    }

    e->ageCounter++;
    const uint32_t noiseSeed = static_cast<uint32_t>(note) * 2654435761u
        + static_cast<uint32_t>(e->ageCounter);
    slot.voice.noteOn(clampedNote, vel, e->sampleRate, noiseSeed, e->mlpEnabled);
    slot.state = VoiceState::Held;
    slot.midiNote = note;
    slot.age = e->ageCounter;
}

EMSCRIPTEN_KEEPALIVE
void owNoteOff(uint8_t note) {
    if (!g_engine) return;
    auto* e = g_engine;

    if (e->sustainPedal) {
        e->sustainedNotes[note & 0x7F] = 1;
        return;
    }

    // Release oldest held voice matching this note
    size_t bestIdx = MAX_VOICES;
    uint64_t bestAge = UINT64_MAX;
    for (size_t i = 0; i < MAX_VOICES; i++) {
        if (e->voices[i].state == VoiceState::Held && e->voices[i].midiNote == note) {
            if (e->voices[i].age < bestAge) {
                bestAge = e->voices[i].age;
                bestIdx = i;
            }
        }
    }
    if (bestIdx < MAX_VOICES) {
        e->voices[bestIdx].state = VoiceState::Releasing;
        e->voices[bestIdx].voice.noteOff();
    }
}

EMSCRIPTEN_KEEPALIVE
void owSustainPedal(int on) {
    if (!g_engine) return;
    auto* e = g_engine;
    e->sustainPedal = (on != 0);

    if (!e->sustainPedal) {
        for (int n = 0; n < 128; n++) {
            if (e->sustainedNotes[n]) {
                e->sustainedNotes[n] = 0;
                owNoteOff(static_cast<uint8_t>(n));
            }
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void owAllNotesOff() {
    if (!g_engine) return;
    auto* e = g_engine;
    for (size_t i = 0; i < MAX_VOICES; i++) {
        if (e->voices[i].state == VoiceState::Held) {
            e->voices[i].state = VoiceState::Releasing;
            e->voices[i].voice.noteOff();
        }
    }
    std::memset(e->sustainedNotes, 0, sizeof(e->sustainedNotes));
    e->sustainPedal = false;
}

EMSCRIPTEN_KEEPALIVE
void owSetParam(int paramId, float value) {
    if (!g_engine) return;
    auto* e = g_engine;
    switch (paramId) {
        case 0: e->volume = std::clamp(value, 0.0f, 1.0f); break;
        case 1:
            e->tremoloDepth = std::clamp(value, 0.0f, 1.0f);
            e->tremolo.setDepth(e->tremoloDepth);
            break;
        case 2: e->speakerCharacter = std::clamp(value, 0.0f, 1.0f); break;
        case 3: e->mlpEnabled = (value >= 0.5f); break;
        case 4: e->velocityCurve = std::clamp(static_cast<int>(value), 0, 4); break;
    }
}

EMSCRIPTEN_KEEPALIVE
float owGetParam(int paramId) {
    if (!g_engine) return 0.0f;
    auto* e = g_engine;
    switch (paramId) {
        case 0: return e->volume;
        case 1: return e->tremoloDepth;
        case 2: return e->speakerCharacter;
        case 3: return e->mlpEnabled ? 1.0f : 0.0f;
        case 4: return static_cast<float>(e->velocityCurve);
        default: return 0.0f;
    }
}

EMSCRIPTEN_KEEPALIVE
void owProcess(float* outL, float* outR, int numSamples) {
    if (!g_engine || !g_engine->initialized || numSamples <= 0) {
        if (outL) std::memset(outL, 0, numSamples * sizeof(float));
        if (outR) std::memset(outR, 0, numSamples * sizeof(float));
        return;
    }
    auto* e = g_engine;
    const size_t n = std::min(static_cast<size_t>(numSamples), MAX_BLOCK);

    // Ensure buffers are large enough
    if (e->outBuf.size() < n) {
        e->voiceBuf.resize(n, 0.0);
        e->sumBuf.resize(n, 0.0);
        e->upBuf.resize(n * 2, 0.0);
        e->outBuf.resize(n, 0.0);
    }

    // Sum all active voices (matches device.cpp renderSubblock)
    std::fill(e->sumBuf.begin(), e->sumBuf.begin() + n, 0.0);

    for (auto& slot : e->voices) {
        if (slot.state == VoiceState::Free && !slot.hasStealVoice)
            continue;

        // Render main voice
        if (slot.state != VoiceState::Free) {
            slot.voice.render(e->voiceBuf.data(), n);
            for (size_t s = 0; s < n; s++)
                e->sumBuf[s] += e->voiceBuf[s];
        }

        // Render stealing voice with fade-out
        if (slot.hasStealVoice) {
            slot.stealVoice.render(e->voiceBuf.data(), n);
            const double fadeLen = static_cast<double>(slot.stealFadeLen);
            for (size_t s = 0; s < n; s++) {
                const uint32_t remaining = (slot.stealFade > static_cast<uint32_t>(s))
                    ? slot.stealFade - static_cast<uint32_t>(s) : 0;
                const double gain = static_cast<double>(remaining) / fadeLen;
                e->sumBuf[s] += e->voiceBuf[s] * gain;
            }
            slot.stealFade = (slot.stealFade > static_cast<uint32_t>(n))
                ? slot.stealFade - static_cast<uint32_t>(n) : 0;
            if (slot.stealFade == 0)
                slot.hasStealVoice = false;
        }
    }

    // NaN guard
    for (size_t s = 0; s < n; s++) {
        if (!std::isfinite(e->sumBuf[s])) {
            std::fill(e->sumBuf.begin(), e->sumBuf.begin() + n, 0.0);
            break;
        }
    }

    // Signal chain: per-sample tremolo→preamp (with optional 2x oversampling)
    if (e->oversample) {
        e->oversampler.upsample2x(e->sumBuf.data(), e->upBuf.data(), n);

        for (size_t i = 0; i < n; i++) {
            e->tremolo.setDepth(static_cast<double>(e->tremoloDepth));
            for (int j = 0; j < 2; j++) {
                const size_t idx = i * 2 + j;
                const double rLdr = e->tremolo.process();
                e->preamp.setLdrResistance(rLdr);
                e->upBuf[idx] = e->preamp.processSample(e->upBuf[idx]);
            }
        }

        e->oversampler.downsample2x(e->upBuf.data(), e->outBuf.data(), n);
    } else {
        for (size_t i = 0; i < n; i++) {
            const double rLdr = e->tremolo.process();
            e->preamp.setLdrResistance(rLdr);
            e->outBuf[i] = e->preamp.processSample(e->sumBuf[i]);
        }
    }

    // Output chain: volume (audio taper) → powerAmp → speaker → POST_SPEAKER_GAIN
    const double volume = static_cast<double>(e->volume);
    for (size_t s = 0; s < n; s++) {
        e->speaker.setCharacter(static_cast<double>(e->speakerCharacter));

        const double attenuated = e->outBuf[s] * volume * volume;
        const double amplified = e->powerAmp.process(attenuated);
        const double shaped = e->speaker.process(amplified);
        const double post = shaped * openWurli::POST_SPEAKER_GAIN;

        float sample = static_cast<float>(post);
        if (!std::isfinite(sample)) {
            e->preamp.reset();
            e->oversampler.reset();
            e->powerAmp.reset();
            e->speaker.reset();
            sample = 0.0f;
        }

        outL[s] = sample;
        outR[s] = sample;
    }

    // Cleanup silent voices
    for (auto& slot : e->voices) {
        if (slot.state != VoiceState::Free && slot.voice.isSilent()) {
            slot.state = VoiceState::Free;
            slot.voice.setInactive();
        }
    }
}

EMSCRIPTEN_KEEPALIVE
int owGetActiveVoiceCount() {
    if (!g_engine) return 0;
    int count = 0;
    for (size_t i = 0; i < MAX_VOICES; i++) {
        if (g_engine->voices[i].state != VoiceState::Free)
            count++;
    }
    return count;
}

} // extern "C"
