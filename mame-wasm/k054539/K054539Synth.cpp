/**
 * K054539Synth.cpp - Konami 054539 PCM/ADPCM Sound Chip for WebAssembly
 * Based on MAME's K054539 emulator by Olivier Galibert
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The K054539 is an 8-channel PCM/ADPCM chip used in many Konami arcade games:
 * - Mystic Warriors
 * - Violent Storm
 * - Metamorphic Force
 * - Martial Champion
 * - Gaiapolis
 * - Run and Gun
 * - Lethal Enforcers II
 * - And many more...
 *
 * Features:
 * - 8 independent channels
 * - 8-bit PCM, 16-bit PCM, and 4-bit DPCM modes
 * - Per-channel volume and panning
 * - Hardware reverb with 32KB buffer
 * - Loop points
 * - Reverse playback
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

template<typename T>
inline T clamp_value(T val, T lo, T hi) {
    return (val < lo) ? lo : (val > hi) ? hi : val;
}

namespace devilbox {

// Constants from MAME
static constexpr double VOL_CAP = 1.80;
static constexpr int REVERB_SIZE = 0x8000;  // 32KB reverb buffer
static constexpr int MAX_ROM_SIZE = 0x1000000; // 16MB max ROM

// DPCM delta table from MAME
static const int16_t dpcm_table[16] = {
    0 * 0x100,   1 * 0x100,   2 * 0x100,   4 * 0x100,
    8 * 0x100,  16 * 0x100,  32 * 0x100,  64 * 0x100,
    0 * 0x100, -64 * 0x100, -32 * 0x100, -16 * 0x100,
   -8 * 0x100,  -4 * 0x100,  -2 * 0x100,  -1 * 0x100
};

// Sample type flags
static constexpr int TYPE_8BIT_PCM = 0x0;
static constexpr int TYPE_16BIT_PCM = 0x4;
static constexpr int TYPE_4BIT_DPCM = 0x8;

/**
 * K054539 Channel state
 */
struct K054539Channel {
    uint32_t pos;       // Current position
    uint32_t pfrac;     // Position fraction
    int32_t val;        // Current sample value
    int32_t pval;       // Previous sample value
    bool active;        // Channel playing

    // Cached register values
    int delta;          // Pitch delta
    int volume;         // Volume (0=max)
    int pan;            // Pan position
    int loop_start;     // Loop start address
    int start_addr;     // Start address
    int sample_type;    // 0=8bit, 4=16bit, 8=DPCM
    bool loop_enable;   // Loop enabled
    bool reverse;       // Reverse playback
    double gain;        // Channel gain multiplier
};

/**
 * K054539 Parameter IDs
 */
enum class K054539Param {
    MASTER_VOLUME = 0,
    REVERB_ENABLE = 1,
    CHANNEL_GAIN = 2,  // Use with channel * 10 + param

    PARAM_COUNT = 3
};

/**
 * K054539 PCM/ADPCM Sound Chip - Standalone implementation
 */
class K054539Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;
    static constexpr int NUM_CHANNELS = 8;

    K054539Synth()
        : m_sample_rate(48000)
        , m_isInitialized(false)
        , m_master_volume(1.0f)
        , m_reverb_enable(false)
        , m_reverb_pos(0)
        , m_rom_size(0)
    {
        std::memset(m_channels, 0, sizeof(m_channels));
        std::memset(m_rom, 0, sizeof(m_rom));
        std::memset(m_reverb_ram, 0, sizeof(m_reverb_ram));

        for (int i = 0; i < NUM_CHANNELS; i++) {
            m_channels[i].gain = 1.0;
        }
    }

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;

        // Build volume table (from MAME)
        // vol=0 -> no attenuation, vol=0x40 -> -36dB
        for (int i = 0; i < 256; i++) {
            m_voltab[i] = std::pow(10.0, (-36.0 * static_cast<double>(i) / 0x40) / 20.0) / 4.0;
        }

        // Build pan table (constant power panning)
        // pan[i]^2 + pan[0xe-i]^2 = 1
        for (int i = 0; i < 0xf; i++) {
            m_pantab[i] = std::sqrt(static_cast<double>(i)) / std::sqrt(static_cast<double>(0xe));
        }

        // Reset channels
        for (int i = 0; i < NUM_CHANNELS; i++) {
            m_channels[i].active = false;
            m_channels[i].pos = 0;
            m_channels[i].pfrac = 0;
            m_channels[i].val = 0;
            m_channels[i].pval = 0;
        }

        m_reverb_pos = 0;
        std::memset(m_reverb_ram, 0, sizeof(m_reverb_ram));

        m_isInitialized = true;
    }

    /**
     * Load sample ROM data
     */
    void loadROM(uint32_t offset, const uint8_t* data, uint32_t size) {
        if (offset + size > MAX_ROM_SIZE) {
            size = MAX_ROM_SIZE - offset;
        }
        std::memcpy(&m_rom[offset], data, size);
        if (offset + size > m_rom_size) {
            m_rom_size = offset + size;
        }
    }

    /**
     * Configure a channel for playback
     */
    void configureChannel(int ch, uint32_t startAddr, uint32_t loopAddr,
                         int sampleType, bool loopEnable, bool reverse) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;

        K054539Channel* chan = &m_channels[ch];
        chan->start_addr = startAddr;
        chan->loop_start = loopAddr;
        chan->sample_type = sampleType;
        chan->loop_enable = loopEnable;
        chan->reverse = reverse;
    }

    /**
     * Set channel pitch (delta value)
     * Higher values = higher pitch
     */
    void setChannelPitch(int ch, int delta) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;
        m_channels[ch].delta = delta;
    }

    /**
     * Set channel volume (0=max, 0x40=-36dB, higher=quieter)
     */
    void setChannelVolume(int ch, int volume) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;
        m_channels[ch].volume = clamp_value(volume, 0, 255);
    }

    /**
     * Set channel pan (0-14, 7=center)
     */
    void setChannelPan(int ch, int pan) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;
        m_channels[ch].pan = clamp_value(pan, 0, 14);
    }

    void noteOn(int note, int velocity) {
        if (!m_isInitialized || velocity == 0) return;

        // Find free channel
        for (int ch = 0; ch < NUM_CHANNELS; ch++) {
            if (!m_channels[ch].active) {
                K054539Channel* chan = &m_channels[ch];

                // Calculate pitch delta from MIDI note
                // Base pitch delta for middle C (note 60) at native sample rate
                double freq = 440.0 * std::pow(2.0, (note - 69) / 12.0);
                // Delta is 16.16 fixed point pitch increment
                chan->delta = static_cast<int>((freq / 440.0) * 0x10000);

                // Set volume from velocity
                chan->volume = 0x40 - static_cast<int>((velocity / 127.0) * 0x40);

                // Start playback
                chan->pos = chan->start_addr;
                chan->pfrac = 0;
                chan->val = 0;
                chan->pval = 0;
                chan->active = true;

                return;
            }
        }
    }

    void noteOff(int note) {
        if (!m_isInitialized) return;

        // Release oldest active channel
        for (int ch = 0; ch < NUM_CHANNELS; ch++) {
            if (m_channels[ch].active) {
                m_channels[ch].active = false;
                return;
            }
        }
    }

    void keyOn(int ch) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;

        K054539Channel* chan = &m_channels[ch];
        chan->pos = chan->start_addr;
        chan->pfrac = 0;
        chan->val = 0;
        chan->pval = 0;
        chan->active = true;
    }

    void keyOff(int ch) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;
        m_channels[ch].active = false;
    }

    void allNotesOff() {
        for (int ch = 0; ch < NUM_CHANNELS; ch++) {
            m_channels[ch].active = false;
        }
    }

    void setParameter(int paramId, float value) {
        auto param = static_cast<K054539Param>(paramId);
        switch (param) {
            case K054539Param::MASTER_VOLUME:
                m_master_volume = clamp_value(value, 0.0f, 2.0f);
                break;
            case K054539Param::REVERB_ENABLE:
                m_reverb_enable = (value > 0.5f);
                break;
            default:
                break;
        }
    }

    void setChannelGain(int ch, double gain) {
        if (ch >= 0 && ch < NUM_CHANNELS) {
            m_channels[ch].gain = clamp_value(gain, 0.0, 4.0);
        }
    }

    void process(float* outputL, float* outputR, int numSamples) {
        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        int16_t* rbase = reinterpret_cast<int16_t*>(m_reverb_ram);

        for (int sample = 0; sample < numSamples; sample++) {
            double lval = 0, rval = 0;

            // Add reverb from buffer
            if (m_reverb_enable) {
                lval = rval = rbase[m_reverb_pos];
                rbase[m_reverb_pos] = 0;
            }

            // Process all channels
            for (int ch = 0; ch < NUM_CHANNELS; ch++) {
                K054539Channel* chan = &m_channels[ch];

                if (!chan->active) continue;

                int delta = chan->delta;
                double cur_gain = chan->gain;

                // Calculate volumes
                double lvol = m_voltab[chan->volume] * m_pantab[chan->pan] * cur_gain;
                if (lvol > VOL_CAP) lvol = VOL_CAP;

                double rvol = m_voltab[chan->volume] * m_pantab[0xe - chan->pan] * cur_gain;
                if (rvol > VOL_CAP) rvol = VOL_CAP;

                int cur_pos = chan->pos;
                int cur_pfrac = chan->pfrac;
                int cur_val = chan->val;
                int cur_pval = chan->pval;

                int fdelta, pdelta;
                if (chan->reverse) {
                    delta = -delta;
                    fdelta = +0x10000;
                    pdelta = -1;
                } else {
                    fdelta = -0x10000;
                    pdelta = +1;
                }

                // Process based on sample type
                switch (chan->sample_type & 0xc) {
                    case TYPE_8BIT_PCM: {
                        cur_pfrac += delta;
                        while (cur_pfrac & ~0xffff) {
                            cur_pfrac += fdelta;
                            cur_pos += pdelta;

                            cur_pval = cur_val;
                            cur_val = static_cast<int16_t>(readROM(cur_pos) << 8);

                            // Check for end marker
                            if (cur_val == static_cast<int16_t>(0x8000)) {
                                if (chan->loop_enable) {
                                    cur_pos = chan->loop_start;
                                    cur_val = static_cast<int16_t>(readROM(cur_pos) << 8);
                                }
                                if (cur_val == static_cast<int16_t>(0x8000)) {
                                    chan->active = false;
                                    cur_val = 0;
                                    break;
                                }
                            }
                        }
                        break;
                    }

                    case TYPE_16BIT_PCM: {
                        pdelta <<= 1;

                        cur_pfrac += delta;
                        while (cur_pfrac & ~0xffff) {
                            cur_pfrac += fdelta;
                            cur_pos += pdelta;

                            cur_pval = cur_val;
                            cur_val = static_cast<int16_t>(readROM(cur_pos) | (readROM(cur_pos + 1) << 8));

                            if (cur_val == static_cast<int16_t>(0x8000)) {
                                if (chan->loop_enable) {
                                    cur_pos = chan->loop_start;
                                    cur_val = static_cast<int16_t>(readROM(cur_pos) | (readROM(cur_pos + 1) << 8));
                                }
                                if (cur_val == static_cast<int16_t>(0x8000)) {
                                    chan->active = false;
                                    cur_val = 0;
                                    break;
                                }
                            }
                        }
                        break;
                    }

                    case TYPE_4BIT_DPCM: {
                        // DPCM uses nibbles
                        cur_pos <<= 1;
                        cur_pfrac <<= 1;
                        if (cur_pfrac & 0x10000) {
                            cur_pfrac &= 0xffff;
                            cur_pos |= 1;
                        }

                        cur_pfrac += delta;
                        while (cur_pfrac & ~0xffff) {
                            cur_pfrac += fdelta;
                            cur_pos += pdelta;

                            cur_pval = cur_val;
                            int byte_val = readROM(cur_pos >> 1);

                            // Check for end marker
                            if (byte_val == 0x88) {
                                if (chan->loop_enable) {
                                    cur_pos = chan->loop_start << 1;
                                    byte_val = readROM(cur_pos >> 1);
                                }
                                if (byte_val == 0x88) {
                                    chan->active = false;
                                    cur_val = 0;
                                    break;
                                }
                            }

                            // Extract nibble
                            if (cur_pos & 1) {
                                byte_val >>= 4;
                            } else {
                                byte_val &= 15;
                            }

                            // Apply DPCM delta
                            cur_val = cur_pval + dpcm_table[byte_val];
                            cur_val = clamp_value(cur_val, -32768, 32767);
                        }

                        // Convert back from nibble addressing
                        cur_pfrac >>= 1;
                        if (cur_pos & 1) {
                            cur_pfrac |= 0x8000;
                        }
                        cur_pos >>= 1;
                        break;
                    }
                }

                // Mix into output
                lval += cur_val * lvol;
                rval += cur_val * rvol;

                // Update channel state
                chan->pos = cur_pos;
                chan->pfrac = cur_pfrac;
                chan->val = cur_val;
                chan->pval = cur_pval;
            }

            // Advance reverb position
            m_reverb_pos = (m_reverb_pos + 1) & 0x1fff;

            // Output with master volume
            outputL[sample] = clamp_value(static_cast<float>(lval * m_master_volume / 32768.0), -1.0f, 1.0f);
            outputR[sample] = clamp_value(static_cast<float>(rval * m_master_volume / 32768.0), -1.0f, 1.0f);
        }
    }

    bool isInitialized() const { return m_isInitialized; }

private:
    int m_sample_rate;
    bool m_isInitialized;
    float m_master_volume;
    bool m_reverb_enable;
    int m_reverb_pos;

    K054539Channel m_channels[NUM_CHANNELS];

    // Volume and pan tables
    double m_voltab[256];
    double m_pantab[0xf];

    // Sample ROM (up to 16MB)
    uint8_t m_rom[MAX_ROM_SIZE];
    uint32_t m_rom_size;

    // Reverb RAM (32KB)
    uint8_t m_reverb_ram[REVERB_SIZE];

    uint8_t readROM(uint32_t addr) const {
        if (addr < m_rom_size) {
            return m_rom[addr];
        }
        return 0;
    }
};

} // namespace devilbox

// ============================================================================
// Emscripten Bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(k054539_synth) {
    emscripten::class_<K054539Synth>("K054539Synth")
        .constructor<>()
        .function("initialize", &K054539Synth::initialize)
        .function("loadROM", &K054539Synth::loadROM, emscripten::allow_raw_pointers())
        .function("configureChannel", &K054539Synth::configureChannel)
        .function("setChannelPitch", &K054539Synth::setChannelPitch)
        .function("setChannelVolume", &K054539Synth::setChannelVolume)
        .function("setChannelPan", &K054539Synth::setChannelPan)
        .function("setChannelGain", &K054539Synth::setChannelGain)
        .function("keyOn", &K054539Synth::keyOn)
        .function("keyOff", &K054539Synth::keyOff)
        .function("noteOn", &K054539Synth::noteOn)
        .function("noteOff", &K054539Synth::noteOff)
        .function("allNotesOff", &K054539Synth::allNotesOff)
        .function("setParameter", &K054539Synth::setParameter)
        .function("process", &K054539Synth::process, emscripten::allow_raw_pointers())
        .function("isInitialized", &K054539Synth::isInitialized);
}

#endif
