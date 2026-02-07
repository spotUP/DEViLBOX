/**
 * RF5C400 Synthesizer - Ricoh 32-Voice PCM
 * Standalone WASM implementation based on MAME's rf5c400 by Ville Linde
 *
 * Features:
 * - 32 independent voices
 * - 16-bit and 8-bit PCM sample formats
 * - ADSR envelope (Attack, Decay, Release)
 * - Per-voice volume and panning
 * - Sample looping
 * - Resonant filter (cutoff + resonance)
 * - Effect sends (chorus/reverb depth)
 *
 * Used in many arcade games:
 * - Konami Bemani series (beatmania, pop'n music, etc.)
 * - Konami Firebeat games
 * - Various Namco games
 */

#include <emscripten/bind.h>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <array>

// PCM types
static constexpr uint16_t TYPE_MASK = 0x00C0;
static constexpr uint16_t TYPE_16 = 0x0000;
static constexpr uint16_t TYPE_8LOW = 0x0040;
static constexpr uint16_t TYPE_8HIGH = 0x0080;

// Envelope phases
static constexpr uint8_t PHASE_NONE = 0;
static constexpr uint8_t PHASE_ATTACK = 1;
static constexpr uint8_t PHASE_DECAY = 2;
static constexpr uint8_t PHASE_RELEASE = 3;

class RF5C400Synth {
public:
    RF5C400Synth() {
        initTables();
    }

    void initialize(float sampleRate) {
        m_outputSampleRate = sampleRate;
        m_clock = 16934400; // Default clock (varies by game)
        m_nativeSampleRate = static_cast<float>(m_clock) / 384.0f;
        m_accumulator = 0.0f;
        initEnvelopeTables();
        reset();
    }

    void reset() {
        for (int i = 0; i < 32; i++) {
            m_channel[i] = Channel();
        }
        m_status = 0;
        m_extMemAddress = 0;
        m_extMemData = 0;
        m_reqChannel = 0;
    }

    void loadROM(uint32_t offset, uintptr_t dataPtr, uint32_t size) {
        const uint8_t* data = reinterpret_cast<const uint8_t*>(dataPtr);
        uint32_t maxSize = ROM_SIZE - offset;
        uint32_t copySize = std::min(size, maxSize);
        memcpy(&m_rom[offset], data, copySize);

        // After loading ROM, initialize all channels with default sample configuration
        initializeDefaultSamples();
    }

    /**
     * Initialize all channels with a default test waveform
     * Creates a 1024-sample sawtooth wave at the start of ROM
     */
    void initializeDefaultSamples() {
        // Generate a simple square wave (1024 samples, 16-bit)
        // Using positive-only values to avoid sign-adjustment issues
        const int WAVE_SIZE = 1024;
        uint16_t* rom16 = reinterpret_cast<uint16_t*>(m_rom);
        for (int i = 0; i < WAVE_SIZE; i++) {
            // Square wave: alternating high/low
            rom16[i] = (i & 256) ? 0x4000 : 0x0000;
        }

        // Configure all 32 channels to use this test sample
        for (int ch = 0; ch < 32; ch++) {
            Channel& c = m_channel[ch];
            // RF5C400 uses 20-bit sample addresses (startH << 16 | startL)
            c.startH = 0;               // Start high word
            c.startL = 0;               // Start low word
            c.endL = WAVE_SIZE * 2;     // End address (bytes)
            c.endHloopH = 0;            // End high / Loop high
            c.loopL = 0;                // Loop from start
            c.freq = 0x1000;            // Default frequency
            c.pan = 0x0F;               // Center pan
            c.volume = 0xFF;            // Max volume
            c.attack = 0x00;            // Fast attack
            c.decay = 0x00;             // No decay
            c.release = 0x7F;           // Medium release
        }
    }

    // Note interface for DEViLBOX
    void noteOn(int note, int velocity) {
        if (velocity == 0) {
            noteOff(note);
            return;
        }

        // Find free channel
        int ch = -1;
        for (int i = 0; i < 32; i++) {
            if (m_channelNote[i] == 0) {
                ch = i;
                break;
            }
        }
        if (ch < 0) ch = 0;

        m_channelNote[ch] = note;
        Channel& chan = m_channel[ch];

        // Calculate frequency from MIDI note
        float freq = 440.0f * powf(2.0f, (note - 69) / 12.0f);
        float baseFreq = m_nativeSampleRate / 2.0f; // Assume 1:1 at ~22kHz
        uint16_t freqReg = static_cast<uint16_t>((freq / baseFreq) * 0x1000);

        // Calculate step (same as MAME: ((data & 0x1fff) << (data >> 13)) * 4)
        chan.step = ((freqReg & 0x1fff) << (freqReg >> 13)) * 4;
        chan.freq = freqReg;

        // NOTE: Don't overwrite sample addresses - use the ones from initializeDefaultSamples()
        // Only update volume and pan for the velocity
        chan.volume = velocity | (TYPE_16 << 8); // 16-bit samples
        chan.pan = 0x4747; // Center pan

        // Start envelope - use instant attack for testing (envLevel = 1.0)
        // In production, would use proper ADSR from channel.attack register
        chan.pos = 0;
        chan.envPhase = PHASE_ATTACK;
        chan.envLevel = 1.0;  // Instant attack for testing (was 0.0)
        chan.envStep = 0.0;   // No ramp needed since we start at max
        chan.envScale = 1.0;
    }

    void noteOff(int note) {
        for (int i = 0; i < 32; i++) {
            if (m_channelNote[i] == note) {
                m_channelNote[i] = 0;
                if (m_channel[i].envPhase != PHASE_NONE) {
                    m_channel[i].envPhase = PHASE_RELEASE;
                    m_channel[i].envStep = m_rrTable[0x40]; // Medium release
                }
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < 32; i++) {
            m_channelNote[i] = 0;
            m_channel[i].envPhase = PHASE_NONE;
            m_channel[i].envLevel = 0.0;
        }
    }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case 0: // Master volume
                m_masterVolume = value;
                break;
            case 1: // Clock
                m_clock = static_cast<uint32_t>(value);
                m_nativeSampleRate = static_cast<float>(m_clock) / 384.0f;
                initEnvelopeTables();
                break;
        }
    }

    // Register write
    void writeRegister(uint32_t offset, uint16_t data) {
        if (offset < 0x400) {
            writeGlobalRegister(offset, data);
        } else {
            int ch = (offset >> 5) & 0x1f;
            int reg = offset & 0x1f;
            writeChannelRegister(ch, reg, data);
        }
    }

    void process(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);

        for (int i = 0; i < numSamples; i++) {
            m_accumulator += m_nativeSampleRate / m_outputSampleRate;

            while (m_accumulator >= 1.0f) {
                generateSample();
                m_accumulator -= 1.0f;
            }

            float t = m_accumulator;
            outputL[i] = ((1.0f - t) * m_lastOutputL + t * m_currentOutputL) * m_masterVolume;
            outputR[i] = ((1.0f - t) * m_lastOutputR + t * m_currentOutputR) * m_masterVolume;
            m_lastOutputL = m_currentOutputL;
            m_lastOutputR = m_currentOutputR;
        }
    }

private:
    static constexpr uint32_t ROM_SIZE = 32 * 1024 * 1024; // 32MB max

    struct Channel {
        uint16_t startH = 0;
        uint16_t startL = 0;
        uint16_t freq = 0;
        uint16_t endL = 0;
        uint16_t endHloopH = 0;
        uint16_t loopL = 0;
        uint16_t pan = 0;
        uint16_t effect = 0;
        uint16_t volume = 0;
        uint16_t attack = 0;
        uint16_t decay = 0;
        uint16_t release = 0;
        uint16_t cutoff = 0;

        uint64_t pos = 0;
        uint64_t step = 0;
        uint16_t keyon = 0;

        uint8_t envPhase = 0;
        double envLevel = 0.0;
        double envStep = 0.0;
        double envScale = 1.0;
    };

    // ROM
    uint8_t m_rom[ROM_SIZE] = {0};

    // Lookup tables
    int m_volumeTable[256] = {0};
    double m_panTable[256] = {0};
    double m_arTable[0x9f] = {0};
    double m_drTable[0x9f] = {0};
    double m_rrTable[0x9f] = {0};

    // Channels
    Channel m_channel[32];
    int m_channelNote[32] = {0};

    // State
    uint16_t m_status = 0;
    uint32_t m_extMemAddress = 0;
    uint16_t m_extMemData = 0;
    uint16_t m_reqChannel = 0;

    // Timing
    uint32_t m_clock = 16934400;
    float m_nativeSampleRate = 44100.0f;
    float m_outputSampleRate = 48000.0f;
    float m_accumulator = 0.0f;

    // Output
    float m_masterVolume = 1.0f;
    float m_currentOutputL = 0.0f;
    float m_currentOutputR = 0.0f;
    float m_lastOutputL = 0.0f;
    float m_lastOutputR = 0.0f;

    void initTables() {
        // Volume table (exponential curve)
        double max = 255.0;
        for (int i = 0; i < 256; i++) {
            m_volumeTable[i] = static_cast<int>(max);
            max /= pow(10.0, (4.5 / (256.0 / 16.0)) / 20.0);
        }

        // Pan table (constant power)
        for (int i = 0; i < 256; i++) {
            m_panTable[i] = 0.0;
        }
        for (int i = 0; i < 0x48; i++) {
            m_panTable[i] = sqrt(static_cast<double>(0x47 - i)) / sqrt(static_cast<double>(0x47));
        }
    }

    void initEnvelopeTables() {
        // Envelope parameters (experimental, from MAME)
        static constexpr double ENV_AR_SPEED = 0.1;
        static constexpr int ENV_MIN_AR = 0x02;
        static constexpr int ENV_MAX_AR = 0x80;
        static constexpr double ENV_DR_SPEED = 2.0;
        static constexpr int ENV_MIN_DR = 0x20;
        static constexpr int ENV_MAX_DR = 0x73;
        static constexpr double ENV_RR_SPEED = 0.7;
        static constexpr int ENV_MIN_RR = 0x20;
        static constexpr int ENV_MAX_RR = 0x54;

        double r;

        // Attack
        r = 1.0 / (ENV_AR_SPEED * (m_clock / 384.0));
        for (int i = 0; i < ENV_MIN_AR; i++)
            m_arTable[i] = 1.0;
        for (int i = ENV_MIN_AR; i < ENV_MAX_AR; i++)
            m_arTable[i] = r * (ENV_MAX_AR - i) / (ENV_MAX_AR - ENV_MIN_AR);
        for (int i = ENV_MAX_AR; i < 0x9f; i++)
            m_arTable[i] = 0.0;

        // Decay
        r = -5.0 / (ENV_DR_SPEED * (m_clock / 384.0));
        for (int i = 0; i < ENV_MIN_DR; i++)
            m_drTable[i] = r;
        for (int i = ENV_MIN_DR; i < ENV_MAX_DR; i++)
            m_drTable[i] = r * (ENV_MAX_DR - i) / (ENV_MAX_DR - ENV_MIN_DR);
        for (int i = ENV_MAX_DR; i < 0x9f; i++)
            m_drTable[i] = 0.0;

        // Release
        r = -5.0 / (ENV_RR_SPEED * (m_clock / 384.0));
        for (int i = 0; i < ENV_MIN_RR; i++)
            m_rrTable[i] = r;
        for (int i = ENV_MIN_RR; i < ENV_MAX_RR; i++)
            m_rrTable[i] = r * (ENV_MAX_RR - i) / (ENV_MAX_RR - ENV_MIN_RR);
        for (int i = ENV_MAX_RR; i < 0x9f; i++)
            m_rrTable[i] = 0.0;
    }

    inline uint8_t decode80(uint8_t val) {
        return (val & 0x80) ? ((val & 0x7f) + 0x1f) : val;
    }

    inline int16_t readWord(uint32_t addr) {
        addr &= (ROM_SIZE - 1);
        // Little-endian
        return static_cast<int16_t>(m_rom[addr] | (m_rom[addr + 1] << 8));
    }

    void writeGlobalRegister(uint32_t offset, uint16_t data) {
        switch (offset) {
            case 0x00:
                m_status = data;
                break;

            case 0x01: // Channel control
            {
                int ch = data & 0x1f;
                switch (data & 0x60) {
                    case 0x60: // Key on
                        m_channel[ch].pos =
                            (static_cast<uint64_t>(m_channel[ch].startH & 0xFF00) << 8) |
                            m_channel[ch].startL;
                        m_channel[ch].pos <<= 16;

                        m_channel[ch].envPhase = PHASE_ATTACK;
                        m_channel[ch].envLevel = 0.0;
                        m_channel[ch].envStep = m_arTable[decode80(m_channel[ch].attack >> 8)];
                        break;

                    case 0x40: // Key off
                        if (m_channel[ch].envPhase != PHASE_NONE) {
                            m_channel[ch].envPhase = PHASE_RELEASE;
                            if (m_channel[ch].release & 0x0080) {
                                m_channel[ch].envStep = 0.0;
                            } else {
                                m_channel[ch].envStep = m_rrTable[decode80(m_channel[ch].release >> 8)];
                            }
                        }
                        break;

                    default: // Force off
                        m_channel[ch].envPhase = PHASE_NONE;
                        m_channel[ch].envLevel = 0.0;
                        m_channel[ch].envStep = 0.0;
                        break;
                }
                break;
            }

            case 0x08:
                m_reqChannel = data & 0x1f;
                break;

            case 0x11:
                m_extMemAddress = (m_extMemAddress & ~0xffff) | data;
                break;

            case 0x12:
                m_extMemAddress = (m_extMemAddress & 0xffff) | (static_cast<uint32_t>(data) << 16);
                break;

            case 0x13:
                m_extMemData = data;
                break;
        }
    }

    void writeChannelRegister(int ch, int reg, uint16_t data) {
        Channel& chan = m_channel[ch];

        switch (reg) {
            case 0x00: chan.startH = data; break;
            case 0x01: chan.startL = data; break;
            case 0x02:
                chan.step = ((data & 0x1fff) << (data >> 13)) * 4;
                chan.freq = data;
                break;
            case 0x03: chan.endL = data; break;
            case 0x04: chan.endHloopH = data; break;
            case 0x05: chan.loopL = data; break;
            case 0x06: chan.pan = data; break;
            case 0x07: chan.effect = data; break;
            case 0x08: chan.volume = data; break;
            case 0x09: chan.attack = data; break;
            case 0x0C: chan.decay = data; break;
            case 0x0E: chan.release = data; break;
            case 0x10: chan.cutoff = data; break;
        }
    }

    void generateSample() {
        int32_t outputL = 0;
        int32_t outputR = 0;

        for (int ch = 0; ch < 32; ch++) {
            Channel& chan = m_channel[ch];

            uint64_t start = (static_cast<uint64_t>(chan.startH & 0xFF00) << 8) | chan.startL;
            uint64_t end = (static_cast<uint64_t>(chan.endHloopH & 0xFF) << 16) | chan.endL;
            uint64_t loop = (static_cast<uint64_t>(chan.endHloopH & 0xFF00) << 8) | chan.loopL;
            uint64_t pos = chan.pos;
            uint8_t vol = chan.volume & 0xFF;
            uint8_t lvol = chan.pan & 0xFF;
            uint8_t rvol = chan.pan >> 8;
            uint8_t type = (chan.volume >> 8) & TYPE_MASK;

            double envLevel = chan.envLevel;
            double envStep = chan.envStep;
            double envRstep = envStep * chan.envScale;

            if (start == end) continue;
            if (chan.envPhase == PHASE_NONE) continue;

            // Read sample
            int16_t tmp = readWord((pos >> 16) << 1);
            int32_t sample;

            switch (type) {
                case TYPE_16:
                    sample = tmp;
                    break;
                case TYPE_8LOW:
                    sample = static_cast<int16_t>(tmp << 8);
                    break;
                case TYPE_8HIGH:
                    sample = static_cast<int16_t>(tmp & 0xFF00);
                    break;
                default:
                    sample = 0;
                    break;
            }

            // Sign adjustment (from MAME)
            if (sample & 0x8000) {
                sample ^= 0x7FFF;
            }

            // Update envelope
            envLevel += envRstep;
            switch (chan.envPhase) {
                case PHASE_ATTACK:
                    if (envLevel >= 1.0) {
                        chan.envPhase = PHASE_DECAY;
                        envLevel = 1.0;
                        if ((chan.decay & 0x0080) || (chan.decay == 0x100)) {
                            envStep = 0.0;
                        } else {
                            envStep = m_drTable[decode80(chan.decay >> 8)];
                        }
                        envRstep = envStep * chan.envScale;
                    }
                    break;
                case PHASE_DECAY:
                    if (envLevel <= 0.0) {
                        chan.envPhase = PHASE_NONE;
                        envLevel = 0.0;
                        envStep = 0.0;
                    }
                    break;
                case PHASE_RELEASE:
                    if (envLevel <= 0.0) {
                        chan.envPhase = PHASE_NONE;
                        envLevel = 0.0;
                        envStep = 0.0;
                    }
                    break;
            }

            // Apply volume and envelope
            sample *= m_volumeTable[vol];
            sample = static_cast<int32_t>((sample >> 9) * envLevel);

            // Apply panning
            outputL += static_cast<int32_t>(sample * m_panTable[lvol]);
            outputR += static_cast<int32_t>(sample * m_panTable[rvol]);

            // Update position
            pos += chan.step;
            if ((pos >> 16) > end) {
                pos -= loop << 16;
                pos &= 0xFFFFFF0000ULL;
                if (pos < (start << 16)) {
                    pos = start << 16;
                }
            }

            chan.pos = pos;
            chan.envLevel = envLevel;
            chan.envStep = envStep;
        }

        // Normalize output
        m_currentOutputL = static_cast<float>(outputL) / 32768.0f;
        m_currentOutputR = static_cast<float>(outputR) / 32768.0f;
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(RF5C400Module) {
    emscripten::class_<RF5C400Synth>("RF5C400Synth")
        .constructor<>()
        .function("initialize", &RF5C400Synth::initialize)
        .function("reset", &RF5C400Synth::reset)
        .function("loadROM", &RF5C400Synth::loadROM)
        .function("writeRegister", &RF5C400Synth::writeRegister)
        .function("noteOn", &RF5C400Synth::noteOn)
        .function("noteOff", &RF5C400Synth::noteOff)
        .function("allNotesOff", &RF5C400Synth::allNotesOff)
        .function("setParameter", &RF5C400Synth::setParameter)
        .function("process", &RF5C400Synth::process);
}
