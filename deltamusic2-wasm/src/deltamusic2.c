// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "deltamusic2.h"

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

static const uint16_t dm2_periods[] = {
    0,
    6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616,
    3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  452,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113
};

#define DM2_PERIODS_COUNT (sizeof(dm2_periods) / sizeof(dm2_periods[0]))

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum Dm2Effect {
    DM2_EFFECT_NONE            = 0x00,
    DM2_EFFECT_SET_SPEED       = 0x01,
    DM2_EFFECT_SET_FILTER      = 0x02,
    DM2_EFFECT_SET_BEND_UP     = 0x03,
    DM2_EFFECT_SET_BEND_DOWN   = 0x04,
    DM2_EFFECT_SET_PORTAMENTO  = 0x05,
    DM2_EFFECT_SET_VOLUME      = 0x06,
    DM2_EFFECT_SET_GLOBAL_VOL  = 0x07,
    DM2_EFFECT_SET_ARP         = 0x08
} Dm2Effect;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Dm2VolumeInfo {
    uint8_t speed;
    uint8_t level;
    uint8_t sustain;
} Dm2VolumeInfo;

typedef struct Dm2VibratoInfo {
    uint8_t speed;
    uint8_t delay;
    uint8_t sustain;
} Dm2VibratoInfo;

typedef struct Dm2Track {
    uint8_t block_number;
    int8_t transpose;
} Dm2Track;

typedef struct Dm2TrackInfo {
    uint16_t loop_position;
    Dm2Track* track;
    uint16_t track_length;
} Dm2TrackInfo;

typedef struct Dm2BlockLine {
    uint8_t note;
    uint8_t instrument;
    Dm2Effect effect;
    uint8_t effect_arg;
} Dm2BlockLine;

typedef struct Dm2Instrument {
    short number;

    uint16_t sample_length;
    uint16_t repeat_start;
    uint16_t repeat_length;
    Dm2VolumeInfo volume_table[5];
    Dm2VibratoInfo vibrato_table[5];
    uint16_t pitch_bend;
    bool is_sample;
    uint8_t sample_number;
    uint8_t table[48];

    int8_t* sample_data;
} Dm2Instrument;

typedef struct Dm2ChannelInfo {
    Dm2Instrument* instrument;
    Dm2Track* track;
    uint16_t track_loop_position;
    uint16_t track_length;
    Dm2BlockLine* block;
    uint16_t block_position;
    short current_track_position;
    uint16_t next_track_position;
    uint8_t sound_table_delay;
    uint8_t sound_table_position;
    uint16_t final_period;
    uint16_t period;
    uint8_t note;
    uint8_t max_volume;
    short pitch_bend;
    short actual_volume;
    uint16_t volume_position;
    uint8_t volume_sustain;
    uint8_t portamento;
    bool vibrato_direction;
    uint16_t vibrato_period;
    uint8_t vibrato_delay;
    int8_t transpose;
    int8_t* arpeggio;
    uint16_t arpeggio_position;
    uint8_t vibrato_position;
    uint8_t vibrato_sustain;
    bool retrigger_sound;

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
} Dm2ChannelInfo;

typedef struct Dm2GlobalPlayingInfo {
    uint32_t last_noise_value;
    uint8_t global_volume;
    int8_t play_speed;
    int8_t tick;
} Dm2GlobalPlayingInfo;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Dm2Reader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} Dm2Reader;

static void reader_init(Dm2Reader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const Dm2Reader* r) {
    return r->pos > r->size;
}

static uint8_t reader_read_uint8(Dm2Reader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_read_int8(Dm2Reader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(Dm2Reader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t reader_read_b_uint32(Dm2Reader* r) {
    uint16_t hi = reader_read_b_uint16(r);
    uint16_t lo = reader_read_b_uint16(r);
    return ((uint32_t)hi << 16) | lo;
}

static void reader_seek(Dm2Reader* r, size_t pos) {
    r->pos = pos;
}

static void reader_skip(Dm2Reader* r, size_t bytes) {
    r->pos += bytes;
}

static size_t reader_read(Dm2Reader* r, void* dst, size_t count) {
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

static void reader_read_signed(Dm2Reader* r, int8_t* dst, size_t count) {
    for (size_t i = 0; i < count; i++)
        dst[i] = reader_read_int8(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module struct
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

struct Dm2Module {
    float sample_rate;

    int8_t** arpeggios;       // 64 arrays of 16 sbytes
    Dm2Instrument** instruments;  // 128 instruments (some may be NULL)
    int num_instruments;

    Dm2TrackInfo track_infos[4];
    Dm2BlockLine** blocks;
    uint32_t num_blocks;

    int8_t** waveforms;       // N arrays of 256 sbytes
    uint32_t num_waveforms;

    int8_t start_speed;

    Dm2GlobalPlayingInfo playing_info;
    Dm2ChannelInfo channels[4];

    bool has_ended;
    bool end_reached[4];

    // Mixer state
    float tick_accumulator;
    float ticks_per_frame;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel emulation helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_play_sample(Dm2ChannelInfo* ch, short sample_number, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    ch->ch_sample_data = sample_data;
    ch->ch_sample_length = length;
    ch->ch_loop_start = 0;
    ch->ch_loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    (void)sample_number;
}

static void ch_set_sample_data(Dm2ChannelInfo* ch, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    ch->ch_sample_data = sample_data;
    ch->ch_sample_length = length;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
}

static void ch_set_loop(Dm2ChannelInfo* ch, uint32_t start_offset, uint32_t length) {
    ch->ch_loop_start = start_offset;
    ch->ch_loop_length = length;
    ch->ch_sample_length = start_offset + length;
}

static void ch_set_amiga_volume(Dm2ChannelInfo* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->ch_volume = vol;
}

static void ch_set_amiga_period(Dm2ChannelInfo* ch, uint16_t period) {
    ch->ch_period = period;
}

static void ch_mute(Dm2ChannelInfo* ch) {
    ch->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Noise generator — matches C# BitOperations.RotateLeft
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint32_t rotate_left_32(uint32_t value, int offset) {
    return (value << offset) | (value >> (32 - offset));
}

static void generate_noise_waveform(Dm2Module* m) {
    uint32_t noise_value = m->playing_info.last_noise_value;
    // Cast waveform[0] (256 sbytes = 64 uint32s) to uint32 pointer
    uint32_t* waveform = (uint32_t*)m->waveforms[0];

    for (int i = 0; i < 16; i++) {
        noise_value = rotate_left_32(noise_value, 7);
        noise_value += 0x6eca756d;
        noise_value ^= 0x9e59a92b;
        waveform[i] = noise_value;
    }

    m->playing_info.last_noise_value = noise_value;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback methods
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void dm2_change_speed(Dm2Module* m, int8_t new_speed) {
    if (new_speed != m->playing_info.play_speed) {
        m->playing_info.play_speed = new_speed;
    }
}

static void dm2_parse_effect(Dm2Module* m, Dm2ChannelInfo* channel, Dm2Effect effect, uint8_t effect_arg) {
    switch (effect) {
        case DM2_EFFECT_SET_SPEED:
            dm2_change_speed(m, (int8_t)(effect_arg & 0x0f));
            break;

        case DM2_EFFECT_SET_FILTER:
            // AmigaFilter = effectArg != 0; (no-op in WASM)
            break;

        case DM2_EFFECT_SET_BEND_UP:
            channel->pitch_bend = (short)-(effect_arg & 0x00ff);
            break;

        case DM2_EFFECT_SET_BEND_DOWN:
            channel->pitch_bend = (short)(effect_arg & 0x00ff);
            break;

        case DM2_EFFECT_SET_PORTAMENTO:
            channel->portamento = effect_arg;
            break;

        case DM2_EFFECT_SET_VOLUME:
            channel->max_volume = (uint8_t)(effect_arg & 0x3f);
            break;

        case DM2_EFFECT_SET_GLOBAL_VOL:
            m->playing_info.global_volume = (uint8_t)(effect_arg & 0x3f);
            break;

        case DM2_EFFECT_SET_ARP:
            channel->arpeggio = m->arpeggios[effect_arg & 0x3f];
            break;

        default:
            break;
    }
}

static void dm2_sound_table_handler(Dm2Module* m, int channel_number, Dm2ChannelInfo* channel, Dm2Instrument* inst) {
    (void)channel_number;
    if (!inst->is_sample) {
        if (channel->sound_table_delay != 0)
            channel->sound_table_delay--;
        else {
            channel->sound_table_delay = inst->sample_number;

            uint8_t data = inst->table[channel->sound_table_position];
            if (data == 0xff) {
                channel->sound_table_position = inst->table[channel->sound_table_position + 1];

                data = inst->table[channel->sound_table_position];
                if (data == 0xff)
                    return;
            }

            if (channel->retrigger_sound) {
                if (inst->sample_length > 0) {
                    ch_play_sample(channel, inst->number, m->waveforms[data], 0, inst->sample_length);
                    ch_set_loop(channel, 0, inst->sample_length);
                } else {
                    ch_mute(channel);
                }

                channel->retrigger_sound = false;
            } else {
                if (inst->sample_length > 0) {
                    ch_set_sample_data(channel, m->waveforms[data], 0, inst->sample_length);
                    ch_set_loop(channel, 0, inst->sample_length);
                }
            }

            channel->sound_table_position++;
            if (channel->sound_table_position >= 48)
                channel->sound_table_position = 0;
        }
    }
}

static void dm2_vibrato_handler(Dm2ChannelInfo* channel, Dm2Instrument* inst) {
    Dm2VibratoInfo* info = &inst->vibrato_table[channel->vibrato_position];

    if (channel->vibrato_direction)
        channel->vibrato_period -= info->speed;
    else
        channel->vibrato_period += info->speed;

    channel->vibrato_delay--;
    if (channel->vibrato_delay == 0) {
        channel->vibrato_delay = info->delay;
        channel->vibrato_direction = !channel->vibrato_direction;
    }

    if (channel->vibrato_sustain != 0)
        channel->vibrato_sustain--;
    else {
        channel->vibrato_position++;
        if (channel->vibrato_position == 5)
            channel->vibrato_position = 4;

        channel->vibrato_sustain = inst->vibrato_table[channel->vibrato_position].sustain;
    }
}

static void dm2_volume_handler(Dm2ChannelInfo* channel, Dm2Instrument* inst) {
    if (channel->volume_sustain != 0)
        channel->volume_sustain--;
    else {
        Dm2VolumeInfo* info = &inst->volume_table[channel->volume_position];

        if (channel->actual_volume >= info->level) {
            channel->actual_volume -= info->speed;

            if (channel->actual_volume < info->level) {
                channel->actual_volume = info->level;

                channel->volume_position++;
                if (channel->volume_position == 5)
                    channel->volume_position = 4;

                channel->volume_sustain = info->sustain;
            }
        } else {
            channel->actual_volume += info->speed;

            if (channel->actual_volume > info->level) {
                channel->actual_volume = info->level;

                channel->volume_position++;
                if (channel->volume_position == 5)
                    channel->volume_position = 4;

                channel->volume_sustain = info->sustain;
            }
        }
    }
}

static void dm2_portamento_handler(Dm2ChannelInfo* channel) {
    if (channel->portamento != 0) {
        if (channel->final_period >= channel->period) {
            channel->final_period -= channel->portamento;

            if (channel->final_period < channel->period)
                channel->final_period = channel->period;
        } else {
            channel->final_period += channel->portamento;

            if (channel->final_period > channel->period)
                channel->final_period = channel->period;
        }
    }
}

static void dm2_arpeggio_handler(Dm2ChannelInfo* channel) {
    int8_t arp = channel->arpeggio[channel->arpeggio_position];

    if ((channel->arpeggio_position != 0) && (arp == -128)) {
        channel->arpeggio_position = 0;
        arp = channel->arpeggio[0];
    }

    channel->arpeggio_position++;
    channel->arpeggio_position &= 0x0f;

    if (channel->portamento == 0) {
        uint8_t index = (uint8_t)(arp + channel->note + channel->transpose);
        if (index >= DM2_PERIODS_COUNT)
            index = (uint8_t)(DM2_PERIODS_COUNT - 1);

        channel->final_period = dm2_periods[index];
    }
}

static void dm2_process_channel(Dm2Module* m, int channel_number, Dm2ChannelInfo* channel) {
    if (channel->track_length == 0) {
        m->end_reached[channel_number] = true;
        return;
    }

    Dm2Instrument* inst = channel->instrument;

    if (m->playing_info.tick == 0) {
        if (channel->block_position == 0) {
            Dm2Track* track = &channel->track[channel->next_track_position];
            channel->transpose = track->transpose;
            channel->block = m->blocks[track->block_number];

            if ((short)channel->next_track_position <= channel->current_track_position)
                m->end_reached[channel_number] = true;

            channel->current_track_position = (short)channel->next_track_position;

            channel->next_track_position++;
            if (channel->next_track_position >= channel->track_length)
                channel->next_track_position = channel->track_loop_position >= channel->track_length ? 0 : channel->track_loop_position;
        }

        Dm2BlockLine* block = &channel->block[channel->block_position];

        if (block->note != 0) {
            channel->note = block->note;
            channel->period = dm2_periods[channel->note + channel->transpose];

            inst = channel->instrument = m->instruments[block->instrument];
            if (inst != nullptr) {
                if (inst->is_sample) {
                    ch_play_sample(channel, inst->number, inst->sample_data, 0, inst->sample_length);

                    if (inst->repeat_length > 1)
                        ch_set_loop(channel, inst->repeat_start, inst->repeat_length);
                } else {
                    channel->retrigger_sound = true;
                }

                channel->sound_table_delay = 0;
                channel->sound_table_position = 0;
                channel->actual_volume = 0;
                channel->volume_sustain = 0;
                channel->volume_position = 0;
                channel->arpeggio_position = 0;
                channel->vibrato_direction = false;
                channel->vibrato_period = 0;
                channel->vibrato_delay = inst->vibrato_table[0].delay;
                channel->vibrato_position = 0;
                channel->vibrato_sustain = inst->vibrato_table[0].sustain;
            } else {
                ch_mute(channel);
            }
        }

        dm2_parse_effect(m, channel, block->effect, block->effect_arg);

        channel->block_position++;
        channel->block_position &= 0x0f;
    }

    if (inst != nullptr) {
        dm2_sound_table_handler(m, channel_number, channel, inst);
        dm2_vibrato_handler(channel, inst);
        dm2_volume_handler(channel, inst);
        dm2_portamento_handler(channel);
        dm2_arpeggio_handler(channel);

        channel->vibrato_period -= (uint16_t)(inst->pitch_bend - channel->pitch_bend);

        uint16_t new_period = (uint16_t)(channel->final_period + channel->vibrato_period);
        ch_set_amiga_period(channel, new_period);

        uint8_t new_volume = (uint8_t)((channel->actual_volume >> 2) & 0x3f);

        if (new_volume > channel->max_volume)
            new_volume = channel->max_volume;

        if (new_volume > m->playing_info.global_volume)
            new_volume = m->playing_info.global_volume;

        ch_set_amiga_volume(channel, new_volume);
    }
}

static void play_tick(Dm2Module* m) {
    generate_noise_waveform(m);

    m->playing_info.tick--;
    if (m->playing_info.tick < 0)
        m->playing_info.tick = m->playing_info.play_speed;

    for (int i = 0; i < 4; i++)
        dm2_process_channel(m, i, &m->channels[i]);

    // Check for end reached on any channel
    for (int i = 0; i < 4; i++) {
        if (m->end_reached[i]) {
            m->has_ended = true;
            m->end_reached[i] = false;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(Dm2Module* m) {
    m->playing_info.global_volume = 63;
    m->playing_info.play_speed = m->start_speed;
    m->playing_info.tick = 1;
    m->playing_info.last_noise_value = 0;

    m->has_ended = false;
    for (int i = 0; i < 4; i++)
        m->end_reached[i] = false;

    for (int i = 0; i < 4; i++) {
        Dm2ChannelInfo* ch = &m->channels[i];
        ch->track = m->track_infos[i].track;
        ch->track_loop_position = m->track_infos[i].loop_position;
        ch->track_length = m->track_infos[i].track_length;
        ch->block_position = 0;
        ch->current_track_position = -1;
        ch->next_track_position = 0;
        ch->instrument = nullptr;
        ch->arpeggio_position = 0;
        ch->arpeggio = m->arpeggios[0];
        ch->actual_volume = 0;
        ch->volume_position = 0;
        ch->volume_sustain = 0;
        ch->portamento = 0;
        ch->pitch_bend = 0;
        ch->max_volume = 63;
        ch->retrigger_sound = false;
        ch->block = nullptr;
        ch->sound_table_delay = 0;
        ch->sound_table_position = 0;
        ch->final_period = 0;
        ch->period = 0;
        ch->note = 0;
        ch->vibrato_direction = false;
        ch->vibrato_period = 0;
        ch->vibrato_delay = 0;
        ch->transpose = 0;
        ch->vibrato_position = 0;
        ch->vibrato_sustain = 0;

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

    // Default tick rate: 50 Hz (PAL CIA timer)
    m->ticks_per_frame = m->sample_rate / 50.0f;
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick immediately
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool dm2_load(Dm2Module* m, const uint8_t* data, size_t size) {
    Dm2Reader reader;
    reader_init(&reader, data, size);

    // Read start speed
    reader_seek(&reader, 0xbbb);
    m->start_speed = reader_read_int8(&reader);

    // Check mark at 0xbc6
    reader_seek(&reader, 0xbc6);
    uint8_t mark[4];
    reader_read(&reader, mark, 4);
    if (memcmp(mark, ".FNL", 4) != 0)
        return false;

    // Read arpeggios at 0xbca
    reader_seek(&reader, 0xbca);
    m->arpeggios = (int8_t**)calloc(64, sizeof(int8_t*));

    for (int i = 0; i < 64; i++) {
        m->arpeggios[i] = (int8_t*)malloc(16);
        reader_read_signed(&reader, m->arpeggios[i], 16);
    }

    if (reader_eof(&reader))
        return false;

    // Read tracks
    uint16_t track_lengths[4];
    for (int i = 0; i < 4; i++) {
        m->track_infos[i].loop_position = reader_read_b_uint16(&reader);
        track_lengths[i] = reader_read_b_uint16(&reader);
    }

    if (reader_eof(&reader))
        return false;

    for (int i = 0; i < 4; i++) {
        uint16_t count = track_lengths[i] / 2;
        m->track_infos[i].track_length = count;
        m->track_infos[i].track = (Dm2Track*)calloc(count, sizeof(Dm2Track));

        for (int j = 0; j < count; j++) {
            m->track_infos[i].track[j].block_number = reader_read_uint8(&reader);
            m->track_infos[i].track[j].transpose = reader_read_int8(&reader);
        }

        if (reader_eof(&reader))
            return false;
    }

    // Read blocks
    m->num_blocks = reader_read_b_uint32(&reader) / 64;
    m->blocks = (Dm2BlockLine**)calloc(m->num_blocks, sizeof(Dm2BlockLine*));

    for (uint32_t i = 0; i < m->num_blocks; i++) {
        Dm2BlockLine* lines = (Dm2BlockLine*)calloc(16, sizeof(Dm2BlockLine));

        for (int j = 0; j < 16; j++) {
            lines[j].note = reader_read_uint8(&reader);
            lines[j].instrument = reader_read_uint8(&reader);
            lines[j].effect = (Dm2Effect)reader_read_uint8(&reader);
            lines[j].effect_arg = reader_read_uint8(&reader);
        }

        m->blocks[i] = lines;

        if (reader_eof(&reader))
            return false;
    }

    // Read instrument offsets
    uint16_t instrument_offsets[128];
    memset(instrument_offsets, 0, sizeof(instrument_offsets));
    // offset 0 is not read (skip instrument_offsets[0])
    for (int i = 1; i < 128; i++)
        instrument_offsets[i] = reader_read_b_uint16(&reader);

    if (reader_eof(&reader))
        return false;

    m->instruments = (Dm2Instrument**)calloc(128, sizeof(Dm2Instrument*));

    uint16_t break_offset = reader_read_b_uint16(&reader);
    size_t start_offset = reader.pos;

    for (short i = 0; i < 128; i++) {
        if (instrument_offsets[i] == break_offset)
            break;

        reader_seek(&reader, start_offset + instrument_offsets[i]);

        Dm2Instrument* inst = (Dm2Instrument*)calloc(1, sizeof(Dm2Instrument));
        inst->number = i;
        inst->sample_length = (uint16_t)(reader_read_b_uint16(&reader) * 2);
        inst->repeat_start = reader_read_b_uint16(&reader);
        inst->repeat_length = (uint16_t)(reader_read_b_uint16(&reader) * 2);

        if (inst->repeat_start + inst->repeat_length >= inst->sample_length)
            inst->repeat_length = (uint16_t)(inst->sample_length - inst->repeat_start);

        for (int j = 0; j < 5; j++) {
            inst->volume_table[j].speed = reader_read_uint8(&reader);
            inst->volume_table[j].level = reader_read_uint8(&reader);
            inst->volume_table[j].sustain = reader_read_uint8(&reader);
        }

        for (int j = 0; j < 5; j++) {
            inst->vibrato_table[j].speed = reader_read_uint8(&reader);
            inst->vibrato_table[j].delay = reader_read_uint8(&reader);
            inst->vibrato_table[j].sustain = reader_read_uint8(&reader);
        }

        inst->pitch_bend = reader_read_b_uint16(&reader);
        inst->is_sample = reader_read_uint8(&reader) == 0xff;
        inst->sample_number = (uint8_t)(reader_read_uint8(&reader) & 0x7);

        size_t bytes_read = reader_read(&reader, inst->table, 48);
        if (bytes_read < 48) {
            free(inst);
            return false;
        }

        m->instruments[i] = inst;
    }

    // Read waveforms
    m->num_waveforms = reader_read_b_uint32(&reader) / 256;
    m->waveforms = (int8_t**)calloc(m->num_waveforms, sizeof(int8_t*));

    for (uint32_t i = 0; i < m->num_waveforms; i++) {
        m->waveforms[i] = (int8_t*)malloc(256);
        reader_read_signed(&reader, m->waveforms[i], 256);

        if (reader_eof(&reader))
            return false;
    }

    // Skip unknown data (64 bytes)
    reader_skip(&reader, 64);

    // Read sample offsets
    uint32_t sample_offsets[8];
    for (int i = 0; i < 8; i++)
        sample_offsets[i] = reader_read_b_uint32(&reader);

    start_offset = reader.pos;

    // Read sample data for sample instruments
    for (int i = 0; i < 128; i++) {
        Dm2Instrument* inst = m->instruments[i];
        if (inst == nullptr) continue;
        if (!inst->is_sample) continue;

        reader_seek(&reader, start_offset + sample_offsets[inst->sample_number]);

        inst->sample_data = (int8_t*)malloc(inst->sample_length);
        size_t read_bytes = reader_read(&reader, inst->sample_data, inst->sample_length);

        if ((int)read_bytes < (int)(inst->sample_length - 256))
            return false;
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mixer — render interleaved stereo
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t dm2_render(Dm2Module* module, float* interleaved_stereo, size_t frames) {
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
            Dm2ChannelInfo* c = &module->channels[ch];

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

size_t dm2_render_multi(Dm2Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            Dm2ChannelInfo* c = &module->channels[ch];

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

Dm2Module* dm2_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 0xfda)
        return nullptr;

    Dm2Module* m = (Dm2Module*)calloc(1, sizeof(Dm2Module));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    if (!dm2_load(m, data, size)) {
        dm2_destroy(m);
        return nullptr;
    }

    initialize_sound(m);

    return m;
}

void dm2_destroy(Dm2Module* module) {
    if (!module) return;

    if (module->arpeggios) {
        for (int i = 0; i < 64; i++)
            free(module->arpeggios[i]);
        free(module->arpeggios);
    }

    if (module->instruments) {
        for (int i = 0; i < 128; i++) {
            if (module->instruments[i]) {
                free(module->instruments[i]->sample_data);
                free(module->instruments[i]);
            }
        }
        free(module->instruments);
    }

    for (int i = 0; i < 4; i++)
        free(module->track_infos[i].track);

    if (module->blocks) {
        for (uint32_t i = 0; i < module->num_blocks; i++)
            free(module->blocks[i]);
        free(module->blocks);
    }

    if (module->waveforms) {
        for (uint32_t i = 0; i < module->num_waveforms; i++)
            free(module->waveforms[i]);
        free(module->waveforms);
    }

    free(module);
}

int dm2_subsong_count(const Dm2Module* module) {
    if (!module) return 0;
    return 1;
}

bool dm2_select_subsong(Dm2Module* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    initialize_sound(module);
    return true;
}

int dm2_channel_count(const Dm2Module* module) {
    (void)module;
    return 4;
}

void dm2_set_channel_mask(Dm2Module* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool dm2_has_ended(const Dm2Module* module) {
    if (!module) return true;
    return module->has_ended;
}
