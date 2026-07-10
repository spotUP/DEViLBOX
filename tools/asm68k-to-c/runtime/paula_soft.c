// paula_soft.c — minimal Paula chip emulator for transpiled Amiga replayers
#include "paula_soft.h"
#include <string.h>
#include <stdio.h>
#include <stdint.h>

typedef struct {
    const int8_t* sample;
    uint32_t      sample_len;   // bytes
    float         pos;          // fractional position within sample
    float         step;         // samples-per-output-frame = freq / PAULA_RATE
    float         volume;       // 0.0 - 1.0
    int           dma_on;
    int           loop;         // 0=one-shot, 1=loop
    // Follow-on buffer loaded atomically when current one-shot ends
    const int8_t* next_sample;
    uint32_t      next_len;
    int           next_loop;
    uint16_t      next_period;  // 0 = keep current period
    uint8_t       next_vol;
    int           next_has_vol; // apply next_vol on swap
    int           next_valid;
    int           completed;    // one-shot buffer reached its end since last poll
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

void paula_set_loop(int ch, int loop) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].loop = loop;
}

void paula_set_next(int ch, const int8_t* data, uint16_t len_words, int loop,
                    uint16_t period, uint8_t vol) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].next_sample  = data;
    s_ch[ch].next_len     = (uint32_t)len_words * 2;
    s_ch[ch].next_loop    = loop;
    s_ch[ch].next_period  = period;
    s_ch[ch].next_vol     = vol > 64 ? 64 : vol;
    s_ch[ch].next_has_vol = 1;
    s_ch[ch].next_valid   = 1;
}

int paula_is_active(int ch) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return 0;
    return s_ch[ch].dma_on;
}

int paula_poll_completion(int ch) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return 0;
    int c = s_ch[ch].completed;
    s_ch[ch].completed = 0;
    return c;
}

void paula_channel_dma_off(int ch) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].dma_on     = 0;
    s_ch[ch].next_valid = 0;
    s_ch[ch].completed  = 0;
}

void paula_dma_write(uint16_t dmacon) {
    int enable = (dmacon & 0x8000) != 0;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        if (dmacon & (1 << i)) {
            s_ch[i].dma_on = enable;
            if (enable) { s_ch[i].pos = 0.0f; s_ch[i].completed = 0; }
        }
    }
}

static float sample_channel(PaulaChannel* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        if (ch->loop) {
            // Wrap within the loop
            ch->pos -= (float)ch->sample_len;
            idx = (uint32_t)ch->pos;
            if (idx >= ch->sample_len) { ch->pos = 0.0f; idx = 0; }
        } else if (ch->next_valid) {
            // Swap to the queued follow-on buffer (audio.device double-buffering).
            // The buffer that just ended is done — raise the completion signal so
            // the harness can reply its IOAudio block.
            ch->sample      = ch->next_sample;
            ch->sample_len  = ch->next_len;
            ch->loop        = ch->next_loop;
            if (ch->next_period > 0)
                ch->step = s_paula_clock / ((float)ch->next_period * (float)PAULA_RATE_PAL);
            if (ch->next_has_vol)
                ch->volume = (float)ch->next_vol / 64.0f;
            ch->next_valid  = 0;
            ch->next_has_vol = 0;
            ch->pos         = 0.0f;
            ch->completed   = 1;
            idx             = 0;
        } else {
            ch->dma_on    = 0;
            ch->completed = 1;
            return 0.0f;
        }
    }
    uintptr_t memsize = (uintptr_t)__builtin_wasm_memory_size(0) * 65536u;
    if ((uintptr_t)ch->sample + idx >= memsize || (uintptr_t)ch->sample < 1024u) {
        static int dbg = 0;
        if (dbg++ < 8)
            fprintf(stderr, "[paula OOB] sample=%u idx=%u len=%u pos=%f step=%f loop=%d\n",
                    (uint32_t)(uintptr_t)ch->sample, idx, ch->sample_len, ch->pos, ch->step, ch->loop);
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
