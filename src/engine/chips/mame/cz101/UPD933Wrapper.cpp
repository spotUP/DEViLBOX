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
// One voice at full level peaks at 1/8 of the 16-bit range (the chip sums eight);
// this makes a single note a sensible level instead of -18 dBFS.
static constexpr float OUTPUT_GAIN = 4.0f;

// Envelope structure
struct Envelope {
    uint8_t direction = 0;
    uint8_t sustain = 1;
    bool irq = false;
    uint32_t rate = 0;
    uint32_t target = 0;
    uint32_t current = 0;

    // MAME upd933.cpp env_t::update(): the envelope always moves toward its
    // target; the sustain flag only decides whether arriving raises the
    // (one-shot) interrupt that the CZ firmware uses to load the next stage.
    void update() {
        if (current != target) {
            if (!direction) {
                if (current > target || target - current <= rate) current = target;
                else current += rate;
            } else {
                if (current < target || current - target <= rate) current = target;
                else current -= rate;
            }
        }
        if (!sustain && current == target) irq = sustain = true;
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
            output[i] = std::max(-1.0f, std::min(1.0f, sample * (OUTPUT_GAIN / 32768.0f)));

            m_sampleCount++;
        }
    }

    float* getBuffer() { return m_outputBuffer; }

    // Envelope inspection for the stage sequencer (kind 0 = DCA, 1 = DCW, 2 = DCO).
    // level() is in the units of the step register's level field.
    int takeIrq(int kind, int vnum) {
        Envelope& e = env(kind, vnum);
        int fired = e.irq ? 1 : 0;
        e.irq = false;
        return fired;
    }
    int level(int kind, int vnum) {
        static const unsigned shift[3] = {ENV_DCA_SHIFT + 2, ENV_DCW_SHIFT + 3, ENV_DCO_SHIFT + 5};
        return (int)(env(kind, vnum).current >> shift[kind]);
    }

    void setCS(int state) { m_cs = state; }
    void setID(int state) { m_id = state; }

private:
    Envelope& env(int kind, int vnum) {
        vnum &= 7;
        return kind == 0 ? m_dca[vnum] : kind == 1 ? m_dcw[vnum] : m_dco[vnum];
    }

    uint32_t envRate(uint8_t data) const {
        return (8 | (data & 7)) << (data >> 3);
    }

    // MAME upd933.cpp update_pitch_step(): base pitch + DCO offset + pitch modulation
    void updatePitchStep(int vnum) {
        Voice& voice = m_voice[vnum];
        const int32_t pitch = (int32_t)(voice.pitch + (m_dco[vnum].current >> ENV_DCO_SHIFT)) + voice.pmLevel;
        uint32_t step = 0;

        if (pitch > 0 && pitch < (1 << 16)) {
            const uint8_t note = pitch >> NOTE_SHIFT;
            const uint16_t fine = pitch & ((1 << NOTE_SHIFT) - 1);
            step = m_pitch[note & 0x7F];
            if (fine) step += (step >> PITCH_FINE_SHIFT) * m_pitchFine[fine];
        }
        voice.pitchStep = step;

        // The effective DCW value is limited for high pitches (keeps narrow pulses
        // audible and stops aliasing noise).
        voice.dcwLimit = 0x400 - std::min<uint32_t>(0x400, step >> (PITCH_SHIFT - 2));
    }

    // MAME upd933.cpp update(): transfer function, window, ring mod, envelopes,
    // pitch modulation. Voices must be processed in voiceMap order so m_lastSample
    // is the partner line's output.
    int16_t updateVoice(int vnum) {
        Voice& voice = m_voice[vnum];

        const uint16_t pos = (voice.position >> PITCH_SHIFT) & 0x7FF;
        const uint8_t wave = (voice.position >> (PITCH_SHIFT + 11)) & 1;

        const uint16_t dcw = std::min<uint16_t>(m_dcw[vnum].current >> ENV_DCW_SHIFT, voice.dcwLimit);
        const uint16_t pivot = 0x400 - dcw;
        uint16_t phase = 0;
        uint16_t window = 0;

        switch (voice.wave[wave] & 7) {
            case 0: // sawtooth
                if (pos < pivot) phase = pos * 0x400 / pivot;
                else phase = 0x400 + (pos - pivot) * 0x400 / (0x800 - pivot);
                break;
            case 1: // square
                if ((pos & 0x3FF) < pivot) phase = (pos & 0x3FF) * 0x400 / pivot;
                else phase = 0x3FF;
                phase |= (pos & 0x400);
                break;
            case 2: // pulse
                if (pos < pivot * 2) phase = pos * 0x800 / (pivot * 2);
                else phase = 0x7FF;
                break;
            case 3: // silent
                break;
            case 4: // double sine
                if (pos < pivot) phase = pos * 0x800 / pivot;
                else phase = (pos - pivot) * 0x800 / (0x800 - pivot);
                break;
            case 5: // saw pulse
                if (pos < 0x400) phase = pos;
                else if (pos < (pivot + 0x400)) phase = 0x400 + (pos & 0x3FF) * 0x400 / pivot;
                else phase = 0x7FF;
                break;
            case 6: // resonance: multiplies the frequency by the DCW level, hard-synced
                phase = (pos + ((pos * dcw) >> 6)) & 0x7FF;
                break;
            case 7: // double pulse
                if ((pos & 0x3FF) < pivot) phase = (pos & 0x3FF) * 0x400 / pivot;
                else phase = 0x7FF;
                break;
        }

        switch (voice.window & 7) {
            case 0: break;
            case 1: window = pos; break;
            case 2:
                window = (pos & 0x3FF) * 2;
                if (pos < 0x400) window ^= 0x7FE;
                break;
            case 3:
                if (pos >= 0x400) window = (pos & 0x3FF) * 2;
                break;
            case 4:
                if (pos < 0x400) window = pos * 2;
                else window = 0x7FF;
                break;
            default:
                window = (0x3FF ^ (pos & 0x3FF)) * 2;
                break;
        }

        int32_t sample = m_cosine[phase];
        if (window) sample = (sample * (0x800 - window)) / 0x800;

        // center around zero, apply volume (9-bit index, MAME upd933.cpp:509-511) and ring mod
        const uint32_t vol = m_volume[(m_dca[vnum].current >> ENV_DCA_SHIFT) & 0x1FF];
        sample = (sample * (int32_t)vol) >> VOLUME_SHIFT;
        sample -= (int32_t)(vol / 2);

        if (voice.ringMod) sample = (sample * m_lastSample) / 0x1000;
        if (voice.muteOther) sample -= m_lastSample;

        const uint32_t oldDco = m_dco[vnum].current;
        const int16_t oldPm = voice.pmLevel;

        m_dca[vnum].update();
        m_dcw[vnum].update();
        m_dco[vnum].update();

        // pitch/noise modulation latches a new pitch multiplier every 8 samples
        if (!(m_sampleCount & 7)) {
            switch (voice.pitchMod & 3) {
                default: voice.pmLevel = 0; break;
                case 2: voice.pmLevel = m_lastSample; break;
                case 3: voice.pmLevel = (int16_t)(nextRandom() & (32 << NOTE_SHIFT)); break;
            }
        }

        if (((oldDco ^ m_dco[vnum].current) >> ENV_DCO_SHIFT) || oldPm != voice.pmLevel)
            updatePitchStep(vnum);

        voice.position += voice.pitchStep;

        if (sample > 32767) sample = 32767;
        if (sample < -32768) sample = -32768;
        m_lastSample = (int16_t)sample;
        return (int16_t)sample;
    }

    uint32_t nextRandom() {
        m_rng = m_rng * 1664525u + 1013904223u;
        return m_rng >> 8;
    }

    uint32_t m_clock;
    uint32_t m_sampleRate;

    uint8_t m_cs, m_id;
    uint8_t m_soundData[2];
    uint8_t m_soundDataPos;
    std::array<uint16_t, 256> m_soundRegs;
    uint32_t m_sampleCount;
    int16_t m_lastSample;
    uint32_t m_rng = 12345;

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
int upd933_env_irq(int kind, int voice) {
    return g_upd933 ? g_upd933->takeIrq(kind, voice) : 0;
}

EMSCRIPTEN_KEEPALIVE
int upd933_env_level(int kind, int voice) {
    return g_upd933 ? g_upd933->level(kind, voice) : 0;
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
