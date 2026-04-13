// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "activisionpro.h"

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

typedef enum AvpPortamentoVibratoType {
    AVP_PORTAMENTO_VIBRATO_ONLY_ONE = 0,
    AVP_PORTAMENTO_VIBRATO_BOTH_TOGETHER = 1
} AvpPortamentoVibratoType;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t avp_periods[85] = {
    1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
    1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
    1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951, 1790,
    1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006,  951,  895,
     848,  800,  753,  713,  674,  634,  595,  563,  531,  503,  476,  448,
     424,  400,  377,  357,  337,  317,  298,  282,  266,  252,  238,  224,
     212,  200,  189,  179,  169,  159,  149,  141,  133,  126,  119,  112,
     106

};

static const uint8_t avp_vibrato_counters[19] = {
    0, 1, 1, 1, 1, 4, 3, 2, 4, 3, 2, 1, 3, 2, 1, 3, 2, 2, 1

};

static const int8_t avp_vibrato_depths1[19] = {
    0, 5, 4, 3, 2, 5, 5, 4, 4, 4, 3, 1, 3, 2, 0, 1, 1, 0, 0

};

static const int8_t avp_vibrato_depths2[19] = {
    1, 32, 16, 8, 4, 32, 32, 16, 16, 16, 8, 2, 8, 4, 1, 2, 2, 1, 1

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct AvpEnvelopePoint {
    uint8_t ticks_to_wait;
    int8_t volume_increment_value;
    uint8_t times_to_repeat;
} AvpEnvelopePoint;

typedef struct AvpEnvelope {
    AvpEnvelopePoint points[6];
} AvpEnvelope;

typedef struct AvpInstrument {
    uint8_t sample_number;
    uint8_t envelope_number;
    uint8_t volume;
    uint8_t enabled_effect_flags;
    uint8_t portamento_add;
    int16_t fine_tune;
    uint8_t stop_reset_effect_delay;
    uint8_t sample_number2;
    uint16_t sample_start_offset;
    int8_t arpeggio_table[4];
    uint8_t fixed_or_transposed_note;
    int8_t transpose;
    uint8_t vibrato_number;
    uint8_t vibrato_delay;
} AvpInstrument;

typedef struct AvpSample {
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
    int8_t* sample_data;
} AvpSample;

typedef struct AvpSongInfo {
    uint8_t* position_lists[4];
    int position_list_lengths[4];
    int8_t speed_variation[8];
} AvpSongInfo;

typedef struct AvpVoiceInfo {
    uint8_t speed_counter;
    uint8_t speed_counter2;
    uint8_t max_speed_counter;
    uint8_t tick_counter;

    uint8_t* position_list;
    int position_list_length;
    int8_t position_list_position;
    bool position_list_loop_enabled;
    uint8_t position_list_loop_count;
    int8_t position_list_loop_start;

    uint8_t track_number;
    uint8_t track_position;
    uint8_t loop_track_counter;

    uint8_t note;
    int8_t transpose;
    int16_t fine_tune;
    uint8_t note_and_flag;
    uint16_t period;

    int8_t instrument_number;
    AvpInstrument* instrument;

    uint8_t sample_number;
    int8_t* sample_data;
    uint16_t sample_length;
    uint16_t sample_loop_start;
    uint16_t sample_loop_length;

    uint8_t enabled_effects_flag;
    bool stop_reset_effect;
    uint8_t stop_reset_effect_delay;

    AvpEnvelope* envelope;
    uint8_t envelope_position;
    int8_t envelope_wait_counter;
    uint8_t envelope_loop_count;

    bool mute;
    uint16_t volume;
    uint8_t track_volume;

    uint8_t portamento_value;

    uint16_t vibrato_speed;
    uint8_t vibrato_delay;
    int8_t vibrato_depth;
    bool vibrato_direction;
    bool vibrato_count_direction;
    uint8_t vibrato_counter_max;
    uint8_t vibrato_counter;
} AvpVoiceInfo;

// Channel state for rendering
typedef struct AvpChannel {
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
} AvpChannel;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module struct
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct AvpModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    bool has_ended;
    uint8_t ended_channels; // bitmask of channels that have reached end

    // Extracted from player code
    int sub_song_list_offset;
    int position_lists_offset;
    int track_offsets_offset;
    int tracks_offset;
    int envelopes_offset;
    int instruments_offset;
    int sample_info_offset;
    int sample_start_offsets_offset;
    int sample_data_offset;
    int speed_variation_speed_increment_offset;

    int instrument_format_version;
    int parse_track_version;
    int speed_variation_version;
    uint8_t speed_variation_speed_init;
    AvpPortamentoVibratoType portamento_vibrato_type;
    int vibrato_version;
    bool have_separate_sample_info;
    bool have_set_note;
    bool have_set_fixed_sample;
    bool have_set_arpeggio;
    bool have_set_sample;
    bool have_arpeggio;
    bool have_envelope;
    bool reset_volume;

    AvpSongInfo* song_info_list;
    int num_song_infos;

    uint8_t** tracks;
    int num_tracks;

    AvpEnvelope* envelopes;
    int num_envelopes;

    AvpInstrument* instruments;
    int num_instruments;

    AvpSample* samples;
    int num_samples;

    AvpSongInfo* current_song_info;

    // Playing state
    int8_t speed_variation_counter;
    int8_t speed_index;
    uint8_t speed_variation2_counter;
    uint8_t speed_variation2_speed;

    int8_t master_volume_fade_counter;
    int8_t master_volume_fade_speed;
    uint16_t master_volume;

    int8_t global_transpose;

    AvpVoiceInfo voices[4];
    AvpChannel channels[4];

    float tick_accumulator;
    float ticks_per_frame;

    // The raw file data for re-reading during identification
    const uint8_t* file_data;
    size_t file_size;
} AvpModule;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_initialize_sound(AvpModule* m, int sub_song);
static void avp_play_tick(AvpModule* m);
static void avp_parse_next_position(AvpModule* m, AvpVoiceInfo* vi, bool update_information);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct AvpReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} AvpReader;

static void avp_reader_init(AvpReader* r, const uint8_t* data, size_t size) {
    r->data = data; r->size = size; r->pos = 0;
}

static bool avp_reader_eof(const AvpReader* r) {
    return r->pos > r->size;
}

static void avp_reader_seek(AvpReader* r, size_t pos) { r->pos = pos; }

static uint8_t avp_reader_read_u8(AvpReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t avp_reader_read_i8(AvpReader* r) { return (int8_t)avp_reader_read_u8(r); }

static uint16_t avp_reader_read_b_u16(AvpReader* r) {
    uint8_t hi = avp_reader_read_u8(r); uint8_t lo = avp_reader_read_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static int16_t avp_reader_read_b_i16(AvpReader* r) { return (int16_t)avp_reader_read_b_u16(r); }

static uint32_t avp_reader_read_b_u32(AvpReader* r) {
    uint8_t a = avp_reader_read_u8(r); uint8_t b = avp_reader_read_u8(r);
    uint8_t c = avp_reader_read_u8(r); uint8_t d = avp_reader_read_u8(r);
    return ((uint32_t)a << 24) | ((uint32_t)b << 16) | ((uint32_t)c << 8) | d;
}

static size_t avp_reader_read_signed(AvpReader* r, int8_t* buf, size_t count) {
    size_t avail = r->pos < r->size ? r->size - r->pos : 0;
    if (count > avail) count = avail;
    if (count > 0) { memcpy(buf, r->data + r->pos, count); r->pos += count; }
    return count;
}

static size_t avp_reader_read_into(AvpReader* r, uint8_t* buf, size_t count) {
    return avp_reader_read_signed(r, (int8_t*)buf, count);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel operations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_ch_mute(AvpChannel* ch) { ch->active = false; }

static void avp_ch_play_sample(AvpChannel* ch, uint8_t samp_num, int8_t* data, uint32_t start_offset, uint32_t length) {
    (void)samp_num;
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = length;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    ch->loop_length = 0;
    ch->loop_start = 0;
}

static void avp_ch_set_loop(AvpChannel* ch, uint32_t start, uint32_t length) {
    ch->loop_start = start; ch->loop_length = length;
}

static void avp_ch_set_amiga_period(AvpChannel* ch, uint32_t period) {
    ch->period = (uint16_t)period;
}

static void avp_ch_set_amiga_volume(AvpChannel* ch, uint16_t vol) {
    ch->volume = vol;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module identification (extract info from binary player code)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int avp_find_start_offset(const uint8_t* buf, size_t buf_len) {
    for (int i = 0; i < 0x400 && i + 3 < (int)buf_len; i++) {
        if (buf[i] == 0x48 && buf[i+1] == 0xe7 && buf[i+2] == 0xfc && buf[i+3] == 0xfe)
            return i;
    }
    return -1;
}

static bool avp_extract_init(const uint8_t* buf, size_t buf_len, int start_offset, int* sub_song_list_off, int* pos_lists_off) {
    int index;
    int sl = (int)buf_len;

    for (index = start_offset; index < (sl - 6); index += 2) {
        if (buf[index]==0xe9 && buf[index+1]==0x41 && buf[index+2]==0x70 && buf[index+3]==0x00 && buf[index+4]==0x41 && buf[index+5]==0xfa)
            break;
    }
    if (index >= (sl - 6)) return false;

    *sub_song_list_off = (((int8_t)buf[index+6] << 8) | buf[index+7]) + index + 6;

    for (; index < (sl - 4); index += 2) {
        if (buf[index]==0x4e && buf[index+1]==0x75) return false;
        if (buf[index]==0x61 && buf[index+1]==0x00) break;
    }
    if (index >= (sl - 4)) return false;

    index = (((int8_t)buf[index+2] << 8) | buf[index+3]) + index + 2;
    if (index >= sl) return false;

    if (buf[index]!=0x7a || buf[index+1]!=0x00) return false;
    if (buf[index+6]!=0x49 || buf[index+7]!=0xfa) return false;

    *pos_lists_off = (((int8_t)buf[index+8] << 8) | buf[index+9]) + index + 8;
    return true;
}

static int avp_find_enabled_effects(const uint8_t* buf, int buf_len, int start_offset,
    bool* have_set_note, bool* have_set_fixed_sample, bool* have_set_arpeggio, bool* have_set_sample, bool* have_arpeggio) {
    int index = start_offset;
    int sl = buf_len;

    for (; index < (sl - 8); index += 2) {
        if (buf[index]==0x08 && buf[index+1]==0x31 && buf[index+6]==0x67)
            break;
    }
    if (index >= (sl - 8)) return -1;

    *have_set_note = false;
    *have_set_fixed_sample = false;
    *have_set_arpeggio = false;
    *have_set_sample = false;
    *have_arpeggio = false;

    do {
        switch (buf[index+3]) {
            case 0x01: *have_set_note = true; break;
            case 0x02: *have_set_fixed_sample = true; break;
            case 0x03: *have_set_arpeggio = true; break;
            case 0x04: *have_set_sample = true; break;
            case 0x05: *have_arpeggio = true; break;
        }

        index += (int8_t)buf[index+7] + 8;
        if (index < 0 || index >= sl) return -1;
    } while (buf[index]==0x08 && buf[index+1]==0x31 && buf[index+6]==0x67);

    return index;
}

static bool avp_extract_play(AvpModule* m, const uint8_t* buf, size_t buf_len, int start_offset) {
    int sl = (int)buf_len;
    int index;

    for (index = start_offset; index < (sl - 8); index += 2) {
        if (buf[index]==0x2c && buf[index+1]==0x7c && buf[index+6]==0x4a && buf[index+7]==0x29)
            break;
    }
    if (index >= (sl - 8)) return false;

    int start_of_play = index;
    int global_offset = 0;
    m->instruments_offset = 0;

    index -= 4;
    for (; index >= 0; index -= 2) {
        if (buf[index]==0x4b && buf[index+1]==0xfa)
            m->instruments_offset = (((int8_t)buf[index+2] << 8) | buf[index+3]) + index + 2;
        else if (buf[index]==0x43 && buf[index+1]==0xfa)
            global_offset = (((int8_t)buf[index+2] << 8) | buf[index+3]) + index + 2;
        if (m->instruments_offset != 0 && global_offset != 0) break;
    }
    if (m->instruments_offset == 0 || global_offset == 0) return false;

    for (index = start_of_play; index < (sl - 16); index += 2) {
        if (buf[index]==0x53 && buf[index+1]==0x69 && buf[index+4]==0x67) break;
    }
    if (index >= (sl - 16)) return false;

    if (buf[index+6]==0x70 && buf[index+7]==0x03)
        m->speed_variation_version = 1;
    else if (buf[index+6]==0x7a && buf[index+7]==0x00) {
        m->speed_variation_version = 2;
        if (buf[index+12]!=0xda || buf[index+13]!=0x29) return false;
        m->speed_variation_speed_increment_offset = global_offset + (((int8_t)buf[index+14] << 8) | buf[index+15]);
    } else return false;

    index += 8;

    for (; index < (sl - 12); index += 2) {
        if (buf[index]==0x7a && buf[index+1]==0x00 &&
            buf[index+2]==0x1a && buf[index+3]==0x31 &&
            buf[index+6]==0xda && buf[index+7]==0x45 &&
            buf[index+8]==0x49 && buf[index+9]==0xfa)
            break;
    }
    if (index >= (sl - 12)) return false;

    m->track_offsets_offset = (((int8_t)buf[index+10] << 8) | buf[index+11]) + index + 10;
    index += 12;

    if (index >= (sl - 8)) return false;
    if (buf[index]!=0x3a || buf[index+1]!=0x34 || buf[index+4]!=0x49 || buf[index+5]!=0xfa) return false;

    m->tracks_offset = (((int8_t)buf[index+6] << 8) | buf[index+7]) + index + 6;
    index += 8;

    for (; index < (sl - 6); index += 2) {
        if (buf[index]==0x18 && buf[index+1]==0x31) break;
    }
    if (index >= (sl - 6)) return false;

    m->reset_volume = buf[index+4] == 0x66;
    index += 6;

    for (; index < (sl - 10); index += 2) {
        if (buf[index]==0x42 && buf[index+1]==0x31) break;
    }
    if (index >= (sl - 10)) return false;
    index += 8;

    if (buf[index]==0x08 && buf[index+1]==0x31)
        m->parse_track_version = 1;
    else if (buf[index]==0x4a && buf[index+1]==0x34)
        m->parse_track_version = 2;
    else if (buf[index]==0x1a && buf[index+1]==0x34)
        m->parse_track_version = 3;
    else if (buf[index]==0x42 && buf[index+1]==0x30) {
        m->parse_track_version = 4;
        index += 2;
        for (; index < (sl - 4); index += 2) {
            if (buf[index]==0x31 && buf[index+1]==0x85) break;
            if (buf[index]==0x0c && buf[index+1]==0x05 && buf[index+2]==0x00 && buf[index+3]==0x84) {
                m->parse_track_version = 5;
                break;
            }
        }
        if (index >= (sl - 4)) return false;
        index -= 2;
    } else return false;

    index += 2;
    for (; index < (sl - 2); index += 2) {
        if (buf[index]==0x31 && buf[index+1]==0x85) break;
    }
    if (index >= (sl - 2)) return false;
    index += 4;

    m->instrument_format_version = 0;
    if (index >= (sl - 16)) return false;

    if (buf[index]==0x13 && buf[index+1]==0xb5 && buf[index+2]==0x50 && buf[index+3]==0x02 &&
        buf[index+6]==0x13 && buf[index+7]==0xb5 && buf[index+8]==0x50 && buf[index+9]==0x07 &&
        buf[index+12]==0x13 && buf[index+13]==0xb5 && buf[index+14]==0x50 && buf[index+15]==0x0f)
        m->instrument_format_version = 1;
    else if (buf[index]==0x11 && buf[index+1]==0xb5 && buf[index+2]==0x50 && buf[index+3]==0x01 &&
        buf[index+6]==0x13 && buf[index+7]==0xb5 && buf[index+8]==0x50 && buf[index+9]==0x02 &&
        buf[index+12]==0x13 && buf[index+13]==0xb5 && buf[index+14]==0x50 && buf[index+15]==0x07 &&
        buf[index+18]==0x13 && buf[index+19]==0xb5 && buf[index+20]==0x50 && buf[index+21]==0x0f)
        m->instrument_format_version = 2;
    else if (index + 39 < sl &&
        buf[index]==0x11 && buf[index+1]==0xb5 && buf[index+2]==0x50 && buf[index+3]==0x01 &&
        buf[index+6]==0x13 && buf[index+7]==0xb5 && buf[index+8]==0x50 && buf[index+9]==0x02 &&
        buf[index+12]==0x13 && buf[index+13]==0xb5 && buf[index+14]==0x50 && buf[index+15]==0x03 &&
        buf[index+18]==0x31 && buf[index+19]==0xb5 && buf[index+20]==0x50 && buf[index+21]==0x04 &&
        buf[index+24]==0x33 && buf[index+25]==0x75 && buf[index+26]==0x50 && buf[index+27]==0x06 &&
        buf[index+30]==0x13 && buf[index+31]==0xb5 && buf[index+32]==0x50 && buf[index+33]==0x08 &&
        buf[index+36]==0x13 && buf[index+37]==0xb5 && buf[index+38]==0x50 && buf[index+39]==0x0f)
        m->instrument_format_version = 3;
    else return false;

    for (; index < (sl - 14); index += 2) {
        if (buf[index]==0xe5 && buf[index+1]==0x45 && buf[index+2]==0x45 && buf[index+3]==0xfa)
            break;
    }
    if (index >= (sl - 14)) return false;

    m->sample_start_offsets_offset = (((int8_t)buf[index+4] << 8) | buf[index+5]) + index + 4;
    if (buf[index+10]!=0x45 || buf[index+11]!=0xfa) return false;
    m->sample_data_offset = (((int8_t)buf[index+12] << 8) | buf[index+13]) + index + 12;

    index += 14;
    if (index >= (sl - 20)) return false;

    m->have_separate_sample_info = false;
    if (buf[index+12]==0xca && buf[index+13]==0xfc && buf[index+16]==0x45 && buf[index+17]==0xfa) {
        m->have_separate_sample_info = true;
        m->sample_info_offset = (((int8_t)buf[index+18] << 8) | buf[index+19]) + index + 18;
        index += 18;
    }

    for (; index < (sl - 12); index += 2) {
        if (buf[index]==0x6b && buf[index+1]==0x00 && buf[index+4]==0x4a && buf[index+5]==0x31)
            break;
    }
    if (index >= (sl - 12)) return false;
    index += 10;

    if (buf[index]==0x7a && buf[index+1]==0x00)
        m->portamento_vibrato_type = AVP_PORTAMENTO_VIBRATO_ONLY_ONE;
    else if (buf[index]==0x53 && buf[index+1]==0x31)
        m->portamento_vibrato_type = AVP_PORTAMENTO_VIBRATO_BOTH_TOGETHER;
    else return false;

    for (; index < (sl - 2); index += 2) {
        if (buf[index]==0xda && buf[index+1]==0x45) break;
    }
    if (index >= (sl - 2)) return false;

    for (; index < (sl - 10); index += 2) {
        if (buf[index]==0x9b && buf[index+1]==0x70) break;
    }
    if (index >= (sl - 10)) return false;

    if (buf[index+4]==0x53 && buf[index+5]==0x31)
        m->vibrato_version = 1;
    else if (buf[index+8]==0x8a && buf[index+9]==0xf1)
        m->vibrato_version = 2;
    else return false;

    index = avp_find_enabled_effects(buf, sl, index + 10,
        &m->have_set_note, &m->have_set_fixed_sample, &m->have_set_arpeggio, &m->have_set_sample, &m->have_arpeggio);
    if (index == -1) return false;

    m->have_envelope = false;
    if (index >= (sl - 8)) return false;

    if (buf[index+4]==0x6b && buf[index+6]==0x4a && buf[index+7]==0x31) {
        m->have_envelope = true;
        index += 8;
        for (; index < (sl - 10); index += 2) {
            if (buf[index]==0xe9 && buf[index+1]==0x44 && (buf[index+2]==0x31 || buf[index+2]==0x11) && buf[index+3]==0x84 && buf[index+6]==0x45 && buf[index+7]==0xfa)
                break;
        }
        if (index >= (sl - 10)) return false;
        m->envelopes_offset = (((int8_t)buf[index+8] << 8) | buf[index+9]) + index + 8;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool avp_load_speed_variation(AvpModule* m, AvpReader* r) {
    if (m->speed_variation_version == 2) {
        avp_reader_seek(r, m->speed_variation_speed_increment_offset);
        m->speed_variation_speed_init = avp_reader_read_u8(r);
        if (avp_reader_eof(r)) return false;
    }
    return true;
}

static uint8_t* avp_load_position_list(AvpReader* r, int* out_len) {
    int capacity = 32;
    uint8_t* list = (uint8_t*)malloc(capacity);
    int count = 0;

    for (;;) {
        uint8_t dat = avp_reader_read_u8(r);
        if (avp_reader_eof(r)) { free(list); return nullptr; }

        if (count >= capacity) { capacity *= 2; list = (uint8_t*)realloc(list, capacity); }
        list[count++] = dat;

        if ((dat >= 0xfd) || ((dat & 0x40) == 0)) {
            if (count >= capacity) { capacity *= 2; list = (uint8_t*)realloc(list, capacity); }
            list[count++] = avp_reader_read_u8(r);
        }

        if (dat == 0xfe || dat == 0xff) break;
    }

    *out_len = count;
    return list;
}

static bool avp_load_sub_song_info(AvpModule* m, AvpReader* r) {
    int num_sub_songs = (m->position_lists_offset - m->sub_song_list_offset) / 16;
    m->num_song_infos = num_sub_songs;
    m->song_info_list = (AvpSongInfo*)calloc(num_sub_songs, sizeof(AvpSongInfo));
    if (!m->song_info_list) return false;

    for (int i = 0; i < num_sub_songs; i++) {
        avp_reader_seek(r, m->sub_song_list_offset + i * 16);

        uint16_t pos_offsets[4];
        for (int j = 0; j < 4; j++)
            pos_offsets[j] = avp_reader_read_b_u16(r);

        if (avp_reader_read_signed(r, m->song_info_list[i].speed_variation, 8) != 8)
            return false;

        for (int j = 0; j < 4; j++) {
            avp_reader_seek(r, m->position_lists_offset + pos_offsets[j]);
            int len = 0;
            m->song_info_list[i].position_lists[j] = avp_load_position_list(r, &len);
            if (!m->song_info_list[i].position_lists[j]) return false;
            m->song_info_list[i].position_list_lengths[j] = len;
        }
    }

    return true;
}

static uint8_t* avp_load_single_track(AvpReader* r, int parse_track_version, int* out_len) {
    int capacity = 64;
    uint8_t* data = (uint8_t*)malloc(capacity);
    int count = 0;

    #define PUSH(b) do { if (count >= capacity) { capacity *= 2; data = (uint8_t*)realloc(data, capacity); } data[count++] = (b); } while(0)

    for (;;) {
        uint8_t dat = avp_reader_read_u8(r);
        if (avp_reader_eof(r)) { free(data); return nullptr; }
        PUSH(dat);

        if (dat == 0xff) break;

        if (parse_track_version == 3) {
            while ((dat & 0x80) != 0) {
                PUSH(avp_reader_read_u8(r));
                dat = avp_reader_read_u8(r);
                PUSH(dat);
            }
        } else if (parse_track_version == 4 || parse_track_version == 5) {
            if (dat != 0x81) {
                while ((dat & 0x80) != 0) {
                    PUSH(avp_reader_read_u8(r));
                    dat = avp_reader_read_u8(r);
                    PUSH(dat);
                }
            }
        } else {
            if ((dat & 0x80) != 0) {
                PUSH(avp_reader_read_u8(r));
                if (parse_track_version == 2)
                    PUSH(avp_reader_read_u8(r));
            }
        }

        PUSH(avp_reader_read_u8(r));
        if (avp_reader_eof(r)) { free(data); return nullptr; }
    }

    #undef PUSH
    *out_len = count;
    return data;
}

static bool avp_load_tracks(AvpModule* m, AvpReader* r) {
    int num_tracks = (m->tracks_offset - m->track_offsets_offset) / 2;
    m->num_tracks = num_tracks;

    int16_t* offsets = (int16_t*)calloc(num_tracks, sizeof(int16_t));
    m->tracks = (uint8_t**)calloc(num_tracks, sizeof(uint8_t*));
    if (!offsets || !m->tracks) { free(offsets); return false; }

    avp_reader_seek(r, m->track_offsets_offset);
    for (int i = 0; i < num_tracks; i++)
        offsets[i] = avp_reader_read_b_i16(r);
    if (avp_reader_eof(r)) { free(offsets); return false; }

    for (int i = 0; i < num_tracks; i++) {
        if (offsets[i] < 0) continue;

        avp_reader_seek(r, m->tracks_offset + offsets[i]);
        int len = 0;
        m->tracks[i] = avp_load_single_track(r, m->parse_track_version, &len);
        if (!m->tracks[i]) { free(offsets); return false; }
    }

    free(offsets);
    return true;
}

static bool avp_load_envelopes(AvpModule* m, AvpReader* r) {
    if (!m->have_envelope) return true;

    int num = (m->instruments_offset - m->envelopes_offset) / 16;
    m->num_envelopes = num;
    m->envelopes = (AvpEnvelope*)calloc(num, sizeof(AvpEnvelope));
    if (!m->envelopes) return false;

    avp_reader_seek(r, m->envelopes_offset);

    for (int i = 0; i < num; i++) {
        for (int j = 0; j < 5; j++) {
            m->envelopes[i].points[j].ticks_to_wait = avp_reader_read_u8(r);
            m->envelopes[i].points[j].volume_increment_value = avp_reader_read_i8(r);
            m->envelopes[i].points[j].times_to_repeat = avp_reader_read_u8(r);
            if (avp_reader_eof(r)) return false;
        }
        // Dragon breed fix: extra envelope point
        m->envelopes[i].points[5].ticks_to_wait = avp_reader_read_u8(r);
        m->envelopes[i].points[5].volume_increment_value = 0;
        m->envelopes[i].points[5].times_to_repeat = 0xff;
    }

    return true;
}

static void avp_load_instrument1(AvpReader* r, AvpInstrument* instr) {
    instr->sample_number = avp_reader_read_u8(r);
    instr->envelope_number = avp_reader_read_u8(r);
    instr->enabled_effect_flags = avp_reader_read_u8(r);
    avp_reader_read_u8(r); // skip 1
    instr->portamento_add = avp_reader_read_u8(r);
    avp_reader_read_u8(r); avp_reader_read_u8(r); // skip 2
    instr->stop_reset_effect_delay = avp_reader_read_u8(r);
    instr->sample_number2 = avp_reader_read_u8(r);
    avp_reader_read_signed(r, instr->arpeggio_table, 4);
    instr->fixed_or_transposed_note = avp_reader_read_u8(r);
    instr->vibrato_number = avp_reader_read_u8(r);
    instr->vibrato_delay = avp_reader_read_u8(r);
}

static void avp_load_instrument2(AvpReader* r, AvpInstrument* instr) {
    instr->sample_number = avp_reader_read_u8(r);
    instr->volume = avp_reader_read_u8(r);
    instr->enabled_effect_flags = avp_reader_read_u8(r);
    avp_reader_read_u8(r);
    instr->portamento_add = avp_reader_read_u8(r);
    avp_reader_read_u8(r); avp_reader_read_u8(r);
    instr->stop_reset_effect_delay = avp_reader_read_u8(r);
    instr->sample_number2 = avp_reader_read_u8(r);
    avp_reader_read_signed(r, instr->arpeggio_table, 4);
    instr->fixed_or_transposed_note = avp_reader_read_u8(r);
    instr->vibrato_number = avp_reader_read_u8(r);
    instr->vibrato_delay = avp_reader_read_u8(r);
}

static void avp_load_instrument3(AvpReader* r, AvpInstrument* instr) {
    instr->sample_number = avp_reader_read_u8(r);
    instr->volume = avp_reader_read_u8(r);
    instr->enabled_effect_flags = avp_reader_read_u8(r);
    instr->transpose = avp_reader_read_i8(r);
    instr->fine_tune = avp_reader_read_b_i16(r);
    instr->sample_start_offset = avp_reader_read_b_u16(r);
    instr->stop_reset_effect_delay = avp_reader_read_u8(r);
    avp_reader_read_signed(r, instr->arpeggio_table, 4);
    instr->fixed_or_transposed_note = avp_reader_read_u8(r);
    instr->vibrato_number = avp_reader_read_u8(r);
    instr->vibrato_delay = avp_reader_read_u8(r);
}

static bool avp_load_instruments(AvpModule* m, AvpReader* r) {
    int num = (m->track_offsets_offset - m->instruments_offset) / 16;
    m->num_instruments = num;
    m->instruments = (AvpInstrument*)calloc(num, sizeof(AvpInstrument));
    if (!m->instruments) return false;

    avp_reader_seek(r, m->instruments_offset);

    for (int i = 0; i < num; i++) {
        if (m->instrument_format_version == 1) avp_load_instrument1(r, &m->instruments[i]);
        else if (m->instrument_format_version == 2) avp_load_instrument2(r, &m->instruments[i]);
        else if (m->instrument_format_version == 3) avp_load_instrument3(r, &m->instruments[i]);
        else return false;
        if (avp_reader_eof(r)) return false;
    }

    return true;
}

static bool avp_load_sample_info(AvpModule* m, AvpReader* r) {
    m->num_samples = 27;
    m->samples = (AvpSample*)calloc(27, sizeof(AvpSample));
    if (!m->samples) return false;

    if (m->have_separate_sample_info) {
        avp_reader_seek(r, m->sample_info_offset);
        for (int i = 0; i < 27; i++) {
            m->samples[i].length = avp_reader_read_b_u16(r);
            m->samples[i].loop_start = avp_reader_read_b_u16(r);
            m->samples[i].loop_length = avp_reader_read_b_u16(r);
            if (avp_reader_eof(r)) return false;
        }
    }

    return true;
}

static bool avp_load_sample_data(AvpModule* m, AvpReader* r) {
    uint32_t start_offsets[28]; // one extra
    avp_reader_seek(r, m->sample_start_offsets_offset);
    for (int i = 0; i < 28; i++)
        start_offsets[i] = avp_reader_read_b_u32(r);
    if (avp_reader_eof(r)) return false;

    for (int i = 0; i < 27; i++) {
        uint32_t length = start_offsets[i + 1] - start_offsets[i];

        if (length == 0) {
            m->samples[i].length = 0;
            m->samples[i].loop_start = 0;
            m->samples[i].loop_length = 1;
        } else {
            avp_reader_seek(r, m->sample_data_offset + start_offsets[i]);

            if (!m->have_separate_sample_info) {
                m->samples[i].length = avp_reader_read_b_u16(r);
                m->samples[i].loop_start = avp_reader_read_b_u16(r);
                m->samples[i].loop_length = avp_reader_read_b_u16(r);
                length -= 6;
            }

            m->samples[i].sample_data = (int8_t*)malloc(length);
            if (!m->samples[i].sample_data) return false;
            if (avp_reader_read_signed(r, m->samples[i].sample_data, length) != length)
                return false;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetPeriod helper
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint16_t avp_get_period(uint8_t note, int8_t transpose) {
    int index = note + transpose;
    if (index < 0) index = 0;
    else if (index >= 85) index = 84;
    return avp_periods[index];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_stop_and_reset(AvpModule* m);

static void avp_initialize_voice_info(AvpModule* m) {
    for (int i = 0; i < 4; i++) {
        AvpVoiceInfo* vi = &m->voices[i];
        memset(vi, 0, sizeof(AvpVoiceInfo));

        vi->speed_counter = 1;
        vi->speed_counter2 = 0;
        vi->max_speed_counter = 0;
        vi->tick_counter = 0;

        vi->position_list = m->current_song_info->position_lists[i];
        vi->position_list_length = m->current_song_info->position_list_lengths[i];
        vi->position_list_position = -1;
        vi->position_list_loop_enabled = false;
        vi->position_list_loop_count = 0;
        vi->position_list_loop_start = 0;

        vi->track_number = 0;
        vi->track_position = 0;
        vi->loop_track_counter = 0;

        vi->note = 0;
        vi->transpose = 0;
        vi->fine_tune = 0;
        vi->note_and_flag = 0;
        vi->period = 0;

        if (m->parse_track_version == 3 || m->parse_track_version == 4 || m->parse_track_version == 5) {
            vi->instrument_number = 0;
            vi->instrument = &m->instruments[0];
        } else {
            vi->instrument_number = -1;
            vi->instrument = nullptr;
        }

        vi->sample_number = 0;
        vi->sample_data = nullptr;
        vi->sample_length = 0;
        vi->sample_loop_start = 0;
        vi->sample_loop_length = 0;

        vi->enabled_effects_flag = 0;
        vi->stop_reset_effect = false;
        vi->stop_reset_effect_delay = 0;

        vi->envelope = nullptr;
        vi->envelope_position = 0;
        vi->envelope_wait_counter = 0;
        vi->envelope_loop_count = 0;

        vi->mute = false;
        vi->volume = 0;
        vi->track_volume = 64;

        vi->portamento_value = 0;

        vi->vibrato_speed = 0;
        vi->vibrato_delay = 0;
        vi->vibrato_depth = 0;
        vi->vibrato_direction = false;
        vi->vibrato_count_direction = false;
        vi->vibrato_counter_max = 0;
        vi->vibrato_counter = 0;

        avp_parse_next_position(m, vi, false);
    }
}

static void avp_initialize_sound(AvpModule* m, int sub_song) {
    m->current_song_info = &m->song_info_list[sub_song];

    m->speed_variation_counter = 0;
    m->speed_index = 0;
    m->speed_variation2_counter = 255;
    m->speed_variation2_speed = m->speed_variation_speed_init;

    m->master_volume_fade_counter = 0;
    m->master_volume_fade_speed = -1;
    m->master_volume = 64;

    m->global_transpose = 0;

    m->has_ended = false;
    m->ended_channels = 0;

    avp_initialize_voice_info(m);

    // VBlank timing (50 Hz)
    m->ticks_per_frame = m->sample_rate / 50.0f;
    m->tick_accumulator = 0.0f;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Speed variation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_do_master_volume_fade(AvpModule* m) {
    if (m->master_volume_fade_speed >= 0) {
        m->master_volume_fade_counter--;
        if (m->master_volume_fade_counter < 0) {
            m->master_volume_fade_counter = m->master_volume_fade_speed;
            m->master_volume--;
            if (m->master_volume == 0)
                avp_stop_and_reset(m);
        }
    }
}

static void avp_do_speed_variation1(AvpModule* m) {
    if (m->speed_variation_version == 1) {
        m->speed_variation_counter--;
        if (m->speed_variation_counter < 0) {
            m->speed_index--;
            if (m->speed_index < 0) m->speed_index = 7;
            m->speed_variation_counter = m->current_song_info->speed_variation[m->speed_index];
        }
    }
}

static void avp_do_speed_variation2(AvpModule* m) {
    if (m->speed_variation_version == 2) {
        uint16_t counter = (uint16_t)(m->speed_variation2_counter + m->speed_variation2_speed);
        if (counter > 255)
            m->speed_variation_counter = 0;
        else
            m->speed_variation_counter = -1;
        m->speed_variation2_counter = (uint8_t)counter;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Parse next position
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_parse_next_position(AvpModule* m, AvpVoiceInfo* vi, bool update_information) {
    (void)update_information;
    uint8_t* pl = vi->position_list;
    int8_t position = vi->position_list_position;
    bool one_more;

    do {
        one_more = false;
        position++;

        if (pl[position] >= 0xfe) {
            vi->track_number = pl[position];
            position = (int8_t)(pl[position + 1] - 1);
        } else {
            if (pl[position] == 0xfd) {
                position++;
                m->master_volume_fade_speed = (int8_t)pl[position];
                one_more = true;
            } else {
                if ((pl[position] & 0x40) != 0) {
                    if (vi->position_list_loop_enabled) {
                        vi->position_list_loop_count--;
                        if (vi->position_list_loop_count == 0) {
                            vi->position_list_loop_enabled = false;
                            one_more = true;
                            continue;
                        }
                        position = vi->position_list_loop_start;
                    } else {
                        vi->position_list_loop_enabled = true;
                        vi->position_list_loop_count = (uint8_t)(pl[position] & 0x3f);
                        vi->position_list_loop_start = ++position;
                    }
                }

                vi->loop_track_counter = pl[position++];
                vi->track_number = pl[position];

                if (m->parse_track_version == 5)
                    vi->max_speed_counter = 255;
            }
        }
    } while (one_more);

    vi->position_list_position = position;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stop and reset
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_stop_and_reset(AvpModule* m) {
    m->master_volume = 64;
    m->master_volume_fade_speed = -1;
    m->master_volume_fade_counter = 0;
    m->speed_variation_counter = 0;

    for (int i = 0; i < 4; i++)
        avp_ch_mute(&m->channels[i]);

    avp_initialize_voice_info(m);
    m->has_ended = true;
    m->ended_channels = 0x0f;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Counters
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_do_counters(AvpVoiceInfo* vi) {
    if (vi->stop_reset_effect_delay == 0)
        vi->stop_reset_effect = true;
    else
        vi->stop_reset_effect_delay--;
    vi->tick_counter++;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_do_vibrato(AvpModule* m, AvpVoiceInfo* vi) {
    if (vi->vibrato_delay != 0) { vi->vibrato_delay--; return; }

    if (vi->stop_reset_effect_delay == 0) {
        AvpInstrument* instr = vi->instrument;
        if (instr->vibrato_number != 0) {
            if (vi->vibrato_depth >= 0) {
                vi->vibrato_counter_max = avp_vibrato_counters[instr->vibrato_number];
                vi->vibrato_depth = m->vibrato_version == 1 ? avp_vibrato_depths1[instr->vibrato_number] : avp_vibrato_depths2[instr->vibrato_number];
                vi->vibrato_count_direction = false;
                vi->vibrato_counter = 0;

                vi->period = avp_get_period(vi->note, vi->transpose);
                vi->vibrato_speed = (uint16_t)(vi->period - avp_get_period((uint8_t)(vi->note + 1), vi->transpose));

                if (m->vibrato_version == 1) {
                    for (;;) {
                        vi->vibrato_depth--;
                        if (vi->vibrato_depth < 0) break;
                        vi->vibrato_speed /= 2;
                        if (vi->vibrato_speed == 0) {
                            vi->vibrato_speed = 1;
                            vi->vibrato_depth = -1;
                            break;
                        }
                    }
                } else {
                    int new_speed = vi->vibrato_speed / vi->vibrato_depth;
                    if (new_speed == 0) new_speed = 1;
                    vi->vibrato_speed = (uint16_t)new_speed;
                    vi->vibrato_depth = -1;
                }
            } else {
                if (vi->vibrato_direction)
                    vi->period -= vi->vibrato_speed;
                else
                    vi->period += vi->vibrato_speed;

                if (vi->vibrato_count_direction) {
                    vi->vibrato_counter--;
                    if (vi->vibrato_counter == 0)
                        vi->vibrato_count_direction = false;
                } else {
                    vi->vibrato_counter++;
                    if (vi->vibrato_counter == vi->vibrato_counter_max) {
                        vi->vibrato_count_direction = true;
                        vi->vibrato_direction = !vi->vibrato_direction;
                    }
                }
            }
        }
    }
}

static void avp_do_portamento(AvpVoiceInfo* vi) {
    uint8_t pv = vi->portamento_value;
    if (pv >= 0xc0)
        vi->period += (uint16_t)(pv & 0x3f);
    else
        vi->period -= (uint16_t)(pv & 0x3f);
}

static void avp_do_set_note(AvpModule* m, AvpVoiceInfo* vi) {
    if (m->have_set_note && ((vi->enabled_effects_flag & 0x02) != 0)) {
        uint8_t note;
        if ((vi->tick_counter % 2) == 0)
            note = (uint8_t)(vi->note + vi->transpose);
        else {
            note = vi->instrument->fixed_or_transposed_note;
            if ((note & 0x80) != 0) {
                note &= 0x7f;
                note += vi->note;
            }
        }
        vi->period = avp_get_period(note, 0);
    }
}

static void avp_do_set_fixed_sample(AvpModule* m, AvpVoiceInfo* vi) {
    if (m->have_set_fixed_sample && ((vi->enabled_effects_flag & 0x04) != 0)) {
        uint8_t sample;
        if ((vi->tick_counter % 2) == 0)
            sample = vi->instrument->sample_number;
        else
            sample = 2;
        vi->sample_number = sample;
        if ((vi->period + vi->instrument->portamento_add) < 0x8000)
            vi->period += vi->instrument->portamento_add;
    }
}

static void avp_set_arpeggio(AvpVoiceInfo* vi, int index) {
    uint8_t note;
    int8_t arp_value = vi->instrument->arpeggio_table[index];
    if (arp_value >= 0)
        note = (uint8_t)arp_value;
    else {
        note = vi->note;
        arp_value &= 0x7f;
        if (arp_value < 64) note += (uint8_t)arp_value;
        else note -= (uint8_t)(arp_value & 0x3f);
        note = (uint8_t)(note + vi->transpose);
    }
    vi->period = avp_get_period(note, 0);
}

static void avp_do_set_sample(AvpModule* m, AvpVoiceInfo* vi) {
    if (m->have_set_sample && ((vi->enabled_effects_flag & 0x10) != 0)) {
        if (vi->stop_reset_effect_delay != 0)
            vi->sample_number = vi->instrument->sample_number2;
        else if (!vi->stop_reset_effect)
            vi->sample_number = vi->instrument->sample_number;
    }
}

static void avp_do_arpeggio(AvpModule* m, AvpVoiceInfo* vi) {
    if (m->have_arpeggio && ((vi->enabled_effects_flag & 0x20) != 0)) {
        if (vi->stop_reset_effect_delay != 0)
            avp_set_arpeggio(vi, vi->tick_counter);
        else if (!vi->stop_reset_effect)
            vi->period = avp_get_period(vi->note, vi->transpose);
    }
}

static void avp_do_envelopes(AvpModule* m, AvpVoiceInfo* vi) {
    if (m->have_envelope) {
        if (((vi->note_and_flag & 0x80) == 0) && (vi->tick_counter == 0)) {
            AvpInstrument* instr = vi->instrument;
            AvpEnvelope* env = &m->envelopes[instr->envelope_number];

            vi->envelope = env;
            vi->envelope_loop_count = env->points[0].times_to_repeat;
            vi->envelope_position = 0;
            vi->envelope_wait_counter = 1;
            vi->volume = 0;
        }

        if (vi->envelope_wait_counter >= 0) {
            vi->envelope_wait_counter--;

            if (vi->envelope_wait_counter == 0) {
                AvpEnvelope* env = vi->envelope;
                uint8_t pos = vi->envelope_position;

                int16_t volume = (int16_t)vi->volume;
                volume += env->points[pos].volume_increment_value;
                if (volume > 64) volume = 64;
                else if (volume < 0) volume = 0;
                vi->volume = (uint16_t)volume;

                vi->envelope_loop_count--;
                if (vi->envelope_loop_count == 0) {
                    pos++;
                    uint8_t ticks = env->points[pos].ticks_to_wait;
                    if (ticks >= 0xc0) {
                        pos = (uint8_t)((ticks & 0x3f) / 3);
                        ticks = env->points[pos].ticks_to_wait;
                    }
                    vi->envelope_wait_counter = (int8_t)ticks;
                    if (pos != 5)
                        vi->envelope_loop_count = env->points[pos].times_to_repeat;
                    vi->envelope_position = pos;
                } else {
                    vi->envelope_wait_counter = (int8_t)env->points[pos].ticks_to_wait;
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// RunEffects1 / RunEffects2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_run_effects1(AvpModule* m, AvpVoiceInfo* vi) {
    switch (m->portamento_vibrato_type) {
        case AVP_PORTAMENTO_VIBRATO_ONLY_ONE:
            if (vi->portamento_value != 0) avp_do_portamento(vi);
            else avp_do_vibrato(m, vi);
            break;
        case AVP_PORTAMENTO_VIBRATO_BOTH_TOGETHER:
            avp_do_vibrato(m, vi);
            if (vi->portamento_value != 0) avp_do_portamento(vi);
            break;
    }

    avp_do_set_note(m, vi);
    avp_do_set_fixed_sample(m, vi);

    if (m->have_set_arpeggio && ((vi->enabled_effects_flag & 0x08) != 0))
        avp_set_arpeggio(vi, vi->tick_counter & 3);
    else {
        avp_do_set_sample(m, vi);
        avp_do_arpeggio(m, vi);
    }

    avp_do_envelopes(m, vi);
    avp_do_counters(vi);
}

static void avp_run_effects2(AvpModule* m, AvpVoiceInfo* vi) {
    avp_do_set_sample(m, vi);
    avp_do_arpeggio(m, vi);
    avp_do_envelopes(m, vi);
    avp_do_counters(vi);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Parse next track position
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_parse_next_track_position(AvpModule* m, int channel, AvpVoiceInfo* vi, AvpChannel* ch) {
    (void)channel;
    if (vi->track_number == 0xfe) {
        avp_stop_and_reset(m);
    }

    if (vi->track_number == 0xff) {
        vi->track_position = 0;
        avp_parse_next_position(m, vi, true);

        if (vi->track_number == 0xff) {
            m->ended_channels |= (1 << channel);
            if (m->ended_channels == 0x0f) // all 4 channels ended
                m->has_ended = true;
            return;
        }

        if (m->master_volume_fade_speed < 0) {
            m->ended_channels |= (1 << channel);
            if (m->ended_channels == 0x0f)
                m->has_ended = true;
        }
    }

    uint8_t* track = m->tracks[vi->track_number];

    if (m->reset_volume && vi->track_position == 0)
        vi->track_volume = 64;

    int8_t set_to_instrument = -1;

    uint8_t track_byte = track[vi->track_position];
    vi->track_position++;

    if (m->parse_track_version == 1)
        vi->speed_counter = (uint8_t)(track_byte & 0x3f);

    vi->portamento_value = 0;
    vi->stop_reset_effect = false;
    vi->mute = false;

    if (m->parse_track_version == 4 || m->parse_track_version == 5)
        vi->note_and_flag = 0;

    if ((m->parse_track_version == 1) && ((track_byte & 0x40) != 0)) {
        vi->envelope_wait_counter = 1;
        vi->envelope_loop_count = 1;
        vi->envelope_position = 3;
    }

    bool one_more;
    do {
        one_more = false;

        if ((track_byte & 0x80) != 0) {
            switch (m->parse_track_version) {
                case 1:
                    if ((track[vi->track_position] & 0x80) != 0)
                        vi->portamento_value = track[vi->track_position];
                    else
                        set_to_instrument = (int8_t)track[vi->track_position];
                    vi->track_position++;
                    break;

                case 2:
                    set_to_instrument = (int8_t)(track_byte & 0x7f);
                    if ((track[vi->track_position] & 0x80) != 0)
                        vi->portamento_value = track[vi->track_position];
                    else
                        vi->track_volume = track[vi->track_position];
                    vi->track_position++;
                    track_byte = track[vi->track_position];
                    vi->track_position++;
                    break;

                case 3:
                    switch (track_byte) {
                        case 0x80: set_to_instrument = (int8_t)track[vi->track_position]; break;
                        case 0x81: vi->track_volume = track[vi->track_position]; break;
                        case 0x82: vi->portamento_value = track[vi->track_position]; break;
                        case 0x8a: vi->max_speed_counter = track[vi->track_position]; break;
                        case 0x8e: vi->track_volume += track[vi->track_position]; break;
                    }
                    vi->track_position++;
                    track_byte = track[vi->track_position];
                    vi->track_position++;
                    one_more = true;
                    break;

                case 4:
                    one_more = true;
                    switch (track_byte) {
                        case 0x80: set_to_instrument = (int8_t)track[vi->track_position]; break;
                        case 0x81: vi->mute = true; vi->note = 64; vi->transpose = 0; one_more = false; break;
                        case 0x82: vi->portamento_value = track[vi->track_position]; break;
                        case 0x83: m->speed_variation2_speed = track[vi->track_position]; break;
                        case 0x87: vi->note_and_flag = 0xff; break;
                        case 0x8a: vi->max_speed_counter = track[vi->track_position]; break;
                        case 0x8c: vi->track_volume = track[vi->track_position]; break;
                        case 0x8d: vi->track_volume += track[vi->track_position]; break;
                    }
                    if (one_more) {
                        vi->track_position++;
                        track_byte = track[vi->track_position];
                        vi->track_position++;
                    }
                    break;

                case 5:
                    one_more = true;
                    switch (track_byte) {
                        case 0x80: set_to_instrument = (int8_t)track[vi->track_position]; break;
                        case 0x81: vi->mute = true; vi->note = 64; vi->transpose = 0; one_more = false; break;
                        case 0x82: vi->portamento_value = track[vi->track_position]; break;
                        case 0x83: m->speed_variation2_speed = track[vi->track_position]; break;
                        case 0x84: vi->note_and_flag = 0xff; break;
                        case 0x85: vi->max_speed_counter = track[vi->track_position]; break;
                        case 0x86: m->global_transpose = (int8_t)track[vi->track_position]; break;
                        case 0x87: vi->track_volume = track[vi->track_position]; break;
                        case 0x8b: vi->track_volume += track[vi->track_position]; break;
                    }
                    if (one_more) {
                        vi->track_position++;
                        track_byte = track[vi->track_position];
                        vi->track_position++;
                    }
                    break;
            }
        } else if (m->parse_track_version == 4 || m->parse_track_version == 5) {
            vi->note = track_byte;
        }
    } while (one_more);

    if (m->parse_track_version == 4 || m->parse_track_version == 5) {
        vi->speed_counter = track[vi->track_position];
        vi->speed_counter2 = 0;
        vi->track_position++;
    } else {
        if (m->parse_track_version != 1)
            vi->speed_counter = track_byte;
        vi->note_and_flag = track[vi->track_position];
        vi->note = (uint8_t)(vi->note_and_flag & 0x7f);
        vi->track_position++;
    }

    if ((set_to_instrument >= 0) && (set_to_instrument != vi->instrument_number)) {
        vi->instrument_number = set_to_instrument;
        vi->note_and_flag = 0;
    }

    if ((vi->note_and_flag & 0x80) == 0) {
        int inst_idx = vi->instrument_number;
        if (inst_idx < 0) inst_idx = 0;
        if (inst_idx >= m->num_instruments) inst_idx = 0;
        AvpInstrument* instr = &m->instruments[inst_idx];

        vi->instrument = instr;
        vi->enabled_effects_flag = instr->enabled_effect_flags;
        vi->stop_reset_effect_delay = instr->stop_reset_effect_delay;
        vi->vibrato_delay = instr->vibrato_delay;
        vi->transpose = instr->transpose;
        vi->fine_tune = instr->fine_tune;
        vi->sample_number = instr->sample_number;

        if (!m->have_envelope)
            vi->volume = instr->volume;

        AvpSample* samp = &m->samples[vi->sample_number];

        vi->sample_data = samp->sample_data;
        vi->sample_length = samp->length;
        vi->sample_loop_start = samp->loop_start;
        vi->sample_loop_length = samp->loop_length;

        avp_ch_set_amiga_period(ch, 126);
        avp_ch_play_sample(ch, vi->sample_number, vi->sample_data, instr->sample_start_offset, vi->sample_length * 2U);

        if (vi->sample_loop_length > 1)
            avp_ch_set_loop(ch, vi->sample_loop_start * 2U, vi->sample_loop_length * 2U);
    }

    vi->note = (uint8_t)(vi->note + m->global_transpose);
    vi->period = avp_get_period(vi->note, vi->transpose);

    if (track[vi->track_position] == 0xff) {
        vi->track_position = 0;
        vi->loop_track_counter--;
        if (vi->loop_track_counter == 0)
            avp_parse_next_position(m, vi, true);
    }

    vi->tick_counter = 0;
    vi->vibrato_depth = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void avp_play_tick(AvpModule* m) {
    avp_do_master_volume_fade(m);
    avp_do_speed_variation2(m);

    for (int i = 0; i < 4; i++) {
        AvpVoiceInfo* vi = &m->voices[i];
        AvpChannel* ch = &m->channels[i];

        if (m->speed_variation_counter == 0) {
            vi->speed_counter--;
            vi->speed_counter2++;

            if (vi->speed_counter == 0) {
                avp_parse_next_track_position(m, i, vi, ch);
                avp_run_effects2(m, vi);
                continue;
            }
        }

        avp_run_effects1(m, vi);
    }

    avp_do_speed_variation1(m);

    for (int i = 0; i < 4; i++) {
        AvpVoiceInfo* vi = &m->voices[i];
        AvpChannel* ch = &m->channels[i];

        uint32_t period = (uint32_t)(vi->period - vi->fine_tune);
        avp_ch_set_amiga_period(ch, period);

        int volume;
        if (m->have_envelope)
            volume = (vi->volume * m->master_volume) / 64;
        else {
            if ((m->speed_variation_version == 2) &&
                (vi->mute ||
                 ((m->parse_track_version != 5) && (vi->speed_counter <= vi->max_speed_counter)) ||
                 ((m->parse_track_version == 5) && (vi->speed_counter2 >= vi->max_speed_counter))))
                volume = 0;
            else
                volume = (vi->track_volume * vi->volume * m->master_volume) / 4096;
        }

        avp_ch_set_amiga_volume(ch, (uint16_t)volume);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t avp_render(AvpModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0) return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;
        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            avp_play_tick(module);
        }

        float left = 0.0f, right = 0.0f;
        for (int ch = 0; ch < 4; ch++) {
            AvpChannel* c = &module->channels[ch];
            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr) continue;

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            float sample = 0.0f;
            if (pos < c->sample_length)
                sample = (float)c->sample_data[pos] / 128.0f;
            sample *= (float)c->volume / 64.0f;

            if (ch == 0 || ch == 3) left += sample; else right += sample;

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
                            new_pos = c->loop_start + (new_pos - c->loop_start) % c->loop_length;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                } else c->active = false;
            }
        }

        *out++ = left * 0.5f;
        *out++ = right * 0.5f;
        frames_written++;
    }

    return frames_written;
}

size_t avp_render_multi(AvpModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0) return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;
        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            avp_play_tick(module);
        }

        for (int ch = 0; ch < 4; ch++) {
            AvpChannel* c = &module->channels[ch];
            if (!c->active || c->muted || c->period == 0 || c->sample_data == nullptr) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f;
                continue;
            }

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            float sample = 0.0f;
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
                            new_pos = c->loop_start + (new_pos - c->loop_start) % c->loop_length;
                            break;
                        }
                    }
                    c->position_fp = (uint64_t)new_pos << SAMPLE_FRAC_BITS;
                } else c->active = false;
            }
        }

        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

AvpModule* avp_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 1024)
        return nullptr;

    // Read first 4096 bytes for identification
    int buf_len = size < 4096 ? (int)size : 4096;

    AvpModule* m = (AvpModule*)calloc(1, sizeof(AvpModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    m->file_data = data;
    m->file_size = size;

    int start_offset = avp_find_start_offset(data, buf_len);
    if (start_offset < 0) { free(m); return nullptr; }

    if (!avp_extract_init(data, buf_len, start_offset, &m->sub_song_list_offset, &m->position_lists_offset)) {
        free(m); return nullptr;
    }

    if (!avp_extract_play(m, data, buf_len, start_offset)) {
        free(m); return nullptr;
    }

    AvpReader reader;
    avp_reader_init(&reader, data, size);

    if (!avp_load_speed_variation(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_sub_song_info(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_tracks(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_envelopes(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_instruments(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_sample_info(m, &reader)) { avp_destroy(m); return nullptr; }
    if (!avp_load_sample_data(m, &reader)) { avp_destroy(m); return nullptr; }

    if (m->num_song_infos > 0)
        avp_initialize_sound(m, 0);

    return m;
}

void avp_destroy(AvpModule* module) {
    if (!module) return;

    if (module->song_info_list) {
        for (int i = 0; i < module->num_song_infos; i++) {
            for (int j = 0; j < 4; j++)
                free(module->song_info_list[i].position_lists[j]);
        }
        free(module->song_info_list);
    }

    if (module->tracks) {
        for (int i = 0; i < module->num_tracks; i++)
            free(module->tracks[i]);
        free(module->tracks);
    }

    free(module->envelopes);
    free(module->instruments);

    if (module->samples) {
        for (int i = 0; i < module->num_samples; i++)
            free(module->samples[i].sample_data);
        free(module->samples);
    }

    if (module->original_data) free(module->original_data);
    free(module);
}

int avp_subsong_count(const AvpModule* module) {
    if (!module) return 0;
    return module->num_song_infos;
}

bool avp_select_subsong(AvpModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_song_infos)
        return false;
    avp_initialize_sound(module, subsong);
    return true;
}

int avp_channel_count(const AvpModule* module) {
    (void)module;
    return 4;
}

void avp_set_channel_mask(AvpModule* module, uint32_t mask) {
    if (!module) return;
    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool avp_has_ended(const AvpModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int avp_get_instrument_count(const AvpModule* module) {
    return module ? module->num_instruments : 0;
}

float avp_get_instrument_param(const AvpModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= module->num_instruments || !param) return -1.0f;
    const AvpInstrument* in = &module->instruments[inst];

    if (strcmp(param, "sampleNumber") == 0)            return (float)in->sample_number;
    if (strcmp(param, "envelopeNumber") == 0)           return (float)in->envelope_number;
    if (strcmp(param, "volume") == 0)                   return (float)in->volume;
    if (strcmp(param, "enabledEffectFlags") == 0)       return (float)in->enabled_effect_flags;
    if (strcmp(param, "portamentoAdd") == 0)            return (float)in->portamento_add;
    if (strcmp(param, "fineTune") == 0)                 return (float)in->fine_tune;
    if (strcmp(param, "stopResetEffectDelay") == 0)     return (float)in->stop_reset_effect_delay;
    if (strcmp(param, "sampleNumber2") == 0)            return (float)in->sample_number2;
    if (strcmp(param, "sampleStartOffset") == 0)        return (float)in->sample_start_offset;
    if (strcmp(param, "arpeggioTable0") == 0)           return (float)in->arpeggio_table[0];
    if (strcmp(param, "arpeggioTable1") == 0)           return (float)in->arpeggio_table[1];
    if (strcmp(param, "arpeggioTable2") == 0)           return (float)in->arpeggio_table[2];
    if (strcmp(param, "arpeggioTable3") == 0)           return (float)in->arpeggio_table[3];
    if (strcmp(param, "fixedOrTransposedNote") == 0)    return (float)in->fixed_or_transposed_note;
    if (strcmp(param, "transpose") == 0)                return (float)in->transpose;
    if (strcmp(param, "vibratoNumber") == 0)            return (float)in->vibrato_number;
    if (strcmp(param, "vibratoDelay") == 0)             return (float)in->vibrato_delay;

    return -1.0f;
}

void avp_set_instrument_param(AvpModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= module->num_instruments || !param) return;
    AvpInstrument* in = &module->instruments[inst];
    uint8_t v8 = (uint8_t)value;
    int8_t sv8 = (int8_t)value;
    uint16_t v16 = (uint16_t)value;
    int16_t sv16 = (int16_t)value;

    if (strcmp(param, "sampleNumber") == 0)            { in->sample_number = v8; return; }
    if (strcmp(param, "envelopeNumber") == 0)           { in->envelope_number = v8; return; }
    if (strcmp(param, "volume") == 0)                   { in->volume = v8; return; }
    if (strcmp(param, "enabledEffectFlags") == 0)       { in->enabled_effect_flags = v8; return; }
    if (strcmp(param, "portamentoAdd") == 0)            { in->portamento_add = v8; return; }
    if (strcmp(param, "fineTune") == 0)                 { in->fine_tune = sv16; return; }
    if (strcmp(param, "stopResetEffectDelay") == 0)     { in->stop_reset_effect_delay = v8; return; }
    if (strcmp(param, "sampleNumber2") == 0)            { in->sample_number2 = v8; return; }
    if (strcmp(param, "sampleStartOffset") == 0)        { in->sample_start_offset = v16; return; }
    if (strcmp(param, "arpeggioTable0") == 0)           { in->arpeggio_table[0] = sv8; return; }
    if (strcmp(param, "arpeggioTable1") == 0)           { in->arpeggio_table[1] = sv8; return; }
    if (strcmp(param, "arpeggioTable2") == 0)           { in->arpeggio_table[2] = sv8; return; }
    if (strcmp(param, "arpeggioTable3") == 0)           { in->arpeggio_table[3] = sv8; return; }
    if (strcmp(param, "fixedOrTransposedNote") == 0)    { in->fixed_or_transposed_note = v8; return; }
    if (strcmp(param, "transpose") == 0)                { in->transpose = sv8; return; }
    if (strcmp(param, "vibratoNumber") == 0)            { in->vibrato_number = v8; return; }
    if (strcmp(param, "vibratoDelay") == 0)             { in->vibrato_delay = v8; return; }
}

size_t avp_export(const AvpModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
