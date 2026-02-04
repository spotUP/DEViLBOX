/**
 * TMS5220 - LPC Speech Synthesizer (Speak & Spell) for DEViLBOX
 *
 * Based on MAME emulator by Frank Palazzolo, Aaron Giles, Jonathan Gevaryahu,
 * Raphael Nabet, Couriersud, Michael Zapf
 *
 * The TMS5220 is a Linear Predictive Coding (LPC) speech synthesis chip
 * that generates speech by exciting a 10-pole digital lattice filter
 * with either a chirp waveform (voiced) or pseudo-random noise (unvoiced).
 *
 * Features:
 * - 4-voice polyphony (4 independent TMS5220 LPC engines)
 * - 10-pole digital lattice filter (faithful from MAME)
 * - Chirp excitation for voiced sounds (52-element table)
 * - 13-bit LFSR noise for unvoiced sounds
 * - Frame-based parameter interpolation (200 samples at 8kHz)
 * - Two chirp ROM variants: original Speak & Spell + later TMS5220
 * - 8 phoneme presets (vowels with approximate K-coefficient configs)
 * - Real-time formant control via MIDI CC
 * - Internal 8kHz processing, upsampled to output rate
 *
 * Used in: Texas Instruments Speak & Spell (1978), arcade games,
 * Atari Star Wars, Berzerk, Bagman, etc.
 *
 * License: BSD-3-Clause (matching MAME)
 */

#include <emscripten/bind.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>

namespace devilbox {

// ============================================================================
// Coefficient tables from MAME tms5110r.hxx
// Using TMS5220/TMS5110A coefficient set (TI_5110_5220_LPC)
// ============================================================================

// Energy table (TI_028X_LATER_ENERGY) - 16 entries, 0=silent, 15=max
static const uint16_t energy_table[16] = {
    0, 2, 4, 6, 10, 14, 20, 28, 40, 56, 80, 112, 160, 224, 320, 0
};

// Pitch table (TI_5220_PITCH) - 64 entries for TMS5220
static const uint16_t pitch_table[64] = {
    0, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33, 34, 35, 36, 37,
    38, 39, 40, 41, 42, 44, 46, 48,
    50, 52, 53, 56, 58, 60, 62, 65,
    68, 70, 72, 76, 78, 80, 84, 86,
    91, 94, 98, 101, 105, 109, 114, 118,
    122, 127, 132, 137, 142, 148, 153, 159
};

// K coefficient tables (TI_5110_5220_LPC)
// K1: 32 entries (5-bit)
static const int16_t k1_table[32] = {
    -501, -498, -495, -490, -485, -478, -469, -459,
    -446, -431, -412, -389, -362, -331, -295, -253,
    -207, -155, -99, -40, 21, 83, 146, 207,
    265, 319, 369, 413, 453, 487, 514, 535
};

// K2: 32 entries (5-bit)
static const int16_t k2_table[32] = {
    -328, -303, -274, -244, -211, -175, -138, -99,
    -59, -18, 24, 64, 105, 143, 180, 215,
    248, 278, 306, 331, 354, 374, 392, 408,
    422, 435, 445, 455, 463, 470, 476, 506
};

// K3: 16 entries (4-bit)
static const int16_t k3_table[16] = {
    -441, -387, -333, -279, -225, -171, -117, -63,
    -9, 45, 98, 152, 206, 260, 314, 368
};

// K4: 16 entries (4-bit)
static const int16_t k4_table[16] = {
    -328, -273, -217, -161, -106, -50, 5, 61,
    116, 172, 228, 283, 339, 394, 450, 506
};

// K5: 16 entries (4-bit)
static const int16_t k5_table[16] = {
    -328, -282, -235, -189, -142, -96, -50, -3,
    43, 90, 136, 182, 229, 275, 322, 368
};

// K6: 16 entries (4-bit)
static const int16_t k6_table[16] = {
    -256, -212, -168, -123, -79, -35, 10, 54,
    98, 143, 187, 232, 276, 320, 365, 409
};

// K7: 16 entries (4-bit)
static const int16_t k7_table[16] = {
    -308, -260, -212, -164, -117, -69, -21, 27,
    75, 122, 170, 218, 266, 314, 361, 409
};

// K8: 8 entries (3-bit)
static const int16_t k8_table[8] = {
    -256, -161, -66, 29, 124, 219, 314, 409
};

// K9: 8 entries (3-bit)
static const int16_t k9_table[8] = {
    -256, -176, -96, -15, 65, 146, 226, 307
};

// K10: 8 entries (3-bit)
static const int16_t k10_table[8] = {
    -205, -132, -59, 14, 87, 160, 234, 307
};

// Chirp table - original Speak & Spell (TI_0280_PATENT_CHIRP)
static const int8_t chirp_original[52] = {
    0x00, 0x2a, (int8_t)0xd4, 0x32,
    (int8_t)0xb2, 0x12, 0x25, 0x14,
    0x02, (int8_t)0xe1, (int8_t)0xc5, 0x02,
    0x5f, 0x5a, 0x05, 0x0f,
    0x26, (int8_t)0xfc, (int8_t)0xa5, (int8_t)0xa5,
    (int8_t)0xd6, (int8_t)0xdd, (int8_t)0xdc, (int8_t)0xfc,
    0x25, 0x2b, 0x22, 0x21,
    0x0f, (int8_t)0xff, (int8_t)0xf8, (int8_t)0xee,
    (int8_t)0xed, (int8_t)0xef, (int8_t)0xf7, (int8_t)0xf6,
    (int8_t)0xfa, 0x00, 0x03, 0x02,
    0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
};

// Chirp table - later TMS5220/TMS5110A (TI_LATER_CHIRP)
static const int8_t chirp_later[52] = {
    0x00, 0x03, (int8_t)0x0f, 0x28,
    0x4c, 0x6c, 0x71, 0x50,
    0x25, 0x26, 0x4c, 0x44,
    0x1a, 0x32, 0x3b, 0x13,
    0x37, 0x1a, 0x25, 0x2f,
    0x1d, 0x13, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
};

// Interpolation shift coefficients
static const int interp_coeff[8] = { 0, 3, 3, 3, 2, 2, 1, 1 };

// ============================================================================
// Parameter IDs
// ============================================================================
enum TMS5220ParamId {
    PARAM_VOLUME = 0,
    PARAM_CHIRP_TYPE = 1,   // 0=original Speak&Spell, 1=later TMS5220
    PARAM_K1_INDEX = 2,     // 0-31
    PARAM_K2_INDEX = 3,     // 0-31
    PARAM_K3_INDEX = 4,     // 0-15
    PARAM_ENERGY_INDEX = 5, // 0-15
    PARAM_PITCH_INDEX = 6,  // 0-63
    PARAM_NOISE_MODE = 7,   // 0=voiced, 1=unvoiced
    PARAM_STEREO_WIDTH = 8,
    PARAM_BRIGHTNESS = 9,   // adjusts higher K coefficients
};

// ============================================================================
// Single TMS5220 LPC Voice
// ============================================================================
struct TMS5220Voice {
    // Current interpolated parameters
    int32_t current_energy;
    int32_t current_pitch;
    int32_t current_k[10];

    // Target parameters (from preset or direct setting)
    int32_t target_energy;
    int32_t target_pitch;
    int32_t target_k[10];

    // Lattice filter state (from MAME)
    int32_t u[11];
    int32_t x[10];

    // Excitation state
    uint16_t RNG;           // 13-bit LFSR
    int32_t excitation_data;
    int32_t pitch_count;    // chirp ROM address counter

    // Interpolation
    int32_t interp_count;   // sample counter within frame
    int32_t interp_period;  // current IP (0-7)

    // Voice state
    bool active;
    int32_t midi_note;
    float velocity;
    bool noise_mode;        // true = unvoiced

    // Internal rate accumulator
    double phase_acc;       // for 8kHz internal rate

    void reset() {
        current_energy = 0;
        current_pitch = 0;
        target_energy = 0;
        target_pitch = 0;
        memset(current_k, 0, sizeof(current_k));
        memset(target_k, 0, sizeof(target_k));
        memset(u, 0, sizeof(u));
        memset(x, 0, sizeof(x));
        RNG = 0x1FFF;  // 13-bit all ones
        excitation_data = 0;
        pitch_count = 0;
        interp_count = 0;
        interp_period = 0;
        active = false;
        midi_note = -1;
        velocity = 0.0f;
        noise_mode = false;
        phase_acc = 0.0;
    }
};

// ============================================================================
// Phoneme preset data
// ============================================================================
struct PhonemePreset {
    int energy_idx;      // 0-15
    int pitch_idx;       // 0-63
    int k_indices[10];   // K1-K10 indices
    bool unvoiced;
};

// Approximate vowel presets based on typical LPC analysis
// These set K1 (F1 frequency) and K2 (F2 frequency) for characteristic vowel sounds
static const PhonemePreset phoneme_presets[8] = {
    // AH "father" - low F1, low F2
    { 10, 30, { 20, 10, 8, 8, 8, 8, 8, 4, 4, 4 }, false },
    // EE "meet" - low F1, high F2
    { 10, 32, { 12, 28, 10, 8, 8, 8, 8, 4, 4, 4 }, false },
    // IH "bit" - mid F1, high F2
    { 10, 30, { 16, 24, 9, 8, 8, 8, 8, 4, 4, 4 }, false },
    // OH "boat" - mid F1, low F2
    { 10, 28, { 18, 8, 8, 8, 8, 8, 8, 4, 4, 4 }, false },
    // OO "boot" - low F1, very low F2
    { 10, 26, { 14, 6, 7, 8, 8, 8, 8, 4, 4, 4 }, false },
    // AE "bat" - high F1, mid F2
    { 10, 30, { 24, 18, 10, 8, 8, 8, 8, 4, 4, 4 }, false },
    // UH "but" - mid F1, mid F2
    { 10, 28, { 18, 14, 8, 8, 8, 8, 8, 4, 4, 4 }, false },
    // SH "shh" - unvoiced fricative
    { 8, 0, { 16, 20, 12, 10, 8, 8, 8, 4, 4, 4 }, true },
};

// ============================================================================
// Main TMS5220 Synth Class
// ============================================================================
class TMS5220Synth {
public:
    static constexpr int NUM_VOICES = 4;
    static constexpr int INTERNAL_RATE = 8000;  // 8kHz internal processing
    static constexpr int FRAME_SIZE = 200;      // 200 samples per frame at 8kHz (25ms)
    static constexpr int SAMPLES_PER_IP = 25;   // 200/8 = 25 samples per interpolation period

    TMS5220Synth() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        rateRatio_ = (double)INTERNAL_RATE / sampleRate;
        volume_ = 0.8f;
        chirpType_ = 1;  // default to later TMS5220 chirp
        stereoWidth_ = 0.5f;
        brightness_ = 1.0f;
        currentPreset_ = 0;

        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }

        // Pre-compute voice pan positions
        panPositions_[0] = -0.3f;
        panPositions_[1] = 0.3f;
        panPositions_[2] = -0.15f;
        panPositions_[3] = 0.15f;

        lastOutputL_ = 0.0f;
        lastOutputR_ = 0.0f;
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int note, int velocity) {
        if (velocity == 0) {
            noteOff(note);
            return;
        }

        int voiceIdx = allocateVoice();
        TMS5220Voice& v = voices_[voiceIdx];

        v.reset();
        v.active = true;
        v.midi_note = note;
        v.velocity = velocity / 127.0f;

        // Set pitch period from MIDI note
        float freq = 440.0f * powf(2.0f, (note - 69) / 12.0f);
        int pitch_period = (int)(INTERNAL_RATE / freq);
        if (pitch_period < 15) pitch_period = 15;
        if (pitch_period > 159) pitch_period = 159;

        // Apply preset
        const PhonemePreset& preset = phoneme_presets[currentPreset_];

        v.target_energy = energy_table[preset.energy_idx];
        v.target_pitch = pitch_period;
        v.noise_mode = preset.unvoiced;

        // Set K coefficients from preset indices
        setKFromIndices(v, preset.k_indices);

        // Start interpolation from zero
        v.current_energy = 0;
        v.current_pitch = v.target_pitch;
        memcpy(v.current_k, v.target_k, sizeof(v.current_k));
        v.interp_count = 0;
        v.interp_period = 0;

        // Initialize LFSR
        v.RNG = 0x1FFF;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midi_note == note) {
                // Decay energy to zero over one frame
                voices_[i].target_energy = 0;
                voices_[i].interp_count = 0;
                voices_[i].interp_period = 0;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].active = false;
            voices_[i].current_energy = 0;
        }
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                volume_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_CHIRP_TYPE:
                chirpType_ = (int)value;
                break;
            case PARAM_K1_INDEX:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int idx = std::clamp((int)value, 0, 31);
                        voices_[i].target_k[0] = k1_table[idx];
                    }
                }
                break;
            case PARAM_K2_INDEX:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int idx = std::clamp((int)value, 0, 31);
                        voices_[i].target_k[1] = k2_table[idx];
                    }
                }
                break;
            case PARAM_K3_INDEX:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int idx = std::clamp((int)value, 0, 15);
                        voices_[i].target_k[2] = k3_table[idx];
                    }
                }
                break;
            case PARAM_ENERGY_INDEX:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int idx = std::clamp((int)value, 0, 15);
                        voices_[i].target_energy = energy_table[idx];
                    }
                }
                break;
            case PARAM_PITCH_INDEX:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int idx = std::clamp((int)value, 0, 63);
                        voices_[i].target_pitch = pitch_table[idx];
                    }
                }
                break;
            case PARAM_NOISE_MODE:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        voices_[i].noise_mode = (value > 0.5f);
                    }
                }
                break;
            case PARAM_STEREO_WIDTH:
                stereoWidth_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_BRIGHTNESS:
                brightness_ = std::clamp(value, 0.0f, 2.0f);
                break;
        }
    }

    void controlChange(int cc, int value) {
        float norm = value / 127.0f;
        switch (cc) {
            case 1:   // Mod wheel -> K1 (F1 frequency)
                setParameter(PARAM_K1_INDEX, norm * 31.0f);
                break;
            case 70:  // K2 (F2 frequency)
                setParameter(PARAM_K2_INDEX, norm * 31.0f);
                break;
            case 71:  // K3 (F3 frequency)
                setParameter(PARAM_K3_INDEX, norm * 15.0f);
                break;
            case 74:  // Noise mode
                setParameter(PARAM_NOISE_MODE, norm > 0.5f ? 1.0f : 0.0f);
                break;
            case 75:  // Chirp type
                setParameter(PARAM_CHIRP_TYPE, norm > 0.5f ? 1.0f : 0.0f);
                break;
            case 76:  // Energy
                setParameter(PARAM_ENERGY_INDEX, norm * 14.0f);
                break;
            case 7:   // Volume
                volume_ = norm;
                break;
            case 10:  // Pan / stereo width
                stereoWidth_ = norm;
                break;
            case 77:  // Brightness
                brightness_ = norm * 2.0f;
                break;
        }
    }

    void pitchBend(float value) {
        // value: -1 to +1, maps to pitch period adjustment
        pitchBendFactor_ = powf(2.0f, value * 2.0f / 12.0f);
    }

    void programChange(int program) {
        currentPreset_ = std::clamp(program, 0, 7);
        // Apply to all active voices
        const PhonemePreset& preset = phoneme_presets[currentPreset_];
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].target_energy = energy_table[preset.energy_idx];
                voices_[i].noise_mode = preset.unvoiced;
                setKFromIndices(voices_[i], preset.k_indices);
                voices_[i].interp_count = 0;
                voices_[i].interp_period = 0;
            }
        }
    }

    // Direct K coefficient setting for formant control
    void setFormants(int k1_idx, int k2_idx, int k3_idx) {
        k1_idx = std::clamp(k1_idx, 0, 31);
        k2_idx = std::clamp(k2_idx, 0, 31);
        k3_idx = std::clamp(k3_idx, 0, 15);
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].target_k[0] = k1_table[k1_idx];
                voices_[i].target_k[1] = k2_table[k2_idx];
                voices_[i].target_k[2] = k3_table[k3_idx];
            }
        }
    }

    void setNoiseMode(bool noise) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].noise_mode = noise;
            }
        }
    }

    void setVolume(float vol) {
        volume_ = std::clamp(vol, 0.0f, 1.0f);
    }

    void setChirpType(int type) {
        chirpType_ = std::clamp(type, 0, 1);
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int i = 0; i < numSamples; i++) {
            float mixL = 0.0f;
            float mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                if (!voices_[v].active && voices_[v].current_energy == 0) continue;

                float sample = processVoice(voices_[v]);

                // Apply velocity
                sample *= voices_[v].velocity;

                // Stereo panning
                float pan = panPositions_[v] * stereoWidth_;
                float panR = (pan + 1.0f) * 0.5f;
                float panL = 1.0f - panR;
                mixL += sample * panL;
                mixR += sample * panR;
            }

            // Apply master volume and scale
            // TMS5220 output is 8-bit, so scale appropriately
            float scale = volume_ * 0.25f;
            outL[i] = mixL * scale;
            outR[i] = mixR * scale;
        }
    }

private:
    // ========================================================================
    // Core LPC synthesis (faithful to MAME tms5220.cpp)
    // ========================================================================

    /**
     * matrix_multiply - from MAME tms5220.cpp line 1287
     * Clamp a to 10-bit signed (-512..511), b to 15-bit signed (-16384..16383)
     * Result = (a * b) >> 9
     */
    static inline int32_t matrix_multiply(int32_t a, int32_t b) {
        // Clamp a to 10-bit signed range
        if (a > 511) a = 511;
        else if (a < -512) a = -512;

        // Clamp b to 15-bit signed range
        if (b > 16383) b = 16383;
        else if (b < -16384) b = -16384;

        return (a * b) >> 9;
    }

    /**
     * lattice_filter - from MAME tms5220.cpp line 1308
     * 10-stage lattice filter using current_k coefficients
     * Processes one sample through the filter cascade
     */
    void lattice_filter(TMS5220Voice& v) {
        // u[10] = matrix_multiply(energy, excitation << 6)
        v.u[10] = matrix_multiply(v.current_energy, v.excitation_data << 6);

        // Cascade through 10 stages (from MAME, order matters)
        v.u[9] = v.u[10] - matrix_multiply(v.current_k[9], v.x[9]);
        v.u[8] = v.u[9]  - matrix_multiply(v.current_k[8], v.x[8]);
        v.u[7] = v.u[8]  - matrix_multiply(v.current_k[7], v.x[7]);
        v.u[6] = v.u[7]  - matrix_multiply(v.current_k[6], v.x[6]);
        v.u[5] = v.u[6]  - matrix_multiply(v.current_k[5], v.x[5]);
        v.u[4] = v.u[5]  - matrix_multiply(v.current_k[4], v.x[4]);
        v.u[3] = v.u[4]  - matrix_multiply(v.current_k[3], v.x[3]);
        v.u[2] = v.u[3]  - matrix_multiply(v.current_k[2], v.x[2]);
        v.u[1] = v.u[2]  - matrix_multiply(v.current_k[1], v.x[1]);
        v.u[0] = v.u[1]  - matrix_multiply(v.current_k[0], v.x[0]);

        // Update x state variables
        v.x[9] = v.x[8] + matrix_multiply(v.current_k[8], v.u[8]);
        v.x[8] = v.x[7] + matrix_multiply(v.current_k[7], v.u[7]);
        v.x[7] = v.x[6] + matrix_multiply(v.current_k[6], v.u[6]);
        v.x[6] = v.x[5] + matrix_multiply(v.current_k[5], v.u[5]);
        v.x[5] = v.x[4] + matrix_multiply(v.current_k[4], v.u[4]);
        v.x[4] = v.x[3] + matrix_multiply(v.current_k[3], v.u[3]);
        v.x[3] = v.x[2] + matrix_multiply(v.current_k[2], v.u[2]);
        v.x[2] = v.x[1] + matrix_multiply(v.current_k[1], v.u[1]);
        v.x[1] = v.x[0] + matrix_multiply(v.current_k[0], v.u[0]);
        v.x[0] = v.u[0];
    }

    /**
     * clip_analog - from MAME tms5220.cpp line 1243
     * 14-bit to output range clipping
     */
    static inline float clip_analog(int32_t cliptemp) {
        // The MAME code clips to 8-bit DAC range
        // We normalize to float -1.0 to 1.0
        if (cliptemp > 2047) cliptemp = 2047;
        if (cliptemp < -2048) cliptemp = -2048;
        return cliptemp / 2048.0f;
    }

    /**
     * Generate one internal sample (at 8kHz) for a voice
     * Based on MAME tms5220.cpp process() function
     */
    float generateInternalSample(TMS5220Voice& v) {
        if (v.current_energy == 0 && !v.active) {
            return 0.0f;
        }

        // ----------------------------------------------------------------
        // Parameter interpolation at IP boundaries
        // ----------------------------------------------------------------
        if (v.interp_count == 0 && v.interp_period < 8) {
            int shift = interp_coeff[v.interp_period];

            if (shift > 0) {
                v.current_energy += (v.target_energy - v.current_energy) >> shift;
                v.current_pitch += (v.target_pitch - v.current_pitch) >> shift;
                for (int k = 0; k < 10; k++) {
                    v.current_k[k] += (v.target_k[k] - v.current_k[k]) >> shift;
                }
            }
            // IP 0 shift=0 means no interpolation (jump to target at frame end)
        }

        // ----------------------------------------------------------------
        // Excitation generation (from MAME process() function)
        // ----------------------------------------------------------------
        if (v.noise_mode || v.current_pitch == 0) {
            // Unvoiced: use LFSR noise
            // LFSR is updated 20 times per sample (from MAME subcycle logic)
            for (int sub = 0; sub < 20; sub++) {
                int bitout = ((v.RNG >> 12) ^ (v.RNG >> 3) ^ (v.RNG >> 2) ^ (v.RNG >> 0)) & 1;
                v.RNG = ((v.RNG << 1) | bitout) & 0x1FFF;
            }
            v.excitation_data = (v.RNG & 1) ? ~0x3F : 0x40;
        } else {
            // Voiced: use chirp table
            const int8_t* chirp = (chirpType_ == 0) ? chirp_original : chirp_later;
            int idx = (v.pitch_count >= 51) ? 51 : v.pitch_count;
            v.excitation_data = chirp[idx];

            // Advance pitch counter, apply pitch bend
            int effective_pitch = (int)(v.current_pitch / pitchBendFactor_);
            if (effective_pitch < 1) effective_pitch = 1;

            v.pitch_count++;
            if (v.pitch_count >= effective_pitch) {
                v.pitch_count = 0;
            }
        }

        // ----------------------------------------------------------------
        // Lattice filter
        // ----------------------------------------------------------------
        lattice_filter(v);

        // ----------------------------------------------------------------
        // Advance interpolation counter
        // ----------------------------------------------------------------
        v.interp_count++;
        if (v.interp_count >= SAMPLES_PER_IP) {
            v.interp_count = 0;
            v.interp_period++;
            if (v.interp_period >= 8) {
                v.interp_period = 0;
                // Frame boundary: if energy decayed to 0, deactivate
                if (v.target_energy == 0 && v.current_energy <= 1) {
                    v.active = false;
                    v.current_energy = 0;
                }
            }
        }

        // Output is u[0], clipped
        return clip_analog(v.u[0]);
    }

    /**
     * Process one output sample for a voice
     * Handles rate conversion from 8kHz internal to output sample rate
     */
    float processVoice(TMS5220Voice& v) {
        v.phase_acc += rateRatio_;

        float output = lastVoiceOutput_[&v - voices_];

        while (v.phase_acc >= 1.0) {
            v.phase_acc -= 1.0;
            output = generateInternalSample(v);
        }

        // Simple linear interpolation between internal samples
        float prev = lastVoiceOutput_[&v - voices_];
        float interp = prev + (output - prev) * (float)v.phase_acc;
        lastVoiceOutput_[&v - voices_] = output;

        return interp;
    }

    // ========================================================================
    // Voice allocation
    // ========================================================================

    int allocateVoice() {
        // Find free voice
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!voices_[i].active && voices_[i].current_energy == 0) {
                return i;
            }
        }
        // Steal oldest (lowest energy)
        int minIdx = 0;
        int32_t minEnergy = voices_[0].current_energy;
        for (int i = 1; i < NUM_VOICES; i++) {
            if (voices_[i].current_energy < minEnergy) {
                minEnergy = voices_[i].current_energy;
                minIdx = i;
            }
        }
        return minIdx;
    }

    void setKFromIndices(TMS5220Voice& v, const int* indices) {
        v.target_k[0] = k1_table[std::clamp(indices[0], 0, 31)];
        v.target_k[1] = k2_table[std::clamp(indices[1], 0, 31)];
        v.target_k[2] = k3_table[std::clamp(indices[2], 0, 15)];
        v.target_k[3] = k4_table[std::clamp(indices[3], 0, 15)];
        v.target_k[4] = k5_table[std::clamp(indices[4], 0, 15)];
        v.target_k[5] = k6_table[std::clamp(indices[5], 0, 15)];
        v.target_k[6] = k7_table[std::clamp(indices[6], 0, 15)];
        v.target_k[7] = k8_table[std::clamp(indices[7], 0, 7)];
        v.target_k[8] = k9_table[std::clamp(indices[8], 0, 7)];
        v.target_k[9] = k10_table[std::clamp(indices[9], 0, 7)];

        // Apply brightness scaling to higher K coefficients
        if (brightness_ != 1.0f) {
            for (int k = 3; k < 10; k++) {
                v.target_k[k] = (int32_t)(v.target_k[k] * brightness_);
            }
        }
    }

    // ========================================================================
    // Member data
    // ========================================================================

    TMS5220Voice voices_[NUM_VOICES];
    float lastVoiceOutput_[NUM_VOICES] = {};
    float sampleRate_ = 44100.0f;
    double rateRatio_ = 0.0;
    float volume_ = 0.8f;
    int chirpType_ = 1;
    float stereoWidth_ = 0.5f;
    float brightness_ = 1.0f;
    int currentPreset_ = 0;
    float pitchBendFactor_ = 1.0f;
    float panPositions_[NUM_VOICES] = {};
    float lastOutputL_ = 0.0f;
    float lastOutputR_ = 0.0f;
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(TMS5220Module) {
    emscripten::class_<TMS5220Synth>("TMS5220Synth")
        .constructor<>()
        .function("initialize", &TMS5220Synth::initialize)
        .function("noteOn", &TMS5220Synth::noteOn)
        .function("noteOff", &TMS5220Synth::noteOff)
        .function("allNotesOff", &TMS5220Synth::allNotesOff)
        .function("setParameter", &TMS5220Synth::setParameter)
        .function("controlChange", &TMS5220Synth::controlChange)
        .function("pitchBend", &TMS5220Synth::pitchBend)
        .function("programChange", &TMS5220Synth::programChange)
        .function("setFormants", &TMS5220Synth::setFormants)
        .function("setNoiseMode", &TMS5220Synth::setNoiseMode)
        .function("setVolume", &TMS5220Synth::setVolume)
        .function("setChirpType", &TMS5220Synth::setChirpType)
        .function("process", &TMS5220Synth::process);
}

} // namespace devilbox
