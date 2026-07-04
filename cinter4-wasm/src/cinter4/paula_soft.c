// paula_soft.c — minimal Paula chip emulator for transpiled Amiga replayers
#include "paula_soft.h"
#include <string.h>
#include <stdio.h>

typedef struct {
    // Currently-playing buffer (latched from the registers on DMA start / wrap).
    const int8_t* sample;
    uint32_t      sample_len;   // bytes
    // Register values (AUDxLC / AUDxLEN). Writes land here and only take effect
    // on the next DMA wrap — exactly as Paula latches them — so mid-note length=0
    // writes (the one-shot repeat idiom) don't truncate the current note.
    const int8_t* reg_sample;
    uint32_t      reg_len;      // bytes
    float         pos;          // fractional position within sample
    float         step;         // samples-per-output-frame = freq / PAULA_RATE
    float         volume;       // 0.0 - 1.0
    int           dma_on;
    // Raw register values, kept for the song-level lock-test trace (period is
    // otherwise lost to `step`, volume to the 0-1 float). Not used by rendering.
    uint16_t      reg_period;   // last AUDxPER written
    uint8_t       reg_vol;      // last AUDxVOL written (0-64)
} PaulaChannel;

static PaulaChannel s_ch[PAULA_CHANNELS];
static uint16_t     s_last_dmacon = 0; // last DMACON write (lock-test trace)
static float        s_paula_clock = PAULA_CLOCK_PAL;
/* Actual output sample rate (the worklet renders at the AudioContext rate, not the
   28150 Hz the step formula used to assume). Set via paula_set_output_rate(). */
static float        s_output_rate = (float)PAULA_RATE_PAL;

void paula_reset(void) {
    memset(s_ch, 0, sizeof(s_ch));
}

void paula_set_clock(float clock) {
    s_paula_clock = clock;
}

void paula_set_output_rate(float rate) {
    if (rate > 0.0f) s_output_rate = rate;
}

void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].reg_sample = data; // register only — latched on DMA start / wrap
}

void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_ch[ch].reg_len = (uint32_t)len_words * 2; // words -> bytes; register only
}

void paula_set_period(int ch, uint16_t period) {
    if (ch < 0 || ch >= PAULA_CHANNELS || period == 0) return;
    s_ch[ch].reg_period = period; // lock-test trace
    // freq = paula_clock / period
    // step = freq / output_rate = paula_clock / (period * actual_output_rate)
    s_ch[ch].step = s_paula_clock / ((float)period * s_output_rate);
}

void paula_set_volume(int ch, uint8_t vol) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    uint8_t v = vol > 64 ? 64 : vol;
    s_ch[ch].reg_vol = v; // lock-test trace
    s_ch[ch].volume = (float)v / 64.0f;
}

/* Lock-test accessors — read the raw Paula register state (see moira-reference). */
uint16_t paula_reg_period(int ch)   { return (ch >= 0 && ch < PAULA_CHANNELS) ? s_ch[ch].reg_period : 0; }
uint8_t  paula_reg_volume(int ch)   { return (ch >= 0 && ch < PAULA_CHANNELS) ? s_ch[ch].reg_vol : 0; }
uint32_t paula_reg_len_bytes(int ch){ return (ch >= 0 && ch < PAULA_CHANNELS) ? s_ch[ch].reg_len : 0; }
uintptr_t paula_reg_sample_ptr(int ch){ return (ch >= 0 && ch < PAULA_CHANNELS) ? (uintptr_t)s_ch[ch].reg_sample : 0; }
uint16_t paula_last_dmacon(void)    { return s_last_dmacon; }

void paula_dma_write(uint16_t dmacon) {
    s_last_dmacon = dmacon; // lock-test trace
    int enable = (dmacon & 0x8000) != 0;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        if (dmacon & (1 << i)) {
            s_ch[i].dma_on = enable;
            if (enable) {
                // DMA start: latch the registers into the playing buffer (Paula
                // copies AUDxLC/AUDxLEN into its internal counters here).
                s_ch[i].sample     = s_ch[i].reg_sample;
                s_ch[i].sample_len = s_ch[i].reg_len;
                s_ch[i].pos        = 0.0f;
            }
        }
    }
}

static float sample_channel(PaulaChannel* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        // End of the current buffer: Paula re-latches the registers (the repeat).
        // For a one-shot the replayer has set reg_len=0 by now → channel stops;
        // for a looping sample reg points at the repeat and it continues.
        ch->pos -= (float)ch->sample_len;
        ch->sample     = ch->reg_sample;
        ch->sample_len = ch->reg_len;
        if (!ch->sample || ch->sample_len == 0) { ch->dma_on = 0; return 0.0f; }
        idx = (uint32_t)ch->pos;
        if (idx >= ch->sample_len) { ch->pos = 0.0f; idx = 0; }
    }
    float s = (float)ch->sample[idx] / 128.0f;
    ch->pos += ch->step;
    return s * ch->volume;
}

void paula_debug_dump(void) {
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        printf("[Cinter4] Paula ch%d: dma=%d step=%.4f vol=%.3f len=%u sample=%p\n",
               i, s_ch[i].dma_on, s_ch[i].step, s_ch[i].volume,
               s_ch[i].sample_len, (const void*)s_ch[i].sample);
    }
}

/* Per-channel oscilloscope ring buffers (the 4 Paula channels, pre-mix). */
#define SCOPE_LEN 256
static int16_t s_scope[PAULA_CHANNELS][SCOPE_LEN];
static int     s_scope_pos = 0;

int paula_render(float* buffer, int frames) {
    int i;
    for (i = 0; i < frames; i++) {
        float c0 = sample_channel(&s_ch[0]);
        float c1 = sample_channel(&s_ch[1]);
        float c2 = sample_channel(&s_ch[2]);
        float c3 = sample_channel(&s_ch[3]);
        // capture each channel's pre-mix sample for the per-channel oscilloscope
        s_scope[0][s_scope_pos] = (int16_t)(c0 * 32767.0f);
        s_scope[1][s_scope_pos] = (int16_t)(c1 * 32767.0f);
        s_scope[2][s_scope_pos] = (int16_t)(c2 * 32767.0f);
        s_scope[3][s_scope_pos] = (int16_t)(c3 * 32767.0f);
        s_scope_pos = (s_scope_pos + 1) & (SCOPE_LEN - 1);
        // Amiga hard panning: ch0,3 -> left; ch1,2 -> right
        float left  = c0 + c3;
        float right = c1 + c2;
        buffer[i * 2 + 0] = left  * 0.5f;  // 50% to avoid clipping
        buffer[i * 2 + 1] = right * 0.5f;
    }
    return frames;
}

/* Oscilloscope accessors for the host worklet. */
uintptr_t paula_scope_ptr(int ch) {
    return (ch >= 0 && ch < PAULA_CHANNELS) ? (uintptr_t)s_scope[ch] : 0;
}
int paula_scope_len(void) { return SCOPE_LEN; }
int paula_scope_pos(void) { return s_scope_pos; }
