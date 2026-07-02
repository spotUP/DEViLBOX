// paula_soft.c — minimal Paula chip emulator for transpiled Amiga replayers
#include "paula_soft.h"
#include <string.h>

typedef struct {
    const int8_t* sample;
    uint32_t      sample_len;   // bytes
    float         pos;          // fractional position within sample
    float         step;         // samples-per-output-frame = freq / PAULA_RATE
    float         volume;       // 0.0 - 1.0
    int           dma_on;
} PaulaChannel;

static PaulaChannel s_ch[PAULA_CHANNELS];
static float        s_paula_clock = PAULA_CLOCK_PAL;

void paula_reset(void) {
    memset(s_ch, 0, sizeof(s_ch));
}

void paula_set_clock(float clock) {
    s_paula_clock = clock;
}

void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].sample = data;
    s_ch[ch].pos    = 0.0f;
}

void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].sample_len = (uint32_t)len_words * 2; // words -> bytes
}

void paula_set_period(int ch, uint16_t period) {
    if (ch < 0 || ch >= PAULA_CHANNELS || period == 0) return;
    // freq = paula_clock / period
    // step = freq / output_rate = paula_clock / (period * PAULA_RATE_PAL)
    s_ch[ch].step = s_paula_clock / ((float)period * (float)PAULA_RATE_PAL);
}

void paula_set_volume(int ch, uint8_t vol) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    uint8_t v = vol > 64 ? 64 : vol;
    s_ch[ch].volume = (float)v / 64.0f;
}

void paula_dma_write(uint16_t dmacon) {
    int enable = (dmacon & 0x8000) != 0;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        if (dmacon & (1 << i)) {
            s_ch[i].dma_on = enable;
            if (enable) s_ch[i].pos = 0.0f;
        }
    }
}

static float sample_channel(PaulaChannel* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        ch->dma_on = 0;
        return 0.0f;
    }
    float s = (float)ch->sample[idx] / 128.0f;
    ch->pos += ch->step;
    return s * ch->volume;
}

int paula_render(float* buffer, int frames) {
    int i;
    for (i = 0; i < frames; i++) {
        // Amiga hard panning: ch0,3 -> left; ch1,2 -> right
        float left  = sample_channel(&s_ch[0]) + sample_channel(&s_ch[3]);
        float right = sample_channel(&s_ch[1]) + sample_channel(&s_ch[2]);
        buffer[i * 2 + 0] = left  * 0.5f;  // 50% to avoid clipping
        buffer[i * 2 + 1] = right * 0.5f;
    }
    return frames;
}
