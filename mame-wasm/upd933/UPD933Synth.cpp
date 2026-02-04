/**
 * uPD933 - NEC/Casio "Phase Distortion" Synthesis Chip for DEViLBOX
 *
 * Based on MAME emulator by Devin Acker
 *
 * The uPD933 is the sound generator used in the Casio CZ series of
 * synthesizers (CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000). It implements
 * Casio's proprietary "Phase Distortion" (PD) synthesis technique, which
 * distorts the phase of a cosine wave using various transfer functions
 * to create harmonically rich timbres.
 *
 * Features:
 * - 8 waveform types: sawtooth, square, pulse, silent, double sine,
 *   saw pulse, resonance, double pulse
 * - 6 window functions: none, sawtooth, triangle, trapezoid, pulse, double saw
 * - 3 envelope generators per voice: DCA (amplitude), DCW (waveform), DCO (pitch)
 * - Ring modulation between voice pairs
 * - Pitch modulation (from other voice or noise)
 * - Cosine-based output with phase distortion
 * - 8-voice polyphony (matching hardware)
 *
 * Used in: Casio CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000
 *
 * License: BSD-3-Clause (matching MAME)
 */

#include <emscripten/bind.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>

namespace devilbox {

// ============================================================================
// Constants (from MAME upd933.h)
// ============================================================================
static constexpr unsigned NOTE_SHIFT = 9;
static constexpr unsigned PITCH_SHIFT = 20;
static constexpr unsigned PITCH_FINE_SHIFT = 12;
static constexpr unsigned VOLUME_SHIFT = 12;
static constexpr unsigned ENV_DCA_SHIFT = 16;
static constexpr unsigned ENV_DCW_SHIFT = 16;
static constexpr unsigned ENV_DCO_SHIFT = 11;

// ============================================================================
// Parameter IDs
// ============================================================================
enum UPD933ParamId {
    PARAM_VOLUME = 0,
    PARAM_WAVEFORM1 = 1,    // 0-7
    PARAM_WAVEFORM2 = 2,    // 0-7
    PARAM_WINDOW = 3,       // 0-5
    PARAM_DCW_DEPTH = 4,    // 0-127 (waveform distortion amount)
    PARAM_DCA_RATE = 5,     // 0-127 (amplitude envelope rate)
    PARAM_DCW_RATE = 6,     // 0-127 (waveform envelope rate)
    PARAM_DCO_RATE = 7,     // 0-127 (pitch envelope rate)
    PARAM_DCO_DEPTH = 8,    // 0-63 (pitch envelope depth)
    PARAM_RING_MOD = 9,     // 0-1
    PARAM_STEREO_WIDTH = 10,
};

// ============================================================================
// Envelope generator (from MAME env_t)
// ============================================================================
struct Envelope {
    uint8_t direction = 0;   // 0=up, 1=down
    uint8_t sustain = 1;
    uint32_t rate = 0;
    uint32_t target = 0;
    uint32_t current = 0;

    void update() {
        if (current != target) {
            if (!direction) {  // increasing
                if (current > target || target - current <= rate)
                    current = target;
                else
                    current += rate;
            } else {  // decreasing
                if (current < target || current - target <= rate)
                    current = target;
                else
                    current -= rate;
            }
        }
    }

    void reset() {
        direction = 0;
        sustain = 1;
        rate = 0;
        target = 0;
        current = 0;
    }
};

// ============================================================================
// Voice structure (from MAME voice_t + envelope state)
// ============================================================================
struct PDVoice {
    // Waveform
    uint8_t wave[2] = {0, 0};   // two waveform selections (0-7)
    uint8_t window = 0;          // window function (0-5)
    uint8_t ring_mod = 0;
    uint8_t pitch_mod = 0;
    uint8_t mute_other = 0;

    // Pitch (7.9 fixed point semitones)
    uint16_t pitch = 0;
    uint32_t position = 0;
    uint32_t pitch_step = 0;
    uint16_t dcw_limit = 0;
    int16_t pm_level = 0;

    // Envelopes
    Envelope dca;   // amplitude
    Envelope dcw;   // waveform (distortion depth)
    Envelope dco;   // pitch

    // Voice state
    bool active = false;
    int midi_note = -1;
    float velocity = 0.0f;

    // Envelope stage tracking for ADSR-like behavior
    uint8_t env_stage = 0;  // 0=attack, 1=decay, 2=sustain, 3=release

    void reset() {
        wave[0] = wave[1] = 0;
        window = 0;
        ring_mod = 0;
        pitch_mod = 0;
        mute_other = 0;
        pitch = 0;
        position = 0;
        pitch_step = 0;
        dcw_limit = 0;
        pm_level = 0;
        dca.reset();
        dcw.reset();
        dco.reset();
        active = false;
        midi_note = -1;
        velocity = 0.0f;
        env_stage = 0;
    }
};

// ============================================================================
// CZ-style preset definition
// ============================================================================
struct CZPreset {
    const char* name;
    uint8_t wave1;           // first waveform (0-7)
    uint8_t wave2;           // second waveform (0-7)
    uint8_t window;          // window function (0-5)
    uint8_t ring_mod;        // ring modulation enable

    // DCA envelope (attack target, attack rate, decay rate, sustain level)
    uint32_t dca_attack_target;
    uint8_t dca_attack_rate;
    uint8_t dca_decay_rate;
    uint32_t dca_sustain_level;
    uint8_t dca_release_rate;

    // DCW envelope (attack target, attack rate, decay rate, sustain level)
    uint32_t dcw_attack_target;
    uint8_t dcw_attack_rate;
    uint8_t dcw_decay_rate;
    uint32_t dcw_sustain_level;

    // DCO pitch envelope depth (0 = none)
    uint8_t dco_depth;
    uint8_t dco_rate;
};

static const CZPreset cz_presets[8] = {
    // 0: Brass - resonance waveform, high DCW with fast decay
    { "Brass", 6, 6, 0, 0,
      0x7F, 90, 40, 0x50, 30,
      0x70, 95, 30, 0x20,
      4, 80 },

    // 1: Strings - sawtooth with triangle window, medium DCW
    { "Strings", 0, 0, 2, 0,
      0x7F, 50, 20, 0x60, 25,
      0x50, 40, 15, 0x30,
      0, 0 },

    // 2: Electric Piano - double sine, medium attack
    { "E.Piano", 4, 4, 0, 0,
      0x7F, 85, 35, 0x40, 35,
      0x60, 80, 40, 0x15,
      0, 0 },

    // 3: Bass - pulse with saw window, fast DCW decay
    { "Bass", 2, 2, 1, 0,
      0x7F, 100, 50, 0x30, 40,
      0x7F, 100, 60, 0x10,
      0, 0 },

    // 4: Organ - square, sustained DCW
    { "Organ", 1, 1, 0, 0,
      0x7F, 100, 10, 0x70, 30,
      0x40, 100, 5, 0x38,
      0, 0 },

    // 5: Pad - saw pulse with slow DCW
    { "Pad", 5, 5, 3, 0,
      0x7F, 30, 10, 0x60, 20,
      0x50, 25, 8, 0x30,
      0, 0 },

    // 6: Lead - pulse with fast DCW
    { "Lead", 2, 2, 0, 0,
      0x7F, 95, 30, 0x55, 35,
      0x7F, 90, 50, 0x20,
      2, 60 },

    // 7: Bell - double pulse with ring mod
    { "Bell", 7, 4, 0, 1,
      0x7F, 100, 15, 0x10, 20,
      0x60, 100, 20, 0x08,
      8, 70 },
};

// ============================================================================
// Main uPD933 Synth Class
// ============================================================================
class UPD933Synth {
public:
    static constexpr int NUM_VOICES = 8;

    UPD933Synth() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }
    }

    void initialize(float sampleRate) {
        sampleRate_ = sampleRate;
        volume_ = 0.8f;
        stereoWidth_ = 0.5f;
        currentPreset_ = 0;
        sampleCount_ = 0;
        lastSample_ = 0;
        pitchBendFactor_ = 1.0f;

        // Pre-compute cosine table (from MAME device_start)
        for (int i = 0; i < 0x800; i++) {
            cosine_[i] = (uint16_t)(0xFFF * (1.0 - cos(2.0 * M_PI * i / 0x7FF)) / 2.0);
        }

        // Pre-compute pitch table (from MAME, A4 = note 62 at 442 Hz)
        // Adjusted for our sample rate instead of chip clock/112
        double internalRate = 40000.0;  // Original chip ~40kHz
        for (int i = 0; i < 0x80; i++) {
            double freq = 442.0 * pow(2.0, (i - 62) / 12.0);
            pitchTable_[i] = (uint32_t)((1 << PITCH_SHIFT) * (freq * 0x800 / internalRate));
        }

        // Pre-compute fine pitch table
        for (int i = 0; i < 0x200; i++) {
            pitchFine_[i] = (uint16_t)((1 << PITCH_FINE_SHIFT) * (pow(2.0, (double)i / (12.0 * 0x200)) - 1.0));
        }

        // Pre-compute logarithmic volume table
        volumeTable_[0] = 0;
        for (int i = 1; i < 0x200; i++) {
            volumeTable_[i] = (uint16_t)pow(2 << VOLUME_SHIFT, (double)i / 0x1FF);
        }

        // Rate scaling for our sample rate vs chip's ~40kHz
        rateScale_ = internalRate / sampleRate;

        // Pan positions for stereo spread
        panPositions_[0] = -0.4f;
        panPositions_[1] = 0.4f;
        panPositions_[2] = -0.2f;
        panPositions_[3] = 0.2f;
        panPositions_[4] = -0.3f;
        panPositions_[5] = 0.3f;
        panPositions_[6] = -0.1f;
        panPositions_[7] = 0.1f;

        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].reset();
        }
    }

    // ========================================================================
    // Envelope rate computation (from MAME env_rate)
    // ========================================================================

    uint32_t envRate(uint8_t data) const {
        uint32_t rate = (8 | (data & 7)) << (data >> 3);
        // Scale rate for our sample rate
        return (uint32_t)(rate * rateScale_);
    }

    // ========================================================================
    // Pitch step computation (from MAME update_pitch_step)
    // ========================================================================

    void updatePitchStep(int vnum) {
        PDVoice& voice = voices_[vnum];
        int32_t pitch = (int32_t)(voice.pitch + (voice.dco.current >> ENV_DCO_SHIFT)) + voice.pm_level;

        uint32_t step = 0;
        if (pitch > 0 && pitch < (1 << 16)) {
            uint8_t note = pitch >> NOTE_SHIFT;
            uint16_t fine = pitch & ((1 << NOTE_SHIFT) - 1);

            if (note < 0x80) {
                step = pitchTable_[note];
                if (fine && fine < 0x200)
                    step += (step >> PITCH_FINE_SHIFT) * pitchFine_[fine];
            }
        }

        // Apply pitch bend
        step = (uint32_t)(step * pitchBendFactor_);

        voice.pitch_step = step;

        // DCW limit for high pitches (from MAME, prevents aliasing)
        voice.dcw_limit = 0x400 - std::min(0x400U, (step >> (PITCH_SHIFT - 2)));
    }

    // ========================================================================
    // Core sample generation (from MAME update function)
    // ========================================================================

    int16_t updateVoice(int vnum) {
        PDVoice& voice = voices_[vnum];
        int16_t sample = 0;

        const uint16_t pos = (voice.position >> PITCH_SHIFT) & 0x7FF;
        const uint8_t wave = (voice.position >> (PITCH_SHIFT + 11)) & 1;

        const uint16_t dcw = std::min((uint16_t)(voice.dcw.current >> ENV_DCW_SHIFT), voice.dcw_limit);
        const uint16_t pivot = 0x400 - dcw;
        uint16_t phase = 0;
        uint16_t window = 0;

        // ================================================================
        // Apply transfer function (phase distortion) - from MAME
        // ================================================================
        switch (voice.wave[wave] & 7) {
            case 0: // sawtooth
                if (pos < pivot)
                    phase = pos * 0x400 / std::max(pivot, (uint16_t)1);
                else
                    phase = 0x400 + (pos - pivot) * 0x400 / std::max((uint16_t)(0x800 - pivot), (uint16_t)1);
                break;

            case 1: // square
                if ((pos & 0x3FF) < pivot)
                    phase = (pos & 0x3FF) * 0x400 / std::max(pivot, (uint16_t)1);
                else
                    phase = 0x3FF;
                phase |= (pos & 0x400);
                break;

            case 2: // pulse
                if (pos < pivot * 2)
                    phase = pos * 0x800 / std::max((uint16_t)(pivot * 2), (uint16_t)1);
                else
                    phase = 0x7FF;
                break;

            case 3: // silent
                break;

            case 4: // double sine
                if (pos < pivot)
                    phase = pos * 0x800 / std::max(pivot, (uint16_t)1);
                else
                    phase = (pos - pivot) * 0x800 / std::max((uint16_t)(0x800 - pivot), (uint16_t)1);
                break;

            case 5: // saw pulse
                if (pos < 0x400)
                    phase = pos;
                else if (pos < (pivot + 0x400))
                    phase = 0x400 + (pos & 0x3FF) * 0x400 / std::max(pivot, (uint16_t)1);
                else
                    phase = 0x7FF;
                break;

            case 6: // resonance
                phase = pos + ((pos * dcw) >> 6);
                phase &= 0x7FF;
                break;

            case 7: // double pulse
                if ((pos & 0x3FF) < pivot)
                    phase = (pos & 0x3FF) * 0x400 / std::max(pivot, (uint16_t)1);
                else
                    phase = 0x7FF;
                break;
        }

        // ================================================================
        // Apply window function - from MAME
        // ================================================================
        switch (voice.window & 7) {
            case 0: // none
                break;
            case 1: // sawtooth (falls)
                window = pos;
                break;
            case 2: // triangle
                window = (pos & 0x3FF) * 2;
                if (pos < 0x400)
                    window ^= 0x7FE;
                break;
            case 3: // trapezoid
                if (pos >= 0x400)
                    window = (pos & 0x3FF) * 2;
                break;
            case 4: // pulse (falls first half)
                if (pos < 0x400)
                    window = pos * 2;
                else
                    window = 0x7FF;
                break;
            default: // double saw (5,6,7)
                window = (0x3FF ^ (pos & 0x3FF)) * 2;
                break;
        }

        // Cosine lookup with distorted phase
        phase &= 0x7FF;
        sample = cosine_[phase];

        // Apply window
        if (window)
            sample = ((int32_t)sample * (0x800 - window)) / 0x800;

        // Center sample around zero, apply volume
        const uint16_t vol = voice.dca.current >> ENV_DCA_SHIFT;
        uint16_t volIdx = std::min(vol, (uint16_t)0x1FF);
        sample = ((int32_t)sample * volumeTable_[volIdx]) >> VOLUME_SHIFT;
        sample -= volumeTable_[volIdx] / 2;

        // Ring modulation
        if (voice.ring_mod)
            sample = ((int32_t)sample * lastSample_) / 0x1000;

        // Mute/negate previous voice
        if (voice.mute_other)
            sample -= lastSample_;

        // ================================================================
        // Update envelopes
        // ================================================================
        uint32_t old_dco = voice.dco.current;
        int16_t old_pm = voice.pm_level;

        voice.dca.update();
        voice.dcw.update();
        voice.dco.update();

        // Check if note should end (DCA reached zero in release)
        if (voice.env_stage == 3 && voice.dca.current == 0) {
            voice.active = false;
        }

        // Pitch modulation (every 8 samples, from MAME)
        if (!(sampleCount_ & 7)) {
            switch (voice.pitch_mod & 3) {
                default:
                    voice.pm_level = 0;
                    break;
                case 2:
                    voice.pm_level = lastSample_;
                    break;
                case 3:
                    // Noise modulation - xorshift LFSR
                    noiseState_ ^= noiseState_ << 13;
                    noiseState_ ^= noiseState_ >> 17;
                    noiseState_ ^= noiseState_ << 5;
                    voice.pm_level = (int16_t)(noiseState_ & (32 << NOTE_SHIFT));
                    break;
            }
        }

        if (((old_dco ^ voice.dco.current) >> ENV_DCO_SHIFT) || old_pm != voice.pm_level)
            updatePitchStep(vnum);

        // Advance phase
        voice.position += voice.pitch_step;

        lastSample_ = sample;
        return sample;
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
        PDVoice& v = voices_[voiceIdx];

        v.reset();
        v.active = true;
        v.midi_note = note;
        v.velocity = velocity / 127.0f;

        // Set pitch from MIDI note (7.9 fixed point semitones)
        // A4 (MIDI 69) = note 62 in chip convention
        int chipNote = note - 69 + 62;
        if (chipNote < 0) chipNote = 0;
        if (chipNote > 127) chipNote = 127;
        v.pitch = chipNote << NOTE_SHIFT;

        // Apply current preset
        applyPreset(voiceIdx, currentPreset_);

        // Initialize pitch step
        updatePitchStep(voiceIdx);

        // Start DCA attack
        v.env_stage = 0;
    }

    void noteOff(int note) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active && voices_[i].midi_note == note) {
                // Enter release stage
                voices_[i].env_stage = 3;
                const CZPreset& preset = cz_presets[currentPreset_];
                voices_[i].dca.direction = 1;
                voices_[i].dca.sustain = 0;
                voices_[i].dca.target = 0;
                voices_[i].dca.rate = envRate(preset.dca_release_rate);

                // Also release DCW
                voices_[i].dcw.direction = 1;
                voices_[i].dcw.sustain = 0;
                voices_[i].dcw.target = 0;
                voices_[i].dcw.rate = envRate(preset.dcw_decay_rate);
            }
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_VOICES; i++) {
            voices_[i].active = false;
            voices_[i].dca.current = 0;
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
            case PARAM_WAVEFORM1:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].wave[0] = std::clamp((int)value, 0, 7);
                }
                break;
            case PARAM_WAVEFORM2:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].wave[1] = std::clamp((int)value, 0, 7);
                }
                break;
            case PARAM_WINDOW:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].window = std::clamp((int)value, 0, 5);
                }
                break;
            case PARAM_DCW_DEPTH:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        uint32_t target = std::clamp((int)value, 0, 127) << (ENV_DCW_SHIFT + 3);
                        voices_[i].dcw.target = target;
                    }
                }
                break;
            case PARAM_DCA_RATE:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].dca.rate = envRate(std::clamp((int)value, 0, 127));
                }
                break;
            case PARAM_DCW_RATE:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].dcw.rate = envRate(std::clamp((int)value, 0, 127));
                }
                break;
            case PARAM_DCO_RATE:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].dco.rate = envRate(std::clamp((int)value, 0, 127));
                }
                break;
            case PARAM_DCO_DEPTH:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active) {
                        int depth = std::clamp((int)value, 0, 63);
                        voices_[i].dco.target = depth << (ENV_DCO_SHIFT + 5);
                    }
                }
                break;
            case PARAM_RING_MOD:
                for (int i = 0; i < NUM_VOICES; i++) {
                    if (voices_[i].active)
                        voices_[i].ring_mod = (value > 0.5f) ? 1 : 0;
                }
                break;
            case PARAM_STEREO_WIDTH:
                stereoWidth_ = std::clamp(value, 0.0f, 1.0f);
                break;
        }
    }

    void controlChange(int cc, int value) {
        float norm = value / 127.0f;
        switch (cc) {
            case 1:   // Mod wheel -> DCW depth
                setParameter(PARAM_DCW_DEPTH, norm * 127.0f);
                break;
            case 70:  // Waveform 1
                setParameter(PARAM_WAVEFORM1, (norm * 7.0f));
                break;
            case 71:  // Waveform 2
                setParameter(PARAM_WAVEFORM2, (norm * 7.0f));
                break;
            case 72:  // Window function
                setParameter(PARAM_WINDOW, (norm * 5.0f));
                break;
            case 73:  // DCA rate (attack)
                setParameter(PARAM_DCA_RATE, norm * 127.0f);
                break;
            case 74:  // DCW rate
                setParameter(PARAM_DCW_RATE, norm * 127.0f);
                break;
            case 75:  // Ring mod
                setParameter(PARAM_RING_MOD, norm);
                break;
            case 76:  // DCO depth (pitch env)
                setParameter(PARAM_DCO_DEPTH, norm * 63.0f);
                break;
            case 7:   // Volume
                volume_ = norm;
                break;
            case 10:  // Pan / stereo width
                stereoWidth_ = norm;
                break;
        }
    }

    void pitchBend(float value) {
        pitchBendFactor_ = powf(2.0f, value * 2.0f / 12.0f);
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) updatePitchStep(i);
        }
    }

    void programChange(int program) {
        currentPreset_ = std::clamp(program, 0, 7);
    }

    void setVolume(float vol) {
        volume_ = std::clamp(vol, 0.0f, 1.0f);
    }

    void setWaveform(int wave1, int wave2) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].wave[0] = std::clamp(wave1, 0, 7);
                voices_[i].wave[1] = std::clamp(wave2, 0, 7);
            }
        }
    }

    void setWindow(int win) {
        for (int i = 0; i < NUM_VOICES; i++) {
            if (voices_[i].active) {
                voices_[i].window = std::clamp(win, 0, 5);
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
            int32_t mixSample = 0;

            // Process voices in modulation-correct order (from MAME)
            static const int voice_map[] = {5, 0, 7, 2, 1, 4, 3, 6};
            for (int j = 0; j < NUM_VOICES; j++) {
                int vnum = voice_map[j];
                if (voices_[vnum].active || voices_[vnum].dca.current > 0) {
                    mixSample += updateVoice(vnum);
                }
            }

            sampleCount_++;

            // Convert to float, apply volume
            float fSample = (float)mixSample / 32768.0f;
            fSample *= volume_;

            // Simple stereo spread based on voice activity
            float mixL = fSample * 0.7f;
            float mixR = fSample * 0.7f;

            // Add per-voice stereo positioning
            for (int v = 0; v < NUM_VOICES; v++) {
                if (voices_[v].active) {
                    float pan = panPositions_[v] * stereoWidth_;
                    float panR = (pan + 1.0f) * 0.5f;
                    float panL = 1.0f - panR;
                    float voiceSample = (float)lastSample_ / 32768.0f * volume_ * 0.3f / NUM_VOICES;
                    mixL += voiceSample * panL;
                    mixR += voiceSample * panR;
                }
            }

            // Soft clip
            outL[i] = tanhf(mixL);
            outR[i] = tanhf(mixR);
        }
    }

private:
    // ========================================================================
    // Voice allocation
    // ========================================================================

    int allocateVoice() {
        // Find free voice
        for (int i = 0; i < NUM_VOICES; i++) {
            if (!voices_[i].active && voices_[i].dca.current == 0) {
                return i;
            }
        }
        // Steal voice with lowest amplitude
        int minIdx = 0;
        uint32_t minVol = voices_[0].dca.current;
        for (int i = 1; i < NUM_VOICES; i++) {
            if (voices_[i].dca.current < minVol) {
                minVol = voices_[i].dca.current;
                minIdx = i;
            }
        }
        return minIdx;
    }

    // ========================================================================
    // Preset application
    // ========================================================================

    void applyPreset(int voiceIdx, int presetIdx) {
        PDVoice& v = voices_[voiceIdx];
        const CZPreset& p = cz_presets[presetIdx];

        v.wave[0] = p.wave1;
        v.wave[1] = p.wave2;
        v.window = p.window;
        v.ring_mod = p.ring_mod;

        // DCA: attack phase (rising to target)
        v.dca.direction = 0;
        v.dca.sustain = 0;
        v.dca.current = 0;
        v.dca.target = p.dca_attack_target << (ENV_DCA_SHIFT + 2);
        v.dca.rate = envRate(p.dca_attack_rate);

        // DCW: attack phase (rising distortion)
        v.dcw.direction = 0;
        v.dcw.sustain = 0;
        v.dcw.current = 0;
        v.dcw.target = p.dcw_attack_target << (ENV_DCW_SHIFT + 3);
        v.dcw.rate = envRate(p.dcw_attack_rate);

        // DCO: pitch envelope
        if (p.dco_depth > 0) {
            v.dco.direction = 1;  // falling pitch
            v.dco.sustain = 0;
            v.dco.current = p.dco_depth << (ENV_DCO_SHIFT + 5);
            v.dco.target = 0;
            v.dco.rate = envRate(p.dco_rate);
        } else {
            v.dco.reset();
        }

        v.position = 0;
    }

    // ========================================================================
    // Member data
    // ========================================================================

    PDVoice voices_[NUM_VOICES];
    float sampleRate_ = 44100.0f;
    float volume_ = 0.8f;
    float stereoWidth_ = 0.5f;
    int currentPreset_ = 0;
    float pitchBendFactor_ = 1.0f;
    uint32_t sampleCount_ = 0;
    int16_t lastSample_ = 0;
    double rateScale_ = 1.0;
    uint32_t noiseState_ = 0x12345678;

    // Precomputed tables (from MAME device_start)
    uint16_t cosine_[0x800];
    uint32_t pitchTable_[0x80];
    uint16_t pitchFine_[0x200];
    uint16_t volumeTable_[0x200];

    float panPositions_[NUM_VOICES];
};

// ============================================================================
// Emscripten bindings
// ============================================================================

EMSCRIPTEN_BINDINGS(UPD933Module) {
    emscripten::class_<UPD933Synth>("UPD933Synth")
        .constructor<>()
        .function("initialize", &UPD933Synth::initialize)
        .function("noteOn", &UPD933Synth::noteOn)
        .function("noteOff", &UPD933Synth::noteOff)
        .function("allNotesOff", &UPD933Synth::allNotesOff)
        .function("setParameter", &UPD933Synth::setParameter)
        .function("controlChange", &UPD933Synth::controlChange)
        .function("pitchBend", &UPD933Synth::pitchBend)
        .function("programChange", &UPD933Synth::programChange)
        .function("setVolume", &UPD933Synth::setVolume)
        .function("setWaveform", &UPD933Synth::setWaveform)
        .function("setWindow", &UPD933Synth::setWindow)
        .function("process", &UPD933Synth::process);
}

} // namespace devilbox
