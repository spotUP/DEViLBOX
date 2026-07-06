// Renders a Sonix song and reports per-channel scope energy, optionally with a
// channel-mute mask applied. Used by muteChannel.test.ts to prove per-channel mute
// silences a channel's output. Build: cc -O1 -w -I <repo>/sonix-wasm/src probe-mute.c -o probe -lm
// Run: probe "<song>.smus" <muteMaskHex>   (mask bit N=1 => channel N audible)
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
    (void)u; FILE* f = fopen(p, "rb"); if (!f) return false;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t* b = (uint8_t*)malloc((size_t)n); if (fread(b,1,(size_t)n,f)!=(size_t)n){fclose(f);free(b);return false;}
    fclose(f); *o = b; *os = (uint32_t)n; return true;
}
static int ls(const char* d, void (*v)(const char*, void*), void* c, void* u) {
    (void)u; DIR* dir = opendir(d); if (!dir) return -1; struct dirent* e; int n = 0;
    while ((e = readdir(dir))) { if (e->d_name[0]=='.') continue; if (v) v(e->d_name, c); n++; }
    closedir(dir); return n;
}
int main(int argc, char** argv) {
    if (argc < 2) return 2;
    uint32_t mask = (argc >= 3) ? (uint32_t)strtoul(argv[2], NULL, 16) : 0xFFFFFFFFu;
    FILE* fi = fopen(argv[1], "rb"); if (!fi) return 2;
    fseek(fi, 0, SEEK_END); long n = ftell(fi); fseek(fi, 0, SEEK_SET);
    uint8_t* bf = (uint8_t*)malloc((size_t)n); if (fread(bf,1,(size_t)n,fi)!=(size_t)n){fclose(fi);return 2;} fclose(fi);
    SonixIoCallbacks io; memset(&io, 0, sizeof(io)); io.read_file = rd; io.list_dir = ls;
    SonixSong* s = sonix_song_create(bf, (uint32_t)n, &io); if (!s) return 2;
    sonix_song_load_instruments(s, argv[1]);
    sonix_song_set_sample_rate(s, 48000);
    sonix_song_set_channel_mute_mask(s, mask);
    sonix_song_start(s);
    double energy[SONIX_NUM_CHANNELS] = {0};
    int total = 48000 * 4, done = 0;
    while (done < total) {
        float b[1024];
        int fr = sonix_song_decode(s, b, 512);
        if (fr <= 0) break;
        // Re-apply mask each block (decode does not clear it, but be explicit).
        sonix_song_set_channel_mute_mask(s, mask);
        int cnt = s->scope_count;
        for (int ch = 0; ch < SONIX_NUM_CHANNELS; ch++)
            for (int j = 0; j < cnt; j++) { double v = s->scope_buf[ch][j] / 32768.0; energy[ch] += v * v; }
        done += fr;
    }
    printf("CH0 %.6f CH1 %.6f CH2 %.6f CH3 %.6f\n", energy[0], energy[1], energy[2], energy[3]);
    return 0;
}
