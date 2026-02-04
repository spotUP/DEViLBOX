/**
 * SNKWaveSynth.cpp - SNK Wave Sound Generator for WebAssembly
 * Based on MAME's SNKWave emulator by Nicola Salmoria
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The SNK Wave chip is a simple programmable waveform generator used in
 * early SNK arcade games (Vanguard, Fantasy, Sasuke vs Commander).
 *
 * Features:
 * - Programmable 16-sample wavetable with 3-bit resolution per sample
 * - Ping-pong playback: forward 8 samples with bit3=1, backward with bit3=0
 * - 12-bit frequency control
 * - 4-bit DAC output
 *
 * This WASM version extends the original with:
 * - 8-voice polyphony (8 independent wavetable voices)
 * - Built-in waveform presets (sine, saw, square, triangle, pulse, etc.)
 * - Per-voice waveform assignment
 * - MIDI note/velocity/pitch bend control
 * - Stereo output
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
// Constants (from MAME)
// ============================================================================

static constexpr int WAVEFORM_LENGTH = 16;
static constexpr int CLOCK_SHIFT = 8;        // sample_rate = clock >> 8
static constexpr int NUM_VOICES = 8;
static constexpr int NUM_PRESETS = 8;

// ============================================================================
// Parameter IDs
// ============================================================================

enum SNKWaveParam {
    PARAM_VOLUME = 0,
    PARAM_WAVEFORM = 1,      // 0-7 preset waveforms
    PARAM_STEREO_WIDTH = 2,
    PARAM_DETUNE = 3,        // 0.0-1.0 (spread detuning for unison)
};

// ============================================================================
// Single voice (matching MAME chip structure)
// ============================================================================

struct SNKVoice {
    uint32_t frequency;       // 12-bit frequency register
    uint32_t counter;         // 12-bit counter
    int      waveform_position;
    int16_t  waveform[WAVEFORM_LENGTH];

    // MIDI state
    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;

    // Envelope (simple AR)
    float    envLevel;
    float    envAttack;       // attack rate (per sample)
    float    envRelease;      // release rate (per sample)
    bool     releasing;
};

// ============================================================================
// Built-in waveform data (8 x 8 nibbles, 3-bit each)
// These get expanded into 16-sample ping-pong waveforms
// ============================================================================

// Each preset is 8 x 3-bit values (0-7) representing the forward half
static const uint8_t PRESET_WAVEFORMS[NUM_PRESETS][8] = {
    // 0: Sine approximation
    { 3, 5, 6, 7, 7, 6, 5, 3 },
    // 1: Sawtooth
    { 0, 1, 2, 3, 4, 5, 6, 7 },
    // 2: Square
    { 7, 7, 7, 7, 7, 7, 7, 7 },
    // 3: Triangle
    { 0, 2, 4, 6, 7, 5, 3, 1 },
    // 4: Pulse 25%
    { 7, 7, 0, 0, 0, 0, 0, 0 },
    // 5: Organ (odd harmonics emphasis)
    { 4, 7, 5, 2, 6, 3, 7, 4 },
    // 6: Buzz
    { 7, 0, 7, 0, 7, 0, 7, 0 },
    // 7: Soft Bell
    { 2, 4, 7, 5, 3, 6, 4, 1 },
};

// ============================================================================
// SNKWaveSynth class
// ============================================================================

class SNKWaveSynth {
public:
    SNKWaveSynth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        // Set chip clock so that clock >> CLOCK_SHIFT = sampleRate
        m_chipClock = sampleRate << CLOCK_SHIFT;

        m_volume = 0.8f;
        m_stereoWidth = 0.4f;
        m_currentPreset = 0;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_detune = 0.0f;

        for (int v = 0; v < NUM_VOICES; v++) {
            resetVoice(v);
            loadWaveformPreset(v, 0); // Default: sine
        }
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f;
            float mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                SNKVoice& voi = m_voices[v];

                if (!voi.active && voi.envLevel <= 0.001f) continue;

                // Update envelope
                if (voi.releasing) {
                    voi.envLevel -= voi.envRelease;
                    if (voi.envLevel <= 0.0f) {
                        voi.envLevel = 0.0f;
                        voi.active = false;
                        continue;
                    }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += voi.envAttack;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                // Skip if frequency is max (muted)
                if (voi.frequency == 0xfff) continue;

                // Generate sample (matching MAME inner loop)
                int loops = 1 << CLOCK_SHIFT; // 256 sub-steps per output sample
                int32_t out = 0;

                while (loops > 0) {
                    int steps = 0x1000 - voi.counter;

                    if (steps <= loops) {
                        out += voi.waveform[voi.waveform_position] * steps;
                        voi.counter = voi.frequency;
                        voi.waveform_position = (voi.waveform_position + 1) & (WAVEFORM_LENGTH - 1);
                        loops -= steps;
                    } else {
                        out += voi.waveform[voi.waveform_position] * loops;
                        voi.counter += loops;
                        loops = 0;
                    }
                }

                // Normalize: max raw value ~ 7 * (1<<(12-CLOCK_SHIFT)) * 256
                // = 7 * 16 * 256 = 28672
                float sample = (float)out / 32768.0f;
                float vel = voi.velocity / 127.0f;

                // Stereo placement: spread voices across field
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
        if (midiNote < 12 || midiNote > 120) return;

        int v = findFreeVoice();

        m_voices[v].midiNote = midiNote;
        m_voices[v].velocity = velocity;
        m_voices[v].age = m_noteCounter++;
        m_voices[v].active = true;
        m_voices[v].releasing = false;
        m_voices[v].envLevel = 0.0f;

        // Set frequency from MIDI note
        setVoiceFrequency(v, midiNote);

        // Load current preset waveform
        loadWaveformPreset(v, m_currentPreset);
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
            case PARAM_WAVEFORM: {
                int preset = std::max(0, std::min(NUM_PRESETS - 1, (int)value));
                m_currentPreset = preset;
                // Update all active voices
                for (int v = 0; v < NUM_VOICES; v++) {
                    if (m_voices[v].active)
                        loadWaveformPreset(v, preset);
                }
                break;
            }
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
            case PARAM_WAVEFORM: return (float)m_currentPreset;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_DETUNE: return m_detune;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> detune
                m_detune = value / 127.0f * 0.5f;
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 70: // Waveform select
                setParameter(PARAM_WAVEFORM, (value / 127.0f) * (NUM_PRESETS - 1));
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
        // Update all active voice frequencies
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                setVoiceFrequency(v, m_voices[v].midiNote);
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < NUM_PRESETS) {
            m_currentPreset = program;
        }
    }

    // Direct register access: write waveform data
    void writeRegister(int offset, int data) {
        // Registers 0-1: frequency (applied to all active voices)
        // Registers 2-5: waveform data (applied to all voices)
        if (offset == 0) {
            for (int v = 0; v < NUM_VOICES; v++) {
                m_voices[v].frequency = (m_voices[v].frequency & 0x03f) | ((data & 0xfc) << 4);
            }
        } else if (offset == 1) {
            for (int v = 0; v < NUM_VOICES; v++) {
                m_voices[v].frequency = (m_voices[v].frequency & 0xfc0) | (data & 0x3f);
            }
        } else if (offset >= 2 && offset <= 5) {
            for (int v = 0; v < NUM_VOICES; v++) {
                updateWaveform(v, offset - 2, data);
            }
        }
    }

    // Set custom waveform for all voices (8 bytes, each with two 3-bit nibbles)
    void setCustomWaveform(int b0, int b1, int b2, int b3) {
        for (int v = 0; v < NUM_VOICES; v++) {
            updateWaveform(v, 0, b0);
            updateWaveform(v, 1, b1);
            updateWaveform(v, 2, b2);
            updateWaveform(v, 3, b3);
        }
    }

    // Convenience setters
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setWaveform(int preset) { setParameter(PARAM_WAVEFORM, (float)preset); }

private:
    // ========================================================================
    // Waveform update (from MAME, 1:1)
    // ========================================================================

    void updateWaveform(int voice, unsigned int offset, uint8_t data) {
        if (offset >= WAVEFORM_LENGTH / 4) return;
        SNKVoice& voi = m_voices[voice];

        // Forward half: 3-bit value + bit3 set
        voi.waveform[offset * 2]     = ((data & 0x70) >> 4) << (12 - CLOCK_SHIFT);
        voi.waveform[offset * 2 + 1] = ((data & 0x07) >> 0) << (12 - CLOCK_SHIFT);
        // Backward half: bitwise NOT (ping-pong)
        voi.waveform[WAVEFORM_LENGTH - 2 - offset * 2] = ~voi.waveform[offset * 2 + 1];
        voi.waveform[WAVEFORM_LENGTH - 1 - offset * 2] = ~voi.waveform[offset * 2];
    }

    void loadWaveformPreset(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        const uint8_t* data = PRESET_WAVEFORMS[preset];

        // Pack pairs of 3-bit values into the register format
        for (int i = 0; i < 4; i++) {
            uint8_t regData = ((data[i * 2] & 7) << 4) | (data[i * 2 + 1] & 7);
            updateWaveform(voice, i, regData);
        }
    }

    // ========================================================================
    // Frequency mapping
    // ========================================================================

    void setVoiceFrequency(int voice, int midiNote) {
        float bentNote = midiNote + m_pitchBend * 2.0f;

        // Add slight detune for voice spreading
        if (m_detune > 0.0f && NUM_VOICES > 1) {
            float spread = (voice - (NUM_VOICES - 1) / 2.0f) * m_detune * 0.02f;
            bentNote += spread;
        }

        float freq = 440.0f * std::pow(2.0f, (bentNote - 69.0f) / 12.0f);

        // freq = chipClock / (16 * (0x1000 - frequency_reg))
        // frequency_reg = 0x1000 - chipClock / (16 * freq)
        int freqReg = 0x1000 - (int)((float)m_chipClock / (16.0f * freq) + 0.5f);
        if (freqReg < 0) freqReg = 0;
        if (freqReg > 0xffe) freqReg = 0xffe; // 0xfff = muted

        m_voices[voice].frequency = freqReg;
    }

    // ========================================================================
    // Voice management
    // ========================================================================

    void resetVoice(int v) {
        m_voices[v].frequency = 0xfff; // muted
        m_voices[v].counter = 0;
        m_voices[v].waveform_position = 0;
        m_voices[v].midiNote = -1;
        m_voices[v].velocity = 0;
        m_voices[v].age = 0;
        m_voices[v].active = false;
        m_voices[v].releasing = false;
        m_voices[v].envLevel = 0.0f;
        m_voices[v].envAttack = 0.005f;  // ~5ms attack at 48kHz
        m_voices[v].envRelease = 0.001f; // ~20ms release
        memset(m_voices[v].waveform, 0, sizeof(m_voices[v].waveform));
    }

    int findFreeVoice() {
        // Find inactive voice
        for (int v = 0; v < NUM_VOICES; v++) {
            if (!m_voices[v].active && m_voices[v].envLevel <= 0.001f)
                return v;
        }
        // Find releasing voice with lowest level
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
    int m_chipClock = 44100 << CLOCK_SHIFT;

    SNKVoice m_voices[NUM_VOICES];

    float m_volume = 0.8f;
    float m_stereoWidth = 0.4f;
    float m_detune = 0.0f;
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

EMSCRIPTEN_BINDINGS(SNKWaveModule) {
    emscripten::class_<SNKWaveSynth>("SNKWaveSynth")
        .constructor<>()
        .function("initialize", &SNKWaveSynth::initialize)
        .function("process", &SNKWaveSynth::process)
        .function("noteOn", &SNKWaveSynth::noteOn)
        .function("noteOff", &SNKWaveSynth::noteOff)
        .function("allNotesOff", &SNKWaveSynth::allNotesOff)
        .function("setParameter", &SNKWaveSynth::setParameter)
        .function("getParameter", &SNKWaveSynth::getParameter)
        .function("controlChange", &SNKWaveSynth::controlChange)
        .function("pitchBend", &SNKWaveSynth::pitchBend)
        .function("programChange", &SNKWaveSynth::programChange)
        .function("writeRegister", &SNKWaveSynth::writeRegister)
        .function("setCustomWaveform", &SNKWaveSynth::setCustomWaveform)
        .function("setVolume", &SNKWaveSynth::setVolume)
        .function("setWaveform", &SNKWaveSynth::setWaveform);
}

#endif
