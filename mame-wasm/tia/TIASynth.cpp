/**
 * TIA (Television Interface Adaptor) Sound Synthesizer for DEViLBOX
 *
 * Inspired by the Atari 2600 TIA chip sound generation hardware.
 *
 * The TIA produces sound using polynomial counter-based synthesis,
 * a unique approach that creates the distinctive "Atari" sound.
 * Each channel has 16 audio control modes combining polynomial
 * counters (4-bit, 5-bit, 9-bit), divide-by-31, and pure tone
 * generation with a 5-bit frequency divider and 4-bit volume.
 *
 * Features:
 * - 4-voice polyphony (4 independent TIA channel pairs)
 * - 16 audio control modes per channel (AUDC)
 * - 3 polynomial counters: POLY4 (15), POLY5 (31), POLY9 (511)
 * - Pure tone (square wave), noise, and hybrid modes
 * - Div-by-31 and Div-by-3 clock modifiers
 * - 5-bit frequency divider (AUDF: 0-31)
 * - Authentic polynomial generation from hardware analysis
 * - MIDI note quantization to TIA frequency grid (part of the charm!)
 *
 * Used in: Atari 2600 (1977) - Pitfall!, Space Invaders, Adventure,
 * Combat, Yars' Revenge, River Raid, and 400+ other games
 *
 * License: BSD-3-Clause
 */

#include <emscripten/bind.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>

namespace devilbox {

// ============================================================================
// TIA Sound Constants
// ============================================================================

// Polynomial sizes
static constexpr int POLY4_SIZE = 15;
static constexpr int POLY5_SIZE = 31;
static constexpr int POLY9_SIZE = 511;

// Audio control modes (AUDC register values)
enum TIAMode {
    MODE_SET_TO_1    = 0x00,  // Constant output
    MODE_POLY4       = 0x01,  // 4-bit polynomial (buzzy metallic)
    MODE_DIV31_POLY4 = 0x02,  // Div31 -> Poly4 (low rumble)
    MODE_POLY5_POLY4 = 0x03,  // Poly5 -> Poly4 (complex noise)
    MODE_PURE        = 0x04,  // Pure tone (square wave)
    MODE_PURE2       = 0x05,  // Pure tone variant
    MODE_DIV31_PURE  = 0x06,  // Div31 -> Pure (bass/explosion)
    MODE_POLY5_2     = 0x07,  // Poly5 variant (engine rumble)
    MODE_POLY9       = 0x08,  // 9-bit polynomial (white noise)
    MODE_POLY5       = 0x09,  // 5-bit polynomial (pink-ish noise)
    MODE_DIV31_POLY5 = 0x0A,  // Div31 -> Poly5 (low noise)
    MODE_POLY5_POLY5 = 0x0B,  // Volume only
    MODE_DIV3_PURE   = 0x0C,  // Div3 -> Pure (bass square)
    MODE_DIV3_PURE2  = 0x0D,  // Div3 -> Pure variant
    MODE_DIV93_PURE  = 0x0E,  // Div93 -> Pure (very low bass)
    MODE_POLY5_DIV3  = 0x0F,  // Poly5 -> Div3 (complex bass)
};

#define DIV3_MASK 0x0C

// Div31 pattern (13:18 duty cycle)
static const uint8_t Div31[POLY5_SIZE] = {
    0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
};

// ============================================================================
// Parameter IDs
// ============================================================================
enum TIAParamId {
    PARAM_VOLUME = 0,
    PARAM_AUDC_MODE = 1,     // 0-15
    PARAM_AUDF_FINE = 2,     // Fine frequency adjustment
    PARAM_STEREO_WIDTH = 3,
    PARAM_DETUNE = 4,        // Slight detune between paired channels
    PARAM_POLY_RESET = 5,    // Reset polynomial counters
};

// ============================================================================
// Single TIA Channel (one of 2 per voice)
// ============================================================================
struct TIAChannel {
    uint8_t audc = 0;      // Audio control (0-15)
    uint8_t audf = 0;      // Audio frequency divider (0-31)
    uint8_t audv = 0;      // Audio volume (0-15)

    int16_t outvol = 0;    // Current output volume
    uint8_t div_n_cnt = 0;  // Divide-by-N counter
    uint8_t div_n_max = 0;  // Divide-by-N maximum
    uint8_t div_3_cnt = 3;  // Divide-by-3 counter

    uint8_t p4 = 0;        // Poly4 position
    uint8_t p5 = 0;        // Poly5 position
    uint16_t p9 = 0;       // Poly9 position

    void reset() {
        audc = MODE_PURE;
        audf = 0;
        audv = 0;
        outvol = 0;
        div_n_cnt = 0;
        div_n_max = 0;
        div_3_cnt = 3;
        p4 = 0;
        p5 = 0;
        p9 = 0;
    }

    void setFreqAndMode(uint8_t freq, uint8_t mode) {
        audc = mode & 0x0F;
        audf = freq & 0x1F;

        // Calculate divide-by-N value
        if (audc == MODE_SET_TO_1 || audc == MODE_POLY5_POLY5) {
            div_n_max = 0;
            outvol = audv << 10;
        } else {
            uint16_t new_val = audf + 1;
            if ((audc & DIV3_MASK) == DIV3_MASK && audc != MODE_POLY5_DIV3) {
                new_val *= 3;
            }
            div_n_max = new_val;
            div_n_cnt = new_val;
        }
    }
};

// ============================================================================
// TIA Voice (pair of channels + envelope)
// ============================================================================
struct TIAVoice {
    TIAChannel ch[2];

    bool active = false;
    int midi_note = -1;
    float velocity = 0.0f;

    // Simple envelope
    float env_level = 0.0f;
    float env_attack_rate = 0.0f;
    float env_decay_rate = 0.0f;
    float env_sustain = 0.0f;
    float env_release_rate = 0.0f;
    uint8_t env_stage = 0;  // 0=attack, 1=decay, 2=sustain, 3=release

    // Phase accumulator for rate conversion
    double phase_acc = 0.0;

    void reset() {
        ch[0].reset();
        ch[1].reset();
        active = false;
        midi_note = -1;
        velocity = 0.0f;
        env_level = 0.0f;
        env_stage = 0;
        phase_acc = 0.0;
    }
};

// ============================================================================
// Main TIA Synth Class
// ============================================================================
class TIASynth {
public:
    static constexpr int NUM_VOICES = 4;
    // NTSC TIA clock: 3.579545 MHz / 114 = ~31,400 Hz
    static constexpr double TIA_CLOCK = 31400.0;

    TIASynth() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        rateRatio_ = TIA_CLOCK / sampleRate;
        volume_ = 0.8f;
        stereoWidth_ = 0.5f;
        currentMode_ = MODE_PURE;
        detune_ = 0.0f;
        pitchBendFactor_ = 1.0f;

        // Initialize polynomial tables
        polyInit(poly4_, POLY4_SIZE, 4, 4, 3);
        polyInit(poly5_, POLY5_SIZE, 5, 5, 3);
        polyInit(poly9_, POLY9_SIZE, 9, 9, 5);

        // Precompute MIDI note -> AUDF mapping
        // TIA frequency = TIA_CLOCK / (AUDF+1) / 2 for pure tone
        // For div3 modes: freq = TIA_CLOCK / ((AUDF+1)*3) / 2
        for (int note = 0; note < 128; note++) {
            float freq = 440.0f * powf(2.0f, (note - 69) / 12.0f);
            // Find best AUDF for pure mode
            float bestDiff = 999999.0f;
            uint8_t bestAudf = 0;
            for (int f = 0; f < 32; f++) {
                float tiaFreq = (float)(TIA_CLOCK / (f + 1) / 2.0);
                float diff = fabsf(tiaFreq - freq);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestAudf = f;
                }
            }
            noteToAudf_[note] = bestAudf;
        }

        // Pan positions
        panPositions_[0] = -0.3f;
        panPositions_[1] = 0.3f;
        panPositions_[2] = -0.15f;
        panPositions_[3] = 0.15f;

        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
            lastVoiceOutput_[i] = 0.0f;
        }
    }

    // ========================================================================
    // Polynomial initialization
    // ========================================================================

    void polyInit(uint8_t* poly, int size, int bits, int f0, int f1) {
        int mask = (1 << bits) - 1;
        int x = mask;
        for (int i = 0; i < size; i++) {
            int bit0 = ((bits - f0) ? (x >> (bits - f0)) : x) & 0x01;
            int bit1 = ((bits - f1) ? (x >> (bits - f1)) : x) & 0x01;
            poly[i] = x & 1;
            x = (x >> 1) | ((bit0 ^ bit1) << (bits - 1));
        }
    }

    // ========================================================================
    // Core TIA channel update (faithful to hardware behavior)
    // ========================================================================

    void updateChannel(TIAChannel& ch) {
        if (ch.div_n_cnt > 1) {
            ch.div_n_cnt--;
            return;
        }

        if (ch.div_n_cnt != 1) return;

        int prev_bit5 = poly5_[ch.p5];
        ch.div_n_cnt = ch.div_n_max;

        // Advance poly5 counter
        ch.p5++;
        if (ch.p5 >= POLY5_SIZE) ch.p5 = 0;

        // Check clock modifier for clock tick
        uint8_t audc = ch.audc;
        bool clock_tick = false;

        if ((audc & 0x02) == 0 ||
            ((audc & 0x01) == 0 && Div31[ch.p5]) ||
            ((audc & 0x01) == 1 && poly5_[ch.p5]) ||
            ((audc & 0x0F) == MODE_POLY5_DIV3 && poly5_[ch.p5] != prev_bit5)) {
            clock_tick = true;
        }

        if (!clock_tick) return;

        int16_t audv = ch.audv << 10;  // AUDV_SHIFT = 10

        if (audc & 0x04) {  // Pure modified clock
            if ((audc & 0x0F) == MODE_POLY5_DIV3) {
                if (poly5_[ch.p5] != prev_bit5) {
                    ch.div_3_cnt--;
                    if (!ch.div_3_cnt) {
                        ch.div_3_cnt = 3;
                        ch.outvol = ch.outvol ? 0 : audv;
                    }
                }
            } else {
                ch.outvol = ch.outvol ? 0 : audv;
            }
        } else if (audc & 0x08) {  // Poly5/Poly9
            if (audc == MODE_POLY9) {
                ch.p9++;
                if (ch.p9 >= POLY9_SIZE) ch.p9 = 0;
                ch.outvol = poly9_[ch.p9] ? audv : 0;
            } else if (audc & 0x02) {
                ch.outvol = (ch.outvol || (audc & 0x01)) ? 0 : audv;
            } else {
                ch.outvol = poly5_[ch.p5] ? audv : 0;
            }
        } else {  // Poly4
            ch.p4++;
            if (ch.p4 >= POLY4_SIZE) ch.p4 = 0;
            ch.outvol = poly4_[ch.p4] ? audv : 0;
        }
    }

    // ========================================================================
    // Generate one internal sample for a voice
    // ========================================================================

    float generateInternalSample(TIAVoice& v) {
        updateChannel(v.ch[0]);
        updateChannel(v.ch[1]);

        int32_t sample = v.ch[0].outvol + v.ch[1].outvol;
        return (float)sample / 32768.0f;
    }

    // ========================================================================
    // Process one output sample for a voice (with rate conversion)
    // ========================================================================

    float processVoice(TIAVoice& v, int voiceIdx) {
        v.phase_acc += rateRatio_;

        float output = lastVoiceOutput_[voiceIdx];
        while (v.phase_acc >= 1.0) {
            v.phase_acc -= 1.0;
            output = generateInternalSample(v);
        }

        // Linear interpolation
        float prev = lastVoiceOutput_[voiceIdx];
        float interp = prev + (output - prev) * (float)v.phase_acc;
        lastVoiceOutput_[voiceIdx] = output;

        return interp;
    }

    // ========================================================================
    // Envelope update
    // ========================================================================

    void updateEnvelope(TIAVoice& v) {
        switch (v.env_stage) {
            case 0: // Attack
                v.env_level += v.env_attack_rate;
                if (v.env_level >= 1.0f) {
                    v.env_level = 1.0f;
                    v.env_stage = 1;
                }
                break;
            case 1: // Decay
                v.env_level -= v.env_decay_rate;
                if (v.env_level <= v.env_sustain) {
                    v.env_level = v.env_sustain;
                    v.env_stage = 2;
                }
                break;
            case 2: // Sustain
                break;
            case 3: // Release
                v.env_level -= v.env_release_rate;
                if (v.env_level <= 0.0f) {
                    v.env_level = 0.0f;
                    v.active = false;
                }
                break;
        }
    }

    // ========================================================================
    // MIDI interface
    // ========================================================================

    void noteOn(int note, int velocity) {
        if (velocity == 0) {
            noteOff(note);
            return;
        }

        int voiceIdx = allocateVoice();
        TIAVoice& v = voices_[voiceIdx];

        v.reset();
        v.active = true;
        v.midi_note = note;
        v.velocity = velocity / 127.0f;

        // Map MIDI note to AUDF
        uint8_t audf = noteToAudf_[note];

        // Set up both channels
        v.ch[0].audv = 15;  // Max volume
        v.ch[0].setFreqAndMode(audf, currentMode_);

        // Second channel with slight detune for thickness
        int audf2 = audf;
        if (detune_ > 0.0f && audf < 31) {
            audf2 = std::min(31, audf + 1);
        }
        v.ch[1].audv = 15;
        v.ch[1].setFreqAndMode(audf2, currentMode_);

        // Set envelope parameters
        float envScale = 1.0f / sampleRate_;
        v.env_attack_rate = 200.0f * envScale;   // Fast attack
        v.env_decay_rate = 5.0f * envScale;      // Slow decay
        v.env_sustain = 0.7f;
        v.env_release_rate = 20.0f * envScale;   // Medium release
        v.env_level = 0.0f;
        v.env_stage = 0;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midi_note == note) {
                voices_[i].env_stage = 3;  // Release
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].active = false;
            voices_[i].env_level = 0.0f;
        }
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                volume_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_AUDC_MODE:
                currentMode_ = std::clamp((int)value, 0, 15);
                // Update active voices
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        voices_[i].ch[0].setFreqAndMode(voices_[i].ch[0].audf, currentMode_);
                        voices_[i].ch[1].setFreqAndMode(voices_[i].ch[1].audf, currentMode_);
                    }
                }
                break;
            case PARAM_AUDF_FINE:
                // Adjust AUDF for all active voices
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int newAudf = std::clamp((int)value, 0, 31);
                        voices_[i].ch[0].setFreqAndMode(newAudf, voices_[i].ch[0].audc);
                    }
                }
                break;
            case PARAM_STEREO_WIDTH:
                stereoWidth_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_DETUNE:
                detune_ = std::clamp(value, 0.0f, 1.0f);
                break;
            case PARAM_POLY_RESET:
                for (int i = 0; i < NUM_VOICES; i++) {
                    voices_[i].ch[0].p4 = voices_[i].ch[0].p5 = 0;
                    voices_[i].ch[0].p9 = 0;
                    voices_[i].ch[1].p4 = voices_[i].ch[1].p5 = 0;
                    voices_[i].ch[1].p9 = 0;
                }
                break;
        }
    }

    void controlChange(int cc, int value) {
        float norm = value / 127.0f;
        switch (cc) {
            case 1:   // Mod wheel -> AUDC mode
                setParameter(PARAM_AUDC_MODE, norm * 15.0f);
                break;
            case 70:  // AUDF fine
                setParameter(PARAM_AUDF_FINE, norm * 31.0f);
                break;
            case 71:  // Detune
                detune_ = norm;
                break;
            case 7:   // Volume
                volume_ = norm;
                break;
            case 10:  // Stereo width
                stereoWidth_ = norm;
                break;
        }
    }

    void pitchBend(float value) {
        pitchBendFactor_ = powf(2.0f, value * 2.0f / 12.0f);
    }

    void programChange(int program) {
        currentMode_ = std::clamp(program, 0, 15);
    }

    void setVolume(float vol) {
        volume_ = std::clamp(vol, 0.0f, 1.0f);
    }

    void setMode(int mode) {
        setParameter(PARAM_AUDC_MODE, (float)mode);
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int i = 0; i < numSamples; i++) {
            float mixL = 0.0f;
            float mixR = 0.0f;

            for (int v = 0; v < NUM_VOICES; v++) {
                TIAVoice& voice = voices_[v];
                if (!voice.active && voice.env_level <= 0.0f) continue;

                float sample = processVoice(voice, v);

                // Apply envelope and velocity
                updateEnvelope(voice);
                sample *= voice.env_level * voice.velocity;

                // Stereo panning
                float pan = panPositions_[v] * stereoWidth_;
                float panR = (pan + 1.0f) * 0.5f;
                float panL = 1.0f - panR;
                mixL += sample * panL;
                mixR += sample * panR;
            }

            // Apply master volume
            float scale = volume_ * 0.5f;
            outL[i] = mixL * scale;
            outR[i] = mixR * scale;
        }
    }

private:
    // ========================================================================
    // Voice allocation
    // ========================================================================

    int allocateVoice() {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!voices_[i].active && voices_[i].env_level <= 0.0f) return i;
        }
        int minIdx = 0;
        float minLevel = voices_[0].env_level;
        for (int i = 1; i < NUM_VOICES; i++) {
            if (voices_[i].env_level < minLevel) {
                minLevel = voices_[i].env_level;
                minIdx = i;
            }
        }
        return minIdx;
    }

    // ========================================================================
    // Member data
    // ========================================================================

    TIAVoice voices_[NUM_VOICES];
    float lastVoiceOutput_[NUM_VOICES] = {};
    float sampleRate_ = 44100.0f;
    double rateRatio_ = 0.0;
    float volume_ = 0.8f;
    float stereoWidth_ = 0.5f;
    int currentMode_ = MODE_PURE;
    float detune_ = 0.0f;
    float pitchBendFactor_ = 1.0f;
    float panPositions_[NUM_VOICES] = {};

    // MIDI note to AUDF lookup
    uint8_t noteToAudf_[128] = {};

    // Polynomial counter tables
    uint8_t poly4_[POLY4_SIZE];
    uint8_t poly5_[POLY5_SIZE];
    uint8_t poly9_[POLY9_SIZE];
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(TIAModule) {
    emscripten::class_<TIASynth>("TIASynth")
        .constructor<>()
        .function("initialize", &TIASynth::initialize)
        .function("noteOn", &TIASynth::noteOn)
        .function("noteOff", &TIASynth::noteOff)
        .function("allNotesOff", &TIASynth::allNotesOff)
        .function("setParameter", &TIASynth::setParameter)
        .function("controlChange", &TIASynth::controlChange)
        .function("pitchBend", &TIASynth::pitchBend)
        .function("programChange", &TIASynth::programChange)
        .function("setVolume", &TIASynth::setVolume)
        .function("setMode", &TIASynth::setMode)
        .function("process", &TIASynth::process);
}

} // namespace devilbox
