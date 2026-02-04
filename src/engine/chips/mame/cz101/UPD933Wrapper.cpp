/**
 * UPD933 WASM Wrapper for CZ-101 Synth
 *
 * Standalone wrapper for the NEC uPD933 Phase Distortion chip
 * to be compiled to WebAssembly with Emscripten.
 */

#include <emscripten.h>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <array>

// Constants from UPD933
static constexpr unsigned CLOCKS_PER_SAMPLE = 112;
static constexpr unsigned NOTE_SHIFT = 9;
static constexpr unsigned PITCH_SHIFT = 20;
static constexpr unsigned PITCH_FINE_SHIFT = 12;
static constexpr unsigned VOLUME_SHIFT = 12;
static constexpr unsigned ENV_DCA_SHIFT = 16;
static constexpr unsigned ENV_DCW_SHIFT = 16;
static constexpr unsigned ENV_DCO_SHIFT = 11;

// Envelope structure
struct Envelope {
    uint8_t direction = 0;
    uint8_t sustain = 1;
    bool irq = false;
    uint32_t rate = 0;
    uint32_t target = 0;
    uint32_t current = 0;

    void update() {
        if (!sustain) {
            if (direction) {
                // Falling
                if (current > rate) current -= rate;
                else current = 0;
                if (current <= target) {
                    current = target;
                    irq = true;
                }
            } else {
                // Rising
                current += rate;
                if (current >= target) {
                    current = target;
                    irq = true;
                }
            }
        }
    }
};

// Voice structure
struct Voice {
    uint8_t wave[2] = {0, 0};
    uint8_t window = 0;
    uint8_t ringMod = 0;
    uint8_t pitchMod = 0;
    uint8_t muteOther = 0;

    uint16_t pitch = 0;
    uint32_t position = 0;
    uint32_t pitchStep = 0;
    uint16_t dcwLimit = 0;
    int16_t pmLevel = 0;
};

// UPD933 State
class UPD933 {
public:
    UPD933(uint32_t clock) : m_clock(clock) {
        m_sampleRate = clock / CLOCKS_PER_SAMPLE;

        // Initialize cosine table
        for (int i = 0; i < 0x800; i++) {
            m_cosine[i] = 0xfff * (1 - cos(2.0 * M_PI * i / 0x7ff)) / 2;
        }

        // Initialize pitch table (A4 = note 62 = 442Hz)
        for (int i = 0; i < 0x80; i++) {
            double freq = 442.0 * pow(2, (i - 62) / 12.0);
            m_pitch[i] = (1 << PITCH_SHIFT) * (freq * 0x800 / 40000);
        }

        // Initialize fine pitch table
        for (int i = 0; i < 0x200; i++) {
            m_pitchFine[i] = (1 << PITCH_FINE_SHIFT) * (pow(2, (double)i / (12.0 * 0x200)) - 1);
        }

        // Initialize volume table
        for (int i = 1; i < 0x200; i++) {
            m_volume[i] = pow(2 << VOLUME_SHIFT, (double)i / 0x1ff);
        }
        m_volume[0] = 0;

        reset();
    }

    void reset() {
        m_cs = 1;
        m_id = 1;
        m_soundDataPos = 0;
        m_soundData[0] = m_soundData[1] = 0;
        m_soundRegs.fill(0);
        m_sampleCount = 0;
        m_lastSample = 0;

        for (auto& v : m_voice) v = Voice();
        for (auto& e : m_dca) e = Envelope();
        for (auto& e : m_dcw) e = Envelope();
        for (auto& e : m_dco) e = Envelope();
    }

    void write(uint8_t data) {
        if (m_cs) return;

        if (m_soundDataPos >= 2) {
            uint8_t reg = m_soundData[0];
            uint16_t value = (m_soundData[1] << 8) | data;
            m_soundRegs[reg] = value;

            int vnum = reg & 7;
            Voice& voice = m_voice[vnum];
            Voice& modVoice = m_voice[(vnum + 6) & 7];

            m_soundDataPos = 0;

            switch (reg >> 3) {
                case 0x0: // DCA step
                    {
                        Envelope& dca = m_dca[vnum];
                        dca.direction = (value >> 15) & 1;
                        dca.rate = envRate((value >> 8) & 0x7F);
                        dca.sustain = (value >> 7) & 1;
                        dca.target = (value & 0x7F) << (ENV_DCA_SHIFT + 2);
                        dca.irq = false;
                    }
                    break;

                case 0x2: // DCO step
                    {
                        Envelope& dco = m_dco[vnum];
                        dco.direction = (value >> 15) & 1;
                        dco.rate = envRate((value >> 8) & 0x7F);
                        dco.sustain = (value >> 7) & 1;
                        dco.target = (value & 0x3F) << (ENV_DCO_SHIFT + 5);
                        if (value & 0x40) dco.target <<= 5;
                        dco.irq = false;
                    }
                    break;

                case 0x4: // DCW step
                    {
                        Envelope& dcw = m_dcw[vnum];
                        dcw.direction = (value >> 15) & 1;
                        dcw.rate = envRate((value >> 8) & 0x7F);
                        dcw.sustain = (value >> 7) & 1;
                        dcw.target = (value & 0x7F) << (ENV_DCW_SHIFT + 3);
                        dcw.irq = false;
                    }
                    break;

                case 0xC: // Pitch
                    voice.pitch = value;
                    updatePitchStep(vnum);
                    break;

                case 0xD: // Waveform
                    voice.wave[0] = (value >> 13) & 7;
                    if (value & 0x200) {
                        voice.wave[1] = (value >> 10) & 7;
                    } else {
                        voice.wave[1] = voice.wave[0];
                    }
                    voice.window = (value >> 6) & 7;
                    if (!(vnum & 1)) {
                        modVoice.ringMod = (value >> 5) & 1;
                        modVoice.pitchMod = (value >> 3) & 3;
                        modVoice.muteOther = (value >> 2) & 1;
                    }
                    break;

                case 0x13: // Phase counter
                    voice.position = value << (PITCH_SHIFT - 4);
                    break;

                case 0x17: // Pitch modulator
                    if (vnum < 4) {
                        m_voice[vnum << 1].pmLevel = (int16_t)value;
                    }
                    break;
            }
        } else {
            m_soundData[m_soundDataPos++] = data;
        }
    }

    void render(float* output, uint32_t numSamples) {
        static const int voiceMap[] = {5, 0, 7, 2, 1, 4, 3, 6};

        for (uint32_t i = 0; i < numSamples; i++) {
            int32_t sample = 0;

            for (int j : voiceMap) {
                sample += updateVoice(j);
            }

            // Clamp to 16-bit range and convert to float
            if (sample > 32767) sample = 32767;
            if (sample < -32768) sample = -32768;
            output[i] = sample / 32768.0f;

            m_sampleCount++;
        }
    }

    float* getBuffer() { return m_outputBuffer; }

    void setCS(int state) { m_cs = state; }
    void setID(int state) { m_id = state; }

private:
    uint32_t envRate(uint8_t data) const {
        return (8 | (data & 7)) << (data >> 3);
    }

    void updatePitchStep(int vnum) {
        Voice& voice = m_voice[vnum];
        uint32_t note = voice.pitch >> NOTE_SHIFT;
        uint32_t fine = voice.pitch & ((1 << NOTE_SHIFT) - 1);

        if (note >= 0x80) note = 0x7F;

        uint32_t step = m_pitch[note];
        step += (step >> PITCH_FINE_SHIFT) * m_pitchFine[fine];
        voice.pitchStep = step;
    }

    int16_t updateVoice(int vnum) {
        Voice& voice = m_voice[vnum];
        Envelope& dca = m_dca[vnum];
        Envelope& dcw = m_dcw[vnum];
        Envelope& dco = m_dco[vnum];

        // Update envelopes
        dca.update();
        dcw.update();
        dco.update();

        if (dca.current == 0) return 0;

        uint16_t pos = (voice.position >> PITCH_SHIFT) & 0x7FF;
        uint8_t wave = (voice.position >> (PITCH_SHIFT + 11)) & 1;

        uint16_t dcwVal = std::min<uint16_t>(dcw.current >> ENV_DCW_SHIFT, voice.dcwLimit > 0 ? voice.dcwLimit : 0x3FF);
        uint16_t pivot = 0x400 - dcwVal;
        uint16_t phase = 0;

        // Apply transfer function
        switch (voice.wave[wave] & 7) {
            case 0: // Sawtooth
                if (pos < pivot)
                    phase = pos * 0x400 / std::max<uint16_t>(pivot, 1);
                else
                    phase = 0x400 + (pos - pivot) * 0x400 / std::max<uint16_t>(0x800 - pivot, 1);
                break;

            case 1: // Square
                if ((pos & 0x3FF) < pivot)
                    phase = (pos & 0x3FF) * 0x400 / std::max<uint16_t>(pivot, 1);
                else
                    phase = 0x3FF;
                phase |= (pos & 0x400);
                break;

            case 2: // Pulse
                if (pos < pivot * 2)
                    phase = pos * 0x800 / std::max<uint16_t>(pivot * 2, 1);
                else
                    phase = 0x7FF;
                break;

            case 3: // Silent
                phase = 0;
                break;

            case 4: // Double sine
                if (pos < pivot)
                    phase = pos * 0x800 / std::max<uint16_t>(pivot, 1);
                else
                    phase = (pos - pivot) * 0x800 / std::max<uint16_t>(0x800 - pivot, 1);
                break;

            case 5: // Saw pulse
                if (pos < 0x400)
                    phase = pos;
                else if (pos < (pivot + 0x400))
                    phase = 0x400 + (pos & 0x3FF) * 0x400 / std::max<uint16_t>(pivot, 1);
                else
                    phase = 0x7FF;
                break;

            case 6: // Resonance
                phase = pos + ((pos * dcwVal) >> 6);
                phase &= 0x7FF;
                break;

            case 7: // Double pulse
                if ((pos & 0x3FF) < pivot)
                    phase = (pos & 0x3FF) * 0x400 / std::max<uint16_t>(pivot, 1);
                else
                    phase = 0x7FF;
                break;
        }

        // Get waveform sample
        int16_t sample = m_cosine[phase & 0x7FF];

        // Apply volume
        uint32_t vol = m_volume[dca.current >> (ENV_DCA_SHIFT + 2)];
        sample = (sample * vol) >> VOLUME_SHIFT;

        // Advance phase
        voice.position += voice.pitchStep;

        return sample;
    }

    uint32_t m_clock;
    uint32_t m_sampleRate;

    uint8_t m_cs, m_id;
    uint8_t m_soundData[2];
    uint8_t m_soundDataPos;
    std::array<uint16_t, 256> m_soundRegs;
    uint32_t m_sampleCount;
    int16_t m_lastSample;

    uint16_t m_cosine[0x800];
    uint32_t m_pitch[0x80];
    uint16_t m_pitchFine[0x200];
    uint16_t m_volume[0x200];

    std::array<Voice, 8> m_voice;
    std::array<Envelope, 8> m_dca, m_dcw, m_dco;

    float m_outputBuffer[4096];
};

// Global instance
static UPD933* g_upd933 = nullptr;

extern "C" {

EMSCRIPTEN_KEEPALIVE
int upd933_create(uint32_t clock) {
    if (g_upd933) delete g_upd933;
    g_upd933 = new UPD933(clock);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void upd933_destroy() {
    if (g_upd933) {
        delete g_upd933;
        g_upd933 = nullptr;
    }
}

EMSCRIPTEN_KEEPALIVE
void upd933_reset() {
    if (g_upd933) g_upd933->reset();
}

EMSCRIPTEN_KEEPALIVE
void upd933_write(uint8_t data) {
    if (g_upd933) g_upd933->write(data);
}

EMSCRIPTEN_KEEPALIVE
void upd933_set_cs(int state) {
    if (g_upd933) g_upd933->setCS(state);
}

EMSCRIPTEN_KEEPALIVE
void upd933_render(uint32_t numSamples) {
    if (g_upd933) g_upd933->render(g_upd933->getBuffer(), numSamples);
}

EMSCRIPTEN_KEEPALIVE
void* upd933_get_buffer() {
    return g_upd933 ? (void*)g_upd933->getBuffer() : nullptr;
}

} // extern "C"
