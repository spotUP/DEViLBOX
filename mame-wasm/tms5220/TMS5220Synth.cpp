/**
 * TMS5220 - LPC Speech Synthesizer (Speak & Spell) for DEViLBOX
 *
 * Faithful port of MAME's tms5110.cpp emulation by Frank Palazzolo,
 * Jarek Burczynski, Aaron Giles, Jonathan Gevaryahu, Couriersud.
 *
 * Three operating modes:
 *
 * 1. ROM SPEECH MODE (MAME-accurate):
 *    Loads VSM ROM data into WASM memory, speaks words by byte address.
 *    Uses MAME's exact state machine: subcycle/PC/IP timing, parse_frame(),
 *    parameter interpolation with inhibit logic, chirp/noise excitation,
 *    10-pole lattice filter, and clip_analog output.
 *
 * 2. FRAME BUFFER MODE (MAME-accurate, phoneme TTS):
 *    Pre-packed LPC frame indices fed from TypeScript (SAM phoneme pipeline).
 *    Uses the same MAME state machine as ROM mode but reads frames from a
 *    flat buffer instead of ROM bits.
 *
 * 3. MIDI MODE (interactive):
 *    4-voice polyphonic LPC synth with phoneme presets for real-time playing.
 *    Uses simplified interpolation.
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
// Using TMC0281 / TMS5100 coefficient set (original Speak & Spell 1978-79)
// Source: T0280B_0281A_coeff, verified against decap
// ============================================================================

static constexpr int NUM_K = 10;
static constexpr int ENERGY_BITS = 4;
static constexpr int PITCH_BITS = 5;
static constexpr int KBITS[NUM_K] = { 5, 5, 4, 4, 4, 4, 4, 3, 3, 3 };

// Energy table (TI_0280_PATENT_ENERGY) - 16 entries
static const uint16_t energy_table[16] = {
    0, 0, 1, 1, 2, 3, 5, 7, 10, 15, 21, 30, 43, 61, 86, 0
};

// Pitch table (TI_0280_2801_PATENT_PITCH) - 32 entries for TMC0281 (5-bit pitch)
static const uint16_t pitch_table[32] = {
    0,  41,  43,  45,  47,  49,  51,  53,
    55,  58,  60,  63,  66,  70,  73,  76,
    79,  83,  87,  90,  94,  99, 103, 107,
   112, 118, 123, 129, 134, 140, 147, 153
};

// K coefficient tables (TI_0280_PATENT_LPC)
static const int ktable[NUM_K][32] = {
    // K1: 32 entries (5-bit)
    { -501, -497, -493, -488, -480, -471, -460, -446,
      -427, -405, -378, -344, -305, -259, -206, -148,
       -86,  -21,   45,  110,  171,  227,  277,  320,
       357,  388,  413,  434,  451,  464,  474,  498 },
    // K2: 32 entries (5-bit)
    { -349, -328, -305, -280, -252, -223, -192, -158,
      -124,  -88,  -51,  -14,   23,   60,   97,  133,
       167,  199,  230,  259,  286,  310,  333,  354,
       372,  389,  404,  417,  429,  439,  449,  506 },
    // K3: 16 entries (4-bit), padded to 32
    { -397, -365, -327, -282, -229, -170, -104,  -36,
        35,  104,  169,  228,  281,  326,  364,  396,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K4: 16 entries (4-bit)
    { -369, -334, -293, -245, -191, -131,  -67,   -1,
        64,  128,  188,  243,  291,  332,  367,  397,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K5: 16 entries (4-bit)
    { -319, -286, -250, -211, -168, -122,  -74,  -25,
        24,   73,  121,  167,  210,  249,  285,  318,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K6: 16 entries (4-bit)
    { -290, -252, -209, -163, -114,  -62,   -9,   44,
        97,  147,  194,  238,  278,  313,  344,  371,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K7: 16 entries (4-bit)
    { -291, -256, -216, -174, -128,  -80,  -31,   19,
        69,  117,  163,  206,  246,  283,  316,  345,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K8: 8 entries (3-bit)
    { -218, -133,  -38,   59,  152,  235,  305,  361,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K9: 8 entries (3-bit)
    { -226, -157,  -82,   -3,   76,  151,  220,  280,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
    // K10: 8 entries (3-bit)
    { -179, -122,  -61,    1,   62,  123,  179,  231,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0,
         0,    0,    0,    0,    0,    0,    0,    0 },
};

// Chirp table - original Speak & Spell (TI_0280_PATENT_CHIRP)
static const int16_t chirptable[52] = {
    0x00, 0x2a, (int16_t)(int8_t)0xd4, 0x32,
    (int16_t)(int8_t)0xb2, 0x12, 0x25, 0x14,
    0x02, (int16_t)(int8_t)0xe1, (int16_t)(int8_t)0xc5, 0x02,
    0x5f, 0x5a, 0x05, 0x0f,
    0x26, (int16_t)(int8_t)0xfc, (int16_t)(int8_t)0xa5, (int16_t)(int8_t)0xa5,
    (int16_t)(int8_t)0xd6, (int16_t)(int8_t)0xdd, (int16_t)(int8_t)0xdc, (int16_t)(int8_t)0xfc,
    0x25, 0x2b, 0x22, 0x21,
    0x0f, (int16_t)(int8_t)0xff, (int16_t)(int8_t)0xf8, (int16_t)(int8_t)0xee,
    (int16_t)(int8_t)0xed, (int16_t)(int8_t)0xef, (int16_t)(int8_t)0xf7, (int16_t)(int8_t)0xf6,
    (int16_t)(int8_t)0xfa, 0x00, 0x03, 0x02,
    0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
};

// Interpolation shift coefficients (from patent: { 0, 3, 3, 3, 2, 2, 1, 1 })
static const int8_t interp_coeff[8] = { 0, 3, 3, 3, 2, 2, 1, 1 };

// ============================================================================
// Static helpers (from MAME tms5110.cpp)
// ============================================================================

/**
 * matrix_multiply - from MAME tms5110.cpp
 * a: K coefficient, clamped to 10-bit signed (-512..511)
 * b: running result, clamped to 14-bit signed (-16384..16383)
 * Result = (a * b) >> 9
 */
static inline int32_t matrix_multiply(int32_t a, int32_t b) {
    while (a > 511) a -= 1024;
    while (a < -512) a += 1024;
    while (b > 16383) b -= 32768;
    while (b < -16384) b += 32768;
    return (a * b) >> 9;
}

/**
 * clip_analog - from MAME tms5110.cpp
 * Clips 14-bit lattice output to 12-bit range, upshifts to 16-bit
 */
static inline int16_t clip_analog(int16_t cliptemp) {
    if (cliptemp > 2047) cliptemp = 2047;
    else if (cliptemp < -2048) cliptemp = -2048;
    cliptemp &= ~0xF;
    return (cliptemp << 4) | ((cliptemp & 0x7F0) >> 3) | ((cliptemp & 0x400) >> 10);
}

// ============================================================================
// Parameter IDs (for MIDI mode)
// ============================================================================
enum TMS5220ParamId {
    PARAM_VOLUME = 0,
    PARAM_CHIRP_TYPE = 1,
    PARAM_K1_INDEX = 2,
    PARAM_K2_INDEX = 3,
    PARAM_K3_INDEX = 4,
    PARAM_ENERGY_INDEX = 5,
    PARAM_PITCH_INDEX = 6,
    PARAM_NOISE_MODE = 7,
    PARAM_STEREO_WIDTH = 8,
    PARAM_BRIGHTNESS = 9,
    PARAM_K4_INDEX = 10,
    PARAM_K5_INDEX = 11,
    PARAM_K6_INDEX = 12,
    PARAM_K7_INDEX = 13,
    PARAM_K8_INDEX = 14,
    PARAM_K9_INDEX = 15,
    PARAM_K10_INDEX = 16,
};

// ============================================================================
// MIDI Voice (for interactive phoneme mode)
// ============================================================================
struct MIDIVoice {
    int32_t current_energy, current_pitch, current_k[10];
    int32_t target_energy, target_pitch, target_k[10];
    int32_t u[11], x[10];
    int32_t previous_energy;
    uint16_t RNG;
    int32_t excitation_data;
    int32_t pitch_count;
    int32_t interp_count, interp_period;
    bool active;
    int32_t midi_note;
    float velocity;
    bool noise_mode;
    double phase_acc;

    void reset() {
        current_energy = target_energy = previous_energy = 0;
        current_pitch = target_pitch = 0;
        memset(current_k, 0, sizeof(current_k));
        memset(target_k, 0, sizeof(target_k));
        memset(u, 0, sizeof(u));
        memset(x, 0, sizeof(x));
        RNG = 0x1FFF;
        excitation_data = 0;
        pitch_count = 0;
        interp_count = interp_period = 0;
        active = false;
        midi_note = -1;
        velocity = 0.0f;
        noise_mode = false;
        phase_acc = 0.0;
    }
};

// Phoneme presets
struct PhonemePreset {
    int energy_idx, pitch_idx;
    int k_indices[10];
    bool unvoiced;
};

static const PhonemePreset phoneme_presets[8] = {
    { 10, 30, { 20, 10, 8, 8, 8, 8, 8, 4, 4, 4 }, false }, // AH
    { 10, 31, { 12, 28, 10, 8, 8, 8, 8, 4, 4, 4 }, false }, // EE
    { 10, 30, { 16, 24, 9, 8, 8, 8, 8, 4, 4, 4 }, false },  // IH
    { 10, 28, { 18, 8, 8, 8, 8, 8, 8, 4, 4, 4 }, false },   // OH
    { 10, 26, { 14, 6, 7, 8, 8, 8, 8, 4, 4, 4 }, false },   // OO
    { 10, 30, { 24, 18, 10, 8, 8, 8, 8, 4, 4, 4 }, false }, // AE
    { 10, 28, { 18, 14, 8, 8, 8, 8, 8, 4, 4, 4 }, false },  // UH
    { 8,   0, { 16, 20, 12, 10, 8, 8, 8, 4, 4, 4 }, true },  // SH
};

// ============================================================================
// Main TMS5220 Synth Class
// ============================================================================
class TMS5220Synth {
public:
    static constexpr int NUM_VOICES = 4;
    static constexpr int INTERNAL_RATE = 8000;
    static constexpr int FRAME_SIZE = 200;      // 200 samples per frame at 8kHz
    static constexpr int SAMPLES_PER_IP = 25;

    TMS5220Synth() {
        rom_data_ = nullptr;
        rom_size_ = 0;
        frame_buffer_data_ = nullptr;
        frame_buffer_count_ = 0;
        frame_buffer_pos_ = 0;
        frame_buffer_mode_ = false;
        for (int i = 0; i < NUM_VOICES; i++) voices_[i].reset();
        resetSpeechState();
    }

    ~TMS5220Synth() {
        // ROM data is managed by JavaScript (malloc/free), don't free here
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        rateRatio_ = (double)INTERNAL_RATE / sampleRate;
        volume_ = 0.8f;
        stereoWidth_ = 0.5f;
        brightness_ = 1.0f;
        currentPreset_ = 0;
        pitchBendFactor_ = 1.0f;
        speechPhaseAcc_ = 0.0;
        lastSpeechSample_ = 0;

        for (int i = 0; i < NUM_VOICES; i++) voices_[i].reset();
        resetSpeechState();

        panPositions_[0] = -0.3f;
        panPositions_[1] = 0.3f;
        panPositions_[2] = -0.15f;
        panPositions_[3] = 0.15f;
    }

    // ========================================================================
    // ROM Management
    // ========================================================================

    /** Load VSM ROM data into the speech engine */
    void loadROM(uintptr_t dataPtr, int size) {
        rom_data_ = reinterpret_cast<uint8_t*>(dataPtr);
        rom_size_ = size;
    }

    /** Start speaking from a byte address in the ROM */
    void speakAtByte(int byteAddr) {
        if (!rom_data_ || byteAddr < 0 || byteAddr >= rom_size_) return;

        // Set ROM bit position
        speech_rom_bitnum_ = byteAddr * 8;

        // SPEAK command initialization (from MAME CMD_SPEAK)
        SPEN_ = true;
        TALK_ = true;      // FAST_START_HACK
        TALKD_ = true;     // Start immediately (skip waiting for RESETL4)

        // Zero all parameters for clean start
        zpar_ = true;
        uv_zpar_ = true;
        OLDE_ = 1;         // 'silence/zpar' frames have zero energy
        OLDP_ = 1;         // 'silence/zpar' frames have zero pitch

        // Reset state machine
        subc_reload_ = 1;  // SPEAK mode (not SPKSLOW)
        subcycle_ = subc_reload_;
        PC_ = 0;
        IP_ = 0;
        inhibit_ = true;
        pitch_count_ = 0;
        pitch_zero_ = false;

        // Reset filter/excitation state
        memset(u_, 0, sizeof(u_));
        memset(x_, 0, sizeof(x_));
        current_energy_ = 0;
        previous_energy_ = 0;
        current_pitch_ = 0;
        memset(current_k_, 0, sizeof(current_k_));
        RNG_ = 0x1FFF;
        excitation_data_ = 0;

        // Reset frame indices
        new_frame_energy_idx_ = 0;
        new_frame_pitch_idx_ = 0;
        memset(new_frame_k_idx_, 0, sizeof(new_frame_k_idx_));

        // Phase accumulator for rate conversion
        speechPhaseAcc_ = 0.0;
        lastSpeechSample_ = 0;

        speech_active_ = true;
    }

    /** Stop speaking */
    void stopSpeaking() {
        speech_active_ = false;
        SPEN_ = false;
        TALK_ = false;
        TALKD_ = false;
        frame_buffer_mode_ = false;
    }

    /** Check if currently speaking */
    bool isSpeaking() const {
        return speech_active_;
    }

    // ========================================================================
    // Frame Buffer API (phoneme TTS through MAME engine)
    // ========================================================================

    /** Load a frame buffer into the speech engine.
     *  Each frame is 12 bytes: [energy_idx, pitch_idx, k0, k1, ..., k9]
     *  The engine will play these using the exact MAME state machine
     *  (interpolation, excitation, lattice filter, clip_analog). */
    void loadFrameBuffer(uintptr_t dataPtr, int numFrames) {
        frame_buffer_data_ = reinterpret_cast<const uint8_t*>(dataPtr);
        frame_buffer_count_ = numFrames;
        frame_buffer_pos_ = 0;
    }

    /** Start speaking from the loaded frame buffer */
    void speakFrameBuffer() {
        if (!frame_buffer_data_ || frame_buffer_count_ <= 0) return;

        frame_buffer_pos_ = 0;
        frame_buffer_mode_ = true;

        // Same state machine initialization as speakAtByte
        SPEN_ = true;
        TALK_ = true;
        TALKD_ = true;

        zpar_ = true;
        uv_zpar_ = true;
        OLDE_ = 1;
        OLDP_ = 1;

        subc_reload_ = 1;
        subcycle_ = subc_reload_;
        PC_ = 0;
        IP_ = 0;
        inhibit_ = true;
        pitch_count_ = 0;
        pitch_zero_ = false;

        memset(u_, 0, sizeof(u_));
        memset(x_, 0, sizeof(x_));
        current_energy_ = 0;
        previous_energy_ = 0;
        current_pitch_ = 0;
        memset(current_k_, 0, sizeof(current_k_));
        RNG_ = 0x1FFF;
        excitation_data_ = 0;

        new_frame_energy_idx_ = 0;
        new_frame_pitch_idx_ = 0;
        memset(new_frame_k_idx_, 0, sizeof(new_frame_k_idx_));

        speechPhaseAcc_ = 0.0;
        lastSpeechSample_ = 0;

        speech_active_ = true;
    }

    // ========================================================================
    // MIDI Interface
    // ========================================================================

    void noteOn(int note, int velocity) {
        if (velocity == 0) { noteOff(note); return; }
        if (speech_active_) return; // Don't allow MIDI during speech

        int vi = allocateVoice();
        MIDIVoice& v = voices_[vi];
        v.reset();
        v.active = true;
        v.midi_note = note;
        v.velocity = velocity / 127.0f;

        float freq = 440.0f * powf(2.0f, (note - 69) / 12.0f);
        int pitch_period = (int)(INTERNAL_RATE / freq);
        pitch_period = std::clamp(pitch_period, 15, 159);

        const PhonemePreset& preset = phoneme_presets[currentPreset_];
        v.target_energy = energy_table[preset.energy_idx];
        v.target_pitch = pitch_period;
        v.noise_mode = preset.unvoiced;
        setKFromIndices(v, preset.k_indices);

        v.current_energy = 0;
        v.current_pitch = v.target_pitch;
        memcpy(v.current_k, v.target_k, sizeof(v.current_k));
        v.RNG = 0x1FFF;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midi_note == note) {
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
        stopSpeaking();
    }

    void activateSpeechVoice() {
        if (speech_active_) return;
        int vi = allocateVoice();
        MIDIVoice& v = voices_[vi];
        v.reset();
        v.active = true;
        v.midi_note = -1;
        v.velocity = 1.0f;
        volume_ = 1.0f;

        v.target_energy = energy_table[1];
        v.target_pitch = pitch_table[14];
        v.noise_mode = false;

        // Neutral vowel coefficients
        v.target_k[0] = ktable[0][16];
        v.target_k[1] = ktable[1][16];
        for (int k = 2; k < 10; k++) {
            int mid = (1 << (KBITS[k] - 1));
            v.target_k[k] = ktable[k][mid];
        }

        v.current_energy = v.target_energy;
        v.current_pitch = v.target_pitch;
        v.previous_energy = v.current_energy;
        memcpy(v.current_k, v.target_k, sizeof(v.current_k));
        v.RNG = 0x1FFF;
    }

    // ========================================================================
    // Parameter Control (MIDI mode)
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME: volume_ = std::clamp(value, 0.0f, 1.0f); break;
            case PARAM_CHIRP_TYPE: /* chirp type not used for speech mode */ break;
            case PARAM_K1_INDEX:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_k[0] = ktable[0][std::clamp((int)value, 0, 31)];
                break;
            case PARAM_K2_INDEX:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_k[1] = ktable[1][std::clamp((int)value, 0, 31)];
                break;
            case PARAM_K3_INDEX:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_k[2] = ktable[2][std::clamp((int)value, 0, 15)];
                break;
            case PARAM_ENERGY_INDEX:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_energy = energy_table[std::clamp((int)value, 0, 15)];
                break;
            case PARAM_PITCH_INDEX:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_pitch = pitch_table[std::clamp((int)value, 0, 31)];
                break;
            case PARAM_NOISE_MODE:
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active) voices_[i].noise_mode = (value > 0.5f);
                break;
            case PARAM_STEREO_WIDTH: stereoWidth_ = std::clamp(value, 0.0f, 1.0f); break;
            case PARAM_BRIGHTNESS: brightness_ = std::clamp(value, 0.0f, 2.0f); break;
            case PARAM_K4_INDEX: case PARAM_K5_INDEX: case PARAM_K6_INDEX:
            case PARAM_K7_INDEX: case PARAM_K8_INDEX: case PARAM_K9_INDEX:
            case PARAM_K10_INDEX: {
                int kIdx = paramId - PARAM_K4_INDEX + 3; // K4=3, K5=4, ..., K10=9
                int maxVal = (1 << KBITS[kIdx]) - 1;
                for (int i = 0; i < NUM_VOICES; i++)
                    if (voices_[i].active)
                        voices_[i].target_k[kIdx] = ktable[kIdx][std::clamp((int)value, 0, maxVal)];
                break;
            }
        }
    }

    void controlChange(int cc, int value) {
        float norm = value / 127.0f;
        switch (cc) {
            case 1:  setParameter(PARAM_K1_INDEX, norm * 31.0f); break;
            case 70: setParameter(PARAM_K2_INDEX, norm * 31.0f); break;
            case 71: setParameter(PARAM_K3_INDEX, norm * 15.0f); break;
            case 74: setParameter(PARAM_NOISE_MODE, norm > 0.5f ? 1.0f : 0.0f); break;
            case 76: setParameter(PARAM_ENERGY_INDEX, norm * 14.0f); break;
            case 7:  volume_ = norm; break;
            case 10: stereoWidth_ = norm; break;
            case 77: brightness_ = norm * 2.0f; break;
        }
    }

    void pitchBend(float value) {
        pitchBendFactor_ = powf(2.0f, value * 2.0f / 12.0f);
    }

    void programChange(int program) {
        currentPreset_ = std::clamp(program, 0, 7);
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

    void setFormants(int k1_idx, int k2_idx, int k3_idx) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].target_k[0] = ktable[0][std::clamp(k1_idx, 0, 31)];
                voices_[i].target_k[1] = ktable[1][std::clamp(k2_idx, 0, 31)];
                voices_[i].target_k[2] = ktable[2][std::clamp(k3_idx, 0, 15)];
            }
        }
    }

    /** Set a complete LPC frame atomically (for TS-driven phoneme TTS) */
    void setLPCFrame(int energy_idx, int pitch_idx, int unvoiced,
                     int k1, int k2, int k3, int k4, int k5,
                     int k6, int k7, int k8, int k9, int k10) {
        int kIdx[10] = { k1, k2, k3, k4, k5, k6, k7, k8, k9, k10 };
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].target_energy = energy_table[std::clamp(energy_idx, 0, 15)];
                voices_[i].target_pitch = pitch_table[std::clamp(pitch_idx, 0, 31)];
                voices_[i].noise_mode = (unvoiced != 0);
                for (int k = 0; k < 10; k++) {
                    int maxVal = (1 << KBITS[k]) - 1;
                    voices_[i].target_k[k] = ktable[k][std::clamp(kIdx[k], 0, maxVal)];
                }
                voices_[i].interp_count = 0;
                voices_[i].interp_period = 0;
            }
        }
    }

    void setNoiseMode(bool noise) {
        for (int i = 0; i < NUM_VOICES; i++)
            if (voices_[i].active) voices_[i].noise_mode = noise;
    }

    void setVolume(float vol) { volume_ = std::clamp(vol, 0.0f, 1.0f); }
    void setChirpType(int type) { /* only original chirp supported for now */ }

    // ========================================================================
    // Audio Processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        if (speech_active_) {
            // ROM speech mode: MAME-accurate mono output
            for (int i = 0; i < numSamples; i++) {
                speechPhaseAcc_ += rateRatio_;
                float sample = lastSpeechSample_;

                while (speechPhaseAcc_ >= 1.0) {
                    speechPhaseAcc_ -= 1.0;
                    sample = generateSpeechSample();
                }

                // Simple interpolation
                float interp = lastSpeechSample_ + (sample - lastSpeechSample_) * (float)speechPhaseAcc_;
                lastSpeechSample_ = sample;

                float out = interp * volume_;
                outL[i] = out;
                outR[i] = out;
            }
        } else {
            // MIDI voice mode: polyphonic stereo output
            for (int i = 0; i < numSamples; i++) {
                float mixL = 0.0f, mixR = 0.0f;

                for (int v = 0; v < NUM_VOICES; v++) {
                    if (!voices_[v].active && voices_[v].current_energy == 0) continue;
                    float sample = processMIDIVoice(voices_[v]);
                    sample *= voices_[v].velocity;
                    float pan = panPositions_[v] * stereoWidth_;
                    float panR = (pan + 1.0f) * 0.5f;
                    mixL += sample * (1.0f - panR);
                    mixR += sample * panR;
                }

                outL[i] = mixL * volume_;
                outR[i] = mixR * volume_;
            }
        }
    }

private:
    // ========================================================================
    // MAME-Accurate Speech Engine
    // ========================================================================

    /** Read N bits from VSM ROM (LSB first from each byte, MSB first in result).
     *  Exactly matches MAME's read_bits() + new_int_read() via TMS6100 */
    int readBits(int count) {
        int val = 0;
        for (int i = 0; i < count; i++) {
            if (speech_rom_bitnum_ < rom_size_ * 8) {
                int byteIdx = speech_rom_bitnum_ / 8;
                int bitIdx = speech_rom_bitnum_ % 8;
                int bit = (rom_data_[byteIdx] >> bitIdx) & 1; // LSB first
                val = (val << 1) | bit; // First bit read → MSB of result
            }
            speech_rom_bitnum_++;
        }
        return val;
    }

    /** Parse a new frame from the ROM bitstream (from MAME tms5110.cpp:915) */
    void parseFrame() {
        // Clear zpar flags (we're parsing a real frame now)
        uv_zpar_ = false;
        zpar_ = false;

        // Read energy index
        new_frame_energy_idx_ = readBits(ENERGY_BITS);

        // Energy 0 (silence) or 15 (stop): done
        if (new_frame_energy_idx_ == 0 || new_frame_energy_idx_ == 15)
            return;

        // Read repeat flag
        int rep_flag = readBits(1);

        // Read pitch
        new_frame_pitch_idx_ = readBits(PITCH_BITS);

        // If unvoiced, zero K5-K10
        uv_zpar_ = (new_frame_pitch_idx_ == 0);

        // If repeat frame, reuse old K coefficients
        if (rep_flag)
            return;

        // Read K1-K4
        for (int i = 0; i < 4; i++)
            new_frame_k_idx_[i] = readBits(KBITS[i]);

        // If unvoiced (pitch=0), only K1-K4 are present
        if (new_frame_pitch_idx_ == 0)
            return;

        // Read K5-K10
        for (int i = 4; i < NUM_K; i++)
            new_frame_k_idx_[i] = readBits(KBITS[i]);
    }

    /** Parse a new frame from the pre-packed frame buffer (phoneme TTS).
     *  Each frame is 12 bytes: [energy_idx, pitch_idx, k0..k9].
     *  Uses same logic as parseFrame() but reads from buffer instead of ROM bits. */
    void parseFrameFromBuffer() {
        if (frame_buffer_pos_ >= frame_buffer_count_) {
            // End of buffer: emit stop frame
            new_frame_energy_idx_ = 0x0F;
            return;
        }

        uv_zpar_ = false;
        zpar_ = false;

        const uint8_t* frame = frame_buffer_data_ + (frame_buffer_pos_ * 12);
        frame_buffer_pos_++;

        // Clamp indices to valid table ranges (buffer bytes are uint8_t 0-255,
        // but tables are smaller: energy[16], pitch[32], ktable[][32])
        new_frame_energy_idx_ = std::min((int)frame[0], 15);

        if (new_frame_energy_idx_ == 0 || new_frame_energy_idx_ == 15)
            return;

        new_frame_pitch_idx_ = std::min((int)frame[1], 31);
        uv_zpar_ = (new_frame_pitch_idx_ == 0);

        // Always read all K indices from buffer (no repeat frames)
        for (int i = 0; i < NUM_K; i++) {
            int maxVal = (1 << KBITS[i]) - 1;
            new_frame_k_idx_[i] = std::min((int)frame[2 + i], maxVal);
        }
    }

    /** Lattice filter (from MAME tms5110.cpp:660)
     *  Uses m_previous_energy, NOT m_current_energy */
    int32_t latticeFilter() {
        u_[10] = matrix_multiply(previous_energy_, excitation_data_ << 6);
        u_[9] = u_[10] - matrix_multiply(current_k_[9], x_[9]);
        u_[8] = u_[9]  - matrix_multiply(current_k_[8], x_[8]);
        u_[7] = u_[8]  - matrix_multiply(current_k_[7], x_[7]);
        u_[6] = u_[7]  - matrix_multiply(current_k_[6], x_[6]);
        u_[5] = u_[6]  - matrix_multiply(current_k_[5], x_[5]);
        u_[4] = u_[5]  - matrix_multiply(current_k_[4], x_[4]);
        u_[3] = u_[4]  - matrix_multiply(current_k_[3], x_[3]);
        u_[2] = u_[3]  - matrix_multiply(current_k_[2], x_[2]);
        u_[1] = u_[2]  - matrix_multiply(current_k_[1], x_[1]);
        u_[0] = u_[1]  - matrix_multiply(current_k_[0], x_[0]);

        x_[9] = x_[8] + matrix_multiply(current_k_[8], u_[8]);
        x_[8] = x_[7] + matrix_multiply(current_k_[7], u_[7]);
        x_[7] = x_[6] + matrix_multiply(current_k_[6], u_[6]);
        x_[6] = x_[5] + matrix_multiply(current_k_[5], u_[5]);
        x_[5] = x_[4] + matrix_multiply(current_k_[4], u_[4]);
        x_[4] = x_[3] + matrix_multiply(current_k_[3], u_[3]);
        x_[3] = x_[2] + matrix_multiply(current_k_[2], u_[2]);
        x_[2] = x_[1] + matrix_multiply(current_k_[1], u_[1]);
        x_[1] = x_[0] + matrix_multiply(current_k_[0], u_[0]);
        x_[0] = u_[0];

        previous_energy_ = current_energy_;
        return u_[0];
    }

    /** Generate one internal speech sample at 8kHz (from MAME process()) */
    float generateSpeechSample() {
        if (!TALKD_) {
            // Not speaking: advance state machine but output silence
            advanceCounters();
            // Check if TALK was activated and needs TALKD latch
            if (subcycle_ == subc_reload_ && PC_ == 0 && (IP_ & 7) == 0) {
                // Just after a RESETL4 where TALKD might have been latched
            }
            return 0.0f;
        }

        // === New frame loading at IP=0, PC=12, Sub=1 ===
        if (IP_ == 0 && PC_ == 12 && subcycle_ == 1) {
            if (frame_buffer_mode_)
                parseFrameFromBuffer();
            else
                parseFrame();

            // Stop frame: clear TALK and SPEN
            if (new_frame_energy_idx_ == 0x0F) {
                TALK_ = false;
                SPEN_ = false;
            }

            // Determine interpolation inhibit
            bool old_unvoiced = (OLDP_ == 1);
            bool new_unvoiced = (new_frame_pitch_idx_ == 0);
            bool old_silence = (OLDE_ == 1);
            bool new_silence = (new_frame_energy_idx_ == 0);

            if ((!old_unvoiced && new_unvoiced) ||
                (old_unvoiced && !new_unvoiced) ||
                (old_silence && !new_silence)) {
                inhibit_ = true;
            } else {
                inhibit_ = false;
            }
        } else {
            // === Parameter interpolation (not a new frame load) ===
            bool inhibit_state = inhibit_ && (IP_ != 0);

            if (subcycle_ == 2) {
                int shift = interp_coeff[IP_];
                switch (PC_) {
                    case 0:
                        if (IP_ == 0) pitch_zero_ = false;
                        current_energy_ = (current_energy_ +
                            (((int32_t)(energy_table[new_frame_energy_idx_]) - current_energy_) *
                             (1 - (int)inhibit_state) >> shift)) * (1 - (int)zpar_);
                        break;
                    case 1:
                        current_pitch_ = (current_pitch_ +
                            (((int32_t)(pitch_table[new_frame_pitch_idx_]) - current_pitch_) *
                             (1 - (int)inhibit_state) >> shift)) * (1 - (int)zpar_);
                        break;
                    case 2: case 3: case 4: case 5: case 6: case 7:
                    case 8: case 9: case 10: case 11: {
                        int ki = PC_ - 2;
                        bool zp = (ki < 4) ? zpar_ : uv_zpar_;
                        current_k_[ki] = (current_k_[ki] +
                            (((int32_t)(ktable[ki][new_frame_k_idx_[ki]]) - current_k_[ki]) *
                             (1 - (int)inhibit_state) >> shift)) * (1 - (int)zp);
                        break;
                    }
                }
            }
        }

        // === Excitation generation ===
        // Uses OLD_FRAME_UNVOICED_FLAG (OLDP), not current frame
        if (OLDP_ == 1) {
            // Unvoiced: use LFSR noise
            excitation_data_ = (RNG_ & 1) ? (int32_t)~0x3F : 0x40;
        } else {
            // Voiced: use chirp table
            if (pitch_count_ >= 51)
                excitation_data_ = (int8_t)chirptable[51];
            else
                excitation_data_ = (int8_t)chirptable[pitch_count_];
        }

        // === Update LFSR 20 times per sample ===
        for (int j = 0; j < 20; j++) {
            int bitout = ((RNG_ >> 12) ^ (RNG_ >> 3) ^ (RNG_ >> 2) ^ (RNG_ >> 0)) & 1;
            RNG_ = ((RNG_ << 1) | bitout) & 0x1FFF;
        }

        // === Lattice filter ===
        int32_t this_sample = latticeFilter();

        // === 14-bit wrapping ===
        while (this_sample > 16383) this_sample -= 32768;
        while (this_sample < -16384) this_sample += 32768;

        // === clip_analog output ===
        int16_t clipped = clip_analog((int16_t)this_sample);

        // === Advance counters ===
        advanceCounters();

        // === Pitch counter ===
        pitch_count_++;
        if (pitch_count_ >= current_pitch_ || pitch_zero_)
            pitch_count_ = 0;
        pitch_count_ &= 0x1FF;

        // Normalize to float (-1.0 to 1.0)
        return clipped / 32768.0f;
    }

    /** Advance the subcycle/PC/IP state machine (from MAME process())
     *  MAME has separate counter logic for TALKD=true vs TALKD=false. */
    void advanceCounters() {
        subcycle_++;
        if (subcycle_ == 2 && PC_ == 12) {
            // RESETF3
            if (TALKD_) {
                // Only update these when actually speaking
                if (IP_ == 7 && inhibit_) pitch_zero_ = true;
                if (IP_ == 7) {
                    // RESETL4: latch OLDE and OLDP from new frame flags
                    OLDE_ = (new_frame_energy_idx_ == 0) ? 1 : 0;
                    OLDP_ = (new_frame_pitch_idx_ == 0) ? 1 : 0;
                    // Latch TALKD from TALK
                    TALKD_ = TALK_;
                    if (!TALK_ && SPEN_) TALK_ = true;
                }
            } else {
                // Not speaking: only latch TALKD at RESETL4
                if (IP_ == 7) {
                    TALKD_ = TALK_;
                    if (!TALK_ && SPEN_) TALK_ = true;
                }
            }
            // Check if speech has ended
            if (!TALKD_ && !TALK_ && !SPEN_) {
                speech_active_ = false;
            }
            subcycle_ = subc_reload_;
            PC_ = 0;
            IP_ = (IP_ + 1) & 7;
        } else if (subcycle_ == 3) {
            subcycle_ = subc_reload_;
            PC_++;
        }
    }

    void resetSpeechState() {
        speech_active_ = false;
        SPEN_ = false;
        TALK_ = false;
        TALKD_ = false;
        OLDE_ = 1;
        OLDP_ = 1;
        subcycle_ = 0;
        subc_reload_ = 1;
        PC_ = 0;
        IP_ = 0;
        inhibit_ = true;
        zpar_ = false;
        uv_zpar_ = false;
        pitch_zero_ = false;
        pitch_count_ = 0;
        new_frame_energy_idx_ = 0;
        new_frame_pitch_idx_ = 0;
        memset(new_frame_k_idx_, 0, sizeof(new_frame_k_idx_));
        current_energy_ = 0;
        previous_energy_ = 0;
        current_pitch_ = 0;
        memset(current_k_, 0, sizeof(current_k_));
        RNG_ = 0x1FFF;
        excitation_data_ = 0;
        memset(u_, 0, sizeof(u_));
        memset(x_, 0, sizeof(x_));
        speech_rom_bitnum_ = 0;
        frame_buffer_mode_ = false;
        frame_buffer_pos_ = 0;
        speechPhaseAcc_ = 0.0;
        lastSpeechSample_ = 0.0f;
    }

    // ========================================================================
    // MIDI Voice Processing (simplified, for interactive mode)
    // ========================================================================

    float generateMIDIVoiceSample(MIDIVoice& v) {
        if (v.current_energy == 0 && !v.active) return 0.0f;

        // Interpolation at IP boundaries
        if (v.interp_count == 0 && v.interp_period < 8) {
            int shift = interp_coeff[v.interp_period];
            if (shift > 0) {
                v.current_energy += (v.target_energy - v.current_energy) >> shift;
                v.current_pitch += (v.target_pitch - v.current_pitch) >> shift;
                for (int k = 0; k < 10; k++)
                    v.current_k[k] += (v.target_k[k] - v.current_k[k]) >> shift;
            }
        }

        // Excitation
        if (v.noise_mode || v.current_pitch == 0) {
            for (int sub = 0; sub < 20; sub++) {
                int bitout = ((v.RNG >> 12) ^ (v.RNG >> 3) ^ (v.RNG >> 2) ^ (v.RNG >> 0)) & 1;
                v.RNG = ((v.RNG << 1) | bitout) & 0x1FFF;
            }
            v.excitation_data = (v.RNG & 1) ? (int32_t)~0x3F : 0x40;
        } else {
            int idx = (v.pitch_count >= 51) ? 51 : v.pitch_count;
            v.excitation_data = (int8_t)chirptable[idx];
            int effective_pitch = (int)(v.current_pitch / pitchBendFactor_);
            if (effective_pitch < 1) effective_pitch = 1;
            v.pitch_count++;
            if (v.pitch_count >= effective_pitch) v.pitch_count = 0;
        }

        // Lattice filter (uses previous_energy like MAME)
        v.u[10] = matrix_multiply(v.previous_energy, v.excitation_data << 6);
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
        v.previous_energy = v.current_energy;

        // Advance interpolation counter
        v.interp_count++;
        if (v.interp_count >= SAMPLES_PER_IP) {
            v.interp_count = 0;
            v.interp_period++;
            if (v.interp_period >= 8) {
                v.interp_period = 0;
                if (v.target_energy == 0 && v.current_energy <= 1) {
                    v.active = false;
                    v.current_energy = 0;
                }
            }
        }

        // 14-bit wrapping + clip
        int32_t raw = v.u[0];
        while (raw > 16383) raw -= 32768;
        while (raw < -16384) raw += 32768;
        int16_t clipped = clip_analog((int16_t)raw);
        return clipped / 32768.0f;
    }

    float processMIDIVoice(MIDIVoice& v) {
        v.phase_acc += rateRatio_;
        float output = lastVoiceOutput_[&v - voices_];

        while (v.phase_acc >= 1.0) {
            v.phase_acc -= 1.0;
            output = generateMIDIVoiceSample(v);
        }

        float prev = lastVoiceOutput_[&v - voices_];
        float interp = prev + (output - prev) * (float)v.phase_acc;
        lastVoiceOutput_[&v - voices_] = output;
        return interp;
    }

    // ========================================================================
    // Voice allocation
    // ========================================================================

    int allocateVoice() {
        for (int i = 0; i < NUM_VOICES; i++)
            if (!voices_[i].active && voices_[i].current_energy == 0) return i;
        int minIdx = 0;
        int32_t minE = voices_[0].current_energy;
        for (int i = 1; i < NUM_VOICES; i++) {
            if (voices_[i].current_energy < minE) { minE = voices_[i].current_energy; minIdx = i; }
        }
        return minIdx;
    }

    void setKFromIndices(MIDIVoice& v, const int* indices) {
        for (int k = 0; k < 10; k++) {
            int maxVal = (1 << KBITS[k]) - 1;
            v.target_k[k] = ktable[k][std::clamp(indices[k], 0, maxVal)];
        }
        if (brightness_ != 1.0f) {
            for (int k = 3; k < 10; k++)
                v.target_k[k] = (int32_t)(v.target_k[k] * brightness_);
        }
    }

    // ========================================================================
    // Member Data
    // ========================================================================

    // ROM data
    uint8_t* rom_data_;
    int rom_size_;
    int speech_rom_bitnum_;

    // Frame buffer (for phoneme TTS through MAME engine)
    const uint8_t* frame_buffer_data_;
    int frame_buffer_count_;   // Total frames in buffer
    int frame_buffer_pos_;     // Current frame index
    bool frame_buffer_mode_;   // true = reading from frame buffer, false = reading from ROM

    // Speech engine state (MAME-accurate)
    bool speech_active_;
    bool SPEN_, TALK_, TALKD_;
    uint8_t OLDE_, OLDP_;       // OLD frame silence/unvoiced flags
    int subcycle_, subc_reload_, PC_, IP_;
    bool inhibit_;
    bool zpar_, uv_zpar_;
    bool pitch_zero_;
    int new_frame_energy_idx_, new_frame_pitch_idx_;
    int new_frame_k_idx_[NUM_K];
    int32_t current_energy_, current_pitch_;
    int32_t current_k_[NUM_K];
    int32_t previous_energy_;
    int32_t u_[11], x_[10];
    uint16_t RNG_;
    int32_t excitation_data_;
    int pitch_count_;

    // Speech output rate conversion
    double speechPhaseAcc_;
    float lastSpeechSample_;

    // MIDI voices
    MIDIVoice voices_[NUM_VOICES];
    float lastVoiceOutput_[NUM_VOICES] = {};
    float panPositions_[NUM_VOICES] = {};

    // Global parameters
    float sampleRate_ = 44100.0f;
    double rateRatio_ = 0.0;
    float volume_ = 0.8f;
    float stereoWidth_ = 0.5f;
    float brightness_ = 1.0f;
    int currentPreset_ = 0;
    float pitchBendFactor_ = 1.0f;
};

// ============================================================================
// Emscripten Bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(TMS5220Module) {
    emscripten::class_<TMS5220Synth>("TMS5220Synth")
        .constructor<>()
        .function("initialize", &TMS5220Synth::initialize)
        // ROM speech
        .function("loadROM", &TMS5220Synth::loadROM)
        .function("speakAtByte", &TMS5220Synth::speakAtByte)
        .function("stopSpeaking", &TMS5220Synth::stopSpeaking)
        .function("isSpeaking", &TMS5220Synth::isSpeaking)
        // Frame buffer (phoneme TTS through MAME engine)
        .function("loadFrameBuffer", &TMS5220Synth::loadFrameBuffer)
        .function("speakFrameBuffer", &TMS5220Synth::speakFrameBuffer)
        // MIDI
        .function("noteOn", &TMS5220Synth::noteOn)
        .function("noteOff", &TMS5220Synth::noteOff)
        .function("allNotesOff", &TMS5220Synth::allNotesOff)
        .function("activateSpeechVoice", &TMS5220Synth::activateSpeechVoice)
        .function("setParameter", &TMS5220Synth::setParameter)
        .function("controlChange", &TMS5220Synth::controlChange)
        .function("pitchBend", &TMS5220Synth::pitchBend)
        .function("programChange", &TMS5220Synth::programChange)
        .function("setFormants", &TMS5220Synth::setFormants)
        .function("setNoiseMode", &TMS5220Synth::setNoiseMode)
        .function("setLPCFrame", &TMS5220Synth::setLPCFrame)
        .function("setVolume", &TMS5220Synth::setVolume)
        .function("setChirpType", &TMS5220Synth::setChirpType)
        .function("process", &TMS5220Synth::process);
}

} // namespace devilbox
