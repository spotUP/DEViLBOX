/*
 * jc_native_cli.c — Native CLI for rendering JamCracker Pro modules to WAV
 *
 * Usage: jc_render <input.jam> <output.wav> [duration_seconds]
 *
 * Drives the transpiled JamCrackerProReplay at 50Hz via paula_soft,
 * renders to 16-bit stereo WAV at 28150 Hz (native Paula rate).
 */

/* Stub out Emscripten macros for native builds */
#ifdef __EMSCRIPTEN__
#undef __EMSCRIPTEN__
#endif
#define EMSCRIPTEN_KEEPALIVE

#include "jc_harness.c"
#include <stdio.h>

/* WAV file header writer */
static void write_wav_header(FILE *f, int num_samples, int sample_rate) {
    int channels = 2;
    int bits_per_sample = 16;
    int byte_rate = sample_rate * channels * bits_per_sample / 8;
    int block_align = channels * bits_per_sample / 8;
    int data_size = num_samples * channels * bits_per_sample / 8;
    int chunk_size = 36 + data_size;

    fwrite("RIFF", 1, 4, f);
    fwrite(&chunk_size, 4, 1, f);
    fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f);
    int fmt_size = 16;
    fwrite(&fmt_size, 4, 1, f);
    short audio_format = 1; /* PCM */
    fwrite(&audio_format, 2, 1, f);
    short num_channels = (short)channels;
    fwrite(&num_channels, 2, 1, f);
    fwrite(&sample_rate, 4, 1, f);
    fwrite(&byte_rate, 4, 1, f);
    short ba = (short)block_align;
    fwrite(&ba, 2, 1, f);
    short bps = (short)bits_per_sample;
    fwrite(&bps, 2, 1, f);
    fwrite("data", 1, 4, f);
    fwrite(&data_size, 4, 1, f);
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <input.jam> <output.wav> [duration_seconds]\n", argv[0]);
        return 1;
    }

    const char *input_path = argv[1];
    const char *output_path = argv[2];
    float duration = 15.0f;
    if (argc > 3) duration = (float)atof(argv[3]);

    /* Load module file */
    FILE *fin = fopen(input_path, "rb");
    if (!fin) {
        fprintf(stderr, "Error: cannot open '%s'\n", input_path);
        return 1;
    }
    fseek(fin, 0, SEEK_END);
    long fsize = ftell(fin);
    fseek(fin, 0, SEEK_SET);
    uint8_t *module_data = (uint8_t *)malloc(fsize);
    if (!module_data) { fclose(fin); return 1; }
    fread(module_data, 1, fsize, fin);
    fclose(fin);

    fprintf(stderr, "Loaded '%s' (%ld bytes)\n", input_path, fsize);

    /* Initialize player */
    int ret = jc_init(module_data, (uint32_t)fsize);
    if (ret != 0) {
        fprintf(stderr, "Error: jc_init failed (%d)\n", ret);
        free(module_data);
        return 1;
    }

    int sample_rate = PAULA_RATE_PAL;
    int total_frames = (int)(duration * sample_rate);
    int chunk_size = 1024;
    float *buf = (float *)malloc(chunk_size * 2 * sizeof(float));
    if (!buf) { free(module_data); return 1; }

    /* Open output WAV */
    FILE *fout = fopen(output_path, "wb");
    if (!fout) {
        fprintf(stderr, "Error: cannot create '%s'\n", output_path);
        free(buf); free(module_data);
        return 1;
    }

    write_wav_header(fout, total_frames, sample_rate);

    fprintf(stderr, "Rendering %.1f seconds at %d Hz...\n", duration, sample_rate);

    int frames_written = 0;
    while (frames_written < total_frames) {
        int n = total_frames - frames_written;
        if (n > chunk_size) n = chunk_size;
        jc_render(buf, n);

        /* Convert float to 16-bit PCM */
        for (int i = 0; i < n * 2; i++) {
            float s = buf[i];
            if (s > 1.0f) s = 1.0f;
            if (s < -1.0f) s = -1.0f;
            int16_t sample = (int16_t)(s * 32767.0f);
            fwrite(&sample, 2, 1, fout);
        }
        frames_written += n;
    }

    fclose(fout);
    jc_stop();
    free(buf);
    free(module_data);

    fprintf(stderr, "Wrote '%s' (%d frames, %.1fs)\n", output_path, total_frames, duration);
    fprintf(stderr, "Song: pos=%d, patterns=%d, instruments=%d\n",
            jc_get_song_length(), jc_get_num_patterns(), jc_get_num_instruments());
    return 0;
}
