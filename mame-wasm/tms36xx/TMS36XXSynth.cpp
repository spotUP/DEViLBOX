/**
 * TMS36XXSynth.cpp - TMS3615/TMS3617 Tone Matrix Synthesizer for WebAssembly
 * Based on MAME's TMS36XX emulator by Juergen Buchmueller
 *
 * The TMS36XX family are organ-like tone generator ICs that produce
 * square waves at musical intervals (organ "feet"):
 *   16' (fundamental), 8' (octave), 5 1/3' (twelfth),
 *   4' (fifteenth), 2 2/3' (seventeenth), 2' (nineteenth)
 *
 * Each "stop" generates a harmonic at 1x, 2x, 3x, 4x, 6x, or 8x
 * the fundamental frequency, creating rich organ-like timbres.
 *
 * This WASM version extends the original with:
 * - 6-note polyphony (each with 6 organ stop harmonics)
 * - MIDI note-to-frequency mapping
 * - Per-stop enable mask for registration selection
 * - Configurable decay per stop
 * - 8 organ registration presets
 * - Stereo output with voice panning
 *
 * Used in: Phoenix, Naughty Boy, Pleiads, Monster Bash
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
// Constants
// ============================================================================

static constexpr int NUM_VOICES = 6;       // Polyphonic voices
static constexpr int NUM_STOPS = 6;        // Organ stops per voice
static constexpr int NUM_PRESETS = 8;
static constexpr int VMIN = 0x0000;
static constexpr int VMAX = 0x7fff;

// Organ stop harmonic multipliers (pipe organ "feet" intervals)
// 16' = 1x, 8' = 2x, 5 1/3' = 3x, 4' = 4x, 2 2/3' = 6x, 2' = 8x
static const double STOP_MULTIPLIERS[NUM_STOPS] = {
    1.0, 2.0, 3.0, 4.0, 6.0, 8.0
};

static const char* STOP_NAMES[NUM_STOPS] = {
    "16'", "8'", "5 1/3'", "4'", "2 2/3'", "2'"
};

// ============================================================================
// Parameter IDs
// ============================================================================

enum TMS36XXParam {
    PARAM_VOLUME = 0,
    PARAM_STOP_ENABLE = 1,    // 6-bit mask (bit 0 = 16', bit 5 = 2')
    PARAM_DECAY_RATE = 2,     // Global decay rate multiplier
    PARAM_OCTAVE = 3,         // Octave shift (-2 to +2)
    PARAM_STEREO_WIDTH = 4,
    PARAM_DETUNE = 5,         // Per-stop detune amount
};

// ============================================================================
// Organ registration presets
// ============================================================================

struct OrgPreset {
    const char* name;
    uint8_t enableMask;     // Which stops are active (6-bit)
    float   decayRates[6];  // Decay time in seconds per stop
};

static const OrgPreset ORGAN_PRESETS[NUM_PRESETS] = {
    // 0: Full Organ - all stops, moderate decay
    { "Full Organ",   0x3F, { 2.0f, 1.8f, 1.5f, 1.2f, 1.0f, 0.8f } },

    // 1: Flute 8' - single stop, long decay
    { "Flute 8'",     0x02, { 0.0f, 3.0f, 0.0f, 0.0f, 0.0f, 0.0f } },

    // 2: Principal 16'+8' - foundation stops
    { "Principal",    0x03, { 2.5f, 2.0f, 0.0f, 0.0f, 0.0f, 0.0f } },

    // 3: Mixture - upper harmonics only
    { "Mixture",      0x3C, { 0.0f, 0.0f, 1.5f, 1.2f, 1.0f, 0.8f } },

    // 4: Foundation - 16'+8'+4'
    { "Foundation",   0x0B, { 2.5f, 2.0f, 0.0f, 1.5f, 0.0f, 0.0f } },

    // 5: Bright - emphasis on higher partials
    { "Bright",       0x36, { 0.0f, 1.8f, 1.5f, 0.0f, 1.0f, 0.8f } },

    // 6: Diapason - moderate registration
    { "Diapason",     0x1B, { 2.0f, 1.8f, 0.0f, 1.2f, 1.0f, 0.0f } },

    // 7: Percussive - all stops, fast decay
    { "Percussive",   0x3F, { 0.5f, 0.4f, 0.35f, 0.3f, 0.25f, 0.2f } },
};

// ============================================================================
// Single organ voice (one MIDI note with 6 stop oscillators)
// ============================================================================

struct OrgVoice {
    // MIDI state
    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    // Per-stop oscillator state
    int      frequency[NUM_STOPS];   // Frequency accumulator rate
    int      counter[NUM_STOPS];     // Phase accumulator
    int      vol[NUM_STOPS];         // Current volume (decaying)
    int      volCounter[NUM_STOPS];  // Decay counter
    int      output;                 // Output bit toggles (6 bits)
};

// ============================================================================
// TMS36XXSynth class
// ============================================================================

class TMS36XXSynth {
public:
    TMS36XXSynth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_volume = 0.7f;
        m_stereoWidth = 0.3f;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_stopEnable = 0x3F;  // All stops enabled
        m_globalDecayMult = 1.0f;
        m_octaveShift = 0;
        m_detune = 0.0f;
        m_currentPreset = 0;

        // Load default preset
        loadPreset(0);

        for (int v = 0; v < NUM_VOICES; v++) {
            resetVoice(v);
        }
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f;
            float mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                OrgVoice& voi = m_voices[v];

                if (!voi.active && voi.envLevel <= 0.001f) continue;

                // Update envelope
                if (voi.releasing) {
                    voi.envLevel -= 0.001f;
                    if (voi.envLevel <= 0.0f) {
                        voi.envLevel = 0.0f;
                        voi.active = false;
                        continue;
                    }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.01f;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                int sum = 0;
                int activeStops = 0;

                for (int st = 0; st < NUM_STOPS; st++) {
                    if (!(m_stopEnable & (1 << st))) continue;
                    if (voi.frequency[st] == 0) continue;

                    // Decay (from MAME)
                    if (voi.vol[st] > VMIN) {
                        voi.volCounter[st] -= m_decay[st];
                        while (voi.volCounter[st] <= 0) {
                            voi.volCounter[st] += m_sampleRate;
                            if (--voi.vol[st] <= VMIN) {
                                voi.vol[st] = VMIN;
                                break;
                            }
                        }
                    }

                    // Square wave generation (from MAME TONE macro)
                    if (voi.vol[st] > VMIN) {
                        voi.counter[st] -= voi.frequency[st];
                        while (voi.counter[st] <= 0) {
                            voi.counter[st] += m_sampleRate;
                            voi.output ^= 1 << st;
                        }
                        if (voi.output & (1 << st))
                            sum += voi.vol[st];
                        activeStops++;
                    }
                }

                if (activeStops == 0) continue;

                // Normalize to -1..1
                float sample = (float)sum / ((float)VMAX * activeStops) * 2.0f - 1.0f / activeStops;

                float vel = voi.velocity / 127.0f;

                // Stereo panning
                float pan = 0.5f + m_stereoWidth * (((float)v / (NUM_VOICES - 1)) - 0.5f);
                float gainL = (float)cos(pan * M_PI * 0.5);
                float gainR = (float)sin(pan * M_PI * 0.5);

                float voiceSample = sample * vel * voi.envLevel;
                mixL += voiceSample * gainL;
                mixR += voiceSample * gainR;
            }

            outL[s] = mixL * m_volume;
            outR[s] = mixR * m_volume;
        }
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (midiNote < 12 || midiNote > 108) return;

        int v = findFreeVoice();
        OrgVoice& voi = m_voices[v];

        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.output = 0;

        // Compute base frequency from MIDI note + octave shift + pitch bend
        int note = midiNote + m_octaveShift * 12;
        float baseFreq = 440.0f * std::pow(2.0f, (note + m_pitchBend * 2.0f - 69) / 12.0f);

        // Set up each organ stop
        for (int st = 0; st < NUM_STOPS; st++) {
            float stopFreq = baseFreq * STOP_MULTIPLIERS[st];

            // Apply per-stop detune (slight detuning creates warmth)
            if (m_detune > 0.0f && st > 0) {
                float detuneAmount = m_detune * (st - 2.5f) * 0.01f;
                stopFreq *= (1.0f + detuneAmount);
            }

            // Clamp to Nyquist
            if (stopFreq >= m_sampleRate * 0.5f)
                stopFreq = 0;

            voi.frequency[st] = (int)stopFreq;
            voi.counter[st] = 0;
            voi.volCounter[st] = 0;

            // Set initial volume (full on note start)
            if ((m_stopEnable & (1 << st)) && stopFreq > 0)
                voi.vol[st] = VMAX;
            else
                voi.vol[st] = VMIN;
        }
    }

    void noteOff(int midiNote) {
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].midiNote == midiNote && !m_voices[v].releasing) {
                m_voices[v].releasing = true;
                break;
            }
        }
    }

    void allNotesOff() {
        for (int v = 0; v < NUM_VOICES; v++) {
            m_voices[v].releasing = true;
        }
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                m_volume = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_STOP_ENABLE:
                m_stopEnable = std::max(0, std::min(63, (int)value));
                break;
            case PARAM_DECAY_RATE:
                m_globalDecayMult = std::max(0.1f, std::min(10.0f, value));
                recalcDecays();
                break;
            case PARAM_OCTAVE:
                m_octaveShift = std::max(-2, std::min(2, (int)value));
                break;
            case PARAM_STEREO_WIDTH:
                m_stereoWidth = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_DETUNE:
                m_detune = std::max(0.0f, std::min(1.0f, value));
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_STOP_ENABLE: return (float)m_stopEnable;
            case PARAM_DECAY_RATE: return m_globalDecayMult;
            case PARAM_OCTAVE: return (float)m_octaveShift;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_DETUNE: return m_detune;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> detune
                m_detune = value / 127.0f;
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 70: // Stop enable
                m_stopEnable = (value * 63) / 127;
                break;
            case 71: // Decay rate
                m_globalDecayMult = 0.1f + (value / 127.0f) * 9.9f;
                recalcDecays();
                break;
            case 74: // Octave shift
                m_octaveShift = (value / 32) - 2;
                break;
            case 120:
            case 123:
                allNotesOff();
                break;
            default:
                break;
        }
    }

    void pitchBend(float value) {
        m_pitchBend = value;
        // Update all active voice frequencies
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                int note = m_voices[v].midiNote + m_octaveShift * 12;
                float baseFreq = 440.0f * std::pow(2.0f, (note + m_pitchBend * 2.0f - 69) / 12.0f);
                for (int st = 0; st < NUM_STOPS; st++) {
                    float stopFreq = baseFreq * STOP_MULTIPLIERS[st];
                    if (m_detune > 0.0f && st > 0) {
                        float detuneAmount = m_detune * (st - 2.5f) * 0.01f;
                        stopFreq *= (1.0f + detuneAmount);
                    }
                    if (stopFreq >= m_sampleRate * 0.5f) stopFreq = 0;
                    m_voices[v].frequency[st] = (int)stopFreq;
                }
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < NUM_PRESETS) {
            loadPreset(program);
        }
    }

    // ========================================================================
    // Convenience setters
    // ========================================================================

    void setVolume(float value) {
        m_volume = std::max(0.0f, std::min(1.0f, value));
    }

    void setStopEnable(int mask) {
        m_stopEnable = mask & 0x3F;
    }

    void setOctave(int octave) {
        m_octaveShift = std::max(-2, std::min(2, octave));
    }

    void writeRegister(int offset, int data) {
        switch (offset) {
            case 0: setStopEnable(data & 0x3F); break;
            case 1: setOctave(data & 3); break;
        }
    }

private:
    void loadPreset(int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        m_currentPreset = preset;
        const OrgPreset& p = ORGAN_PRESETS[preset];

        m_stopEnable = p.enableMask;

        for (int st = 0; st < NUM_STOPS; st++) {
            m_decayTime[st] = p.decayRates[st];
        }
        recalcDecays();
    }

    void recalcDecays() {
        for (int st = 0; st < NUM_STOPS; st++) {
            float t = m_decayTime[st] * m_globalDecayMult;
            if (t > 0.001f)
                m_decay[st] = (int)((float)VMAX / (t * m_sampleRate));
            else
                m_decay[st] = VMAX; // Instant decay (stop disabled)
        }
    }

    void resetVoice(int v) {
        OrgVoice& voi = m_voices[v];
        voi.midiNote = -1;
        voi.velocity = 0;
        voi.age = 0;
        voi.active = false;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.output = 0;

        for (int st = 0; st < NUM_STOPS; st++) {
            voi.frequency[st] = 0;
            voi.counter[st] = 0;
            voi.vol[st] = VMIN;
            voi.volCounter[st] = 0;
        }
    }

    int findFreeVoice() {
        for (int v = 0; v < NUM_VOICES; v++) {
            if (!m_voices[v].active && m_voices[v].envLevel <= 0.001f)
                return v;
        }
        int bestV = -1;
        float bestLevel = 2.0f;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].releasing && m_voices[v].envLevel < bestLevel) {
                bestLevel = m_voices[v].envLevel;
                bestV = v;
            }
        }
        if (bestV >= 0) return bestV;

        int oldest = 0;
        uint32_t oldestAge = UINT32_MAX;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].age < oldestAge) {
                oldestAge = m_voices[v].age;
                oldest = v;
            }
        }
        return oldest;
    }

    // ========================================================================
    // State
    // ========================================================================

    int m_sampleRate = 44100;

    OrgVoice m_voices[NUM_VOICES];

    float m_volume = 0.7f;
    float m_stereoWidth = 0.3f;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;
    int m_stopEnable = 0x3F;
    float m_globalDecayMult = 1.0f;
    int m_octaveShift = 0;
    float m_detune = 0.0f;
    int m_currentPreset = 0;

    float m_decayTime[NUM_STOPS] = {};
    int m_decay[NUM_STOPS] = {};
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(TMS36XXModule) {
    emscripten::class_<TMS36XXSynth>("TMS36XXSynth")
        .constructor<>()
        .function("initialize", &TMS36XXSynth::initialize)
        .function("process", &TMS36XXSynth::process)
        .function("noteOn", &TMS36XXSynth::noteOn)
        .function("noteOff", &TMS36XXSynth::noteOff)
        .function("allNotesOff", &TMS36XXSynth::allNotesOff)
        .function("setParameter", &TMS36XXSynth::setParameter)
        .function("getParameter", &TMS36XXSynth::getParameter)
        .function("controlChange", &TMS36XXSynth::controlChange)
        .function("pitchBend", &TMS36XXSynth::pitchBend)
        .function("programChange", &TMS36XXSynth::programChange)
        .function("writeRegister", &TMS36XXSynth::writeRegister)
        .function("setVolume", &TMS36XXSynth::setVolume)
        .function("setStopEnable", &TMS36XXSynth::setStopEnable)
        .function("setOctave", &TMS36XXSynth::setOctave);
}

#endif
