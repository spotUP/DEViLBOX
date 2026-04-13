// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "instereo2.h"

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

typedef enum Is2Effect {
    IS2_EFFECT_ARPEGGIO = 0x0,
    IS2_EFFECT_SET_SLIDE_SPEED = 0x1,
    IS2_EFFECT_RESTART_ADSR = 0x2,
    IS2_EFFECT_SET_VIBRATO = 0x4,
    IS2_EFFECT_SET_PORTAMENTO = 0x7,
    IS2_EFFECT_SKIP_PORTAMENTO = 0x8,
    IS2_EFFECT_SET_TRACK_LEN = 0x9,
    IS2_EFFECT_SET_VOLUME_INCREMENT = 0xA,
    IS2_EFFECT_POSITION_JUMP = 0xB,
    IS2_EFFECT_SET_VOLUME = 0xC,
    IS2_EFFECT_TRACK_BREAK = 0xD,
    IS2_EFFECT_SET_FILTER = 0xE,
    IS2_EFFECT_SET_SPEED = 0xF
} Is2Effect;

typedef enum Is2EnvelopeGeneratorMode {
    IS2_EG_DISABLED = 0,
    IS2_EG_CALC = 1,
    IS2_EG_FREE = 2
} Is2EnvelopeGeneratorMode;

typedef enum Is2VoicePlayingMode {
    IS2_MODE_SAMPLE = 0,
    IS2_MODE_SYNTH = 1
} Is2VoicePlayingMode;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t is2_periods[109] = {
        0,
    13696, 12928, 12192, 11520, 10848, 10240,  9664,  9120,  8608,  8128,  7680,  7248,
     6848,  6464,  6096,  5760,  5424,  5120,  4832,  4560,  4304,  4064,  3840,  3624,
     3424,  3232,  3048,  2880,  2712,  2560,  2416,  2280,  2152,  2032,  1920,  1812,
     1712,  1616,  1524,  1440,  1356,  1280,  1208,  1140,  1076,  1016,   960,   906,
      856,   808,   762,   720,   678,   640,   604,   570,   538,   508,   480,   453,
      428,   404,   381,   360,   339,   320,   302,   285,   269,   254,   240,   226,
      214,   202,   190,   180,   170,   160,   151,   143,   135,   127,   120,   113,
      107,   101,    95,    90,    85,    80,    75,    71,    67,    63,    60,    56,
       53,    50,    47,    45,    42,    40,    37,    35,    33,    31,    30,    28
};

#define IS2_PERIODS_LEN 109

static const int8_t is2_vibrato[256] = {
       0,    3,    6,    9,   12,   16,   19,   22,   25,   28,   31,   34,   37,   40,   43,   46,
      49,   52,   54,   57,   60,   63,   66,   68,   71,   73,   76,   78,   81,   83,   86,   88,
      90,   92,   94,   96,   98,  100,  102,  104,  106,  108,  109,  111,  112,  114,  115,  116,
     118,  119,  120,  121,  122,  123,  123,  124,  125,  125,  126,  126,  126,  127,  127,  127,
     127,  127,  127,  127,  126,  126,  125,  125,  124,  124,  123,  122,  121,  120,  119,  118,
     117,  116,  114,  113,  112,  110,  108,  107,  105,  103,  101,   99,   97,   95,   93,   91,
      89,   87,   84,   82,   80,   77,   75,   72,   69,   67,   64,   61,   59,   56,   53,   50,
      47,   44,   41,   39,   36,   32,   29,   26,   23,   20,   17,   14,   11,    8,    5,    2,
      -1,   -4,   -7,  -10,  -14,  -17,  -20,  -23,  -26,  -29,  -32,  -35,  -38,  -41,  -44,  -47,
     -50,  -53,  -55,  -58,  -61,  -64,  -66,  -69,  -72,  -74,  -77,  -79,  -82,  -84,  -86,  -88,
     -91,  -93,  -95,  -97,  -99, -101, -103, -104, -106, -108, -109, -111, -112, -114, -115, -116,
    -118, -119, -120, -121, -122, -122, -123, -124, -124, -125, -125, -126, -126, -126, -126, -126,
    -126, -126, -126, -126, -126, -125, -125, -124, -124, -123, -122, -121, -120, -119, -118, -117,
    -116, -115, -113, -112, -110, -109, -107, -105, -104, -102, -100,  -98,  -96,  -94,  -92,  -90,
     -87,  -85,  -83,  -80,  -78,  -75,  -73,  -70,  -68,  -65,  -62,  -60,  -57,  -54,  -51,  -48,
     -45,  -42,  -39,  -37,  -34,  -30,  -27,  -24,  -21,  -18,  -15,  -12,   -9,   -6,   -3,    0
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Is2Arpeggio {
    uint8_t length;
    uint8_t repeat;
    int8_t values[14];
} Is2Arpeggio;

typedef struct Is2TrackLine {
    uint8_t note;
    uint8_t instrument;
    bool disable_sound_transpose;
    bool disable_note_transpose;
    uint8_t arpeggio;
    Is2Effect effect;
    uint8_t effect_arg;
} Is2TrackLine;

typedef struct Is2SinglePositionInfo {
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;
} Is2SinglePositionInfo;

typedef struct Is2SongInfo {
    uint8_t start_speed;
    uint8_t rows_per_track;
    uint16_t first_position;
    uint16_t last_position;
    uint16_t restart_position;
    uint16_t tempo;
} Is2SongInfo;

typedef struct Is2Sample {
    uint16_t one_shot_length;
    uint16_t repeat_length;
    int8_t sample_number;
    uint8_t volume;
    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    uint8_t vibrato_level;
    uint8_t portamento_speed;
} Is2Sample;

typedef struct Is2Instrument {
    uint16_t waveform_length;
    uint8_t volume;
    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    uint8_t vibrato_level;
    uint8_t portamento_speed;
    uint8_t adsr_length;
    uint8_t adsr_repeat;
    uint8_t sustain_point;
    uint8_t sustain_speed;
    uint8_t amf_length;
    uint8_t amf_repeat;
    Is2EnvelopeGeneratorMode eg_mode;
    uint8_t start_len;
    uint8_t stop_rep;
    uint8_t speed_up;
    uint8_t speed_down;
    uint8_t adsr_table[128];
    int8_t lfo_table[128];
    Is2Arpeggio arpeggios[3];
    uint8_t eg_table[128];
    int8_t waveform1[256];
    int8_t waveform2[256];
} Is2Instrument;

typedef struct Is2VoiceInfo {
    // Position information
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;

    // Track row information
    uint8_t note;
    uint8_t instrument;
    bool disable_sound_transpose;
    bool disable_note_transpose;
    uint8_t arpeggio;
    Is2Effect effect;
    uint8_t effect_arg;

    uint8_t transposed_note;
    uint8_t previous_transposed_note;

    uint8_t transposed_instrument;
    Is2VoicePlayingMode playing_mode;

    uint8_t current_volume;

    uint16_t arpeggio_position;
    bool arpeggio_effect_nibble;

    int8_t slide_speed;
    int16_t slide_value;

    uint16_t portamento_speed_counter;
    uint16_t portamento_speed;

    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    uint8_t vibrato_level;
    uint16_t vibrato_position;

    uint16_t adsr_position;
    uint16_t sustain_counter;

    int8_t eg_duration;
    uint16_t eg_position;

    uint16_t lfo_position;
} Is2VoiceInfo;

typedef struct Is2GlobalPlayingInfo {
    uint8_t speed_counter;
    uint8_t current_speed;
    int16_t song_position;
    uint8_t row_position;
    uint8_t rows_per_track;
} Is2GlobalPlayingInfo;

// Channel state for Amiga mixer
typedef struct Is2Channel {
    int8_t* sample_data;
    uint32_t sample_length;
    uint32_t sample_offset;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t period;
    uint16_t volume;            // 0..64 for Amiga, 0..256 for synth
    uint64_t position_fp;
    bool active;
    bool muted;
    int16_t sample_number;
    bool use_volume_256;        // true if SetVolume(0-256), false if SetAmigaVolume(0-64)
} Is2Channel;

// Big-endian reader
typedef struct Is2Reader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} Is2Reader;

typedef struct Is2Module {
    float sample_rate;
    float playing_frequency;

    Is2SongInfo* sub_songs;
    int num_sub_songs;

    Is2SinglePositionInfo** positions;  // positions[i] is array of 4
    int num_positions;

    Is2TrackLine* track_lines;
    int num_track_lines;

    Is2Sample* samples;
    int num_samples;

    int8_t** sample_data;
    int num_sample_data;

    Is2Instrument* instruments;
    int num_instruments;

    Is2SongInfo* current_song_info;

    Is2GlobalPlayingInfo playing_info;
    Is2VoiceInfo voices[4];
    Is2Channel channels[4];

    bool end_reached;
    bool has_ended;

    // Timing
    float tick_accumulator;
    float ticks_per_frame;

    // Position visit tracking
    uint8_t visited[1024];
} Is2Module;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_reader_init(Is2Reader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool is2_reader_eof(const Is2Reader* r) {
    return r->pos > r->size;
}

static uint8_t is2_reader_u8(Is2Reader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t is2_reader_i8(Is2Reader* r) {
    return (int8_t)is2_reader_u8(r);
}

static uint16_t is2_reader_b_u16(Is2Reader* r) {
    uint8_t hi = is2_reader_u8(r);
    uint8_t lo = is2_reader_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t is2_reader_b_u32(Is2Reader* r) {
    uint16_t hi = is2_reader_b_u16(r);
    uint16_t lo = is2_reader_b_u16(r);
    return ((uint32_t)hi << 16) | lo;
}

static void is2_reader_skip(Is2Reader* r, size_t bytes) {
    r->pos += bytes;
}

static void is2_reader_read(Is2Reader* r, void* dst, size_t len) {
    for (size_t i = 0; i < len; i++)
        ((uint8_t*)dst)[i] = is2_reader_u8(r);
}

static void is2_reader_read_signed(Is2Reader* r, int8_t* dst, size_t len) {
    for (size_t i = 0; i < len; i++)
        dst[i] = is2_reader_i8(r);
}

static bool is2_reader_read_mark(Is2Reader* r, char* buf, int len) {
    for (int i = 0; i < len; i++)
        buf[i] = (char)is2_reader_u8(r);
    buf[len] = '\0';
    return !is2_reader_eof(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Visit tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_clear_visited(Is2Module* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static void is2_mark_visited(Is2Module* m, int pos) {
    if (pos >= 0 && pos < 1024)
        m->visited[pos] = 1;
}

static bool is2_has_visited(const Is2Module* m, int pos) {
    if (pos >= 0 && pos < 1024)
        return m->visited[pos] != 0;
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel operations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_ch_mute(Is2Channel* ch) {
    ch->active = false;
    ch->position_fp = 0;
}

static void is2_ch_play_sample(Is2Channel* ch, int16_t sample_number, int8_t* data, uint32_t start_offset, uint32_t length) {
    ch->sample_number = sample_number;
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
    ch->loop_start = 0;
    ch->loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    ch->use_volume_256 = false;
}

static void is2_ch_set_sample(Is2Channel* ch, int8_t* data, uint32_t start_offset, uint32_t length) {
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
}

static void is2_ch_set_loop(Is2Channel* ch, uint32_t start_offset, uint32_t length) {
    ch->loop_start = start_offset;
    ch->loop_length = length;
}

static void is2_ch_set_amiga_period(Is2Channel* ch, uint16_t period) {
    ch->period = period;
}

static void is2_ch_set_amiga_volume(Is2Channel* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->volume = vol;
    ch->use_volume_256 = false;
}

static void is2_ch_set_volume(Is2Channel* ch, uint16_t vol) {
    // Volume 0-256 range
    if (vol > 256) vol = 256;
    ch->volume = vol;
    ch->use_volume_256 = true;
}

static void is2_ch_set_sample_number(Is2Channel* ch, int16_t num) {
    ch->sample_number = num;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool is2_read_sub_songs(Is2Module* m, Is2Reader* r) {
    char mark[5];
    is2_reader_read_mark(r, mark, 4);
    if (strcmp(mark, "STBL") != 0)
        return false;

    uint32_t num = is2_reader_b_u32(r);
    m->num_sub_songs = (int)num;
    m->sub_songs = (Is2SongInfo*)calloc(num, sizeof(Is2SongInfo));

    for (uint32_t i = 0; i < num; i++) {
        Is2SongInfo* si = &m->sub_songs[i];

        si->start_speed = is2_reader_u8(r);
        si->rows_per_track = is2_reader_u8(r);
        si->first_position = is2_reader_b_u16(r);
        si->last_position = is2_reader_b_u16(r);
        si->restart_position = is2_reader_b_u16(r);
        si->tempo = is2_reader_b_u16(r);

        if (is2_reader_eof(r))
            return false;
    }

    return true;
}

static bool is2_read_positions(Is2Module* m, Is2Reader* r) {
    char mark[5];
    is2_reader_read_mark(r, mark, 4);
    if (strcmp(mark, "OVTB") != 0)
        return false;

    uint32_t num = is2_reader_b_u32(r);
    m->num_positions = (int)num;
    m->positions = (Is2SinglePositionInfo**)calloc(num, sizeof(Is2SinglePositionInfo*));

    for (uint32_t i = 0; i < num; i++) {
        m->positions[i] = (Is2SinglePositionInfo*)calloc(4, sizeof(Is2SinglePositionInfo));

        for (int j = 0; j < 4; j++) {
            Is2SinglePositionInfo* sp = &m->positions[i][j];

            sp->start_track_row = is2_reader_b_u16(r);
            sp->sound_transpose = is2_reader_i8(r);
            sp->note_transpose = is2_reader_i8(r);
        }

        if (is2_reader_eof(r))
            return false;
    }

    return true;
}

static bool is2_read_track_rows(Is2Module* m, Is2Reader* r) {
    char mark[5];
    is2_reader_read_mark(r, mark, 4);
    if (strcmp(mark, "NTBL") != 0)
        return false;

    uint32_t num = is2_reader_b_u32(r);
    m->num_track_lines = (int)num;
    m->track_lines = (Is2TrackLine*)calloc(num, sizeof(Is2TrackLine));

    for (uint32_t i = 0; i < num; i++) {
        Is2TrackLine* tl = &m->track_lines[i];

        uint8_t byt1 = is2_reader_u8(r);
        uint8_t byt2 = is2_reader_u8(r);
        uint8_t byt3 = is2_reader_u8(r);
        uint8_t byt4 = is2_reader_u8(r);

        tl->note = byt1;
        tl->instrument = byt2;
        tl->disable_sound_transpose = (byt3 & 0x80) != 0;
        tl->disable_note_transpose = (byt3 & 0x40) != 0;
        tl->arpeggio = (uint8_t)((byt3 & 0x30) >> 4);
        tl->effect = (Is2Effect)(byt3 & 0x0f);
        tl->effect_arg = byt4;

        if (is2_reader_eof(r))
            return false;
    }

    return true;
}

static bool is2_read_sample_info(Is2Module* m, Is2Reader* r) {
    char mark[5];
    is2_reader_read_mark(r, mark, 4);
    if (strcmp(mark, "SAMP") != 0)
        return false;

    uint32_t num = is2_reader_b_u32(r);
    m->num_samples = (int)num;
    m->samples = (Is2Sample*)calloc(num, sizeof(Is2Sample));

    for (uint32_t i = 0; i < num; i++) {
        Is2Sample* samp = &m->samples[i];

        samp->one_shot_length = is2_reader_b_u16(r);
        samp->repeat_length = is2_reader_b_u16(r);
        samp->sample_number = is2_reader_i8(r);
        samp->volume = is2_reader_u8(r);
        samp->vibrato_delay = is2_reader_u8(r);
        samp->vibrato_speed = is2_reader_u8(r);
        samp->vibrato_level = is2_reader_u8(r);
        samp->portamento_speed = is2_reader_u8(r);

        if (is2_reader_eof(r))
            return false;

        is2_reader_skip(r, 6);  // skip pad
    }

    // Skip sample names (20 bytes each)
    for (uint32_t i = 0; i < num; i++) {
        is2_reader_skip(r, 20);
        if (is2_reader_eof(r))
            return false;
    }

    // Skip copy of sample lengths and loop lengths stored in words
    is2_reader_skip(r, num * 4 * 2);

    return true;
}

static bool is2_read_sample_data(Is2Module* m, Is2Reader* r) {
    int num = m->num_samples;

    if (num > 0) {
        uint32_t* sample_lengths = (uint32_t*)calloc(num, sizeof(uint32_t));
        for (int i = 0; i < num; i++)
            sample_lengths[i] = is2_reader_b_u32(r);

        if (is2_reader_eof(r)) {
            free(sample_lengths);
            return false;
        }

        m->sample_data = (int8_t**)calloc(num, sizeof(int8_t*));
        m->num_sample_data = num;

        // Sample data are stored in reverse order
        for (int i = num - 1; i >= 0; i--) {
            uint32_t len = sample_lengths[i];
            m->sample_data[i] = (int8_t*)malloc(len);
            is2_reader_read_signed(r, m->sample_data[i], len);

            if (is2_reader_eof(r)) {
                free(sample_lengths);
                return false;
            }
        }

        free(sample_lengths);
    }

    return true;
}

static bool is2_read_instruments(Is2Module* m, Is2Reader* r) {
    char mark[5];
    is2_reader_read_mark(r, mark, 4);
    if (strcmp(mark, "SYNT") != 0)
        return false;

    uint32_t num = is2_reader_b_u32(r);
    m->num_instruments = (int)num;
    m->instruments = (Is2Instrument*)calloc(num, sizeof(Is2Instrument));

    for (uint32_t i = 0; i < num; i++) {
        Is2Instrument* instr = &m->instruments[i];

        is2_reader_read_mark(r, mark, 4);
        if (strcmp(mark, "IS20") != 0)
            return false;

        is2_reader_skip(r, 20);  // skip name

        instr->waveform_length = is2_reader_b_u16(r);
        instr->volume = is2_reader_u8(r);
        instr->vibrato_delay = is2_reader_u8(r);
        instr->vibrato_speed = is2_reader_u8(r);
        instr->vibrato_level = is2_reader_u8(r);
        instr->portamento_speed = is2_reader_u8(r);
        instr->adsr_length = is2_reader_u8(r);
        instr->adsr_repeat = is2_reader_u8(r);

        if (is2_reader_eof(r))
            return false;

        is2_reader_skip(r, 4);  // skip padding

        instr->sustain_point = is2_reader_u8(r);
        instr->sustain_speed = is2_reader_u8(r);
        instr->amf_length = is2_reader_u8(r);
        instr->amf_repeat = is2_reader_u8(r);

        uint8_t eg_mode = is2_reader_u8(r);
        uint8_t eg_enabled = is2_reader_u8(r);

        instr->eg_mode = eg_enabled == 0 ? IS2_EG_DISABLED : eg_mode == 0 ? IS2_EG_CALC : IS2_EG_FREE;

        instr->start_len = is2_reader_u8(r);
        instr->stop_rep = is2_reader_u8(r);
        instr->speed_up = is2_reader_u8(r);
        instr->speed_down = is2_reader_u8(r);

        if (is2_reader_eof(r))
            return false;

        is2_reader_skip(r, 19);  // skip padding

        is2_reader_read(r, instr->adsr_table, 128);
        is2_reader_read_signed(r, instr->lfo_table, 128);

        for (int j = 0; j < 3; j++) {
            instr->arpeggios[j].length = is2_reader_u8(r);
            instr->arpeggios[j].repeat = is2_reader_u8(r);
            is2_reader_read_signed(r, instr->arpeggios[j].values, 14);
        }

        is2_reader_read(r, instr->eg_table, 128);
        is2_reader_read_signed(r, instr->waveform1, 256);
        is2_reader_read_signed(r, instr->waveform2, 256);
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_initialize_sound(Is2Module* m, int sub_song) {
    m->current_song_info = &m->sub_songs[sub_song];

    m->playing_info.speed_counter = m->current_song_info->start_speed;
    m->playing_info.current_speed = m->current_song_info->start_speed;
    m->playing_info.song_position = (int16_t)(m->current_song_info->first_position - 1);
    m->playing_info.row_position = m->current_song_info->rows_per_track;
    m->playing_info.rows_per_track = m->current_song_info->rows_per_track;

    for (int i = 0; i < 4; i++) {
        Is2VoiceInfo* v = &m->voices[i];
        memset(v, 0, sizeof(Is2VoiceInfo));
        v->playing_mode = IS2_MODE_SAMPLE;

        Is2Channel* ch = &m->channels[i];
        memset(ch, 0, sizeof(Is2Channel));
    }

    uint16_t tempo = m->current_song_info->tempo;
    if (tempo == 0) tempo = 50;

    m->playing_frequency = (float)tempo;
    m->ticks_per_frame = m->sample_rate / m->playing_frequency;
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick immediately

    m->end_reached = false;
    m->has_ended = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - SetEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_set_effects(Is2Module* m, Is2VoiceInfo* v) {
    switch (v->effect) {
        case IS2_EFFECT_SET_SLIDE_SPEED:
            v->slide_speed = (int8_t)v->effect_arg;
            break;

        case IS2_EFFECT_RESTART_ADSR:
            v->adsr_position = v->effect_arg;
            break;

        case IS2_EFFECT_SET_PORTAMENTO:
            v->portamento_speed_counter = v->effect_arg;
            v->portamento_speed = v->effect_arg;
            break;

        case IS2_EFFECT_SET_VOLUME_INCREMENT: {
            int new_vol = v->current_volume + (int8_t)v->effect_arg;
            if (new_vol < 0)
                new_vol = 0;
            else {
                if (v->playing_mode == IS2_MODE_SAMPLE) {
                    if (new_vol > 64) new_vol = 64;
                } else {
                    if (new_vol > 255) new_vol = 255;
                }
            }
            v->current_volume = (uint8_t)new_vol;
            break;
        }

        case IS2_EFFECT_POSITION_JUMP:
            m->playing_info.song_position = v->effect_arg;
            m->playing_info.row_position = m->playing_info.rows_per_track;
            break;

        case IS2_EFFECT_TRACK_BREAK:
            m->playing_info.row_position = m->playing_info.rows_per_track;
            break;

        case IS2_EFFECT_SET_VOLUME: {
            uint8_t nv = v->effect_arg;
            if ((v->playing_mode == IS2_MODE_SAMPLE) && (nv > 64))
                nv = 64;
            v->current_volume = nv;
            break;
        }

        case IS2_EFFECT_SET_TRACK_LEN:
            if (v->effect_arg <= 64)
                m->playing_info.rows_per_track = v->effect_arg;
            break;

        case IS2_EFFECT_SET_FILTER:
            // No filter in our implementation
            break;

        case IS2_EFFECT_SET_SPEED:
            if ((v->effect_arg > 0) && (v->effect_arg <= 16))
                m->playing_info.current_speed = v->effect_arg;
            break;

        case IS2_EFFECT_SET_VIBRATO:
            v->vibrato_delay = 0;
            v->vibrato_speed = (uint8_t)(((v->effect_arg >> 4) & 0x0f) * 2);
            v->vibrato_level = (uint8_t)((-((v->effect_arg & 0x0f) << 4)) + 160);
            break;

        default:
            break;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - Transpose, Reset, Force Quiet
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_set_transpose(Is2VoiceInfo* v, uint8_t* note, uint8_t* instr_num) {
    if (!v->disable_note_transpose || v->disable_sound_transpose)
        *note = (uint8_t)(*note + v->note_transpose);

    if (!v->disable_sound_transpose || v->disable_note_transpose)
        *instr_num = (uint8_t)(*instr_num + v->sound_transpose);
}

static void is2_reset_voice(Is2VoiceInfo* v) {
    v->transposed_instrument = 0;
    v->arpeggio_position = 0;
    v->slide_speed = 0;
    v->slide_value = 0;
    v->vibrato_position = 0;
    v->adsr_position = 0;
    v->sustain_counter = 0;
    v->eg_duration = 0;
    v->eg_position = 0;
    v->lfo_position = 0;

    if (v->effect != IS2_EFFECT_SET_PORTAMENTO) {
        v->portamento_speed_counter = 0;
        v->portamento_speed = 0;
    }

    if (v->effect != IS2_EFFECT_SET_VIBRATO) {
        v->vibrato_delay = 0;
        v->vibrato_speed = 0;
        v->vibrato_level = 0;
    }
}

static void is2_force_quiet(Is2VoiceInfo* v, Is2Channel* ch) {
    is2_ch_mute(ch);
    v->current_volume = 0;
    v->transposed_instrument = 0;
    v->playing_mode = IS2_MODE_SAMPLE;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - RestoreVoice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_restore_voice(Is2Module* m, Is2VoiceInfo* v, uint8_t instr_num) {
    instr_num &= 0x3f;
    v->transposed_instrument = instr_num;

    if (v->playing_mode == IS2_MODE_SAMPLE) {
        Is2Sample* samp = &m->samples[instr_num - 1];

        if (v->effect != IS2_EFFECT_SET_VIBRATO) {
            v->vibrato_delay = samp->vibrato_delay;
            v->vibrato_speed = samp->vibrato_speed;
            v->vibrato_level = samp->vibrato_level;
        }

        if ((v->effect != IS2_EFFECT_SKIP_PORTAMENTO) && (v->effect != IS2_EFFECT_SET_PORTAMENTO)) {
            v->portamento_speed_counter = samp->portamento_speed;
            v->portamento_speed = samp->portamento_speed;
        }

        if ((v->effect != IS2_EFFECT_SET_VOLUME) && (v->effect != IS2_EFFECT_SET_VOLUME_INCREMENT))
            v->current_volume = samp->volume;
    } else {
        Is2Instrument* instr = &m->instruments[instr_num - 1];

        if (v->effect != IS2_EFFECT_SET_VIBRATO) {
            v->vibrato_delay = instr->vibrato_delay;
            v->vibrato_speed = instr->vibrato_speed;
            v->vibrato_level = instr->vibrato_level;
        }

        if ((v->effect != IS2_EFFECT_SKIP_PORTAMENTO) && (v->effect != IS2_EFFECT_SET_PORTAMENTO)) {
            v->portamento_speed_counter = instr->portamento_speed;
            v->portamento_speed = instr->portamento_speed;
        }

        if ((v->effect != IS2_EFFECT_SET_VOLUME) && (v->effect != IS2_EFFECT_SET_VOLUME_INCREMENT))
            v->current_volume = instr->volume;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - SetSampleInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_set_sample_instrument(Is2Module* m, Is2VoiceInfo* v, Is2Channel* ch, uint8_t instr_num) {
    v->playing_mode = IS2_MODE_SAMPLE;

    instr_num &= 0x3f;
    v->transposed_instrument = instr_num;

    Is2Sample* samp = &m->samples[instr_num - 1];

    if (v->effect != IS2_EFFECT_SET_VIBRATO) {
        v->vibrato_delay = samp->vibrato_delay;
        v->vibrato_speed = samp->vibrato_speed;
        v->vibrato_level = samp->vibrato_level;
    }

    if ((v->effect != IS2_EFFECT_SKIP_PORTAMENTO) && (v->effect != IS2_EFFECT_SET_PORTAMENTO)) {
        v->portamento_speed_counter = samp->portamento_speed;
        v->portamento_speed = samp->portamento_speed;
    }

    if ((samp->sample_number < 0) || (m->sample_data[samp->sample_number] == nullptr)) {
        is2_force_quiet(v, ch);
        return;
    }

    int8_t* data = m->sample_data[samp->sample_number];

    uint32_t play_length = samp->one_shot_length;
    uint32_t loop_start = 0;
    uint32_t loop_length = 0;

    if (samp->repeat_length == 0)
        loop_length = samp->one_shot_length;
    else if (samp->repeat_length != 1) {
        play_length += samp->repeat_length;
        loop_start = samp->one_shot_length;
        loop_length = samp->repeat_length;
    }

    is2_ch_play_sample(ch, instr_num, data, 0, play_length * 2U);

    if (loop_length != 0)
        is2_ch_set_loop(ch, loop_start * 2U, loop_length * 2U);

    if ((v->effect != IS2_EFFECT_SET_VOLUME) && (v->effect != IS2_EFFECT_SET_VOLUME_INCREMENT)) {
        v->current_volume = samp->volume;
        is2_ch_set_amiga_volume(ch, samp->volume);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - SetSynthInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_set_synth_instrument(Is2Module* m, Is2VoiceInfo* v, Is2Channel* ch, uint8_t instr_num) {
    v->playing_mode = IS2_MODE_SYNTH;

    instr_num &= 0x3f;
    v->transposed_instrument = instr_num;

    if (instr_num == 0) {
        is2_force_quiet(v, ch);
        return;
    }

    Is2Instrument* instr = &m->instruments[instr_num - 1];

    if (v->effect != IS2_EFFECT_SET_VIBRATO) {
        v->vibrato_delay = instr->vibrato_delay;
        v->vibrato_speed = instr->vibrato_speed;
        v->vibrato_level = instr->vibrato_level;
    }

    if ((v->effect != IS2_EFFECT_SKIP_PORTAMENTO) && (v->effect != IS2_EFFECT_SET_PORTAMENTO)) {
        v->portamento_speed_counter = instr->portamento_speed;
        v->portamento_speed = instr->portamento_speed;
    }

    uint8_t eg_val;

    switch (instr->eg_mode) {
        case IS2_EG_DISABLED:
        default:
            v->eg_duration = 0;
            eg_val = 0;
            break;

        case IS2_EG_FREE:
            v->eg_position = 0;
            if ((uint8_t)(instr->start_len + instr->stop_rep) == 0) {
                v->eg_duration = 0;
                eg_val = 0;
            } else {
                eg_val = instr->eg_table[0];
            }
            break;

        case IS2_EG_CALC:
            v->eg_position = (uint16_t)(instr->start_len << 8);
            v->eg_duration = 1;
            eg_val = instr->start_len;
            break;
    }

    int8_t* waveform = (eg_val & 1) != 0 ? instr->waveform2 : instr->waveform1;
    uint32_t length = instr->waveform_length;
    uint32_t start_offset = (uint32_t)eg_val & 0xfe;

    is2_ch_play_sample(ch, (int16_t)(instr_num + m->num_samples), waveform, start_offset, length);
    is2_ch_set_loop(ch, start_offset, length);

    if ((v->effect != IS2_EFFECT_SET_VOLUME) && (v->effect != IS2_EFFECT_SET_VOLUME_INCREMENT))
        v->current_volume = instr->volume;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - PlayVoice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_play_voice(Is2Module* m, Is2VoiceInfo* v, Is2Channel* ch) {
    is2_set_effects(m, v);

    uint8_t note = v->note;
    uint8_t instr_num = v->instrument;

    if (note == 0) {
        if (instr_num != 0)
            is2_restore_voice(m, v, instr_num);
    } else {
        if (note != 0x80) {
            if (note == 0x7f)
                is2_force_quiet(v, ch);
            else {
                is2_set_transpose(v, &note, &instr_num);

                v->previous_transposed_note = v->transposed_note;
                v->transposed_note = note;

                if (instr_num <= 127) {
                    is2_reset_voice(v);

                    if (instr_num >= 64)
                        is2_set_sample_instrument(m, v, ch, instr_num);
                    else
                        is2_set_synth_instrument(m, v, ch, instr_num);
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - GetNextRow / GetNextPosition / GetNewNotes / CheckForNewInstruments / UpdateVoices
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_get_next_position(Is2Module* m) {
    m->playing_info.song_position++;

    if (m->playing_info.song_position > (int16_t)m->current_song_info->last_position)
        m->playing_info.song_position = (int16_t)m->current_song_info->restart_position;

    if (is2_has_visited(m, m->playing_info.song_position))
        m->end_reached = true;

    is2_mark_visited(m, m->playing_info.song_position);

    Is2SinglePositionInfo* pos_row = m->positions[m->playing_info.song_position];

    for (int i = 0; i < 4; i++) {
        Is2VoiceInfo* v = &m->voices[i];
        v->start_track_row = pos_row[i].start_track_row;
        v->sound_transpose = pos_row[i].sound_transpose;
        v->note_transpose = pos_row[i].note_transpose;
    }
}

static void is2_get_new_notes(Is2Module* m) {
    for (int i = 0; i < 4; i++) {
        Is2VoiceInfo* v = &m->voices[i];

        int position = v->start_track_row + m->playing_info.row_position;
        Is2TrackLine empty_track = {0};
        Is2TrackLine* tl = position < m->num_track_lines ? &m->track_lines[position] : &empty_track;

        v->note = tl->note;
        v->instrument = tl->instrument;
        v->disable_sound_transpose = tl->disable_sound_transpose;
        v->disable_note_transpose = tl->disable_note_transpose;
        v->arpeggio = tl->arpeggio;
        v->effect = tl->effect;
        v->effect_arg = tl->effect_arg;
    }
}

static void is2_check_for_new_instruments(Is2Module* m) {
    for (int i = 0; i < 4; i++) {
        Is2VoiceInfo* v = &m->voices[i];
        if ((v->note != 0) && (v->instrument != 0))
            v->transposed_instrument = 0;
    }
}

static void is2_update_voices(Is2Module* m) {
    for (int i = 0; i < 4; i++)
        is2_play_voice(m, &m->voices[i], &m->channels[i]);
}

static void is2_get_next_row(Is2Module* m) {
    m->playing_info.row_position++;

    if (m->playing_info.row_position >= m->playing_info.rows_per_track) {
        m->playing_info.row_position = 0;
        is2_get_next_position(m);
    }

    is2_get_new_notes(m);
    is2_check_for_new_instruments(m);
    is2_update_voices(m);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback - UpdateEffects (per-tick)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_do_portamento(uint16_t* period, uint16_t* prev_period, Is2VoiceInfo* v) {
    if ((v->portamento_speed != 0) && (v->portamento_speed_counter != 0) && (*period != *prev_period)) {
        v->portamento_speed_counter--;

        // swap
        uint16_t tmp = *period;
        *period = *prev_period;
        *prev_period = tmp;

        int new_period = (*period - *prev_period) * (int)v->portamento_speed_counter;

        if (v->portamento_speed != 0)
            new_period /= (int)v->portamento_speed;

        new_period += *prev_period;
        *period = (uint16_t)new_period;
    }
}

static void is2_do_vibrato(uint16_t* period, Is2VoiceInfo* v) {
    if (v->vibrato_delay != 255) {
        if (v->vibrato_delay == 0) {
            int8_t vib_val = is2_vibrato[v->vibrato_position];
            uint8_t vib_level = v->vibrato_level;

            if (vib_val < 0) {
                if (vib_level != 0)
                    *period -= (uint16_t)((-vib_val * 4) / vib_level);
            } else {
                if (vib_level != 0)
                    *period += (uint16_t)((vib_val * 4) / vib_level);
            }

            v->vibrato_position = (uint16_t)((v->vibrato_position + v->vibrato_speed) & 0xff);
        } else {
            v->vibrato_delay--;
        }
    }

    *period = (uint16_t)(*period + v->slide_value);
}

static void is2_do_lfo(uint16_t* period, Is2VoiceInfo* v, Is2Instrument* instr) {
    if ((instr->amf_length + instr->amf_repeat) != 0) {
        int8_t lfo_val = instr->lfo_table[v->lfo_position];
        *period = (uint16_t)(*period - lfo_val);

        if (v->lfo_position == (instr->amf_length + instr->amf_repeat))
            v->lfo_position = instr->amf_length;
        else
            v->lfo_position++;
    }
}

static void is2_do_adsr(Is2VoiceInfo* v, Is2Channel* ch, Is2Instrument* instr) {
    if ((instr->adsr_length + instr->adsr_repeat) == 0) {
        is2_ch_set_volume(ch, v->current_volume);
    } else {
        uint8_t adsr_val = instr->adsr_table[v->adsr_position];
        uint16_t vol = (uint16_t)((v->current_volume * adsr_val) / 256);
        is2_ch_set_volume(ch, vol);

        if (v->adsr_position >= (instr->adsr_length + instr->adsr_repeat))
            v->adsr_position = instr->adsr_length;
        else {
            if ((v->note != 0x80) || (instr->sustain_speed == 1) || (v->adsr_position < instr->sustain_point))
                v->adsr_position++;
            else {
                if (instr->sustain_speed != 0) {
                    if (v->sustain_counter == 0) {
                        v->sustain_counter = instr->sustain_speed;
                        v->adsr_position++;
                    } else {
                        v->sustain_counter--;
                    }
                }
            }
        }
    }
}

static void is2_do_sample_arpeggio(Is2VoiceInfo* v, uint16_t* period, uint16_t* prev_period) {
    uint8_t note = v->transposed_note;
    uint8_t prev_note = v->previous_transposed_note;

    if (v->effect == IS2_EFFECT_ARPEGGIO) {
        uint8_t arp_val = v->arpeggio_effect_nibble ? (v->effect_arg & 0x0f) : (v->effect_arg >> 4);
        v->arpeggio_effect_nibble = !v->arpeggio_effect_nibble;

        note += arp_val;
        prev_note += arp_val;
    }

    *period = is2_periods[note < IS2_PERIODS_LEN ? note : 0];
    *prev_period = is2_periods[prev_note < IS2_PERIODS_LEN ? prev_note : 0];
}

static void is2_do_synth_arpeggio(Is2VoiceInfo* v, Is2Instrument* instr, uint16_t* period, uint16_t* prev_period) {
    uint8_t note = v->transposed_note;
    uint8_t prev_note = v->previous_transposed_note;

    if (v->arpeggio != 0) {
        Is2Arpeggio* arp = &instr->arpeggios[v->arpeggio - 1];

        int8_t arp_val = arp->values[v->arpeggio_position];
        note = (uint8_t)(note + arp_val);
        prev_note = (uint8_t)(prev_note + arp_val);

        if (v->arpeggio_position == (arp->length + arp->repeat))
            v->arpeggio_position = arp->length;
        else
            v->arpeggio_position++;
    }

    *period = note < IS2_PERIODS_LEN ? is2_periods[note] : 0;
    *prev_period = prev_note < IS2_PERIODS_LEN ? is2_periods[prev_note] : 0;
}

// Forward declaration needed for is2_do_envelope_generator which uses m
// We already inlined it above, but it references 'm' which needs to be passed.
// Let me restructure: the is2_do_envelope_generator needs the module pointer.

static void is2_update_voice_effect(Is2Module* m, Is2VoiceInfo* v, Is2Channel* ch) {
    if (v->transposed_instrument == 0) {
        is2_ch_mute(ch);
        return;
    }

    if (v->playing_mode == IS2_MODE_SAMPLE) {
        uint16_t period, prev_period;
        is2_do_sample_arpeggio(v, &period, &prev_period);
        is2_do_portamento(&period, &prev_period, v);
        is2_do_vibrato(&period, v);

        is2_ch_set_amiga_period(ch, period);
        is2_ch_set_amiga_volume(ch, v->current_volume);
    } else {
        Is2Instrument* instr = &m->instruments[v->transposed_instrument - 1];

        uint16_t period, prev_period;
        is2_do_synth_arpeggio(v, instr, &period, &prev_period);
        is2_do_portamento(&period, &prev_period, v);
        is2_do_vibrato(&period, v);
        is2_do_lfo(&period, v, instr);

        is2_ch_set_amiga_period(ch, period);

        is2_do_adsr(v, ch, instr);

        // Envelope generator
        if (instr->eg_mode != IS2_EG_DISABLED) {
            uint8_t eg_val;

            if (instr->eg_mode == IS2_EG_FREE) {
                int len = instr->start_len + instr->stop_rep;
                if (len != 0) {
                    if (v->eg_position >= (uint16_t)len)
                        v->eg_position = instr->start_len;
                    else
                        v->eg_position++;

                    eg_val = instr->eg_table[v->eg_position];

                    int8_t* waveform = (eg_val & 1) != 0 ? instr->waveform2 : instr->waveform1;
                    uint32_t length = instr->waveform_length;
                    uint32_t start_offset = (uint32_t)eg_val & 0xfe;

                    is2_ch_set_sample(ch, waveform, start_offset, length);
                    is2_ch_set_loop(ch, start_offset, length);
                    is2_ch_set_sample_number(ch, (int16_t)(v->transposed_instrument - 1 + m->num_samples));
                }
            } else {
                // Calc mode
                if (v->eg_duration != 0) {
                    uint16_t position = v->eg_position;

                    if (v->eg_duration > 0) {
                        position = (uint16_t)(position + instr->speed_up * 32);

                        if ((position >> 8) >= instr->stop_rep) {
                            v->eg_position = (uint16_t)(instr->stop_rep << 8);
                            v->eg_duration = -1;
                        } else {
                            v->eg_position = position;
                        }
                    } else {
                        position = (uint16_t)(position - instr->speed_down * 32);

                        if ((position >> 8) >= instr->start_len) {
                            v->eg_position = (uint16_t)(instr->start_len << 8);
                            v->eg_duration = 1;
                        } else {
                            v->eg_position = position;
                        }
                    }

                    eg_val = (uint8_t)(v->eg_position >> 8);

                    int8_t* waveform = (eg_val & 1) != 0 ? instr->waveform2 : instr->waveform1;
                    uint32_t length = instr->waveform_length;
                    uint32_t start_offset = (uint32_t)eg_val & 0xfe;

                    is2_ch_set_sample(ch, waveform, start_offset, length);
                    is2_ch_set_loop(ch, start_offset, length);
                    is2_ch_set_sample_number(ch, (int16_t)(v->transposed_instrument - 1 + m->num_samples));
                }
            }
        }
    }

    v->slide_value -= v->slide_speed;
}

static void is2_update_effects(Is2Module* m) {
    for (int i = 0; i < 4; i++)
        is2_update_voice_effect(m, &m->voices[i], &m->channels[i]);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void is2_play_tick(Is2Module* m) {
    m->playing_info.speed_counter++;

    if (m->playing_info.speed_counter >= m->playing_info.current_speed) {
        m->playing_info.speed_counter = 0;
        is2_get_next_row(m);
    }

    is2_update_effects(m);

    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga Mixer + Render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static float is2_get_channel_volume(Is2Channel* c) {
    if (c->use_volume_256)
        return (float)c->volume / 256.0f;
    else
        return (float)c->volume / 64.0f;
}

size_t is2_render(Is2Module* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0)
        return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            is2_play_tick(module);
        }

        float left = 0.0f, right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            Is2Channel* c = &module->channels[ch];

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr)
                continue;

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            float sample = 0.0f;
            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            sample *= is2_get_channel_volume(c);

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

size_t is2_render_multi(Is2Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0)
        return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            is2_play_tick(module);
        }

        for (int ch = 0; ch < 4; ch++) {
            Is2Channel* c = &module->channels[ch];

            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f;
                continue;
            }

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);

            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            float sample = 0.0f;
            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;

            sample *= is2_get_channel_volume(c);

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

Is2Module* is2_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 16)
        return nullptr;

    // Check mark
    if (memcmp(data, "IS20DF10", 8) != 0)
        return nullptr;

    Is2Module* m = (Is2Module*)calloc(1, sizeof(Is2Module));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    Is2Reader reader;
    is2_reader_init(&reader, data + 8, size - 8);

    if (!is2_read_sub_songs(m, &reader)) { is2_destroy(m); return nullptr; }
    if (!is2_read_positions(m, &reader)) { is2_destroy(m); return nullptr; }
    if (!is2_read_track_rows(m, &reader)) { is2_destroy(m); return nullptr; }
    if (!is2_read_sample_info(m, &reader)) { is2_destroy(m); return nullptr; }
    if (!is2_read_sample_data(m, &reader)) { is2_destroy(m); return nullptr; }
    if (!is2_read_instruments(m, &reader)) { is2_destroy(m); return nullptr; }

    if (m->num_sub_songs > 0) {
        is2_clear_visited(m);
        is2_initialize_sound(m, 0);
    }

    return m;
}

void is2_destroy(Is2Module* module) {
    if (!module) return;

    if (module->sub_songs) free(module->sub_songs);

    if (module->positions) {
        for (int i = 0; i < module->num_positions; i++)
            free(module->positions[i]);
        free(module->positions);
    }

    if (module->track_lines) free(module->track_lines);
    if (module->samples) free(module->samples);

    if (module->sample_data) {
        for (int i = 0; i < module->num_sample_data; i++)
            free(module->sample_data[i]);
        free(module->sample_data);
    }

    if (module->instruments) free(module->instruments);

    free(module);
}

int is2_subsong_count(const Is2Module* module) {
    if (!module) return 0;
    return module->num_sub_songs;
}

bool is2_select_subsong(Is2Module* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_sub_songs)
        return false;

    is2_clear_visited(module);
    is2_initialize_sound(module, subsong);
    return true;
}

int is2_channel_count(const Is2Module* module) {
    (void)module;
    return 4;
}

void is2_set_channel_mask(Is2Module* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool is2_has_ended(const Is2Module* module) {
    if (!module) return true;
    return module->has_ended;
}
