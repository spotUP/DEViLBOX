/**
 * KS0164Synth.cpp - Samsung KS0164 Wavetable Synthesizer for WebAssembly
 * Based on MAME's ks0164 emulator by Olivier Galibert
 *
 * This is a standalone extraction of the Samsung KS0164 wavetable engine.
 * The KS0164 is a 32-voice wavetable synthesizer found in various arcade
 * and consumer electronics hardware (e.g.Ings VM-100, Boss ME-10,
 * Firebeat/Keyboardmania).
 *
 * Hardware features:
 * - 32 voices with 16-bit position stepping (48-bit current/loop/end)
 * - 16-bit linear and 8-bit compressed sample formats
 * - Linear interpolation between samples
 * - Loop with wrap-around subtraction
 * - Per-voice volume with L/R and envelope ramping (4 volume pairs + deltas)
 * - Variable pitch with 4-bit shift + 12-bit step
 *
 * This WASM version bypasses the embedded KS0164 CPU firmware and drives
 * voice registers directly from MIDI input. The ROM (flash.u3, 4MB)
 * contains sample descriptors at 0x8000 and audio data from ~0x8220.
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

static constexpr int MAX_VOICES = 32;
static constexpr int MAX_REGS = 32;   // 0x20 registers per voice

// ROM sample descriptor table
static constexpr uint32_t SAMPLE_TABLE_OFFSET = 0x8000;
static constexpr int SAMPLE_DESC_SIZE = 16;  // bytes per descriptor
static constexpr int MAX_SAMPLES = 128;      // max sample descriptors to scan

// ============================================================================
// sample_dec[256] — 8-bit compressed sample decode table
// Copied exactly from MAME ks0164.cpp (picked up from vrender0)
// ============================================================================

static const uint16_t sample_dec[0x100] = {
    0x8000, 0x8400, 0x8800, 0x8c00, 0x9000, 0x9400, 0x9800, 0x9c00,
    0xa000, 0xa400, 0xa800, 0xac00, 0xb000, 0xb400, 0xb800, 0xbc00,
    0x4000, 0x4400, 0x4800, 0x4c00, 0x5000, 0x5400, 0x5800, 0x5c00,
    0x6000, 0x6400, 0x6800, 0x6c00, 0x7000, 0x7400, 0x7800, 0x7c00,
    0xc000, 0xc200, 0xc400, 0xc600, 0xc800, 0xca00, 0xcc00, 0xce00,
    0xd000, 0xd200, 0xd400, 0xd600, 0xd800, 0xda00, 0xdc00, 0xde00,
    0x2000, 0x2200, 0x2400, 0x2600, 0x2800, 0x2a00, 0x2c00, 0x2e00,
    0x3000, 0x3200, 0x3400, 0x3600, 0x3800, 0x3a00, 0x3c00, 0x3e00,
    0xe000, 0xe100, 0xe200, 0xe300, 0xe400, 0xe500, 0xe600, 0xe700,
    0xe800, 0xe900, 0xea00, 0xeb00, 0xec00, 0xed00, 0xee00, 0xef00,
    0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500, 0x1600, 0x1700,
    0x1800, 0x1900, 0x1a00, 0x1b00, 0x1c00, 0x1d00, 0x1e00, 0x1f00,
    0xf000, 0xf080, 0xf100, 0xf180, 0xf200, 0xf280, 0xf300, 0xf380,
    0xf400, 0xf480, 0xf500, 0xf580, 0xf600, 0xf680, 0xf700, 0xf780,
    0x0800, 0x0880, 0x0900, 0x0980, 0x0a00, 0x0a80, 0x0b00, 0x0b80,
    0x0c00, 0x0c80, 0x0d00, 0x0d80, 0x0e00, 0x0e80, 0x0f00, 0x0f80,
    0xf800, 0xf840, 0xf880, 0xf8c0, 0xf900, 0xf940, 0xf980, 0xf9c0,
    0xfa00, 0xfa40, 0xfa80, 0xfac0, 0xfb00, 0xfb40, 0xfb80, 0xfbc0,
    0x0400, 0x0440, 0x0480, 0x04c0, 0x0500, 0x0540, 0x0580, 0x05c0,
    0x0600, 0x0640, 0x0680, 0x06c0, 0x0700, 0x0740, 0x0780, 0x07c0,
    0xfc00, 0xfc20, 0xfc40, 0xfc60, 0xfc80, 0xfca0, 0xfcc0, 0xfce0,
    0xfd00, 0xfd20, 0xfd40, 0xfd60, 0xfd80, 0xfda0, 0xfdc0, 0xfde0,
    0x0200, 0x0220, 0x0240, 0x0260, 0x0280, 0x02a0, 0x02c0, 0x02e0,
    0x0300, 0x0320, 0x0340, 0x0360, 0x0380, 0x03a0, 0x03c0, 0x03e0,
    0xfe00, 0xfe10, 0xfe20, 0xfe30, 0xfe40, 0xfe50, 0xfe60, 0xfe70,
    0xfe80, 0xfe90, 0xfea0, 0xfeb0, 0xfec0, 0xfed0, 0xfee0, 0xfef0,
    0x0100, 0x0110, 0x0120, 0x0130, 0x0140, 0x0150, 0x0160, 0x0170,
    0x0180, 0x0190, 0x01a0, 0x01b0, 0x01c0, 0x01d0, 0x01e0, 0x01f0,
    0x0000, 0x0008, 0x0010, 0x0018, 0x0020, 0x0028, 0x0030, 0x0038,
    0x0040, 0x0048, 0x0050, 0x0058, 0x0060, 0x0068, 0x0070, 0x0078,
    0xff80, 0xff88, 0xff90, 0xff98, 0xffa0, 0xffa8, 0xffb0, 0xffb8,
    0xffc0, 0xffc8, 0xffd0, 0xffd8, 0xffe0, 0xffe8, 0xfff0, 0xfff8,
};

// ============================================================================
// Sample descriptor from ROM
// ============================================================================

struct SampleDescriptor {
    uint32_t startAddr;     // byte address in ROM
    uint32_t endAddr;       // byte address in ROM
    uint32_t loopAddr;      // byte address in ROM (loop start)
    uint16_t flags;         // format flags matching regs[0]
    uint8_t  baseNote;      // MIDI note for original pitch (default 60)
    bool     valid;
};

// ============================================================================
// KS0164Synth — Main synthesis class
// ============================================================================

class KS0164Synth {
public:
    static constexpr int MAX_POLY = MAX_VOICES;

    KS0164Synth() {
        m_sampleRate = 44100.0;
        m_romData = nullptr;
        m_romSize = 0;
        m_numSamples = 0;
        m_globalVolume = 0.8f;
        m_globalAttack = 0.005f;
        m_globalRelease = 0.003f;

        std::memset(m_sregs, 0, sizeof(m_sregs));
        std::memset(m_midiNote, 0xFF, sizeof(m_midiNote));
        std::memset(m_voiceActive, 0, sizeof(m_voiceActive));
        std::memset(m_voiceEnv, 0, sizeof(m_voiceEnv));
        std::memset(m_voiceReleasing, 0, sizeof(m_voiceReleasing));
        std::memset(m_voiceVelocity, 0, sizeof(m_voiceVelocity));
    }

    void setSampleRate(int sr) {
        m_sampleRate = static_cast<double>(sr);
    }

    int getSampleRate() const {
        return static_cast<int>(m_sampleRate);
    }

    // ── ROM loading ─────────────────────────────────────────────────────

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const uint8_t*>(dataPtr);
        m_romSize = size;

        // Scan sample descriptor table at 0x8000
        scanSampleTable();
    }

    // ── MIDI control ────────────────────────────────────────────────────

    void noteOn(int note, int velocity) {
        if (velocity == 0) { noteOff(note); return; }
        if (!m_romData || m_numSamples == 0) return;

        int vi = findFreeVoice(note);
        if (vi < 0) return;

        uint16_t *regs = m_sregs[vi];

        // Find best sample for this note
        int sampleIdx = findSampleForNote(note);
        const SampleDescriptor& desc = m_samples[sampleIdx];

        // Compute pitch step
        // The KS0164 hardware rate is clock/3/2/2/32 = ~22075 Hz for 16.9344 MHz
        // We're rendering at m_sampleRate (44100 or 48000), so we need to adjust
        // The pitch register encodes: bits[3:0] = shift, bits[15:4] = step
        // Effective step = (0x10000 | (regs[8] & ~0xf)) shifted by regs[8] & 0xf
        //
        // For original pitch at hardware rate: step = 0x10000 (shift=0, step bits=0)
        // We need to scale for our sample rate vs hardware rate
        double hardwareRate = 22075.0;  // approximate KS0164 stream rate
        double semitones = note - desc.baseNote;
        double pitchRatio = std::pow(2.0, semitones / 12.0);
        double effectiveStep = pitchRatio * hardwareRate / m_sampleRate;

        // Encode into the KS0164 pitch register format:
        // step = 0x10000 | (regs[8] & ~0xf), shifted by (regs[8] & 0xf)
        // We need: effectiveStep * 0x10000 = final step value
        // Find shift and step such that (0x10000 | step_bits) << shift = effectiveStep * 0x10000
        // Or equivalently: effectiveStep = ((0x10000 | step_bits) << shift) / 0x10000
        encodePitchRegister(effectiveStep, regs);

        // Set sample positions (48-bit: page:addr_hi:addr_lo)
        // The address in regs is in sample units:
        //   16-bit linear: byte_addr / 2
        //   8-bit compressed: byte_addr
        bool is8bit = (desc.flags & 0x8000) != 0;
        bool isCompressed = (desc.flags & 0x0400) != 0;

        uint32_t startSamp, endSamp, loopSamp;
        if (is8bit || isCompressed) {
            // 8-bit modes: address = byte address directly
            startSamp = desc.startAddr;
            endSamp = desc.endAddr;
            loopSamp = desc.loopAddr;
        } else {
            // 16-bit linear: address = byte_address / 2 (word address)
            startSamp = desc.startAddr / 2;
            endSamp = desc.endAddr / 2;
            loopSamp = desc.loopAddr / 2;
        }

        // Current position (regs 1-3): 48-bit = page[7:0]:addr_hi:addr_lo
        regs[1] = (startSamp >> 16) & 0xFF;
        regs[2] = (startSamp) & 0xFFFF;
        regs[3] = 0; // fractional part

        // Loop position (regs 9-B)
        bool hasLoop = (desc.flags & 0x0008) != 0;
        regs[9]  = (loopSamp >> 16) & 0xFF;
        regs[0xa] = (loopSamp) & 0xFFFF;
        regs[0xb] = 0;

        // End position (regs D-F)
        regs[0xd] = (endSamp >> 16) & 0xFF;
        regs[0xe] = (endSamp) & 0xFFFF;
        regs[0xf] = 0;

        // Volume registers: set from velocity
        // regs[0x10] = R volume, regs[0x12] = L volume
        // regs[0x14], regs[0x16] = secondary volume (set to max)
        // Volume values are 16-bit unsigned, mixed as: (sample * vol1 * vol2) >> 32
        float vel = velocity / 127.0f;
        uint16_t vol = static_cast<uint16_t>(vel * m_globalVolume * 0x7FFF);
        regs[0x10] = vol;  // R vol1
        regs[0x12] = vol;  // L vol1
        regs[0x14] = 0x7FFF; // R vol2 (max)
        regs[0x16] = 0x7FFF; // L vol2 (max)

        // Volume deltas (regs 0x11, 0x13, 0x15, 0x17) = 0 (no ramp on attack)
        regs[0x11] = 0;
        regs[0x13] = 0;
        regs[0x15] = 0;
        regs[0x17] = 0;

        // Envelope counter
        regs[0xc] = 0;

        // Flags: bit 0 = active, bit 3 = loop, bit 2 = output(?)
        // 0x0400 = compressed, 0x8000 = 8-bit
        regs[0] = 0x0001 | (hasLoop ? 0x0008 : 0) | (desc.flags & 0x8400);

        // Our MIDI tracking state
        m_midiNote[vi] = note;
        m_voiceActive[vi] = true;
        m_voiceReleasing[vi] = false;
        m_voiceEnv[vi] = 1.0f;
        m_voiceVelocity[vi] = vel;
    }

    void noteOff(int note) {
        for (int i = 0; i < MAX_VOICES; i++) {
            if (m_voiceActive[i] && m_midiNote[i] == note && !m_voiceReleasing[i]) {
                m_voiceReleasing[i] = true;
                // Set volume ramp down via envelope counter + deltas
                // We'll handle this in our own envelope instead of hardware envelope
                // to keep it simple and controllable
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < MAX_VOICES; i++) {
            m_sregs[i][0] &= ~1;  // clear active bit
            m_voiceActive[i] = false;
            m_voiceReleasing[i] = false;
            m_voiceEnv[i] = 0.0f;
            m_midiNote[i] = 0xFF;
        }
    }

    // ── Parameters ──────────────────────────────────────────────────────

    void setParameter(int paramId, double value) {
        switch (paramId) {
            case 0: // volume
                m_globalVolume = static_cast<float>(std::max(0.0, std::min(1.0, value)));
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
                m_globalVolume = value / 127.0f;
                break;
        }
    }

    void pitchBend(int value) {
        m_pitchBendFactor = std::pow(2.0, (value / 8192.0) * 2.0 / 12.0);
    }

    void programChange(int program) {
        // Could select sample banks
    }

    void writeRegister(int offset, int value) {
        // Direct register access (for advanced control)
    }

    // ── Audio rendering ─────────────────────────────────────────────────
    // This is the MAME sound_stream_update loop, adapted for float output.
    // The core sample fetch, interpolation, pitch stepping, loop handling,
    // and volume/envelope ramping match MAME exactly.

    void process(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outLPtr);
        float* outR = reinterpret_cast<float*>(outRPtr);

        if (!m_romData || m_romSize == 0) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        for (int s = 0; s < numSamples; s++) {
            int32_t suml = 0, sumr = 0;

            for (int voice = 0; voice < 0x20; voice++) {
                uint16_t *regs = m_sregs[voice];

                // ── Our envelope processing (outside MAME loop) ─────
                if (m_voiceActive[voice]) {
                    if (m_voiceReleasing[voice]) {
                        m_voiceEnv[voice] -= m_globalRelease;
                        if (m_voiceEnv[voice] <= 0.0f) {
                            m_voiceEnv[voice] = 0.0f;
                            m_voiceActive[voice] = false;
                            regs[0] &= ~1; // deactivate
                            m_midiNote[voice] = 0xFF;
                            continue;
                        }
                        // Scale volume registers by envelope
                        float vel = m_voiceVelocity[voice] * m_voiceEnv[voice];
                        uint16_t vol = static_cast<uint16_t>(vel * m_globalVolume * 0x7FFF);
                        regs[0x10] = vol;
                        regs[0x12] = vol;
                    }
                }

                // ── MAME sound_stream_update core (exact copy) ──────
                if (regs[0] & 0x0001) {
                    uint64_t current = (uint64_t(regs[1]) << 32) | (uint64_t(regs[2]) << 16) | regs[3];
                    uint32_t adr = current >> 16;
                    int16_t samp0, samp1;

                    switch (regs[0] & 0x8400) {
                    case 0x0000: // 16 bits linear
                        samp0 = readWord(2 * adr);
                        samp1 = readWord(2 * adr + 2);
                        break;

                    case 0x8400: // 8 bits compressed
                        samp0 = sample_dec[readByte(adr)];
                        samp1 = sample_dec[readByte(adr + 1)];
                        break;

                    default:
                        samp0 = samp1 = 0;
                        break;
                    }

                    int16_t samp = samp0 + (((samp1 - samp0) * int(current & 0xffff)) >> 16);

                    uint32_t step = 0x10000 | (regs[8] & ~0xf);
                    uint32_t shift = regs[8] & 0xf;
                    if (shift >= 0x8)
                        step >>= 0x10 - shift;
                    else if (shift)
                        step <<= shift;

                    current += step;

                    uint64_t end = (uint64_t(regs[0xd]) << 32) | (uint64_t(regs[0xe]) << 16) | regs[0xf];
                    if (current >= end) {
                        if (regs[0] & 8) {
                            uint64_t loop = (uint64_t(regs[9]) << 32) | (uint64_t(regs[0xa]) << 16) | regs[0xb];
                            while (current >= end)
                                current = current - end + loop;
                        } else {
                            regs[0] = ~1;
                            regs[0xc] = 0;
                            regs[0x10] = regs[0x12] = regs[0x14] = regs[0x16] = 0;
                        }
                    }

                    regs[1] = current >> 32;
                    regs[2] = current >> 16;
                    regs[3] = current;

                    suml += (int64_t(samp) * regs[0x12] * regs[0x16]) >> 32;
                    sumr += (int64_t(samp) * regs[0x10] * regs[0x14]) >> 32;

                    if (regs[0xc]) {
                        regs[0x10] += regs[0x11];
                        regs[0x12] += regs[0x13];
                        regs[0x14] += regs[0x15];
                        regs[0x16] += regs[0x17];
                        regs[0xc]--;
                    }
                }
                // ── End MAME core ───────────────────────────────────
            }

            // MAME normalizes by 32768*32; we convert to float [-1, 1]
            outL[s] = static_cast<float>(suml) / (32768.0f * 32.0f);
            outR[s] = static_cast<float>(sumr) / (32768.0f * 32.0f);
        }
    }

    void getVoiceStatus(uintptr_t outPtr, int maxVoices) {
        int* out = reinterpret_cast<int*>(outPtr);
        int count = std::min(maxVoices, MAX_VOICES);
        for (int i = 0; i < count; i++) {
            out[i * 4 + 0] = m_voiceActive[i] ? 1 : 0;
            out[i * 4 + 1] = m_midiNote[i];
            out[i * 4 + 2] = static_cast<int>(m_voiceEnv[i] * 255);
            out[i * 4 + 3] = m_voiceReleasing[i] ? 1 : 0;
        }
    }

    int getNumSamples() const { return m_numSamples; }

private:
    double   m_sampleRate;
    float    m_globalVolume;
    float    m_globalAttack;
    float    m_globalRelease;
    double   m_pitchBendFactor = 1.0;

    const uint8_t* m_romData;
    int      m_romSize;

    // Voice registers — matches MAME's m_sregs[0x20][0x20]
    uint16_t m_sregs[0x20][0x20];

    // Our MIDI tracking state (not part of MAME)
    int      m_midiNote[MAX_VOICES];
    bool     m_voiceActive[MAX_VOICES];
    bool     m_voiceReleasing[MAX_VOICES];
    float    m_voiceEnv[MAX_VOICES];
    float    m_voiceVelocity[MAX_VOICES];

    // Parsed sample descriptors
    SampleDescriptor m_samples[MAX_SAMPLES];
    int m_numSamples;

    // ── ROM memory access (big-endian, matching MAME) ───────────────────

    uint8_t readByte(uint32_t addr) const {
        if (addr < static_cast<uint32_t>(m_romSize))
            return m_romData[addr];
        return 0;
    }

    int16_t readWord(uint32_t addr) const {
        // Big-endian 16-bit read (matching MAME's ENDIANNESS_BIG)
        if (addr + 1 < static_cast<uint32_t>(m_romSize))
            return static_cast<int16_t>((m_romData[addr] << 8) | m_romData[addr + 1]);
        return 0;
    }

    // ── Sample table scanning ───────────────────────────────────────────
    // Scan the ROM at offset 0x8000 for sample descriptors.
    // The exact descriptor format varies by firmware, but we can infer
    // start/end/loop addresses from the table structure.
    //
    // Known ROM layout (flash.u3, 4MB):
    //   0x00000-0x07FFF: firmware code
    //   0x08000-0x0821F: sample descriptor table (~34 entries x 16 bytes)
    //   0x08220+: sample audio data
    //
    // Each 16-byte descriptor contains pointers into the audio data region.
    // We read them as big-endian 24-bit addresses (3 bytes each for start,
    // loop, end) plus flags.

    void scanSampleTable() {
        m_numSamples = 0;
        if (!m_romData || m_romSize < static_cast<int>(SAMPLE_TABLE_OFFSET + SAMPLE_DESC_SIZE))
            return;

        // Scan descriptors starting at 0x8000
        // Each descriptor: 16 bytes
        // We'll try to detect valid entries by checking if addresses point
        // within the ROM and are non-zero.
        uint32_t tableAddr = SAMPLE_TABLE_OFFSET;
        int maxEntries = std::min(MAX_SAMPLES,
            static_cast<int>((m_romSize - tableAddr) / SAMPLE_DESC_SIZE));

        // Limit scanning to reasonable range (the first ~2KB after table offset)
        maxEntries = std::min(maxEntries, 128);

        for (int i = 0; i < maxEntries; i++) {
            uint32_t descAddr = tableAddr + i * SAMPLE_DESC_SIZE;
            if (descAddr + SAMPLE_DESC_SIZE > static_cast<uint32_t>(m_romSize))
                break;

            // Read descriptor bytes (big-endian)
            // Format assumption based on KS0164 register layout:
            //   bytes 0-2: start address (24-bit, byte address in ROM)
            //   bytes 3-5: loop address
            //   bytes 6-8: end address
            //   byte 9: flags (format, loop enable)
            //   byte 10: base note (MIDI note for unity pitch)
            //   bytes 11-15: reserved/padding
            uint32_t start = (m_romData[descAddr] << 16) |
                             (m_romData[descAddr + 1] << 8) |
                              m_romData[descAddr + 2];
            uint32_t loop  = (m_romData[descAddr + 3] << 16) |
                             (m_romData[descAddr + 4] << 8) |
                              m_romData[descAddr + 5];
            uint32_t end   = (m_romData[descAddr + 6] << 16) |
                             (m_romData[descAddr + 7] << 8) |
                              m_romData[descAddr + 8];
            uint8_t flags  = m_romData[descAddr + 9];
            uint8_t baseNote = m_romData[descAddr + 10];

            // Validate: start must be within ROM, end > start
            if (start == 0 && end == 0) break;  // End of table
            if (start >= static_cast<uint32_t>(m_romSize)) break;
            if (end <= start) continue;
            if (end > static_cast<uint32_t>(m_romSize)) end = m_romSize;
            if (loop < start || loop >= end) loop = start;
            if (baseNote == 0 || baseNote > 127) baseNote = 60;

            SampleDescriptor& desc = m_samples[m_numSamples];
            desc.startAddr = start;
            desc.endAddr = end;
            desc.loopAddr = loop;
            desc.baseNote = baseNote;
            desc.valid = true;

            // Determine format flags for regs[0]
            // If flags byte has bit indicating 8-bit compressed:
            desc.flags = 0;
            if (flags & 0x01) desc.flags |= 0x8400;  // 8-bit compressed
            if (flags & 0x02) desc.flags |= 0x0008;  // loop enable

            m_numSamples++;
        }

        // If we found no valid descriptors, create a fallback that maps
        // the entire audio data region as one 16-bit linear sample
        if (m_numSamples == 0 && m_romSize > static_cast<int>(SAMPLE_TABLE_OFFSET + 0x220)) {
            SampleDescriptor& desc = m_samples[0];
            desc.startAddr = SAMPLE_TABLE_OFFSET + 0x220; // after descriptor table
            desc.endAddr = m_romSize;
            desc.loopAddr = desc.startAddr;
            desc.baseNote = 60;
            desc.flags = 0x0008; // loop, 16-bit linear
            desc.valid = true;
            m_numSamples = 1;
        }
    }

    // ── Sample selection ────────────────────────────────────────────────

    int findSampleForNote(int note) const {
        if (m_numSamples <= 1) return 0;

        // Find sample whose baseNote is closest to the requested note
        int best = 0;
        int bestDist = 999;
        for (int i = 0; i < m_numSamples; i++) {
            int dist = std::abs(note - m_samples[i].baseNote);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    // ── Pitch register encoding ─────────────────────────────────────────
    // The KS0164 pitch register (regs[8]) encodes pitch as:
    //   bits [3:0] = shift amount
    //   bits [15:4] = step mantissa
    // Effective step = (0x10000 | (regs[8] & ~0xf)) shifted by (regs[8] & 0xf)
    //
    // For shift < 8: step <<= shift  (faster playback)
    // For shift >= 8: step >>= (16 - shift)  (slower playback)
    //
    // At unity (1.0x): step = 0x10000, so regs[8] = 0x0000 (shift=0, mantissa=0)

    void encodePitchRegister(double effectiveStep, uint16_t* regs) const {
        // We need: ((0x10000 | mantissa_bits) << shift) / 0x10000 == effectiveStep
        // where mantissa_bits = regs[8] & 0xFFF0

        // Convert to fixed point: target = effectiveStep * 0x10000
        uint32_t target = static_cast<uint32_t>(effectiveStep * 0x10000);

        if (target == 0) {
            regs[8] = 0x0008; // minimum (shift >= 8 means >>8, very slow)
            return;
        }

        // Find the right shift to normalize target into the range where
        // the top bit is at bit 16 (i.e., 0x10000 <= value < 0x20000)
        int shift = 0;
        uint32_t val = target;

        if (val >= 0x10000) {
            // Need left shift (shift < 8 in hardware = left shift)
            while (val >= 0x20000 && shift < 7) {
                val >>= 1;
                shift++;
            }
            // val is now in [0x10000, 0x1FFFF]
            // mantissa = (val - 0x10000) with low 4 bits clear
            uint16_t mantissa = (val & 0xFFFF) & 0xFFF0;
            regs[8] = mantissa | (shift & 0xF);
        } else {
            // Need right shift (shift >= 8 in hardware = right shift)
            // shift_amount = 16 - shift_reg_value
            // step >>= shift_amount
            int rshift = 0;
            while (val < 0x10000 && rshift < 8) {
                val <<= 1;
                rshift++;
            }
            // val is now in [0x10000, 0x1FFFF]
            uint16_t mantissa = (val & 0xFFFF) & 0xFFF0;
            // Hardware shift value for right shift: 16 - rshift
            int hwShift = 16 - rshift;
            if (hwShift < 8) hwShift = 8;  // minimum for right-shift mode
            if (hwShift > 15) hwShift = 15;
            regs[8] = mantissa | (hwShift & 0xF);
        }
    }

    // ── Voice allocation ────────────────────────────────────────────────

    int findFreeVoice(int midiNote) {
        // Reuse voice already playing this note
        for (int i = 0; i < MAX_VOICES; i++)
            if (m_voiceActive[i] && m_midiNote[i] == midiNote) return i;
        // Find free voice
        for (int i = 0; i < MAX_VOICES; i++)
            if (!m_voiceActive[i]) return i;
        // Steal releasing voice with lowest envelope
        int best = -1;
        float bestEnv = 2.0f;
        for (int i = 0; i < MAX_VOICES; i++) {
            if (m_voiceReleasing[i] && m_voiceEnv[i] < bestEnv) {
                best = i;
                bestEnv = m_voiceEnv[i];
            }
        }
        if (best >= 0) return best;
        // Last resort: steal oldest voice (voice 0)
        return 0;
    }
};

} // namespace devilbox

#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(KS0164Synth) {
    emscripten::class_<KS0164Synth>("KS0164Synth")
        .constructor<>()
        .function("setSampleRate", &KS0164Synth::setSampleRate)
        .function("getSampleRate", &KS0164Synth::getSampleRate)
        .function("noteOn", &KS0164Synth::noteOn)
        .function("noteOff", &KS0164Synth::noteOff)
        .function("allNotesOff", &KS0164Synth::allNotesOff)
        .function("setParameter", &KS0164Synth::setParameter)
        .function("controlChange", &KS0164Synth::controlChange)
        .function("pitchBend", &KS0164Synth::pitchBend)
        .function("programChange", &KS0164Synth::programChange)
        .function("writeRegister", &KS0164Synth::writeRegister)
        .function("loadROM", &KS0164Synth::loadROM)
        .function("process", &KS0164Synth::process)
        .function("getVoiceStatus", &KS0164Synth::getVoiceStatus)
        .function("getNumSamples", &KS0164Synth::getNumSamples);
}
#endif
