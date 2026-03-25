/**
 * ZSG2Synth.cpp - ZOOM ZSG-2 Wavetable Synthesizer for WebAssembly
 * Based on MAME's zsg2 emulator by Olivier Galibert, R. Belmont, hap, superctr
 *
 * This is a standalone extraction of the ZOOM ZSG-2 custom wavetable chip.
 * The ZSG-2 was used in Taito arcade boards (G-NET, F3 system) powering
 * games like G-Darius, Ray Storm, and others.
 *
 * Hardware features:
 * - 48 channels of compressed wavetable playback
 * - 2:1 sample compression (4 bytes -> 4 x int16 samples)
 * - Per-channel emphasis filter (high-pass emphasis)
 * - Per-channel IIR lowpass output filter with ramping
 * - Per-channel volume with ramping (attack/release via delta)
 * - 4 output busses: reverb, chorus, left, right
 * - Linear interpolation between samples
 * - Gain table with ~1dB per step attenuation
 *
 * Sample compression format (little-endian 32-bit):
 *   42222222 51111111 60000000 ssss3333
 *   's' = 4-bit scale, '0'-'3' are signed 7-bit values
 *   Final 16-bit value = (sign-extended 7-bit << 9) >> scale
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

// ============================================================================
// Constants (from MAME zsg2.cpp / zsg2.h)
// ============================================================================

static constexpr int NUM_CHANNELS = 48;
static constexpr uint16_t STATUS_ACTIVE = 0x8000;

// Emphasis filter constants (from MAME)
static constexpr int EMPHASIS_INITIAL_BIAS = 0;
static constexpr int EMPHASIS_FILTER_SHIFT = (16 - 10); // 6
static constexpr int EMPHASIS_ROUNDING = 0x20;
static constexpr int EMPHASIS_OUTPUT_SHIFT = 1;

// ============================================================================
// Channel structure (from MAME zsg2.h zchan)
// ============================================================================

struct ZChan {
    uint16_t v[16];       // Raw register values
    uint16_t status;
    uint32_t cur_pos;
    uint32_t step_ptr;
    uint32_t step;
    uint32_t start_pos;
    uint32_t end_pos;
    uint32_t loop_pos;
    uint32_t page;

    uint16_t vol;
    uint16_t vol_initial;
    uint16_t vol_target;
    int16_t  vol_delta;

    uint16_t output_cutoff;
    uint16_t output_cutoff_initial;
    uint16_t output_cutoff_target;
    int16_t  output_cutoff_delta;

    int32_t emphasis_filter_state;
    int32_t output_filter_state;

    uint8_t output_gain[4]; // reverb, chorus, left, right
    int16_t samples[5];     // +1 history for interpolation

    // WASM additions for MIDI control
    bool    midi_active;
    int     midi_note;
    float   velocity;
    bool    in_release;
    float   env;
    float   attack_rate;
    float   release_rate;

    void reset() {
        memset(v, 0, sizeof(v));
        status = 0;
        cur_pos = 0;
        step_ptr = 0;
        step = 0;
        start_pos = 0;
        end_pos = 0;
        loop_pos = 0;
        page = 0;
        vol = 0;
        vol_initial = 0;
        vol_target = 0;
        vol_delta = 0;
        output_cutoff = 0;
        output_cutoff_initial = 0;
        output_cutoff_target = 0;
        output_cutoff_delta = 0;
        emphasis_filter_state = 0;
        output_filter_state = 0;
        memset(output_gain, 0, sizeof(output_gain));
        memset(samples, 0, sizeof(samples));
        midi_active = false;
        midi_note = -1;
        velocity = 0.0f;
        in_release = false;
        env = 0.0f;
        attack_rate = 0.01f;
        release_rate = 0.002f;
    }
};

// ============================================================================
// ZSG2Synth - Main synthesis class
// ============================================================================

class ZSG2Synth {
public:
    static constexpr int MAX_POLY = NUM_CHANNELS;

    ZSG2Synth() {
        m_sampleRate = 44100.0;
        m_romData = nullptr;
        m_romSize = 0;
        m_memCopy = nullptr;
        m_fullSamples = nullptr;
        m_memBlocks = 0;
        m_sampleCount = 0;
        m_readAddress = 0;
        m_globalVolume = 200;
        m_globalAttack = 0.01f;
        m_globalRelease = 0.002f;
        m_pitchBendFactor = 1.0;
        memset(m_reg, 0, sizeof(m_reg));

        // Generate gain table: ~1dB per step (from MAME device_start)
        m_gainTab[0] = 0;
        for (int i = 1; i < 32; i++) {
            double val = pow(10.0, -(31 - i) / 20.0) * 65535.0;
            m_gainTab[i] = static_cast<uint16_t>(val);
        }
        // Fill rest (MAME declares 256 but only uses 32 entries)
        for (int i = 32; i < 256; i++)
            m_gainTab[i] = m_gainTab[i & 0x1f];

        for (int i = 0; i < NUM_CHANNELS; i++)
            m_chan[i].reset();
    }

    ~ZSG2Synth() {
        delete[] m_memCopy;
        delete[] m_fullSamples;
    }

    void setSampleRate(int sr) {
        m_sampleRate = static_cast<double>(sr);
    }

    int getSampleRate() const {
        return static_cast<int>(m_sampleRate);
    }

    // ── ROM loading ─────────────────────────────────────────────────────
    // ROM is an array of uint32_t words (compressed sample blocks).
    // Each 32-bit word decompresses to 4 x int16 samples.

    void loadROM(uintptr_t dataPtr, int sizeBytes) {
        m_romData = reinterpret_cast<const uint32_t*>(dataPtr);
        m_romSize = sizeBytes;
        m_memBlocks = sizeBytes / 4; // number of 32-bit words

        // Allocate decompression buffers
        delete[] m_memCopy;
        delete[] m_fullSamples;
        m_memCopy = new uint32_t[m_memBlocks];
        m_fullSamples = new int16_t[m_memBlocks * 4 + 4]; // +4 for empty block
        memset(m_memCopy, 0, m_memBlocks * sizeof(uint32_t));
        memset(m_fullSamples, 0, (m_memBlocks * 4 + 4) * sizeof(int16_t));
    }

    // ── Sample decompression (1:1 from MAME prepare_samples) ────────────

    int16_t* prepare_samples(uint32_t offset) {
        if (!m_romData || offset >= m_memBlocks)
            return &m_fullSamples[m_memBlocks * 4]; // overflow → empty block

        uint32_t block = m_romData[offset];

        if (block == 0)
            return &m_fullSamples[m_memBlocks * 4]; // overflow or 0

        if (block == m_memCopy[offset])
            return &m_fullSamples[offset * 4]; // cached

        m_memCopy[offset] = block;
        uint32_t off = offset * 4;

        // Decompress 32-bit block to 4 x 16-bit samples
        // 42222222 51111111 60000000 ssss3333
        m_fullSamples[off | 0] = block >> 8 & 0x7f;
        m_fullSamples[off | 1] = block >> 16 & 0x7f;
        m_fullSamples[off | 2] = block >> 24 & 0x7f;
        m_fullSamples[off | 3] = (block >> (8 + 1) & 0x40) | (block >> (16 + 2) & 0x20) | (block >> (24 + 3) & 0x10) | (block & 0xf);

        // Sign-extend and shift
        uint8_t shift = block >> 4 & 0xf;
        for (uint32_t i = off; i < (off + 4); i++) {
            m_fullSamples[i] <<= 9;
            m_fullSamples[i] >>= shift;
        }

        return &m_fullSamples[off];
    }

    // ── Emphasis filter (1:1 from MAME filter_samples) ──────────────────

    void filter_samples(ZChan* ch) {
        int16_t* raw_samples = prepare_samples(ch->page | ch->cur_pos);
        ch->samples[0] = ch->samples[4]; // remember last sample

        for (int i = 0; i < 4; i++) {
            ch->emphasis_filter_state += raw_samples[i] - ((ch->emphasis_filter_state + EMPHASIS_ROUNDING) >> EMPHASIS_FILTER_SHIFT);

            int32_t sample = ch->emphasis_filter_state >> EMPHASIS_OUTPUT_SHIFT;
            ch->samples[i + 1] = std::clamp<int32_t>(sample, -32768, 32767);
        }
    }

    // ── Ramp helpers (1:1 from MAME) ────────────────────────────────────

    static int16_t get_ramp(uint8_t val) {
        int16_t frac = static_cast<int16_t>(val << 12); // sign extend via shift
        frac = ((frac >> 12) ^ 8) << (val >> 4);
        return (frac >> 4);
    }

    static uint16_t ramp(uint16_t current, uint16_t target, int16_t delta) {
        int32_t rampval = current + delta;
        if (delta < 0 && rampval < target)
            rampval = target;
        else if (delta >= 0 && rampval > target)
            rampval = target;
        return static_cast<uint16_t>(rampval);
    }

    // ── Channel register write (1:1 from MAME chan_w) ───────────────────

    void chan_w(int ch, int reg, uint16_t data) {
        if (ch < 0 || ch >= NUM_CHANNELS) return;
        ZChan& c = m_chan[ch];

        switch (reg) {
            case 0x0:
                c.start_pos = (c.start_pos & 0xff00) | (data >> 8 & 0xff);
                break;
            case 0x1:
                c.start_pos = (c.start_pos & 0x00ff) | (data << 8 & 0xff00);
                c.page = data << 8 & 0xff0000;
                break;
            case 0x2:
                break;
            case 0x3:
                c.status &= 0x8000;
                c.status |= data & 0x7fff;
                break;
            case 0x4:
                c.step = data + 1;
                break;
            case 0x5:
                c.loop_pos = (c.loop_pos & 0xff00) | (data & 0xff);
                c.output_gain[3] = data >> 8; // right
                break;
            case 0x6:
                c.end_pos = data;
                break;
            case 0x7:
                c.loop_pos = (c.loop_pos & 0x00ff) | (data << 8 & 0xff00);
                c.output_gain[2] = data >> 8; // left
                break;
            case 0x8:
                c.output_cutoff_initial = data;
                break;
            case 0x9:
                c.output_cutoff = data;
                break;
            case 0xa:
                c.vol_initial = data;
                break;
            case 0xb:
                c.vol = data;
                break;
            case 0xc:
                c.output_cutoff_target = data;
                break;
            case 0xd:
                c.output_gain[1] = data >> 8; // chorus
                c.output_cutoff_delta = get_ramp(data & 0xff);
                break;
            case 0xe:
                c.vol_target = data;
                break;
            case 0xf:
                c.output_gain[0] = data >> 8; // reverb
                c.vol_delta = get_ramp(data & 0xff);
                break;
            default:
                break;
        }

        c.v[reg] = data;
    }

    // ── Control register write (1:1 from MAME control_w) ────────────────

    void control_w(int reg, uint16_t data) {
        switch (reg) {
            case 0x00: case 0x01: case 0x02: {
                // Key on
                int base = (reg & 3) << 4;
                for (int i = 0; i < 16; i++) {
                    if (data & (1 << i)) {
                        int ch = base | i;
                        m_chan[ch].status |= STATUS_ACTIVE;
                        m_chan[ch].cur_pos = m_chan[ch].start_pos - 1;
                        m_chan[ch].step_ptr = 0x10000;
                        m_chan[ch].vol = 0; // matching MAME (ignores vol_initial to avoid clicks)
                        m_chan[ch].vol_delta = 0x0400; // register 06?
                        m_chan[ch].output_cutoff = m_chan[ch].output_cutoff_initial;
                        m_chan[ch].output_filter_state = 0;
                    }
                }
                break;
            }
            case 0x04: case 0x05: case 0x06: {
                // Key off
                int base = (reg & 3) << 4;
                for (int i = 0; i < 16; i++) {
                    if (data & (1 << i)) {
                        int ch = base | i;
                        m_chan[ch].vol = 0;
                        m_chan[ch].status &= ~STATUS_ACTIVE;
                    }
                }
                break;
            }
            case 0x1c:
                m_readAddress = (m_readAddress & 0x3fffc000) | (data >> 2 & 0x00003fff);
                break;
            case 0x1d:
                m_readAddress = (m_readAddress & 0x00003fff) | (data << 14 & 0x3fffc000);
                break;
            default:
                if (reg < 0x20)
                    m_reg[reg] = data;
                break;
        }
    }

    // ── Direct register write (for hardware-level access) ───────────────

    void writeRegister(int offset, int value) {
        uint16_t data = static_cast<uint16_t>(value);
        if (offset < 0x300) {
            int ch = offset >> 4;
            int reg = offset & 0xf;
            chan_w(ch, reg, data);
        } else {
            control_w(offset - 0x300, data);
        }
    }

    // ── MIDI control ────────────────────────────────────────────────────
    // Maps MIDI notes to ZSG-2 channels with sample playback.
    // The ROM must be loaded first - samples are addressed via page + position.

    void noteOn(int note, int velocity) {
        if (velocity == 0) { noteOff(note); return; }
        if (!m_romData || m_memBlocks == 0) return;

        int vi = findFreeVoice(note);
        ZChan& ch = m_chan[vi];

        ch.midi_active = true;
        ch.midi_note = note;
        ch.velocity = velocity / 127.0f;
        ch.in_release = false;
        ch.env = 0.0f;
        ch.attack_rate = m_globalAttack;
        ch.release_rate = m_globalRelease;

        // Set up sample playback for this channel
        // Use page 0, full ROM as sample space
        ch.page = 0;
        ch.start_pos = 0;
        ch.end_pos = static_cast<uint32_t>(std::min<uint32_t>(m_memBlocks, 0xffff));
        ch.loop_pos = 0;

        // Pitch: step register. Base rate = clock/768 (~32552 Hz for 25MHz clock).
        // step of 0x10000 = original pitch.
        // Scale by MIDI note relative to middle C (note 60).
        double semitones = note - 60.0;
        double pitchRatio = pow(2.0, semitones / 12.0) * m_pitchBendFactor;
        ch.step = static_cast<uint32_t>(std::round(0x10000 * pitchRatio));

        // Set output gains: left and right
        ch.output_gain[2] = 0x1f; // left max
        ch.output_gain[3] = 0x1f; // right max
        ch.output_gain[0] = 0;    // reverb off
        ch.output_gain[1] = 0;    // chorus off

        // Volume: ramp up from 0
        ch.vol = 0;
        ch.vol_target = 0xffff;
        ch.vol_delta = 0x0400;

        // Filter: fully open
        ch.output_cutoff = 0xffff;
        ch.output_cutoff_initial = 0xffff;
        ch.output_cutoff_target = 0xffff;
        ch.output_cutoff_delta = 0;

        // Reset filter states
        ch.emphasis_filter_state = EMPHASIS_INITIAL_BIAS;
        ch.output_filter_state = 0;
        memset(ch.samples, 0, sizeof(ch.samples));

        // Key on
        ch.status |= STATUS_ACTIVE;
        ch.cur_pos = ch.start_pos - 1;
        ch.step_ptr = 0x10000;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_CHANNELS; i++) {
            if (m_chan[i].midi_active && m_chan[i].midi_note == note && !m_chan[i].in_release) {
                m_chan[i].in_release = true;
                // Set volume ramp down
                m_chan[i].vol_target = 0;
                m_chan[i].vol_delta = -0x0200;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_CHANNELS; i++) {
            m_chan[i].midi_active = false;
            m_chan[i].vol = 0;
            m_chan[i].status &= ~STATUS_ACTIVE;
            m_chan[i].env = 0.0f;
        }
    }

    // ── Parameters ──────────────────────────────────────────────────────

    void setParameter(int paramId, double value) {
        switch (paramId) {
            case 0: // volume
                m_globalVolume = static_cast<uint8_t>(std::max(0.0, std::min(255.0, value)));
                break;
            case 1: // attack
                m_globalAttack = static_cast<float>(std::max(0.0001, value));
                break;
            case 2: // release
                m_globalRelease = static_cast<float>(std::max(0.0001, value));
                break;
        }
    }

    void controlChange(int cc, int value) {
        switch (cc) {
            case 7: // Volume
                m_globalVolume = value * 2;
                break;
            case 10: // Pan — not directly applicable to ZSG2's bus model
                break;
        }
    }

    void pitchBend(int value) {
        // value: -8192 to 8191, +/-2 semitones
        m_pitchBendFactor = pow(2.0, (value / 8192.0) * 2.0 / 12.0);
    }

    void programChange(int program) {
        // Could select sample banks/pages
    }

    // ── Audio rendering (1:1 from MAME sound_stream_update) ─────────────

    void process(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outLPtr);
        float* outR = reinterpret_cast<float*>(outRPtr);

        if (!m_romData || m_memBlocks == 0 || !m_fullSamples) {
            memset(outL, 0, numSamples * sizeof(float));
            memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        const float masterVol = m_globalVolume / 255.0f;

        for (int i = 0; i < numSamples; i++) {
            int32_t mix[4] = {}; // reverb, chorus, left, right

            for (int c = 0; c < NUM_CHANNELS; c++) {
                ZChan& elem = m_chan[c];

                if (~elem.status & STATUS_ACTIVE)
                    continue;

                // MIDI envelope for note-on/off control
                if (elem.midi_active) {
                    if (!elem.in_release) {
                        elem.env += elem.attack_rate;
                        if (elem.env > 1.0f) elem.env = 1.0f;
                    } else {
                        elem.env -= elem.release_rate;
                        if (elem.env <= 0.0f) {
                            elem.env = 0.0f;
                            elem.midi_active = false;
                            elem.vol = 0;
                            elem.status &= ~STATUS_ACTIVE;
                            continue;
                        }
                    }
                }

                // === From here: 1:1 MAME sound_stream_update per-channel logic ===

                elem.step_ptr += elem.step;
                if (elem.step_ptr & 0xffff0000) {
                    if (++elem.cur_pos >= elem.end_pos) {
                        // Loop sample
                        elem.cur_pos = elem.loop_pos;
                        if ((elem.cur_pos + 1) >= elem.end_pos) {
                            // End of sample
                            elem.vol = 0;
                            elem.status &= ~STATUS_ACTIVE;
                            elem.midi_active = false;
                            continue;
                        }
                    }

                    if (elem.cur_pos == elem.start_pos)
                        elem.emphasis_filter_state = EMPHASIS_INITIAL_BIAS;

                    elem.step_ptr &= 0xffff;
                    filter_samples(&elem);
                }

                uint8_t sample_pos = elem.step_ptr >> 14 & 3;
                int32_t sample = elem.samples[sample_pos];

                // Linear interpolation
                sample += (static_cast<uint16_t>(elem.step_ptr << 2 & 0xffff) * static_cast<int16_t>(elem.samples[sample_pos + 1] - sample)) >> 16;

                // IIR lowpass output filter
                elem.output_filter_state += (sample - (elem.output_filter_state >> 16)) * elem.output_cutoff;
                sample = elem.output_filter_state >> 16;

                // DC bias discharge when cutoff is 0
                if (!elem.output_cutoff)
                    elem.output_filter_state >>= 1;

                // Volume
                sample = (sample * elem.vol) >> 16;

                // Apply MIDI envelope on top
                if (elem.midi_active) {
                    sample = static_cast<int32_t>(sample * elem.velocity * elem.env);
                }

                // Output to 4 busses with gain table
                for (int output = 0; output < 4; output++) {
                    int output_gain = elem.output_gain[output] & 0x1f;
                    int32_t output_sample = sample;

                    if (elem.output_gain[output] & 0x80) // phase invert
                        output_sample = -output_sample;

                    mix[output] += (output_sample * m_gainTab[output_gain & 0x1f]) >> 16;
                }

                // Apply ramping every other update (from MAME)
                if (m_sampleCount & 1) {
                    elem.vol = ramp(elem.vol, elem.vol_target, elem.vol_delta);
                    elem.output_cutoff = ramp(elem.output_cutoff, elem.output_cutoff_target, elem.output_cutoff_delta);
                }
            }

            // Stereo mixdown: left (bus 2) + right (bus 3)
            // Reverb (bus 0) and chorus (bus 1) mixed equally to both channels
            int32_t left  = mix[2] + (mix[0] >> 1) + (mix[1] >> 1);
            int32_t right = mix[3] + (mix[0] >> 1) + (mix[1] >> 1);

            // Clamp to int16 range, then normalize to float
            left  = std::clamp<int32_t>(left, -32768, 32767);
            right = std::clamp<int32_t>(right, -32768, 32767);

            outL[i] = (left / 32768.0f) * masterVol;
            outR[i] = (right / 32768.0f) * masterVol;

            m_sampleCount++;
        }
    }

    // ── Voice status ────────────────────────────────────────────────────

    void getVoiceStatus(uintptr_t outPtr, int maxVoices) {
        int* out = reinterpret_cast<int*>(outPtr);
        int count = std::min(maxVoices, NUM_CHANNELS);
        for (int i = 0; i < count; i++) {
            const ZChan& ch = m_chan[i];
            out[i * 4 + 0] = (ch.status & STATUS_ACTIVE) ? 1 : 0;
            out[i * 4 + 1] = ch.midi_note;
            out[i * 4 + 2] = static_cast<int>(ch.env * 255);
            out[i * 4 + 3] = ch.in_release ? 1 : 0;
        }
    }

    // ── Sample loading helpers ──────────────────────────────────────────

    void loadSample(int voice, uintptr_t dataPtr, int sizeBytes) {
        // For ZSG2, samples are ROM-based. This sets up a voice to play
        // from a specific region. The data should be in ZSG2 compressed format.
        if (voice < 0 || voice >= NUM_CHANNELS) return;
        loadROM(dataPtr, sizeBytes);
        ZChan& ch = m_chan[voice];
        ch.page = 0;
        ch.start_pos = 0;
        ch.end_pos = static_cast<uint32_t>(std::min<uint32_t>(m_memBlocks, 0xffff));
        ch.loop_pos = 0;
    }

    void loadSampleAll(uintptr_t dataPtr, int sizeBytes) {
        loadROM(dataPtr, sizeBytes);
        for (int i = 0; i < NUM_CHANNELS; i++) {
            m_chan[i].page = 0;
            m_chan[i].start_pos = 0;
            m_chan[i].end_pos = static_cast<uint32_t>(std::min<uint32_t>(m_memBlocks, 0xffff));
            m_chan[i].loop_pos = 0;
        }
    }

private:
    double   m_sampleRate;
    ZChan    m_chan[NUM_CHANNELS];
    uint16_t m_gainTab[256];
    uint16_t m_reg[32];
    uint32_t m_sampleCount;
    uint32_t m_readAddress;

    const uint32_t* m_romData;
    int      m_romSize; // in bytes
    uint32_t m_memBlocks; // number of 32-bit words
    uint32_t* m_memCopy;
    int16_t* m_fullSamples;

    uint8_t  m_globalVolume;
    float    m_globalAttack;
    float    m_globalRelease;
    double   m_pitchBendFactor;

    int findFreeVoice(int midiNote) {
        // Reuse voice already playing this note
        for (int i = 0; i < NUM_CHANNELS; i++)
            if (m_chan[i].midi_note == midiNote && m_chan[i].midi_active) return i;
        // Find free voice
        for (int i = 0; i < NUM_CHANNELS; i++)
            if (!m_chan[i].midi_active && !(m_chan[i].status & STATUS_ACTIVE)) return i;
        // Steal releasing voice with lowest envelope
        int best = 0; float bestEnv = 2.0f;
        for (int i = 0; i < NUM_CHANNELS; i++)
            if (m_chan[i].in_release && m_chan[i].env < bestEnv) { best = i; bestEnv = m_chan[i].env; }
        if (bestEnv < 2.0f) return best;
        return 0;
    }
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(ZSG2Synth) {
    emscripten::class_<ZSG2Synth>("ZSG2Synth")
        .constructor<>()
        .function("setSampleRate", &ZSG2Synth::setSampleRate)
        .function("getSampleRate", &ZSG2Synth::getSampleRate)
        .function("noteOn", &ZSG2Synth::noteOn)
        .function("noteOff", &ZSG2Synth::noteOff)
        .function("allNotesOff", &ZSG2Synth::allNotesOff)
        .function("setParameter", &ZSG2Synth::setParameter)
        .function("controlChange", &ZSG2Synth::controlChange)
        .function("pitchBend", &ZSG2Synth::pitchBend)
        .function("programChange", &ZSG2Synth::programChange)
        .function("writeRegister", &ZSG2Synth::writeRegister)
        .function("loadROM", &ZSG2Synth::loadROM)
        .function("loadSample", &ZSG2Synth::loadSample)
        .function("loadSampleAll", &ZSG2Synth::loadSampleAll)
        .function("process", &ZSG2Synth::process)
        .function("getVoiceStatus", &ZSG2Synth::getVoiceStatus);
}
#endif
