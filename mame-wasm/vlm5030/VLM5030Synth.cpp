/**
 * VLM5030Synth.cpp - Sanyo VLM5030 LPC Speech Synthesizer for WebAssembly
 * Based on MAME's VLM5030 emulator by Tatsuyuki Satoh
 *
 * Uses the ACTUAL VLM5030 coefficient tables from MAME (decapped and verified).
 * 10-pole lattice filter with chirp excitation and frame interpolation.
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

static constexpr int LPC_RATE = 8000;
static constexpr int NUM_VOICES = 4;
static constexpr int NUM_COEFFS = 10;
static constexpr int NUM_PRESETS = 8;
static constexpr int FR_SIZE = 4;   // Interpolation steps per frame

// ============================================================================
// VLM5030 coefficient tables — from MAME decap (tms5110r.hxx vlm5030_coeff)
// ============================================================================

static const uint16_t ENERGY_TABLE[32] = {
    0,  1,  2,  3,  5,  6,  7,  9,
   11, 13, 15, 17, 19, 22, 24, 27,
   31, 34, 38, 42, 47, 51, 57, 62,
   68, 75, 82, 89, 98,107,116,127
};

static const uint8_t PITCH_TABLE[32] = {
    0, 21, 22, 23, 24, 25, 26, 27,
   28, 29, 31, 33, 35, 37, 39, 41,
   43, 45, 49, 53, 57, 61, 65, 69,
   73, 77, 85, 93,101,109,117,125
};

// K1: 64 entries (6 bits)
static const int16_t K1_TABLE[64] = {
    390, 403, 414, 425, 434, 443, 450, 457,
    463, 469, 474, 478, 482, 485, 488, 491,
    494, 496, 498, 499, 501, 502, 503, 504,
    505, 506, 507, 507, 508, 508, 509, 509,
   -390,-376,-360,-344,-325,-305,-284,-261,
   -237,-211,-183,-155,-125, -95, -64, -32,
      0,  32,  64,  95, 125, 155, 183, 211,
    237, 261, 284, 305, 325, 344, 360, 376
};

// K2: 32 entries (5 bits)
static const int16_t K2_TABLE[32] = {
      0,  50, 100, 149, 196, 241, 284, 325,
    362, 396, 426, 452, 473, 490, 502, 510,
      0,-510,-502,-490,-473,-452,-426,-396,
   -362,-325,-284,-241,-196,-149,-100, -50
};

// K3-K4: 16 entries each (4 bits) — table index << 6
static const int16_t K3_TABLE[16] = {
    0, 64, 128, 192, 256, 320, 384, 448,
   -512,-448,-384,-320,-256,-192,-128, -64
};

// K5-K10: 8 entries each (3 bits) — table index << 7
static const int16_t K5_TABLE[8] = {
    0, 128, 256, 384, -512, -384, -256, -128
};

// Chirp ROM (from VLM5030 decap)
static const int8_t CHIRP_TABLE[52] = {
    0, 127, 127, 0, 0, 0, 0, 0,
    0,   0,   0, 0, 0, 0, 0, 0,
    0,   0,   0, 0, 0, 0, 0, 0,
    0,   0,   0, 0, 0, 0, 0, 0,
    0,   0,   0, 0, 0, 0, 0, 0,
    0,   0,   0, 0, 0, 0, 0, 0,
    0,   0,   0, 0
};

// Interpolation shift coefficients (from MAME)
static const int8_t INTERP_SHIFT[8] = { 3, 3, 3, 2, 2, 1, 1, 0 };

enum VLM5030Param {
    PARAM_VOLUME = 0,
    PARAM_VOWEL = 1,
    PARAM_VOICED = 2,
    PARAM_BRIGHTNESS = 3,
    PARAM_STEREO_WIDTH = 4,
    PARAM_FORMANT_SHIFT = 5,
};

// ============================================================================
// Vowel presets using ACTUAL coefficient table indices
// Each preset specifies indices into the VLM5030 coefficient tables
// ============================================================================

struct VowelPreset {
    const char* name;
    uint8_t energyIdx;  // Index into ENERGY_TABLE (0-31)
    uint8_t pitchIdx;   // Index into PITCH_TABLE (0-31)
    uint8_t k1Idx;      // Index into K1_TABLE (0-63)
    uint8_t k2Idx;      // Index into K2_TABLE (0-31)
    uint8_t k3Idx;      // Index into K3_TABLE (0-15)
    uint8_t k4Idx;      // Index into K3_TABLE (0-15)
    uint8_t k5Idx;      // Index into K5_TABLE (0-7)
    uint8_t k6Idx;      // Index into K5_TABLE (0-7)
    uint8_t k7Idx;      // Index into K5_TABLE (0-7)
    uint8_t k8Idx;      // Index into K5_TABLE (0-7)
    uint8_t k9Idx;      // Index into K5_TABLE (0-7)
    uint8_t k10Idx;     // Index into K5_TABLE (0-7)
    bool voiced;
};

static const VowelPreset VOWEL_PRESETS[NUM_PRESETS] = {
    // 0: AH /a/ - open, strong, F1~730Hz F2~1090Hz
    { "AH", 22, 14, 44, 5, 4, 2, 1, 0, 0, 0, 0, 0, true },
    // 1: EE /i:/ - close front, bright, F1~270Hz F2~2290Hz
    { "EE", 20, 12, 36, 14, 6, 4, 2, 1, 0, 0, 0, 0, true },
    // 2: IH /ɪ/ - open front, F1~390Hz F2~1990Hz
    { "IH", 20, 13, 40, 10, 5, 3, 2, 1, 0, 0, 0, 0, true },
    // 3: OH /oʊ/ - mid back, rounded, F1~570Hz F2~840Hz
    { "OH", 22, 15, 48, 24, 3, 2, 1, 0, 0, 0, 0, 0, true },
    // 4: OO /u:/ - close back, deep, F1~300Hz F2~870Hz
    { "OO", 20, 17, 52, 26, 2, 1, 0, 0, 0, 0, 0, 0, true },
    // 5: NN nasal
    { "NN", 18, 14, 42, 8, 10, 6, 3, 2, 1, 0, 0, 0, true },
    // 6: SS fricative (unvoiced)
    { "SS", 14, 0, 48, 4, 2, 1, 4, 3, 2, 1, 0, 0, false },
    // 7: HH breathy (unvoiced)
    { "HH", 12, 0, 50, 3, 1, 0, 0, 0, 0, 0, 0, 0, false },
};

// ============================================================================
// Single LPC voice
// ============================================================================

struct LPCVoice {
    int32_t x[NUM_COEFFS];       // Filter delay line

    // Current parameters (interpolated)
    int16_t  currentK[NUM_COEFFS];
    uint16_t currentEnergy;
    uint8_t  currentPitch;
    uint8_t  pitchCount;

    // Target parameters (next frame)
    int16_t  targetK[NUM_COEFFS];
    uint16_t targetEnergy;
    uint8_t  targetPitch;

    // Old parameters (previous frame, for interpolation)
    int16_t  oldK[NUM_COEFFS];
    uint16_t oldEnergy;
    uint8_t  oldPitch;

    // Interpolation state
    uint8_t  interpCount;
    uint8_t  sampleCount;
    int      frameSize;

    uint16_t lfsr;
    bool     voiced;

    int      midiNote;
    int      velocity;
    uint32_t age;
    bool     active;
    bool     releasing;
    float    envLevel;

    float    prevSample;
    float    currentSample;
    double   lpcPhase;
};

class VLM5030Synth {
public:
    VLM5030Synth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_lpcStep = (double)LPC_RATE / (double)sampleRate;
        m_volume = 0.8f;
        m_stereoWidth = 0.3f;
        m_currentPreset = 0;
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
        m_brightness = 0.5f;
        m_formantShift = 0.0f;
        for (int v = 0; v < NUM_VOICES; v++) resetVoice(v);
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f, mixR = 0.0f;

            // ROM playback mode (mono, centered)
            if (m_romPlaying) {
                if (m_romEnvLevel < 1.0f) {
                    m_romEnvLevel += 0.002f;
                    if (m_romEnvLevel > 1.0f) m_romEnvLevel = 1.0f;
                }

                m_romPhase += m_lpcStep;
                while (m_romPhase >= 1.0) {
                    m_romPhase -= 1.0;
                    m_romPrevSample = m_romCurrentSample;
                    m_romCurrentSample = generateROMSample();
                }

                float t = (float)m_romPhase;
                float sample = m_romPrevSample * (1.0f - t) + m_romCurrentSample * t;
                mixL = sample * m_romEnvLevel;
                mixR = sample * m_romEnvLevel;
            }

            // Polyphonic voice mode
            for (int v = 0; v < NUM_VOICES; v++) {
                LPCVoice& voi = m_voices[v];
                if (!voi.active && voi.envLevel <= 0.001f) continue;

                if (voi.releasing) {
                    voi.envLevel -= 0.0005f;
                    if (voi.envLevel <= 0.0f) { voi.envLevel = 0.0f; voi.active = false; continue; }
                } else if (voi.envLevel < 1.0f) {
                    voi.envLevel += 0.002f;
                    if (voi.envLevel > 1.0f) voi.envLevel = 1.0f;
                }

                voi.lpcPhase += m_lpcStep;
                while (voi.lpcPhase >= 1.0) {
                    voi.lpcPhase -= 1.0;
                    voi.prevSample = voi.currentSample;
                    voi.currentSample = generateLPCSample(voi);
                }

                float t = (float)voi.lpcPhase;
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
        LPCVoice& voi = m_voices[v];
        voi.midiNote = midiNote;
        voi.velocity = velocity;
        voi.age = m_noteCounter++;
        voi.active = true;
        voi.releasing = false;
        voi.envLevel = 0.0f;
        voi.lpcPhase = 0.0;
        voi.prevSample = 0.0f;
        voi.currentSample = 0.0f;
        voi.pitchCount = 0;
        voi.interpCount = FR_SIZE;
        voi.sampleCount = 40; // Normal frame size (160/FR_SIZE)
        voi.frameSize = 40;
        std::memset(voi.x, 0, sizeof(voi.x));

        // MIDI note overrides pitch table
        float freq = 440.0f * std::pow(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        int period = (int)((float)LPC_RATE / freq + 0.5f);
        if (period < 1) period = 1;
        if (period > 255) period = 255;

        // Load preset into target and old (no interpolation on first frame)
        loadVowelPreset(v, m_currentPreset);
        // Override pitch with MIDI note
        voi.currentPitch = period;
        voi.targetPitch = period;
        voi.oldPitch = period;

        // Velocity scales energy
        float energyScale = velocity / 127.0f;
        voi.currentEnergy = (uint16_t)(voi.targetEnergy * energyScale);
        voi.oldEnergy = voi.currentEnergy;
    }

    void noteOff(int midiNote) {
        for (int v = 0; v < NUM_VOICES; v++)
            if (m_voices[v].midiNote == midiNote && !m_voices[v].releasing) { m_voices[v].releasing = true; break; }
    }

    void allNotesOff() { for (int v = 0; v < NUM_VOICES; v++) m_voices[v].releasing = true; }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME: m_volume = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_VOWEL: {
                int preset = std::max(0, std::min(NUM_PRESETS - 1, (int)value));
                m_currentPreset = preset;
                for (int v = 0; v < NUM_VOICES; v++)
                    if (m_voices[v].active) loadVowelPreset(v, preset);
                break;
            }
            case PARAM_VOICED: for (int v = 0; v < NUM_VOICES; v++) m_voices[v].voiced = (value > 0.5f); break;
            case PARAM_BRIGHTNESS: m_brightness = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_STEREO_WIDTH: m_stereoWidth = std::max(0.0f, std::min(1.0f, value)); break;
            case PARAM_FORMANT_SHIFT: m_formantShift = std::max(-1.0f, std::min(1.0f, value)); break;
            default: break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_VOWEL: return (float)m_currentPreset;
            case PARAM_VOICED: return m_voices[0].voiced ? 1.0f : 0.0f;
            case PARAM_BRIGHTNESS: return m_brightness;
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            case PARAM_FORMANT_SHIFT: return m_formantShift;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1: m_brightness = value / 127.0f; break;
            case 7: m_volume = value / 127.0f; break;
            case 70: setParameter(PARAM_VOWEL, (value / 127.0f) * (NUM_PRESETS - 1)); break;
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
                int period = (int)((float)LPC_RATE / freq + 0.5f);
                if (period < 1) period = 1;
                if (period > 255) period = 255;
                m_voices[v].currentPitch = period;
                m_voices[v].targetPitch = period;
            }
        }
    }

    void programChange(int program) { if (program >= 0 && program < NUM_PRESETS) m_currentPreset = program; }
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setVowel(int preset) { setParameter(PARAM_VOWEL, (float)preset); }
    void writeRegister(int, int) { }

    // ===========================================================================
    // ROM Loading (matches TMS5220 pattern)
    // ===========================================================================

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const uint8_t*>(dataPtr);
        m_romSize = size;
    }

    void speakWord(int wordIndex) {
        if (!m_romData || m_romSize == 0) return;

        // VLM5030 ROM layout (from MAME vlm5030.cpp):
        // Address table at start of ROM: pairs of bytes [high, low] for each word
        // Word 0 at offset 0, word 1 at offset 2, etc.
        int tableOffset = wordIndex * 2;
        if (tableOffset + 1 >= m_romSize) return;

        uint16_t addr = (m_romData[tableOffset] << 8) | m_romData[tableOffset + 1];
        if (addr == 0 || addr >= m_romSize) return;

        speakAtAddress(addr);
    }

    void speakAtAddress(int byteAddr) {
        if (!m_romData || m_romSize == 0) return;
        if (byteAddr < 0 || byteAddr >= m_romSize) return;

        m_romPlaying = true;
        m_romAddr = byteAddr;
        m_romBitAddr = byteAddr * 8;
        m_romPhase = 0.0;
        m_romPrevSample = 0.0f;
        m_romCurrentSample = 0.0f;
        m_romEnvLevel = 0.0f;
        m_romSampleCount = 0;
        m_romFrameSize = 40; // 160 samples / 4 interp steps
        m_romInterpCount = 0;
        m_romPitchCount = 0;

        // Clear filter state
        std::memset(m_romX, 0, sizeof(m_romX));
        std::memset(m_romCurrentK, 0, sizeof(m_romCurrentK));
        std::memset(m_romOldK, 0, sizeof(m_romOldK));
        m_romCurrentEnergy = 0;
        m_romOldEnergy = 0;
        m_romCurrentPitch = 0;
        m_romOldPitch = 0;
        m_romLfsr = 0x7fff;

        // Parse first frame
        parseROMFrame();
    }

    void stopSpeaking() {
        m_romPlaying = false;
    }

private:
    // ========================================================================
    // LPC sample generation (from MAME VLM5030 sound_stream_update)
    // With frame interpolation matching the real hardware
    // ========================================================================

    float generateLPCSample(LPCVoice& voi) {
        // Check if we need a new interpolation step
        if (voi.sampleCount == 0) {
            voi.sampleCount = voi.frameSize;

            if (voi.interpCount == 0) {
                // New frame — save old, set current = old
                voi.interpCount = FR_SIZE;
                voi.oldEnergy = voi.currentEnergy;
                voi.oldPitch = voi.currentPitch;
                for (int i = 0; i < NUM_COEFFS; i++)
                    voi.oldK[i] = voi.currentK[i];
            }

            // Interpolate: current = old + (target - old) * interp_effect / FR_SIZE
            int interpEffect = FR_SIZE - (voi.interpCount % FR_SIZE);
            voi.currentEnergy = voi.oldEnergy + (int)(voi.targetEnergy - voi.oldEnergy) * interpEffect / FR_SIZE;
            if (voi.oldPitch > 1)
                voi.currentPitch = voi.oldPitch + (int)(voi.targetPitch - voi.oldPitch) * interpEffect / FR_SIZE;
            for (int i = 0; i < NUM_COEFFS; i++)
                voi.currentK[i] = voi.oldK[i] + (voi.targetK[i] - voi.oldK[i]) * interpEffect / FR_SIZE;

            voi.interpCount--;
        }

        if (voi.currentEnergy == 0) {
            voi.sampleCount--;
            return 0.0f;
        }

        // Excitation source
        int32_t current_val;
        if (!voi.voiced || voi.currentPitch <= 1) {
            // Unvoiced: noise
            voi.lfsr ^= (voi.lfsr ^ (voi.lfsr >> 1)) << 15;
            voi.lfsr >>= 1;
            current_val = (voi.lfsr & 1) ? voi.currentEnergy : -(int32_t)voi.currentEnergy;
        } else {
            // Voiced: chirp excitation (from VLM5030 chirp ROM)
            if (voi.pitchCount < 52) {
                current_val = ((int32_t)CHIRP_TABLE[voi.pitchCount] * voi.currentEnergy) / 128;
            } else {
                current_val = 0;
            }
        }

        // 10-pole lattice filter (1:1 from MAME VLM5030)
        int32_t u[11];
        u[10] = current_val;
        for (int i = 9; i >= 0; i--)
            u[i] = u[i + 1] - ((-voi.currentK[i] * voi.x[i]) / 512);
        for (int i = 9; i >= 1; i--)
            voi.x[i] = voi.x[i - 1] + ((-voi.currentK[i - 1] * u[i - 1]) / 512);
        voi.x[0] = u[0];

        // Advance pitch counter
        voi.pitchCount++;
        if (voi.voiced && voi.currentPitch > 0) {
            if (voi.pitchCount >= voi.currentPitch)
                voi.pitchCount = 0;
        }

        voi.sampleCount--;

        // Normalize — VLM5030 uses ~9-bit DAC
        float sample = (float)u[0] / 512.0f;
        sample = std::max(-1.0f, std::min(1.0f, sample));
        return sample;
    }

    void resetVoice(int v) {
        LPCVoice& voi = m_voices[v];
        std::memset(voi.x, 0, sizeof(voi.x));
        std::memset(voi.currentK, 0, sizeof(voi.currentK));
        std::memset(voi.targetK, 0, sizeof(voi.targetK));
        std::memset(voi.oldK, 0, sizeof(voi.oldK));
        voi.currentEnergy = 0; voi.targetEnergy = 0; voi.oldEnergy = 0;
        voi.currentPitch = 30; voi.targetPitch = 30; voi.oldPitch = 30;
        voi.pitchCount = 0; voi.interpCount = FR_SIZE;
        voi.sampleCount = 40; voi.frameSize = 40;
        voi.lfsr = 0x7fff; voi.voiced = true;
        voi.midiNote = -1; voi.velocity = 0; voi.age = 0;
        voi.active = false; voi.releasing = false; voi.envLevel = 0.0f;
        voi.prevSample = 0.0f; voi.currentSample = 0.0f; voi.lpcPhase = 0.0;
    }

    void loadVowelPreset(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        LPCVoice& voi = m_voices[voice];
        const VowelPreset& vp = VOWEL_PRESETS[preset];

        // Save current as old for interpolation
        voi.oldEnergy = voi.currentEnergy;
        voi.oldPitch = voi.currentPitch;
        for (int i = 0; i < NUM_COEFFS; i++)
            voi.oldK[i] = voi.currentK[i];

        // Set target from coefficient tables using preset indices
        voi.targetEnergy = ENERGY_TABLE[vp.energyIdx & 31];

        // Apply formant shift to K indices
        int k1Shift = (int)(m_formantShift * 5);

        int k1i = std::max(0, std::min(63, (int)vp.k1Idx + k1Shift));
        int k2i = std::max(0, std::min(31, (int)vp.k2Idx));

        voi.targetK[0] = K1_TABLE[k1i];
        voi.targetK[1] = K2_TABLE[k2i];
        voi.targetK[2] = K3_TABLE[vp.k3Idx & 15];
        voi.targetK[3] = K3_TABLE[vp.k4Idx & 15]; // K4 uses same table as K3
        voi.targetK[4] = K5_TABLE[vp.k5Idx & 7];
        voi.targetK[5] = K5_TABLE[vp.k6Idx & 7];
        voi.targetK[6] = K5_TABLE[vp.k7Idx & 7];
        voi.targetK[7] = K5_TABLE[vp.k8Idx & 7];
        voi.targetK[8] = K5_TABLE[vp.k9Idx & 7];
        voi.targetK[9] = K5_TABLE[vp.k10Idx & 7];

        voi.voiced = vp.voiced;

        // Reset interpolation counter for smooth transition
        voi.interpCount = FR_SIZE;
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

    // ===========================================================================
    // ROM playback engine (from MAME vlm5030.cpp parse_frame / sound_stream_update)
    // ===========================================================================

    uint8_t readROMByte(int addr) {
        if (addr >= 0 && addr < m_romSize) return m_romData[addr];
        return 0;
    }

    // Extract N bits from ROM at bit position (LSB-first within bytes)
    uint16_t getROMBits(int startBit, int numBits) {
        int bytePos = startBit / 8;
        int bitOff = startBit & 7;
        uint16_t val = readROMByte(bytePos);
        if (bitOff + numBits > 8)
            val |= (uint16_t)readROMByte(bytePos + 1) << 8;
        return (val >> bitOff) & ((1 << numBits) - 1);
    }

    void parseROMFrame() {
        // Read command byte
        uint8_t cmd = readROMByte(m_romAddr);

        if (cmd & 0x01) {
            // Extended frame
            if (cmd & 0x02) {
                // End of speech
                m_romPlaying = false;
                return;
            }
            // Silent frames
            int count = ((cmd >> 2) & 0x03) * 2 + 2;
            m_romSilentFrames = count;
            m_romAddr++;
            // Set energy to 0 for silence
            m_romOldEnergy = m_romCurrentEnergy;
            m_romCurrentEnergy = 0;
            m_romInterpCount = 0;
            m_romSampleCount = m_romFrameSize;
            return;
        }

        // Normal speech frame: 48 bits (6 bytes)
        int bitBase = m_romAddr * 8;

        // Save old parameters for interpolation
        m_romOldEnergy = m_romCurrentEnergy;
        m_romOldPitch = m_romCurrentPitch;
        for (int i = 0; i < NUM_COEFFS; i++)
            m_romOldK[i] = m_romCurrentK[i];

        // Parse bit-packed frame (from MAME vlm5030.cpp)
        uint8_t energyIdx = getROMBits(bitBase + 0, 5) & 31;
        uint8_t pitchIdx  = getROMBits(bitBase + 5, 5) & 31;
        uint8_t k1Idx     = getROMBits(bitBase + 10, 6) & 63;
        uint8_t k2Idx     = getROMBits(bitBase + 16, 5) & 31;
        uint8_t k3Idx     = getROMBits(bitBase + 21, 4) & 15;
        uint8_t k4Idx     = getROMBits(bitBase + 25, 4) & 15;
        uint8_t k5Idx     = getROMBits(bitBase + 29, 3) & 7;
        uint8_t k6Idx     = getROMBits(bitBase + 32, 3) & 7;
        uint8_t k7Idx     = getROMBits(bitBase + 35, 3) & 7;
        uint8_t k8Idx     = getROMBits(bitBase + 38, 3) & 7;
        uint8_t k9Idx     = getROMBits(bitBase + 41, 3) & 7;
        uint8_t k10Idx    = getROMBits(bitBase + 44, 3) & 7;

        // Look up coefficient tables
        m_romTargetEnergy = ENERGY_TABLE[energyIdx];
        m_romTargetPitch  = PITCH_TABLE[pitchIdx];
        m_romTargetK[0]   = K1_TABLE[k1Idx];
        m_romTargetK[1]   = K2_TABLE[k2Idx];
        m_romTargetK[2]   = K3_TABLE[k3Idx];
        m_romTargetK[3]   = K3_TABLE[k4Idx];
        m_romTargetK[4]   = K5_TABLE[k5Idx];
        m_romTargetK[5]   = K5_TABLE[k6Idx];
        m_romTargetK[6]   = K5_TABLE[k7Idx];
        m_romTargetK[7]   = K5_TABLE[k8Idx];
        m_romTargetK[8]   = K5_TABLE[k9Idx];
        m_romTargetK[9]   = K5_TABLE[k10Idx];

        m_romAddr += 6; // Advance past 6-byte frame
        m_romInterpCount = 0;
        m_romSampleCount = m_romFrameSize;
        m_romSilentFrames = 0;
    }

    float generateROMSample() {
        if (!m_romPlaying) return 0.0f;

        // Handle silent frames
        if (m_romSilentFrames > 0) {
            m_romSampleCount--;
            if (m_romSampleCount <= 0) {
                m_romSilentFrames--;
                if (m_romSilentFrames <= 0) {
                    parseROMFrame();
                } else {
                    m_romSampleCount = m_romFrameSize;
                }
            }
            return 0.0f;
        }

        // Interpolation step
        if (m_romSampleCount <= 0) {
            m_romInterpCount++;
            if (m_romInterpCount >= FR_SIZE) {
                // End of frame — parse next
                parseROMFrame();
                if (!m_romPlaying) return 0.0f;
            } else {
                m_romSampleCount = m_romFrameSize;
            }
        }

        // Interpolate parameters
        float interpFrac = (float)m_romInterpCount / (float)FR_SIZE;
        uint16_t energy = (uint16_t)(m_romOldEnergy + (m_romTargetEnergy - m_romOldEnergy) * interpFrac);
        uint8_t pitch = (uint8_t)(m_romOldPitch + (int)(m_romTargetPitch - m_romOldPitch) * interpFrac);
        int16_t kInterp[NUM_COEFFS];
        for (int i = 0; i < NUM_COEFFS; i++)
            kInterp[i] = (int16_t)(m_romOldK[i] + (m_romTargetK[i] - m_romOldK[i]) * interpFrac);

        if (energy == 0) {
            m_romSampleCount--;
            return 0.0f;
        }

        // Excitation
        int32_t current_val;
        if (pitch <= 1) {
            // Unvoiced: noise
            m_romLfsr ^= (m_romLfsr ^ (m_romLfsr >> 1)) << 15;
            m_romLfsr >>= 1;
            current_val = (m_romLfsr & 1) ? energy : -(int32_t)energy;
        } else {
            // Voiced: chirp
            if (m_romPitchCount < 52)
                current_val = ((int32_t)CHIRP_TABLE[m_romPitchCount] * energy) / 128;
            else
                current_val = 0;
        }

        // 10-pole lattice filter
        int32_t u[11];
        u[10] = current_val;
        for (int i = 9; i >= 0; i--)
            u[i] = u[i + 1] - ((-kInterp[i] * m_romX[i]) / 512);
        for (int i = 9; i >= 1; i--)
            m_romX[i] = m_romX[i - 1] + ((-kInterp[i - 1] * u[i - 1]) / 512);
        m_romX[0] = u[0];

        // Advance pitch
        m_romPitchCount++;
        if (pitch > 0 && m_romPitchCount >= pitch)
            m_romPitchCount = 0;

        m_romSampleCount--;

        float sample = (float)u[0] / 512.0f;
        return std::max(-1.0f, std::min(1.0f, sample));
    }

    int m_sampleRate = 44100;
    double m_lpcStep = 0.0;
    LPCVoice m_voices[NUM_VOICES];
    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
    float m_brightness = 0.5f;
    float m_formantShift = 0.0f;
    int m_currentPreset = 0;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;

    // ROM playback state
    const uint8_t* m_romData = nullptr;
    int m_romSize = 0;
    bool m_romPlaying = false;
    int m_romAddr = 0;
    int m_romBitAddr = 0;
    double m_romPhase = 0.0;
    float m_romPrevSample = 0.0f;
    float m_romCurrentSample = 0.0f;
    float m_romEnvLevel = 0.0f;
    int m_romSampleCount = 0;
    int m_romFrameSize = 40;
    int m_romInterpCount = 0;
    int m_romPitchCount = 0;
    int m_romSilentFrames = 0;
    uint16_t m_romLfsr = 0x7fff;
    int32_t m_romX[NUM_COEFFS] = {};
    uint16_t m_romCurrentEnergy = 0;
    uint16_t m_romOldEnergy = 0;
    uint16_t m_romTargetEnergy = 0;
    uint8_t m_romCurrentPitch = 0;
    uint8_t m_romOldPitch = 0;
    uint8_t m_romTargetPitch = 0;
    int16_t m_romCurrentK[NUM_COEFFS] = {};
    int16_t m_romOldK[NUM_COEFFS] = {};
    int16_t m_romTargetK[NUM_COEFFS] = {};
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(VLM5030Module) {
    emscripten::class_<VLM5030Synth>("VLM5030Synth")
        .constructor<>()
        .function("initialize", &VLM5030Synth::initialize)
        .function("process", &VLM5030Synth::process)
        .function("noteOn", &VLM5030Synth::noteOn)
        .function("noteOff", &VLM5030Synth::noteOff)
        .function("allNotesOff", &VLM5030Synth::allNotesOff)
        .function("setParameter", &VLM5030Synth::setParameter)
        .function("getParameter", &VLM5030Synth::getParameter)
        .function("controlChange", &VLM5030Synth::controlChange)
        .function("pitchBend", &VLM5030Synth::pitchBend)
        .function("programChange", &VLM5030Synth::programChange)
        .function("setVolume", &VLM5030Synth::setVolume)
        .function("setVowel", &VLM5030Synth::setVowel)
        .function("writeRegister", &VLM5030Synth::writeRegister)
        .function("loadROM", &VLM5030Synth::loadROM)
        .function("speakWord", &VLM5030Synth::speakWord)
        .function("speakAtAddress", &VLM5030Synth::speakAtAddress)
        .function("stopSpeaking", &VLM5030Synth::stopSpeaking);
}
#endif
