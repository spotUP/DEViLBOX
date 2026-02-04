/**
 * CEM3394Synth.cpp - Curtis Electromusic CEM3394 Synthesizer Voice for WebAssembly
 * Based on MAME's CEM3394 emulator by Aaron Giles
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The CEM3394 is a digitally-controlled analog synthesizer voice chip used in:
 * - Sequential Circuits Prophet VS, Matrix-6, Prelude
 * - Ensoniq ESQ-1, SQ-80
 * - Oberheim Matrix-1000
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

// Helper for older compilers that don't have clamp_value
template<typename T>
inline T clamp_value(T val, T lo, T hi) {
    return (val < lo) ? lo : (val > hi) ? hi : val;
}

namespace devilbox {

// Volume scaling constants from MAME
static constexpr double PULSE_VOLUME = 0.25;
static constexpr double SAWTOOTH_VOLUME = PULSE_VOLUME * 1.27;
static constexpr double TRIANGLE_VOLUME = SAWTOOTH_VOLUME * 1.27;
static constexpr double EXTERNAL_VOLUME = PULSE_VOLUME;

// Waveform flags
static constexpr int WAVE_TRIANGLE = 1;
static constexpr int WAVE_SAWTOOTH = 2;
static constexpr int WAVE_PULSE = 4;

/**
 * CEM3394 Parameter IDs
 */
enum class CEM3394Param {
    VCO_FREQUENCY = 0,      // VCO frequency (Hz)
    MODULATION_AMOUNT = 1,  // Filter modulation from VCO (0-2)
    WAVE_SELECT = 2,        // Waveform selection voltage
    PULSE_WIDTH = 3,        // Pulse width (0-1)
    MIXER_BALANCE = 4,      // Internal/external balance
    FILTER_RESONANCE = 5,   // Filter resonance (0-1)
    FILTER_FREQUENCY = 6,   // Filter cutoff (Hz)
    FINAL_GAIN = 7,         // Output volume (dB)

    PARAM_COUNT = 8
};

/**
 * CEM3394 Synthesizer Voice - Standalone implementation
 */
class CEM3394Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;

    CEM3394Synth()
        : m_sample_rate(48000)
        , m_inv_sample_rate(1.0 / 48000.0)
        , m_isInitialized(false)
        , m_vco_zero_freq(500.0)
        , m_filter_zero_freq(1300.0)
        , m_hpf_k(0)
        , m_wave_select(0)
        , m_volume(0)
        , m_mixer_internal(1.0)
        , m_mixer_external(0)
        , m_vco_position(0)
        , m_vco_step(0)
        , m_filter_frequency(1300)
        , m_filter_modulation(0)
        , m_filter_resonance(0)
        , m_pulse_width(0.5)
        , m_hpf_mem(0)
        , m_current_note(-1)
        , m_velocity(0)
        , m_gate(false)
    {
        std::fill(std::begin(m_filter_in), std::end(m_filter_in), 0.0);
        std::fill(std::begin(m_filter_out), std::end(m_filter_out), 0.0);
        std::fill(std::begin(m_values), std::end(m_values), 0.0);
    }

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;
        m_inv_sample_rate = 1.0 / sampleRate;

        // Configure with default component values (from MAME datasheet example)
        configure(270E3, 2E-9, 33E-9, 4.7E-6);

        // Set default values
        setVCOFrequency(440.0);
        setWaveSelect(WAVE_SAWTOOTH | WAVE_PULSE);
        setPulseWidth(0.5);
        setFilterFrequency(2000.0);
        setFilterResonance(0.3);
        setVolume(-6.0);  // -6 dB

        m_isInitialized = true;
    }

    bool isInitialized() const { return m_isInitialized; }
    int getSampleRate() const { return m_sample_rate; }

    /**
     * Configure component values (advanced)
     * @param r_vco Pin 1 - Resistor to VEE
     * @param c_vco Pin 4 - VCO timing capacitor
     * @param c_vcf Pin 12/13/14 - VCF capacitor
     * @param c_ac Pin 17 - AC coupling capacitor
     */
    void configure(double r_vco, double c_vco, double c_vcf, double c_ac) {
        // Datasheet equation for Fout at CV = 0
        m_vco_zero_freq = 1.3 / (5.0 * r_vco * c_vco);

        // Datasheet equation for filter zero frequency
        m_filter_zero_freq = 4.3E-5 / c_vcf;

        // High-pass filter coefficient for AC coupling
        constexpr double R_AC = 11E3;  // Internal AC coupling resistor
        m_hpf_k = 1.0 - exp((-1 / (R_AC * c_ac)) * m_inv_sample_rate);
    }

    // Direct parameter setters
    void setVCOFrequency(double freq) {
        m_vco_step = freq * m_inv_sample_rate;
    }

    void setWaveSelect(int waves) {
        m_wave_select = waves;
    }

    void setPulseWidth(double width) {
        m_pulse_width = clamp_value(width, 0.0, 1.0);
    }

    void setMixerBalance(double internal, double external) {
        m_mixer_internal = clamp_value(internal, 0.0, 1.0);
        m_mixer_external = clamp_value(external, 0.0, 1.0);
    }

    void setFilterFrequency(double freq) {
        m_filter_frequency = clamp_value(freq, 20.0, 20000.0);
    }

    void setFilterResonance(double res) {
        m_filter_resonance = clamp_value(res, 0.0, 1.0);
    }

    void setFilterModulation(double mod) {
        m_filter_modulation = clamp_value(mod, 0.0, 2.0);
    }

    void setVolume(double db) {
        // Convert dB to linear (0dB = 1.0, -90dB = 0.0)
        if (db <= -90.0) {
            m_volume = 0.0;
        } else if (db >= 0.0) {
            m_volume = 1.0;
        } else {
            m_volume = pow(10.0, db / 20.0);
        }
    }

    // MIDI-style interface
    void noteOn(int midiNote, int velocity) {
        if (!m_isInitialized || velocity == 0) {
            noteOff(midiNote);
            return;
        }

        m_current_note = midiNote;
        m_velocity = velocity;
        m_gate = true;

        // Convert MIDI note to frequency
        double freq = 440.0 * pow(2.0, (midiNote - 69) / 12.0);
        setVCOFrequency(freq);

        // Velocity affects volume
        double velGain = (velocity / 127.0);
        m_volume = velGain * velGain;  // Quadratic curve for more natural response
    }

    void noteOff(int midiNote) {
        if (midiNote == m_current_note) {
            m_gate = false;
            // For now, immediate release - could add envelope later
        }
    }

    void allNotesOff() {
        m_gate = false;
        m_current_note = -1;
    }

    void setParameter(int paramId, float value) {
        if (!m_isInitialized) return;

        switch (static_cast<CEM3394Param>(paramId)) {
            case CEM3394Param::VCO_FREQUENCY:
                setVCOFrequency(value);
                break;
            case CEM3394Param::MODULATION_AMOUNT:
                setFilterModulation(value);
                break;
            case CEM3394Param::WAVE_SELECT:
                setWaveSelect(static_cast<int>(value));
                break;
            case CEM3394Param::PULSE_WIDTH:
                setPulseWidth(value);
                break;
            case CEM3394Param::MIXER_BALANCE:
                setMixerBalance(1.0 - value, value);  // 0 = internal, 1 = external
                break;
            case CEM3394Param::FILTER_RESONANCE:
                setFilterResonance(value);
                break;
            case CEM3394Param::FILTER_FREQUENCY:
                setFilterFrequency(value);
                break;
            case CEM3394Param::FINAL_GAIN:
                setVolume(value);
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) const {
        switch (static_cast<CEM3394Param>(paramId)) {
            case CEM3394Param::VCO_FREQUENCY:
                return static_cast<float>(m_vco_step / m_inv_sample_rate);
            case CEM3394Param::MODULATION_AMOUNT:
                return static_cast<float>(m_filter_modulation);
            case CEM3394Param::WAVE_SELECT:
                return static_cast<float>(m_wave_select);
            case CEM3394Param::PULSE_WIDTH:
                return static_cast<float>(m_pulse_width);
            case CEM3394Param::FILTER_RESONANCE:
                return static_cast<float>(m_filter_resonance);
            case CEM3394Param::FILTER_FREQUENCY:
                return static_cast<float>(m_filter_frequency);
            default:
                return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        if (!m_isInitialized) return;

        double normalized = value / 127.0;
        switch (cc) {
            case 1:  // Mod wheel -> Filter modulation
                setFilterModulation(normalized * 2.0);
                break;
            case 71: // Resonance
                setFilterResonance(normalized);
                break;
            case 74: // Brightness (filter cutoff)
                setFilterFrequency(100.0 + normalized * 9900.0);
                break;
            case 91: // Pulse width
                setPulseWidth(normalized);
                break;
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        if (!m_isInitialized || m_current_note < 0) return;

        // Convert 14-bit value to semitones (-2 to +2)
        double semitones = ((value - 8192) / 8192.0) * 2.0;
        double freq = 440.0 * pow(2.0, (m_current_note - 69 + semitones) / 12.0);
        setVCOFrequency(freq);
    }

    void programChange(int program) {
        // Could load presets
    }

    /**
     * Main audio processing - generates stereo output
     */
    void process(float* outputL, float* outputR, int numSamples) {
        if (!outputL || !outputR || numSamples <= 0) return;

        if (numSamples > MAX_OUTPUT_SAMPLES) {
            numSamples = MAX_OUTPUT_SAMPLES;
        }

        if (!m_isInitialized || !m_gate) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        for (int i = 0; i < numSamples; i++) {
            // Get current VCO position and advance
            double vco_position = m_vco_position;
            m_vco_position += m_vco_step;

            // Wrap VCO position
            if (m_vco_position >= 1.0) {
                m_vco_position -= floor(m_vco_position);
            }

            double result = 0.0;

            // Pulse wave
            if (m_wave_select & WAVE_PULSE) {
                if (vco_position < m_pulse_width) {
                    result += (1.0 - m_pulse_width) * PULSE_VOLUME * m_mixer_internal;
                } else {
                    result += (0.0 - m_pulse_width) * PULSE_VOLUME * m_mixer_internal;
                }
            }

            // Sawtooth wave
            if (m_wave_select & WAVE_SAWTOOTH) {
                result += SAWTOOTH_VOLUME * m_mixer_internal * (vco_position - 0.5);
            }

            // Triangle wave (also used for filter modulation)
            double triangle = 2.0 * vco_position;
            if (triangle > 1.0) {
                triangle = 2.0 - triangle;
            }
            triangle -= 0.5;

            if (m_wave_select & WAVE_TRIANGLE) {
                result += TRIANGLE_VOLUME * m_mixer_internal * triangle;
            }

            // Scale to [-1, 1] range
            result *= 2.0;

            // Apply filter with modulation
            double filter_freq = m_filter_frequency * (1.0 + m_filter_modulation * triangle);
            result = filter(result, filter_freq);

            // Apply AC coupling (high-pass filter)
            result = hpf(result);

            // Apply volume
            result *= m_volume;

            // Output (mono to stereo)
            float sample = static_cast<float>(clamp_value(result, -1.0, 1.0));
            outputL[i] = sample;
            outputR[i] = sample;
        }
    }

    // JavaScript-friendly process method
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

private:
    /**
     * State-Variable Trapezoidal Filter (from MAME)
     */
    double filter(double input, double cutoff) {
        cutoff = clamp_value(cutoff, 50.0, 20000.0);

        double outscale = 1.0;
        double res = m_filter_resonance;
        if (res > 0.99) {
            if (m_wave_select) {
                res = 0.99;
            }
            outscale = 0.5;
        }

        double g = tan(M_PI * cutoff * m_inv_sample_rate);
        double k = 2.0 - 2.0 * res;
        double a1 = 1.0 / (1.0 + g * (g + k));
        double a2 = g * a1;
        double a3 = g * a2;
        double v3 = input - m_filter_out[1];
        double v1 = a1 * m_filter_out[0] + a2 * v3;
        double v2 = m_filter_out[1] + a2 * m_filter_out[0] + a3 * v3;
        m_filter_out[0] = 2.0 * v1 - m_filter_out[0];
        m_filter_out[1] = 2.0 * v2 - m_filter_out[1];

        double output = v2 * outscale;

        // Handle NaN
        if (std::isnan(output)) {
            output = 0.0;
            m_filter_out[0] = m_filter_out[1] = 0.0;
        }
        // Clamp extreme values
        else if (fabs(output) > 1.0) {
            double scale = 1.0 / fabs(output);
            output *= scale;
            m_filter_out[0] *= scale;
            m_filter_out[1] *= scale;
        }

        return output;
    }

    /**
     * High-pass filter for AC coupling (from MAME)
     */
    double hpf(double input) {
        m_hpf_mem += (input - m_hpf_mem) * m_hpf_k;
        return input - m_hpf_mem;
    }

    // Configuration
    int m_sample_rate;
    double m_inv_sample_rate;
    bool m_isInitialized;

    // Component-derived values
    double m_vco_zero_freq;
    double m_filter_zero_freq;
    double m_hpf_k;

    // Synthesis state
    int m_wave_select;
    double m_volume;
    double m_mixer_internal;
    double m_mixer_external;
    double m_vco_position;
    double m_vco_step;
    double m_filter_frequency;
    double m_filter_modulation;
    double m_filter_resonance;
    double m_filter_in[4];
    double m_filter_out[4];
    double m_pulse_width;
    double m_hpf_mem;

    // MIDI state
    int m_current_note;
    int m_velocity;
    bool m_gate;

    // Parameter storage
    double m_values[8];
};

} // namespace devilbox

// Emscripten bindings
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(CEM3394Synth_bindings) {
    emscripten::class_<devilbox::CEM3394Synth>("CEM3394Synth")
        .constructor<>()
        .function("initialize", &devilbox::CEM3394Synth::initialize)
        .function("isInitialized", &devilbox::CEM3394Synth::isInitialized)
        .function("getSampleRate", &devilbox::CEM3394Synth::getSampleRate)
        .function("noteOn", &devilbox::CEM3394Synth::noteOn)
        .function("noteOff", &devilbox::CEM3394Synth::noteOff)
        .function("allNotesOff", &devilbox::CEM3394Synth::allNotesOff)
        .function("setParameter", &devilbox::CEM3394Synth::setParameter)
        .function("getParameter", &devilbox::CEM3394Synth::getParameter)
        .function("controlChange", &devilbox::CEM3394Synth::controlChange)
        .function("pitchBend", &devilbox::CEM3394Synth::pitchBend)
        .function("programChange", &devilbox::CEM3394Synth::programChange)
        .function("process", &devilbox::CEM3394Synth::processJS)
        // Direct parameter setters for advanced use
        .function("setVCOFrequency", &devilbox::CEM3394Synth::setVCOFrequency)
        .function("setWaveSelect", &devilbox::CEM3394Synth::setWaveSelect)
        .function("setPulseWidth", &devilbox::CEM3394Synth::setPulseWidth)
        .function("setFilterFrequency", &devilbox::CEM3394Synth::setFilterFrequency)
        .function("setFilterResonance", &devilbox::CEM3394Synth::setFilterResonance)
        .function("setFilterModulation", &devilbox::CEM3394Synth::setFilterModulation)
        .function("setVolume", &devilbox::CEM3394Synth::setVolume);
}
#endif
