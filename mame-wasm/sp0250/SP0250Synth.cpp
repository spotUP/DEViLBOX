/**
 * SP0250Synth.cpp - GI SP0250 Digital LPC Sound Synthesizer for WebAssembly
 * Based on MAME's SP0250 emulator by Olivier Galibert
 *
 * The SP0250 is a digital formant/LPC (Linear Predictive Coding)
 * synthesizer that generates speech and vocal sounds through:
 * - Voiced excitation (pitch pulse train) or unvoiced (15-bit LFSR noise)
 * - 6 cascaded second-order lattice filters shaping the spectral envelope
 * - 8-bit amplitude control with mantissa+exponent encoding
 *
 * This WASM version extends the original with:
 * - 4-voice polyphony (4 independent LPC engines)
 * - Built-in vowel/formant presets (A, E, I, O, U, etc.)
 * - Direct coefficient control for filter shaping
 * - MIDI note-to-pitch mapping
 * - Stereo output with voice panning
 *
 * The LPC filter runs at ~10kHz (matching original hardware) and
 * upsamples to the audio sample rate for authentic lo-fi character.
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

static constexpr int LPC_RATE = 10000;   // Internal LPC sample rate (Hz)
static constexpr int NUM_VOICES = 4;
static constexpr int NUM_FILTERS = 6;
static constexpr int NUM_PRESETS = 8;

// Internal coefficient ROM (from MAME, verified against hardware)
static const uint16_t SP0250_COEFS[128] = {
      0,   9,  17,  25,  33,  41,  49,  57,  65,  73,  81,  89,  97, 105, 113, 121,
    129, 137, 145, 153, 161, 169, 177, 185, 193, 201, 203, 217, 225, 233, 241, 249,
    257, 265, 273, 281, 289, 297, 301, 305, 309, 313, 317, 321, 325, 329, 333, 337,
    341, 345, 349, 353, 357, 361, 365, 369, 373, 377, 381, 385, 389, 393, 397, 401,
    405, 409, 413, 417, 421, 425, 427, 429, 431, 433, 435, 437, 439, 441, 443, 445,
    447, 449, 451, 453, 455, 457, 459, 461, 463, 465, 467, 469, 471, 473, 475, 477,
    479, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495,
    496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511
};

// ============================================================================
// Parameter IDs
// ============================================================================

enum SP0250Param {
    PARAM_VOLUME = 0,
    PARAM_VOWEL = 1,        // 0-7 preset vowels
    PARAM_VOICED = 2,       // 0=noise excitation, 1=voiced pitch
    PARAM_BRIGHTNESS = 3,   // controls upper formant emphasis
    PARAM_STEREO_WIDTH = 4,
    PARAM_FILTER_MIX = 5,   // 0.0-1.0 dry/wet mix for filter
};

// ============================================================================
// LPC filter stage (from MAME, 1:1)
// ============================================================================

struct LPCFilter {
    int16_t F;    // Forward coefficient
    int16_t B;    // Backward coefficient
    int16_t z1;   // Delay element 1
    int16_t z2;   // Delay element 2

    void reset() { z1 = z2 = 0; }

    int16_t apply(int16_t in) {
        int16_t z0 = in + ((z1 * F) >> 8) + ((z2 * B) >> 9);
        z2 = z1;
        z1 = z0;
        return z0;
    }
};

// ============================================================================
// Single LPC voice
// ============================================================================

struct LPCVoice {
    // LPC state
    bool     voiced;
    int16_t  amp;
    uint16_t lfsr;
    uint8_t  pitch;
    uint8_t  pcount;
    LPCFilter filter[NUM_FILTERS];

    // MIDI state
    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    // Upsampling state
    float    prevSample;
    float    currentSample;
    double   lpcPhase;   // fractional position within LPC samples
};

// ============================================================================
// Vowel preset data: 6 filter coefficients (F, B) per preset
// Empirically tuned for the SP0250's coefficient ROM at 10kHz LPC rate
// ============================================================================

struct VowelPreset {
    const char* name;
    uint8_t filterF[6];  // gc()-encoded F coefficients
    uint8_t filterB[6];  // gc()-encoded B coefficients
    uint8_t amplitude;   // ga()-encoded amplitude
    bool    voiced;
};

// gc() decode: coefs[v & 0x7f], negate if !(v & 0x80)
// ga() decode: (v & 0x1f) << (v >> 5)

static const VowelPreset VOWEL_PRESETS[NUM_PRESETS] = {
    // 0: /a/ (father) - open vowel, F1=730 F2=1090
    { "AH",
      { 0xB8, 0x90, 0xA0, 0x80, 0x88, 0x80 },  // F (positive=resonant)
      { 0x30, 0x38, 0x28, 0x20, 0x20, 0x18 },   // B (negative=damping)
      0x4A, true },

    // 1: /e/ (beet) - front close vowel, F1=270 F2=2290
    { "EE",
      { 0xC0, 0x80, 0x88, 0x80, 0x80, 0x80 },
      { 0x38, 0x30, 0x20, 0x18, 0x18, 0x10 },
      0x48, true },

    // 2: /i/ (bit) - front open vowel, F1=390 F2=1990
    { "IH",
      { 0xBC, 0x88, 0x90, 0x80, 0x84, 0x80 },
      { 0x34, 0x34, 0x24, 0x1C, 0x1C, 0x14 },
      0x48, true },

    // 3: /o/ (boat) - back rounded vowel, F1=570 F2=840
    { "OH",
      { 0xB4, 0xA8, 0x98, 0x80, 0x84, 0x80 },
      { 0x34, 0x3C, 0x2C, 0x20, 0x1C, 0x14 },
      0x4A, true },

    // 4: /u/ (boot) - back close vowel, F1=300 F2=870
    { "OO",
      { 0xBE, 0xA4, 0x94, 0x80, 0x80, 0x80 },
      { 0x38, 0x3C, 0x2C, 0x20, 0x18, 0x10 },
      0x48, true },

    // 5: Nasal /n/ - nasal formant, F1=480 + antiformant
    { "NN",
      { 0xB6, 0x94, 0x80, 0x8C, 0x80, 0x80 },
      { 0x30, 0x38, 0x20, 0x28, 0x18, 0x10 },
      0x44, true },

    // 6: Buzz (unvoiced noise through filters)
    { "ZZ",
      { 0xA0, 0x90, 0x88, 0x80, 0x84, 0x80 },
      { 0x28, 0x30, 0x20, 0x1C, 0x18, 0x10 },
      0x4C, false },

    // 7: Breathy (wide formants, noise excitation)
    { "HH",
      { 0xB0, 0x98, 0x84, 0x80, 0x80, 0x80 },
      { 0x20, 0x24, 0x18, 0x14, 0x10, 0x0C },
      0x42, false },
};

// ============================================================================
// SP0250Synth class
// ============================================================================

class SP0250Synth {
public:
    SP0250Synth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_lpcRate = LPC_RATE;
        m_lpcStep = (double)m_lpcRate / (double)sampleRate;

        m_volume = 0.8f;
        m_stereoWidth = 0.3f;
        m_currentPreset = 0;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_brightness = 0.5f;

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
                LPCVoice& voi = m_voices[v];

                if (!voi.active && voi.envLevel <= 0.001f) continue;

                // Update envelope
                if (voi.releasing) {
                    voi.envLevel -= 0.0005f; // ~40ms release
                    if (voi.envLevel <= 0.0f) {
                        voi.envLevel = 0.0f;
                        voi.active = false;
                        continue;
                    }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.002f; // ~10ms attack
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                // Advance LPC phase and generate samples as needed
                voi.lpcPhase += m_lpcStep;
                while (voi.lpcPhase >= 1.0) {
                    voi.lpcPhase -= 1.0;
                    voi.prevSample = voi.currentSample;
                    voi.currentSample = generateLPCSample(voi);
                }

                // Linear interpolation between LPC samples
                float t = (float)voi.lpcPhase;
                float sample = voi.prevSample * (1.0f - t) + voi.currentSample * t;

                float vel = voi.velocity / 127.0f;

                // Stereo panning
                float pan = 0.5f + m_stereoWidth * (((float)v / (NUM_VOICES - 1)) - 0.5f);
                float gainL = std::cos(pan * M_PI * 0.5f);
                float gainR = std::sin(pan * M_PI * 0.5f);

                float voiceSample = sample * vel * voi.envLevel;
                mixL += voiceSample * gainL;
                mixR += voiceSample * gainR;
            }

            outL[s] = mixL * m_volume;
            outR[s] = mixR * m_volume;
        }
    }

    // ========================================================================
    // MIDI note interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (midiNote < 24 || midiNote > 96) return;

        int v = findFreeVoice();
        LPCVoice& voi = m_voices[v];

        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.lpcPhase = 0.0;
        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;

        // Set pitch from MIDI note
        float freq = 440.0f * std::pow(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        int pitchPeriod = (int)((float)m_lpcRate / freq + 0.5f) - 1;
        if (pitchPeriod < 0) pitchPeriod = 0;
        if (pitchPeriod > 255) pitchPeriod = 255;
        voi.pitch = pitchPeriod;
        voi.pcount = 0;

        // Load current preset
        loadVowelPreset(v, m_currentPreset);

        // Velocity affects amplitude
        int ampScale = (velocity * 31) / 127;
        if (ampScale < 4) ampScale = 4;
        voi.amp = ampScale << 3; // Use exponent 3 for good range
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
            case PARAM_VOWEL: {
                int preset = std::max(0, std::min(NUM_PRESETS - 1, (int)value));
                m_currentPreset = preset;
                // Update all active voices
                for (int v = 0; v < NUM_VOICES; v++) {
                    if (m_voices[v].active)
                        loadVowelPreset(v, preset);
                }
                break;
            }
            case PARAM_VOICED:
                for (int v = 0; v < NUM_VOICES; v++) {
                    m_voices[v].voiced = (value > 0.5f);
                }
                break;
            case PARAM_BRIGHTNESS:
                m_brightness = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_STEREO_WIDTH:
                m_stereoWidth = std::max(0.0f, std::min(1.0f, value));
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_VOWEL: return (float)m_currentPreset;
            case PARAM_VOICED: return m_voices[0].voiced ? 1.0f : 0.0f;
            case PARAM_BRIGHTNESS: return m_brightness;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> brightness
                m_brightness = value / 127.0f;
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 70: // Vowel select
                setParameter(PARAM_VOWEL, (value / 127.0f) * (NUM_PRESETS - 1));
                break;
            case 74: // Filter cutoff -> brightness
                m_brightness = value / 127.0f;
                break;
            case 120: // All sound off
            case 123: // All notes off
                allNotesOff();
                break;
            default:
                break;
        }
    }

    void pitchBend(float value) {
        m_pitchBend = value;
        // Update all active voice pitches
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                float freq = 440.0f * std::pow(2.0f, (m_voices[v].midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
                int pitchPeriod = (int)((float)m_lpcRate / freq + 0.5f) - 1;
                if (pitchPeriod < 0) pitchPeriod = 0;
                if (pitchPeriod > 255) pitchPeriod = 255;
                m_voices[v].pitch = pitchPeriod;
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < NUM_PRESETS) {
            m_currentPreset = program;
        }
    }

    // Direct FIFO write (15 bytes, matching SP0250 hardware)
    void writeFIFO(int index, int data) {
        if (index < 0 || index > 14) return;
        // Apply to all voices
        for (int v = 0; v < NUM_VOICES; v++) {
            applyFIFOByte(v, index, data & 0xff);
        }
    }

    // Set individual filter coefficient (filter 0-5, F or B)
    void setFilterCoeff(int filterIdx, int isB, int value) {
        if (filterIdx < 0 || filterIdx >= NUM_FILTERS) return;
        int16_t coeff = sp0250_gc(value & 0xff);
        for (int v = 0; v < NUM_VOICES; v++) {
            if (isB)
                m_voices[v].filter[filterIdx].B = coeff;
            else
                m_voices[v].filter[filterIdx].F = coeff;
        }
    }

    // Convenience setters
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setVowel(int preset) { setParameter(PARAM_VOWEL, (float)preset); }

    // Direct register write for hardware compatibility
    void writeRegister(int offset, int data) {
        writeFIFO(offset, data);
    }

private:
    // ========================================================================
    // SP0250 coefficient ROM functions (from MAME, 1:1)
    // ========================================================================

    static uint16_t sp0250_ga(uint8_t v) {
        return (v & 0x1f) << (v >> 5);
    }

    static int16_t sp0250_gc(uint8_t v) {
        int16_t res = SP0250_COEFS[v & 0x7f];
        if (!(v & 0x80))
            res = -res;
        return res;
    }

    // ========================================================================
    // LPC sample generation (from MAME next(), 1:1)
    // ========================================================================

    float generateLPCSample(LPCVoice& voi) {
        // 15-bit LFSR (verified from hardware dump)
        voi.lfsr ^= (voi.lfsr ^ (voi.lfsr >> 1)) << 15;
        voi.lfsr >>= 1;

        // Excitation source
        int16_t z0;
        if (voi.voiced)
            z0 = (voi.pcount == 0) ? voi.amp : 0;
        else
            z0 = (voi.lfsr & 1) ? voi.amp : -voi.amp;

        // Apply 6-stage lattice filter
        for (int f = 0; f < NUM_FILTERS; f++)
            z0 = voi.filter[f].apply(z0);

        // Clamp to 7-bit DAC range
        int dac = z0 >> 6;
        if (dac < -64) dac = -64;
        if (dac > 63) dac = 63;

        // Advance pitch counter
        if (voi.pcount++ >= voi.pitch) {
            voi.pcount = 0;
        }

        // Normalize to -1.0..1.0
        return (float)dac / 64.0f;
    }

    // ========================================================================
    // Voice management
    // ========================================================================

    void resetVoice(int v) {
        LPCVoice& voi = m_voices[v];
        voi.voiced = true;
        voi.amp = 0;
        voi.lfsr = 0x7fff;
        voi.pitch = 22; // ~440Hz at 10kHz
        voi.pcount = 0;
        voi.midiNote = -1;
        voi.velocity = 0;
        voi.age = 0;
        voi.active = false;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;
        voi.lpcPhase = 0.0;

        for (int f = 0; f < NUM_FILTERS; f++) {
            voi.filter[f].F = 0;
            voi.filter[f].B = 0;
            voi.filter[f].reset();
        }
    }

    void loadVowelPreset(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        LPCVoice& voi = m_voices[voice];
        const VowelPreset& vp = VOWEL_PRESETS[preset];

        for (int f = 0; f < NUM_FILTERS; f++) {
            voi.filter[f].F = sp0250_gc(vp.filterF[f]);
            voi.filter[f].B = sp0250_gc(vp.filterB[f]);
            voi.filter[f].reset();
        }

        voi.voiced = vp.voiced;
        // Don't override amp here - it's set by velocity in noteOn
    }

    void applyFIFOByte(int voice, int index, uint8_t data) {
        LPCVoice& voi = m_voices[voice];
        switch (index) {
            case 0:  voi.filter[0].B = sp0250_gc(data); break;
            case 1:  voi.filter[0].F = sp0250_gc(data); break;
            case 2:  voi.amp = sp0250_ga(data); break;
            case 3:  voi.filter[1].B = sp0250_gc(data); break;
            case 4:  voi.filter[1].F = sp0250_gc(data); break;
            case 5:  voi.pitch = data; break;
            case 6:  voi.filter[2].B = sp0250_gc(data); break;
            case 7:  voi.filter[2].F = sp0250_gc(data); break;
            case 8:
                voi.voiced = (data & 0x40) != 0;
                break;
            case 9:  voi.filter[3].B = sp0250_gc(data); break;
            case 10: voi.filter[3].F = sp0250_gc(data); break;
            case 11: voi.filter[4].B = sp0250_gc(data); break;
            case 12: voi.filter[4].F = sp0250_gc(data); break;
            case 13: voi.filter[5].B = sp0250_gc(data); break;
            case 14: voi.filter[5].F = sp0250_gc(data); break;
        }
    }

    int findFreeVoice() {
        for (int v = 0; v < NUM_VOICES; v++) {
            if (!m_voices[v].active && m_voices[v].envLevel <= 0.001f)
                return v;
        }
        // Find releasing with lowest level
        int bestV = -1;
        float bestLevel = 2.0f;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].releasing && m_voices[v].envLevel < bestLevel) {
                bestLevel = m_voices[v].envLevel;
                bestV = v;
            }
        }
        if (bestV >= 0) return bestV;

        // Steal oldest
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
    int m_lpcRate = LPC_RATE;
    double m_lpcStep = 0.0;

    LPCVoice m_voices[NUM_VOICES];

    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
    float m_brightness = 0.5f;
    int m_currentPreset = 0;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(SP0250Module) {
    emscripten::class_<SP0250Synth>("SP0250Synth")
        .constructor<>()
        .function("initialize", &SP0250Synth::initialize)
        .function("process", &SP0250Synth::process)
        .function("noteOn", &SP0250Synth::noteOn)
        .function("noteOff", &SP0250Synth::noteOff)
        .function("allNotesOff", &SP0250Synth::allNotesOff)
        .function("setParameter", &SP0250Synth::setParameter)
        .function("getParameter", &SP0250Synth::getParameter)
        .function("controlChange", &SP0250Synth::controlChange)
        .function("pitchBend", &SP0250Synth::pitchBend)
        .function("programChange", &SP0250Synth::programChange)
        .function("writeFIFO", &SP0250Synth::writeFIFO)
        .function("setFilterCoeff", &SP0250Synth::setFilterCoeff)
        .function("writeRegister", &SP0250Synth::writeRegister)
        .function("setVolume", &SP0250Synth::setVolume)
        .function("setVowel", &SP0250Synth::setVowel);
}

#endif
