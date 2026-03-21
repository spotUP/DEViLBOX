// test_reglog.c — Log Paula register writes per tick in UADE-comparable format
// Wraps paula_soft functions to trace all writes with tick numbers.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "src/steveturner/steveturner.h"

// We redefine Paula functions to log + forward to real implementation
// The real Paula is in paula_soft.c, but we intercept calls via the linker.
// Actually, steveturner.c calls paula_* directly. So we provide our own
// implementations that log and call through to a renamed real paula.

// Since we can't rename at link time easily, we just provide a full
// tracing Paula implementation that also renders audio.

#define PAULA_CLOCK_PAL  3546895.0f
#define PAULA_CHANNELS   4

typedef struct {
    const int8_t* sample;
    uint32_t sample_len;
    float pos;
    float step;
    float volume;
    int dma_on;
    const int8_t* next_sample;
    uint32_t next_len;
    int has_next;
    uint16_t last_period;
    uint8_t  last_vol;
} TracePaulaCh;

static TracePaulaCh s_ch[4];
static float s_paula_clock = PAULA_CLOCK_PAL;
static float s_output_rate = 44100.0f;
static int g_tick = -1;

void paula_reset(void) {
    memset(s_ch, 0, sizeof(s_ch));
}
void paula_set_clock(float c) { s_paula_clock = c; }
void paula_set_output_rate(float r) { if (r > 0) s_output_rate = r; }
void paula_set_channel_gain(int ch, float g) { (void)ch; (void)g; }

void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= 4) return;
    s_ch[ch].next_sample = data;
    s_ch[ch].has_next = 1;
}

void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= 4) return;
    s_ch[ch].next_len = (uint32_t)len_words * 2;
    s_ch[ch].has_next = 1;
    printf("T%04d     LEN ch%d val=%5d\n", g_tick, ch, len_words);
}

void paula_set_period(int ch, uint16_t period) {
    if (ch < 0 || ch >= 4 || period == 0) return;
    s_ch[ch].step = s_paula_clock / ((float)period * s_output_rate);
    if (period != s_ch[ch].last_period) {
        printf("T%04d     PER ch%d val=%5d\n", g_tick, ch, period);
        s_ch[ch].last_period = period;
    }
}

void paula_set_volume(int ch, uint8_t vol) {
    if (ch < 0 || ch >= 4) return;
    uint8_t v = vol > 64 ? 64 : vol;
    s_ch[ch].volume = (float)v / 64.0f;
    if (v != s_ch[ch].last_vol) {
        printf("T%04d     VOL ch%d val=%5d\n", g_tick, ch, v);
        s_ch[ch].last_vol = v;
    }
}

static void apply_pending(TracePaulaCh* ch) {
    if (ch->has_next) {
        ch->sample = ch->next_sample;
        ch->sample_len = ch->next_len;
        ch->has_next = 0;
    }
}

void paula_dma_write(uint16_t dmacon) {
    int enable = (dmacon & 0x8000) != 0;
    for (int i = 0; i < 4; i++) {
        if (dmacon & (1 << i)) {
            if (enable) {
                apply_pending(&s_ch[i]);
                s_ch[i].pos = 0.0f;
            }
            s_ch[i].dma_on = enable;
            printf("T%04d     DMA ch%d %s\n", g_tick, i, enable ? "ON" : "OFF");
        }
    }
}

static float sample_channel(TracePaulaCh* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0)
        return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        apply_pending(ch);
        ch->pos = 0.0f;
        idx = 0;
        if (!ch->sample || ch->sample_len == 0) return 0.0f;
    }
    float s = (float)ch->sample[idx] / 128.0f;
    ch->pos += ch->step;
    return s * ch->volume;
}

int paula_render(float* buffer, int frames) {
    for (int i = 0; i < frames; i++) {
        float l = 0, r = 0;
        for (int c = 0; c < 4; c++) {
            float s = sample_channel(&s_ch[c]);
            if (c == 0 || c == 3) l += s; else r += s;
        }
        buffer[i*2+0] = l * 0.5f;
        buffer[i*2+1] = r * 0.5f;
    }
    return frames;
}

void paula_get_channel_levels(float* out4) {
    for (int c = 0; c < 4; c++) out4[c] = 0;
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <module.jpo> [ticks]\n", argv[0]);
        return 1;
    }
    int max_ticks = argc > 2 ? atoi(argv[2]) : 100;

    FILE *f = fopen(argv[1], "rb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", argv[1]); return 1; }
    fseek(f, 0, SEEK_END); long len = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(len); fread(data, 1, len, f); fclose(f);

    st_init();
    st_load(data, (int)len);
    paula_set_output_rate(44100.0f);

    printf("# C replayer register log\n\n");

    g_tick = 0;
    st_set_subsong(1);

    float buf[512 * 2];
    int spt = (int)(44100.0f / (709379.0f / 7104.0f));

    for (int tick = 0; tick < max_ticks; tick++) {
        g_tick = tick;
        st_tick();
        paula_render(buf, spt);

        if (st_is_finished()) {
            printf("# FINISHED at tick %d\n", tick);
            break;
        }
    }

    st_stop();
    free(data);
    return 0;
}
