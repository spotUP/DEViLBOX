// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "deltamusic1.h"

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

static const uint16_t dm1_periods[] = {
       0, 6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840,
    3616, 3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920,
    1808, 1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076,  960,  904,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  452,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113
};

#define DM1_PERIODS_COUNT (sizeof(dm1_periods) / sizeof(dm1_periods[0]))

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum Dm1Effect {
    DM1_EFFECT_NONE              = 0x00,
    DM1_EFFECT_SET_SPEED         = 0x01,
    DM1_EFFECT_SLIDE_UP          = 0x02,
    DM1_EFFECT_SLIDE_DOWN        = 0x03,
    DM1_EFFECT_SET_FILTER        = 0x04,
    DM1_EFFECT_SET_VIBRATO_WAIT  = 0x05,
    DM1_EFFECT_SET_VIBRATO_STEP  = 0x06,
    DM1_EFFECT_SET_VIBRATO_LEN   = 0x07,
    DM1_EFFECT_SET_BEND_RATE     = 0x08,
    DM1_EFFECT_SET_PORTAMENTO    = 0x09,
    DM1_EFFECT_SET_VOLUME        = 0x0A,
    DM1_EFFECT_SET_ARP1          = 0x0B,
    DM1_EFFECT_SET_ARP2          = 0x0C,
    DM1_EFFECT_SET_ARP3          = 0x0D,
    DM1_EFFECT_SET_ARP4          = 0x0E,
    DM1_EFFECT_SET_ARP5          = 0x0F,
    DM1_EFFECT_SET_ARP6          = 0x10,
    DM1_EFFECT_SET_ARP7          = 0x11,
    DM1_EFFECT_SET_ARP8          = 0x12,
    DM1_EFFECT_SET_ARP1_5        = 0x13,
    DM1_EFFECT_SET_ARP2_6        = 0x14,
    DM1_EFFECT_SET_ARP3_7        = 0x15,
    DM1_EFFECT_SET_ARP4_8        = 0x16,
    DM1_EFFECT_SET_ATTACK_STEP   = 0x17,
    DM1_EFFECT_SET_ATTACK_DELAY  = 0x18,
    DM1_EFFECT_SET_DECAY_STEP    = 0x19,
    DM1_EFFECT_SET_DECAY_DELAY   = 0x1A,
    DM1_EFFECT_SET_SUSTAIN1      = 0x1B,
    DM1_EFFECT_SET_SUSTAIN2      = 0x1C,
    DM1_EFFECT_SET_RELEASE_STEP  = 0x1D,
    DM1_EFFECT_SET_RELEASE_DELAY = 0x1E
} Dm1Effect;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Dm1Track {
    uint8_t block_number;
    int8_t transpose;
} Dm1Track;

typedef struct Dm1BlockLine {
    uint8_t instrument;
    uint8_t note;
    Dm1Effect effect;
    uint8_t effect_arg;
} Dm1BlockLine;

typedef struct Dm1Instrument {
    short number;

    uint8_t attack_step;
    uint8_t attack_delay;
    uint8_t decay_step;
    uint8_t decay_delay;
    uint16_t sustain;
    uint8_t release_step;
    uint8_t release_delay;
    uint8_t volume;
    uint8_t vibrato_wait;
    uint8_t vibrato_step;
    uint8_t vibrato_length;
    int8_t bend_rate;
    uint8_t portamento;
    bool is_sample;
    uint8_t table_delay;
    uint8_t arpeggio[8];
    uint16_t sample_length;
    uint16_t repeat_start;
    uint16_t repeat_length;
    uint8_t* table;          // 48 bytes, NULL for sample instruments
    int8_t* sample_data;
} Dm1Instrument;

typedef struct Dm1ChannelInfo {
    Dm1Instrument* sound_data;
    uint16_t period;
    uint8_t* sound_table;
    uint8_t sound_table_counter;
    uint8_t sound_table_delay;
    Dm1Track* track;
    uint16_t track_length;
    uint16_t track_counter;
    Dm1BlockLine* block;
    uint32_t block_counter;
    uint8_t vibrato_wait;
    uint8_t vibrato_length;
    uint8_t vibrato_position;
    uint8_t vibrato_compare;
    uint16_t vibrato_frequency;
    uint8_t frequency_data;
    uint8_t actual_volume;
    uint8_t attack_delay;
    uint8_t decay_delay;
    uint16_t sustain;
    uint8_t release_delay;
    uint8_t play_speed;
    short bend_rate_frequency;
    int8_t transpose;
    uint8_t status;
    uint8_t arpeggio_counter;
    Dm1Effect effect_number;
    uint8_t effect_data;
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
} Dm1ChannelInfo;

typedef struct Dm1GlobalPlayingInfo {
    uint8_t play_speed;
    Dm1Instrument* instruments[20];
} Dm1GlobalPlayingInfo;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Dm1Reader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} Dm1Reader;

static void reader_init(Dm1Reader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const Dm1Reader* r) {
    return r->pos > r->size;
}

static uint8_t reader_read_uint8(Dm1Reader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_read_int8(Dm1Reader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(Dm1Reader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static int32_t reader_read_b_int32(Dm1Reader* r) {
    uint16_t hi = reader_read_b_uint16(r);
    uint16_t lo = reader_read_b_uint16(r);
    return (int32_t)(((uint32_t)hi << 16) | lo);
}

static size_t reader_read(Dm1Reader* r, void* dst, size_t count) {
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

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module struct
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

struct Dm1Module {
    float sample_rate;

    Dm1Track* tracks[4];
    uint16_t track_lengths[4];

    Dm1BlockLine** blocks;
    uint32_t num_blocks;

    Dm1Instrument* backup_instruments[20];

    Dm1GlobalPlayingInfo playing_info;
    Dm1ChannelInfo channels[4];

    bool has_ended;
    bool end_reached[4]; // per-channel end detection

    // Mixer state
    float tick_accumulator;
    float ticks_per_frame;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IChannel emulation helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_play_sample(Dm1ChannelInfo* ch, short sample_number, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    ch->ch_sample_data = sample_data;
    ch->ch_sample_length = length;
    ch->ch_loop_start = 0;
    ch->ch_loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
    (void)sample_number;
}

static void ch_set_sample_data(Dm1ChannelInfo* ch, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    // SetSample(adr, startOffset, length) — change sample without retrigger
    ch->ch_sample_data = sample_data;
    ch->ch_sample_length = length;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
}

static void ch_set_loop(Dm1ChannelInfo* ch, uint32_t start_offset, uint32_t length) {
    ch->ch_loop_start = start_offset;
    ch->ch_loop_length = length;
    ch->ch_sample_length = start_offset + length;
}

static void ch_set_loop_with_data(Dm1ChannelInfo* ch, int8_t* sample_data, uint32_t start_offset, uint32_t length) {
    ch->ch_sample_data = sample_data;
    ch->ch_loop_start = start_offset;
    ch->ch_loop_length = length;
    ch->ch_sample_length = start_offset + length;
}

static void ch_set_amiga_volume(Dm1ChannelInfo* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->ch_volume = vol;
}

static void ch_set_amiga_period(Dm1ChannelInfo* ch, uint16_t period) {
    ch->ch_period = period;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Playback methods
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void dm1_sound_table_handler(Dm1Module* m, int channel_number, Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    (void)m;
    (void)channel_number;
    channel->sound_table_delay = inst->table_delay;

    for (;;) {
        if (channel->sound_table_counter >= 48)
            channel->sound_table_counter = 0;

        uint8_t data = channel->sound_table[channel->sound_table_counter];
        if (data == 0xff)
            channel->sound_table_counter = channel->sound_table[channel->sound_table_counter + 1];
        else if (data >= 0x80) {
            inst->table_delay = (uint8_t)(data & 0x7f);
            channel->sound_table_counter++;
        } else {
            channel->sound_table_counter++;

            data *= 32;

            if (channel->retrigger_sound) {
                ch_play_sample(channel, inst->number, inst->sample_data, data, inst->sample_length);
                channel->retrigger_sound = false;
            } else {
                ch_set_sample_data(channel, inst->sample_data, data, inst->sample_length);
            }

            ch_set_loop_with_data(channel, inst->sample_data, data, inst->sample_length);
            break;
        }
    }
}

static void dm1_portamento_handler(Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    if (inst->portamento != 0) {
        if (channel->period == 0)
            channel->period = (uint16_t)(dm1_periods[channel->frequency_data] + channel->bend_rate_frequency);
        else {
            uint16_t period = channel->period;
            uint16_t wanted_period = (uint16_t)(dm1_periods[channel->frequency_data] + channel->bend_rate_frequency);

            if (period > wanted_period) {
                period -= inst->portamento;
                if (period < wanted_period)
                    channel->period = wanted_period;
                else
                    channel->period = period;
            } else if (period < wanted_period) {
                period += inst->portamento;
                if (period > wanted_period)
                    channel->period = wanted_period;
                else
                    channel->period = period;
            }
        }
    }
}

static void dm1_vibrato_handler(Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    if (channel->vibrato_wait == 0) {
        channel->vibrato_frequency = (uint16_t)(channel->vibrato_position * inst->vibrato_step);

        if ((channel->status & 0x01) != 0) {
            channel->vibrato_position--;
            if (channel->vibrato_position == 0)
                channel->status ^= 0x01;
        } else {
            channel->vibrato_position++;
            if (channel->vibrato_position == channel->vibrato_compare)
                channel->status ^= 0x01;
        }
    } else {
        channel->vibrato_wait--;
    }
}

static void dm1_bendrate_handler(Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    if (inst->bend_rate >= 0)
        channel->bend_rate_frequency = (short)(channel->bend_rate_frequency - inst->bend_rate);
    else
        channel->bend_rate_frequency = (short)(channel->bend_rate_frequency + -(inst->bend_rate));
}

static void dm1_change_speed(Dm1Module* m, uint8_t new_speed) {
    if (new_speed != m->playing_info.play_speed) {
        m->playing_info.play_speed = new_speed;
    }
}

static void dm1_effect_handler(Dm1Module* m, Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    uint8_t data = channel->effect_data;

    switch (channel->effect_number) {
        case DM1_EFFECT_SET_SPEED:
            if (data != 0)
                dm1_change_speed(m, data);
            break;

        case DM1_EFFECT_SLIDE_UP:
            channel->bend_rate_frequency -= data;
            break;

        case DM1_EFFECT_SLIDE_DOWN:
            channel->bend_rate_frequency += data;
            break;

        case DM1_EFFECT_SET_FILTER:
            // AmigaFilter = data == 0; (no-op in WASM)
            break;

        case DM1_EFFECT_SET_VIBRATO_WAIT:
            inst->vibrato_wait = data;
            break;

        case DM1_EFFECT_SET_VIBRATO_STEP:
            inst->vibrato_step = data;
            break;

        case DM1_EFFECT_SET_VIBRATO_LEN:
            inst->vibrato_length = data;
            break;

        case DM1_EFFECT_SET_BEND_RATE:
            inst->bend_rate = (int8_t)data;
            break;

        case DM1_EFFECT_SET_PORTAMENTO:
            inst->portamento = data;
            break;

        case DM1_EFFECT_SET_VOLUME:
            if (data > 64) data = 64;
            inst->volume = data;
            break;

        case DM1_EFFECT_SET_ARP1:
            inst->arpeggio[0] = data;
            break;

        case DM1_EFFECT_SET_ARP2:
            inst->arpeggio[1] = data;
            break;

        case DM1_EFFECT_SET_ARP3:
            inst->arpeggio[2] = data;
            break;

        case DM1_EFFECT_SET_ARP4:
            inst->arpeggio[3] = data;
            break;

        case DM1_EFFECT_SET_ARP5:
            inst->arpeggio[4] = data;
            break;

        case DM1_EFFECT_SET_ARP6:
            inst->arpeggio[5] = data;
            break;

        case DM1_EFFECT_SET_ARP7:
            inst->arpeggio[6] = data;
            break;

        case DM1_EFFECT_SET_ARP8:
            inst->arpeggio[7] = data;
            break;

        case DM1_EFFECT_SET_ARP1_5:
            inst->arpeggio[0] = data;
            inst->arpeggio[4] = data;
            break;

        case DM1_EFFECT_SET_ARP2_6:
            inst->arpeggio[1] = data;
            inst->arpeggio[5] = data;
            break;

        case DM1_EFFECT_SET_ARP3_7:
            inst->arpeggio[2] = data;
            inst->arpeggio[6] = data;
            break;

        case DM1_EFFECT_SET_ARP4_8:
            inst->arpeggio[3] = data;
            inst->arpeggio[7] = data;
            break;

        case DM1_EFFECT_SET_ATTACK_STEP:
            if (data > 64) data = 64;
            inst->attack_step = data;
            break;

        case DM1_EFFECT_SET_ATTACK_DELAY:
            inst->attack_delay = data;
            break;

        case DM1_EFFECT_SET_DECAY_STEP:
            if (data > 64) data = 64;
            inst->decay_step = data;
            break;

        case DM1_EFFECT_SET_DECAY_DELAY:
            inst->decay_delay = data;
            break;

        case DM1_EFFECT_SET_SUSTAIN1:
            inst->sustain = (uint16_t)((inst->sustain & 0x00ff) | (data << 8));
            break;

        case DM1_EFFECT_SET_SUSTAIN2:
            inst->sustain = (uint16_t)((inst->sustain & 0xff00) | data);
            break;

        case DM1_EFFECT_SET_RELEASE_STEP:
            if (data > 64) data = 64;
            inst->release_step = data;
            break;

        case DM1_EFFECT_SET_RELEASE_DELAY:
            inst->release_delay = data;
            break;

        default:
            break;
    }
}

static void dm1_arpeggio_handler(int channel_number, Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    uint8_t arp = inst->arpeggio[channel->arpeggio_counter];

    channel->arpeggio_counter++;
    channel->arpeggio_counter &= 0x07;

    uint16_t new_period = dm1_periods[channel->frequency_data + arp];
    new_period = (uint16_t)((new_period - channel->vibrato_length * inst->vibrato_step) + channel->bend_rate_frequency);

    if (inst->portamento != 0)
        new_period = channel->period;
    else
        channel->period = 0;

    new_period += channel->vibrato_frequency;
    ch_set_amiga_period(channel, new_period);
    (void)channel_number;
}

static void dm1_volume_handler(int channel_number, Dm1ChannelInfo* channel, Dm1Instrument* inst) {
    int actual_volume = channel->actual_volume;
    uint8_t status = (uint8_t)(channel->status & 0x0e);

    if (status == 0) {
        if (channel->attack_delay == 0) {
            channel->attack_delay = inst->attack_delay;
            actual_volume += inst->attack_step;

            if (actual_volume >= 64) {
                actual_volume = 64;
                status |= 0x02;
                channel->status |= 0x02;
            }
        } else {
            channel->attack_delay--;
        }
    }

    if (status == 0x02) {
        if (channel->decay_delay == 0) {
            channel->decay_delay = inst->decay_delay;
            actual_volume -= inst->decay_step;

            if (actual_volume <= inst->volume) {
                actual_volume = inst->volume;
                status |= 0x06;
                channel->status |= 0x06;
            }
        } else {
            channel->decay_delay--;
        }
    }

    if (status == 0x06) {
        if (channel->sustain == 0) {
            status |= 0x0e;
            channel->status |= 0x0e;
        } else {
            channel->sustain--;
        }
    }

    if (status == 0x0e) {
        if (channel->release_delay == 0) {
            channel->release_delay = inst->release_delay;
            actual_volume -= inst->release_step;

            if (actual_volume <= 0) {
                actual_volume = 0;
                channel->status &= 0x09;
            }
        } else {
            channel->release_delay--;
        }
    }

    channel->actual_volume = (uint8_t)actual_volume;
    ch_set_amiga_volume(channel, (uint16_t)actual_volume);
    (void)channel_number;
}

static void dm1_calculate_frequency(Dm1Module* m, int channel_number, Dm1ChannelInfo* channel) {
    Dm1Instrument* inst = channel->sound_data;

    channel->play_speed--;
    if (channel->play_speed == 0) {
        channel->play_speed = m->playing_info.play_speed;

        if (channel->block_counter == 0) {
            Dm1Track new_track;

            if (channel->track_counter == channel->track_length) {
                channel->track_counter = 0;
                m->end_reached[channel_number] = true;
            }

            for (;;) {
                new_track = channel->track[channel->track_counter];
                if ((new_track.block_number != 0xff) || (new_track.transpose != -1))
                    break;

                uint16_t old_track_counter = channel->track_counter;

                Dm1Track next = channel->track[channel->track_counter + 1];
                channel->track_counter = (uint16_t)(((next.block_number << 8) | (uint8_t)next.transpose) & 0x7ff);

                if (channel->track_counter < old_track_counter)
                    m->end_reached[channel_number] = true;
            }

            channel->transpose = new_track.transpose;
            channel->block = m->blocks[new_track.block_number];
            channel->track_counter++;
        }

        Dm1BlockLine* block_line = &channel->block[channel->block_counter];

        if (block_line->effect != DM1_EFFECT_NONE) {
            channel->effect_number = block_line->effect;
            channel->effect_data = block_line->effect_arg;
        }

        if (block_line->note != 0) {
            channel->frequency_data = (uint8_t)(block_line->note + channel->transpose);

            channel->status = 0;
            channel->bend_rate_frequency = 0;
            channel->arpeggio_counter = 0;

            channel->effect_number = block_line->effect;
            channel->effect_data = block_line->effect_arg;

            inst = m->playing_info.instruments[block_line->instrument];
            channel->sound_data = inst;

            channel->sound_table = inst->table;
            channel->sound_table_counter = 0;

            if (inst->is_sample) {
                ch_play_sample(channel, inst->number, inst->sample_data, 0, inst->sample_length);

                if (inst->repeat_length > 1)
                    ch_set_loop(channel, inst->repeat_start, inst->repeat_length);
            } else {
                channel->retrigger_sound = true;
            }

            channel->vibrato_wait = inst->vibrato_wait;
            uint8_t vib_len = inst->vibrato_length;
            channel->vibrato_length = vib_len;
            channel->vibrato_position = vib_len;
            channel->vibrato_compare = (uint8_t)(vib_len * 2);

            channel->actual_volume = 0;
            channel->sound_table_delay = 0;
            channel->sound_table_counter = 0;
            channel->attack_delay = 0;
            channel->decay_delay = 0;
            channel->sustain = inst->sustain;
            channel->release_delay = 0;
        }

        channel->block_counter++;
        if (channel->block_counter == 16)
            channel->block_counter = 0;
    }

    if (inst != nullptr) {
        if (!inst->is_sample) {
            if (channel->sound_table_delay == 0)
                dm1_sound_table_handler(m, channel_number, channel, inst);
            else
                channel->sound_table_delay--;
        }

        dm1_portamento_handler(channel, inst);
        dm1_vibrato_handler(channel, inst);
        dm1_bendrate_handler(channel, inst);
        dm1_effect_handler(m, channel, inst);
        dm1_arpeggio_handler(channel_number, channel, inst);
        dm1_volume_handler(channel_number, channel, inst);
    }
}

static void play_tick(Dm1Module* m) {
    for (int i = 0; i < 4; i++)
        dm1_calculate_frequency(m, i, &m->channels[i]);

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

static void initialize_sound(Dm1Module* m) {
    m->playing_info.play_speed = 6;

    // Rebuild instruments from backup
    for (int i = 0; i < 20; i++) {
        if (m->backup_instruments[i] != nullptr) {
            // Deep clone the instrument
            Dm1Instrument* src = m->backup_instruments[i];
            Dm1Instrument* dst = (Dm1Instrument*)malloc(sizeof(Dm1Instrument));
            *dst = *src;

            // Clone arpeggio array
            memcpy(dst->arpeggio, src->arpeggio, 8);

            // Table and sample_data point to the backup's data (shared, not cloned)
            m->playing_info.instruments[i] = dst;
        } else {
            m->playing_info.instruments[i] = nullptr;
        }
    }

    // Find first non-null instrument for default sound table
    uint8_t* default_table = nullptr;
    for (int i = 0; i < 20; i++) {
        if (m->playing_info.instruments[i] != nullptr) {
            default_table = m->playing_info.instruments[i]->table;
            break;
        }
    }

    m->has_ended = false;
    for (int i = 0; i < 4; i++)
        m->end_reached[i] = false;

    for (int i = 0; i < 4; i++) {
        Dm1ChannelInfo* ch = &m->channels[i];
        ch->sound_data = nullptr;
        ch->period = 0;
        ch->sound_table = default_table;
        ch->sound_table_counter = 0;
        ch->sound_table_delay = 0;
        ch->track = m->tracks[i];
        ch->track_length = m->track_lengths[i];
        ch->track_counter = 0;
        ch->block = m->blocks[0];
        ch->block_counter = 0;
        ch->vibrato_wait = 0;
        ch->vibrato_length = 0;
        ch->vibrato_position = 0;
        ch->vibrato_compare = 0;
        ch->vibrato_frequency = 0;
        ch->frequency_data = 0;
        ch->actual_volume = 0;
        ch->attack_delay = 0;
        ch->decay_delay = 0;
        ch->sustain = 0;
        ch->release_delay = 0;
        ch->play_speed = 1;
        ch->bend_rate_frequency = 0;
        ch->transpose = 0;
        ch->status = 0;
        ch->arpeggio_counter = 0;
        ch->effect_number = DM1_EFFECT_NONE;
        ch->effect_data = 0;
        ch->retrigger_sound = false;

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

static bool dm1_load(Dm1Module* m, const uint8_t* data, size_t size) {
    Dm1Reader reader;
    reader_init(&reader, data, size);

    // Check mark
    uint8_t mark[4];
    reader_read(&reader, mark, 4);
    if (memcmp(mark, "ALL ", 4) != 0)
        return false;

    // Read all the different lengths
    uint32_t track_lengths[4];
    for (int i = 0; i < 4; i++)
        track_lengths[i] = (uint32_t)reader_read_b_int32(&reader);

    uint32_t block_length = (uint32_t)reader_read_b_int32(&reader);

    uint32_t instrument_lengths[20];
    for (int i = 0; i < 20; i++)
        instrument_lengths[i] = (uint32_t)reader_read_b_int32(&reader);

    // Read the tracks
    for (int i = 0; i < 4; i++) {
        uint32_t length = track_lengths[i] / 2;
        m->tracks[i] = (Dm1Track*)calloc(length, sizeof(Dm1Track));
        m->track_lengths[i] = (uint16_t)length;

        for (uint32_t j = 0; j < length; j++) {
            m->tracks[i][j].block_number = reader_read_uint8(&reader);
            m->tracks[i][j].transpose = reader_read_int8(&reader);
        }
    }

    if (reader_eof(&reader))
        return false;

    // Read the blocks
    uint32_t count = block_length / 64;
    m->num_blocks = count;
    m->blocks = (Dm1BlockLine**)calloc(count, sizeof(Dm1BlockLine*));

    for (uint32_t i = 0; i < count; i++) {
        Dm1BlockLine* lines = (Dm1BlockLine*)calloc(16, sizeof(Dm1BlockLine));

        for (int j = 0; j < 16; j++) {
            lines[j].instrument = reader_read_uint8(&reader);
            lines[j].note = reader_read_uint8(&reader);
            lines[j].effect = (Dm1Effect)reader_read_uint8(&reader);
            lines[j].effect_arg = reader_read_uint8(&reader);
        }

        m->blocks[i] = lines;

        if (reader_eof(&reader))
            return false;
    }

    // Read the instruments
    for (short i = 0; i < 20; i++) {
        uint32_t length = instrument_lengths[i];
        if (length != 0) {
            Dm1Instrument* inst = (Dm1Instrument*)calloc(1, sizeof(Dm1Instrument));
            inst->number = i;

            inst->attack_step = reader_read_uint8(&reader);
            inst->attack_delay = reader_read_uint8(&reader);
            inst->decay_step = reader_read_uint8(&reader);
            inst->decay_delay = reader_read_uint8(&reader);
            inst->sustain = reader_read_b_uint16(&reader);
            inst->release_step = reader_read_uint8(&reader);
            inst->release_delay = reader_read_uint8(&reader);
            inst->volume = reader_read_uint8(&reader);
            inst->vibrato_wait = reader_read_uint8(&reader);
            inst->vibrato_step = reader_read_uint8(&reader);
            inst->vibrato_length = reader_read_uint8(&reader);
            inst->bend_rate = reader_read_int8(&reader);
            inst->portamento = reader_read_uint8(&reader);
            inst->is_sample = reader_read_uint8(&reader) != 0;
            inst->table_delay = reader_read_uint8(&reader);

            reader_read(&reader, inst->arpeggio, 8);

            inst->sample_length = reader_read_b_uint16(&reader);
            inst->repeat_start = reader_read_b_uint16(&reader);
            inst->repeat_length = reader_read_b_uint16(&reader);

            if (!inst->is_sample) {
                inst->table = (uint8_t*)malloc(48);
                reader_read(&reader, inst->table, 48);
            }

            if (reader_eof(&reader)) {
                free(inst->table);
                free(inst);
                return false;
            }

            int sample_data_len = (int)length - (inst->is_sample ? 30 : 78);
            if (sample_data_len > 0) {
                inst->sample_data = (int8_t*)malloc(sample_data_len);
                reader_read(&reader, inst->sample_data, sample_data_len);
            }

            if (reader_eof(&reader)) {
                free(inst->table);
                free(inst->sample_data);
                free(inst);
                return false;
            }

            m->backup_instruments[i] = inst;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mixer — render interleaved stereo
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t dm1_render(Dm1Module* module, float* interleaved_stereo, size_t frames) {
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
            Dm1ChannelInfo* c = &module->channels[ch];

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

size_t dm1_render_multi(Dm1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            Dm1ChannelInfo* c = &module->channels[ch];

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

Dm1Module* dm1_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 104)
        return nullptr;

    Dm1Module* m = (Dm1Module*)calloc(1, sizeof(Dm1Module));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    if (!dm1_load(m, data, size)) {
        dm1_destroy(m);
        return nullptr;
    }

    initialize_sound(m);

    return m;
}

void dm1_destroy(Dm1Module* module) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        free(module->tracks[i]);

    if (module->blocks) {
        for (uint32_t i = 0; i < module->num_blocks; i++)
            free(module->blocks[i]);
        free(module->blocks);
    }

    for (int i = 0; i < 20; i++) {
        if (module->backup_instruments[i]) {
            free(module->backup_instruments[i]->table);
            free(module->backup_instruments[i]->sample_data);
            free(module->backup_instruments[i]);
        }
    }

    // Free cloned playing instruments
    for (int i = 0; i < 20; i++) {
        if (module->playing_info.instruments[i] != nullptr) {
            // Check it's not pointing to the same backup
            bool is_backup = false;
            for (int j = 0; j < 20; j++) {
                if (module->playing_info.instruments[i] == module->backup_instruments[j]) {
                    is_backup = true;
                    break;
                }
            }
            if (!is_backup)
                free(module->playing_info.instruments[i]);
        }
    }

    free(module);
}

int dm1_subsong_count(const Dm1Module* module) {
    if (!module) return 0;
    return 1;
}

bool dm1_select_subsong(Dm1Module* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    // Free old playing instruments
    for (int i = 0; i < 20; i++) {
        if (module->playing_info.instruments[i] != nullptr) {
            bool is_backup = false;
            for (int j = 0; j < 20; j++) {
                if (module->playing_info.instruments[i] == module->backup_instruments[j]) {
                    is_backup = true;
                    break;
                }
            }
            if (!is_backup)
                free(module->playing_info.instruments[i]);
            module->playing_info.instruments[i] = nullptr;
        }
    }

    initialize_sound(module);
    return true;
}

int dm1_channel_count(const Dm1Module* module) {
    (void)module;
    return 4;
}

void dm1_set_channel_mask(Dm1Module* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool dm1_has_ended(const Dm1Module* module) {
    if (!module) return true;
    return module->has_ended;
}
