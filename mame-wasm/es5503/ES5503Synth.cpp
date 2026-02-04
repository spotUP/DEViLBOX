/**
 * ES5503Synth.cpp - Ensoniq ES5503 "DOC" Wavetable Synthesizer for WebAssembly
 * Based on MAME's ES5503 emulator v2.4 by R. Belmont
 *
 * This is a standalone version that extracts the core synthesis algorithms
 * from MAME without the device framework dependencies.
 *
 * The ES5503 (1986) is a 32-voice wavetable synthesizer designed by Bob Yannes
 * (who also designed the C64 SID chip). It was used in:
 * - Apple IIgs (main sound chip)
 * - Ensoniq Mirage (first affordable pro sampler)
 * - Ensoniq ESQ-1/SQ-80 synthesizers
 * - Various arcade games
 *
 * Features:
 * - 32 independent oscillators
 * - 128KB wave memory address space (8-bit samples)
 * - Configurable wave table sizes (256 to 32768 samples)
 * - 4 oscillator modes: Free-run, One-shot, Sync/AM, Swap
 * - 8-bit volume per oscillator
 * - Variable resolution (affects frequency precision)
 * - Paired oscillator interactions (sync, AM, swap)
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
// Constants from MAME
// ============================================================================

static constexpr uint16_t wavesizes[8] = { 256, 512, 1024, 2048, 4096, 8192, 16384, 32768 };
static constexpr uint32_t wavemasks[8] = { 0x1ff00, 0x1fe00, 0x1fc00, 0x1f800, 0x1f000, 0x1e000, 0x1c000, 0x18000 };
static constexpr uint32_t accmasks[8]  = { 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff };
static constexpr int      resshifts[8] = { 9, 10, 11, 12, 13, 14, 15, 16 };

static constexpr int WAVE_MEM_SIZE = 0x20000;  // 128KB wave memory (17-bit address)
static constexpr int MAX_OSCILLATORS = 32;

// Oscillator modes
static constexpr int MODE_FREE    = 0;  // Free-running (loop)
static constexpr int MODE_ONESHOT = 1;  // One-shot (play once, halt)
static constexpr int MODE_SYNCAM  = 2;  // Sync/AM with partner
static constexpr int MODE_SWAP    = 3;  // Swap with partner when done

// Default chip clock (Apple IIgs NTSC)
static constexpr uint32_t DEFAULT_CLOCK = 7159090;

// Built-in waveform pages (256 bytes each, in wave memory)
static constexpr int WAVE_PAGE_SINE     = 0x00;
static constexpr int WAVE_PAGE_SAW      = 0x01;
static constexpr int WAVE_PAGE_SQUARE   = 0x02;
static constexpr int WAVE_PAGE_TRIANGLE = 0x03;
static constexpr int WAVE_PAGE_NOISE    = 0x04;
static constexpr int WAVE_PAGE_PULSE25  = 0x05;
static constexpr int WAVE_PAGE_PULSE12  = 0x06;
static constexpr int WAVE_PAGE_ORGAN    = 0x07;

// ============================================================================
// Parameter IDs
// ============================================================================
enum class ES5503Param {
    WAVEFORM = 0,       // Built-in waveform index (0-7)
    WAVE_SIZE = 1,      // Wave table size index (0-7: 256-32768)
    RESOLUTION = 2,     // Resolution (0-7)
    OSC_MODE = 3,       // Oscillator mode (0-3)
    VOLUME = 4,         // Volume (0-255)
    NUM_OSCILLATORS = 5, // Number of enabled oscillators (1-32)
    ATTACK_TIME = 6,    // Attack time (0-1, maps to volume ramp)
    RELEASE_TIME = 7,   // Release time (0-1, maps to volume ramp)

    PARAM_COUNT = 8
};

// ============================================================================
// Oscillator structure (matching MAME)
// ============================================================================
struct ES5503Osc {
    uint16_t freq;
    uint16_t wtsize;
    uint8_t  control;
    uint8_t  vol;
    uint8_t  data;
    uint32_t wavetblpointer;
    uint8_t  wavetblsize;
    uint8_t  resolution;
    uint32_t accumulator;
    uint8_t  irqpend;

    // Extra state for MIDI voice management
    int8_t   midiNote;      // -1 if not playing a MIDI note
    uint8_t  targetVol;     // Target volume for envelope
    float    volEnvelope;   // Current envelope level (0-1)
    float    attackRate;    // Envelope attack rate per sample
    float    releaseRate;   // Envelope release rate per sample
    bool     releasing;     // In release phase
};

// ============================================================================
// ES5503 Synthesizer - Standalone implementation
// ============================================================================
class ES5503Synth {
public:
    static constexpr int MAX_OUTPUT_SAMPLES = 1024;

    ES5503Synth()
        : m_sample_rate(48000)
        , m_chip_clock(DEFAULT_CLOCK)
        , m_isInitialized(false)
        , m_oscsenabled(32)
        , m_output_channels(1)  // mono mix for simplicity
        , m_output_rate(0)
        , m_rege0(0xff)
        , m_channel_strobe(0)
        , m_output_gain(1.0f)
        // Default voice settings
        , m_default_wavetblsize(0)     // 256 samples
        , m_default_resolution(0)
        , m_default_waveform(WAVE_PAGE_SAW)
        , m_default_attack(0.005f)     // 5ms attack
        , m_default_release(0.05f)     // 50ms release
    {
        std::memset(m_wavemem, 0x80, WAVE_MEM_SIZE); // Fill with center value
        std::memset(m_oscillators, 0, sizeof(m_oscillators));
    }

    void initialize(int sampleRate) {
        m_sample_rate = sampleRate;

        // Calculate chip output rate
        m_output_rate = (m_chip_clock / 8) / (m_oscsenabled + 2);

        // Reset all oscillators
        for (int i = 0; i < MAX_OSCILLATORS; i++) {
            auto& osc = m_oscillators[i];
            osc.freq = 0;
            osc.wtsize = 0;
            osc.control = 1;  // halted
            osc.vol = 0;
            osc.data = 0x80;
            osc.wavetblpointer = 0;
            osc.wavetblsize = 0;
            osc.resolution = 0;
            osc.accumulator = 0;
            osc.irqpend = 0;
            osc.midiNote = -1;
            osc.targetVol = 0;
            osc.volEnvelope = 0;
            osc.attackRate = 1.0f / (m_default_attack * sampleRate);
            osc.releaseRate = 1.0f / (m_default_release * sampleRate);
            osc.releasing = false;
        }

        // Generate built-in waveforms
        generateBuiltinWaveforms();

        m_isInitialized = true;
    }

    bool isInitialized() const { return m_isInitialized; }
    int getSampleRate() const { return m_sample_rate; }

    // ========================================================================
    // Wave memory management
    // ========================================================================

    /** Load wave data into wave memory at the given byte offset */
    void loadWaveData(uintptr_t dataPtr, int offset, int length) {
        const uint8_t* data = reinterpret_cast<const uint8_t*>(dataPtr);
        if (offset < 0 || offset + length > WAVE_MEM_SIZE) return;
        std::memcpy(m_wavemem + offset, data, length);
    }

    /** Load wave data into a specific page (256-byte aligned) */
    void loadWavePage(uintptr_t dataPtr, int page, int length) {
        loadWaveData(dataPtr, page * 256, std::min(length, 256));
    }

    /** Get wave memory size */
    int getWaveMemSize() const { return WAVE_MEM_SIZE; }

    /** Get a pointer to wave memory (for JS to write directly) */
    uintptr_t getWaveMemPtr() { return reinterpret_cast<uintptr_t>(m_wavemem); }

    // ========================================================================
    // Register-level interface (matching MAME's read/write)
    // ========================================================================

    void writeRegister(int offset, uint8_t data) {
        if (offset < 0xe0) {
            int osc = offset & 0x1f;

            switch (offset & 0xe0) {
                case 0x00: // Freq low
                    m_oscillators[osc].freq = (m_oscillators[osc].freq & 0xff00) | data;
                    break;
                case 0x20: // Freq high
                    m_oscillators[osc].freq = (m_oscillators[osc].freq & 0x00ff) | (data << 8);
                    break;
                case 0x40: // Volume
                    m_oscillators[osc].vol = data;
                    break;
                case 0x60: // Data - read only
                    break;
                case 0x80: // Wavetable pointer
                    m_oscillators[osc].wavetblpointer = (data << 8);
                    break;
                case 0xa0: // Control
                    if ((m_oscillators[osc].control & 1) && !(data & 1)) {
                        m_oscillators[osc].accumulator = 0;
                    }
                    if (!(m_oscillators[osc].control & 1) && (data & 1) && ((data >> 1) & 1)) {
                        haltOsc(osc, 0, &m_oscillators[osc].accumulator,
                                resshifts[m_oscillators[osc].resolution]);
                    }
                    m_oscillators[osc].control = data;
                    break;
                case 0xc0: // Bank/size/resolution
                    if (data & 0x40) {
                        m_oscillators[osc].wavetblpointer |= 0x10000;
                    } else {
                        m_oscillators[osc].wavetblpointer &= 0xffff;
                    }
                    m_oscillators[osc].wavetblsize = (data >> 3) & 7;
                    m_oscillators[osc].wtsize = wavesizes[m_oscillators[osc].wavetblsize];
                    m_oscillators[osc].resolution = data & 7;
                    break;
            }
        } else {
            switch (offset) {
                case 0xe1: // Oscillator enable
                    m_oscsenabled = ((data >> 1) & 0x1f) + 1;
                    m_output_rate = (m_chip_clock / 8) / (m_oscsenabled + 2);
                    break;
            }
        }
    }

    uint8_t readRegister(int offset) {
        if (offset < 0xe0) {
            int osc = offset & 0x1f;
            switch (offset & 0xe0) {
                case 0x00: return m_oscillators[osc].freq & 0xff;
                case 0x20: return m_oscillators[osc].freq >> 8;
                case 0x40: return m_oscillators[osc].vol;
                case 0x60: return m_oscillators[osc].data;
                case 0x80: return (m_oscillators[osc].wavetblpointer >> 8) & 0xff;
                case 0xa0: return m_oscillators[osc].control;
                case 0xc0: {
                    uint8_t ret = 0;
                    if (m_oscillators[osc].wavetblpointer & 0x10000) ret |= 0x40;
                    ret |= (m_oscillators[osc].wavetblsize << 3);
                    ret |= m_oscillators[osc].resolution;
                    return ret;
                }
            }
        } else {
            switch (offset) {
                case 0xe1: return (m_oscsenabled - 1) << 1;
            }
        }
        return 0;
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int midiNote, int velocity) {
        if (!m_isInitialized || velocity == 0) {
            noteOff(midiNote);
            return;
        }

        // Find a free oscillator
        int oscNum = findFreeOscillator();
        if (oscNum < 0) {
            // Steal oldest note
            oscNum = stealOscillator();
        }

        auto& osc = m_oscillators[oscNum];

        // Set up the oscillator
        osc.midiNote = midiNote;
        osc.targetVol = static_cast<uint8_t>((velocity / 127.0f) * 255);
        osc.volEnvelope = 0;
        osc.releasing = false;
        osc.attackRate = 1.0f / (m_default_attack * m_sample_rate);
        osc.releaseRate = 1.0f / (m_default_release * m_sample_rate);

        // Configure wavetable
        osc.wavetblsize = m_default_wavetblsize;
        osc.wtsize = wavesizes[osc.wavetblsize];
        osc.resolution = m_default_resolution;
        osc.wavetblpointer = m_default_waveform * 256;

        // Calculate frequency register for the MIDI note
        double noteFreqHz = 440.0 * pow(2.0, (midiNote - 69) / 12.0);
        int resshift = resshifts[osc.resolution] - osc.wavetblsize;
        if (resshift < 0) resshift = 0;

        // freq_reg = noteFreqHz * wtsize * (1 << resshift) / output_rate
        // But we scale by output_rate/sample_rate since we run at sample_rate
        double freqScaled = noteFreqHz * osc.wtsize;
        if (resshift > 0) freqScaled *= (1 << resshift);
        freqScaled /= m_output_rate;

        osc.freq = static_cast<uint16_t>(std::min(freqScaled, 65535.0));

        // Set mode to free-run (looping)
        osc.control = 0x00;  // running, free-run mode, channel 0
        osc.accumulator = 0;
        osc.vol = 0;  // Will ramp up via envelope
    }

    void noteOff(int midiNote) {
        for (int i = 0; i < m_oscsenabled; i++) {
            if (m_oscillators[i].midiNote == midiNote && !m_oscillators[i].releasing) {
                m_oscillators[i].releasing = true;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < MAX_OSCILLATORS; i++) {
            m_oscillators[i].releasing = true;
        }
    }

    void controlChange(int cc, int value) {
        if (!m_isInitialized) return;
        double normalized = value / 127.0;

        switch (cc) {
            case 1: // Mod wheel - unused for now
                break;
            case 71: // Resonance -> wave table size
                m_default_wavetblsize = static_cast<int>(normalized * 7.49);
                break;
            case 73: // Attack time
                m_default_attack = 0.001f + static_cast<float>(normalized * 2.0);
                break;
            case 74: // Brightness -> waveform select
                m_default_waveform = static_cast<int>(normalized * 7.49);
                break;
            case 75: // Release time
                m_default_release = 0.001f + static_cast<float>(normalized * 2.0);
                break;
            case 76: // Resolution
                m_default_resolution = static_cast<int>(normalized * 7.49);
                break;
            case 123: // All notes off
                allNotesOff();
                break;
        }
    }

    void pitchBend(int value) {
        if (!m_isInitialized) return;

        double semitones = ((value - 8192) / 8192.0) * 2.0;

        for (int i = 0; i < m_oscsenabled; i++) {
            if (m_oscillators[i].midiNote >= 0 && !(m_oscillators[i].control & 1)) {
                double noteFreqHz = 440.0 * pow(2.0, (m_oscillators[i].midiNote - 69 + semitones) / 12.0);
                auto& osc = m_oscillators[i];
                int resshift = resshifts[osc.resolution] - osc.wavetblsize;
                if (resshift < 0) resshift = 0;

                double freqScaled = noteFreqHz * osc.wtsize;
                if (resshift > 0) freqScaled *= (1 << resshift);
                freqScaled /= m_output_rate;

                osc.freq = static_cast<uint16_t>(std::min(freqScaled, 65535.0));
            }
        }
    }

    void programChange(int program) {
        if (!m_isInitialized) return;
        // Select built-in waveform
        if (program >= 0 && program < 8) {
            m_default_waveform = program;
        }
    }

    // ========================================================================
    // Parameter interface
    // ========================================================================

    void setParameter(int paramId, float value) {
        if (!m_isInitialized) return;

        switch (static_cast<ES5503Param>(paramId)) {
            case ES5503Param::WAVEFORM:
                m_default_waveform = clamp(static_cast<int>(value), 0, 7);
                break;
            case ES5503Param::WAVE_SIZE:
                m_default_wavetblsize = clamp(static_cast<int>(value), 0, 7);
                break;
            case ES5503Param::RESOLUTION:
                m_default_resolution = clamp(static_cast<int>(value), 0, 7);
                break;
            case ES5503Param::OSC_MODE:
                // For future use
                break;
            case ES5503Param::VOLUME:
                m_output_gain = clamp(value / 255.0f, 0.0f, 1.0f);
                break;
            case ES5503Param::NUM_OSCILLATORS:
                m_oscsenabled = clamp(static_cast<int>(value), 1, 32);
                m_output_rate = (m_chip_clock / 8) / (m_oscsenabled + 2);
                break;
            case ES5503Param::ATTACK_TIME:
                m_default_attack = std::max(0.001f, value);
                break;
            case ES5503Param::RELEASE_TIME:
                m_default_release = std::max(0.001f, value);
                break;
            default:
                break;
        }
    }

    float getParameter(int paramId) const {
        switch (static_cast<ES5503Param>(paramId)) {
            case ES5503Param::WAVEFORM: return static_cast<float>(m_default_waveform);
            case ES5503Param::WAVE_SIZE: return static_cast<float>(m_default_wavetblsize);
            case ES5503Param::RESOLUTION: return static_cast<float>(m_default_resolution);
            case ES5503Param::VOLUME: return m_output_gain * 255.0f;
            case ES5503Param::NUM_OSCILLATORS: return static_cast<float>(m_oscsenabled);
            case ES5503Param::ATTACK_TIME: return m_default_attack;
            case ES5503Param::RELEASE_TIME: return m_default_release;
            default: return 0.0f;
        }
    }

    // Convenience setters
    void setWaveform(int index) { m_default_waveform = clamp(index, 0, 7); }
    void setWaveSize(int index) { m_default_wavetblsize = clamp(index, 0, 7); }
    void setResolution(int index) { m_default_resolution = clamp(index, 0, 7); }
    void setAttackTime(float seconds) { m_default_attack = std::max(0.001f, seconds); }
    void setReleaseTime(float seconds) { m_default_release = std::max(0.001f, seconds); }
    void setAmplitude(float amp) { m_output_gain = clamp(amp, 0.0f, 1.0f); }

    void setNumOscillators(int num) {
        m_oscsenabled = clamp(num, 1, 32);
        m_output_rate = (m_chip_clock / 8) / (m_oscsenabled + 2);
    }

    void setChipClock(uint32_t clock) {
        m_chip_clock = clock;
        m_output_rate = (m_chip_clock / 8) / (m_oscsenabled + 2);
    }

    // ========================================================================
    // Audio processing - faithfully recreates MAME's sound_stream_update
    // ========================================================================

    void process(float* outputL, float* outputR, int numSamples) {
        if (!outputL || !outputR || numSamples <= 0) return;
        if (numSamples > MAX_OUTPUT_SAMPLES) numSamples = MAX_OUTPUT_SAMPLES;

        if (!m_isInitialized) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Clear output
        std::memset(outputL, 0, numSamples * sizeof(float));
        std::memset(outputR, 0, numSamples * sizeof(float));

        // Phase increment scaling: chip runs at output_rate, we run at sample_rate
        double freqScale = static_cast<double>(m_output_rate) / m_sample_rate;

        for (int osc = 0; osc < m_oscsenabled; osc++) {
            ES5503Osc* pOsc = &m_oscillators[osc];

            if (pOsc->control & 1) continue;  // Halted

            uint32_t wtptr = pOsc->wavetblpointer & wavemasks[pOsc->wavetblsize];
            uint32_t acc = pOsc->accumulator;
            const uint16_t wtsize = pOsc->wtsize - 1;
            uint8_t ctrl = pOsc->control;
            const uint16_t freq = pOsc->freq;
            int16_t vol = pOsc->vol;
            const int resshift = resshifts[pOsc->resolution] - pOsc->wavetblsize;
            const uint32_t sizemask = accmasks[pOsc->wavetblsize];
            const int mode = (ctrl >> 1) & 3;

            // Scaled frequency increment
            uint32_t freqInc = static_cast<uint32_t>(freq * freqScale);
            if (freqInc == 0 && freq > 0) freqInc = 1;

            for (int snum = 0; snum < numSamples; snum++) {
                // Process envelope for MIDI voices
                if (pOsc->midiNote >= 0) {
                    if (!pOsc->releasing) {
                        // Attack
                        pOsc->volEnvelope = std::min(pOsc->volEnvelope + pOsc->attackRate, 1.0f);
                    } else {
                        // Release
                        pOsc->volEnvelope = std::max(pOsc->volEnvelope - pOsc->releaseRate, 0.0f);
                        if (pOsc->volEnvelope <= 0.0001f) {
                            // Fully released - halt
                            pOsc->control |= 1;
                            pOsc->midiNote = -1;
                            ctrl |= 1;
                            break;
                        }
                    }
                    vol = static_cast<int16_t>(pOsc->targetVol * pOsc->volEnvelope);
                    pOsc->vol = vol;
                }

                uint32_t altram = acc >> resshift;
                uint32_t ramptr = altram & sizemask;

                acc += freqInc;

                // Read sample from wave memory
                uint32_t addr = (ramptr + wtptr) & (WAVE_MEM_SIZE - 1);
                int8_t data = static_cast<int8_t>(m_wavemem[addr] ^ 0x80);

                if (m_wavemem[addr] == 0x00) {
                    // Zero byte found - halt oscillator
                    haltOsc(osc, 1, &acc, resshift);
                    ctrl = pOsc->control;
                } else {
                    if (mode != MODE_SYNCAM) {
                        float sample = (data * vol) / (32768.0f * 2.0f);
                        outputL[snum] += sample;
                        outputR[snum] += sample;
                    } else {
                        // Sync/AM mode
                        if (osc & 1) {
                            // Odd oscillator: modulate next oscillator's volume
                            if (osc < 31 && !(m_oscillators[osc + 1].control & 1)) {
                                m_oscillators[osc + 1].vol = data ^ 0x80;
                            }
                        } else {
                            float sample = (data * vol) / (32768.0f * 2.0f);
                            outputL[snum] += sample;
                            outputR[snum] += sample;
                        }
                    }

                    if (altram >= wtsize) {
                        haltOsc(osc, 0, &acc, resshift);
                        ctrl = pOsc->control;
                    }
                }

                if (ctrl & 1) break;  // Oscillator halted
            }

            pOsc->control = ctrl;
            pOsc->accumulator = acc;
        }

        // Apply output gain and clamp
        for (int i = 0; i < numSamples; i++) {
            outputL[i] = clamp(outputL[i] * m_output_gain, -1.0f, 1.0f);
            outputR[i] = clamp(outputR[i] * m_output_gain, -1.0f, 1.0f);
        }
    }

    // JavaScript-friendly process method
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outputLPtr);
        float* outputR = reinterpret_cast<float*>(outputRPtr);
        process(outputL, outputR, numSamples);
    }

private:
    // ========================================================================
    // Halt oscillator (from MAME)
    // ========================================================================
    void haltOsc(int onum, int type, uint32_t* accumulator, int resshift) {
        ES5503Osc* pOsc = &m_oscillators[onum];
        ES5503Osc* pPartner = &m_oscillators[onum ^ 1];
        int mode = (pOsc->control >> 1) & 3;
        const int partnerMode = (pPartner->control >> 1) & 3;

        if (mode == MODE_SYNCAM) {
            if (!(onum & 1)) {
                if (onum > 0 && !(m_oscillators[onum - 1].control & 1)) {
                    m_oscillators[onum - 1].accumulator = 0;
                }
            }
            mode = MODE_FREE;
        }

        if ((mode != MODE_FREE) || (type != 0)) {
            pOsc->control |= 1;
            // Clear MIDI note for one-shot modes
            if (type == 1) pOsc->midiNote = -1;
        } else {
            // Free-run: preserve phase when looping
            const uint16_t wtsize = pOsc->wtsize;
            if ((*accumulator >> resshift) < wtsize) {
                *accumulator -= ((*accumulator >> resshift) << resshift);
            } else {
                *accumulator -= (wtsize << resshift);
            }
        }

        if (mode == MODE_SWAP) {
            pPartner->control &= ~1;
            pPartner->accumulator = 0;
        } else {
            if ((partnerMode == MODE_SWAP) && ((onum & 1) == 0)) {
                pOsc->control &= ~1;
                uint16_t wtsize = pOsc->wtsize - 1;
                *accumulator -= (wtsize << resshift);
            }
        }
    }

    // ========================================================================
    // Built-in waveform generation
    // ========================================================================
    void generateBuiltinWaveforms() {
        // Each waveform is 256 bytes, stored at page-aligned addresses
        // Samples are unsigned 8-bit (0x80 = center, 0x00 = end marker reserved)

        for (int i = 0; i < 256; i++) {
            double phase = static_cast<double>(i) / 256.0;

            // Sine wave (page 0)
            int sine = static_cast<int>(sin(2.0 * M_PI * phase) * 126 + 128);
            m_wavemem[WAVE_PAGE_SINE * 256 + i] = clampByte(sine);

            // Sawtooth (page 1)
            int saw = static_cast<int>(phase * 252 + 2);
            m_wavemem[WAVE_PAGE_SAW * 256 + i] = clampByte(saw);

            // Square wave (page 2)
            int sq = (i < 128) ? 254 : 2;
            m_wavemem[WAVE_PAGE_SQUARE * 256 + i] = sq;

            // Triangle (page 3)
            int tri;
            if (i < 128) {
                tri = static_cast<int>((i / 128.0) * 252 + 2);
            } else {
                tri = static_cast<int>(((256 - i) / 128.0) * 252 + 2);
            }
            m_wavemem[WAVE_PAGE_TRIANGLE * 256 + i] = clampByte(tri);

            // Noise-like (page 4) - pseudo-random using simple hash
            uint32_t hash = i * 2654435761u;
            m_wavemem[WAVE_PAGE_NOISE * 256 + i] = clampByte((hash & 0xFF));

            // 25% pulse (page 5)
            int p25 = (i < 64) ? 254 : 2;
            m_wavemem[WAVE_PAGE_PULSE25 * 256 + i] = p25;

            // 12.5% pulse (page 6)
            int p12 = (i < 32) ? 254 : 2;
            m_wavemem[WAVE_PAGE_PULSE12 * 256 + i] = p12;

            // Organ-like (sine + 2nd + 3rd harmonic, page 7)
            double organ = sin(2.0 * M_PI * phase)
                         + 0.5 * sin(4.0 * M_PI * phase)
                         + 0.25 * sin(6.0 * M_PI * phase);
            int orgVal = static_cast<int>(organ * 72 + 128);
            m_wavemem[WAVE_PAGE_ORGAN * 256 + i] = clampByte(orgVal);
        }
    }

    // ========================================================================
    // Voice management
    // ========================================================================
    int findFreeOscillator() {
        // Find a halted oscillator
        for (int i = 0; i < m_oscsenabled; i++) {
            if ((m_oscillators[i].control & 1) && m_oscillators[i].midiNote < 0) {
                return i;
            }
        }
        // Find one that's just halted (finished one-shot etc)
        for (int i = 0; i < m_oscsenabled; i++) {
            if (m_oscillators[i].control & 1) {
                return i;
            }
        }
        return -1;
    }

    int stealOscillator() {
        // Steal the oscillator with the lowest envelope
        int best = 0;
        float bestVol = 999.0f;
        for (int i = 0; i < m_oscsenabled; i++) {
            if (m_oscillators[i].volEnvelope < bestVol) {
                bestVol = m_oscillators[i].volEnvelope;
                best = i;
            }
        }
        m_oscillators[best].control |= 1;  // Halt it
        return best;
    }

    // ========================================================================
    // Utility
    // ========================================================================
    static float clamp(float val, float lo, float hi) {
        return (val < lo) ? lo : (val > hi) ? hi : val;
    }

    static int clamp(int val, int lo, int hi) {
        return (val < lo) ? lo : (val > hi) ? hi : val;
    }

    static uint8_t clampByte(int val) {
        // Clamp to 1-255 (avoid 0x00 which is the end-of-sample marker)
        if (val < 1) return 1;
        if (val > 255) return 255;
        return static_cast<uint8_t>(val);
    }

    // ========================================================================
    // State
    // ========================================================================
    int m_sample_rate;
    uint32_t m_chip_clock;
    bool m_isInitialized;

    ES5503Osc m_oscillators[MAX_OSCILLATORS];
    uint8_t m_wavemem[WAVE_MEM_SIZE];

    int m_oscsenabled;
    int m_output_channels;
    uint32_t m_output_rate;
    uint8_t m_rege0;
    uint8_t m_channel_strobe;
    float m_output_gain;

    // Default voice settings
    int m_default_wavetblsize;
    int m_default_resolution;
    int m_default_waveform;
    float m_default_attack;
    float m_default_release;
};

} // namespace devilbox

// ============================================================================
// Emscripten bindings
// ============================================================================
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(ES5503Synth_bindings) {
    emscripten::class_<devilbox::ES5503Synth>("ES5503Synth")
        .constructor<>()
        .function("initialize", &devilbox::ES5503Synth::initialize)
        .function("isInitialized", &devilbox::ES5503Synth::isInitialized)
        .function("getSampleRate", &devilbox::ES5503Synth::getSampleRate)
        // MIDI interface
        .function("noteOn", &devilbox::ES5503Synth::noteOn)
        .function("noteOff", &devilbox::ES5503Synth::noteOff)
        .function("allNotesOff", &devilbox::ES5503Synth::allNotesOff)
        .function("controlChange", &devilbox::ES5503Synth::controlChange)
        .function("pitchBend", &devilbox::ES5503Synth::pitchBend)
        .function("programChange", &devilbox::ES5503Synth::programChange)
        // Parameter interface
        .function("setParameter", &devilbox::ES5503Synth::setParameter)
        .function("getParameter", &devilbox::ES5503Synth::getParameter)
        // Audio processing
        .function("process", &devilbox::ES5503Synth::processJS)
        // Convenience setters
        .function("setWaveform", &devilbox::ES5503Synth::setWaveform)
        .function("setWaveSize", &devilbox::ES5503Synth::setWaveSize)
        .function("setResolution", &devilbox::ES5503Synth::setResolution)
        .function("setAttackTime", &devilbox::ES5503Synth::setAttackTime)
        .function("setReleaseTime", &devilbox::ES5503Synth::setReleaseTime)
        .function("setAmplitude", &devilbox::ES5503Synth::setAmplitude)
        .function("setNumOscillators", &devilbox::ES5503Synth::setNumOscillators)
        .function("setChipClock", &devilbox::ES5503Synth::setChipClock)
        // Register interface
        .function("writeRegister", &devilbox::ES5503Synth::writeRegister)
        .function("readRegister", &devilbox::ES5503Synth::readRegister)
        // Wave memory
        .function("loadWaveData", &devilbox::ES5503Synth::loadWaveData)
        .function("loadWavePage", &devilbox::ES5503Synth::loadWavePage)
        .function("getWaveMemSize", &devilbox::ES5503Synth::getWaveMemSize)
        .function("getWaveMemPtr", &devilbox::ES5503Synth::getWaveMemPtr);
}
#endif
