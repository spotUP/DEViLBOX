// SPDX-License-Identifier: MIT
// Native lock-step harness for the Sonix C port. Compiles sonix.c + sonix_io.c
// with real-filesystem IO callbacks (over the song's Instruments/ dir), renders
// the whole song offline, and prints one summary line:
//
//   PEAK <peak> RMS <rms> CH0VOL <max> CH1VOL <max> CH2VOL <max> CH3VOL <max>
//
// where PEAK/RMS are the mixed-stereo output magnitude in [0,1] and CHnVOL is
// each channel's peak effective Paula volume (0..64), captured via the dump path.
// Used by lockstep.test.ts to guard the Paula DAC scale (no clipping) and the
// per-channel volume envelope against the UADE reference. See
// thoughts/shared/research/2026-07-05_sonix-cport-accuracy-lockstep.md.
//
// Build (from sonix-wasm/src as include root):
//   cc -O1 -w -I <repo>/sonix-wasm/src render-native.c -o sonix_render
// Run:
//   sonix_render "<path>/ACE II.smus" [seconds]
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <dirent.h>
#include "sonix/sonix.h"
#include "sonix/sonix.c"
#include "sonix/sonix_io.c"

static bool rd(const char* p, uint8_t** o, uint32_t* os, void* u) {
    (void)u;
    FILE* f = fopen(p, "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t* b = (uint8_t*)malloc((size_t)n);
    if (fread(b, 1, (size_t)n, f) != (size_t)n) { fclose(f); free(b); return false; }
    fclose(f);
    *o = b;
    *os = (uint32_t)n;
    return true;
}

static int ls(const char* d, void (*v)(const char*, void*), void* c, void* u) {
    (void)u;
    DIR* dir = opendir(d);
    if (!dir) return -1;
    struct dirent* e;
    int n = 0;
    while ((e = readdir(dir))) {
        if (e->d_name[0] == '.') continue;
        if (v) v(e->d_name, c);
        n++;
    }
    closedir(dir);
    return n;
}

int main(int argc, char** argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <song> [seconds]\n", argv[0]); return 2; }
    int seconds = (argc >= 3) ? atoi(argv[2]) : 30;

    FILE* fi = fopen(argv[1], "rb");
    if (!fi) { fprintf(stderr, "cannot open %s\n", argv[1]); return 2; }
    fseek(fi, 0, SEEK_END);
    long n = ftell(fi);
    fseek(fi, 0, SEEK_SET);
    uint8_t* bf = (uint8_t*)malloc((size_t)n);
    if (fread(bf, 1, (size_t)n, fi) != (size_t)n) { fclose(fi); return 2; }
    fclose(fi);

    SonixIoCallbacks io;
    memset(&io, 0, sizeof(io));
    io.read_file = rd;
    io.list_dir = ls;

    SonixSong* s = sonix_song_create(bf, (uint32_t)n, &io);
    if (!s) { fprintf(stderr, "create failed\n"); return 2; }
    sonix_song_load_instruments(s, argv[1]);
    sonix_song_set_sample_rate(s, 48000);
    // Enable the dump so dbg_last_vol is populated; discard the text.
    FILE* devnull = fopen("/dev/null", "w");
    sonix_song_set_dump_file(s, devnull);
    sonix_song_start(s);

    int total = 48000 * seconds;
    int done = 0;
    double peak = 0.0, sumsq = 0.0;
    long nsamp = 0;
    float chvol[SONIX_NUM_CHANNELS] = {0};
    while (done < total) {
        float b[1024];
        int fr = sonix_song_decode(s, b, 512);
        if (fr <= 0) break;
        for (int j = 0; j < fr * 2; j++) {
            double x = b[j];
            double a = fabs(x);
            if (a > peak) peak = a;
            sumsq += x * x;
            nsamp++;
        }
        for (int ch = 0; ch < SONIX_NUM_CHANNELS; ch++) {
            float v = s->dbg_last_vol[ch] * 64.0f;
            if (v > chvol[ch]) chvol[ch] = v;
        }
        done += fr;
    }
    double rms = nsamp ? sqrt(sumsq / (double)nsamp) : 0.0;
    printf("PEAK %.4f RMS %.4f CH0VOL %.1f CH1VOL %.1f CH2VOL %.1f CH3VOL %.1f\n",
           peak, rms, chvol[0], chvol[1], chvol[2], chvol[3]);
    return 0;
}
