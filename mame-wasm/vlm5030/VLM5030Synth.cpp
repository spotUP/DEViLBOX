/**
 * VLM5030Synth.cpp - Sanyo VLM5030 LPC Speech Synthesizer for WebAssembly
 * Based on MAME's VLM5030 emulator by Tatsuyuki Satoh
 *
 * The VLM5030 is a speech synthesis IC used in Konami arcade games:
 * Track & Field, Hyper Sports, Yie Ar Kung-Fu, Road Fighter, etc.
 *
 * Architecture:
 * - 10-pole lattice filter (LPC) with TMS5100-compatible coefficients
 * - Voiced/unvoiced/silent modes
 * - Frame interpolation
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
static constexpr int FR_SIZE = 4;  // Interpolation steps per frame

enum VLM5030Param {
    PARAM_VOLUME = 0,
    PARAM_VOWEL = 1,
    PARAM_VOICED = 2,
    PARAM_BRIGHTNESS = 3,
    PARAM_STEREO_WIDTH = 4,
    PARAM_FORMANT_SHIFT = 5,
};

// VLM5030 coefficient tables for ROM frame decoding
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
static const int16_t K2_TABLE[32] = {
      0,  50, 100, 149, 196, 241, 284, 325,
    362, 396, 426, 452, 473, 490, 502, 510,
      0,-510,-502,-490,-473,-452,-426,-396,
   -362,-325,-284,-241,-196,-149,-100, -50
};
static const int16_t K3_TABLE[16] = {
    0, 64, 128, 192, 256, 320, 384, 448,
   -512,-448,-384,-320,-256,-192,-128, -64
};
static const int16_t K5_TABLE[8] = {
    0, 128, 256, 384, -512, -384, -256, -128
};
static const int8_t CHIRP_TABLE[52] = {
    0, 127, 127, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0
};

// ============================================================================
// Vowel presets with K coefficients scaled for the /512 lattice filter.
//
// K1/K2 are the dominant formant-shaping coefficients.
// Large negative K1 = low F1 (close vowels like EE, OO)
// Small negative K1 = high F1 (open vowels like AH)
// Positive K2 = high F2 (front vowels like EE, IH)
// Negative K2 = low F2 (back vowels like OH, OO)
//
// Energy must be high enough (200+) to drive the filter audibly.
// ============================================================================

struct VowelPreset {
    const char* name;
    int16_t k[10];
    int16_t energy;
    bool voiced;
};

static const VowelPreset VOWEL_PRESETS[NUM_PRESETS] = {
    // 0: AH /a/ - open, F1=730Hz F2=1090Hz - strong mid-range
    { "AH",
      { -128, -48, 64, -32, 16, -8, 4, -2, 1, 0 },
      400, true },

    // 1: EE /i:/ - close front, F1=270Hz F2=2290Hz - bright
    { "EE",
      { -384, 256, 96, -48, 24, -12, 6, -3, 2, -1 },
      350, true },

    // 2: IH /ɪ/ - open front, F1=390Hz F2=1990Hz
    { "IH",
      { -300, 180, 80, -40, 20, -10, 5, -3, 1, 0 },
      360, true },

    // 3: OH /oʊ/ - mid back rounded, F1=570Hz F2=840Hz
    { "OH",
      { -180, -160, 48, 24, -12, 6, -3, 2, -1, 0 },
      380, true },

    // 4: OO /u:/ - close back rounded, F1=300Hz F2=870Hz
    { "OO",
      { -350, -220, 32, 16, -8, 4, -2, 1, 0, 0 },
      340, true },

    // 5: NN nasal - nasalized with antiformant
    { "NN",
      { -256, -80, -64, 96, -48, 24, -12, 6, -3, 1 },
      300, true },

    // 6: SS fricative - unvoiced, high-frequency emphasis
    { "SS",
      { -64, 32, -16, 8, -4, 128, -64, 32, -16, 8 },
      250, false },

    // 7: HH breathy - unvoiced, wide bandwidth
    { "HH",
      { -96, 48, -24, 12, -6, 3, -2, 1, 0, 0 },
      180, false },
};

struct LPCVoice {
    int32_t x[NUM_COEFFS];
    int16_t  currentK[NUM_COEFFS];
    int16_t  currentEnergy;
    uint8_t  currentPitch;
    uint8_t  pitchCount;
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

            if (m_romPlaying) {
                if (m_romEnvLevel < 1.0f) { m_romEnvLevel += 0.002f; if (m_romEnvLevel > 1.0f) m_romEnvLevel = 1.0f; }
                m_romPhase += m_lpcStep;
                while (m_romPhase >= 1.0) { m_romPhase -= 1.0; m_romPrevSample = m_romCurrentSample; m_romCurrentSample = generateROMSample(); }
                float t = (float)m_romPhase;
                float sample = m_romPrevSample * (1.0f - t) + m_romCurrentSample * t;
                mixL = sample * m_romEnvLevel; mixR = sample * m_romEnvLevel;
            }

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
        std::memset(voi.x, 0, sizeof(voi.x));

        // MIDI note to pitch period
        float freq = 440.0f * std::pow(2.0f, (midiNote + m_pitchBend * 2.0f - 69) / 12.0f);
        int period = (int)((float)LPC_RATE / freq + 0.5f);
        if (period < 1) period = 1;
        if (period > 255) period = 255;
        voi.currentPitch = period;

        loadVowelPreset(v, m_currentPreset);

        // Velocity scales energy
        voi.currentEnergy = (int16_t)(VOWEL_PRESETS[m_currentPreset].energy * velocity / 127);
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
            }
        }
    }

    void programChange(int program) { if (program >= 0 && program < NUM_PRESETS) m_currentPreset = program; }
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setVowel(int preset) { setParameter(PARAM_VOWEL, (float)preset); }
    void writeRegister(int, int) { }

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const uint8_t*>(dataPtr);
        m_romSize = size;
    }
    void speakWord(int wordIndex) {
        if (!m_romData || m_romSize == 0) return;
        int tableOffset = wordIndex * 2;
        if (tableOffset + 1 >= m_romSize) return;
        uint16_t addr = (m_romData[tableOffset] << 8) | m_romData[tableOffset + 1];
        if (addr == 0 || (int)addr >= m_romSize) return;
        speakAtAddress(addr);
    }
    void speakAtAddress(int byteAddr) {
        if (!m_romData || m_romSize == 0 || byteAddr < 0 || byteAddr >= m_romSize) return;
        m_romPlaying = true;
        m_romAddr = byteAddr;
        m_romPhase = 0.0; m_romPrevSample = 0.0f; m_romCurrentSample = 0.0f; m_romEnvLevel = 0.0f;
        // MAME init: sample_count = frame_size, interp_count = FR_SIZE
        // Do NOT call parseROMFrame here — it's called when interp_count reaches 0
        m_romSampleCount = m_romFrameSize; m_romFrameSize = 40;
        m_romInterpCount = FR_SIZE; m_romPitchCount = 0;
        std::memset(m_romX, 0, sizeof(m_romX));
        std::memset(m_romCurrentK, 0, sizeof(m_romCurrentK));
        std::memset(m_romOldK, 0, sizeof(m_romOldK));
        std::memset(m_romNewK, 0, sizeof(m_romNewK));
        std::memset(m_romTargetK, 0, sizeof(m_romTargetK));
        m_romCurrentEnergy = 0; m_romOldEnergy = 0; m_romNewEnergy = 0; m_romTargetEnergy = 0;
        m_romCurrentPitch = 0; m_romOldPitch = 0; m_romNewPitch = 0; m_romTargetPitch = 0;
        m_romLfsr = 0x7fff;
    }
    void stopSpeaking() { m_romPlaying = false; }

private:
    // ROM helpers — 1:1 from MAME vlm5030.cpp
    uint8_t readROMByte(int addr) {
        if (addr >= 0 && addr < m_romSize) return m_romData[addr];
        return 0;
    }

    // get_bits: read N bits at bit offset sbit from m_romAddr (MAME-exact)
    int getROMBits(int sbit, int bits) {
        int offset = m_romAddr + (sbit >> 3);
        int data = readROMByte(offset) | (readROMByte(offset + 1) << 8);
        data >>= (sbit & 7);
        data &= (0xff >> (8 - bits));
        return data;
    }

    // parse_frame: 1:1 from MAME vlm5030.cpp lines 288-343
    int parseROMFrame() {
        // Save old parameters
        m_romOldEnergy = m_romNewEnergy;
        m_romOldPitch = m_romNewPitch;
        for (int i = 0; i < NUM_COEFFS; i++)
            m_romOldK[i] = m_romNewK[i];

        // Command byte check
        uint8_t cmd = readROMByte(m_romAddr);
        if (cmd & 0x01) {
            // Extended frame
            m_romNewEnergy = 0;
            m_romNewPitch = 0;
            for (int i = 0; i < NUM_COEFFS; i++) m_romNewK[i] = 0;
            m_romAddr++;
            if (cmd & 0x02) {
                // End of speech
                return 0;
            } else {
                // Silent frame
                int nums = ((cmd >> 2) + 1) * 2;
                return nums * FR_SIZE;
            }
        }

        // Normal speech frame — bit layout from MAME (pitch first, then energy, then K9..K0)
        m_romNewPitch  = PITCH_TABLE[getROMBits(1, 5)];
        m_romNewEnergy = ENERGY_TABLE[getROMBits(6, 5)];
        m_romNewK[9]   = K5_TABLE[getROMBits(11, 3) & 7];
        m_romNewK[8]   = K5_TABLE[getROMBits(14, 3) & 7];
        m_romNewK[7]   = K5_TABLE[getROMBits(17, 3) & 7];
        m_romNewK[6]   = K5_TABLE[getROMBits(20, 3) & 7];
        m_romNewK[5]   = K5_TABLE[getROMBits(23, 3) & 7];
        m_romNewK[4]   = K5_TABLE[getROMBits(26, 3) & 7];
        m_romNewK[3]   = K3_TABLE[getROMBits(29, 4) & 15];
        m_romNewK[2]   = K3_TABLE[getROMBits(33, 4) & 15];
        m_romNewK[1]   = K2_TABLE[getROMBits(37, 5) & 31];
        m_romNewK[0]   = K1_TABLE[getROMBits(42, 6) & 63];

        m_romAddr += 6;
        return FR_SIZE;
    }

    // sound_stream_update ROM path — 1:1 from MAME vlm5030.cpp lines 501-617
    float generateROMSample() {
        if (!m_romPlaying) return 0.0f;

        // Check new interpolation step or new frame
        if (m_romSampleCount == 0) {
            m_romSampleCount = m_romFrameSize;

            if (m_romInterpCount == 0) {
                // Parse next frame
                int frameSamples = parseROMFrame();
                if (frameSamples == 0) {
                    // End of speech
                    m_romPlaying = false;
                    return 0.0f;
                }
                m_romInterpCount = frameSamples;

                // Set old target as new start of frame
                m_romCurrentEnergy = m_romOldEnergy;
                m_romCurrentPitch = m_romOldPitch;
                for (int i = 0; i < NUM_COEFFS; i++)
                    m_romCurrentK[i] = m_romOldK[i];

                // Set interpolation targets
                if (m_romCurrentEnergy == 0) {
                    m_romTargetEnergy = 0;
                    m_romTargetPitch = m_romCurrentPitch;
                    for (int i = 0; i < NUM_COEFFS; i++)
                        m_romTargetK[i] = m_romCurrentK[i];
                } else {
                    m_romTargetEnergy = m_romNewEnergy;
                    m_romTargetPitch = m_romNewPitch;
                    for (int i = 0; i < NUM_COEFFS; i++)
                        m_romTargetK[i] = m_romNewK[i];
                }
            }

            // Interpolate: 25%, 50%, 75%, 100%
            m_romInterpCount--;
            int interpEffect = FR_SIZE - (m_romInterpCount % FR_SIZE);
            m_romCurrentEnergy = m_romOldEnergy +
                (m_romTargetEnergy - m_romOldEnergy) * interpEffect / FR_SIZE;
            if (m_romOldPitch > 1)
                m_romCurrentPitch = m_romOldPitch +
                    (m_romTargetPitch - m_romOldPitch) * interpEffect / FR_SIZE;
            for (int i = 0; i < NUM_COEFFS; i++)
                m_romCurrentK[i] = m_romOldK[i] +
                    (m_romTargetK[i] - m_romOldK[i]) * interpEffect / FR_SIZE;
        }

        // Excitation source (MAME-exact: uses old_ for silence/unvoiced check)
        int32_t current_val;
        if (m_romOldEnergy == 0) {
            current_val = 0;
        } else if (m_romOldPitch <= 1) {
            // Unvoiced: noise
            m_romLfsr = (m_romLfsr >> 1) ^ ((m_romLfsr & 1) ? 0xB800 : 0);
            current_val = (m_romLfsr & 1) ? m_romCurrentEnergy : -(int32_t)m_romCurrentEnergy;
        } else {
            // Voiced: impulse train (NOT chirp — VLM5030 uses impulse)
            current_val = (m_romPitchCount == 0) ? m_romCurrentEnergy : 0;
        }

        // 10-pole lattice filter (MAME-exact)
        int32_t u[11];
        u[10] = current_val;
        for (int i = 9; i >= 0; i--)
            u[i] = u[i + 1] - ((-m_romCurrentK[i] * m_romX[i]) / 512);
        for (int i = 9; i >= 1; i--)
            m_romX[i] = m_romX[i - 1] + ((-m_romCurrentK[i - 1] * u[i - 1]) / 512);
        m_romX[0] = u[0];

        m_romSampleCount--;
        m_romPitchCount++;
        if (m_romCurrentPitch > 0 && m_romPitchCount >= m_romCurrentPitch)
            m_romPitchCount = 0;

        // MAME uses put_int_clamp(0, sampindex, u[0], 512) which means
        // output = u[0] / 512 clamped to ±1.0. But typical energy values
        // are 0-127 and the filter doesn't amplify much, so actual peaks
        // are ~0.1-0.3. Boost by 4x for audible output level.
        float sample = (float)u[0] / 128.0f;
        return std::max(-1.0f, std::min(1.0f, sample));
    }

    float generateLPCSample(LPCVoice& voi) {
        if (voi.currentEnergy == 0) return 0.0f;

        // Excitation source
        int32_t excitation;
        if (!voi.voiced || voi.currentPitch == 0) {
            // Unvoiced: noise
            voi.lfsr ^= (voi.lfsr ^ (voi.lfsr >> 1)) << 15;
            voi.lfsr >>= 1;
            excitation = (voi.lfsr & 1) ? voi.currentEnergy : -voi.currentEnergy;
        } else {
            // Voiced: pitch pulse train
            excitation = (voi.pitchCount == 0) ? voi.currentEnergy : 0;
        }

        // 10-pole lattice filter (from MAME VLM5030 sound_stream_update)
        int32_t u[11];
        u[10] = excitation;
        for (int i = 9; i >= 0; i--) {
            u[i] = u[i + 1] - ((-voi.currentK[i] * voi.x[i]) / 512);
        }
        for (int i = 9; i >= 1; i--) {
            voi.x[i] = voi.x[i - 1] + ((-voi.currentK[i - 1] * u[i - 1]) / 512);
        }
        voi.x[0] = u[0];

        // Advance pitch counter
        voi.pitchCount++;
        if (voi.voiced && voi.currentPitch > 0) {
            if (voi.pitchCount >= voi.currentPitch)
                voi.pitchCount = 0;
        }

        // Normalize — lattice filter with energy ~400 and resonant K coefficients
        // can peak around 2000-6000 depending on resonance. Use 2048 for louder output
        // with clamping guard for safety.
        float sample = (float)u[0] / 2048.0f;
        sample = std::max(-1.0f, std::min(1.0f, sample));
        return sample;
    }

    void resetVoice(int v) {
        LPCVoice& voi = m_voices[v];
        std::memset(voi.x, 0, sizeof(voi.x));
        std::memset(voi.currentK, 0, sizeof(voi.currentK));
        voi.currentEnergy = 0;
        voi.currentPitch = 30;
        voi.pitchCount = 0;
        voi.lfsr = 0x7fff;
        voi.voiced = true;
        voi.midiNote = -1; voi.velocity = 0; voi.age = 0;
        voi.active = false; voi.releasing = false; voi.envLevel = 0.0f;
        voi.prevSample = 0.0f; voi.currentSample = 0.0f; voi.lpcPhase = 0.0;
    }

    void loadVowelPreset(int voice, int preset) {
        if (preset < 0 || preset >= NUM_PRESETS) return;
        LPCVoice& voi = m_voices[voice];
        const VowelPreset& vp = VOWEL_PRESETS[preset];

        for (int i = 0; i < NUM_COEFFS; i++) {
            float scale = 1.0f + m_formantShift * 0.3f;
            voi.currentK[i] = (int16_t)(vp.k[i] * scale);
        }
        voi.voiced = vp.voiced;
        voi.currentEnergy = vp.energy;
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
    double m_lpcStep = 0.0;
    LPCVoice m_voices[NUM_VOICES];
    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
    float m_brightness = 0.5f;
    float m_formantShift = 0.0f;
    int m_currentPreset = 0;
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;

    const uint8_t* m_romData = nullptr;
    int m_romSize = 0;
    bool m_romPlaying = false;
    int m_romAddr = 0;
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
    // MAME uses 4 sets: new (just parsed), old (start of interp), target (end of interp), current (interpolated)
    uint16_t m_romNewEnergy = 0;
    uint16_t m_romOldEnergy = 0;
    uint16_t m_romTargetEnergy = 0;
    uint16_t m_romCurrentEnergy = 0;
    uint8_t m_romNewPitch = 0;
    uint8_t m_romOldPitch = 0;
    uint8_t m_romTargetPitch = 0;
    uint8_t m_romCurrentPitch = 0;
    int16_t m_romNewK[NUM_COEFFS] = {};
    int16_t m_romOldK[NUM_COEFFS] = {};
    int16_t m_romTargetK[NUM_COEFFS] = {};
    int16_t m_romCurrentK[NUM_COEFFS] = {};
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
