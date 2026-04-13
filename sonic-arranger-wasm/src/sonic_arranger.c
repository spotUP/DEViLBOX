// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "sonic_arranger.h"

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

typedef enum SaInstrumentType {
    SA_INSTRUMENT_SAMPLE = 0,
    SA_INSTRUMENT_SYNTH = 1
} SaInstrumentType;

typedef enum SaSynthesisEffect {
    SA_SYNTH_NONE = 0,
    SA_SYNTH_WAVE_NEGATOR = 1,
    SA_SYNTH_FREE_NEGATOR = 2,
    SA_SYNTH_ROTATE_VERTICAL = 3,
    SA_SYNTH_ROTATE_HORIZONTAL = 4,
    SA_SYNTH_ALIEN_VOICE = 5,
    SA_SYNTH_POLY_NEGATOR = 6,
    SA_SYNTH_SHACK_WAVE_1 = 7,
    SA_SYNTH_SHACK_WAVE_2 = 8,
    SA_SYNTH_METAMORPH = 9,
    SA_SYNTH_LASER = 10,
    SA_SYNTH_WAVE_ALIAS = 11,
    SA_SYNTH_NOISE_GENERATOR_1 = 12,
    SA_SYNTH_LOW_PASS_FILTER_1 = 13,
    SA_SYNTH_LOW_PASS_FILTER_2 = 14,
    SA_SYNTH_OSZILATOR = 15,
    SA_SYNTH_NOISE_GENERATOR_2 = 16,
    SA_SYNTH_FM_DRUM = 17
} SaSynthesisEffect;

typedef enum SaEffect {
    SA_EFFECT_ARPEGGIO = 0x0,
    SA_EFFECT_SET_SLIDE_SPEED = 0x1,
    SA_EFFECT_RESTART_ADSR = 0x2,
    SA_EFFECT_SET_VIBRATO = 0x4,
    SA_EFFECT_SYNC = 0x5,
    SA_EFFECT_SET_MASTER_VOLUME = 0x6,
    SA_EFFECT_SET_PORTAMENTO = 0x7,
    SA_EFFECT_SKIP_PORTAMENTO = 0x8,
    SA_EFFECT_SET_TRACK_LEN = 0x9,
    SA_EFFECT_VOLUME_SLIDE = 0xA,
    SA_EFFECT_POSITION_JUMP = 0xB,
    SA_EFFECT_SET_VOLUME = 0xC,
    SA_EFFECT_TRACK_BREAK = 0xD,
    SA_EFFECT_SET_FILTER = 0xE,
    SA_EFFECT_SET_SPEED = 0xF
} SaEffect;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SaArpeggio {
    uint8_t length;
    uint8_t repeat;
    int8_t values[14];
} SaArpeggio;

typedef struct SaTrackLine {
    uint8_t note;
    uint8_t instrument;
    bool disable_sound_transpose;
    bool disable_note_transpose;
    uint8_t arpeggio;
    SaEffect effect;
    uint8_t effect_arg;
} SaTrackLine;

typedef struct SaSinglePositionInfo {
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;
} SaSinglePositionInfo;

typedef struct SaSongInfo {
    uint16_t start_speed;
    uint16_t rows_per_track;
    uint16_t first_position;
    uint16_t last_position;
    uint16_t restart_position;
    uint16_t tempo;
} SaSongInfo;

typedef struct SaGlobalPlayingInfo {
    uint16_t master_volume;
    uint16_t speed_counter;
    uint16_t current_speed;
    int16_t song_position;
    uint16_t row_position;
    uint16_t rows_per_track;
} SaGlobalPlayingInfo;

typedef struct SaInstrument {
    char name[31];
    SaInstrumentType type;
    uint16_t waveform_number;
    uint16_t waveform_length;
    uint16_t repeat_length;
    uint16_t volume;
    int16_t fine_tuning;
    uint16_t portamento_speed;
    uint16_t vibrato_delay;
    uint16_t vibrato_speed;
    uint16_t vibrato_level;
    uint16_t amf_number;
    uint16_t amf_delay;
    uint16_t amf_length;
    uint16_t amf_repeat;
    uint16_t adsr_number;
    uint16_t adsr_delay;
    uint16_t adsr_length;
    uint16_t adsr_repeat;
    uint16_t sustain_point;
    uint16_t sustain_delay;
    SaSynthesisEffect effect;
    uint16_t effect_arg1;
    uint16_t effect_arg2;
    uint16_t effect_arg3;
    uint16_t effect_delay;
    SaArpeggio arpeggios[3];
} SaInstrument;

typedef struct SaVoiceInfo {
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
    SaEffect effect;
    uint8_t effect_arg;

    uint16_t transposed_note;
    uint16_t previous_transposed_note;

    SaInstrumentType instrument_type;
    SaInstrument* instrument_info;
    uint16_t transposed_instrument;

    uint16_t current_volume;
    int16_t volume_slide_speed;

    uint16_t vibrato_position;
    uint16_t vibrato_delay;
    uint16_t vibrato_speed;
    uint16_t vibrato_level;

    uint16_t portamento_speed;
    uint16_t portamento_period;

    uint16_t arpeggio_position;

    int16_t slide_speed;
    int16_t slide_value;

    uint16_t adsr_position;
    uint16_t adsr_delay_counter;
    uint16_t sustain_delay_counter;

    uint16_t amf_position;
    uint16_t amf_delay_counter;

    uint16_t synth_effect_position;
    uint16_t synth_effect_wave_position;
    uint16_t effect_delay_counter;

    uint8_t flag;

    int8_t waveform_buffer[128];
} SaVoiceInfo;

typedef struct SaPeriodInfo {
    uint16_t period;
    uint16_t previous_period;
} SaPeriodInfo;

typedef struct SaChannel {
    const int8_t* sample_data;
    uint32_t sample_length;
    uint32_t sample_offset;
    uint32_t loop_start;
    uint32_t loop_length;
    uint64_t position_fp;
    uint16_t period;
    uint16_t volume;
    bool active;
    bool muted;
    int16_t sample_number;
} SaChannel;

struct SaModule {
    // Module data
    SaSongInfo* sub_songs;
    int num_sub_songs;

    SaSinglePositionInfo** positions;  // [num_positions][4]
    int num_positions;

    SaTrackLine* track_lines;
    int num_track_lines;

    SaInstrument* instruments;
    int num_instruments;

    int8_t** sample_data;
    uint32_t* sample_lengths;
    int num_samples;

    int8_t** waveform_data;
    int num_waveforms;

    uint8_t** adsr_tables;
    int num_adsr_tables;

    int8_t** amf_tables;
    int num_amf_tables;

    // Current song info
    SaSongInfo* current_song_info;

    // Playing state
    SaGlobalPlayingInfo playing_info;
    SaVoiceInfo voices[4];
    SaChannel channels[4];

    bool end_reached;
    bool has_ended;

    float sample_rate;
    float ticks_per_frame;
    float tick_accumulator;

    // Random state
    uint32_t random_state;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t s_periods[109] = {
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

static const int8_t s_vibrato[256] = {
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
// Big-endian read helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static inline uint16_t read_b_uint16(const uint8_t* p) {
    return (uint16_t)((p[0] << 8) | p[1]);
}

static inline int16_t read_b_int16(const uint8_t* p) {
    return (int16_t)((p[0] << 8) | p[1]);
}

static inline uint32_t read_b_uint32(const uint8_t* p) {
    return (uint32_t)((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]);
}

static inline int32_t read_b_int32(const uint8_t* p) {
    return (int32_t)((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Random number generator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int8_t sa_random(SaModule* m) {
    // Simple LCG to match C# RandomGenerator.GetRandomNumber(-128, 127)
    m->random_state = m->random_state * 1103515245 + 12345;
    return (int8_t)((m->random_state >> 16) & 0xff);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stream reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SaReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} SaReader;

static bool reader_init(SaReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
    return true;
}

static bool reader_eof(const SaReader* r) {
    return r->pos >= r->size;
}

static bool reader_can_read(const SaReader* r, size_t n) {
    return (r->pos + n) <= r->size;
}

static void reader_skip(SaReader* r, size_t n) {
    r->pos += n;
}

static uint8_t reader_read_uint8(SaReader* r) {
    if (r->pos >= r->size) return 0;
    return r->data[r->pos++];
}

static int8_t reader_read_int8(SaReader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(SaReader* r) {
    if (!reader_can_read(r, 2)) return 0;
    uint16_t val = read_b_uint16(r->data + r->pos);
    r->pos += 2;
    return val;
}

static int16_t reader_read_b_int16(SaReader* r) {
    return (int16_t)reader_read_b_uint16(r);
}

static uint32_t reader_read_b_uint32(SaReader* r) {
    if (!reader_can_read(r, 4)) return 0;
    uint32_t val = read_b_uint32(r->data + r->pos);
    r->pos += 4;
    return val;
}

static int32_t reader_read_b_int32(SaReader* r) {
    return (int32_t)reader_read_b_uint32(r);
}

static bool reader_read_mark(SaReader* r, const char* expected) {
    size_t len = strlen(expected);
    if (!reader_can_read(r, len)) return false;
    bool match = (memcmp(r->data + r->pos, expected, len) == 0);
    r->pos += len;
    return match;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool read_sub_songs(SaModule* m, SaReader* r) {
    uint32_t num = reader_read_b_uint32(r);

    // First pass: count valid songs (skip 0xffff and duplicates)
    // Allocate temporary array for all potential songs
    SaSongInfo* temp = (SaSongInfo*)calloc(num, sizeof(SaSongInfo));
    if (!temp && num > 0) return false;

    int valid_count = 0;

    for (uint32_t i = 0; i < num; i++) {
        SaSongInfo si;
        si.start_speed = reader_read_b_uint16(r);
        si.rows_per_track = reader_read_b_uint16(r);
        si.first_position = reader_read_b_uint16(r);
        si.last_position = reader_read_b_uint16(r);
        si.restart_position = reader_read_b_uint16(r);
        si.tempo = reader_read_b_uint16(r);

        if (reader_eof(r)) {
            free(temp);
            return false;
        }

        if ((si.last_position == 0xffff) || (si.restart_position == 0xffff))
            continue;

        // Check for duplicates
        bool duplicate = false;
        for (int j = 0; j < valid_count; j++) {
            if ((si.first_position == temp[j].first_position) && (si.last_position == temp[j].last_position)) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) continue;

        temp[valid_count++] = si;
    }

    m->sub_songs = (SaSongInfo*)calloc(valid_count > 0 ? valid_count : 1, sizeof(SaSongInfo));
    if (!m->sub_songs) {
        free(temp);
        return false;
    }
    if (valid_count > 0)
        memcpy(m->sub_songs, temp, valid_count * sizeof(SaSongInfo));
    m->num_sub_songs = valid_count;

    free(temp);
    return true;
}

static bool read_position_information(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_positions = count;
    m->positions = (SaSinglePositionInfo**)calloc(count, sizeof(SaSinglePositionInfo*));
    if (!m->positions && count > 0) return false;

    for (int i = 0; i < count; i++) {
        m->positions[i] = (SaSinglePositionInfo*)calloc(4, sizeof(SaSinglePositionInfo));
        if (!m->positions[i]) return false;

        for (int j = 0; j < 4; j++) {
            m->positions[i][j].start_track_row = reader_read_b_uint16(r);
            m->positions[i][j].sound_transpose = reader_read_int8(r);
            m->positions[i][j].note_transpose = reader_read_int8(r);
        }

        if (reader_eof(r))
            return false;
    }

    return true;
}

static bool read_track_rows(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_track_lines = count;
    m->track_lines = (SaTrackLine*)calloc(count, sizeof(SaTrackLine));
    if (!m->track_lines && count > 0) return false;

    for (int i = 0; i < count; i++) {
        uint8_t byt1 = reader_read_uint8(r);
        uint8_t byt2 = reader_read_uint8(r);
        uint8_t byt3 = reader_read_uint8(r);
        uint8_t byt4 = reader_read_uint8(r);

        m->track_lines[i].note = byt1;
        m->track_lines[i].instrument = byt2;
        m->track_lines[i].disable_sound_transpose = (byt3 & 0x80) != 0;
        m->track_lines[i].disable_note_transpose = (byt3 & 0x40) != 0;
        m->track_lines[i].arpeggio = (uint8_t)((byt3 & 0x30) >> 4);
        m->track_lines[i].effect = (SaEffect)(byt3 & 0x0f);
        m->track_lines[i].effect_arg = byt4;

        if (reader_eof(r))
            return false;
    }

    return true;
}

static bool read_instrument_information(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_instruments = count;
    m->instruments = (SaInstrument*)calloc(count, sizeof(SaInstrument));
    if (!m->instruments && count > 0) return false;

    for (int i = 0; i < count; i++) {
        SaInstrument* instr = &m->instruments[i];

        instr->type = (SaInstrumentType)reader_read_b_uint16(r);
        instr->waveform_number = reader_read_b_uint16(r);
        instr->waveform_length = reader_read_b_uint16(r);
        instr->repeat_length = reader_read_b_uint16(r);

        if (reader_eof(r))
            return false;

        // Skip 8 bytes
        reader_skip(r, 8);

        instr->volume = (uint16_t)(reader_read_b_uint16(r) & 0xff);
        instr->fine_tuning = (int8_t)reader_read_b_uint16(r);

        instr->portamento_speed = reader_read_b_uint16(r);

        instr->vibrato_delay = reader_read_b_uint16(r);
        instr->vibrato_speed = reader_read_b_uint16(r);
        instr->vibrato_level = reader_read_b_uint16(r);

        instr->amf_number = reader_read_b_uint16(r);
        instr->amf_delay = reader_read_b_uint16(r);
        instr->amf_length = reader_read_b_uint16(r);
        instr->amf_repeat = reader_read_b_uint16(r);

        instr->adsr_number = reader_read_b_uint16(r);
        instr->adsr_delay = reader_read_b_uint16(r);
        instr->adsr_length = reader_read_b_uint16(r);
        instr->adsr_repeat = reader_read_b_uint16(r);
        instr->sustain_point = reader_read_b_uint16(r);
        instr->sustain_delay = reader_read_b_uint16(r);

        if (reader_eof(r))
            return false;

        // Skip 16 bytes
        reader_skip(r, 16);

        instr->effect_arg1 = reader_read_b_uint16(r);
        instr->effect = (SaSynthesisEffect)reader_read_b_uint16(r);
        instr->effect_arg2 = reader_read_b_uint16(r);
        instr->effect_arg3 = reader_read_b_uint16(r);
        instr->effect_delay = reader_read_b_uint16(r);

        for (int j = 0; j < 3; j++) {
            instr->arpeggios[j].length = reader_read_uint8(r);
            instr->arpeggios[j].repeat = reader_read_uint8(r);

            if (!reader_can_read(r, 14))
                return false;

            for (int k = 0; k < 14; k++)
                instr->arpeggios[j].values[k] = reader_read_int8(r);
        }

        // Read 30-byte name
        if (!reader_can_read(r, 30))
            return false;

        memcpy(instr->name, r->data + r->pos, 30);
        instr->name[30] = '\0';
        reader_skip(r, 30);
    }

    return true;
}

static bool read_sample_information(SaModule* m, SaReader* r, int* out_num_samples) {
    (void)m;
    int32_t num = reader_read_b_int32(r);
    *out_num_samples = num;

    if (num != 0) {
        // Skip sample lengths and loop lengths stored in words + sample names
        // numberOfSamples * 4 * 2 + numberOfSamples * 30
        reader_skip(r, (size_t)(num * 4 * 2 + num * 30));
    }

    return true;
}

static bool read_sample_data(SaModule* m, SaReader* r, int num_samples) {
    m->num_samples = num_samples;
    m->sample_data = (int8_t**)calloc(num_samples > 0 ? num_samples : 1, sizeof(int8_t*));
    m->sample_lengths = (uint32_t*)calloc(num_samples > 0 ? num_samples : 1, sizeof(uint32_t));
    if (!m->sample_data || !m->sample_lengths) return false;

    if (num_samples > 0) {
        // Read sample lengths (uint32 each)
        uint32_t* lengths = (uint32_t*)calloc(num_samples, sizeof(uint32_t));
        if (!lengths) return false;

        for (int i = 0; i < num_samples; i++)
            lengths[i] = reader_read_b_uint32(r);

        if (reader_eof(r)) {
            free(lengths);
            return false;
        }

        for (int i = 0; i < num_samples; i++) {
            uint32_t len = lengths[i];
            m->sample_lengths[i] = len;

            if (len > 0) {
                if (!reader_can_read(r, len)) {
                    free(lengths);
                    return false;
                }

                m->sample_data[i] = (int8_t*)malloc(len);
                if (!m->sample_data[i]) {
                    free(lengths);
                    return false;
                }
                memcpy(m->sample_data[i], r->data + r->pos, len);
                reader_skip(r, len);
            }
        }

        free(lengths);
    }

    return true;
}

static bool read_waveform_data(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_waveforms = count;
    m->waveform_data = (int8_t**)calloc(count > 0 ? count : 1, sizeof(int8_t*));
    if (!m->waveform_data) return false;

    for (int i = 0; i < count; i++) {
        if (!reader_can_read(r, 128))
            return false;

        m->waveform_data[i] = (int8_t*)malloc(128);
        if (!m->waveform_data[i]) return false;
        memcpy(m->waveform_data[i], r->data + r->pos, 128);
        reader_skip(r, 128);
    }

    return true;
}

static bool read_adsr_tables(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_adsr_tables = count;
    m->adsr_tables = (uint8_t**)calloc(count > 0 ? count : 1, sizeof(uint8_t*));
    if (!m->adsr_tables) return false;

    for (int i = 0; i < count; i++) {
        if (!reader_can_read(r, 128))
            return false;

        m->adsr_tables[i] = (uint8_t*)malloc(128);
        if (!m->adsr_tables[i]) return false;
        memcpy(m->adsr_tables[i], r->data + r->pos, 128);
        reader_skip(r, 128);
    }

    return true;
}

static bool read_amf_tables(SaModule* m, SaReader* r, int32_t count) {
    if (count < 0) {
        uint32_t n = reader_read_b_uint32(r);
        count = (int32_t)n;
    }

    m->num_amf_tables = count;
    m->amf_tables = (int8_t**)calloc(count > 0 ? count : 1, sizeof(int8_t*));
    if (!m->amf_tables) return false;

    for (int i = 0; i < count; i++) {
        if (!reader_can_read(r, 128))
            return false;

        m->amf_tables[i] = (int8_t*)malloc(128);
        if (!m->amf_tables[i]) return false;
        memcpy(m->amf_tables[i], r->data + r->pos, 128);
        reader_skip(r, 128);
    }

    return true;
}

static bool load_normal_module(SaModule* m, SaReader* r) {
    // STBL + sub songs
    if (!reader_read_mark(r, "STBL") || !read_sub_songs(m, r))
        return false;

    // OVTB + position information
    if (!reader_read_mark(r, "OVTB") || !read_position_information(m, r, -1))
        return false;

    // NTBL + track rows
    if (!reader_read_mark(r, "NTBL") || !read_track_rows(m, r, -1))
        return false;

    // INST + instruments
    if (!reader_read_mark(r, "INST") || !read_instrument_information(m, r, -1))
        return false;

    // SD8B + sample info
    int num_samples = 0;
    if (!reader_read_mark(r, "SD8B") || !read_sample_information(m, r, &num_samples))
        return false;

    // Sample data (no mark, follows directly)
    if (!read_sample_data(m, r, num_samples))
        return false;

    // SYWT + waveforms
    if (!reader_read_mark(r, "SYWT") || !read_waveform_data(m, r, -1))
        return false;

    // SYAR + ADSR tables
    if (!reader_read_mark(r, "SYAR") || !read_adsr_tables(m, r, -1))
        return false;

    // SYAF + AMF tables
    if (!reader_read_mark(r, "SYAF") || !read_amf_tables(m, r, -1))
        return false;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeSound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(SaModule* m, int sub_song) {
    m->current_song_info = &m->sub_songs[sub_song];

    m->playing_info.master_volume = 64;
    m->playing_info.speed_counter = m->current_song_info->start_speed;
    m->playing_info.current_speed = m->current_song_info->start_speed;
    m->playing_info.song_position = (int16_t)(m->current_song_info->first_position - 1);
    m->playing_info.row_position = m->current_song_info->rows_per_track;
    m->playing_info.rows_per_track = m->current_song_info->rows_per_track;

    for (int i = 0; i < 4; i++) {
        SaVoiceInfo* v = &m->voices[i];
        memset(v, 0, sizeof(SaVoiceInfo));
        v->start_track_row = 0;
        v->sound_transpose = 0;
        v->note_transpose = 0;
        v->note = 0;
        v->instrument = 0;
        v->disable_sound_transpose = false;
        v->disable_note_transpose = false;
        v->arpeggio = 0;
        v->effect = SA_EFFECT_ARPEGGIO;
        v->effect_arg = 0;
        v->transposed_note = 0;
        v->previous_transposed_note = 0;
        v->instrument_type = SA_INSTRUMENT_SAMPLE;
        v->instrument_info = nullptr;
        v->transposed_instrument = 0;
        v->current_volume = 0;
        v->volume_slide_speed = 0;
        v->vibrato_position = 0;
        v->vibrato_delay = 0;
        v->vibrato_speed = 0;
        v->vibrato_level = 0;
        v->portamento_speed = 0;
        v->portamento_period = 0;
        v->arpeggio_position = 0;
        v->slide_speed = 0;
        v->slide_value = 0;
        v->adsr_position = 0;
        v->adsr_delay_counter = 0;
        v->sustain_delay_counter = 0;
        v->amf_position = 0;
        v->amf_delay_counter = 0;
        v->synth_effect_position = 0;
        v->synth_effect_wave_position = 0;
        v->effect_delay_counter = 0;
        v->flag = 0x01;
        memset(v->waveform_buffer, 0, 128);

        // Reset channel
        memset(&m->channels[i], 0, sizeof(SaChannel));
    }

    // Set playing frequency based on tempo
    if (m->current_song_info->tempo > 0)
        m->ticks_per_frame = m->sample_rate / (float)m->current_song_info->tempo;
    else
        m->ticks_per_frame = m->sample_rate / 50.0f;

    m->tick_accumulator = 0.0f;
    m->end_reached = false;
    m->has_ended = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel operations (IChannel mapping)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void channel_play_sample(SaChannel* ch, int16_t sample_number, const int8_t* data, uint32_t offset, uint32_t length) {
    ch->sample_data = data;
    ch->sample_offset = offset;
    ch->sample_length = length;
    ch->loop_start = 0;
    ch->loop_length = 0;
    ch->position_fp = (uint64_t)offset << SAMPLE_FRAC_BITS;
    ch->sample_number = sample_number;
    ch->active = true;
}

static void channel_set_loop(SaChannel* ch, uint32_t start, uint32_t length) {
    ch->loop_start = start;
    ch->loop_length = length;
}

static void channel_set_amiga_volume(SaChannel* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->volume = vol;
}

static void channel_set_amiga_period(SaChannel* ch, uint16_t period) {
    ch->period = period;
}

static void channel_mute(SaChannel* ch) {
    ch->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_next_row(SaModule* m);
static void get_next_position(SaModule* m);
static void get_new_notes(SaModule* m);
static void play_voice(SaModule* m, SaVoiceInfo* voice, SaChannel* channel);
static void force_quiet(SaVoiceInfo* voice, SaChannel* channel);
static SaInstrument* set_instrument(SaVoiceInfo* voice, uint16_t instr_num, SaInstrument* instruments);
static void set_synth_instrument(SaVoiceInfo* voice, SaInstrument* instr);
static void play_sample_instrument(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr);
static void play_synth_instrument(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr);
static void set_effects(SaModule* m, SaVoiceInfo* voice);
static void update_effects(SaModule* m);
static void update_voice_effect(SaModule* m, SaVoiceInfo* voice, SaChannel* channel);
static SaPeriodInfo do_arpeggio(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_portamento(SaPeriodInfo* pi, SaVoiceInfo* voice);
static void do_vibrato(SaPeriodInfo* pi, SaVoiceInfo* voice, SaInstrument* instr);
static void do_amf(SaModule* m, SaPeriodInfo* pi, SaVoiceInfo* voice, SaInstrument* instr);
static void do_slide(SaModule* m, SaPeriodInfo* pi, SaVoiceInfo* voice);
static void do_adsr(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr);
static void do_volume_slide(SaVoiceInfo* voice);
static void do_synth_effects(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void increment_synth_effect_position(SaVoiceInfo* voice, SaInstrument* instr);

// Synth effect handlers
static void do_synth_wave_negator(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_free_negator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_rotate_vertical(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_rotate_horizontal(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_alien_voice(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_poly_negator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_shack_wave_1(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_shack_wave_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_metamorph(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_laser(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_wave_alias(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_noise_generator_1(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_low_pass_filter_1(SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_low_pass_filter_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_oszilator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_noise_generator_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void do_synth_fm_drum(SaVoiceInfo* voice, SaInstrument* instr);
static void shack_wave_helper(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr);
static void metamorph_and_oszilator_helper(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr, int8_t* source_waveform);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(SaModule* m) {
    m->playing_info.speed_counter++;

    if (m->playing_info.speed_counter >= m->playing_info.current_speed) {
        m->playing_info.speed_counter = 0;
        get_next_row(m);
    }

    update_effects(m);

    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetNextRow
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_next_row(SaModule* m) {
    m->playing_info.row_position++;

    if (m->playing_info.row_position >= m->playing_info.rows_per_track) {
        m->playing_info.row_position = 0;
        get_next_position(m);
    }

    get_new_notes(m);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetNextPosition — position visited tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Simple bit array for visited positions
#define MAX_POSITIONS 4096
static uint8_t s_visited[MAX_POSITIONS / 8];

static bool has_position_been_visited(int pos) {
    if (pos < 0 || pos >= MAX_POSITIONS) return false;
    return (s_visited[pos / 8] & (1 << (pos % 8))) != 0;
}

static void mark_position_as_visited(int pos) {
    if (pos < 0 || pos >= MAX_POSITIONS) return;
    s_visited[pos / 8] |= (1 << (pos % 8));
}

static void clear_visited(void) {
    memset(s_visited, 0, sizeof(s_visited));
}

static void get_next_position(SaModule* m) {
    m->playing_info.song_position++;

    if ((m->playing_info.song_position > (int16_t)m->current_song_info->last_position) ||
        (m->playing_info.song_position >= m->num_positions))
    {
        m->playing_info.song_position = (int16_t)m->current_song_info->restart_position;
    }

    if (has_position_been_visited(m->playing_info.song_position))
        m->end_reached = true;

    mark_position_as_visited(m->playing_info.song_position);

    SaSinglePositionInfo* pos_row = m->positions[m->playing_info.song_position];

    for (int i = 0; i < 4; i++) {
        SaSinglePositionInfo* pos_info = &pos_row[i];
        SaVoiceInfo* voice = &m->voices[i];

        voice->start_track_row = pos_info->start_track_row;
        voice->sound_transpose = pos_info->sound_transpose;
        voice->note_transpose = pos_info->note_transpose;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetNewNotes
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_new_notes(SaModule* m) {
    for (int i = 0; i < 4; i++) {
        SaVoiceInfo* voice = &m->voices[i];
        SaChannel* channel = &m->channels[i];

        int position = voice->start_track_row + m->playing_info.row_position;

        SaTrackLine empty_line;
        memset(&empty_line, 0, sizeof(SaTrackLine));

        SaTrackLine* track_line;
        if (position < m->num_track_lines)
            track_line = &m->track_lines[position];
        else
            track_line = &empty_line;

        voice->note = track_line->note;
        voice->instrument = track_line->instrument;
        voice->disable_sound_transpose = track_line->disable_sound_transpose;
        voice->disable_note_transpose = track_line->disable_note_transpose;
        voice->arpeggio = track_line->arpeggio;
        voice->effect = track_line->effect;
        voice->effect_arg = track_line->effect_arg;

        play_voice(m, voice, channel);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayVoice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_voice(SaModule* m, SaVoiceInfo* voice, SaChannel* channel) {
    uint16_t note = voice->note;
    int16_t instr_num = voice->instrument;

    if (note == 0) {
        if (instr_num != 0)
            set_instrument(voice, (uint16_t)instr_num, m->instruments);
    }
    else {
        if (note != 0x80) {
            if (note == 0x7f)
                force_quiet(voice, channel);
            else {
                if (!voice->disable_note_transpose)
                    note = (uint16_t)(note + voice->note_transpose);

                if ((instr_num != 0) && !voice->disable_sound_transpose)
                    instr_num = (int16_t)(instr_num + voice->sound_transpose);

                voice->previous_transposed_note = voice->transposed_note;
                voice->transposed_note = note;

                if (voice->previous_transposed_note == 0)
                    voice->previous_transposed_note = note;

                SaInstrument* instr;

                if (instr_num < 0) {
                    voice->flag |= 0x01;
                    force_quiet(voice, channel);
                    return;
                }

                if (instr_num == 0) {
                    instr = voice->instrument_info;

                    if (instr == nullptr) {
                        force_quiet(voice, channel);
                        return;
                    }

                    set_synth_instrument(voice, instr);
                }
                else
                    instr = set_instrument(voice, (uint16_t)instr_num, m->instruments);

                voice->instrument_type = instr->type;

                if (voice->instrument_type == SA_INSTRUMENT_SAMPLE)
                    play_sample_instrument(m, voice, channel, instr);
                else
                    play_synth_instrument(m, voice, channel, instr);
            }
        }
    }

    set_effects(m, voice);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ForceQuiet
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void force_quiet(SaVoiceInfo* voice, SaChannel* channel) {
    channel_mute(channel);

    voice->current_volume = 0;
    voice->transposed_instrument = 0;
    voice->instrument_info = nullptr;
    voice->instrument_type = SA_INSTRUMENT_SAMPLE;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SetInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static SaInstrument* set_instrument(SaVoiceInfo* voice, uint16_t instr_num, SaInstrument* instruments) {
    voice->transposed_instrument = (uint16_t)(instr_num & 0xff);

    SaInstrument* instr = &instruments[voice->transposed_instrument - 1];
    voice->instrument_info = instr;

    voice->current_volume = instr->volume;

    voice->portamento_speed = instr->portamento_speed;
    voice->portamento_period = 0;

    voice->vibrato_position = 0;
    voice->vibrato_delay = instr->vibrato_delay;
    voice->vibrato_speed = instr->vibrato_speed;
    voice->vibrato_level = instr->vibrato_level;

    set_synth_instrument(voice, instr);

    return instr;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SetSynthInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_synth_instrument(SaVoiceInfo* voice, SaInstrument* instr) {
    voice->slide_value = instr->fine_tuning;

    voice->adsr_delay_counter = instr->adsr_delay;
    voice->adsr_position = 0;

    voice->amf_delay_counter = instr->amf_delay;
    voice->amf_position = 0;

    voice->synth_effect_position = instr->effect_arg2;
    voice->synth_effect_wave_position = 0;
    voice->effect_delay_counter = instr->effect_delay;

    voice->arpeggio_position = 0;

    voice->flag = 0x00;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlaySampleInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_sample_instrument(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr) {
    if (instr->waveform_number >= (uint16_t)m->num_samples) {
        voice->flag |= 0x01;
        force_quiet(voice, channel);
        return;
    }

    int8_t* data = m->sample_data[instr->waveform_number];
    if (data == nullptr) {
        voice->flag |= 0x01;
        force_quiet(voice, channel);
    }
    else {
        uint32_t play_length = instr->waveform_length;
        uint32_t loop_start = 0;
        uint32_t loop_length = 0;

        if (instr->repeat_length == 0)
            loop_length = instr->waveform_length;
        else if (instr->repeat_length != 1) {
            play_length += instr->repeat_length;

            loop_start = instr->waveform_length * 2U;
            loop_length = instr->repeat_length * 2U;
        }

        uint32_t data_len = m->sample_lengths[instr->waveform_number];
        play_length = play_length * 2;
        if (play_length > data_len)
            play_length = data_len;

        if ((loop_start + loop_length) > play_length)
            loop_length = play_length - loop_start;

        if (play_length > 0) {
            channel_play_sample(channel, (int16_t)(voice->transposed_instrument - 1), data, 0, play_length);

            if (loop_length != 0)
                channel_set_loop(channel, loop_start, loop_length);
        }
        else {
            voice->flag |= 0x01;
            force_quiet(voice, channel);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlaySynthInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_synth_instrument(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr) {
    if (instr->waveform_number >= (uint16_t)m->num_waveforms)
        return;

    int8_t* data = m->waveform_data[instr->waveform_number];

    uint32_t length = instr->waveform_length * 2U;

    channel_play_sample(channel, (int16_t)(voice->transposed_instrument - 1), voice->waveform_buffer, 0, length);
    channel_set_loop(channel, 0, length);

    if (length > 128) length = 128;
    memcpy(voice->waveform_buffer, data, length);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SetEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_effects(SaModule* m, SaVoiceInfo* voice) {
    voice->slide_speed = 0;
    voice->volume_slide_speed = 0;

    switch (voice->effect) {
        case SA_EFFECT_SET_SLIDE_SPEED:
            voice->slide_speed = (int8_t)voice->effect_arg;
            break;

        case SA_EFFECT_RESTART_ADSR:
            voice->adsr_position = voice->effect_arg;
            break;

        case SA_EFFECT_SET_VIBRATO:
            voice->vibrato_delay = 0;
            voice->vibrato_speed = (uint16_t)(((voice->effect_arg & 0xf0) >> 3));
            voice->vibrato_level = (uint16_t)((-((voice->effect_arg & 0x0f) << 4)) + 160);
            break;

        case SA_EFFECT_SET_MASTER_VOLUME:
            m->playing_info.master_volume = (uint16_t)(voice->effect_arg == 64 ? 64 : (voice->effect_arg & 0x3f));
            break;

        case SA_EFFECT_SET_PORTAMENTO:
            voice->portamento_speed = voice->effect_arg;
            break;

        case SA_EFFECT_SKIP_PORTAMENTO:
            voice->portamento_speed = 0;
            break;

        case SA_EFFECT_SET_TRACK_LEN:
            if (voice->effect_arg <= 64)
                m->playing_info.rows_per_track = voice->effect_arg;
            break;

        case SA_EFFECT_VOLUME_SLIDE:
            voice->volume_slide_speed = (int8_t)(voice->effect_arg);
            break;

        case SA_EFFECT_POSITION_JUMP:
            m->playing_info.song_position = (int16_t)(voice->effect_arg - 1);
            m->playing_info.row_position = m->playing_info.rows_per_track;
            break;

        case SA_EFFECT_SET_VOLUME: {
            uint8_t new_vol = voice->effect_arg;
            if (new_vol > 64)
                new_vol = 64;
            voice->current_volume = new_vol;
            break;
        }

        case SA_EFFECT_TRACK_BREAK:
            m->playing_info.row_position = m->playing_info.rows_per_track;
            break;

        case SA_EFFECT_SET_FILTER:
            // AmigaFilter = voiceInfo.EffectArg == 0;
            // No-op in our C implementation (no hardware filter emulation)
            break;

        case SA_EFFECT_SET_SPEED:
            if ((voice->effect_arg > 0) && (voice->effect_arg <= 16))
                m->playing_info.current_speed = voice->effect_arg;
            break;

        default:
            break;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// UpdateEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void update_effects(SaModule* m) {
    for (int i = 0; i < 4; i++) {
        SaVoiceInfo* voice = &m->voices[i];
        SaChannel* channel = &m->channels[i];
        update_voice_effect(m, voice, channel);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// UpdateVoiceEffect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void update_voice_effect(SaModule* m, SaVoiceInfo* voice, SaChannel* channel) {
    if (((voice->flag & 0x01) != 0) || (voice->instrument_info == nullptr)) {
        channel_mute(channel);
        return;
    }

    SaInstrument* instr = voice->instrument_info;

    SaPeriodInfo pi = do_arpeggio(m, voice, instr);
    do_portamento(&pi, voice);
    do_vibrato(&pi, voice, instr);
    do_amf(m, &pi, voice, instr);
    do_slide(m, &pi, voice);

    channel_set_amiga_period(channel, pi.period);

    if (instr->type == SA_INSTRUMENT_SYNTH)
        do_synth_effects(m, voice, instr);

    do_adsr(m, voice, channel, instr);
    do_volume_slide(voice);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoArpeggio
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static SaPeriodInfo do_arpeggio(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    uint16_t note = voice->transposed_note;
    uint16_t prev_note = voice->previous_transposed_note;

    if (voice->arpeggio != 0) {
        SaArpeggio* arp = &instr->arpeggios[voice->arpeggio - 1];

        int8_t arp_val = arp->values[voice->arpeggio_position];
        note = (uint16_t)(note + arp_val);
        prev_note = (uint16_t)(prev_note + arp_val);

        voice->arpeggio_position++;

        int max_length = arp->length + arp->repeat;
        if (max_length > 13) max_length = 13;

        if (voice->arpeggio_position > (uint16_t)max_length)
            voice->arpeggio_position = arp->length;
    }
    else {
        if ((voice->effect == SA_EFFECT_ARPEGGIO) && (voice->effect_arg != 0)) {
            uint16_t arp_val;

            switch (m->playing_info.speed_counter % 3) {
                default:
                case 0:
                    arp_val = 0;
                    break;
                case 1:
                    arp_val = (uint16_t)(voice->effect_arg >> 4);
                    break;
                case 2:
                    arp_val = (uint16_t)(voice->effect_arg & 0x0f);
                    break;
            }

            note += arp_val;
            prev_note += arp_val;
        }
    }

    if (note >= 109)
        note = 0;

    if (prev_note >= 109)
        prev_note = 0;

    SaPeriodInfo pi;
    pi.period = s_periods[note];
    pi.previous_period = s_periods[prev_note];

    return pi;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoPortamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_portamento(SaPeriodInfo* pi, SaVoiceInfo* voice) {
    if (voice->portamento_speed != 0) {
        if (voice->portamento_period == 0)
            voice->portamento_period = pi->previous_period;

        int diff = pi->period - voice->portamento_period;
        if (diff < 0)
            diff = -diff;

        diff -= voice->portamento_speed;
        if (diff < 0)
            voice->portamento_speed = 0;
        else {
            uint16_t new_period = voice->portamento_period;

            if (new_period >= pi->period)
                new_period -= voice->portamento_speed;
            else
                new_period += voice->portamento_speed;

            voice->portamento_period = new_period;
            pi->period = new_period;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoVibrato
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_vibrato(SaPeriodInfo* pi, SaVoiceInfo* voice, SaInstrument* instr) {
    if (voice->vibrato_delay != 255) {
        if (voice->vibrato_delay == 0) {
            int8_t vib_val = s_vibrato[voice->vibrato_position];
            uint16_t vib_level = instr->vibrato_level;

            if (vib_val != 0)
                pi->period += (uint16_t)((vib_val * 4) / (int16_t)vib_level);

            voice->vibrato_position = (uint16_t)((voice->vibrato_position + instr->vibrato_speed) & 0xff);
        }
        else
            voice->vibrato_delay--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoAmf
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_amf(SaModule* m, SaPeriodInfo* pi, SaVoiceInfo* voice, SaInstrument* instr) {
    if ((instr->amf_length + instr->amf_repeat) != 0) {
        int8_t* amf_table = m->amf_tables[instr->amf_number];
        int8_t amf_val = amf_table[voice->amf_position];

        pi->period = (uint16_t)(pi->period - amf_val);

        voice->amf_delay_counter--;
        if (voice->amf_delay_counter == 0) {
            voice->amf_delay_counter = instr->amf_delay;

            voice->amf_position++;

            if (voice->amf_position >= (instr->amf_length + instr->amf_repeat)) {
                voice->amf_position = instr->amf_length;

                if (instr->amf_repeat == 0)
                    voice->amf_position--;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoSlide
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_slide(SaModule* m, SaPeriodInfo* pi, SaVoiceInfo* voice) {
    pi->period = (uint16_t)(pi->period - voice->slide_value);
    if (pi->period < 113)
        pi->period = 113;

    if (m->playing_info.speed_counter != 0)
        voice->slide_value += voice->slide_speed;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoAdsr
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_adsr(SaModule* m, SaVoiceInfo* voice, SaChannel* channel, SaInstrument* instr) {
    if ((instr->adsr_length + instr->adsr_repeat) == 0)
        channel_set_amiga_volume(channel, (uint16_t)((voice->current_volume * m->playing_info.master_volume) / 64));
    else {
        uint8_t* adsr_table = m->adsr_tables[instr->adsr_number];
        uint8_t adsr_val = adsr_table[voice->adsr_position];

        uint16_t vol = (uint16_t)((m->playing_info.master_volume * voice->current_volume * adsr_val) / 4096);
        if (vol > 64)
            vol = 64;

        channel_set_amiga_volume(channel, vol);

        if ((voice->note == 0x80) && (voice->adsr_position >= instr->sustain_point)) {
            if (instr->sustain_delay == 0)
                return;

            if (voice->sustain_delay_counter != 0) {
                voice->sustain_delay_counter--;
                return;
            }

            voice->sustain_delay_counter = instr->sustain_delay;
        }

        voice->adsr_delay_counter--;

        if (voice->adsr_delay_counter == 0) {
            voice->adsr_delay_counter = instr->adsr_delay;

            voice->adsr_position++;

            if (voice->adsr_position >= (instr->adsr_length + instr->adsr_repeat)) {
                voice->adsr_position = instr->adsr_length;

                if (instr->adsr_repeat == 0)
                    voice->adsr_position--;

                if ((instr->adsr_repeat == 0) && (vol == 0))
                    voice->flag |= 0x01;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoVolumeSlide
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_volume_slide(SaVoiceInfo* voice) {
    int16_t vol = (int16_t)(voice->current_volume + voice->volume_slide_speed);

    if (vol < 0)
        vol = 0;
    else if (vol > 64)
        vol = 64;

    voice->current_volume = (uint16_t)vol;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoSynthEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_effects(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    voice->effect_delay_counter--;

    if (voice->effect_delay_counter == 0) {
        voice->effect_delay_counter = instr->effect_delay;

        switch (instr->effect) {
            case SA_SYNTH_WAVE_NEGATOR:
                do_synth_wave_negator(voice, instr);
                break;
            case SA_SYNTH_FREE_NEGATOR:
                do_synth_free_negator(m, voice, instr);
                break;
            case SA_SYNTH_ROTATE_VERTICAL:
                do_synth_rotate_vertical(voice, instr);
                break;
            case SA_SYNTH_ROTATE_HORIZONTAL:
                do_synth_rotate_horizontal(voice, instr);
                break;
            case SA_SYNTH_ALIEN_VOICE:
                do_synth_alien_voice(m, voice, instr);
                break;
            case SA_SYNTH_POLY_NEGATOR:
                do_synth_poly_negator(m, voice, instr);
                break;
            case SA_SYNTH_SHACK_WAVE_1:
                do_synth_shack_wave_1(m, voice, instr);
                break;
            case SA_SYNTH_SHACK_WAVE_2:
                do_synth_shack_wave_2(m, voice, instr);
                break;
            case SA_SYNTH_METAMORPH:
                do_synth_metamorph(m, voice, instr);
                break;
            case SA_SYNTH_LASER:
                do_synth_laser(voice, instr);
                break;
            case SA_SYNTH_WAVE_ALIAS:
                do_synth_wave_alias(voice, instr);
                break;
            case SA_SYNTH_NOISE_GENERATOR_1:
                do_synth_noise_generator_1(m, voice, instr);
                break;
            case SA_SYNTH_LOW_PASS_FILTER_1:
                do_synth_low_pass_filter_1(voice, instr);
                break;
            case SA_SYNTH_LOW_PASS_FILTER_2:
                do_synth_low_pass_filter_2(m, voice, instr);
                break;
            case SA_SYNTH_OSZILATOR:
                do_synth_oszilator(m, voice, instr);
                break;
            case SA_SYNTH_NOISE_GENERATOR_2:
                do_synth_noise_generator_2(m, voice, instr);
                break;
            case SA_SYNTH_FM_DRUM:
                do_synth_fm_drum(voice, instr);
                break;
            default:
                break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IncrementSynthEffectPosition
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void increment_synth_effect_position(SaVoiceInfo* voice, SaInstrument* instr) {
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    voice->synth_effect_position++;

    if (voice->synth_effect_position >= stop_pos)
        voice->synth_effect_position = start_pos;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Wave Negator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_wave_negator(SaVoiceInfo* voice, SaInstrument* instr) {
    voice->waveform_buffer[voice->synth_effect_position] = (int8_t)-voice->waveform_buffer[voice->synth_effect_position];

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Free Negator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_free_negator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    if ((voice->flag & 0x04) == 0) {
        int8_t* dest_waveform = voice->waveform_buffer;

        uint16_t waveform_number = instr->effect_arg1;
        uint16_t wave_length = instr->effect_arg2;
        uint16_t wave_repeat = instr->effect_arg3;

        int8_t* waveform = m->waveform_data[waveform_number];
        int16_t wave_val = (int16_t)(waveform[voice->synth_effect_wave_position] & 0x7f);

        int8_t* source_waveform = m->waveform_data[instr->waveform_number];
        int16_t count = (int16_t)(instr->waveform_length * 2);

        int buffer_offset = count;

        while ((count > 0) && (count >= wave_val)) {
            buffer_offset--;
            dest_waveform[buffer_offset] = source_waveform[buffer_offset];
            count--;
        }

        int16_t left = (int16_t)(wave_val - count);
        count += left;
        buffer_offset += left;

        while (count > 0) {
            buffer_offset--;
            dest_waveform[buffer_offset] = (int8_t)-source_waveform[buffer_offset];
            count--;
        }

        voice->synth_effect_wave_position++;

        if (voice->synth_effect_wave_position > (wave_length + wave_repeat)) {
            voice->synth_effect_wave_position = wave_length;

            if ((wave_repeat == 0) && (wave_val == 0))
                voice->flag |= 0x04;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Rotate Vertical
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_rotate_vertical(SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    int8_t delta_value = (int8_t)instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int16_t count = (int16_t)(stop_pos - start_pos);
    int buffer_offset = start_pos;

    while (count >= 0) {
        dest_waveform[buffer_offset++] += delta_value;
        count--;
    }

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Rotate Horizontal
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_rotate_horizontal(SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int16_t count = (int16_t)(stop_pos - start_pos);
    int buffer_offset = start_pos;

    int8_t first_byte = dest_waveform[buffer_offset];

    do {
        dest_waveform[buffer_offset] = dest_waveform[buffer_offset + 1];
        buffer_offset++;
        count--;
    }
    while (count >= 0);

    dest_waveform[buffer_offset] = first_byte;

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Alien Voice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_alien_voice(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t waveform_number = instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int8_t* source_waveform = m->waveform_data[waveform_number];
    int buffer_offset = start_pos;

    int16_t count = (int16_t)(stop_pos - start_pos);

    while (count >= 0) {
        dest_waveform[buffer_offset] += source_waveform[buffer_offset];
        buffer_offset++;
        count--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Poly Negator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_poly_negator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;
    int8_t* source_waveform = m->waveform_data[instr->waveform_number];

    uint16_t position = voice->synth_effect_position;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    dest_waveform[position] = source_waveform[position];

    if (position >= stop_pos)
        position = (uint16_t)(start_pos - 1);

    dest_waveform[position + 1] = (int8_t)-dest_waveform[position + 1];

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Shack Wave Helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void shack_wave_helper(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t waveform_number = instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int8_t* source_waveform = m->waveform_data[waveform_number];
    int8_t delta_value = source_waveform[start_pos + voice->synth_effect_position];

    int buffer_offset = start_pos;
    int16_t count = (int16_t)(stop_pos - start_pos);

    while (count >= 0) {
        dest_waveform[buffer_offset++] += delta_value;
        count--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Shack Wave 1
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_shack_wave_1(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    shack_wave_helper(m, voice, instr);
    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Shack Wave 2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_shack_wave_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    shack_wave_helper(m, voice, instr);

    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    dest_waveform[start_pos + voice->synth_effect_wave_position] = (int8_t)-dest_waveform[start_pos + voice->synth_effect_wave_position];

    voice->synth_effect_wave_position++;

    if (voice->synth_effect_wave_position > (stop_pos - start_pos))
        voice->synth_effect_wave_position = 0;

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Metamorph and Oszilator Helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void metamorph_and_oszilator_helper(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr, int8_t* source_waveform) {
    (void)m;
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int buffer_offset = start_pos;
    int16_t count = (int16_t)(stop_pos - start_pos);
    bool set_flag = false;

    while (count >= 0) {
        int8_t val = dest_waveform[buffer_offset];
        if (val != source_waveform[buffer_offset]) {
            set_flag = true;

            if (val < source_waveform[buffer_offset])
                val++;
            else
                val--;

            dest_waveform[buffer_offset] = val;
        }

        buffer_offset++;
        count--;
    }

    if (!set_flag)
        voice->flag |= 0x02;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Metamorph
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_metamorph(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    if ((voice->flag & 0x01) == 0) {
        uint16_t waveform_number = instr->effect_arg1;

        int8_t* waveform = m->waveform_data[waveform_number];
        metamorph_and_oszilator_helper(m, voice, instr, waveform);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Laser
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_laser(SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t detune = (int8_t)instr->effect_arg2;
    uint16_t repeats = instr->effect_arg3;

    if (voice->synth_effect_wave_position < repeats) {
        voice->slide_value += detune;
        voice->synth_effect_wave_position++;
    }

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Wave Alias
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_wave_alias(SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    int8_t delta_value = (int8_t)instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int16_t count = (int16_t)(stop_pos - start_pos);
    int buffer_offset = start_pos;

    while (count >= 0) {
        int8_t val = dest_waveform[buffer_offset];

        if (((buffer_offset + 1) >= 128) || (val > dest_waveform[buffer_offset + 1]))
            val -= delta_value;
        else
            val += delta_value;

        dest_waveform[buffer_offset++] = val;
        count--;
    }

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Noise Generator 1
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_noise_generator_1(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;
    dest_waveform[voice->synth_effect_position] ^= sa_random(m);

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Low Pass Filter 1
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_low_pass_filter_1(SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t delta_value = instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    for (int i = start_pos; i <= (int)stop_pos; i++) {
        bool flag = false;

        int8_t val1 = dest_waveform[i];
        int8_t val2 = (i == (int)stop_pos) ? dest_waveform[start_pos] : dest_waveform[i + 1];

        if (val1 <= val2)
            flag = true;

        val1 -= val2;
        if (val1 < 0)
            val1 = (int8_t)-val1;

        if (val1 > (int8_t)delta_value) {
            if (flag)
                dest_waveform[i] += 2;
            else
                dest_waveform[i] -= 2;
        }
    }

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Low Pass Filter 2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_low_pass_filter_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    uint16_t waveform_number = instr->effect_arg1;
    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int8_t* waveform = m->waveform_data[waveform_number];
    int8_t* dest_waveform = voice->waveform_buffer;
    int buffer_index = stop_pos;

    for (int i = start_pos; i <= (int)stop_pos; i++) {
        bool flag = false;

        int8_t val1 = dest_waveform[i];
        int8_t val2 = (i == (int)stop_pos) ? dest_waveform[start_pos] : dest_waveform[i + 1];

        if (val1 <= val2)
            flag = true;

        val1 -= val2;
        if (val1 < 0)
            val1 = (int8_t)-val1;

        uint8_t delta_val = (uint8_t)(waveform[buffer_index++] & 0x7f);
        buffer_index &= 0x7f;

        if (val1 > (int8_t)delta_val) {
            if (flag)
                dest_waveform[i] += 2;
            else
                dest_waveform[i] -= 2;
        }
    }

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Oszilator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_oszilator(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    if ((voice->flag & 0x02) != 0) {
        voice->flag ^= 0x08;
        voice->flag &= (uint8_t)~0x02;
    }

    int8_t* source_waveform;

    if ((voice->flag & 0x08) != 0)
        source_waveform = m->waveform_data[instr->waveform_number];
    else
        source_waveform = m->waveform_data[instr->effect_arg1];

    metamorph_and_oszilator_helper(m, voice, instr, source_waveform);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: Noise Generator 2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_noise_generator_2(SaModule* m, SaVoiceInfo* voice, SaInstrument* instr) {
    int8_t* dest_waveform = voice->waveform_buffer;

    uint16_t start_pos = instr->effect_arg2;
    uint16_t stop_pos = instr->effect_arg3;

    int16_t count = (int16_t)(stop_pos - start_pos);
    int buffer_offset = start_pos;

    do {
        int8_t val = dest_waveform[buffer_offset + count];
        val ^= 0x05;
        val = (int8_t)(((uint8_t)val << 2) | ((uint8_t)val >> (8 - 2)));
        val += sa_random(m);

        dest_waveform[buffer_offset + count] = val;
        count--;
    }
    while (count >= 0);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth Effect: FM Drum
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_fm_drum(SaVoiceInfo* voice, SaInstrument* instr) {
    uint8_t level = (uint8_t)instr->effect_arg1;
    uint16_t factor = instr->effect_arg2;
    uint16_t repeats = instr->effect_arg3;

    if (voice->synth_effect_wave_position >= repeats) {
        voice->slide_value = instr->fine_tuning;
        voice->synth_effect_wave_position = 0;
    }

    uint16_t decrement = (uint16_t)((factor << 8) | level);
    voice->slide_value = (int16_t)(voice->slide_value - decrement);

    voice->synth_effect_wave_position++;

    increment_synth_effect_position(voice, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing — sa_render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t sa_render(SaModule* module, float* interleaved_stereo, size_t frames) {
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

        for (int ch = 0; ch < 4; ch++) {
            SaChannel* c = &module->channels[ch];

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

            // Amiga panning: channels 0,3 → left; channels 1,2 → right
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
                    // Wrap to loop
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
                        // After first wrap, sample_length becomes loop end
                        c->sample_offset = c->loop_start;
                        c->sample_length = c->loop_start + c->loop_length;

                        if (new_pos >= c->sample_length && c->loop_length > 0) {
                            // modulo within loop
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

size_t sa_render_multi(SaModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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

        for (int ch = 0; ch < 4; ch++) {
            SaChannel* c = &module->channels[ch];
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

            // Write to per-channel buffer (with same 0.5f scaling as stereo render)
            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            // Advance position
            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Handle loop / end
            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    // Wrap to loop
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
                        // After first wrap, sample_length becomes loop end
                        c->sample_offset = c->loop_start;
                        c->sample_length = c->loop_start + c->loop_length;

                        if (new_pos >= c->sample_length && c->loop_length > 0) {
                            // modulo within loop
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

SaModule* sa_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 16)
        return nullptr;

    // Check mark
    if (memcmp(data, "SOARV1.0", 8) != 0) {
        // Check for compressed format
        if (memcmp(data, "@OARV1.0", 8) != 0)
            return nullptr;

        // Compressed format not yet supported in pure C
        // (requires lh.library decompression)
        return nullptr;
    }

    SaModule* m = (SaModule*)calloc(1, sizeof(SaModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;
    m->random_state = 12345;

    SaReader reader;
    reader_init(&reader, data + 8, size - 8);

    if (!load_normal_module(m, &reader)) {
        sa_destroy(m);
        return nullptr;
    }

    if (m->num_sub_songs > 0) {
        clear_visited();
        initialize_sound(m, 0);
    }

    return m;
}

void sa_destroy(SaModule* module) {
    if (!module) return;

    if (module->sub_songs) free(module->sub_songs);

    if (module->positions) {
        for (int i = 0; i < module->num_positions; i++)
            free(module->positions[i]);
        free(module->positions);
    }

    if (module->track_lines) free(module->track_lines);
    if (module->instruments) free(module->instruments);

    if (module->sample_data) {
        for (int i = 0; i < module->num_samples; i++)
            free(module->sample_data[i]);
        free(module->sample_data);
    }
    if (module->sample_lengths) free(module->sample_lengths);

    if (module->waveform_data) {
        for (int i = 0; i < module->num_waveforms; i++)
            free(module->waveform_data[i]);
        free(module->waveform_data);
    }

    if (module->adsr_tables) {
        for (int i = 0; i < module->num_adsr_tables; i++)
            free(module->adsr_tables[i]);
        free(module->adsr_tables);
    }

    if (module->amf_tables) {
        for (int i = 0; i < module->num_amf_tables; i++)
            free(module->amf_tables[i]);
        free(module->amf_tables);
    }

    free(module);
}

int sa_subsong_count(const SaModule* module) {
    if (!module) return 0;
    return module->num_sub_songs;
}

bool sa_select_subsong(SaModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_sub_songs)
        return false;

    clear_visited();
    initialize_sound(module, subsong);
    return true;
}

int sa_channel_count(const SaModule* module) {
    (void)module;
    return 4;
}

void sa_set_channel_mask(SaModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool sa_has_ended(const SaModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sa_get_num_positions(const SaModule* module) {
    return module ? module->num_positions : 0;
}

int sa_get_num_track_lines(const SaModule* module) {
    return module ? module->num_track_lines : 0;
}

int sa_get_rows_per_track(const SaModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_sub_songs) return 0;
    return module->sub_songs[subsong].rows_per_track;
}

void sa_get_cell(const SaModule* module, int idx,
                 uint8_t* note, uint8_t* instrument, uint8_t* arpeggio,
                 uint8_t* effect, uint8_t* effect_arg) {
    if (!module || idx < 0 || idx >= module->num_track_lines) {
        if (note) *note = 0; if (instrument) *instrument = 0;
        if (arpeggio) *arpeggio = 0; if (effect) *effect = 0; if (effect_arg) *effect_arg = 0;
        return;
    }
    const SaTrackLine* tl = &module->track_lines[idx];
    if (note) *note = tl->note;
    if (instrument) *instrument = tl->instrument;
    if (arpeggio) *arpeggio = tl->arpeggio;
    if (effect) *effect = (uint8_t)tl->effect;
    if (effect_arg) *effect_arg = tl->effect_arg;
}

void sa_set_cell(SaModule* module, int idx,
                 uint8_t note, uint8_t instrument, uint8_t arpeggio,
                 uint8_t effect, uint8_t effect_arg) {
    if (!module || idx < 0 || idx >= module->num_track_lines) return;
    SaTrackLine* tl = &module->track_lines[idx];
    tl->note = note;
    tl->instrument = instrument;
    tl->arpeggio = arpeggio;
    tl->effect = (SaEffect)effect;
    tl->effect_arg = effect_arg;
}

void sa_get_position(const SaModule* module, int pos, int channel,
                     uint16_t* start_track_row, int8_t* sound_transpose, int8_t* note_transpose) {
    if (!module || pos < 0 || pos >= module->num_positions || channel < 0 || channel >= 4) {
        if (start_track_row) *start_track_row = 0;
        if (sound_transpose) *sound_transpose = 0;
        if (note_transpose) *note_transpose = 0;
        return;
    }
    const SaSinglePositionInfo* pi = &module->positions[pos][channel];
    if (start_track_row) *start_track_row = pi->start_track_row;
    if (sound_transpose) *sound_transpose = pi->sound_transpose;
    if (note_transpose) *note_transpose = pi->note_transpose;
}

void sa_set_position(SaModule* module, int pos, int channel,
                     uint16_t start_track_row, int8_t sound_transpose, int8_t note_transpose) {
    if (!module || pos < 0 || pos >= module->num_positions || channel < 0 || channel >= 4) return;
    SaSinglePositionInfo* pi = &module->positions[pos][channel];
    pi->start_track_row = start_track_row;
    pi->sound_transpose = sound_transpose;
    pi->note_transpose = note_transpose;
}

int sa_get_instrument_count(const SaModule* module) {
    return module ? module->num_instruments : 0;
}

const char* sa_get_instrument_name(const SaModule* module, int inst) {
    if (!module || inst < 0 || inst >= module->num_instruments) return "";
    return module->instruments[inst].name;
}

float sa_get_instrument_param(const SaModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= module->num_instruments || !param) return -1.0f;
    const SaInstrument* in = &module->instruments[inst];

    if (strcmp(param, "type") == 0)             return (float)in->type;
    if (strcmp(param, "waveformNumber") == 0)    return (float)in->waveform_number;
    if (strcmp(param, "waveformLength") == 0)    return (float)in->waveform_length;
    if (strcmp(param, "repeatLength") == 0)      return (float)in->repeat_length;
    if (strcmp(param, "volume") == 0)            return (float)in->volume;
    if (strcmp(param, "fineTuning") == 0)        return (float)in->fine_tuning;
    if (strcmp(param, "portamentoSpeed") == 0)   return (float)in->portamento_speed;
    if (strcmp(param, "vibratoDelay") == 0)      return (float)in->vibrato_delay;
    if (strcmp(param, "vibratoSpeed") == 0)      return (float)in->vibrato_speed;
    if (strcmp(param, "vibratoLevel") == 0)      return (float)in->vibrato_level;
    if (strcmp(param, "amfNumber") == 0)         return (float)in->amf_number;
    if (strcmp(param, "amfDelay") == 0)          return (float)in->amf_delay;
    if (strcmp(param, "amfLength") == 0)         return (float)in->amf_length;
    if (strcmp(param, "amfRepeat") == 0)         return (float)in->amf_repeat;
    if (strcmp(param, "adsrNumber") == 0)        return (float)in->adsr_number;
    if (strcmp(param, "adsrDelay") == 0)         return (float)in->adsr_delay;
    if (strcmp(param, "adsrLength") == 0)        return (float)in->adsr_length;
    if (strcmp(param, "adsrRepeat") == 0)        return (float)in->adsr_repeat;
    if (strcmp(param, "sustainPoint") == 0)      return (float)in->sustain_point;
    if (strcmp(param, "sustainDelay") == 0)      return (float)in->sustain_delay;
    if (strcmp(param, "effect") == 0)            return (float)in->effect;
    if (strcmp(param, "effectArg1") == 0)        return (float)in->effect_arg1;
    if (strcmp(param, "effectArg2") == 0)        return (float)in->effect_arg2;
    if (strcmp(param, "effectArg3") == 0)        return (float)in->effect_arg3;
    if (strcmp(param, "effectDelay") == 0)       return (float)in->effect_delay;

    return -1.0f;
}

void sa_set_instrument_param(SaModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= module->num_instruments || !param) return;
    SaInstrument* in = &module->instruments[inst];
    uint16_t v = (uint16_t)value;
    int16_t sv = (int16_t)value;

    if (strcmp(param, "type") == 0)             { in->type = (SaInstrumentType)(int)value; return; }
    if (strcmp(param, "waveformNumber") == 0)    { in->waveform_number = v; return; }
    if (strcmp(param, "waveformLength") == 0)    { in->waveform_length = v; return; }
    if (strcmp(param, "repeatLength") == 0)      { in->repeat_length = v; return; }
    if (strcmp(param, "volume") == 0)            { in->volume = v; return; }
    if (strcmp(param, "fineTuning") == 0)        { in->fine_tuning = sv; return; }
    if (strcmp(param, "portamentoSpeed") == 0)   { in->portamento_speed = v; return; }
    if (strcmp(param, "vibratoDelay") == 0)      { in->vibrato_delay = v; return; }
    if (strcmp(param, "vibratoSpeed") == 0)      { in->vibrato_speed = v; return; }
    if (strcmp(param, "vibratoLevel") == 0)      { in->vibrato_level = v; return; }
    if (strcmp(param, "amfNumber") == 0)         { in->amf_number = v; return; }
    if (strcmp(param, "amfDelay") == 0)          { in->amf_delay = v; return; }
    if (strcmp(param, "amfLength") == 0)         { in->amf_length = v; return; }
    if (strcmp(param, "amfRepeat") == 0)         { in->amf_repeat = v; return; }
    if (strcmp(param, "adsrNumber") == 0)        { in->adsr_number = v; return; }
    if (strcmp(param, "adsrDelay") == 0)         { in->adsr_delay = v; return; }
    if (strcmp(param, "adsrLength") == 0)        { in->adsr_length = v; return; }
    if (strcmp(param, "adsrRepeat") == 0)        { in->adsr_repeat = v; return; }
    if (strcmp(param, "sustainPoint") == 0)      { in->sustain_point = v; return; }
    if (strcmp(param, "sustainDelay") == 0)      { in->sustain_delay = v; return; }
    if (strcmp(param, "effect") == 0)            { in->effect = (SaSynthesisEffect)(int)value; return; }
    if (strcmp(param, "effectArg1") == 0)        { in->effect_arg1 = v; return; }
    if (strcmp(param, "effectArg2") == 0)        { in->effect_arg2 = v; return; }
    if (strcmp(param, "effectArg3") == 0)        { in->effect_arg3 = v; return; }
    if (strcmp(param, "effectDelay") == 0)       { in->effect_delay = v; return; }
}

// Export: serialize back to SOARV1.0 binary
static void wr16(uint8_t* p, uint16_t v) { p[0] = v >> 8; p[1] = v & 0xff; }
static void wr32(uint8_t* p, uint32_t v) { p[0] = v >> 24; p[1] = (v >> 16) & 0xff; p[2] = (v >> 8) & 0xff; p[3] = v & 0xff; }

size_t sa_export(const SaModule* module, uint8_t* out, size_t max_size) {
    if (!module) return 0;

    // Calculate total size
    size_t total = 8; // SOARV1.0
    total += 4 + 4 + module->num_sub_songs * 12; // STBL + count + subsongs
    total += 4 + 4 + module->num_positions * 4 * 4; // OVTB + count + positions
    total += 4 + 4 + module->num_track_lines * 5; // NTBL + count + tracklines
    total += 4 + 4; // INST + count
    for (int i = 0; i < module->num_instruments; i++)
        total += 30 + 26 + 4 + 3 * 16; // name(30) + fields(26) + arpeggios(3*16)
    total += 4 + 4; // SD8B + sample count
    for (int i = 0; i < module->num_samples; i++)
        total += 4 + module->sample_lengths[i]; // size + data
    total += 4 + 4 + module->num_waveforms * 128; // SYWT
    total += 4 + 4 + module->num_adsr_tables * 128; // SYAR
    total += 4 + 4 + module->num_amf_tables * 128; // SYAF

    if (!out) return total;
    if (max_size < total) return 0;

    uint8_t* p = out;

    // Magic
    memcpy(p, "SOARV1.0", 8); p += 8;

    // STBL + subsongs
    memcpy(p, "STBL", 4); p += 4;
    wr32(p, module->num_sub_songs); p += 4;
    for (int i = 0; i < module->num_sub_songs; i++) {
        const SaSongInfo* s = &module->sub_songs[i];
        wr16(p, s->start_speed); p += 2;
        wr16(p, s->rows_per_track); p += 2;
        wr16(p, s->first_position); p += 2;
        wr16(p, s->last_position); p += 2;
        wr16(p, s->restart_position); p += 2;
        *p++ = s->tempo;
        *p++ = 0; // padding
    }

    // OVTB + positions
    memcpy(p, "OVTB", 4); p += 4;
    wr32(p, module->num_positions * 4); p += 4;
    for (int i = 0; i < module->num_positions; i++) {
        for (int ch = 0; ch < 4; ch++) {
            const SaSinglePositionInfo* pi = &module->positions[i][ch];
            wr16(p, pi->start_track_row); p += 2;
            *p++ = (uint8_t)(int8_t)pi->sound_transpose;
            *p++ = (uint8_t)(int8_t)pi->note_transpose;
        }
    }

    // NTBL + track rows
    memcpy(p, "NTBL", 4); p += 4;
    wr32(p, module->num_track_lines); p += 4;
    for (int i = 0; i < module->num_track_lines; i++) {
        const SaTrackLine* tl = &module->track_lines[i];
        *p++ = tl->note;
        *p++ = tl->instrument;
        uint8_t flags_arp = tl->arpeggio & 0x3f;
        if (tl->disable_sound_transpose) flags_arp |= 0x80;
        if (tl->disable_note_transpose) flags_arp |= 0x40;
        *p++ = flags_arp;
        *p++ = (uint8_t)tl->effect;
        *p++ = tl->effect_arg;
    }

    // INST + instruments
    memcpy(p, "INST", 4); p += 4;
    wr32(p, module->num_instruments); p += 4;
    for (int i = 0; i < module->num_instruments; i++) {
        const SaInstrument* in = &module->instruments[i];
        // Name: 30 bytes padded
        memset(p, 0, 30);
        size_t nlen = strlen(in->name);
        if (nlen > 30) nlen = 30;
        memcpy(p, in->name, nlen);
        p += 30;
        // Fields
        wr16(p, (uint16_t)in->type); p += 2;
        wr16(p, in->waveform_number); p += 2;
        wr16(p, in->waveform_length); p += 2;
        wr16(p, in->repeat_length); p += 2;
        wr16(p, in->volume); p += 2;
        wr16(p, (uint16_t)in->fine_tuning); p += 2;
        wr16(p, in->portamento_speed); p += 2;
        wr16(p, in->vibrato_delay); p += 2;
        wr16(p, in->vibrato_speed); p += 2;
        wr16(p, in->vibrato_level); p += 2;
        wr16(p, in->amf_number); p += 2;
        wr16(p, in->amf_delay); p += 2;
        wr16(p, in->amf_length); p += 2;
        wr16(p, in->amf_repeat); p += 2;
        wr16(p, in->adsr_number); p += 2;
        wr16(p, in->adsr_delay); p += 2;
        wr16(p, in->adsr_length); p += 2;
        wr16(p, in->adsr_repeat); p += 2;
        wr16(p, in->sustain_point); p += 2;
        wr16(p, in->sustain_delay); p += 2;
        wr16(p, (uint16_t)in->effect); p += 2;
        wr16(p, in->effect_arg1); p += 2;
        wr16(p, in->effect_arg2); p += 2;
        wr16(p, in->effect_arg3); p += 2;
        wr16(p, in->effect_delay); p += 2;
        // 3 arpeggios
        for (int a = 0; a < 3; a++) {
            *p++ = in->arpeggios[a].length;
            *p++ = in->arpeggios[a].repeat;
            memcpy(p, in->arpeggios[a].values, 14);
            p += 14;
        }
    }

    // SD8B + samples
    memcpy(p, "SD8B", 4); p += 4;
    wr16(p, (uint16_t)module->num_samples); p += 2;
    // Sample sizes
    for (int i = 0; i < module->num_samples; i++) {
        wr32(p, module->sample_lengths[i]); p += 4;
    }
    // Sample data
    for (int i = 0; i < module->num_samples; i++) {
        if (module->sample_data[i] && module->sample_lengths[i] > 0) {
            memcpy(p, module->sample_data[i], module->sample_lengths[i]);
            p += module->sample_lengths[i];
        }
    }

    // SYWT + waveforms
    memcpy(p, "SYWT", 4); p += 4;
    wr16(p, (uint16_t)module->num_waveforms); p += 2;
    for (int i = 0; i < module->num_waveforms; i++) {
        memcpy(p, module->waveform_data[i], 128);
        p += 128;
    }

    // SYAR + ADSR tables
    memcpy(p, "SYAR", 4); p += 4;
    wr16(p, (uint16_t)module->num_adsr_tables); p += 2;
    for (int i = 0; i < module->num_adsr_tables; i++) {
        memcpy(p, module->adsr_tables[i], 128);
        p += 128;
    }

    // SYAF + AMF tables
    memcpy(p, "SYAF", 4); p += 4;
    wr16(p, (uint16_t)module->num_amf_tables); p += 2;
    for (int i = 0; i < module->num_amf_tables; i++) {
        memcpy(p, module->amf_tables[i], 128);
        p += 128;
    }

    return (size_t)(p - out);
}
