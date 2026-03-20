/**
 * HC55516Synth.cpp - Harris HC55516 CVSD Speech Codec for WebAssembly
 * Based on MAME's HC55516 emulator by Aaron Giles, Jonathan Gevaryahu
 *
 * The HC55516 is a CVSD (Continuously Variable Slope Delta) modulation
 * codec used in Williams/Bally arcade games and pinball.
 *
 * This WASM version extends the original with:
 * - 4-voice polyphony
 * - 8 vowel-based CVSD presets (matching SP0250 ordering for speech pipeline)
 * - MIDI note-to-pitch mapping
 * - Stereo output with voice panning
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

// Sinistar: 6800 CPU at 894.886 kHz, ~52.5 cycles per bit = ~17045 Hz
static constexpr int CHIP_RATE = 17045;
static constexpr int NUM_VOICES = 4;
static constexpr int NUM_PRESETS = 8;
static constexpr uint8_t SHIFTREG_MASK = 0x07;

// HC55516 filter coefficients (from MAME hc55516.cpp constructor)
// hc55516_device(... 0xfc0, 6, 0xfc1, 4)
static constexpr uint32_t HC55516_SYLMASK  = 0xfc0;  // m_sylmask
static constexpr int32_t  HC55516_SYLSHIFT = 6;       // m_sylshift
static constexpr int32_t  HC55516_SYLADD   = 0xfc1;   // m_syladd (used on NON-coincidence)
static constexpr int32_t  HC55516_INTSHIFT = 4;       // m_intshift

// Sign-extend a value from 'bits' width to int32_t (matches MAME util::sext)
static inline int32_t sext(int32_t value, int bits) {
    int shift = 32 - bits;
    return (value << shift) >> shift;
}

enum HC55516Param {
    PARAM_VOLUME = 0,
    PARAM_PRESET = 1,
    PARAM_VOICED = 2,
    PARAM_BRIGHTNESS = 3,
    PARAM_STEREO_WIDTH = 4,
    PARAM_GRITTINESS = 5,
};

// ============================================================================
// Vowel presets via CVSD bit patterns
// Presets match SP0250 ordering: 0=AH, 1=EE, 2=IH, 3=OH, 4=OO, 5=NN, 6=ZZ, 7=HH
//
// CVSD encodes waveforms as 1-bit delta streams. Runs of same bits produce
// large steps (slope overload = loud), alternating bits produce small steps
// (silence-like). Vowel character comes from the PATTERN of runs.
//
// Wide runs of 1s then 0s = low frequency fundamental (OH, OO)
// Fast alternation with periodic bursts = high frequency (EE, IH)
// ============================================================================

struct CVSDPreset {
    const char* name;
    uint8_t bitPattern[32];
    bool voiced;
    float gainScale;
};

static const CVSDPreset PRESETS[NUM_PRESETS] = {
    // 0: AH /a/ - open vowel, strong mid-frequency fundamental
    { "AH",
      { 0xFE, 0xFC, 0xF8, 0xE0, 0x00, 0x01, 0x03, 0x07,
        0x1F, 0x3F, 0x7F, 0xFF, 0xFE, 0xFC, 0xF0, 0xC0,
        0x00, 0x00, 0x03, 0x0F, 0x3F, 0x7F, 0xFF, 0xFF,
        0xFE, 0xF8, 0xE0, 0x80, 0x00, 0x01, 0x07, 0x1F },
      true, 0.9f },

    // 1: EE /i:/ - bright, rapid transitions, short runs
    { "EE",
      { 0xFF, 0x00, 0xFF, 0x00, 0xFC, 0x03, 0xFC, 0x03,
        0xFF, 0x00, 0xFF, 0x00, 0xF8, 0x07, 0xF8, 0x07,
        0xFF, 0x00, 0xFF, 0x00, 0xFC, 0x03, 0xFC, 0x03,
        0xFF, 0x00, 0xFF, 0x00, 0xF0, 0x0F, 0xF0, 0x0F },
      true, 0.85f },

    // 2: IH /ɪ/ - between AH and EE
    { "IH",
      { 0xFF, 0xFC, 0x00, 0x03, 0xFF, 0xFC, 0x00, 0x07,
        0xFF, 0xF8, 0x00, 0x07, 0xFF, 0xF0, 0x00, 0x0F,
        0xFF, 0xFC, 0x00, 0x03, 0xFF, 0xF8, 0x00, 0x07,
        0xFF, 0xF0, 0x00, 0x0F, 0xFF, 0xFC, 0x00, 0x03 },
      true, 0.85f },

    // 3: OH /oʊ/ - rounded, longer runs = lower frequency
    { "OH",
      { 0xFF, 0xFF, 0xFE, 0xFC, 0xF0, 0xC0, 0x00, 0x00,
        0x00, 0x01, 0x03, 0x0F, 0x3F, 0xFF, 0xFF, 0xFF,
        0xFE, 0xF8, 0xE0, 0x80, 0x00, 0x00, 0x00, 0x03,
        0x0F, 0x3F, 0x7F, 0xFF, 0xFF, 0xFF, 0xFC, 0xF0 },
      true, 0.9f },

    // 4: OO /u:/ - very rounded, longest runs = deepest fundamental
    { "OO",
      { 0xFF, 0xFF, 0xFF, 0xFF, 0xFE, 0xFC, 0xF0, 0xC0,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x03, 0x0F, 0x3F,
        0xFF, 0xFF, 0xFF, 0xFF, 0xFC, 0xF8, 0xE0, 0x80,
        0x00, 0x00, 0x00, 0x00, 0x03, 0x07, 0x1F, 0x7F },
      true, 0.85f },

    // 5: NN nasal - muted, irregular with anti-resonance character
    { "NN",
      { 0xFC, 0xF0, 0x0F, 0x03, 0xFE, 0xF8, 0x07, 0x01,
        0xFC, 0xE0, 0x1F, 0x03, 0xFF, 0xF0, 0x0F, 0x00,
        0xFE, 0xF8, 0x07, 0x01, 0xFC, 0xF0, 0x0F, 0x03,
        0xFE, 0xE0, 0x1F, 0x01, 0xFC, 0xF8, 0x07, 0x03 },
      true, 0.8f },

    // 6: ZZ fricative/buzz - random-ish pattern, noise-like
    { "ZZ",
      { 0xA5, 0x3C, 0x69, 0xC3, 0x5A, 0x96, 0xD2, 0x4B,
        0xB4, 0x2D, 0x78, 0xE1, 0x1E, 0x87, 0xF0, 0x0F,
        0x63, 0x9C, 0xC6, 0x39, 0xAD, 0x52, 0xB1, 0x4E,
        0xD8, 0x27, 0x7A, 0x85, 0xE3, 0x1C, 0x6B, 0x94 },
      false, 0.9f },

    // 7: HH breathy - soft noise, gentle alternation
    { "HH",
      { 0xAA, 0x55, 0xAA, 0x55, 0xA5, 0x5A, 0xA5, 0x5A,
        0x99, 0x66, 0x99, 0x66, 0x96, 0x69, 0x96, 0x69,
        0xAA, 0x55, 0xA5, 0x5A, 0x99, 0x66, 0x96, 0x69,
        0xAA, 0x55, 0x99, 0x66, 0xA5, 0x5A, 0x96, 0x69 },
      false, 0.6f },
};

struct CVSDVoice {
    uint8_t  shiftReg;
    int32_t  sylFilter;
    int32_t  intFilter;
    uint8_t  bitPattern[32];
    int      bitIndex;
    int      bitsPerPeriod;
    int      bitCount;
    uint16_t lfsr;
    bool     voiced;
    float    gainScale;

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

class HC55516Synth {
public:
    HC55516Synth() = default;

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
        m_grittiness = 0.7f;
        for (int v = 0; v < NUM_VOICES; v++) resetVoice(v);
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f, mixR = 0.0f;

            if (m_romPlaying) {
                if (m_romEnvLevel < 1.0f) { m_romEnvLevel += 0.002f; if (m_romEnvLevel > 1.0f) m_romEnvLevel = 1.0f; }
                m_romPhase += m_chipStep;
                while (m_romPhase >= 1.0) { m_romPhase -= 1.0; m_romPrevSample = m_romCurrentSample; m_romCurrentSample = generateROMSample(); }
                float t = (float)m_romPhase;
                float sample = m_romPrevSample * (1.0f - t) + m_romCurrentSample * t;
                mixL = sample * m_romEnvLevel; mixR = sample * m_romEnvLevel;
            }

            for (int v = 0; v < NUM_VOICES; v++) {
                CVSDVoice& voi = m_voices[v];
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
                    voi.currentSample = generateCVSDSample(voi);
                }

                float t = (float)voi.phase;
                float sample = voi.prevSample * (1.0f - t) + voi.currentSample * t;
                float vel = voi.velocity / 127.0f;
                float pan = 0.5f + m_stereoWidth * (((float)v / (NUM_VOICES - 1)) - 0.5f);
                float gainL = std::cos(pan * M_PI * 0.5f);
                float gainR = std::sin(pan * M_PI * 0.5f);
                float voiceSample = sample * vel * voi.envLevel * voi.gainScale;
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
        CVSDVoice& voi = m_voices[v];
        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.phase = 0.0;
        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;
        voi.shiftReg = 0;
        voi.sylFilter = 0x3f;  // MAME device_reset() value
        voi.intFilter = 0;

        float freq = 440.0f * std::pow(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        voi.bitsPerPeriod = (int)((float)m_chipRate / freq + 0.5f);
        if (voi.bitsPerPeriod < 8) voi.bitsPerPeriod = 8;
        if (voi.bitsPerPeriod > 2048) voi.bitsPerPeriod = 2048;
        voi.bitCount = 0;
        voi.bitIndex = 0;

        loadPresetData(v, m_currentPreset);
    }

    void noteOff(int midiNote) {
        for (int v = 0; v < NUM_VOICES; v++)
            if (m_voices[v].midiNote == midiNote && !m_voices[v].releasing) { m_voices[v].releasing = true; break; }
    }

    void allNotesOff() { for (int v = 0; v < NUM_VOICES; v++) m_voices[v].releasing = true; }

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
            case PARAM_VOICED: for (int v = 0; v < NUM_VOICES; v++) m_voices[v].voiced = (value > 0.5f); break;
            case PARAM_BRIGHTNESS: m_brightness = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_STEREO_WIDTH: m_stereoWidth = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_GRITTINESS: m_grittiness = std::max(0.0f, std::min(1.0f, value)); break;
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
            case PARAM_GRITTINESS: return m_grittiness;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1: m_grittiness = value / 127.0f; break;
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
                int bpp = (int)((float)m_chipRate / freq + 0.5f);
                if (bpp < 8) bpp = 8;
                if (bpp > 2048) bpp = 2048;
                m_voices[v].bitsPerPeriod = bpp;
            }
        }
    }

    void programChange(int program) { if (program >= 0 && program < NUM_PRESETS) m_currentPreset = program; }
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setPreset(int preset) { setParameter(PARAM_PRESET, (float)preset); }
    void writeRegister(int, int) { }

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const uint8_t*>(dataPtr);
        m_romSize = size;
    }
    void playBitstream(int byteOffset, int byteLength) {
        if (!m_romData || m_romSize == 0) return;
        if (byteOffset < 0 || byteOffset >= m_romSize) return;
        if (byteLength <= 0) byteLength = m_romSize - byteOffset;
        if (byteOffset + byteLength > m_romSize) byteLength = m_romSize - byteOffset;
        m_romPlaying = true;
        m_romByteOffset = byteOffset;
        m_romByteEnd = byteOffset + byteLength;
        m_romBitIndex = 0;
        m_romPhase = 0.0; m_romPrevSample = 0.0f; m_romCurrentSample = 0.0f; m_romEnvLevel = 0.0f;
        m_romShiftReg = 0; m_romSylFilter = 0x3f; m_romIntFilter = 0;
    }
    void stopSpeaking() { m_romPlaying = false; }

private:
    // MAME-exact HC55516 CVSD process_bit(), called once per bit.
    // MAME calls process_bit on BOTH rising and falling clock edges.
    // We simulate both edges per bit here.
    float generateROMSample() {
        if (!m_romPlaying) return 0.0f;
        int bytePos = m_romByteOffset + (m_romBitIndex / 8);
        if (bytePos >= m_romByteEnd) { m_romPlaying = false; return 0.0f; }
        int bitOff = m_romBitIndex % 8;
        // Sinistar 6800 clocks bits out LSB-first via software PIA
        bool bit = (m_romData[bytePos] >> bitOff) & 1;
        m_romBitIndex++;

        // === RISING EDGE (active clock transition) ===
        // MAME process_bit called with clock_state=true (rising)

        // Freeze detection (MAME line 283) - computed fresh each call
        bool frozen = ((m_romIntFilter >= 0x180) && !bit) ||
                      ((m_romIntFilter <= -0x180) && bit);

        // Shift the new bit into the 3-bit shift register
        m_romShiftReg = ((m_romShiftReg << 1) | (bit ? 1 : 0)) & SHIFTREG_MASK;

        // Syllabic filter update (MAME lines 302-313)
        if (((m_romShiftReg & SHIFTREG_MASK) == 0) ||
            ((m_romShiftReg & SHIFTREG_MASK) == SHIFTREG_MASK))
        {
            // Coincidence: all same bits
            if (!frozen)
                m_romSylFilter += (int32_t)(((~m_romSylFilter) & HC55516_SYLMASK) >> HC55516_SYLSHIFT);
        }
        else
        {
            // Non-coincidence: mixed bits
            if (!frozen)
                m_romSylFilter += (int32_t)(((~m_romSylFilter) & HC55516_SYLMASK) >> HC55516_SYLSHIFT) + HC55516_SYLADD;
        }
        m_romSylFilter &= 0xfff;  // 12-bit register

        // Integration leak term from active edge (MAME line 315)
        {
            int32_t sum = sext(((~m_romIntFilter) >> HC55516_INTSHIFT) + 1, 10);
            if (!frozen)
                m_romIntFilter = sext(m_romIntFilter + sum, 10);
        }

        // === FALLING EDGE (inactive clock transition) ===
        // MAME process_bit called with clock_state=false (falling)

        // Re-evaluate frozen with updated intFilter (MAME line 283 again)
        frozen = ((m_romIntFilter >= 0x180) && !bit) ||
                 ((m_romIntFilter <= -0x180) && bit);

        // Integration step from syllabic filter (MAME lines 318-328)
        {
            int32_t sum2;
            if (m_romShiftReg & 1)  // last bit was 1
                sum2 = sext((~std::max((int32_t)2, m_romSylFilter >> 6)) + 1, 10);
            else  // last bit was 0
                sum2 = sext(std::max((int32_t)2, m_romSylFilter >> 6), 10);
            if (!frozen)
                m_romIntFilter = sext(m_romIntFilter + sum2, 10);
        }

        // Output scaling (MAME line 340)
        // Scale 10-bit signed (-512..511) to 16-bit signed (-32768..32767)
        int16_t next_sample = (int16_t)((m_romIntFilter << 6) |
            (((m_romIntFilter & 0x3ff) ^ 0x200) >> 4));

        return (float)next_sample / 32768.0f;
    }

    // MAME-exact CVSD for preset/voice synthesis
    float generateCVSDSample(CVSDVoice& voi) {
        bool bit;
        if (voi.voiced) {
            int byteIdx = (voi.bitIndex / 8) % 32;
            int bitIdx = voi.bitIndex % 8;
            bit = (voi.bitPattern[byteIdx] >> bitIdx) & 1;  // LSB-first
        } else {
            voi.lfsr ^= (voi.lfsr ^ (voi.lfsr >> 1)) << 15;
            voi.lfsr >>= 1;
            bit = voi.lfsr & 1;
        }

        // === RISING EDGE (active) ===
        bool frozen = ((voi.intFilter >= 0x180) && !bit) ||
                      ((voi.intFilter <= -0x180) && bit);

        voi.shiftReg = ((voi.shiftReg << 1) | (bit ? 1 : 0)) & SHIFTREG_MASK;

        // Syllabic filter (MAME lines 302-313)
        if (((voi.shiftReg & SHIFTREG_MASK) == 0) ||
            ((voi.shiftReg & SHIFTREG_MASK) == SHIFTREG_MASK))
        {
            if (!frozen)
                voi.sylFilter += (int32_t)(((~voi.sylFilter) & HC55516_SYLMASK) >> HC55516_SYLSHIFT);
        }
        else
        {
            if (!frozen)
                voi.sylFilter += (int32_t)(((~voi.sylFilter) & HC55516_SYLMASK) >> HC55516_SYLSHIFT) + HC55516_SYLADD;
        }
        voi.sylFilter &= 0xfff;

        // Leak term from active edge
        {
            int32_t sum = sext(((~voi.intFilter) >> HC55516_INTSHIFT) + 1, 10);
            if (!frozen)
                voi.intFilter = sext(voi.intFilter + sum, 10);
        }

        // === FALLING EDGE (inactive) ===
        frozen = ((voi.intFilter >= 0x180) && !bit) ||
                 ((voi.intFilter <= -0x180) && bit);
        {
            int32_t sum2;
            if (voi.shiftReg & 1)
                sum2 = sext((~std::max((int32_t)2, voi.sylFilter >> 6)) + 1, 10);
            else
                sum2 = sext(std::max((int32_t)2, voi.sylFilter >> 6), 10);
            if (!frozen)
                voi.intFilter = sext(voi.intFilter + sum2, 10);
        }

        // Advance bit position
        voi.bitCount++;
        if (voi.bitCount >= voi.bitsPerPeriod) {
            voi.bitCount = 0;
            voi.bitIndex = 0;
        } else {
            voi.bitIndex++;
            if (voi.bitIndex >= 256) voi.bitIndex = 0;
        }

        // Output scaling (MAME line 340)
        int16_t next_sample = (int16_t)((voi.intFilter << 6) |
            (((voi.intFilter & 0x3ff) ^ 0x200) >> 4));
        return (float)next_sample / 32768.0f;
    }

    void resetVoice(int v) {
        CVSDVoice& voi = m_voices[v];
        voi.shiftReg = 0; voi.sylFilter = 0x3f; voi.intFilter = 0;
        voi.bitIndex = 0; voi.bitsPerPeriod = 256; voi.bitCount = 0;
        voi.lfsr = 0x7fff; voi.voiced = true; voi.gainScale = 1.0f;
        voi.midiNote = -1; voi.velocity = 0; voi.age = 0;
        voi.active = false; voi.releasing = false; voi.envLevel = 0.0f;
        voi.prevSample = 0.0f; voi.currentSample = 0.0f; voi.phase = 0.0;
        std::memset(voi.bitPattern, 0, sizeof(voi.bitPattern));
    }

    void loadPresetData(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        CVSDVoice& voi = m_voices[voice];
        std::memcpy(voi.bitPattern, PRESETS[preset].bitPattern, 32);
        voi.voiced = PRESETS[preset].voiced;
        voi.gainScale = PRESETS[preset].gainScale;
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
    CVSDVoice m_voices[NUM_VOICES];
    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
    float m_brightness = 0.5f;
    float m_grittiness = 0.7f;
    int m_currentPreset = 0;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;

    const uint8_t* m_romData = nullptr;
    int m_romSize = 0;
    bool m_romPlaying = false;
    int m_romByteOffset = 0;
    int m_romByteEnd = 0;
    int m_romBitIndex = 0;
    double m_romPhase = 0.0;
    float m_romPrevSample = 0.0f;
    float m_romCurrentSample = 0.0f;
    float m_romEnvLevel = 0.0f;
    uint8_t m_romShiftReg = 0;
    int32_t m_romSylFilter = 0;
    int32_t m_romIntFilter = 0;
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(HC55516Module) {
    emscripten::class_<HC55516Synth>("HC55516Synth")
        .constructor<>()
        .function("initialize", &HC55516Synth::initialize)
        .function("process", &HC55516Synth::process)
        .function("noteOn", &HC55516Synth::noteOn)
        .function("noteOff", &HC55516Synth::noteOff)
        .function("allNotesOff", &HC55516Synth::allNotesOff)
        .function("setParameter", &HC55516Synth::setParameter)
        .function("getParameter", &HC55516Synth::getParameter)
        .function("controlChange", &HC55516Synth::controlChange)
        .function("pitchBend", &HC55516Synth::pitchBend)
        .function("programChange", &HC55516Synth::programChange)
        .function("setVolume", &HC55516Synth::setVolume)
        .function("setPreset", &HC55516Synth::setPreset)
        .function("writeRegister", &HC55516Synth::writeRegister)
        .function("loadROM", &HC55516Synth::loadROM)
        .function("playBitstream", &HC55516Synth::playBitstream)
        .function("stopSpeaking", &HC55516Synth::stopSpeaking);
}
#endif
