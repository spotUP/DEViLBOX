// Renders one synth note via sonix_song_render_synth_note and prints the RMS
// energy, so the vitest can assert (a) non-silence, (b) baseVol changes energy,
// (c) wave changes output. Params are set directly on a scratch song — no file.
//
// Build: cc -O1 -w -I <repo>/sonix-wasm/src probe-render-note.c -o probe -lm
// Run:   probe <mode>
//   mode 0 = baseVol 160, sawtooth wave
//   mode 1 = baseVol   0, sawtooth wave  (should be ~silent)
//   mode 2 = baseVol 160, square   wave  (different timbre → different samples)
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sonix/sonix.h"
#include "sonix/sonix.c"
#include "sonix/sonix_io.c"

int main(int argc, char** argv) {
    int mode = argc >= 2 ? atoi(argv[1]) : 0;

    SonixSong* s = sonix_song_create_scratch();
    if (!s) {
        printf("ERR create_scratch\n");
        return 1;
    }
    sonix_song_set_sample_rate(s, 48000);

    const int inst = 0;
    sonix_song_set_instrument_synth(s, inst, true);

    // Base 128-byte waveform: sawtooth (mode 0/1) or square (mode 2).
    int8_t wave[128];
    for (int i = 0; i < 128; i++) {
        if (mode == 2) {
            wave[i] = (i < 64) ? 100 : -100; // square
        } else {
            wave[i] = (int8_t)(i - 64); // sawtooth ramp
        }
    }
    sonix_song_set_synth_wave(s, inst, wave); // builds the 64-band filter bank

    // Envelope table: a gentle triangle sweep so the filter/env actually moves.
    int8_t env[128];
    for (int i = 0; i < 128; i++) {
        int t = (i < 64) ? i : (127 - i);
        env[i] = (int8_t)(t - 32);
    }
    sonix_song_set_synth_env_table(s, inst, env);

    int base_vol = (mode == 1) ? 0 : 160;
    sonix_song_set_synth_vol_params(s, inst, (uint16_t)base_vol, 0 /* port_flag */);
    sonix_song_set_synth_blend_params(s, inst, 0 /* c2 */, 0 /* c4 */);
    sonix_song_set_synth_filter_params(s, inst, 32 /* base */, 0 /* range */, 40 /* env_sens */);
    // scan_rate, loop_mode, delay_init, vol_scale, pitch_scale
    sonix_song_set_synth_env_params(s, inst, 2000, 1, 0, 0, 0);
    sonix_song_set_synth_slide_rate(s, inst, 0);

    const int frames = 24000; // 0.5 s @ 48k
    float* out = (float*)calloc((size_t)frames, sizeof(float));
    int n = sonix_song_render_synth_note(s, inst, 60 /* note */, 200 /* vel */, frames, out);

    double sumsq = 0.0;
    double peak = 0.0;
    for (int i = 0; i < n; i++) {
        double v = out[i];
        sumsq += v * v;
        double a = v < 0 ? -v : v;
        if (a > peak)
            peak = a;
    }
    double rms = n > 0 ? sqrt(sumsq / (double)n) : 0.0;

    // Fingerprint: sum of first 200 rendered sample bytes (so wave change is visible).
    double fp = 0.0;
    for (int i = 0; i < n && i < 4000; i++)
        fp += out[i];

    printf("FRAMES %d RMS %.8f PEAK %.8f FP %.6f\n", n, rms, peak, fp);
    free(out);
    sonix_song_destroy(s);
    return 0;
}
