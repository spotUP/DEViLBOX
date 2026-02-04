/**
 * TR-707 Drum Machine - WASM Port for DEViLBOX
 *
 * Roland TR-707/727 PCM drum machine with analog signal conditioning.
 * 10 voices with RC envelope generators, BPF/LPF tone shaping, and stereo mixing.
 *
 * Voice architecture:
 *   8 MUX voices: 8-bit PCM ROM → DAC → VCA(RC EG) → BPF → Volume → LPF → Stereo mix
 *   2 Cymbal voices: 6-bit R2R ROM → HPF → VCA(RC EG) → BPF → Volume → LPF → Stereo mix
 *   Hi-hat has additional HPF → VCA with separate open/closed envelope
 *
 * ROMs: IC34+IC35 = 64KB (mux voices), IC19 = 32KB (crash), IC22 = 32KB (ride)
 *
 * Original MAME source: src/mame/roland/roland_tr707.cpp
 * Copyright holders: AJR, m1macrophage (BSD-3-Clause)
 *
 * DSP components inlined from: va_rc_eg, va_vca, flt_biquad, flt_rc
 */

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <emscripten/bind.h>

// ============================================================================
// Constants
// ============================================================================
static constexpr int NUM_MUX_VOICES = 8;
static constexpr int NUM_CYMBAL_VOICES = 2;
static constexpr int NUM_MIX_CHANNELS = 10;
static constexpr int MAX_CYMBAL_COUNTER = 0x8000;
static constexpr double VCC = 5.0;
static constexpr double VBE = 0.6;
static constexpr double PI = 3.14159265358979323846;

// MUX voice indices
enum MuxVoice {
    MV_BASS = 0, MV_SNARE, MV_LOW_TOM, MV_MID_TOM, MV_HI_TOM,
    MV_HI_HAT, MV_RIMSHOT, MV_HANDCLAP
};

// Cymbal voice indices
enum CymbalVoice { CV_CRASH = 0, CV_RIDE };

// Mix channel indices (maps voice output to mixer input)
enum MixChannel {
    MC_BASS = 0, MC_SNARE, MC_LOW_TOM, MC_MID_TOM, MC_HI_TOM,
    MC_RIMSHOT, MC_HANDCLAP, MC_HI_HAT, MC_CRASH, MC_RIDE
};

// Helper macros matching MAME's rescap.h
#define RES_R(r)    ((double)(r))
#define RES_K(r)    ((double)(r) * 1e3)
#define RES_M(r)    ((double)(r) * 1e6)
#define CAP_U(c)    ((double)(c) * 1e-6)
#define CAP_N(c)    ((double)(c) * 1e-9)
#define CAP_P(c)    ((double)(c) * 1e-12)
#define RES_2_PARALLEL(r1, r2) (((r1) * (r2)) / ((r1) + (r2)))
#define RES_VOLTAGE_DIVIDER(r1, r2) ((double)(r2) / ((double)(r1) + (double)(r2)))

// ============================================================================
// TR-707 component values
// ============================================================================

// EG capacitors per MUX voice
static const double MUX_EG_C[NUM_MUX_VOICES] = {
    CAP_U(0.047), CAP_U(0.047), CAP_U(0.047), CAP_U(0.047),
    CAP_U(0.047), CAP_U(1),     CAP_U(0.047), CAP_U(0.047)
};

// EG discharge resistors per MUX voice (TR-707 values)
static const double MUX_EG_R[NUM_MUX_VOICES] = {
    RES_M(4.7),   // R95 - bass
    RES_M(2.2),   // R102 - snare
    RES_M(4.7),   // R92 - low tom
    RES_M(4.7),   // R93 - mid tom
    RES_M(4.7),   // R85 - hi tom
    RES_M(4.7),   // R104 - hi-hat
    RES_M(2.2),   // R82 - rimshot
    RES_M(4.7),   // R91 - handclap
};

// EG capacitors for cymbal voices
static const double CYMBAL_EG_C[NUM_CYMBAL_VOICES] = {
    CAP_U(1),  // C50 - crash
    CAP_U(1),  // C49 - ride
};

// EG discharge resistors for cymbal voices
static const double CYMBAL_EG_R[NUM_CYMBAL_VOICES] = {
    RES_K(470),  // R58 (adjusted from 47K to match ride)
    RES_2_PARALLEL(RES_K(470), RES_M(2.2)),  // R61 || R73
};

// Stereo pan levels per mix channel: {left_gain, right_gain}
// Derived from TR-707 mixing resistors (inverted: smaller R = more gain)
static const float MIX_PAN[NUM_MIX_CHANNELS][2] = {
    {1.0f,  0.82f},  // Bass: R202=22K, R203=22K (center-ish)
    {0.67f, 0.67f},  // Snare: R205=33K, R206=33K (center)
    {0.82f, 0.47f},  // Low Tom: R208=22K, R207=47K (left)
    {0.67f, 0.67f},  // Mid Tom: R211=33K, R212=33K (center)
    {0.47f, 0.82f},  // Hi Tom: R214=47K, R215=22K (right)
    {0.67f, 0.67f},  // Rimshot: R217=33K, R218=33K (center)
    {0.67f, 0.67f},  // Handclap: R221=33K, R220=33K (center)
    {0.47f, 0.82f},  // Hi-hat: R224=47K, R223=22K (right)
    {0.67f, 0.82f},  // Crash: R227=33K, R226=22K (right-ish)
    {0.82f, 0.47f},  // Ride: R229=22K, R230=47K (left-ish)
};

// Pre-computed BPF parameters per mix channel: {center_freq_hz, Q}
// Derived from TR-707 RC bandpass component values
static const double BPF_PARAMS[NUM_MIX_CHANNELS][2] = {
    {105.0,  0.15},  // Bass: wide low-mid band
    {900.0,  0.10},  // Snare: wide mid band
    {180.0,  0.12},  // Low Tom
    {160.0,  0.10},  // Mid Tom
    {160.0,  0.08},  // Hi Tom
    {3900.0, 0.30},  // Rimshot: emphasis on upper mids
    {3900.0, 0.30},  // Handclap
    {3900.0, 0.30},  // Hi-hat
    {3900.0, 0.25},  // Crash
    {3900.0, 0.25},  // Ride
};

// ============================================================================
// Parameter IDs for external control
// ============================================================================
enum ParamId {
    PARAM_VOLUME = 0,
    PARAM_BASS_LEVEL = 1,
    PARAM_SNARE_LEVEL = 2,
    PARAM_LOWTOM_LEVEL = 3,
    PARAM_MIDTOM_LEVEL = 4,
    PARAM_HITOM_LEVEL = 5,
    PARAM_RIMSHOT_LEVEL = 6,
    PARAM_HANDCLAP_LEVEL = 7,
    PARAM_HIHAT_LEVEL = 8,
    PARAM_CRASH_LEVEL = 9,
    PARAM_RIDE_LEVEL = 10,
    PARAM_ACCENT = 11,
    PARAM_DECAY = 12,
};

// ============================================================================
// Inlined DSP components
// ============================================================================

// RC Envelope Generator (from va_rc_eg)
struct RC_EG {
    double r = RES_M(1);
    double c = CAP_U(0.047);
    double target_v = 0.0;
    double current_v = 0.0;

    void reset() { current_v = 0.0; target_v = 0.0; }

    void update(double dt) {
        if (r <= 0.0 || c <= 0.0) return;
        double tau = r * c;
        double alpha = 1.0 - exp(-dt / tau);
        current_v += (target_v - current_v) * alpha;
    }

    void trigger(double accent_v, double charge_r, double discharge_r) {
        // When triggered, charge through R79 (100 ohm) toward accent voltage
        double r_eff = RES_2_PARALLEL(charge_r, discharge_r);
        r = r_eff;
        target_v = accent_v * RES_VOLTAGE_DIVIDER(charge_r, discharge_r);
    }

    void release(double discharge_r, double discharge_c) {
        r = discharge_r;
        c = discharge_c;
        target_v = 0.0;
    }
};

// 2nd-order biquad filter (from flt_biquad)
struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0;
    double a1 = 0, a2 = 0;
    double x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    void setupBPF(double fc, double q, double sr) {
        if (fc <= 0 || q <= 0 || sr <= 0) { b0 = 1; b1 = b2 = a1 = a2 = 0; return; }
        double w0 = 2.0 * PI * fc / sr;
        double alpha = sin(w0) / (2.0 * q);
        double a0_inv = 1.0 / (1.0 + alpha);
        b0 = alpha * a0_inv;
        b1 = 0;
        b2 = -alpha * a0_inv;
        a1 = -2.0 * cos(w0) * a0_inv;
        a2 = (1.0 - alpha) * a0_inv;
    }

    double process(double x) {
        double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        return y;
    }
};

// 1st-order RC lowpass filter (from flt_rc)
struct RC_LPF {
    double alpha = 0;
    double y_prev = 0;

    void reset() { y_prev = 0; }

    void setup(double fc, double sr) {
        if (fc <= 0 || sr <= 0) { alpha = 1; return; }
        double rc = 1.0 / (2.0 * PI * fc);
        double dt = 1.0 / sr;
        alpha = dt / (rc + dt);
    }

    double process(double x) {
        y_prev += alpha * (x - y_prev);
        return y_prev;
    }
};

// 1st-order RC highpass filter
struct RC_HPF {
    double alpha = 0;
    double x_prev = 0;
    double y_prev = 0;

    void reset() { x_prev = y_prev = 0; }

    void setup(double fc, double sr) {
        if (fc <= 0 || sr <= 0) { alpha = 1; return; }
        double rc = 1.0 / (2.0 * PI * fc);
        double dt = 1.0 / sr;
        alpha = rc / (rc + dt);
    }

    double process(double x) {
        double y = alpha * (y_prev + x - x_prev);
        x_prev = x;
        y_prev = y;
        return y;
    }
};

// ============================================================================
// MIDI drum note mapping
// ============================================================================
struct DrumHit {
    int mix_channel;   // MC_BASS, MC_SNARE, etc.
    int variation;     // 0 or 1 for voice variations
    bool is_cymbal;    // true for crash/ride
    int cymbal_index;  // CV_CRASH or CV_RIDE
};

// Maps MIDI notes 35-56 to TR-707 drum hits
static const int MIDI_MAP_START = 35;
static const int MIDI_MAP_END = 56;

// Returns drum hit info for a MIDI note, or nullptr if not mapped
static const DrumHit* getDrumHit(int midiNote) {
    static const DrumHit hits[] = {
        // note 35 (B1): Bass Drum 2
        {MC_BASS, 1, false, 0},
        // note 36 (C2): Bass Drum 1
        {MC_BASS, 0, false, 0},
        // note 37 (C#2): Rimshot
        {MC_RIMSHOT, 0, false, 0},
        // note 38 (D2): Snare 1
        {MC_SNARE, 0, false, 0},
        // note 39 (D#2): Handclap
        {MC_HANDCLAP, 0, false, 0},
        // note 40 (E2): Snare 2
        {MC_SNARE, 1, false, 0},
        // note 41 (F2): Low Tom
        {MC_LOW_TOM, 0, false, 0},
        // note 42 (F#2): Closed Hi-hat
        {MC_HI_HAT, 0, false, 0},
        // note 43 (G2): Low Tom (alias)
        {MC_LOW_TOM, 0, false, 0},
        // note 44 (G#2): Closed Hi-hat (pedal, alias)
        {MC_HI_HAT, 0, false, 0},
        // note 45 (A2): Mid Tom (alias)
        {MC_MID_TOM, 0, false, 0},
        // note 46 (A#2): Open Hi-hat
        {MC_HI_HAT, 1, false, 0},
        // note 47 (B2): Mid Tom
        {MC_MID_TOM, 0, false, 0},
        // note 48 (C3): Hi Tom (alias)
        {MC_HI_TOM, 0, false, 0},
        // note 49 (C#3): Crash Cymbal
        {MC_CRASH, 0, true, CV_CRASH},
        // note 50 (D3): Hi Tom
        {MC_HI_TOM, 0, false, 0},
        // note 51 (D#3): Ride Cymbal
        {MC_RIDE, 0, true, CV_RIDE},
        // note 52 (E3): (unmapped, alias Hi Tom)
        {MC_HI_TOM, 0, false, 0},
        // note 53 (F3): (unmapped, alias Ride)
        {MC_RIDE, 0, true, CV_RIDE},
        // note 54 (F#3): Tambourine
        {MC_HANDCLAP, 1, false, 0},
        // note 55 (G3): (unmapped, alias Crash)
        {MC_CRASH, 0, true, CV_CRASH},
        // note 56 (G#3): Cowbell
        {MC_RIMSHOT, 1, false, 0},
    };

    if (midiNote < MIDI_MAP_START || midiNote > MIDI_MAP_END) return nullptr;
    return &hits[midiNote - MIDI_MAP_START];
}

// ============================================================================
// TR707Synth class
// ============================================================================
class TR707Synth {
public:
    TR707Synth() {
        memset(m_voicesROM, 0, sizeof(m_voicesROM));
        memset(m_cymbalROM, 0, sizeof(m_cymbalROM));
        for (int i = 0; i < NUM_MIX_CHANNELS; i++) {
            m_channelLevel[i] = 0.8f;
        }
    }

    void initialize(float sampleRate) {
        m_sampleRate = sampleRate;
        m_dt = 1.0 / sampleRate;
        m_masterVolume = 0.8f;
        m_accentLevel = 3.5; // Default accent voltage (~70% of VCC)
        m_romLoaded = false;

        // Initialize all DSP components
        for (int i = 0; i < NUM_MUX_VOICES; i++) {
            m_muxEG[i].reset();
            m_muxEG[i].r = MUX_EG_R[i];
            m_muxEG[i].c = MUX_EG_C[i];
            m_muxCounter[i] = 0;
            m_muxPlaying[i] = false;
            m_muxVariation[i] = 0;
        }

        for (int i = 0; i < NUM_CYMBAL_VOICES; i++) {
            m_cymbalEG[i].reset();
            m_cymbalEG[i].r = CYMBAL_EG_R[i];
            m_cymbalEG[i].c = CYMBAL_EG_C[i];
            m_cymbalCounter[i] = MAX_CYMBAL_COUNTER;
            m_cymbalPlaying[i] = false;
            m_cymbalHPF[i].reset();
            m_cymbalHPF[i].setup(339.0, sampleRate); // ~339 Hz HPF (R63/R64=470R, C35/C34=1uF)
        }

        // Hat-specific state
        m_hatEG.reset();
        m_hatEG.c = CAP_U(1); // C71
        m_hatHPF.reset();
        m_hatHPF.setup(723.0, sampleRate); // ~723 Hz (R121=220R, C69=1uF)
        m_hatIsClosed = false;

        // Setup BPFs and LPFs for all mix channels
        for (int i = 0; i < NUM_MIX_CHANNELS; i++) {
            m_voiceBPF[i].reset();
            m_voiceBPF[i].setupBPF(BPF_PARAMS[i][0], BPF_PARAMS[i][1], sampleRate);
            m_voiceLPF[i].reset();
            m_voiceLPF[i].setup(15900.0, sampleRate); // ~15.9 kHz LPF
        }

        // Native ROM sample rate (~25kHz for TR-707 with 1.6MHz XTAL / 64)
        m_nativeRate = 25000.0f;
        m_rateRatio = (double)m_nativeRate / (double)m_sampleRate;
        m_phaseAccum = 0.0;
    }

    // ========================================================================
    // ROM loading
    // ========================================================================
    // Load ROM data: offset 0 = voices (64KB), offset 0x10000 = crash (32KB),
    //                offset 0x18000 = ride (32KB)
    void loadROM(int offset, uintptr_t dataPtr, int size) {
        uint8_t* data = reinterpret_cast<uint8_t*>(dataPtr);
        if (size <= 0) return;

        if (offset == 0 && size <= 0x10000) {
            // MUX voice ROM (IC34+IC35 interleaved, 64KB)
            memcpy(m_voicesROM, data, std::min(size, (int)sizeof(m_voicesROM)));
        } else if (offset == 0x10000 && size <= 0x8000) {
            // Crash cymbal ROM (IC19, 32KB)
            memcpy(m_cymbalROM[0], data, std::min(size, (int)sizeof(m_cymbalROM[0])));
        } else if (offset == 0x18000 && size <= 0x8000) {
            // Ride cymbal ROM (IC22, 32KB)
            memcpy(m_cymbalROM[1], data, std::min(size, (int)sizeof(m_cymbalROM[1])));
        } else if (offset == 0 && size <= 0x20000) {
            // All ROMs as one blob: [voices 64KB | crash 32KB | ride 32KB]
            int voiceSize = std::min(size, 0x10000);
            memcpy(m_voicesROM, data, voiceSize);
            if (size > 0x10000) {
                int crashSize = std::min(size - 0x10000, 0x8000);
                memcpy(m_cymbalROM[0], data + 0x10000, crashSize);
            }
            if (size > 0x18000) {
                int rideSize = std::min(size - 0x18000, 0x8000);
                memcpy(m_cymbalROM[1], data + 0x18000, rideSize);
            }
        }

        m_romLoaded = true;
    }

    // ========================================================================
    // MIDI-style note interface
    // ========================================================================
    void noteOn(int midiNote, int velocity) {
        const DrumHit* hit = getDrumHit(midiNote);
        if (!hit) return;

        float vel = std::max(0, std::min(127, velocity)) / 127.0f;
        double accent_v = m_accentLevel * (0.5 + 0.5 * vel);
        constexpr double R79 = RES_R(100);

        if (hit->is_cymbal) {
            int ci = hit->cymbal_index;
            // Reset counter and trigger EG
            m_cymbalCounter[ci] = 0;
            m_cymbalPlaying[ci] = true;
            // Charge pulse is < 1 sample (100Ω × 1μF = 100μs), pre-charge and release
            double target = accent_v * RES_VOLTAGE_DIVIDER(R79, CYMBAL_EG_R[ci]);
            m_cymbalEG[ci].current_v = target;
            m_cymbalEG[ci].c = CYMBAL_EG_C[ci];
            m_cymbalEG[ci].r = CYMBAL_EG_R[ci];
            m_cymbalEG[ci].target_v = 0.0;
        } else {
            // Determine which MUX voice
            int mv = -1;
            switch (hit->mix_channel) {
                case MC_BASS:     mv = MV_BASS; m_muxVariation[MV_BASS] = hit->variation; break;
                case MC_SNARE:    mv = MV_SNARE; m_muxVariation[MV_SNARE] = hit->variation; break;
                case MC_LOW_TOM:  mv = MV_LOW_TOM; break;
                case MC_MID_TOM:  mv = MV_MID_TOM; break;
                case MC_HI_TOM:   mv = MV_HI_TOM; break;
                case MC_RIMSHOT:  mv = MV_RIMSHOT; m_muxVariation[MV_RIMSHOT] = hit->variation; break;
                case MC_HANDCLAP: mv = MV_HANDCLAP; m_muxVariation[MV_HANDCLAP] = hit->variation; break;
                case MC_HI_HAT:   mv = MV_HI_HAT; break;
                default: return;
            }
            if (mv < 0) return;

            // Reset sample counter
            m_muxCounter[mv] = 0;
            m_muxPlaying[mv] = true;

            // Trigger EG: charge pulse is < 1 sample (100Ω × 47nF = 4.7μs)
            // Pre-charge to accent voltage and immediately switch to release (discharge)
            double target = accent_v * RES_VOLTAGE_DIVIDER(R79, MUX_EG_R[mv]);
            m_muxEG[mv].current_v = target;
            m_muxEG[mv].c = MUX_EG_C[mv];
            m_muxEG[mv].r = MUX_EG_R[mv] * m_decayScale;
            m_muxEG[mv].target_v = 0.0;

            // Hi-hat specific: trigger hat EG and set open/closed
            if (mv == MV_HI_HAT) {
                m_hatIsClosed = (hit->variation == 0);
                triggerHatEG(true);
                // Hat EG charge is ~100μs (100Ω × 1μF), pre-charge and release
                m_hatEG.current_v = m_hatEG.target_v;
                triggerHatEG(false);
            }
        }
    }

    void noteOff(int midiNote) {
        // Drum hits are one-shot, noteOff is largely ignored
        // But for hi-hat, closing the hat chokes the sound
        const DrumHit* hit = getDrumHit(midiNote);
        if (hit && hit->mix_channel == MC_HI_HAT) {
            // Open hi-hat note off could be treated as a choke
        }
    }

    void allNotesOff() {
        for (int i = 0; i < NUM_MUX_VOICES; i++) {
            m_muxEG[i].release(MUX_EG_R[i], MUX_EG_C[i]);
        }
        for (int i = 0; i < NUM_CYMBAL_VOICES; i++) {
            m_cymbalEG[i].release(CYMBAL_EG_R[i], CYMBAL_EG_C[i]);
        }
        m_hatEG.target_v = 0;
    }

    // ========================================================================
    // Parameter control
    // ========================================================================
    void setParameter(int paramId, float value) {
        switch (paramId) {
            case PARAM_VOLUME:
                m_masterVolume = std::max(0.0f, std::min(1.0f, value));
                break;
            case PARAM_ACCENT:
                m_accentLevel = std::max(0.0, std::min(5.0, (double)value * VCC));
                break;
            case PARAM_DECAY:
                // Scale all discharge resistors (affects decay time)
                // value: 0.5 = short, 1.0 = normal, 2.0 = long
                m_decayScale = std::max(0.1, std::min(4.0, (double)value));
                break;
            default:
                if (paramId >= PARAM_BASS_LEVEL && paramId <= PARAM_RIDE_LEVEL) {
                    int ch = paramId - PARAM_BASS_LEVEL;
                    if (ch >= 0 && ch < NUM_MIX_CHANNELS) {
                        m_channelLevel[ch] = std::max(0.0f, std::min(1.0f, value));
                    }
                }
                break;
        }
    }

    void setVolume(float value) {
        m_masterVolume = std::max(0.0f, std::min(1.0f, value));
    }

    void programChange(int program) {
        // Presets: adjust mix levels for different styles
        for (int i = 0; i < NUM_MIX_CHANNELS; i++)
            m_channelLevel[i] = 0.8f;

        switch (program) {
            case 0: // Standard
                break;
            case 1: // Heavy Bass
                m_channelLevel[MC_BASS] = 1.0f;
                m_channelLevel[MC_SNARE] = 0.9f;
                m_channelLevel[MC_HI_HAT] = 0.6f;
                break;
            case 2: // Bright
                m_channelLevel[MC_HI_HAT] = 1.0f;
                m_channelLevel[MC_CRASH] = 1.0f;
                m_channelLevel[MC_RIDE] = 1.0f;
                m_channelLevel[MC_RIMSHOT] = 1.0f;
                break;
            case 3: // Soft
                for (int i = 0; i < NUM_MIX_CHANNELS; i++)
                    m_channelLevel[i] = 0.6f;
                break;
            case 4: // Latin
                m_channelLevel[MC_RIMSHOT] = 1.0f;
                m_channelLevel[MC_HANDCLAP] = 1.0f;
                m_channelLevel[MC_HI_HAT] = 0.9f;
                break;
            case 5: // Electronic
                m_channelLevel[MC_BASS] = 1.0f;
                m_channelLevel[MC_SNARE] = 1.0f;
                m_channelLevel[MC_HANDCLAP] = 0.9f;
                break;
            case 6: // Jazz
                m_channelLevel[MC_RIDE] = 1.0f;
                m_channelLevel[MC_HI_HAT] = 0.9f;
                m_channelLevel[MC_BASS] = 0.7f;
                m_channelLevel[MC_SNARE] = 0.6f;
                break;
            case 7: // Rock
                m_channelLevel[MC_BASS] = 1.0f;
                m_channelLevel[MC_SNARE] = 1.0f;
                m_channelLevel[MC_CRASH] = 0.9f;
                m_channelLevel[MC_HI_TOM] = 0.9f;
                break;
        }
    }

    void controlChange(int cc, int value) {
        float v = std::max(0, std::min(127, value)) / 127.0f;
        switch (cc) {
            case 7:  m_masterVolume = v; break;   // Volume
            case 10: break;                        // Pan (fixed per voice)
            case 71: m_accentLevel = v * VCC; break; // Accent
            default: break;
        }
    }

    void pitchBend(int value) {
        // Pitch bend can slightly adjust playback rate
        m_pitchBendFactor = pow(2.0, (value / 8192.0) * (2.0 / 12.0));
    }

    void setMode(int mode) {
        // 0 = TR-707 (default), 1 = could be TR-727 variant
        // For now, just TR-707
    }

    // ========================================================================
    // Audio processing
    // ========================================================================
    void process(uintptr_t outputPtrL, uintptr_t outputPtrR, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputPtrL);
        float* outR = reinterpret_cast<float*>(outputPtrR);

        if (!m_romLoaded) {
            memset(outL, 0, numSamples * sizeof(float));
            memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        double effectiveRate = m_nativeRate * m_pitchBendFactor;
        double ratio = effectiveRate / m_sampleRate;

        for (int s = 0; s < numSamples; s++) {
            float mixL = 0.0f, mixR = 0.0f;

            // Advance phase accumulator for sample rate conversion
            m_phaseAccum += ratio;
            int steps = (int)m_phaseAccum;
            m_phaseAccum -= steps;

            // Advance sample counters
            for (int step = 0; step < steps; step++) {
                for (int i = 0; i < NUM_MUX_VOICES; i++) {
                    if (m_muxPlaying[i]) {
                        m_muxCounter[i]++;
                        // Each voice has 8192 samples (13-bit address space)
                        if (m_muxCounter[i] >= 8192) {
                            m_muxPlaying[i] = false;
                        }
                    }
                }
                for (int i = 0; i < NUM_CYMBAL_VOICES; i++) {
                    if (m_cymbalPlaying[i] && m_cymbalCounter[i] < MAX_CYMBAL_COUNTER) {
                        m_cymbalCounter[i]++;
                        if (m_cymbalCounter[i] >= MAX_CYMBAL_COUNTER) {
                            m_cymbalPlaying[i] = false;
                        }
                    }
                }
            }

            // Process MUX voices
            for (int i = 0; i < NUM_MUX_VOICES; i++) {
                // Update EG (release parameters were set at noteOn time)
                m_muxEG[i].update(m_dt);

                if (m_muxEG[i].current_v < 0.001) continue;

                // Read sample from ROM
                int variation = m_muxVariation[i];
                uint16_t counter = m_muxCounter[i] & 0x1FFF;
                // Bass and snare use variation bit in LSB
                if (i == MV_BASS || i == MV_SNARE) {
                    counter = (counter & 0x1FFE) | variation;
                }
                // Rimshot/cowbell and handclap/tambourine use variation similarly
                else if (i == MV_RIMSHOT || i == MV_HANDCLAP) {
                    counter = (counter & 0x1FFE) | variation;
                }

                uint8_t sample = m_voicesROM[(i << 13) | counter];

                // DAC: 8-bit sample → voltage (larger values = more negative)
                // Simplified from mux_dac_v()
                double v_eg = m_muxEG[i].current_v;
                double audio = (128.0 - (double)sample) / 128.0;

                // VCA: multiply by EG (normalized to 0-1 range)
                double vca_out = audio * (v_eg / VCC);

                // Determine mix channel
                int mc;
                if (i == MV_HI_HAT) {
                    // Hi-hat goes through additional HPF + VCA before mixing
                    double hpf_out = m_hatHPF.process(vca_out);

                    // Hat EG controls the additional VCA
                    m_hatEG.update(m_dt);
                    double hat_gain = m_hatEG.current_v / VCC;
                    double hat_out = hpf_out * hat_gain;

                    mc = MC_HI_HAT;
                    // BPF → Volume → LPF → Mix
                    double bpf_out = m_voiceBPF[mc].process(hat_out);
                    double vol_out = bpf_out * m_channelLevel[mc];
                    double lpf_out = m_voiceLPF[mc].process(vol_out);

                    mixL += (float)(lpf_out * MIX_PAN[mc][0]);
                    mixR += (float)(lpf_out * MIX_PAN[mc][1]);
                    continue;
                }

                // Map MUX voice to mix channel
                switch (i) {
                    case MV_BASS:     mc = MC_BASS; break;
                    case MV_SNARE:    mc = MC_SNARE; break;
                    case MV_LOW_TOM:  mc = MC_LOW_TOM; break;
                    case MV_MID_TOM:  mc = MC_MID_TOM; break;
                    case MV_HI_TOM:   mc = MC_HI_TOM; break;
                    case MV_RIMSHOT:  mc = MC_RIMSHOT; break;
                    case MV_HANDCLAP: mc = MC_HANDCLAP; break;
                    default: continue;
                }

                // BPF → Volume → LPF → Mix
                double bpf_out = m_voiceBPF[mc].process(vca_out);
                double vol_out = bpf_out * m_channelLevel[mc];
                double lpf_out = m_voiceLPF[mc].process(vol_out);

                mixL += (float)(lpf_out * MIX_PAN[mc][0]);
                mixR += (float)(lpf_out * MIX_PAN[mc][1]);
            }

            // Process cymbal voices
            for (int i = 0; i < NUM_CYMBAL_VOICES; i++) {
                // Update EG
                m_cymbalEG[i].update(m_dt);

                if (m_cymbalEG[i].current_v < 0.001) continue;

                // Read sample from cymbal ROM (6-bit DAC, use upper 6 bits)
                uint16_t addr = m_cymbalCounter[i] & 0x7FFF;
                uint8_t sample = m_cymbalROM[i][addr];
                double audio = ((double)(sample >> 2) / 63.0) * 2.0 - 1.0;

                // HPF (~339 Hz)
                double hpf_out = m_cymbalHPF[i].process(audio);

                // VCA with EG
                double vca_out = hpf_out * (m_cymbalEG[i].current_v / VCC);

                // Mix channel
                int mc = (i == CV_CRASH) ? MC_CRASH : MC_RIDE;

                // BPF → Volume → LPF → Mix
                double bpf_out = m_voiceBPF[mc].process(vca_out);
                double vol_out = bpf_out * m_channelLevel[mc];
                double lpf_out = m_voiceLPF[mc].process(vol_out);

                mixL += (float)(lpf_out * MIX_PAN[mc][0]);
                mixR += (float)(lpf_out * MIX_PAN[mc][1]);
            }

            // Master volume and final scaling
            float scale = m_masterVolume * 0.4f; // Headroom
            outL[s] = mixL * scale;
            outR[s] = mixR * scale;

            // Soft clip
            outL[s] = tanhf(outL[s] * 1.5f) / 1.5f;
            outR[s] = tanhf(outR[s] * 1.5f) / 1.5f;
        }
    }

private:
    void triggerHatEG(bool triggering) {
        // Hat EG: separate open/closed decay rates
        double r_discharge = RES_2_PARALLEL(RES_K(220), RES_M(1)); // R124, R126
        if (m_hatIsClosed)
            r_discharge = RES_2_PARALLEL(r_discharge, RES_K(10)); // R123 (fast decay)
        r_discharge += RES_K(4.7); // R127

        if (triggering) {
            double r_charge = RES_R(100); // R128
            m_hatEG.r = RES_2_PARALLEL(r_charge, r_discharge);
            m_hatEG.target_v = VCC * RES_VOLTAGE_DIVIDER(r_charge, r_discharge);
        } else {
            m_hatEG.r = r_discharge;
            m_hatEG.target_v = 0;
        }
    }

    // ========================================================================
    // State
    // ========================================================================

    // ROM data
    uint8_t m_voicesROM[0x10000];      // 64KB mux voice ROM
    uint8_t m_cymbalROM[2][0x8000];    // 2x 32KB cymbal ROMs
    bool m_romLoaded = false;

    // MUX voice state
    uint16_t m_muxCounter[NUM_MUX_VOICES] = {};
    bool m_muxPlaying[NUM_MUX_VOICES] = {};
    int m_muxVariation[NUM_MUX_VOICES] = {};
    RC_EG m_muxEG[NUM_MUX_VOICES];

    // Cymbal voice state
    uint16_t m_cymbalCounter[NUM_CYMBAL_VOICES] = {};
    bool m_cymbalPlaying[NUM_CYMBAL_VOICES] = {};
    RC_EG m_cymbalEG[NUM_CYMBAL_VOICES];
    RC_HPF m_cymbalHPF[NUM_CYMBAL_VOICES];

    // Hi-hat additional processing
    RC_EG m_hatEG;
    RC_HPF m_hatHPF;
    bool m_hatIsClosed = false;

    // Per-channel processing
    Biquad m_voiceBPF[NUM_MIX_CHANNELS];
    RC_LPF m_voiceLPF[NUM_MIX_CHANNELS];
    float m_channelLevel[NUM_MIX_CHANNELS] = {};

    // Global state
    float m_sampleRate = 44100.0f;
    float m_nativeRate = 25000.0f;
    double m_dt = 1.0 / 44100.0;
    double m_rateRatio = 0.0;
    double m_phaseAccum = 0.0;
    float m_masterVolume = 0.8f;
    double m_accentLevel = 3.5;
    double m_decayScale = 1.0;
    double m_pitchBendFactor = 1.0;
};

// ============================================================================
// Emscripten bindings
// ============================================================================
EMSCRIPTEN_BINDINGS(TR707) {
    emscripten::class_<TR707Synth>("TR707Synth")
        .constructor<>()
        .function("initialize", &TR707Synth::initialize)
        .function("loadROM", &TR707Synth::loadROM)
        .function("noteOn", &TR707Synth::noteOn)
        .function("noteOff", &TR707Synth::noteOff)
        .function("allNotesOff", &TR707Synth::allNotesOff)
        .function("setParameter", &TR707Synth::setParameter)
        .function("setVolume", &TR707Synth::setVolume)
        .function("programChange", &TR707Synth::programChange)
        .function("controlChange", &TR707Synth::controlChange)
        .function("pitchBend", &TR707Synth::pitchBend)
        .function("setMode", &TR707Synth::setMode)
        .function("process", &TR707Synth::process);
}
