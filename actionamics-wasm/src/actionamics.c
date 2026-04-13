// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "actionamics.h"

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
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum ActEffect {
    ACT_EFFECT_NONE = 0x00,
    ACT_EFFECT_ARPEGGIO = 0x70,
    ACT_EFFECT_SLIDE_UP = 0x71,
    ACT_EFFECT_SLIDE_DOWN = 0x72,
    ACT_EFFECT_VOLUME_SLIDE_AFTER_ENVELOPE = 0x73,
    ACT_EFFECT_VIBRATO = 0x74,
    ACT_EFFECT_SET_ROWS = 0x75,
    ACT_EFFECT_SET_SAMPLE_OFFSET = 0x76,
    ACT_EFFECT_NOTE_DELAY = 0x77,
    ACT_EFFECT_MUTE = 0x78,
    ACT_EFFECT_SAMPLE_RESTART = 0x79,
    ACT_EFFECT_TREMOLO = 0x7a,
    ACT_EFFECT_BREAK = 0x7b,
    ACT_EFFECT_SET_VOLUME = 0x7c,
    ACT_EFFECT_VOLUME_SLIDE = 0x7d,
    ACT_EFFECT_VOLUME_SLIDE_AND_VIBRATO = 0x7e,
    ACT_EFFECT_SET_SPEED = 0x7f
} ActEffect;

typedef enum ActEnvelopeState {
    ACT_ENV_DONE = 0,
    ACT_ENV_ATTACK = 1,
    ACT_ENV_DECAY = 2,
    ACT_ENV_SUSTAIN = 3,
    ACT_ENV_RELEASE = 4
} ActEnvelopeState;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t act_periods[73] = {
    0,
                      5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3816,
    3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     107,  101,   95

};

static const uint8_t act_sinus[32] = {
      0,  24,  49,  74,  97, 120, 141, 161,
    180, 197, 212, 224, 235, 244, 250, 253,
    255, 253, 250, 244, 235, 224, 212, 197,
    180, 161, 141, 120,  97,  74,  49,  24

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct ActInstrumentList {
    uint8_t list_number;
    uint8_t number_of_values_in_list;
    uint8_t start_counter_delta_value;
    uint8_t counter_end_value;
} ActInstrumentList;

typedef struct ActInstrument {
    ActInstrumentList sample_number_list;
    ActInstrumentList arpeggio_list;
    ActInstrumentList frequency_list;

    int8_t portamento_increment;
    uint8_t portamento_delay;

    int8_t note_transpose;

    uint8_t attack_end_volume;
    uint8_t attack_speed;
    uint8_t decay_end_volume;
    uint8_t decay_speed;
    uint8_t sustain_delay;
    uint8_t release_end_volume;
    uint8_t release_speed;
} ActInstrument;

typedef struct ActSample {
    char name[33];
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
    int8_t* sample_data;

    uint8_t arpeggio_list_number;
    uint16_t effect_start_position;
    uint16_t effect_length;
    uint16_t effect_speed;
    uint16_t effect_mode;

    uint16_t counter_init_value;
} ActSample;

typedef struct ActSampleExtra {
    int8_t* modified_sample_data;

    int16_t effect_increment_value;
    int32_t effect_position;
    uint16_t effect_speed_counter;
    bool already_taken;
} ActSampleExtra;

typedef struct ActSinglePositionInfo {
    uint8_t track_number;
    int8_t note_transpose;
    int8_t instrument_transpose;
} ActSinglePositionInfo;

typedef struct ActSongInfo {
    uint8_t start_position;
    uint8_t end_position;
    uint8_t loop_position;
    uint8_t speed;
} ActSongInfo;

typedef struct ActVoiceInfo {
    ActSinglePositionInfo* position_list;
    uint8_t* track_data;
    int track_position;
    uint8_t delay_counter;

    uint16_t instrument_number;
    ActInstrument* instrument;
    int8_t instrument_transpose;

    uint16_t sample_number;
    int8_t* sample_data;
    uint32_t sample_offset;
    uint16_t sample_length;
    uint32_t sample_loop_start;
    uint16_t sample_loop_length;

    uint16_t note;
    int8_t note_transpose;
    uint16_t note_period;

    uint16_t final_note;
    uint16_t final_period;
    int16_t final_volume;
    uint16_t global_voice_volume;

    ActEnvelopeState envelope_state;
    uint16_t sustain_counter;

    uint8_t sample_number_list_speed_counter;
    int16_t sample_number_list_position;

    uint8_t arpeggio_list_speed_counter;
    int16_t arpeggio_list_position;

    uint8_t frequency_list_speed_counter;
    int16_t frequency_list_position;

    ActEffect effect;
    uint16_t effect_argument;

    uint8_t portamento_delay_counter;
    int16_t portamento_value;

    uint16_t tone_portamento_end_period;
    int16_t tone_portamento_increment_value;

    uint8_t vibrato_effect_argument;
    int8_t vibrato_table_index;

    uint8_t tremolo_effect_argument;
    int8_t tremolo_table_index;
    uint16_t tremolo_volume; // Never set in original (bug in original player)

    uint16_t sample_offset_effect_argument;
    uint16_t note_delay_counter;

    uint16_t restart_delay_counter;
    int8_t* restart_sample_data;
    uint32_t restart_sample_offset;
    uint16_t restart_sample_length;

    bool trig_sample;
} ActVoiceInfo;

// Channel state for rendering
typedef struct ActChannel {
    bool active;
    bool muted;
    int8_t* sample_data;
    uint32_t sample_offset;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t period;
    uint16_t volume; // 0-64
    uint64_t position_fp;
    int16_t sample_number;
    // For SetSample / SetLoop (deferred triggers)
    bool has_pending_sample;
    int8_t* pending_sample_data;
    uint32_t pending_sample_offset;
    uint32_t pending_sample_length;
    bool has_pending_loop;
    uint32_t pending_loop_start;
    uint32_t pending_loop_length;
} ActChannel;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers (big-endian)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct ActReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} ActReader;

static void act_reader_init(ActReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool act_reader_eof(const ActReader* r) {
    return r->pos > r->size;
}

static void act_reader_seek(ActReader* r, size_t pos) {
    r->pos = pos;
}

static void act_reader_skip(ActReader* r, size_t bytes) {
    r->pos += bytes;
}

static uint8_t act_reader_read_u8(ActReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t act_reader_read_i8(ActReader* r) {
    return (int8_t)act_reader_read_u8(r);
}

static uint16_t act_reader_read_b_u16(ActReader* r) {
    uint8_t hi = act_reader_read_u8(r);
    uint8_t lo = act_reader_read_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static int16_t act_reader_read_b_i16(ActReader* r) {
    return (int16_t)act_reader_read_b_u16(r);
}

static uint32_t act_reader_read_b_u32(ActReader* r) {
    uint8_t a = act_reader_read_u8(r);
    uint8_t b = act_reader_read_u8(r);
    uint8_t c = act_reader_read_u8(r);
    uint8_t d = act_reader_read_u8(r);
    return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)c << 8) | d;
}

static int32_t act_reader_read_b_i32(ActReader* r) {
    return (int32_t)act_reader_read_b_u32(r);
}

static size_t act_reader_read_signed(ActReader* r, int8_t* buf, size_t count) {
    size_t avail = 0;
    if (r->pos < r->size)
        avail = r->size - r->pos;
    if (count > avail) count = avail;
    if (count > 0) {
        memcpy(buf, r->data + r->pos, count);
        r->pos += count;
    }
    return count;
}

static size_t act_reader_read_into(ActReader* r, uint8_t* buf, size_t count) {
    return act_reader_read_signed(r, (int8_t*)buf, count);
}

static void act_reader_read_string(ActReader* r, char* buf, int max_len) {
    for (int i = 0; i < max_len; i++) {
        if (r->pos >= r->size) { buf[i] = '\0'; return; }
        buf[i] = (char)r->data[r->pos++];
    }
    buf[max_len] = '\0';
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module struct
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct ActModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;    bool has_ended;

    uint16_t tempo;

    ActSongInfo* song_info_list;
    int num_song_infos;

    ActSinglePositionInfo** positions; // [4][count]
    int position_count;

    ActInstrument* instruments;
    int num_instruments;

    ActSample* samples;
    int num_samples;

    ActSampleExtra* sample_extras;

    int8_t** sample_number_list; // [count][16]
    int num_sample_number_lists;

    int8_t** arpeggio_list; // [count][16]
    int num_arpeggio_lists;

    int8_t** frequency_list; // [count][16]
    int num_frequency_lists;

    uint8_t** tracks;
    int num_tracks;

    ActSongInfo* current_song_info;

    // Playing state
    uint8_t speed_counter;
    uint8_t current_speed;
    uint8_t measure_counter;
    uint8_t current_position;
    uint8_t loop_position;
    uint8_t end_position;
    uint8_t current_row_position;
    uint8_t number_of_rows;

    ActVoiceInfo voices[4];

    // Rendering
    ActChannel channels[4];
    float tick_accumulator;
    float ticks_per_frame;
} ActModule;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_initialize_sound(ActModule* m, int sub_song);
static void act_play_tick(ActModule* m);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel operations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_ch_mute(ActChannel* ch) {
    ch->active = false;
}

static void act_ch_play_sample(ActChannel* ch, int16_t samp_num, int8_t* data, uint32_t start_offset, uint32_t length) {
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = length;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    ch->loop_length = 0;
    ch->loop_start = 0;
    ch->sample_number = samp_num;
    ch->has_pending_sample = false;
    ch->has_pending_loop = false;
}

static void act_ch_set_loop(ActChannel* ch, uint32_t start, uint32_t length) {
    ch->loop_start = start;
    ch->loop_length = length;
}

static void act_ch_set_amiga_period(ActChannel* ch, uint32_t period) {
    ch->period = (uint16_t)period;
}

static void act_ch_set_amiga_volume(ActChannel* ch, uint16_t vol) {
    ch->volume = vol;
}

static void act_ch_set_sample_number(ActChannel* ch, int16_t num) {
    ch->sample_number = num;
}

static void act_ch_set_sample(ActChannel* ch, int8_t* data, uint32_t start, uint32_t length) {
    // SetSample with data: deferred until loop
    ch->has_pending_sample = true;
    ch->pending_sample_data = data;
    ch->pending_sample_offset = start;
    ch->pending_sample_length = length;
}

static void act_ch_set_loop_with_data(ActChannel* ch, uint32_t start, uint32_t length) {
    ch->has_pending_loop = true;
    ch->pending_loop_start = start;
    ch->pending_loop_length = length;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool act_load_module_info(ActReader* r, long start_offset, uint32_t* total_length) {
    if (start_offset > (long)r->size) {
        *total_length = 0;
        return false;
    }

    act_reader_seek(r, start_offset);
    *total_length = act_reader_read_b_u32(r);

    if (act_reader_eof(r))
        return false;

    return true;
}

static bool act_load_position_lists(ActModule* m, ActReader* r, long start_offset, uint32_t track_num_len, uint32_t instr_trans_len, uint32_t note_trans_len) {
    if (start_offset > (long)r->size)
        return false;

    act_reader_seek(r, start_offset);

    if ((track_num_len != instr_trans_len) || (track_num_len != note_trans_len))
        return false;

    int count = (int)(track_num_len / 4);
    m->position_count = count;

    m->positions = (ActSinglePositionInfo**)calloc(4, sizeof(ActSinglePositionInfo*));
    if (!m->positions) return false;

    for (int i = 0; i < 4; i++) {
        m->positions[i] = (ActSinglePositionInfo*)calloc(count, sizeof(ActSinglePositionInfo));
        if (!m->positions[i]) return false;
    }

    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < count; j++) {
            m->positions[i][j].track_number = act_reader_read_u8(r);
        }
        if (act_reader_eof(r)) return false;
    }

    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < count; j++) {
            m->positions[i][j].note_transpose = act_reader_read_i8(r);
        }
        if (act_reader_eof(r)) return false;
    }

    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < count; j++) {
            m->positions[i][j].instrument_transpose = act_reader_read_i8(r);
        }
        if (act_reader_eof(r)) return false;
    }

    return true;
}

static ActInstrumentList act_load_instrument_list_info(ActReader* r) {
    ActInstrumentList list;
    list.list_number = act_reader_read_u8(r);
    list.number_of_values_in_list = act_reader_read_u8(r);
    list.start_counter_delta_value = act_reader_read_u8(r);
    list.counter_end_value = act_reader_read_u8(r);
    return list;
}

static bool act_load_instruments(ActModule* m, ActReader* r, long start_offset, uint32_t instr_length) {
    if (start_offset > (long)r->size)
        return false;

    act_reader_seek(r, start_offset);

    int count = (int)(instr_length / 32);
    m->num_instruments = count;
    m->instruments = (ActInstrument*)calloc(count, sizeof(ActInstrument));
    if (!m->instruments) return false;

    for (int i = 0; i < count; i++) {
        ActInstrument* instr = &m->instruments[i];

        instr->sample_number_list = act_load_instrument_list_info(r);
        instr->arpeggio_list = act_load_instrument_list_info(r);
        instr->frequency_list = act_load_instrument_list_info(r);

        if (act_reader_eof(r)) return false;

        instr->portamento_increment = act_reader_read_i8(r);
        instr->portamento_delay = act_reader_read_u8(r);
        instr->note_transpose = act_reader_read_i8(r);

        if (act_reader_eof(r)) return false;

        act_reader_skip(r, 1);

        instr->attack_end_volume = act_reader_read_u8(r);
        instr->attack_speed = act_reader_read_u8(r);
        instr->decay_end_volume = act_reader_read_u8(r);
        instr->decay_speed = act_reader_read_u8(r);
        instr->sustain_delay = act_reader_read_u8(r);
        instr->release_end_volume = act_reader_read_u8(r);
        instr->release_speed = act_reader_read_u8(r);

        if (act_reader_eof(r)) return false;

        act_reader_skip(r, 9);
    }

    return true;
}

static int8_t** act_load_list(ActReader* r, long start_offset, uint32_t list_length, int* out_count) {
    if (start_offset > (long)r->size)
        return nullptr;

    act_reader_seek(r, start_offset);

    int count = (int)(list_length / 16);
    *out_count = count;

    int8_t** list = (int8_t**)calloc(count, sizeof(int8_t*));
    if (!list) return nullptr;

    for (int i = 0; i < count; i++) {
        list[i] = (int8_t*)malloc(16);
        if (!list[i]) return nullptr;
        if (act_reader_read_signed(r, list[i], 16) != 16)
            return nullptr;
    }

    return list;
}

static bool act_load_sub_songs(ActModule* m, ActReader* r, long start_offset, uint32_t sub_song_length) {
    if (start_offset > (long)r->size)
        return false;

    act_reader_seek(r, start_offset);

    int count = (int)(sub_song_length / 4);
    ActSongInfo* temp_list = (ActSongInfo*)calloc(count, sizeof(ActSongInfo));
    if (!temp_list) return false;

    for (int i = 0; i < count; i++) {
        temp_list[i].start_position = act_reader_read_u8(r);
        temp_list[i].end_position = act_reader_read_u8(r);
        temp_list[i].loop_position = act_reader_read_u8(r);
        temp_list[i].speed = act_reader_read_u8(r);

        if (act_reader_eof(r)) { free(temp_list); return false; }
    }

    // Filter out entries where start, end, loop are all 0
    int valid_count = 0;
    for (int i = 0; i < count; i++) {
        if (temp_list[i].start_position != 0 || temp_list[i].end_position != 0 || temp_list[i].loop_position != 0)
            valid_count++;
    }

    m->num_song_infos = valid_count;
    m->song_info_list = (ActSongInfo*)calloc(valid_count, sizeof(ActSongInfo));
    if (!m->song_info_list) { free(temp_list); return false; }

    int j = 0;
    for (int i = 0; i < count; i++) {
        if (temp_list[i].start_position != 0 || temp_list[i].end_position != 0 || temp_list[i].loop_position != 0)
            m->song_info_list[j++] = temp_list[i];
    }

    free(temp_list);
    return true;
}

static bool act_load_sample_info(ActModule* m, ActReader* r, long start_offset, uint32_t sample_length) {
    if (start_offset > (long)r->size)
        return false;

    act_reader_seek(r, start_offset);

    int count = (int)(sample_length / 64);
    m->num_samples = count;
    m->samples = (ActSample*)calloc(count, sizeof(ActSample));
    m->sample_extras = (ActSampleExtra*)calloc(count, sizeof(ActSampleExtra));
    if (!m->samples || !m->sample_extras) return false;

    for (int i = 0; i < count; i++) {
        ActSample* sample = &m->samples[i];
        ActSampleExtra* extra = &m->sample_extras[i];

        // Skip pointer to data
        act_reader_skip(r, 4);

        sample->length = act_reader_read_b_u16(r);
        sample->loop_start = act_reader_read_b_u16(r);
        sample->loop_length = act_reader_read_b_u16(r);

        sample->effect_start_position = act_reader_read_b_u16(r);
        sample->effect_length = act_reader_read_b_u16(r);

        // Bug in original player: hi-byte is also used as arpeggio list number
        sample->arpeggio_list_number = (uint8_t)(sample->effect_length >> 8);

        sample->effect_speed = act_reader_read_b_u16(r);
        sample->effect_mode = act_reader_read_b_u16(r);

        extra->effect_increment_value = act_reader_read_b_i16(r);
        extra->effect_position = act_reader_read_b_i32(r);
        extra->effect_speed_counter = act_reader_read_b_u16(r);
        extra->already_taken = act_reader_read_b_u16(r) != 0;

        if (act_reader_eof(r)) return false;

        act_reader_skip(r, 4);

        act_reader_read_string(r, sample->name, 32);

        if (act_reader_eof(r)) return false;
    }

    return true;
}

static bool act_load_tracks(ActModule* m, ActReader* r, long start_offset, uint32_t track_offset_length) {
    if (start_offset > (long)r->size)
        return false;

    act_reader_seek(r, start_offset);

    int count = (int)(track_offset_length / 2);
    m->num_tracks = count - 1;
    m->tracks = (uint8_t**)calloc(m->num_tracks, sizeof(uint8_t*));
    if (!m->tracks) return false;

    uint16_t* offsets = (uint16_t*)calloc(count, sizeof(uint16_t));
    if (!offsets) return false;

    for (int i = 0; i < count; i++)
        offsets[i] = act_reader_read_b_u16(r);

    if (act_reader_eof(r)) { free(offsets); return false; }

    long track_start_offset = r->pos;

    for (int i = 0; i < count - 1; i++) {
        act_reader_seek(r, track_start_offset + offsets[i]);

        int track_length = offsets[i + 1] - offsets[i];
        m->tracks[i] = (uint8_t*)malloc(track_length);
        if (!m->tracks[i]) { free(offsets); return false; }

        if (act_reader_read_into(r, m->tracks[i], track_length) != (size_t)track_length) {
            free(offsets);
            return false;
        }
    }

    free(offsets);
    return true;
}

static bool act_load_sample_data(ActModule* m, ActReader* r, uint32_t total_length) {
    int total_sample_length = 0;
    for (int i = 0; i < m->num_samples; i++)
        total_sample_length += m->samples[i].length;
    total_sample_length *= 2;

    uint32_t sample_data_start = total_length - (uint32_t)total_sample_length;

    if (sample_data_start > r->size)
        return false;

    act_reader_seek(r, sample_data_start);

    for (int i = 0; i < m->num_samples; i++) {
        ActSample* sample = &m->samples[i];

        if (sample->length > 0) {
            int length = sample->length * 2;
            sample->sample_data = (int8_t*)malloc(length);
            if (!sample->sample_data) return false;
            if (act_reader_read_signed(r, sample->sample_data, length) != (size_t)length)
                return false;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Setup track
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_setup_track(ActModule* m, ActVoiceInfo* vi) {
    ActSinglePositionInfo* pos_info = &vi->position_list[m->current_position];

    vi->track_data = m->tracks[pos_info->track_number];
    vi->track_position = 0;

    vi->note_transpose = pos_info->note_transpose;
    vi->instrument_transpose = pos_info->instrument_transpose;

    vi->delay_counter = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Read track data
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_read_track_data(ActVoiceInfo* vi) {
    vi->note = 0;
    vi->instrument_number = 0;
    vi->effect = ACT_EFFECT_NONE;
    vi->effect_argument = 0;

    if (vi->delay_counter == 0) {
        uint8_t* track_data = vi->track_data;

        uint8_t data = track_data[vi->track_position++];
        if ((data & 0x80) != 0) {
            vi->delay_counter = (uint8_t)~data;
            return;
        }

        if (data >= 0x70) {
            vi->effect = (ActEffect)data;
            vi->effect_argument = track_data[vi->track_position++];
            return;
        }

        vi->note = data;

        data = track_data[vi->track_position++];
        if ((data & 0x80) != 0) {
            vi->delay_counter = (uint8_t)~data;
            return;
        }

        if (data >= 0x70) {
            vi->effect = (ActEffect)data;
            vi->effect_argument = track_data[vi->track_position++];
            return;
        }

        vi->instrument_number = data;

        data = track_data[vi->track_position++];
        if ((data & 0x80) != 0) {
            vi->delay_counter = (uint8_t)~data;
            return;
        }

        vi->effect = (ActEffect)data;
        vi->effect_argument = track_data[vi->track_position++];
    } else {
        vi->delay_counter--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Read next row
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_read_next_row(ActVoiceInfo* vi) {
    act_read_track_data(vi);

    if (vi->note != 0) {
        vi->note = (uint16_t)(vi->note + vi->note_transpose);
        vi->trig_sample = true;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Setup note and sample
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_setup_note_and_sample(ActModule* m, ActVoiceInfo* vi) {
    vi->portamento_value = 0;

    if (vi->note != 0) {
        vi->final_volume = 0;
        vi->sample_number_list_speed_counter = 0;
        vi->sample_number_list_position = 0;
        vi->arpeggio_list_speed_counter = 0;
        vi->arpeggio_list_position = 0;
        vi->frequency_list_speed_counter = 0;
        vi->frequency_list_position = 0;
        vi->portamento_delay_counter = 0;
        vi->tone_portamento_increment_value = 0;
        vi->envelope_state = ACT_ENV_ATTACK;
        vi->sustain_counter = 0;

        if (vi->instrument_number != 0)
            vi->instrument = &m->instruments[vi->instrument_number - 1 + vi->instrument_transpose];

        vi->final_note = (uint16_t)(vi->note + vi->instrument->note_transpose);

        int8_t sample_number = m->sample_number_list[vi->instrument->sample_number_list.list_number][0];
        vi->sample_number = (uint16_t)sample_number;

        ActSample* sample = &m->samples[sample_number];

        vi->sample_data = sample->sample_data;
        vi->sample_offset = 0;
        vi->sample_length = sample->length;
        vi->sample_loop_start = sample->loop_start * 2U;
        vi->sample_loop_length = sample->loop_length;

        int note_idx = vi->final_note + m->arpeggio_list[sample->arpeggio_list_number][0];
        vi->note_period = act_periods[note_idx];
        vi->final_period = vi->note_period;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Sample inversion effect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_sample_inversion_effect(ActModule* m) {
    ActSampleExtra* samples_taken[4];

    for (int i = 0; i < 4; i++) {
        ActVoiceInfo* vi = &m->voices[i];

        ActSample* sample = &m->samples[vi->sample_number];
        ActSampleExtra* extra = &m->sample_extras[vi->sample_number];

        samples_taken[i] = extra;

        if (!extra->already_taken) {
            extra->already_taken = true;

            if (extra->effect_speed_counter == 0) {
                extra->effect_speed_counter = sample->counter_init_value;

                if (sample->effect_mode != 0) {
                    int end_position = sample->effect_length * 2 - 1;

                    int position = sample->effect_start_position * 2 + extra->effect_position;
                    extra->modified_sample_data[position] = (int8_t)~extra->modified_sample_data[position];

                    extra->effect_position += extra->effect_increment_value;

                    if (extra->effect_position < 0) {
                        if (sample->effect_mode == 2)
                            extra->effect_position = end_position;
                        else {
                            extra->effect_position -= extra->effect_increment_value;
                            extra->effect_increment_value = (int16_t)-extra->effect_increment_value;
                        }
                    } else {
                        if (extra->effect_position <= end_position) {
                            if (sample->effect_mode == 1)
                                extra->effect_position = 0;
                            else {
                                extra->effect_position -= extra->effect_increment_value;
                                extra->effect_increment_value = (int16_t)-extra->effect_increment_value;
                            }
                        }
                    }
                }
            } else {
                extra->effect_speed_counter--;
                extra->effect_speed_counter &= 0x1f;
            }
        }
    }

    for (int i = 0; i < 4; i++)
        samples_taken[i]->already_taken = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Envelope
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_envelope(ActVoiceInfo* vi) {
    ActInstrument* instr = vi->instrument;

    if (instr != nullptr) {
        switch (vi->envelope_state) {
            case ACT_ENV_ATTACK:
                vi->final_volume += instr->attack_speed;
                if (vi->final_volume >= instr->attack_end_volume) {
                    vi->final_volume = instr->attack_end_volume;
                    vi->envelope_state = ACT_ENV_DECAY;
                }
                break;

            case ACT_ENV_DECAY:
                if (instr->decay_speed != 0) {
                    vi->final_volume -= instr->decay_speed;
                    if (vi->final_volume <= instr->decay_end_volume) {
                        vi->final_volume = instr->decay_end_volume;
                        vi->envelope_state = ACT_ENV_SUSTAIN;
                    }
                } else {
                    vi->envelope_state = ACT_ENV_SUSTAIN;
                }
                break;

            case ACT_ENV_SUSTAIN:
                if (vi->sustain_counter != instr->sustain_delay)
                    vi->sustain_counter++;
                else
                    vi->envelope_state = ACT_ENV_RELEASE;
                break;

            case ACT_ENV_RELEASE:
                if (instr->release_speed != 0) {
                    vi->final_volume -= instr->release_speed;
                    if (vi->final_volume <= instr->release_end_volume) {
                        vi->final_volume = instr->release_end_volume;
                        vi->envelope_state = ACT_ENV_DONE;
                    }
                } else {
                    vi->envelope_state = ACT_ENV_DONE;
                }
                break;

            case ACT_ENV_DONE:
                break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Set volume
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_set_volume(ActModule* m, ActVoiceInfo* vi, ActChannel* ch) {
    (void)m;
    act_do_envelope(vi);

    vi->tremolo_effect_argument = 0;
    vi->tremolo_table_index = (int8_t)vi->final_volume;

    uint16_t volume = (uint16_t)((vi->final_volume * vi->global_voice_volume) >> 16);
    act_ch_set_amiga_volume(ch, volume);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Sample number list
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_sample_number_list(ActModule* m, ActVoiceInfo* vi, ActChannel* ch) {
    ActInstrument* instr = vi->instrument;

    if (instr != nullptr) {
        ActInstrumentList* list = &instr->sample_number_list;

        if (list->number_of_values_in_list != 0) {
            if (vi->sample_number_list_speed_counter == list->counter_end_value) {
                vi->sample_number_list_speed_counter = (uint8_t)(list->counter_end_value - list->start_counter_delta_value);

                if (vi->sample_number_list_position == list->number_of_values_in_list)
                    vi->sample_number_list_position = -1;

                vi->sample_number_list_position++;

                int8_t sample_number = m->sample_number_list[list->list_number][vi->sample_number_list_position];

                if (sample_number < 0)
                    vi->sample_number_list_position--;
                else {
                    vi->sample_number = (uint16_t)sample_number;

                    ActSample* sample = &m->samples[sample_number];

                    vi->sample_data = sample->sample_data;
                    vi->sample_offset = 0;
                    vi->sample_loop_start = 0;
                    vi->sample_loop_length = sample->length;

                    act_ch_set_sample_number(ch, sample_number);
                    act_ch_set_sample(ch, vi->sample_data, vi->sample_loop_start, vi->sample_loop_length * 2U);
                    act_ch_set_loop_with_data(ch, vi->sample_loop_start, vi->sample_loop_length * 2U);
                }
            } else {
                vi->sample_number_list_speed_counter++;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Arpeggio list
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_arpeggio_list(ActModule* m, ActVoiceInfo* vi) {
    ActInstrument* instr = vi->instrument;

    if (instr != nullptr) {
        ActInstrumentList* list = &instr->arpeggio_list;

        if (list->number_of_values_in_list != 0) {
            if (vi->arpeggio_list_speed_counter == list->counter_end_value) {
                vi->arpeggio_list_speed_counter = (uint8_t)(list->counter_end_value - list->start_counter_delta_value);

                if (vi->arpeggio_list_position == list->number_of_values_in_list)
                    vi->arpeggio_list_position = -1;

                vi->arpeggio_list_position++;

                int8_t arp_value = m->arpeggio_list[list->list_number][vi->arpeggio_list_position];
                vi->final_period = act_periods[arp_value + vi->final_note];
            } else {
                vi->arpeggio_list_speed_counter++;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Frequency list
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_frequency_list(ActModule* m, ActVoiceInfo* vi) {
    ActInstrument* instr = vi->instrument;

    if (instr != nullptr) {
        ActInstrumentList* list = &instr->frequency_list;

        if (list->number_of_values_in_list != 0) {
            if (vi->frequency_list_speed_counter == list->counter_end_value) {
                vi->frequency_list_speed_counter = (uint8_t)(list->counter_end_value - list->start_counter_delta_value);

                if (vi->frequency_list_position == list->number_of_values_in_list)
                    vi->frequency_list_position = -1;

                vi->frequency_list_position++;

                int8_t freq_value = m->frequency_list[list->list_number][vi->frequency_list_position];
                vi->final_period = (uint16_t)(vi->final_period + freq_value);
            } else {
                vi->frequency_list_speed_counter++;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Portamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_portamento(ActVoiceInfo* vi) {
    ActInstrument* instr = vi->instrument;

    if (instr != nullptr) {
        if (instr->portamento_increment != 0) {
            if (vi->portamento_delay_counter == instr->portamento_delay)
                vi->portamento_value += instr->portamento_increment;
            else
                vi->portamento_delay_counter++;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tone portamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_tone_portamento(ActModule* m, ActVoiceInfo* vi) {
    (void)m;
    if ((vi->effect != ACT_EFFECT_NONE) && ((uint16_t)vi->effect < ACT_EFFECT_ARPEGGIO) && (vi->effect_argument != 0)) {
        ActInstrument* instr = vi->instrument;

        uint8_t end_note = (uint8_t)(((int8_t)vi->effect) + vi->note_transpose + instr->note_transpose);
        vi->tone_portamento_end_period = act_periods[end_note];

        int speed = vi->effect_argument;

        int delta = vi->tone_portamento_end_period - vi->final_period;
        if (delta != 0) {
            if (delta < 0)
                speed = -speed;
            vi->tone_portamento_increment_value = (int16_t)speed;
        }
    }

    if (vi->tone_portamento_increment_value != 0) {
        if (vi->tone_portamento_increment_value < 0) {
            vi->final_period = (uint16_t)(vi->final_period + vi->tone_portamento_increment_value);

            if (vi->final_period <= vi->tone_portamento_end_period) {
                vi->tone_portamento_increment_value = 0;
                vi->final_period = vi->tone_portamento_end_period;
                vi->note_period = vi->final_period;
            }
        } else {
            vi->final_period = (uint16_t)(vi->final_period + vi->tone_portamento_increment_value);

            if (vi->final_period >= vi->tone_portamento_end_period) {
                vi->tone_portamento_increment_value = 0;
                vi->final_period = vi->tone_portamento_end_period;
                vi->note_period = vi->final_period;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Volume slide helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_volume_slide(ActVoiceInfo* vi) {
    uint16_t arg = vi->effect_argument;

    if ((arg & 0x0f) != 0) {
        int volume = vi->final_volume - (arg * 4);
        if (volume < 0) volume = 0;
        vi->final_volume = (int16_t)volume;
        vi->tremolo_effect_argument = 0;
        vi->tremolo_table_index = (int8_t)volume;
    } else {
        int volume = vi->final_volume + ((arg >> 4) * 4);
        if (volume > 255) volume = 255;
        vi->final_volume = (int16_t)volume;
        vi->tremolo_effect_argument = 0;
        vi->tremolo_table_index = (int8_t)volume;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Vibrato helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_vibrato(ActVoiceInfo* vi) {
    uint8_t val = act_sinus[(vi->vibrato_table_index >> 2) & 0x1f];
    int vib_val = (((vi->vibrato_effect_argument & 0x0f) * val) >> 7);

    if (vi->vibrato_table_index >= 0)
        vib_val = -vib_val;

    vi->final_period = (uint16_t)(vi->note_period - vib_val);
    vi->vibrato_table_index += (int8_t)(vi->vibrato_effect_argument >> 2);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Track effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_effect_arpeggio(ActModule* m, ActVoiceInfo* vi) {
    uint16_t arg = vi->effect_argument;
    uint8_t arp_list[4] = { (uint8_t)(arg >> 4), 0, (uint8_t)(arg & 0x0f), 0 };
    uint8_t arp_val = arp_list[m->measure_counter];
    vi->final_period = act_periods[vi->final_note + arp_val];
}

static void act_do_effect_slide_up(ActVoiceInfo* vi) {
    vi->portamento_value = (int16_t)-vi->effect_argument;
    vi->note_period = (uint16_t)(vi->note_period + vi->portamento_value);
}

static void act_do_effect_slide_down(ActVoiceInfo* vi) {
    vi->portamento_value = (int16_t)vi->effect_argument;
    vi->note_period = (uint16_t)(vi->note_period + vi->portamento_value);
}

static void act_do_effect_volume_slide_after_envelope(ActModule* m, ActVoiceInfo* vi) {
    if (vi->envelope_state == ACT_ENV_DONE) {
        if ((m->speed_counter == 0) && (vi->instrument_number != 0)) {
            if (vi->instrument == nullptr) return;
            vi->final_volume = vi->instrument->attack_speed;
        }
        act_do_volume_slide(vi);
    }
}

static void act_do_effect_vibrato(ActVoiceInfo* vi) {
    uint16_t arg = vi->effect_argument;
    if (arg != 0) {
        uint8_t new_arg = vi->vibrato_effect_argument;
        if ((arg & 0x0f) != 0) new_arg = (uint8_t)((new_arg & 0xf0) | (arg & 0x0f));
        if ((arg & 0xf0) != 0) new_arg = (uint8_t)((new_arg & 0x0f) | (arg & 0xf0));
        vi->vibrato_effect_argument = new_arg;
    }
    act_do_vibrato(vi);
}

static void act_do_effect_set_rows(ActModule* m, ActVoiceInfo* vi) {
    m->number_of_rows = (uint8_t)vi->effect_argument;
}

static void act_do_effect_set_sample_offset(ActVoiceInfo* vi) {
    if (vi->effect_argument != 0)
        vi->sample_offset_effect_argument = vi->effect_argument;

    uint16_t offset = (uint16_t)(vi->sample_offset_effect_argument << 7);

    if (offset < vi->sample_length) {
        vi->sample_length -= offset;
        vi->sample_offset += offset * 2U;
    } else {
        vi->sample_length = 1;
    }
}

static void act_do_effect_note_delay(ActVoiceInfo* vi) {
    if (vi->effect_argument != 0) {
        vi->note_delay_counter = vi->effect_argument;
        vi->effect = ACT_EFFECT_NONE;
        vi->effect_argument = 0;
    }
}

static void act_do_effect_mute(ActModule* m, ActVoiceInfo* vi, ActChannel* ch) {
    if ((vi->effect_argument != 0) && (m->speed_counter == 0)) {
        vi->final_volume = 0;
        vi->tremolo_effect_argument = 0;
        vi->tremolo_table_index = 0;
        act_ch_set_amiga_volume(ch, 0);
    }
}

static void act_do_effect_sample_restart(ActVoiceInfo* vi) {
    if (vi->effect_argument != 0) {
        vi->restart_delay_counter = vi->effect_argument;
        vi->restart_sample_data = vi->sample_data;
        vi->restart_sample_offset = vi->sample_offset;
        vi->restart_sample_length = vi->sample_length;
        vi->effect = ACT_EFFECT_NONE;
        vi->effect_argument = 0;
    }
}

static void act_do_effect_tremolo(ActVoiceInfo* vi, ActChannel* ch) {
    uint16_t arg = vi->effect_argument;
    if (arg != 0) {
        uint8_t new_arg = vi->tremolo_effect_argument;
        if ((arg & 0x0f) != 0) new_arg = (uint8_t)((new_arg & 0xf0) | (arg & 0x0f));
        if ((arg & 0xf0) != 0) new_arg = (uint8_t)((new_arg & 0x0f) | (arg & 0xf0));
        vi->tremolo_effect_argument = new_arg;
    }

    uint8_t val = act_sinus[(vi->tremolo_table_index >> 2) & 0x1f];
    int vib_val = (((vi->tremolo_effect_argument & 0x0f) * val) >> 6);

    if (vi->tremolo_table_index >= 0)
        vib_val = -vib_val;

    int16_t volume = (int16_t)(vi->tremolo_volume - vib_val);
    if (volume < 0) volume = 0;
    if (volume > 64) volume = 64;
    volume *= 4;
    if (volume == 256) volume = 255;

    vi->final_volume = volume;
    act_ch_set_amiga_volume(ch, (uint16_t)((volume * vi->global_voice_volume) >> 16));

    vi->tremolo_table_index += (int8_t)((vi->tremolo_effect_argument >> 2) & 0x3c);
}

static void act_do_effect_break(ActModule* m) {
    m->current_row_position = (uint8_t)(m->number_of_rows - 1);
}

static void act_do_effect_set_volume(ActVoiceInfo* vi, ActChannel* ch) {
    int16_t volume = (int16_t)(vi->effect_argument * 4);
    if (volume > 255) volume = 255;
    vi->final_volume = volume;
    act_ch_set_amiga_volume(ch, (uint16_t)((volume * vi->global_voice_volume) >> 16));
}

static void act_do_effect_volume_slide(ActModule* m, ActVoiceInfo* vi) {
    if (m->speed_counter == 0) {
        if (vi->instrument == nullptr) return;
        vi->final_volume = vi->instrument->attack_speed;
    }
    act_do_volume_slide(vi);
}

static void act_do_effect_volume_slide_and_vibrato(ActModule* m, ActVoiceInfo* vi) {
    act_do_effect_volume_slide_after_envelope(m, vi);
    act_do_vibrato(vi);
}

static void act_do_effect_set_speed(ActModule* m, ActVoiceInfo* vi) {
    if (vi->effect_argument < 31)
        m->current_speed = (uint8_t)vi->effect_argument;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Handle track effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_handle_track_effects(ActModule* m, ActVoiceInfo* vi, ActChannel* ch) {
    if (m->speed_counter != 0) {
        switch (vi->effect) {
            case ACT_EFFECT_ARPEGGIO: act_do_effect_arpeggio(m, vi); break;
            case ACT_EFFECT_SLIDE_UP: act_do_effect_slide_up(vi); break;
            case ACT_EFFECT_SLIDE_DOWN: act_do_effect_slide_down(vi); break;
            case ACT_EFFECT_VOLUME_SLIDE_AFTER_ENVELOPE: act_do_effect_volume_slide_after_envelope(m, vi); break;
            case ACT_EFFECT_VIBRATO: act_do_effect_vibrato(vi); break;
            default: break;
        }
    }

    switch (vi->effect) {
        case ACT_EFFECT_SET_ROWS: act_do_effect_set_rows(m, vi); break;
        case ACT_EFFECT_SET_SAMPLE_OFFSET: act_do_effect_set_sample_offset(vi); break;
        case ACT_EFFECT_NOTE_DELAY: act_do_effect_note_delay(vi); break;
        case ACT_EFFECT_MUTE: act_do_effect_mute(m, vi, ch); break;
        case ACT_EFFECT_SAMPLE_RESTART: act_do_effect_sample_restart(vi); break;
        case ACT_EFFECT_TREMOLO: act_do_effect_tremolo(vi, ch); break;
        case ACT_EFFECT_BREAK: act_do_effect_break(m); break;
        case ACT_EFFECT_SET_VOLUME: act_do_effect_set_volume(vi, ch); break;
        case ACT_EFFECT_VOLUME_SLIDE: act_do_effect_volume_slide(m, vi); break;
        case ACT_EFFECT_VOLUME_SLIDE_AND_VIBRATO: act_do_effect_volume_slide_and_vibrato(m, vi); break;
        case ACT_EFFECT_SET_SPEED: act_do_effect_set_speed(m, vi); break;
        default: break;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Do effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_do_effects(ActModule* m, ActVoiceInfo* vi, ActChannel* ch) {
    act_set_volume(m, vi, ch);
    act_do_sample_number_list(m, vi, ch);
    act_handle_track_effects(m, vi, ch);
    act_do_arpeggio_list(m, vi);
    act_do_frequency_list(m, vi);
    act_do_portamento(vi);
    act_do_tone_portamento(m, vi);

    int period = vi->final_period + vi->portamento_value;

    if (period < 95) period = 95;
    else if (period > 5760) period = 5760;

    vi->final_period = (uint16_t)period;

    act_ch_set_amiga_period(ch, vi->final_period);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_initialize_sound(ActModule* m, int sub_song) {
    m->current_song_info = &m->song_info_list[sub_song];

    m->speed_counter = 0;
    m->current_speed = m->current_song_info->speed;
    m->measure_counter = 0;
    m->current_position = m->current_song_info->start_position;
    m->loop_position = m->current_song_info->loop_position;
    m->end_position = m->current_song_info->end_position;
    m->current_row_position = 0;
    m->number_of_rows = 64;

    m->has_ended = false;

    for (int i = 0; i < 4; i++) {
        ActVoiceInfo* vi = &m->voices[i];
        memset(vi, 0, sizeof(ActVoiceInfo));

        vi->position_list = m->positions[i];
        vi->track_data = nullptr;
        vi->track_position = 0;
        vi->delay_counter = 0;

        vi->instrument_number = 0;
        vi->instrument = nullptr;
        vi->instrument_transpose = 0;

        vi->sample_number = 0;
        vi->sample_data = nullptr;
        vi->sample_offset = 0;
        vi->sample_length = 0;
        vi->sample_loop_start = 0;
        vi->sample_loop_length = 0;

        vi->note = 0;
        vi->note_transpose = 0;
        vi->note_period = 0;

        vi->final_note = 0;
        vi->final_period = 0;
        vi->final_volume = 0;
        vi->global_voice_volume = 0x4041;

        vi->envelope_state = ACT_ENV_DONE;
        vi->sustain_counter = 0;

        vi->sample_number_list_speed_counter = 0;
        vi->sample_number_list_position = 0;
        vi->arpeggio_list_speed_counter = 0;
        vi->arpeggio_list_position = 0;
        vi->frequency_list_speed_counter = 0;
        vi->frequency_list_position = 0;

        vi->effect = ACT_EFFECT_NONE;
        vi->effect_argument = 0;

        vi->portamento_delay_counter = 0;
        vi->portamento_value = 0;

        vi->tone_portamento_end_period = 0;
        vi->tone_portamento_increment_value = 0;

        vi->vibrato_effect_argument = 0;
        vi->vibrato_table_index = 0;

        vi->tremolo_effect_argument = 0;
        vi->tremolo_table_index = 0;
        vi->tremolo_volume = 0;

        vi->sample_offset_effect_argument = 0;
        vi->note_delay_counter = 0;

        vi->restart_delay_counter = 0;
        vi->restart_sample_data = nullptr;
        vi->restart_sample_offset = 0;
        vi->restart_sample_length = 0;

        vi->trig_sample = false;

        act_setup_track(m, &m->voices[i]);
    }

    for (int i = m->num_samples - 1; i >= 0; i--) {
        ActSample* sample = &m->samples[i];
        if (sample->effect_mode != 0) {
            if (m->sample_extras[i].modified_sample_data)
                free(m->sample_extras[i].modified_sample_data);
            int len = sample->length * 2;
            m->sample_extras[i].modified_sample_data = (int8_t*)malloc(len);
            if (m->sample_extras[i].modified_sample_data && sample->sample_data)
                memcpy(m->sample_extras[i].modified_sample_data, sample->sample_data, len);
        }
    }

    // BPM tempo: SetBpmTempo(tempo)
    // tempo = BPM; ticks_per_frame = sample_rate * 2.5 / tempo
    m->ticks_per_frame = m->sample_rate * 2.5f / (float)m->tempo;
    m->tick_accumulator = 0.0f;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void act_play_tick(ActModule* m) {
    m->measure_counter++;
    if (m->measure_counter == 3)
        m->measure_counter = 0;

    m->speed_counter++;

    if (m->speed_counter == m->current_speed) {
        m->speed_counter = 0;
        m->measure_counter = 0;

        for (int i = 0; i < 4; i++) {
            ActVoiceInfo* vi = &m->voices[i];
            act_read_next_row(vi);
            act_setup_note_and_sample(m, vi);
        }

        act_do_sample_inversion_effect(m);

        m->current_row_position++;

        if (m->current_row_position == m->number_of_rows) {
            m->current_row_position = 0;

            uint8_t position = m->current_position;
            m->current_position++;

            if (position == m->end_position) {
                m->current_position = m->loop_position;
                m->has_ended = true;
            }

            for (int i = 0; i < 4; i++)
                act_setup_track(m, &m->voices[i]);
        }
    }

    for (int i = 0; i < 4; i++) {
        ActVoiceInfo* vi = &m->voices[i];
        ActChannel* ch = &m->channels[i];

        if (vi->restart_delay_counter != 0) {
            vi->restart_delay_counter--;

            if (vi->restart_delay_counter == 0) {
                vi->sample_data = vi->restart_sample_data;
                vi->sample_offset = vi->restart_sample_offset;
                vi->sample_length = vi->restart_sample_length;
                vi->trig_sample = true;
            }
        }

        act_do_effects(m, vi, ch);

        if (vi->note_delay_counter == 0) {
            if (vi->trig_sample) {
                vi->trig_sample = false;

                act_ch_play_sample(ch, (int16_t)vi->sample_number, vi->sample_data, vi->sample_offset, vi->sample_length * 2U);

                if (vi->sample_loop_length > 1)
                    act_ch_set_loop(ch, vi->sample_loop_start, vi->sample_loop_length * 2U);
            }

            act_ch_set_amiga_period(ch, vi->final_period);
        } else {
            vi->note_delay_counter--;
        }
    }

    if (m->speed_counter != 0)
        act_do_sample_inversion_effect(m);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t act_render(ActModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0)
        return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            act_play_tick(module);
        }

        float left = 0.0f, right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            ActChannel* c = &module->channels[ch];
            float sample = 0.0f;

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr)
                continue;

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            sample *= (float)c->volume / 64.0f;

            if (ch == 0 || ch == 3)
                left += sample;
            else
                right += sample;

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

size_t act_render_multi(ActModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0)
        return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            act_play_tick(module);
        }

        for (int ch = 0; ch < 4; ch++) {
            ActChannel* c = &module->channels[ch];
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

ActModule* act_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 90)
        return nullptr;

    // Check signature at offset 62
    if (memcmp(data + 62, "ACTIONAMICS SOUND TOOL", 22) != 0)
        return nullptr;

    ActReader reader;
    act_reader_init(&reader, data, size);

    uint16_t tempo = act_reader_read_b_u16(&reader);

    uint32_t lengths[15];
    for (int i = 0; i < 15; i++)
        lengths[i] = act_reader_read_b_u32(&reader);

    if (act_reader_eof(&reader))
        return nullptr;

    ActModule* m = (ActModule*)calloc(1, sizeof(ActModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    m->tempo = tempo;

    long start_offset = reader.pos;
    start_offset += lengths[0];

    uint32_t total_length = 0;
    if (!act_load_module_info(&reader, start_offset, &total_length) || (total_length > size)) {
        act_destroy(m);
        return nullptr;
    }

    start_offset += lengths[1];

    if (!act_load_position_lists(m, &reader, start_offset, lengths[2], lengths[3], lengths[4])) {
        act_destroy(m);
        return nullptr;
    }

    start_offset += lengths[2] + lengths[3] + lengths[4];

    if (!act_load_instruments(m, &reader, start_offset, lengths[5])) {
        act_destroy(m);
        return nullptr;
    }

    start_offset += lengths[5];

    m->sample_number_list = act_load_list(&reader, start_offset, lengths[6], &m->num_sample_number_lists);
    if (!m->sample_number_list) { act_destroy(m); return nullptr; }

    start_offset += lengths[6];

    m->arpeggio_list = act_load_list(&reader, start_offset, lengths[7], &m->num_arpeggio_lists);
    if (!m->arpeggio_list) { act_destroy(m); return nullptr; }

    start_offset += lengths[7];

    m->frequency_list = act_load_list(&reader, start_offset, lengths[8], &m->num_frequency_lists);
    if (!m->frequency_list) { act_destroy(m); return nullptr; }

    start_offset += lengths[8] + lengths[9] + lengths[10];

    if (!act_load_sub_songs(m, &reader, start_offset, lengths[11])) {
        act_destroy(m);
        return nullptr;
    }

    start_offset += lengths[11] + lengths[12];

    if (!act_load_sample_info(m, &reader, start_offset, lengths[13])) {
        act_destroy(m);
        return nullptr;
    }

    start_offset += lengths[13];

    if (!act_load_tracks(m, &reader, start_offset, lengths[14])) {
        act_destroy(m);
        return nullptr;
    }

    if (!act_load_sample_data(m, &reader, total_length)) {
        act_destroy(m);
        return nullptr;
    }

    if (m->num_song_infos > 0)
        act_initialize_sound(m, 0);

    return m;
}

void act_destroy(ActModule* module) {
    if (!module) return;

    if (module->positions) {
        for (int i = 0; i < 4; i++)
            free(module->positions[i]);
        free(module->positions);
    }

    free(module->instruments);

    if (module->samples) {
        for (int i = 0; i < module->num_samples; i++)
            free(module->samples[i].sample_data);
        free(module->samples);
    }

    if (module->sample_extras) {
        for (int i = 0; i < module->num_samples; i++)
            free(module->sample_extras[i].modified_sample_data);
        free(module->sample_extras);
    }

    if (module->sample_number_list) {
        for (int i = 0; i < module->num_sample_number_lists; i++)
            free(module->sample_number_list[i]);
        free(module->sample_number_list);
    }

    if (module->arpeggio_list) {
        for (int i = 0; i < module->num_arpeggio_lists; i++)
            free(module->arpeggio_list[i]);
        free(module->arpeggio_list);
    }

    if (module->frequency_list) {
        for (int i = 0; i < module->num_frequency_lists; i++)
            free(module->frequency_list[i]);
        free(module->frequency_list);
    }

    if (module->tracks) {
        for (int i = 0; i < module->num_tracks; i++)
            free(module->tracks[i]);
        free(module->tracks);
    }

    free(module->song_info_list);
    if (module->original_data) free(module->original_data);
    free(module);
}

int act_subsong_count(const ActModule* module) {
    if (!module) return 0;
    return module->num_song_infos;
}

bool act_select_subsong(ActModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_song_infos)
        return false;

    act_initialize_sound(module, subsong);
    return true;
}

int act_channel_count(const ActModule* module) {
    (void)module;
    return 4;
}

void act_set_channel_mask(ActModule* module, uint32_t mask) {
    if (!module) return;
    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool act_has_ended(const ActModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int act_get_instrument_count(const ActModule* module) {
    // TODO: return actual instrument count from format-specific field
    (void)module;
    return 0;
}

size_t act_export(const ActModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
