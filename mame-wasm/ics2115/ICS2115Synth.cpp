/**
 * ICS2115 WaveFront Synthesizer - Standalone WASM Implementation
 * Based on MAME's ics2115 by Alex Marshall, nimitz, austere
 *
 * 32-voice wavetable synthesizer used in:
 * - Raiden II / DX, Raiden Fighters series
 * - Pretty much all Seibu Kaihatsu arcade games (1993+)
 * - Various arcade boards
 *
 * Features:
 * - 32 independent voices
 * - 16-bit, 8-bit, and u-law compressed sample formats
 * - Volume envelope with attack/decay/release
 * - Oscillator envelope with loop control
 * - Per-voice panning with log2 pan law
 * - Bidirectional looping
 * - Linear sample interpolation
 * - Slow attack ramp for click reduction
 */

#include <emscripten/bind.h>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>

class ICS2115Synth {
public:
    static constexpr int NUM_VOICES = 32;
    static constexpr int VOLUME_BITS = 15;
    static constexpr int PAN_LEVEL = 16;
    static constexpr int RAMP_MAX = 0x40;
    static constexpr int RAMP_SHIFT = 6;

    // ROM size (16MB max)
    static constexpr int ROM_SIZE = 16 * 1024 * 1024;

    struct Oscillator {
        int32_t left;
        uint32_t acc;       // Position accumulator (20.12 fixed point)
        uint32_t start;     // Loop start
        uint32_t end;       // Loop end
        uint16_t fc;        // Frequency control
        uint8_t ctl;        // Control register
        uint8_t saddr;      // Sample bank address (27:20)
    };

    struct VolumeEnv {
        int32_t left;
        uint32_t add;
        uint32_t start;
        uint32_t end;
        uint32_t acc;       // Volume accumulator
        uint16_t regacc;    // Register copy
        uint8_t incr;       // Increment value
        uint8_t pan;        // Pan position (0-255)
        uint8_t mode;
    };

    struct OscConfig {
        uint8_t ulaw       : 1;   // u-law compressed
        uint8_t stop       : 1;   // Stop oscillator
        uint8_t eightbit   : 1;   // 8-bit samples
        uint8_t loop       : 1;   // Loop enable
        uint8_t loop_bidir : 1;   // Bidirectional loop
        uint8_t irq        : 1;   // IRQ enable
        uint8_t invert     : 1;   // Direction invert
        uint8_t irq_pending: 1;   // IRQ pending
    };

    struct VolCtrl {
        uint8_t done       : 1;   // Ramp done
        uint8_t stop       : 1;   // Stop ramp
        uint8_t rollover   : 1;   // Rollover
        uint8_t loop       : 1;   // Loop enable
        uint8_t loop_bidir : 1;   // Bidirectional loop
        uint8_t irq        : 1;   // IRQ enable
        uint8_t invert     : 1;   // Direction invert
        uint8_t irq_pending: 1;   // IRQ pending
    };

    struct Voice {
        Oscillator osc;
        VolumeEnv vol;

        union {
            OscConfig bitflags;
            uint8_t value;
        } osc_conf;

        union {
            VolCtrl bitflags;
            uint8_t value;
        } vol_ctrl;

        struct {
            bool on;
            int ramp;       // 0 to RAMP_MAX
        } state;

        bool playing() const {
            return state.on && !osc_conf.bitflags.stop;
        }
    };

private:
    Voice m_voice[NUM_VOICES];
    uint8_t* m_rom;
    int16_t m_ulaw[256];
    uint16_t m_volume[4096];
    uint16_t m_panlaw[256];

    float m_sampleRate;
    uint8_t m_activeOsc;
    float m_masterVolume;
    bool m_initialized;

    // Count leading zeros (portable implementation)
    static int clz32(uint32_t x) {
        if (x == 0) return 32;
        int n = 0;
        if ((x & 0xFFFF0000) == 0) { n += 16; x <<= 16; }
        if ((x & 0xFF000000) == 0) { n += 8;  x <<= 8;  }
        if ((x & 0xF0000000) == 0) { n += 4;  x <<= 4;  }
        if ((x & 0xC0000000) == 0) { n += 2;  x <<= 2;  }
        if ((x & 0x80000000) == 0) { n += 1; }
        return n;
    }

    void buildTables() {
        // Volume table from patent 5809466
        // See section V, starting page 195, subsection F (column 124, page 198)
        for (int i = 0; i < 4096; i++) {
            m_volume[i] = ((0x100 | (i & 0xff)) << (VOLUME_BITS - 9)) >> (15 - (i >> 8));
        }

        // U-law table per MIL-STD-188-113
        uint16_t lut[8];
        const uint16_t lut_initial = 33 << 2;  // Shift up 2 bits for 16-bit range
        for (int i = 0; i < 8; i++) {
            lut[i] = (lut_initial << i) - lut_initial;
        }

        for (int i = 0; i < 256; i++) {
            uint8_t exponent = (~i >> 4) & 0x07;
            uint8_t mantissa = ~i & 0x0f;
            int16_t value = lut[exponent] + (mantissa << (exponent + 3));
            m_ulaw[i] = (i & 0x80) ? -value : value;

            // Pan law using log2
            m_panlaw[i] = PAN_LEVEL - (31 - clz32(i));
        }
        m_panlaw[0] = 0xfff;  // All bits to one when no pan
    }

    uint8_t readSample(Voice& voice, uint32_t addr) const {
        uint32_t fullAddr = ((voice.osc.saddr << 20) | (addr & 0xfffff)) % ROM_SIZE;
        return m_rom[fullAddr];
    }

    int32_t getSample(Voice& voice) {
        const uint32_t curaddr = voice.osc.acc >> 12;
        uint32_t nextaddr;

        // Handle loop wrap for interpolation
        if (voice.state.on && voice.osc_conf.bitflags.loop &&
            !voice.osc_conf.bitflags.loop_bidir &&
            (voice.osc.left < (voice.osc.fc << 2))) {
            nextaddr = voice.osc.start >> 12;
        } else {
            nextaddr = curaddr + 2;
        }

        int16_t sample1, sample2;

        if (voice.osc_conf.bitflags.ulaw) {
            // U-law compressed samples
            sample1 = m_ulaw[readSample(voice, curaddr)];
            sample2 = m_ulaw[readSample(voice, curaddr + 1)];
        } else if (voice.osc_conf.bitflags.eightbit) {
            // 8-bit signed samples
            sample1 = ((int8_t)readSample(voice, curaddr)) << 8;
            sample2 = ((int8_t)readSample(voice, curaddr + 1)) << 8;
        } else {
            // 16-bit samples (little-endian)
            sample1 = readSample(voice, curaddr + 0) |
                      (((int8_t)readSample(voice, curaddr + 1)) << 8);
            sample2 = readSample(voice, nextaddr + 0) |
                      (((int8_t)readSample(voice, nextaddr + 1)) << 8);
        }

        // Linear interpolation as per US patent 6,246,774 B1
        const int32_t diff = sample2 - sample1;
        const uint16_t fract = (voice.osc.acc >> 3) & 0x1ff;
        const int32_t sample = (((int32_t)sample1 << 9) + diff * fract) >> 9;

        return sample;
    }

    void updateRamp(Voice& voice) {
        if (voice.state.on && !voice.osc_conf.bitflags.stop) {
            // Slow attack
            if (voice.state.ramp < RAMP_MAX) {
                voice.state.ramp++;
            }
        } else {
            // Slow release
            if (voice.state.ramp > 0) {
                voice.state.ramp--;
            }
        }
    }

    void updateOscillator(Voice& voice) {
        if (voice.osc_conf.bitflags.stop) return;

        if (voice.osc_conf.bitflags.invert) {
            voice.osc.acc -= voice.osc.fc << 2;
            voice.osc.left = voice.osc.acc - voice.osc.start;
        } else {
            voice.osc.acc += voice.osc.fc << 2;
            voice.osc.left = voice.osc.end - voice.osc.acc;
        }

        if (voice.osc.left > 0) return;

        if (voice.osc_conf.bitflags.loop) {
            if (voice.osc_conf.bitflags.loop_bidir) {
                voice.osc_conf.bitflags.invert = !voice.osc_conf.bitflags.invert;
            }

            if (voice.osc_conf.bitflags.invert) {
                voice.osc.acc = voice.osc.end + voice.osc.left;
                voice.osc.left = voice.osc.acc - voice.osc.start;
            } else {
                voice.osc.acc = voice.osc.start - voice.osc.left;
                voice.osc.left = voice.osc.end - voice.osc.acc;
            }
        } else {
            voice.state.on = false;
            voice.osc_conf.bitflags.stop = true;
            if (!voice.osc_conf.bitflags.invert) {
                voice.osc.acc = voice.osc.end;
            } else {
                voice.osc.acc = voice.osc.start;
            }
        }
    }

    void updateVolumeEnvelope(Voice& voice) {
        if (voice.vol_ctrl.bitflags.done || voice.vol_ctrl.bitflags.stop) return;

        if (voice.vol_ctrl.bitflags.invert) {
            voice.vol.acc -= voice.vol.add;
            voice.vol.left = voice.vol.acc - voice.vol.start;
        } else {
            voice.vol.acc += voice.vol.add;
            voice.vol.left = voice.vol.end - voice.vol.acc;
        }

        if (voice.vol.left > 0) return;

        if (voice.osc_conf.bitflags.eightbit) return;

        if (voice.vol_ctrl.bitflags.loop) {
            if (!voice.vol_ctrl.bitflags.loop_bidir) {
                if (!voice.vol_ctrl.bitflags.invert) {
                    voice.vol.acc = voice.vol.start - (voice.vol.end - (voice.vol.acc + voice.vol.incr));
                } else {
                    voice.vol.acc = voice.vol.end + ((voice.vol.acc - voice.vol.incr) - voice.vol.start);
                }
            } else {
                if (!voice.vol_ctrl.bitflags.invert) {
                    voice.vol.acc = voice.vol.end + (voice.vol.end - (voice.vol.acc + voice.vol.incr));
                } else {
                    voice.vol.acc = voice.vol.start - ((voice.vol.acc - voice.vol.incr) - voice.vol.start);
                }
            }
        } else {
            voice.vol_ctrl.bitflags.done = true;
        }
    }

public:
    ICS2115Synth() : m_rom(nullptr), m_sampleRate(44100.0f),
                     m_activeOsc(31), m_masterVolume(1.0f), m_initialized(false) {
    }

    ~ICS2115Synth() {
        if (m_rom) {
            delete[] m_rom;
            m_rom = nullptr;
        }
    }

    void initialize(float sampleRate) {
        m_sampleRate = sampleRate;
        m_initialized = true;

        // Allocate ROM
        if (!m_rom) {
            m_rom = new uint8_t[ROM_SIZE];
            std::memset(m_rom, 0, ROM_SIZE);
        }

        // Build lookup tables
        buildTables();

        // Reset all voices
        reset();
    }

    void reset() {
        m_activeOsc = 31;

        for (int i = 0; i < NUM_VOICES; i++) {
            Voice& v = m_voice[i];
            std::memset(&v, 0, sizeof(Voice));

            v.osc_conf.value = 2;  // Stop bit set
            v.vol_ctrl.value = 1;  // Done bit set
            v.vol.pan = 0x7f;      // Center pan
            v.state.on = false;
            v.state.ramp = 0;
        }
    }

    void loadROM(uint32_t offset, uintptr_t dataPtr, uint32_t size) {
        if (!m_rom) return;

        const uint8_t* data = reinterpret_cast<const uint8_t*>(dataPtr);
        uint32_t copySize = std::min(size, (uint32_t)(ROM_SIZE - offset));
        std::memcpy(m_rom + offset, data, copySize);
    }

    // MIDI-style note on
    void noteOn(int note, int velocity) {
        if (!m_initialized || velocity == 0) {
            noteOff(note);
            return;
        }

        // Find a free voice
        int voiceIdx = -1;
        for (int i = 0; i <= m_activeOsc; i++) {
            if (!m_voice[i].playing()) {
                voiceIdx = i;
                break;
            }
        }

        if (voiceIdx < 0) {
            // Steal oldest voice
            voiceIdx = 0;
        }

        Voice& v = m_voice[voiceIdx];

        // Calculate frequency control from MIDI note
        // Base: middle C (note 60) = 261.63 Hz
        // FC = freq * 1024 / sample_rate_per_voice
        // where sample_rate_per_voice = base_clock / ((active_osc + 1) * 32)
        // For standalone: assume 33.8688 MHz clock, 32 voices
        // sample_rate ≈ 33075 Hz per voice
        float freq = 440.0f * std::pow(2.0f, (note - 69) / 12.0f);
        float effectiveSampleRate = 33075.0f;  // Typical ICS2115 rate
        v.osc.fc = (uint16_t)(freq * 1024.0f / effectiveSampleRate);

        // Set default sample start/end (whole ROM bank)
        v.osc.start = 0;
        v.osc.end = 0x100000 << 12;  // 1MB worth
        v.osc.acc = 0;
        v.osc.saddr = 0;

        // Volume based on velocity
        uint16_t vol = (velocity * 0xff / 127) << 8;
        v.vol.acc = vol << 10;
        v.vol.start = 0;
        v.vol.end = 0xff << (10 + 8);
        v.vol.incr = 0;

        // Clear config
        v.osc_conf.value = 0;
        v.osc_conf.bitflags.loop = true;

        v.vol_ctrl.value = 0;

        // Key on
        v.state.on = true;
        v.state.ramp = RAMP_MAX;  // Start at max for immediate response
    }

    void noteOff(int note) {
        // Find voice playing this note (simplified - just release all)
        for (int i = 0; i <= m_activeOsc; i++) {
            if (m_voice[i].state.on) {
                m_voice[i].osc_conf.bitflags.stop = true;
                m_voice[i].vol_ctrl.bitflags.stop = true;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            m_voice[i].state.on = false;
            m_voice[i].osc_conf.bitflags.stop = true;
            m_voice[i].vol_ctrl.bitflags.stop = true;
        }
    }

    // Register access (for authentic hardware control)
    void writeRegister(int voiceIdx, int reg, uint16_t data) {
        if (voiceIdx >= NUM_VOICES) return;

        Voice& v = m_voice[voiceIdx];

        switch (reg) {
            case 0x00: // Oscillator Configuration
                v.osc_conf.value = (v.osc_conf.value & 0x80) | ((data >> 8) & 0x7f);
                break;

            case 0x01: // Frequency
                v.osc.fc = data & 0xfffe;
                break;

            case 0x02: // Loop start high
                v.osc.start = (v.osc.start & 0x00ffffff) | ((data & 0xff00) << 16);
                v.osc.start = (v.osc.start & 0xff00ffff) | ((data & 0x00ff) << 16);
                break;

            case 0x03: // Loop start low
                v.osc.start = (v.osc.start & 0xffff00ff) | (data & 0xff00);
                break;

            case 0x04: // Loop end high
                v.osc.end = (v.osc.end & 0x00ffffff) | ((data & 0xff00) << 16);
                v.osc.end = (v.osc.end & 0xff00ffff) | ((data & 0x00ff) << 16);
                break;

            case 0x05: // Loop end low
                v.osc.end = (v.osc.end & 0xffff00ff) | (data & 0xff00);
                break;

            case 0x06: // Volume increment
                v.vol.incr = (data >> 8) & 0xff;
                break;

            case 0x07: // Volume start
                v.vol.start = (data & 0xff) << (10 + 8);
                break;

            case 0x08: // Volume end
                v.vol.end = (data & 0xff) << (10 + 8);
                break;

            case 0x09: // Volume accumulator
                v.vol.regacc = data;
                v.vol.acc = data << 10;
                break;

            case 0x0a: // Address high
                v.osc.acc = (v.osc.acc & 0x00ffffff) | ((data & 0xff00) << 16);
                v.osc.acc = (v.osc.acc & 0xff00ffff) | ((data & 0x00ff) << 16);
                break;

            case 0x0b: // Address low
                v.osc.acc = (v.osc.acc & 0xffff00ff) | (data & 0xff00);
                v.osc.acc = (v.osc.acc & 0xffffff00) | (data & 0x00f8);
                break;

            case 0x0c: // Pan
                v.vol.pan = (data >> 8) & 0xff;
                break;

            case 0x0d: // Volume envelope control
                v.vol_ctrl.value = (v.vol_ctrl.value & 0x80) | ((data >> 8) & 0x7f);
                break;

            case 0x10: // Oscillator control (key on/off)
                v.osc.ctl = data >> 8;
                v.state.on = (v.osc.ctl == 0);
                if (v.osc.ctl == 0) {
                    v.state.ramp = RAMP_MAX;
                } else if (v.osc.ctl == 0x0f) {
                    v.osc_conf.bitflags.stop = true;
                    v.vol_ctrl.bitflags.stop = true;
                }
                break;

            case 0x11: // Sample address bank
                v.osc.saddr = data >> 8;
                break;
        }
    }

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case 0: // Master volume
                m_masterVolume = std::max(0.0f, std::min(1.0f, value));
                break;
            case 1: // Active oscillators
                m_activeOsc = std::max(0, std::min(31, (int)value));
                break;
        }
    }

    void process(uintptr_t outputL, uintptr_t outputR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputL);
        float* outR = reinterpret_cast<float*>(outputR);

        if (!m_initialized) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        // Clear output buffers
        std::memset(outL, 0, numSamples * sizeof(float));
        std::memset(outR, 0, numSamples * sizeof(float));

        // Process each voice
        for (int osc = 0; osc <= m_activeOsc; osc++) {
            Voice& voice = m_voice[osc];

            // Calculate volume add from increment
            const uint16_t fine = 1 << (3 * (voice.vol.incr >> 6));
            voice.vol.add = (voice.vol.incr & 0x3f) << (10 - fine);

            for (int i = 0; i < numSamples; i++) {
                // Skip if voice not active and ramp is zero
                if (!voice.playing() && voice.state.ramp == 0) {
                    continue;
                }

                // Get volume with pan law
                const uint32_t volacc = (voice.vol.acc >> 14) & 0xfff;
                const int16_t vlefti = volacc - m_panlaw[255 - voice.vol.pan];
                const int16_t vrighti = volacc - m_panlaw[voice.vol.pan];

                // Clamp negative values to prevent clicks
                const uint16_t vleft = vlefti > 0 ?
                    (m_volume[vlefti] * voice.state.ramp >> RAMP_SHIFT) : 0;
                const uint16_t vright = vrighti > 0 ?
                    (m_volume[vrighti] * voice.state.ramp >> RAMP_SHIFT) : 0;

                // Get sample
                int32_t sample = getSample(voice);

                // Mix to output
                // 15-bit volume + 5-bit worth of 32 channels + 16-bit sample = 4-bit extra
                if (voice.playing() || voice.state.ramp > 0) {
                    float sampleL = (sample * vleft) >> (5 + VOLUME_BITS);
                    float sampleR = (sample * vright) >> (5 + VOLUME_BITS);

                    outL[i] += (sampleL / 32768.0f) * m_masterVolume;
                    outR[i] += (sampleR / 32768.0f) * m_masterVolume;
                }

                // Update ramp
                updateRamp(voice);

                // Update oscillator and envelope
                if (voice.playing()) {
                    updateOscillator(voice);
                    updateVolumeEnvelope(voice);
                }
            }
        }

        // Clamp output
        for (int i = 0; i < numSamples; i++) {
            outL[i] = std::max(-1.0f, std::min(1.0f, outL[i]));
            outR[i] = std::max(-1.0f, std::min(1.0f, outR[i]));
        }
    }
};

// Emscripten bindings
EMSCRIPTEN_BINDINGS(ICS2115Synth) {
    emscripten::class_<ICS2115Synth>("ICS2115Synth")
        .constructor<>()
        .function("initialize", &ICS2115Synth::initialize)
        .function("reset", &ICS2115Synth::reset)
        .function("loadROM", &ICS2115Synth::loadROM)
        .function("noteOn", &ICS2115Synth::noteOn)
        .function("noteOff", &ICS2115Synth::noteOff)
        .function("allNotesOff", &ICS2115Synth::allNotesOff)
        .function("writeRegister", &ICS2115Synth::writeRegister)
        .function("setParameter", &ICS2115Synth::setParameter)
        .function("process", &ICS2115Synth::process);
}
