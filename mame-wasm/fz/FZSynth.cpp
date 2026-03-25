/**
 * FZSynth.cpp - Casio FZ Series PCM for WebAssembly
 * Based on MAME's fz_pcm emulator by Devin Acker
 *
 * This is a standalone extraction of the Casio FZ-1/FZ-20M PCM engine.
 * The FZ series (1987) was Casio's professional sampling synthesizer,
 * competing with the Fairlight CMI and Ensoniq Mirage.
 *
 * Hardware features:
 * - 8 voices of 16-bit PCM playback
 * - Fractional address stepping (13-bit fraction) for pitch control
 * - Forward and reverse playback
 * - Loop with trace (continuous) and skip (jump to start) modes
 * - Per-voice output enable, interrupt on loop
 * - Two gate arrays (GAA, GAB) for address generation & timing
 *
 * This WASM version adds:
 * - MIDI note-on/off with velocity
 * - Per-voice volume and panning
 * - ROM/sample loading via pointer
 * - Stereo mixdown
 *
 * License: BSD-3-Clause (MAME license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace devilbox {

// ============================================================================
// Constants (from MAME fz_pcm.h)
// ============================================================================

static constexpr int MAX_VOICES = 8;
static constexpr unsigned ADDR_FRAC_SHIFT = 13;

// Voice flags (bit positions)
enum VoiceFlag {
    FLAG_PLAY    = 0,
    FLAG_LOOP    = 1,
    FLAG_REVERSE = 3,
    FLAG_OUTPUT  = 4,
    FLAG_INT     = 5,
    FLAG_XFADE   = 6,
};

// Parameter IDs for setParameter
enum FZParam {
    PARAM_VOLUME = 0,
    PARAM_FILTER_CUTOFF = 1,  // placeholder for future filter
    PARAM_ATTACK = 2,
    PARAM_RELEASE = 3,
    PARAM_LOOP_MODE = 4,      // 0=off, 1=forward, 2=reverse
};

// ============================================================================
// Voice structure (extracted from MAME fz_pcm_device::voice_t)
// ============================================================================

struct FZVoice {
    uint16_t flags = 0;

    uint32_t addr_start = 0, addr_end = 0;
    uint32_t loop_start = 0, loop_end = 0;
    uint8_t  loop_start_fine = 0;
    uint32_t loop_len = 0;
    uint8_t  loop_trace = 1;
    uint16_t loop_xfade = 0;

    uint16_t pitch = 0;
    uint32_t addr = 0, addr_frac = 0;
    int16_t  sample = 0, sample_last = 0;

    // WASM additions for MIDI control
    bool     active = false;
    int      midi_note = -1;
    float    velocity = 0.0f;
    float    volume = 1.0f;
    float    pan = 0.5f;       // 0=left, 1=right
    float    env = 0.0f;       // simple envelope
    bool     in_release = false;
    float    attack_rate = 0.01f;
    float    release_rate = 0.002f;

    void reset() {
        flags = 0;
        addr_start = addr_end = 0;
        loop_start = loop_end = 0;
        loop_start_fine = 0;
        loop_len = 0;
        loop_trace = 1;
        loop_xfade = 0;
        pitch = 0;
        addr = addr_frac = 0;
        sample = sample_last = 0;
        active = false;
        midi_note = -1;
        velocity = 0.0f;
        env = 0.0f;
        in_release = false;
    }

    // Extracted from MAME fz_pcm_device::voice_t::update()
    bool update() {
        bool looped = false;

        while (addr_frac >= (1u << ADDR_FRAC_SHIFT)) {
            addr_frac -= (1u << ADDR_FRAC_SHIFT);

            if (!(flags & (1 << FLAG_REVERSE))) {
                if (addr < addr_end) {
                    addr++;
                    if ((flags & (1 << FLAG_LOOP)) && addr >= loop_end) {
                        looped = !!(flags & (1 << FLAG_INT));
                        if (loop_trace) {
                            addr = loop_start + (addr - loop_end);
                            addr_frac += loop_start_fine << (ADDR_FRAC_SHIFT - 8);
                        } else {
                            addr = loop_start;
                            addr_frac = loop_start_fine << (ADDR_FRAC_SHIFT - 8);
                            flags &= ~(1 << FLAG_INT);
                        }
                    }
                } else {
                    flags &= ~(1 << FLAG_PLAY);
                }
            } else {
                if (addr > addr_end)
                    addr--;
                else
                    flags &= ~(1 << FLAG_PLAY);
            }
        }
        return looped;
    }
};

// ============================================================================
// FZSynth — Main synthesis class
// ============================================================================

class FZSynth {
public:
    static constexpr int MAX_POLY = MAX_VOICES;

    FZSynth() {
        m_sampleRate = 44100.0;
        m_romData = nullptr;
        m_romSize = 0;
        m_globalVolume = 200;
        m_globalAttack = 1.0f / (0.01f * 44100.0f);   // 10ms attack
        m_globalRelease = 1.0f / (0.3f * 44100.0f);   // 300ms release

        for (int i = 0; i < MAX_POLY; i++)
            m_voices[i].reset();
    }

    void setSampleRate(int sr) {
        m_sampleRate = static_cast<double>(sr);
    }

    int getSampleRate() const {
        return static_cast<int>(m_sampleRate);
    }

    // ── ROM / Sample loading ─────────────────────────────────────────────

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const int16_t*>(dataPtr);
        m_romSize = size / 2; // size in bytes → count of int16 samples
    }

    void loadSample(int voice, uintptr_t dataPtr, int sizeBytes) {
        if (voice < 0 || voice >= MAX_POLY) return;
        // Load sample data for a specific voice — set up address range
        FZVoice& v = m_voices[voice];
        // Store in the global ROM buffer (voice addresses into it)
        // For simplicity, each voice's sample is loaded as the global ROM
        m_romData = reinterpret_cast<const int16_t*>(dataPtr);
        m_romSize = sizeBytes / 2;
        v.addr_start = 0;
        v.addr_end = m_romSize;
        v.loop_start = 0;
        v.loop_end = m_romSize;
        v.addr = 0;
        v.addr_frac = 0;
        v.sample = v.sample_last = 0;
    }

    void loadSampleAll(uintptr_t dataPtr, int sizeBytes) {
        m_romData = reinterpret_cast<const int16_t*>(dataPtr);
        m_romSize = sizeBytes / 2;
        for (int i = 0; i < MAX_POLY; i++) {
            FZVoice& v = m_voices[i];
            v.addr_start = 0;
            v.addr_end = m_romSize;
            v.loop_start = 0;
            v.loop_end = m_romSize;
        }
    }

    // ── MIDI control ─────────────────────────────────────────────────────

    void noteOn(int note, int velocity) {
        if (velocity == 0) { noteOff(note); return; }

        int vi = findFreeVoice(note);
        FZVoice& v = m_voices[vi];

        v.active = true;
        v.midi_note = note;
        v.velocity = velocity / 127.0f;
        v.in_release = false;
        v.env = 0.0f;
        v.attack_rate = m_globalAttack;
        v.release_rate = m_globalRelease;

        // Set pitch from MIDI note (middle C = note 60 = original pitch)
        // FZ pitch register: 1 << ADDR_FRAC_SHIFT = original rate
        double semitones = note - 60.0;
        double pitchRatio = std::pow(2.0, semitones / 12.0);
        v.pitch = static_cast<uint16_t>(std::round((1 << ADDR_FRAC_SHIFT) * pitchRatio));

        // Start playback
        v.addr = v.addr_start;
        v.addr_frac = 0;
        v.sample = v.sample_last = 0;
        v.flags = (1 << FLAG_PLAY) | (1 << FLAG_OUTPUT) | (1 << FLAG_LOOP);
    }

    void noteOff(int note) {
        for (int i = 0; i < MAX_POLY; i++) {
            if (m_voices[i].active && m_voices[i].midi_note == note && !m_voices[i].in_release) {
                m_voices[i].in_release = true;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < MAX_POLY; i++) {
            m_voices[i].active = false;
            m_voices[i].flags = 0;
            m_voices[i].env = 0.0f;
        }
    }

    // ── Parameters ───────────────────────────────────────────────────────

    void setParameter(int paramId, double value) {
        switch (paramId) {
            case PARAM_VOLUME:
                m_globalVolume = static_cast<uint8_t>(std::max(0.0, std::min(255.0, value)));
                break;
            case PARAM_FILTER_CUTOFF:
                // Simple lowpass via envelope speed (placeholder — no real filter in FZ hardware)
                break;
            case PARAM_ATTACK: {
                // value is attack time in seconds
                double attackSec = std::max(0.001, value);
                m_globalAttack = static_cast<float>(1.0 / (attackSec * m_sampleRate));
                break;
            }
            case PARAM_RELEASE: {
                // value is release time in seconds
                double releaseSec = std::max(0.001, value);
                m_globalRelease = static_cast<float>(1.0 / (releaseSec * m_sampleRate));
                break;
            }
            case PARAM_LOOP_MODE:
                // 0=off, 1=forward loop, 2=reverse
                for (int i = 0; i < MAX_POLY; i++) {
                    if (static_cast<int>(value) == 0)
                        m_voices[i].flags &= ~((1 << FLAG_LOOP) | (1 << FLAG_REVERSE));
                    else if (static_cast<int>(value) == 1) {
                        m_voices[i].flags |= (1 << FLAG_LOOP);
                        m_voices[i].flags &= ~(1 << FLAG_REVERSE);
                    } else {
                        m_voices[i].flags |= (1 << FLAG_LOOP) | (1 << FLAG_REVERSE);
                    }
                }
                break;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 7:  // Volume
                m_globalVolume = value * 2;
                break;
            case 10: // Pan
                for (int i = 0; i < MAX_POLY; i++)
                    m_voices[i].pan = value / 127.0f;
                break;
        }
    }

    void pitchBend(int value) {
        // value: -8192 to 8191, ±2 semitones
        m_pitchBendFactor = std::pow(2.0, (value / 8192.0) * 2.0 / 12.0);
    }

    void programChange(int program) {
        // Could select sample banks
    }

    void writeRegister(int offset, int value) {
        // Direct register access (for hardware UI)
    }

    // ── Audio rendering ──────────────────────────────────────────────────

    void process(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outLPtr);
        float* outR = reinterpret_cast<float*>(outRPtr);

        if (!m_romData || m_romSize == 0) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        const float masterVol = m_globalVolume / 255.0f;

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f, mixR = 0.0f;

            for (int i = 0; i < MAX_POLY; i++) {
                FZVoice& v = m_voices[i];
                if (!v.active) continue;

                // Envelope
                if (!v.in_release) {
                    v.env += v.attack_rate;
                    if (v.env > 1.0f) v.env = 1.0f;
                } else {
                    v.env -= v.release_rate;
                    if (v.env <= 0.0f) {
                        v.env = 0.0f;
                        v.active = false;
                        v.flags &= ~(1 << FLAG_PLAY);
                        continue;
                    }
                }

                // Sample playback (from MAME sound_stream_update)
                if (v.flags & (1 << FLAG_PLAY)) {
                    v.addr_frac += v.pitch;
                    if (v.addr_frac >= (1u << ADDR_FRAC_SHIFT)) {
                        v.sample_last = v.sample;
                        if (v.addr < static_cast<uint32_t>(m_romSize))
                            v.sample = m_romData[v.addr];
                        else
                            v.sample = 0;
                        v.update();
                    }

                    // Check if playback stopped
                    if (!(v.flags & (1 << FLAG_PLAY))) {
                        v.active = false;
                        continue;
                    }
                }

                // Interpolated output (from MAME)
                float sampleOut = 0.0f;
                if (v.flags & (1 << FLAG_OUTPUT)) {
                    const uint8_t frac = (v.addr_frac >> (ADDR_FRAC_SHIFT - 3)) & 7;
                    int16_t interp = v.sample_last + static_cast<int32_t>(v.sample - v.sample_last) * frac / 8;
                    sampleOut = interp / 32768.0f;
                }

                float gain = v.env * v.velocity * masterVol;
                mixL += sampleOut * gain * (1.0f - v.pan);
                mixR += sampleOut * gain * v.pan;
            }

            outL[s] = mixL;
            outR[s] = mixR;
        }
    }

    uintptr_t getOutL() const { return 0; } // Not used — process writes directly
    uintptr_t getOutR() const { return 0; }

    void getVoiceStatus(uintptr_t outPtr, int maxVoices) {
        int* out = reinterpret_cast<int*>(outPtr);
        int count = std::min(maxVoices, MAX_POLY);
        for (int i = 0; i < count; i++) {
            const FZVoice& v = m_voices[i];
            out[i * 4 + 0] = v.active ? 1 : 0;
            out[i * 4 + 1] = v.midi_note;
            out[i * 4 + 2] = static_cast<int>(v.env * 255);
            out[i * 4 + 3] = v.in_release ? 1 : 0;
        }
    }

private:
    double   m_sampleRate;
    FZVoice  m_voices[MAX_POLY];
    uint8_t  m_globalVolume;
    float    m_globalAttack;
    float    m_globalRelease;
    double   m_pitchBendFactor = 1.0;

    const int16_t* m_romData;
    int      m_romSize; // in samples (int16 count)

    int findFreeVoice(int midiNote) {
        // Reuse voice already playing this note
        for (int i = 0; i < MAX_POLY; i++)
            if (m_voices[i].midi_note == midiNote) return i;
        // Find free voice
        for (int i = 0; i < MAX_POLY; i++)
            if (!m_voices[i].active) return i;
        // Steal releasing voice with lowest envelope
        int best = 0; float bestEnv = 2.0f;
        for (int i = 0; i < MAX_POLY; i++)
            if (m_voices[i].in_release && m_voices[i].env < bestEnv) { best = i; bestEnv = m_voices[i].env; }
        if (bestEnv < 2.0f) return best;
        return 0;
    }
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(FZSynth) {
    emscripten::class_<FZSynth>("FZSynth")
        .constructor<>()
        .function("setSampleRate", &FZSynth::setSampleRate)
        .function("getSampleRate", &FZSynth::getSampleRate)
        .function("noteOn", &FZSynth::noteOn)
        .function("noteOff", &FZSynth::noteOff)
        .function("allNotesOff", &FZSynth::allNotesOff)
        .function("setParameter", &FZSynth::setParameter)
        .function("controlChange", &FZSynth::controlChange)
        .function("pitchBend", &FZSynth::pitchBend)
        .function("programChange", &FZSynth::programChange)
        .function("writeRegister", &FZSynth::writeRegister)
        .function("loadROM", &FZSynth::loadROM)
        .function("loadSample", &FZSynth::loadSample)
        .function("loadSampleAll", &FZSynth::loadSampleAll)
        .function("process", &FZSynth::process)
        .function("getVoiceStatus", &FZSynth::getVoiceStatus);
}
#endif
