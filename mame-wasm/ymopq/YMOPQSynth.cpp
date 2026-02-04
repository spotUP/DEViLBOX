/**
 * YMOPQSynth.cpp - Yamaha YM3806 (OPQ) 4-Operator FM Synthesizer for WebAssembly
 * Based on Aaron Giles' ymfm library (BSD-3-Clause)
 *
 * The YM3806 (OPQ) is a 4-operator FM synthesizer used in:
 * - Yamaha PSR-70, PSR-60 (home keyboards)
 * - Yamaha DX-series prototypes
 *
 * It's a hybrid of OPM and OPN features:
 * - 8 channels with 4 operators each (32 operators total)
 * - 8 FM algorithms (same as OPM)
 * - 2 frequencies per channel (ops 1&3 share one, ops 2&4 share another)
 * - 2 waveforms: sine, half-sine
 * - LFO with AM/PM modulation
 * - Faux reverb envelope stage
 * - 6-bit detune range (larger than OPM's 3-bit)
 * - Stereo output (L/R panning)
 *
 * License: BSD-3-Clause (ymfm license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>

#include "ymfm_opq.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

namespace devilbox {

// ============================================================================
// Parameter IDs for the WASM interface
// ============================================================================
enum YMOPQParam {
    PARAM_ALGORITHM     = 0,
    PARAM_FEEDBACK      = 1,
    PARAM_LFO_RATE      = 2,
    PARAM_LFO_PM_SENS   = 3,
    PARAM_LFO_AM_SENS   = 4,
    PARAM_REVERB        = 5,
    PARAM_VOLUME        = 6,
    // Per-operator params: base + opIndex * 100
    PARAM_OP_TOTAL_LEVEL = 10,  // +0,+100,+200,+300
    PARAM_OP_ATTACK_RATE = 11,
    PARAM_OP_DECAY_RATE  = 12,
    PARAM_OP_SUSTAIN_RATE = 13,
    PARAM_OP_SUSTAIN_LEVEL = 14,
    PARAM_OP_RELEASE_RATE = 15,
    PARAM_OP_MULTIPLE    = 16,
    PARAM_OP_DETUNE      = 17,
    PARAM_OP_WAVEFORM    = 18,
    PARAM_OP_KSR         = 19,
    PARAM_OP_AM_ENABLE   = 20,
};

// ============================================================================
// Standalone ymfm_interface for WASM (no hardware timers/IRQ needed)
// ============================================================================
class StandaloneInterface : public ymfm::ymfm_interface {
public:
    void ymfm_sync_mode_write(uint8_t data) override {
        m_engine->engine_mode_write(data);
    }
    void ymfm_sync_check_interrupts() override {
        m_engine->engine_check_interrupts();
    }
    void ymfm_set_timer(uint32_t tnum, int32_t duration_in_clocks) override { }
    void ymfm_set_busy_end(uint32_t clocks) override { }
    bool ymfm_is_busy() override { return false; }
    void ymfm_update_irq(bool asserted) override { }
    uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override { return 0; }
    void ymfm_external_write(ymfm::access_class type, uint32_t address, uint8_t data) override { }
};

// ============================================================================
// Voice state for polyphonic MIDI handling
// ============================================================================
struct VoiceState {
    int8_t note = -1;
    uint8_t velocity = 0;
    bool active = false;
    uint32_t age = 0;
};

// ============================================================================
// FM preset patch data
// ============================================================================
struct FMOperator {
    uint8_t multiple;    // 0-15
    uint8_t detune;      // 0-63 (32 = center/no detune)
    uint8_t totalLevel;  // 0-127
    uint8_t attackRate;   // 0-31
    uint8_t decayRate;    // 0-31
    uint8_t sustainRate;  // 0-31
    uint8_t sustainLevel; // 0-15
    uint8_t releaseRate;  // 0-15
    uint8_t waveform;    // 0-1
    uint8_t ksr;         // 0-3
    uint8_t amEnable;    // 0-1
};

struct FMPatch {
    const char* name;
    uint8_t algorithm;   // 0-7
    uint8_t feedback;    // 0-7
    uint8_t lfoRate;     // 0-7
    uint8_t pmSens;      // 0-7
    uint8_t amSens;      // 0-3
    uint8_t reverb;      // 0-1
    FMOperator ops[4];   // Operators 1-4
};

static const FMPatch s_presets[] = {
    // 0: Electric Piano
    { "E.Piano", 5, 6, 0, 0, 0, 0, {
        { 1, 32,  40, 31, 12,  5,  5,  6, 0, 1, 0 },  // Op1: modulator
        { 4, 32,  20, 31, 14,  4,  4,  7, 0, 1, 0 },  // Op2: carrier
        { 1, 33,  35, 31, 10,  3,  3,  6, 0, 1, 0 },  // Op3: carrier
        { 1, 32,   0, 31,  8,  2,  2,  5, 0, 1, 0 },  // Op4: carrier
    }},
    // 1: Brass
    { "Brass", 3, 5, 0, 0, 0, 0, {
        { 1, 32,  35, 31, 10,  3,  4,  5, 0, 0, 0 },
        { 1, 32,  30, 28,  8,  2,  3,  4, 0, 0, 0 },
        { 1, 32,  40, 31, 12,  5,  5,  6, 0, 0, 0 },
        { 1, 32,   0, 31,  6,  1,  2,  4, 0, 0, 0 },
    }},
    // 2: Strings
    { "Strings", 2, 3, 3, 2, 0, 1, {
        { 2, 32,  40, 20,  5,  2,  5,  4, 0, 0, 0 },
        { 1, 32,  30, 18,  4,  1,  3,  3, 0, 0, 0 },
        { 2, 33,  35, 22,  6,  2,  5,  5, 0, 0, 0 },
        { 1, 32,   0, 20,  3,  1,  2,  3, 0, 0, 0 },
    }},
    // 3: Bass
    { "Bass", 0, 6, 0, 0, 0, 0, {
        { 1, 32,  30, 31, 15,  8,  8,  8, 0, 0, 0 },
        { 2, 32,  25, 31, 18, 10, 10,  9, 0, 0, 0 },
        { 1, 32,  35, 31, 20, 12, 10, 10, 0, 0, 0 },
        { 1, 32,   0, 31, 10,  5,  3,  6, 0, 0, 0 },
    }},
    // 4: Organ
    { "Organ", 7, 0, 0, 0, 0, 0, {
        { 1, 32,  20, 31,  0,  0,  0,  7, 0, 0, 0 },
        { 2, 32,  25, 31,  0,  0,  0,  7, 0, 0, 0 },
        { 3, 32,  30, 31,  0,  0,  0,  7, 0, 0, 0 },
        { 4, 32,  35, 31,  0,  0,  0,  7, 0, 0, 0 },
    }},
    // 5: Lead
    { "Lead", 4, 5, 2, 3, 0, 0, {
        { 1, 32,  30, 31, 10,  4,  5,  6, 0, 0, 0 },
        { 1, 32,   5, 31,  8,  3,  3,  5, 0, 0, 0 },
        { 2, 32,  35, 31, 12,  5,  6,  6, 0, 0, 0 },
        { 1, 32,   5, 31,  6,  2,  2,  4, 0, 0, 0 },
    }},
    // 6: Pad
    { "Pad", 2, 2, 4, 1, 1, 1, {
        { 2, 32,  45, 15,  3,  1,  4,  2, 0, 0, 1 },
        { 1, 32,  30, 12,  2,  0,  2,  2, 0, 0, 1 },
        { 2, 33,  40, 18,  4,  1,  5,  3, 0, 0, 0 },
        { 1, 32,   0, 15,  2,  0,  1,  2, 0, 0, 0 },
    }},
    // 7: Bell
    { "Bell", 1, 4, 0, 0, 0, 0, {
        { 5, 32,  35, 31,  3,  0,  3,  3, 0, 2, 0 },
        { 1, 32,  40, 31,  5,  1,  5,  5, 0, 2, 0 },
        { 7, 32,  30, 31,  2,  0,  2,  2, 0, 2, 0 },
        { 1, 32,   0, 31,  4,  0,  3,  3, 0, 2, 0 },
    }},
};
static constexpr int NUM_PRESETS = sizeof(s_presets) / sizeof(s_presets[0]);

// ============================================================================
// YMOPQSynth - Main synthesizer class
// ============================================================================
class YMOPQSynth {
public:
    YMOPQSynth() : m_chip(nullptr), m_sampleRate(48000.0f), m_volume(0.8f),
                   m_voiceCounter(0), m_pitchBend(0), m_currentPatch(0) {
        memset(m_voices, 0, sizeof(m_voices));
        for (int i = 0; i < 8; i++) {
            m_voices[i].note = -1;
        }
    }

    ~YMOPQSynth() {
        if (m_chip) {
            delete m_chip;
            m_chip = nullptr;
        }
    }

    void initialize(float sampleRate) {
        m_sampleRate = sampleRate;

        // Compute baseclock to match audio sample rate
        // OPQ: sample_rate = baseclock / (prescale * operators) = baseclock / 64
        m_baseClock = (uint32_t)(sampleRate * 64.0f);

        m_chip = new ymfm::ym3806(m_interface);
        m_chip->reset();

        // Apply default patch
        applyPatch(0);
    }

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        if (!m_chip) {
            memset(outL, 0, numSamples * sizeof(float));
            memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        ymfm::ymfm_output<2> output;
        float scale = m_volume / 32768.0f;

        for (int i = 0; i < numSamples; i++) {
            m_chip->generate(&output, 1);
            outL[i] = (float)output.data[0] * scale;
            outR[i] = (float)output.data[1] * scale;
        }
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int note, int velocity) {
        if (!m_chip || velocity == 0) {
            noteOff(note);
            return;
        }

        int ch = allocateVoice(note);
        if (ch < 0) return;

        m_voices[ch].note = (int8_t)note;
        m_voices[ch].velocity = (uint8_t)velocity;
        m_voices[ch].active = true;
        m_voices[ch].age = m_voiceCounter++;

        // Set velocity-scaled total level for carrier operators
        applyVelocity(ch, velocity);

        // Set frequency
        setChannelFrequency(ch, note);

        // Key on all 4 operators
        m_chip->write(0x05, 0x78 | (ch & 0x07));
    }

    void noteOff(int note) {
        if (!m_chip) return;

        for (int ch = 0; ch < 8; ch++) {
            if (m_voices[ch].note == note && m_voices[ch].active) {
                m_voices[ch].active = false;
                // Key off all operators
                m_chip->write(0x05, ch & 0x07);
            }
        }
    }

    void allNotesOff() {
        if (!m_chip) return;

        for (int ch = 0; ch < 8; ch++) {
            m_voices[ch].note = -1;
            m_voices[ch].active = false;
            m_voices[ch].velocity = 0;
            m_chip->write(0x05, ch & 0x07);
        }
    }

    void setParameter(int paramId, float value) {
        if (!m_chip) return;

        // Determine operator index from paramId
        int opIndex = paramId / 100;
        int baseParam = paramId % 100;

        if (opIndex > 0 && opIndex <= 4) {
            // Per-operator parameter
            opIndex--; // 0-based
            setOperatorParamAllChannels(opIndex, baseParam, value);
        } else {
            // Global parameter
            setGlobalParam(baseParam, value);
        }
    }

    void controlChange(int cc, int value) {
        if (!m_chip) return;

        switch (cc) {
            case 1:  // Mod wheel -> LFO PM depth
                setGlobalParam(PARAM_LFO_PM_SENS, (float)(value * 7 / 127));
                break;
            case 7:  // Volume
                m_volume = (float)value / 127.0f;
                break;
            case 10: // Pan (simplified: adjust L/R output)
                // Not easily mappable to per-channel pan in a global way
                break;
            case 71: // Filter/Resonance -> Feedback
                setGlobalParam(PARAM_FEEDBACK, (float)(value * 7 / 127));
                break;
            case 74: // Brightness -> Algorithm
                setGlobalParam(PARAM_ALGORITHM, (float)(value * 7 / 127));
                break;
            case 91: // Reverb
                setGlobalParam(PARAM_REVERB, value > 64 ? 1.0f : 0.0f);
                break;
            case 120: // All sound off
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        m_pitchBend = value; // -8192 to +8191

        // Update frequency of all active voices
        if (!m_chip) return;
        for (int ch = 0; ch < 8; ch++) {
            if (m_voices[ch].active && m_voices[ch].note >= 0) {
                setChannelFrequency(ch, m_voices[ch].note);
            }
        }
    }

    void programChange(int program) {
        applyPatch(program % NUM_PRESETS);
    }

    void writeRegister(int offset, int value) {
        if (!m_chip) return;
        m_chip->write((uint32_t)offset, (uint8_t)value);
    }

    // ========================================================================
    // Convenience setters
    // ========================================================================

    void setAlgorithm(int value) { setGlobalParam(PARAM_ALGORITHM, (float)value); }
    void setFeedback(int value) { setGlobalParam(PARAM_FEEDBACK, (float)value); }
    void setLFORate(int value) { setGlobalParam(PARAM_LFO_RATE, (float)value); }
    void setVolume(float value) { m_volume = std::max(0.0f, std::min(1.0f, value)); }

private:
    // ========================================================================
    // Frequency computation
    // ========================================================================

    void noteToFnumBlock(int note, int& fnum, int& block) {
        // Apply pitch bend (±2 semitones)
        double bendSemitones = (double)m_pitchBend / 8192.0 * 2.0;
        double freq = 440.0 * pow(2.0, ((double)note - 69.0 + bendSemitones) / 12.0);

        // FNUM = freq * 2^(22-Block) / sampleRate
        // Start at block 0, increase until FNUM fits in 12 bits
        double fnumD = freq * (double)(1 << 22) / (double)m_sampleRate;
        block = 0;
        while (fnumD >= 4096.0 && block < 7) {
            fnumD /= 2.0;
            block++;
        }
        fnum = std::min(std::max((int)(fnumD + 0.5), 0), 4095);
    }

    void setChannelFrequency(int ch, int note) {
        if (!m_chip) return;

        int fnum, block;
        noteToFnumBlock(note, fnum, block);

        uint8_t freqHi = ((block & 0x07) << 4) | ((fnum >> 8) & 0x0F);
        uint8_t freqLo = fnum & 0xFF;

        // Set frequency for operators 1&3
        m_chip->write(0x28 + ch, freqHi);
        m_chip->write(0x38 + ch, freqLo);

        // Set frequency for operators 2&4
        m_chip->write(0x20 + ch, freqHi);
        m_chip->write(0x30 + ch, freqLo);
    }

    // ========================================================================
    // Voice allocation
    // ========================================================================

    int allocateVoice(int note) {
        // First: reuse channel already playing this note
        for (int ch = 0; ch < 8; ch++) {
            if (m_voices[ch].note == note) return ch;
        }

        // Second: find an inactive channel
        for (int ch = 0; ch < 8; ch++) {
            if (!m_voices[ch].active && m_voices[ch].note < 0) return ch;
        }

        // Third: find any inactive channel
        for (int ch = 0; ch < 8; ch++) {
            if (!m_voices[ch].active) return ch;
        }

        // Fourth: steal oldest voice
        uint32_t oldestAge = UINT32_MAX;
        int oldestCh = 0;
        for (int ch = 0; ch < 8; ch++) {
            if (m_voices[ch].age < oldestAge) {
                oldestAge = m_voices[ch].age;
                oldestCh = ch;
            }
        }

        // Key off stolen voice
        m_chip->write(0x05, oldestCh & 0x07);
        return oldestCh;
    }

    // ========================================================================
    // Velocity scaling
    // ========================================================================

    void applyVelocity(int ch, int velocity) {
        // Scale carrier operator total levels by velocity
        // Carrier operators depend on algorithm:
        // Algo 0: carrier = op4 only
        // Algo 1: carrier = op4 only
        // Algo 2: carrier = op4 only
        // Algo 3: carrier = op4 only
        // Algo 4: carrier = op2, op4
        // Algo 5: carrier = op2, op3, op4
        // Algo 6: carrier = op2, op3, op4
        // Algo 7: carrier = op1, op2, op3, op4

        uint8_t algo = m_patchOps[0].totalLevel; // We'll use stored algorithm
        // Actually, read from the register
        // The algo is stored in register 0x10+ch bits 0-2
        // For simplicity, use the current patch setting
        algo = m_currentAlgorithm;

        float velScale = (float)velocity / 127.0f;

        for (int op = 0; op < 4; op++) {
            bool isCarrier = false;
            switch (algo) {
                case 0: case 1: case 2: case 3:
                    isCarrier = (op == 3); break;
                case 4:
                    isCarrier = (op == 1 || op == 3); break;
                case 5: case 6:
                    isCarrier = (op >= 1); break;
                case 7:
                    isCarrier = true; break;
            }

            if (isCarrier) {
                int opoffs = ch + op * 8;
                // Scale the patch TL by velocity
                int tl = m_patchOps[op].totalLevel;
                int velTL = tl + (int)((1.0f - velScale) * 40.0f);
                if (velTL > 127) velTL = 127;
                m_chip->write(0x60 + opoffs, (uint8_t)velTL);
            }
        }
    }

    // ========================================================================
    // Parameter setting
    // ========================================================================

    void setGlobalParam(int param, float value) {
        if (!m_chip) return;
        int v = (int)value;

        switch (param) {
            case PARAM_ALGORITHM:
                m_currentAlgorithm = std::min(std::max(v, 0), 7);
                for (int ch = 0; ch < 8; ch++) {
                    uint8_t reg = 0xC0 | m_currentAlgorithm | (m_currentFeedback << 3);
                    m_chip->write(0x10 + ch, reg);
                }
                break;
            case PARAM_FEEDBACK:
                m_currentFeedback = std::min(std::max(v, 0), 7);
                for (int ch = 0; ch < 8; ch++) {
                    uint8_t reg = 0xC0 | m_currentAlgorithm | (m_currentFeedback << 3);
                    m_chip->write(0x10 + ch, reg);
                }
                break;
            case PARAM_LFO_RATE:
                m_chip->write(0x04, std::min(std::max(v, 0), 7));
                break;
            case PARAM_LFO_PM_SENS:
                for (int ch = 0; ch < 8; ch++) {
                    uint8_t sens = (uint8_t)(std::min(std::max(v, 0), 7) << 4);
                    uint8_t amSens = m_currentAmSens & 0x03;
                    uint8_t rev = m_currentReverb ? 0x80 : 0x00;
                    m_chip->write(0x18 + ch, rev | sens | amSens);
                }
                break;
            case PARAM_LFO_AM_SENS:
                m_currentAmSens = std::min(std::max(v, 0), 3);
                for (int ch = 0; ch < 8; ch++) {
                    uint8_t pmSens = (uint8_t)(m_currentPmSens << 4);
                    uint8_t rev = m_currentReverb ? 0x80 : 0x00;
                    m_chip->write(0x18 + ch, rev | pmSens | (m_currentAmSens & 0x03));
                }
                break;
            case PARAM_REVERB:
                m_currentReverb = (v != 0);
                for (int ch = 0; ch < 8; ch++) {
                    uint8_t pmSens = (uint8_t)(m_currentPmSens << 4);
                    uint8_t rev = m_currentReverb ? 0x80 : 0x00;
                    m_chip->write(0x18 + ch, rev | pmSens | (m_currentAmSens & 0x03));
                }
                break;
            case PARAM_VOLUME:
                m_volume = std::max(0.0f, std::min(1.0f, value));
                break;
        }
    }

    void setOperatorParamAllChannels(int opIndex, int param, float value) {
        if (!m_chip || opIndex < 0 || opIndex > 3) return;
        int v = (int)value;

        for (int ch = 0; ch < 8; ch++) {
            int opoffs = ch + opIndex * 8;
            setOperatorParam(opoffs, opIndex, param, v);
        }
    }

    void setOperatorParam(int opoffs, int opIndex, int param, int value) {
        switch (param) {
            case PARAM_OP_TOTAL_LEVEL:
                value = std::min(std::max(value, 0), 127);
                m_patchOps[opIndex].totalLevel = (uint8_t)value;
                m_chip->write(0x60 + opoffs, (uint8_t)value);
                break;
            case PARAM_OP_ATTACK_RATE:
                value = std::min(std::max(value, 0), 31);
                m_patchOps[opIndex].attackRate = (uint8_t)value;
                m_chip->write(0x80 + opoffs,
                    ((m_patchOps[opIndex].ksr & 0x03) << 6) | (value & 0x1F));
                break;
            case PARAM_OP_DECAY_RATE:
                value = std::min(std::max(value, 0), 31);
                m_patchOps[opIndex].decayRate = (uint8_t)value;
                m_chip->write(0xA0 + opoffs,
                    ((m_patchOps[opIndex].amEnable & 1) << 7) |
                    ((m_patchOps[opIndex].waveform & 1) << 6) |
                    (value & 0x1F));
                break;
            case PARAM_OP_SUSTAIN_RATE:
                value = std::min(std::max(value, 0), 31);
                m_patchOps[opIndex].sustainRate = (uint8_t)value;
                m_chip->write(0xC0 + opoffs, value & 0x1F);
                break;
            case PARAM_OP_SUSTAIN_LEVEL:
                value = std::min(std::max(value, 0), 15);
                m_patchOps[opIndex].sustainLevel = (uint8_t)value;
                m_chip->write(0xE0 + opoffs,
                    ((value & 0x0F) << 4) | (m_patchOps[opIndex].releaseRate & 0x0F));
                break;
            case PARAM_OP_RELEASE_RATE:
                value = std::min(std::max(value, 0), 15);
                m_patchOps[opIndex].releaseRate = (uint8_t)value;
                m_chip->write(0xE0 + opoffs,
                    ((m_patchOps[opIndex].sustainLevel & 0x0F) << 4) | (value & 0x0F));
                break;
            case PARAM_OP_MULTIPLE:
                value = std::min(std::max(value, 0), 15);
                m_patchOps[opIndex].multiple = (uint8_t)value;
                // Multiple is written to 0x40+opoffs with bit 7 set
                m_chip->write(0x40 + opoffs, 0x80 | (value & 0x0F));
                break;
            case PARAM_OP_DETUNE:
                value = std::min(std::max(value, 0), 63);
                m_patchOps[opIndex].detune = (uint8_t)value;
                // Detune is written to 0x40+opoffs with bit 7 clear
                m_chip->write(0x40 + opoffs, value & 0x3F);
                break;
            case PARAM_OP_WAVEFORM:
                value = std::min(std::max(value, 0), 1);
                m_patchOps[opIndex].waveform = (uint8_t)value;
                m_chip->write(0xA0 + opoffs,
                    ((m_patchOps[opIndex].amEnable & 1) << 7) |
                    ((value & 1) << 6) |
                    (m_patchOps[opIndex].decayRate & 0x1F));
                break;
            case PARAM_OP_KSR:
                value = std::min(std::max(value, 0), 3);
                m_patchOps[opIndex].ksr = (uint8_t)value;
                m_chip->write(0x80 + opoffs,
                    ((value & 0x03) << 6) | (m_patchOps[opIndex].attackRate & 0x1F));
                break;
            case PARAM_OP_AM_ENABLE:
                value = std::min(std::max(value, 0), 1);
                m_patchOps[opIndex].amEnable = (uint8_t)value;
                m_chip->write(0xA0 + opoffs,
                    ((value & 1) << 7) |
                    ((m_patchOps[opIndex].waveform & 1) << 6) |
                    (m_patchOps[opIndex].decayRate & 0x1F));
                break;
        }
    }

    // ========================================================================
    // Patch management
    // ========================================================================

    void applyPatch(int program) {
        if (!m_chip || program < 0 || program >= NUM_PRESETS) return;

        m_currentPatch = program;
        const FMPatch& patch = s_presets[program];

        m_currentAlgorithm = patch.algorithm;
        m_currentFeedback = patch.feedback;
        m_currentPmSens = patch.pmSens;
        m_currentAmSens = patch.amSens;
        m_currentReverb = (patch.reverb != 0);

        // LFO rate (reg 0x04): bit 3 = disable, bits 0-2 = rate
        if (patch.lfoRate == 0 && patch.pmSens == 0 && patch.amSens == 0) {
            m_chip->write(0x04, 0x08); // Disable LFO
        } else {
            m_chip->write(0x04, patch.lfoRate & 0x07); // Enable with rate
        }

        for (int ch = 0; ch < 8; ch++) {
            // Algorithm + Feedback + Pan (both L+R on)
            m_chip->write(0x10 + ch,
                0xC0 | ((patch.feedback & 0x07) << 3) | (patch.algorithm & 0x07));

            // Reverb + PM sens + AM sens
            uint8_t rev = patch.reverb ? 0x80 : 0x00;
            m_chip->write(0x18 + ch,
                rev | ((patch.pmSens & 0x07) << 4) | (patch.amSens & 0x03));

            // Set operator parameters
            for (int op = 0; op < 4; op++) {
                const FMOperator& opData = patch.ops[op];
                int opoffs = ch + op * 8;

                // Detune (bit 7 = 0)
                m_chip->write(0x40 + opoffs, opData.detune & 0x3F);

                // Multiple (bit 7 = 1)
                m_chip->write(0x40 + opoffs, 0x80 | (opData.multiple & 0x0F));

                // Total Level
                m_chip->write(0x60 + opoffs, opData.totalLevel & 0x7F);

                // KSR + Attack Rate
                m_chip->write(0x80 + opoffs,
                    ((opData.ksr & 0x03) << 6) | (opData.attackRate & 0x1F));

                // AM enable + Waveform + Decay Rate
                m_chip->write(0xA0 + opoffs,
                    ((opData.amEnable & 1) << 7) |
                    ((opData.waveform & 1) << 6) |
                    (opData.decayRate & 0x1F));

                // Sustain Rate
                m_chip->write(0xC0 + opoffs, opData.sustainRate & 0x1F);

                // Sustain Level + Release Rate
                m_chip->write(0xE0 + opoffs,
                    ((opData.sustainLevel & 0x0F) << 4) | (opData.releaseRate & 0x0F));
            }
        }

        // Store operator data for velocity scaling
        for (int op = 0; op < 4; op++) {
            m_patchOps[op] = patch.ops[op];
        }
    }

    // ========================================================================
    // Internal state
    // ========================================================================

    StandaloneInterface m_interface;
    ymfm::ym3806* m_chip;
    float m_sampleRate;
    uint32_t m_baseClock;
    float m_volume;
    VoiceState m_voices[8];
    uint32_t m_voiceCounter;
    int m_pitchBend;
    int m_currentPatch;
    int m_currentAlgorithm = 5;
    int m_currentFeedback = 6;
    int m_currentPmSens = 0;
    int m_currentAmSens = 0;
    bool m_currentReverb = false;
    FMOperator m_patchOps[4];
};

} // namespace devilbox

// ============================================================================
// Emscripten Bindings
// ============================================================================
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(ymopq_synth) {
    emscripten::class_<devilbox::YMOPQSynth>("YMOPQSynth")
        .constructor<>()
        .function("initialize",    &devilbox::YMOPQSynth::initialize)
        .function("process",       &devilbox::YMOPQSynth::process)
        .function("noteOn",        &devilbox::YMOPQSynth::noteOn)
        .function("noteOff",       &devilbox::YMOPQSynth::noteOff)
        .function("allNotesOff",   &devilbox::YMOPQSynth::allNotesOff)
        .function("setParameter",  &devilbox::YMOPQSynth::setParameter)
        .function("controlChange", &devilbox::YMOPQSynth::controlChange)
        .function("pitchBend",     &devilbox::YMOPQSynth::pitchBend)
        .function("programChange", &devilbox::YMOPQSynth::programChange)
        .function("writeRegister", &devilbox::YMOPQSynth::writeRegister)
        .function("setAlgorithm",  &devilbox::YMOPQSynth::setAlgorithm)
        .function("setFeedback",   &devilbox::YMOPQSynth::setFeedback)
        .function("setLFORate",    &devilbox::YMOPQSynth::setLFORate)
        .function("setVolume",     &devilbox::YMOPQSynth::setVolume);
}
#endif
