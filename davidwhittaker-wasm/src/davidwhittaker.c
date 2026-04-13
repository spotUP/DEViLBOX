// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation (David Whittaker player)
#include "davidwhittaker.h"

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
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum DwEffect {
    DW_EFFECT_END_OF_TRACK          = 0,
    DW_EFFECT_SLIDE                 = 1,
    DW_EFFECT_MUTE                  = 2,
    DW_EFFECT_WAIT_UNTIL_NEXT_ROW   = 3,
    DW_EFFECT_STOP_SONG             = 4,
    DW_EFFECT_GLOBAL_TRANSPOSE      = 5,
    DW_EFFECT_START_VIBRATO         = 6,
    DW_EFFECT_STOP_VIBRATO          = 7,
    DW_EFFECT_EFFECT8               = 8,
    DW_EFFECT_EFFECT9               = 9,
    DW_EFFECT_SET_SPEED             = 10,
    DW_EFFECT_GLOBAL_VOLUME_FADE    = 11,
    DW_EFFECT_SET_GLOBAL_VOLUME     = 12,
    DW_EFFECT_START_OR_STOP_SOUNDFX = 13,
    DW_EFFECT_STOP_SOUNDFX          = 14
} DwEffect;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t periods1[] = {
                                                           256,  242,  228,
     215,  203,  192,  181,  171,  161,  152,  144,  136

};

static const uint16_t periods2[] = {
                                                          4096, 3864, 3648,
    3444, 3252, 3068, 2896, 2732, 2580, 2436, 2300, 2168, 2048, 1932, 1824,
    1722, 1626, 1534, 1448, 1366, 1290, 1218, 1150, 1084, 1024,  966,  912,
     861,  813,  767,  724,  683,  645,  609,  575,  542,  512,  483,  456,
     430,  406,  383,  362,  341,  322,  304,  287,  271,

    // Extra periods for out-of-range arpeggio/transpose
                                                           256,  241,  228

};

static const uint16_t periods3[] = {
                                                          8192, 7728, 7296,
    6888, 6504, 6136, 5792, 5464, 5160, 4872, 4600, 4336, 4096, 3864, 3648,
    3444, 3252, 3068, 2896, 2732, 2580, 2436, 2300, 2168, 2048, 1932, 1824,
    1722, 1626, 1534, 1448, 1366, 1290, 1218, 1150, 1084, 1024,  966,  912,
     861,  813,  767,  724,  683,  645,  609,  575,  542,  512,  483,  456,
     430,  406,  383,  362,  341,  322,  304,  287,  271,  256,  241,  228,
     215,  203,  191,  181,  170,  161,  152,  143,  135

};

#define PERIODS1_COUNT (sizeof(periods1) / sizeof(periods1[0]))
#define PERIODS2_COUNT (sizeof(periods2) / sizeof(periods2[0]))
#define PERIODS3_COUNT (sizeof(periods3) / sizeof(periods3[0]))

static const uint8_t empty_track[] = { 0x80 };

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct DwSample {
    int16_t sample_number;
    int8_t* sample_data;
    uint32_t length;
    int32_t loop_start;         // -1 = no loop
    uint16_t volume;
    uint16_t fine_tune_period;
    int8_t transpose;
} DwSample;

typedef struct DwPositionList {
    uint32_t* track_offsets;
    int track_offset_count;
    uint16_t restart_position;
} DwPositionList;

typedef struct DwSongInfo {
    uint16_t speed;
    uint8_t delay_counter_speed;
    DwPositionList* position_lists;     // [number_of_channels]
} DwSongInfo;

typedef struct DwChannelInfo {
    int channel_number;

    uint32_t* position_list;
    int position_list_length;
    uint16_t current_position;
    uint16_t restart_position;

    const uint8_t* track_data;
    int track_data_length;
    int track_data_position;

    DwSample* current_sample_info;
    uint8_t note;
    int8_t transpose;

    bool enable_half_volume;

    uint16_t speed;
    uint16_t speed_counter;

    uint8_t* arpeggio_list;
    int arpeggio_list_length;
    int arpeggio_list_position;

    uint8_t* envelope_list;
    int envelope_list_length;
    int envelope_list_position;
    uint8_t envelope_speed;
    int8_t envelope_counter;

    bool slide_enabled;
    int8_t slide_speed;
    uint8_t slide_counter;
    int16_t slide_value;

    int8_t vibrato_direction;
    uint8_t vibrato_speed;
    uint8_t vibrato_value;
    uint8_t vibrato_max_value;
} DwChannelInfo;

typedef struct DwGlobalPlayingInfo {
    int8_t transpose;

    uint16_t volume_fade_speed;

    uint16_t global_volume;
    uint8_t global_volume_fade_speed;
    uint8_t global_volume_fade_counter;

    uint16_t square_change_position;
    bool square_change_direction;

    uint8_t extra_counter;

    uint8_t delay_counter_speed;
    uint16_t delay_counter;

    uint16_t speed;
} DwGlobalPlayingInfo;

// Track storage: we store tracks as a list of (offset, data, length) entries
#define MAX_TRACKS 4096

typedef struct DwTrackEntry {
    uint32_t offset;
    uint8_t* data;
    int length;
} DwTrackEntry;

// Channel mixer state (IChannel equivalent)
typedef struct DwMixerChannel {
    bool active;
    bool muted;

    int8_t* sample_data;
    uint32_t sample_length;
    uint32_t sample_offset;     // start offset

    uint32_t loop_start;
    uint32_t loop_length;
    bool has_loop;

    uint16_t volume;            // 0-64 Amiga volume
    uint32_t period;            // Amiga period

    int16_t sample_number;

    uint64_t position_fp;       // fixed-point position
} DwMixerChannel;

struct DwModule {
    // Module flags (from identification)
    bool old_player;
    bool uses_32bit_pointers;

    int start_offset;

    int sample_info_offset;
    int sample_data_offset;
    int sub_song_list_offset;
    int arpeggio_list_offset;
    int envelope_list_offset;
    int channel_volume_offset;

    int number_of_samples;
    int number_of_channels;

    // Loaded data
    DwSongInfo* song_info_list;
    int song_info_count;

    DwTrackEntry tracks[MAX_TRACKS];
    int track_count;

    uint8_t** arpeggios;
    int* arpeggio_lengths;
    int arpeggio_count;

    uint8_t** envelopes;
    int* envelope_lengths;
    int envelope_count;

    DwSample* samples;
    uint16_t* channel_volumes;

    // Feature flags (from play function analysis)
    bool enable_sample_transpose;
    bool enable_channel_transpose;
    bool enable_global_transpose;

    uint8_t new_sample_cmd;
    uint8_t new_envelope_cmd;
    uint8_t new_arpeggio_cmd;

    bool enable_arpeggio;
    bool enable_envelopes;
    bool enable_vibrato;

    bool enable_volume_fade;
    bool enable_half_volume;
    bool enable_global_volume_fade;
    bool enable_set_global_volume;

    bool enable_square_waveform;
    int square_waveform_sample_number;
    uint32_t square_waveform_sample_length;
    uint16_t square_change_min_position;
    uint16_t square_change_max_position;
    uint8_t square_change_speed;
    int8_t square_byte1;
    int8_t square_byte2;

    bool use_extra_counter;

    bool enable_delay_counter;
    bool enable_delay_multiply;
    bool enable_delay_speed;

    const uint16_t* periods;
    int periods_count;

    // Playing state
    DwGlobalPlayingInfo playing_info;
    DwChannelInfo* channels;
    DwMixerChannel* mixer_channels;

    int current_song;
    bool has_ended;
    int end_reached_count;      // counts channels that reach end

    // Render state
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;    float ticks_per_frame;
    float tick_accumulator;

    // Copy of raw module data for loading
    uint8_t* raw_data;
    size_t raw_data_size;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Big-endian reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Big-endian reader helpers (for direct buffer access if needed)
// Stream-based readers below are used for sequential loading.

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stream reader (wraps raw data + position)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct DwStream {
    const uint8_t* data;
    size_t size;
    size_t pos;
} DwStream;

static void stream_init(DwStream* s, const uint8_t* data, size_t size) {
    s->data = data;
    s->size = size;
    s->pos = 0;
}

static void stream_seek(DwStream* s, size_t offset) {
    s->pos = offset;
}

static void stream_skip(DwStream* s, size_t bytes) {
    s->pos += bytes;
}

static bool stream_eof(const DwStream* s) {
    return s->pos >= s->size;
}

static uint8_t stream_read_u8(DwStream* s) {
    if (s->pos >= s->size) return 0;
    return s->data[s->pos++];
}

static int8_t stream_read_i8(DwStream* s) {
    return (int8_t)stream_read_u8(s);
}

static uint16_t stream_read_be16(DwStream* s) {
    if (s->pos + 2 > s->size) { s->pos = s->size; return 0; }
    uint16_t val = (uint16_t)((s->data[s->pos] << 8) | s->data[s->pos + 1]);
    s->pos += 2;
    return val;
}

static int32_t stream_read_be32s(DwStream* s) {
    if (s->pos + 4 > s->size) { s->pos = s->size; return 0; }
    int32_t val = (int32_t)(((uint32_t)s->data[s->pos] << 24) |
                            ((uint32_t)s->data[s->pos + 1] << 16) |
                            ((uint32_t)s->data[s->pos + 2] << 8) |
                            (uint32_t)s->data[s->pos + 3]);
    s->pos += 4;
    return val;
}

static uint32_t stream_read_be32(DwStream* s) {
    return (uint32_t)stream_read_be32s(s);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Track dictionary helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint8_t* tracks_find(DwModule* m, uint32_t offset, int* out_length) {
    for (int i = 0; i < m->track_count; i++) {
        if (m->tracks[i].offset == offset) {
            if (out_length) *out_length = m->tracks[i].length;
            return m->tracks[i].data;
        }
    }
    if (out_length) *out_length = 0;
    return nullptr;
}

static bool tracks_add(DwModule* m, uint32_t offset, uint8_t* data, int length) {
    if (m->track_count >= MAX_TRACKS) return false;
    m->tracks[m->track_count].offset = offset;
    m->tracks[m->track_count].data = data;
    m->tracks[m->track_count].length = length;
    m->track_count++;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Identification — ExtractInfoFromInitFunction
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool extract_info_from_init_function(DwModule* m, const uint8_t* buf, int search_length) {
    int index;

    // Start to find the init function in the player
    for (index = 0; index < search_length; index += 2) {
        if ((buf[index] == 0x47) && (buf[index + 1] == 0xfa) && ((buf[index + 2] & 0xf0) == 0xf0))
            break;
    }

    if (index >= (search_length - 6))
        return false;

    m->start_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + index + 2;

    for (; index < search_length; index += 2) {
        if ((buf[index] == 0x61) && (buf[index + 1] == 0x00))
            break;
    }

    if (index >= (search_length - 8))
        return false;

    int start_of_init = index;
    int start_of_sample_init = index;

    if ((buf[index + 4] == 0x61) && (buf[index + 5] == 0x00))
        start_of_sample_init = (((int8_t)buf[index + 6] << 8) | buf[index + 7]) + index + 6;

    //
    // Extract information about samples
    //
    for (index = start_of_sample_init; index < search_length; index += 2) {
        if ((buf[index] == 0x4a) && (buf[index + 1] == 0x2b))
            break;
    }

    if (index >= (search_length - 36))
        return false;

    if (buf[index + 4] != 0x66) {
        // Maybe this is a format where the sample initializing is not in a sub-function like QBall,
        // so check for this
        for (index = start_of_init; index < search_length; index += 2) {
            if ((buf[index] == 0x41) && (buf[index + 1] == 0xeb))
                break;
        }

        if (index >= (search_length - 36))
            return false;

        m->sample_data_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + m->start_offset;
        index += 4;

        if (buf[index + 4] != 0x72)
            return false;

        m->number_of_samples = (buf[index + 5] & 0x00ff) + 1;

        for (; index < search_length - 4; index += 2) {
            if ((buf[index] == 0x41) && (buf[index + 1] == 0xeb) && (buf[index + 4] == 0xe3) && (buf[index + 5] == 0x4f))
                break;
        }

        if (index >= (search_length - 4))
            return false;

        m->channel_volume_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + m->start_offset;

        //
        // Extract sub-song information
        //
        for (index = start_of_init; index < search_length; index += 2) {
            if ((buf[index] == 0x41) && (buf[index + 1] == 0xeb) && (buf[index + 4] == 0x17))
                break;
        }

        if (index >= (search_length - 4))
            return false;

        m->sub_song_list_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + m->start_offset;

        m->uses_32bit_pointers = true;
        m->old_player = true;
    }
    else {
        m->old_player = false;

        if (buf[index + 5] == 0x00)
            index += 2;

        if ((buf[index + 6] != 0x41) || (buf[index + 7] != 0xfa))
            return false;

        m->sample_data_offset = (((int8_t)buf[index + 8] << 8) | buf[index + 9]) + index + 8;
        index += 10;

        if ((buf[index] == 0x27) && (buf[index + 1] == 0x48) && (buf[index + 4] == 0xd0) && (buf[index + 5] == 0xfc)) {
            m->sample_data_offset += ((buf[index + 6] << 8) | buf[index + 7]);
            index += 12;

            if ((buf[index] != 0xd0) || (buf[index + 1] != 0xfc))
                return false;

            m->sample_data_offset += ((buf[index + 2] << 8) | buf[index + 3]);
            index += 4;
        }

        if ((buf[index] != 0x4b) || (buf[index + 1] != 0xfa) || (buf[index + 4] != 0x72))
            return false;

        m->sample_info_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + index + 2;
        m->number_of_samples = (buf[index + 5] & 0x00ff) + 1;

        index += 8;

        for (; index < search_length - 4; index += 2) {
            if ((buf[index] == 0x37) && (buf[index + 1] == 0x7c)) {
                m->square_waveform_sample_length = (uint32_t)(((buf[index + 2] << 8) | buf[index + 3]) * 2);
                break;
            }
        }

        //
        // Extract sub-song information
        //
        for (index = start_of_init; index < search_length; index += 2) {
            if ((buf[index] == 0x41) && (buf[index + 1] == 0xfa) && (buf[index + 4] != 0x4b))
                break;
        }

        if (index >= (search_length - 4))
            return false;

        if (((buf[index + 4] != 0x12) || (buf[index + 5] != 0x30)) && ((buf[index + 4] != 0x37) || (buf[index + 5] != 0x70)))
            return false;

        m->sub_song_list_offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + index + 2;
        index += 4;

        //
        // Find out if pointers or offsets are used
        //
        for (; index < search_length; index += 2) {
            if ((buf[index] == 0x41) && (buf[index + 1] == 0xfa) && (buf[index + 4] != 0x23))
                break;
        }

        if (index >= (search_length - 8))
            return false;

        if ((buf[index + 4] == 0x20) && (buf[index + 5] == 0x70))
            m->uses_32bit_pointers = true;
        else if ((buf[index + 4] == 0x30) && (buf[index + 5] == 0x70))
            m->uses_32bit_pointers = false;
        else
            return false;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Identification — ExtractInfoFromPlayFunction
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool extract_info_from_play_function(DwModule* m, const uint8_t* buf, int search_length) {
    int index, offset;

    // Start to find the play function in the player
    for (index = 0; index < search_length; index += 2) {
        if ((buf[index] == 0x47) && (buf[index + 1] == 0xfa)) {
            if (index >= (search_length - 10))
                return false;

            if ((buf[index + 4] == 0x4a) && (buf[index + 5] == 0x2b) && (buf[index + 8] == 0x67)) {
                if ((buf[index + 10] == 0x33) && (buf[index + 11] == 0xfc))
                    continue;

                if ((buf[index + 10] == 0x17) && (buf[index + 11] == 0x7c))
                    continue;

                if ((buf[index + 10] == 0x08) && (buf[index + 11] == 0xb9))
                    continue;

                break;
            }
        }
    }

    int start_of_play = index;

    //
    // Check for delay counter
    //
    m->enable_delay_counter = false;
    m->enable_delay_multiply = false;

    for (index = start_of_play; index < start_of_play + 100; index += 2) {
        if ((buf[index] == 0x10) && (buf[index + 1] == 0x3a)) {
            m->enable_delay_counter = true;

            if ((buf[index + 6] == 0xc0) && (buf[index + 7] == 0xfc))
                m->enable_delay_multiply = true;

            break;
        }
    }

    //
    // Check for extra counter
    //
    m->use_extra_counter = false;

    for (index = start_of_play; index < start_of_play + 100; index += 2) {
        if ((buf[index] == 0x53) && (buf[index + 1] == 0x2b) && (buf[index + 4] == 0x66)) {
            if (buf[index + 6] == 0x17) {
                offset = (buf[index - 4] << 8) | buf[index - 3];
                m->use_extra_counter = buf[offset + m->start_offset] != 0;
            }
            break;
        }
    }

    //
    // Check for square waveform
    //
    m->enable_square_waveform = false;

    for (index = start_of_play; index < start_of_play + 100; index += 2) {
        if ((buf[index] == 0x20) && (buf[index + 1] == 0x7a) && (buf[index + 4] == 0x30) && (buf[index + 5] == 0x3a)) {
            m->enable_square_waveform = true;

            offset = (((int8_t)buf[index + 2] << 8) | buf[index + 3]) + index + 2;
            m->square_waveform_sample_number = (offset - m->sample_info_offset) / 12;

            if (((buf[index + 14] != 0x31) && (buf[index + 14] != 0x11)) || (buf[index + 15] != 0xbc))
                return false;

            m->square_byte1 = (int8_t)buf[index + 17];

            if (((buf[index + 20] & 0xf0) != 0x50) || (buf[index + 21] != 0x6b))
                return false;

            m->square_change_speed = (uint8_t)((buf[index + 20] & 0x0e) >> 1);

            if ((buf[index + 24] != 0x0c) || (buf[index + 25] != 0x6b))
                return false;

            m->square_change_max_position = (uint16_t)((buf[index + 26] << 8) | buf[index + 27]);

            if (((buf[index + 38] != 0x31) && (buf[index + 38] != 0x11)) || (buf[index + 39] != 0xbc))
                return false;

            m->square_byte2 = (int8_t)buf[index + 41];

            if ((buf[index + 48] != 0x0c) || (buf[index + 49] != 0x6b))
                return false;

            m->square_change_min_position = (uint16_t)((buf[index + 50] << 8) | buf[index + 51]);
            break;
        }
    }

    //
    // Get number of channels used
    //
    m->number_of_channels = 0;

    for (index = start_of_play; index < start_of_play + 200; index += 2) {
        if (buf[index] == 0x7e) {
            m->number_of_channels = buf[index + 1];
            if (m->number_of_channels == 0) {
                for (; index < start_of_play + 500; index += 2) {
                    if ((buf[index] == 0xbe) && ((buf[index + 1] == 0x7c) || (buf[index + 1] == 0x3c))) {
                        m->number_of_channels = buf[index + 3];
                        break;
                    }
                }
            }
            else
                m->number_of_channels++;

            break;
        }
    }

    if (m->number_of_channels == 0)
        return false;

    //
    // Find different parts of the player
    //
    int read_track_commands_offset, do_frame_stuff_offset;

    if (m->old_player) {
        for (index = start_of_play; index < search_length; index += 2) {
            if ((buf[index] == 0x70) && (buf[index + 1] == 0x00))
                break;
        }

        read_track_commands_offset = index;

        if (buf[index + 2] != 0x10)
            return false;

        do_frame_stuff_offset = -1;
    }
    else {
        for (index = start_of_play; index < search_length; index += 2) {
            if ((buf[index] == 0x53) && (buf[index + 1] == 0x68))
                break;
        }

        if (index >= (search_length - 16))
            return false;

        if (buf[index + 4] != 0x67)
            return false;

        read_track_commands_offset = buf[index + 5] + index + 6;

        if (buf[index + 12] != 0x66)
            return false;

        if (buf[index + 13] == 0x00)
            do_frame_stuff_offset = ((buf[index + 14] << 8) | buf[index + 15]) + index + 14;
        else
            do_frame_stuff_offset = buf[index + 13] + index + 14;
    }

    for (index = read_track_commands_offset; index < search_length; index += 2) {
        if ((buf[index] == 0x6b) && (buf[index + 1] == 0x00))
            break;
    }

    int do_commands_offset = ((buf[index + 2] << 8) | buf[index + 3]) + index + 2;

    //
    // Find period table to check which version to use
    //
    if (m->old_player) {
        m->periods = periods1;
        m->periods_count = PERIODS1_COUNT;
    }
    else {
        for (index = read_track_commands_offset; index < search_length; index += 2) {
            if ((buf[index] == 0x45) && (buf[index + 1] == 0xfa) && (buf[index + 4] == 0x32) && (buf[index + 5] == 0x2d))
                break;
        }

        if (index >= (search_length - 6))
            return false;

        offset = ((buf[index + 2] << 8) | buf[index + 3]) + index + 2;
        if (offset >= (search_length - 72 * 2))
            return false;

        if ((buf[offset] == 0x10) && (buf[offset + 1] == 0x00)) {
            m->periods = periods2;
            m->periods_count = PERIODS2_COUNT;
        }
        else if ((buf[offset] == 0x20) && (buf[offset + 1] == 0x00)) {
            m->periods = periods3;
            m->periods_count = PERIODS3_COUNT;
        }
        else
            return false;
    }

    //
    // Check for support of different transposes
    //
    for (index = read_track_commands_offset; index < search_length; index += 2) {
        if ((buf[index] == 0x6b) && (buf[index + 1] == 0x00))
            break;
    }

    if (index >= (search_length - 6))
        return false;

    m->enable_sample_transpose = false;
    if ((buf[index + 4] == 0xd0) && (buf[index + 5] == 0x2d))
        m->enable_sample_transpose = true;

    m->enable_global_transpose = false;
    m->enable_channel_transpose = false;
    if ((do_frame_stuff_offset != -1) && (buf[do_frame_stuff_offset] == 0x10) && (buf[do_frame_stuff_offset + 1] == 0x28)) {
        if ((buf[do_frame_stuff_offset + 4] == 0xd0) && (buf[do_frame_stuff_offset + 5] == 0x3a))
            m->enable_global_transpose = true;

        if ((buf[do_frame_stuff_offset + 8] == 0xd0) && (buf[do_frame_stuff_offset + 9] == 0x28))
            m->enable_channel_transpose = true;
    }

    //
    // Check different command ranges
    //
    m->enable_arpeggio = false;
    m->enable_envelopes = false;
    m->new_sample_cmd = 0;

    for (index = do_commands_offset; index < search_length - 28; index += 2) {
        if ((buf[index] == 0x4e) && ((buf[index + 1] == 0xd2) || (buf[index + 1] == 0xf3)))
            break;

        if (((buf[index] == 0xb0) && (buf[index + 1] == 0x3c)) || ((buf[index] == 0x0c) && (buf[index + 1] == 0x00))) {
            if ((buf[index + 2] == 0x00) && ((buf[index + 4] == 0x65) || (buf[index + 4] == 0x6d))) {
                if ((buf[index + 10] == 0xd0) && (buf[index + 11] == 0x40) && (buf[index + 12] == 0x45) && (buf[index + 13] == 0xfa)) {
                    if ((buf[index + 22] == 0x21) && (buf[index + 23] == 0x4a) && (buf[index + 26] == 0x21) && (buf[index + 27] == 0x4a)) {
                        m->enable_arpeggio = true;
                        m->new_arpeggio_cmd = buf[index + 3];
                        m->arpeggio_list_offset = (((int8_t)buf[index + 14] << 8) | buf[index + 15]) + index + 14;
                    }
                    else if ((buf[index + 22] == 0x21) && (buf[index + 23] == 0x4a) && (buf[index + 26] == 0x11) && (buf[index + 27] == 0x6a)) {
                        m->enable_envelopes = true;
                        m->new_envelope_cmd = buf[index + 3];
                        m->envelope_list_offset = (((int8_t)buf[index + 14] << 8) | buf[index + 15]) + index + 14;
                    }
                }
                else if ((buf[index + 10] == 0x4b) && (buf[index + 11] == 0xfa) && (buf[index + 14] == 0xc0) && (buf[index + 15] == 0xfc)) {
                    m->new_sample_cmd = buf[index + 3];
                }
            }
        }
    }

    if (!m->old_player && (m->new_sample_cmd == 0))
        return false;

    //
    // Check different effects
    //
    int jump_table_offset;

    if ((buf[index - 10] == 0x45) && (buf[index - 9] == 0xfa))
        jump_table_offset = (((int8_t)buf[index - 8] << 8) | buf[index - 7]) + index - 8;
    else if ((buf[index - 8] == 0x45) && (buf[index - 7] == 0xfa))
        jump_table_offset = (((int8_t)buf[index - 6] << 8) | buf[index - 5]) + index - 6;
    else if ((buf[index - 10] == 0x45) && (buf[index - 9] == 0xeb))
        jump_table_offset = (((int8_t)buf[index - 8] << 8) | buf[index - 7]) + m->start_offset;
    else
        return false;

    m->enable_vibrato = false;

    int effect_offset = ((buf[jump_table_offset + 6 * 2] << 8) | buf[jump_table_offset + 6 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 6)) && (buf[effect_offset] == 0x50) && (buf[effect_offset + 1] == 0xe8) && (buf[effect_offset + 4] == 0x11) && (buf[effect_offset + 5] == 0x59))
        m->enable_vibrato = true;

    m->enable_volume_fade = false;

    effect_offset = ((buf[jump_table_offset + 8 * 2] << 8) | buf[jump_table_offset + 8 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 2)) && (buf[effect_offset] == 0x17) && (buf[effect_offset + 1] == 0x59))
        m->enable_volume_fade = true;

    m->enable_half_volume = false;

    effect_offset = ((buf[jump_table_offset + 8 * 2] << 8) | buf[jump_table_offset + 8 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 2)) && (buf[effect_offset] == 0x50) && (buf[effect_offset + 1] == 0xe8)) {
        effect_offset = ((buf[jump_table_offset + 9 * 2] << 8) | buf[jump_table_offset + 9 * 2 + 1]) + m->start_offset;
        if ((effect_offset < (search_length - 2)) && (buf[effect_offset] == 0x51) && (buf[effect_offset + 1] == 0xe8))
            m->enable_half_volume = true;
    }

    m->enable_global_volume_fade = false;

    effect_offset = ((buf[jump_table_offset + 11 * 2] << 8) | buf[jump_table_offset + 11 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 2)) && (buf[effect_offset] == 0x17) && (buf[effect_offset + 1] == 0x59))
        m->enable_global_volume_fade = true;

    m->enable_delay_speed = false;

    effect_offset = ((buf[jump_table_offset + 10 * 2] << 8) | buf[jump_table_offset + 10 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 4)) && (buf[effect_offset] == 0x10) && (buf[effect_offset + 1] == 0x19) && (buf[effect_offset + 2] == 0x17) && (buf[effect_offset + 3] == 0x40))
        m->enable_delay_speed = true;

    m->enable_set_global_volume = true;

    effect_offset = ((buf[jump_table_offset + 12 * 2] << 8) | buf[jump_table_offset + 12 * 2 + 1]) + m->start_offset;
    if ((effect_offset >= 0) && (effect_offset < (search_length - 4)) && (buf[effect_offset + 2] == 0x42) && (buf[effect_offset + 3] == 0x41))
        m->enable_set_global_volume = false;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TestModule
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool test_module(DwModule* m, const uint8_t* buffer, int length) {
    // SC68 support are handled in a converter, so ignore these modules here
    if ((buffer[0] == 0x53) && (buffer[1] == 0x43) && (buffer[2] == 0x36) && (buffer[3] == 0x38))
        return false;

    if (!extract_info_from_init_function(m, buffer, length))
        return false;

    if (!extract_info_from_play_function(m, buffer, length))
        return false;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FindEffectByteCount
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int find_effect_byte_count(DwModule* m, DwEffect effect) {
    if (m->old_player) {
        // For the old player (QBall), the effect is in another order
        switch ((int)effect) {
            case 0:     // EndOfTrack
            case 1:     // StopSong
                return -1;

            case 2:     // ???
                return 1;
        }
    }
    else {
        switch (effect) {
            case DW_EFFECT_END_OF_TRACK:
            case DW_EFFECT_STOP_SONG:
                return -1;

            case DW_EFFECT_MUTE:
            case DW_EFFECT_WAIT_UNTIL_NEXT_ROW:
            case DW_EFFECT_STOP_VIBRATO:
            case DW_EFFECT_STOP_SOUNDFX:
                return 0;

            case DW_EFFECT_GLOBAL_TRANSPOSE:
            case DW_EFFECT_EFFECT8:
            case DW_EFFECT_SET_SPEED:
            case DW_EFFECT_GLOBAL_VOLUME_FADE:
            case DW_EFFECT_SET_GLOBAL_VOLUME:
                return 1;

            case DW_EFFECT_SLIDE:
            case DW_EFFECT_START_VIBRATO:
                return 2;

            case DW_EFFECT_EFFECT9:
                if (m->enable_half_volume)
                    return 0;
                return 2;

            case DW_EFFECT_START_OR_STOP_SOUNDFX:
                if (m->enable_set_global_volume)
                    return 1;
                return 0;

            default:
                break;
        }
    }

    return -1;  // Invalid
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadTrack
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint8_t* load_track(DwModule* m, DwStream* stream, uint32_t track_offset, int* out_length) {
    stream_seek(stream, (size_t)(track_offset + m->start_offset));

    // Read the track into a temp buffer
    int capacity = 1024;
    uint8_t* track_bytes = (uint8_t*)malloc(capacity);
    int count = 0;

    for (;;) {
        uint8_t byt = stream_read_u8(stream);
        if (stream_eof(stream)) {
            free(track_bytes);
            return nullptr;
        }

        if (count >= capacity) {
            capacity *= 2;
            track_bytes = (uint8_t*)realloc(track_bytes, capacity);
        }
        track_bytes[count++] = byt;

        if ((byt & 0x80) != 0) {
            if (byt >= 0xe0)
                continue;

            if (!m->old_player && (byt >= m->new_sample_cmd))
                continue;

            if (m->enable_envelopes && (byt >= m->new_envelope_cmd))
                continue;

            if (m->enable_arpeggio && (byt >= m->new_arpeggio_cmd))
                continue;

            DwEffect effect = (DwEffect)(byt & 0x7f);

            int effect_count = find_effect_byte_count(m, effect);
            if (effect_count == -1)
                break;

            for (; effect_count > 0; effect_count--) {
                if (count >= capacity) {
                    capacity *= 2;
                    track_bytes = (uint8_t*)realloc(track_bytes, capacity);
                }
                track_bytes[count++] = stream_read_u8(stream);
            }
        }
    }

    *out_length = count;
    return track_bytes;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadAndParseTrack
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_and_parse_track(DwModule* m, DwStream* stream, uint32_t track_offset,
                                  int* new_position_list_offset, int* num_arpeggios, int* num_envelopes) {
    *num_arpeggios = 0;
    *num_envelopes = 0;
    *new_position_list_offset = 0;

    int track_length = 0;
    const uint8_t* track_bytes = tracks_find(m, track_offset, &track_length);

    if (track_bytes == nullptr) {
        uint8_t* loaded = load_track(m, stream, track_offset, &track_length);
        if (loaded == nullptr)
            return false;

        tracks_add(m, track_offset, loaded, track_length);
        track_bytes = loaded;
    }

    // Parse the track to count number of arpeggios, envelopes and find restart position
    for (int idx = 0; idx < track_length; ) {
        uint8_t byt = track_bytes[idx++];

        if ((byt & 0x80) != 0) {
            if (byt >= 0xe0)
                continue;

            if (!m->old_player && (byt >= m->new_sample_cmd))
                continue;

            if (m->enable_envelopes && (byt >= m->new_envelope_cmd)) {
                int count = byt - m->new_envelope_cmd + 1;
                if (count > *num_envelopes) *num_envelopes = count;
                continue;
            }

            if (m->enable_arpeggio && (byt >= m->new_arpeggio_cmd)) {
                int count = byt - m->new_arpeggio_cmd + 1;
                if (count > *num_arpeggios) *num_arpeggios = count;
                continue;
            }

            DwEffect effect = (DwEffect)(byt & 0x7f);

            int effect_count = find_effect_byte_count(m, effect);
            if (effect_count == -1)
                break;

            idx += effect_count;

            if ((effect == DW_EFFECT_EFFECT9) && !m->enable_half_volume)
                *new_position_list_offset = (track_bytes[idx - 2] << 8) | track_bytes[idx - 1];
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadPositionList
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_position_list(DwModule* m, DwStream* stream, uint32_t start_position,
                                DwPositionList* result, int* num_arpeggios, int* num_envelopes) {
    *num_arpeggios = 0;
    *num_envelopes = 0;

    if (start_position == 0) {
        result->track_offsets = nullptr;
        result->track_offset_count = 0;
        result->restart_position = 0;
        return false;
    }

    stream_seek(stream, (size_t)(start_position + m->start_offset));

    int64_t min_position = (int64_t)start_position;
    int64_t max_position = (int64_t)start_position;

    int capacity = 256;
    uint32_t* pos_list = (uint32_t*)malloc(capacity * sizeof(uint32_t));
    int pos_count = 0;
    uint16_t restart_position = 0;

    for (;;) {
        uint32_t track_offset = m->uses_32bit_pointers ? stream_read_be32(stream) : stream_read_be16(stream);
        if ((track_offset == 0) || (track_offset >= stream->size) || ((track_offset & 0x8000) != 0))
            break;

        if (stream_eof(stream)) {
            free(pos_list);
            return false;
        }

        size_t current_position = stream->pos;

        if (pos_count >= capacity) {
            capacity *= 2;
            pos_list = (uint32_t*)realloc(pos_list, capacity * sizeof(uint32_t));
        }
        pos_list[pos_count++] = track_offset;

        int new_position_list_offset = 0;
        int arp_count = 0, env_count = 0;
        if (!load_and_parse_track(m, stream, track_offset, &new_position_list_offset, &arp_count, &env_count)) {
            free(pos_list);
            return false;
        }

        if (arp_count > *num_arpeggios) *num_arpeggios = arp_count;
        if (env_count > *num_envelopes) *num_envelopes = env_count;

        if ((new_position_list_offset != 0) && ((new_position_list_offset < min_position) || (new_position_list_offset > max_position))) {
            restart_position = (uint16_t)pos_count;
            current_position = (size_t)(new_position_list_offset + m->start_offset);
        }

        if ((int64_t)current_position < min_position) min_position = (int64_t)current_position;
        if ((int64_t)current_position > max_position) max_position = (int64_t)current_position;

        stream->pos = current_position;
    }

    result->track_offsets = pos_list;
    result->track_offset_count = pos_count;
    result->restart_position = restart_position;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadSubSongInfoAndTracks
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_sub_song_info_and_tracks(DwModule* m, DwStream* stream, int* out_num_arpeggios, int* out_num_envelopes) {
    *out_num_arpeggios = 0;
    *out_num_envelopes = 0;

    int capacity = 16;
    m->song_info_list = (DwSongInfo*)calloc(capacity, sizeof(DwSongInfo));
    m->song_info_count = 0;

    stream_seek(stream, (size_t)m->sub_song_list_offset);

    int64_t min_position_offset = INT64_MAX;

    for (;;) {
        uint16_t song_speed;
        uint8_t delay_speed;

        if ((int64_t)(stream->pos + 8) >= min_position_offset)
            break;

        if (m->enable_delay_counter) {
            song_speed = stream_read_u8(stream);
            delay_speed = stream_read_u8(stream);
        }
        else {
            song_speed = stream_read_be16(stream);
            delay_speed = 0;
        }

        if (song_speed > 255)
            break;

        if (m->song_info_count >= capacity) {
            capacity *= 2;
            m->song_info_list = (DwSongInfo*)realloc(m->song_info_list, capacity * sizeof(DwSongInfo));
        }

        DwSongInfo* song_info = &m->song_info_list[m->song_info_count];
        song_info->speed = song_speed;
        song_info->delay_counter_speed = delay_speed;
        song_info->position_lists = (DwPositionList*)calloc(m->number_of_channels, sizeof(DwPositionList));

        uint32_t* position_offsets = (uint32_t*)malloc(m->number_of_channels * sizeof(uint32_t));

        if (m->uses_32bit_pointers) {
            for (int i = 0; i < m->number_of_channels; i++) {
                position_offsets[i] = stream_read_be32(stream);
                int64_t candidate = (int64_t)(position_offsets[i] + m->start_offset);
                if (candidate < min_position_offset) min_position_offset = candidate;
            }
        }
        else {
            for (int i = 0; i < m->number_of_channels; i++) {
                position_offsets[i] = stream_read_be16(stream);
                int64_t candidate = (int64_t)(position_offsets[i] + m->start_offset);
                if (candidate < min_position_offset) min_position_offset = candidate;
            }
        }

        if (stream_eof(stream)) {
            free(position_offsets);
            free(song_info->position_lists);
            return false;
        }

        size_t saved_pos = stream->pos;

        for (int i = 0; i < m->number_of_channels; i++) {
            int arp_count = 0, env_count = 0;
            if (!load_position_list(m, stream, position_offsets[i], &song_info->position_lists[i], &arp_count, &env_count)) {
                // Position list can be empty (returns false if start_position==0), that's ok if track_offsets is null
                // but if it's a real failure... we'll continue anyway as the C# does
            }

            if (arp_count > *out_num_arpeggios) *out_num_arpeggios = arp_count;
            if (env_count > *out_num_envelopes) *out_num_envelopes = env_count;
        }

        m->song_info_count++;

        free(position_offsets);
        stream->pos = saved_pos;
    }

    return m->song_info_count > 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadArpeggios
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_arpeggios(DwModule* m, DwStream* stream, int number_of_arpeggios) {
    if (number_of_arpeggios == 0) {
        // We need at least one empty arpeggio
        m->arpeggio_count = 1;
        m->arpeggios = (uint8_t**)malloc(sizeof(uint8_t*));
        m->arpeggio_lengths = (int*)malloc(sizeof(int));
        m->arpeggios[0] = (uint8_t*)malloc(1);
        m->arpeggios[0][0] = 0x80;
        m->arpeggio_lengths[0] = 1;
        return true;
    }

    m->arpeggio_count = number_of_arpeggios;
    m->arpeggios = (uint8_t**)calloc(number_of_arpeggios, sizeof(uint8_t*));
    m->arpeggio_lengths = (int*)calloc(number_of_arpeggios, sizeof(int));

    // Read offset list
    uint16_t* offsets = (uint16_t*)malloc(number_of_arpeggios * sizeof(uint16_t));
    stream_seek(stream, (size_t)m->arpeggio_list_offset);
    for (int i = 0; i < number_of_arpeggios; i++)
        offsets[i] = stream_read_be16(stream);

    for (int i = 0; i < number_of_arpeggios; i++) {
        stream_seek(stream, (size_t)(offsets[i] + m->start_offset));

        int capacity = 64;
        uint8_t* arp_bytes = (uint8_t*)malloc(capacity);
        int count = 0;

        for (;;) {
            uint8_t arp = stream_read_u8(stream);
            if (stream_eof(stream)) {
                free(arp_bytes);
                free(offsets);
                return false;
            }

            if (count >= capacity) {
                capacity *= 2;
                arp_bytes = (uint8_t*)realloc(arp_bytes, capacity);
            }
            arp_bytes[count++] = arp;

            if ((arp & 0x80) != 0)
                break;
        }

        m->arpeggios[i] = arp_bytes;
        m->arpeggio_lengths[i] = count;
    }

    free(offsets);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadEnvelopes
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_envelopes(DwModule* m, DwStream* stream, int number_of_envelopes) {
    if (number_of_envelopes == 0) {
        m->envelope_count = 0;
        m->envelopes = nullptr;
        m->envelope_lengths = nullptr;
        return true;
    }

    m->envelope_count = number_of_envelopes;
    m->envelopes = (uint8_t**)calloc(number_of_envelopes, sizeof(uint8_t*));
    m->envelope_lengths = (int*)calloc(number_of_envelopes, sizeof(int));

    // Read offset list
    uint16_t* offsets = (uint16_t*)malloc(number_of_envelopes * sizeof(uint16_t));
    stream_seek(stream, (size_t)m->envelope_list_offset);
    for (int i = 0; i < number_of_envelopes; i++)
        offsets[i] = stream_read_be16(stream);

    for (int i = 0; i < number_of_envelopes; i++) {
        stream_seek(stream, (size_t)(offsets[i] + m->start_offset - 1));

        int capacity = 64;
        uint8_t* env_bytes = (uint8_t*)malloc(capacity);
        int count = 0;

        env_bytes[count++] = stream_read_u8(stream);       // First byte is the speed

        for (;;) {
            uint8_t env = stream_read_u8(stream);
            if (stream_eof(stream)) {
                free(env_bytes);
                free(offsets);
                return false;
            }

            if (count >= capacity) {
                capacity *= 2;
                env_bytes = (uint8_t*)realloc(env_bytes, capacity);
            }
            env_bytes[count++] = env;

            if ((env & 0x80) != 0)
                break;
        }

        m->envelopes[i] = env_bytes;
        m->envelope_lengths[i] = count;
    }

    free(offsets);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadChannelVolumes
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_channel_volumes(DwModule* m, DwStream* stream) {
    if (!m->old_player)
        return true;

    m->channel_volumes = (uint16_t*)malloc(m->number_of_channels * sizeof(uint16_t));
    stream_seek(stream, (size_t)m->channel_volume_offset);
    for (int i = 0; i < m->number_of_channels; i++)
        m->channel_volumes[i] = stream_read_be16(stream);

    return !stream_eof(stream);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadSampleInfo
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_sample_info(DwModule* m, DwStream* stream) {
    m->samples = (DwSample*)calloc(m->number_of_samples, sizeof(DwSample));

    if (m->old_player) {
        for (int i = 0; i < m->number_of_samples; i++) {
            DwSample* sample = &m->samples[i];
            sample->sample_number = (int16_t)i;
            sample->loop_start = -1;
            sample->volume = 64;
        }
    }
    else {
        stream_seek(stream, (size_t)m->sample_info_offset);

        for (int i = 0; i < m->number_of_samples; i++) {
            DwSample* sample = &m->samples[i];
            sample->sample_number = (int16_t)i;

            stream_skip(stream, 4);                         // Skip pointer to sample data
            sample->loop_start = stream_read_be32s(stream);
            sample->length = stream_read_be16(stream) * 2U;

            if (stream_eof(stream))
                return false;

            // Fix for Jaws
            if ((sample->loop_start != -1) && (sample->loop_start > 64 * 1024))
                sample->loop_start = -1;

            if (m->uses_32bit_pointers) {
                stream_skip(stream, 2);                     // Padding

                sample->fine_tune_period = stream_read_be16(stream);
                sample->volume = stream_read_be16(stream);
                sample->transpose = 0;

                if (stream_eof(stream))
                    return false;
            }
            else {
                sample->fine_tune_period = stream_read_be16(stream);

                if (!m->enable_envelopes) {
                    sample->volume = stream_read_be16(stream);
                    sample->transpose = stream_read_i8(stream);

                    if (stream_eof(stream))
                        return false;

                    stream_skip(stream, 1);                 // Padding
                }
                else {
                    sample->volume = 64;
                    sample->transpose = 0;
                }
            }
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// LoadSampleData
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_sample_data(DwModule* m, DwStream* stream) {
    stream_seek(stream, (size_t)m->sample_data_offset);

    for (int i = 0; i < m->number_of_samples; i++) {
        DwSample* sample = &m->samples[i];

        sample->length = stream_read_be32(stream);

        uint16_t frequency = stream_read_be16(stream);
        if (frequency == 0) frequency = 1;  // Avoid division by zero
        sample->fine_tune_period = (uint16_t)(3579545U / frequency);

        sample->sample_data = (int8_t*)malloc(sample->length);
        if (sample->sample_data == nullptr)
            return false;

        if (stream->pos + sample->length > stream->size) {
            return false;
        }

        memcpy(sample->sample_data, stream->data + stream->pos, sample->length);
        stream->pos += sample->length;
    }

    if (m->enable_square_waveform)
        m->samples[m->square_waveform_sample_number].length = m->square_waveform_sample_length;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeSquareWaveform
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_square_waveform(DwModule* m) {
    if (m->enable_square_waveform) {
        DwSample* sample = &m->samples[m->square_waveform_sample_number];
        int half_length = (int)sample->length / 2;

        for (int i = 0; i < half_length; i++) {
            sample->sample_data[i] = m->square_byte1;
            sample->sample_data[i + half_length] = m->square_byte2;
        }

        m->playing_info.square_change_position = m->square_change_min_position;
        m->playing_info.square_change_direction = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeChannelInfo
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_channel_info(DwModule* m, int sub_song) {
    DwSongInfo* song_info = &m->song_info_list[sub_song];

    for (int i = 0; i < m->number_of_channels; i++) {
        DwChannelInfo* ch = &m->channels[i];
        memset(ch, 0, sizeof(DwChannelInfo));

        ch->channel_number = i;

        ch->speed_counter = 1;
        ch->slide_enabled = false;
        ch->vibrato_direction = 0;
        ch->transpose = 0;
        ch->enable_half_volume = false;
        ch->envelope_list = nullptr;
        ch->envelope_list_length = 0;

        DwPositionList* pl = &song_info->position_lists[i];
        ch->position_list = pl->track_offsets;
        ch->position_list_length = pl->track_offset_count;
        ch->current_position = 1;
        ch->restart_position = pl->restart_position;

        if (m->enable_arpeggio) {
            ch->arpeggio_list = m->arpeggios[0];
            ch->arpeggio_list_length = m->arpeggio_lengths[0];
            ch->arpeggio_list_position = 0;
        }

        if (ch->position_list_length == 0) {
            ch->track_data = empty_track;
            ch->track_data_length = 1;
        }
        else {
            int track_len = 0;
            const uint8_t* td = tracks_find(m, ch->position_list[0], &track_len);
            ch->track_data = td ? td : empty_track;
            ch->track_data_length = td ? track_len : 1;
        }
        ch->track_data_position = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeSound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(DwModule* m, int sub_song) {
    DwSongInfo* song = &m->song_info_list[sub_song];

    memset(&m->playing_info, 0, sizeof(DwGlobalPlayingInfo));
    m->playing_info.transpose = 0;
    m->playing_info.speed = song->speed;
    m->playing_info.volume_fade_speed = 0;
    m->playing_info.global_volume = 64;
    m->playing_info.global_volume_fade_speed = 0;
    m->playing_info.extra_counter = 1;
    m->playing_info.delay_counter = 0;
    m->playing_info.delay_counter_speed = song->delay_counter_speed;

    if (m->enable_delay_multiply)
        m->playing_info.delay_counter_speed *= 16;

    if (m->channels == nullptr)
        m->channels = (DwChannelInfo*)calloc(m->number_of_channels, sizeof(DwChannelInfo));

    initialize_channel_info(m, sub_song);
    initialize_square_waveform(m);

    m->has_ended = false;
    m->end_reached_count = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mixer channel helpers (IChannel equivalent)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void mixer_play_sample(DwMixerChannel* mc, int16_t sample_number, int8_t* sample_data,
                               uint32_t start_offset, uint32_t length) {
    mc->sample_number = sample_number;
    mc->sample_data = sample_data;
    mc->sample_offset = start_offset;
    mc->sample_length = start_offset + length;
    mc->has_loop = false;
    mc->loop_start = 0;
    mc->loop_length = 0;
    mc->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    mc->active = true;
}

static void mixer_set_loop(DwMixerChannel* mc, uint32_t start_offset, uint32_t length) {
    mc->has_loop = true;
    mc->loop_start = start_offset;
    mc->loop_length = length;
}

static void mixer_set_amiga_volume(DwMixerChannel* mc, uint16_t vol) {
    if (vol > 64) vol = 64;
    mc->volume = vol;
}

static void mixer_set_amiga_period(DwMixerChannel* mc, uint32_t period) {
    mc->period = period;
}

static void mixer_mute(DwMixerChannel* mc) {
    mc->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations for play routines
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void handle_end_of_track_effect(DwModule* m, DwChannelInfo* ch);
static bool do_effects(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc, DwEffect effect);
static bool do_track_command(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc, uint8_t track_command);
static void read_track_commands(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc);
static void do_frame_stuff(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc);
static void change_square_waveform(DwModule* m);
static void stop_module(DwModule* m);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ChangeSquareWaveform
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void change_square_waveform(DwModule* m) {
    if (m->enable_square_waveform) {
        int8_t* square_waveform = m->samples[m->square_waveform_sample_number].sample_data;

        if (m->playing_info.square_change_direction) {
            for (int i = 0; i < m->square_change_speed; i++)
                square_waveform[m->playing_info.square_change_position + i] = m->square_byte2;

            m->playing_info.square_change_position -= m->square_change_speed;

            if (m->playing_info.square_change_position == m->square_change_min_position)
                m->playing_info.square_change_direction = false;
        }
        else {
            for (int i = 0; i < m->square_change_speed; i++)
                square_waveform[m->playing_info.square_change_position + i] = m->square_byte1;

            m->playing_info.square_change_position += m->square_change_speed;

            if (m->playing_info.square_change_position == m->square_change_max_position)
                m->playing_info.square_change_direction = true;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// HandleEndOfTrackEffect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void handle_end_of_track_effect(DwModule* m, DwChannelInfo* ch) {
    // Move to next position
    if (ch->current_position >= ch->position_list_length) {
        ch->current_position = (uint16_t)(ch->restart_position + 1);

        // OnEndReached per channel
        m->end_reached_count++;
        if (m->end_reached_count >= m->number_of_channels) {
            m->has_ended = true;

            m->playing_info.transpose = 0;
            m->playing_info.volume_fade_speed = 0;
            m->playing_info.global_volume_fade_speed = 0;

            if (m->playing_info.global_volume == 0)
                m->playing_info.global_volume = 64;
        }
    }
    else {
        ch->current_position++;
    }

    if (ch->position_list_length == 0) {
        ch->track_data = empty_track;
        ch->track_data_length = 1;
    }
    else {
        int track_len = 0;
        const uint8_t* td = tracks_find(m, ch->position_list[ch->current_position - 1], &track_len);
        ch->track_data = td ? td : empty_track;
        ch->track_data_length = td ? track_len : 1;
    }
    ch->track_data_position = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool do_effects(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc, DwEffect effect) {
    if (m->old_player) {
        // For the old player (QBall), the effect is in another order
        switch ((int)effect) {
            case 0:     // EndOfTrack
                handle_end_of_track_effect(m, ch);
                break;

            case 1:     // StopSong
                stop_module(m);
                return true;

            case 2:     // ???
                break;
        }
    }
    else {
        switch (effect) {
            case DW_EFFECT_END_OF_TRACK:
                handle_end_of_track_effect(m, ch);
                break;

            case DW_EFFECT_SLIDE:
                ch->slide_value = 0;
                ch->slide_speed = (int8_t)ch->track_data[ch->track_data_position++];
                ch->slide_counter = ch->track_data[ch->track_data_position++];
                ch->slide_enabled = true;
                break;

            case DW_EFFECT_MUTE:
                mixer_mute(mc);
                return true;

            case DW_EFFECT_WAIT_UNTIL_NEXT_ROW:
                return true;

            case DW_EFFECT_STOP_SONG:
                stop_module(m);
                return true;

            case DW_EFFECT_GLOBAL_TRANSPOSE:
                if (m->enable_global_transpose)
                    m->playing_info.transpose = (int8_t)ch->track_data[ch->track_data_position++];
                break;

            case DW_EFFECT_START_VIBRATO:
                if (m->enable_vibrato) {
                    ch->vibrato_direction = -1;
                    ch->vibrato_speed = ch->track_data[ch->track_data_position++];
                    ch->vibrato_max_value = ch->track_data[ch->track_data_position++];
                    ch->vibrato_value = 0;
                }
                break;

            case DW_EFFECT_STOP_VIBRATO:
                if (m->enable_vibrato)
                    ch->vibrato_direction = 0;
                break;

            case DW_EFFECT_EFFECT8:
                if (m->enable_volume_fade)
                    m->playing_info.volume_fade_speed = ch->track_data[ch->track_data_position++];
                else if (m->enable_channel_transpose)
                    ch->transpose = (int8_t)ch->track_data[ch->track_data_position++];
                else if (m->enable_half_volume)
                    ch->enable_half_volume = true;
                break;

            case DW_EFFECT_EFFECT9:
                if (m->enable_half_volume)
                    ch->enable_half_volume = false;
                else {
                    // Position restart is handled in the loader
                    ch->track_data_position += 2;
                }
                break;

            case DW_EFFECT_SET_SPEED:
                if (m->enable_delay_speed)
                    m->playing_info.delay_counter_speed = ch->track_data[ch->track_data_position++];
                else
                    m->playing_info.speed = ch->track_data[ch->track_data_position++];
                break;

            case DW_EFFECT_GLOBAL_VOLUME_FADE:
                m->playing_info.global_volume_fade_speed = ch->track_data[ch->track_data_position++];
                m->playing_info.global_volume_fade_counter = m->playing_info.global_volume_fade_speed;
                break;

            case DW_EFFECT_SET_GLOBAL_VOLUME:
                if (m->enable_set_global_volume)
                    m->playing_info.global_volume = ch->track_data[ch->track_data_position++];
                else {
                    // Start sound effect (not supported)
                    ch->track_data_position++;
                }
                break;

            case DW_EFFECT_START_OR_STOP_SOUNDFX:
                // If effect C is global volume, this is start sound effect. If not, it is stop sound effect
                if (m->enable_set_global_volume)
                    ch->track_data_position++;
                break;

            case DW_EFFECT_STOP_SOUNDFX:
                break;
        }
    }

    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoTrackCommand
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool do_track_command(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc, uint8_t track_command) {
    if (track_command >= 0xe0) {
        // Set number of rows to wait including the current one
        ch->speed = (uint16_t)((track_command - 0xdf) * m->playing_info.speed);
    }
    else if (!m->old_player && (track_command >= m->new_sample_cmd)) {
        // Set sample to use
        ch->current_sample_info = &m->samples[track_command - m->new_sample_cmd];
    }
    else if (m->enable_envelopes && (track_command >= m->new_envelope_cmd)) {
        // Use envelope
        int env_idx = track_command - m->new_envelope_cmd;
        ch->envelope_list = m->envelopes[env_idx];
        ch->envelope_list_length = m->envelope_lengths[env_idx];
        ch->envelope_list_position = 1;
        ch->envelope_speed = ch->envelope_list[0];
    }
    else if (m->enable_arpeggio && (track_command >= m->new_arpeggio_cmd)) {
        // Use arpeggio
        int arp_idx = track_command - m->new_arpeggio_cmd;
        ch->arpeggio_list = m->arpeggios[arp_idx];
        ch->arpeggio_list_length = m->arpeggio_lengths[arp_idx];
        ch->arpeggio_list_position = 0;
    }
    else {
        // Do effects
        return do_effects(m, ch, mc, (DwEffect)(track_command & 0x7f));
    }

    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ReadTrackCommands
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void read_track_commands(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc) {
    ch->slide_enabled = false;

    for (;;) {
        if (ch->track_data_position >= ch->track_data_length) {
            // Safety: avoid reading past track data
            break;
        }

        uint8_t track_byte = ch->track_data[ch->track_data_position++];

        if ((track_byte & 0x80) != 0) {
            if (do_track_command(m, ch, mc, track_byte))
                break;
        }
        else {
            // Play the note
            ch->note = track_byte;

            if (m->old_player) {
                int sample_number = track_byte / 12;
                int note = track_byte % 12;

                DwSample* sample = &m->samples[sample_number];

                if (ch->note != 0) {
                    mixer_set_amiga_period(mc, periods1[note]);
                    mixer_play_sample(mc, sample->sample_number, sample->sample_data, 0, sample->length);
                    mixer_set_amiga_volume(mc, m->channel_volumes[ch->channel_number]);
                }
                else {
                    mixer_mute(mc);
                }
            }
            else {
                if (m->enable_sample_transpose)
                    track_byte = (uint8_t)(track_byte + ch->current_sample_info->transpose);

                if (m->enable_channel_transpose)
                    track_byte = (uint8_t)(track_byte + ch->transpose);
                else {
                    // Old players store the note after it has been transposed in the note field
                    ch->note = track_byte;
                }

                DwSample* sample = ch->current_sample_info;

                mixer_play_sample(mc, sample->sample_number, sample->sample_data, 0, sample->length);

                if (sample->loop_start >= 0)
                    mixer_set_loop(mc, (uint32_t)sample->loop_start, sample->length - (uint32_t)sample->loop_start);

                int new_volume = (int)sample->volume;

                if (m->enable_envelopes && (ch->envelope_list != nullptr)) {
                    new_volume = ch->envelope_list[1] & 0x7f;
                    ch->envelope_list_position = ch->envelope_list_length > 2 ? 2 : 1;

                    ch->envelope_counter = (int8_t)ch->envelope_speed;
                }

                if (m->enable_half_volume && ch->enable_half_volume)
                    new_volume /= 2;

                if (m->enable_volume_fade) {
                    new_volume -= (int)m->playing_info.volume_fade_speed;
                    if (new_volume < 0)
                        new_volume = 0;
                }

                new_volume = new_volume * (int)m->playing_info.global_volume / 64;
                mixer_set_amiga_volume(mc, (uint16_t)new_volume);

                if (track_byte >= 128)
                    track_byte = 0;
                else if (track_byte >= m->periods_count)
                    track_byte = (uint8_t)(m->periods_count - 1);

                uint32_t period = (uint32_t)((m->periods[track_byte] * sample->fine_tune_period) >> 10);
                mixer_set_amiga_period(mc, period);
            }
            break;
        }
    }

    ch->speed_counter = ch->speed;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoFrameStuff
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_frame_stuff(DwModule* m, DwChannelInfo* ch, DwMixerChannel* mc) {
    if (ch->current_sample_info != nullptr) {
        int8_t note = (int8_t)ch->note;

        if (m->enable_global_transpose)
            note += m->playing_info.transpose;

        if (m->enable_channel_transpose)
            note += ch->transpose;

        if (m->enable_arpeggio) {
            // Do arpeggio
            uint8_t arp = ch->arpeggio_list[ch->arpeggio_list_position++];

            if ((arp & 0x80) != 0) {
                ch->arpeggio_list_position = 0;
                arp &= 0x7f;
            }

            note = (int8_t)(note + arp);
            if (note < 0)
                note = 0;
            else if (note >= m->periods_count)
                note = (int8_t)(m->periods_count - 1);
        }

        uint32_t period = (uint32_t)((m->periods[(uint8_t)note] * ch->current_sample_info->fine_tune_period) >> 10);

        // Do slide
        if (ch->slide_enabled) {
            if (ch->slide_counter == 0) {
                ch->slide_value += ch->slide_speed;
                period = (uint32_t)((int32_t)period - ch->slide_value);
            }
            else {
                ch->slide_counter--;
            }
        }

        if (m->enable_vibrato) {
            // Do vibrato
            if (ch->vibrato_direction != 0) {
                if (ch->vibrato_direction < 0) {
                    ch->vibrato_value += ch->vibrato_speed;
                    if (ch->vibrato_value == ch->vibrato_max_value)
                        ch->vibrato_direction = (int8_t)(-(int)ch->vibrato_direction);
                }
                else {
                    ch->vibrato_value -= ch->vibrato_speed;
                    if (ch->vibrato_value == 0)
                        ch->vibrato_direction = (int8_t)(-(int)ch->vibrato_direction);
                }

                if (ch->vibrato_value == 0)
                    ch->vibrato_direction ^= 0x01;

                if ((ch->vibrato_direction & 0x01) != 0)
                    period += ch->vibrato_value;
                else
                    period -= ch->vibrato_value;
            }
        }

        mixer_set_amiga_period(mc, period);

        if (m->enable_envelopes && (ch->envelope_list != nullptr)) {
            ch->envelope_counter--;
            if (ch->envelope_counter < 0) {
                ch->envelope_counter = (int8_t)ch->envelope_speed;

                int new_volume = ch->envelope_list[ch->envelope_list_position];
                if ((new_volume & 0x80) == 0)
                    ch->envelope_list_position++;

                new_volume &= 0x7f;

                if (m->enable_half_volume && ch->enable_half_volume)
                    new_volume /= 2;

                if (m->enable_volume_fade) {
                    new_volume -= (int)m->playing_info.volume_fade_speed;
                    if (new_volume < 0)
                        new_volume = 0;
                }

                new_volume = new_volume * (int)m->playing_info.global_volume / 64;
                mixer_set_amiga_volume(mc, (uint16_t)new_volume);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// StopModule
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void stop_module(DwModule* m) {
    m->playing_info.transpose = 0;
    m->playing_info.volume_fade_speed = 0;
    m->playing_info.global_volume = 64;
    m->playing_info.global_volume_fade_speed = 0;

    for (int i = 0; i < m->number_of_channels; i++)
        mixer_mute(&m->mixer_channels[i]);

    initialize_channel_info(m, m->current_song);
    initialize_square_waveform(m);

    // Tell caller that the song has ended
    m->has_ended = true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play (main tick)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(DwModule* m) {
    if (m->enable_delay_counter) {
        m->playing_info.delay_counter += m->playing_info.delay_counter_speed;
        if (m->playing_info.delay_counter > 255) {
            m->playing_info.delay_counter -= 256;
            return;
        }
    }

    if (m->use_extra_counter) {
        m->playing_info.extra_counter--;
        if (m->playing_info.extra_counter == 0) {
            m->playing_info.extra_counter = 6;
            return;
        }
    }

    if (m->enable_global_volume_fade) {
        if (m->playing_info.global_volume_fade_speed != 0) {
            if (m->playing_info.global_volume > 0) {
                m->playing_info.global_volume_fade_counter--;
                if (m->playing_info.global_volume_fade_counter == 0) {
                    m->playing_info.global_volume--;
                    if (m->playing_info.global_volume > 0)
                        m->playing_info.global_volume_fade_counter = m->playing_info.global_volume_fade_speed;
                }
            }
        }
    }

    change_square_waveform(m);

    for (int i = 0; i < m->number_of_channels; i++) {
        DwChannelInfo* ch = &m->channels[i];
        DwMixerChannel* mc = &m->mixer_channels[i];

        ch->speed_counter--;

        if (ch->speed_counter == 0)
            read_track_commands(m, ch, mc);
        else if (ch->speed_counter > 1)
            do_frame_stuff(m, ch, mc);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixer
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t dw_render(DwModule* module, float* interleaved_stereo, size_t frames) {
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

        for (int ch = 0; ch < module->number_of_channels && ch < 4; ch++) {
            DwMixerChannel* c = &module->mixer_channels[ch];

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
                if (c->has_loop && c->loop_length > 0) {
                    // Wrap to loop
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

size_t dw_render_multi(DwModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0)
        return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        // Accumulate ticks
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            play_tick(module);
        }

        for (int ch = 0; ch < module->number_of_channels && ch < 4; ch++) {
            DwMixerChannel* c = &module->mixer_channels[ch];
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

            // Apply volume (0-64 -> 0.0-1.0)
            sample *= (float)c->volume / 64.0f;

            // Write to per-channel buffer (with same 0.5f scaling as stereo render)
            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            // Advance position
            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Handle loop / end
            if (new_pos >= c->sample_length) {
                if (c->has_loop && c->loop_length > 0) {
                    // Wrap to loop
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

        // Zero any remaining channel buffers if fewer than 4 channels
        for (int ch = module->number_of_channels; ch < 4; ch++) {
            if (ch_out[ch]) ch_out[ch][f] = 0.0f;
        }

        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

DwModule* dw_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 2048)
        return nullptr;

    // Copy the raw data for identification and loading
    // We need to identify from first 16384 bytes (or less)
    int id_length = (int)(size < 16384 ? size : 16384);

    DwModule* m = (DwModule*)calloc(1, sizeof(DwModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    // 50 Hz tick rate (PAL Amiga VBlank)
    m->ticks_per_frame = sample_rate / 50.0f;
    m->tick_accumulator = 0.0f;

    // Keep a copy of the raw data
    m->raw_data = (uint8_t*)malloc(size);
    if (!m->raw_data) {
        free(m);
        return nullptr;
    }
    memcpy(m->raw_data, data, size);
    m->raw_data_size = size;

    // Test the module (identification)
    if (!test_module(m, m->raw_data, id_length)) {
        dw_destroy(m);
        return nullptr;
    }

    // Load the module
    DwStream stream;
    stream_init(&stream, m->raw_data, size);

    int num_arpeggios = 0, num_envelopes = 0;

    if (!load_sub_song_info_and_tracks(m, &stream, &num_arpeggios, &num_envelopes)) {
        dw_destroy(m);
        return nullptr;
    }

    if (!load_arpeggios(m, &stream, num_arpeggios)) {
        dw_destroy(m);
        return nullptr;
    }

    if (!load_envelopes(m, &stream, num_envelopes)) {
        dw_destroy(m);
        return nullptr;
    }

    if (!load_channel_volumes(m, &stream)) {
        dw_destroy(m);
        return nullptr;
    }

    if (!load_sample_info(m, &stream)) {
        dw_destroy(m);
        return nullptr;
    }

    if (!load_sample_data(m, &stream)) {
        dw_destroy(m);
        return nullptr;
    }

    // Allocate mixer channels
    m->mixer_channels = (DwMixerChannel*)calloc(m->number_of_channels, sizeof(DwMixerChannel));

    // Initialize first sub-song
    if (m->song_info_count > 0)
        initialize_sound(m, 0);

    m->current_song = 0;

    return m;
}

void dw_destroy(DwModule* module) {
    if (!module) return;

    // Free tracks
    for (int i = 0; i < module->track_count; i++)
        free(module->tracks[i].data);

    // Free arpeggios
    if (module->arpeggios) {
        for (int i = 0; i < module->arpeggio_count; i++)
            free(module->arpeggios[i]);
        free(module->arpeggios);
    }
    free(module->arpeggio_lengths);

    // Free envelopes
    if (module->envelopes) {
        for (int i = 0; i < module->envelope_count; i++)
            free(module->envelopes[i]);
        free(module->envelopes);
    }
    free(module->envelope_lengths);

    // Free samples
    if (module->samples) {
        for (int i = 0; i < module->number_of_samples; i++)
            free(module->samples[i].sample_data);
        free(module->samples);
    }

    // Free channel volumes
    free(module->channel_volumes);

    // Free song info
    if (module->song_info_list) {
        for (int i = 0; i < module->song_info_count; i++)
            free(module->song_info_list[i].position_lists);
        free(module->song_info_list);
    }

    // Free channels
    free(module->channels);
    free(module->mixer_channels);

    // Free raw data
    free(module->raw_data);

    if (module->original_data) free(module->original_data);
    free(module);
}

int dw_subsong_count(const DwModule* module) {
    if (!module) return 0;
    return module->song_info_count;
}

bool dw_select_subsong(DwModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->song_info_count)
        return false;

    initialize_sound(module, subsong);
    module->current_song = subsong;
    return true;
}

int dw_channel_count(const DwModule* module) {
    if (!module) return 0;
    return module->number_of_channels;
}

void dw_set_channel_mask(DwModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < module->number_of_channels && i < 4; i++)
        module->mixer_channels[i].muted = ((mask >> i) & 1) == 0;
}

bool dw_has_ended(const DwModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int dw_get_instrument_count(const DwModule* module) {
    // TODO: return actual instrument count from format-specific field
    (void)module;
    return 0;
}

size_t dw_export(const DwModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
