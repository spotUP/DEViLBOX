/**
 * VASynth - Virtual Analog Subtractive Synthesizer
 * WASM implementation for DEViLBOX
 *
 * Combines the MAME Virtual Analog building blocks (va_eg, va_vca, va_vcf)
 * into a complete subtractive synthesizer.
 *
 * Signal chain: OSC1 + OSC2 → 4th-order resonant LPF → VCA → Output
 *
 * The 4th-order lowpass filter uses Zavalishin's TPT (Topology Preserving
 * Transform) discretization with Oberheim variation, producing authentic
 * analog-style resonance with tanh() saturation. This is the same algorithm
 * used in MAME's va_vcf.cpp for emulating CEM3320 and similar analog filters.
 *
 * The envelope generators use RC-based exponential curves matching real
 * analog RC charge/discharge behavior, as in MAME's va_eg.cpp.
 *
 * Features:
 * - 2 oscillators per voice (saw, square, triangle, sine, pulse)
 * - Oscillator detune for thick sound
 * - 4th-order resonant lowpass filter (TPT ladder, self-oscillation capable)
 * - tanh() saturation for analog warmth
 * - 2 RC envelopes per voice (amplitude + filter cutoff)
 * - Filter envelope depth control
 * - 8 presets: Bass, Lead, Pad, Brass, Strings, Pluck, Keys, FX
 * - 8-voice polyphony, MIDI-controlled
 */

#include <emscripten/bind.h>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <cstdint>

namespace devilbox {

static constexpr int NUM_VOICES = 8;
static constexpr int NUM_PRESETS = 8;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

// ============================================================================
// Oscillator waveforms
// ============================================================================
enum Waveform {
    WAVE_SAW = 0,
    WAVE_SQUARE = 1,
    WAVE_TRIANGLE = 2,
    WAVE_SINE = 3,
    WAVE_PULSE = 4,
};

// ============================================================================
// RC Envelope Generator (from MAME va_eg.cpp)
// Exponential charge/discharge: v(t) = v_end + (v_start - v_end) * exp(-t/RC)
// ============================================================================
struct RCEnvelope {
    enum Stage { IDLE, ATTACK, DECAY, SUSTAIN, RELEASE };

    Stage stage;
    float level;
    float attackRC;     // RC time constant for attack (seconds)
    float decayRC;      // RC time constant for decay
    float sustainLevel;
    float releaseRC;    // RC time constant for release
    float target;       // current target voltage

    float rcRate;       // precomputed rate = 1 - exp(-1 / (RC * sampleRate))
    float sampleRate;

    RCEnvelope() {
        stage = IDLE;
        level = 0;
        attackRC = 0.01f;
        decayRC = 0.2f;
        sustainLevel = 0.7f;
        releaseRC = 0.3f;
        target = 0;
        rcRate = 0;
        sampleRate = 44100.0f;
    }

    void init(float sr) {
        sampleRate = sr;
    }

    void trigger() {
        stage = ATTACK;
        target = 1.0f;
        rcRate = computeRate(attackRC);
    }

    void release() {
        if (stage != IDLE) {
            stage = RELEASE;
            target = 0;
            rcRate = computeRate(releaseRC);
        }
    }

    float process() {
        switch (stage) {
            case IDLE:
                return 0;

            case ATTACK:
                // RC charge toward 1.0
                level += (target - level) * rcRate;
                if (level >= 0.999f) {
                    level = 1.0f;
                    stage = DECAY;
                    target = sustainLevel;
                    rcRate = computeRate(decayRC);
                }
                break;

            case DECAY:
                level += (target - level) * rcRate;
                if (std::abs(level - sustainLevel) < 0.001f) {
                    level = sustainLevel;
                    stage = SUSTAIN;
                }
                break;

            case SUSTAIN:
                level = sustainLevel;
                break;

            case RELEASE:
                level += (target - level) * rcRate;
                if (level < 0.001f) {
                    level = 0;
                    stage = IDLE;
                }
                break;
        }
        return level;
    }

    bool isDone() const { return stage == IDLE; }

private:
    float computeRate(float rc) const {
        if (rc <= 0.001f) return 1.0f;  // instant
        // rate = 1 - exp(-1 / (RC * sampleRate))
        // This gives the exponential RC charge/discharge per sample
        return 1.0f - std::exp(-1.0f / (rc * sampleRate));
    }
};

// ============================================================================
// 4th-Order Resonant Lowpass Filter (from MAME va_vcf.cpp)
// TPT discretization (Zavalishin) with Oberheim variation
// ============================================================================
struct LadderFilter {
    struct Stage {
        float alpha;
        float beta;
        float state;
    };

    Stage stages[4];
    float alpha0;
    float G4;
    float fc;       // cutoff frequency (Hz)
    float res;      // resonance (0-4+, self-oscillation above 4)
    float drive;
    float driveInv;
    float sampleRate;

    LadderFilter() {
        std::memset(stages, 0, sizeof(stages));
        alpha0 = 1.0f;
        G4 = 1.0f;
        fc = 8000.0f;
        res = 0;
        drive = 1.0f;
        driveInv = 1.0f;
        sampleRate = 44100.0f;
    }

    void init(float sr) {
        sampleRate = sr;
        setDrive(1.5f);
        recalcFilter();
    }

    void setCutoff(float cutoff) {
        cutoff = std::max(20.0f, std::min(20000.0f, cutoff));
        if (cutoff != fc) {
            fc = cutoff;
            recalcFilter();
        }
    }

    void setResonance(float r) {
        r = std::max(0.0f, std::min(4.5f, r));
        if (r != res) {
            res = r;
            recalcAlpha0();
        }
    }

    void setDrive(float d) {
        drive = std::max(0.1f, d);
        driveInv = 1.0f / drive;
    }

    float process(float input) {
        // Compute feedback
        float sigma = 0;
        for (int i = 0; i < 4; i++)
            sigma += stages[i].beta * stages[i].state;

        // Input with resonance feedback and saturation
        float u = (input - res * sigma) * alpha0;
        u = driveInv * std::tanh(u * drive);

        // Process through 4 filter stages
        for (int i = 0; i < 4; i++) {
            float vn = (u - stages[i].state) * stages[i].alpha;
            u = vn + stages[i].state;
            stages[i].state = vn + u;
        }

        return u;
    }

    void reset() {
        for (int i = 0; i < 4; i++)
            stages[i].state = 0;
    }

private:
    void recalcAlpha0() {
        alpha0 = 1.0f / (1.0f + res * G4);
    }

    void recalcFilter() {
        float T = 1.0f / sampleRate;
        float w = TWO_PI * fc;

        // Bounded cutoff prewarping (Zavalishin)
        float wMax = TWO_PI * std::min(0.75f * sampleRate / 2.0f, 16000.0f);
        float g;
        if (w <= wMax)
            g = std::tan(w * T / 2.0f);
        else
            g = std::tan(wMax * T / 2.0f) / wMax * w;

        float gp1 = 1.0f + g;
        float G = g / gp1;
        float G2 = G * G;
        G4 = G2 * G2;
        recalcAlpha0();

        for (int i = 0; i < 4; i++)
            stages[i].alpha = G;

        stages[0].beta = G2 * G / gp1;
        stages[1].beta = G2 / gp1;
        stages[2].beta = G / gp1;
        stages[3].beta = 1.0f / gp1;
    }
};

// ============================================================================
// Voice structure
// ============================================================================
struct Voice {
    int midiNote;
    float velocity;
    bool active;

    // Oscillators
    float osc1Phase;
    float osc2Phase;
    float osc1Freq;
    float osc2Freq;

    // Envelopes
    RCEnvelope ampEnv;
    RCEnvelope filterEnv;

    // Per-voice filter
    LadderFilter filter;

    Voice() { reset(); }

    void reset() {
        midiNote = -1;
        velocity = 0;
        active = false;
        osc1Phase = 0;
        osc2Phase = 0;
        osc1Freq = 0;
        osc2Freq = 0;
        ampEnv = RCEnvelope();
        filterEnv = RCEnvelope();
        filter.reset();
    }
};

// ============================================================================
// Preset definition
// ============================================================================
struct Preset {
    int osc1Wave;
    int osc2Wave;
    float oscMix;          // 0 = osc1 only, 1 = osc2 only
    float osc2Detune;      // semitones detune
    float filterCutoff;    // Hz
    float filterRes;       // 0-4
    float filterEnvDepth;  // 0-1
    float ampAttack, ampDecay, ampSustain, ampRelease;
    float filtAttack, filtDecay, filtSustain, filtRelease;
};

// ============================================================================
// Parameter IDs
// ============================================================================
enum VASynthParam {
    PARAM_VOLUME = 0,
    PARAM_OSC1_WAVE = 1,
    PARAM_OSC2_WAVE = 2,
    PARAM_OSC_MIX = 3,
    PARAM_OSC2_DETUNE = 4,
    PARAM_FILTER_CUTOFF = 5,
    PARAM_FILTER_RES = 6,
    PARAM_FILTER_ENV_DEPTH = 7,
};

// ============================================================================
// Main synth class
// ============================================================================
class VASynth {
public:
    VASynth() {
        sampleRate_ = 44100.0f;
        volume_ = 0.7f;
        osc1Wave_ = WAVE_SAW;
        osc2Wave_ = WAVE_SAW;
        oscMix_ = 0.3f;
        osc2Detune_ = 0.1f;
        filterCutoff_ = 8000.0f;
        filterRes_ = 0.5f;
        filterEnvDepth_ = 0.5f;
        pitchBendFactor_ = 1.0f;
        initPresets();
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
            voices_[i].ampEnv.init(sampleRate);
            voices_[i].filterEnv.init(sampleRate);
            voices_[i].filter.init(sampleRate);
        }
        loadPreset(0);
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

        float freq = 440.0f * std::pow(2.0f, (note - 69) / 12.0f) * pitchBendFactor_;
        v->osc1Freq = freq;
        v->osc2Freq = freq * std::pow(2.0f, osc2Detune_ / 12.0f);

        v->osc1Phase = 0;
        v->osc2Phase = 0.3f;  // offset for detune character

        // Setup envelopes with current parameters
        v->ampEnv = currentAmpEnv_;
        v->ampEnv.init(sampleRate_);
        v->ampEnv.trigger();

        v->filterEnv = currentFilterEnv_;
        v->filterEnv.init(sampleRate_);
        v->filterEnv.trigger();

        // Reset filter (clear state first to avoid clicks from residual energy)
        v->filter.reset();
        v->filter.init(sampleRate_);
        v->filter.setCutoff(filterCutoff_);
        v->filter.setResonance(filterRes_);
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midiNote == note) {
                voices_[i].ampEnv.release();
                voices_[i].filterEnv.release();
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].ampEnv.release();
                voices_[i].filterEnv.release();
            }
        }
    }

    // ========================================================================
    // Audio processing
    // ========================================================================

    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        const float osc1PhaseInc = 1.0f / sampleRate_;
        const float osc2PhaseInc = 1.0f / sampleRate_;

        for (int i = 0; i < numSamples; i++) {
            float mixL = 0, mixR = 0;

            for (int v = 0; v < NUM_VOICES; v++) {
                Voice& voice = voices_[v];
                if (!voice.active) continue;

                // Process envelopes
                float ampLevel = voice.ampEnv.process();
                float filtLevel = voice.filterEnv.process();

                if (voice.ampEnv.isDone()) {
                    voice.active = false;
                    continue;
                }

                // Generate oscillators
                float osc1 = generateOsc(osc1Wave_, voice.osc1Phase);
                float osc2 = generateOsc(osc2Wave_, voice.osc2Phase);

                // Mix oscillators
                float oscOut = osc1 * (1.0f - oscMix_) + osc2 * oscMix_;

                // Modulate filter cutoff with envelope
                float envCutoff = filterCutoff_ + filtLevel * filterEnvDepth_ * (20000.0f - filterCutoff_);
                envCutoff = std::max(20.0f, std::min(20000.0f, envCutoff));
                voice.filter.setCutoff(envCutoff);
                voice.filter.setResonance(filterRes_);

                // Process through filter
                float filtered = voice.filter.process(oscOut);

                // Apply VCA (amplitude envelope)
                float sample = filtered * ampLevel * voice.velocity;

                // Simple stereo spread
                float pan = 0.5f + 0.2f * (static_cast<float>(v) / (NUM_VOICES - 1) - 0.5f);
                mixL += sample * (1.0f - pan);
                mixR += sample * pan;

                // Advance oscillator phases
                voice.osc1Phase += voice.osc1Freq * osc1PhaseInc;
                if (voice.osc1Phase >= 1.0f) voice.osc1Phase -= 1.0f;

                voice.osc2Phase += voice.osc2Freq * osc2PhaseInc;
                if (voice.osc2Phase >= 1.0f) voice.osc2Phase -= 1.0f;
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
            case PARAM_OSC1_WAVE:
                osc1Wave_ = std::max(0, std::min(4, static_cast<int>(value)));
                break;
            case PARAM_OSC2_WAVE:
                osc2Wave_ = std::max(0, std::min(4, static_cast<int>(value)));
                break;
            case PARAM_OSC_MIX:
                oscMix_ = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_OSC2_DETUNE:
                osc2Detune_ = std::max(-12.0f, std::min(12.0f, value));
                break;
            case PARAM_FILTER_CUTOFF:
                filterCutoff_ = std::max(20.0f, std::min(20000.0f, value));
                break;
            case PARAM_FILTER_RES:
                filterRes_ = std::max(0.0f, std::min(4.5f, value));
                break;
            case PARAM_FILTER_ENV_DEPTH:
                filterEnvDepth_ = std::max(0.0f, std::min(1.0f, value));
                break;
        }
    }

    void setVolume(float v) { volume_ = std::max(0.0f, std::min(1.0f, v)); }

    void controlChange(int cc, int value) {
        float normalized = value / 127.0f;
        switch (cc) {
            case 1:  // Mod wheel → filter cutoff
                filterCutoff_ = 20.0f + normalized * 19980.0f;
                break;
            case 70: // OSC1 waveform
                osc1Wave_ = std::max(0, std::min(4, static_cast<int>(normalized * 4.0f)));
                break;
            case 71: // OSC2 waveform
                osc2Wave_ = std::max(0, std::min(4, static_cast<int>(normalized * 4.0f)));
                break;
            case 72: // OSC2 detune
                osc2Detune_ = -12.0f + normalized * 24.0f;
                break;
            case 73: // Filter cutoff
                filterCutoff_ = 20.0f + normalized * 19980.0f;
                break;
            case 74: // Filter resonance
                filterRes_ = normalized * 4.5f;
                break;
            case 75: // Filter env depth
                filterEnvDepth_ = normalized;
                break;
            case 76: // Amp attack
                currentAmpEnv_.attackRC = 0.001f + normalized * 2.0f;
                break;
            case 77: // Amp decay
                currentAmpEnv_.decayRC = 0.01f + normalized * 3.0f;
                break;
            case 78: // Amp sustain
                currentAmpEnv_.sustainLevel = normalized;
                break;
            case 79: // Amp release
                currentAmpEnv_.releaseRC = 0.01f + normalized * 3.0f;
                break;
            case 80: // OSC mix
                oscMix_ = normalized;
                break;
            case 64: // Sustain pedal
                if (value < 64) {
                    for (int i = 0; i < NUM_VOICES; i++) {
                        if (voices_[i].active && voices_[i].ampEnv.stage == RCEnvelope::SUSTAIN) {
                            voices_[i].ampEnv.release();
                            voices_[i].filterEnv.release();
                        }
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
                voices_[v].osc1Freq = freq;
                voices_[v].osc2Freq = freq * std::pow(2.0f, osc2Detune_ / 12.0f);
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
    int osc1Wave_;
    int osc2Wave_;
    float oscMix_;
    float osc2Detune_;
    float filterCutoff_;
    float filterRes_;
    float filterEnvDepth_;
    float pitchBendFactor_;

    Voice voices_[NUM_VOICES];
    RCEnvelope currentAmpEnv_;
    RCEnvelope currentFilterEnv_;
    Preset presets_[NUM_PRESETS];

    // ========================================================================
    // Oscillator generation
    // ========================================================================

    static float generateOsc(int waveform, float phase) {
        switch (waveform) {
            case WAVE_SAW:
                return 2.0f * phase - 1.0f;

            case WAVE_SQUARE:
                return phase < 0.5f ? 1.0f : -1.0f;

            case WAVE_TRIANGLE:
                return (phase < 0.25f) ? 4.0f * phase :
                       (phase < 0.75f) ? 2.0f - 4.0f * phase :
                                         4.0f * phase - 4.0f;

            case WAVE_SINE:
                return std::sin(TWO_PI * phase);

            case WAVE_PULSE:
                return phase < 0.25f ? 1.0f : -1.0f;

            default:
                return 0;
        }
    }

    // ========================================================================
    // Presets
    // ========================================================================

    void initPresets() {
        // 0: Bass - deep saw bass with filter sweep
        presets_[0] = {
            WAVE_SAW, WAVE_SQUARE, 0.4f, 0.1f,
            800.0f, 1.0f, 0.7f,
            0.005f, 0.3f, 0.4f, 0.2f,
            0.005f, 0.5f, 0.0f, 0.2f
        };
        // 1: Lead - bright square lead
        presets_[1] = {
            WAVE_SQUARE, WAVE_SAW, 0.3f, 0.15f,
            4000.0f, 0.8f, 0.5f,
            0.01f, 0.2f, 0.7f, 0.3f,
            0.01f, 0.3f, 0.3f, 0.2f
        };
        // 2: Pad - lush detuned pad
        presets_[2] = {
            WAVE_SAW, WAVE_SAW, 0.5f, 0.08f,
            3000.0f, 0.3f, 0.3f,
            0.8f, 0.5f, 0.8f, 1.0f,
            0.6f, 0.8f, 0.5f, 1.0f
        };
        // 3: Brass - punchy brass stab
        presets_[3] = {
            WAVE_SAW, WAVE_SAW, 0.5f, 0.02f,
            1200.0f, 0.6f, 0.8f,
            0.05f, 0.4f, 0.6f, 0.2f,
            0.03f, 0.6f, 0.2f, 0.2f
        };
        // 4: Strings - slow evolving strings
        presets_[4] = {
            WAVE_SAW, WAVE_SAW, 0.5f, 0.12f,
            5000.0f, 0.2f, 0.2f,
            1.0f, 0.3f, 0.85f, 0.8f,
            0.8f, 0.5f, 0.6f, 0.8f
        };
        // 5: Pluck - short percussive pluck
        presets_[5] = {
            WAVE_SAW, WAVE_PULSE, 0.3f, 0.05f,
            6000.0f, 1.5f, 0.9f,
            0.001f, 0.5f, 0.0f, 0.3f,
            0.001f, 0.8f, 0.0f, 0.3f
        };
        // 6: Keys - electric piano style
        presets_[6] = {
            WAVE_TRIANGLE, WAVE_SINE, 0.4f, 0.01f,
            3500.0f, 0.4f, 0.6f,
            0.005f, 0.6f, 0.3f, 0.4f,
            0.005f, 1.0f, 0.1f, 0.5f
        };
        // 7: FX - resonant sweep
        presets_[7] = {
            WAVE_SAW, WAVE_SQUARE, 0.5f, 7.0f,
            500.0f, 3.5f, 0.9f,
            0.3f, 0.1f, 0.7f, 0.5f,
            0.5f, 2.0f, 0.0f, 1.0f
        };
    }

    void loadPreset(int idx) {
        if (idx < 0 || idx >= NUM_PRESETS) return;
        const Preset& p = presets_[idx];

        osc1Wave_ = p.osc1Wave;
        osc2Wave_ = p.osc2Wave;
        oscMix_ = p.oscMix;
        osc2Detune_ = p.osc2Detune;
        filterCutoff_ = p.filterCutoff;
        filterRes_ = p.filterRes;
        filterEnvDepth_ = p.filterEnvDepth;

        currentAmpEnv_.attackRC = p.ampAttack;
        currentAmpEnv_.decayRC = p.ampDecay;
        currentAmpEnv_.sustainLevel = p.ampSustain;
        currentAmpEnv_.releaseRC = p.ampRelease;

        currentFilterEnv_.attackRC = p.filtAttack;
        currentFilterEnv_.decayRC = p.filtDecay;
        currentFilterEnv_.sustainLevel = p.filtSustain;
        currentFilterEnv_.releaseRC = p.filtRelease;
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
            if (voices_[i].ampEnv.stage == RCEnvelope::RELEASE) return &voices_[i];
        }
        int minIdx = 0;
        float minLevel = 2.0f;
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].ampEnv.level < minLevel) {
                minLevel = voices_[i].ampEnv.level;
                minIdx = i;
            }
        }
        return &voices_[minIdx];
    }
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(VASynthModule) {
    emscripten::class_<VASynth>("VASynth")
        .constructor<>()
        .function("initialize", &VASynth::initialize)
        .function("noteOn", &VASynth::noteOn)
        .function("noteOff", &VASynth::noteOff)
        .function("allNotesOff", &VASynth::allNotesOff)
        .function("process", &VASynth::process)
        .function("setParameter", &VASynth::setParameter)
        .function("setVolume", &VASynth::setVolume)
        .function("controlChange", &VASynth::controlChange)
        .function("pitchBend", &VASynth::pitchBend)
        .function("programChange", &VASynth::programChange)
        .function("setMode", &VASynth::setMode);
}

} // namespace devilbox
