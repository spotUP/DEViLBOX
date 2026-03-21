// test_envtrace.c — Trace envelope function calls per tick per channel
// Shows exactly which envelope phase runs at which tick for lock-step comparison
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "src/steveturner/steveturner.h"

// Minimal Paula that just logs register writes
#define PAULA_CLOCK_PAL 3546895.0f
#define PAULA_CHANNELS 4
static int g_tick = -1;

void paula_reset(void) {}
void paula_set_clock(float c) { (void)c; }
void paula_set_output_rate(float r) { (void)r; }
void paula_set_channel_gain(int ch, float g) { (void)ch; (void)g; }
void paula_set_sample_ptr(int ch, const int8_t* d) { (void)ch; (void)d; }
void paula_set_length(int ch, uint16_t l) {
    printf("  T%04d ch%d LEN=%d\n", g_tick, ch, l);
}
void paula_set_period(int ch, uint16_t p) {
    printf("  T%04d ch%d PER=%d\n", g_tick, ch, p);
}
void paula_set_volume(int ch, uint8_t v) {
    printf("  T%04d ch%d VOL=%d\n", g_tick, ch, v > 64 ? 64 : v);
}
void paula_dma_write(uint16_t d) {
    int en = (d & 0x8000) != 0;
    for (int i = 0; i < 4; i++)
        if (d & (1<<i)) printf("  T%04d ch%d DMA=%s\n", g_tick, i, en?"ON":"OFF");
}
int paula_render(float* b, int f) { memset(b, 0, f*8); return f; }
void paula_get_channel_levels(float* o) { memset(o, 0, 16); }

int main(int argc, char *argv[]) {
    if (argc < 2) { fprintf(stderr, "Usage: %s <module.jpo> [ticks]\n", argv[0]); return 1; }
    int max_ticks = argc > 2 ? atoi(argv[2]) : 30;

    FILE *f = fopen(argv[1], "rb");
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(len); fread(data, 1, len, f); fclose(f);

    st_init();
    st_load(data, (int)len);

    printf("--- st_set_subsong(1) ---\n");
    g_tick = -1;
    st_set_subsong(1);

    for (int tick = 0; tick < max_ticks; tick++) {
        g_tick = tick;
        st_tick();
        if (st_is_finished()) { printf("FINISHED at tick %d\n", tick); break; }
    }

    st_stop();
    free(data);
    return 0;
}
