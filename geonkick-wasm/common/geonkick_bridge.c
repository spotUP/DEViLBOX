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
