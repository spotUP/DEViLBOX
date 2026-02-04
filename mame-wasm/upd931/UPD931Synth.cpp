/**
 * uPD931 (NEC/Casio) - Dual Waveform Keyboard Synthesizer
 * WASM implementation for DEViLBOX
 *
 * Original implementation based on documented hardware behavior of the
 * NEC uPD931 chip used in Casio CT-8000 and MT-65 keyboards (1981).
 *
 * Synthesis method: Step-based waveform accumulation with dual oscillators.
 * Two programmable 16-sample waveform tables (Wave A & Wave B) drive a
 * step accumulator that creates complex cumulative waveforms. Combined with
 * mirror/invert modes, cycle masking, a 5-stage envelope system, key scaling,
 * and retrigger (mandolin effect), this creates the distinctive Casio
 * keyboard sound of the early 1980s.
 *
 * 8-voice polyphony, MIDI-controlled.
 */

#include <emscripten/bind.h>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <cstdint>

namespace devilbox {

// ============================================================================
// Constants (documented hardware parameters)
// ============================================================================
static constexpr unsigned PITCH_SHIFT = 15;
static constexpr unsigned VOLUME_SHIFT = 15;
static constexpr unsigned VOLUME_MAX = (0xFF << VOLUME_SHIFT);

// Flag bit positions in configuration register
enum {
    FLAG_DECAY1         = 0,   // bits 0-2: decay1 rate
    FLAG_ATTACK2        = 3,   // bits 3-5: attack2 rate
    FLAG_ATTACK1        = 6,   // bits 6-8: attack1 rate
    FLAG_DECAY2_LEVEL   = 9,   // bit 9: decay1->decay2 transition point
    FLAG_DECAY2         = 10,  // bit 10: decay2 rate
    FLAG_RETRIGGER      = 11,  // bit 11: retrigger during decay (mandolin)
    FLAG_ENV_SPLIT      = 12,  // bit 12: envelope split
    FLAG_ATTACK2_B      = 13,  // bit 13: wave B fades out during attack2
    FLAG_ATTACK2_A      = 14,  // bit 14: wave A fades in during attack2
    FLAG_DECAY2_DISABLE = 15,  // bit 15: disable decay2
    FLAG_ENV_SHIFT      = 16,  // bits 16-17: envelope/vibrato rate shift
    FLAG_MIRROR         = 19,  // bit 19: mirror waveform on alternate cycles
    FLAG_INVERT         = 20,  // bit 20: invert waveform on alternate cycles
    FLAG_MODE_B         = 21,  // bits 21-22: wave B output mode
    FLAG_MODE_A         = 23,  // bits 23-24: wave A output mode
    FLAG_WAVE_SEL       = 25,  // bit 25: wave data input select
};

// Envelope states
enum EnvState {
    ENV_IDLE = 0,
    ENV_ATTACK1,
    ENV_ATTACK2,
    ENV_DECAY1,
    ENV_DECAY2,
    ENV_RELEASE,
};

// Step table for waveform accumulator
// Values 0-7 = positive steps: 0, 1, 2, 2, 4, 4, 8, 8
// Values 8-15 = negative steps: 0, -1, -2, -2, -4, -4, -8, -8
static const int8_t waveSteps[16] = {
    0,  1,  2,  2,  4,  4,  8,  8,
    0, -1, -2, -2, -4, -4, -8, -8
};

// Cycle mask table: controls which of 4 cycles a waveform plays
static const uint8_t cycleMask[4] = {
    0xF,  // always on (all 4 cycles)
    0x5,  // on, off, on, off (cycles 0, 2)
    0x1,  // on 1x, off 3x (cycle 0 only)
    0x3   // on 2x, off 2x (cycles 0, 1)
};

// Envelope rate tables
static const uint16_t attack1Rates[8] = { 0, 2048, 512, 256, 160, 80, 32, 8 };
static const uint32_t attack2Rates[8] = { 0, 2048, 256, 128, 64, 32, 16, 8 };
static const uint32_t decay1Rates[8]  = { 2048, 640, 160, 32, 16, 8, 2, 0 };

// Bit extraction helpers
static inline uint32_t getBit(uint32_t val, unsigned pos) {
    return (val >> pos) & 1;
}
static inline uint32_t getBits(uint32_t val, unsigned pos, unsigned width) {
    return (val >> pos) & ((1u << width) - 1);
}

// Sign-extend to n bits
static inline int32_t signExtend(int32_t val, unsigned bits) {
    int32_t mask = 1 << (bits - 1);
    return (val ^ mask) - mask;
}

// ============================================================================
// Voice structure
// ============================================================================
struct Voice {
    int midiNote;
    float velocity;
    bool active;

    uint32_t pitch;          // pitch step value
    uint32_t pitchCounter;   // pitch phase accumulator
    int8_t timbreShift;      // key scaling shift

    uint8_t wavePos;         // last waveform position
    int8_t waveOut[2];       // accumulated waveform output (Wave A, Wave B)

    uint8_t envState;        // envelope state
    uint32_t envCounter;     // envelope counter
    uint32_t envLevel[2];    // envelope level for Wave A and Wave B
    uint8_t forceRelease;    // force release (bypass sustain/reverb)

    Voice() { reset(); }

    void reset() {
        midiNote = -1;
        velocity = 0;
        active = false;
        pitch = 0;
        pitchCounter = 0;
        timbreShift = 0;
        wavePos = 0;
        waveOut[0] = waveOut[1] = 0;
        envState = ENV_IDLE;
        envCounter = 0;
        envLevel[0] = envLevel[1] = 0;
        forceRelease = 0;
    }
};

// ============================================================================
// Preset definition
// ============================================================================
struct Preset {
    uint8_t waveA[16];
    uint8_t waveB[16];
    uint32_t flags;
    uint8_t sustain;
    uint8_t reverb;
    bool keyScaling;
};

// ============================================================================
// Parameter IDs for setParameter()
// ============================================================================
enum ParamId {
    PARAM_VOLUME = 0,
    PARAM_WAVE_A = 1,
    PARAM_WAVE_B = 2,
    PARAM_MIRROR = 3,
    PARAM_INVERT = 4,
    PARAM_MODE_A = 5,
    PARAM_MODE_B = 6,
    PARAM_KEY_SCALING = 7,
};

// ============================================================================
// Main synth class
// ============================================================================
static constexpr int NUM_VOICES = 8;
static constexpr int NUM_PRESETS = 8;

class UPD931Synth {
public:
    UPD931Synth() {
        std::memset(wave_, 0, sizeof(wave_));
        sampleRate_ = 44100.0f;
        volume_ = 0.8f;
        flags_ = 0;
        sustain_ = 0;
        reverb_ = 0;
        keyScaling_ = false;
        currentPreset_ = 0;
        retriggerEnabled_ = false;
        retriggerCounter_ = 0;
        retriggerPeriod_ = 0;
        pitchBendFactor_ = 1.0f;
        initPresets();
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        buildPitchTable();
        loadPreset(0);

        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }

        // Retrigger period: original chip RETRIG_RATE=0x60000 at ~4.9MHz clock
        // That's ~79.5ms period
        retriggerPeriod_ = static_cast<uint32_t>(sampleRate_ * 0.0795f);
        retriggerCounter_ = 0;
    }

    // ========================================================================
    // MIDI note interface
    // ========================================================================

    void noteOn(int note, int velocity) {
        if (velocity == 0) { noteOff(note); return; }

        Voice* v = findFreeVoice(note);
        if (!v) return;

        v->midiNote = note;
        v->velocity = velocity / 127.0f;
        v->active = true;

        // Compute pitch from MIDI note
        if (note >= 0 && note < 128) {
            v->pitch = pitchTable_[note];
        } else {
            v->pitch = 0;
        }

        // Key scaling: timbre_shift based on octave
        if (keyScaling_) {
            int octave = std::max(0, std::min(5, (note / 12) - 2));
            v->timbreShift = static_cast<int8_t>(3 - octave);
        } else {
            v->timbreShift = 0;
        }

        // Reset voice state (matching hardware note-on behavior)
        v->pitchCounter = 0;
        v->wavePos = 0xFF;  // force first update
        v->waveOut[0] = v->waveOut[1] = 0;
        v->envState = ENV_ATTACK1;
        v->envCounter = 0;
        v->envLevel[0] = v->envLevel[1] = 0;
        v->forceRelease = 0;

        // Reset retrigger counter on note on
        retriggerCounter_ = 0;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == note) {
                voices_[i].envState = ENV_RELEASE;
                voices_[i].forceRelease = 0;
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].envState = ENV_RELEASE;
                voices_[i].forceRelease = 1;
            }
        }
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        // Scale factor: wave_out range +-32, env_level>>15 range 0-255
        // Max per voice per wave = 32*255 = 8160, 8 voices * 2 waves = 130560
        // Clamp to 65536, then normalize to float
        const float scale = volume_ / 65536.0f;

        for (int i = 0; i < numSamples; i++) {
            // Handle retrigger (mandolin effect)
            if (retriggerEnabled_ && retriggerPeriod_ > 0) {
                retriggerCounter_++;
                if (retriggerCounter_ >= retriggerPeriod_) {
                    retriggerCounter_ = 0;
                    handleRetrigger();
                }
            }

            int32_t sample = 0;

            for (int v = 0; v < NUM_VOICES; v++) {
                Voice& voice = voices_[v];
                if (!voice.active) continue;

                updateEnv(voice);
                updateWave(voice);

                // Mix: wave_out * (env_level >> VOLUME_SHIFT)
                sample += voice.waveOut[0] * static_cast<int32_t>(voice.envLevel[0] >> VOLUME_SHIFT);
                sample += voice.waveOut[1] * static_cast<int32_t>(voice.envLevel[1] >> VOLUME_SHIFT);

                // Check if voice is done
                if (voice.envState == ENV_IDLE) {
                    voice.active = false;
                }
            }

            float out = static_cast<float>(sample) * scale;
            out = std::max(-1.0f, std::min(1.0f, out));
            outL[i] = out;
            outR[i] = out;
        }
    }

    // ========================================================================
    // Parameter control
    // ========================================================================

    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                volume_ = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_WAVE_A:
            {
                int idx = std::max(0, std::min(NUM_PRESETS - 1, static_cast<int>(value)));
                std::memcpy(wave_[0], presets_[idx].waveA, 16);
                break;
            }
            case PARAM_WAVE_B:
            {
                int idx = std::max(0, std::min(NUM_PRESETS - 1, static_cast<int>(value)));
                std::memcpy(wave_[1], presets_[idx].waveB, 16);
                break;
            }
            case PARAM_MIRROR:
                if (value > 0.5f) flags_ |= (1u << FLAG_MIRROR);
                else flags_ &= ~(1u << FLAG_MIRROR);
                break;
            case PARAM_INVERT:
                if (value > 0.5f) flags_ |= (1u << FLAG_INVERT);
                else flags_ &= ~(1u << FLAG_INVERT);
                break;
            case PARAM_MODE_A:
            {
                int mode = static_cast<int>(value) & 3;
                flags_ &= ~(3u << FLAG_MODE_A);
                flags_ |= (mode << FLAG_MODE_A);
                break;
            }
            case PARAM_MODE_B:
            {
                int mode = static_cast<int>(value) & 3;
                flags_ &= ~(3u << FLAG_MODE_B);
                flags_ |= (mode << FLAG_MODE_B);
                break;
            }
            case PARAM_KEY_SCALING:
                keyScaling_ = value > 0.5f;
                break;
        }
    }

    void setVolume(float v) {
        volume_ = std::max(0.0f, std::min(1.0f, v));
    }

    void controlChange(int cc, int value) {
        float normalized = value / 127.0f;
        switch (cc) {
            case 1:  // Mod wheel -> envelope shift
            {
                int shift = static_cast<int>(normalized * 3.0f);
                flags_ &= ~(3u << FLAG_ENV_SHIFT);
                flags_ |= (shift << FLAG_ENV_SHIFT);
                break;
            }
            case 70: // Wave A pattern
                setParameter(PARAM_WAVE_A, normalized * (NUM_PRESETS - 1));
                break;
            case 71: // Wave B pattern
                setParameter(PARAM_WAVE_B, normalized * (NUM_PRESETS - 1));
                break;
            case 72: // Mirror
                setParameter(PARAM_MIRROR, normalized);
                break;
            case 73: // Invert
                setParameter(PARAM_INVERT, normalized);
                break;
            case 74: // Mode A
                setParameter(PARAM_MODE_A, normalized * 3.0f);
                break;
            case 75: // Mode B
                setParameter(PARAM_MODE_B, normalized * 3.0f);
                break;
            case 76: // Key scaling
                setParameter(PARAM_KEY_SCALING, normalized);
                break;
            case 77: // Sustain level
                sustain_ = static_cast<uint8_t>(normalized * 2.0f);
                break;
            case 78: // Reverb
                reverb_ = normalized > 0.5f ? 1 : 0;
                break;
            case 64: // Sustain pedal
                if (value >= 64) {
                    sustain_ = 2;
                } else {
                    sustain_ = 0;
                    for (int i = 0; i < NUM_VOICES; i++) {
                        if (voices_[i].active &&
                            (voices_[i].envState == ENV_DECAY1 ||
                             voices_[i].envState == ENV_DECAY2)) {
                            voices_[i].envState = ENV_RELEASE;
                        }
                    }
                }
                break;
        }
    }

    void pitchBend(float value) {
        // value: -1 to +1 (+-2 semitones)
        pitchBendFactor_ = std::pow(2.0f, value * 2.0f / 12.0f);
        buildPitchTable();
        // Update active voices
        for (int v = 0; v < NUM_VOICES; v++) {
            if (voices_[v].active && voices_[v].midiNote >= 0 && voices_[v].midiNote < 128) {
                voices_[v].pitch = pitchTable_[voices_[v].midiNote];
            }
        }
    }

    void programChange(int program) {
        loadPreset(program % NUM_PRESETS);
    }

    void setMode(int mode) {
        loadPreset(mode % NUM_PRESETS);
    }

private:
    float sampleRate_;
    float volume_;
    float pitchBendFactor_;

    Voice voices_[NUM_VOICES];
    uint32_t pitchTable_[128];

    // Global voice parameters (shared, like original chip)
    uint8_t wave_[2][16];     // Two waveform tables (Wave A, Wave B)
    uint32_t flags_;           // Configuration flags
    uint8_t sustain_;          // Sustain level (0-2)
    uint8_t reverb_;           // Reverb enable
    bool keyScaling_;          // Key scaling enable
    bool retriggerEnabled_;    // Retrigger (mandolin) effect
    uint32_t retriggerCounter_;
    uint32_t retriggerPeriod_;

    int currentPreset_;
    Preset presets_[NUM_PRESETS];

    // ========================================================================
    // Initialization
    // ========================================================================

    void buildPitchTable() {
        for (int i = 0; i < 128; i++) {
            // A4 (MIDI 69) = 442 Hz (matching original CT-8000 crystal)
            float freq = 442.0f * std::pow(2.0f, (i - 69) / 12.0f) * pitchBendFactor_;
            // pitch = (1 << 19) * freq / sampleRate
            // This gives 16 waveform samples per pitch cycle
            float p = static_cast<float>(1 << 19) * freq / sampleRate_;
            pitchTable_[i] = static_cast<uint32_t>(std::max(0.0f, std::min(p, 65535.0f)));
        }
    }

    static uint32_t packFlags(int decay1Rate, int attack2Rate, int attack1Rate,
                               int decay2Level, int decay2Rate, bool retrigger,
                               bool envSplit, bool attack2B, bool attack2A,
                               bool decay2Disable, int envShift,
                               bool mirror, bool invert,
                               int modeB, int modeA) {
        uint32_t f = 0;
        f |= (decay1Rate & 7) << FLAG_DECAY1;
        f |= (attack2Rate & 7) << FLAG_ATTACK2;
        f |= (attack1Rate & 7) << FLAG_ATTACK1;
        f |= (decay2Level & 1) << FLAG_DECAY2_LEVEL;
        f |= (decay2Rate & 1) << FLAG_DECAY2;
        f |= (retrigger ? 1u : 0u) << FLAG_RETRIGGER;
        f |= (envSplit ? 1u : 0u) << FLAG_ENV_SPLIT;
        f |= (attack2B ? 1u : 0u) << FLAG_ATTACK2_B;
        f |= (attack2A ? 1u : 0u) << FLAG_ATTACK2_A;
        f |= (decay2Disable ? 1u : 0u) << FLAG_DECAY2_DISABLE;
        f |= (envShift & 3) << FLAG_ENV_SHIFT;
        f |= (mirror ? 1u : 0u) << FLAG_MIRROR;
        f |= (invert ? 1u : 0u) << FLAG_INVERT;
        f |= (modeB & 3) << FLAG_MODE_B;
        f |= (modeA & 3) << FLAG_MODE_A;
        return f;
    }

    void initPresets() {
        // Preset 0: Organ - warm dual-wave organ tone
        // Wave A: sine-like (gradual positive then negative steps)
        // Wave B: hollow square (alternating high/low)
        // Long sustain, no decay
        presets_[0] = {
            {3, 4, 5, 6, 5, 4, 3, 2, 11, 12, 13, 14, 13, 12, 11, 10},
            {5, 5, 5, 5, 13, 13, 13, 13, 5, 5, 5, 5, 13, 13, 13, 13},
            packFlags(/*d1*/7, /*a2*/0, /*a1*/1, /*d2l*/0, /*d2r*/0,
                      /*retrig*/false, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/true, /*shift*/0, /*mirror*/false, /*invert*/false,
                      /*mB*/0, /*mA*/0),
            0, 0, false
        };

        // Preset 1: Piano - bright attack crossfading to warm body
        // Wave A: sawtooth-like (sharp transitions)
        // Wave B: triangle (gentle ramp up/down)
        // Instant attack, attack2 fades A in and B out, key scaling
        presets_[1] = {
            {6, 5, 3, 1, 0, 9, 11, 13, 14, 13, 11, 9, 0, 1, 3, 5},
            {3, 3, 3, 3, 3, 3, 3, 3, 11, 11, 11, 11, 11, 11, 11, 11},
            packFlags(/*d1*/3, /*a2*/2, /*a1*/0, /*d2l*/0, /*d2r*/1,
                      /*retrig*/false, /*split*/false, /*a2b*/true, /*a2a*/true,
                      /*d2dis*/false, /*shift*/0, /*mirror*/false, /*invert*/false,
                      /*mB*/0, /*mA*/0),
            0, 0, true
        };

        // Preset 2: Strings - slow attack, mirror shimmer
        // Wave A: rich harmonics (varied step sizes)
        // Wave B: gentle complement
        // Slow attack, sustain, reverb, mirror for shimmering quality
        presets_[2] = {
            {4, 3, 5, 2, 6, 1, 7, 0, 12, 9, 13, 10, 14, 11, 15, 8},
            {3, 4, 3, 4, 3, 4, 3, 4, 11, 12, 11, 12, 11, 12, 11, 12},
            packFlags(/*d1*/6, /*a2*/0, /*a1*/4, /*d2l*/0, /*d2r*/1,
                      /*retrig*/false, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/false, /*shift*/1, /*mirror*/true, /*invert*/false,
                      /*mB*/0, /*mA*/0),
            2, 1, false
        };

        // Preset 3: Brass - bright with harmonic accent
        // Wave A: sawtooth (constant positive steps then reset)
        // Wave B: octave pulse (alternating high)
        // Medium attack, Wave B fades during attack2, Mode B = alternating cycles
        presets_[3] = {
            {5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 14, 14, 14, 8},
            {7, 7, 15, 15, 7, 7, 15, 15, 7, 7, 15, 15, 7, 7, 15, 15},
            packFlags(/*d1*/4, /*a2*/3, /*a1*/2, /*d2l*/0, /*d2r*/0,
                      /*retrig*/false, /*split*/false, /*a2b*/true, /*a2a*/false,
                      /*d2dis*/true, /*shift*/0, /*mirror*/false, /*invert*/false,
                      /*mB*/1, /*mA*/0),
            0, 0, false
        };

        // Preset 4: Reed - nasal character with invert mode
        // Wave A: alternating positive/negative steps
        // Wave B: softer alternating pattern
        // Fast attack, invert for nasal timbre, Mode B = 1-of-4 cycles
        presets_[4] = {
            {6, 3, 14, 11, 6, 3, 14, 11, 6, 3, 14, 11, 6, 3, 14, 11},
            {4, 2, 12, 10, 4, 2, 12, 10, 4, 2, 12, 10, 4, 2, 12, 10},
            packFlags(/*d1*/5, /*a2*/0, /*a1*/1, /*d2l*/0, /*d2r*/0,
                      /*retrig*/false, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/true, /*shift*/0, /*mirror*/false, /*invert*/true,
                      /*mB*/2, /*mA*/0),
            0, 0, false
        };

        // Preset 5: Bell - instant attack, long decay, inharmonic
        // Wave A: sharp square (extreme steps)
        // Wave B: complex pattern (varied steps)
        // Instant attack, long decay with decay2, invert for metallic ring
        presets_[5] = {
            {7, 0, 15, 8, 7, 0, 15, 8, 7, 0, 15, 8, 7, 0, 15, 8},
            {5, 7, 3, 15, 13, 11, 1, 9, 5, 7, 3, 15, 13, 11, 1, 9},
            packFlags(/*d1*/5, /*a2*/0, /*a1*/0, /*d2l*/1, /*d2r*/1,
                      /*retrig*/false, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/false, /*shift*/0, /*mirror*/false, /*invert*/true,
                      /*mB*/0, /*mA*/0),
            0, 0, false
        };

        // Preset 6: Bass - deep fundamental
        // Wave A: triangle (steady steps)
        // Wave B: gentle sine (small steps), Mode B = 2-of-4 cycles
        // Instant attack, sustained
        presets_[6] = {
            {3, 3, 3, 3, 3, 3, 3, 3, 11, 11, 11, 11, 11, 11, 11, 11},
            {1, 1, 1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9},
            packFlags(/*d1*/6, /*a2*/0, /*a1*/0, /*d2l*/0, /*d2r*/0,
                      /*retrig*/false, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/true, /*shift*/0, /*mirror*/false, /*invert*/false,
                      /*mB*/3, /*mA*/0),
            1, 0, false
        };

        // Preset 7: Synth Lead - retrigger mandolin effect
        // Wave A: digital (asymmetric step pattern)
        // Wave B: metallic (alternating extreme/zero)
        // Medium attack, retrigger for mandolin effect, mirror, Mode B alternating
        presets_[7] = {
            {7, 5, 3, 1, 0, 0, 8, 8, 15, 13, 11, 9, 0, 0, 8, 8},
            {6, 0, 14, 8, 6, 0, 14, 8, 6, 0, 14, 8, 6, 0, 14, 8},
            packFlags(/*d1*/4, /*a2*/0, /*a1*/2, /*d2l*/0, /*d2r*/0,
                      /*retrig*/true, /*split*/false, /*a2b*/false, /*a2a*/false,
                      /*d2dis*/false, /*shift*/0, /*mirror*/true, /*invert*/false,
                      /*mB*/1, /*mA*/0),
            0, 0, false
        };
    }

    void loadPreset(int idx) {
        if (idx < 0 || idx >= NUM_PRESETS) return;
        currentPreset_ = idx;

        const Preset& p = presets_[idx];
        std::memcpy(wave_[0], p.waveA, 16);
        std::memcpy(wave_[1], p.waveB, 16);
        flags_ = p.flags;
        sustain_ = p.sustain;
        reverb_ = p.reverb;
        keyScaling_ = p.keyScaling;
        retriggerEnabled_ = getBit(flags_, FLAG_RETRIGGER) != 0;
    }

    // ========================================================================
    // Voice allocation
    // ========================================================================

    Voice* findFreeVoice(int note) {
        // 1. Reuse voice already playing this note
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == note) return &voices_[i];
        }
        // 2. Find inactive voice
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!voices_[i].active) return &voices_[i];
        }
        // 3. Steal voice in release
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].envState == ENV_RELEASE) return &voices_[i];
        }
        // 4. Steal lowest envelope level
        int minIdx = 0;
        uint32_t minLevel = UINT32_MAX;
        for (int i = 0; i < NUM_VOICES; i++) {
            uint32_t level = voices_[i].envLevel[0] + voices_[i].envLevel[1];
            if (level < minLevel) { minLevel = level; minIdx = i; }
        }
        return &voices_[minIdx];
    }

    // ========================================================================
    // Retrigger (mandolin effect)
    // ========================================================================

    void handleRetrigger() {
        for (int i = 0; i < NUM_VOICES; i++) {
            Voice& v = voices_[i];
            if (v.envState == ENV_DECAY1 || v.envState == ENV_DECAY2) {
                v.envState = ENV_ATTACK1;
                v.envCounter = 0;
            }
        }
    }

    // ========================================================================
    // Envelope update (5-stage envelope system)
    // ========================================================================

    void updateEnv(Voice& voice) {
        const unsigned shift = getBits(flags_, FLAG_ENV_SHIFT, 2);

        switch (voice.envState) {
        case ENV_IDLE:
            return;

        case ENV_ATTACK1: {
            const uint8_t val = getBits(flags_, FLAG_ATTACK1, 3);
            uint32_t rate;

            if (val == 0)
                rate = VOLUME_MAX;  // instant
            else if (val < 4 && voice.envCounter >= (0xE0u << VOLUME_SHIFT))
                rate = 160u << shift;  // slow down at 7/8 of max volume
            else
                rate = static_cast<uint32_t>(attack1Rates[val]) << shift;

            voice.envCounter = std::min(voice.envCounter + rate, static_cast<uint32_t>(VOLUME_MAX));

            // Wave A level: 0 if set to rise during attack2 instead
            if (getBit(flags_, FLAG_ATTACK2_A))
                voice.envLevel[0] = 0;
            else
                voice.envLevel[0] = voice.envCounter;
            voice.envLevel[1] = voice.envCounter;

            if (voice.envCounter >= VOLUME_MAX) {
                voice.envCounter = 0;
                voice.envState = ENV_ATTACK2;
            }
            break;
        }

        case ENV_ATTACK2: {
            const uint8_t val = getBits(flags_, FLAG_ATTACK2, 3);
            uint32_t rate;

            if (val == 0)
                rate = VOLUME_MAX;  // instant
            else
                rate = attack2Rates[val] << shift;

            voice.envCounter = std::min(voice.envCounter + rate, static_cast<uint32_t>(VOLUME_MAX));

            // Fade Wave A in, if specified
            if (getBit(flags_, FLAG_ATTACK2_A))
                voice.envLevel[0] = voice.envCounter;

            // Fade Wave B out, if specified
            if (getBit(flags_, FLAG_ATTACK2_B))
                voice.envLevel[1] = VOLUME_MAX - voice.envCounter;

            if (voice.envCounter >= VOLUME_MAX)
                voice.envState = ENV_DECAY1;
            break;
        }

        case ENV_DECAY1: {
            const uint8_t val = getBits(flags_, FLAG_DECAY1, 3);
            const uint32_t rate = decay1Rates[val] << shift;

            if (voice.envCounter < rate) {
                voice.envCounter = 0;
                voice.envState = ENV_IDLE;
            } else {
                voice.envCounter -= rate;
            }

            voice.envLevel[0] = voice.envCounter;
            // Only fade Wave B if it didn't already fade out during attack2
            if (voice.envLevel[1])
                voice.envLevel[1] = voice.envCounter;

            if (!getBit(flags_, FLAG_DECAY2_DISABLE)) {
                // Transition to decay2 at 1/2 or 1/4 of max volume
                const uint8_t decay2Level = getBit(flags_, FLAG_DECAY2_LEVEL) ? 0x40 : 0x80;
                if (voice.envCounter < (static_cast<uint32_t>(decay2Level) << VOLUME_SHIFT))
                    voice.envState = ENV_DECAY2;
            }
            break;
        }

        case ENV_DECAY2: {
            uint16_t rate;

            if (reverb_ && voice.envCounter < (0x20u << VOLUME_SHIFT))
                rate = 1 << shift;
            else if (getBit(flags_, FLAG_DECAY2))
                rate = 3 << shift;
            else
                rate = 6 << shift;

            if (voice.envCounter < rate) {
                voice.envCounter = 0;
                voice.envState = ENV_IDLE;
            } else {
                voice.envCounter -= rate;
            }

            voice.envLevel[0] = voice.envCounter;
            if (voice.envLevel[1])
                voice.envLevel[1] = voice.envCounter;
            break;
        }

        case ENV_RELEASE: {
            uint16_t rate = 512 << shift;

            if (!voice.forceRelease) {
                if (reverb_ && voice.envCounter < (0x20u << VOLUME_SHIFT))
                    rate = 1 << shift;
                else if (sustain_ == 1)
                    rate = 16 << shift;
                else if (sustain_ == 2)
                    rate = 12 << shift;
            }

            if (voice.envCounter < rate) {
                voice.envCounter = 0;
                voice.envState = ENV_IDLE;
            } else {
                voice.envCounter -= rate;
            }

            // Fade each wave individually (may differ if keyed off during attack)
            voice.envLevel[0] = std::min(voice.envLevel[0], voice.envCounter);
            voice.envLevel[1] = std::min(voice.envLevel[1], voice.envCounter);
            break;
        }
        }
    }

    // ========================================================================
    // Waveform update (step-based accumulator with mirror/invert/masking)
    // ========================================================================

    void updateWave(Voice& voice) {
        voice.pitchCounter += voice.pitch;

        const uint8_t cycle = getBits(voice.pitchCounter, PITCH_SHIFT + 4, 2);

        // Sample address depends on key scaling (timbre_shift)
        // Higher timbre_shift extracts more bits, causing pos to exceed 15
        // and creating silence during those portions (waveform narrowing)
        uint8_t pos;
        if (voice.timbreShift >= 0) {
            pos = getBits(voice.pitchCounter,
                          PITCH_SHIFT - voice.timbreShift,
                          4 + voice.timbreShift);
        } else {
            // Negative timbre_shift: extract fewer bits from higher position
            pos = getBits(voice.pitchCounter,
                          PITCH_SHIFT - voice.timbreShift,
                          4 + voice.timbreShift);
        }

        if (pos == voice.wavePos || pos >= 0x10)
            return;

        voice.wavePos = pos;

        // Mirror: play every other cycle backwards
        if (getBit(flags_, FLAG_MIRROR) && (cycle & 1))
            pos ^= 0xF;

        // Cycle mode for Wave A and Wave B
        unsigned cycleMode[2] = {
            getBits(flags_, FLAG_MODE_A, 2),
            getBits(flags_, FLAG_MODE_B, 2)
        };

        for (int w = 0; w < 2; w++) {
            // Check if this waveform is enabled for this cycle
            if (!((cycleMask[cycleMode[w]] >> cycle) & 1))
                continue;

            int8_t step = waveSteps[wave_[w][pos] & 0xF];

            // Invert waveform on every other cycle
            if (getBit(flags_, FLAG_INVERT) && (cycle & 1))
                step = -step;

            voice.waveOut[w] += step;
            // Sign-extend to 6 bits (range: -32 to 31)
            voice.waveOut[w] = static_cast<int8_t>(signExtend(voice.waveOut[w] & 0x3F, 6));
        }
    }
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(UPD931Module) {
    emscripten::class_<UPD931Synth>("UPD931Synth")
        .constructor<>()
        .function("initialize", &UPD931Synth::initialize)
        .function("noteOn", &UPD931Synth::noteOn)
        .function("noteOff", &UPD931Synth::noteOff)
        .function("allNotesOff", &UPD931Synth::allNotesOff)
        .function("process", &UPD931Synth::process)
        .function("setParameter", &UPD931Synth::setParameter)
        .function("setVolume", &UPD931Synth::setVolume)
        .function("controlChange", &UPD931Synth::controlChange)
        .function("pitchBend", &UPD931Synth::pitchBend)
        .function("programChange", &UPD931Synth::programChange)
        .function("setMode", &UPD931Synth::setMode);
}

} // namespace devilbox
