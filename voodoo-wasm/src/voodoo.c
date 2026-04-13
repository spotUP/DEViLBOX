// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "voodoo.h"

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

static const uint16_t vs_periods[99] = {
                                                                   32256, 30464, 28672,
    27136, 25600, 24192, 22784, 21504, 20352, 19200, 18048, 17689, 16128, 15232, 14336,
    13568, 12800, 12096, 11392, 10752, 10176,  9600,  9024,  8512,  8064,  7616,  7168,
     6784,  6400,  6048,  5696,  5376,  5088,  4800,  4512,  4256,  4032,  3808,  3584,
     3392,  3200,  3024,  2848,  2688,  2544,  2400,  2256,  2128,  2016,  1904,  1792,
     1696,  1600,  1512,  1424,  1344,  1272,  1200,  1128,  1064,  1008,   952,   896,
      848,   800,   756,   712,   672,   636,   600,   564,   532,   504,   476,   448,
      424,   400,   378,   356,   336,   318,   300,   282,   266,   252,   238,   224,
      212,   200,   189,   178,   168,   159,   150,   141,   133
};

static const uint16_t vs_frequency_ratio[26] = {
    1, 1,
    107, 101,
    55, 49,
    44, 37,
    160, 127,
    4, 3,
    140, 99,
    218, 146,
    100, 63,
    111, 66,
    98, 55,
    168, 89,
    2, 1
};

static int8_t vs_empty_sample_data[256];  // zero-initialized

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum VsEffect {
    VS_EFFECT_GOSUB             = 0x81,
    VS_EFFECT_RETURN            = 0x82,
    VS_EFFECT_START_LOOP        = 0x83,
    VS_EFFECT_DO_LOOP           = 0x84,
    VS_EFFECT_SET_SAMPLE        = 0x85,
    VS_EFFECT_SET_VOLUME_ENV    = 0x86,
    VS_EFFECT_SET_PERIOD_TABLE  = 0x87,
    VS_EFFECT_SET_WAVEFORM_TABLE = 0x88,
    VS_EFFECT_PORTAMENTO        = 0x89,
    VS_EFFECT_SET_TRANSPOSE     = 0x8a,
    VS_EFFECT_GOTO              = 0x8b,
    VS_EFFECT_SET_RESET_FLAGS   = 0x8c,
    VS_EFFECT_SET_WAVEFORM_MASK = 0x8d,
    VS_EFFECT_NOTE_CUT          = 0xff
} VsEffect;

typedef enum VsOffsetType {
    VS_OFFSET_UNKNOWN = 0,
    VS_OFFSET_TRACK,
    VS_OFFSET_VOLUME_ENVELOPE,
    VS_OFFSET_PERIOD_TABLE,
    VS_OFFSET_WAVEFORM_TABLE,
    VS_OFFSET_WAVEFORM,
    VS_OFFSET_SAMPLE
} VsOffsetType;

// ResetFlag
#define VS_RESET_NONE              0
#define VS_RESET_WAVEFORM_TABLE    (1 << 5)
#define VS_RESET_PERIOD_TABLE      (1 << 6)
#define VS_RESET_VOLUME_ENVELOPE   (1 << 7)

// SynthesisFlag
#define VS_SYNTH_NONE               0
#define VS_SYNTH_FREQUENCY_BASED    (1 << 0)
#define VS_SYNTH_STOP_SAMPLE        (1 << 1)
#define VS_SYNTH_FREQUENCY_MAPPED   (1 << 5)
#define VS_SYNTH_XOR_RING_MOD       (1 << 6)
#define VS_SYNTH_MORPHING           (1 << 7)

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Track data (byte array)
typedef struct VsTrackData {
    uint8_t* track;
    int      length;
} VsTrackData;

// Table (byte array, used for volume envelopes, period tables, waveform tables)
typedef struct VsTable {
    uint8_t* data;
    int      length;
} VsTable;

// Waveform (32-byte synth waveform or raw sample)
typedef struct VsWaveform {
    int     offset;      // file offset, -1 for empty
    int8_t* data;
    int     data_length;
    uint16_t sample_length; // only for Sample subclass (0 for plain waveform)
    bool     is_sample;
} VsWaveform;

// Generic module data element (union-style via type tag)
typedef enum VsDataType {
    VS_DATA_NONE = 0,
    VS_DATA_TRACK,
    VS_DATA_TABLE,
    VS_DATA_WAVEFORM
} VsDataType;

typedef struct VsModuleData {
    VsDataType type;
    union {
        VsTrackData track;
        VsTable     table;
        VsWaveform  waveform;
    } u;
} VsModuleData;

// Song info for one subsong
typedef struct VsSongInfo {
    int track_indices[4];  // indices into data[] for the 4 voice tracks
    int data_count;
    VsModuleData* data;
} VsSongInfo;

// Stack for gosub/loop
#define VS_STACK_MAX 64

typedef struct VsStack {
    uint32_t items[VS_STACK_MAX];
    int top;
} VsStack;

static void stack_init(VsStack* s) { s->top = 0; }

static void stack_push(VsStack* s, uint32_t val) {
    if (s->top < VS_STACK_MAX) s->items[s->top++] = val;
}

static uint32_t stack_pop(VsStack* s) {
    if (s->top > 0) return s->items[--s->top];
    return 0;
}

// VoiceInfo
typedef struct VsVoiceInfo {
    int channel_number;

    // Waveform references (indices into song data)
    int      sample1_idx;     // -1 = empty
    uint32_t sample1_offset;
    int16_t  sample1_number;
    int      sample2_idx;     // -1 = empty
    int16_t  sample2_number;

    int8_t   audio_buffer[2][32];
    uint8_t  use_audio_buffer;

    VsStack  stack;

    int      track_idx;   // index into song data for current track
    int      track_position;
    uint8_t  tick_counter;

    bool     new_note;
    int8_t   transpose;
    uint16_t note_period;
    uint16_t target_period;
    uint8_t  current_volume;
    uint8_t  final_volume;
    uint8_t  master_volume;
    uint8_t  reset_flags;

    uint8_t  portamento_tick_counter;
    uint8_t  portamento_increment;
    bool     portamento_direction;
    uint8_t  portamento_delay;
    uint8_t  portamento_duration;

    int      vol_env_idx;   // index into song data for vol envelope, -1 = none
    uint8_t  vol_env_position;
    uint8_t  vol_env_tick_counter;
    uint8_t  vol_env_delta;

    int      period_table_idx;  // index into song data, -1 = none
    uint8_t  period_table_position;
    uint8_t  period_table_tick_counter;
    uint8_t  period_table_command;

    int      waveform_table_idx;  // index into song data, -1 = none
    uint8_t  waveform_table_position;

    uint8_t  waveform_start_position;
    uint8_t  waveform_position;
    uint8_t  waveform_tick_counter;
    uint8_t  waveform_increment;
    uint8_t  waveform_mask;
    uint8_t  synthesis_mode;
    uint8_t  morph_speed;
} VsVoiceInfo;

// Mix channel
typedef struct VsMixChannel {
    const int8_t* sample_data;
    uint32_t sample_length;  // in bytes (Paula Length * 2)
    uint32_t loop_start;
    uint32_t loop_length;
    uint32_t sample_offset;
    uint64_t position_fp;
    uint16_t period;
    uint16_t volume;
    uint16_t paula_length;  // Length in words
    bool     active;
    bool     muted;
    bool     dma_state;

    // Pending sample for SetAddress
    int16_t  pending_number;
    const int8_t* pending_sample;
    uint32_t pending_offset;
    bool     pending_retrig;
} VsMixChannel;

struct VsModule {
    float sample_rate;

    // Module data
    int          num_subsongs;
    VsSongInfo*  subsongs;

    // All waveforms for sample numbering
    int          num_all_samples;
    int*         all_sample_indices;  // indices into current song data

    // Current song
    VsSongInfo*  current_song;

    // Voices
    VsVoiceInfo  voices[4];
    VsMixChannel channels[4];

    uint16_t     all_voices_taken;
    bool         end_reached;
    bool         has_ended;

    // Tick timing
    float tick_accumulator;
    float ticks_per_frame;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Big-endian reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct VsReader {
    const uint8_t* data;
    size_t         size;
    size_t         pos;
} VsReader;

static void reader_init(VsReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos  = 0;
}

static bool reader_eof(const VsReader* r) {
    return r->pos > r->size;
}

static void reader_seek(VsReader* r, size_t pos) {
    r->pos = pos;
}

static uint8_t reader_read_uint8(VsReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static uint16_t reader_read_b_uint16(VsReader* r) {
    if (r->pos + 2 > r->size) { r->pos = r->size + 1; return 0; }
    uint16_t val = ((uint16_t)r->data[r->pos] << 8) | r->data[r->pos + 1];
    r->pos += 2;
    return val;
}

static int32_t reader_read_b_int32(VsReader* r) {
    if (r->pos + 4 > r->size) { r->pos = r->size + 1; return 0; }
    int32_t val = ((int32_t)r->data[r->pos] << 24) |
                  ((int32_t)r->data[r->pos + 1] << 16) |
                  ((int32_t)r->data[r->pos + 2] << 8) |
                   r->data[r->pos + 3];
    r->pos += 4;
    return val;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helper: get data from current song
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static VsModuleData* vs_get_data(VsModule* m, int idx) {
    if (!m->current_song || idx < 0 || idx >= m->current_song->data_count)
        return nullptr;
    return &m->current_song->data[idx];
}

static VsTrackData* vs_get_track(VsModule* m, int idx) {
    VsModuleData* d = vs_get_data(m, idx);
    if (d && d->type == VS_DATA_TRACK) return &d->u.track;
    return nullptr;
}

static VsTable* vs_get_table(VsModule* m, int idx) {
    VsModuleData* d = vs_get_data(m, idx);
    if (d && d->type == VS_DATA_TABLE) return &d->u.table;
    return nullptr;
}

static VsWaveform* vs_get_waveform(VsModule* m, int idx) {
    VsModuleData* d = vs_get_data(m, idx);
    if (d && (d->type == VS_DATA_WAVEFORM)) return &d->u.waveform;
    return nullptr;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel / Paula simulation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void paula_set_address(VsMixChannel* c, int16_t number, const int8_t* data, uint32_t offset, bool retrig) {
    c->pending_number  = number;
    c->pending_sample  = data;
    c->pending_offset  = offset;
    c->pending_retrig  = retrig;
}

static void paula_set_length(VsMixChannel* c, uint16_t length_words) {
    c->paula_length = length_words;
}

static void paula_set_period(VsMixChannel* c, uint16_t period) {
    c->period = period;
}

static void paula_set_volume(VsMixChannel* c, uint16_t volume) {
    if (volume > 64) volume = 64;
    c->volume = volume;
}

static void paula_set_dma(VsMixChannel* c, bool enabled) {
    if (enabled) {
        if ((!c->dma_state || !c->active) && (c->pending_sample != nullptr)) {
            // PlaySample
            c->sample_data   = c->pending_sample;
            c->sample_offset = c->pending_offset;
            c->sample_length = c->pending_offset + (uint32_t)c->paula_length * 2;
            c->loop_start    = 0;
            c->loop_length   = 0;
            c->position_fp   = (uint64_t)c->pending_offset << SAMPLE_FRAC_BITS;
            c->active        = true;
        }
    }
    else {
        if (c->dma_state) {
            c->active = false;
        }
    }
    c->dma_state = enabled;
}

// Interrupt handler: returns new sample data for loop
static void paula_interrupt(VsMixChannel* c) {
    // On interrupt, set the next sample address for loop playback
    if (c->pending_sample != nullptr) {
        c->sample_data   = c->pending_sample;
        c->sample_offset = c->pending_offset;
        c->sample_length = c->pending_offset + (uint32_t)c->paula_length * 2;
        c->loop_start    = c->pending_offset;
        c->loop_length   = (uint32_t)c->paula_length * 2;
        c->position_fp   = (uint64_t)c->pending_offset << SAMPLE_FRAC_BITS;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Offset info used during loading
typedef struct VsOffsetInfo {
    int         offset;
    VsOffsetType type;
    int         data_index;  // which data[] slot
} VsOffsetInfo;

static int vs_check_module(const uint8_t* data, size_t size, int* out_footer_offset) {
    if (size < 64)
        return -1;

    size_t search_offset = (size - 64 + 1) & ~(size_t)1;
    const uint8_t* buffer = data + search_offset;
    int buffer_len = (int)(size - search_offset);

    for (int i = 0; i <= buffer_len - 8; i += 2) {
        if (buffer[i] == 'V' && buffer[i+1] == 'S' && buffer[i+2] == 'S' && buffer[i+3] == '0') {
            *out_footer_offset = (int)search_offset + i;

            uint32_t songs = ((uint32_t)buffer[i+4] << 24) | ((uint32_t)buffer[i+5] << 16) |
                             ((uint32_t)buffer[i+6] << 8) | buffer[i+7];

            if (songs < 0x100)
                return (int)songs;

            return -1;
        }
    }

    return -1;
}

static VsOffsetInfo* load_all_offsets(VsReader* reader, int song_offset, int footer_offset, int* out_count) {
    reader_seek(reader, song_offset);

    int min_offset = footer_offset;
    int capacity = 64;
    VsOffsetInfo* offsets = (VsOffsetInfo*)calloc(capacity, sizeof(VsOffsetInfo));
    int count = 0;

    for (;;) {
        int32_t new_offset = reader_read_b_int32(reader);
        if (reader_eof(reader)) { free(offsets); return nullptr; }

        if (new_offset >= 0) {
            int abs_offset = song_offset + new_offset;
            if (abs_offset < min_offset)
                min_offset = abs_offset;
        }

        if (count >= capacity) {
            capacity *= 2;
            offsets = (VsOffsetInfo*)realloc(offsets, capacity * sizeof(VsOffsetInfo));
        }

        offsets[count].offset     = song_offset + new_offset;
        offsets[count].type       = VS_OFFSET_UNKNOWN;
        offsets[count].data_index = -1;
        count++;

        if ((int)reader->pos == min_offset)
            break;
    }

    // First 4 are tracks
    if (count >= 4) {
        offsets[0].type = VS_OFFSET_TRACK;
        offsets[1].type = VS_OFFSET_TRACK;
        offsets[2].type = VS_OFFSET_TRACK;
        offsets[3].type = VS_OFFSET_TRACK;
    }

    *out_count = count;
    return offsets;
}

static uint8_t* load_single_track(VsReader* reader, int track_offset, VsOffsetInfo* offsets, int num_offsets, int* out_length) {
    reader_seek(reader, track_offset);

    int capacity = 256;
    uint8_t* track_data = (uint8_t*)malloc(capacity);
    int length = 0;

    bool sample_mode = false;
    int sample_number1 = -1;
    int sample_number2 = -1;
    bool done = false;

    do {
        uint8_t cmd = reader_read_uint8(reader);
        if (reader_eof(reader)) { free(track_data); return nullptr; }

        if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
        track_data[length++] = cmd;

        if (cmd < 0x80) {
            if (sample_number1 != -1) {
                offsets[sample_number1].type = sample_mode ? VS_OFFSET_SAMPLE : VS_OFFSET_WAVEFORM;
                sample_number1 = -1;
            }
            if (sample_number2 != -1) {
                offsets[sample_number2].type = sample_mode ? VS_OFFSET_SAMPLE : VS_OFFSET_WAVEFORM;
                sample_number2 = -1;
            }

            uint8_t b = reader_read_uint8(reader);
            if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
            track_data[length++] = b;
            continue;
        }

        switch (cmd) {
            case VS_EFFECT_GOSUB: {
                uint8_t arg = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg;
                if (arg < num_offsets) offsets[arg].type = VS_OFFSET_TRACK;
                break;
            }
            case VS_EFFECT_RETURN:
                done = true;
                break;

            case VS_EFFECT_DO_LOOP:
                break;

            case VS_EFFECT_START_LOOP: {
                for (int i = 0; i < 2; i++) {
                    uint8_t b = reader_read_uint8(reader);
                    if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                    track_data[length++] = b;
                }
                break;
            }

            case VS_EFFECT_SET_SAMPLE: {
                uint8_t arg1 = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg1;
                sample_number1 = arg1;

                uint8_t arg2 = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg2;
                sample_number2 = arg2;
                break;
            }

            case VS_EFFECT_SET_VOLUME_ENV: {
                uint8_t arg = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg;
                if (arg < num_offsets) offsets[arg].type = VS_OFFSET_VOLUME_ENVELOPE;
                break;
            }

            case VS_EFFECT_SET_PERIOD_TABLE: {
                uint8_t arg = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg;
                if (arg < num_offsets) offsets[arg].type = VS_OFFSET_PERIOD_TABLE;
                break;
            }

            case VS_EFFECT_SET_WAVEFORM_TABLE: {
                uint8_t arg = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg;
                if (arg < num_offsets) offsets[arg].type = VS_OFFSET_WAVEFORM_TABLE;

                uint8_t arg2 = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = arg2;
                sample_mode = (arg2 & 0x20) != 0;
                break;
            }

            case VS_EFFECT_PORTAMENTO: {
                for (int i = 0; i < 3; i++) {
                    uint8_t b = reader_read_uint8(reader);
                    if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                    track_data[length++] = b;
                }
                break;
            }

            case VS_EFFECT_SET_TRANSPOSE:
            case VS_EFFECT_SET_RESET_FLAGS:
            case VS_EFFECT_SET_WAVEFORM_MASK:
            case VS_EFFECT_NOTE_CUT: {
                uint8_t b = reader_read_uint8(reader);
                if (length >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = b;
                break;
            }

            case VS_EFFECT_GOTO: {
                uint8_t arg = reader_read_uint8(reader);
                int new_track_offset = (arg < num_offsets) ? offsets[arg].offset : track_offset;

                uint16_t pos = 0;
                if ((new_track_offset >= track_offset) && (new_track_offset < (track_offset + length)))
                    pos = (uint16_t)(new_track_offset - track_offset);

                if (length + 2 >= capacity) { capacity *= 2; track_data = (uint8_t*)realloc(track_data, capacity); }
                track_data[length++] = (uint8_t)(pos >> 8);
                track_data[length++] = (uint8_t)(pos & 0xff);

                done = true;
                break;
            }

            default:
                free(track_data);
                return nullptr;
        }
    } while (!done);

    *out_length = length;
    return track_data;
}

static uint8_t* load_single_volume_envelope(VsReader* reader, int offset, int* out_length) {
    reader_seek(reader, offset);

    int capacity = 32;
    uint8_t* data = (uint8_t*)malloc(capacity);
    int length = 0;
    bool done = false;

    do {
        uint8_t byt = reader_read_uint8(reader);
        if (reader_eof(reader)) { free(data); return nullptr; }

        if (length + 2 >= capacity) { capacity *= 2; data = (uint8_t*)realloc(data, capacity); }
        data[length++] = byt;
        data[length++] = reader_read_uint8(reader);

        if (byt == 0x88)
            done = true;
    } while (!done);

    *out_length = length;
    return data;
}

static uint8_t* load_single_period_table(VsReader* reader, int offset, int* out_length) {
    reader_seek(reader, offset);

    int capacity = 32;
    uint8_t* data = (uint8_t*)malloc(capacity);
    int length = 0;
    bool done = false;

    do {
        uint8_t byt = reader_read_uint8(reader);
        if (reader_eof(reader)) { free(data); return nullptr; }

        if (length + 2 >= capacity) { capacity *= 2; data = (uint8_t*)realloc(data, capacity); }
        data[length++] = byt;
        data[length++] = reader_read_uint8(reader);

        if (byt == 0xff)
            done = true;
    } while (!done);

    *out_length = length;
    return data;
}

static bool load_subsong(VsModule* m, VsReader* reader, int song_offset, int footer_offset, VsSongInfo* song) {
    (void)m;
    int num_offsets;
    VsOffsetInfo* offsets = load_all_offsets(reader, song_offset, footer_offset, &num_offsets);
    if (!offsets) return false;

    // Allocate data array
    song->data_count = num_offsets;
    song->data = (VsModuleData*)calloc(num_offsets, sizeof(VsModuleData));

    // Load tracks (first pass: load ones already typed as TRACK)
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_TRACK) {
            int len;
            uint8_t* track = load_single_track(reader, offsets[i].offset, offsets, num_offsets, &len);
            if (!track) { free(offsets); return false; }

            song->data[i].type = VS_DATA_TRACK;
            song->data[i].u.track.track  = track;
            song->data[i].u.track.length = len;
        }
    }

    // Re-scan for newly discovered tracks from gosub
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_TRACK && song->data[i].type == VS_DATA_NONE) {
            int len;
            uint8_t* track = load_single_track(reader, offsets[i].offset, offsets, num_offsets, &len);
            if (!track) { free(offsets); return false; }

            song->data[i].type = VS_DATA_TRACK;
            song->data[i].u.track.track  = track;
            song->data[i].u.track.length = len;
        }
    }

    // Load volume envelopes
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_VOLUME_ENVELOPE) {
            int len;
            uint8_t* data = load_single_volume_envelope(reader, offsets[i].offset, &len);
            if (!data) { free(offsets); return false; }

            song->data[i].type = VS_DATA_TABLE;
            song->data[i].u.table.data   = data;
            song->data[i].u.table.length  = len;
        }
    }

    // Load period tables
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_PERIOD_TABLE) {
            int len;
            uint8_t* data = load_single_period_table(reader, offsets[i].offset, &len);
            if (!data) { free(offsets); return false; }

            song->data[i].type = VS_DATA_TABLE;
            song->data[i].u.table.data   = data;
            song->data[i].u.table.length  = len;
        }
    }

    // Load waveform tables (fixed 28 bytes)
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_WAVEFORM_TABLE) {
            reader_seek(reader, offsets[i].offset);
            uint8_t* data = (uint8_t*)malloc(28);
            for (int j = 0; j < 28; j++)
                data[j] = reader_read_uint8(reader);
            if (reader_eof(reader)) { free(data); free(offsets); return false; }

            song->data[i].type = VS_DATA_TABLE;
            song->data[i].u.table.data   = data;
            song->data[i].u.table.length  = 28;
        }
    }

    // Load waveforms (32 bytes)
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_WAVEFORM) {
            reader_seek(reader, offsets[i].offset);
            int8_t* data = (int8_t*)malloc(32);
            for (int j = 0; j < 32; j++)
                data[j] = (int8_t)reader_read_uint8(reader);
            if (reader_eof(reader)) { free(data); free(offsets); return false; }

            song->data[i].type = VS_DATA_WAVEFORM;
            song->data[i].u.waveform.data        = data;
            song->data[i].u.waveform.data_length  = 32;
            song->data[i].u.waveform.offset       = offsets[i].offset;
            song->data[i].u.waveform.sample_length = 0;
            song->data[i].u.waveform.is_sample    = false;
        }
    }

    // Load samples (length prefix at offset - 2, then data at offset)
    for (int i = 0; i < num_offsets; i++) {
        if (offsets[i].type == VS_OFFSET_SAMPLE) {
            int sample_offset = offsets[i].offset;
            reader_seek(reader, sample_offset - 2);
            uint16_t sample_length = reader_read_b_uint16(reader);

            int8_t* data = (int8_t*)malloc(sample_length > 0 ? sample_length : 1);
            reader_seek(reader, sample_offset);
            for (int j = 0; j < sample_length; j++)
                data[j] = (int8_t)reader_read_uint8(reader);

            if (reader_eof(reader)) { free(data); free(offsets); return false; }

            song->data[i].type = VS_DATA_WAVEFORM;
            song->data[i].u.waveform.data          = data;
            song->data[i].u.waveform.data_length    = sample_length;
            song->data[i].u.waveform.offset         = sample_offset;
            song->data[i].u.waveform.sample_length  = sample_length;
            song->data[i].u.waveform.is_sample      = true;
        }
    }

    // Store track indices for 4 voices
    for (int i = 0; i < 4; i++)
        song->track_indices[i] = i;

    free(offsets);
    return true;
}

static bool load_module(VsModule* m, const uint8_t* data, size_t size) {
    int footer_offset;
    int num_songs = vs_check_module(data, size, &footer_offset);
    if (num_songs <= 0) return false;

    VsReader reader;
    reader_init(&reader, data, size);

    // Load song offsets
    reader_seek(&reader, footer_offset + 4);
    int32_t song_count = reader_read_b_int32(&reader);
    if (song_count <= 0 || song_count > 255) return false;

    int* song_offsets = (int*)malloc(song_count * sizeof(int));
    for (int i = 0; i < song_count; i++)
        song_offsets[i] = footer_offset + reader_read_b_int32(&reader);

    if (reader_eof(&reader)) { free(song_offsets); return false; }

    m->num_subsongs = song_count;
    m->subsongs     = (VsSongInfo*)calloc(song_count, sizeof(VsSongInfo));

    for (int i = 0; i < song_count; i++) {
        if (!load_subsong(m, &reader, song_offsets[i], footer_offset, &m->subsongs[i])) {
            free(song_offsets);
            return false;
        }
    }

    free(song_offsets);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Find sample number (index into all_samples ordering)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int16_t find_sample_number(VsModule* m, int waveform_idx) {
    if (!m->current_song) return -1;
    VsModuleData* d = vs_get_data(m, waveform_idx);
    if (!d || d->type != VS_DATA_WAVEFORM) return -1;

    int target_offset = d->u.waveform.offset;

    // Linear search through all waveforms in data order
    for (int i = 0; i < m->num_all_samples; i++) {
        int idx = m->all_sample_indices[i];
        VsModuleData* sd = vs_get_data(m, idx);
        if (sd && sd->type == VS_DATA_WAVEFORM && sd->u.waveform.offset == target_offset)
            return (int16_t)i;
    }

    return -1;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Build all_samples index for current song
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void build_all_samples(VsModule* m) {
    if (m->all_sample_indices) { free(m->all_sample_indices); m->all_sample_indices = nullptr; }
    m->num_all_samples = 0;

    if (!m->current_song) return;

    // Count waveforms
    int count = 0;
    for (int i = 0; i < m->current_song->data_count; i++) {
        if (m->current_song->data[i].type == VS_DATA_WAVEFORM)
            count++;
    }

    m->all_sample_indices = (int*)malloc(count * sizeof(int));
    int idx = 0;
    for (int i = 0; i < m->current_song->data_count; i++) {
        if (m->current_song->data[i].type == VS_DATA_WAVEFORM)
            m->all_sample_indices[idx++] = i;
    }
    m->num_all_samples = count;

    // Sort by offset (stable ordering)
    for (int i = 0; i < count - 1; i++) {
        for (int j = i + 1; j < count; j++) {
            int oi = m->current_song->data[m->all_sample_indices[i]].u.waveform.offset;
            int oj = m->current_song->data[m->all_sample_indices[j]].u.waveform.offset;
            if (oj < oi) {
                int tmp = m->all_sample_indices[i];
                m->all_sample_indices[i] = m->all_sample_indices[j];
                m->all_sample_indices[j] = tmp;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(VsModule* m, int subsong) {
    m->current_song = &m->subsongs[subsong];

    build_all_samples(m);

    for (int i = 0; i < 4; i++) {
        VsVoiceInfo* v = &m->voices[i];
        memset(v, 0, sizeof(VsVoiceInfo));

        v->channel_number     = i;
        v->sample1_idx        = -1;
        v->sample1_offset     = 0;
        v->sample1_number     = -1;
        v->sample2_idx        = -1;
        v->sample2_number     = -1;
        v->use_audio_buffer   = 0;
        stack_init(&v->stack);
        v->track_idx          = m->current_song->track_indices[i];
        v->track_position     = 0;
        v->tick_counter       = 1;
        v->new_note           = false;
        v->transpose          = 0;
        v->note_period        = 0;
        v->target_period      = 0;
        v->current_volume     = 0;
        v->final_volume       = 0;
        v->master_volume      = 64;
        v->reset_flags        = VS_RESET_NONE;
        v->portamento_tick_counter = 0;
        v->portamento_increment    = 0;
        v->portamento_direction    = false;
        v->portamento_delay        = 0;
        v->portamento_duration     = 0;
        v->vol_env_idx             = -1;
        v->vol_env_position        = 0;
        v->vol_env_tick_counter    = 0;
        v->vol_env_delta           = 0;
        v->period_table_idx        = -1;
        v->period_table_position   = 0;
        v->period_table_tick_counter = 0;
        v->period_table_command    = 0;
        v->waveform_table_idx      = -1;
        v->waveform_table_position = 0;
        v->waveform_start_position = 0;
        v->waveform_position       = 0;
        v->waveform_tick_counter   = 0;
        v->waveform_increment      = 1;
        v->waveform_mask           = 0;
        v->synthesis_mode          = VS_SYNTH_NONE;
        v->morph_speed             = 0;

        VsMixChannel* c = &m->channels[i];
        memset(c, 0, sizeof(VsMixChannel));
        paula_set_length(c, 0x10);
        paula_set_volume(c, 0);
        paula_set_address(c, -1, vs_empty_sample_data, 0, false);
        paula_set_dma(c, true);
    }

    m->end_reached = false;
    m->has_ended   = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint16_t get_period(VsVoiceInfo* v, uint8_t note) {
    int idx = note + v->transpose;
    if (idx < 0) idx = 0;
    if (idx >= 99) idx = 98;
    return vs_periods[idx];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Audio interrupt handler
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void audio_interrupt(VsModule* m, int voice_number) {
    VsVoiceInfo* v = &m->voices[voice_number];
    VsMixChannel* c = &m->channels[voice_number];

    if (v->synthesis_mode & VS_SYNTH_FREQUENCY_MAPPED) {
        uint32_t prev_sample_offset = v->sample1_offset;
        v->sample1_offset += (uint32_t)((v->waveform_increment << 8) | v->waveform_start_position);

        if (v->synthesis_mode & VS_SYNTH_STOP_SAMPLE) {
            paula_set_address(c, -1, vs_empty_sample_data, 0, false);
            v->sample1_idx    = -1;
            v->sample1_offset = 0;
        }
        else {
            VsWaveform* sample = (v->sample2_idx >= 0) ? vs_get_waveform(m, v->sample2_idx) : nullptr;

            if (sample && v->sample1_offset >= sample->sample_length) {
                paula_set_address(c, -1, vs_empty_sample_data, 0, false);
                v->sample1_idx    = -1;
                v->sample1_offset = 0;
                v->synthesis_mode |= VS_SYNTH_STOP_SAMPLE;
            }
            else {
                VsWaveform* s1 = (v->sample1_idx >= 0) ? vs_get_waveform(m, v->sample1_idx) : nullptr;
                if (s1)
                    paula_set_address(c, v->sample1_number, s1->data, prev_sample_offset, v->new_note);
                v->new_note = false;
            }
        }
    }

    paula_interrupt(c);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — volume envelope
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_volume_envelope(VsModule* m, VsVoiceInfo* v) {
    v->vol_env_tick_counter--;

    if (v->vol_env_tick_counter == 0) {
        VsTable* envelope = vs_get_table(m, v->vol_env_idx);
        if (!envelope) return;

        uint8_t* env = envelope->data;

        while (env[v->vol_env_position] == 0x88) {
            v->vol_env_position = env[v->vol_env_position + 1];
        }

        if (env[v->vol_env_position + 1] == 0) {
            v->current_volume     = env[v->vol_env_position];
            v->vol_env_tick_counter = 1;
        }
        else {
            v->vol_env_delta        = env[v->vol_env_position];
            v->vol_env_tick_counter = env[v->vol_env_position + 1];
            v->current_volume += v->vol_env_delta;
        }

        v->vol_env_position += 2;
    }
    else {
        v->current_volume += v->vol_env_delta;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — period table part 1
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_period_table_part1(VsModule* m, VsVoiceInfo* v) {
    v->period_table_tick_counter--;

    if (v->period_table_tick_counter == 0) {
        VsTable* table = vs_get_table(m, v->period_table_idx);
        if (table != nullptr) {
            uint8_t* data = table->data;

            while (data[v->period_table_position] == 0xff) {
                v->period_table_position = data[v->period_table_position + 1];
            }

            v->period_table_command      = data[v->period_table_position++];
            v->period_table_tick_counter = data[v->period_table_position++];
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — period table part 2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_period_table_part2(VsVoiceInfo* v) {
    if (v->period_table_command == 0xfe) {
        v->note_period <<= 1;
    }
    else if (v->period_table_command == 0x7f) {
        v->note_period >>= 1;
    }
    else if (v->period_table_command == 0x7e) {
        uint8_t counter = v->period_table_tick_counter;
        v->period_table_tick_counter = 1;

        uint16_t numerator, denominator;
        bool round;

        if ((counter & 0x80) != 0) {
            counter &= 0x7f;

            if (counter >= 13) {
                int octave = (counter / 12) & 7;
                v->note_period <<= octave;
                counter = (uint8_t)(counter % 12);
            }

            counter *= 2;
            numerator   = vs_frequency_ratio[counter];
            denominator = vs_frequency_ratio[counter + 1];
            round = true;
        }
        else {
            if (counter >= 13) {
                int octave = (counter / 12) & 7;
                v->note_period >>= octave;
                counter = (uint8_t)(counter % 12);
            }

            counter *= 2;
            denominator = vs_frequency_ratio[counter];
            numerator   = vs_frequency_ratio[counter + 1];
            round = false;
        }

        int temp = v->note_period * numerator;
        v->note_period = (uint16_t)(temp / denominator);

        if (round && ((temp % denominator) != 0))
            v->note_period++;
    }
    else if (v->period_table_command < 0x7f) {
        v->note_period += v->period_table_command;
    }
    else {
        v->note_period -= (uint16_t)(v->period_table_command & 0x7f);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — portamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_portamento(VsVoiceInfo* v) {
    v->portamento_duration--;

    if (v->portamento_duration == 0) {
        v->portamento_increment    = 0;
        v->portamento_tick_counter = 0;
    }
    else {
        v->portamento_tick_counter--;

        if (v->portamento_tick_counter == 0) {
            v->portamento_tick_counter = v->portamento_delay;

            if (v->portamento_direction)
                v->note_period -= v->portamento_increment;
            else
                v->note_period += v->portamento_increment;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — set hardware
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void set_hardware(VsVoiceInfo* v, VsMixChannel* c) {
    paula_set_dma(c, true);
    paula_set_period(c, v->target_period);
    paula_set_volume(c, v->final_volume);

    v->target_period = v->note_period;
    v->final_volume  = (uint8_t)((v->current_volume * v->master_volume) / 64);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — waveform generators
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_ring_modulation(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    v->waveform_tick_counter--;

    if (v->waveform_tick_counter == 0) {
        VsTable* table = vs_get_table(m, v->waveform_table_idx);
        if (table == nullptr) return;

        uint8_t* tdata = table->data;

        while ((tdata[v->waveform_table_position] & 0x80) != 0) {
            v->waveform_table_position = tdata[v->waveform_table_position + 1];
        }

        v->waveform_increment    = tdata[v->waveform_table_position++];
        v->waveform_tick_counter = tdata[v->waveform_table_position++];
    }

    v->waveform_position = (uint8_t)((v->waveform_position + v->waveform_increment) & 0x1f);

    int8_t* playing_buffer = v->audio_buffer[v->use_audio_buffer];
    paula_set_address(c, v->sample1_number, playing_buffer, 0, v->new_note);

    v->new_note = false;
    v->use_audio_buffer ^= 1;

    VsWaveform* s1 = (v->sample1_idx >= 0) ? vs_get_waveform(m, v->sample1_idx) : nullptr;
    VsWaveform* s2 = (v->sample2_idx >= 0) ? vs_get_waveform(m, v->sample2_idx) : nullptr;

    if (s1 && s2) {
        int8_t* fill_buffer = v->audio_buffer[v->use_audio_buffer];

        uint32_t sample2_offset = v->waveform_position;
        uint8_t mask = v->waveform_mask;

        for (int i = 0; i < 32; i++) {
            int16_t s1_data = s1->data[i];
            int16_t s2_data = s2->data[sample2_offset++];
            uint8_t sample = (uint8_t)((s1_data + s2_data) >> 1);

            if ((sample & 0x80) != 0)
                sample = (uint8_t)(-((-(int8_t)sample) | mask));
            else
                sample |= mask;

            fill_buffer[i] = (int8_t)sample;

            if (sample2_offset == 32)
                sample2_offset = 0;
        }
    }
}

static void do_xor_ring_modulation(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    v->waveform_tick_counter--;

    if (v->waveform_tick_counter == 0) {
        VsTable* table = vs_get_table(m, v->waveform_table_idx);
        if (table == nullptr) return;

        uint8_t* tdata = table->data;

        while (tdata[v->waveform_table_position] == 0xff) {
            v->waveform_table_position = tdata[v->waveform_table_position + 1];
        }

        v->waveform_increment    = tdata[v->waveform_table_position++];
        v->waveform_tick_counter = tdata[v->waveform_table_position++];
    }

    int8_t* playing_buffer = v->audio_buffer[v->use_audio_buffer];
    paula_set_address(c, v->sample1_number, playing_buffer, 0, v->new_note);

    v->new_note = false;
    v->use_audio_buffer ^= 1;

    VsWaveform* s1 = (v->sample1_idx >= 0) ? vs_get_waveform(m, v->sample1_idx) : nullptr;
    VsWaveform* s2 = (v->sample2_idx >= 0) ? vs_get_waveform(m, v->sample2_idx) : nullptr;

    if (s1 && s2) {
        int8_t* fill_buffer = v->audio_buffer[v->use_audio_buffer];

        if ((v->waveform_increment & 0x80) != 0) {
            for (int i = 0; i < 32; i++)
                fill_buffer[i] = s1->data[i];
        }
        else {
            uint8_t position = v->waveform_position;
            uint8_t switch_position = (uint8_t)((v->waveform_increment & 0x1f) + position);
            bool flag = false;

            if ((switch_position & 0x20) != 0) {
                flag = true;
                switch_position &= 0x1f;
            }

            for (int i = 0; i < 32; i++) {
                int8_t sample_data = playing_buffer[i];

                if (i == position)
                    flag = !flag;

                if (i == switch_position)
                    flag = !flag;

                if (flag)
                    sample_data ^= (int8_t)(s2->data[i] & v->waveform_mask);

                fill_buffer[i] = sample_data;
            }

            v->waveform_position = (uint8_t)((v->waveform_increment + v->waveform_position) & 0x1f);
        }
    }
}

static void do_morphing(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    v->waveform_tick_counter--;

    if (v->waveform_tick_counter == 0) {
        VsTable* table = vs_get_table(m, v->waveform_table_idx);
        if (table == nullptr) return;

        uint8_t* tdata = table->data;

        while (tdata[v->waveform_table_position] == 0xff) {
            v->waveform_table_position = tdata[v->waveform_table_position + 1];
        }

        v->waveform_increment    = tdata[v->waveform_table_position++];
        v->morph_speed           = tdata[v->waveform_table_position++];
        v->waveform_tick_counter = tdata[v->waveform_table_position++];
    }

    int8_t* playing_buffer = v->audio_buffer[v->use_audio_buffer];
    paula_set_address(c, v->sample1_number, playing_buffer, 0, v->new_note);

    v->new_note = false;
    v->use_audio_buffer ^= 1;

    VsWaveform* s1 = (v->sample1_idx >= 0) ? vs_get_waveform(m, v->sample1_idx) : nullptr;
    VsWaveform* s2 = (v->sample2_idx >= 0) ? vs_get_waveform(m, v->sample2_idx) : nullptr;

    if (s1 && s2) {
        int8_t* fill_buffer = v->audio_buffer[v->use_audio_buffer];

        if (v->waveform_increment == 0x80) {
            for (int i = 0; i < 32; i++)
                fill_buffer[i] = s1->data[i];
        }
        else {
            uint8_t speed = v->morph_speed;
            int8_t* sample = ((v->waveform_increment & 0xc0) == 0x40) ? s1->data : s2->data;

            uint8_t position = v->waveform_position;
            uint8_t switch_position = (uint8_t)((v->waveform_increment & 0x1f) + position);
            bool flag = false;

            if ((switch_position & 0x20) != 0) {
                flag = true;
                switch_position &= 0x1f;
            }

            for (int i = 0; i < 32; i++) {
                int8_t sample_data = playing_buffer[i];

                if (i == position)
                    flag = !flag;

                if (i == switch_position)
                    flag = !flag;

                if (flag) {
                    uint8_t sd1 = (uint8_t)(sample_data - (int8_t)0x80);
                    uint8_t sd2 = (uint8_t)(sample[i] - (int8_t)0x80);
                    uint8_t diff = (uint8_t)(sd2 - sd1);

                    if (sd2 < sd1) {
                        diff = (uint8_t)(-(int8_t)diff);

                        if (speed >= diff)
                            sample_data = sample[i];
                        else
                            sample_data = (int8_t)(sd1 + 0x80 - speed);
                    }
                    else {
                        if (speed >= diff)
                            sample_data = sample[i];
                        else
                            sample_data = (int8_t)(sd1 + 0x80 + speed);
                    }
                }

                fill_buffer[i] = sample_data;
            }

            if ((v->waveform_increment & 0xc0) != 0xc0)
                v->waveform_position = (uint8_t)((v->waveform_increment + v->waveform_position) & 0x1f);
        }
    }
}

static void do_frequency_mapped(VsModule* m, VsVoiceInfo* v) {
    v->waveform_tick_counter--;

    if (v->waveform_tick_counter == 0) {
        VsTable* table = vs_get_table(m, v->waveform_table_idx);
        if (!table) return;
        uint8_t* tdata = table->data;

        while (tdata[v->waveform_table_position] == 0xff) {
            v->waveform_table_position = tdata[v->waveform_table_position + 1];
        }

        // sample1 = sample2
        v->sample1_idx    = v->sample2_idx;
        v->sample1_offset = (uint32_t)((tdata[v->waveform_table_position] << 8) + tdata[v->waveform_table_position + 1]);
        v->sample1_number = v->sample2_number;

        v->synthesis_mode &= ~VS_SYNTH_STOP_SAMPLE;
        v->waveform_tick_counter = tdata[v->waveform_table_position + 2];
        v->waveform_table_position += 3;
    }

    if (v->synthesis_mode & VS_SYNTH_FREQUENCY_BASED) {
        uint16_t period = vs_periods[v->waveform_mask];
        int delta     = v->note_period / period;
        int remainder = v->note_period % period;

        uint16_t result = (uint16_t)(((remainder * 128) / period) + (delta * 128));
        v->waveform_increment      = (uint8_t)(result >> 8);
        v->waveform_start_position = (uint8_t)(result & 0xff);
    }
    else {
        v->waveform_increment      = 0;
        v->waveform_start_position = 128;
    }
}

static void waveform_generator(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    if (v->synthesis_mode & VS_SYNTH_XOR_RING_MOD)
        do_xor_ring_modulation(m, v, c);
    else if (v->synthesis_mode & VS_SYNTH_MORPHING)
        do_morphing(m, v, c);
    else if (v->synthesis_mode & VS_SYNTH_FREQUENCY_MAPPED)
        do_frequency_mapped(m, v);
    else
        do_ring_modulation(m, v, c);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — track commands
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum VsTrackResult {
    VS_TRACK_NEXT_COMMAND,
    VS_TRACK_EXIT,
    VS_TRACK_SET_WAIT
} VsTrackResult;

static void cmd_note_cut(VsVoiceInfo* v, uint8_t* track) {
    v->current_volume     = 0;
    v->vol_env_tick_counter = 0;
    v->tick_counter       = track[v->track_position++];
    v->final_volume       = 0;
    v->vol_env_delta      = 0;
}

static void cmd_gosub(VsModule* m, VsVoiceInfo* v, uint8_t* track) {
    (void)m;
    uint8_t track_num = track[v->track_position++];

    stack_push(&v->stack, (uint32_t)v->track_position);
    stack_push(&v->stack, (uint32_t)v->track_idx);

    v->track_idx      = track_num;
    v->track_position = 0;
}

static void cmd_return(VsVoiceInfo* v) {
    v->track_idx      = (int)stack_pop(&v->stack);
    v->track_position = (int)stack_pop(&v->stack);
}

static void cmd_start_loop(VsVoiceInfo* v, uint8_t* track) {
    uint8_t loop_count = track[v->track_position];
    v->track_position += 2;

    stack_push(&v->stack, (uint32_t)v->track_position);
    stack_push(&v->stack, (uint32_t)loop_count);
}

static void cmd_do_loop(VsVoiceInfo* v) {
    uint8_t loop_count = (uint8_t)stack_pop(&v->stack);
    int loop_position  = (int)stack_pop(&v->stack);

    loop_count--;
    if (loop_count != 0) {
        stack_push(&v->stack, (uint32_t)loop_position);
        stack_push(&v->stack, (uint32_t)loop_count);
        v->track_position = loop_position;
    }
}

static void cmd_set_sample(VsModule* m, VsVoiceInfo* v, uint8_t* track) {
    uint8_t num1 = track[v->track_position++];
    v->sample1_idx    = num1;
    v->sample1_offset = 0;
    v->sample1_number = find_sample_number(m, num1);

    uint8_t num2 = track[v->track_position++];
    v->sample2_idx    = num2;
    v->sample2_number = find_sample_number(m, num2);
}

static void cmd_set_volume_envelope(VsModule* m, VsVoiceInfo* v, uint8_t* track) {
    (void)m;
    uint8_t num = track[v->track_position++];
    v->vol_env_idx          = num;
    v->vol_env_position     = 0;
    v->vol_env_tick_counter = 1;
}

static void cmd_set_period_table(VsModule* m, VsVoiceInfo* v, uint8_t* track) {
    (void)m;
    uint8_t num = track[v->track_position++];
    v->period_table_idx          = num;
    v->period_table_position     = 0;
    v->period_table_tick_counter = 1;
}

static void cmd_set_waveform_table(VsModule* m, VsVoiceInfo* v, VsMixChannel* c, uint8_t* track) {
    (void)m;
    uint8_t num = track[v->track_position++];
    v->waveform_table_idx      = num;
    v->waveform_table_position = 0;
    v->waveform_tick_counter   = 1;

    uint8_t mode = track[v->track_position++];
    uint8_t old_mode = v->synthesis_mode;

    if (mode & VS_SYNTH_FREQUENCY_MAPPED) {
        v->synthesis_mode = mode;
        paula_set_length(c, 0x40);
    }
    else {
        v->waveform_position       = (uint8_t)(mode & 0x1f);
        v->synthesis_mode          = mode;
        v->waveform_start_position = v->waveform_position;

        if (old_mode & VS_SYNTH_FREQUENCY_MAPPED) {
            paula_set_address(c, -1, v->audio_buffer[0], 0, v->new_note);
            paula_set_length(c, 0x10);
            v->waveform_increment      = 0;
            v->waveform_start_position = 0;
        }
    }
}

static void cmd_portamento(VsVoiceInfo* v, uint8_t* track) {
    uint8_t start_note = track[v->track_position++];
    uint16_t start_period = get_period(v, start_note);
    v->note_period = start_period;
    v->new_note = true;

    uint8_t stop_note = track[v->track_position++];
    uint16_t stop_period = get_period(v, stop_note);

    int delta = stop_period - start_period;
    if (delta < 0) {
        v->portamento_direction = true;
        delta = -delta;
    }
    else {
        v->portamento_direction = false;
    }

    uint8_t ticks = track[v->track_position];
    int increment = delta / ticks;
    if (increment == 0) increment = 1;

    v->portamento_increment = (uint8_t)increment;
    v->portamento_delay     = (uint8_t)(ticks / delta);
    v->portamento_tick_counter = 1;

    if (v->portamento_delay == 0)
        v->portamento_delay = 1;

    v->portamento_duration = ticks;
}

static void cmd_set_transpose(VsVoiceInfo* v, uint8_t* track) {
    v->transpose = (int8_t)track[v->track_position++];
}

static void cmd_goto(VsModule* m, VsVoiceInfo* v, uint8_t* track) {
    v->track_position = (track[v->track_position] << 8) | track[v->track_position + 1];

    m->all_voices_taken <<= 1;
    m->all_voices_taken |= 1;
}

static void cmd_set_reset_flags(VsVoiceInfo* v, uint8_t* track) {
    v->reset_flags = track[v->track_position++];
}

static void cmd_set_waveform_mask(VsVoiceInfo* v, uint8_t* track) {
    v->waveform_mask = track[v->track_position++];
}

static VsTrackResult parse_track_command(VsModule* m, VsVoiceInfo* v, VsMixChannel* c, uint8_t* track, uint8_t cmd) {
    switch (cmd) {
        case VS_EFFECT_NOTE_CUT:
            cmd_note_cut(v, track);
            return VS_TRACK_EXIT;

        case VS_EFFECT_GOSUB:
            cmd_gosub(m, v, track);
            break;

        case VS_EFFECT_RETURN:
            cmd_return(v);
            break;

        case VS_EFFECT_START_LOOP:
            cmd_start_loop(v, track);
            break;

        case VS_EFFECT_DO_LOOP:
            cmd_do_loop(v);
            break;

        case VS_EFFECT_SET_SAMPLE:
            cmd_set_sample(m, v, track);
            break;

        case VS_EFFECT_SET_VOLUME_ENV:
            cmd_set_volume_envelope(m, v, track);
            break;

        case VS_EFFECT_SET_PERIOD_TABLE:
            cmd_set_period_table(m, v, track);
            break;

        case VS_EFFECT_SET_WAVEFORM_TABLE:
            cmd_set_waveform_table(m, v, c, track);
            break;

        case VS_EFFECT_PORTAMENTO:
            cmd_portamento(v, track);
            return VS_TRACK_SET_WAIT;

        case VS_EFFECT_SET_TRANSPOSE:
            cmd_set_transpose(v, track);
            break;

        case VS_EFFECT_GOTO:
            cmd_goto(m, v, track);
            break;

        case VS_EFFECT_SET_RESET_FLAGS:
            cmd_set_reset_flags(v, track);
            break;

        case VS_EFFECT_SET_WAVEFORM_MASK:
            cmd_set_waveform_mask(v, track);
            break;

        default:
            return VS_TRACK_EXIT;
    }

    return VS_TRACK_NEXT_COMMAND;
}

static void parse_track_data(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    for (;;) {
        VsTrackData* td = vs_get_track(m, v->track_idx);
        if (!td) return;

        uint8_t* track = td->track;
        uint8_t cmd = track[v->track_position++];

        if (cmd >= 0x80) {
            VsTrackResult result = parse_track_command(m, v, c, track, cmd);

            if (result == VS_TRACK_NEXT_COMMAND)
                continue;

            if (result == VS_TRACK_EXIT)
                break;
        }
        else {
            v->note_period = get_period(v, cmd);
            v->new_note    = true;
        }

        v->synthesis_mode &= ~VS_SYNTH_STOP_SAMPLE;

        // Re-fetch track data pointer in case gosub changed track_idx
        td = vs_get_track(m, v->track_idx);
        if (!td) return;
        track = td->track;

        v->tick_counter = track[v->track_position++];

        if (!(v->reset_flags & VS_RESET_WAVEFORM_TABLE)) {
            v->waveform_table_position = 0;
            v->waveform_tick_counter   = 1;
            v->waveform_position       = v->waveform_start_position;
        }

        if (!(v->reset_flags & VS_RESET_VOLUME_ENVELOPE)) {
            v->vol_env_position     = 0;
            v->vol_env_tick_counter = 1;
        }

        if (!(v->reset_flags & VS_RESET_PERIOD_TABLE)) {
            v->period_table_position     = 0;
            v->period_table_tick_counter = 1;
        }

        break;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — process voice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void process_voice(VsModule* m, VsVoiceInfo* v, VsMixChannel* c) {
    v->tick_counter--;

    if (v->tick_counter == 0)
        parse_track_data(m, v, c);

    do_volume_envelope(m, v);
    do_period_table_part1(m, v);
    do_portamento(v);
    do_period_table_part2(v);
    set_hardware(v, c);
    waveform_generator(m, v, c);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player — play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(VsModule* m) {
    m->all_voices_taken = 0;

    for (int i = 0; i < 4; i++)
        process_voice(m, &m->voices[i], &m->channels[i]);

    if (m->all_voices_taken == 15) {
        m->end_reached = true;
        m->has_ended   = true;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t vs_render(VsModule* module, float* interleaved_stereo, size_t frames) {
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
            VsMixChannel* c = &module->channels[ch];

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
                    // For VSS, trigger audio interrupt on sample end
                    audio_interrupt(module, ch);
                    // If still no loop, deactivate
                    if (c->loop_length == 0)
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

size_t vs_render_multi(VsModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            VsMixChannel* c = &module->channels[ch];
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
                    audio_interrupt(module, ch);
                    if (c->loop_length == 0)
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

VsModule* vs_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 64)
        return nullptr;

    int footer_offset;
    int num_songs = vs_check_module(data, size, &footer_offset);
    if (num_songs <= 0)
        return nullptr;

    VsModule* m = (VsModule*)calloc(1, sizeof(VsModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    if (!load_module(m, data, size)) {
        vs_destroy(m);
        return nullptr;
    }

    // CIA timing: 50 Hz (PAL)
    m->ticks_per_frame = sample_rate / 50.0f;

    if (m->num_subsongs > 0)
        initialize_sound(m, 0);

    return m;
}

void vs_destroy(VsModule* module) {
    if (!module) return;

    if (module->subsongs) {
        for (int i = 0; i < module->num_subsongs; i++) {
            VsSongInfo* s = &module->subsongs[i];
            if (s->data) {
                for (int j = 0; j < s->data_count; j++) {
                    VsModuleData* d = &s->data[j];
                    switch (d->type) {
                        case VS_DATA_TRACK:
                            free(d->u.track.track);
                            break;
                        case VS_DATA_TABLE:
                            free(d->u.table.data);
                            break;
                        case VS_DATA_WAVEFORM:
                            free(d->u.waveform.data);
                            break;
                        default:
                            break;
                    }
                }
                free(s->data);
            }
        }
        free(module->subsongs);
    }

    free(module->all_sample_indices);
    free(module);
}

int vs_subsong_count(const VsModule* module) {
    if (!module) return 0;
    return module->num_subsongs;
}

bool vs_select_subsong(VsModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_subsongs)
        return false;

    initialize_sound(module, subsong);
    return true;
}

int vs_channel_count(const VsModule* module) {
    (void)module;
    return 4;
}

void vs_set_channel_mask(VsModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool vs_has_ended(const VsModule* module) {
    if (!module) return true;
    return module->has_ended;
}
