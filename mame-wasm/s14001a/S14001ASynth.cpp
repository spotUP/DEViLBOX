/**
 * S14001ASynth.cpp - SSi TSI S14001A Speech IC for WebAssembly
 * Based on MAME's S14001A emulator by Ed Bernard, Jonathan Gevaryahu, hap
 *
 * The S14001A is a speech synthesis IC designed in 1975, first used in the
 * TSI Speech+ calculator and later in Stern's Berzerk arcade game.
 *
 * Features:
 * - 2-bit delta modulation encoding
 * - 4-bit DAC output (16 levels, centered at 7)
 * - Voiced/unvoiced/silence modes per syllable
 * - Mirroring within pitch periods (voiced mode)
 * - 6-bit word address (64 addressable words in ROM)
 *
 * This WASM version extends the original with:
 * - 4-voice polyphony
 * - 8 vowel-based presets for speech synthesis (matching SP0250 ordering)
 * - MIDI note-to-pitch mapping
 * - Stereo output with voice panning
 *
 * The delta modulation runs at ~10kHz with interpolated upsampling.
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

static constexpr int CHIP_RATE = 10000;  // Internal sample rate (Hz)
static constexpr int NUM_VOICES = 4;
static constexpr int NUM_PRESETS = 8;
static constexpr int DAC_CENTER = 7;

// ============================================================================
// Parameter IDs
// ============================================================================

enum S14001AParam {
    PARAM_VOLUME = 0,
    PARAM_PRESET = 1,       // 0-7 vowel presets (matching SP0250 order)
    PARAM_VOICED = 2,       // 0=noise excitation, 1=voiced
    PARAM_BRIGHTNESS = 3,   // controls upper harmonic emphasis
    PARAM_STEREO_WIDTH = 4,
    PARAM_DELTA_DEPTH = 5,  // delta modulation depth (0-1)
};

// ============================================================================
// Delta increment table (from MAME, verified against silicon)
// ============================================================================

static const uint8_t INCREMENT_TABLE[4][4] = {
    { 3,  3,  1,  1, },
    { 1,  1,  0,  0, },
    { 0,  0,  1,  1, },
    { 1,  1,  3,  3, },
};

// ============================================================================
// Vowel presets via delta modulation
// Each preset produces a characteristic vowel waveform through the S14001A's
// 2-bit delta encoding. Presets match SP0250 ordering for speech pipeline:
//   0=AH, 1=EE, 2=IH, 3=OH, 4=OO, 5=NN, 6=ZZ(noise), 7=HH(breathy)
//
// The delta patterns shape the 4-bit DAC output within each pitch period.
// Voiced vowels use periodic waveforms; unvoiced use noise-driven deltas.
// ============================================================================

struct WaveformPreset {
    const char* name;
    uint8_t deltas[32];    // 2-bit delta values for one pitch period
    bool voiced;
};

static const WaveformPreset PRESETS[NUM_PRESETS] = {
    // 0: AH /a/ (father) - wide open, strong fundamental, gentle slope
    { "AH",
      { 3,3,2,2,1,1,0,0, 0,0,1,1,2,2,3,3, 3,2,2,1,1,0,0,0, 0,1,1,2,2,3,3,3 },
      true },

    // 1: EE /i:/ (beet) - bright, fast transitions, high-frequency content
    { "EE",
      { 3,3,0,0,3,3,0,0, 3,2,0,0,3,2,0,0, 3,3,0,0,3,3,0,0, 3,2,1,0,3,2,1,0 },
      true },

    // 2: IH /ɪ/ (bit) - between AH and EE, moderate brightness
    { "IH",
      { 3,3,2,0,0,0,2,3, 3,2,1,0,0,1,2,3, 3,3,1,0,0,1,2,3, 3,2,1,0,0,0,2,3 },
      true },

    // 3: OH /oʊ/ (boat) - rounded, deeper, slower waveform
    { "OH",
      { 2,3,3,3,2,1,0,0, 0,0,0,1,2,3,3,3, 2,1,0,0,0,0,1,2, 3,3,3,2,1,0,0,0 },
      true },

    // 4: OO /u:/ (boot) - very rounded, deep fundamental, smooth
    { "OO",
      { 2,3,3,3,3,2,1,0, 0,0,0,0,1,2,3,3, 3,3,2,1,0,0,0,0, 0,1,2,3,3,3,3,2 },
      true },

    // 5: NN nasal - muted, nasal character with anti-resonance
    { "NN",
      { 2,3,2,1,1,2,3,2, 1,0,1,2,3,2,1,0, 1,2,3,2,1,0,1,2, 3,2,1,0,0,1,2,3 },
      true },

    // 6: ZZ buzz/fricative - noise-driven, high energy
    { "ZZ",
      { 2,1,3,0,2,3,1,0, 3,0,2,1,0,3,1,2, 1,3,0,2,3,1,0,2, 0,2,3,1,2,0,3,1 },
      false },

    // 7: HH breathy/aspirate - soft noise, low energy
    { "HH",
      { 2,2,1,1,1,1,2,2, 2,1,1,1,1,1,2,2, 2,2,1,1,1,2,2,2, 1,1,1,1,2,2,2,1 },
      false },
};

// ============================================================================
// Single delta-modulation voice
// ============================================================================

struct DeltaVoice {
    uint8_t output;
    uint8_t deltaOld;
    bool    voiced;
    uint8_t pitchPeriod;
    uint8_t pitchCount;
    uint8_t ppQuarter;
    uint8_t deltaAddr;
    uint16_t lfsr;
    uint8_t deltas[32];

    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    float    prevSample;
    float    currentSample;
    double   phase;
};

// ============================================================================
// S14001ASynth class
// ============================================================================

class S14001ASynth {
public:
    S14001ASynth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_chipRate = CHIP_RATE;
        m_chipStep = (double)m_chipRate / (double)sampleRate;
        m_volume = 0.8f;
        m_stereoWidth = 0.3f;
        m_currentPreset = 0;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_brightness = 0.5f;
        m_deltaDepth = 1.0f;

        for (int v = 0; v < NUM_VOICES; v++) resetVoice(v);
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f, mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                DeltaVoice& voi = m_voices[v];
                if (!voi.active && voi.envLevel <= 0.001f) continue;

                if (voi.releasing) {
                    voi.envLevel -= 0.0005f;
                    if (voi.envLevel <= 0.0f) { voi.envLevel = 0.0f; voi.active = false; continue; }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.002f;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                voi.phase += m_chipStep;
                while (voi.phase >= 1.0) {
                    voi.phase -= 1.0;
                    voi.prevSample = voi.currentSample;
                    voi.currentSample = generateSample(voi);
                }

                float t = (float)voi.phase;
                float sample = voi.prevSample * (1.0f - t) + voi.currentSample * t;
                float vel = voi.velocity / 127.0f;
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

    void noteOn(int midiNote, int velocity) {
        if (midiNote < 24 || midiNote > 96) return;
        int v = findFreeVoice();
        DeltaVoice& voi = m_voices[v];
        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.phase = 0.0;
        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;

        float freq = 440.0f * std::pow(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        int period = (int)((float)m_chipRate / freq + 0.5f);
        if (period < 4) period = 4;
        if (period > 255) period = 255;
        voi.pitchPeriod = period;
        voi.pitchCount = 0;
        voi.ppQuarter = 0;
        voi.deltaAddr = 0;
        voi.output = DAC_CENTER;
        voi.deltaOld = 2;

        loadPresetData(v, m_currentPreset);
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
        for (int v = 0; v < NUM_VOICES; v++) m_voices[v].releasing = true;
    }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME: m_volume = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_PRESET: {
                int preset = std::max(0, std::min(NUM_PRESETS - 1, (int)value));
                m_currentPreset = preset;
                for (int v = 0; v < NUM_VOICES; v++)
                    if (m_voices[v].active) loadPresetData(v, preset);
                break;
            }
            case PARAM_VOICED:
                for (int v = 0; v < NUM_VOICES; v++) m_voices[v].voiced = (value > 0.5f);
                break;
            case PARAM_BRIGHTNESS: m_brightness = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_STEREO_WIDTH: m_stereoWidth = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_DELTA_DEPTH: m_deltaDepth = std::max(0.0f, std::min(1.0f, value)); break;
            default: break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_PRESET: return (float)m_currentPreset;
            case PARAM_VOICED: return m_voices[0].voiced ? 1.0f : 0.0f;
            case PARAM_BRIGHTNESS: return m_brightness;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_DELTA_DEPTH: return m_deltaDepth;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1: m_deltaDepth = value / 127.0f; break;
            case 7: m_volume = value / 127.0f; break;
            case 70: setParameter(PARAM_PRESET, (value / 127.0f) * (NUM_PRESETS - 1)); break;
            case 74: m_brightness = value / 127.0f; break;
            case 120: case 123: allNotesOff(); break;
            default: break;
        }
    }

    void pitchBend(float value) {
        m_pitchBend = value;
        for (int v = 0; v < NUM_VOICES; v++) {
            if (m_voices[v].active && m_voices[v].midiNote >= 0) {
                float freq = 440.0f * std::pow(2.0f, (m_voices[v].midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
                int period = (int)((float)m_chipRate / freq + 0.5f);
                if (period < 4) period = 4;
                if (period > 255) period = 255;
                m_voices[v].pitchPeriod = period;
            }
        }
    }

    void programChange(int program) {
        if (program >= 0 && program < NUM_PRESETS) m_currentPreset = program;
    }

    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setPreset(int preset) { setParameter(PARAM_PRESET, (float)preset); }
    void writeWord(int word) { m_currentPreset = (word & 0x3f) % NUM_PRESETS; }
    void writeRegister(int offset, int data) { if (offset == 0) writeWord(data); }

private:
    float generateSample(DeltaVoice& voi) {
        uint8_t delta;
        if (voi.voiced) {
            uint8_t addr = voi.deltaAddr;
            if (voi.ppQuarter & 1) addr = 7 - addr;
            int idx = (voi.ppQuarter * 8 + addr) % 32;
            delta = voi.deltas[idx] & 0x03;
        } else {
            voi.lfsr ^= (voi.lfsr ^ (voi.lfsr >> 1)) << 15;
            voi.lfsr >>= 1;
            delta = voi.lfsr & 0x03;
        }

        uint8_t increment;
        bool add;
        bool mirror = (voi.ppQuarter & 1) != 0;

        if (!voi.voiced || !mirror) {
            increment = INCREMENT_TABLE[delta][voi.deltaOld];
            add = (delta >= 2);
        } else {
            increment = INCREMENT_TABLE[voi.deltaOld][delta];
            add = (voi.deltaOld < 2);
        }

        if (m_deltaDepth < 1.0f)
            increment = (uint8_t)(increment * m_deltaDepth + 0.5f);

        voi.deltaOld = delta;

        if (voi.deltaAddr == 0 && voi.ppQuarter == 0)
            voi.output = DAC_CENTER;

        uint8_t tmp = voi.output;
        if (!add) tmp ^= 0x0f;
        tmp += increment;
        if (tmp > 15) tmp = 15;
        if (!add) tmp ^= 0x0f;
        voi.output = tmp;

        voi.deltaAddr++;
        if (voi.deltaAddr >= 8) {
            voi.deltaAddr = 0;
            voi.ppQuarter++;
            if (voi.ppQuarter >= 4) voi.ppQuarter = 0;
        }

        voi.pitchCount++;
        if (voi.pitchCount >= voi.pitchPeriod) {
            voi.pitchCount = 0;
            voi.ppQuarter = 0;
            voi.deltaAddr = 0;
            voi.deltaOld = 2;
        }

        float sample = ((float)voi.output - DAC_CENTER) / (float)DAC_CENTER;
        if (m_brightness > 0.5f) {
            float emphasis = (m_brightness - 0.5f) * 2.0f;
            sample *= (1.0f + emphasis * 0.5f);
        }
        return sample;
    }

    void resetVoice(int v) {
        DeltaVoice& voi = m_voices[v];
        voi.output = DAC_CENTER; voi.deltaOld = 2; voi.voiced = true;
        voi.pitchPeriod = 22; voi.pitchCount = 0; voi.ppQuarter = 0; voi.deltaAddr = 0;
        voi.lfsr = 0x7fff; voi.midiNote = -1; voi.velocity = 0; voi.age = 0;
        voi.active = false; voi.releasing = false; voi.envLevel = 0.0f;
        voi.prevSample = 0.0f; voi.currentSample = 0.0f; voi.phase = 0.0;
        std::memset(voi.deltas, 0, sizeof(voi.deltas));
    }

    void loadPresetData(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        DeltaVoice& voi = m_voices[voice];
        std::memcpy(voi.deltas, PRESETS[preset].deltas, 32);
        voi.voiced = PRESETS[preset].voiced;
    }

    int findFreeVoice() {
        for (int v = 0; v < NUM_VOICES; v++)
            if (!m_voices[v].active && m_voices[v].envLevel <= 0.001f) return v;
        int bestV = -1; float bestLevel = 2.0f;
        for (int v = 0; v < NUM_VOICES; v++)
            if (m_voices[v].releasing && m_voices[v].envLevel < bestLevel) { bestLevel = m_voices[v].envLevel; bestV = v; }
        if (bestV >= 0) return bestV;
        int oldest = 0; uint32_t oldestAge = UINT32_MAX;
        for (int v = 0; v < NUM_VOICES; v++)
            if (m_voices[v].age < oldestAge) { oldestAge = m_voices[v].age; oldest = v; }
        return oldest;
    }

    int m_sampleRate = 44100;
    int m_chipRate = CHIP_RATE;
    double m_chipStep = 0.0;
    DeltaVoice m_voices[NUM_VOICES];
    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
    float m_brightness = 0.5f;
    float m_deltaDepth = 1.0f;
    int m_currentPreset = 0;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(S14001AModule) {
    emscripten::class_<S14001ASynth>("S14001ASynth")
        .constructor<>()
        .function("initialize", &S14001ASynth::initialize)
        .function("process", &S14001ASynth::process)
        .function("noteOn", &S14001ASynth::noteOn)
        .function("noteOff", &S14001ASynth::noteOff)
        .function("allNotesOff", &S14001ASynth::allNotesOff)
        .function("setParameter", &S14001ASynth::setParameter)
        .function("getParameter", &S14001ASynth::getParameter)
        .function("controlChange", &S14001ASynth::controlChange)
        .function("pitchBend", &S14001ASynth::pitchBend)
        .function("programChange", &S14001ASynth::programChange)
        .function("setVolume", &S14001ASynth::setVolume)
        .function("setPreset", &S14001ASynth::setPreset)
        .function("writeWord", &S14001ASynth::writeWord)
        .function("writeRegister", &S14001ASynth::writeRegister);
}
#endif
