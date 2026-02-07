/**
 * YMF271Synth.cpp - Yamaha YMF271-F "OPX" FM Synthesizer for WebAssembly
 * Based on MAME's YMF271 emulator by R. Belmont, O. Galibert, and hap
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The YMF271 is a 4-operator FM synthesizer used in:
 * - Various Jaleco arcade games
 * - Seta/Allumer arcade boards
 *
 * Features:
 * - 48 slots (12 groups × 4 operators)
 * - 4-operator FM synthesis with 16 algorithms
 * - 8 waveforms (sine, sine squared, half-sine, etc.)
 * - ADSR envelope (Attack, Decay1, Decay2, Release)
 * - LFO with pitch and amplitude modulation
 * - PCM playback mode
 *
 * License: BSD-3-Clause (MAME license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <memory>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Helper for older compilers
template<typename T>
inline T clamp_value(T val, T lo, T hi) {
    return (val < lo) ? lo : (val > hi) ? hi : val;
}

namespace devilbox {

// Constants from MAME
static constexpr int32_t MAXOUT = 32767;
static constexpr int32_t MINOUT = -32768;

static constexpr int SIN_BITS = 10;
static constexpr int SIN_LEN = (1 << SIN_BITS);
static constexpr int SIN_MASK = (SIN_LEN - 1);

static constexpr int LFO_LENGTH = 256;
static constexpr int LFO_SHIFT = 8;
static constexpr double PLFO_MAX = 1.0;
static constexpr double PLFO_MIN = -1.0;
static constexpr int ALFO_MAX = 65536;
static constexpr int ALFO_MIN = 0;

static constexpr int ENV_ATTACK = 0;
static constexpr int ENV_DECAY1 = 1;
static constexpr int ENV_DECAY2 = 2;
static constexpr int ENV_RELEASE = 3;

static constexpr int OP_INPUT_FEEDBACK = -1;
static constexpr int OP_INPUT_NONE = -2;

static constexpr int ENV_VOLUME_SHIFT = 16;

static constexpr double INF_TIME = -1.0;

// Attack time table (ms) from MAME
static const double ARTime[64] = {
    INF_TIME, INF_TIME, INF_TIME, INF_TIME, 6188.12, 4980.68, 4144.76, 3541.04,
    3094.06, 2490.34, 2072.38, 1770.52, 1547.03, 1245.17, 1036.19, 885.26,
    773.51, 622.59, 518.10, 441.63, 386.76, 311.29, 259.05, 221.32,
    193.38, 155.65, 129.52, 110.66, 96.69, 77.82, 64.76, 55.33,
    48.34, 38.91, 32.38, 27.66, 24.17, 19.46, 16.19, 13.83,
    12.09, 9.73, 8.10, 6.92, 6.04, 4.86, 4.05, 3.46,
    3.02, 2.47, 2.14, 1.88, 1.70, 1.38, 1.16, 1.02,
    0.88, 0.70, 0.57, 0.48, 0.43, 0.43, 0.43, 0.07
};

// Decay/Release time table (ms) from MAME
static const double DCTime[64] = {
    INF_TIME, INF_TIME, INF_TIME, INF_TIME, 93599.64, 74837.91, 62392.02, 53475.56,
    46799.82, 37418.96, 31196.01, 26737.78, 23399.91, 18709.48, 15598.00, 13368.89,
    11699.95, 9354.74, 7799.00, 6684.44, 5849.98, 4677.37, 3899.50, 3342.22,
    2924.99, 2338.68, 1949.75, 1671.11, 1462.49, 1169.34, 974.88, 835.56,
    731.25, 584.67, 487.44, 417.78, 365.62, 292.34, 243.72, 208.89,
    182.81, 146.17, 121.86, 104.44, 91.41, 73.08, 60.93, 52.22,
    45.69, 36.55, 33.85, 26.09, 22.83, 18.28, 15.22, 13.03,
    11.41, 9.12, 7.60, 6.51, 5.69, 5.69, 5.69, 5.69
};

// LFO frequency table from MAME
static const double LFO_frequency_table[256] = {
    0.00066, 0.00068, 0.00070, 0.00073, 0.00075, 0.00078, 0.00081, 0.00084,
    0.00088, 0.00091, 0.00096, 0.00100, 0.00105, 0.00111, 0.00117, 0.00124,
    0.00131, 0.00136, 0.00140, 0.00145, 0.00150, 0.00156, 0.00162, 0.00168,
    0.00175, 0.00183, 0.00191, 0.00200, 0.00210, 0.00221, 0.00234, 0.00247,
    0.00263, 0.00271, 0.00280, 0.00290, 0.00300, 0.00312, 0.00324, 0.00336,
    0.00350, 0.00366, 0.00382, 0.00401, 0.00421, 0.00443, 0.00467, 0.00495,
    0.00526, 0.00543, 0.00561, 0.00580, 0.00601, 0.00623, 0.00647, 0.00673,
    0.00701, 0.00731, 0.00765, 0.00801, 0.00841, 0.00885, 0.00935, 0.00990,
    0.01051, 0.01085, 0.01122, 0.01160, 0.01202, 0.01246, 0.01294, 0.01346,
    0.01402, 0.01463, 0.01529, 0.01602, 0.01682, 0.01771, 0.01869, 0.01979,
    0.02103, 0.02171, 0.02243, 0.02320, 0.02403, 0.02492, 0.02588, 0.02692,
    0.02804, 0.02926, 0.03059, 0.03204, 0.03365, 0.03542, 0.03738, 0.03958,
    0.04206, 0.04341, 0.04486, 0.04641, 0.04807, 0.04985, 0.05176, 0.05383,
    0.05608, 0.05851, 0.06117, 0.06409, 0.06729, 0.07083, 0.07477, 0.07917,
    0.08411, 0.08683, 0.08972, 0.09282, 0.09613, 0.09969, 0.10353, 0.10767,
    0.11215, 0.11703, 0.12235, 0.12817, 0.13458, 0.14167, 0.14954, 0.15833,
    0.16823, 0.17365, 0.17944, 0.18563, 0.19226, 0.19938, 0.20705, 0.21533,
    0.22430, 0.23406, 0.24470, 0.25635, 0.26917, 0.28333, 0.29907, 0.31666,
    0.33646, 0.34731, 0.35889, 0.37126, 0.38452, 0.39876, 0.41410, 0.43066,
    0.44861, 0.46811, 0.48939, 0.51270, 0.53833, 0.56666, 0.59814, 0.63333,
    0.67291, 0.69462, 0.71777, 0.74252, 0.76904, 0.79753, 0.82820, 0.86133,
    0.89722, 0.93623, 0.97878, 1.02539, 1.07666, 1.13333, 1.19629, 1.26666,
    1.34583, 1.38924, 1.43555, 1.48505, 1.53809, 1.59509, 1.65640, 1.72266,
    1.79443, 1.87245, 1.95756, 2.05078, 2.15332, 2.26665, 2.39258, 2.53332,
    2.69165, 2.77848, 2.87109, 2.97010, 3.07617, 3.19010, 3.31280, 3.44531,
    3.58887, 3.74490, 3.91513, 4.10156, 4.30664, 4.53331, 4.78516, 5.06664,
    5.38330, 5.55696, 5.74219, 5.94019, 6.15234, 6.38021, 6.62560, 6.89062,
    7.17773, 7.48981, 7.83026, 8.20312, 8.61328, 9.06661, 9.57031, 10.13327,
    10.76660, 11.11391, 11.48438, 11.88039, 12.30469, 12.76042, 13.25120, 13.78125,
    14.35547, 14.97962, 15.66051, 16.40625, 17.22656, 18.13322, 19.14062, 20.26654,
    21.53320, 22.96875, 24.60938, 26.50240, 28.71094, 31.32102, 34.45312, 38.28125,
    43.06641, 49.21875, 57.42188, 68.90625, 86.13281, 114.84375, 172.26562, 344.53125
};

// Rate/Key Scale table from MAME
static const int RKS_Table[32][8] = {
    {  0,  0,  0,  0,  0,  2,  4,  8 }, {  0,  0,  0,  0,  1,  3,  5,  9 },
    {  0,  0,  0,  1,  2,  4,  6, 10 }, {  0,  0,  0,  1,  3,  5,  7, 11 },
    {  0,  0,  1,  2,  4,  6,  8, 12 }, {  0,  0,  1,  2,  5,  7,  9, 13 },
    {  0,  0,  1,  3,  6,  8, 10, 14 }, {  0,  0,  1,  3,  7,  9, 11, 15 },
    {  0,  1,  2,  4,  8, 10, 12, 16 }, {  0,  1,  2,  4,  9, 11, 13, 17 },
    {  0,  1,  2,  5, 10, 12, 14, 18 }, {  0,  1,  2,  5, 11, 13, 15, 19 },
    {  0,  1,  3,  6, 12, 14, 16, 20 }, {  0,  1,  3,  6, 13, 15, 17, 21 },
    {  0,  1,  3,  7, 14, 16, 18, 22 }, {  0,  1,  3,  7, 15, 17, 19, 23 },
    {  0,  2,  4,  8, 16, 18, 20, 24 }, {  0,  2,  4,  8, 17, 19, 21, 25 },
    {  0,  2,  4,  9, 18, 20, 22, 26 }, {  0,  2,  4,  9, 19, 21, 23, 27 },
    {  0,  2,  5, 10, 20, 22, 24, 28 }, {  0,  2,  5, 10, 21, 23, 25, 29 },
    {  0,  2,  5, 11, 22, 24, 26, 30 }, {  0,  2,  5, 11, 23, 25, 27, 31 },
    {  0,  3,  6, 12, 24, 26, 28, 31 }, {  0,  3,  6, 12, 25, 27, 29, 31 },
    {  0,  3,  6, 13, 26, 28, 30, 31 }, {  0,  3,  6, 13, 27, 29, 31, 31 },
    {  0,  3,  7, 14, 28, 30, 31, 31 }, {  0,  3,  7, 14, 29, 31, 31, 31 },
    {  0,  3,  7, 15, 30, 31, 31, 31 }, {  0,  3,  7, 15, 31, 31, 31, 31 }
};

static const double multiple_table[16] = { 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 };
static const double pow_table[16] = { 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 0.5, 1, 2, 4, 8, 16, 32, 64 };
static const double fs_frequency[4] = { 1.0/1.0, 1.0/2.0, 1.0/4.0, 1.0/8.0 };
static const double channel_attenuation_table[16] = {
    0.0, 2.5, 6.0, 8.5, 12.0, 14.5, 18.1, 20.6, 24.1, 26.6, 30.1, 32.6, 36.1, 96.1, 96.1, 96.1
};
static const int modulation_level[8] = { 16, 8, 4, 2, 1, 32, 64, 128 };
static const int feedback_level[8] = { 0, 1, 2, 4, 8, 16, 32, 64 };

/**
 * YMF271 Slot (Operator) structure
 */
struct YMF271Slot {
    uint8_t ext_en;
    uint8_t ext_out;
    uint8_t lfoFreq;
    uint8_t lfowave;
    uint8_t pms, ams;
    uint8_t detune;
    uint8_t multiple;
    uint8_t tl;
    uint8_t keyscale;
    uint8_t ar;
    uint8_t decay1rate, decay2rate;
    uint8_t decay1lvl;
    uint8_t relrate;
    uint8_t block;
    uint8_t fns_hi;
    uint32_t fns;
    uint8_t feedback;
    uint8_t waveform;
    uint8_t accon;
    uint8_t algorithm;
    uint8_t ch0_level, ch1_level, ch2_level, ch3_level;

    uint32_t startaddr;
    uint32_t loopaddr;
    uint32_t endaddr;
    uint8_t altloop;
    uint8_t fs;
    uint8_t srcnote, srcb;

    uint32_t step;
    uint64_t stepptr;

    uint8_t active;
    uint8_t bits;

    // Envelope generator
    int32_t volume;
    int32_t env_state;
    int32_t env_attack_step;
    int32_t env_decay1_step;
    int32_t env_decay2_step;
    int32_t env_release_step;

    int64_t feedback_modulation0;
    int64_t feedback_modulation1;

    int lfo_phase, lfo_step;
    int lfo_amplitude;
    double lfo_phasemod;
};

/**
 * YMF271 Group structure
 */
struct YMF271Group {
    uint8_t sync;
    uint8_t pfm;
};

/**
 * YMF271 Parameter IDs
 */
enum class YMF271Param {
    MASTER_VOLUME = 0,
    ALGORITHM = 1,
    FEEDBACK = 2,
    WAVEFORM = 3,
    TL = 4,          // Total Level
    AR = 5,          // Attack Rate
    D1R = 6,         // Decay 1 Rate
    D2R = 7,         // Decay 2 Rate
    RR = 8,          // Release Rate
    D1L = 9,         // Decay 1 Level
    MULTIPLE = 10,
    DETUNE = 11,
    LFO_FREQ = 12,
    LFO_WAVE = 13,
    PMS = 14,        // Pitch Modulation Sensitivity
    AMS = 15,        // Amplitude Modulation Sensitivity

    PARAM_COUNT = 16
};

/**
 * YMF271 FM Synthesizer - Standalone implementation
 */
class YMF271Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;
    static constexpr int NUM_SLOTS = 48;
    static constexpr int NUM_GROUPS = 12;

    YMF271Synth()
        : m_sample_rate(44100)
        , m_isInitialized(false)
        , m_master_volume(1.0f)
    {
        std::memset(m_slots, 0, sizeof(m_slots));
        std::memset(m_groups, 0, sizeof(m_groups));
    }

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;

        // Initialize lookup tables
        init_tables();

        // Reset all slots
        for (int i = 0; i < NUM_SLOTS; i++) {
            reset_slot(&m_slots[i]);
        }

        // Set default group modes (4-op FM)
        for (int i = 0; i < NUM_GROUPS; i++) {
            m_groups[i].sync = 0; // 4-operator mode
            m_groups[i].pfm = 0;
        }

        m_isInitialized = true;
    }

    void noteOn(int note, int velocity) {
        if (!m_isInitialized || velocity == 0) return;

        // Find first free group (4 slots per group in 4-op mode)
        for (int g = 0; g < NUM_GROUPS; g++) {
            int slot1 = g + (0 * 12);
            if (!m_slots[slot1].active) {
                // Calculate frequency from MIDI note
                double freq = 440.0 * std::pow(2.0, (note - 69) / 12.0);

                // Set up all 4 slots in this group
                for (int op = 0; op < 4; op++) {
                    int slotnum = g + (op * 12);
                    YMF271Slot* slot = &m_slots[slotnum];

                    // Convert frequency to block/fns
                    int block = 4;
                    int fns = static_cast<int>((freq * 2048.0 * pow_table[8 + block]) / m_sample_rate);
                    fns = clamp_value(fns, 0, 2047);

                    slot->block = block;
                    slot->fns = fns;

                    // Set TL for all operators
                    if (op == 3) {
                        // Carrier: velocity-scaled TL (lower = louder)
                        slot->tl = 32 - static_cast<int>((velocity / 127.0f) * 24);
                    } else {
                        // Modulators: very low TL for strong modulation
                        slot->tl = 8;
                    }

                    // Initialize envelope and LFO
                    init_envelope(slot);
                    init_lfo(slot);
                    calculate_step(slot);

                    slot->active = 1;
                    slot->stepptr = 0;
                }
                return;
            }
        }
    }

    void noteOff(int note) {
        if (!m_isInitialized) return;

        // Find and release matching notes
        for (int g = 0; g < NUM_GROUPS; g++) {
            int slot1 = g + (0 * 12);
            if (m_slots[slot1].active) {
                // Release all slots in group
                for (int op = 0; op < 4; op++) {
                    int slotnum = g + (op * 12);
                    m_slots[slotnum].env_state = ENV_RELEASE;
                }
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_SLOTS; i++) {
            m_slots[i].active = 0;
            m_slots[i].volume = 0;
        }
    }

    void setParameter(int paramId, float value) {
        auto param = static_cast<YMF271Param>(paramId);
        switch (param) {
            case YMF271Param::MASTER_VOLUME:
                m_master_volume = clamp_value(value, 0.0f, 1.0f);
                break;
            case YMF271Param::ALGORITHM:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].algorithm = static_cast<int>(value * 15) & 0x0f;
                }
                break;
            case YMF271Param::FEEDBACK:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].feedback = static_cast<int>(value * 7) & 0x07;
                }
                break;
            case YMF271Param::WAVEFORM:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].waveform = static_cast<int>(value * 6) & 0x07;
                }
                break;
            case YMF271Param::TL:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].tl = static_cast<int>(value * 127) & 0x7f;
                }
                break;
            case YMF271Param::AR:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].ar = static_cast<int>(value * 31) & 0x1f;
                }
                break;
            case YMF271Param::D1R:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].decay1rate = static_cast<int>(value * 31) & 0x1f;
                }
                break;
            case YMF271Param::D2R:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].decay2rate = static_cast<int>(value * 31) & 0x1f;
                }
                break;
            case YMF271Param::RR:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].relrate = static_cast<int>(value * 15) & 0x0f;
                }
                break;
            case YMF271Param::D1L:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].decay1lvl = static_cast<int>(value * 15) & 0x0f;
                }
                break;
            case YMF271Param::MULTIPLE:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].multiple = static_cast<int>(value * 15) & 0x0f;
                }
                break;
            case YMF271Param::LFO_FREQ:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].lfoFreq = static_cast<int>(value * 255) & 0xff;
                }
                break;
            case YMF271Param::LFO_WAVE:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].lfowave = static_cast<int>(value * 3) & 0x03;
                }
                break;
            case YMF271Param::PMS:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].pms = static_cast<int>(value * 7) & 0x07;
                }
                break;
            case YMF271Param::AMS:
                for (int i = 0; i < NUM_SLOTS; i++) {
                    m_slots[i].ams = static_cast<int>(value * 3) & 0x03;
                }
                break;
            default:
                break;
        }
    }

    void process(float* outputL, float* outputR, int numSamples) {
        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Clear mix buffer
        std::memset(m_mix_buffer, 0, numSamples * 4 * sizeof(int32_t));

        // Process all groups
        for (int g = 0; g < NUM_GROUPS; g++) {
            YMF271Group* group = &m_groups[g];

            // 4-operator FM mode (sync = 0)
            if (group->sync == 0) {
                int slot1 = g + (0 * 12);
                int slot2 = g + (1 * 12);
                int slot3 = g + (2 * 12);
                int slot4 = g + (3 * 12);

                if (m_slots[slot1].active) {
                    process_4op_fm(g, slot1, slot2, slot3, slot4, numSamples);
                }
            }
        }

        // Convert to float and apply master volume
        float scale = m_master_volume / 32768.0f;
        for (int i = 0; i < numSamples; i++) {
            // Mix channels 0+2 to left, 1+3 to right
            int32_t left = m_mix_buffer[i * 4 + 0] + m_mix_buffer[i * 4 + 2];
            int32_t right = m_mix_buffer[i * 4 + 1] + m_mix_buffer[i * 4 + 3];

            outputL[i] = clamp_value(left * scale, -1.0f, 1.0f);
            outputR[i] = clamp_value(right * scale, -1.0f, 1.0f);
        }
    }

    // JavaScript wrapper for process() - converts uintptr_t to float pointers
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

    bool isInitialized() const { return m_isInitialized; }

private:
    int m_sample_rate;
    bool m_isInitialized;
    float m_master_volume;

    YMF271Slot m_slots[NUM_SLOTS];
    YMF271Group m_groups[NUM_GROUPS];
    int32_t m_mix_buffer[MAX_OUTPUT_SAMPLES * 4];

    // Lookup tables
    int16_t m_lut_waves[8][SIN_LEN];
    double m_lut_plfo[4][8][LFO_LENGTH];
    int m_lut_alfo[4][LFO_LENGTH];
    double m_lut_ar[64];
    double m_lut_dc[64];
    double m_lut_lfo[256];
    int m_lut_attenuation[16];
    int m_lut_total_level[128];
    int m_lut_env_volume[256];

    void reset_slot(YMF271Slot* slot) {
        std::memset(slot, 0, sizeof(YMF271Slot));
        slot->tl = 127;
        slot->ar = 31;
        slot->decay1rate = 0;
        slot->decay2rate = 0;
        slot->relrate = 15;
        slot->decay1lvl = 0;
        slot->multiple = 1;
        slot->ch0_level = 0;
        slot->ch1_level = 0;
        slot->ch2_level = 15;
        slot->ch3_level = 15;
    }

    void init_tables() {
        // Initialize waveform tables (8 waveforms from MAME)
        for (int i = 0; i < SIN_LEN; i++) {
            double m = std::sin(((i * 2) + 1) * M_PI / SIN_LEN);
            double m2 = std::sin(((i * 4) + 1) * M_PI / SIN_LEN);

            // Waveform 0: sin(wt)
            m_lut_waves[0][i] = static_cast<int16_t>(m * MAXOUT);

            // Waveform 1: sin²(wt) / -sin²(wt)
            m_lut_waves[1][i] = (i < (SIN_LEN / 2))
                ? static_cast<int16_t>((m * m) * MAXOUT)
                : static_cast<int16_t>((m * m) * MINOUT);

            // Waveform 2: sin(wt) / -sin(wt) (rectified)
            m_lut_waves[2][i] = (i < (SIN_LEN / 2))
                ? static_cast<int16_t>(m * MAXOUT)
                : static_cast<int16_t>(-m * MAXOUT);

            // Waveform 3: sin(wt) / 0 (half sine)
            m_lut_waves[3][i] = (i < (SIN_LEN / 2))
                ? static_cast<int16_t>(m * MAXOUT)
                : 0;

            // Waveform 4: sin(2wt) / 0 (double freq half sine)
            m_lut_waves[4][i] = (i < (SIN_LEN / 2))
                ? static_cast<int16_t>(m2 * MAXOUT)
                : 0;

            // Waveform 5: |sin(2wt)| / 0 (abs double freq half sine)
            m_lut_waves[5][i] = (i < (SIN_LEN / 2))
                ? static_cast<int16_t>(std::fabs(m2) * MAXOUT)
                : 0;

            // Waveform 6: 1 (DC)
            m_lut_waves[6][i] = static_cast<int16_t>(MAXOUT);

            // Waveform 7: PCM (not used in FM mode)
            m_lut_waves[7][i] = 0;
        }

        // Initialize LFO tables
        for (int i = 0; i < LFO_LENGTH; i++) {
            double plfo[4];

            // LFO waveform 0: none
            plfo[0] = 0;

            // LFO waveform 1: sawtooth
            double fsaw_wave = ((i % (LFO_LENGTH / 2)) * PLFO_MAX) / static_cast<double>((LFO_LENGTH / 2) - 1);
            plfo[1] = (i < (LFO_LENGTH / 2)) ? fsaw_wave : fsaw_wave - PLFO_MAX;

            // LFO waveform 2: square
            plfo[2] = (i < (LFO_LENGTH / 2)) ? PLFO_MAX : PLFO_MIN;

            // LFO waveform 3: triangle
            double ftri_wave = ((i % (LFO_LENGTH / 4)) * PLFO_MAX) / static_cast<double>(LFO_LENGTH / 4);
            switch (i / (LFO_LENGTH / 4)) {
                case 0: plfo[3] = ftri_wave; break;
                case 1: plfo[3] = PLFO_MAX - ftri_wave; break;
                case 2: plfo[3] = -ftri_wave; break;
                case 3: plfo[3] = -(PLFO_MAX - ftri_wave); break;
                default: plfo[3] = 0; break;
            }

            // Build PLFO lookup tables for each PMS value
            for (int j = 0; j < 4; j++) {
                m_lut_plfo[j][0][i] = std::pow(2.0, 0.0);
                m_lut_plfo[j][1][i] = std::pow(2.0, (3.378 * plfo[j]) / 1200.0);
                m_lut_plfo[j][2][i] = std::pow(2.0, (5.0646 * plfo[j]) / 1200.0);
                m_lut_plfo[j][3][i] = std::pow(2.0, (6.7495 * plfo[j]) / 1200.0);
                m_lut_plfo[j][4][i] = std::pow(2.0, (10.1143 * plfo[j]) / 1200.0);
                m_lut_plfo[j][5][i] = std::pow(2.0, (20.1699 * plfo[j]) / 1200.0);
                m_lut_plfo[j][6][i] = std::pow(2.0, (40.1076 * plfo[j]) / 1200.0);
                m_lut_plfo[j][7][i] = std::pow(2.0, (79.307 * plfo[j]) / 1200.0);
            }

            // LFO amplitude modulation
            m_lut_alfo[0][i] = 0;
            m_lut_alfo[1][i] = ALFO_MAX - ((i * ALFO_MAX) / LFO_LENGTH);
            m_lut_alfo[2][i] = (i < (LFO_LENGTH / 2)) ? ALFO_MAX : ALFO_MIN;

            int tri_wave = ((i % (LFO_LENGTH / 2)) * ALFO_MAX) / (LFO_LENGTH / 2);
            m_lut_alfo[3][i] = (i < (LFO_LENGTH / 2)) ? ALFO_MAX - tri_wave : tri_wave;
        }

        // Initialize envelope volume table
        for (int i = 0; i < 256; i++) {
            m_lut_env_volume[i] = static_cast<int>(65536.0 / std::pow(10.0, (static_cast<double>(i) / (256.0 / 96.0)) / 20.0));
        }

        // Initialize attenuation table
        for (int i = 0; i < 16; i++) {
            m_lut_attenuation[i] = static_cast<int>(65536.0 / std::pow(10.0, channel_attenuation_table[i] / 20.0));
        }

        // Initialize total level table
        for (int i = 0; i < 128; i++) {
            double db = 0.75 * static_cast<double>(i);
            m_lut_total_level[i] = static_cast<int>(65536.0 / std::pow(10.0, db / 20.0));
        }

        // Initialize timing tables
        for (int i = 0; i < 256; i++) {
            m_lut_lfo[i] = LFO_frequency_table[i];
        }

        for (int i = 0; i < 64; i++) {
            m_lut_ar[i] = (ARTime[i] * 44100.0) / 1000.0;
            m_lut_dc[i] = (DCTime[i] * 44100.0) / 1000.0;
        }
    }

    void calculate_step(YMF271Slot* slot) {
        double st;

        if (slot->waveform == 7) {
            // External waveform (PCM) - not implemented in this standalone version
            slot->step = 0;
        } else {
            // Internal waveform (FM)
            st = static_cast<double>(2 * slot->fns) * pow_table[slot->block];
            st = st * multiple_table[slot->multiple] * static_cast<double>(SIN_LEN);

            // LFO phase modulation
            st *= slot->lfo_phasemod;

            st /= (536870912.0 / 65536.0);

            slot->step = static_cast<uint32_t>(st);
        }
    }

    int get_keyscaled_rate(int rate, int keycode, int keyscale) {
        int newrate = rate + RKS_Table[keycode & 31][keyscale & 7];
        return clamp_value(newrate, 0, 63);
    }

    int get_internal_keycode(int block, int fns) {
        int n43;
        if (fns < 0x780) n43 = 0;
        else if (fns < 0x900) n43 = 1;
        else if (fns < 0xa80) n43 = 2;
        else n43 = 3;

        return ((block & 7) * 4) + n43;
    }

    void init_envelope(YMF271Slot* slot) {
        int keycode = get_internal_keycode(slot->block, slot->fns);
        int decay_level = 255 - (slot->decay1lvl << 4);

        int rate;

        // Attack
        rate = get_keyscaled_rate(slot->ar * 2, keycode, slot->keyscale);
        slot->env_attack_step = (rate < 4) ? 0 : static_cast<int>(((255.0 - 0.0) / m_lut_ar[rate]) * 65536.0);

        // Decay 1
        rate = get_keyscaled_rate(slot->decay1rate * 2, keycode, slot->keyscale);
        slot->env_decay1_step = (rate < 4) ? 0 : static_cast<int>(((255.0 - decay_level) / m_lut_dc[rate]) * 65536.0);

        // Decay 2
        rate = get_keyscaled_rate(slot->decay2rate * 2, keycode, slot->keyscale);
        slot->env_decay2_step = (rate < 4) ? 0 : static_cast<int>((255.0 / m_lut_dc[rate]) * 65536.0);

        // Release
        rate = get_keyscaled_rate(slot->relrate * 4, keycode, slot->keyscale);
        slot->env_release_step = (rate < 4) ? 0 : static_cast<int>((255.0 / m_lut_dc[rate]) * 65536.0);

        slot->volume = (255 - 160) << ENV_VOLUME_SHIFT; // -60dB
        slot->env_state = ENV_ATTACK;
    }

    void init_lfo(YMF271Slot* slot) {
        slot->lfo_phase = 0;
        slot->lfo_amplitude = 0;
        slot->lfo_phasemod = 1.0;

        slot->lfo_step = static_cast<int>((static_cast<double>(LFO_LENGTH) * m_lut_lfo[slot->lfoFreq]) / 44100.0 * 256.0);
    }

    bool check_envelope_end(YMF271Slot* slot) {
        if (slot->volume <= 0) {
            slot->active = 0;
            slot->volume = 0;
            return true;
        }
        return false;
    }

    void update_envelope(YMF271Slot* slot) {
        switch (slot->env_state) {
            case ENV_ATTACK:
                slot->volume += slot->env_attack_step;
                if (slot->volume >= (255 << ENV_VOLUME_SHIFT)) {
                    slot->volume = (255 << ENV_VOLUME_SHIFT);
                    slot->env_state = ENV_DECAY1;
                }
                break;

            case ENV_DECAY1: {
                int decay_level = 255 - (slot->decay1lvl << 4);
                slot->volume -= slot->env_decay1_step;
                if (!check_envelope_end(slot) && (slot->volume >> ENV_VOLUME_SHIFT) <= decay_level) {
                    slot->env_state = ENV_DECAY2;
                }
                break;
            }

            case ENV_DECAY2:
                slot->volume -= slot->env_decay2_step;
                check_envelope_end(slot);
                break;

            case ENV_RELEASE:
                slot->volume -= slot->env_release_step;
                check_envelope_end(slot);
                break;
        }
    }

    void update_lfo(YMF271Slot* slot) {
        slot->lfo_phase += slot->lfo_step;

        int lfo_index = (slot->lfo_phase >> LFO_SHIFT) & (LFO_LENGTH - 1);
        slot->lfo_amplitude = m_lut_alfo[slot->lfowave][lfo_index];
        slot->lfo_phasemod = m_lut_plfo[slot->lfowave][slot->pms][lfo_index];

        calculate_step(slot);
    }

    int64_t calculate_slot_volume(YMF271Slot* slot) {
        int64_t lfo_volume = 65536;

        switch (slot->ams) {
            case 0: lfo_volume = 65536; break;
            case 1: lfo_volume = 65536 - ((slot->lfo_amplitude * 33124) >> 16); break;
            case 2: lfo_volume = 65536 - ((slot->lfo_amplitude * 16742) >> 16); break;
            case 3: lfo_volume = 65536 - ((slot->lfo_amplitude * 4277) >> 16); break;
        }

        int64_t env_volume = (m_lut_env_volume[255 - (slot->volume >> ENV_VOLUME_SHIFT)] * lfo_volume) >> 16;
        int64_t volume = (env_volume * m_lut_total_level[slot->tl]) >> 16;

        return volume;
    }

    int64_t calculate_op(int slotnum, int64_t inp) {
        YMF271Slot* slot = &m_slots[slotnum];
        int64_t slot_input = 0;

        update_envelope(slot);
        update_lfo(slot);
        int64_t env = calculate_slot_volume(slot);

        if (inp == OP_INPUT_FEEDBACK) {
            slot_input = (slot->feedback_modulation0 + slot->feedback_modulation1) / 2;
            slot->feedback_modulation0 = slot->feedback_modulation1;
        } else if (inp != OP_INPUT_NONE) {
            slot_input = ((inp << (SIN_BITS - 2)) * modulation_level[slot->feedback]);
        }

        int64_t slot_output = m_lut_waves[slot->waveform][((slot->stepptr + slot_input) >> 16) & SIN_MASK];
        slot_output = (slot_output * env) >> 16;
        slot->stepptr += slot->step;

        return slot_output;
    }

    void set_feedback(int slotnum, int64_t inp) {
        YMF271Slot* slot = &m_slots[slotnum];
        slot->feedback_modulation1 = (((inp << (SIN_BITS - 2)) * feedback_level[slot->feedback]) / 16);
    }

    void process_4op_fm(int groupnum, int slot1, int slot2, int slot3, int slot4, int numSamples) {
        YMF271Slot* s1 = &m_slots[slot1];

        for (int i = 0; i < numSamples; i++) {
            int64_t output1 = 0, output2 = 0, output3 = 0, output4 = 0;
            int64_t phase_mod1, phase_mod2, phase_mod3;

            // Implement all 16 algorithms from MAME
            switch (s1->algorithm) {
                case 0:
                    // S1 -> S3 -> S2 -> S4 (serial with feedback on S1)
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    phase_mod2 = calculate_op(slot2, phase_mod3);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 1:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    set_feedback(slot1, phase_mod3);
                    phase_mod2 = calculate_op(slot2, phase_mod3);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 2:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    phase_mod3 = calculate_op(slot3, OP_INPUT_NONE);
                    phase_mod2 = calculate_op(slot2, (phase_mod1 + phase_mod3) / 1);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 3:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    phase_mod3 = calculate_op(slot3, OP_INPUT_NONE);
                    phase_mod2 = calculate_op(slot2, phase_mod3);
                    output4 = calculate_op(slot4, (phase_mod1 + phase_mod2) / 1);
                    break;

                case 4:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, (phase_mod3 + phase_mod2) / 1);
                    break;

                case 5:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    set_feedback(slot1, phase_mod3);
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, (phase_mod3 + phase_mod2) / 1);
                    break;

                case 6:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output3 = calculate_op(slot3, phase_mod1);
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 7:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    set_feedback(slot1, phase_mod3);
                    output3 = phase_mod3;
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 8:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output1 = phase_mod1;
                    phase_mod3 = calculate_op(slot3, OP_INPUT_NONE);
                    phase_mod2 = calculate_op(slot2, phase_mod3);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 9:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output1 = phase_mod1;
                    phase_mod3 = calculate_op(slot3, OP_INPUT_NONE);
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, (phase_mod3 + phase_mod2) / 1);
                    break;

                case 10:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output3 = calculate_op(slot3, phase_mod1);
                    output2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, OP_INPUT_NONE);
                    break;

                case 11:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    phase_mod3 = calculate_op(slot3, phase_mod1);
                    set_feedback(slot1, phase_mod3);
                    output3 = phase_mod3;
                    output2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, OP_INPUT_NONE);
                    break;

                case 12:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output3 = calculate_op(slot3, phase_mod1);
                    output2 = calculate_op(slot2, phase_mod1);
                    output4 = calculate_op(slot4, phase_mod1);
                    break;

                case 13:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output1 = phase_mod1;
                    phase_mod3 = calculate_op(slot3, OP_INPUT_NONE);
                    output2 = calculate_op(slot2, phase_mod3);
                    output4 = calculate_op(slot4, OP_INPUT_NONE);
                    break;

                case 14:
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output1 = phase_mod1;
                    output3 = calculate_op(slot3, phase_mod1);
                    phase_mod2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, phase_mod2);
                    break;

                case 15:
                    // All carriers (no modulation except feedback)
                    phase_mod1 = calculate_op(slot1, OP_INPUT_FEEDBACK);
                    set_feedback(slot1, phase_mod1);
                    output1 = phase_mod1;
                    output3 = calculate_op(slot3, OP_INPUT_NONE);
                    output2 = calculate_op(slot2, OP_INPUT_NONE);
                    output4 = calculate_op(slot4, OP_INPUT_NONE);
                    break;
            }

            // Sum outputs and apply channel volumes
            int64_t total = output1 + output2 + output3 + output4;
            int64_t final_volume = calculate_slot_volume(s1);

            int64_t ch0_vol = (final_volume * m_lut_attenuation[s1->ch0_level]) >> 16;
            int64_t ch1_vol = (final_volume * m_lut_attenuation[s1->ch1_level]) >> 16;
            int64_t ch2_vol = (final_volume * m_lut_attenuation[s1->ch2_level]) >> 16;
            int64_t ch3_vol = (final_volume * m_lut_attenuation[s1->ch3_level]) >> 16;

            m_mix_buffer[i * 4 + 0] += static_cast<int32_t>((total * ch0_vol) >> 16);
            m_mix_buffer[i * 4 + 1] += static_cast<int32_t>((total * ch1_vol) >> 16);
            m_mix_buffer[i * 4 + 2] += static_cast<int32_t>((total * ch2_vol) >> 16);
            m_mix_buffer[i * 4 + 3] += static_cast<int32_t>((total * ch3_vol) >> 16);
        }
    }
};

} // namespace devilbox

// ============================================================================
// Emscripten Bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(ymf271_synth) {
    emscripten::class_<YMF271Synth>("YMF271Synth")
        .constructor<>()
        .function("initialize", &YMF271Synth::initialize)
        .function("noteOn", &YMF271Synth::noteOn)
        .function("noteOff", &YMF271Synth::noteOff)
        .function("allNotesOff", &YMF271Synth::allNotesOff)
        .function("setParameter", &YMF271Synth::setParameter)
        .function("process", &YMF271Synth::processJS)
        .function("isInitialized", &YMF271Synth::isInitialized);
}

#endif
