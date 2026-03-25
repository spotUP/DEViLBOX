// paula_soft.c — minimal Paula chip emulator for transpiled Amiga replayers
// Implements Amiga double-buffer DMA: initial sample + loop reload
#include "paula_soft.h"
#include <string.h>

typedef struct {
    const int8_t* sample;       // currently playing data
    uint32_t      sample_len;   // bytes (current)
    const int8_t* next_sample;  // reload ptr (written after DMA enable = loop start)
    uint32_t      next_len;     // reload length (loop length)
    float         pos;          // fractional position within sample
    float         step;         // samples-per-output-frame = freq / output_rate
    float         volume;       // 0.0 - 1.0
    int           dma_on;
} PaulaChannel;

static PaulaChannel s_ch[PAULA_CHANNELS];
static float        s_paula_clock = PAULA_CLOCK_PAL;
static float        s_output_rate = (float)PAULA_RATE_PAL;
static float        s_channel_gain[PAULA_CHANNELS] = {1.0f, 1.0f, 1.0f, 1.0f};
static float        s_channel_peaks[PAULA_CHANNELS] = {0};

// Capture state (forward declarations — used by set_period/set_volume)
static PaulaNoteEvent s_capture[PAULA_CAPTURE_MAX];
static int            s_capture_count = 0;
static int            s_capturing = 0;
static uint32_t       s_capture_tick = 0;
static uint16_t       s_prev_period[PAULA_CHANNELS];
static uint8_t        s_prev_volume[PAULA_CHANNELS];
static uint8_t        s_dirty[PAULA_CHANNELS];

void paula_reset(void) {
    memset(s_ch, 0, sizeof(s_ch));
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) s_channel_gain[i] = 1.0f;
}

void paula_set_channel_gain(int ch, float gain) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    s_channel_gain[ch] = gain < 0.0f ? 0.0f : (gain > 1.0f ? 1.0f : gain);
}

void paula_set_clock(float clock) {
    s_paula_clock = clock;
}

void paula_set_output_rate(float rate) {
    if (rate > 0.0f) s_output_rate = rate;
}

// If DMA is off: sets the initial sample (played when DMA is enabled).
// If DMA is on:  sets the reload sample (played after initial completes — the loop).
void paula_set_sample_ptr(int ch, const int8_t* data) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    if (!s_ch[ch].dma_on) {
        s_ch[ch].sample = data;
        s_ch[ch].pos    = 0.0f;
    } else {
        s_ch[ch].next_sample = data;
    }
}

// If DMA is off: sets initial sample length.
// If DMA is on:  sets reload (loop) length.
void paula_set_length(int ch, uint16_t len_words) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    uint32_t bytes = (uint32_t)len_words * 2;
    if (!s_ch[ch].dma_on) {
        s_ch[ch].sample_len = bytes;
    } else {
        s_ch[ch].next_len = bytes;
    }
}

void paula_set_period(int ch, uint16_t period) {
    if (ch < 0 || ch >= PAULA_CHANNELS || period == 0) return;
    s_ch[ch].step = s_paula_clock / ((float)period * s_output_rate);
    if (s_capturing && period != s_prev_period[ch]) {
        s_prev_period[ch] = period;
        s_dirty[ch] = 1;
    }
}

void paula_set_volume(int ch, uint8_t vol) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    uint8_t v = vol > 64 ? 64 : vol;
    s_ch[ch].volume = (float)v / 64.0f;
    if (s_capturing && v != s_prev_volume[ch]) {
        s_prev_volume[ch] = v;
        s_dirty[ch] = 1;
    }
}

void paula_dma_write(uint16_t dmacon) {
    int enable = (dmacon & 0x8000) != 0;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        if (dmacon & (1 << i)) {
            if (enable) {
                // DMA enable: start playing the initial sample from pos 0.
                // next_sample/next_len hold the reload (loop) values set before enable.
                s_ch[i].dma_on = 1;
                s_ch[i].pos    = 0.0f;
                // next_sample/next_len are already set (or NULL/0 for one-shot)
            } else {
                s_ch[i].dma_on      = 0;
                s_ch[i].next_sample = NULL;
                s_ch[i].next_len    = 0;
            }
        }
    }
}

static float sample_channel(PaulaChannel* ch) {
    if (!ch->dma_on || ch->step <= 0.0f || !ch->sample || ch->sample_len == 0) return 0.0f;
    uint32_t idx = (uint32_t)ch->pos;
    if (idx >= ch->sample_len) {
        // Sample finished — reload loop if available
        if (ch->next_sample && ch->next_len > 0) {
            ch->sample     = ch->next_sample;
            ch->sample_len = ch->next_len;
            ch->pos        = 0.0f;
            idx            = 0;
        } else {
            ch->dma_on = 0;
            return 0.0f;
        }
    }
    float s = (float)ch->sample[idx] / 128.0f;
    ch->pos += ch->step;
    return s * ch->volume;
}

int paula_render(float* buffer, int frames) {
    int i, c;
    for (i = 0; i < frames; i++) {
        float ch_out[PAULA_CHANNELS];
        for (c = 0; c < PAULA_CHANNELS; c++) {
            ch_out[c] = sample_channel(&s_ch[c]) * s_channel_gain[c];
            float absv = ch_out[c] < 0 ? -ch_out[c] : ch_out[c];
            if (absv > s_channel_peaks[c]) s_channel_peaks[c] = absv;
        }
        // Amiga hard panning: ch0,3 -> left; ch1,2 -> right
        buffer[i * 2 + 0] = (ch_out[0] + ch_out[3]) * 0.5f;
        buffer[i * 2 + 1] = (ch_out[1] + ch_out[2]) * 0.5f;
    }
    return frames;
}

void paula_get_channel_levels(float* out4) {
    int c;
    for (c = 0; c < PAULA_CHANNELS; c++) {
        out4[c] = s_channel_peaks[c];
        s_channel_peaks[c] = 0.0f;
    }
}

void paula_debug_state(int ch, float* out8) {
    if (ch < 0 || ch >= PAULA_CHANNELS) return;
    PaulaChannel* c = &s_ch[ch];
    out8[0] = c->dma_on ? 1.0f : 0.0f;
    out8[1] = c->volume;
    out8[2] = c->step;
    out8[3] = c->pos;
    out8[4] = (float)c->sample_len;
    out8[5] = c->sample ? 1.0f : 0.0f;
    out8[6] = c->next_sample ? 1.0f : 0.0f;
    out8[7] = (float)c->next_len;
}

// ── Note Capture ──────────────────────────────────────────────────────

void paula_capture_start(void) {
    s_capture_count = 0;
    s_capture_tick = 0;
    s_capturing = 1;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        s_prev_period[i] = 0;
        s_prev_volume[i] = 0;
        s_dirty[i] = 0;
    }
}

void paula_capture_stop(void) {
    s_capturing = 0;
}

// Called once per Interrupt() tick from the wrapper.
// Flushes any dirty channels as NoteEvents.
void paula_capture_tick(void) {
    if (!s_capturing) return;
    int i;
    for (i = 0; i < PAULA_CHANNELS; i++) {
        if (s_dirty[i] && s_capture_count < PAULA_CAPTURE_MAX) {
            PaulaNoteEvent* e = &s_capture[s_capture_count++];
            e->tick    = s_capture_tick;
            e->channel = (uint8_t)i;
            e->period  = s_prev_period[i];
            e->volume  = s_prev_volume[i];
            s_dirty[i] = 0;
        }
    }
    s_capture_tick++;
}

int paula_capture_count(void) {
    return s_capture_count;
}

const PaulaNoteEvent* paula_capture_buffer(void) {
    return s_capture;
}
