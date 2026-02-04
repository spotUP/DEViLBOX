/**
 * VotraxSynth.cpp - Votrax SC-01 Formant Speech Synthesizer for WebAssembly
 * Based on MAME's Votrax SC-01A simulation by Olivier Galibert
 *
 * The Votrax SC-01 is a formant speech synthesizer IC that generates
 * 64 phonemes through:
 * - Glottal pulse train (9-element waveform) for voiced sounds
 * - 15-bit LFSR white noise for unvoiced/fricative sounds
 * - 4 formant filters (F1, F2, F3, F4) using bilinear-transformed
 *   switched-capacitor analog circuits
 * - Noise shaping filter
 * - Glottal closure amplitude modulation
 * - Parameter interpolation between phoneme transitions
 *
 * This WASM version extends the original with:
 * - 4-voice polyphony (4 independent Votrax engines)
 * - MIDI note-to-pitch mapping
 * - Real-time formant parameter control
 * - Phoneme selection via program change
 * - Stereo output with voice panning
 *
 * The chip runs at an internal 40kHz sample rate (authentic) and
 * upsamples to the audio output rate.
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

static constexpr int NUM_VOICES = 4;
static constexpr int NUM_PHONEMES = 64;
static constexpr int NUM_PRESETS = 8;    // Quick-access preset groups
static constexpr double MAIN_CLOCK = 720000.0;
static constexpr double SCLOCK = MAIN_CLOCK / 18.0;   // 40kHz stream
static constexpr double CCLOCK = MAIN_CLOCK / 36.0;   // 20kHz capacitor switching

// ============================================================================
// Parameter IDs
// ============================================================================

enum VotraxParam {
    PARAM_VOLUME = 0,
    PARAM_PHONEME = 1,       // 0-63 phone selection
    PARAM_INFLECTION = 2,    // 0-3 pitch inflection
    PARAM_F1_OVERRIDE = 3,   // 0-15 formant 1 override (-1 = use phoneme)
    PARAM_F2_OVERRIDE = 4,   // 0-15 formant 2 override
    PARAM_F3_OVERRIDE = 5,   // 0-15 formant 3 override
    PARAM_STEREO_WIDTH = 6,
};

// ============================================================================
// Glottal waveform (from MAME, transistor resistor ladder model)
// ============================================================================

static const double GLOTTAL_WAVE[9] = {
    0.0,
    -4.0/7.0,
    7.0/7.0,
    6.0/7.0,
    5.0/7.0,
    4.0/7.0,
    3.0/7.0,
    2.0/7.0,
    1.0/7.0
};

// ============================================================================
// Phoneme parameter table
// Reconstructed from SC-01 specifications and phonetic analysis
// Parameters: f1, va, f2, fc, f2q, f3, fa, cld, vd, closure, duration
// ============================================================================

struct PhonemeParams {
    const char* name;
    uint8_t f1;        // Formant 1 (4-bit, higher = lower freq)
    uint8_t va;        // Voice amplitude (4-bit)
    uint8_t f2;        // Formant 2 (4-bit)
    uint8_t fc;        // Noise filter cutoff (4-bit)
    uint8_t f2q;       // Formant 2 Q (4-bit)
    uint8_t f3;        // Formant 3 (4-bit)
    uint8_t fa;        // Noise amplitude (4-bit)
    uint8_t cld;       // Closure delay in ticks (4-bit)
    uint8_t vd;        // Voice delay in ticks (4-bit)
    bool    closure;   // Glottal closure flag
    uint8_t duration;  // Duration in timer ticks (7-bit)
};

// Phoneme table based on SC-01 phoneme set and standard formant data
// f1/f2/f3: higher value = lower frequency (more capacitance)
// va: voice amplitude, fa: noise amplitude
static const PhonemeParams PHONEME_TABLE[NUM_PHONEMES] = {
    // Index  Name    f1  va  f2  fc f2q  f3  fa cld vd  cl  dur
    /*  0 */ {"EH3",   7, 13,  5,  1,  5,  6,  0,  0,  1, false, 59},  // short e variant
    /*  1 */ {"EH2",   7, 13,  5,  1,  5,  6,  0,  0,  1, false, 49},
    /*  2 */ {"EH1",   7, 13,  5,  1,  5,  6,  0,  0,  1, false, 39},
    /*  3 */ {"PA0",   0,  0,  0,  0,  0,  0,  0,  0,  0, false,  5},  // pause
    /*  4 */ {"DT",    7, 11,  5,  4,  5,  6,  3,  4,  2,  true, 21},  // dental stop
    /*  5 */ {"A1",    5, 14,  9,  1,  6,  8,  0,  0,  1, false, 47},  // "a" variant
    /*  6 */ {"A2",    5, 14,  9,  1,  6,  8,  0,  0,  1, false, 39},
    /*  7 */ {"ZH",    7,  8,  5,  9,  5,  5, 10,  2,  2,  true, 47},  // voiced sh
    /*  8 */ {"AH2",   6, 14,  8,  1,  5,  7,  0,  0,  1, false, 49},  // "ah" variant
    /*  9 */ {"I3",   12, 13,  3,  1,  4,  4,  0,  0,  1, false, 59},  // "ee" variant
    /* 10 */ {"I2",   12, 13,  3,  1,  4,  4,  0,  0,  1, false, 49},
    /* 11 */ {"I1",   12, 13,  3,  1,  4,  4,  0,  0,  1, false, 39},
    /* 12 */ {"M",     8, 11,  7,  2,  6,  3,  3,  5,  4, false, 49},  // nasal m
    /* 13 */ {"N",     9, 11,  4,  3,  5,  3,  3,  5,  3, false, 49},  // nasal n
    /* 14 */ {"B",     8, 10,  7,  2,  6,  7,  2,  6,  4,  true, 21},  // bilabial stop
    /* 15 */ {"V",     8,  9,  5,  8,  6,  6,  8,  2,  2,  true, 41},  // voiced fric
    /* 16 */ {"CH",    9,  0,  4, 13,  8,  5, 13,  3,  6,  true, 33},  // affricate
    /* 17 */ {"SH",    9,  0,  4, 12,  7,  4, 14,  2,  5,  true, 47},  // voiceless fric
    /* 18 */ {"Z",     8,  7,  4, 10,  5,  5, 11,  2,  2,  true, 47},  // voiced fric
    /* 19 */ {"AW1",   4, 14, 12,  1,  7, 10,  0,  0,  1, false, 53},  // "aw" variant
    /* 20 */ {"NG",    9, 10,  6,  2,  5,  2,  3,  5,  4, false, 49},  // nasal ng
    /* 21 */ {"AH1",   6, 14,  8,  1,  5,  7,  0,  0,  1, false, 39},  // "ah"
    /* 22 */ {"OO1",  13, 13, 12,  1,  5,  9,  0,  0,  1, false, 47},  // "oo" variant
    /* 23 */ {"OO",   13, 14, 12,  1,  5,  9,  0,  0,  1, false, 59},  // "oo"
    /* 24 */ {"L",    10, 11,  5,  2,  6,  5,  2,  3,  2, false, 41},  // lateral
    /* 25 */ {"K",     9,  0,  6, 11,  7,  6,  8,  5,  7,  true, 23},  // velar stop
    /* 26 */ {"J",     8,  8,  4, 10,  6,  5,  9,  3,  3,  true, 33},  // voiced affric
    /* 27 */ {"H",     8,  0,  6, 10,  4,  6, 10,  1,  5,  true, 33},  // aspirate
    /* 28 */ {"G",     8,  8,  6, 10,  6,  6,  5,  5,  5,  true, 23},  // voiced velar
    /* 29 */ {"F",     8,  0,  5, 12,  5,  6, 13,  2,  5,  true, 41},  // voiceless fric
    /* 30 */ {"D",     8, 10,  5,  4,  5,  6,  3,  5,  3,  true, 21},  // voiced alveolar
    /* 31 */ {"S",     9,  0,  3, 14,  6,  4, 15,  2,  5,  true, 47},  // voiceless fric
    /* 32 */ {"A",     5, 15, 10,  1,  6,  8,  0,  0,  1, false, 53},  // "a" as in cat
    /* 33 */ {"AY",    6, 14,  5,  1,  5,  6,  0,  0,  1, false, 59},  // diphthong
    /* 34 */ {"Y1",   11, 10,  3,  2,  4,  4,  1,  2,  2, false, 33},  // "y" variant
    /* 35 */ {"UH3",  10, 13,  8,  1,  5,  7,  0,  0,  1, false, 59},  // "uh" variant
    /* 36 */ {"AH",    6, 15,  8,  1,  5,  7,  0,  0,  1, false, 53},  // "ah"
    /* 37 */ {"P",     8,  0,  7,  2,  6,  7,  1,  7,  7,  true, 21},  // voiceless bilabial
    /* 38 */ {"O",     8, 14, 12,  1,  6,  9,  0,  0,  1, false, 53},  // "oh"
    /* 39 */ {"I",    11, 14,  4,  1,  4,  5,  0,  0,  1, false, 49},  // "ih"
    /* 40 */ {"U",    12, 14, 11,  1,  5,  8,  0,  0,  1, false, 53},  // "oo" as in book
    /* 41 */ {"Y",    11, 10,  3,  2,  4,  4,  1,  2,  2, false, 41},  // "y"
    /* 42 */ {"T",     8,  0,  5,  6,  5,  6,  4,  5,  7,  true, 21},  // voiceless alveolar
    /* 43 */ {"R",    10, 12,  5,  2,  5,  5,  1,  2,  2, false, 41},  // rhotic
    /* 44 */ {"E",    12, 14,  3,  1,  4,  4,  0,  0,  1, false, 53},  // "ee"
    /* 45 */ {"W",    12, 10, 12,  2,  5,  9,  1,  2,  2, false, 33},  // "w"
    /* 46 */ {"AE",    6, 14,  6,  1,  5,  7,  0,  0,  1, false, 53},  // "ae"
    /* 47 */ {"AE1",   6, 14,  6,  1,  5,  7,  0,  0,  1, false, 39},  // "ae" variant
    /* 48 */ {"AW2",   4, 14, 12,  1,  7, 10,  0,  0,  1, false, 47},  // "aw" variant
    /* 49 */ {"UH2",  10, 13,  8,  1,  5,  7,  0,  0,  1, false, 49},  // "uh" variant
    /* 50 */ {"UH1",  10, 13,  8,  1,  5,  7,  0,  0,  1, false, 39},  // "uh" variant
    /* 51 */ {"UH",   10, 14,  8,  1,  5,  7,  0,  0,  1, false, 53},  // "uh"
    /* 52 */ {"O2",    8, 14, 12,  1,  6,  9,  0,  0,  1, false, 47},  // "oh" variant
    /* 53 */ {"O1",    8, 14, 12,  1,  6,  9,  0,  0,  1, false, 39},  // "oh" variant
    /* 54 */ {"IU",   11, 13,  6,  1,  4,  5,  0,  0,  1, false, 53},  // "iu" diphthong
    /* 55 */ {"U1",   12, 14, 11,  1,  5,  8,  0,  0,  1, false, 39},  // "u" variant
    /* 56 */ {"THV",   8,  7,  5,  9,  5,  6,  9,  2,  2,  true, 41},  // voiced th
    /* 57 */ {"TH",    8,  0,  5, 11,  5,  6, 12,  2,  5,  true, 41},  // voiceless th
    /* 58 */ {"ER",   10, 13,  6,  1,  5,  5,  0,  0,  1, false, 53},  // "er"
    /* 59 */ {"EH",    7, 14,  5,  1,  5,  6,  0,  0,  1, false, 53},  // "eh"
    /* 60 */ {"E1",   12, 14,  3,  1,  4,  4,  0,  0,  1, false, 39},  // "ee" variant
    /* 61 */ {"AW",    4, 14, 12,  1,  7, 10,  0,  0,  1, false, 59},  // "aw"
    /* 62 */ {"PA1",   0,  0,  0,  0,  0,  0,  0,  0,  0, false, 15},  // long pause
    /* 63 */ {"STOP",  0,  0,  0,  0,  0,  0,  0, 15, 15,  true,  5},  // stop
};

// Phoneme names for reference
static const char* const PHONEME_NAMES[NUM_PHONEMES] = {
    "EH3","EH2","EH1","PA0","DT","A1","A2","ZH",
    "AH2","I3","I2","I1","M","N","B","V",
    "CH","SH","Z","AW1","NG","AH1","OO1","OO",
    "L","K","J","H","G","F","D","S",
    "A","AY","Y1","UH3","AH","P","O","I",
    "U","Y","T","R","E","W","AE","AE1",
    "AW2","UH2","UH1","UH","O2","O1","IU","U1",
    "THV","TH","ER","EH","E1","AW","PA1","STOP"
};

// ============================================================================
// Helper functions
// ============================================================================

static double bits_to_caps(uint32_t value, const double* caps, int n) {
    double total = 0;
    for (int i = 0; i < n; i++) {
        if (value & 1)
            total += caps[i];
        value >>= 1;
    }
    return total;
}

// ============================================================================
// Single Votrax voice (complete independent SC-01 engine)
// ============================================================================

struct VotraxVoice {
    // MIDI state
    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    // Phoneme state
    uint8_t phone;
    uint8_t inflection;

    // Decoded ROM parameters
    uint8_t rom_duration;
    uint8_t rom_vd, rom_cld;
    uint8_t rom_fa, rom_fc, rom_va;
    uint8_t rom_f1, rom_f2, rom_f2q, rom_f3;
    bool    rom_closure;
    bool    rom_pause;

    // Interpolated values (8-bit precision)
    uint8_t cur_fa, cur_fc, cur_va;
    uint8_t cur_f1, cur_f2, cur_f2q, cur_f3;

    // Committed filter parameters
    uint8_t filt_fa, filt_fc, filt_va;
    uint8_t filt_f1, filt_f2, filt_f2q, filt_f3;

    // Internal counters
    uint16_t phonetick;
    uint8_t  ticks;
    uint8_t  pitch;
    uint8_t  closure;
    uint8_t  update_counter;
    uint32_t sample_count;

    // Internal state
    bool    cur_closure;
    uint16_t noise;
    bool    cur_noise;

    // MIDI pitch override
    int     pitchOverride;  // -1 = use phoneme pitch, else direct pitch period

    // Filter histories
    double voice_1[4], voice_2[4], voice_3[4];
    double noise_1[3], noise_2[3], noise_3[2], noise_4[2];
    double vn_1[4], vn_2[4], vn_3[4], vn_4[4], vn_5[2], vn_6[2];

    // Filter coefficients
    double f1_a[4],  f1_b[4];
    double f2v_a[4], f2v_b[4];
    double f2n_a[2], f2n_b[2];
    double f3_a[4],  f3_b[4];
    double f4_a[4],  f4_b[4];
    double fx_a[1],  fx_b[2];
    double fn_a[3],  fn_b[3];

    // Upsampling state
    float prevSample;
    float currentSample;
    double lpcPhase;
};

// ============================================================================
// VotraxSynth class
// ============================================================================

class VotraxSynth {
public:
    VotraxSynth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_sclockRate = SCLOCK;
        m_lpcStep = m_sclockRate / (double)sampleRate;

        m_volume = 0.7f;
        m_stereoWidth = 0.3f;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_currentPhone = 32;  // "A" phoneme
        m_f1Override = -1;
        m_f2Override = -1;
        m_f3Override = -1;

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
                VotraxVoice& voi = m_voices[v];

                if (!voi.active && voi.envLevel <= 0.001f) continue;

                // Update envelope
                if (voi.releasing) {
                    voi.envLevel -= 0.0003f;
                    if (voi.envLevel <= 0.0f) {
                        voi.envLevel = 0.0f;
                        voi.active = false;
                        continue;
                    }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.005f;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                // Advance internal clock and generate samples
                voi.lpcPhase += m_lpcStep;
                while (voi.lpcPhase >= 1.0) {
                    voi.lpcPhase -= 1.0;
                    voi.prevSample = voi.currentSample;

                    // Run one 40kHz sample
                    voi.sample_count++;
                    if (voi.sample_count & 1)
                        chipUpdate(voi);
                    voi.currentSample = (float)analogCalc(voi);
                }

                // Linear interpolation
                float t = (float)voi.lpcPhase;
                float sample = voi.prevSample * (1.0f - t) + voi.currentSample * t;

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
        if (midiNote < 24 || midiNote > 96) return;

        int v = findFreeVoice();
        VotraxVoice& voi = m_voices[v];

        // Reset voice state but keep filter coefficients
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
        int period = (int)(m_sclockRate / (2.0 * freq) + 0.5);
        if (period < 8) period = 8;
        if (period > 255) period = 255;
        voi.pitchOverride = period;

        // Load current phoneme
        phoneCommit(voi, m_currentPhone);
        filtersCommit(voi, true);
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
            case PARAM_PHONEME: {
                int phone = std::max(0, std::min(63, (int)value));
                m_currentPhone = phone;
                for (int v = 0; v < NUM_VOICES; v++) {
                    if (m_voices[v].active) {
                        phoneCommit(m_voices[v], phone);
                    }
                }
                break;
            }
            case PARAM_INFLECTION:
                for (int v = 0; v < NUM_VOICES; v++) {
                    m_voices[v].inflection = std::max(0, std::min(3, (int)value));
                }
                break;
            case PARAM_F1_OVERRIDE:
                m_f1Override = (value < 0) ? -1 : std::min(15, (int)value);
                break;
            case PARAM_F2_OVERRIDE:
                m_f2Override = (value < 0) ? -1 : std::min(15, (int)value);
                break;
            case PARAM_F3_OVERRIDE:
                m_f3Override = (value < 0) ? -1 : std::min(15, (int)value);
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
            case PARAM_PHONEME: return (float)m_currentPhone;
            case PARAM_INFLECTION: return (float)m_voices[0].inflection;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> inflection
                setParameter(PARAM_INFLECTION, (value / 127.0f) * 3.0f);
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 70: // Phoneme select (coarse)
                setParameter(PARAM_PHONEME, (value / 127.0f) * 63.0f);
                break;
            case 71: // F1 override
                m_f1Override = (value == 0) ? -1 : (value * 15 / 127);
                break;
            case 74: // F2 override
                m_f2Override = (value == 0) ? -1 : (value * 15 / 127);
                break;
            case 75: // F3 override
                m_f3Override = (value == 0) ? -1 : (value * 15 / 127);
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
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                float freq = 440.0f * std::pow(2.0f, (m_voices[v].midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
                int period = (int)(m_sclockRate / (2.0 * freq) + 0.5);
                if (period < 8) period = 8;
                if (period > 255) period = 255;
                m_voices[v].pitchOverride = period;
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < 64) {
            m_currentPhone = program;
        }
    }

    // Direct phoneme write (hardware compatible)
    void writePhone(int phone) {
        if (phone < 0 || phone > 63) return;
        m_currentPhone = phone;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active) {
                phoneCommit(m_voices[v], phone);
            }
        }
    }

    void writeInflection(int inflection) {
        for (int v = 0; v < NUM_VOICES; v++) {
            m_voices[v].inflection = inflection & 3;
        }
    }

    // Convenience setters
    void setVolume(float value) {
        m_volume = std::max(0.0f, std::min(1.0f, value));
    }

    void setPhoneme(int phone) {
        writePhone(phone);
    }

    // Register-level access
    void writeRegister(int offset, int data) {
        switch (offset) {
            case 0: writePhone(data & 0x3f); break;
            case 1: writeInflection(data & 3); break;
        }
    }

private:
    // ========================================================================
    // Filter building (from MAME, bilinear transform of analog circuits)
    // ========================================================================

    void buildStandardFilter(double *a, double *b,
                             double c1t, double c1b,
                             double c2t, double c2b,
                             double c3, double c4) {
        double k0 = c1t / (CCLOCK * c1b);
        double k1 = c4 * c2t / (CCLOCK * c1b * c3);
        double k2 = c4 * c2b / (CCLOCK * CCLOCK * c1b * c3);

        double fpeak = sqrt(fabs(k0*k1 - k2)) / (2*M_PI*k2);
        double zc = 2*M_PI*fpeak / tan(M_PI*fpeak / m_sclockRate);

        double m0 = zc*k0;
        double m1 = zc*k1;
        double m2 = zc*zc*k2;

        a[0] = 1+m0;
        a[1] = 3+m0;
        a[2] = 3-m0;
        a[3] = 1-m0;
        b[0] = 1+m1+m2;
        b[1] = 3+m1-m2;
        b[2] = 3-m1-m2;
        b[3] = 1-m1+m2;
    }

    void buildLowpassFilter(double *a, double *b,
                            double c1t, double c1b) {
        double k = c1b / (CCLOCK * c1t) * (150.0/4000.0);
        double fpeak = 1/(2*M_PI*k);
        double zc = 2*M_PI*fpeak / tan(M_PI*fpeak / m_sclockRate);
        double m = zc*k;

        a[0] = 1;
        b[0] = 1+m;
        b[1] = 1-m;
    }

    void buildNoiseShaperFilter(double *a, double *b,
                                double c1, double c2t,
                                double c2b, double c3, double c4) {
        double k0 = c2t*c3*c2b/c4;
        double k1 = c2t*(CCLOCK * c2b);
        double k2 = c1*c2t*c3/(CCLOCK * c4);

        double fpeak = sqrt(1/k2)/(2*M_PI);
        double zc = 2*M_PI*fpeak/tan(M_PI*fpeak / m_sclockRate);

        double m0 = zc*k0;
        double m1 = zc*k1;
        double m2 = zc*zc*k2;

        a[0] = m0;
        a[1] = 0;
        a[2] = -m0;
        b[0] = 1+m1+m2;
        b[1] = 2-2*m2;
        b[2] = 1-m1+m2;
    }

    // ========================================================================
    // Filter application (from MAME)
    // ========================================================================

    template<int Nx, int Ny, int Na, int Nb>
    static double applyFilter(const double (&x)[Nx], const double (&y)[Ny],
                              const double (&a)[Na], const double (&b)[Nb]) {
        double total = 0;
        for (int i = 0; i < Na; i++)
            total += x[i] * a[i];
        for (int i = 1; i < Nb; i++)
            total -= y[i-1] * b[i];
        return total / b[0];
    }

    template<int N>
    static void shiftHist(double val, double (&hist)[N]) {
        for (int i = N-1; i > 0; i--)
            hist[i] = hist[i-1];
        hist[0] = val;
    }

    // ========================================================================
    // Phoneme commit
    // ========================================================================

    void phoneCommit(VotraxVoice& voi, int phone) {
        if (phone < 0 || phone >= NUM_PHONEMES) return;

        voi.phone = phone;
        voi.phonetick = 0;
        voi.ticks = 0;

        const PhonemeParams& p = PHONEME_TABLE[phone];

        voi.rom_f1 = (m_f1Override >= 0) ? m_f1Override : p.f1;
        voi.rom_va = p.va;
        voi.rom_f2 = (m_f2Override >= 0) ? m_f2Override : p.f2;
        voi.rom_fc = p.fc;
        voi.rom_f2q = p.f2q;
        voi.rom_f3 = (m_f3Override >= 0) ? m_f3Override : p.f3;
        voi.rom_fa = p.fa;
        voi.rom_cld = p.cld;
        voi.rom_vd = p.vd;
        voi.rom_closure = p.closure;
        voi.rom_duration = p.duration;
        voi.rom_pause = (phone == 3) || (phone == 62); // PA0 or PA1

        if (voi.rom_cld == 0)
            voi.cur_closure = voi.rom_closure;
    }

    // ========================================================================
    // Parameter interpolation (from MAME)
    // ========================================================================

    static void interpolate(uint8_t &reg, uint8_t target) {
        reg = reg - (reg >> 3) + (target << 1);
    }

    // ========================================================================
    // Chip update - 20kHz digital state machine (from MAME)
    // ========================================================================

    void chipUpdate(VotraxVoice& voi) {
        // Phone tick counter
        if (voi.ticks != 0x10) {
            voi.phonetick++;
            if (voi.phonetick == ((voi.rom_duration << 2) | 1)) {
                voi.phonetick = 0;
                voi.ticks++;
                if (voi.ticks == voi.rom_cld)
                    voi.cur_closure = voi.rom_closure;
            }
        }

        // Update timing counters (divide by 16 and 48)
        voi.update_counter++;
        if (voi.update_counter == 0x30)
            voi.update_counter = 0;

        bool tick_625 = !(voi.update_counter & 0xf);
        bool tick_208 = voi.update_counter == 0x28;

        // Formant update at 208Hz
        if (tick_208 && (!voi.rom_pause || !(voi.filt_fa || voi.filt_va))) {
            interpolate(voi.cur_fc,  voi.rom_fc);
            interpolate(voi.cur_f1,  voi.rom_f1);
            interpolate(voi.cur_f2,  voi.rom_f2);
            interpolate(voi.cur_f2q, voi.rom_f2q);
            interpolate(voi.cur_f3,  voi.rom_f3);
        }

        // Non-formant update at 625Hz
        if (tick_625) {
            if (voi.ticks >= voi.rom_vd)
                interpolate(voi.cur_fa, voi.rom_fa);
            if (voi.ticks >= voi.rom_cld) {
                interpolate(voi.cur_va, voi.rom_va);
            }
        }

        // Closure counter
        if (!voi.cur_closure && (voi.filt_fa || voi.filt_va))
            voi.closure = 0;
        else if (voi.closure != 7 << 2)
            voi.closure++;

        // Pitch counter
        if (voi.pitchOverride >= 0) {
            // MIDI pitch override
            voi.pitch = (voi.pitch + 1) & 0xff;
            if (voi.pitch >= voi.pitchOverride)
                voi.pitch = 0;
        } else {
            // Original SC-01 pitch calculation
            voi.pitch = (voi.pitch + 1) & 0xff;
            if (voi.pitch == (0xe0 ^ (voi.inflection << 5) ^ (voi.filt_f1 << 1)) + 2)
                voi.pitch = 0;
        }

        // Update filters when pitch is in correct phase
        if ((voi.pitch & 0xf9) == 0x08)
            filtersCommit(voi, false);

        // 15-bit LFSR noise
        bool inp = (1 || voi.filt_fa) && voi.cur_noise && (voi.noise != 0x7fff);
        voi.noise = ((voi.noise << 1) & 0x7ffe) | inp;
        voi.cur_noise = !(((voi.noise >> 14) ^ (voi.noise >> 13)) & 1);
    }

    // ========================================================================
    // Filter coefficient commit (from MAME)
    // ========================================================================

    void filtersCommit(VotraxVoice& voi, bool force) {
        voi.filt_fa = voi.cur_fa >> 4;
        voi.filt_fc = voi.cur_fc >> 4;
        voi.filt_va = voi.cur_va >> 4;

        if (force || voi.filt_f1 != voi.cur_f1 >> 4) {
            voi.filt_f1 = voi.cur_f1 >> 4;
            double f1_caps[] = { 2546, 4973, 9861, 19724 };
            buildStandardFilter(voi.f1_a, voi.f1_b,
                11247, 11797, 949, 52067,
                2280 + bits_to_caps(voi.filt_f1, f1_caps, 4),
                166272);
        }

        if (force || voi.filt_f2 != voi.cur_f2 >> 3 || voi.filt_f2q != voi.cur_f2q >> 4) {
            voi.filt_f2 = voi.cur_f2 >> 3;
            voi.filt_f2q = voi.cur_f2q >> 4;
            double f2q_caps[] = { 1390, 2965, 5875, 11297 };
            double f2_caps[] = { 833, 1663, 3164, 6327, 12654 };
            buildStandardFilter(voi.f2v_a, voi.f2v_b,
                24840, 29154,
                829 + bits_to_caps(voi.filt_f2q, f2q_caps, 4),
                38180,
                2352 + bits_to_caps(voi.filt_f2, f2_caps, 5),
                34270);

            // F2 noise injection (neutralized as in MAME - numerically unstable)
            voi.f2n_a[0] = 0;
            voi.f2n_a[1] = 0;
            voi.f2n_b[0] = 1;
            voi.f2n_b[1] = 0;
        }

        if (force || voi.filt_f3 != voi.cur_f3 >> 4) {
            voi.filt_f3 = voi.cur_f3 >> 4;
            double f3_caps[] = { 2226, 4485, 9056, 18111 };
            buildStandardFilter(voi.f3_a, voi.f3_b,
                0, 17594, 868, 18828,
                8480 + bits_to_caps(voi.filt_f3, f3_caps, 4),
                50019);
        }

        if (force) {
            buildStandardFilter(voi.f4_a, voi.f4_b,
                0, 28810, 1165, 21457, 8558, 7289);

            buildLowpassFilter(voi.fx_a, voi.fx_b, 1122, 23131);

            buildNoiseShaperFilter(voi.fn_a, voi.fn_b,
                15500, 14854, 8450, 9523, 14083);
        }
    }

    // ========================================================================
    // Analog signal path (from MAME, 1:1)
    // ========================================================================

    double analogCalc(VotraxVoice& voi) {
        // 1. Glottal pulse wave
        double v = voi.pitch >= (9 << 3) ? 0 : GLOTTAL_WAVE[voi.pitch >> 3];

        // 2. Voice amplitude (linear)
        v = v * voi.filt_va / 15.0;
        shiftHist(v, voi.voice_1);

        // 3. F1 filter
        v = applyFilter(voi.voice_1, voi.voice_2, voi.f1_a, voi.f1_b);
        shiftHist(v, voi.voice_2);

        // 4. F2 filter (voice path)
        v = applyFilter(voi.voice_2, voi.voice_3, voi.f2v_a, voi.f2v_b);
        shiftHist(v, voi.voice_3);

        // 5. Noise source
        double n = 1e4 * ((voi.pitch & 0x40 ? voi.cur_noise : false) ? 1 : -1);
        n = n * voi.filt_fa / 15.0;
        shiftHist(n, voi.noise_1);

        // 6. Noise shaper
        n = applyFilter(voi.noise_1, voi.noise_2, voi.fn_a, voi.fn_b);
        shiftHist(n, voi.noise_2);

        // 7. F2 noise input
        double n2 = n * voi.filt_fc / 15.0;
        shiftHist(n2, voi.noise_3);

        // 8. F2 filter (noise path)
        n2 = applyFilter(voi.noise_3, voi.noise_4, voi.f2n_a, voi.f2n_b);
        shiftHist(n2, voi.noise_4);

        // 9. Sum voice + noise F2 outputs
        double vn = v + n2;
        shiftHist(vn, voi.vn_1);

        // 10. F3 filter
        vn = applyFilter(voi.vn_1, voi.vn_2, voi.f3_a, voi.f3_b);
        shiftHist(vn, voi.vn_2);

        // 11. Second noise injection
        vn += n * (5 + (15 ^ voi.filt_fc)) / 20.0;
        shiftHist(vn, voi.vn_3);

        // 12. F4 filter (fixed)
        vn = applyFilter(voi.vn_3, voi.vn_4, voi.f4_a, voi.f4_b);
        shiftHist(vn, voi.vn_4);

        // 13. Glottal closure amplitude
        vn = vn * (7 ^ (voi.closure >> 2)) / 7.0;
        shiftHist(vn, voi.vn_5);

        // 14. Final lowpass filter
        vn = applyFilter(voi.vn_5, voi.vn_6, voi.fx_a, voi.fx_b);
        shiftHist(vn, voi.vn_6);

        return vn * 0.35;
    }

    // ========================================================================
    // Voice management
    // ========================================================================

    void resetVoice(int v) {
        VotraxVoice& voi = m_voices[v];

        voi.midiNote = -1;
        voi.velocity = 0;
        voi.age = 0;
        voi.active = false;
        voi.releasing = false;
        voi.envLevel = 0.0f;

        voi.phone = 0x3f;
        voi.inflection = 0;
        voi.pitchOverride = -1;
        voi.sample_count = 0;

        voi.rom_duration = 5;
        voi.rom_vd = voi.rom_cld = 0;
        voi.rom_fa = voi.rom_fc = voi.rom_va = 0;
        voi.rom_f1 = voi.rom_f2 = voi.rom_f2q = voi.rom_f3 = 0;
        voi.rom_closure = false;
        voi.rom_pause = false;

        voi.cur_fa = voi.cur_fc = voi.cur_va = 0;
        voi.cur_f1 = voi.cur_f2 = voi.cur_f2q = voi.cur_f3 = 0;

        voi.filt_fa = voi.filt_fc = voi.filt_va = 0;
        voi.filt_f1 = voi.filt_f2 = voi.filt_f2q = voi.filt_f3 = 0;

        voi.phonetick = 0;
        voi.ticks = 0;
        voi.pitch = 0;
        voi.closure = 0;
        voi.update_counter = 0;

        voi.cur_closure = true;
        voi.noise = 0;
        voi.cur_noise = false;

        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;
        voi.lpcPhase = 0.0;

        memset(voi.voice_1, 0, sizeof(voi.voice_1));
        memset(voi.voice_2, 0, sizeof(voi.voice_2));
        memset(voi.voice_3, 0, sizeof(voi.voice_3));
        memset(voi.noise_1, 0, sizeof(voi.noise_1));
        memset(voi.noise_2, 0, sizeof(voi.noise_2));
        memset(voi.noise_3, 0, sizeof(voi.noise_3));
        memset(voi.noise_4, 0, sizeof(voi.noise_4));
        memset(voi.vn_1, 0, sizeof(voi.vn_1));
        memset(voi.vn_2, 0, sizeof(voi.vn_2));
        memset(voi.vn_3, 0, sizeof(voi.vn_3));
        memset(voi.vn_4, 0, sizeof(voi.vn_4));
        memset(voi.vn_5, 0, sizeof(voi.vn_5));
        memset(voi.vn_6, 0, sizeof(voi.vn_6));

        // Initialize filter coefficients to reasonable defaults
        filtersCommit(voi, true);
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
    double m_sclockRate = SCLOCK;
    double m_lpcStep = 0.0;

    VotraxVoice m_voices[NUM_VOICES];

    float m_volume = 0.7f;
    float m_stereoWidth = 0.3f;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;
    int m_currentPhone = 32;
    int m_f1Override = -1;
    int m_f2Override = -1;
    int m_f3Override = -1;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(VotraxModule) {
    emscripten::class_<VotraxSynth>("VotraxSynth")
        .constructor<>()
        .function("initialize", &VotraxSynth::initialize)
        .function("process", &VotraxSynth::process)
        .function("noteOn", &VotraxSynth::noteOn)
        .function("noteOff", &VotraxSynth::noteOff)
        .function("allNotesOff", &VotraxSynth::allNotesOff)
        .function("setParameter", &VotraxSynth::setParameter)
        .function("getParameter", &VotraxSynth::getParameter)
        .function("controlChange", &VotraxSynth::controlChange)
        .function("pitchBend", &VotraxSynth::pitchBend)
        .function("programChange", &VotraxSynth::programChange)
        .function("writePhone", &VotraxSynth::writePhone)
        .function("writeInflection", &VotraxSynth::writeInflection)
        .function("writeRegister", &VotraxSynth::writeRegister)
        .function("setVolume", &VotraxSynth::setVolume)
        .function("setPhoneme", &VotraxSynth::setPhoneme);
}

#endif
