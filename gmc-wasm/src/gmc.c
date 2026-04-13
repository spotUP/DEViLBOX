// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "gmc.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef __cplusplus
#ifndef nullptr
#define nullptr ((void*)0)
#endif
#endif

#define SAMPLE_FRAC_BITS 16

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const int16_t gmc_periods[36] = {
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum GmcEffect {
    GMC_EFFECT_NONE         = 0,
    GMC_EFFECT_SLIDE_UP     = 1,
    GMC_EFFECT_SLIDE_DOWN   = 2,
    GMC_EFFECT_SET_VOLUME   = 3,
    GMC_EFFECT_PATTERN_BREAK = 4,
    GMC_EFFECT_POSITION_JUMP = 5,
    GMC_EFFECT_ENABLE_FILTER = 6,
    GMC_EFFECT_DISABLE_FILTER = 7,
    GMC_EFFECT_SET_SPEED    = 8
} GmcEffect;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct GmcTrackLine {
    uint16_t period;
    uint8_t  sample;
    GmcEffect effect;
    uint8_t  effect_arg;
} GmcTrackLine;

typedef struct GmcPattern {
    GmcTrackLine tracks[4][64];
} GmcPattern;

typedef struct GmcSample {
    int8_t*  data;
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
    uint16_t volume;
} GmcSample;

typedef struct GmcChannelInfo {
    int32_t  slide;
    uint16_t period;
    uint16_t volume;
} GmcChannelInfo;

typedef struct GmcGlobalPlayingInfo {
    uint16_t song_speed;
    uint16_t song_step;
    uint16_t pattern_count;
    int16_t  current_position;
    uint8_t  current_pattern;
} GmcGlobalPlayingInfo;

// Channel state for mixer
typedef struct GmcMixChannel {
    const int8_t* sample_data;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;
    uint32_t sample_offset;
    uint64_t position_fp;
    uint16_t period;
    uint16_t volume;
    bool     active;
    bool     muted;
} GmcMixChannel;

struct GmcModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    // Module data
    int          num_positions;
    uint8_t*     position_list;
    GmcSample    samples[15];
    GmcPattern*  patterns;
    int          num_patterns;

    // Playing state
    GmcGlobalPlayingInfo playing_info;
    GmcChannelInfo       channel_info[4];
    bool                 end_reached;

    // Position visited tracking
    uint8_t visited[256];

    // Mix channels
    GmcMixChannel channels[4];

    // Tick timing
    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Big-endian reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct GmcReader {
    const uint8_t* data;
    size_t         size;
    size_t         pos;
} GmcReader;

static void reader_init(GmcReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos  = 0;
}

static bool reader_eof(const GmcReader* r) {
    return r->pos > r->size;
}

static void reader_seek(GmcReader* r, size_t pos) {
    r->pos = pos;
}

static void reader_skip(GmcReader* r, size_t bytes) {
    r->pos += bytes;
}

static uint8_t reader_read_uint8(GmcReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static uint16_t reader_read_b_uint16(GmcReader* r) {
    if (r->pos + 2 > r->size) { r->pos = r->size + 1; return 0; }
    uint16_t val = ((uint16_t)r->data[r->pos] << 8) | r->data[r->pos + 1];
    r->pos += 2;
    return val;
}

static uint32_t reader_read_b_uint32(GmcReader* r) {
    if (r->pos + 4 > r->size) { r->pos = r->size + 1; return 0; }
    uint32_t val = ((uint32_t)r->data[r->pos] << 24) |
                   ((uint32_t)r->data[r->pos + 1] << 16) |
                   ((uint32_t)r->data[r->pos + 2] << 8) |
                    r->data[r->pos + 3];
    r->pos += 4;
    return val;
}

static int32_t reader_read_b_int32(GmcReader* r) {
    return (int32_t)reader_read_b_uint32(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Position visit tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(GmcModule* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static bool has_position_been_visited(const GmcModule* m, int pos) {
    if (pos < 0 || pos >= 256) return false;
    return m->visited[pos] != 0;
}

static void mark_position_as_visited(GmcModule* m, int pos) {
    if (pos >= 0 && pos < 256)
        m->visited[pos] = 1;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel simulation — maps to mix channel
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_play_sample(GmcMixChannel* c, const int8_t* data, uint32_t offset, uint32_t length) {
    c->sample_data   = data;
    c->sample_offset = offset;
    c->sample_length = offset + length;
    c->loop_start    = 0;
    c->loop_length   = 0;
    c->position_fp   = (uint64_t)offset << SAMPLE_FRAC_BITS;
    c->active        = true;
}

static void ch_set_loop(GmcMixChannel* c, uint32_t start, uint32_t length) {
    c->loop_start  = start;
    c->loop_length = length;
    if (length > 0)
        c->sample_length = start + length;
}

static void ch_set_amiga_volume(GmcMixChannel* c, uint16_t vol) {
    if (vol > 64) vol = 64;
    c->volume = vol;
}

static void ch_set_amiga_period(GmcMixChannel* c, uint16_t period) {
    c->period = period;
}

static void ch_mute(GmcMixChannel* c) {
    c->active = false;
}

static void ch_set_volume_256(GmcMixChannel* c, uint16_t vol) {
    // SetVolume(0-256) maps to 0-64
    ch_set_amiga_volume(c, (uint16_t)(vol >> 2));
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(GmcModule* m, int start_position) {
    m->playing_info.current_position = (int16_t)(start_position - 1);
    m->playing_info.current_pattern  = 0;
    m->playing_info.song_speed       = 0;
    m->playing_info.song_step        = 6;
    m->playing_info.pattern_count    = 63;

    m->end_reached = false;

    for (int i = 0; i < 4; i++) {
        m->channel_info[i].slide  = 0;
        m->channel_info[i].period = 0;
        m->channel_info[i].volume = 0;

        memset(&m->channels[i], 0, sizeof(GmcMixChannel));
    }

    clear_visited(m);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Set instrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_instrument(GmcMixChannel* channel, GmcChannelInfo* chan_info,
                           const GmcTrackLine* track_line, const GmcSample* samples) {
    if (track_line->sample != 0) {
        const GmcSample* sample = &samples[track_line->sample - 1];

        chan_info->period = track_line->period;
        chan_info->volume = sample->volume;
        chan_info->slide  = 0;

        if (sample->data != nullptr) {
            ch_play_sample(channel, sample->data, 0, sample->length);

            if (sample->loop_length > 0)
                ch_set_loop(channel, sample->loop_start, sample->loop_length);

            ch_set_volume_256(channel, 0);
            ch_set_amiga_period(channel, chan_info->period);
        }
        else {
            ch_mute(channel);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Set effect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_effect(GmcModule* m, GmcChannelInfo* chan_info, const GmcTrackLine* track_line) {
    uint8_t effect_arg = track_line->effect_arg;

    switch (track_line->effect) {
        case GMC_EFFECT_SLIDE_UP:
            chan_info->slide = -(int32_t)effect_arg;
            break;

        case GMC_EFFECT_SLIDE_DOWN:
            chan_info->slide = (int32_t)effect_arg;
            break;

        case GMC_EFFECT_SET_VOLUME:
            if (effect_arg > 64)
                effect_arg = 64;
            chan_info->volume = effect_arg;
            break;

        case GMC_EFFECT_PATTERN_BREAK:
            m->playing_info.pattern_count = 63;
            break;

        case GMC_EFFECT_POSITION_JUMP:
            m->playing_info.current_position = (int16_t)(effect_arg - 1);
            m->playing_info.pattern_count    = 63;
            break;

        case GMC_EFFECT_ENABLE_FILTER:
            // AmigaFilter = true; (no-op in C port)
            break;

        case GMC_EFFECT_DISABLE_FILTER:
            // AmigaFilter = false; (no-op in C port)
            break;

        case GMC_EFFECT_SET_SPEED:
            m->playing_info.song_step = effect_arg;
            break;

        default:
            break;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Update pattern counters
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void update_pattern_counters(GmcModule* m) {
    m->playing_info.pattern_count++;
    if (m->playing_info.pattern_count == 64) {
        m->playing_info.current_position++;
        if (m->playing_info.current_position >= m->num_positions)
            m->playing_info.current_position = 0;

        if (has_position_been_visited(m, m->playing_info.current_position))
            m->end_reached = true;

        mark_position_as_visited(m, m->playing_info.current_position);

        m->playing_info.pattern_count   = 0;
        m->playing_info.current_pattern = m->position_list[m->playing_info.current_position];
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play pattern row
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_pattern_row(GmcModule* m) {
    for (int i = 0; i < 4; i++) {
        GmcChannelInfo* chan_info = &m->channel_info[i];
        GmcMixChannel*  channel  = &m->channels[i];

        const GmcTrackLine* track_line = &m->patterns[m->playing_info.current_pattern].tracks[i][m->playing_info.pattern_count];

        set_instrument(channel, chan_info, track_line, m->samples);
        set_effect(m, chan_info, track_line);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Every tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void every_tick(GmcModule* m) {
    for (int i = 0; i < 4; i++) {
        GmcChannelInfo* chan_info = &m->channel_info[i];
        GmcMixChannel*  channel  = &m->channels[i];

        chan_info->period = (uint16_t)(chan_info->period + chan_info->slide);

        ch_set_amiga_period(channel, chan_info->period);
        ch_set_amiga_volume(channel, chan_info->volume);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick (main player method)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(GmcModule* m) {
    every_tick(m);

    m->playing_info.song_speed++;
    if (m->playing_info.song_speed >= m->playing_info.song_step) {
        m->playing_info.song_speed = 0;

        update_pattern_counters(m);
        play_pattern_row(m);
    }

    // endReached is checked after Play() returns — handled in render
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(GmcModule* m, const uint8_t* data, size_t size) {
    GmcReader reader;
    reader_init(&reader, data, size);

    if (size < 444)
        return false;

    // Read sample information
    for (int i = 0; i < 15; i++) {
        uint32_t start = reader_read_b_uint32(&reader);
        m->samples[i].length = (uint16_t)(reader_read_b_uint16(&reader) * 2);
        m->samples[i].volume = reader_read_b_uint16(&reader);
        uint32_t loop_start  = reader_read_b_uint32(&reader);
        uint16_t loop_length = reader_read_b_uint16(&reader);

        if ((loop_length != 0) && (loop_length != 2)) {
            m->samples[i].loop_start  = (uint16_t)(loop_start - start);
            m->samples[i].loop_length = (uint16_t)(loop_length * 2);
        }
        else {
            m->samples[i].loop_start  = 0;
            m->samples[i].loop_length = 0;
        }

        if (reader_eof(&reader))
            return false;

        reader_skip(&reader, 2);  // skip 2 bytes
        m->samples[i].data = nullptr;
    }

    // Read position list
    int num_positions = reader_read_b_int32(&reader);
    m->position_list  = (uint8_t*)calloc(num_positions, sizeof(uint8_t));
    if (!m->position_list)
        return false;

    int actual_positions = num_positions;
    int num_patterns = 0;

    for (int i = 0, cnt = num_positions; i < cnt; i++) {
        uint16_t temp = reader_read_b_uint16(&reader);
        if (temp < 0x8000) {
            m->position_list[i] = (uint8_t)(temp / 1024);

            if (m->position_list[i] > num_patterns)
                num_patterns = m->position_list[i];
        }
        else {
            actual_positions--;
        }
    }

    m->num_positions = actual_positions;
    num_patterns++;

    if (reader_eof(&reader))
        return false;

    // Read patterns
    reader_seek(&reader, 444);

    m->patterns     = (GmcPattern*)calloc(num_patterns, sizeof(GmcPattern));
    m->num_patterns = num_patterns;
    if (!m->patterns)
        return false;

    for (int i = 0; i < num_patterns; i++) {
        for (int j = 0; j < 64; j++) {
            for (int k = 0; k < 4; k++) {
                uint16_t period = reader_read_b_uint16(&reader);
                uint8_t  byt3   = reader_read_uint8(&reader);
                uint8_t  byt4   = reader_read_uint8(&reader);

                m->patterns[i].tracks[k][j].period     = period;
                m->patterns[i].tracks[k][j].sample     = (uint8_t)(byt3 >> 4);
                m->patterns[i].tracks[k][j].effect      = (GmcEffect)(byt3 & 0x0f);
                m->patterns[i].tracks[k][j].effect_arg  = byt4;
            }
        }

        if (reader_eof(&reader))
            return false;
    }

    // Read sample data
    for (int i = 0; i < 15; i++) {
        if (m->samples[i].length > 0) {
            size_t len = m->samples[i].length;
            if (reader.pos + len > reader.size)
                return false;

            m->samples[i].data = (int8_t*)malloc(len);
            if (!m->samples[i].data)
                return false;

            memcpy(m->samples[i].data, reader.data + reader.pos, len);
            reader.pos += len;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing — gmc_render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t gmc_render(GmcModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0)
        return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        // Accumulate ticks
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            play_tick(module);
        }

        float left  = 0.0f;
        float right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            GmcMixChannel* c = &module->channels[ch];

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr)
                continue;

            // Calculate step from period
            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            // Get current integer position
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Read sample
            float sample = 0.0f;
            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            // Apply volume (0-64 -> 0.0-1.0)
            sample *= (float)c->volume / 64.0f;

            // Amiga panning: channels 0,3 -> left; channels 1,2 -> right
            if (ch == 0 || ch == 3)
                left += sample;
            else
                right += sample;

            // Advance position
            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Handle loop / end
            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
                        c->sample_offset = c->loop_start;
                        c->sample_length = c->loop_start + c->loop_length;

                        if (new_pos >= c->sample_length && c->loop_length > 0) {
                            uint32_t loop_offset = (new_pos - c->loop_start) % c->loop_length;
                            new_pos = c->loop_start + loop_offset;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                }
                else {
                    c->active = false;
                }
            }
        }

        // Scale output
        *out++ = left * 0.5f;
        *out++ = right * 0.5f;
        frames_written++;
    }

    return frames_written;
}

size_t gmc_render_multi(GmcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0)
        return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            play_tick(module);
        }

        for (int ch = 0; ch < 4; ch++) {
            GmcMixChannel* c = &module->channels[ch];
            float sample = 0.0f;

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f;
                continue;
            }

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            sample *= (float)c->volume / 64.0f;

            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
                        c->sample_offset = c->loop_start;
                        c->sample_length = c->loop_start + c->loop_length;

                        if (new_pos >= c->sample_length && c->loop_length > 0) {
                            uint32_t loop_offset = (new_pos - c->loop_start) % c->loop_length;
                            new_pos = c->loop_start + loop_offset;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                }
                else {
                    c->active = false;
                }
            }
        }

        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

GmcModule* gmc_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 444)
        return nullptr;

    GmcModule* m = (GmcModule*)calloc(1, sizeof(GmcModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }

    if (!load_module(m, data, size)) {
        gmc_destroy(m);
        return nullptr;
    }

    // CIA timing: 50 Hz tick rate (PAL)
    m->ticks_per_frame = sample_rate / 50.0f;

    initialize_sound(m, 0);

    return m;
}

void gmc_destroy(GmcModule* module) {
    if (!module) return;

    for (int i = 0; i < 15; i++)
        free(module->samples[i].data);

    free(module->patterns);
    free(module->position_list);

    if (module->original_data) free(module->original_data);
    free(module);
}

int gmc_subsong_count(const GmcModule* module) {
    if (!module) return 0;
    return 1;
}

bool gmc_select_subsong(GmcModule* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    initialize_sound(module, 0);
    return true;
}

int gmc_channel_count(const GmcModule* module) {
    (void)module;
    return 4;
}

void gmc_set_channel_mask(GmcModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool gmc_has_ended(const GmcModule* module) {
    if (!module) return true;
    return module->end_reached;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int gmc_get_instrument_count(const GmcModule* module) {
    return module ? 15 : 0;
}

int gmc_get_num_patterns(const GmcModule* module) {
    return module ? module->num_patterns : 0;
}

void gmc_get_cell(const GmcModule* module, int pattern, int row, int channel,
                  uint16_t* period, uint8_t* sample, uint8_t* effect, uint8_t* effect_arg) {
    if (!module || pattern < 0 || pattern >= module->num_patterns ||
        row < 0 || row >= 64 || channel < 0 || channel >= 4 || !module->patterns) {
        if (period) *period = 0; if (sample) *sample = 0;
        if (effect) *effect = 0; if (effect_arg) *effect_arg = 0;
        return;
    }
    const GmcTrackLine* tl = &module->patterns[pattern].tracks[channel][row];
    if (period)     *period     = tl->period;
    if (sample)     *sample     = tl->sample;
    if (effect)     *effect     = (uint8_t)tl->effect;
    if (effect_arg) *effect_arg = tl->effect_arg;
}

void gmc_set_cell(GmcModule* module, int pattern, int row, int channel,
                  uint16_t period, uint8_t sample, uint8_t effect, uint8_t effect_arg) {
    if (!module || pattern < 0 || pattern >= module->num_patterns ||
        row < 0 || row >= 64 || channel < 0 || channel >= 4 || !module->patterns) return;
    GmcTrackLine* tl = &module->patterns[pattern].tracks[channel][row];
    tl->period     = period;
    tl->sample     = sample;
    tl->effect     = (GmcEffect)effect;
    tl->effect_arg = effect_arg;
}

float gmc_get_instrument_param(const GmcModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= 15 || !param) return -1.0f;
    const GmcSample* s = &module->samples[inst];

    if (strcmp(param, "length") == 0)      return (float)s->length;
    if (strcmp(param, "loopStart") == 0)   return (float)s->loop_start;
    if (strcmp(param, "loopLength") == 0)  return (float)s->loop_length;
    if (strcmp(param, "volume") == 0)      return (float)s->volume;

    return -1.0f;
}

void gmc_set_instrument_param(GmcModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= 15 || !param) return;
    GmcSample* s = &module->samples[inst];
    uint16_t v = (uint16_t)value;

    if (strcmp(param, "length") == 0)      { s->length = v; return; }
    if (strcmp(param, "loopStart") == 0)   { s->loop_start = v; return; }
    if (strcmp(param, "loopLength") == 0)  { s->loop_length = v; return; }
    if (strcmp(param, "volume") == 0)      { s->volume = v; return; }
}

size_t gmc_export(const GmcModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
