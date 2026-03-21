// test_wav.c — Render Steve Turner module to WAV for UADE comparison
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "src/steveturner/steveturner.h"
#include "src/steveturner/paula_soft.h"

static void write_wav_header(FILE *f, int num_samples) {
    int data_size = num_samples * 2 * 2; // stereo 16-bit
    int file_size = 36 + data_size;
    fwrite("RIFF", 1, 4, f);
    fwrite(&file_size, 4, 1, f);
    fwrite("WAVEfmt ", 1, 8, f);
    int fmt_size = 16; fwrite(&fmt_size, 4, 1, f);
    short fmt = 1; fwrite(&fmt, 2, 1, f); // PCM
    short ch = 2; fwrite(&ch, 2, 1, f);
    int sr = 44100; fwrite(&sr, 4, 1, f);
    int bps = sr * 4; fwrite(&bps, 4, 1, f);
    short align = 4; fwrite(&align, 2, 1, f);
    short bits = 16; fwrite(&bits, 2, 1, f);
    fwrite("data", 1, 4, f);
    fwrite(&data_size, 4, 1, f);
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <module.jpo> <output.wav> [seconds]\n", argv[0]);
        return 1;
    }
    float duration = argc > 3 ? atof(argv[3]) : 30.0f;

    FILE *f = fopen(argv[1], "rb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", argv[1]); return 1; }
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(len); fread(data, 1, len, f); fclose(f);

    st_init();
    st_load(data, (int)len);
    paula_set_output_rate(44100.0f);
    st_set_subsong(1);

    int total_samples = (int)(44100.0f * duration);
    // Steve Turner timer = $1BC0 (7104). CIA PAL clock = 709379 Hz.
    // Tick rate = 709379 / 7104 ≈ 99.86 Hz
    float samples_per_tick = 44100.0f / (709379.0f / 7104.0f); // ≈ 441.6

    FILE *out = fopen(argv[2], "wb");
    if (!out) { fprintf(stderr, "Cannot create %s\n", argv[2]); return 1; }
    write_wav_header(out, total_samples);

    float fbuf[128 * 2];
    int16_t ibuf[128 * 2];
    int written = 0;
    float tick_accum = 0.0f;

    while (written < total_samples) {
        int chunk = 128;
        if (written + chunk > total_samples) chunk = total_samples - written;

        paula_render(fbuf, chunk);

        // Advance ticks
        tick_accum += (float)chunk;
        while (tick_accum >= samples_per_tick) {
            tick_accum -= samples_per_tick;
            st_tick();
            if (st_is_finished()) {
                st_set_subsong(1); // Loop
            }
        }

        // Convert float to 16-bit
        for (int i = 0; i < chunk * 2; i++) {
            float s = fbuf[i] * 32767.0f;
            if (s > 32767.0f) s = 32767.0f;
            if (s < -32767.0f) s = -32767.0f;
            ibuf[i] = (int16_t)s;
        }
        fwrite(ibuf, 2, chunk * 2, out);
        written += chunk;
    }

    // Fix WAV header with actual size
    fseek(out, 0, SEEK_SET);
    write_wav_header(out, written);
    fclose(out);

    fprintf(stderr, "Rendered %d samples (%.1f sec) to %s\n", written, (float)written / 44100.0f, argv[2]);
    st_stop();
    free(data);
    return 0;
}
