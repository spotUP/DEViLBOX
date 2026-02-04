/**
 * SN76477Synth.cpp - TI SN76477 Complex Sound Generator for WebAssembly
 * Based on MAME's SN76477 emulator by Zsolt Vasvari / Derrick Renaud
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The SN76477 (1978) is a purely analog sound effects generator used in:
 * - Space Invaders (Taito/Midway)
 * - Sheriff, Space Fever, Balloon Bomber
 * - Many other late-70s/early-80s arcade games
 *
 * All formulas were derived from measurements of real hardware.
 * See MAME source for original data points and curve fitting.
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

// Resistor/Capacitor helper macros (from MAME's rescap.h)
#define RES_R(r)    ((double)(r))
#define RES_K(r)    ((double)(r) * 1e3)
#define RES_M(r)    ((double)(r) * 1e6)
#define RES_INF     (-1.0)

#define CAP_U(c)    ((double)(c) * 1e-6)
#define CAP_N(c)    ((double)(c) * 1e-9)
#define CAP_P(c)    ((double)(c) * 1e-12)

namespace devilbox {

// ============================================================================
// Constants from MAME - all derived from real hardware measurements
// ============================================================================

static constexpr double ONE_SHOT_CAP_VOLTAGE_MIN   = 0.0;
static constexpr double ONE_SHOT_CAP_VOLTAGE_MAX   = 2.5;
static constexpr double ONE_SHOT_CAP_VOLTAGE_RANGE = ONE_SHOT_CAP_VOLTAGE_MAX - ONE_SHOT_CAP_VOLTAGE_MIN;

static constexpr double SLF_CAP_VOLTAGE_MIN        = 0.33;
static constexpr double SLF_CAP_VOLTAGE_MAX        = 2.37;
static constexpr double SLF_CAP_VOLTAGE_RANGE      = SLF_CAP_VOLTAGE_MAX - SLF_CAP_VOLTAGE_MIN;

static constexpr double VCO_MAX_EXT_VOLTAGE        = 2.35;
static constexpr double VCO_TO_SLF_VOLTAGE_DIFF    = 0.35;
static constexpr double VCO_CAP_VOLTAGE_MIN        = SLF_CAP_VOLTAGE_MIN;
static constexpr double VCO_CAP_VOLTAGE_MAX        = SLF_CAP_VOLTAGE_MAX + VCO_TO_SLF_VOLTAGE_DIFF;
static constexpr double VCO_CAP_VOLTAGE_RANGE      = VCO_CAP_VOLTAGE_MAX - VCO_CAP_VOLTAGE_MIN;
static constexpr double VCO_DUTY_CYCLE_50          = 5.0;
static constexpr double VCO_MIN_DUTY_CYCLE         = 18.0;

static constexpr double NOISE_MIN_CLOCK_RES        = RES_K(10);
static constexpr double NOISE_MAX_CLOCK_RES        = RES_M(3.3);
static constexpr double NOISE_CAP_VOLTAGE_MIN      = 0.0;
static constexpr double NOISE_CAP_VOLTAGE_MAX      = 5.0;
static constexpr double NOISE_CAP_VOLTAGE_RANGE    = NOISE_CAP_VOLTAGE_MAX - NOISE_CAP_VOLTAGE_MIN;
static constexpr double NOISE_CAP_HIGH_THRESHOLD   = 3.35;
static constexpr double NOISE_CAP_LOW_THRESHOLD    = 0.74;

static constexpr double AD_CAP_VOLTAGE_MIN         = 0.0;
static constexpr double AD_CAP_VOLTAGE_MAX         = 4.44;
static constexpr double AD_CAP_VOLTAGE_RANGE       = AD_CAP_VOLTAGE_MAX - AD_CAP_VOLTAGE_MIN;

static constexpr double OUT_CENTER_LEVEL_VOLTAGE   = 2.57;
static constexpr double OUT_HIGH_CLIP_THRESHOLD    = 3.51;
static constexpr double OUT_LOW_CLIP_THRESHOLD     = 0.715;

// Gain factors for output voltage in 0.1V increments (measured from real hardware)
static constexpr double out_pos_gain[45] = {
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.01,
    0.03, 0.11, 0.15, 0.19, 0.21, 0.23, 0.26, 0.29, 0.31, 0.33,
    0.36, 0.38, 0.41, 0.43, 0.46, 0.49, 0.52, 0.54, 0.57, 0.60,
    0.62, 0.65, 0.68, 0.70, 0.73, 0.76, 0.80, 0.82, 0.84, 0.87,
    0.90, 0.93, 0.96, 0.98, 1.00
};

static constexpr double out_neg_gain[45] = {
     0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00, -0.01,
    -0.02, -0.09, -0.13, -0.15, -0.17, -0.19, -0.22, -0.24, -0.26, -0.28,
    -0.30, -0.32, -0.34, -0.37, -0.39, -0.41, -0.44, -0.46, -0.48, -0.51,
    -0.53, -0.56, -0.58, -0.60, -0.62, -0.65, -0.67, -0.69, -0.72, -0.74,
    -0.76, -0.78, -0.81, -0.84, -0.85
};

// ============================================================================
// Mixer and Envelope mode names (for reference)
// ============================================================================
// Mixer modes (pins 25-27):
//   0=VCO, 1=SLF, 2=Noise, 3=VCO/Noise,
//   4=SLF/Noise, 5=SLF/VCO/Noise, 6=SLF/VCO, 7=Inhibit
//
// Envelope modes (pins 1,28):
//   0=VCO, 1=One-Shot, 2=Mixer Only, 3=VCO with Alternating Polarity

// ============================================================================
// Parameter IDs for the setParameter/getParameter interface
// ============================================================================
enum class SN76477Param {
    VCO_FREQ = 0,           // VCO frequency in Hz (convenience)
    SLF_FREQ = 1,           // SLF frequency in Hz (convenience)
    NOISE_FREQ = 2,         // Noise generator frequency in Hz (convenience)
    VCO_DUTY_CYCLE = 3,     // VCO duty cycle 0.18-1.0
    MIXER_MODE = 4,         // Mixer mode 0-7
    ENVELOPE_MODE = 5,      // Envelope mode 0-3
    ATTACK_TIME = 6,        // Attack time in seconds (convenience)
    DECAY_TIME = 7,         // Decay time in seconds (convenience)
    ONE_SHOT_TIME = 8,      // One-shot time in seconds (convenience)
    NOISE_FILTER_FREQ = 9,  // Noise filter frequency in Hz (convenience)
    AMPLITUDE = 10,         // Output amplitude 0-1
    VCO_MODE = 11,          // VCO mode: 0=external voltage, 1=SLF control
    ENABLE = 12,            // Enable: 0=enabled (active low), 1=disabled

    PARAM_COUNT = 13
};

// ============================================================================
// SN76477 Synthesizer - Standalone implementation
// ============================================================================
class SN76477Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;

    SN76477Synth()
        : m_sample_rate(48000)
        , m_isInitialized(false)
        // External interface (analog component values)
        , m_enable(1)  // disabled by default (active low)
        , m_envelope_mode(0)
        , m_vco_mode(0)
        , m_mixer_mode(0)
        // Component values - reasonable defaults for synth-like operation
        , m_one_shot_res(RES_K(100))
        , m_one_shot_cap(CAP_U(1))
        , m_one_shot_cap_voltage_ext(0)
        , m_slf_res(RES_K(100))
        , m_slf_cap(CAP_N(100))
        , m_slf_cap_voltage_ext(0)
        , m_vco_voltage(2.0)
        , m_vco_res(RES_K(100))
        , m_vco_cap(CAP_N(10))
        , m_vco_cap_voltage_ext(0)
        , m_noise_clock_res(RES_K(100))
        , m_noise_clock_ext(0)
        , m_noise_clock(0)
        , m_noise_filter_res(RES_K(100))
        , m_noise_filter_cap(CAP_N(10))
        , m_noise_filter_cap_voltage_ext(0)
        , m_attack_res(RES_K(100))
        , m_decay_res(RES_K(100))
        , m_attack_decay_cap(CAP_U(10))
        , m_attack_decay_cap_voltage_ext(0)
        , m_amplitude_res(RES_K(47))
        , m_feedback_res(RES_K(22))
        , m_pitch_voltage(VCO_DUTY_CYCLE_50)
        // Internal state
        , m_one_shot_cap_voltage(ONE_SHOT_CAP_VOLTAGE_MIN)
        , m_one_shot_running_ff(0)
        , m_slf_cap_voltage(SLF_CAP_VOLTAGE_MIN)
        , m_slf_out_ff(0)
        , m_vco_cap_voltage(VCO_CAP_VOLTAGE_MIN)
        , m_vco_out_ff(0)
        , m_vco_alt_pos_edge_ff(0)
        , m_noise_filter_cap_voltage(NOISE_CAP_VOLTAGE_MIN)
        , m_real_noise_bit_ff(0)
        , m_filtered_noise_bit_ff(0)
        , m_noise_gen_count(0)
        , m_attack_decay_cap_voltage(AD_CAP_VOLTAGE_MIN)
        , m_rng(0)
        // MIDI state
        , m_current_note(-1)
        , m_velocity(0)
        , m_output_gain(1.0)
    {}

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;
        initializeNoise();

        // Reset cap voltages
        m_one_shot_cap_voltage = ONE_SHOT_CAP_VOLTAGE_MIN;
        m_slf_cap_voltage = SLF_CAP_VOLTAGE_MIN;
        m_vco_cap_voltage = VCO_CAP_VOLTAGE_MIN;
        m_noise_filter_cap_voltage = NOISE_CAP_VOLTAGE_MIN;
        m_attack_decay_cap_voltage = AD_CAP_VOLTAGE_MIN;

        m_isInitialized = true;
    }

    bool isInitialized() const { return m_isInitialized; }
    int getSampleRate() const { return m_sample_rate; }

    // ========================================================================
    // Raw analog parameter setters (matching MAME's interface exactly)
    // All resistor values in Ohms, capacitor values in Farads, voltages in Volts
    // ========================================================================

    void setEnable(int state) {
        if (state != m_enable) {
            m_enable = state & 1;
            if (!m_enable) {
                // Falling edge: start attack phase and one-shot
                m_attack_decay_cap_voltage = AD_CAP_VOLTAGE_MIN;
                m_one_shot_running_ff = 1;
            }
        }
    }

    void setMixerMode(int a, int b, int c) {
        m_mixer_mode = (a & 1) | ((b & 1) << 1) | ((c & 1) << 2);
    }

    void setMixerModeValue(int mode) {
        m_mixer_mode = mode & 7;
    }

    void setEnvelopeMode(int env1, int env2) {
        m_envelope_mode = (env1 & 1) | ((env2 & 1) << 1);
    }

    void setEnvelopeModeValue(int mode) {
        m_envelope_mode = mode & 3;
    }

    void setVCOMode(int mode) { m_vco_mode = mode & 1; }

    void setOneShotRes(double ohms) { m_one_shot_res = ohms; }
    void setOneShotCap(double farads) { m_one_shot_cap = farads; }
    void setSLFRes(double ohms) { m_slf_res = ohms; }
    void setSLFCap(double farads) { m_slf_cap = farads; }
    void setVCORes(double ohms) { m_vco_res = ohms; }
    void setVCOCap(double farads) { m_vco_cap = farads; }
    void setVCOVoltage(double volts) { m_vco_voltage = clamp(volts, 0.0, 5.0); }
    void setPitchVoltage(double volts) { m_pitch_voltage = clamp(volts, 0.0, 5.0); }
    void setNoiseClockRes(double ohms) { m_noise_clock_res = ohms; }
    void setNoiseFilterRes(double ohms) { m_noise_filter_res = ohms; }
    void setNoiseFilterCap(double farads) { m_noise_filter_cap = farads; }
    void setAttackRes(double ohms) { m_attack_res = ohms; }
    void setDecayRes(double ohms) { m_decay_res = ohms; }
    void setAttackDecayCap(double farads) { m_attack_decay_cap = farads; }
    void setAmplitudeRes(double ohms) { m_amplitude_res = ohms; }
    void setFeedbackRes(double ohms) { m_feedback_res = ohms; }

    // ========================================================================
    // Convenience parameter setters (musician-friendly)
    // ========================================================================

    /** Set VCO frequency in Hz (adjusts vco_res with current vco_cap) */
    void setVCOFreq(double hz) {
        if (hz <= 0 || m_vco_cap <= 0) return;
        // From MAME: rate = 0.64 * 2 * VCO_CAP_VOLTAGE_RANGE / (vco_res * vco_cap)
        // VCO oscillates between VCO_CAP_VOLTAGE_MIN and vco_cap_voltage_max
        // min_freq = rate / (2 * VCO_CAP_VOLTAGE_RANGE)
        // min_freq = 0.64 / (vco_res * vco_cap)
        // vco_res = 0.64 / (freq * vco_cap)
        m_vco_res = 0.64 / (hz * m_vco_cap);
    }

    /** Set SLF frequency in Hz (adjusts slf_res with current slf_cap) */
    void setSLFFreq(double hz) {
        if (hz <= 0 || m_slf_cap <= 0) return;
        // From MAME: charging_time ≈ 0.5885 * R * C, discharging_time ≈ 0.5413 * R * C
        // Total period ≈ 1.1298 * R * C
        // R = 1 / (1.1298 * freq * C)
        m_slf_res = 1.0 / (1.1298 * hz * m_slf_cap);
    }

    /** Set noise generator frequency in Hz (adjusts noise_clock_res) */
    void setNoiseFreq(double hz) {
        if (hz <= 0) return;
        // From MAME: freq = 339100000 * pow(res, -0.8849)
        // res = pow(339100000 / freq, 1/0.8849)
        m_noise_clock_res = pow(339100000.0 / hz, 1.0 / 0.8849);
        m_noise_clock_res = clamp(m_noise_clock_res, NOISE_MIN_CLOCK_RES, NOISE_MAX_CLOCK_RES);
    }

    /** Set VCO duty cycle (0.18 to 1.0, where 0.5 is 50%) */
    void setVCODutyCycle(double duty) {
        duty = clamp(duty, VCO_MIN_DUTY_CYCLE / 100.0, 1.0);
        // From MAME: duty = 0.5 * (pitch_voltage / vco_voltage)
        // pitch_voltage = duty * 2 * vco_voltage
        if (m_vco_voltage > 0) {
            m_pitch_voltage = clamp(duty * 2.0 * m_vco_voltage, 0.0, 5.0);
        }
    }

    /** Set attack time in seconds (adjusts attack_res with current cap) */
    void setAttackTime(double seconds) {
        if (seconds <= 0 || m_attack_decay_cap <= 0) return;
        // From MAME: rate = AD_CAP_VOLTAGE_RANGE / (attack_res * cap)
        // time = cap * attack_res  (approximately)
        m_attack_res = seconds / m_attack_decay_cap;
    }

    /** Set decay time in seconds (adjusts decay_res with current cap) */
    void setDecayTime(double seconds) {
        if (seconds <= 0 || m_attack_decay_cap <= 0) return;
        m_decay_res = seconds / m_attack_decay_cap;
    }

    /** Set one-shot time in seconds (adjusts one_shot_res with current cap) */
    void setOneShotTime(double seconds) {
        if (seconds <= 0 || m_one_shot_cap <= 0) return;
        // From MAME: time = 0.8024 * R * C + 0.002079
        // R = (time - 0.002079) / (0.8024 * C)
        double r = (seconds - 0.002079) / (0.8024 * m_one_shot_cap);
        if (r > 0) m_one_shot_res = r;
    }

    /** Set noise filter frequency in Hz (adjusts noise_filter_res with current cap) */
    void setNoiseFilterFreq(double hz) {
        if (hz <= 0 || m_noise_filter_cap <= 0) return;
        // Approximate: charging_time ≈ 0.1571 * R * C, discharging ≈ 0.1331 * R * C
        // Total period ≈ 0.2902 * R * C
        // R = 1 / (0.2902 * freq * C)
        m_noise_filter_res = 1.0 / (0.2902 * hz * m_noise_filter_cap);
    }

    /** Set output amplitude 0-1 (adjusts amplitude_res relative to feedback_res) */
    void setAmplitude(double amp) {
        amp = clamp(amp, 0.0, 1.0);
        m_output_gain = amp;
    }

    // ========================================================================
    // Generic parameter interface
    // ========================================================================

    void setParameter(int paramId, float value) {
        if (!m_isInitialized) return;

        switch (static_cast<SN76477Param>(paramId)) {
            case SN76477Param::VCO_FREQ:
                setVCOFreq(value);
                break;
            case SN76477Param::SLF_FREQ:
                setSLFFreq(value);
                break;
            case SN76477Param::NOISE_FREQ:
                setNoiseFreq(value);
                break;
            case SN76477Param::VCO_DUTY_CYCLE:
                setVCODutyCycle(value);
                break;
            case SN76477Param::MIXER_MODE:
                setMixerModeValue(static_cast<int>(value));
                break;
            case SN76477Param::ENVELOPE_MODE:
                setEnvelopeModeValue(static_cast<int>(value));
                break;
            case SN76477Param::ATTACK_TIME:
                setAttackTime(value);
                break;
            case SN76477Param::DECAY_TIME:
                setDecayTime(value);
                break;
            case SN76477Param::ONE_SHOT_TIME:
                setOneShotTime(value);
                break;
            case SN76477Param::NOISE_FILTER_FREQ:
                setNoiseFilterFreq(value);
                break;
            case SN76477Param::AMPLITUDE:
                setAmplitude(value);
                break;
            case SN76477Param::VCO_MODE:
                setVCOMode(static_cast<int>(value));
                break;
            case SN76477Param::ENABLE:
                setEnable(static_cast<int>(value));
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) const {
        switch (static_cast<SN76477Param>(paramId)) {
            case SN76477Param::VCO_FREQ:
                return (m_vco_res > 0 && m_vco_cap > 0)
                    ? static_cast<float>(0.64 / (m_vco_res * m_vco_cap)) : 0.0f;
            case SN76477Param::SLF_FREQ: {
                if (m_slf_res <= 0 || m_slf_cap <= 0) return 0.0f;
                return static_cast<float>(1.0 / (1.1298 * m_slf_res * m_slf_cap));
            }
            case SN76477Param::NOISE_FREQ:
                return static_cast<float>(computeNoiseGenFreq());
            case SN76477Param::VCO_DUTY_CYCLE:
                return static_cast<float>(computeVCODutyCycle());
            case SN76477Param::MIXER_MODE:
                return static_cast<float>(m_mixer_mode);
            case SN76477Param::ENVELOPE_MODE:
                return static_cast<float>(m_envelope_mode);
            case SN76477Param::ATTACK_TIME:
                return (m_attack_res > 0 && m_attack_decay_cap > 0)
                    ? static_cast<float>(m_attack_res * m_attack_decay_cap) : 0.0f;
            case SN76477Param::DECAY_TIME:
                return (m_decay_res > 0 && m_attack_decay_cap > 0)
                    ? static_cast<float>(m_decay_res * m_attack_decay_cap) : 0.0f;
            case SN76477Param::AMPLITUDE:
                return static_cast<float>(m_output_gain);
            case SN76477Param::VCO_MODE:
                return static_cast<float>(m_vco_mode);
            case SN76477Param::ENABLE:
                return static_cast<float>(m_enable);
            default:
                return 0.0f;
        }
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (!m_isInitialized || velocity == 0) {
            noteOff(midiNote);
            return;
        }

        m_current_note = midiNote;
        m_velocity = velocity;

        // Convert MIDI note to VCO frequency
        double freq = 440.0 * pow(2.0, (midiNote - 69) / 12.0);
        setVCOFreq(freq);

        // Velocity affects output gain
        m_output_gain = (velocity / 127.0);

        // Enable the chip (active low)
        setEnable(0);
    }

    void noteOff(int midiNote) {
        if (midiNote == m_current_note || midiNote == 0) {
            // Disable the chip
            setEnable(1);
            m_current_note = -1;
        }
    }

    void allNotesOff() {
        setEnable(1);
        m_current_note = -1;
    }

    void controlChange(int cc, int value) {
        if (!m_isInitialized) return;
        double normalized = value / 127.0;

        switch (cc) {
            case 1:  // Mod wheel -> SLF frequency (0.1 - 50 Hz)
                setSLFFreq(0.1 + normalized * 49.9);
                break;
            case 2:  // Breath -> Noise frequency
                setNoiseFreq(100.0 + normalized * 99900.0);
                break;
            case 5:  // Portamento time -> VCO duty cycle
                setVCODutyCycle(0.18 + normalized * 0.82);
                break;
            case 71: // Resonance -> Noise filter frequency
                setNoiseFilterFreq(100.0 + normalized * 9900.0);
                break;
            case 73: // Attack time
                setAttackTime(0.001 + normalized * 2.0);
                break;
            case 75: // Decay time
                setDecayTime(0.001 + normalized * 2.0);
                break;
            case 76: // Mixer mode (quantized 0-7)
                setMixerModeValue(static_cast<int>(normalized * 7.49));
                break;
            case 77: // Envelope mode (quantized 0-3)
                setEnvelopeModeValue(static_cast<int>(normalized * 3.49));
                break;
            case 78: // VCO mode
                setVCOMode(value >= 64 ? 1 : 0);
                break;
            case 79: // One-shot time
                setOneShotTime(0.01 + normalized * 1.0);
                break;
            case 74: // Brightness -> VCO voltage (external control)
                setVCOVoltage(normalized * VCO_MAX_EXT_VOLTAGE);
                break;
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        if (!m_isInitialized || m_current_note < 0) return;

        double semitones = ((value - 8192) / 8192.0) * 2.0;
        double freq = 440.0 * pow(2.0, (m_current_note - 69 + semitones) / 12.0);
        setVCOFreq(freq);
    }

    void programChange(int program) {
        // Could load presets - different classic arcade sounds
        if (!m_isInitialized) return;

        switch (program) {
            case 0: // Space Invaders UFO
                setVCOFreq(200);
                setSLFFreq(2.0);
                setMixerModeValue(6); // SLF/VCO
                setEnvelopeModeValue(2); // Mixer only
                setVCOMode(1); // SLF controls VCO
                setAttackTime(0.01);
                setDecayTime(0.01);
                break;
            case 1: // Laser shot
                setVCOFreq(1000);
                setSLFFreq(5.0);
                setMixerModeValue(0); // VCO only
                setEnvelopeModeValue(1); // One-shot
                setVCOMode(0);
                setOneShotTime(0.3);
                setAttackTime(0.001);
                setDecayTime(0.2);
                break;
            case 2: // Explosion
                setNoiseFreq(5000);
                setNoiseFilterFreq(500);
                setMixerModeValue(2); // Noise only
                setEnvelopeModeValue(1); // One-shot
                setOneShotTime(0.8);
                setAttackTime(0.001);
                setDecayTime(0.5);
                break;
            case 3: // Siren
                setVCOFreq(500);
                setSLFFreq(1.0);
                setMixerModeValue(0); // VCO
                setEnvelopeModeValue(0); // VCO envelope
                setVCOMode(1); // SLF controls VCO
                setAttackTime(0.05);
                setDecayTime(0.05);
                break;
            case 4: // Engine rumble
                setNoiseFreq(1000);
                setNoiseFilterFreq(200);
                setSLFFreq(8.0);
                setMixerModeValue(4); // SLF/Noise
                setEnvelopeModeValue(2); // Mixer only
                setAttackTime(0.1);
                setDecayTime(0.1);
                break;
        }
    }

    // ========================================================================
    // Audio processing - faithfully recreates MAME's sound_stream_update
    // ========================================================================

    void process(float* outputL, float* outputR, int numSamples) {
        if (!outputL || !outputR || numSamples <= 0) return;
        if (numSamples > MAX_OUTPUT_SAMPLES) numSamples = MAX_OUTPUT_SAMPLES;

        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Pre-compute charging/discharging rates per sample
        double one_shot_cap_charging_step = computeOneShotCapChargingRate() / m_sample_rate;
        double one_shot_cap_discharging_step = computeOneShotCapDischargingRate() / m_sample_rate;

        double slf_cap_charging_step = computeSLFCapChargingRate() / m_sample_rate;
        double slf_cap_discharging_step = computeSLFCapDischargingRate() / m_sample_rate;

        double vco_duty_cycle_multiplier = (1.0 - computeVCODutyCycle()) * 2.0;
        double vco_rate = computeVCOCapChargingDischargingRate();
        double vco_cap_charging_step = (vco_duty_cycle_multiplier > 0)
            ? vco_rate / vco_duty_cycle_multiplier / m_sample_rate : 0;
        double vco_cap_discharging_step = vco_rate * vco_duty_cycle_multiplier / m_sample_rate;

        double noise_filter_cap_charging_step = computeNoiseFilterCapChargingRate() / m_sample_rate;
        double noise_filter_cap_discharging_step = computeNoiseFilterCapDischargingRate() / m_sample_rate;
        uint32_t noise_gen_freq = computeNoiseGenFreq();

        double attack_decay_cap_charging_step = computeAttackDecayCapChargingRate() / m_sample_rate;
        double attack_decay_cap_discharging_step = computeAttackDecayCapDischargingRate() / m_sample_rate;

        double center_to_peak_voltage_out = computeCenterToPeakVoltageOut();

        for (int i = 0; i < numSamples; i++) {
            // --- One-shot capacitor ---
            if (!m_one_shot_cap_voltage_ext) {
                if (m_one_shot_running_ff) {
                    m_one_shot_cap_voltage = std::min(
                        m_one_shot_cap_voltage + one_shot_cap_charging_step,
                        ONE_SHOT_CAP_VOLTAGE_MAX);
                } else {
                    m_one_shot_cap_voltage = std::max(
                        m_one_shot_cap_voltage - one_shot_cap_discharging_step,
                        ONE_SHOT_CAP_VOLTAGE_MIN);
                }
            }

            if (m_one_shot_cap_voltage >= ONE_SHOT_CAP_VOLTAGE_MAX) {
                m_one_shot_running_ff = 0;
            }

            // --- SLF (Super Low Frequency) oscillator ---
            if (!m_slf_cap_voltage_ext) {
                if (!m_slf_out_ff) {
                    m_slf_cap_voltage = std::min(
                        m_slf_cap_voltage + slf_cap_charging_step,
                        SLF_CAP_VOLTAGE_MAX);
                } else {
                    m_slf_cap_voltage = std::max(
                        m_slf_cap_voltage - slf_cap_discharging_step,
                        SLF_CAP_VOLTAGE_MIN);
                }
            }

            if (m_slf_cap_voltage >= SLF_CAP_VOLTAGE_MAX) {
                m_slf_out_ff = 1;
            } else if (m_slf_cap_voltage <= SLF_CAP_VOLTAGE_MIN) {
                m_slf_out_ff = 0;
            }

            // --- VCO (Voltage Controlled Oscillator) ---
            double vco_cap_voltage_max;
            if (m_vco_mode) {
                // VCO controlled by SLF
                vco_cap_voltage_max = m_slf_cap_voltage + VCO_TO_SLF_VOLTAGE_DIFF;
            } else {
                // VCO controlled by external voltage
                vco_cap_voltage_max = m_vco_voltage + VCO_TO_SLF_VOLTAGE_DIFF;
            }

            if (!m_vco_cap_voltage_ext) {
                if (!m_vco_out_ff) {
                    m_vco_cap_voltage = std::min(
                        m_vco_cap_voltage + vco_cap_charging_step,
                        vco_cap_voltage_max);
                } else {
                    m_vco_cap_voltage = std::max(
                        m_vco_cap_voltage - vco_cap_discharging_step,
                        VCO_CAP_VOLTAGE_MIN);
                }
            }

            if (m_vco_cap_voltage >= vco_cap_voltage_max) {
                if (!m_vco_out_ff) {
                    // Positive edge
                    m_vco_alt_pos_edge_ff = !m_vco_alt_pos_edge_ff;
                }
                m_vco_out_ff = 1;
            } else if (m_vco_cap_voltage <= VCO_CAP_VOLTAGE_MIN) {
                m_vco_out_ff = 0;
            }

            // --- Noise generator ---
            while (!m_noise_clock_ext && (m_noise_gen_count <= noise_gen_freq)) {
                m_noise_gen_count += m_sample_rate;
                m_real_noise_bit_ff = generateNextRealNoiseBit();
            }
            m_noise_gen_count -= noise_gen_freq;

            // --- Noise filter ---
            if (!m_noise_filter_cap_voltage_ext) {
                if (m_real_noise_bit_ff) {
                    m_noise_filter_cap_voltage = std::min(
                        m_noise_filter_cap_voltage + noise_filter_cap_charging_step,
                        NOISE_CAP_VOLTAGE_MAX);
                } else {
                    m_noise_filter_cap_voltage = std::max(
                        m_noise_filter_cap_voltage - noise_filter_cap_discharging_step,
                        NOISE_CAP_VOLTAGE_MIN);
                }
            }

            if (m_noise_filter_cap_voltage >= NOISE_CAP_HIGH_THRESHOLD) {
                m_filtered_noise_bit_ff = 0;
            } else if (m_noise_filter_cap_voltage <= NOISE_CAP_LOW_THRESHOLD) {
                m_filtered_noise_bit_ff = 1;
            }

            // --- Envelope (attack/decay direction) ---
            int attack_decay_cap_charging;
            switch (m_envelope_mode) {
                case 0:  // VCO
                    attack_decay_cap_charging = m_vco_out_ff;
                    break;
                case 1:  // One-shot
                    attack_decay_cap_charging = m_one_shot_running_ff;
                    break;
                case 2:  // Mixer only (always attack)
                default:
                    attack_decay_cap_charging = 1;
                    break;
                case 3:  // VCO with alternating polarity
                    attack_decay_cap_charging = m_vco_out_ff && m_vco_alt_pos_edge_ff;
                    break;
            }

            // --- Attack/Decay cap voltage ---
            if (!m_attack_decay_cap_voltage_ext) {
                if (attack_decay_cap_charging) {
                    if (attack_decay_cap_charging_step > 0) {
                        m_attack_decay_cap_voltage = std::min(
                            m_attack_decay_cap_voltage + attack_decay_cap_charging_step,
                            AD_CAP_VOLTAGE_MAX);
                    } else {
                        m_attack_decay_cap_voltage = AD_CAP_VOLTAGE_MAX;
                    }
                } else {
                    if (attack_decay_cap_discharging_step > 0) {
                        m_attack_decay_cap_voltage = std::max(
                            m_attack_decay_cap_voltage - attack_decay_cap_discharging_step,
                            AD_CAP_VOLTAGE_MIN);
                    } else {
                        m_attack_decay_cap_voltage = AD_CAP_VOLTAGE_MIN;
                    }
                }
            }

            // --- Mixer and output ---
            double voltage_out;
            if (!m_enable && (m_vco_cap_voltage <= VCO_CAP_VOLTAGE_MAX)) {
                uint32_t out;
                switch (m_mixer_mode) {
                    case 0: out = m_vco_out_ff; break;
                    case 1: out = m_slf_out_ff; break;
                    case 2: out = m_filtered_noise_bit_ff; break;
                    case 3: out = m_vco_out_ff & m_filtered_noise_bit_ff; break;
                    case 4: out = m_slf_out_ff & m_filtered_noise_bit_ff; break;
                    case 5: out = m_vco_out_ff & m_slf_out_ff & m_filtered_noise_bit_ff; break;
                    case 6: out = m_vco_out_ff & m_slf_out_ff; break;
                    case 7:
                    default: out = 0; break;
                }

                // Compute output voltage from attack/decay cap and gain tables
                int ad_index = static_cast<int>(m_attack_decay_cap_voltage * 10.0);
                ad_index = std::max(0, std::min(ad_index, 44));

                if (out) {
                    voltage_out = OUT_CENTER_LEVEL_VOLTAGE +
                        center_to_peak_voltage_out * out_pos_gain[ad_index];
                    voltage_out = std::min(voltage_out, OUT_HIGH_CLIP_THRESHOLD);
                } else {
                    voltage_out = OUT_CENTER_LEVEL_VOLTAGE +
                        center_to_peak_voltage_out * out_neg_gain[ad_index];
                    voltage_out = std::max(voltage_out, OUT_LOW_CLIP_THRESHOLD);
                }
            } else {
                // Disabled
                voltage_out = OUT_CENTER_LEVEL_VOLTAGE;
            }

            // Convert to normalized float [-1, 1] (same formula as MAME)
            double sample = ((voltage_out - OUT_LOW_CLIP_THRESHOLD) /
                           (OUT_CENTER_LEVEL_VOLTAGE - OUT_LOW_CLIP_THRESHOLD)) - 1.0;

            // Apply output gain
            sample *= m_output_gain;

            // Clamp
            sample = clamp(sample, -1.0, 1.0);

            float out = static_cast<float>(sample);
            outputL[i] = out;
            outputR[i] = out;
        }
    }

    // JavaScript-friendly process method
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

private:
    // ========================================================================
    // Compute functions - derived from real hardware measurements (from MAME)
    // ========================================================================

    double computeOneShotCapChargingRate() const {
        double ret = 0;
        if (m_one_shot_res > 0 && m_one_shot_cap > 0) {
            ret = ONE_SHOT_CAP_VOLTAGE_RANGE / (0.8024 * m_one_shot_res * m_one_shot_cap + 0.002079);
        } else if (m_one_shot_cap > 0) {
            ret = 1e-30;
        } else if (m_one_shot_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeOneShotCapDischargingRate() const {
        double ret = 0;
        if (m_one_shot_res > 0 && m_one_shot_cap > 0) {
            ret = ONE_SHOT_CAP_VOLTAGE_RANGE / (854.7 * m_one_shot_cap + 0.00001795);
        } else if (m_one_shot_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeSLFCapChargingRate() const {
        double ret = 0;
        if (m_slf_res > 0 && m_slf_cap > 0) {
            ret = SLF_CAP_VOLTAGE_RANGE / (0.5885 * m_slf_res * m_slf_cap + 0.001300);
        }
        return ret;
    }

    double computeSLFCapDischargingRate() const {
        double ret = 0;
        if (m_slf_res > 0 && m_slf_cap > 0) {
            ret = SLF_CAP_VOLTAGE_RANGE / (0.5413 * m_slf_res * m_slf_cap + 0.001343);
        }
        return ret;
    }

    double computeVCOCapChargingDischargingRate() const {
        double ret = 0;
        if (m_vco_res > 0 && m_vco_cap > 0) {
            ret = 0.64 * 2.0 * VCO_CAP_VOLTAGE_RANGE / (m_vco_res * m_vco_cap);
        }
        return ret;
    }

    double computeVCODutyCycle() const {
        double ret = 0.5;
        if (m_vco_voltage > 0 && m_pitch_voltage != VCO_DUTY_CYCLE_50) {
            ret = std::max(0.5 * (m_pitch_voltage / m_vco_voltage), VCO_MIN_DUTY_CYCLE / 100.0);
            ret = std::min(ret, 1.0);
        }
        return ret;
    }

    uint32_t computeNoiseGenFreq() const {
        uint32_t ret = 0;
        if (m_noise_clock_res >= NOISE_MIN_CLOCK_RES &&
            m_noise_clock_res <= NOISE_MAX_CLOCK_RES) {
            ret = static_cast<uint32_t>(339100000.0 * pow(m_noise_clock_res, -0.8849));
        }
        return ret;
    }

    double computeNoiseFilterCapChargingRate() const {
        double ret = 0;
        if (m_noise_filter_res > 0 && m_noise_filter_cap > 0) {
            ret = NOISE_CAP_VOLTAGE_RANGE / (0.1571 * m_noise_filter_res * m_noise_filter_cap + 0.00001430);
        } else if (m_noise_filter_cap > 0) {
            ret = 1e-30;
        } else if (m_noise_filter_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeNoiseFilterCapDischargingRate() const {
        double ret = 0;
        if (m_noise_filter_res > 0 && m_noise_filter_cap > 0) {
            ret = NOISE_CAP_VOLTAGE_RANGE / (0.1331 * m_noise_filter_res * m_noise_filter_cap + 0.00001734);
        } else if (m_noise_filter_cap > 0) {
            ret = 1e-30;
        } else if (m_noise_filter_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeAttackDecayCapChargingRate() const {
        double ret = 0;
        if (m_attack_res > 0 && m_attack_decay_cap > 0) {
            ret = AD_CAP_VOLTAGE_RANGE / (m_attack_res * m_attack_decay_cap);
        } else if (m_attack_decay_cap > 0) {
            ret = 1e-30;
        } else if (m_attack_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeAttackDecayCapDischargingRate() const {
        double ret = 0;
        if (m_decay_res > 0 && m_attack_decay_cap > 0) {
            ret = AD_CAP_VOLTAGE_RANGE / (m_decay_res * m_attack_decay_cap);
        } else if (m_attack_decay_cap > 0) {
            ret = 1e-30;
        } else if (m_decay_res > 0) {
            ret = 1e+30;
        }
        return ret;
    }

    double computeCenterToPeakVoltageOut() const {
        double ret = 0;
        if (m_amplitude_res > 0) {
            ret = 3.818 * (m_feedback_res / m_amplitude_res) + 0.03;
        }
        return ret;
    }

    // ========================================================================
    // Noise generator (31-bit LFSR from MAME)
    // ========================================================================

    void initializeNoise() {
        m_rng = 0;
    }

    uint32_t generateNextRealNoiseBit() {
        uint32_t out = ((m_rng >> 28) & 1) ^ ((m_rng >> 0) & 1);

        // If bits 0-4 and 28 are all zero, force output to 1
        if ((m_rng & 0x1000001f) == 0) {
            out = 1;
        }

        m_rng = (m_rng >> 1) | (out << 30);
        return out;
    }

    // ========================================================================
    // Utility
    // ========================================================================

    static double clamp(double val, double lo, double hi) {
        return (val < lo) ? lo : (val > hi) ? hi : val;
    }

    // ========================================================================
    // State
    // ========================================================================

    int m_sample_rate;
    bool m_isInitialized;

    // External interface (component values)
    uint32_t m_enable;
    uint32_t m_envelope_mode;
    uint32_t m_vco_mode;
    uint32_t m_mixer_mode;

    double m_one_shot_res;
    double m_one_shot_cap;
    uint32_t m_one_shot_cap_voltage_ext;

    double m_slf_res;
    double m_slf_cap;
    uint32_t m_slf_cap_voltage_ext;

    double m_vco_voltage;
    double m_vco_res;
    double m_vco_cap;
    uint32_t m_vco_cap_voltage_ext;

    double m_noise_clock_res;
    uint32_t m_noise_clock_ext;
    uint32_t m_noise_clock;
    double m_noise_filter_res;
    double m_noise_filter_cap;
    uint32_t m_noise_filter_cap_voltage_ext;

    double m_attack_res;
    double m_decay_res;
    double m_attack_decay_cap;
    uint32_t m_attack_decay_cap_voltage_ext;

    double m_amplitude_res;
    double m_feedback_res;
    double m_pitch_voltage;

    // Internal state
    double m_one_shot_cap_voltage;
    uint32_t m_one_shot_running_ff;

    double m_slf_cap_voltage;
    uint32_t m_slf_out_ff;

    double m_vco_cap_voltage;
    uint32_t m_vco_out_ff;
    uint32_t m_vco_alt_pos_edge_ff;

    double m_noise_filter_cap_voltage;
    uint32_t m_real_noise_bit_ff;
    uint32_t m_filtered_noise_bit_ff;
    uint32_t m_noise_gen_count;

    double m_attack_decay_cap_voltage;

    uint32_t m_rng;

    // MIDI state
    int m_current_note;
    int m_velocity;
    double m_output_gain;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(SN76477Synth_bindings) {
    emscripten::class_<devilbox::SN76477Synth>("SN76477Synth")
        .constructor<>()
        .function("initialize", &devilbox::SN76477Synth::initialize)
        .function("isInitialized", &devilbox::SN76477Synth::isInitialized)
        .function("getSampleRate", &devilbox::SN76477Synth::getSampleRate)
        // MIDI interface
        .function("noteOn", &devilbox::SN76477Synth::noteOn)
        .function("noteOff", &devilbox::SN76477Synth::noteOff)
        .function("allNotesOff", &devilbox::SN76477Synth::allNotesOff)
        .function("controlChange", &devilbox::SN76477Synth::controlChange)
        .function("pitchBend", &devilbox::SN76477Synth::pitchBend)
        .function("programChange", &devilbox::SN76477Synth::programChange)
        // Generic parameter interface
        .function("setParameter", &devilbox::SN76477Synth::setParameter)
        .function("getParameter", &devilbox::SN76477Synth::getParameter)
        // Audio processing
        .function("process", &devilbox::SN76477Synth::processJS)
        // Convenience setters (musician-friendly)
        .function("setVCOFreq", &devilbox::SN76477Synth::setVCOFreq)
        .function("setSLFFreq", &devilbox::SN76477Synth::setSLFFreq)
        .function("setNoiseFreq", &devilbox::SN76477Synth::setNoiseFreq)
        .function("setVCODutyCycle", &devilbox::SN76477Synth::setVCODutyCycle)
        .function("setAttackTime", &devilbox::SN76477Synth::setAttackTime)
        .function("setDecayTime", &devilbox::SN76477Synth::setDecayTime)
        .function("setOneShotTime", &devilbox::SN76477Synth::setOneShotTime)
        .function("setNoiseFilterFreq", &devilbox::SN76477Synth::setNoiseFilterFreq)
        .function("setAmplitude", &devilbox::SN76477Synth::setAmplitude)
        // Mode setters
        .function("setMixerModeValue", &devilbox::SN76477Synth::setMixerModeValue)
        .function("setEnvelopeModeValue", &devilbox::SN76477Synth::setEnvelopeModeValue)
        .function("setVCOMode", &devilbox::SN76477Synth::setVCOMode)
        .function("setEnable", &devilbox::SN76477Synth::setEnable)
        // Raw analog setters (for hardware-accurate control)
        .function("setVCORes", &devilbox::SN76477Synth::setVCORes)
        .function("setVCOCap", &devilbox::SN76477Synth::setVCOCap)
        .function("setVCOVoltage", &devilbox::SN76477Synth::setVCOVoltage)
        .function("setPitchVoltage", &devilbox::SN76477Synth::setPitchVoltage)
        .function("setSLFRes", &devilbox::SN76477Synth::setSLFRes)
        .function("setSLFCap", &devilbox::SN76477Synth::setSLFCap)
        .function("setNoiseClockRes", &devilbox::SN76477Synth::setNoiseClockRes)
        .function("setNoiseFilterRes", &devilbox::SN76477Synth::setNoiseFilterRes)
        .function("setNoiseFilterCap", &devilbox::SN76477Synth::setNoiseFilterCap)
        .function("setAttackRes", &devilbox::SN76477Synth::setAttackRes)
        .function("setDecayRes", &devilbox::SN76477Synth::setDecayRes)
        .function("setAttackDecayCap", &devilbox::SN76477Synth::setAttackDecayCap)
        .function("setOneShotRes", &devilbox::SN76477Synth::setOneShotRes)
        .function("setOneShotCap", &devilbox::SN76477Synth::setOneShotCap)
        .function("setAmplitudeRes", &devilbox::SN76477Synth::setAmplitudeRes)
        .function("setFeedbackRes", &devilbox::SN76477Synth::setFeedbackRes);
}
#endif
