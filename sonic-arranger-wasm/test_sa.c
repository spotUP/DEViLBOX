#include <stdio.h>
#include <stdlib.h>
#include "src/sonic_arranger.h"

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <file.sa>\n", argv[0]);
        return 1;
    }

    FILE* f = fopen(argv[1], "rb");
    if (!f) { perror("fopen"); return 1; }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t* data = (uint8_t*)malloc(size);
    fread(data, 1, size, f);
    fclose(f);

    fprintf(stderr, "File: %s (%ld bytes)\n", argv[1], size);

    SaModule* m = sa_create(data, size, 44100.0f);
    if (!m) {
        fprintf(stderr, "sa_create FAILED\n");
        free(data);
        return 1;
    }

    fprintf(stderr, "sa_create OK, subsongs=%d, channels=%d\n",
        sa_subsong_count(m), sa_channel_count(m));

    // Render 2 seconds
    float buf[256 * 2];
    float max_sample = 0.0f;
    int total_frames = 0;
    for (int i = 0; i < (44100 * 2) / 128; i++) {
        size_t rendered = sa_render(m, buf, 128);
        for (size_t j = 0; j < rendered * 2; j++) {
            float v = buf[j] < 0 ? -buf[j] : buf[j];
            if (v > max_sample) max_sample = v;
        }
        total_frames += rendered;
    }

    fprintf(stderr, "Rendered %d frames, peak=%.6f, ended=%d\n",
        total_frames, max_sample, sa_has_ended(m));

    sa_destroy(m);
    free(data);
    return 0;
}
