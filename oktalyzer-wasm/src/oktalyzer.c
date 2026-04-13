// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "oktalyzer.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

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

static const int16_t okt_periods[36] = {
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113

};

// Panning: 0=left, 1=right
// L L R R R R L L
static const uint8_t okt_pan_pos[8] = { 0, 0, 1, 1, 1, 1, 0, 0 };

static const int8_t okt_arp10[16] = {
    0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0

};

static const int8_t okt_arp12[16] = {
    0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct OktPatternLine {
    uint8_t note;
    uint8_t sample_num;
    uint8_t effect;
    uint8_t effect_arg;
} OktPatternLine;

typedef struct OktPattern {
    int16_t line_num;
    OktPatternLine* lines;    // [line_num * chan_num]
} OktPattern;

typedef struct OktSample {
    uint32_t length;
    uint16_t repeat_start;
    uint16_t repeat_length;
    uint16_t volume;
    uint16_t mode;          // 0 = 8-bit (7-bit), 1 = 4-channel, 2 = B (7-bit)
    int8_t* sample_data;
} OktSample;

typedef struct OktChannelInfo {
    uint8_t curr_note;
    int16_t curr_period;
    uint32_t release_start;
    uint32_t release_length;
} OktChannelInfo;

// Mix channel state (IChannel equivalent)
typedef struct OktMixChannel {
    bool active;
    bool muted;
    int8_t* sample_data;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t volume;       // 0-64 (Amiga range)
    uint32_t period;
    uint64_t position_fp;
    uint16_t panning;      // 0=left, 1=right
} OktMixChannel;

struct OktModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    uint32_t samp_num;
    uint16_t patt_num;
    uint16_t song_length;
    uint16_t chan_num;
    uint16_t start_speed;

    bool channel_flags[4];
    uint8_t pattern_table[128];
    OktSample* samples;
    OktPattern* patterns;

    uint8_t chan_index[8];

    // Playing info
    uint16_t current_speed;
    uint16_t speed_counter;
    int16_t song_pos;
    int16_t new_song_pos;
    int16_t patt_pos;
    bool filter_status;

    OktPatternLine curr_line[8];
    OktChannelInfo chan_info[8];
    int8_t chan_vol[8];

    OktMixChannel mix_channels[8];

    bool has_ended;
    bool end_reached;

    // Position visited tracking
    uint8_t visited[128];

    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct OktReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} OktReader;

static void reader_init(OktReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const OktReader* r) {
    return r->pos > r->size;
}

static void reader_skip(OktReader* r, size_t n) {
    r->pos += n;
}

static void reader_seek(OktReader* r, size_t pos) {
    r->pos = pos;
}

static void reader_seek_end(OktReader* r) {
    r->pos = r->size;
}

static uint8_t reader_read_uint8(OktReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_read_int8(OktReader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(OktReader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t reader_read_b_uint32(OktReader* r) {
    uint8_t b0 = reader_read_uint8(r);
    uint8_t b1 = reader_read_uint8(r);
    uint8_t b2 = reader_read_uint8(r);
    uint8_t b3 = reader_read_uint8(r);
    return (uint32_t)((b0 << 24) | (b1 << 16) | (b2 << 8) | b3);
}

static void reader_read_bytes(OktReader* r, uint8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_uint8(r);
}

static void reader_read_signed(OktReader* r, int8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_int8(r);
}

static void reader_read_mark(OktReader* r, char* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = (char)reader_read_uint8(r);
    out[count] = '\0';
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mix channel operations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void mix_play_sample(OktMixChannel* mc, int8_t* addr, uint32_t offset, uint32_t length) {
    mc->sample_data = addr + offset;
    mc->sample_length = length;
    mc->loop_start = 0;
    mc->loop_length = 0;
    mc->position_fp = 0;
    mc->active = true;
}

static void mix_set_loop(OktMixChannel* mc, uint32_t start, uint32_t length) {
    mc->loop_start = start;
    mc->loop_length = length;
}

static void mix_set_sample(OktMixChannel* mc, uint32_t start, uint32_t length) {
    // SetSample: play the sample starting from start offset with given length
    // when current sample stops or loops. No retrigger.
    mc->sample_data = mc->sample_data;  // keep current sample_data pointer base
    mc->loop_start = start;
    mc->loop_length = length;
    // This actually sets the new region to play after current one ends
    // In practice, we switch to this data when the loop point is hit
    mc->sample_length = start + length;
}

static void mix_set_amiga_volume(OktMixChannel* mc, uint16_t vol) {
    mc->volume = vol;
}

static void mix_set_amiga_period(OktMixChannel* mc, uint32_t period) {
    mc->period = period;
}

static void mix_set_panning(OktMixChannel* mc, uint16_t pan) {
    mc->panning = pan;
}

// Note: Oktalyzer C# source does not call channel.Mute() anywhere,
// but we keep mix_mute for potential future use via channel mask.
static void mix_mute(OktMixChannel* mc) __attribute__((unused));
static void mix_mute(OktMixChannel* mc) {
    mc->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Position visited tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(OktModule* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static void mark_position_visited(OktModule* m, int16_t pos) {
    if (pos >= 0 && pos < 128)
        m->visited[pos] = 1;
}

static bool has_position_been_visited(OktModule* m, int16_t pos) {
    if (pos >= 0 && pos < 128)
        return m->visited[pos] != 0;
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 7-bit to 8-bit conversion
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void convert_7bit_to_8bit(int8_t* data, size_t length) {
    for (int i = (int)length - 1; i >= 0; i--)
        data[i] *= 2;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayNote helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_note(OktModule* m, uint32_t channel_num, OktChannelInfo* chan_data, int8_t note) {
    // Check for out of bounds
    if (note < 0)
        note = 0;

    if (note > 35)
        note = 35;

    // Play the note
    chan_data->curr_period = okt_periods[note];
    mix_set_amiga_period(&m->mix_channels[channel_num], (uint32_t)chan_data->curr_period);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayChannel — parse pattern data for one channel
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_channel(OktModule* m, uint32_t channel_num) {
    // Get the pattern and channel data
    OktPatternLine* patt_data = &m->curr_line[channel_num];
    OktChannelInfo* chan_data = &m->chan_info[channel_num];

    // If we shouldn't play any note, well just return
    if (patt_data->note == 0)
        return;

    // Get the note number
    uint8_t note = (uint8_t)(patt_data->note - 1);

    // Does the instrument have a sample attached?
    OktSample* samp = &m->samples[patt_data->sample_num];
    if ((samp->sample_data == nullptr) || (samp->length == 0))
        return;

    // Well, find out if we are playing in a mixed or normal channel
    if (m->channel_flags[m->chan_index[channel_num]]) {
        // Mixed
        //
        // If the sample is mode "4", it won't be played
        if (samp->mode == 1)
            return;

        // Just play the sample. Samples doesn't loop in mixed channels
        mix_play_sample(&m->mix_channels[channel_num], samp->sample_data, 0, samp->length);

        chan_data->release_start = 0;
        chan_data->release_length = 0;
    }
    else {
        // Normal
        //
        // If the sample is mode "8", it won't be played
        if (samp->mode == 0)
            return;

        // Set the channel volume
        m->chan_vol[m->chan_index[channel_num]] = (int8_t)samp->volume;

        // Does the sample loop?
        if (samp->repeat_length == 0) {
            // No
            mix_play_sample(&m->mix_channels[channel_num], samp->sample_data, 0, samp->length);

            chan_data->release_start = 0;
            chan_data->release_length = 0;
        }
        else {
            // Yes
            mix_play_sample(&m->mix_channels[channel_num], samp->sample_data, 0, (uint32_t)samp->repeat_start + samp->repeat_length);
            mix_set_loop(&m->mix_channels[channel_num], samp->repeat_start, samp->repeat_length);

            chan_data->release_start = (uint32_t)samp->repeat_start + samp->repeat_length;
            chan_data->release_length = samp->length - chan_data->release_start;
        }
    }

    // Find the period
    chan_data->curr_note = note;
    chan_data->curr_period = okt_periods[note];

    mix_set_amiga_period(&m->mix_channels[channel_num], (uint32_t)chan_data->curr_period);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoChannelEffect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_channel_effect(OktModule* m, uint32_t channel_num) {
    // Get the pattern and channel data
    OktPatternLine* patt_data = &m->curr_line[channel_num];
    OktChannelInfo* chan_data = &m->chan_info[channel_num];

    switch (patt_data->effect) {
        // Effect '1': Portamento down
        case 1: {
            chan_data->curr_period -= patt_data->effect_arg;
            if (chan_data->curr_period < 113)
                chan_data->curr_period = 113;

            mix_set_amiga_period(&m->mix_channels[channel_num], (uint32_t)chan_data->curr_period);
            break;
        }

        // Effect '2': Portamento up
        case 2: {
            chan_data->curr_period += patt_data->effect_arg;
            if (chan_data->curr_period > 856)
                chan_data->curr_period = 856;

            mix_set_amiga_period(&m->mix_channels[channel_num], (uint32_t)chan_data->curr_period);
            break;
        }

        // Effect 'A': Arpeggio type 1
        case 10: {
            int8_t work_note = (int8_t)chan_data->curr_note;
            int8_t arp_num = okt_arp10[m->speed_counter];

            switch (arp_num) {
                // Note - upper 4 bits
                case 0:
                    work_note -= (int8_t)((patt_data->effect_arg & 0xf0) >> 4);
                    break;

                // Note
                case 1:
                    break;

                // Note + lower 4 bits
                case 2:
                    work_note += (int8_t)(patt_data->effect_arg & 0x0f);
                    break;
            }

            play_note(m, channel_num, chan_data, work_note);
            break;
        }

        // Effect 'B': Arpeggio type 2
        case 11: {
            int8_t work_note = (int8_t)chan_data->curr_note;

            switch (m->speed_counter & 0x3) {
                // Note
                case 0:
                case 2:
                    break;

                // Note + lower 4 bits
                case 1:
                    work_note += (int8_t)(patt_data->effect_arg & 0x0f);
                    break;

                // Note - upper 4 bits
                case 3:
                    work_note -= (int8_t)((patt_data->effect_arg & 0xf0) >> 4);
                    break;
            }

            play_note(m, channel_num, chan_data, work_note);
            break;
        }

        // Effect 'C': Arpeggio type 3
        case 12: {
            int8_t work_note = (int8_t)chan_data->curr_note;
            int8_t arp_num = okt_arp12[m->speed_counter];

            if (arp_num == 0)
                break;

            switch (arp_num) {
                // Note - upper 4 bits
                case 1:
                    work_note -= (int8_t)((patt_data->effect_arg & 0xf0) >> 4);
                    break;

                // Note + lower 4 bits
                case 2:
                    work_note += (int8_t)(patt_data->effect_arg & 0x0f);
                    break;

                // Note
                case 3:
                    break;
            }

            play_note(m, channel_num, chan_data, work_note);
            break;
        }

        // Effect 'H': Increase note once per line
        case 17: {
            if (m->speed_counter != 0)
                break;

            // fall through to case 30
            chan_data->curr_note += patt_data->effect_arg;
            play_note(m, channel_num, chan_data, (int8_t)chan_data->curr_note);
            break;
        }

        // Effect 'U': Increase note once per tick
        case 30: {
            chan_data->curr_note += patt_data->effect_arg;
            play_note(m, channel_num, chan_data, (int8_t)chan_data->curr_note);
            break;
        }

        // Effect 'L': Decrease note once per line
        case 21: {
            if (m->speed_counter != 0)
                break;

            // fall through to case 13
            chan_data->curr_note -= patt_data->effect_arg;
            play_note(m, channel_num, chan_data, (int8_t)chan_data->curr_note);
            break;
        }

        // Effect 'D': Decrease note once per tick
        case 13: {
            chan_data->curr_note -= patt_data->effect_arg;
            play_note(m, channel_num, chan_data, (int8_t)chan_data->curr_note);
            break;
        }

        // Effect 'F': Filter control
        case 15: {
            if (m->speed_counter == 0)
                m->filter_status = patt_data->effect_arg != 0;
            break;
        }

        // Effect 'P': Position jump
        case 25: {
            if (m->speed_counter == 0) {
                uint16_t new_pos = (uint16_t)(((patt_data->effect_arg & 0xf0) >> 4) * 10 + (patt_data->effect_arg & 0x0f));

                if (new_pos < m->song_length)
                    m->new_song_pos = (int16_t)new_pos;
            }
            break;
        }

        // Effect 'R': Release sample
        case 27: {
            if ((chan_data->release_start != 0) && (chan_data->release_length != 0))
                mix_set_sample(&m->mix_channels[channel_num], chan_data->release_start, chan_data->release_length);
            break;
        }

        // Effect 'S': Set speed
        case 28: {
            if ((m->speed_counter == 0) && ((patt_data->effect_arg & 0xf) != 0)) {
                m->current_speed = (uint16_t)(patt_data->effect_arg & 0xf);
            }
            break;
        }

        // Effect 'O': Volume control with retrig
        case 24: {
            m->chan_vol[m->chan_index[channel_num]] = m->chan_vol[m->chan_index[channel_num] + 4];

            // fall through to case 31
        }
        /* FALLTHROUGH */

        // Effect 'V': Volume control
        case 31: {
            int vol_index = m->chan_index[channel_num];
            uint8_t eff_arg = patt_data->effect_arg;

            if (eff_arg <= 64) {
                // Set the volume
                m->chan_vol[vol_index] = (int8_t)eff_arg;
                break;
            }

            eff_arg -= 64;
            if (eff_arg < 16) {
                // Decrease the volume for every tick
                m->chan_vol[vol_index] -= (int8_t)eff_arg;
                if (m->chan_vol[vol_index] < 0)
                    m->chan_vol[vol_index] = 0;
                break;
            }

            eff_arg -= 16;
            if (eff_arg < 16) {
                // Increase the volume for every tick
                m->chan_vol[vol_index] += (int8_t)eff_arg;
                if (m->chan_vol[vol_index] > 64)
                    m->chan_vol[vol_index] = 64;
                break;
            }

            eff_arg -= 16;
            if (eff_arg < 16) {
                // Decrease the volume for every line
                if (m->speed_counter == 0) {
                    m->chan_vol[vol_index] -= (int8_t)eff_arg;
                    if (m->chan_vol[vol_index] < 0)
                        m->chan_vol[vol_index] = 0;
                }
                break;
            }

            eff_arg -= 16;
            if (eff_arg < 16) {
                // Increase the volume for every line
                if (m->speed_counter == 0) {
                    m->chan_vol[vol_index] += (int8_t)eff_arg;
                    if (m->chan_vol[vol_index] > 64)
                        m->chan_vol[vol_index] = 64;
                }
                break;
            }
            break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SetVolumes
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_volumes(OktModule* m) {
    // Start to copy the volumes
    m->chan_vol[4] = m->chan_vol[0];
    m->chan_vol[5] = m->chan_vol[1];
    m->chan_vol[6] = m->chan_vol[2];
    m->chan_vol[7] = m->chan_vol[3];

    // Now set the volume
    for (int i = 0, j = 0; i < 4; i++, j++) {
        mix_set_amiga_volume(&m->mix_channels[j], (uint16_t)m->chan_vol[i]);

        if (m->channel_flags[i])
            mix_set_amiga_volume(&m->mix_channels[++j], (uint16_t)m->chan_vol[i]);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects(OktModule* m) {
    for (uint32_t i = 0, j = 0; i < 4; i++, j++) {
        do_channel_effect(m, j);

        if (m->channel_flags[i])
            do_channel_effect(m, ++j);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FindNextPatternLine
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void find_next_pattern_line(OktModule* m) {
    // Find the right pattern
    OktPattern* patt = &m->patterns[m->pattern_table[m->song_pos]];

    // Go to next pattern line
    m->patt_pos++;

    if ((m->patt_pos >= patt->line_num) || (m->new_song_pos != -1)) {
        // Okay, we're done with the current pattern. Find the next one
        m->patt_pos = 0;

        if (m->new_song_pos != -1) {
            m->song_pos = m->new_song_pos;
            m->new_song_pos = -1;
        }
        else
            m->song_pos++;

        if (m->song_pos == m->song_length)
            m->song_pos = 0;

        if (has_position_been_visited(m, m->song_pos))
            m->end_reached = true;

        mark_position_visited(m, m->song_pos);

        // Find the right pattern
        patt = &m->patterns[m->pattern_table[m->song_pos]];
    }

    // Copy the current line data
    for (int i = 0; i < m->chan_num; i++)
        m->curr_line[i] = patt->lines[m->patt_pos * m->chan_num + i];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayPatternLine
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_pattern_line(OktModule* m) {
    for (uint32_t i = 0, j = 0; i < 4; i++, j++) {
        play_channel(m, j);

        if (m->channel_flags[i])
            play_channel(m, ++j);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(OktModule* m) {
    // Wait until we need to play another pattern line
    m->speed_counter++;
    if (m->speed_counter >= m->current_speed) {
        // Play next pattern line
        m->speed_counter = 0;

        find_next_pattern_line(m);
        play_pattern_line(m);
    }

    // Do each frame stuff
    do_effects(m);
    set_volumes(m);

    // Have we reached the end of the module
    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
        mark_position_visited(m, m->song_pos);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(OktModule* m, int start_position) {
    memset(m->chan_info, 0, sizeof(m->chan_info));
    memset(m->curr_line, 0, sizeof(m->curr_line));

    for (int i = 0; i < 8; i++)
        m->chan_vol[i] = 64;

    m->song_pos = (int16_t)start_position;
    m->new_song_pos = -1;
    m->patt_pos = -1;
    m->current_speed = m->start_speed;
    m->speed_counter = 0;
    m->filter_status = false;

    // Build chan_index
    memset(m->chan_index, 0, sizeof(m->chan_index));

    // Set the channel panning + create the channel index
    for (int i = 0, pan_num = 0; i < m->chan_num; i++, pan_num++) {
        mix_set_panning(&m->mix_channels[i], okt_pan_pos[pan_num]);
        m->chan_index[i] = (uint8_t)(pan_num / 2);

        if (!m->channel_flags[pan_num / 2])
            pan_num++;
    }

    m->end_reached = false;
    m->has_ended = false;

    clear_visited(m);
    mark_position_visited(m, start_position);

    // Reset mix channels
    for (int i = 0; i < 8; i++) {
        m->mix_channels[i].active = false;
        m->mix_channels[i].muted = false;
        m->mix_channels[i].sample_data = nullptr;
        m->mix_channels[i].sample_length = 0;
        m->mix_channels[i].loop_start = 0;
        m->mix_channels[i].loop_length = 0;
        m->mix_channels[i].volume = 0;
        m->mix_channels[i].period = 0;
        m->mix_channels[i].position_fp = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(OktModule* m, const uint8_t* data, size_t size) {
    OktReader reader;
    reader_init(&reader, data, size);

    // Skip the mark
    reader_seek(&reader, 8);

    // Initialize variables
    m->samp_num = 0;
    m->patt_num = 0;
    m->song_length = 0;
    m->start_speed = 6;

    uint32_t read_patt = 0;
    uint32_t read_samp = 0;
    uint32_t real_used_samp_num = 0;

    // Okay, now read each chunk and parse them
    for (;;) {
        // Read the chunk name and length
        char chunk_name[5];
        reader_read_mark(&reader, chunk_name, 4);
        uint32_t chunk_size = reader_read_b_uint32(&reader);

        // Do we have any chunks left?
        if (reader_eof(&reader))
            break;

        // Find out what the chunk is and begin to parse it
        if (strcmp(chunk_name, "CMOD") == 0) {
            // Channel modes
            if (chunk_size != 8) return false;

            m->chan_num = 4;
            for (int i = 0; i < 4; i++) {
                if (reader_read_b_uint16(&reader) == 0)
                    m->channel_flags[i] = false;
                else {
                    m->channel_flags[i] = true;
                    m->chan_num++;
                }
            }
        }
        else if (strcmp(chunk_name, "SAMP") == 0) {
            // Sample information
            m->samp_num = chunk_size / 32;
            m->samples = (OktSample*)calloc(m->samp_num, sizeof(OktSample));
            if (!m->samples) return false;

            for (uint32_t i = 0; i < m->samp_num; i++) {
                OktSample* samp = &m->samples[i];

                // Sample name (20 bytes)
                reader_skip(&reader, 20);

                // Other information
                samp->length = reader_read_b_uint32(&reader);
                samp->repeat_start = (uint16_t)(reader_read_b_uint16(&reader) * 2);
                samp->repeat_length = (uint16_t)(reader_read_b_uint16(&reader) * 2);

                if (samp->repeat_length <= 2) {
                    samp->repeat_start = 0;
                    samp->repeat_length = 0;
                }

                reader_skip(&reader, 1);
                samp->volume = reader_read_uint8(&reader);
                samp->mode = reader_read_b_uint16(&reader);

                if (reader_eof(&reader))
                    return false;

                if (samp->length != 0)
                    real_used_samp_num++;
            }
        }
        else if (strcmp(chunk_name, "SPEE") == 0) {
            if (chunk_size != 2) return false;
            m->start_speed = reader_read_b_uint16(&reader);
        }
        else if (strcmp(chunk_name, "SLEN") == 0) {
            if (chunk_size != 2) return false;
            m->patt_num = reader_read_b_uint16(&reader);
            m->patterns = (OktPattern*)calloc(m->patt_num, sizeof(OktPattern));
            if (!m->patterns) return false;
        }
        else if (strcmp(chunk_name, "PLEN") == 0) {
            if (chunk_size != 2) return false;
            m->song_length = reader_read_b_uint16(&reader);
        }
        else if (strcmp(chunk_name, "PATT") == 0) {
            if (chunk_size != 128) return false;
            reader_read_bytes(&reader, m->pattern_table, 128);
        }
        else if (strcmp(chunk_name, "PBOD") == 0) {
            if ((read_patt < m->patt_num) && (m->patterns != nullptr)) {
                // Parse PBOD
                OktPattern* pattern = &m->patterns[read_patt];

                pattern->line_num = (int16_t)reader_read_b_uint16(&reader);
                pattern->lines = (OktPatternLine*)calloc(pattern->line_num * m->chan_num, sizeof(OktPatternLine));
                if (!pattern->lines) return false;

                for (int i = 0; i < pattern->line_num; i++) {
                    for (int j = 0; j < m->chan_num; j++) {
                        OktPatternLine* line = &pattern->lines[i * m->chan_num + j];

                        line->note = reader_read_uint8(&reader);
                        line->sample_num = reader_read_uint8(&reader);
                        line->effect = reader_read_uint8(&reader);
                        line->effect_arg = reader_read_uint8(&reader);
                    }
                }

                if (reader_eof(&reader))
                    return false;

                read_patt++;
            }
            else {
                // Ignore the chunk
                reader_skip(&reader, chunk_size);
            }
        }
        else if (strcmp(chunk_name, "SBOD") == 0) {
            if ((read_samp < m->samp_num) && (m->samples != nullptr)) {
                // Find the next sample slot with data
                while (m->samples[read_samp].length == 0) {
                    read_samp++;
                    if (read_samp >= m->samp_num) {
                        reader_skip(&reader, chunk_size);
                        goto next_chunk;
                    }
                }

                OktSample* samp = &m->samples[read_samp];

                // Allocate memory to hold the sample data
                uint32_t alloc_len = chunk_size > samp->length ? chunk_size : samp->length;
                samp->sample_data = (int8_t*)calloc(alloc_len, sizeof(int8_t));
                if (!samp->sample_data) return false;

                reader_read_signed(&reader, samp->sample_data, chunk_size);

                if ((samp->mode == 0) || (samp->mode == 2))
                    convert_7bit_to_8bit(samp->sample_data, alloc_len);

                read_samp++;
            }
            else {
                reader_skip(&reader, chunk_size);
            }
        }
        else {
            // Unknown chunk
            if ((read_samp == 0) || (read_samp < real_used_samp_num))
                return false;
            else
                reader_seek_end(&reader);
        }

        next_chunk:;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render — stereo interleaved output
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t okt_render(OktModule* module, float* interleaved_stereo, size_t frames) {
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

        float left = 0.0f;
        float right = 0.0f;

        for (int ch = 0; ch < module->chan_num; ch++) {
            OktMixChannel* c = &module->mix_channels[ch];

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

            // Apply volume (0-64 → 0.0-1.0)
            sample *= (float)c->volume / 64.0f;

            // Panning: 0=left, 1=right
            if (c->panning == 0)
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

        // Scale output (0.5f per 4 channels nominal — scale based on actual channel count)
        float scale = 0.5f;
        *out++ = left * scale;
        *out++ = right * scale;
        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render multi — per-channel mono output (up to 8 channels)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t okt_render_multi(OktModule* module,
    float* ch0, float* ch1, float* ch2, float* ch3,
    float* ch4, float* ch5, float* ch6, float* ch7,
    size_t frames)
{
    if (!module || frames == 0)
        return 0;

    float* ch_out[8] = { ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        // Accumulate ticks
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            play_tick(module);
        }

        for (int ch = 0; ch < module->chan_num; ch++) {
            OktMixChannel* c = &module->mix_channels[ch];
            float sample = 0.0f;

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f;
                continue;
            }

            // Calculate step from period
            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            // Get current integer position
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Read sample
            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            // Apply volume (0-64 → 0.0-1.0)
            sample *= (float)c->volume / 64.0f;

            // Write to per-channel buffer
            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            // Advance position
            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Handle loop / end
            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
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

        // Zero out unused channel outputs
        for (int ch = module->chan_num; ch < 8; ch++) {
            if (ch_out[ch]) ch_out[ch][f] = 0.0f;
        }

        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

OktModule* okt_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 1368)
        return nullptr;

    // Check the mark
    if (memcmp(data, "OKTASONG", 8) != 0)
        return nullptr;

    OktModule* m = (OktModule*)calloc(1, sizeof(OktModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    m->ticks_per_frame = sample_rate / 50.0f;

    if (!load_module(m, data, size)) {
        okt_destroy(m);
        return nullptr;
    }

    initialize_sound(m, 0);

    return m;
}

void okt_destroy(OktModule* module) {
    if (!module) return;

    if (module->samples) {
        for (uint32_t i = 0; i < module->samp_num; i++)
            free(module->samples[i].sample_data);
        free(module->samples);
    }

    if (module->patterns) {
        for (uint16_t i = 0; i < module->patt_num; i++)
            free(module->patterns[i].lines);
        free(module->patterns);
    }

    if (module->original_data) free(module->original_data);
    free(module);
}

int okt_subsong_count(const OktModule* module) {
    if (!module) return 0;
    return 1;  // Oktalyzer has no sub-songs
}

bool okt_select_subsong(OktModule* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    initialize_sound(module, 0);
    return true;
}

int okt_channel_count(const OktModule* module) {
    if (!module) return 0;
    return module->chan_num;
}

void okt_set_channel_mask(OktModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < module->chan_num; i++)
        module->mix_channels[i].muted = ((mask >> i) & 1) == 0;
}

bool okt_has_ended(const OktModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int okt_get_instrument_count(const OktModule* module) {
    return module ? (int)module->samp_num : 0;
}

int okt_get_num_patterns(const OktModule* module) {
    return module ? (int)module->patt_num : 0;
}

int okt_get_pattern_rows(const OktModule* module, int pattern) {
    if (!module || pattern < 0 || pattern >= module->patt_num) return 0;
    return module->patterns[pattern].line_num;
}

int okt_get_num_positions(const OktModule* module) {
    return module ? (int)module->song_length : 0;
}

void okt_get_cell(const OktModule* module, int pattern, int row, int channel,
                   uint8_t* note, uint8_t* sample_num, uint8_t* effect, uint8_t* effect_arg) {
    if (!module || pattern < 0 || pattern >= module->patt_num ||
        channel < 0 || channel >= module->chan_num) {
        if (note) *note = 0; if (sample_num) *sample_num = 0;
        if (effect) *effect = 0; if (effect_arg) *effect_arg = 0;
        return;
    }
    const OktPattern* pat = &module->patterns[pattern];
    if (row < 0 || row >= pat->line_num) {
        if (note) *note = 0; if (sample_num) *sample_num = 0;
        if (effect) *effect = 0; if (effect_arg) *effect_arg = 0;
        return;
    }
    const OktPatternLine* line = &pat->lines[row * module->chan_num + channel];
    if (note) *note = line->note;
    if (sample_num) *sample_num = line->sample_num;
    if (effect) *effect = line->effect;
    if (effect_arg) *effect_arg = line->effect_arg;
}

void okt_set_cell(OktModule* module, int pattern, int row, int channel,
                   uint8_t note, uint8_t sample_num, uint8_t effect, uint8_t effect_arg) {
    if (!module || pattern < 0 || pattern >= module->patt_num ||
        channel < 0 || channel >= module->chan_num) return;
    OktPattern* pat = &module->patterns[pattern];
    if (row < 0 || row >= pat->line_num) return;
    OktPatternLine* line = &pat->lines[row * module->chan_num + channel];
    line->note = note;
    line->sample_num = sample_num;
    line->effect = effect;
    line->effect_arg = effect_arg;
}

float okt_get_instrument_param(const OktModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= (int)module->samp_num || !param) return -1.0f;
    const OktSample* s = &module->samples[inst];

    if (strcmp(param, "length") == 0)        return (float)s->length;
    if (strcmp(param, "repeatStart") == 0)    return (float)s->repeat_start;
    if (strcmp(param, "repeatLength") == 0)   return (float)s->repeat_length;
    if (strcmp(param, "volume") == 0)         return (float)s->volume;
    if (strcmp(param, "mode") == 0)           return (float)s->mode;

    return -1.0f;
}

void okt_set_instrument_param(OktModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= (int)module->samp_num || !param) return;
    OktSample* s = &module->samples[inst];
    uint16_t v = (uint16_t)value;
    uint32_t v32 = (uint32_t)value;

    if (strcmp(param, "length") == 0)        { s->length = v32; return; }
    if (strcmp(param, "repeatStart") == 0)    { s->repeat_start = v; return; }
    if (strcmp(param, "repeatLength") == 0)   { s->repeat_length = v; return; }
    if (strcmp(param, "volume") == 0)         { s->volume = v; return; }
    if (strcmp(param, "mode") == 0)           { s->mode = v; return; }
}

size_t okt_export(const OktModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
