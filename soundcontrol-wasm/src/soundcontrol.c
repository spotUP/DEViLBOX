// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "soundcontrol.h"

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

static const uint16_t sc_base_period[16] = {
    0xd600, 0xca00, 0xbe80, 0xb400, 0xa980, 0xa000, 0x9700, 0x8e80,
    0x8680, 0x7f00, 0x7800, 0x7100, 0x6b00, 0x0000, 0x0000, 0x0000

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum ScModuleType {
    SC_TYPE_UNKNOWN = 0,
    SC_TYPE_3X,
    SC_TYPE_40,
    SC_TYPE_50
} ScModuleType;

typedef enum ScEnvelopeCommand {
    SC_ENV_ATTACK = 0,
    SC_ENV_DECAY,
    SC_ENV_SUSTAIN,
    SC_ENV_RELEASE,
    SC_ENV_DONE
} ScEnvelopeCommand;

typedef enum ScSampleCommand {
    SC_CMD_STOP = 0,
    SC_CMD_SWITCH_SAMPLE,
    SC_CMD_WAIT,
    SC_CMD_CHANGE_ADDRESS,
    SC_CMD_SWITCH_SAMPLE_AND_CHANGE_ADDRESS,
    SC_CMD_CHANGE_LENGTH,
    SC_CMD_SWITCH_SAMPLE_AND_CHANGE_LENGTH,
    SC_CMD_CHANGE_PERIOD,
    SC_CMD_TRANSPOSE,
    SC_CMD_CHANGE_VOLUME,
    SC_CMD_SET_LIST_REPEAT,
    SC_CMD_DO_LIST_REPEAT,
    SC_CMD_CHANGE_LIST_REPEAT_VALUE,
    SC_CMD_SET_LIST_REPEAT_VALUE,
    SC_CMD_NOP_0E,
    SC_CMD_PLAY_SAMPLE
} ScSampleCommand;

typedef enum ScPlaySampleCommand {
    SC_PLAY_MUTE = 0,
    SC_PLAY_PLAY
} ScPlaySampleCommand;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct ScPosition {
    uint8_t track_number;
} ScPosition;

typedef struct ScPositionList {
    ScPosition* positions[6];  // 6 channels of position lists
    int         position_count;
} ScPositionList;

typedef struct ScEnvelope {
    uint8_t  attack_speed;
    uint8_t  attack_increment;
    uint8_t  decay_speed;
    uint8_t  decay_decrement;
    uint16_t decay_value;
    uint8_t  release_speed;
    uint8_t  release_decrement;
} ScEnvelope;

typedef struct ScSampleCommandInfo {
    uint16_t command;
    uint16_t argument1;
    uint16_t argument2;
} ScSampleCommandInfo;

typedef struct ScInstrument {
    ScEnvelope           envelope;
    ScSampleCommandInfo* sample_commands;
    int                  sample_command_count;
} ScInstrument;

typedef struct ScSample {
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_end;
    int16_t  note_transpose;
    int8_t*  sample_data;
    int      sample_data_length;
} ScSample;

typedef struct ScModuleData {
    uint16_t speed;

    ScPositionList position_list;

    uint8_t** tracks;  // up to 256 tracks
    int*      track_lengths;
    int       num_tracks_allocated;  // always 256

    ScInstrument* instruments;
    int           num_instruments;

    ScSample* samples;
    int       num_samples;
} ScModuleData;

// --- 3.x player structs ---

typedef struct ScSongInfo3x {
    uint16_t start_position;
    uint16_t end_position;
} ScSongInfo3x;

typedef struct ScVoiceInfo3x {
    uint16_t wait_counter;
    uint8_t* track;
    int      track_position;
    int8_t   transpose;  // only 3.2
} ScVoiceInfo3x;

typedef struct ScGlobalInfo3x {
    uint16_t song_position;
    uint16_t speed_counter;
    uint16_t speed_counter2;
} ScGlobalInfo3x;

// --- 4.0/5.0 player structs ---

typedef struct ScSongInfo40_50 {
    uint16_t start_position;
    uint16_t end_position;
    uint16_t speed;
} ScSongInfo40_50;

#define SC_REPEAT_LIST_MAX 71
#define SC_REPEAT_STACK_MAX 32

typedef struct ScVoiceInfo40_50 {
    uint16_t wait_counter;
    uint8_t* track;
    int      track_position;

    int16_t  transpose;
    uint16_t transposed_note;
    uint16_t sample_transposed_note;
    uint16_t period;

    uint16_t              instrument_number;
    uint16_t              sample_command_wait_counter;
    ScSampleCommandInfo*  sample_command_list;
    int                   sample_command_list_count;
    int                   sample_command_position;
    ScPlaySampleCommand   play_sample_command;

    uint16_t sample_number;
    ScSample* sample;
    uint16_t sample_length;
    int8_t*  sample_data;

    uint16_t volume;

    int      repeat_list_stack[SC_REPEAT_STACK_MAX];
    int      repeat_list_stack_top;

    ScEnvelopeCommand envelope_command;
    uint16_t          envelope_counter;
    int16_t           envelope_volume;
    bool              start_envelope_release;

    uint16_t repeat_list_values[SC_REPEAT_LIST_MAX];

    // Hardware state
    int8_t*  hw_sample_data;
    uint32_t hw_start_offset;
    uint16_t hw_sample_length;
} ScVoiceInfo40_50;

typedef struct ScGlobalInfo40_50 {
    uint16_t song_position;
    uint16_t speed;
    uint16_t max_speed;
    uint16_t speed_counter;
    uint16_t channel_counter;
} ScGlobalInfo40_50;

// Mix channel
typedef struct ScMixChannel {
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
} ScMixChannel;

// --- Specific module info for 3.x (size-based identification) ---

typedef struct ScModuleInfo3x {
    uint32_t total_length;
    bool     is_version_32;
    int      num_songs;
    ScSongInfo3x songs[4];
} ScModuleInfo3x;

static const ScModuleInfo3x sc_known_3x_modules[] = {
    // Domination 1
    { 136612, false, 2, { { 0, 27 }, { 31, 70 } } },
    // Number 9
    { 126446, false, 3, { { 0, 40 }, { 40, 60 }, { 60, 80 } } },
    // Dynatsong
    { 154704, true, 2, { { 0, 28 }, { 28, 62 } } },
    // Eleven6
    { 103808, true, 1, { { 0, 0 } } }  // songInfoList null -> filled from position list

};
#define SC_KNOWN_3X_COUNT 4

// --- Specific module info for 4.0 ---

typedef struct ScModuleInfo40_50 {
    uint32_t total_length;
    int      num_songs;
    ScSongInfo40_50 songs[4];
} ScModuleInfo40_50;

static const ScModuleInfo40_50 sc_known_40_modules[] = {
    // Hot number deluxe intro
    { 81906, 4, { { 68, 84, 435 }, { 84, 104, 210 }, { 104, 132, 181 }, { 0, 68, 292 } } },
    // Hot number deluxe ongame 2
    { 95960, 2, { { 24, 25, 0 }, { 0, 24, 0 } } },
    // Hot number deluxe title
    { 54544, 1, { { 0, 22, 0 } } }

};
#define SC_KNOWN_40_COUNT 3

struct ScModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    ScModuleType module_type;
    ScModuleData module_data;

    uint16_t* periods;  // calculated period table (8*16 entries)

    // Player type union
    bool is_3x;

    // 3.x player state
    ScSongInfo3x*   song_info_3x;
    int             num_songs_3x;
    bool            is_version_32;
    uint16_t        max_speed_counter;
    ScSongInfo3x*   current_song_3x;
    ScGlobalInfo3x  playing_info_3x;
    ScVoiceInfo3x   voices_3x[6];

    // 4.0/5.0 player state
    ScSongInfo40_50*  song_info_40_50;
    int               num_songs_40_50;
    ScSongInfo40_50*  current_song_40_50;
    ScGlobalInfo40_50 playing_info_40_50;
    ScVoiceInfo40_50  voices_40_50[6];

    bool end_reached;
    bool has_ended;

    // Mix channels
    ScMixChannel channels[4];

    // Tick timing
    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Big-endian reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct ScReader {
    const uint8_t* data;
    size_t         size;
    size_t         pos;
} ScReader;

static void reader_init(ScReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos  = 0;
}

static bool reader_eof(const ScReader* r) {
    return r->pos > r->size;
}

static void reader_seek(ScReader* r, size_t pos) {
    r->pos = pos;
}

static void reader_skip(ScReader* r, size_t bytes) {
    r->pos += bytes;
}

static uint8_t reader_read_uint8(ScReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int16_t reader_read_b_int16(ScReader* r) {
    if (r->pos + 2 > r->size) { r->pos = r->size + 1; return 0; }
    int16_t val = (int16_t)(((uint16_t)r->data[r->pos] << 8) | r->data[r->pos + 1]);
    r->pos += 2;
    return val;
}

static uint16_t reader_read_b_uint16(ScReader* r) {
    if (r->pos + 2 > r->size) { r->pos = r->size + 1; return 0; }
    uint16_t val = ((uint16_t)r->data[r->pos] << 8) | r->data[r->pos + 1];
    r->pos += 2;
    return val;
}

static uint32_t reader_read_b_uint32(ScReader* r) {
    if (r->pos + 4 > r->size) { r->pos = r->size + 1; return 0; }
    uint32_t val = ((uint32_t)r->data[r->pos] << 24) |
                   ((uint32_t)r->data[r->pos + 1] << 16) |
                   ((uint32_t)r->data[r->pos + 2] << 8) |
                    r->data[r->pos + 3];
    r->pos += 4;
    return val;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel simulation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_play_sample(ScMixChannel* c, const int8_t* data, uint32_t offset, uint32_t length) {
    c->sample_data   = data;
    c->sample_offset = offset;
    c->sample_length = offset + length;
    c->loop_start    = 0;
    c->loop_length   = 0;
    c->position_fp   = (uint64_t)offset << SAMPLE_FRAC_BITS;
    c->active        = true;
}

static void ch_set_loop(ScMixChannel* c, uint32_t start, uint32_t length) {
    c->loop_start  = start;
    c->loop_length = length;
    if (length > 0)
        c->sample_length = start + length;
}

static void ch_set_amiga_volume(ScMixChannel* c, uint16_t vol) {
    if (vol > 64) vol = 64;
    c->volume = vol;
}

static void ch_set_amiga_period(ScMixChannel* c, uint16_t period) {
    c->period = period;
}

static void ch_mute(ScMixChannel* c) {
    c->active = false;
}

// SetSample (deferred, plays when current sample ends/loops)
static void ch_set_sample(ScMixChannel* c, const int8_t* data, uint32_t offset, uint32_t length) {
    // In our mixer, this is approximated by changing the sample data for the next loop cycle
    c->sample_data   = data;
    c->sample_offset = offset;
    c->sample_length = offset + length;
    c->loop_start    = offset;
    c->loop_length   = length;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Period table calculation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void calculate_period_table(ScModule* m) {
    m->periods = (uint16_t*)calloc(8 * 16, sizeof(uint16_t));

    int index = 0;
    for (int i = 2; i < 10; i++) {
        for (int j = 0; j < 16; j++)
            m->periods[index++] = (uint16_t)(sc_base_period[j] >> i);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module identification
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static ScModuleType identify_module(const uint8_t* data, size_t size, uint32_t* out_total_length) {
    if (size < 576)
        return SC_TYPE_UNKNOWN;

    ScReader r;
    reader_init(&r, data, size);

    reader_seek(&r, 16);
    uint32_t offset = reader_read_b_uint32(&r);

    if ((offset >= 0x8000) || (offset & 0x1) != 0)
        return SC_TYPE_UNKNOWN;

    uint32_t check_offset = offset + 64 - 2;
    if (check_offset >= size)
        return SC_TYPE_UNKNOWN;

    reader_seek(&r, check_offset);
    if (reader_read_b_uint16(&r) != 0xffff)
        return SC_TYPE_UNKNOWN;

    if (reader_read_b_uint32(&r) != 0x00000400)
        return SC_TYPE_UNKNOWN;

    reader_seek(&r, 28);
    uint32_t offset28 = reader_read_b_uint32(&r);
    uint16_t version  = reader_read_b_uint16(&r);

    if ((version == 2) && (offset28 == 0)) {
        // Calculate total length for 3.x
        reader_seek(&r, 16);
        uint32_t tl = 64 + reader_read_b_uint32(&r) + reader_read_b_uint32(&r) +
                       reader_read_b_uint32(&r) + reader_read_b_uint32(&r);
        *out_total_length = tl;
        return SC_TYPE_3X;
    }

    if ((version == 3) && (offset28 != 0)) {
        reader_seek(&r, 16);
        uint32_t tl = 64 + reader_read_b_uint32(&r) + reader_read_b_uint32(&r) +
                       reader_read_b_uint32(&r) + reader_read_b_uint32(&r);
        *out_total_length = tl;

        // Check if it's a known 4.0 module
        for (int i = 0; i < SC_KNOWN_40_COUNT; i++) {
            if (sc_known_40_modules[i].total_length == tl)
                return SC_TYPE_40;
        }

        return SC_TYPE_50;
    }

    return SC_TYPE_UNKNOWN;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_tracks(ScReader* reader, ScModuleData* md) {
    uint16_t offsets[256];

    reader_seek(reader, 64);
    for (int i = 0; i < 256; i++)
        offsets[i] = reader_read_b_uint16(reader);
    if (reader_eof(reader)) return false;

    md->tracks = (uint8_t**)calloc(256, sizeof(uint8_t*));
    md->track_lengths = (int*)calloc(256, sizeof(int));
    md->num_tracks_allocated = 256;

    for (int i = 0; i < 256; i++) {
        if (offsets[i] == 0) continue;

        reader_seek(reader, 64 + offsets[i]);

        // Skip track name (16 bytes)
        reader_skip(reader, 16);

        int capacity = 64;
        uint8_t* track = (uint8_t*)malloc(capacity);
        int length = 0;

        for (;;) {
            uint8_t d1 = reader_read_uint8(reader);
            uint8_t d2 = reader_read_uint8(reader);
            if (reader_eof(reader)) { free(track); return false; }

            if (length + 4 >= capacity) { capacity *= 2; track = (uint8_t*)realloc(track, capacity); }
            track[length++] = d1;
            track[length++] = d2;

            if (d1 == 0xff) break;

            track[length++] = reader_read_uint8(reader);
            track[length++] = reader_read_uint8(reader);
        }

        md->tracks[i] = track;
        md->track_lengths[i] = length;
    }

    return true;
}

static bool load_position_list(ScReader* reader, ScModuleData* md, uint32_t start_offset, uint32_t position_length) {
    reader_seek(reader, start_offset);

    int count = (int)(position_length / 12);
    md->position_list.position_count = count;

    for (int i = 0; i < 6; i++)
        md->position_list.positions[i] = (ScPosition*)calloc(count, sizeof(ScPosition));

    for (int i = 0; i < count; i++) {
        for (int j = 0; j < 6; j++) {
            md->position_list.positions[j][i].track_number = reader_read_uint8(reader);
            reader_read_uint8(reader);  // skip padding byte
        }
        if (reader_eof(reader)) return false;
    }

    return true;
}

static bool load_instruments(ScReader* reader, ScModuleData* md, uint32_t start_offset, uint32_t instruments_length) {
    if (instruments_length == 0) {
        md->instruments = nullptr;
        md->num_instruments = 0;
        return true;
    }

    uint16_t offsets[256];
    reader_seek(reader, start_offset);
    for (int i = 0; i < 256; i++)
        offsets[i] = reader_read_b_uint16(reader);
    if (reader_eof(reader)) return false;

    ScInstrument* loaded = (ScInstrument*)calloc(256, sizeof(ScInstrument));
    int last_loaded = 0;

    for (int i = 0; i < 256; i++) {
        if (offsets[i] == 0) continue;

        reader_seek(reader, start_offset + offsets[i]);

        // Skip name
        reader_skip(reader, 16);

        uint16_t sc_len = reader_read_b_uint16(reader);
        if (reader_eof(reader)) { free(loaded); return false; }

        // Read envelope
        loaded[i].envelope.attack_speed     = reader_read_uint8(reader);
        loaded[i].envelope.attack_increment = reader_read_uint8(reader);
        loaded[i].envelope.decay_speed      = reader_read_uint8(reader);
        loaded[i].envelope.decay_decrement  = reader_read_uint8(reader);
        loaded[i].envelope.decay_value      = reader_read_b_uint16(reader);
        loaded[i].envelope.release_speed    = reader_read_uint8(reader);
        loaded[i].envelope.release_decrement = reader_read_uint8(reader);
        if (reader_eof(reader)) { free(loaded); return false; }

        // Skip not used data
        reader_skip(reader, 22);

        // Load sample commands
        int cmd_count = sc_len / 6;
        loaded[i].sample_commands = (ScSampleCommandInfo*)calloc(cmd_count, sizeof(ScSampleCommandInfo));
        loaded[i].sample_command_count = cmd_count;

        for (int j = 0; j < cmd_count; j++) {
            loaded[i].sample_commands[j].command   = reader_read_b_uint16(reader);
            loaded[i].sample_commands[j].argument1 = reader_read_b_uint16(reader);
            loaded[i].sample_commands[j].argument2 = reader_read_b_uint16(reader);
            if (reader_eof(reader)) { free(loaded); return false; }
        }

        last_loaded = i;
    }

    md->num_instruments = last_loaded + 1;
    md->instruments = (ScInstrument*)calloc(md->num_instruments, sizeof(ScInstrument));
    memcpy(md->instruments, loaded, md->num_instruments * sizeof(ScInstrument));
    free(loaded);

    return true;
}

static bool load_samples(ScReader* reader, ScModuleData* md, uint32_t start_offset) {
    uint32_t offsets[256];
    reader_seek(reader, start_offset);
    for (int i = 0; i < 256; i++)
        offsets[i] = reader_read_b_uint32(reader);
    if (reader_eof(reader)) return false;

    ScSample* loaded = (ScSample*)calloc(256, sizeof(ScSample));
    int last_loaded = 0;

    for (int i = 0; i < 256; i++) {
        if (offsets[i] == 0) continue;

        reader_seek(reader, start_offset + offsets[i]);

        // Skip name (16 bytes)
        reader_skip(reader, 16);

        loaded[i].length     = reader_read_b_uint16(reader);
        loaded[i].loop_start = reader_read_b_uint16(reader);
        loaded[i].loop_end   = reader_read_b_uint16(reader);

        if (reader_eof(reader)) { free(loaded); return false; }

        reader_skip(reader, 20);
        loaded[i].note_transpose = reader_read_b_int16(reader);
        reader_skip(reader, 16);

        uint32_t real_sample_length = reader_read_b_uint32(reader);
        real_sample_length -= 64;

        loaded[i].sample_data = (int8_t*)malloc(real_sample_length);
        loaded[i].sample_data_length = (int)real_sample_length;

        for (uint32_t j = 0; j < real_sample_length; j++) {
            loaded[i].sample_data[j] = (int8_t)reader_read_uint8(reader);
        }

        if (reader_eof(reader)) { free(loaded); return false; }

        last_loaded = i;
    }

    md->num_samples = last_loaded + 1;
    md->samples = (ScSample*)calloc(md->num_samples, sizeof(ScSample));

    for (int i = 0; i < md->num_samples; i++) {
        if (loaded[i].sample_data) {
            md->samples[i] = loaded[i];
        }
        // else leave as zero-initialized (empty sample)
    }

    free(loaded);
    return true;
}

static bool load_module(ScModule* m, const uint8_t* data, size_t size) {
    ScReader reader;
    reader_init(&reader, data, size);

    // Read header
    reader_skip(&reader, 16);  // skip song name

    uint32_t tracks_len       = reader_read_b_uint32(&reader);
    uint32_t samples_len      = reader_read_b_uint32(&reader);
    uint32_t position_list_len = reader_read_b_uint32(&reader);
    uint32_t sample_cmds_len  = reader_read_b_uint32(&reader);

    reader_skip(&reader, 2);  // skip version field area
    m->module_data.speed = reader_read_b_uint16(&reader);

    if (!load_tracks(&reader, &m->module_data)) return false;

    if (!load_position_list(&reader, &m->module_data,
                            64 + tracks_len + samples_len, position_list_len))
        return false;

    if (!load_instruments(&reader, &m->module_data,
                          64 + tracks_len + samples_len + position_list_len, sample_cmds_len))
        return false;

    if (!load_samples(&reader, &m->module_data, 64 + tracks_len))
        return false;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 3.x Player
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sc3x_set_tracks(ScModule* m) {
    uint16_t pos = m->playing_info_3x.song_position;

    for (int i = 0; i < 6; i++) {
        m->voices_3x[i].wait_counter = 0;

        ScPosition* p = &m->module_data.position_list.positions[i][pos];
        m->voices_3x[i].track = m->module_data.tracks[p->track_number];
        m->voices_3x[i].track_position = 0;
    }
}

static uint8_t sc3x_handle_transpose(ScVoiceInfo3x* v, uint8_t note) {
    int8_t transpose = v->transpose;

    while (transpose != 0) {
        if (transpose > 0) {
            transpose--;
            note++;
            if ((note & 0x0f) == 12) note += 4;
        }
        else {
            transpose++;
            note--;
            if ((note & 0x0f) == 15) note -= 4;
        }
    }

    return note;
}

static void sc3x_play_sample(ScModule* m, ScMixChannel* channel, uint8_t sample_number, uint8_t note, uint8_t volume) {
    if (sample_number >= m->module_data.num_samples) return;
    ScSample* sample = &m->module_data.samples[sample_number];

    if (sample->note_transpose != 0) {
        for (int i = 0; i < sample->note_transpose; i++) {
            note++;
            if ((note & 0x0f) == 12) note += 4;
        }
    }

    uint16_t period = m->periods[note];
    ch_set_amiga_period(channel, period);
    ch_set_amiga_volume(channel, volume);

    if (sample->sample_data) {
        ch_play_sample(channel, sample->sample_data, 0, sample->length);

        if (sample->loop_start != 0)
            ch_set_loop(channel, sample->loop_start, (uint32_t)(sample->loop_end - sample->loop_start));
    }
}

static void sc3x_process_voice6(ScModule* m) {
    ScVoiceInfo3x* v = &m->voices_3x[5];

    if (v->track == nullptr) return;

    uint8_t* track = v->track;
    int pos = v->track_position;

    if (track[pos] == 0xff) return;

    if (v->wait_counter == 0) {
        v->wait_counter = (uint16_t)(track[pos + 1] - 1);
        v->track_position += 4;

        if (track[pos] != 0x00) {
            uint8_t dat1 = (uint8_t)(track[pos + 2] - 1);
            uint16_t dat2 = (uint16_t)(track[pos + 3] & 0x3f);
            if ((dat2 & 0x40) != 0) dat2 |= 0xff10;

            if (dat1 == 4) {
                m->voices_3x[0].transpose = (int8_t)dat2;
                m->voices_3x[1].transpose = (int8_t)dat2;
                m->voices_3x[2].transpose = (int8_t)dat2;
                m->voices_3x[3].transpose = (int8_t)dat2;
            }

            int index = (~(dat1 & 3)) & 3;
            m->voices_3x[index].transpose = (int8_t)dat2;
        }
    }
    else {
        v->wait_counter--;
    }
}

static void sc3x_process_track(ScModule* m) {
    bool redo;

    do {
        redo = false;

        if (m->is_version_32)
            sc3x_process_voice6(m);

        for (int i = 0; i < 4; i++) {
            ScVoiceInfo3x* v = &m->voices_3x[i];

            if (v->wait_counter == 0) {
                uint8_t* track = v->track;
                int pos = v->track_position;

                v->wait_counter = (uint16_t)(track[pos + 1] - 1);
                v->track_position += 4;

                if (track[pos] == 0xff) {
                    m->playing_info_3x.song_position++;

                    if (m->playing_info_3x.song_position == m->current_song_3x->end_position) {
                        m->playing_info_3x.song_position = m->current_song_3x->start_position;
                        m->end_reached = true;
                        m->has_ended   = true;
                    }

                    sc3x_set_tracks(m);
                    redo = true;
                    break;
                }

                if (track[pos] != 0x00) {
                    uint8_t note = track[pos];
                    uint8_t sample_number = track[pos + 2];
                    uint8_t volume = track[pos + 3];

                    if (m->is_version_32) {
                        note = sc3x_handle_transpose(v, note);

                        if (sample_number == 0xff) {
                            sample_number = 1;
                            volume = 0;
                            v->wait_counter = 0;
                        }
                    }

                    if (volume != 0x80)
                        sc3x_play_sample(m, &m->channels[i], sample_number, note, volume);
                }
            }
            else {
                v->wait_counter--;
            }
        }
    } while (redo);
}

static void sc3x_process_counter(ScModule* m) {
    m->playing_info_3x.speed_counter2++;

    if (m->playing_info_3x.speed_counter2 == 2) {
        sc3x_process_track(m);
        m->playing_info_3x.speed_counter2 = 0;
    }
}

static void sc3x_play(ScModule* m) {
    m->end_reached = false;

    m->playing_info_3x.speed_counter++;

    if (m->playing_info_3x.speed_counter == m->max_speed_counter) {
        sc3x_process_counter(m);
        m->playing_info_3x.speed_counter = 0;
    }

    sc3x_process_counter(m);
}

static void sc3x_init_sound(ScModule* m, int song_number) {
    m->current_song_3x = &m->song_info_3x[song_number];

    m->playing_info_3x.song_position  = m->current_song_3x->start_position;
    m->playing_info_3x.speed_counter  = 0;
    m->playing_info_3x.speed_counter2 = 0;

    for (int i = 0; i < 6; i++) {
        m->voices_3x[i].wait_counter = 0;
        m->voices_3x[i].track = nullptr;
        m->voices_3x[i].track_position = 0;
        m->voices_3x[i].transpose = 0;
    }

    for (int i = 0; i < 4; i++)
        memset(&m->channels[i], 0, sizeof(ScMixChannel));

    sc3x_set_tracks(m);

    m->end_reached = false;
    m->has_ended   = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// 4.0/5.0 Player
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sc40_set_tracks(ScModule* m) {
    uint16_t pos = m->playing_info_40_50.song_position;

    for (int i = 0; i < 6; i++) {
        m->voices_40_50[i].wait_counter = 0;

        ScPosition* p = &m->module_data.position_list.positions[i][pos];
        m->voices_40_50[i].track = m->module_data.tracks[p->track_number];
        m->voices_40_50[i].track_position = 0;
    }
}

static void sc40_setup_voice_info(ScModule* m, ScVoiceInfo40_50* v, uint16_t note, uint16_t instrument_number, uint16_t volume) {
    v->instrument_number = instrument_number;
    if (instrument_number < (uint16_t)m->module_data.num_instruments &&
        m->module_data.instruments[instrument_number].sample_commands) {
        v->sample_command_list       = m->module_data.instruments[instrument_number].sample_commands;
        v->sample_command_list_count = m->module_data.instruments[instrument_number].sample_command_count;
    }

    v->sample_command_wait_counter = 0;
    v->sample_command_position     = 0;
    v->play_sample_command         = SC_PLAY_MUTE;

    v->volume = volume;

    v->repeat_list_stack_top = 0;

    v->transposed_note = (uint16_t)((note & 0x0f) + (((note & 0xf0) >> 2) * 3) + v->transpose);

    v->envelope_volume  = 0;
    v->envelope_counter = 1;
    v->envelope_command = SC_ENV_ATTACK;
    v->start_envelope_release = false;
}

static void sc40_new_position(ScModule* m) {
    m->playing_info_40_50.song_position++;

    if (m->playing_info_40_50.song_position == m->current_song_40_50->end_position) {
        m->playing_info_40_50.song_position = m->current_song_40_50->start_position;
        m->end_reached = true;
        m->has_ended   = true;
    }

    sc40_set_tracks(m);
}

static void sc40_process_voice6(ScModule* m) {
    ScVoiceInfo40_50* v = &m->voices_40_50[5];

    uint8_t* track = v->track;
    if (!track) return;
    int pos = v->track_position;

    if (v->wait_counter == 0) {
        v->wait_counter = (uint16_t)(track[pos + 1] - 1);
        v->track_position += 4;

        if (track[pos] != 0x00) {
            if (track[pos] == 0xff) {
                v->track_position -= 4;
                return;
            }

            uint8_t dat1 = (uint8_t)(track[pos + 2] - 1);

            uint16_t dat2 = (uint16_t)(track[pos + 3] & 0x3f);
            if ((dat2 & 0x40) != 0) dat2 |= 0xff10;

            if (dat1 == 4) {
                m->voices_40_50[0].transpose = (int16_t)dat2;
                m->voices_40_50[1].transpose = (int16_t)dat2;
                m->voices_40_50[2].transpose = (int16_t)dat2;
                m->voices_40_50[3].transpose = (int16_t)dat2;
            }

            m->voices_40_50[dat1 & 3].transpose = (int8_t)dat2;
        }
    }
    else {
        v->wait_counter--;
    }
}

static void sc40_process_track(ScModule* m) {
    bool redo;

    do {
        redo = false;

        sc40_process_voice6(m);

        for (int i = 0; i < 4; i++) {
            ScVoiceInfo40_50* v = &m->voices_40_50[i];

            if (v->wait_counter == 0) {
                uint8_t* track = v->track;
                if (!track) continue;
                int pos = v->track_position;

                v->wait_counter = (uint16_t)(track[pos + 1] - 1);
                v->track_position += 4;

                if (track[pos] == 0xff) {
                    sc40_new_position(m);
                    redo = true;
                    break;
                }

                uint8_t note = track[pos];
                if (note == 0) continue;

                uint8_t instrument_number = track[pos + 2];
                if (instrument_number == 0xff) {
                    sc40_new_position(m);
                    redo = true;
                    break;
                }

                uint8_t volume = track[pos + 3];
                if (volume > 64) volume = 64;

                sc40_setup_voice_info(m, v, note, instrument_number, volume);
            }
            else {
                v->wait_counter--;
            }
        }
    } while (redo);
}

static void sc40_handle_sample_commands_voice(ScModule* m, ScVoiceInfo40_50* v, ScMixChannel* channel) {
    if (v->sample_command_list == nullptr) return;

    for (;;) {
        if (v->sample_command_wait_counter == 0) {
            if (v->sample_command_position >= v->sample_command_list_count) return;

            ScSampleCommandInfo sci = v->sample_command_list[v->sample_command_position++];

            uint16_t raw_cmd = sci.command;
            uint16_t arg1 = sci.argument1;
            uint16_t arg2 = sci.argument2;

            if ((raw_cmd & 0x4000) != 0)
                arg1 = v->repeat_list_values[arg1];

            if ((raw_cmd & 0x8000) != 0)
                arg2 = v->repeat_list_values[arg2];

            ScSampleCommand command = (ScSampleCommand)(raw_cmd & 0x1f);

            switch (command) {
                case SC_CMD_STOP:
                    v->sample_command_position--;
                    v->sample_command_wait_counter = 1;
                    break;

                case SC_CMD_SWITCH_SAMPLE: {
                    v->sample_number = arg1;
                    if (arg1 < (uint16_t)m->module_data.num_samples) {
                        ScSample* s = &m->module_data.samples[arg1];
                        v->sample = s;
                        v->sample_length = s->length;
                        v->sample_transposed_note = (uint16_t)(v->transposed_note + s->note_transpose);
                        v->period = m->periods[v->sample_transposed_note];
                        v->sample_data = s->sample_data;
                    }
                    break;
                }

                case SC_CMD_WAIT:
                    v->sample_command_wait_counter = arg1;
                    break;

                case SC_CMD_CHANGE_ADDRESS:
                    if (v->sample)
                        v->hw_sample_data = v->sample->sample_data;
                    v->hw_start_offset = arg1;
                    break;

                case SC_CMD_SWITCH_SAMPLE_AND_CHANGE_ADDRESS: {
                    v->sample_number = arg1;
                    if (arg1 < (uint16_t)m->module_data.num_samples) {
                        ScSample* s = &m->module_data.samples[arg1];
                        v->sample = s;
                        v->sample_data = s->sample_data;
                        v->hw_sample_data = v->sample_data;
                        v->hw_start_offset = 0;
                    }
                    break;
                }

                case SC_CMD_CHANGE_LENGTH:
                    v->sample_length = arg1;
                    v->hw_sample_length = arg1;
                    break;

                case SC_CMD_SWITCH_SAMPLE_AND_CHANGE_LENGTH: {
                    v->sample_number = arg1;
                    if (arg1 < (uint16_t)m->module_data.num_samples) {
                        ScSample* s = &m->module_data.samples[arg1];
                        v->sample = s;
                        v->sample_length = s->length;
                        v->hw_sample_length = v->sample_length;
                    }
                    break;
                }

                case SC_CMD_CHANGE_PERIOD:
                    v->period = (uint16_t)(v->period + (int16_t)arg1);
                    ch_set_amiga_period(channel, v->period);
                    break;

                case SC_CMD_TRANSPOSE:
                    v->sample_transposed_note = (uint16_t)(v->sample_transposed_note + (int16_t)arg1);
                    v->period = m->periods[v->sample_transposed_note];
                    ch_set_amiga_period(channel, v->period);
                    break;

                case SC_CMD_CHANGE_VOLUME: {
                    int vol = (int)v->volume + (int16_t)arg1;
                    if (vol < 0) vol = 0;
                    else if (vol > 64) vol = 64;
                    v->volume = (uint16_t)vol;
                    break;
                }

                case SC_CMD_SET_LIST_REPEAT:
                    if (v->repeat_list_stack_top < SC_REPEAT_STACK_MAX)
                        v->repeat_list_stack[v->repeat_list_stack_top++] = v->sample_command_position - 1;
                    v->repeat_list_values[arg1] = arg2;
                    break;

                case SC_CMD_DO_LIST_REPEAT: {
                    int16_t temp_arg2 = (int16_t)arg2;

                    if (v->repeat_list_stack_top > 0) {
                        int repeat_pos = v->repeat_list_stack[v->repeat_list_stack_top - 1];
                        ScSampleCommandInfo repeat_cmd = v->sample_command_list[repeat_pos];

                        v->repeat_list_values[repeat_cmd.argument1] =
                            (uint16_t)(v->repeat_list_values[repeat_cmd.argument1] + temp_arg2);

                        if (temp_arg2 < 0) {
                            if (v->repeat_list_values[repeat_cmd.argument1] > arg1)
                                v->sample_command_position = repeat_pos + 1;
                            else
                                v->repeat_list_stack_top--;
                        }
                        else {
                            if (v->repeat_list_values[repeat_cmd.argument1] < arg1)
                                v->sample_command_position = repeat_pos + 1;
                            else
                                v->repeat_list_stack_top--;
                        }
                    }
                    break;
                }

                case SC_CMD_CHANGE_LIST_REPEAT_VALUE:
                    v->repeat_list_values[arg1] = (uint16_t)(v->repeat_list_values[arg1] + (int16_t)arg2);
                    break;

                case SC_CMD_SET_LIST_REPEAT_VALUE:
                    v->repeat_list_values[arg1] = arg2;
                    break;

                case SC_CMD_PLAY_SAMPLE: {
                    switch (v->play_sample_command) {
                        case SC_PLAY_MUTE:
                            ch_mute(channel);
                            v->sample_command_position--;
                            v->sample_command_wait_counter = 1;
                            v->play_sample_command = SC_PLAY_PLAY;
                            break;

                        case SC_PLAY_PLAY:
                            ch_set_amiga_period(channel, v->period);

                            if (v->sample_data)
                                ch_play_sample(channel, v->sample_data, 0, v->sample_length);

                            if (v->sample && v->sample->loop_end != 0) {
                                v->hw_sample_data   = v->sample_data;
                                v->hw_start_offset  = v->sample->loop_start;
                                v->hw_sample_length = (uint16_t)(v->sample->loop_end - v->sample->loop_start);
                            }
                            else {
                                v->hw_sample_length = 0;
                            }

                            v->sample_command_wait_counter = 1;
                            v->play_sample_command = SC_PLAY_MUTE;
                            break;
                    }
                    break;
                }

                default:
                    // NOP commands
                    break;
            }
        }
        else {
            v->sample_command_wait_counter--;
            break;
        }
    }
}

static void sc40_handle_sample_commands(ScModule* m) {
    for (int i = 0; i < 4; i++)
        sc40_handle_sample_commands_voice(m, &m->voices_40_50[i], &m->channels[i]);
}

static void sc40_handle_envelope(ScModule* m) {
    for (int i = 0; i < 4; i++) {
        ScVoiceInfo40_50* v = &m->voices_40_50[i];
        ScMixChannel* channel = &m->channels[i];

        if (v->envelope_counter == 0) {
            if (v->instrument_number < (uint16_t)m->module_data.num_instruments) {
                ScEnvelope* env = &m->module_data.instruments[v->instrument_number].envelope;

                switch (v->envelope_command) {
                    case SC_ENV_ATTACK:
                        v->envelope_volume += env->attack_increment;
                        if (v->envelope_volume >= 256) {
                            v->envelope_volume = 256;
                            v->envelope_command = SC_ENV_DECAY;
                        }
                        v->envelope_counter = env->attack_speed;
                        break;

                    case SC_ENV_DECAY:
                        v->envelope_volume -= env->decay_decrement;
                        if (v->envelope_volume <= (int16_t)env->decay_value) {
                            v->envelope_volume = (int16_t)env->decay_value;
                            v->envelope_command = SC_ENV_SUSTAIN;
                        }
                        v->envelope_counter = env->decay_speed;
                        break;

                    case SC_ENV_SUSTAIN:
                        if (v->start_envelope_release)
                            v->envelope_command = SC_ENV_RELEASE;
                        break;

                    case SC_ENV_RELEASE:
                        v->envelope_volume -= env->release_decrement;
                        if (v->envelope_volume <= 0) {
                            v->envelope_volume = 0;
                            v->envelope_command = SC_ENV_DONE;
                        }
                        v->envelope_counter = env->release_speed;
                        break;

                    case SC_ENV_DONE:
                        break;
                }
            }
        }
        else {
            v->envelope_counter--;
        }

        int volume = (v->volume * v->envelope_volume) / 256;
        ch_set_amiga_volume(channel, (uint16_t)volume);
    }
}

static void sc40_apply_hardware(ScModule* m) {
    for (int i = 0; i < 4; i++) {
        ScVoiceInfo40_50* v = &m->voices_40_50[i];
        ScMixChannel* channel = &m->channels[i];

        if (v->hw_sample_data != nullptr) {
            uint32_t length = v->hw_sample_length;

            if ((v->hw_start_offset + length) > (uint32_t)v->sample->sample_data_length)
                length = (uint32_t)(v->sample->sample_data_length - v->hw_start_offset);

            if (length != 0) {
                ch_set_sample(channel, v->hw_sample_data, v->hw_start_offset, length);
            }
        }
    }
}

static void sc40_process_counter(ScModule* m) {
    m->playing_info_40_50.speed_counter += m->playing_info_40_50.speed;

    while (m->playing_info_40_50.speed_counter > m->playing_info_40_50.max_speed) {
        m->playing_info_40_50.speed_counter -= m->playing_info_40_50.max_speed;

        if (m->module_type == SC_TYPE_50) {
            m->playing_info_40_50.channel_counter++;

            if ((m->playing_info_40_50.channel_counter & 3) != 0)
                continue;
        }

        sc40_process_track(m);
    }
}

static void sc40_play(ScModule* m) {
    m->end_reached = false;

    sc40_process_counter(m);
    sc40_handle_sample_commands(m);
    sc40_handle_envelope(m);
    sc40_apply_hardware(m);
}

static void sc40_init_sound(ScModule* m, int song_number) {
    m->current_song_40_50 = &m->song_info_40_50[song_number];

    m->playing_info_40_50.song_position = m->current_song_40_50->start_position;
    m->playing_info_40_50.speed = m->current_song_40_50->speed != 0 ?
        m->current_song_40_50->speed : m->module_data.speed;
    m->playing_info_40_50.max_speed = (m->module_type == SC_TYPE_40) ? 187 : 46;
    m->playing_info_40_50.speed_counter   = 0;
    m->playing_info_40_50.channel_counter = 0;

    for (int i = 0; i < 6; i++) {
        ScVoiceInfo40_50* v = &m->voices_40_50[i];
        memset(v, 0, sizeof(ScVoiceInfo40_50));
        v->envelope_command = SC_ENV_DONE;
    }

    for (int i = 0; i < 4; i++)
        memset(&m->channels[i], 0, sizeof(ScMixChannel));

    sc40_set_tracks(m);

    m->end_reached = false;
    m->has_ended   = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Unified play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(ScModule* m) {
    if (m->is_3x)
        sc3x_play(m);
    else
        sc40_play(m);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound (unified)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(ScModule* m, int song_number) {
    if (m->is_3x)
        sc3x_init_sound(m, song_number);
    else
        sc40_init_sound(m, song_number);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t sc_render(ScModule* module, float* interleaved_stereo, size_t frames) {
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

        float left  = 0.0f;
        float right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            ScMixChannel* c = &module->channels[ch];

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr)
                continue;

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            float sample = 0.0f;
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
                }
                else {
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

size_t sc_render_multi(ScModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            ScMixChannel* c = &module->channels[ch];
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

ScModule* sc_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 576)
        return nullptr;

    uint32_t total_length;
    ScModuleType type = identify_module(data, size, &total_length);
    if (type == SC_TYPE_UNKNOWN)
        return nullptr;

    ScModule* m = (ScModule*)calloc(1, sizeof(ScModule));
    if (!m) return nullptr;

    m->sample_rate  = sample_rate;
    m->module_type  = type;

    if (!load_module(m, data, size)) {
        sc_destroy(m);
        return nullptr;
    }

    calculate_period_table(m);

    // CIA timing: 50 Hz (PAL)
    m->ticks_per_frame = sample_rate / 50.0f;

    if (type == SC_TYPE_3X) {
        m->is_3x = true;

        // Check known modules
        bool found = false;
        for (int i = 0; i < SC_KNOWN_3X_COUNT; i++) {
            if (sc_known_3x_modules[i].total_length == total_length) {
                m->is_version_32 = sc_known_3x_modules[i].is_version_32;
                m->num_songs_3x  = sc_known_3x_modules[i].num_songs;
                m->song_info_3x  = (ScSongInfo3x*)malloc(m->num_songs_3x * sizeof(ScSongInfo3x));
                for (int j = 0; j < m->num_songs_3x; j++)
                    m->song_info_3x[j] = sc_known_3x_modules[i].songs[j];

                // Special case: Eleven6 has songInfoList null, fill from position list
                if (m->num_songs_3x == 1 && m->song_info_3x[0].end_position == 0) {
                    m->song_info_3x[0].start_position = 0;
                    m->song_info_3x[0].end_position   = (uint16_t)m->module_data.position_list.position_count;
                }

                found = true;
                break;
            }
        }

        if (!found) {
            m->is_version_32 = false;
            m->num_songs_3x  = 1;
            m->song_info_3x  = (ScSongInfo3x*)malloc(sizeof(ScSongInfo3x));
            m->song_info_3x[0].start_position = 0;
            m->song_info_3x[0].end_position   = (uint16_t)m->module_data.position_list.position_count;
        }

        m->max_speed_counter = m->is_version_32 ? 2 : 3;

        sc3x_init_sound(m, 0);
    }
    else {
        m->is_3x = false;

        if (type == SC_TYPE_40) {
            bool found = false;
            for (int i = 0; i < SC_KNOWN_40_COUNT; i++) {
                if (sc_known_40_modules[i].total_length == total_length) {
                    m->num_songs_40_50 = sc_known_40_modules[i].num_songs;
                    m->song_info_40_50 = (ScSongInfo40_50*)malloc(m->num_songs_40_50 * sizeof(ScSongInfo40_50));
                    for (int j = 0; j < m->num_songs_40_50; j++)
                        m->song_info_40_50[j] = sc_known_40_modules[i].songs[j];
                    found = true;
                    break;
                }
            }

            if (!found) {
                m->num_songs_40_50 = 1;
                m->song_info_40_50 = (ScSongInfo40_50*)malloc(sizeof(ScSongInfo40_50));
                m->song_info_40_50[0].start_position = 0;
                m->song_info_40_50[0].end_position   = (uint16_t)m->module_data.position_list.position_count;
                m->song_info_40_50[0].speed           = m->module_data.speed;
            }
        }
        else {
            // SC_TYPE_50
            m->num_songs_40_50 = 1;
            m->song_info_40_50 = (ScSongInfo40_50*)malloc(sizeof(ScSongInfo40_50));
            m->song_info_40_50[0].start_position = 0;
            m->song_info_40_50[0].end_position   = (uint16_t)m->module_data.position_list.position_count;
            m->song_info_40_50[0].speed           = m->module_data.speed;
        }

        sc40_init_sound(m, 0);
    }

    return m;
}

void sc_destroy(ScModule* module) {
    if (!module) return;

    // Free tracks
    if (module->module_data.tracks) {
        for (int i = 0; i < 256; i++)
            free(module->module_data.tracks[i]);
        free(module->module_data.tracks);
    }
    free(module->module_data.track_lengths);

    // Free position list
    for (int i = 0; i < 6; i++)
        free(module->module_data.position_list.positions[i]);

    // Free instruments
    if (module->module_data.instruments) {
        for (int i = 0; i < module->module_data.num_instruments; i++)
            free(module->module_data.instruments[i].sample_commands);
        free(module->module_data.instruments);
    }

    // Free samples
    if (module->module_data.samples) {
        for (int i = 0; i < module->module_data.num_samples; i++)
            free(module->module_data.samples[i].sample_data);
        free(module->module_data.samples);
    }

    free(module->periods);
    free(module->song_info_3x);
    free(module->song_info_40_50);

    if (module->original_data) free(module->original_data);
    free(module);
}

int sc_subsong_count(const ScModule* module) {
    if (!module) return 0;
    return module->is_3x ? module->num_songs_3x : module->num_songs_40_50;
}

bool sc_select_subsong(ScModule* module, int subsong) {
    if (!module) return false;

    int count = module->is_3x ? module->num_songs_3x : module->num_songs_40_50;
    if (subsong < 0 || subsong >= count)
        return false;

    initialize_sound(module, subsong);
    return true;
}

int sc_channel_count(const ScModule* module) {
    (void)module;
    return 4;
}

void sc_set_channel_mask(ScModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool sc_has_ended(const ScModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sc_get_instrument_count(const ScModule* module) {
    // TODO: return actual instrument count from format-specific field
    (void)module;
    return 0;
}

size_t sc_export(const ScModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
