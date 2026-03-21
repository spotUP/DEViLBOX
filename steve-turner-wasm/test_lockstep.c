// test_lockstep.c — Per-tick Paula register state dump for lock-step debugging
// Intercepts all Paula register writes and logs them grouped by tick.
// Compare this output against UADE's register writes to find divergences.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// --- We need to intercept Paula calls. Use a wrapper approach. ---
// Compile with -DPAULA_TRACE to enable register write logging.

// Include the actual headers
#include "src/steveturner/steveturner.h"

// We'll re-implement paula functions as trace wrappers
#include <stdint.h>
#define PAULA_CLOCK_PAL  3546895.0f
#define PAULA_CHANNELS   4

// Traced state per channel
static struct {
    uint16_t period;
    uint8_t  volume;
    uint32_t sample_off;  // offset from module base
    uint16_t length_words;
    int      dma_on;
} ch_state[4] = {0};

static int current_tick = -1;
static const uint8_t *g_module_base = NULL;
static long g_module_len = 0;

// --- Minimal Paula implementation with tracing ---
// (We inline a minimal Paula just for the register logging)

typedef struct {
    const int8_t* sample;
    uint32_t      sample_len;
    float         pos;
    float         step;
    float         volume;
    int           dma_on;
    const int8_t* next_sample;
    uint32_t      next_len;
    int           has_next;
} PaulaCh;

static PaulaCh s_ch[4];
static float s_paula_clock = PAULA_CLOCK_PAL;
static float s_output_rate = 44100.0f;

void paula_reset(void) {
    memset(s_ch, 0, sizeof(s_ch));
    memset(ch_state, 0, sizeof(ch_state));
}

void paula_set_clock(float c) { s_paula_clock = c; }
void paula_set_output_rate(float r) { if (r > 0) s_output_rate = r; }
void paula_set_channel_gain(int ch, float g) { (void)ch; (void)g; }

static long ptr_offset(const int8_t *p) {
    if (!p || !g_module_base) return -1;
    long off = (const uint8_t *)p - g_module_base;
    if (off < 0 || off >= g_module_len) return -1;
    return off;
}

void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= 4) return;
    s_ch[ch].next_sample = data;
    s_ch[ch].has_next = 1;
    ch_state[ch].sample_off = (uint32_t)ptr_offset(data);
}

void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= 4) return;
    s_ch[ch].next_len = (uint32_t)len_words * 2;
    s_ch[ch].has_next = 1;
    ch_state[ch].length_words = len_words;
}

void paula_set_period(int ch, uint16_t period) {
    if (ch < 0 || ch >= 4 || period == 0) return;
    s_ch[ch].step = s_paula_clock / ((float)period * s_output_rate);
    ch_state[ch].period = period;
}

void paula_set_volume(int ch, uint8_t vol) {
    if (ch < 0 || ch >= 4) return;
    uint8_t v = vol > 64 ? 64 : vol;
    s_ch[ch].volume = (float)v / 64.0f;
    ch_state[ch].volume = v;
}

static void apply_pending(PaulaCh* ch) {
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
            ch_state[i].dma_on = enable;
        }
    }
    printf("T%04d DMA %04X [", current_tick, dmacon);
    for (int i = 0; i < 4; i++) {
        if (dmacon & (1 << i)) printf("ch%d=%s ", i, enable ? "ON" : "OFF");
    }
    printf("]\n");
}

static float sample_channel(PaulaCh* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
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
    int max_ticks = argc > 2 ? atoi(argv[2]) : 200;

    FILE *f = fopen(argv[1], "rb");
    if (!f) { fprintf(stderr, "Cannot open %s\n", argv[1]); return 1; }
    fseek(f, 0, SEEK_END); g_module_len = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(g_module_len);
    fread(data, 1, g_module_len, f); fclose(f);
    g_module_base = data;

    st_init();
    st_load(data, (int)g_module_len);
    paula_set_output_rate(44100.0f);
    st_set_subsong(1);

    // Dump header
    printf("# Steve Turner lock-step register dump\n");
    printf("# Format: T<tick> ch<n> per=<period> vol=<vol> smp=<offset> len=<words> dma=<0|1>\n\n");

    int samples_per_tick = (int)(44100.0f / (709379.0f / 7104.0f));
    float buf[samples_per_tick * 2 + 64];

    for (int tick = 0; tick < max_ticks; tick++) {
        current_tick = tick;
        st_tick();

        // Print channel state after each tick
        for (int c = 0; c < 4; c++) {
            printf("T%04d ch%d per=%5d vol=%2d smp=0x%05X len=%5d dma=%d\n",
                tick, c,
                ch_state[c].period,
                ch_state[c].volume,
                ch_state[c].sample_off,
                ch_state[c].length_words,
                ch_state[c].dma_on);
        }

        // Render audio for this tick
        paula_render(buf, samples_per_tick);

        if (st_is_finished()) {
            printf("# FINISHED at tick %d\n", tick);
            break;
        }
    }

    st_stop();
    free(data);
    return 0;
}
