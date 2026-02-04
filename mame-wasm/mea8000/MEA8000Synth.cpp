/**
 * MEA8000Synth.cpp - Philips MEA 8000 Formant Speech Synthesizer for WebAssembly
 * Based on MAME's MEA8000 emulator by Antoine Mine
 *
 * The MEA 8000 is a 4-formant vocoder speech synthesis chip used in French
 * Thomson/Amstrad/Oric computers. It generates speech by passing an excitation
 * signal (sawtooth for voiced, noise for unvoiced) through a cascade of 4
 * second-order digital filters with programmable frequency and bandwidth.
 *
 * Architecture (from MAME):
 * - Excitation: sawtooth waveform at pitch frequency OR white noise
 * - 4 cascade formant filters (F1-F4), each a 2nd-order digital filter
 * - Filter coefficients from precomputed cos/exp tables (bilinear transform)
 * - Smooth parameter interpolation between frames
 * - Internal processing at 8kHz (F0 = clock/480)
 *
 * This WASM version extends the original with:
 * - 4-voice polyphony (4 independent MEA8000 engines)
 * - MIDI note-to-pitch mapping for the excitation frequency
 * - Real-time formant control via F1/F2/F3 indices
 * - 8 vowel presets with authentic formant configurations
 * - Smooth parameter interpolation when changing formants
 * - Noise/voiced mode switching
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
static constexpr int F0 = 8000;            // Internal filter rate (Hz)
static constexpr int QUANT = 512;           // Quantization range
static constexpr int TABLE_LEN = 3600;      // Filter coefficient table size
static constexpr int NOISE_LEN = 8192;      // Noise table size
static constexpr int INTERP_FRAMES = 128;   // Default interpolation (16ms at F0)
static constexpr int NUM_PRESETS = 8;

// ============================================================================
// Quantization tables (from MAME / Philips MEA8000 documentation)
// ============================================================================

// F1 frequency table (32 entries, 150-1047 Hz)
static const int fm1_table[32] = {
    150,  162,  174,  188,  202,  217,  233,  250,
    267,  286,  305,  325,  346,  368,  391,  415,
    440,  466,  494,  523,  554,  587,  622,  659,
    698,  740,  784,  830,  880,  932,  988, 1047
};

// F2 frequency table (32 entries, 440-3400 Hz)
static const int fm2_table[32] = {
    440,  466,  494,  523,  554,  587,  622,  659,
    698,  740,  784,  830,  880,  932,  988, 1047,
    1100, 1179, 1254, 1337, 1428, 1528, 1639, 1761,
    1897, 2047, 2214, 2400, 2609, 2842, 3105, 3400
};

// F3 frequency table (8 entries, 1179-3400 Hz)
static const int fm3_table[8] = {
    1179, 1337, 1528, 1761, 2047, 2400, 2842, 3400
};

// F4 is fixed at 3500 Hz
static constexpr int FM4_FIXED = 3500;

// Bandwidth table (4 entries, Hz)
static const int bw_table[4] = { 726, 309, 125, 50 };

// Amplitude table (16 entries, x1000)
static const int ampl_table[16] = {
    0,   8,  11,  16,  22,  31,  44,   62,
    88, 125, 177, 250, 354, 500, 707, 1000
};

// ============================================================================
// Parameter IDs
// ============================================================================

enum MEA8000Param {
    PARAM_VOLUME = 0,
    PARAM_NOISE_MODE = 1,
    PARAM_F1_INDEX = 2,     // 0-31 into fm1_table
    PARAM_F2_INDEX = 3,     // 0-31 into fm2_table
    PARAM_F3_INDEX = 4,     // 0-7  into fm3_table
    PARAM_BW_INDEX = 5,     // 0-3  into bw_table (global)
    PARAM_AMPLITUDE = 6,    // 0-15 into ampl_table
    PARAM_STEREO_WIDTH = 7,
    PARAM_INTERP_TIME = 8,  // Interpolation time multiplier
};

// ============================================================================
// Vowel presets (formant configurations)
// ============================================================================

struct VowelPreset {
    const char* name;
    int f1_idx;   // into fm1_table (0-31)
    int f2_idx;   // into fm2_table (0-31)
    int f3_idx;   // into fm3_table (0-7)
    int bw_idx;   // into bw_table (0-3)
};

static const VowelPreset VOWEL_PRESETS[NUM_PRESETS] = {
    // 0: AH (father) - F1=830, F2=1100, F3=2400
    { "AH",  27, 16, 5, 2 },
    // 1: EE (meet)   - F1=267, F2=2400, F3=3400
    { "EE",   8, 27, 7, 2 },
    // 2: IH (bit)    - F1=415, F2=1761, F3=2400
    { "IH",  15, 23, 5, 2 },
    // 3: OH (boat)   - F1=494, F2=880,  F3=2400
    { "OH",  18, 12, 5, 2 },
    // 4: OO (boot)   - F1=305, F2=880,  F3=2400
    { "OO",  10, 12, 5, 2 },
    // 5: AE (bat)    - F1=659, F2=1639, F3=2400
    { "AE",  23, 22, 5, 2 },
    // 6: UH (but)    - F1=587, F2=1179, F3=2400, wider BW
    { "UH",  21, 17, 5, 1 },
    // 7: ER (bird)   - F1=494, F2=1337, F3=1761, wider BW
    { "ER",  18, 19, 3, 1 },
};

// ============================================================================
// Filter and voice structures
// ============================================================================

struct MEAFilter {
    int fm;            // Current frequency (Hz)
    int last_fm;       // Previous frequency (for interpolation)
    int bw;            // Current bandwidth (Hz)
    int last_bw;       // Previous bandwidth
    int output;        // Filter output state
    int last_output;   // Previous filter output
};

struct MEAVoice {
    // MIDI state
    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    // Synthesis state
    int      pitch;         // Sawtooth frequency (Hz)
    int      last_pitch;    // Previous pitch
    int      ampl;          // Amplitude (from ampl_table)
    int      last_ampl;     // Previous amplitude
    bool     noise;         // Noise mode
    uint32_t phi;           // Phase accumulator

    // Formant filters
    MEAFilter f[4];

    // Frame interpolation
    int framepos;
    int framelength;

    // Resampling (F0 → output rate)
    double sampleAccum;
    int    lastSample;
    int    currentSample;
};

// ============================================================================
// MEA8000Synth class
// ============================================================================

class MEA8000Synth {
public:
    MEA8000Synth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_volume = 0.7f;
        m_stereoWidth = 0.3f;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_noiseMode = false;
        m_currentPreset = 0;
        m_interpMultiplier = 1.0f;

        // Default formant settings (AH vowel)
        m_f1_idx = 27;
        m_f2_idx = 16;
        m_f3_idx = 5;
        m_bw_idx = 2;
        m_ampl_idx = 14;  // Near maximum

        initTables();

        for (int v = 0; v < NUM_VOICES; v++)
            resetVoice(v);
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        double step = (double)F0 / m_sampleRate;

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f;
            float mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                MEAVoice& voi = m_voices[v];
                if (!voi.active && voi.envLevel <= 0.001f) continue;

                // Envelope
                if (voi.releasing) {
                    voi.envLevel -= 0.002f;
                    if (voi.envLevel <= 0.0f) {
                        voi.envLevel = 0.0f;
                        voi.active = false;
                        continue;
                    }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.005f;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                // Advance internal clock at F0 rate
                voi.sampleAccum += step;
                while (voi.sampleAccum >= 1.0) {
                    voi.sampleAccum -= 1.0;
                    voi.lastSample = voi.currentSample;
                    voi.currentSample = computeSample(voi);

                    // Advance frame interpolation
                    if (voi.framepos < voi.framelength)
                        voi.framepos++;
                }

                // Linear interpolation between F0 samples
                float frac = (float)voi.sampleAccum;
                float sample = voi.lastSample * (1.0f - frac) + voi.currentSample * frac;
                sample /= 32768.0f;

                float vel = voi.velocity / 127.0f;

                // Stereo panning
                float pan = 0.5f + m_stereoWidth * (((float)v / std::max(1, NUM_VOICES - 1)) - 0.5f);
                float gainL = cosf(pan * (float)M_PI * 0.5f);
                float gainR = sinf(pan * (float)M_PI * 0.5f);

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
        MEAVoice& voi = m_voices[v];

        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.phi = 0;
        voi.sampleAccum = 0.0;
        voi.lastSample = 0;
        voi.currentSample = 0;

        // Pitch from MIDI note
        float freq = 440.0f * powf(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        voi.pitch = (int)freq;
        voi.last_pitch = voi.pitch;

        // Noise mode
        voi.noise = m_noiseMode;

        // Amplitude (fade in from 0)
        voi.ampl = ampl_table[m_ampl_idx];
        voi.last_ampl = 0;

        // Set formant filters from current settings
        int bw = bw_table[m_bw_idx];

        voi.f[0].fm = fm1_table[m_f1_idx]; voi.f[0].last_fm = voi.f[0].fm;
        voi.f[0].bw = bw; voi.f[0].last_bw = bw;
        voi.f[0].output = 0; voi.f[0].last_output = 0;

        voi.f[1].fm = fm2_table[m_f2_idx]; voi.f[1].last_fm = voi.f[1].fm;
        voi.f[1].bw = bw; voi.f[1].last_bw = bw;
        voi.f[1].output = 0; voi.f[1].last_output = 0;

        voi.f[2].fm = fm3_table[m_f3_idx]; voi.f[2].last_fm = voi.f[2].fm;
        voi.f[2].bw = bw; voi.f[2].last_bw = bw;
        voi.f[2].output = 0; voi.f[2].last_output = 0;

        voi.f[3].fm = FM4_FIXED; voi.f[3].last_fm = FM4_FIXED;
        voi.f[3].bw = bw; voi.f[3].last_bw = bw;
        voi.f[3].output = 0; voi.f[3].last_output = 0;

        // Start interpolation
        voi.framepos = 0;
        voi.framelength = (int)(INTERP_FRAMES * m_interpMultiplier);
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
        for (int v = 0; v < NUM_VOICES; v++)
            m_voices[v].releasing = true;
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                m_volume = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_NOISE_MODE:
                m_noiseMode = value > 0.5f;
                for (int v = 0; v < NUM_VOICES; v++) {
                    if (m_voices[v].active)
                        m_voices[v].noise = m_noiseMode;
                }
                break;
            case PARAM_F1_INDEX:
                m_f1_idx = std::max(0, std::min(31, (int)value));
                updateActiveFormants();
                break;
            case PARAM_F2_INDEX:
                m_f2_idx = std::max(0, std::min(31, (int)value));
                updateActiveFormants();
                break;
            case PARAM_F3_INDEX:
                m_f3_idx = std::max(0, std::min(7, (int)value));
                updateActiveFormants();
                break;
            case PARAM_BW_INDEX:
                m_bw_idx = std::max(0, std::min(3, (int)value));
                updateActiveFormants();
                break;
            case PARAM_AMPLITUDE:
                m_ampl_idx = std::max(0, std::min(15, (int)value));
                break;
            case PARAM_STEREO_WIDTH:
                m_stereoWidth = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_INTERP_TIME:
                m_interpMultiplier = std::max(0.1f, std::min(10.0f, value));
                break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_NOISE_MODE: return m_noiseMode ? 1.0f : 0.0f;
            case PARAM_F1_INDEX: return (float)m_f1_idx;
            case PARAM_F2_INDEX: return (float)m_f2_idx;
            case PARAM_F3_INDEX: return (float)m_f3_idx;
            case PARAM_BW_INDEX: return (float)m_bw_idx;
            case PARAM_AMPLITUDE: return (float)m_ampl_idx;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_INTERP_TIME: return m_interpMultiplier;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel → F1 sweep
                m_f1_idx = (value * 31) / 127;
                updateActiveFormants();
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 70: // F2 control
                m_f2_idx = (value * 31) / 127;
                updateActiveFormants();
                break;
            case 71: // F3 control
                m_f3_idx = (value * 7) / 127;
                updateActiveFormants();
                break;
            case 74: // Bandwidth
                m_bw_idx = (value * 3) / 127;
                updateActiveFormants();
                break;
            case 75: // Noise mode
                m_noiseMode = value > 63;
                for (int v = 0; v < NUM_VOICES; v++) {
                    if (m_voices[v].active)
                        m_voices[v].noise = m_noiseMode;
                }
                break;
            case 120:
            case 123:
                allNotesOff();
                break;
        }
    }

    void pitchBend(float value) {
        m_pitchBend = value;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                float freq = 440.0f * powf(2.0f,
                    (m_voices[v].midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
                m_voices[v].pitch = (int)freq;
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < NUM_PRESETS)
            loadPreset(program);
    }

    // ========================================================================
    // Convenience setters
    // ========================================================================

    void setVolume(float v) {
        m_volume = std::max(0.0f, std::min(1.0f, v));
    }

    void setFormants(int f1_idx, int f2_idx, int f3_idx) {
        m_f1_idx = std::max(0, std::min(31, f1_idx));
        m_f2_idx = std::max(0, std::min(31, f2_idx));
        m_f3_idx = std::max(0, std::min(7, f3_idx));
        updateActiveFormants();
    }

    void setNoiseMode(bool noise) {
        m_noiseMode = noise;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active)
                m_voices[v].noise = noise;
        }
    }

    void writeRegister(int offset, int data) {
        // Simplified register interface
        switch (offset) {
            case 0: // F1 index
                m_f1_idx = std::max(0, std::min(31, data));
                updateActiveFormants();
                break;
            case 1: // F2 index
                m_f2_idx = std::max(0, std::min(31, data));
                updateActiveFormants();
                break;
            case 2: // F3 index
                m_f3_idx = std::max(0, std::min(7, data));
                updateActiveFormants();
                break;
            case 3: // BW index
                m_bw_idx = std::max(0, std::min(3, data));
                updateActiveFormants();
                break;
        }
    }

private:
    // ========================================================================
    // Table initialization (from MAME init_tables)
    // ========================================================================

    void initTables() {
        for (int i = 0; i < TABLE_LEN; i++) {
            double f = (double)i / F0;
            m_cos_table[i]  = (int)(2.0 * cos(2.0 * M_PI * f) * QUANT);
            m_exp_table[i]  = (int)(exp(-M_PI * f) * QUANT);
            m_exp2_table[i] = (int)(exp(-2.0 * M_PI * f) * QUANT);
        }
        // Deterministic noise via xorshift LFSR
        uint32_t lfsr = 0x12345678;
        for (int i = 0; i < NOISE_LEN; i++) {
            lfsr ^= lfsr << 13;
            lfsr ^= lfsr >> 17;
            lfsr ^= lfsr << 5;
            m_noise_table[i] = (int)(lfsr % (2 * QUANT + 1)) - QUANT;
        }
    }

    // ========================================================================
    // DSP core (ported 1:1 from MAME integer mode)
    // ========================================================================

    // Linear interpolation over frame duration
    int interp(MEAVoice& voi, int org, int dst) {
        if (voi.framelength <= 0) return dst;
        int pos = std::min(voi.framepos, voi.framelength);
        return org + ((dst - org) * pos) / voi.framelength;
    }

    // Second-order digital filter (from MAME filter_step)
    int filterStep(MEAVoice& voi, int i, int input) {
        int fm = interp(voi, voi.f[i].last_fm, voi.f[i].fm);
        int bw = interp(voi, voi.f[i].last_bw, voi.f[i].bw);

        // Clamp to table bounds
        fm = std::max(0, std::min((int)TABLE_LEN - 1, fm));
        bw = std::max(0, std::min((int)TABLE_LEN - 1, bw));

        int b = (m_cos_table[fm] * m_exp_table[bw]) / QUANT;
        int c = m_exp2_table[bw];
        int next_output = input + (b * voi.f[i].output - c * voi.f[i].last_output) / QUANT;
        voi.f[i].last_output = voi.f[i].output;
        voi.f[i].output = next_output;
        return next_output;
    }

    // Noise generator (from MAME noise_gen)
    int noiseGen(MEAVoice& voi) {
        voi.phi = (voi.phi + 1) % NOISE_LEN;
        return m_noise_table[voi.phi];
    }

    // Sawtooth frequency generator (from MAME freq_gen)
    int freqGen(MEAVoice& voi) {
        int pitch = interp(voi, voi.last_pitch, voi.pitch);
        if (pitch <= 0) pitch = 1;
        voi.phi = (voi.phi + pitch) % F0;
        return ((int)(voi.phi % F0) * QUANT * 2) / F0 - QUANT;
    }

    // Compute one sample at F0 rate (from MAME compute_sample)
    int computeSample(MEAVoice& voi) {
        int ampl = interp(voi, voi.last_ampl, voi.ampl);
        int out;

        if (voi.noise)
            out = noiseGen(voi);
        else
            out = freqGen(voi);

        out *= ampl / 32;

        for (int i = 0; i < 4; i++)
            out = filterStep(voi, i, out);

        if (out > 32767) out = 32767;
        if (out < -32767) out = -32767;
        return out;
    }

    // ========================================================================
    // Voice management
    // ========================================================================

    void loadPreset(int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        m_currentPreset = preset;
        const VowelPreset& p = VOWEL_PRESETS[preset];
        m_f1_idx = p.f1_idx;
        m_f2_idx = p.f2_idx;
        m_f3_idx = p.f3_idx;
        m_bw_idx = p.bw_idx;
        updateActiveFormants();
    }

    void updateActiveFormants() {
        int bw = bw_table[m_bw_idx];
        for (int v = 0; v < NUM_VOICES; v++) {
            if (!m_voices[v].active) continue;
            MEAVoice& voi = m_voices[v];

            // Save current params for interpolation
            for (int i = 0; i < 4; i++) {
                voi.f[i].last_fm = voi.f[i].fm;
                voi.f[i].last_bw = voi.f[i].bw;
            }
            voi.last_ampl = voi.ampl;

            // Set new formant values
            voi.f[0].fm = fm1_table[m_f1_idx];
            voi.f[1].fm = fm2_table[m_f2_idx];
            voi.f[2].fm = fm3_table[m_f3_idx];
            voi.f[3].fm = FM4_FIXED;
            for (int i = 0; i < 4; i++)
                voi.f[i].bw = bw;
            voi.ampl = ampl_table[m_ampl_idx];

            // Restart interpolation
            voi.framepos = 0;
            voi.framelength = (int)(INTERP_FRAMES * m_interpMultiplier);
        }
    }

    void resetVoice(int v) {
        MEAVoice& voi = m_voices[v];
        voi.midiNote = -1;
        voi.velocity = 0;
        voi.age = 0;
        voi.active = false;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.pitch = 0;
        voi.last_pitch = 0;
        voi.ampl = 0;
        voi.last_ampl = 0;
        voi.noise = false;
        voi.phi = 0;
        voi.framepos = 0;
        voi.framelength = INTERP_FRAMES;
        voi.sampleAccum = 0.0;
        voi.lastSample = 0;
        voi.currentSample = 0;
        for (int i = 0; i < 4; i++) {
            voi.f[i].fm = 0;
            voi.f[i].last_fm = 0;
            voi.f[i].bw = 0;
            voi.f[i].last_bw = 0;
            voi.f[i].output = 0;
            voi.f[i].last_output = 0;
        }
    }

    int findFreeVoice() {
        // Prefer inactive voices
        for (int v = 0; v < NUM_VOICES; v++) {
            if (!m_voices[v].active && m_voices[v].envLevel <= 0.001f)
                return v;
        }
        // Then releasing voices with lowest envelope
        int bestV = -1;
        float bestLevel = 2.0f;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].releasing && m_voices[v].envLevel < bestLevel) {
                bestLevel = m_voices[v].envLevel;
                bestV = v;
            }
        }
        if (bestV >= 0) return bestV;

        // Steal oldest voice
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
    MEAVoice m_voices[NUM_VOICES];

    float    m_volume = 0.7f;
    float    m_stereoWidth = 0.3f;
    uint32_t m_noteCounter = 0;
    float    m_pitchBend = 0.0f;
    bool     m_noiseMode = false;
    int      m_currentPreset = 0;
    float    m_interpMultiplier = 1.0f;

    int m_f1_idx = 27;
    int m_f2_idx = 16;
    int m_f3_idx = 5;
    int m_bw_idx = 2;
    int m_ampl_idx = 14;

    // Precomputed coefficient tables (from MAME init_tables)
    int m_cos_table[TABLE_LEN];
    int m_exp_table[TABLE_LEN];
    int m_exp2_table[TABLE_LEN];
    int m_noise_table[NOISE_LEN];
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(MEA8000Module) {
    emscripten::class_<MEA8000Synth>("MEA8000Synth")
        .constructor<>()
        .function("initialize", &MEA8000Synth::initialize)
        .function("process", &MEA8000Synth::process)
        .function("noteOn", &MEA8000Synth::noteOn)
        .function("noteOff", &MEA8000Synth::noteOff)
        .function("allNotesOff", &MEA8000Synth::allNotesOff)
        .function("setParameter", &MEA8000Synth::setParameter)
        .function("getParameter", &MEA8000Synth::getParameter)
        .function("controlChange", &MEA8000Synth::controlChange)
        .function("pitchBend", &MEA8000Synth::pitchBend)
        .function("programChange", &MEA8000Synth::programChange)
        .function("writeRegister", &MEA8000Synth::writeRegister)
        .function("setVolume", &MEA8000Synth::setVolume)
        .function("setFormants", &MEA8000Synth::setFormants)
        .function("setNoiseMode", &MEA8000Synth::setNoiseMode);
}

#endif
