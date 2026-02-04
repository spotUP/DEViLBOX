/**
 * AICASynth.cpp - Sega Dreamcast AICA for WebAssembly
 * Based on MAME's AICA emulator by ElSemi and R. Belmont
 *
 * This is a standalone implementation that provides the core AICA functionality
 * without the MAME device framework dependencies.
 *
 * The AICA is a 64-voice sampler with:
 * - PCM playback (8-bit, 16-bit, and ADPCM)
 * - ADSR envelope generator
 * - LFO for pitch and amplitude modulation
 * - Built-in DSP for effects
 *
 * License: BSD-3-Clause (MAME license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <vector>
#include <unordered_map>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Helper for clamp
template<typename T>
inline T clamp_value(T val, T lo, T hi) {
    return (val < lo) ? lo : (val > hi) ? hi : val;
}

namespace devilbox {

// Type definitions
using u8 = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using s8 = int8_t;
using s16 = int16_t;
using s32 = int32_t;

// AICA Constants
static constexpr int AICA_SLOTS = 64;
static constexpr size_t SAMPLE_RAM_SIZE = 2 * 1024 * 1024;  // 2MB sample RAM
static constexpr int EG_SHIFT = 16;

// Sample formats
enum class SampleFormat { PCM16, PCM8, ADPCM };

// Envelope times (from MAME AICA)
static const double ARTimes[64] = {
    100000, 100000, 8100.0, 6900.0, 6000.0, 4800.0, 4000.0, 3400.0,
    3000.0, 2400.0, 2000.0, 1700.0, 1500.0, 1200.0, 1000.0, 860.0,
    760.0, 600.0, 500.0, 430.0, 380.0, 300.0, 250.0, 220.0,
    190.0, 150.0, 130.0, 110.0, 95.0, 76.0, 63.0, 55.0,
    47.0, 38.0, 31.0, 27.0, 24.0, 19.0, 15.0, 13.0,
    12.0, 9.4, 7.9, 6.8, 6.0, 4.7, 3.8, 3.4,
    3.0, 2.4, 2.0, 1.8, 1.6, 1.3, 1.1, 0.93,
    0.85, 0.65, 0.53, 0.44, 0.40, 0.35, 0.0, 0.0
};

static const double DRTimes[64] = {
    100000, 100000, 118200.0, 101300.0, 88600.0, 70900.0, 59100.0, 50700.0,
    44300.0, 35500.0, 29600.0, 25300.0, 22200.0, 17700.0, 14800.0, 12700.0,
    11100.0, 8900.0, 7400.0, 6300.0, 5500.0, 4400.0, 3700.0, 3200.0,
    2800.0, 2200.0, 1800.0, 1600.0, 1400.0, 1100.0, 920.0, 790.0,
    690.0, 550.0, 460.0, 390.0, 340.0, 270.0, 230.0, 200.0,
    170.0, 140.0, 110.0, 98.0, 85.0, 68.0, 57.0, 49.0,
    43.0, 34.0, 28.0, 25.0, 22.0, 18.0, 14.0, 12.0,
    11.0, 8.5, 7.1, 6.1, 5.4, 4.3, 3.6, 3.1
};

// ADPCM step table (Yamaha style)
static const int ADPCMSteps[8] = { -1, -1, -1, -1, 2, 4, 6, 8 };
static const int ADPCMScale[16] = {
    230, 230, 230, 230, 307, 409, 512, 614,
    230, 230, 230, 230, 307, 409, 512, 614
};

// Envelope states
enum class EGState { ATTACK, DECAY1, DECAY2, RELEASE };

/**
 * AICA Slot (Voice) structure
 */
struct AICASlot {
    // Sample parameters
    u32 sampleAddr = 0;
    u32 loopStart = 0;
    u32 loopEnd = 0;
    bool loop = false;
    SampleFormat format = SampleFormat::PCM16;

    // Pitch
    int octave = 0;
    u16 fns = 0;
    u32 curAddr = 0;
    u32 step = 0;

    // Envelope
    EGState egState = EGState::RELEASE;
    s32 egVolume = 0;
    s32 egAR = 0;
    s32 egD1R = 0;
    s32 egD2R = 0;
    s32 egRR = 0;
    s32 egDL = 0;
    u8 totalLevel = 0;

    // LFO
    u16 lfoPhase = 0;
    u32 lfoStep = 0;
    u8 lfoFreq = 0;
    u8 lfoPitchDepth = 0;
    u8 lfoAmpDepth = 0;

    // Pan
    u8 pan = 16;

    // ADPCM state
    s32 adpcmStep = 0;
    s16 adpcmSample = 0;
    u8 adpcmNibble = 0;  // 0 or 1, which nibble to read

    // State
    bool active = false;
    bool keyOn = false;
    s16 prevSample = 0;
};

/**
 * AICA Parameter IDs
 */
enum class AICAParam {
    MASTER_VOLUME = 0,
    PARAM_COUNT = 1
};

/**
 * AICA Synthesizer - Standalone implementation
 */
class AICASynth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;
    static constexpr u32 AICA_CLOCK = 22579200;

    AICASynth()
        : m_sampleRate(44100)
        , m_isInitialized(false)
        , m_masterVolume(1.0f)
        , m_sampleRAM(SAMPLE_RAM_SIZE, 0)
    {
        std::fill(std::begin(m_slots), std::end(m_slots), AICASlot());
    }

    void initialize(int sampleRate) {
        m_sampleRate = sampleRate;
        initEnvelopeTables();
        initLFOTables();
        initPanTables();
        m_isInitialized = true;
    }

    bool isInitialized() const { return m_isInitialized; }
    int getSampleRate() const { return m_sampleRate; }

    void loadSample(uint32_t offset, const uint8_t* data, size_t size) {
        if (offset + size > m_sampleRAM.size()) {
            size = m_sampleRAM.size() - offset;
        }
        std::memcpy(m_sampleRAM.data() + offset, data, size);
    }

    void loadSampleJS(uint32_t offset, uintptr_t dataPtr, size_t size) {
        const uint8_t* data = reinterpret_cast<const uint8_t*>(dataPtr);
        loadSample(offset, data, size);
    }

    void configureSlot(int slot, uint32_t sampleAddr, uint32_t loopStart,
                       uint32_t loopEnd, bool loop, int format) {
        if (slot < 0 || slot >= AICA_SLOTS) return;

        AICASlot& s = m_slots[slot];
        s.sampleAddr = sampleAddr;
        s.loopStart = loopStart;
        s.loopEnd = loopEnd;
        s.loop = loop;
        s.format = static_cast<SampleFormat>(clamp_value(format, 0, 2));

        // Reset ADPCM state when reconfiguring
        if (s.format == SampleFormat::ADPCM) {
            s.adpcmStep = 0;
            s.adpcmSample = 0;
            s.adpcmNibble = 0;
        }
    }

    void noteOn(int midiNote, int velocity) {
        if (!m_isInitialized || velocity == 0) {
            noteOff(midiNote);
            return;
        }

        int slot = findFreeSlot();
        if (slot < 0) return;

        AICASlot& s = m_slots[slot];

        // Convert MIDI note to AICA pitch
        int octave = (midiNote / 12) - 5;
        int note = midiNote % 12;
        int fns = note * 85;

        s.octave = clamp_value(octave, -8, 7);
        s.fns = fns & 0x3FF;
        computeStep(s);

        s.totalLevel = 255 - (velocity * 2);
        s.egAR = m_artable[31];
        s.egD1R = m_drtable[20];
        s.egD2R = m_drtable[10];
        s.egRR = m_drtable[25];
        s.egDL = 16;

        s.curAddr = s.sampleAddr << 8;
        s.prevSample = 0;
        s.egState = EGState::ATTACK;
        s.egVolume = 0;

        // Reset ADPCM state
        if (s.format == SampleFormat::ADPCM) {
            s.adpcmStep = 0;
            s.adpcmSample = 0;
            s.adpcmNibble = 0;
        }

        s.keyOn = true;
        s.active = true;

        m_noteSlotMap[midiNote] = slot;
    }

    void noteOff(int midiNote) {
        auto it = m_noteSlotMap.find(midiNote);
        if (it == m_noteSlotMap.end()) return;

        int slot = it->second;
        if (slot >= 0 && slot < AICA_SLOTS) {
            m_slots[slot].keyOn = false;
            m_slots[slot].egState = EGState::RELEASE;
        }
        m_noteSlotMap.erase(it);
    }

    void allNotesOff() {
        for (int i = 0; i < AICA_SLOTS; i++) {
            m_slots[i].keyOn = false;
            m_slots[i].egState = EGState::RELEASE;
        }
        m_noteSlotMap.clear();
    }

    void setParameter(int paramId, float value) {
        if (!m_isInitialized) return;

        switch (static_cast<AICAParam>(paramId)) {
            case AICAParam::MASTER_VOLUME:
                m_masterVolume = clamp_value(value, 0.0f, 1.0f);
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) const {
        switch (static_cast<AICAParam>(paramId)) {
            case AICAParam::MASTER_VOLUME:
                return m_masterVolume;
            default:
                return 0.0f;
        }
    }

    void controlChange(int cc, int value) {
        if (!m_isInitialized) return;

        switch (cc) {
            case 7:
                m_masterVolume = value / 127.0f;
                break;
            case 123:
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        // TODO: Apply pitch bend
    }

    void programChange(int program) {
        // Could load presets
    }

    void process(float* outputL, float* outputR, int numSamples) {
        if (!outputL || !outputR || numSamples <= 0) return;

        if (numSamples > MAX_OUTPUT_SAMPLES) {
            numSamples = MAX_OUTPUT_SAMPLES;
        }

        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        std::memset(outputL, 0, numSamples * sizeof(float));
        std::memset(outputR, 0, numSamples * sizeof(float));

        for (int slot = 0; slot < AICA_SLOTS; slot++) {
            if (!m_slots[slot].active) continue;
            processSlot(slot, outputL, outputR, numSamples);
        }

        for (int i = 0; i < numSamples; i++) {
            outputL[i] *= m_masterVolume;
            outputR[i] *= m_masterVolume;
        }
    }

    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

private:
    void initEnvelopeTables() {
        for (int i = 0; i < 64; i++) {
            double rate = ARTimes[i];
            if (rate > 0) {
                m_artable[i] = static_cast<int>((0x3FF << EG_SHIFT) / (rate * m_sampleRate / 1000.0));
            } else {
                m_artable[i] = (0x3FF << EG_SHIFT);
            }

            rate = DRTimes[i];
            if (rate > 0) {
                m_drtable[i] = static_cast<int>((0x3FF << EG_SHIFT) / (rate * m_sampleRate / 1000.0));
            } else {
                m_drtable[i] = (0x3FF << EG_SHIFT);
            }
        }
    }

    void initLFOTables() {
        for (int i = 0; i < 256; i++) {
            int tri = (i < 128) ? (i * 2) : (255 - i) * 2;
            m_lfoTri[i] = tri - 128;
            m_lfoSaw[i] = i - 128;
            m_lfoSqr[i] = (i < 128) ? 127 : -128;
        }
    }

    void initPanTables() {
        for (int i = 0; i < 32; i++) {
            float pan = static_cast<float>(i) / 31.0f;
            m_panL[i] = 1.0f - pan;
            m_panR[i] = pan;
        }
    }

    void computeStep(AICASlot& s) {
        int octave = (s.octave ^ 8) - 8;
        int fns = s.fns;
        double freq = 440.0 * pow(2.0, (octave * 12 + fns / 85.33 - 69) / 12.0);
        s.step = static_cast<u32>(freq / m_sampleRate * 256.0);
    }

    int findFreeSlot() {
        for (int i = 0; i < AICA_SLOTS; i++) {
            if (!m_slots[i].active) return i;
        }
        return -1;
    }

    s16 readSample(AICASlot& s, u32 addr) {
        switch (s.format) {
            case SampleFormat::PCM16:
                if (addr + 1 < m_sampleRAM.size()) {
                    return static_cast<s16>(
                        (m_sampleRAM[addr] << 8) | m_sampleRAM[addr + 1]
                    );
                }
                break;

            case SampleFormat::PCM8:
                if (addr < m_sampleRAM.size()) {
                    return static_cast<s8>(m_sampleRAM[addr]) << 8;
                }
                break;

            case SampleFormat::ADPCM:
                return decodeADPCM(s, addr);
        }
        return 0;
    }

    s16 decodeADPCM(AICASlot& s, u32 addr) {
        if (addr >= m_sampleRAM.size()) return 0;

        u8 data = m_sampleRAM[addr];
        int nibble = s.adpcmNibble ? (data & 0x0F) : ((data >> 4) & 0x0F);

        // Yamaha ADPCM decoding
        int diff = ((nibble & 7) * 2 + 1) * ADPCMScale[s.adpcmStep & 15] / 8;
        if (nibble & 8) diff = -diff;

        s32 newSample = s.adpcmSample + diff;
        s.adpcmSample = static_cast<s16>(clamp_value(newSample, (s32)-32768, (s32)32767));
        s32 newStep = s.adpcmStep + ADPCMSteps[nibble & 7];
        s.adpcmStep = clamp_value(newStep, (s32)0, (s32)48);

        return s.adpcmSample;
    }

    int updateEnvelope(AICASlot& s) {
        switch (s.egState) {
            case EGState::ATTACK:
                s.egVolume += s.egAR;
                if (s.egVolume >= (0x3FF << EG_SHIFT)) {
                    s.egVolume = 0x3FF << EG_SHIFT;
                    s.egState = EGState::DECAY1;
                }
                break;

            case EGState::DECAY1:
                s.egVolume -= s.egD1R;
                if (s.egVolume <= 0) s.egVolume = 0;
                if ((s.egVolume >> (EG_SHIFT + 5)) <= s.egDL) {
                    s.egState = EGState::DECAY2;
                }
                break;

            case EGState::DECAY2:
                s.egVolume -= s.egD2R;
                if (s.egVolume <= 0) s.egVolume = 0;
                break;

            case EGState::RELEASE:
                s.egVolume -= s.egRR;
                if (s.egVolume <= 0) {
                    s.egVolume = 0;
                    s.active = false;
                }
                break;
        }

        return s.egVolume >> EG_SHIFT;
    }

    void processSlot(int slotIdx, float* outputL, float* outputR, int numSamples) {
        AICASlot& s = m_slots[slotIdx];

        float panL = m_panL[s.pan & 0x1F];
        float panR = m_panR[s.pan & 0x1F];

        for (int i = 0; i < numSamples; i++) {
            u32 addr = s.curAddr >> 8;
            int frac = s.curAddr & 0xFF;

            s16 samp0 = readSample(s, addr);

            // Advance ADPCM nibble for next sample
            if (s.format == SampleFormat::ADPCM) {
                s.adpcmNibble = 1 - s.adpcmNibble;
            }

            s16 samp1 = readSample(s, addr + getBytesPerSample(s.format));
            s32 sample = samp0 + ((samp1 - samp0) * frac >> 8);

            int egVol = updateEnvelope(s);
            if (!s.active) break;

            sample = (sample * egVol) >> 10;
            sample = (sample * (255 - s.totalLevel)) >> 8;

            float fsample = sample / 32768.0f;
            outputL[i] += fsample * panL;
            outputR[i] += fsample * panR;

            s.curAddr += s.step;

            u32 endAddr = (s.sampleAddr + s.loopEnd) << 8;
            if (s.curAddr >= endAddr) {
                if (s.loop) {
                    s.curAddr = (s.sampleAddr + s.loopStart) << 8;
                    if (s.format == SampleFormat::ADPCM) {
                        s.adpcmStep = 0;
                        s.adpcmSample = 0;
                        s.adpcmNibble = 0;
                    }
                } else {
                    s.active = false;
                    break;
                }
            }
        }
    }

    int getBytesPerSample(SampleFormat format) {
        switch (format) {
            case SampleFormat::PCM16: return 2;
            case SampleFormat::PCM8: return 1;
            case SampleFormat::ADPCM: return 1;  // Nibble-based
            default: return 2;
        }
    }

    int m_sampleRate;
    bool m_isInitialized;
    float m_masterVolume;

    std::vector<u8> m_sampleRAM;
    AICASlot m_slots[AICA_SLOTS];
    std::unordered_map<int, int> m_noteSlotMap;

    int m_artable[64];
    int m_drtable[64];
    int m_lfoTri[256];
    int m_lfoSaw[256];
    int m_lfoSqr[256];
    float m_panL[32];
    float m_panR[32];
};

} // namespace devilbox

// Emscripten bindings
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(AICASynth_bindings) {
    emscripten::class_<devilbox::AICASynth>("AICASynth")
        .constructor<>()
        .function("initialize", &devilbox::AICASynth::initialize)
        .function("isInitialized", &devilbox::AICASynth::isInitialized)
        .function("getSampleRate", &devilbox::AICASynth::getSampleRate)
        .function("loadSample", &devilbox::AICASynth::loadSampleJS)
        .function("configureSlot", &devilbox::AICASynth::configureSlot)
        .function("noteOn", &devilbox::AICASynth::noteOn)
        .function("noteOff", &devilbox::AICASynth::noteOff)
        .function("allNotesOff", &devilbox::AICASynth::allNotesOff)
        .function("setParameter", &devilbox::AICASynth::setParameter)
        .function("getParameter", &devilbox::AICASynth::getParameter)
        .function("controlChange", &devilbox::AICASynth::controlChange)
        .function("pitchBend", &devilbox::AICASynth::pitchBend)
        .function("programChange", &devilbox::AICASynth::programChange)
        .function("process", &devilbox::AICASynth::processJS);
}
#endif
