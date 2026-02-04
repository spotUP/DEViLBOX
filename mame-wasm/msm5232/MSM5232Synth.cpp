/**
 * MSM5232Synth.cpp - OKI MSM5232RS 8-Channel Tone Generator for WebAssembly
 * Based on MAME's MSM5232 emulator by Jarek Burczynski / Hiromitsu Shioya
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The MSM5232 is an 8-channel tone generator with organ-style "feet" outputs
 * (2', 4', 8', 16'), RC envelope modeling, and noise generation.
 * Used in many classic arcade games (Irem M52/M62, Jaleco, etc.)
 *
 * Features:
 * - 8 channels in 2 groups of 4
 * - 88-entry ROM table for pitch-to-counter conversion
 * - 4 organ stops per channel: 16', 8', 4', 2' (binary counter bit selection)
 * - RC time-constant envelope (attack / decay1 / decay2 / release)
 * - 17-bit LFSR noise generator
 * - 11 original outputs mixed into stereo
 *
 * License: GPL-2.0+ (original MAME source license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

// ============================================================================
// Constants from MAME
// ============================================================================

static constexpr int CLOCK_RATE_DIVIDER = 16;
static constexpr int DEFAULT_CHIP_CLOCK = 2119040; // Hz
static constexpr int STEP_SH = 16;

static constexpr int VMIN = 0;
static constexpr int VMAX = 32768;

// Resistance values for RC envelope
static constexpr double R51 =    870.0;   // attack resistance
static constexpr double R52 =  17400.0;   // decay 1 resistance
static constexpr double R53 = 101000.0;   // decay 2 resistance

// Default capacitance (1uF per channel)
static constexpr double DEFAULT_CAP = 1.0e-6;

// ROM table: maps pitch data (0x00-0x57) to counter/binary-divider values
// Upper 3 bits = binary counter shift (bindiv), lower 9 bits = counter period
#define ROM(counter,bindiv) (counter|(bindiv<<9))

static const uint16_t MSM5232_ROM[88] = {
    /* 0 */ ROM(506, 7),
    /* 1 */ ROM(478, 7), /* 2 */ ROM(451, 7), /* 3 */ ROM(426, 7), /* 4 */ ROM(402, 7),
    /* 5 */ ROM(379, 7), /* 6 */ ROM(358, 7), /* 7 */ ROM(338, 7), /* 8 */ ROM(319, 7),
    /* 9 */ ROM(301, 7), /* A */ ROM(284, 7), /* B */ ROM(268, 7), /* C */ ROM(253, 7),

    /* D */ ROM(478, 6), /* E */ ROM(451, 6), /* F */ ROM(426, 6), /*10*/ ROM(402, 6),
    /*11*/ ROM(379, 6), /*12*/ ROM(358, 6), /*13*/ ROM(338, 6), /*14*/ ROM(319, 6),
    /*15*/ ROM(301, 6), /*16*/ ROM(284, 6), /*17*/ ROM(268, 6), /*18*/ ROM(253, 6),

    /*19*/ ROM(478, 5), /*1A*/ ROM(451, 5), /*1B*/ ROM(426, 5), /*1C*/ ROM(402, 5),
    /*1D*/ ROM(379, 5), /*1E*/ ROM(358, 5), /*1F*/ ROM(338, 5), /*20*/ ROM(319, 5),
    /*21*/ ROM(301, 5), /*22*/ ROM(284, 5), /*23*/ ROM(268, 5), /*24*/ ROM(253, 5),

    /*25*/ ROM(478, 4), /*26*/ ROM(451, 4), /*27*/ ROM(426, 4), /*28*/ ROM(402, 4),
    /*29*/ ROM(379, 4), /*2A*/ ROM(358, 4), /*2B*/ ROM(338, 4), /*2C*/ ROM(319, 4),
    /*2D*/ ROM(301, 4), /*2E*/ ROM(284, 4), /*2F*/ ROM(268, 4), /*30*/ ROM(253, 4),

    /*31*/ ROM(478, 3), /*32*/ ROM(451, 3), /*33*/ ROM(426, 3), /*34*/ ROM(402, 3),
    /*35*/ ROM(379, 3), /*36*/ ROM(358, 3), /*37*/ ROM(338, 3), /*38*/ ROM(319, 3),
    /*39*/ ROM(301, 3), /*3A*/ ROM(284, 3), /*3B*/ ROM(268, 3), /*3C*/ ROM(253, 3),

    /*3D*/ ROM(478, 2), /*3E*/ ROM(451, 2), /*3F*/ ROM(426, 2), /*40*/ ROM(402, 2),
    /*41*/ ROM(379, 2), /*42*/ ROM(358, 2), /*43*/ ROM(338, 2), /*44*/ ROM(319, 2),
    /*45*/ ROM(301, 2), /*46*/ ROM(284, 2), /*47*/ ROM(268, 2), /*48*/ ROM(253, 2),

    /*49*/ ROM(478, 1), /*4A*/ ROM(451, 1), /*4B*/ ROM(426, 1), /*4C*/ ROM(402, 1),
    /*4D*/ ROM(379, 1), /*4E*/ ROM(358, 1), /*4F*/ ROM(338, 1), /*50*/ ROM(319, 1),
    /*51*/ ROM(301, 1), /*52*/ ROM(284, 1), /*53*/ ROM(268, 1), /*54*/ ROM(253, 1),

    /*55*/ ROM(253, 1), /*56*/ ROM(253, 1),
    /*57*/ ROM(13, 7)
};

#undef ROM

// ============================================================================
// Parameter IDs for external control
// ============================================================================

enum MSM5232Param {
    PARAM_VOLUME = 0,
    PARAM_FEET_MIX = 1,       // 0=all feet, 1=8'+16', 2=8' only, 3=16' only
    PARAM_ATTACK_RATE = 2,    // 0-7
    PARAM_DECAY_RATE = 3,     // 0-15
    PARAM_NOISE_ENABLE = 4,   // 0/1
    PARAM_STEREO_WIDTH = 5,   // 0.0-1.0 (0=mono, 1=full stereo)
    PARAM_REVERB = 6,
    PARAM_ARM_MODE = 7,       // 0=normal decay, 1=sustain until key off
};

// ============================================================================
// Voice structure (matching MAME)
// ============================================================================

struct Voice {
    uint8_t mode;              // 0=tone, 1=noise

    int     TG_count_period;   // programmable counter period (from ROM)
    int     TG_count;          // current counter value

    uint8_t TG_cnt;            // 7-bit binary counter
    uint8_t TG_out16;          // bit mask for 16' output
    uint8_t TG_out8;           // bit mask for 8' output
    uint8_t TG_out4;           // bit mask for 4' output
    uint8_t TG_out2;           // bit mask for 2' output

    int     egvol;             // envelope volume (0-2048)
    int     eg_sect;           // envelope section (-1=off, 0=attack, 1=decay, 2=release)
    int     counter;           // envelope counter
    int     eg;                // envelope value (0-VMAX)

    uint8_t eg_arm;            // ARM flag (sustain mode)

    double  ar_rate;           // attack rate (RC constant)
    double  dr_rate;           // decay rate (RC constant)
    double  rr_rate;           // release rate (RC constant)

    int     pitch;             // current pitch data (-1=unset)
    int     GF;                // gate flag
};

// ============================================================================
// MSM5232Synth class
// ============================================================================

class MSM5232Synth {
public:
    MSM5232Synth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_chipClock = DEFAULT_CHIP_CLOCK;
        m_rate = sampleRate; // Use audio sample rate for output

        initTables();

        for (int i = 0; i < 8; i++) {
            memset(&m_voi[i], 0, sizeof(Voice));
            m_external_capacitance[i] = DEFAULT_CAP;
            initVoice(i);
        }

        // Enable all output stops by default
        m_EN_out16[0] = ~0u; m_EN_out16[1] = ~0u;
        m_EN_out8[0]  = ~0u; m_EN_out8[1]  = ~0u;
        m_EN_out4[0]  = ~0u; m_EN_out4[1]  = ~0u;
        m_EN_out2[0]  = ~0u; m_EN_out2[1]  = ~0u;

        m_noise_cnt = 0;
        m_noise_rng = 1;
        m_noise_clocks = 0;
        m_control1 = 0;
        m_control2 = 0;
        m_gate = 0;

        // Default mix settings
        m_volume = 0.8f;
        m_feetMix = 0;      // all feet
        m_stereoWidth = 0.5f;
        m_noiseEnable = true;

        // Set default ARM mode (sustain)
        setArmMode(1);

        // Set moderate attack/decay
        writeRegister(0x08, 3); // group1 attack
        writeRegister(0x09, 3); // group2 attack
        writeRegister(0x0a, 4); // group1 decay
        writeRegister(0x0b, 4); // group2 decay
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int i = 0; i < numSamples; i++) {
            // Advance all voice envelopes
            EG_voices_advance();

            // Generate group 1 (channels 0-3)
            int g1_o2, g1_o4, g1_o8, g1_o16;
            TG_group_advance(0, g1_o2, g1_o4, g1_o8, g1_o16);

            // Generate group 2 (channels 4-7)
            int g2_o2, g2_o4, g2_o8, g2_o16;
            TG_group_advance(1, g2_o2, g2_o4, g2_o8, g2_o16);

            // Mix feet outputs based on feetMix setting
            float g1_mix = mixFeet(g1_o2, g1_o4, g1_o8, g1_o16);
            float g2_mix = mixFeet(g2_o2, g2_o4, g2_o8, g2_o16);

            // Noise output
            float noise_out = 0.0f;
            if (m_noiseEnable) {
                noise_out = (m_noise_rng & (1 << 16)) ? 0.3f : -0.3f;
            }

            // Stereo mix: group1 panned slightly left, group2 slightly right
            float center = 0.5f;
            float spread = m_stereoWidth * 0.5f;

            float g1_pan_l = center + spread;  // group1 more left
            float g1_pan_r = center - spread;
            float g2_pan_l = center - spread;  // group2 more right
            float g2_pan_r = center + spread;

            outL[i] = (g1_mix * g1_pan_l + g2_mix * g2_pan_l + noise_out * 0.3f) * m_volume;
            outR[i] = (g1_mix * g1_pan_r + g2_mix * g2_pan_r + noise_out * 0.3f) * m_volume;

            // Update noise generator (17-bit LFSR)
            {
                int cnt = (m_noise_cnt += m_noise_step) >> STEP_SH;
                m_noise_cnt &= ((1 << STEP_SH) - 1);
                while (cnt > 0) {
                    int tmp = m_noise_rng & (1 << 16);
                    if (m_noise_rng & 1)
                        m_noise_rng ^= 0x24000;
                    m_noise_rng >>= 1;
                    if ((m_noise_rng & (1 << 16)) != tmp)
                        m_noise_clocks++;
                    cnt--;
                }
            }
        }
    }

    // ========================================================================
    // MIDI note interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (midiNote < 36 || midiNote > 123) return; // Range: C2 to B8

        // Find a free channel or steal the oldest
        int ch = findFreeChannel();

        // Convert MIDI note to MSM5232 pitch data
        // MIDI 69 (A4) -> pitch 33 (0x21) = 440Hz on 8' output
        int pitchData = midiNote - 36;
        if (pitchData < 0) pitchData = 0;
        if (pitchData > 0x57) pitchData = 0x57;

        // Store velocity for this channel
        m_channelVelocity[ch] = velocity / 127.0f;
        m_channelNote[ch] = midiNote;
        m_channelAge[ch] = m_noteCounter++;

        // Key on with pitch data (bit 7 = key on)
        chipWrite(ch, 0x80 | pitchData);
    }

    void noteOff(int midiNote) {
        // Find the channel playing this note
        for (int ch = 0; ch < 8; ch++) {
            if (m_channelNote[ch] == midiNote) {
                chipWrite(ch, 0x00); // Key off
                m_channelNote[ch] = -1;
                m_channelAge[ch] = 0;
                break;
            }
        }
    }

    void allNotesOff() {
        for (int ch = 0; ch < 8; ch++) {
            chipWrite(ch, 0x00);
            m_channelNote[ch] = -1;
            m_channelAge[ch] = 0;
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
            case PARAM_FEET_MIX:
                m_feetMix = (int)value;
                break;
            case PARAM_ATTACK_RATE: {
                int rate = (int)value & 0x7;
                writeRegister(0x08, rate);
                writeRegister(0x09, rate);
                break;
            }
            case PARAM_DECAY_RATE: {
                int rate = (int)value & 0xf;
                writeRegister(0x0a, rate);
                writeRegister(0x0b, rate);
                break;
            }
            case PARAM_NOISE_ENABLE:
                m_noiseEnable = (value > 0.5f);
                break;
            case PARAM_STEREO_WIDTH:
                m_stereoWidth = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_ARM_MODE:
                setArmMode((int)value);
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_FEET_MIX: return (float)m_feetMix;
            case PARAM_ATTACK_RATE: return 0.0f;
            case PARAM_DECAY_RATE: return 0.0f;
            case PARAM_NOISE_ENABLE: return m_noiseEnable ? 1.0f : 0.0f;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_ARM_MODE: return (float)(m_control1 & 0x10 ? 1 : 0);
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> stereo width
                m_stereoWidth = value / 127.0f;
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 73: // Attack time
                setParameter(PARAM_ATTACK_RATE, (value / 127.0f) * 7.0f);
                break;
            case 75: // Decay time
                setParameter(PARAM_DECAY_RATE, (value / 127.0f) * 15.0f);
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
        // value: -1.0 to 1.0, ±2 semitones
        m_pitchBend = value;
        // Re-pitch all active channels
        for (int ch = 0; ch < 8; ch++) {
            if (m_channelNote[ch] >= 0) {
                float bentNote = m_channelNote[ch] + m_pitchBend * 2.0f;
                int pitchData = (int)(bentNote - 36.0f + 0.5f);
                if (pitchData < 0) pitchData = 0;
                if (pitchData > 0x57) pitchData = 0x57;
                // Re-trigger with new pitch but keep key on
                chipWrite(ch, 0x80 | pitchData);
            }
        }
    }

    void programChange(int program) {
        // Presets adjust feet mix and envelope
        switch (program) {
            case 0: // Full Organ (all feet)
                m_feetMix = 0;
                writeRegister(0x08, 2); writeRegister(0x09, 2);
                writeRegister(0x0a, 6); writeRegister(0x0b, 6);
                setArmMode(1);
                break;
            case 1: // Flute 8' (8' only)
                m_feetMix = 2;
                writeRegister(0x08, 3); writeRegister(0x09, 3);
                writeRegister(0x0a, 5); writeRegister(0x0b, 5);
                setArmMode(1);
                break;
            case 2: // Principal 16' (16' only)
                m_feetMix = 3;
                writeRegister(0x08, 2); writeRegister(0x09, 2);
                writeRegister(0x0a, 4); writeRegister(0x0b, 4);
                setArmMode(1);
                break;
            case 3: // Piccolo 2'+4' (high feet)
                m_feetMix = 0;
                enableFeet(1, 1, 0, 0); // 2' and 4' only
                writeRegister(0x08, 4); writeRegister(0x09, 4);
                writeRegister(0x0a, 3); writeRegister(0x0b, 3);
                setArmMode(1);
                break;
            case 4: // Percussive (fast attack, quick decay)
                m_feetMix = 0;
                enableFeet(1, 1, 1, 1);
                writeRegister(0x08, 7); writeRegister(0x09, 7);
                writeRegister(0x0a, 2); writeRegister(0x0b, 2);
                setArmMode(0);
                break;
            case 5: // Strings (slow attack, long decay)
                m_feetMix = 1; // 8' + 16'
                writeRegister(0x08, 0); writeRegister(0x09, 0);
                writeRegister(0x0a, 8); writeRegister(0x0b, 8);
                setArmMode(1);
                break;
            case 6: // Noise Percussion
                m_feetMix = 0;
                m_noiseEnable = true;
                writeRegister(0x08, 7); writeRegister(0x09, 7);
                writeRegister(0x0a, 1); writeRegister(0x0b, 1);
                setArmMode(0);
                break;
            case 7: // Bass 16' (16' only, sustain)
                m_feetMix = 3;
                writeRegister(0x08, 5); writeRegister(0x09, 5);
                writeRegister(0x0a, 10); writeRegister(0x0b, 10);
                setArmMode(1);
                break;
            default:
                break;
        }
    }

    // Direct register access
    void writeRegister(int offset, int data) {
        chipWrite(offset, data);
    }

    // Convenience setters
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setFeetMix(int mix) { m_feetMix = mix; }
    void setAttackRate(int rate) { setParameter(PARAM_ATTACK_RATE, (float)rate); }
    void setDecayRate(int rate) { setParameter(PARAM_DECAY_RATE, (float)rate); }

private:
    // ========================================================================
    // Initialization (from MAME)
    // ========================================================================

    void initTables() {
        m_UpdateStep = (int)(double(1 << STEP_SH) * double(m_rate) / double(m_chipClock));

        double scale = double(m_chipClock) / double(m_rate);
        m_noise_step = (int)((1 << STEP_SH) / 128.0 * scale);

        for (int i = 0; i < 8; i++) {
            double clockscale = double(m_chipClock) / 2119040.0;
            int rcp_duty_cycle = 1 << ((i & 4) ? (i & ~2) : i);
            m_ar_tbl[i] = (rcp_duty_cycle / clockscale) * R51;
        }

        for (int i = 0; i < 8; i++) {
            double clockscale = double(m_chipClock) / 2119040.0;
            int rcp_duty_cycle = 1 << ((i & 4) ? (i & ~2) : i);
            m_dr_tbl[i] = (rcp_duty_cycle / clockscale) * R52;
            m_dr_tbl[i + 8] = (rcp_duty_cycle / clockscale) * R53;
        }
    }

    void initVoice(int i) {
        m_voi[i].ar_rate = m_ar_tbl[0] * m_external_capacitance[i];
        m_voi[i].dr_rate = m_dr_tbl[0] * m_external_capacitance[i];
        m_voi[i].rr_rate = m_dr_tbl[0] * m_external_capacitance[i];
        m_voi[i].eg_sect = -1;
        m_voi[i].eg = 0;
        m_voi[i].eg_arm = 0;
        m_voi[i].pitch = -1;

        m_channelNote[i] = -1;
        m_channelVelocity[i] = 0.0f;
        m_channelAge[i] = 0;
    }

    // ========================================================================
    // Register write (from MAME)
    // ========================================================================

    void chipWrite(int offset, int data) {
        if (offset > 0x0d) return;

        if (offset < 0x08) { // Pitch registers
            int ch = offset & 7;

            m_voi[ch].GF = (data >> 7) & 1;

            if (data & 0x80) {
                if (data >= 0xd8) {
                    // Noise mode
                    m_voi[ch].mode = 1;
                    m_voi[ch].eg_sect = 0;
                } else {
                    // Tone mode
                    if (m_voi[ch].pitch != (data & 0x7f)) {
                        m_voi[ch].pitch = data & 0x7f;

                        uint32_t pg = MSM5232_ROM[data & 0x7f];
                        m_voi[ch].TG_count_period = (pg & 0x1ff) * m_UpdateStep / 2;

                        int n = (pg >> 9) & 7;
                        m_voi[ch].TG_out16 = 1 << n;

                        n = (n > 0) ? (n - 1) : 0;
                        m_voi[ch].TG_out8 = 1 << n;

                        n = (n > 0) ? (n - 1) : 0;
                        m_voi[ch].TG_out4 = 1 << n;

                        n = (n > 0) ? (n - 1) : 0;
                        m_voi[ch].TG_out2 = 1 << n;
                    }
                    m_voi[ch].mode = 0;
                    m_voi[ch].eg_sect = 0;
                }
            } else {
                // Key off
                if (!m_voi[ch].eg_arm)
                    m_voi[ch].eg_sect = 2; // release
                else
                    m_voi[ch].eg_sect = 1; // decay
            }
        } else {
            switch (offset) {
                case 0x08: // Group 1 attack
                    for (int i = 0; i < 4; i++)
                        m_voi[i].ar_rate = m_ar_tbl[data & 0x7] * m_external_capacitance[i];
                    break;
                case 0x09: // Group 2 attack
                    for (int i = 0; i < 4; i++)
                        m_voi[i + 4].ar_rate = m_ar_tbl[data & 0x7] * m_external_capacitance[i + 4];
                    break;
                case 0x0a: // Group 1 decay
                    for (int i = 0; i < 4; i++)
                        m_voi[i].dr_rate = m_dr_tbl[data & 0xf] * m_external_capacitance[i];
                    break;
                case 0x0b: // Group 2 decay
                    for (int i = 0; i < 4; i++)
                        m_voi[i + 4].dr_rate = m_dr_tbl[data & 0xf] * m_external_capacitance[i + 4];
                    break;
                case 0x0c: // Group 1 control
                    m_control1 = data;
                    for (int i = 0; i < 4; i++) {
                        if ((data & 0x10) && (m_voi[i].eg_sect == 1))
                            m_voi[i].eg_sect = 0;
                        m_voi[i].eg_arm = data & 0x10;
                    }
                    m_EN_out16[0] = (data & 1) ? ~0u : 0;
                    m_EN_out8[0]  = (data & 2) ? ~0u : 0;
                    m_EN_out4[0]  = (data & 4) ? ~0u : 0;
                    m_EN_out2[0]  = (data & 8) ? ~0u : 0;
                    break;
                case 0x0d: // Group 2 control
                    m_control2 = data;
                    for (int i = 0; i < 4; i++) {
                        if ((data & 0x10) && (m_voi[i + 4].eg_sect == 1))
                            m_voi[i + 4].eg_sect = 0;
                        m_voi[i + 4].eg_arm = data & 0x10;
                    }
                    m_EN_out16[1] = (data & 1) ? ~0u : 0;
                    m_EN_out8[1]  = (data & 2) ? ~0u : 0;
                    m_EN_out4[1]  = (data & 4) ? ~0u : 0;
                    m_EN_out2[1]  = (data & 8) ? ~0u : 0;
                    break;
            }
        }
    }

    // ========================================================================
    // Envelope advance (from MAME, 1:1)
    // ========================================================================

    void EG_voices_advance() {
        for (int i = 0; i < 8; i++) {
            Voice& voi = m_voi[i];

            switch (voi.eg_sect) {
                case 0: // Attack (capacitor charge)
                    if (voi.eg < VMAX) {
                        voi.counter -= (int)((VMAX - voi.eg) / voi.ar_rate);
                        if (voi.counter <= 0) {
                            int n = -voi.counter / m_rate + 1;
                            voi.counter += n * m_rate;
                            if ((voi.eg += n) > VMAX)
                                voi.eg = VMAX;
                        }
                    }
                    // ARM=0: switch to decay at ~80% charge
                    if (!voi.eg_arm) {
                        if (voi.eg >= VMAX * 80 / 100)
                            voi.eg_sect = 1;
                    }
                    // ARM=1: sustain at max until key off
                    voi.egvol = voi.eg / 16;
                    break;

                case 1: // Decay (capacitor discharge)
                    if (voi.eg > VMIN) {
                        voi.counter -= (int)((voi.eg - VMIN) / voi.dr_rate);
                        if (voi.counter <= 0) {
                            int n = -voi.counter / m_rate + 1;
                            voi.counter += n * m_rate;
                            if ((voi.eg -= n) < VMIN)
                                voi.eg = VMIN;
                        }
                    } else {
                        voi.eg_sect = -1;
                    }
                    voi.egvol = voi.eg / 16;
                    break;

                case 2: // Release (capacitor discharge via rr_rate)
                    if (voi.eg > VMIN) {
                        voi.counter -= (int)((voi.eg - VMIN) / voi.rr_rate);
                        if (voi.counter <= 0) {
                            int n = -voi.counter / m_rate + 1;
                            voi.counter += n * m_rate;
                            if ((voi.eg -= n) < VMIN)
                                voi.eg = VMIN;
                        }
                    } else {
                        voi.eg_sect = -1;
                    }
                    voi.egvol = voi.eg / 16;
                    break;

                default:
                    break;
            }
        }
    }

    // ========================================================================
    // Tone generation (from MAME, 1:1)
    // ========================================================================

    void TG_group_advance(int groupidx, int& out_o2, int& out_o4, int& out_o8, int& out_o16) {
        Voice* voi = &m_voi[groupidx * 4];

        int o2 = 0, o4 = 0, o8 = 0, o16 = 0;

        for (int i = 4; i > 0; i--, voi++) {
            int ch_out2 = 0, ch_out4 = 0, ch_out8 = 0, ch_out16 = 0;

            if (voi->mode == 0) { // Tone mode
                int left = 1 << STEP_SH;
                do {
                    int nextevent = left;

                    if (voi->TG_cnt & voi->TG_out16) ch_out16 += voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out8)  ch_out8  += voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out4)  ch_out4  += voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out2)  ch_out2  += voi->TG_count;

                    voi->TG_count -= nextevent;

                    while (voi->TG_count <= 0) {
                        voi->TG_count += voi->TG_count_period;
                        voi->TG_cnt++;
                        if (voi->TG_cnt & voi->TG_out16) ch_out16 += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out8)  ch_out8  += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out4)  ch_out4  += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out2)  ch_out2  += voi->TG_count_period;

                        if (voi->TG_count > 0)
                            break;

                        voi->TG_count += voi->TG_count_period;
                        voi->TG_cnt++;
                        if (voi->TG_cnt & voi->TG_out16) ch_out16 += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out8)  ch_out8  += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out4)  ch_out4  += voi->TG_count_period;
                        if (voi->TG_cnt & voi->TG_out2)  ch_out2  += voi->TG_count_period;
                    }

                    if (voi->TG_cnt & voi->TG_out16) ch_out16 -= voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out8)  ch_out8  -= voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out4)  ch_out4  -= voi->TG_count;
                    if (voi->TG_cnt & voi->TG_out2)  ch_out2  -= voi->TG_count;

                    left -= nextevent;
                } while (left > 0);
            } else { // Noise mode
                if (m_noise_clocks & 8) ch_out16 += (1 << STEP_SH);
                if (m_noise_clocks & 4) ch_out8  += (1 << STEP_SH);
                if (m_noise_clocks & 2) ch_out4  += (1 << STEP_SH);
                if (m_noise_clocks & 1) ch_out2  += (1 << STEP_SH);
            }

            // Apply velocity scaling to envelope volume
            int voiceIdx = groupidx * 4 + (4 - i);
            int scaledEgvol = (int)(voi->egvol * m_channelVelocity[voiceIdx]);

            // Calculate signed output with envelope
            o16 += ((ch_out16 - (1 << (STEP_SH - 1))) * scaledEgvol) >> STEP_SH;
            o8  += ((ch_out8  - (1 << (STEP_SH - 1))) * scaledEgvol) >> STEP_SH;
            o4  += ((ch_out4  - (1 << (STEP_SH - 1))) * scaledEgvol) >> STEP_SH;
            o2  += ((ch_out2  - (1 << (STEP_SH - 1))) * scaledEgvol) >> STEP_SH;
        }

        // Apply output enable masks
        o16 &= m_EN_out16[groupidx];
        o8  &= m_EN_out8[groupidx];
        o4  &= m_EN_out4[groupidx];
        o2  &= m_EN_out2[groupidx];

        out_o2 = o2;
        out_o4 = o4;
        out_o8 = o8;
        out_o16 = o16;
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    float mixFeet(int o2, int o4, int o8, int o16) {
        // Normalize: egvol max=2048, 4 voices summed = ~8192 max per foot
        float scale = 1.0f / 8192.0f;

        switch (m_feetMix) {
            case 0: // All feet
                return (o2 + o4 + o8 + o16) * scale * 0.25f;
            case 1: // 8' + 16' only
                return (o8 + o16) * scale * 0.5f;
            case 2: // 8' only
                return o8 * scale;
            case 3: // 16' only
                return o16 * scale;
            default:
                return (o2 + o4 + o8 + o16) * scale * 0.25f;
        }
    }

    int findFreeChannel() {
        // First pass: find a channel with no note
        for (int ch = 0; ch < 8; ch++) {
            if (m_channelNote[ch] < 0 && m_voi[ch].eg_sect < 0)
                return ch;
        }
        // Second pass: find channel in release
        for (int ch = 0; ch < 8; ch++) {
            if (m_channelNote[ch] < 0)
                return ch;
        }
        // Steal oldest note
        int oldest = 0;
        uint32_t oldestAge = UINT32_MAX;
        for (int ch = 0; ch < 8; ch++) {
            if (m_channelAge[ch] < oldestAge) {
                oldestAge = m_channelAge[ch];
                oldest = ch;
            }
        }
        // Key off the stolen channel first
        chipWrite(oldest, 0x00);
        m_channelNote[oldest] = -1;
        return oldest;
    }

    void setArmMode(int arm) {
        // Set ARM bit in control registers (bit 4)
        // Also enable all feet by default (bits 0-3)
        uint8_t ctrl = (arm ? 0x10 : 0x00) | 0x0f;
        chipWrite(0x0c, ctrl); // group 1
        chipWrite(0x0d, ctrl); // group 2
    }

    void enableFeet(bool en2, bool en4, bool en8, bool en16) {
        uint8_t bits = 0;
        if (en16) bits |= 1;
        if (en8)  bits |= 2;
        if (en4)  bits |= 4;
        if (en2)  bits |= 8;
        uint8_t ctrl1 = (m_control1 & 0xf0) | bits;
        uint8_t ctrl2 = (m_control2 & 0xf0) | bits;
        chipWrite(0x0c, ctrl1);
        chipWrite(0x0d, ctrl2);
    }

    // ========================================================================
    // State
    // ========================================================================

    int m_sampleRate = 44100;
    int m_chipClock = DEFAULT_CHIP_CLOCK;
    int m_rate = 44100;

    Voice m_voi[8];
    double m_external_capacitance[8];

    uint32_t m_EN_out16[2];
    uint32_t m_EN_out8[2];
    uint32_t m_EN_out4[2];
    uint32_t m_EN_out2[2];

    int m_noise_cnt = 0;
    int m_noise_step = 0;
    int m_noise_rng = 1;
    int m_noise_clocks = 0;

    unsigned int m_UpdateStep = 0;

    double m_ar_tbl[8];
    double m_dr_tbl[16];

    uint8_t m_control1 = 0;
    uint8_t m_control2 = 0;
    int m_gate = 0;

    // MIDI state
    int m_channelNote[8] = {-1,-1,-1,-1,-1,-1,-1,-1};
    float m_channelVelocity[8] = {0,0,0,0,0,0,0,0};
    uint32_t m_channelAge[8] = {0,0,0,0,0,0,0,0};
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;

    // Mix parameters
    float m_volume = 0.8f;
    int m_feetMix = 0;
    float m_stereoWidth = 0.5f;
    bool m_noiseEnable = true;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(MSM5232Module) {
    emscripten::class_<MSM5232Synth>("MSM5232Synth")
        .constructor<>()
        .function("initialize", &MSM5232Synth::initialize)
        .function("process", &MSM5232Synth::process)
        .function("noteOn", &MSM5232Synth::noteOn)
        .function("noteOff", &MSM5232Synth::noteOff)
        .function("allNotesOff", &MSM5232Synth::allNotesOff)
        .function("setParameter", &MSM5232Synth::setParameter)
        .function("getParameter", &MSM5232Synth::getParameter)
        .function("controlChange", &MSM5232Synth::controlChange)
        .function("pitchBend", &MSM5232Synth::pitchBend)
        .function("programChange", &MSM5232Synth::programChange)
        .function("writeRegister", &MSM5232Synth::writeRegister)
        .function("setVolume", &MSM5232Synth::setVolume)
        .function("setFeetMix", &MSM5232Synth::setFeetMix)
        .function("setAttackRate", &MSM5232Synth::setAttackRate)
        .function("setDecayRate", &MSM5232Synth::setDecayRate);
}

#endif
