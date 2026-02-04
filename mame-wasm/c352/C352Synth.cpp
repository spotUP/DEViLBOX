/**
 * C352Synth.cpp - Namco C352 PCM Sound Chip for WebAssembly
 * Based on MAME's C352 emulator by R. Belmont and superctr
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The C352 is a 32-voice PCM chip used in many Namco arcade games:
 * - Ridge Racer series
 * - Tekken series
 * - Time Crisis series
 * - Soul Calibur
 * - Ace Combat
 * - And many more System 11/12/22/23 games
 *
 * Features:
 * - 32 independent voices
 * - 8-bit linear PCM and 8-bit mu-law encoding
 * - 4-channel output (Front L/R, Rear L/R)
 * - Per-voice volume with ramping
 * - Phase inversion per channel
 * - Noise generator (LFSR)
 * - Bidirectional looping
 * - Sample interpolation
 *
 * License: BSD-3-Clause (MAME license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

template<typename T>
inline T clamp_value(T val, T lo, T hi) {
    return (val < lo) ? lo : (val > hi) ? hi : val;
}

namespace devilbox {

// Voice flags from MAME
static constexpr uint16_t C352_FLG_BUSY     = 0x8000;  // Channel is busy
static constexpr uint16_t C352_FLG_KEYON    = 0x4000;  // Key on
static constexpr uint16_t C352_FLG_KEYOFF   = 0x2000;  // Key off
static constexpr uint16_t C352_FLG_LOOPTRG  = 0x1000;  // Loop trigger
static constexpr uint16_t C352_FLG_LOOPHIST = 0x0800;  // Loop history
static constexpr uint16_t C352_FLG_FM       = 0x0400;  // Frequency modulation
static constexpr uint16_t C352_FLG_PHASERL  = 0x0200;  // Rear left phase invert
static constexpr uint16_t C352_FLG_PHASEFL  = 0x0100;  // Front left phase invert
static constexpr uint16_t C352_FLG_PHASEFR  = 0x0080;  // Front/rear right phase invert
static constexpr uint16_t C352_FLG_LDIR     = 0x0040;  // Loop direction
static constexpr uint16_t C352_FLG_LINK     = 0x0020;  // Long format sample
static constexpr uint16_t C352_FLG_NOISE    = 0x0010;  // Play noise
static constexpr uint16_t C352_FLG_MULAW    = 0x0008;  // Mu-law encoding
static constexpr uint16_t C352_FLG_FILTER   = 0x0004;  // Disable filter/interpolation
static constexpr uint16_t C352_FLG_REVLOOP  = 0x0003;  // Loop backwards
static constexpr uint16_t C352_FLG_LOOP     = 0x0002;  // Loop forward
static constexpr uint16_t C352_FLG_REVERSE  = 0x0001;  // Play backwards

static constexpr int MAX_ROM_SIZE = 0x1000000;  // 16MB max ROM

/**
 * C352 Voice structure
 */
struct C352Voice {
    uint32_t pos;           // Current position (bank << 16 | offset)
    uint32_t counter;       // Phase counter

    int16_t sample;         // Current sample
    int16_t last_sample;    // Previous sample (for interpolation)

    uint16_t vol_f;         // Front volume (L << 8 | R)
    uint16_t vol_r;         // Rear volume (L << 8 | R)
    uint8_t curr_vol[4];    // Current ramped volumes [FL, FR, RL, RR]

    uint16_t freq;          // Frequency/pitch
    uint16_t flags;         // Control flags

    uint16_t wave_bank;     // Sample bank
    uint16_t wave_start;    // Sample start offset
    uint16_t wave_end;      // Sample end offset
    uint16_t wave_loop;     // Loop point offset
};

/**
 * C352 Parameter IDs
 */
enum class C352Param {
    MASTER_VOLUME = 0,

    PARAM_COUNT = 1
};

/**
 * C352 PCM Sound Chip - Standalone implementation
 */
class C352Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;
    static constexpr int NUM_VOICES = 32;

    C352Synth()
        : m_sample_rate(48000)
        , m_isInitialized(false)
        , m_master_volume(1.0f)
        , m_random(0x1234)
        , m_rom_size(0)
    {
        std::memset(m_voices, 0, sizeof(m_voices));
        std::memset(m_rom, 0, sizeof(m_rom));
    }

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;

        // Generate mu-law table (from MAME)
        int j = 0;
        for (int i = 0; i < 128; i++) {
            m_mulawtab[i] = j << 5;
            if (i < 16)
                j += 1;
            else if (i < 24)
                j += 2;
            else if (i < 48)
                j += 4;
            else if (i < 100)
                j += 8;
            else
                j += 16;
        }
        for (int i = 0; i < 128; i++) {
            m_mulawtab[i + 128] = (~m_mulawtab[i]) & 0xffe0;
        }

        // Reset all voices
        std::memset(m_voices, 0, sizeof(m_voices));
        m_random = 0x1234;

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
     * Configure a voice for sample playback
     */
    void configureVoice(int voice, uint16_t bank, uint16_t start, uint16_t end,
                       uint16_t loop, uint16_t freq, uint16_t flags) {
        if (voice < 0 || voice >= NUM_VOICES) return;

        C352Voice* v = &m_voices[voice];
        v->wave_bank = bank;
        v->wave_start = start;
        v->wave_end = end;
        v->wave_loop = loop;
        v->freq = freq;
        v->flags = flags;
    }

    /**
     * Set voice volumes
     * @param vol_f Front volume (left << 8 | right)
     * @param vol_r Rear volume (left << 8 | right)
     */
    void setVoiceVolume(int voice, uint16_t vol_f, uint16_t vol_r) {
        if (voice < 0 || voice >= NUM_VOICES) return;
        m_voices[voice].vol_f = vol_f;
        m_voices[voice].vol_r = vol_r;
    }

    /**
     * Key on a voice
     */
    void keyOn(int voice) {
        if (voice < 0 || voice >= NUM_VOICES) return;

        C352Voice* v = &m_voices[voice];

        v->pos = (v->wave_bank << 16) | v->wave_start;
        v->sample = 0;
        v->last_sample = 0;
        v->counter = 0xffff;

        v->flags |= C352_FLG_BUSY;
        v->flags &= ~(C352_FLG_KEYON | C352_FLG_LOOPHIST);

        // Reset volume ramps
        v->curr_vol[0] = v->curr_vol[1] = 0;
        v->curr_vol[2] = v->curr_vol[3] = 0;
    }

    /**
     * Key off a voice
     */
    void keyOff(int voice) {
        if (voice < 0 || voice >= NUM_VOICES) return;

        m_voices[voice].flags &= ~(C352_FLG_BUSY | C352_FLG_KEYOFF);
        m_voices[voice].counter = 0xffff;
    }

    void noteOn(int note, int velocity) {
        if (!m_isInitialized || velocity == 0) return;

        // Find free voice
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!(m_voices[i].flags & C352_FLG_BUSY)) {
                C352Voice* v = &m_voices[i];

                // Calculate frequency from MIDI note
                // Base frequency for middle C at native pitch
                double freq_ratio = std::pow(2.0, (note - 60) / 12.0);
                v->freq = static_cast<uint16_t>(0x1000 * freq_ratio);

                // Set volume from velocity
                uint8_t vol = static_cast<uint8_t>((velocity / 127.0f) * 255);
                v->vol_f = (vol << 8) | vol;  // L/R equal
                v->vol_r = (vol << 8) | vol;

                keyOn(i);
                return;
            }
        }
    }

    void noteOff(int note) {
        if (!m_isInitialized) return;

        // Release first active voice
        for (int i = 0; i < NUM_VOICES; i++) {
            if (m_voices[i].flags & C352_FLG_BUSY) {
                keyOff(i);
                return;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            m_voices[i].flags &= ~C352_FLG_BUSY;
        }
    }

    void setParameter(int paramId, float value) {
        auto param = static_cast<C352Param>(paramId);
        switch (param) {
            case C352Param::MASTER_VOLUME:
                m_master_volume = clamp_value(value, 0.0f, 2.0f);
                break;
            default:
                break;
        }
    }

    void process(float* outputL, float* outputR, int numSamples) {
        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        for (int i = 0; i < numSamples; i++) {
            int32_t out[4] = { 0, 0, 0, 0 };

            // Process all 32 voices
            for (int j = 0; j < NUM_VOICES; j++) {
                C352Voice& v = m_voices[j];
                int16_t s = 0;

                if (v.flags & C352_FLG_BUSY) {
                    int32_t next_counter = v.counter + v.freq;

                    // Fetch new sample when counter overflows
                    if (next_counter & 0x10000) {
                        fetchSample(v);
                    }

                    // Ramp volumes at specific intervals
                    if ((next_counter ^ v.counter) & 0x18000) {
                        rampVolume(v, 0, v.vol_f >> 8);
                        rampVolume(v, 1, v.vol_f & 0xff);
                        rampVolume(v, 2, v.vol_r >> 8);
                        rampVolume(v, 3, v.vol_r & 0xff);
                    }

                    v.counter = next_counter & 0xffff;
                    s = v.sample;

                    // Interpolate samples (if filter not disabled)
                    if ((v.flags & C352_FLG_FILTER) == 0) {
                        s = v.last_sample + ((v.counter * (v.sample - v.last_sample)) >> 16);
                    }
                }

                // Mix with phase inversion
                // Front Left
                out[0] += (((v.flags & C352_FLG_PHASEFL) ? -s : s) * v.curr_vol[0]) >> 8;
                // Front Right
                out[1] += (((v.flags & C352_FLG_PHASEFR) ? -s : s) * v.curr_vol[1]) >> 8;
                // Rear Left
                out[2] += (((v.flags & C352_FLG_PHASERL) ? -s : s) * v.curr_vol[2]) >> 8;
                // Rear Right
                out[3] += (((v.flags & C352_FLG_PHASEFR) ? -s : s) * v.curr_vol[3]) >> 8;
            }

            // Output as stereo (mix front and rear)
            // Scale down by 3 (MAME uses >> 3) and normalize
            float scale = m_master_volume / 32768.0f / 8.0f;
            outputL[i] = clamp_value((out[0] + out[2]) * scale, -1.0f, 1.0f);
            outputR[i] = clamp_value((out[1] + out[3]) * scale, -1.0f, 1.0f);
        }
    }

    bool isInitialized() const { return m_isInitialized; }

private:
    int m_sample_rate;
    bool m_isInitialized;
    float m_master_volume;

    C352Voice m_voices[NUM_VOICES];

    // Mu-law decoding table
    int16_t m_mulawtab[256];

    // Noise generator state
    uint16_t m_random;

    // Sample ROM
    uint8_t m_rom[MAX_ROM_SIZE];
    uint32_t m_rom_size;

    uint8_t readROM(uint32_t addr) const {
        if (addr < m_rom_size) {
            return m_rom[addr];
        }
        return 0;
    }

    void fetchSample(C352Voice& v) {
        v.last_sample = v.sample;

        if (v.flags & C352_FLG_NOISE) {
            // LFSR noise generator
            m_random = (m_random >> 1) ^ ((-(m_random & 1)) & 0xfff6);
            v.sample = m_random;
        } else {
            // Read sample from ROM
            int8_t s = static_cast<int8_t>(readROM(v.pos));

            if (v.flags & C352_FLG_MULAW) {
                v.sample = m_mulawtab[s & 0xff];
            } else {
                v.sample = s << 8;
            }

            uint16_t pos = v.pos & 0xffff;

            // Handle looping
            if ((v.flags & C352_FLG_LOOP) && (v.flags & C352_FLG_REVERSE)) {
                // Bidirectional loop
                if ((v.flags & C352_FLG_LDIR) && pos == v.wave_loop) {
                    v.flags &= ~C352_FLG_LDIR;
                } else if (!(v.flags & C352_FLG_LDIR) && pos == v.wave_end) {
                    v.flags |= C352_FLG_LDIR;
                }
                v.pos += (v.flags & C352_FLG_LDIR) ? -1 : 1;
            } else if (pos == v.wave_end) {
                // End of sample
                if ((v.flags & C352_FLG_LINK) && (v.flags & C352_FLG_LOOP)) {
                    v.pos = (v.wave_start << 16) | v.wave_loop;
                    v.flags |= C352_FLG_LOOPHIST;
                } else if (v.flags & C352_FLG_LOOP) {
                    v.pos = (v.pos & 0xff0000) | v.wave_loop;
                    v.flags |= C352_FLG_LOOPHIST;
                } else {
                    v.flags |= C352_FLG_KEYOFF;
                    v.flags &= ~C352_FLG_BUSY;
                    v.sample = 0;
                }
            } else {
                v.pos += (v.flags & C352_FLG_REVERSE) ? -1 : 1;
            }
        }
    }

    void rampVolume(C352Voice& v, int ch, uint8_t target) {
        int16_t delta = v.curr_vol[ch] - target;
        if (delta != 0) {
            v.curr_vol[ch] += (delta > 0) ? -1 : 1;
        }
    }
};

} // namespace devilbox

// ============================================================================
// Emscripten Bindings
// ============================================================================

#ifdef __EMSCRIPTEN__

using namespace devilbox;

EMSCRIPTEN_BINDINGS(c352_synth) {
    emscripten::class_<C352Synth>("C352Synth")
        .constructor<>()
        .function("initialize", &C352Synth::initialize)
        .function("loadROM", &C352Synth::loadROM, emscripten::allow_raw_pointers())
        .function("configureVoice", &C352Synth::configureVoice)
        .function("setVoiceVolume", &C352Synth::setVoiceVolume)
        .function("keyOn", &C352Synth::keyOn)
        .function("keyOff", &C352Synth::keyOff)
        .function("noteOn", &C352Synth::noteOn)
        .function("noteOff", &C352Synth::noteOff)
        .function("allNotesOff", &C352Synth::allNotesOff)
        .function("setParameter", &C352Synth::setParameter)
        .function("process", &C352Synth::process, emscripten::allow_raw_pointers())
        .function("isInitialized", &C352Synth::isInitialized);
}

#endif
