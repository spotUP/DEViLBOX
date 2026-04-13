// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "synthesis.h"

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

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum SynEffect {
    SYN_EFFECT_NONE         = 0x0,
    SYN_EFFECT_SLIDE        = 0x1,
    SYN_EFFECT_RESTART_ADSR = 0x2,
    SYN_EFFECT_RESTART_EGC  = 0x3,
    SYN_EFFECT_SET_TRACK_LEN = 0x4,
    SYN_EFFECT_SKIP_STNT    = 0x5,
    SYN_EFFECT_SYNC_MARK    = 0x6,
    SYN_EFFECT_SET_FILTER   = 0x7,
    SYN_EFFECT_SET_SPEED    = 0x8,
    SYN_EFFECT_ENABLE_FX    = 0x9,
    SYN_EFFECT_CHANGE_FX    = 0xA,
    SYN_EFFECT_CHANGE_ARG1  = 0xB,
    SYN_EFFECT_CHANGE_ARG2  = 0xC,
    SYN_EFFECT_CHANGE_ARG3  = 0xD,
    SYN_EFFECT_EGC_OFF      = 0xE,
    SYN_EFFECT_SET_VOLUME   = 0xF
} SynEffect;

typedef enum SynSynthEffect {
    SYN_SYNTH_NONE     = 0,
    SYN_SYNTH_ROTATE1  = 1,
    SYN_SYNTH_ROTATE2  = 2,
    SYN_SYNTH_ALIEN    = 3,
    SYN_SYNTH_NEGATOR  = 4,
    SYN_SYNTH_POLYNEG  = 5,
    SYN_SYNTH_SHAKER1  = 6,
    SYN_SYNTH_SHAKER2  = 7,
    SYN_SYNTH_AMF_LFO  = 8,
    SYN_SYNTH_LASER    = 9,
    SYN_SYNTH_OCTFX1   = 10,
    SYN_SYNTH_OCTFX2   = 11,
    SYN_SYNTH_ALISING  = 12,
    SYN_SYNTH_EGFX1    = 13,
    SYN_SYNTH_EGFX2    = 14,
    SYN_SYNTH_CHANGER  = 15,
    SYN_SYNTH_FMDRUM   = 16
} SynSynthEffect;

typedef enum SynEgcMode {
    SYN_EGC_OFF    = 0,
    SYN_EGC_ONES   = 1,
    SYN_EGC_REPEAT = 2
} SynEgcMode;

typedef enum SynTransposeMode {
    SYN_TRANSPOSE_ENABLED        = 0,
    SYN_TRANSPOSE_SOUND_DISABLED = 1,
    SYN_TRANSPOSE_NOTE_DISABLED  = 2,
    SYN_TRANSPOSE_ALL_DISABLED   = 3
} SynTransposeMode;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SynTrackLine {
    uint8_t note;
    uint8_t instrument;
    uint8_t arpeggio;
    SynEffect effect;
    uint8_t effect_arg;
} SynTrackLine;

typedef struct SynSinglePositionInfo {
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;
} SynSinglePositionInfo;

typedef struct SynSongInfo {
    uint8_t start_speed;
    uint8_t rows_per_track;
    uint16_t first_position;
    uint16_t last_position;
    uint16_t restart_position;
} SynSongInfo;

typedef struct SynSample {
    int8_t* sample_addr;
    uint32_t length;
} SynSample;

typedef struct SynInstrument {
    uint8_t waveform_number;
    bool synthesis_enabled;
    uint16_t waveform_length;
    uint16_t repeat_length;
    uint8_t volume;
    int8_t portamento_speed;
    bool adsr_enabled;
    uint8_t adsr_table_number;
    uint16_t adsr_table_length;
    uint8_t arpeggio_start;
    uint8_t arpeggio_length;
    uint8_t arpeggio_repeat_length;
    SynSynthEffect effect;
    uint8_t effect_arg1;
    uint8_t effect_arg2;
    uint8_t effect_arg3;
    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    uint8_t vibrato_level;
    uint8_t egc_offset;
    SynEgcMode egc_mode;
    uint8_t egc_table_number;
    uint16_t egc_table_length;
} SynInstrument;

typedef struct SynVoiceInfo {
    // Position information
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;

    // Track row information
    uint8_t note;
    uint8_t instrument;
    uint8_t arpeggio;
    SynEffect effect;
    uint8_t effect_arg;

    uint8_t use_buffer;
    int8_t synth_sample1[256];
    int8_t synth_sample2[256];

    uint8_t transposed_note;
    uint8_t previous_transposed_note;

    uint8_t transposed_instrument;

    uint8_t current_volume;
    uint8_t new_volume;

    uint8_t arpeggio_position;

    int8_t slide_speed;
    int16_t slide_increment;

    int8_t portamento_speed;
    int16_t portamento_speed_counter;

    uint8_t vibrato_delay;
    uint8_t vibrato_position;

    bool adsr_enabled;
    uint16_t adsr_position;

    bool egc_disabled;
    SynEgcMode egc_mode;
    uint16_t egc_position;

    bool synth_effect_disabled;
    SynSynthEffect synth_effect;
    uint8_t synth_effect_arg1;
    uint8_t synth_effect_arg2;
    uint8_t synth_effect_arg3;

    uint8_t synth_position;
    uint8_t slow_motion_counter;
} SynVoiceInfo;

typedef struct SynPeriodInfo {
    uint16_t period;
    uint16_t previous_period;
} SynPeriodInfo;

typedef struct SynGlobalPlayingInfo {
    uint8_t sync_mark;
    uint8_t speed_counter;
    uint8_t current_speed;
    uint16_t song_position;
    uint8_t row_position;
    uint8_t rows_per_track;
    SynTransposeMode transpose_enable_status;
} SynGlobalPlayingInfo;

// Channel state for audio output
typedef struct SynChannel {
    bool active;
    bool muted;

    int8_t* sample_data;
    uint32_t sample_offset;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;

    uint16_t period;
    uint16_t volume;

    uint64_t position_fp;
} SynChannel;

#define SYN_EGC_TABLE_LENGTH 128
#define SYN_ADSR_TABLE_LENGTH 256
#define SYN_ARPEGGIO_TABLE_LENGTH 16
#define SYN_MAX_VISITED 4096

struct SynModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    int start_offset;

    SynSongInfo* sub_songs;
    int num_sub_songs;

    SynSinglePositionInfo** positions; // positions[pos][voice]
    int num_positions;

    SynTrackLine* track_lines;
    int num_track_lines;

    SynSample* samples;
    int num_samples;

    int8_t** waveforms;
    int num_waveforms;

    SynInstrument* instruments;
    int num_instruments;

    uint8_t* egc_tables;
    int num_egc_tables;

    uint8_t* adsr_tables;
    int num_adsr_tables;

    uint8_t arpeggio_tables[16 * SYN_ARPEGGIO_TABLE_LENGTH];

    int8_t vibrato_table[256];

    SynSongInfo* current_song_info;

    SynGlobalPlayingInfo playing_info;
    SynVoiceInfo voices[4];

    SynChannel channels[4];

    bool has_ended;
    float tick_accumulator;
    float ticks_per_frame;

    // visited positions for end detection
    uint8_t visited[SYN_MAX_VISITED / 8];

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Period table
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t syn_periods[] = {
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

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SynReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} SynReader;

static void reader_init(SynReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const SynReader* r) {
    return r->pos > r->size;
}

static uint8_t read_u8(SynReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t read_i8(SynReader* r) {
    return (int8_t)read_u8(r);
}

static uint16_t read_b_u16(SynReader* r) {
    uint8_t hi = read_u8(r);
    uint8_t lo = read_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t read_b_u32(SynReader* r) {
    uint16_t hi = read_b_u16(r);
    uint16_t lo = read_b_u16(r);
    return ((uint32_t)hi << 16) | lo;
}

static void reader_skip(SynReader* r, size_t bytes) {
    r->pos += bytes;
}

static void reader_read_bytes(SynReader* r, uint8_t* dest, size_t count) {
    for (size_t i = 0; i < count; i++)
        dest[i] = read_u8(r);
}

static void reader_read_signed(SynReader* r, int8_t* dest, size_t count) {
    for (size_t i = 0; i < count; i++)
        dest[i] = read_i8(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Visited positions tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(SynModule* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static bool has_position_been_visited(SynModule* m, uint16_t pos) {
    if (pos >= SYN_MAX_VISITED) return false;
    return (m->visited[pos / 8] & (1 << (pos % 8))) != 0;
}

static void mark_position_as_visited(SynModule* m, uint16_t pos) {
    if (pos >= SYN_MAX_VISITED) return;
    m->visited[pos / 8] |= (1 << (pos % 8));
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel helpers (IChannel equivalent)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void channel_mute(SynChannel* ch) {
    ch->active = false;
}

static void channel_play_sample(SynChannel* ch, int8_t* data, uint32_t start_offset, uint32_t length) {
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
    ch->loop_start = 0;
    ch->loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
}

static void channel_set_loop(SynChannel* ch, int8_t* data, uint32_t start, uint32_t length) {
    (void)data;
    ch->loop_start = start;
    ch->loop_length = length;
    ch->sample_length = start + length;
}

static void channel_set_loop_offset(SynChannel* ch, uint32_t start, uint32_t length) {
    ch->loop_start = start;
    ch->loop_length = length;
    ch->sample_length = start + length;
}

static void channel_set_sample(SynChannel* ch, int8_t* data, uint32_t start, uint32_t length) {
    ch->sample_data = data;
    ch->sample_offset = start;
    ch->sample_length = start + length;
    // Do NOT reset position — SetSample doesn't retrigger
}

static void channel_set_amiga_period(SynChannel* ch, uint16_t period) {
    ch->period = period;
}

static void channel_set_amiga_volume(SynChannel* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->volume = vol;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Build vibrato table (triangle)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void build_vibrato_table(SynModule* m) {
    int8_t vib_val = 0;
    int offset = 0;

    for (int i = 0; i < 64; i++) {
        m->vibrato_table[offset++] = vib_val;
        vib_val += 2;
    }

    vib_val++;

    for (int i = 0; i < 128; i++) {
        vib_val -= 2;
        m->vibrato_table[offset++] = vib_val;
    }

    vib_val--;

    for (int i = 0; i < 64; i++) {
        m->vibrato_table[offset++] = vib_val;
        vib_val += 2;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Load module
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(SynModule* m, SynReader* r) {
    // Read meta data
    uint16_t total_positions = read_b_u16(r);
    uint16_t total_track_rows = read_b_u16(r);

    reader_skip(r, 4); // skip 4 bytes

    uint8_t num_samples = read_u8(r);
    uint8_t num_waveforms = read_u8(r);
    uint8_t num_instruments = read_u8(r);
    uint8_t num_sub_songs = read_u8(r);
    uint8_t num_egc_tables = read_u8(r);
    uint8_t num_adsr_tables = read_u8(r);
    read_u8(r); // noise length - not used

    if (reader_eof(r)) return false;

    // Read module name (skip 13 bytes, then 28 bytes name, then 140 bytes text)
    reader_skip(r, 13);
    reader_skip(r, 28); // module name
    reader_skip(r, 140); // skip text

    // Read sample information
    m->num_samples = num_samples;
    m->samples = (SynSample*)calloc(num_samples, sizeof(SynSample));
    if (!m->samples) return false;

    for (int i = 0; i < num_samples; i++) {
        reader_skip(r, 1); // skip 1 byte
        reader_skip(r, 27); // sample name
        if (reader_eof(r)) return false;
    }

    for (int i = 0; i < num_samples; i++)
        m->samples[i].length = read_b_u32(r);

    if (reader_eof(r)) return false;

    // Read envelope generator tables
    m->num_egc_tables = num_egc_tables;
    int egc_total = num_egc_tables * SYN_EGC_TABLE_LENGTH;
    m->egc_tables = (uint8_t*)malloc(egc_total);
    if (!m->egc_tables) return false;
    reader_read_bytes(r, m->egc_tables, egc_total);
    if (reader_eof(r)) return false;

    // Read ADSR tables
    m->num_adsr_tables = num_adsr_tables;
    int adsr_total = num_adsr_tables * SYN_ADSR_TABLE_LENGTH;
    m->adsr_tables = (uint8_t*)malloc(adsr_total);
    if (!m->adsr_tables) return false;
    reader_read_bytes(r, m->adsr_tables, adsr_total);
    if (reader_eof(r)) return false;

    // Read instrument information
    m->num_instruments = num_instruments;
    m->instruments = (SynInstrument*)calloc(num_instruments, sizeof(SynInstrument));
    if (!m->instruments) return false;

    for (int i = 0; i < num_instruments; i++) {
        SynInstrument* instr = &m->instruments[i];

        instr->waveform_number = read_u8(r);
        instr->synthesis_enabled = read_u8(r) != 0;
        instr->waveform_length = read_b_u16(r);
        instr->repeat_length = read_b_u16(r);
        instr->volume = read_u8(r);
        instr->portamento_speed = read_i8(r);
        instr->adsr_enabled = read_u8(r) != 0;
        instr->adsr_table_number = read_u8(r);
        instr->adsr_table_length = read_b_u16(r);
        reader_skip(r, 1);
        instr->arpeggio_start = read_u8(r);
        instr->arpeggio_length = read_u8(r);
        instr->arpeggio_repeat_length = read_u8(r);
        instr->effect = (SynSynthEffect)read_u8(r);
        instr->effect_arg1 = read_u8(r);
        instr->effect_arg2 = read_u8(r);
        instr->effect_arg3 = read_u8(r);
        instr->vibrato_delay = read_u8(r);
        instr->vibrato_speed = read_u8(r);
        instr->vibrato_level = read_u8(r);
        instr->egc_offset = read_u8(r);
        instr->egc_mode = (SynEgcMode)read_u8(r);
        instr->egc_table_number = read_u8(r);
        instr->egc_table_length = read_b_u16(r);

        if (reader_eof(r)) return false;
    }

    // Read arpeggio tables
    reader_read_bytes(r, m->arpeggio_tables, 16 * SYN_ARPEGGIO_TABLE_LENGTH);
    if (reader_eof(r)) return false;

    // Read sub-song information
    m->num_sub_songs = num_sub_songs;
    m->sub_songs = (SynSongInfo*)calloc(num_sub_songs, sizeof(SynSongInfo));
    if (!m->sub_songs) return false;

    for (int i = 0; i < num_sub_songs; i++) {
        reader_skip(r, 4);

        SynSongInfo* song = &m->sub_songs[i];
        song->start_speed = read_u8(r);
        song->rows_per_track = read_u8(r);
        song->first_position = read_b_u16(r);
        song->last_position = read_b_u16(r);
        song->restart_position = read_b_u16(r);

        if (reader_eof(r)) return false;

        reader_skip(r, 2);
    }

    // Skip extra sub-song information
    reader_skip(r, 14);

    // Read waveforms
    m->num_waveforms = num_waveforms;
    m->waveforms = (int8_t**)calloc(num_waveforms, sizeof(int8_t*));
    if (!m->waveforms) return false;

    for (int i = 0; i < num_waveforms; i++) {
        m->waveforms[i] = (int8_t*)malloc(256);
        if (!m->waveforms[i]) return false;
        reader_read_signed(r, m->waveforms[i], 256);
        if (reader_eof(r)) return false;
    }

    // Read position information
    m->num_positions = total_positions;
    m->positions = (SynSinglePositionInfo**)calloc(total_positions, sizeof(SynSinglePositionInfo*));
    if (!m->positions) return false;

    for (int i = 0; i < total_positions; i++) {
        m->positions[i] = (SynSinglePositionInfo*)calloc(4, sizeof(SynSinglePositionInfo));
        if (!m->positions[i]) return false;

        for (int j = 0; j < 4; j++) {
            m->positions[i][j].start_track_row = read_b_u16(r);
            m->positions[i][j].sound_transpose = read_i8(r);
            m->positions[i][j].note_transpose = read_i8(r);
        }

        if (reader_eof(r)) return false;
    }

    // Read track rows (add extra 64 empty rows)
    m->num_track_lines = total_track_rows + 64;
    m->track_lines = (SynTrackLine*)calloc(m->num_track_lines, sizeof(SynTrackLine));
    if (!m->track_lines) return false;

    for (int i = 0; i < m->num_track_lines; i++) {
        uint8_t byt1 = read_u8(r);
        uint8_t byt2 = read_u8(r);
        uint8_t byt3 = read_u8(r);
        uint8_t byt4 = read_u8(r);

        m->track_lines[i].note = byt1;
        m->track_lines[i].instrument = byt2;
        m->track_lines[i].arpeggio = (byt3 & 0xf0) >> 4;
        m->track_lines[i].effect = (SynEffect)(byt3 & 0x0f);
        m->track_lines[i].effect_arg = byt4;

        if (reader_eof(r)) return false;
    }

    // Read sample data
    for (int i = 0; i < num_samples; i++) {
        uint32_t len = m->samples[i].length;
        if (len == 0) continue;

        m->samples[i].sample_addr = (int8_t*)malloc(len);
        if (!m->samples[i].sample_addr) return false;

        if (r->pos + len > r->size) return false;
        memcpy(m->samples[i].sample_addr, r->data + r->pos, len);
        r->pos += len;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(SynModule* m, int sub_song) {
    SynSongInfo* song = &m->sub_songs[sub_song];
    m->current_song_info = song;

    SynGlobalPlayingInfo* pi = &m->playing_info;
    pi->sync_mark = 0;
    pi->speed_counter = song->start_speed;
    pi->current_speed = song->start_speed;
    pi->song_position = song->first_position;
    pi->row_position = song->rows_per_track;
    pi->rows_per_track = song->rows_per_track;
    pi->transpose_enable_status = SYN_TRANSPOSE_ENABLED;

    for (int i = 0; i < 4; i++) {
        SynVoiceInfo* v = &m->voices[i];
        memset(v, 0, sizeof(SynVoiceInfo));
        // Arrays are zero-filled by memset
    }

    // Reset channels
    for (int i = 0; i < 4; i++) {
        SynChannel* ch = &m->channels[i];
        memset(ch, 0, sizeof(SynChannel));
    }

    m->has_ended = false;

    // Calculate ticks_per_frame: CIA timer at ~50Hz for PAL Amiga
    // Default: 125 BPM → 50 Hz tick rate
    m->ticks_per_frame = m->sample_rate / 50.0f;
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick immediately
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(SynModule* m);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayRow — Initialize channel for a single row
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_row(SynModule* m, SynVoiceInfo* v, SynChannel* ch) {
    v->current_volume = 0;
    v->slide_speed = 0;

    if (v->effect != SYN_EFFECT_NONE) {
        v->synth_effect_disabled = false;
        v->synth_effect = SYN_SYNTH_NONE;
        v->synth_effect_arg1 = 0;
        v->synth_effect_arg2 = 0;
        v->synth_effect_arg3 = 0;

        v->egc_disabled = false;
        v->new_volume = 0;

        switch (v->effect) {
            case SYN_EFFECT_SLIDE:
                v->slide_speed = (int8_t)v->effect_arg;
                break;

            case SYN_EFFECT_RESTART_ADSR:
                v->adsr_position = v->effect_arg;
                v->adsr_enabled = true;
                break;

            case SYN_EFFECT_RESTART_EGC:
                v->egc_position = v->effect_arg;
                v->egc_mode = SYN_EGC_ONES;
                break;

            case SYN_EFFECT_SET_TRACK_LEN:
                if (v->effect_arg <= 64)
                    m->playing_info.rows_per_track = v->effect_arg;
                break;

            case SYN_EFFECT_SKIP_STNT:
                m->playing_info.transpose_enable_status = (SynTransposeMode)v->effect_arg;
                break;

            case SYN_EFFECT_SYNC_MARK:
                m->playing_info.sync_mark = v->effect_arg;
                break;

            case SYN_EFFECT_SET_FILTER:
                // AmigaFilter = v->effect_arg == 0; (not relevant for WASM)
                break;

            case SYN_EFFECT_SET_SPEED:
                if ((v->effect_arg > 0) && (v->effect_arg <= 16))
                    m->playing_info.current_speed = v->effect_arg;
                break;

            case SYN_EFFECT_ENABLE_FX:
                v->synth_effect_disabled = v->effect_arg != 0;
                break;

            case SYN_EFFECT_CHANGE_FX:
                v->synth_effect = (SynSynthEffect)v->effect_arg;
                break;

            case SYN_EFFECT_CHANGE_ARG1:
                v->synth_effect_arg1 = v->effect_arg;
                break;

            case SYN_EFFECT_CHANGE_ARG2:
                v->synth_effect_arg2 = v->effect_arg;
                break;

            case SYN_EFFECT_CHANGE_ARG3:
                v->synth_effect_arg3 = v->effect_arg;
                break;

            case SYN_EFFECT_EGC_OFF:
                v->egc_disabled = v->effect_arg != 0;
                break;

            case SYN_EFFECT_SET_VOLUME:
                v->new_volume = v->effect_arg;
                break;

            default:
                break;
        }
    }

    uint8_t note = v->note;
    if (note != 0) {
        if (note == 0x7f) {
            channel_mute(ch);
            v->current_volume = 0;
            return;
        }

        if ((m->playing_info.transpose_enable_status != SYN_TRANSPOSE_NOTE_DISABLED) &&
            (m->playing_info.transpose_enable_status != SYN_TRANSPOSE_ALL_DISABLED))
            note = (uint8_t)(note + v->note_transpose);

        v->previous_transposed_note = v->transposed_note;
        v->transposed_note = note;

        channel_set_amiga_period(ch, syn_periods[note]);

        uint8_t instr_num = v->instrument;
        if (instr_num != 0) {
            if ((m->playing_info.transpose_enable_status != SYN_TRANSPOSE_SOUND_DISABLED) &&
                (m->playing_info.transpose_enable_status != SYN_TRANSPOSE_ALL_DISABLED))
                instr_num = (uint8_t)(instr_num + v->sound_transpose);

            v->transposed_instrument = instr_num;

            SynInstrument* instr = &m->instruments[instr_num - 1];

            v->adsr_enabled = false;
            v->adsr_position = 0;

            v->vibrato_delay = 0;
            v->vibrato_position = 0;

            v->egc_mode = SYN_EGC_OFF;
            v->egc_position = 0;

            v->slide_increment = 0;
            v->arpeggio_position = 0;

            v->portamento_speed = instr->portamento_speed;
            v->portamento_speed_counter = instr->portamento_speed;

            if (v->effect == SYN_EFFECT_CHANGE_ARG1) {
                v->portamento_speed = 0;
                v->portamento_speed_counter = 0;
            }

            v->vibrato_delay = instr->vibrato_delay;

            if (instr->adsr_enabled)
                v->adsr_enabled = true;

            if (instr->synthesis_enabled) {
                int8_t* waveform = m->waveforms[instr->waveform_number];

                if (instr->effect != SYN_SYNTH_NONE) {
                    v->slow_motion_counter = 0;
                    v->synth_position = 0;
                }

                v->use_buffer = 1;

                v->egc_mode = instr->egc_mode;

                if (instr->egc_mode == SYN_EGC_OFF) {
                    v->slow_motion_counter = 0;

                    uint16_t length = instr->waveform_length;
                    if (length > 256) length = 256;

                    channel_play_sample(ch, v->synth_sample1, 0, length);
                    channel_set_loop_offset(ch, 0, length);

                    memcpy(v->synth_sample1, waveform, length);

                    if (instr->egc_offset != 0) {
                        for (int i = 0; i < instr->egc_offset; i++)
                            v->synth_sample1[i] = (int8_t)-v->synth_sample1[i];
                    }
                }

                v->current_volume = v->new_volume != 0 ? v->new_volume : instr->volume;
                channel_set_amiga_volume(ch, v->current_volume);
            }
            else {
                if (instr->waveform_length != 0) {
                    v->slow_motion_counter = 0;
                    v->synth_position = 0;

                    uint8_t sample_num = (uint8_t)(instr->waveform_number & 0x3f);
                    if (sample_num >= m->num_samples) {
                        channel_mute(ch);
                        return;
                    }

                    SynSample* sample = &m->samples[sample_num];

                    uint32_t play_length = instr->waveform_length;
                    uint32_t loop_start = 0;
                    uint32_t loop_length = 0;

                    if (instr->repeat_length == 0)
                        loop_length = instr->waveform_length;
                    else if (instr->repeat_length != 2) {
                        play_length += instr->repeat_length;
                        loop_start = instr->waveform_length;
                        loop_length = instr->repeat_length;
                    }

                    channel_play_sample(ch, sample->sample_addr, 0, play_length);

                    if (loop_length != 0)
                        channel_set_loop_offset(ch, loop_start, loop_length);

                    uint8_t volume = v->new_volume != 0 ? v->new_volume : instr->volume;
                    channel_set_amiga_volume(ch, volume);

                    if (sample_num == 7)
                        v->current_volume = (uint8_t)(v->effect_arg & 0x3f);
                    else
                        v->current_volume = volume;
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetNextRow
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_next_row(SynModule* m) {
    SynGlobalPlayingInfo* pi = &m->playing_info;
    pi->speed_counter = 0;

    if (pi->row_position >= pi->rows_per_track) {
        pi->row_position = 0;

        if (pi->song_position > m->current_song_info->last_position)
            pi->song_position = m->current_song_info->restart_position;

        if (has_position_been_visited(m, pi->song_position))
            m->has_ended = true;

        mark_position_as_visited(m, pi->song_position);
        pi->song_position++;

        SynSinglePositionInfo* pos_row = m->positions[pi->song_position - 1];

        for (int i = 0; i < 4; i++) {
            SynVoiceInfo* v = &m->voices[i];
            v->start_track_row = pos_row[i].start_track_row;
            v->sound_transpose = pos_row[i].sound_transpose;
            v->note_transpose = pos_row[i].note_transpose;
        }
    }

    for (int i = 0; i < 4; i++) {
        SynVoiceInfo* v = &m->voices[i];
        int position = v->start_track_row + pi->row_position;

        SynTrackLine empty = {0};
        SynTrackLine* tl = (position < m->num_track_lines) ? &m->track_lines[position] : &empty;

        v->note = tl->note;
        v->instrument = tl->instrument;
        v->arpeggio = tl->arpeggio;
        v->effect = tl->effect;
        v->effect_arg = tl->effect_arg;
    }

    for (int i = 0; i < 4; i++)
        play_row(m, &m->voices[i], &m->channels[i]);

    pi->row_position++;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoArpeggio
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool do_arpeggio(SynModule* m, SynInstrument* instr, SynVoiceInfo* v, SynChannel* ch, SynPeriodInfo* pi_out) {
    uint16_t period, previous_period;

    uint8_t arp_num = v->arpeggio;
    if (arp_num == 0) {
        uint8_t note = v->transposed_note;
        if (note == 0) {
            channel_mute(ch);
            return false;
        }

        uint8_t prev_note = v->previous_transposed_note;

        // Do arpeggio
        uint8_t arp_len = (uint8_t)(instr->arpeggio_length + instr->arpeggio_repeat_length);
        if (arp_len != 0) {
            uint8_t arp_val = m->arpeggio_tables[instr->arpeggio_start + v->arpeggio_position];

            if (v->arpeggio_position == arp_len)
                v->arpeggio_position = instr->arpeggio_length;
            else
                v->arpeggio_position++;

            note += arp_val;
            prev_note += arp_val;
        }

        period = syn_periods[note];
        previous_period = syn_periods[prev_note];
    }
    else {
        // Arpeggio in track
        uint8_t note = v->transposed_note;
        uint8_t prev_note = v->previous_transposed_note;

        uint8_t arp_val = m->arpeggio_tables[arp_num * 16 + m->playing_info.speed_counter];
        note += arp_val;
        prev_note += arp_val;

        period = syn_periods[note];
        previous_period = syn_periods[prev_note];
    }

    pi_out->period = period;
    pi_out->previous_period = previous_period;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoPortamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_portamento(SynPeriodInfo* pi, SynVoiceInfo* v) {
    if ((v->portamento_speed_counter != 0) && (pi->period != pi->previous_period)) {
        v->portamento_speed_counter--;

        // Swap
        uint16_t tmp = pi->period;
        pi->period = pi->previous_period;
        pi->previous_period = tmp;

        int new_period = (pi->period - pi->previous_period) * v->portamento_speed_counter;

        if (v->portamento_speed != 0)
            new_period /= v->portamento_speed;

        new_period += pi->previous_period;
        pi->period = (uint16_t)new_period;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoVibrato
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_vibrato(SynPeriodInfo* pi, SynInstrument* instr, SynVoiceInfo* v, SynModule* m) {
    if (instr->vibrato_level != 0) {
        if (v->vibrato_delay == 0) {
            int8_t vib_val = m->vibrato_table[v->vibrato_position];
            uint8_t vib_level = instr->vibrato_level;

            if (vib_val < 0) {
                if (vib_level != 0)
                    pi->period -= (uint16_t)((-vib_val * 4) / vib_level);
                else
                    pi->period = 124;
            }
            else {
                if (vib_level != 0)
                    pi->period += (uint16_t)((vib_val * 4) / vib_level);
                else
                    pi->period = 124;
            }

            v->vibrato_position += instr->vibrato_speed;
        }
        else
            v->vibrato_delay--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoAdsr
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Forward declaration
static bool do_adsr_impl(SynModule* m, SynInstrument* instr, SynVoiceInfo* v, SynChannel* ch);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEnvelopeGeneratorCounter
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_egc(SynModule* m, SynInstrument* instr, SynVoiceInfo* v, SynChannel* ch) {
    if ((v->egc_mode != SYN_EGC_OFF) && !v->egc_disabled) {
        int8_t* waveform = m->waveforms[instr->waveform_number];
        int8_t* synth_buf;

        v->use_buffer ^= 1;

        if (v->use_buffer == 0)
            synth_buf = v->synth_sample2;
        else
            synth_buf = v->synth_sample1;

        channel_set_sample(ch, synth_buf, 0, instr->waveform_length);
        channel_set_loop(ch, synth_buf, 0, instr->waveform_length);

        for (int i = 0; i < (int)(instr->waveform_length / 16); i++)
            memcpy(synth_buf + i * 16, waveform + i * 16, 16);

        uint8_t egc_val = m->egc_tables[instr->egc_table_number * SYN_EGC_TABLE_LENGTH + v->egc_position];
        egc_val += instr->egc_offset;

        if (egc_val != 0) {
            for (int i = 0; i < egc_val; i++)
                synth_buf[i] = (int8_t)-synth_buf[i];
        }

        v->egc_position++;

        if (v->egc_position >= instr->egc_table_length) {
            if (v->egc_mode == SYN_EGC_ONES)
                v->egc_mode = SYN_EGC_OFF;
            else
                v->egc_position = 0;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synth effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_rotate1(SynVoiceInfo* v, uint8_t start_pos, uint8_t end_pos, uint8_t speed) {
    if (start_pos <= end_pos) {
        int count = end_pos - start_pos;
        for (int i = start_pos; i <= count; i++)
            v->synth_sample1[i] += (int8_t)speed;
    }
}

static void do_synth_rotate2(SynVoiceInfo* v, uint8_t start_pos, uint8_t end_pos, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        if (start_pos <= end_pos) {
            int count = end_pos - start_pos;
            int8_t first = v->synth_sample1[start_pos];

            for (int i = start_pos; i < count; i++)
                v->synth_sample1[i] = v->synth_sample1[i + 1];

            v->synth_sample1[count] = first;
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_alien(SynModule* m, SynVoiceInfo* v, uint8_t source_wave, uint8_t end_pos, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int8_t* waveform = m->waveforms[source_wave];

        for (int i = 0; i <= end_pos; i++)
            v->synth_sample1[i] += waveform[i];
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_negator(SynVoiceInfo* v, uint8_t start_pos, uint8_t end_pos, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        if (start_pos <= end_pos) {
            int count = end_pos - start_pos;

            int offset = start_pos + v->synth_position;
            v->synth_sample1[offset] = (int8_t)-v->synth_sample1[offset];

            if (offset == count)
                v->synth_position = 0;
            else
                v->synth_position++;
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_polyneg(SynVoiceInfo* v, uint8_t start_pos, uint8_t end_pos, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        if (start_pos <= end_pos) {
            int count = end_pos - start_pos;

            if (v->synth_position == 0)
                v->synth_sample1[start_pos + count] = (int8_t)-v->synth_sample1[start_pos + count];
            else
                v->synth_sample1[start_pos + v->synth_position - 1] = (int8_t)-v->synth_sample1[start_pos + v->synth_position - 1];

            v->synth_sample1[start_pos + v->synth_position] = (int8_t)-v->synth_sample1[start_pos + v->synth_position];

            if (v->synth_position == count)
                v->synth_position = 0;
            else
                v->synth_position++;
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_shaker1(SynModule* m, SynVoiceInfo* v, uint8_t source_wave, uint8_t mix_level, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int8_t mix_byte = m->waveforms[source_wave][v->synth_position];

        for (int i = 0; i <= mix_level; i++)
            v->synth_sample1[i] += mix_byte;

        if (v->synth_position == mix_level)
            v->synth_position = 0;
        else
            v->synth_position++;
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_shaker2(SynModule* m, SynVoiceInfo* v, uint8_t source_wave, uint8_t mix_level, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int8_t mix_byte = m->waveforms[source_wave][v->synth_position];

        for (int i = 0; i <= mix_level; i++) {
            v->synth_sample1[i] += mix_byte;

            if (i == v->synth_position)
                v->synth_sample1[i] = (int8_t)-v->synth_sample1[i];
        }

        if (v->synth_position == mix_level)
            v->synth_position = 0;
        else
            v->synth_position++;
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_amf_lfo(SynModule* m, SynVoiceInfo* v, uint8_t source_wave, uint8_t end_pos, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int8_t* waveform = m->waveforms[source_wave];

        v->slide_increment = (int16_t)-waveform[v->synth_position];

        if (v->synth_position == end_pos)
            v->synth_position = 0;
        else
            v->synth_position++;
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_laser(SynVoiceInfo* v, uint8_t laser_speed, uint8_t laser_time, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        v->slide_increment += (int16_t)-(int8_t)laser_speed;

        if (v->synth_position == laser_time) {
            v->synth_position = 0;
            v->slide_increment = 0;
        }
        else
            v->synth_position++;
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_octfx1(SynVoiceInfo* v, uint8_t mix_level, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int count = mix_level / 2;
        int j = 0;

        for (int i = 0; j <= count; i += 2, j++)
            v->synth_sample1[j] = v->synth_sample1[i];

        for (int i = 0; i <= count; i++, j++)
            v->synth_sample1[j] = v->synth_sample1[i];
    }
    else {
        if (mix_level != 0)
            v->slow_motion_counter--;
    }
}

static void do_synth_octfx2(SynVoiceInfo* v, uint8_t mix_level_arg, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        uint8_t mix_level = mix_level_arg;

        for (int i = mix_level / 2; i >= 0; i--) {
            int8_t sample = v->synth_sample1[i];
            v->synth_sample1[--mix_level] = sample;
            v->synth_sample1[--mix_level] = sample;
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_alising(SynVoiceInfo* v, uint8_t mix_level, uint8_t alising_level, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int offset = 0;

        for (int i = 0; i <= mix_level; i++) {
            int8_t sample1 = v->synth_sample1[offset];
            int8_t sample2 = v->synth_sample1[i + 1];

            if (sample2 > sample1)
                v->synth_sample1[offset++] = (int8_t)(sample1 + alising_level);
            else if (sample2 < sample1)
                v->synth_sample1[offset++] = (int8_t)(sample1 - alising_level);
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_egfx1(SynModule* m, SynVoiceInfo* v, uint8_t mix_level_arg, uint8_t eg_num, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        uint8_t* eg_table = &m->egc_tables[eg_num * SYN_EGC_TABLE_LENGTH];
        uint8_t mix_level = mix_level_arg;
        if (mix_level > SYN_EGC_TABLE_LENGTH - 1)
            mix_level = SYN_EGC_TABLE_LENGTH - 1;

        for (int i = 0; i <= mix_level; i++) {
            int8_t sample1 = v->synth_sample1[i];
            int8_t sample2 = v->synth_sample1[i + 1];

            if (sample2 > sample1)
                v->synth_sample1[i] = (int8_t)(sample1 + eg_table[v->synth_position]);
            else if (sample2 < sample1)
                v->synth_sample1[i] = (int8_t)(sample1 - eg_table[v->synth_position]);
        }

        if (v->synth_position == mix_level)
            v->synth_position = 0;
        else
            v->synth_position++;
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_egfx2(SynModule* m, SynVoiceInfo* v, uint8_t mix_level, uint8_t eg_num, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        uint8_t* eg_table = &m->egc_tables[eg_num * SYN_EGC_TABLE_LENGTH];

        for (int i = 0, j = mix_level; i <= mix_level; i++, j--) {
            int8_t sample1 = v->synth_sample1[i];
            int8_t sample2 = v->synth_sample1[i + 1];

            if (sample2 > sample1)
                v->synth_sample1[i] = (int8_t)(sample1 + eg_table[j]);
            else if (sample2 < sample1)
                v->synth_sample1[i] = (int8_t)(sample1 - eg_table[j]);
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_changer(SynModule* m, SynVoiceInfo* v, uint8_t dest_wave, uint8_t mix_level, uint8_t slow_motion) {
    if (v->slow_motion_counter == 0) {
        v->slow_motion_counter = slow_motion;

        int8_t* waveform = m->waveforms[dest_wave];

        for (int i = 0; i <= mix_level; i++) {
            uint8_t sample1 = (uint8_t)v->synth_sample1[i];
            uint8_t sample2 = (uint8_t)waveform[i];

            if (sample2 > sample1)
                v->synth_sample1[i] = (int8_t)(sample1 + 1);
            else if (sample2 < sample1)
                v->synth_sample1[i] = (int8_t)(sample1 - 1);
        }
    }
    else
        v->slow_motion_counter--;
}

static void do_synth_fmdrum(SynVoiceInfo* v, uint8_t mod_level, uint8_t mod_factor, uint8_t mod_depth) {
    v->slide_increment += (int16_t)(mod_level * mod_factor);

    if (v->synth_position == mod_depth) {
        v->synth_position = 0;
        v->slide_increment = 0;
    }
    else
        v->synth_position++;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoSynthEffects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synth_effects(SynModule* m, SynInstrument* instr, SynVoiceInfo* v) {
    if (instr->effect != SYN_SYNTH_NONE) {
        SynSynthEffect effect = v->synth_effect != SYN_SYNTH_NONE ? v->synth_effect : instr->effect;

        uint8_t arg1 = v->synth_effect_arg1 != 0 ? v->synth_effect_arg1 : instr->effect_arg1;
        uint8_t arg2 = v->synth_effect_arg2 != 0 ? v->synth_effect_arg2 : instr->effect_arg2;
        uint8_t arg3 = v->synth_effect_arg3 != 0 ? v->synth_effect_arg3 : instr->effect_arg3;

        switch (effect) {
            case SYN_SYNTH_ROTATE1:  do_synth_rotate1(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_ROTATE2:  do_synth_rotate2(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_ALIEN:    do_synth_alien(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_NEGATOR:  do_synth_negator(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_POLYNEG:  do_synth_polyneg(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_SHAKER1:  do_synth_shaker1(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_SHAKER2:  do_synth_shaker2(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_AMF_LFO:  do_synth_amf_lfo(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_LASER:    do_synth_laser(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_OCTFX1:   do_synth_octfx1(v, arg1, arg3); break;
            case SYN_SYNTH_OCTFX2:   do_synth_octfx2(v, arg1, arg3); break;
            case SYN_SYNTH_ALISING:  do_synth_alising(v, arg1, arg2, arg3); break;
            case SYN_SYNTH_EGFX1:    do_synth_egfx1(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_EGFX2:    do_synth_egfx2(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_CHANGER:  do_synth_changer(m, v, arg1, arg2, arg3); break;
            case SYN_SYNTH_FMDRUM:   do_synth_fmdrum(v, arg1, arg2, arg3); break;
            default: break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffects — Run effects for a single channel
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects(SynModule* m, SynVoiceInfo* v, SynChannel* ch) {
    if (v->transposed_instrument == 0) {
        channel_mute(ch);
        return;
    }

    SynInstrument* instr = &m->instruments[v->transposed_instrument - 1];

    SynPeriodInfo pi;
    if (!do_arpeggio(m, instr, v, ch, &pi))
        return;

    if (instr->effect != SYN_SYNTH_NONE) {
        if (((instr->egc_mode == SYN_EGC_OFF) || v->egc_disabled) && !v->synth_effect_disabled)
            do_synth_effects(m, instr, v);
    }

    do_portamento(&pi, v);
    do_vibrato(&pi, instr, v, m);

    pi.period = (uint16_t)(pi.period + v->slide_increment);

    channel_set_amiga_period(ch, pi.period);

    v->slide_increment = (int16_t)(v->slide_increment - v->slide_speed);

    if (do_adsr_impl(m, instr, v, ch))
        do_egc(m, instr, v, ch);
}

static bool do_adsr_impl(SynModule* m, SynInstrument* instr, SynVoiceInfo* v, SynChannel* ch) {
    if (v->adsr_enabled) {
        if (v->adsr_position >= instr->adsr_table_length) {
            v->transposed_instrument = 0;
            channel_mute(ch);
            return false;
        }

        uint16_t adsr_val = m->adsr_tables[instr->adsr_table_number * SYN_ADSR_TABLE_LENGTH + v->adsr_position];
        adsr_val++;

        uint16_t volume = v->new_volume != 0 ? v->new_volume : instr->volume;
        volume = (uint16_t)((volume * adsr_val) / 128);
        if (volume > 64) volume = 64;

        channel_set_amiga_volume(ch, volume);

        v->adsr_position++;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffectsAndSynths
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects_and_synths(SynModule* m) {
    for (int i = 0; i < 4; i++)
        do_effects(m, &m->voices[i], &m->channels[i]);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(SynModule* m) {
    m->playing_info.speed_counter++;

    if (m->playing_info.speed_counter >= m->playing_info.current_speed)
        get_next_row(m);

    do_effects_and_synths(m);

    if (m->has_ended) {
        // endReached handled at render level
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing — syn_render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t syn_render(SynModule* module, float* interleaved_stereo, size_t frames) {
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
            SynChannel* c = &module->channels[ch];

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

size_t syn_render_multi(SynModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            SynChannel* c = &module->channels[ch];
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

SynModule* syn_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 204)
        return nullptr;

    int start_offset = 0;

    // Check mark
    if (memcmp(data, "Synth4.0", 8) == 0) {
        start_offset = 0;
    }
    else if (size >= 0x1f0e + 204 && memcmp(data + 0x1f0e, "Synth4.2", 8) == 0) {
        start_offset = 0x1f0e;
    }
    else {
        return nullptr;
    }

    SynModule* m = (SynModule*)calloc(1, sizeof(SynModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    m->start_offset = start_offset;

    SynReader reader;
    reader_init(&reader, data + start_offset + 8, size - start_offset - 8);

    if (!load_module(m, &reader)) {
        syn_destroy(m);
        return nullptr;
    }

    build_vibrato_table(m);

    if (m->num_sub_songs > 0) {
        clear_visited(m);
        initialize_sound(m, 0);
    }

    return m;
}

void syn_destroy(SynModule* module) {
    if (!module) return;

    if (module->sub_songs) free(module->sub_songs);

    if (module->positions) {
        for (int i = 0; i < module->num_positions; i++)
            free(module->positions[i]);
        free(module->positions);
    }

    if (module->track_lines) free(module->track_lines);
    if (module->instruments) free(module->instruments);

    if (module->samples) {
        for (int i = 0; i < module->num_samples; i++)
            free(module->samples[i].sample_addr);
        free(module->samples);
    }

    if (module->waveforms) {
        for (int i = 0; i < module->num_waveforms; i++)
            free(module->waveforms[i]);
        free(module->waveforms);
    }

    if (module->egc_tables) free(module->egc_tables);
    if (module->adsr_tables) free(module->adsr_tables);

    if (module->original_data) free(module->original_data);
    free(module);
}

int syn_subsong_count(const SynModule* module) {
    if (!module) return 0;
    return module->num_sub_songs;
}

bool syn_select_subsong(SynModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_sub_songs)
        return false;

    clear_visited(module);
    initialize_sound(module, subsong);
    return true;
}

int syn_channel_count(const SynModule* module) {
    (void)module;
    return 4;
}

void syn_set_channel_mask(SynModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool syn_has_ended(const SynModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int syn_get_instrument_count(const SynModule* module) {
    // TODO: return actual instrument count from format-specific field
    (void)module;
    return 0;
}

size_t syn_export(const SynModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
