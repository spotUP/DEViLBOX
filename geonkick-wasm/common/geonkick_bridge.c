/*
 * geonkick_bridge.c — minimal C wrapper exposing the geonkick DSP engine
 * to the DEViLBOX AudioWorklet. Pattern B (C-style, EMSCRIPTEN_KEEPALIVE)
 * matching the upstream C API in src/dsp/src/geonkick.h.
 *
 * MVP surface: create, destroy, key_pressed, render_mono, length,
 * limiter. No parameter surface yet — the synth runs with defaults.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define GK_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define GK_EXPORT
#endif

#include "geonkick.h"

/* Opaque handle exposed to JS as a plain int pointer. */
typedef struct geonkick gk_instance;

/* Forward-declare the internal rebake entrypoint so we can force an
 * initial bake before the first render. In upstream geonkick this runs
 * asynchronously on the pthread worker; with worker_stub.c it runs
 * synchronously on whichever thread invokes it. */
void geonkick_process(struct geonkick *kick);

GK_EXPORT
gk_instance *gk_wasm_create(int sample_rate)
{
        struct geonkick *kick = NULL;
        if (geonkick_create(&kick, sample_rate) != GEONKICK_OK)
                return NULL;

        /* Bring instrument 0 online. Out of calloc the synth is inactive
         * and its baked buffer size is zero — triggering audio_process
         * in that state hits a div-by-zero in the ring buffer modulo. */
        geonkick_enable_instrument(kick, 0, true);
        geonkick_set_instrument_channel(kick, 0, 0);
        geonkick_enable_synthesis(kick, true);

        /* Instrument outputs default to limiter=0 out of calloc (only the
         * audition channel gets initialised to 1.0 in gkick_audio.c:67).
         * Without this, the mixer multiplies every sample by zero and the
         * bake is silently muted. Setting it to 1.0 on per_index=0 drives
         * gkick_audio_set_limiter_val for instrument 0's output. */
        geonkick_set_limiter_value(kick, 1.0f);

        /* Oscillator groups default to disabled (calloc'd bool array).
         * gkick_synth_get_value only sums oscillators whose group flag is
         * set → otherwise the bake writes pure zeros. Enable the first
         * osc group so the default sine oscillator in that group
         * produces the baseline kick. */
        geonkick_enable_group(kick, 0, true);

        /* set_length() does three things the MVP needs:
         *  1. sets synth->length
         *  2. sizes the baked-kick ring buffer (length * sample_rate)
         *  3. marks synth->buffer_update = true
         * Then geonkick_wakeup fires, which (via worker_stub) synchronously
         * calls geonkick_process → gkick_synth_process → bakes the kick. */
        geonkick_set_length(kick, 0.3f);

        return kick;
}

GK_EXPORT
void gk_wasm_destroy(gk_instance *kick)
{
        if (!kick)
                return;
        geonkick_free(&kick);
}

GK_EXPORT
void gk_wasm_key_pressed(gk_instance *kick, int pressed, int note, int velocity)
{
        if (!kick)
                return;
        geonkick_key_pressed(kick, pressed ? true : false, note, velocity);
}

/*
 * Render `num_samples` mono frames into `out`. Reads from channel 0, where
 * instrument 0's baked buffer is routed by gk_wasm_create above.
 */
/* Max chunk size for a single geonkick_audio_process call. The right-side
 * scratch buffer, audition outputs, and their zero-memset all stay within
 * GK_RENDER_CHUNK samples per call — the outer loop handles longer renders. */
#define GK_RENDER_CHUNK 2048

GK_EXPORT
void gk_wasm_render_mono(gk_instance *kick, float *out, int num_samples)
{
        if (!kick || !out || num_samples <= 0)
                return;

        /* geonkick_audio_process writes stereo pairs into out[2*channel +
         * 0/1]. Instrument 0 is routed to channel 0, so out[0]=L, out[1]=R.
         * With GEONKICK_SINGLE there are also the audition outputs which
         * write to channel 1 (out[2], out[3]). We discard everything except
         * channel 0 left. Scratch serves right + both audition slots. */
        static float scratch[GK_RENDER_CHUNK];

        memset(out, 0, (size_t)num_samples * sizeof(float));

        int written = 0;
        while (written < num_samples) {
                int chunk = num_samples - written;
                if (chunk > GK_RENDER_CHUNK) chunk = GK_RENDER_CHUNK;

                memset(scratch, 0, (size_t)chunk * sizeof(float));

                float *channels[4] = {
                        out + written,   /* inst 0 channel 0 left  */
                        scratch,         /* inst 0 channel 0 right */
                        scratch,         /* audition channel 1 L   */
                        scratch,         /* audition channel 1 R   */
                };
                geonkick_audio_process(kick, channels, 0, (size_t)chunk);
                written += chunk;
        }
}

/* Get kick length in seconds (how long a triggered one-shot plays). */
GK_EXPORT
double gk_wasm_get_length(gk_instance *kick)
{
        if (!kick)
                return 0.0;
        gkick_real len = 0.0f;
        geonkick_get_length(kick, &len);
        return (double)len;
}

/* Set kick length in seconds. Triggers a rebake via the worker stub. */
GK_EXPORT
void gk_wasm_set_length(gk_instance *kick, double seconds)
{
        if (!kick)
                return;
        geonkick_set_length(kick, (gkick_real)seconds);
}

/* Master limiter (0..1.5 in upstream units). */
GK_EXPORT
void gk_wasm_set_limiter(gk_instance *kick, double value)
{
        if (!kick)
                return;
        geonkick_set_limiter_value(kick, (gkick_real)value);
}

/* ────────────────────────────────────────────────────────────────────
 * Kick filter — after the oscillator mix, before the amp envelope.
 * gkick_filter_type: 0=LP, 1=HP, 2=BP.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_filter_enabled(gk_instance *kick, int enable)
{
        if (!kick) return;
        geonkick_kick_filter_enable(kick, enable);
}

GK_EXPORT
void gk_wasm_set_filter_cutoff(gk_instance *kick, double frequency_hz)
{
        if (!kick) return;
        geonkick_kick_set_filter_frequency(kick, (gkick_real)frequency_hz);
}

GK_EXPORT
void gk_wasm_set_filter_factor(gk_instance *kick, double q)
{
        if (!kick) return;
        geonkick_kick_set_filter_factor(kick, (gkick_real)q);
}

GK_EXPORT
void gk_wasm_set_filter_type(gk_instance *kick, int type)
{
        if (!kick) return;
        geonkick_set_kick_filter_type(kick, (enum gkick_filter_type)type);
}

/* ────────────────────────────────────────────────────────────────────
 * Distortion — waveshaper + drive + out limiter.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_distortion_enabled(gk_instance *kick, int enable)
{
        if (!kick) return;
        geonkick_distortion_enable(kick, enable);
}

GK_EXPORT
void gk_wasm_set_distortion_drive(gk_instance *kick, double drive)
{
        if (!kick) return;
        geonkick_distortion_set_drive(kick, (gkick_real)drive);
}

GK_EXPORT
void gk_wasm_set_distortion_volume(gk_instance *kick, double volume)
{
        if (!kick) return;
        /* Upstream exposes in/out limiters around the waveshaper.
         * "Volume" in the UI sense = out_limiter. */
        geonkick_distortion_set_out_limiter(kick, (gkick_real)volume);
}

/* ────────────────────────────────────────────────────────────────────
 * Oscillators — 9 total (3 groups × 3 oscillators per group).
 * osc_index 0..2 = group 0 (main), 3..5 = group 1, 6..8 = group 2.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_enable_osc(gk_instance *kick, int osc_index, int enable)
{
        if (!kick || osc_index < 0) return;
        if (enable)
                geonkick_enable_oscillator(kick, (size_t)osc_index);
        else
                geonkick_disable_oscillator(kick, (size_t)osc_index);
}

GK_EXPORT
void gk_wasm_set_osc_amplitude(gk_instance *kick, int osc_index, double amplitude)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_amplitude(kick, (size_t)osc_index, (gkick_real)amplitude);
}

GK_EXPORT
void gk_wasm_set_osc_frequency(gk_instance *kick, int osc_index, double frequency_hz)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_frequency(kick, (size_t)osc_index, (gkick_real)frequency_hz);
}

GK_EXPORT
void gk_wasm_set_osc_function(gk_instance *kick, int osc_index, int func)
{
        if (!kick || osc_index < 0) return;
        /* 0=sine, 1=square, 2=triangle, 3=sawtooth,
         * 4=noise_white, 5=noise_pink, 6=noise_brownian, 7=sample */
        geonkick_set_osc_function(kick, (size_t)osc_index,
                                  (enum geonkick_osc_func_type)func);
}

/* ────────────────────────────────────────────────────────────────────
 * Envelopes.
 *
 * Wire format: `flat_ptr` points at npoints × 3 floats — interleaved
 * [x0, y0, ctrl0, x1, y1, ctrl1, ...]. x/y ∈ [0,1]; ctrl is a curve
 * flag stored as 1.0f (control point) or 0.0f (vertex). The C side
 * unpacks into a stack-allocated gkick_envelope_point_info[] so we
 * never expose the struct layout to JS.
 *
 * Max points per envelope is capped at GK_MAX_ENV_POINTS — anything
 * beyond that is silently clipped. Geonkick's UI tops out well below.
 * ─────────────────────────────────────────────────────────────────── */
#define GK_MAX_ENV_POINTS 256

static size_t
gk_unpack_points(const float *flat, size_t npoints,
                 struct gkick_envelope_point_info *out)
{
        if (npoints > GK_MAX_ENV_POINTS) npoints = GK_MAX_ENV_POINTS;
        for (size_t i = 0; i < npoints; i++) {
                out[i].x             = flat[i * 3 + 0];
                out[i].y             = flat[i * 3 + 1];
                out[i].control_point = flat[i * 3 + 2] > 0.5f;
        }
        return npoints;
}

/**
 * Set a kick-level envelope. env_type values mirror geonkick_envelope_type:
 *   0=amplitude, 1=frequency, 2=filter_cutoff, 3=distortion_drive,
 *   4=distortion_volume, 5=pitch_shift, 6=filter_q, 7=noise_density.
 */
GK_EXPORT
void gk_wasm_set_kick_envelope(gk_instance *kick, int env_type,
                               const float *flat_ptr, int npoints)
{
        if (!kick || !flat_ptr || npoints <= 0) return;
        struct gkick_envelope_point_info buf[GK_MAX_ENV_POINTS];
        size_t n = gk_unpack_points(flat_ptr, (size_t)npoints, buf);
        geonkick_kick_envelope_set_points(kick,
                                          (enum geonkick_envelope_type)env_type,
                                          buf, n);
}

/**
 * Set a per-oscillator envelope. env_index is 0..3 (amp, freq, filter cutoff,
 * pitch shift — matches GKICK_OSC_*_ENVELOPE constants in synthesizer.h).
 */
GK_EXPORT
void gk_wasm_set_osc_envelope(gk_instance *kick, int osc_index, int env_index,
                              const float *flat_ptr, int npoints)
{
        if (!kick || !flat_ptr || osc_index < 0 || env_index < 0 || npoints <= 0)
                return;
        struct gkick_envelope_point_info buf[GK_MAX_ENV_POINTS];
        size_t n = gk_unpack_points(flat_ptr, (size_t)npoints, buf);
        geonkick_osc_envelope_set_points(kick,
                                         (size_t)osc_index,
                                         (size_t)env_index,
                                         buf, n);
}

/**
 * Enable/disable an oscillator group. There are 3 groups (0..2), each
 * containing 3 oscillators. gk_wasm_create only enables group 0 to keep
 * the default kick quiet — preset loaders enable groups 1 and 2 when
 * the preset's higher-numbered oscillators are in use.
 */
GK_EXPORT
void gk_wasm_enable_group(gk_instance *kick, int group_index, int enable)
{
        if (!kick || group_index < 0 || group_index > 2) return;
        geonkick_enable_group(kick, (size_t)group_index, enable ? true : false);
}

/* ── Missing setters needed for accurate preset loading ────────────────── */

GK_EXPORT
void gk_wasm_set_group_amplitude(gk_instance *kick, int group_index, double amplitude)
{
        if (!kick || group_index < 0 || group_index > 2) return;
        geonkick_group_set_amplitude(kick, (size_t)group_index, (gkick_real)amplitude);
}

GK_EXPORT
void gk_wasm_set_kick_amplitude(gk_instance *kick, double amplitude)
{
        if (!kick) return;
        geonkick_kick_set_amplitude(kick, (gkick_real)amplitude);
}

/* Per-oscillator filter (not to be confused with the kick-level filter). */
GK_EXPORT
void gk_wasm_set_osc_filter_enabled(gk_instance *kick, int osc_index, int enable)
{
        if (!kick || osc_index < 0) return;
        geonkick_enbale_osc_filter(kick, (size_t)osc_index, enable);
}

GK_EXPORT
void gk_wasm_set_osc_filter_cutoff(gk_instance *kick, int osc_index, double freq)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_filter_cutoff_freq(kick, (size_t)osc_index, (gkick_real)freq);
}

GK_EXPORT
void gk_wasm_set_osc_filter_factor(gk_instance *kick, int osc_index, double q)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_filter_factor(kick, (size_t)osc_index, (gkick_real)q);
}

GK_EXPORT
void gk_wasm_set_osc_filter_type(gk_instance *kick, int osc_index, int type)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_filter_type(kick, (size_t)osc_index, (enum gkick_filter_type)type);
}

GK_EXPORT
void gk_wasm_set_osc_fm(gk_instance *kick, int osc_index, int is_fm)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_set_fm(kick, (size_t)osc_index, is_fm ? true : false);
}

GK_EXPORT
void gk_wasm_set_osc_phase(gk_instance *kick, int osc_index, double phase)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_phase(kick, (size_t)osc_index, (gkick_real)phase);
}

GK_EXPORT
void gk_wasm_set_osc_seed(gk_instance *kick, int osc_index, int seed)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_seed(kick, (size_t)osc_index, (unsigned int)seed);
}

/* ────────────────────────────────────────────────────────────────────
 * Distortion input limiter (kick-level).
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_distortion_in_limiter(gk_instance *kick, double value)
{
        if (!kick) return;
        geonkick_distortion_set_in_limiter(kick, (gkick_real)value);
}

/* ────────────────────────────────────────────────────────────────────
 * Per-oscillator pitch shift and noise density.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_osc_pitch_shift(gk_instance *kick, int osc_index, double semitones)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_pitch_shift(kick, (size_t)osc_index, (gkick_real)semitones);
}

GK_EXPORT
void gk_wasm_set_osc_noise_density(gk_instance *kick, int osc_index, double density)
{
        if (!kick || osc_index < 0) return;
        geonkick_set_osc_noise_density(kick, (size_t)osc_index, (gkick_real)density);
}

/* ────────────────────────────────────────────────────────────────────
 * FM modulation depth (k factor).
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_osc_fm_k(gk_instance *kick, int osc_index, double k)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_set_fm_k(kick, (size_t)osc_index, (gkick_real)k);
}

/* ────────────────────────────────────────────────────────────────────
 * Per-oscillator distortion (5 setters).
 * gkick_distortion_type: 0=hard_clip..9=backward_compat.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_osc_distortion_enabled(gk_instance *kick, int osc_index, int enable)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_distortion_enable(kick, (size_t)osc_index, enable ? true : false);
}

GK_EXPORT
void gk_wasm_set_osc_distortion_type(gk_instance *kick, int osc_index, int type)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_distortion_set_type(kick, (size_t)osc_index,
                                         (enum gkick_distortion_type)type);
}

GK_EXPORT
void gk_wasm_set_osc_distortion_in_limiter(gk_instance *kick, int osc_index, double value)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_distortion_set_in_limiter(kick, (size_t)osc_index, (gkick_real)value);
}

GK_EXPORT
void gk_wasm_set_osc_distortion_out_limiter(gk_instance *kick, int osc_index, double value)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_distortion_set_out_limiter(kick, (size_t)osc_index, (gkick_real)value);
}

GK_EXPORT
void gk_wasm_set_osc_distortion_drive(gk_instance *kick, int osc_index, double drive)
{
        if (!kick || osc_index < 0) return;
        geonkick_osc_distortion_set_drive(kick, (size_t)osc_index, (gkick_real)drive);
}

/* ────────────────────────────────────────────────────────────────────
 * Envelope apply type (linear vs logarithmic).
 * gkick_envelope_apply_type: 0=linear, 1=logarithmic.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_kick_env_apply_type(gk_instance *kick, int env_type, int apply_type)
{
        if (!kick) return;
        geonkick_kick_env_set_apply_type(kick,
                                         (enum geonkick_envelope_type)env_type,
                                         (enum gkick_envelope_apply_type)apply_type);
}

GK_EXPORT
void gk_wasm_set_osc_env_apply_type(gk_instance *kick, int osc_index, int env_index, int apply_type)
{
        if (!kick || osc_index < 0 || env_index < 0) return;
        geonkick_osc_envelope_set_apply_type(kick,
                                             (size_t)osc_index,
                                             (size_t)env_index,
                                             (enum gkick_envelope_apply_type)apply_type);
}

/* ────────────────────────────────────────────────────────────────────
 * Humanizer — velocity/timing variation.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_humanizer_enable(gk_instance *kick, int enable)
{
        if (!kick) return;
        geonkick_humanizer_enable(kick, enable ? true : false);
}

GK_EXPORT
void gk_wasm_humanizer_set_velocity(gk_instance *kick, double value)
{
        if (!kick) return;
        geonkick_humanizer_set_velocity(kick, (float)value);
}

GK_EXPORT
void gk_wasm_humanizer_set_timing(gk_instance *kick, double value)
{
        if (!kick) return;
        geonkick_humanizer_set_timing(kick, (float)value);
}

/* ────────────────────────────────────────────────────────────────────
 * Tuned output — pitch-tracks MIDI note.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_tune_audio_output(gk_instance *kick, int tune)
{
        if (!kick) return;
        geonkick_tune_audio_output(kick, 0, tune ? true : false);
}

/* ────────────────────────────────────────────────────────────────────
 * Sample loading for oscillator function type 7 (Sample).
 * data is a float array of sample_count mono samples.
 * ─────────────────────────────────────────────────────────────────── */
GK_EXPORT
void gk_wasm_set_osc_sample(gk_instance *kick, int osc_index,
                            const float *data, int sample_count)
{
        if (!kick || osc_index < 0 || !data || sample_count <= 0) return;
        geonkick_set_osc_sample(kick, (size_t)osc_index,
                                (const gkick_real *)data, (size_t)sample_count);
}
