/**
 * AstrocadeSynth.cpp - Bally Astrocade Custom I/O Sound Chip for WebAssembly
 * Based on MAME's Astrocade emulator by Aaron Giles / Frank Palazzolo
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The Astrocade Custom I/O chip (~1977) is a sound generator used in:
 * - Bally Astrocade home console
 * - Arcade games: Gorf, Wizard of Wor, Robby Roto, Space Zap
 *
 * Features:
 * - 3 square wave tone generators (A, B, C)
 * - Master oscillator with configurable frequency
 * - Hardware vibrato with speed and depth control
 * - 15-bit LFSR noise generator with AM capability
 * - Noise can modulate the master oscillator frequency
 * - 4-bit volume per tone, 8-bit noise volume
 * - Mono output
 *
 * Architecture:
 * - Master oscillator (8-bit up counter) clocks all tone generators
 * - Each tone generator is an 8-bit counter that toggles output on overflow
 * - Vibrato modulates the master oscillator reload value
 * - Noise can replace vibrato as master oscillator modulator
 *
 * Frequency formula:
 *   freq = chipClock / ((reg0+1) * 2 * (toneReg+1))
 *   where reg0 = master oscillator register, toneReg = tone register
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

namespace devilbox {

// ============================================================================
// Constants
// ============================================================================

static constexpr int DEFAULT_CHIP_CLOCK = 1789773; // NTSC clock (Hz)
static constexpr float SAMPLE_SCALE = 1.0f / 60.0f;

// ============================================================================
// Parameter IDs
// ============================================================================

enum AstrocadeParam {
    PARAM_VOLUME = 0,
    PARAM_VIBRATO_SPEED = 1,  // 0-3
    PARAM_VIBRATO_DEPTH = 2,  // 0-63
    PARAM_NOISE_AM = 3,       // 0/1
    PARAM_NOISE_MOD = 4,      // 0=vibrato modulates master, 1=noise modulates
    PARAM_NOISE_VOL = 5,      // 0-255
    PARAM_MASTER_FREQ = 6,    // 0-255 (master oscillator register)
    PARAM_STEREO_WIDTH = 7,   // 0.0-1.0
};

// ============================================================================
// AstrocadeSynth class
// ============================================================================

class AstrocadeSynth {
public:
    AstrocadeSynth() = default;

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        m_chipClock = DEFAULT_CHIP_CLOCK;
        m_clocksPerSample = (double)m_chipClock / (double)sampleRate;

        // Build bitswap table for noise
        for (int i = 0; i < 256; i++) {
            m_bitswap[i] = 0;
            for (int b = 0; b < 8; b++) {
                if (i & (1 << b))
                    m_bitswap[i] |= (1 << (7 - b));
            }
        }

        reset();

        // Set default vibrato
        m_reg[4] = (1 << 6) | 12; // speed=1, depth=12
        // Enable noise AM
        m_reg[5] = 0x00; // noise AM off, vibrato mode, volume C=0
        // Default noise volume
        m_reg[7] = 0;

        // Mix settings
        m_volume = 0.8f;
        m_stereoWidth = 0.3f;
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int s = 0; s < numSamples; s++) {
            // Accumulate chip clocks for this audio sample
            m_clockAccum += m_clocksPerSample;
            int clocksToRun = (int)m_clockAccum;
            m_clockAccum -= clocksToRun;

            float sampleAccum = 0.0f;
            int samplesGenerated = 0;

            while (clocksToRun > 0) {
                // Compute cycles until next master overflow or noise boundary
                int samples_this_time = std::min(clocksToRun, 256 - (int)m_master_count);
                samples_this_time = std::min(samples_this_time, 64 - (int)m_noise_clock);
                if (samples_this_time < 1) samples_this_time = 1;

                // Sum tone generator outputs
                int cursample = 0;
                if (m_a_state) cursample += m_reg[6] & 0x0f;
                if (m_b_state) cursample += m_reg[6] >> 4;
                if (m_c_state) cursample += m_reg[5] & 0x0f;

                // Add noise if enabled (based on top bit of LFSR)
                if ((m_reg[5] & 0x20) && (m_noise_state & 0x4000))
                    cursample += m_reg[7] >> 4;

                sampleAccum += (float)cursample * SAMPLE_SCALE * samples_this_time;
                samplesGenerated += samples_this_time;

                // Clock the noise: 2-bit counter clocks 4-bit counter clocks LFSR
                m_noise_clock += samples_this_time;
                if (m_noise_clock >= 64) {
                    // 15-bit LFSR with XOR of top two bits
                    m_noise_state = (m_noise_state << 1) |
                        (~((m_noise_state >> 14) ^ (m_noise_state >> 13)) & 1);
                    m_noise_clock -= 64;
                    m_vibrato_clock++;
                }

                // Clock the master oscillator (8-bit up counter)
                m_master_count += samples_this_time;
                if (m_master_count >= 256) {
                    m_master_count &= 0xff;
                    // Reload from ~reg[0]
                    m_master_count = (~m_reg[0]) & 0xff;

                    // Mux: vibrato or noise modulates the reload
                    if ((m_reg[5] & 0x10) == 0) {
                        // Vibrato mode: speed selects bit of 13-bit vibrato clock
                        int vibratoSpeed = m_reg[4] >> 6;
                        if (!((m_vibrato_clock >> vibratoSpeed) & 0x0200)) {
                            m_master_count += m_reg[4] & 0x3f;
                        }
                    } else {
                        // Noise mode: top 8 bits of LFSR AND'd with noise volume
                        m_master_count += m_bitswap[(m_noise_state >> 7) & 0xff] & m_reg[7];
                    }
                    m_master_count &= 0xff;

                    // Clock tone A
                    m_a_count = (m_a_count + 1) & 0xff;
                    if (m_a_count == 0) {
                        m_a_state ^= 1;
                        m_a_count = (~m_reg[1]) & 0xff;
                    }

                    // Clock tone B
                    m_b_count = (m_b_count + 1) & 0xff;
                    if (m_b_count == 0) {
                        m_b_state ^= 1;
                        m_b_count = (~m_reg[2]) & 0xff;
                    }

                    // Clock tone C
                    m_c_count = (m_c_count + 1) & 0xff;
                    if (m_c_count == 0) {
                        m_c_state ^= 1;
                        m_c_count = (~m_reg[3]) & 0xff;
                    }
                }

                clocksToRun -= samples_this_time;
            }

            // Average the accumulated samples
            float sample = (samplesGenerated > 0) ?
                (sampleAccum / samplesGenerated) : 0.0f;

            // Apply velocity scaling for each voice
            float voiceSample = sample * m_volume;

            // Spread voices slightly in stereo
            float panA = 0.5f - m_stereoWidth * 0.3f; // slightly left
            float panB = 0.5f;                         // center
            float panC = 0.5f + m_stereoWidth * 0.3f; // slightly right

            // We can't easily separate the mixed sample, so apply overall stereo
            outL[s] = voiceSample * (1.0f + m_stereoWidth * 0.1f);
            outR[s] = voiceSample * (1.0f - m_stereoWidth * 0.1f);
        }
    }

    // ========================================================================
    // MIDI note interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (midiNote < 24 || midiNote > 108) return;

        int voice = findFreeVoice();
        m_voiceNote[voice] = midiNote;
        m_voiceVelocity[voice] = velocity;
        m_voiceAge[voice] = m_noteCounter++;

        // Find best (master, tone) register pair for this frequency
        float freq = 440.0f * std::pow(2.0f, (midiNote - 69) / 12.0f);

        // Compute optimal register values
        // freq = chipClock / ((M+1) * 2 * (T+1))
        // (M+1)*(T+1) = chipClock / (2*freq)
        float product = (float)m_chipClock / (2.0f * freq);

        int bestM = 0, bestT = 0;
        float bestError = 1e9f;

        // Search for best decomposition into two 8-bit values
        for (int m = 0; m < 256; m++) {
            int t = (int)(product / (m + 1) + 0.5f) - 1;
            if (t < 0) t = 0;
            if (t > 255) continue;

            float actualFreq = (float)m_chipClock / ((m + 1) * 2.0f * (t + 1));
            float error = std::abs(actualFreq - freq) / freq;
            if (error < bestError) {
                bestError = error;
                bestM = m;
                bestT = t;
            }
        }

        m_voiceMaster[voice] = bestM;
        m_voiceTone[voice] = bestT;

        // Apply: find compromise master oscillator for all active voices
        updateMasterOscillator();

        // Set tone register and volume
        int vol = (velocity * 15) / 127;
        if (vol < 1) vol = 1;
        setVoiceVolume(voice, vol);
    }

    void noteOff(int midiNote) {
        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] == midiNote) {
                m_voiceNote[v] = -1;
                m_voiceAge[v] = 0;
                m_voiceVelocity[v] = 0;
                setVoiceVolume(v, 0);
                break;
            }
        }
    }

    void allNotesOff() {
        for (int v = 0; v < 3; v++) {
            m_voiceNote[v] = -1;
            m_voiceAge[v] = 0;
            m_voiceVelocity[v] = 0;
        }
        // Zero all volumes
        m_reg[6] = 0;
        m_reg[5] = m_reg[5] & 0xf0;
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                m_volume = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_VIBRATO_SPEED: {
                int speed = std::max(0, std::min(3, (int)value));
                m_reg[4] = (m_reg[4] & 0x3f) | (speed << 6);
                break;
            }
            case PARAM_VIBRATO_DEPTH: {
                int depth = std::max(0, std::min(63, (int)value));
                m_reg[4] = (m_reg[4] & 0xc0) | depth;
                break;
            }
            case PARAM_NOISE_AM: {
                if (value > 0.5f)
                    m_reg[5] |= 0x20;
                else
                    m_reg[5] &= ~0x20;
                break;
            }
            case PARAM_NOISE_MOD: {
                if (value > 0.5f)
                    m_reg[5] |= 0x10;  // noise modulates master
                else
                    m_reg[5] &= ~0x10; // vibrato modulates master
                break;
            }
            case PARAM_NOISE_VOL:
                m_reg[7] = std::max(0, std::min(255, (int)value));
                break;
            case PARAM_MASTER_FREQ:
                m_reg[0] = std::max(0, std::min(255, (int)value));
                break;
            case PARAM_STEREO_WIDTH:
                m_stereoWidth = std::max(0.0f, std::min(1.0f, value));
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) {
        switch (paramId) {
            case PARAM_VOLUME: return m_volume;
            case PARAM_VIBRATO_SPEED: return (float)(m_reg[4] >> 6);
            case PARAM_VIBRATO_DEPTH: return (float)(m_reg[4] & 0x3f);
            case PARAM_NOISE_AM: return (m_reg[5] & 0x20) ? 1.0f : 0.0f;
            case PARAM_NOISE_MOD: return (m_reg[5] & 0x10) ? 1.0f : 0.0f;
            case PARAM_NOISE_VOL: return (float)m_reg[7];
            case PARAM_MASTER_FREQ: return (float)m_reg[0];
            case PARAM_STEREO_WIDTH: return m_stereoWidth;
            default: return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 1:  // Mod wheel -> vibrato depth
                setParameter(PARAM_VIBRATO_DEPTH, (value / 127.0f) * 63.0f);
                break;
            case 7:  // Volume
                m_volume = value / 127.0f;
                break;
            case 76: // Vibrato speed
                setParameter(PARAM_VIBRATO_SPEED, (value / 127.0f) * 3.0f);
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
        // Re-pitch all active voices
        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] >= 0) {
                float freq = 440.0f * std::pow(2.0f, (m_voiceNote[v] + m_pitchBend * 2.0f - 69) / 12.0f);
                float product = (float)m_chipClock / (2.0f * freq);

                int bestM = 0, bestT = 0;
                float bestError = 1e9f;
                for (int m = 0; m < 256; m++) {
                    int t = (int)(product / (m + 1) + 0.5f) - 1;
                    if (t < 0) t = 0;
                    if (t > 255) continue;
                    float actualFreq = (float)m_chipClock / ((m + 1) * 2.0f * (t + 1));
                    float error = std::abs(actualFreq - freq) / freq;
                    if (error < bestError) {
                        bestError = error;
                        bestM = m;
                        bestT = t;
                    }
                }
                m_voiceMaster[v] = bestM;
                m_voiceTone[v] = bestT;
            }
        }
        updateMasterOscillator();
    }

    void programChange(int program) {
        switch (program) {
            case 0: // Clean Square
                m_reg[4] = (0 << 6) | 0;  // no vibrato
                m_reg[5] &= 0x0f;         // no noise AM, vibrato mode
                m_reg[7] = 0;             // no noise
                break;
            case 1: // Vibrato Square
                m_reg[4] = (1 << 6) | 16; // medium vibrato
                m_reg[5] &= 0x0f;
                m_reg[7] = 0;
                break;
            case 2: // Wide Vibrato
                m_reg[4] = (2 << 6) | 32; // wide, slow vibrato
                m_reg[5] &= 0x0f;
                m_reg[7] = 0;
                break;
            case 3: // Fast Vibrato
                m_reg[4] = (0 << 6) | 20; // fast vibrato
                m_reg[5] &= 0x0f;
                m_reg[7] = 0;
                break;
            case 4: // Noise + Tone
                m_reg[4] = (1 << 6) | 8;
                m_reg[5] = (m_reg[5] & 0x0f) | 0x20; // noise AM on
                m_reg[7] = 0x80;
                break;
            case 5: // Noise Modulated
                m_reg[4] = 0;
                m_reg[5] = (m_reg[5] & 0x0f) | 0x30; // noise mod + AM
                m_reg[7] = 0x60;
                break;
            case 6: // Arcade Siren (fast vibrato + noise)
                m_reg[4] = (0 << 6) | 48; // deep fast vibrato
                m_reg[5] = (m_reg[5] & 0x0f) | 0x20;
                m_reg[7] = 0x40;
                break;
            case 7: // Pure Noise
                m_reg[4] = 0;
                m_reg[5] = (m_reg[5] & 0x0f) | 0x20;
                m_reg[7] = 0xff;
                break;
            default:
                break;
        }
    }

    // Direct register access (reg 0-7)
    void writeRegister(int offset, int data) {
        if (offset >= 0 && offset <= 7) {
            m_reg[offset & 7] = data & 0xff;
        }
    }

    // Convenience setters
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }
    void setVibratoSpeed(int speed) { setParameter(PARAM_VIBRATO_SPEED, (float)speed); }
    void setVibratoDepth(int depth) { setParameter(PARAM_VIBRATO_DEPTH, (float)depth); }
    void setNoiseVolume(int vol) { m_reg[7] = vol & 0xff; }

private:
    void reset() {
        memset(m_reg, 0, sizeof(m_reg));
        m_master_count = 0;
        m_vibrato_clock = 0;
        m_noise_clock = 0;
        m_noise_state = 1; // non-zero seed
        m_a_count = 0; m_a_state = 0;
        m_b_count = 0; m_b_state = 0;
        m_c_count = 0; m_c_state = 0;
        m_clockAccum = 0.0;

        for (int v = 0; v < 3; v++) {
            m_voiceNote[v] = -1;
            m_voiceVelocity[v] = 0;
            m_voiceAge[v] = 0;
            m_voiceMaster[v] = 0;
            m_voiceTone[v] = 0;
        }
        m_noteCounter = 0;
        m_pitchBend = 0.0f;
    }

    int findFreeVoice() {
        // Find unused voice
        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] < 0)
                return v;
        }
        // Steal oldest
        int oldest = 0;
        uint32_t oldestAge = UINT32_MAX;
        for (int v = 0; v < 3; v++) {
            if (m_voiceAge[v] < oldestAge) {
                oldestAge = m_voiceAge[v];
                oldest = v;
            }
        }
        setVoiceVolume(oldest, 0);
        m_voiceNote[oldest] = -1;
        return oldest;
    }

    void setVoiceVolume(int voice, int vol) {
        vol = std::max(0, std::min(15, vol));
        switch (voice) {
            case 0: // Tone A (reg6 low nibble)
                m_reg[6] = (m_reg[6] & 0xf0) | vol;
                break;
            case 1: // Tone B (reg6 high nibble)
                m_reg[6] = (m_reg[6] & 0x0f) | (vol << 4);
                break;
            case 2: // Tone C (reg5 low nibble)
                m_reg[5] = (m_reg[5] & 0xf0) | vol;
                break;
        }
    }

    void updateMasterOscillator() {
        // Find the master oscillator value that best serves all active voices
        // For each candidate master, compute best tone for each voice, sum error

        int activeCount = 0;
        float targetFreqs[3] = {0, 0, 0};

        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] >= 0) {
                float bentNote = m_voiceNote[v] + m_pitchBend * 2.0f;
                targetFreqs[v] = 440.0f * std::pow(2.0f, (bentNote - 69.0f) / 12.0f);
                activeCount++;
            }
        }

        if (activeCount == 0) return;

        // If only one voice, use its ideal master
        if (activeCount == 1) {
            for (int v = 0; v < 3; v++) {
                if (m_voiceNote[v] >= 0) {
                    m_reg[0] = m_voiceMaster[v];
                    m_reg[1 + v] = m_voiceTone[v];
                    return;
                }
            }
        }

        // Multiple voices: find best shared master
        int bestMaster = 0;
        float bestTotalError = 1e9f;

        // Try each active voice's preferred master value
        int candidates[3];
        int numCandidates = 0;
        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] >= 0) {
                candidates[numCandidates++] = m_voiceMaster[v];
            }
        }

        // Also try a range around each candidate
        for (int ci = 0; ci < numCandidates; ci++) {
            for (int delta = -2; delta <= 2; delta++) {
                int m = candidates[ci] + delta;
                if (m < 0 || m > 255) continue;

                float totalError = 0;
                for (int v = 0; v < 3; v++) {
                    if (m_voiceNote[v] < 0) continue;

                    int t = (int)((float)m_chipClock / ((m + 1) * 2.0f * targetFreqs[v]) + 0.5f) - 1;
                    if (t < 0) t = 0;
                    if (t > 255) t = 255;

                    float actualFreq = (float)m_chipClock / ((m + 1) * 2.0f * (t + 1));
                    totalError += std::abs(actualFreq - targetFreqs[v]) / targetFreqs[v];
                }

                if (totalError < bestTotalError) {
                    bestTotalError = totalError;
                    bestMaster = m;
                }
            }
        }

        // Apply master and compute tone registers
        m_reg[0] = bestMaster;
        for (int v = 0; v < 3; v++) {
            if (m_voiceNote[v] >= 0) {
                int t = (int)((float)m_chipClock / ((bestMaster + 1) * 2.0f * targetFreqs[v]) + 0.5f) - 1;
                if (t < 0) t = 0;
                if (t > 255) t = 255;
                m_reg[1 + v] = t;
            }
        }
    }

    // ========================================================================
    // State
    // ========================================================================

    int m_sampleRate = 44100;
    int m_chipClock = DEFAULT_CHIP_CLOCK;
    double m_clocksPerSample = 0.0;
    double m_clockAccum = 0.0;

    // Chip registers (0-7)
    uint8_t m_reg[8];

    // Chip state
    int m_master_count = 0;
    uint16_t m_vibrato_clock = 0;
    int m_noise_clock = 0;
    uint16_t m_noise_state = 1;
    int m_a_count = 0, m_a_state = 0;
    int m_b_count = 0, m_b_state = 0;
    int m_c_count = 0, m_c_state = 0;

    // Bitswap table for noise
    uint8_t m_bitswap[256];

    // MIDI voice state
    int m_voiceNote[3] = {-1, -1, -1};
    int m_voiceVelocity[3] = {0, 0, 0};
    uint32_t m_voiceAge[3] = {0, 0, 0};
    int m_voiceMaster[3] = {0, 0, 0};
    int m_voiceTone[3] = {0, 0, 0};
    uint32_t m_noteCounter = 0;
    float m_pitchBend = 0.0f;

    // Mix parameters
    float m_volume = 0.8f;
    float m_stereoWidth = 0.3f;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(AstrocadeModule) {
    emscripten::class_<AstrocadeSynth>("AstrocadeSynth")
        .constructor<>()
        .function("initialize", &AstrocadeSynth::initialize)
        .function("process", &AstrocadeSynth::process)
        .function("noteOn", &AstrocadeSynth::noteOn)
        .function("noteOff", &AstrocadeSynth::noteOff)
        .function("allNotesOff", &AstrocadeSynth::allNotesOff)
        .function("setParameter", &AstrocadeSynth::setParameter)
        .function("getParameter", &AstrocadeSynth::getParameter)
        .function("controlChange", &AstrocadeSynth::controlChange)
        .function("pitchBend", &AstrocadeSynth::pitchBend)
        .function("programChange", &AstrocadeSynth::programChange)
        .function("writeRegister", &AstrocadeSynth::writeRegister)
        .function("setVolume", &AstrocadeSynth::setVolume)
        .function("setVibratoSpeed", &AstrocadeSynth::setVibratoSpeed)
        .function("setVibratoDepth", &AstrocadeSynth::setVibratoDepth)
        .function("setNoiseVolume", &AstrocadeSynth::setNoiseVolume);
}

#endif
