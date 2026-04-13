// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "soundfx.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef __cplusplus
#ifndef nullptr
#define nullptr ((void*)0)
#endif
#endif

#define SAMPLE_FRAC_BITS 16
#define AMIGA_CLOCK 3546895.0

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const short note_table[] = {
    1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076,
    1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1076, 1016,  960,  906,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
     113,  113,   -1

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SfxSample {
    int8_t* sample_addr;
    uint32_t length;
    uint16_t volume;
    uint32_t loop_start;
    uint32_t loop_length;
} SfxSample;

typedef struct SfxChannel {
    uint32_t pattern_data;
    short sample_number;
    int8_t* sample;
    uint32_t sample_len;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t current_note;
    uint16_t volume;
    short step_value;
    uint16_t step_note;
    uint16_t step_end_note;
    uint16_t slide_control;
    bool slide_direction;
    uint16_t slide_param;
    uint16_t slide_period;
    uint16_t slide_speed;

    // Mixer state
    int8_t* ch_sample_data;
    uint32_t ch_sample_length;
    uint32_t ch_loop_start;
    uint32_t ch_loop_length;
    uint16_t ch_volume;
    uint16_t ch_period;
    uint64_t position_fp;
    bool active;
    bool muted;
} SfxChannel;

typedef struct SfxGlobalPlayingInfo {
    uint16_t timer;
    uint32_t track_pos;
    uint32_t pos_counter;
    bool break_flag;
} SfxGlobalPlayingInfo;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SfxReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} SfxReader;

static void reader_init(SfxReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const SfxReader* r) {
    return r->pos > r->size;
}

static uint8_t reader_read_uint8(SfxReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static uint16_t reader_read_b_uint16(SfxReader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t reader_read_b_uint32(SfxReader* r) {
    uint16_t hi = reader_read_b_uint16(r);
    uint16_t lo = reader_read_b_uint16(r);
    return ((uint32_t)hi << 16) | lo;
}

static void reader_skip(SfxReader* r, size_t bytes) {
    r->pos += bytes;
}

static size_t reader_read(SfxReader* r, void* dst, size_t count) {
    size_t avail = 0;
    if (r->pos < r->size)
        avail = r->size - r->pos;
    if (count > avail) count = avail;
    if (count > 0) {
        memcpy(dst, r->data + r->pos, count);
        r->pos += count;
    }
    if (avail == 0 && count == 0)
        r->pos = r->size + 1;
    return count;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module struct
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define SFX_MAX_VISITED 16

struct SfxModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    SfxSample samples[31];

    uint8_t orders[128];
    uint32_t song_length;
    uint16_t delay;
    uint16_t max_pattern;

    uint32_t** patterns;  // max_pattern arrays, each 4*64 uint32s

    SfxGlobalPlayingInfo playing_info;
    SfxChannel channels[4];

    bool end_reached;
    bool has_ended;

    // Visited positions for end detection
    uint32_t visited[SFX_MAX_VISITED];

    // Mixer state
    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Visited position tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(SfxModule* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static void mark_position_as_visited(SfxModule* m, int pos) {
    if (pos >= 0 && pos < (int)(SFX_MAX_VISITED * 32))
        m->visited[pos / 32] |= (1u << (pos % 32));
}

static bool has_position_been_visited(const SfxModule* m, int pos) {
    if (pos < 0 || pos >= (int)(SFX_MAX_VISITED * 32))
        return false;
    return (m->visited[pos / 32] & (1u << (pos % 32))) != 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel emulation helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_play_sample(SfxChannel* ch, short sample_number, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    ch->ch_sample_data = sample_data;
    ch->ch_sample_length = length;
    ch->ch_loop_start = 0;
    ch->ch_loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    (void)sample_number;
}

static void ch_set_loop(SfxChannel* ch, uint32_t start_offset, uint32_t length) {
    ch->ch_loop_start = start_offset;
    ch->ch_loop_length = length;
    ch->ch_sample_length = start_offset + length;
}

static void ch_set_amiga_volume(SfxChannel* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->ch_volume = vol;
}

static void ch_set_amiga_period(SfxChannel* ch, uint16_t period) {
    ch->ch_period = period;
}

static void ch_mute(SfxChannel* ch) {
    ch->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback methods
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sfx_step_finder(SfxChannel* channel, bool step_down) {
    short step_value = (short)(channel->pattern_data & 0x0000000f);
    short end_index = (short)((channel->pattern_data & 0x000000f0) >> 4);

    if (step_down)
        step_value = (short)-step_value;
    else
        end_index = (short)-end_index;

    channel->step_note = channel->current_note;
    channel->step_value = step_value;

    // Find the period in the period table
    int note = 20;
    for (;;) {
        if (note_table[note] == -1) {
            channel->step_end_note = channel->current_note;
            return;
        }
        if (note_table[note] == channel->current_note)
            break;
        note++;
    }

    channel->step_end_note = (uint16_t)note_table[note + end_index];
}

static void sfx_arpeggio(SfxModule* m, SfxChannel* channel) {
    short index;

    switch (m->playing_info.timer) {
        case 1:
        case 5:
            index = (short)((channel->pattern_data & 0x000000f0) >> 4);
            break;
        case 2:
        case 4:
            index = (short)(channel->pattern_data & 0x0000000f);
            break;
        default:
            ch_set_amiga_period(channel, channel->current_note);
            return;
    }

    // Got the index, now find the period
    int note = 20;
    for (;;) {
        if (note_table[note] == -1)
            return;
        if (note_table[note] == channel->current_note)
            break;
        note++;
    }

    ch_set_amiga_period(channel, (uint16_t)note_table[note + index]);
}

static void sfx_make_effects(SfxModule* m, SfxChannel* channel) {
    if (channel->step_value != 0) {
        if (channel->step_value < 0) {
            channel->step_note = (uint16_t)(channel->step_note + channel->step_value);

            if (channel->step_note <= channel->step_end_note) {
                channel->step_value = 0;
                channel->step_note = channel->step_end_note;
            }
        } else {
            channel->step_note = (uint16_t)(channel->step_note + channel->step_value);

            if (channel->step_note >= channel->step_end_note) {
                channel->step_value = 0;
                channel->step_note = channel->step_end_note;
            }
        }

        channel->current_note = channel->step_note;
        ch_set_amiga_period(channel, channel->current_note);
    } else {
        if (channel->slide_speed != 0) {
            uint16_t value = (uint16_t)(channel->slide_param & 0x0f);

            if (value != 0) {
                channel->slide_control++;
                if (channel->slide_control == value) {
                    channel->slide_control = 0;
                    value = (uint16_t)((channel->slide_param << 4) << 3);

                    if (!channel->slide_direction) {
                        channel->slide_period += 8;
                        value += channel->slide_speed;

                        if (value == channel->slide_period)
                            channel->slide_direction = true;
                    } else {
                        channel->slide_period -= 8;
                        value -= channel->slide_speed;

                        if (value == channel->slide_period)
                            channel->slide_direction = false;
                    }

                    channel->current_note = channel->slide_period;
                    ch_set_amiga_period(channel, channel->slide_period);
                }
            }
        }

        // Effects
        switch ((channel->pattern_data & 0x00000f00) >> 8) {
            case 1: // Arpeggio
                sfx_arpeggio(m, channel);
                break;

            case 2: { // Pitchbend
                uint16_t new_period;

                short bend_value = (short)((channel->pattern_data & 0x000000f0) >> 4);
                if (bend_value != 0)
                    new_period = (uint16_t)(((channel->pattern_data & 0xefff0000) >> 16) + bend_value);
                else {
                    bend_value = (short)(channel->pattern_data & 0x0000000f);
                    if (bend_value != 0)
                        new_period = (uint16_t)(((channel->pattern_data & 0xefff0000) >> 16) - bend_value);
                    else
                        break;
                }

                ch_set_amiga_period(channel, new_period);

                channel->pattern_data = (channel->pattern_data & 0x1000ffff) | ((uint32_t)new_period << 16);
                break;
            }

            case 3: // LedOn (filter off!)
                break;

            case 4: // LedOff (filter on!)
                break;

            case 7: // SetStepUp
                sfx_step_finder(channel, false);
                break;

            case 8: // SetStepDown
                sfx_step_finder(channel, true);
                break;

            case 9: // Auto slide
                channel->slide_speed = channel->slide_period = channel->current_note;
                channel->slide_param = (uint16_t)(channel->pattern_data & 0x000000ff);
                channel->slide_direction = false;
                channel->slide_control = 0;
                break;
        }
    }
}

static void sfx_play_note(SfxModule* m, SfxChannel* channel, uint32_t pattern_data) {
    channel->pattern_data = pattern_data;

    // If there is a PIC command, don't parse the pattern data
    if ((pattern_data & 0xffff0000) != 0xfffd0000) {
        // Get the sample number
        uint8_t sample_num = (uint8_t)((pattern_data & 0x0000f000) >> 12);
        if ((pattern_data & 0x10000000) != 0)
            sample_num += 16;

        if (sample_num != 0) {
            SfxSample* cur_sample = &m->samples[sample_num - 1];

            channel->sample_number = (short)(sample_num - 1);
            channel->sample = cur_sample->sample_addr;
            channel->sample_len = cur_sample->length;
            channel->volume = cur_sample->volume;
            channel->loop_start = cur_sample->loop_start;
            channel->loop_length = cur_sample->loop_length;

            short volume = (short)channel->volume;

            switch ((pattern_data & 0x00000f00) >> 8) {
                case 5: // Change volume up
                    volume += (short)(pattern_data & 0x000000ff);
                    if (volume > 64) volume = 64;
                    break;
                case 6: // Change volume down
                    volume -= (short)(pattern_data & 0x000000ff);
                    if (volume < 0) volume = 0;
                    break;
            }

            ch_set_amiga_volume(channel, (uint16_t)volume);
        }
    }

    // PIC command?
    if ((pattern_data & 0xffff0000) == 0xfffd0000) {
        channel->pattern_data &= 0xffff0000;
        return;
    }

    if ((pattern_data & 0xffff0000) == 0)
        return;

    // Stop sliding and stepping
    channel->slide_speed = 0;
    channel->step_value = 0;

    // Get the period
    channel->current_note = (uint16_t)(((pattern_data & 0xffff0000) >> 16) & 0xefff);

    // STP command?
    if ((pattern_data & 0xffff0000) == 0xfffe0000) {
        ch_mute(channel);
        return;
    }

    // BRK command?
    if ((pattern_data & 0xffff0000) == 0xfffc0000) {
        m->playing_info.break_flag = true;
        channel->pattern_data &= 0xefffffff;
        return;
    }

    // ??? command?
    if ((pattern_data & 0xffff0000) == 0xfffb0000) {
        channel->pattern_data &= 0xefffffff;
        return;
    }

    // Play the note
    if (channel->sample != nullptr) {
        ch_play_sample(channel, channel->sample_number, channel->sample, 0, channel->sample_len);
        ch_set_amiga_period(channel, channel->current_note);

        if (channel->loop_length > 2)
            ch_set_loop(channel, channel->loop_start, channel->loop_length);
    }
}

static void sfx_play_sound(SfxModule* m) {
    uint32_t* pattern_adr = m->patterns[m->orders[m->playing_info.track_pos]];

    sfx_play_note(m, &m->channels[0], pattern_adr[m->playing_info.pos_counter]);
    sfx_play_note(m, &m->channels[1], pattern_adr[m->playing_info.pos_counter + 1]);
    sfx_play_note(m, &m->channels[2], pattern_adr[m->playing_info.pos_counter + 2]);
    sfx_play_note(m, &m->channels[3], pattern_adr[m->playing_info.pos_counter + 3]);

    if (m->playing_info.break_flag) {
        m->playing_info.break_flag = false;
        m->playing_info.pos_counter = 4 * 63;
    }

    m->playing_info.pos_counter += 4;
    if (m->playing_info.pos_counter == 4 * 64) {
        m->playing_info.pos_counter = 0;
        m->playing_info.track_pos++;

        if (m->playing_info.track_pos == m->song_length)
            m->playing_info.track_pos = 0;

        if (has_position_been_visited(m, (int)m->playing_info.track_pos))
            m->end_reached = true;

        mark_position_as_visited(m, (int)m->playing_info.track_pos);
    }
}

static void play_tick(SfxModule* m) {
    m->playing_info.timer++;
    if (m->playing_info.timer == 6) {
        m->playing_info.timer = 0;
        sfx_play_sound(m);
    } else {
        sfx_make_effects(m, &m->channels[0]);
        sfx_make_effects(m, &m->channels[1]);
        sfx_make_effects(m, &m->channels[2]);
        sfx_make_effects(m, &m->channels[3]);
    }

    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
        mark_position_as_visited(m, (int)m->playing_info.track_pos);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(SfxModule* m, int start_position) {
    m->playing_info.timer = 0;
    m->playing_info.track_pos = (uint32_t)start_position;
    m->playing_info.pos_counter = 0;
    m->playing_info.break_flag = false;

    m->end_reached = false;
    m->has_ended = false;

    for (int i = 0; i < 4; i++) {
        SfxChannel* ch = &m->channels[i];
        ch->pattern_data = 0;
        ch->sample_number = 0;
        ch->sample = nullptr;
        ch->sample_len = 0;
        ch->loop_start = 0;
        ch->loop_length = 0;
        ch->current_note = 0;
        ch->volume = 0;
        ch->step_value = 0;
        ch->step_note = 0;
        ch->step_end_note = 0;
        ch->slide_control = 0;
        ch->slide_direction = false;
        ch->slide_param = 0;
        ch->slide_period = 0;
        ch->slide_speed = 0;

        ch->ch_sample_data = nullptr;
        ch->ch_sample_length = 0;
        ch->ch_loop_start = 0;
        ch->ch_loop_length = 0;
        ch->ch_volume = 0;
        ch->ch_period = 0;
        ch->position_fp = 0;
        ch->active = false;
        ch->muted = false;
    }

    // Calculate the frequency to play with
    // SetCiaTimerTempo(delay) => PlayingFrequency = CIA_CONSTANT / delay
    // CIA_CONSTANT = 709379.0 (PAL)
    // ticks_per_frame = sample_rate / playing_frequency
    if (m->delay > 0) {
        double playing_freq = 709379.0 / (double)m->delay;
        m->ticks_per_frame = (float)(m->sample_rate / playing_freq);
    } else {
        m->ticks_per_frame = m->sample_rate / 50.0f;
    }
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick immediately
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool sfx_load(SfxModule* m, const uint8_t* data, size_t size) {
    SfxReader reader;
    reader_init(&reader, data, size);

    // Read the sample size table
    uint32_t sample_sizes[31];
    for (int i = 0; i < 31; i++)
        sample_sizes[i] = reader_read_b_uint32(&reader);

    // Check the mark
    uint8_t mark[4];
    reader_read(&reader, mark, 4);
    if (memcmp(mark, "SO31", 4) != 0)
        return false;

    // Read the delay value
    m->delay = reader_read_b_uint16(&reader);

    // Skip the pads
    reader_skip(&reader, 14);

    // Read the sample information
    for (int i = 0; i < 31; i++) {
        SfxSample* sample = &m->samples[i];

        // Skip the name (22 bytes)
        reader_skip(&reader, 22);

        uint16_t length = (uint16_t)(reader_read_b_uint16(&reader) * 2);
        sample->volume = reader_read_b_uint16(&reader);
        uint32_t loop_start = reader_read_b_uint16(&reader);
        uint32_t loop_length = (uint32_t)(reader_read_b_uint16(&reader) * 2);

        // Sample loop fix
        if ((loop_start + loop_length) > sample_sizes[i])
            loop_length = sample_sizes[i] - loop_start;

        if ((length != 0) && (loop_start == length))
            length += (uint16_t)loop_length;

        // Adjust the sample length
        if (length > 2) {
            uint32_t min_len = loop_start + loop_length;
            if (length < min_len)
                length = (uint16_t)min_len;
        }

        // September by Allister Brimble uses a sample with 0 length, but contains some data
        if ((length == 0) && (sample_sizes[i] != 0))
            length = (uint16_t)sample_sizes[i];

        // Volume fix
        if (sample->volume > 64)
            sample->volume = 64;

        sample->length = length;
        sample->loop_start = loop_start;
        sample->loop_length = loop_length;

        if (reader_eof(&reader))
            return false;
    }

    // Read the song length
    m->song_length = reader_read_uint8(&reader);
    reader_skip(&reader, 1);

    // Read the orders
    size_t bytes_read = reader_read(&reader, m->orders, 128);
    if (bytes_read < 128)
        return false;

    reader_skip(&reader, 4);

    // Find highest pattern number
    m->max_pattern = 0;
    for (uint32_t i = 0; i < m->song_length; i++) {
        if (m->orders[i] > m->max_pattern)
            m->max_pattern = m->orders[i];
    }
    m->max_pattern++;

    // Allocate pattern array
    m->patterns = (uint32_t**)calloc(m->max_pattern, sizeof(uint32_t*));
    if (!m->patterns) return false;

    // Allocate and load patterns
    for (int i = 0; i < m->max_pattern; i++) {
        m->patterns[i] = (uint32_t*)calloc(4 * 64, sizeof(uint32_t));
        if (!m->patterns[i]) return false;

        for (int j = 0; j < 4 * 64; j++)
            m->patterns[i][j] = reader_read_b_uint32(&reader);

        if (reader_eof(&reader))
            return false;
    }

    // Read sample data
    for (int i = 0; i < 31; i++) {
        int length = (int)sample_sizes[i];
        if (length != 0) {
            m->samples[i].sample_addr = (int8_t*)malloc(length);
            if (!m->samples[i].sample_addr) return false;

            size_t read = reader_read(&reader, m->samples[i].sample_addr, length);

            // Check to see if we miss too much from the last sample
            if ((int)read < (length - 512))
                return false;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mixer — render interleaved stereo
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t sfx_render(SfxModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0)
        return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            play_tick(module);
        }

        float left = 0.0f;
        float right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            SfxChannel* c = &module->channels[ch];

            if (!c->active || c->muted || c->ch_period == 0 || c->ch_sample_data == nullptr)
                continue;

            double step = AMIGA_CLOCK / ((double)c->ch_period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            float sample = 0.0f;
            if (pos < c->ch_sample_length)
                sample = (float)c->ch_sample_data[pos] / 128.0f;

            sample *= (float)c->ch_volume / 64.0f;

            if (ch == 0 || ch == 3)
                left += sample;
            else
                right += sample;

            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            if (new_pos >= c->ch_sample_length) {
                if (c->ch_loop_length > 0) {
                    while (new_pos >= c->ch_sample_length) {
                        uint32_t overshoot = new_pos - c->ch_sample_length;
                        new_pos = c->ch_loop_start + overshoot;
                        c->ch_sample_length = c->ch_loop_start + c->ch_loop_length;

                        if (new_pos >= c->ch_sample_length && c->ch_loop_length > 0) {
                            uint32_t loop_offset = (new_pos - c->ch_loop_start) % c->ch_loop_length;
                            new_pos = c->ch_loop_start + loop_offset;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                } else {
                    c->active = false;
                }
            }
        }

        *out++ = left * 0.5f;
        *out++ = right * 0.5f;
        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mixer — render per-channel mono
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t sfx_render_multi(SfxModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            SfxChannel* c = &module->channels[ch];

            if (!c->active || c->muted || c->ch_period == 0 || c->ch_sample_data == nullptr) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f;
                continue;
            }

            double step = AMIGA_CLOCK / ((double)c->ch_period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            float sample = 0.0f;
            if (pos < c->ch_sample_length)
                sample = (float)c->ch_sample_data[pos] / 128.0f;

            sample *= (float)c->ch_volume / 64.0f;

            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            if (new_pos >= c->ch_sample_length) {
                if (c->ch_loop_length > 0) {
                    while (new_pos >= c->ch_sample_length) {
                        uint32_t overshoot = new_pos - c->ch_sample_length;
                        new_pos = c->ch_loop_start + overshoot;
                        c->ch_sample_length = c->ch_loop_start + c->ch_loop_length;

                        if (new_pos >= c->ch_sample_length && c->ch_loop_length > 0) {
                            uint32_t loop_offset = (new_pos - c->ch_loop_start) % c->ch_loop_length;
                            new_pos = c->ch_loop_start + loop_offset;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                } else {
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

SfxModule* sfx_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 144)
        return nullptr;

    SfxModule* m = (SfxModule*)calloc(1, sizeof(SfxModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }

    if (!sfx_load(m, data, size)) {
        sfx_destroy(m);
        return nullptr;
    }

    clear_visited(m);
    initialize_sound(m, 0);

    return m;
}

void sfx_destroy(SfxModule* module) {
    if (!module) return;

    if (module->patterns) {
        for (int i = 0; i < module->max_pattern; i++)
            free(module->patterns[i]);
        free(module->patterns);
    }

    for (int i = 0; i < 31; i++)
        free(module->samples[i].sample_addr);

    if (module->original_data) free(module->original_data);
    free(module);
}

int sfx_subsong_count(const SfxModule* module) {
    if (!module) return 0;
    return 1;
}

bool sfx_select_subsong(SfxModule* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    clear_visited(module);
    initialize_sound(module, 0);
    return true;
}

int sfx_channel_count(const SfxModule* module) {
    (void)module;
    return 4;
}

void sfx_set_channel_mask(SfxModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool sfx_has_ended(const SfxModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sfx_get_instrument_count(const SfxModule* module) {
    return module ? 31 : 0;
}

int sfx_get_num_patterns(const SfxModule* module) {
    return module ? (int)(module->max_pattern + 1) : 0;
}

void sfx_get_cell(const SfxModule* module, int pattern, int row, int channel,
                  uint16_t* period, uint8_t* sample, uint8_t* effect, uint8_t* effect_arg) {
    if (!module || pattern < 0 || pattern > (int)module->max_pattern ||
        row < 0 || row >= 64 || channel < 0 || channel >= 4 ||
        !module->patterns || !module->patterns[pattern]) {
        if (period) *period = 0; if (sample) *sample = 0;
        if (effect) *effect = 0; if (effect_arg) *effect_arg = 0;
        return;
    }
    uint32_t data = module->patterns[pattern][row * 4 + channel];
    // Packed format: bits 31-16 = period (bit 28 = sample hi bit), bits 15-12 = sample lo nibble,
    //                bits 11-8 = effect, bits 7-0 = effect_arg
    uint16_t per = (uint16_t)(((data & 0xEFFF0000) >> 16) & 0xEFFF);
    uint8_t  smp = (uint8_t)(((data & 0x0000F000) >> 12) | (((data & 0x10000000) != 0) ? 16 : 0));
    uint8_t  eff = (uint8_t)((data & 0x00000F00) >> 8);
    uint8_t  arg = (uint8_t)(data & 0x000000FF);

    if (period)     *period     = per;
    if (sample)     *sample     = smp;
    if (effect)     *effect     = eff;
    if (effect_arg) *effect_arg = arg;
}

void sfx_set_cell(SfxModule* module, int pattern, int row, int channel,
                  uint16_t period, uint8_t sample, uint8_t effect, uint8_t effect_arg) {
    if (!module || pattern < 0 || pattern > (int)module->max_pattern ||
        row < 0 || row >= 64 || channel < 0 || channel >= 4 ||
        !module->patterns || !module->patterns[pattern]) return;
    uint32_t data = 0;
    data |= ((uint32_t)(period & 0xEFFF)) << 16;
    if (sample >= 16) data |= 0x10000000;
    data |= ((uint32_t)(sample & 0x0F)) << 12;
    data |= ((uint32_t)(effect & 0x0F)) << 8;
    data |= (uint32_t)effect_arg;
    module->patterns[pattern][row * 4 + channel] = data;
}

float sfx_get_instrument_param(const SfxModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= 31 || !param) return -1.0f;
    const SfxSample* s = &module->samples[inst];

    if (strcmp(param, "length") == 0)      return (float)s->length;
    if (strcmp(param, "volume") == 0)      return (float)s->volume;
    if (strcmp(param, "loopStart") == 0)   return (float)s->loop_start;
    if (strcmp(param, "loopLength") == 0)  return (float)s->loop_length;

    return -1.0f;
}

void sfx_set_instrument_param(SfxModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= 31 || !param) return;
    SfxSample* s = &module->samples[inst];

    if (strcmp(param, "length") == 0)      { s->length = (uint32_t)value; return; }
    if (strcmp(param, "volume") == 0)      { s->volume = (uint16_t)value; return; }
    if (strcmp(param, "loopStart") == 0)   { s->loop_start = (uint32_t)value; return; }
    if (strcmp(param, "loopLength") == 0)  { s->loop_length = (uint32_t)value; return; }
}

size_t sfx_export(const SfxModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
