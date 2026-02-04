/**
 * ASC (Apple Sound Chip) - 4-Voice Wavetable Synthesizer
 * WASM implementation for DEViLBOX
 *
 * Original implementation based on documented hardware behavior of the
 * Apple Sound Chip 344S0063 used in Macintosh computers (1987-1993).
 *
 * Synthesis method: 4-voice wavetable with phase accumulator.
 * Each voice reads from a 512-sample, 8-bit wavetable using a 9.15
 * fixed-point phase accumulator. The ASC chip runs at 22257 Hz (Mac
 * standard sample rate) and has two modes: FIFO (streaming) and
 * wavetable (synthesis). We implement the wavetable mode.
 *
 * For our MIDI synth, we extend to 8-voice polyphony with ADSR
 * envelopes (the original ASC relied on CPU-driven volume changes),
 * preset wavetables, and linear interpolation.
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
// Constants
// ============================================================================
static constexpr int WAVETABLE_SIZE = 512;    // 9-bit address space
static constexpr int PHASE_FRAC_BITS = 15;    // 15-bit fractional phase
static constexpr int NUM_VOICES = 8;
static constexpr int NUM_PRESETS = 8;
static constexpr float PI = 3.14159265358979323846f;

// ============================================================================
// ADSR envelope (CPU-driven in original, we add it for musicality)
// ============================================================================
enum EnvStage {
    ENV_IDLE = 0,
    ENV_ATTACK,
    ENV_DECAY,
    ENV_SUSTAIN,
    ENV_RELEASE,
};

struct Envelope {
    int stage;
    float level;
    float attackRate;
    float decayRate;
    float sustainLevel;
    float releaseRate;

    Envelope() {
        stage = ENV_IDLE;
        level = 0;
        attackRate = 0.005f;
        decayRate = 0.001f;
        sustainLevel = 0.7f;
        releaseRate = 0.002f;
    }

    void trigger() {
        stage = ENV_ATTACK;
        level = 0;
    }

    void release() {
        if (stage != ENV_IDLE)
            stage = ENV_RELEASE;
    }

    float process() {
        switch (stage) {
            case ENV_ATTACK:
                level += attackRate;
                if (level >= 1.0f) {
                    level = 1.0f;
                    stage = ENV_DECAY;
                }
                break;
            case ENV_DECAY:
                level -= decayRate;
                if (level <= sustainLevel) {
                    level = sustainLevel;
                    stage = ENV_SUSTAIN;
                }
                break;
            case ENV_SUSTAIN:
                break;
            case ENV_RELEASE:
                level -= releaseRate;
                if (level <= 0) {
                    level = 0;
                    stage = ENV_IDLE;
                }
                break;
        }
        return level;
    }

    bool isDone() const { return stage == ENV_IDLE && level <= 0; }
};

// ============================================================================
// Voice structure
// ============================================================================
struct Voice {
    int midiNote;
    float velocity;
    bool active;

    uint32_t phase;       // 9.15 fixed-point phase accumulator
    uint32_t increment;   // phase increment per sample
    int wavetableIdx;     // which preset wavetable to use

    Envelope env;

    Voice() { reset(); }

    void reset() {
        midiNote = -1;
        velocity = 0;
        active = false;
        phase = 0;
        increment = 0;
        wavetableIdx = 0;
        env = Envelope();
    }
};

// ============================================================================
// Preset definition
// ============================================================================
struct Preset {
    float attackRate;
    float decayRate;
    float sustainLevel;
    float releaseRate;
    int wavetableIdx;     // which waveform to use
};

// ============================================================================
// Parameter IDs
// ============================================================================
enum ParamId {
    PARAM_VOLUME = 0,
    PARAM_WAVEFORM = 1,
    PARAM_ATTACK = 2,
    PARAM_DECAY = 3,
    PARAM_SUSTAIN = 4,
    PARAM_RELEASE = 5,
    PARAM_STEREO_WIDTH = 6,
    PARAM_DETUNE = 7,
};

// ============================================================================
// Main synth class
// ============================================================================
class ASCSynth {
public:
    ASCSynth() {
        sampleRate_ = 44100.0f;
        volume_ = 0.8f;
        currentWaveform_ = 0;
        stereoWidth_ = 0.3f;
        detune_ = 0.0f;
        pitchBendFactor_ = 1.0f;
        std::memset(wavetables_, 0, sizeof(wavetables_));
        initPresets();
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        generateWavetables();
        loadPreset(0);

        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }
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
        v->wavetableIdx = currentWaveform_;

        // Compute phase increment from MIDI note
        // increment = freq * WAVETABLE_SIZE * (1 << PHASE_FRAC_BITS) / sampleRate
        float freq = 440.0f * std::pow(2.0f, (note - 69) / 12.0f) * pitchBendFactor_;
        float fIncr = freq * static_cast<float>(WAVETABLE_SIZE << PHASE_FRAC_BITS) / sampleRate_;
        v->increment = static_cast<uint32_t>(std::max(0.0f, fIncr));

        v->phase = 0;
        v->env = currentEnv_;
        v->env.trigger();
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == note) {
                voices_[i].env.release();
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].env.release();
            }
        }
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        for (int i = 0; i < numSamples; i++) {
            float mixL = 0, mixR = 0;

            for (int v = 0; v < NUM_VOICES; v++) {
                Voice& voice = voices_[v];
                if (!voice.active) continue;

                float envLevel = voice.env.process();

                if (voice.env.isDone()) {
                    voice.active = false;
                    continue;
                }

                // Read wavetable with linear interpolation
                const int8_t* wt = wavetables_[voice.wavetableIdx];

                uint32_t intPart = (voice.phase >> PHASE_FRAC_BITS) & (WAVETABLE_SIZE - 1);
                uint32_t nextPart = (intPart + 1) & (WAVETABLE_SIZE - 1);
                float frac = static_cast<float>(voice.phase & ((1 << PHASE_FRAC_BITS) - 1))
                           / static_cast<float>(1 << PHASE_FRAC_BITS);

                float sample = wt[intPart] * (1.0f - frac) + wt[nextPart] * frac;
                sample /= 128.0f;  // normalize to -1..+1

                sample *= envLevel * voice.velocity;

                // Simple stereo panning based on voice index
                float pan = 0.5f + stereoWidth_ * (static_cast<float>(v) / (NUM_VOICES - 1) - 0.5f);
                mixL += sample * (1.0f - pan);
                mixR += sample * pan;

                // Advance phase with optional detune
                uint32_t detuneOffset = 0;
                if (detune_ > 0 && (v & 1)) {
                    detuneOffset = static_cast<uint32_t>(voice.increment * detune_ * 0.02f);
                }
                voice.phase += voice.increment + detuneOffset;
            }

            outL[i] = std::max(-1.0f, std::min(1.0f, mixL * volume_));
            outR[i] = std::max(-1.0f, std::min(1.0f, mixR * volume_));
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
            case PARAM_WAVEFORM:
                currentWaveform_ = std::max(0, std::min(NUM_PRESETS - 1, static_cast<int>(value)));
                break;
            case PARAM_ATTACK:
                currentEnv_.attackRate = std::max(0.0001f, std::min(0.1f, value));
                break;
            case PARAM_DECAY:
                currentEnv_.decayRate = std::max(0.0001f, std::min(0.1f, value));
                break;
            case PARAM_SUSTAIN:
                currentEnv_.sustainLevel = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_RELEASE:
                currentEnv_.releaseRate = std::max(0.0001f, std::min(0.1f, value));
                break;
            case PARAM_STEREO_WIDTH:
                stereoWidth_ = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_DETUNE:
                detune_ = std::max(0.0f, std::min(1.0f, value));
                break;
        }
    }

    void setVolume(float v) { volume_ = std::max(0.0f, std::min(1.0f, v)); }

    void controlChange(int cc, int value) {
        float normalized = value / 127.0f;
        switch (cc) {
            case 1:  // Mod wheel → detune
                detune_ = normalized;
                break;
            case 70: // Waveform select
                currentWaveform_ = static_cast<int>(normalized * (NUM_PRESETS - 1));
                break;
            case 73: // Attack
                currentEnv_.attackRate = 0.0001f + normalized * 0.05f;
                break;
            case 75: // Decay
                currentEnv_.decayRate = 0.0001f + normalized * 0.02f;
                break;
            case 79: // Sustain
                currentEnv_.sustainLevel = normalized;
                break;
            case 72: // Release
                currentEnv_.releaseRate = 0.0001f + normalized * 0.02f;
                break;
            case 74: // Stereo width
                stereoWidth_ = normalized;
                break;
            case 64: // Sustain pedal
                if (value < 64) {
                    for (int i = 0; i < NUM_VOICES; i++) {
                        if (voices_[i].active && voices_[i].env.stage == ENV_SUSTAIN)
                            voices_[i].env.release();
                    }
                }
                break;
        }
    }

    void pitchBend(float value) {
        pitchBendFactor_ = std::pow(2.0f, value * 2.0f / 12.0f);
        for (int v = 0; v < NUM_VOICES; v++) {
            if (voices_[v].active && voices_[v].midiNote >= 0) {
                float freq = 440.0f * std::pow(2.0f, (voices_[v].midiNote - 69) / 12.0f) * pitchBendFactor_;
                float fIncr = freq * static_cast<float>(WAVETABLE_SIZE << PHASE_FRAC_BITS) / sampleRate_;
                voices_[v].increment = static_cast<uint32_t>(std::max(0.0f, fIncr));
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
    int currentWaveform_;
    float stereoWidth_;
    float detune_;
    float pitchBendFactor_;

    Voice voices_[NUM_VOICES];
    int8_t wavetables_[NUM_PRESETS][WAVETABLE_SIZE];
    Envelope currentEnv_;
    Preset presets_[NUM_PRESETS];

    // ========================================================================
    // Wavetable generation
    // ========================================================================

    void generateWavetables() {
        // 0: Sine
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            wavetables_[0][i] = static_cast<int8_t>(127.0f * sinf(2.0f * PI * i / WAVETABLE_SIZE));
        }

        // 1: Triangle
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            float t = static_cast<float>(i) / WAVETABLE_SIZE;
            float v = (t < 0.25f) ? 4.0f * t :
                      (t < 0.75f) ? 2.0f - 4.0f * t :
                                    4.0f * t - 4.0f;
            wavetables_[1][i] = static_cast<int8_t>(127.0f * v);
        }

        // 2: Sawtooth
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            float t = static_cast<float>(i) / WAVETABLE_SIZE;
            wavetables_[2][i] = static_cast<int8_t>(127.0f * (1.0f - 2.0f * t));
        }

        // 3: Square (50% duty)
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            wavetables_[3][i] = (i < WAVETABLE_SIZE / 2) ? 100 : -100;
        }

        // 4: Pulse (25% duty)
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            wavetables_[4][i] = (i < WAVETABLE_SIZE / 4) ? 120 : -40;
        }

        // 5: Organ (harmonics 1 + 1/2 * h2 + 1/3 * h3 + 1/4 * h4)
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            float v = sinf(2.0f * PI * i / WAVETABLE_SIZE);
            v += 0.5f * sinf(4.0f * PI * i / WAVETABLE_SIZE);
            v += 0.33f * sinf(6.0f * PI * i / WAVETABLE_SIZE);
            v += 0.25f * sinf(8.0f * PI * i / WAVETABLE_SIZE);
            wavetables_[5][i] = static_cast<int8_t>(60.0f * v);
        }

        // 6: Piano-like (odd harmonics with decay)
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            float v = sinf(2.0f * PI * i / WAVETABLE_SIZE);
            v += 0.6f * sinf(6.0f * PI * i / WAVETABLE_SIZE);   // 3rd
            v += 0.3f * sinf(10.0f * PI * i / WAVETABLE_SIZE);  // 5th
            v += 0.15f * sinf(14.0f * PI * i / WAVETABLE_SIZE); // 7th
            v += 0.1f * sinf(18.0f * PI * i / WAVETABLE_SIZE);  // 9th
            wavetables_[6][i] = static_cast<int8_t>(55.0f * v);
        }

        // 7: Strings (detuned partials for chorus effect)
        for (int i = 0; i < WAVETABLE_SIZE; i++) {
            float v = sinf(2.0f * PI * i / WAVETABLE_SIZE);
            v += 0.7f * sinf(2.0f * PI * 1.003f * i / WAVETABLE_SIZE);
            v += 0.5f * sinf(4.0f * PI * i / WAVETABLE_SIZE);
            v += 0.35f * sinf(4.0f * PI * 0.998f * i / WAVETABLE_SIZE);
            wavetables_[7][i] = static_cast<int8_t>(45.0f * v);
        }
    }

    // ========================================================================
    // Presets
    // ========================================================================

    void initPresets() {
        // 0: Sine Pad - smooth, sustained
        presets_[0] = { 0.002f, 0.0005f, 0.8f, 0.001f, 0 };
        // 1: Triangle Lead - snappy
        presets_[1] = { 0.01f, 0.002f, 0.6f, 0.003f, 1 };
        // 2: Saw Bass - punchy
        presets_[2] = { 0.02f, 0.003f, 0.5f, 0.005f, 2 };
        // 3: Square Retro - 8-bit
        presets_[3] = { 0.05f, 0.001f, 0.7f, 0.002f, 3 };
        // 4: Pulse Nasal - thin
        presets_[4] = { 0.03f, 0.002f, 0.6f, 0.004f, 4 };
        // 5: Organ - sustained
        presets_[5] = { 0.008f, 0.0003f, 0.9f, 0.001f, 5 };
        // 6: Piano - percussive
        presets_[6] = { 0.05f, 0.004f, 0.3f, 0.002f, 6 };
        // 7: Strings - slow attack
        presets_[7] = { 0.001f, 0.0005f, 0.85f, 0.001f, 7 };
    }

    void loadPreset(int idx) {
        if (idx < 0 || idx >= NUM_PRESETS) return;
        const Preset& p = presets_[idx];
        currentWaveform_ = p.wavetableIdx;
        currentEnv_.attackRate = p.attackRate;
        currentEnv_.decayRate = p.decayRate;
        currentEnv_.sustainLevel = p.sustainLevel;
        currentEnv_.releaseRate = p.releaseRate;
    }

    // ========================================================================
    // Voice allocation
    // ========================================================================

    Voice* findFreeVoice(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == note) return &voices_[i];
        }
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!voices_[i].active) return &voices_[i];
        }
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].env.stage == ENV_RELEASE) return &voices_[i];
        }
        int minIdx = 0;
        float minLevel = 2.0f;
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].env.level < minLevel) {
                minLevel = voices_[i].env.level;
                minIdx = i;
            }
        }
        return &voices_[minIdx];
    }
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(ASCModule) {
    emscripten::class_<ASCSynth>("ASCSynth")
        .constructor<>()
        .function("initialize", &ASCSynth::initialize)
        .function("noteOn", &ASCSynth::noteOn)
        .function("noteOff", &ASCSynth::noteOff)
        .function("allNotesOff", &ASCSynth::allNotesOff)
        .function("process", &ASCSynth::process)
        .function("setParameter", &ASCSynth::setParameter)
        .function("setVolume", &ASCSynth::setVolume)
        .function("controlChange", &ASCSynth::controlChange)
        .function("pitchBend", &ASCSynth::pitchBend)
        .function("programChange", &ASCSynth::programChange)
        .function("setMode", &ASCSynth::setMode);
}

} // namespace devilbox
