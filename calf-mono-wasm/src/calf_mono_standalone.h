/* Calf Monosynth - Standalone DSP extraction for WASM
 * Based on Calf Studio Gear by Krzysztof Foltman
 * Original: Copyright (C) 2001-2007 Krzysztof Foltman (LGPL v2+)
 *
 * This standalone extraction removes GTK/LV2/JACK dependencies
 * and provides a pure DSP interface suitable for WASM compilation.
 */
#ifndef CALF_MONO_STANDALONE_H
#define CALF_MONO_STANDALONE_H

#include "primitives.h"
#include "fixed_point.h"
#include "fft.h"
#include "osc.h"
#include "biquad.h"
#include "envelope.h"
#include "inertia.h"
#include "synth.h"

#include <cstring>
#include <cmath>
#include <algorithm>
#include <cstdlib>

// Standalone modulation matrix (extracted from modmatrix.h without giface dependency)
namespace dsp {

struct modulation_entry
{
    int src1;
    int mapping; // 0=positive, 1=bipolar, 2=negative, 3=squared, ...
    int src2;
    float amount;
    int dest;

    modulation_entry() { reset(); }

    void reset() {
        src1 = 0;
        src2 = 0;
        mapping = 0; // map_positive
        amount = 0.f;
        dest = 0;
    }
};

} // namespace dsp

namespace calf_plugins {

// Standalone monosynth metadata (extracted from metadata.h)
struct monosynth_metadata
{
    enum { wave_saw, wave_sqr, wave_pulse, wave_sine, wave_triangle, wave_varistep,
           wave_skewsaw, wave_skewsqr, wave_test1, wave_test2, wave_test3, wave_test4,
           wave_test5, wave_test6, wave_test7, wave_test8, wave_count };

    enum { flt_lp12, flt_lp24, flt_2lp12, flt_hp12, flt_lpbr, flt_hpbr, flt_bp6, flt_2bp6 };

    enum { par_wave1, par_wave2, par_pw1, par_pw2, par_detune, par_osc2xpose, par_oscmode,
           par_oscmix, par_filtertype, par_cutoff, par_resonance, par_cutoffsep,
           par_env1tocutoff, par_env1tores, par_env1toamp,
           par_env1attack, par_env1decay, par_env1sustain, par_env1fade, par_env1release,
           par_keyfollow, par_legato, par_portamento, par_vel2filter, par_vel2amp,
           par_master, par_pwhlrange,
           par_lforate, par_lfodelay, par_lfofilter, par_lfopitch, par_lfopw,
           par_mwhl_lfo, par_scaledetune,
           par_env2tocutoff, par_env2tores, par_env2toamp,
           par_env2attack, par_env2decay, par_env2sustain, par_env2fade, par_env2release,
           par_stretch1, par_window1,
           par_lfo1trig, par_lfo2trig,
           par_lfo2rate, par_lfo2delay,
           par_o2unison, par_o2unisonfrq,
           par_osc1xpose,
           par_midi,
           param_count };

    enum { in_count = 0, out_count = 2 };
    enum { step_size = 64, step_shift = 6 };
    enum { mod_matrix_slots = 10 };

    enum {
        modsrc_none, modsrc_velocity, modsrc_pressure, modsrc_modwheel,
        modsrc_env1, modsrc_env2, modsrc_lfo1, modsrc_lfo2, modsrc_count
    };

    enum {
        moddest_none, moddest_attenuation, moddest_oscmix, moddest_cutoff,
        moddest_resonance, moddest_o1detune, moddest_o2detune, moddest_o1pw,
        moddest_o2pw, moddest_o1stretch, moddest_o2unisonamp, moddest_o2unisondetune,
        moddest_count
    };
};

// Scaling coefficients for modulation matrix mapping modes
// 0=positive: 0 + 1*x + 0*x^2
// 1=bipolar:  -1 + 2*x + 0*x^2
// etc. (from original modmatrix.cpp)
static const float scaling_coeffs[][3] = {
    { 0, 1, 0 },        // map_positive
    { -1, 2, 0 },       // map_bipolar
    { -1, 1, 0 },       // map_negative
    { 0, 0, 1 },        // map_squared
    { -1, 0, 2 },       // map_squared_bipolar
    { 0, 2, -1 },       // map_antisquared
    { -1, 4, -2 },      // map_antisquared_bipolar
    { 0, 4, -4 },       // map_parabola
};

#define MONOSYNTH_WAVE_BITS 12

// Default parameter values (from metadata.cpp CALF_PORT_PROPS)
struct param_props {
    float def, min, max;
};

static const param_props monosynth_param_defaults[monosynth_metadata::param_count] = {
    // par_wave1
    { (float)monosynth_metadata::wave_saw, 0, (float)(monosynth_metadata::wave_count - 1) },
    // par_wave2
    { (float)monosynth_metadata::wave_sqr, 0, (float)(monosynth_metadata::wave_count - 1) },
    // par_pw1
    { 0, -1, 1 },
    // par_pw2
    { 0, -1, 1 },
    // par_detune
    { 10, 0, 100 },
    // par_osc2xpose
    { 12, -24, 24 },
    // par_oscmode
    { 0, 0, 5 },
    // par_oscmix
    { 0.5f, 0, 1 },
    // par_filtertype
    { 1, 0, 7 },
    // par_cutoff
    { 33, 10, 16000 },
    // par_resonance
    { 3, 0.7f, 8 },
    // par_cutoffsep
    { 0, -2400, 2400 },
    // par_env1tocutoff
    { 8000, -10800, 10800 },
    // par_env1tores
    { 1, 0, 1 },
    // par_env1toamp
    { 0, 0, 1 },
    // par_env1attack
    { 1, 1, 20000 },
    // par_env1decay
    { 350, 10, 20000 },
    // par_env1sustain
    { 0.5f, 0, 1 },
    // par_env1fade
    { 0, -10000, 10000 },
    // par_env1release
    { 100, 10, 20000 },
    // par_keyfollow
    { 0, 0, 2 },
    // par_legato
    { 0, 0, 3 },
    // par_portamento
    { 1, 1, 2000 },
    // par_vel2filter
    { 0.5f, 0, 1 },
    // par_vel2amp
    { 0, 0, 1 },
    // par_master
    { 0.5f, 0, 1 },
    // par_pwhlrange
    { 200, 0, 2400 },
    // par_lforate
    { 5, 0.01f, 20 },
    // par_lfodelay
    { 0.5f, 0, 5 },
    // par_lfofilter
    { 0, -4800, 4800 },
    // par_lfopitch
    { 100, 0, 1200 },
    // par_lfopw
    { 0, 0, 1 },
    // par_mwhl_lfo
    { 1, 0, 1 },
    // par_scaledetune
    { 1, 0, 1 },
    // par_env2tocutoff
    { 0, -10800, 10800 },
    // par_env2tores
    { 0.3f, 0, 1 },
    // par_env2toamp
    { 1, 0, 1 },
    // par_env2attack
    { 1, 1, 20000 },
    // par_env2decay
    { 100, 10, 20000 },
    // par_env2sustain
    { 0.5f, 0, 1 },
    // par_env2fade
    { 0, -10000, 10000 },
    // par_env2release
    { 50, 10, 20000 },
    // par_stretch1
    { 1, 1, 16 },
    // par_window1
    { 0, 0, 1 },
    // par_lfo1trig
    { 0, 0, 1 },
    // par_lfo2trig
    { 0, 0, 1 },
    // par_lfo2rate
    { 5, 0.01f, 20 },
    // par_lfo2delay
    { 0.5f, 0.1f, 5 },
    // par_o2unison
    { 0, 0, 1 },
    // par_o2unisonfrq
    { 2, 0.01f, 20 },
    // par_osc1xpose
    { 0, -24, 24 },
    // par_midi
    { 0, 0, 16 },
};

/// Standalone Monosynth class (no plugin framework dependencies)
class monosynth_audio_module : public monosynth_metadata
{
public:
    uint32_t srate, crate;
    static dsp::waveform_family<MONOSYNTH_WAVE_BITS> *waves;
    dsp::waveform_oscillator<MONOSYNTH_WAVE_BITS> osc1, osc2, detosc;
    dsp::triangle_lfo lfo1, lfo2;
    dsp::simple_oscillator unison_osc;
    dsp::biquad_d1_lerp filter, filter2;

    bool running, stopping, gate, force_fadeout;
    int last_key;

    float buffer[step_size], buffer2[step_size];
    uint32_t output_pos;
    int wave1, wave2, prev_wave1, prev_wave2;
    int filter_type, last_filter_type;
    float freq, start_freq, target_freq, cutoff, fgain, fgain_delta, separation;
    float detune, xpose1, xpose2, xfade, ampctl, fltctl;
    float odcr, porta_time, lfo_bend;
    float modwheel_value;
    float lfo_clock;
    int32_t last_pwshift1, last_pwshift2;
    int32_t last_stretch1;
    int queue_note_on;
    bool queue_note_on_and_off;
    float queue_vel;
    int modwheel_value_int;
    int legato;
    dsp::adsr envelope1, envelope2;
    dsp::keystack stack;
    dsp::gain_smoothing master;
    dsp::fadeout fadeout_obj;
    dsp::fadeout fadeout2_obj;
    dsp::inertia<dsp::exponential_ramp> inertia_cutoff;
    dsp::inertia<dsp::exponential_ramp> inertia_pitchbend;
    dsp::inertia<dsp::linear_ramp> inertia_pressure;
    dsp::modulation_entry mod_matrix_data[mod_matrix_slots];
    float velocity;
    float last_xfade, last_unison;
    float moddest[moddest_count];

    // Parameter storage (standalone - no host pointers)
    float param_values[param_count];
    float *params[param_count];

    // Output buffers
    float *outs[2];
    float out_buf_l[4096];
    float out_buf_r[4096];

    static float silence[4097];

    monosynth_audio_module();
    void set_sample_rate(uint32_t sr);
    void activate();
    void deactivate();
    void delayed_note_on();
    void end_note();
    void note_on(int channel, int note, int vel);
    void note_off(int channel, int note, int vel);
    void channel_pressure(int channel, int value);
    void pitch_bend(int channel, int value);
    void set_frequency();
    void control_change(int channel, int controller, int value);
    void params_changed();
    void lookup_waveforms();
    void calculate_buffer_oscs(float lfo);
    void calculate_buffer_ser();
    void calculate_buffer_single();
    void calculate_buffer_stereo();
    uint32_t process(uint32_t offset, uint32_t nsamples, uint32_t inputs_mask, uint32_t outputs_mask);
    void all_notes_off();

    /// Inline modulation matrix calculation (replaces mod_matrix_impl)
    inline void calculate_modmatrix(float *dest, int dest_count, float *src)
    {
        for (int i = 0; i < dest_count; i++)
            dest[i] = 0;
        for (unsigned int i = 0; i < mod_matrix_slots; ++i)
        {
            dsp::modulation_entry &slot = mod_matrix_data[i];
            if (slot.dest) {
                float value = src[slot.src1];
                int m = slot.mapping;
                if (m >= 0 && m < 8) {
                    const float *c = scaling_coeffs[m];
                    value = c[0] + c[1] * value + c[2] * value * value;
                }
                dest[slot.dest] += value * src[slot.src2] * slot.amount;
            }
        }
    }

    inline bool is_stereo_filter() const
    {
        return filter_type == flt_2lp12 || filter_type == flt_2bp6;
    }

private:
    void reset();
    float get_lfo(dsp::triangle_lfo &lfo, int param);
    void apply_fadeout();
    void calculate_step();
    static void precalculate_waves();
};

} // namespace calf_plugins

#endif // CALF_MONO_STANDALONE_H
