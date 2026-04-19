// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "futurecomposer.h"

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

static const uint16_t fc_periods[132] = {
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
    3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812,
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113

};

static const uint8_t fc_silent[8] = {
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe1

};

#define FC_SILENT_LEN 8
#define FC_PERIODS_LEN 132

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct FcPatternRow {
    uint8_t note;
    uint8_t info;
} FcPatternRow;

typedef struct FcPattern {
    FcPatternRow rows[32];
} FcPattern;

typedef struct FcVoiceSeq {
    uint8_t pattern;
    int8_t transpose;
    int8_t sound_transpose;
} FcVoiceSeq;

typedef struct FcSequence {
    FcVoiceSeq voice_seq[4];
    uint8_t speed;
} FcSequence;

typedef struct FcVolSequence {
    uint8_t speed;
    uint8_t frq_number;
    int8_t vib_speed;
    int8_t vib_depth;
    uint8_t vib_delay;
    uint8_t values[59];
} FcVolSequence;

typedef struct FcMultiSampleEntry {
    int16_t sample_number;
    int8_t* address;
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
} FcMultiSampleEntry;

typedef struct FcMultiSample {
    FcMultiSampleEntry sample[20];
} FcMultiSample;

typedef struct FcSample {
    int16_t sample_number;
    int8_t* address;
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
    FcMultiSample* multi;
} FcSample;

typedef struct FcVoiceInfo {
    int8_t pitch_bend_speed;
    uint8_t pitch_bend_time;
    uint16_t song_pos;
    int8_t cur_note;
    uint8_t* volume_seq;          // pointer into vol sequence values
    int volume_seq_len;           // length of the volume_seq array
    uint8_t volume_bend_speed;
    uint8_t volume_bend_time;
    uint16_t volume_seq_pos;
    int8_t sound_transpose;
    uint8_t volume_counter;
    uint8_t volume_speed;
    uint8_t vol_sus_counter;
    uint8_t sus_counter;
    int8_t vib_speed;
    int8_t vib_depth;
    int8_t vib_value;
    int8_t vib_delay;
    FcPattern* cur_pattern;
    bool vol_bend_flag;
    bool port_flag;
    uint16_t pattern_pos;
    bool pitch_bend_flag;
    int8_t patt_transpose;
    int8_t transpose;
    int8_t volume;
    uint8_t vib_flag;
    uint8_t portamento;
    uint16_t frequency_seq_start_offset;
    uint16_t frequency_seq_pos;
    uint16_t pitch;
} FcVoiceInfo;

typedef struct FcGlobalPlayingInfo {
    uint16_t re_sp_cnt;
    uint16_t rep_spd;
    uint16_t spd_temp;
    bool aud_temp[4];
} FcGlobalPlayingInfo;

// Channel state for Amiga mixer
typedef struct FcChannel {
    int8_t* sample_data;
    uint32_t sample_length;     // in samples (bytes for 8-bit)
    uint32_t sample_offset;     // start offset
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t period;
    uint16_t volume;            // 0..64
    uint64_t position_fp;       // fixed-point position
    bool active;
    bool muted;
    int16_t sample_number;
} FcChannel;

// Big-endian reader
typedef struct FcReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} FcReader;

typedef struct FcModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    FcSample samp_info[90];     // 10 samples + 80 wavetables
    int16_t samp_num;
    int16_t wav_num;

    FcSequence* sequences;
    int16_t seq_num;

    FcPattern* patterns;
    int16_t pat_num;

    uint8_t* frq_sequences;
    int frq_sequences_len;

    FcVolSequence* vol_sequences;
    int16_t vol_num;            // number of vol sequences (excluding silent at index 0)

    FcGlobalPlayingInfo playing_info;
    FcVoiceInfo voice_data[4];
    FcChannel channels[4];

    bool end_reached;
    bool has_ended;

    // Timing
    float tick_accumulator;
    float ticks_per_frame;

    // Position visit tracking
    uint8_t visited[256];
} FcModule;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void reader_init(FcReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const FcReader* r) {
    return r->pos > r->size;
}

static uint8_t reader_u8(FcReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_i8(FcReader* r) {
    return (int8_t)reader_u8(r);
}

static uint16_t reader_b_u16(FcReader* r) {
    uint8_t hi = reader_u8(r);
    uint8_t lo = reader_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t reader_b_u32(FcReader* r) {
    uint16_t hi = reader_b_u16(r);
    uint16_t lo = reader_b_u16(r);
    return ((uint32_t)hi << 16) | lo;
}

static void reader_skip(FcReader* r, size_t bytes) {
    r->pos += bytes;
}

static void reader_seek(FcReader* r, size_t pos) {
    r->pos = pos;
}

static void reader_read(FcReader* r, void* dst, size_t len) {
    for (size_t i = 0; i < len; i++) {
        ((uint8_t*)dst)[i] = reader_u8(r);
    }
}

static void reader_read_signed(FcReader* r, int8_t* dst, size_t len) {
    for (size_t i = 0; i < len; i++) {
        dst[i] = reader_i8(r);
    }
}

static bool reader_read_mark(FcReader* r, char* buf, int len) {
    for (int i = 0; i < len; i++) {
        buf[i] = (char)reader_u8(r);
    }
    buf[len] = '\0';
    return !reader_eof(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Visit tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(FcModule* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static void mark_visited(FcModule* m, int pos) {
    if (pos >= 0 && pos < 256)
        m->visited[pos] = 1;
}

static bool has_visited(const FcModule* m, int pos) {
    if (pos >= 0 && pos < 256)
        return m->visited[pos] != 0;
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel operations (IChannel equivalent)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void ch_mute(FcChannel* ch) {
    ch->active = false;
    ch->position_fp = 0;
}

static void ch_play_sample(FcChannel* ch, int16_t sample_number, int8_t* data, uint32_t start_offset, uint32_t length) {
    ch->sample_number = sample_number;
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
    ch->loop_start = 0;
    ch->loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
}

static void ch_set_sample(FcChannel* ch, int8_t* data, uint32_t start_offset, uint32_t length) {
    // Set sample to play after current one ends/loops — no retrigger
    ch->sample_data = data;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
}

static void ch_set_loop(FcChannel* ch, uint32_t start_offset, uint32_t length) {
    ch->loop_start = start_offset;
    ch->loop_length = length;
}

static void ch_set_amiga_period(FcChannel* ch, uint16_t period) {
    ch->period = period;
}

static void ch_set_amiga_volume(FcChannel* ch, uint16_t vol) {
    if (vol > 64) vol = 64;
    ch->volume = vol;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoVolBend
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_vol_bend(FcVoiceInfo* voi) {
    voi->vol_bend_flag = !voi->vol_bend_flag;
    if (voi->vol_bend_flag) {
        voi->volume_bend_time--;
        voi->volume += (int8_t)voi->volume_bend_speed;

        if (voi->volume > 64) {
            voi->volume = 64;
            voi->volume_bend_time = 0;
        } else {
            if (voi->volume < 0) {
                voi->volume = 0;
                voi->volume_bend_time = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// NewNote
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void fc_new_note(FcModule* m, uint32_t chan) {
    FcVoiceInfo* voi = &m->voice_data[chan];
    FcChannel* ch = &m->channels[chan];

    // Check for end of pattern or "END" mark in pattern
    if ((voi->pattern_pos == 32) || (voi->cur_pattern->rows[voi->pattern_pos].note == 0x49)) {
        // New position
        voi->song_pos++;
        voi->pattern_pos = 0;

        // Have we reached the end of the module
        if (voi->song_pos >= m->seq_num)
            voi->song_pos = 0;

        // Count the speed counter
        m->playing_info.spd_temp++;
        if (m->playing_info.spd_temp == 5) {
            m->playing_info.spd_temp = 1;

            // Get new replay speed
            if (m->sequences[voi->song_pos].speed != 0) {
                m->playing_info.re_sp_cnt = m->sequences[voi->song_pos].speed;
                m->playing_info.rep_spd = m->playing_info.re_sp_cnt;
            }
        }

        // Get pattern information
        voi->transpose = m->sequences[voi->song_pos].voice_seq[chan].transpose;
        voi->sound_transpose = m->sequences[voi->song_pos].voice_seq[chan].sound_transpose;

        uint8_t patt_num = m->sequences[voi->song_pos].voice_seq[chan].pattern;
        if (patt_num >= m->pat_num)
            patt_num = 0;

        voi->cur_pattern = &m->patterns[patt_num];

        if (chan == 0) {
            if (has_visited(m, voi->song_pos))
                m->end_reached = true;

            mark_visited(m, voi->song_pos);
        }
    }

    // Get the pattern row
    uint8_t note = voi->cur_pattern->rows[voi->pattern_pos].note;
    uint8_t info = voi->cur_pattern->rows[voi->pattern_pos].info;

    // Check to see if we need to make portamento
    if ((note != 0) || ((info & 0xc0) != 0)) {
        if (note != 0)
            voi->pitch = 0;

        if ((info & 0x80) != 0)
            voi->portamento = voi->pattern_pos < 31 ? voi->cur_pattern->rows[voi->pattern_pos + 1].info : 0;
        else
            voi->portamento = 0;
    }

    // Got any note
    note &= 0x7f;
    if (note != 0) {
        voi->cur_note = (int8_t)note;

        // Mute the channel
        m->playing_info.aud_temp[chan] = false;
        ch_mute(ch);

        // Find the volume sequence
        uint8_t inst = (uint8_t)((info & 0x3f) + voi->sound_transpose);
        if (inst >= m->vol_num)
            inst = 0;
        else
            inst++;

        voi->volume_seq_pos = 0;
        voi->volume_counter = m->vol_sequences[inst].speed;
        voi->volume_speed = m->vol_sequences[inst].speed;
        voi->vol_sus_counter = 0;

        voi->vib_speed = m->vol_sequences[inst].vib_speed;
        voi->vib_flag = 0x40;
        voi->vib_depth = m->vol_sequences[inst].vib_depth;
        voi->vib_value = m->vol_sequences[inst].vib_depth;
        voi->vib_delay = (int8_t)m->vol_sequences[inst].vib_delay;
        voi->volume_seq = m->vol_sequences[inst].values;
        voi->volume_seq_len = 59;

        // Find the frequency sequence
        voi->frequency_seq_start_offset = (uint16_t)(FC_SILENT_LEN + m->vol_sequences[inst].frq_number * 64);
        voi->frequency_seq_pos = 0;
        voi->sus_counter = 0;
    }

    // Go to the next pattern row
    voi->pattern_pos++;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Effect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void fc_effect(FcModule* m, uint32_t chan) {
    FcVoiceInfo* voi = &m->voice_data[chan];
    FcChannel* ch = &m->channels[chan];

    // Parse the frequency sequence commands
    bool one_more;
    do {
        one_more = false;

        if (voi->sus_counter != 0) {
            voi->sus_counter--;
            break;
        }

        // Sustain counter is zero, run the next part of the sequence
        uint16_t seq_poi = (uint16_t)(voi->frequency_seq_start_offset + voi->frequency_seq_pos);
        if (seq_poi >= m->frq_sequences_len)
            break;

        bool parse_effect;
        do {
            uint8_t dat;
            parse_effect = false;

            // Get the next command in the sequence
            uint8_t cmd = m->frq_sequences[seq_poi++];

            // Check for end of sequence
            if (cmd == 0xe1)
                break;

            // Check for "loop to other part of sequence" command
            if (cmd == 0xe0) {
                dat = (uint8_t)(m->frq_sequences[seq_poi] & 0x3f);

                voi->frequency_seq_pos = dat;
                seq_poi = (uint16_t)(voi->frequency_seq_start_offset + dat);

                cmd = m->frq_sequences[seq_poi++];
            }

            // Check for all the effects
            switch (cmd) {
                // Set wave form
                case 0xe2: {
                    dat = m->frq_sequences[seq_poi++];

                    if (dat < 90) {
                        if (m->samp_info[dat].address != nullptr) {
                            ch_play_sample(ch, m->samp_info[dat].sample_number, m->samp_info[dat].address, 0, m->samp_info[dat].length);
                            if (m->samp_info[dat].loop_length > 2) {
                                if ((m->samp_info[dat].loop_start + m->samp_info[dat].loop_length) > m->samp_info[dat].length)
                                    ch_set_loop(ch, m->samp_info[dat].loop_start, (uint32_t)(m->samp_info[dat].length - m->samp_info[dat].loop_start));
                                else
                                    ch_set_loop(ch, m->samp_info[dat].loop_start, m->samp_info[dat].loop_length);
                            }
                        }
                    }

                    voi->volume_seq_pos = 0;
                    voi->volume_counter = 1;
                    voi->frequency_seq_pos += 2;
                    m->playing_info.aud_temp[chan] = true;
                    break;
                }

                // Set loop
                case 0xe4: {
                    if (m->playing_info.aud_temp[chan]) {
                        dat = m->frq_sequences[seq_poi++];

                        if (dat < 90) {
                            ch_set_sample(ch, m->samp_info[dat].address, m->samp_info[dat].loop_start, m->samp_info[dat].loop_length);
                            ch_set_loop(ch, m->samp_info[dat].loop_start, m->samp_info[dat].loop_length);
                        }

                        voi->frequency_seq_pos += 2;
                    }
                    break;
                }

                // Set sample (multi sample)
                case 0xe9: {
                    m->playing_info.aud_temp[chan] = true;

                    dat = m->frq_sequences[seq_poi++];

                    if ((dat < 90) && (m->samp_info[dat].multi != nullptr)) {
                        FcMultiSample* mul_samp = m->samp_info[dat].multi;

                        dat = m->frq_sequences[seq_poi++];

                        if (dat < 20) {
                            if (mul_samp->sample[dat].address != nullptr) {
                                ch_play_sample(ch, mul_samp->sample[dat].sample_number, mul_samp->sample[dat].address, 0, mul_samp->sample[dat].length);
                                if (mul_samp->sample[dat].loop_length > 2) {
                                    if ((mul_samp->sample[dat].loop_start + mul_samp->sample[dat].loop_length) > mul_samp->sample[dat].length)
                                        ch_set_loop(ch, mul_samp->sample[dat].loop_start, (uint32_t)(mul_samp->sample[dat].length - mul_samp->sample[dat].loop_start));
                                    else
                                        ch_set_loop(ch, mul_samp->sample[dat].loop_start, mul_samp->sample[dat].loop_length);
                                }
                            }
                        }

                        voi->volume_seq_pos = 0;
                        voi->volume_counter = 1;
                    }

                    voi->frequency_seq_pos += 3;
                    break;
                }

                // Pattern jump
                case 0xe7: {
                    parse_effect = true;

                    dat = m->frq_sequences[seq_poi];

                    seq_poi = (uint16_t)(FC_SILENT_LEN + dat * 64);
                    if (seq_poi >= m->frq_sequences_len)
                        seq_poi = 0;

                    voi->frequency_seq_start_offset = seq_poi;
                    voi->frequency_seq_pos = 0;
                    break;
                }

                // Pitch bend
                case 0xea: {
                    voi->pitch_bend_speed = (int8_t)m->frq_sequences[seq_poi++];
                    voi->pitch_bend_time = m->frq_sequences[seq_poi++];
                    voi->frequency_seq_pos += 3;
                    break;
                }

                // New sustain
                case 0xe8: {
                    voi->sus_counter = m->frq_sequences[seq_poi++];
                    voi->frequency_seq_pos += 2;

                    one_more = true;
                    break;
                }

                // New vibrato
                case 0xe3: {
                    voi->vib_speed = (int8_t)m->frq_sequences[seq_poi++];
                    voi->vib_depth = (int8_t)m->frq_sequences[seq_poi++];
                    voi->frequency_seq_pos += 3;
                    break;
                }
            }

            if (!parse_effect && !one_more) {
                seq_poi = (uint16_t)(voi->frequency_seq_start_offset + voi->frequency_seq_pos);
                voi->patt_transpose = (int8_t)m->frq_sequences[seq_poi];
                voi->frequency_seq_pos++;
            }
        } while (parse_effect);
    } while (one_more);

    // Parse the volume sequence commands
    if (voi->vol_sus_counter != 0)
        voi->vol_sus_counter--;
    else {
        if (voi->volume_bend_time != 0)
            do_vol_bend(voi);
        else {
            voi->volume_counter--;
            if (voi->volume_counter == 0) {
                voi->volume_counter = voi->volume_speed;

                bool parse_effect;
                do {
                    parse_effect = false;

                    // Check for end of sequence
                    if ((voi->volume_seq_pos >= 59) || (voi->volume_seq[voi->volume_seq_pos] == 0xe1))
                        break;

                    switch (voi->volume_seq[voi->volume_seq_pos]) {
                        // Volume bend
                        case 0xea: {
                            voi->volume_bend_speed = voi->volume_seq[voi->volume_seq_pos + 1];
                            voi->volume_bend_time = voi->volume_seq[voi->volume_seq_pos + 2];
                            voi->volume_seq_pos += 3;

                            do_vol_bend(voi);
                            break;
                        }

                        // New volume sustain
                        case 0xe8: {
                            voi->vol_sus_counter = voi->volume_seq[voi->volume_seq_pos + 1];
                            voi->volume_seq_pos += 2;
                            break;
                        }

                        // Set new position
                        case 0xe0: {
                            voi->volume_seq_pos = (uint16_t)((voi->volume_seq[voi->volume_seq_pos + 1] & 0x3f) - 5);
                            parse_effect = true;
                            break;
                        }

                        // Set volume
                        default: {
                            voi->volume = (int8_t)(voi->volume_seq[voi->volume_seq_pos] & 0x7f);
                            voi->volume_seq_pos++;
                            break;
                        }
                    }
                } while (parse_effect);
            }
        }
    }

    // Calculate the period
    int8_t note = voi->patt_transpose;
    if (note >= 0)
        note += (int8_t)(voi->cur_note + voi->transpose);

    note &= 0x7f;

    // Get the period
    uint16_t period = (uint8_t)note < FC_PERIODS_LEN ? fc_periods[(uint8_t)note] : 0;
    uint8_t vib_flag = voi->vib_flag;

    // Shall we vibrate?
    if (voi->vib_delay != 0)
        voi->vib_delay--;
    else {
        uint16_t vib_base = (uint16_t)(note * 2);
        int8_t vib_dep = (int8_t)(voi->vib_depth * 2);
        int8_t vib_val = voi->vib_value;

        if (((vib_flag & 0x80) == 0) || ((vib_flag & 0x01) == 0)) {
            if ((vib_flag & 0x20) != 0) {
                vib_val += voi->vib_speed;
                if (vib_val >= vib_dep) {
                    vib_flag &= 0xdf;  // ~0x20
                    vib_val = vib_dep;
                }
            } else {
                vib_val -= voi->vib_speed;
                if (vib_val < 0) {
                    vib_flag |= 0x20;
                    vib_val = 0;
                }
            }

            voi->vib_value = vib_val;
        }

        vib_dep /= 2;
        vib_val -= vib_dep;
        vib_base += 160;

        while (vib_base < 256) {
            vib_val *= 2;
            vib_base += 24;
        }

        period += (uint16_t)(int16_t)vib_val;
    }

    voi->vib_flag = (uint8_t)(vib_flag ^ 0x01);

    // Do the portamento thing
    voi->port_flag = !voi->port_flag;
    if (voi->port_flag && (voi->portamento != 0)) {
        if (voi->portamento <= 31)
            voi->pitch -= voi->portamento;
        else
            voi->pitch += (uint16_t)(voi->portamento & 0x1f);
    }

    // Pitch bend
    voi->pitch_bend_flag = !voi->pitch_bend_flag;
    if (voi->pitch_bend_flag && (voi->pitch_bend_time != 0)) {
        voi->pitch_bend_time--;
        voi->pitch -= (uint16_t)voi->pitch_bend_speed;
    }

    period += voi->pitch;

    // Check for bounds
    if (period < 113)
        period = 113;
    else {
        if (period > 3424)
            period = 3424;
    }

    if (voi->volume < 0)
        voi->volume = 0;
    else {
        if (voi->volume > 64)
            voi->volume = 64;
    }

    // Play the period
    ch_set_amiga_period(ch, period);
    ch_set_amiga_volume(ch, (uint16_t)voi->volume);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(FcModule* m) {
    // Decrease replay speed counter
    m->playing_info.re_sp_cnt--;
    if (m->playing_info.re_sp_cnt == 0) {
        // Restore replay speed counter
        m->playing_info.re_sp_cnt = m->playing_info.rep_spd;

        // Get new note for each channel
        fc_new_note(m, 0);
        fc_new_note(m, 1);
        fc_new_note(m, 2);
        fc_new_note(m, 3);
    }

    // Calculate effects for each channel
    fc_effect(m, 0);
    fc_effect(m, 1);
    fc_effect(m, 2);
    fc_effect(m, 3);

    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeSound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(FcModule* m, int start_position) {
    // Initialize speed
    uint16_t spd = m->sequences[start_position].speed;
    if (spd == 0)
        spd = 3;

    m->playing_info.re_sp_cnt = spd;
    m->playing_info.rep_spd = spd;
    m->playing_info.spd_temp = 1;
    m->playing_info.aud_temp[0] = false;
    m->playing_info.aud_temp[1] = false;
    m->playing_info.aud_temp[2] = false;
    m->playing_info.aud_temp[3] = false;

    m->end_reached = false;
    m->has_ended = false;

    // Initialize channel variables
    for (int i = 0; i < 4; i++) {
        FcVoiceInfo* voi = &m->voice_data[i];

        voi->pitch_bend_speed = 0;
        voi->pitch_bend_time = 0;
        voi->song_pos = (uint16_t)start_position;
        voi->cur_note = 0;
        voi->volume_seq = m->vol_sequences[0].values;
        voi->volume_seq_len = 59;
        voi->volume_bend_speed = 0;
        voi->volume_bend_time = 0;
        voi->volume_seq_pos = 0;
        voi->volume_counter = 1;
        voi->volume_speed = 1;
        voi->vol_sus_counter = 0;
        voi->sus_counter = 0;
        voi->vib_speed = 0;
        voi->vib_depth = 0;
        voi->vib_value = 0;
        voi->vib_delay = 0;
        voi->vol_bend_flag = false;
        voi->port_flag = false;
        voi->pattern_pos = 0;
        voi->pitch_bend_flag = false;
        voi->patt_transpose = 0;
        voi->volume = 0;
        voi->vib_flag = 0;
        voi->portamento = 0;
        voi->frequency_seq_start_offset = 0;
        voi->frequency_seq_pos = 0;
        voi->pitch = 0;
        voi->cur_pattern = &m->patterns[m->sequences[start_position].voice_seq[i].pattern];
        voi->transpose = m->sequences[start_position].voice_seq[i].transpose;
        voi->sound_transpose = m->sequences[start_position].voice_seq[i].sound_transpose;

        // Reset channel
        FcChannel* ch = &m->channels[i];
        memset(ch, 0, sizeof(FcChannel));
    }

    // Timing: FC14 uses CIA timer at ~50Hz
    m->ticks_per_frame = m->sample_rate / 50.0f;
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick immediately
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(FcModule* m, const uint8_t* data, size_t size) {
    FcReader reader;
    reader_init(&reader, data, size);

    // Skip mark "FC14"
    reader_skip(&reader, 4);

    // Get the length of the sequences
    int seq_length = (int)reader_b_u32(&reader);

    // Get the offsets into the file
    int pat_offset = (int)reader_b_u32(&reader);
    int pat_length = (int)reader_b_u32(&reader);

    int frq_offset = (int)reader_b_u32(&reader);
    int frq_length = (int)reader_b_u32(&reader);

    int vol_offset = (int)reader_b_u32(&reader);
    int vol_length = (int)reader_b_u32(&reader);

    int smp_offset = (int)reader_b_u32(&reader);
    int wav_offset = (int)reader_b_u32(&reader);

    if (reader_eof(&reader))
        return false;

    // Read the sample information
    m->samp_num = 10;

    int i;
    for (i = 0; i < 10; i++) {
        FcSample* samp = &m->samp_info[i];

        samp->address = nullptr;
        samp->length = (uint16_t)(reader_b_u16(&reader) * 2);
        samp->loop_start = reader_b_u16(&reader);
        samp->loop_length = (uint16_t)(reader_b_u16(&reader) * 2);
        samp->multi = nullptr;

        if (samp->loop_start >= samp->length) {
            samp->loop_start = 0;
            samp->loop_length = 2;
        }
    }

    // Read the wave table lengths
    for (i = 10; i < 90; i++) {
        FcSample* samp = &m->samp_info[i];

        samp->address = nullptr;
        samp->length = (uint16_t)(reader_u8(&reader) * 2);
        samp->loop_start = 0;
        samp->loop_length = samp->length;
        samp->multi = nullptr;
    }

    if (reader_eof(&reader))
        return false;

    // Find out how many wave tables that are used
    for (i = 89; i >= 10; i--) {
        if (m->samp_info[i].length != 0)
            break;
    }

    m->wav_num = (int16_t)(i - 9);

    // Allocate memory to hold the sequences
    m->seq_num = (int16_t)(seq_length / 13);

    if (m->seq_num == 0) {
        m->sequences = (FcSequence*)calloc(1, sizeof(FcSequence));
        m->seq_num = 1;
    } else {
        m->sequences = (FcSequence*)calloc(m->seq_num, sizeof(FcSequence));

        // The reader should already be at the right position for sequences
        // (after the header: 4 mark + 4 seqlen + 8*4 offsets + 10*6 samples + 80*1 wavetable lengths = 140 bytes)
        // Actually sequences follow immediately after the sample info in the file

        for (i = 0; i < m->seq_num; i++) {
            FcSequence* seq = &m->sequences[i];

            seq->voice_seq[0].pattern = reader_u8(&reader);
            seq->voice_seq[0].transpose = reader_i8(&reader);
            seq->voice_seq[0].sound_transpose = reader_i8(&reader);

            seq->voice_seq[1].pattern = reader_u8(&reader);
            seq->voice_seq[1].transpose = reader_i8(&reader);
            seq->voice_seq[1].sound_transpose = reader_i8(&reader);

            seq->voice_seq[2].pattern = reader_u8(&reader);
            seq->voice_seq[2].transpose = reader_i8(&reader);
            seq->voice_seq[2].sound_transpose = reader_i8(&reader);

            seq->voice_seq[3].pattern = reader_u8(&reader);
            seq->voice_seq[3].transpose = reader_i8(&reader);
            seq->voice_seq[3].sound_transpose = reader_i8(&reader);

            seq->speed = reader_u8(&reader);
        }
    }

    // Allocate memory to hold the patterns
    m->pat_num = (int16_t)(pat_length / 64);
    m->patterns = (FcPattern*)calloc(m->pat_num, sizeof(FcPattern));

    // Read the patterns
    reader_seek(&reader, pat_offset);

    for (i = 0; i < m->pat_num; i++) {
        FcPattern* patt = &m->patterns[i];

        for (int j = 0; j < 32; j++) {
            patt->rows[j].note = reader_u8(&reader);
            patt->rows[j].info = reader_u8(&reader);
        }
    }

    if (reader_eof(&reader))
        return false;

    // Allocate memory to hold the frequency sequences
    m->frq_sequences_len = FC_SILENT_LEN + frq_length + 1;
    m->frq_sequences = (uint8_t*)malloc(m->frq_sequences_len);

    // Copy silent sequence to the first block
    memcpy(m->frq_sequences, fc_silent, FC_SILENT_LEN);

    // Read the frequency sequences
    reader_seek(&reader, frq_offset);
    reader_read(&reader, m->frq_sequences + FC_SILENT_LEN, frq_length);

    // Set "end of sequence" mark
    m->frq_sequences[m->frq_sequences_len - 1] = 0xe1;

    // Allocate memory to hold the volume sequences
    m->vol_num = (int16_t)(vol_length / 64);
    int total_vol = 1 + m->vol_num;
    m->vol_sequences = (FcVolSequence*)calloc(total_vol, sizeof(FcVolSequence));

    // Set up silent volume sequence at index 0
    m->vol_sequences[0].speed = fc_silent[0];
    m->vol_sequences[0].frq_number = fc_silent[1];
    m->vol_sequences[0].vib_speed = (int8_t)fc_silent[2];
    m->vol_sequences[0].vib_depth = (int8_t)fc_silent[3];
    m->vol_sequences[0].vib_delay = fc_silent[4];

    // Copy remaining silent bytes into values (Silent has 8 bytes, first 4 are header, but values start at offset 4)
    // Actually: Silent[0] = speed, [1] = frqNumber, [2] = vibSpeed, [3] = vibDepth, [4] = vibDelay
    // Then values are [5], [6], [7] (3 bytes out of 59)
    memset(m->vol_sequences[0].values, 0, 59);
    int silent_values_len = FC_SILENT_LEN - 5;
    if (silent_values_len > 59) silent_values_len = 59;
    // C# code: Array.Copy(Tables.Silent, 4, volSequences[0].Values, 0, Tables.Silent.Length - 4);
    // That copies Silent[4..7] into Values[0..3]
    memcpy(m->vol_sequences[0].values, fc_silent + 4, FC_SILENT_LEN - 4);

    // Read the volume sequences
    reader_seek(&reader, vol_offset);

    for (i = 1; i <= m->vol_num; i++) {
        FcVolSequence* vs = &m->vol_sequences[i];

        vs->speed = reader_u8(&reader);
        vs->frq_number = reader_u8(&reader);
        vs->vib_speed = reader_i8(&reader);
        vs->vib_depth = reader_i8(&reader);
        vs->vib_delay = reader_u8(&reader);

        reader_read(&reader, vs->values, 59);
    }

    if (reader_eof(&reader))
        return false;

    // Load the samples
    reader_seek(&reader, smp_offset);

    int16_t real_sample_number = 0;

    for (i = 0; i < 10; i++) {
        m->samp_info[i].sample_number = real_sample_number++;

        if (m->samp_info[i].length != 0) {
            // Read the first 4 bytes to see if it's a multi sample
            char mark[5];
            reader_read_mark(&reader, mark, 4);

            if (strcmp(mark, "SSMP") == 0) {
                // Multi sample
                FcMultiSample* multi = (FcMultiSample*)calloc(1, sizeof(FcMultiSample));
                uint32_t multi_offsets[20];

                for (int j = 0; j < 20; j++) {
                    multi_offsets[j] = reader_b_u32(&reader);

                    FcMultiSampleEntry* ms = &multi->sample[j];

                    ms->length = (uint16_t)(reader_b_u16(&reader) * 2);
                    ms->loop_start = reader_b_u16(&reader);
                    ms->loop_length = (uint16_t)(reader_b_u16(&reader) * 2);
                    ms->address = nullptr;

                    // Skip pad bytes
                    reader_skip(&reader, 6);
                }

                // Decrement sample count for the container
                m->samp_num--;
                real_sample_number--;

                // Read the sample data
                size_t samp_start_offset = reader.pos;

                for (int j = 0; j < 20; j++) {
                    if (multi->sample[j].length != 0) {
                        reader_seek(&reader, samp_start_offset + multi_offsets[j]);
                        multi->sample[j].address = (int8_t*)malloc(multi->sample[j].length);
                        reader_read_signed(&reader, multi->sample[j].address, multi->sample[j].length);

                        // Skip pad bytes
                        reader_b_u16(&reader);

                        if (reader_eof(&reader)) {
                            // Partial load - still set what we have
                        }

                        multi->sample[j].sample_number = real_sample_number++;
                        m->samp_num++;
                    }
                }

                m->samp_info[i].multi = multi;
            } else {
                // Normal sample - seek back 4 bytes
                reader.pos -= 4;

                m->samp_info[i].address = (int8_t*)malloc(m->samp_info[i].length);
                reader_read_signed(&reader, m->samp_info[i].address, m->samp_info[i].length);
            }
        }

        // Skip pad bytes
        reader_b_u16(&reader);

        if (reader_eof(&reader))
            return false;
    }

    // Load the wave tables
    reader_seek(&reader, wav_offset);

    for (i = 10; i < 90; i++) {
        if (m->samp_info[i].length != 0) {
            m->samp_info[i].address = (int8_t*)malloc(m->samp_info[i].length);
            reader_read_signed(&reader, m->samp_info[i].address, m->samp_info[i].length);

            if (reader_eof(&reader))
                return false;

            m->samp_info[i].sample_number = real_sample_number++;
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga Mixer + Render
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t fc_render(FcModule* module, float* interleaved_stereo, size_t frames) {
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

        float left = 0.0f, right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            FcChannel* c = &module->channels[ch];

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

            // Amiga panning: ch 0,3 = left, ch 1,2 = right
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

        // Scale output
        *out++ = left * 0.5f;
        *out++ = right * 0.5f;
        frames_written++;
    }

    return frames_written;
}

size_t fc_render_multi(FcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            FcChannel* c = &module->channels[ch];
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

            // Write to per-channel buffer
            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            // Advance position
            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);

            // Handle loop / end
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
// SMOD → FC14 converter (Future Composer 1.0 – 1.3)
//
// FC 1.3 and earlier write files with the "SMOD" magic and use a hardcoded set
// of wave tables baked into the player binary. FC 1.4 files ("FC14") carry the
// wave tables inline. The two formats are otherwise identical *except* that
// FC14 stores 80 extra wave-length bytes right after the sample info and a
// trailing wave-tables block.
//
// Ported 1:1 from NostalgicPlayer's FutureComposer13Format.cs converter
// (Thomas Neumann, MIT). We convert SMOD → FC14 in a freshly malloc'd buffer,
// then hand that buffer to the existing FC14 loader below.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Per-wave length in the implicit FC 1.3 wave-table set (80 waves, u8 each,
// stored value = bytes / 2 to match FC14 sample-length convention).
static const uint8_t smod_wave_length[80] = {
    0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
    0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
    0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
    0x10, 0x10, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
    0x10, 0x08, 0x10, 0x10, 0x08, 0x08, 0x18, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Wave-table PCM data (1344 bytes; concatenation of all non-empty waves).
static const uint8_t smod_wave_tables[1344] = {
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0x3f,0x37,0x2f,0x27,0x1f,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0x37,0x2f,0x27,0x1f,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0x2f,0x27,0x1f,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0x27,0x1f,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0x1f,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x17,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x0f,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x07,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0xff,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x07,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x0f,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x90,0x17,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0x1f,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xa0,0x27,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xa0,0xa8,0x2f,0x37,
    0xc0,0xc0,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,0x00,0xf8,0xf0,0xe8,0xe0,0xd8,0xd0,0xc8,
    0xc0,0xb8,0xb0,0xa8,0xa0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xa0,0xa8,0xb0,0x37,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,0x7f,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,
    0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,
    0x80,0x80,0x90,0x98,0xa0,0xa8,0xb0,0xb8,0xc0,0xc8,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,
    0x00,0x08,0x10,0x18,0x20,0x28,0x30,0x38,0x40,0x48,0x50,0x58,0x60,0x68,0x70,0x7f,
    0x80,0x80,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0,0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,
    0x45,0x45,0x79,0x7d,0x7a,0x77,0x70,0x66,0x61,0x58,0x53,0x4d,0x2c,0x20,0x18,0x12,
    0x04,0xdb,0xd3,0xcd,0xc6,0xbc,0xb5,0xae,0xa8,0xa3,0x9d,0x99,0x93,0x8e,0x8b,0x8a,
    0x45,0x45,0x79,0x7d,0x7a,0x77,0x70,0x66,0x5b,0x4b,0x43,0x37,0x2c,0x20,0x18,0x12,
    0x04,0xf8,0xe8,0xdb,0xcf,0xc6,0xbe,0xb0,0xa8,0xa4,0x9e,0x9a,0x95,0x94,0x8d,0x83,
    0x00,0x00,0x40,0x60,0x7f,0x60,0x40,0x20,0x00,0xe0,0xc0,0xa0,0x80,0xa0,0xc0,0xe0,
    0x00,0x00,0x40,0x60,0x7f,0x60,0x40,0x20,0x00,0xe0,0xc0,0xa0,0x80,0xa0,0xc0,0xe0,
    0x80,0x80,0x90,0x98,0xa0,0xa8,0xb0,0xb8,0xc0,0xc8,0xd0,0xd8,0xe0,0xe8,0xf0,0xf8,
    0x00,0x08,0x10,0x18,0x20,0x28,0x30,0x38,0x40,0x48,0x50,0x58,0x60,0x68,0x70,0x7f,
    0x80,0x80,0xa0,0xb0,0xc0,0xd0,0xe0,0xf0,0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70
};

// Big-endian uint32 write helper
static inline void wr_be_u32(uint8_t* dst, uint32_t v) {
    dst[0] = (uint8_t)(v >> 24);
    dst[1] = (uint8_t)(v >> 16);
    dst[2] = (uint8_t)(v >> 8);
    dst[3] = (uint8_t)(v);
}

static inline uint32_t rd_be_u32(const uint8_t* src) {
    return ((uint32_t)src[0] << 24) | ((uint32_t)src[1] << 16) |
           ((uint32_t)src[2] << 8)  |  (uint32_t)src[3];
}

// Convert an SMOD (FC 1.0 - 1.3) module buffer to an equivalent FC14 module.
// Returns a freshly malloc'd buffer on success (caller frees) with size
// written to *out_size. Returns NULL on error.
static uint8_t* smod_to_fc14(const uint8_t* src, size_t src_size, size_t* out_size) {
    if (!src || src_size < 100 || !out_size) return nullptr;
    if (memcmp(src, "SMOD", 4) != 0) return nullptr;

    // Read SMOD header
    uint32_t seq_length = rd_be_u32(src + 4);
    uint32_t off[8];
    for (int i = 0; i < 8; i++) off[i] = rd_be_u32(src + 8 + i * 4);

    // Per NostalgicPlayer: if seqLength is zero, derive it from patOffset
    // (cult.fc workaround — some files leave the seq-length field empty).
    if (seq_length == 0) {
        if (off[0] < 0x100) return nullptr;
        seq_length = off[0] - 0x100;
    }

    // Sanity checks on the 6 length-bearing fields (pat, frq, vol)
    const uint32_t pat_offset = off[0];
    const uint32_t pat_length = off[1];
    const uint32_t frq_offset = off[2];
    const uint32_t frq_length = off[3];
    const uint32_t vol_offset = off[4];
    const uint32_t vol_length = off[5];
    const uint32_t smp_offset = off[6];
    if (pat_offset > src_size || pat_offset + pat_length > src_size) return nullptr;
    if (frq_offset > src_size || frq_offset + frq_length > src_size) return nullptr;
    if (vol_offset > src_size || vol_offset + vol_length > src_size) return nullptr;
    if (smp_offset > src_size) return nullptr;

    // FC14 stores seqLength rounded up to even
    uint32_t fc14_seq_length = (seq_length + 1u) & ~1u;

    // Compute worst-case output size. We keep all original data and add:
    //  - 80 bytes of wave-length table inserted after sample info
    //  - up to 1 byte of even-alignment padding before pattern block
    //  - up to 2 bytes of seq-length rounding zero-fill
    //  - 1344 bytes of wave tables appended at the end
    size_t cap = src_size + 80 + 4 + sizeof(smod_wave_tables);
    uint8_t* out = (uint8_t*)calloc(1, cap);
    if (!out) return nullptr;

    // Output bump pointer
    size_t o = 0;

    // --- FC14 header ---
    memcpy(out + o, "FC14", 4); o += 4;
    wr_be_u32(out + o, fc14_seq_length); o += 4;
    // Reserve 8 offsets; fill later.
    size_t offsets_pos = o;
    o += 8 * 4;

    // --- Sample info (10 × 6 bytes, unchanged) ---
    // SMOD layout: sample info sits immediately after the 8 offsets (at src offset 40).
    if (40 + 60 > src_size) { free(out); return nullptr; }
    memcpy(out + o, src + 40, 60); o += 60;

    // --- 80 wave lengths ---
    memcpy(out + o, smod_wave_length, 80); o += 80;

    // --- Sequences (seq_length bytes from src; FC14 expects fc14_seq_length even) ---
    // Sequences follow the sample info in SMOD, so src pos is 40 + 60 = 100.
    if (100 + seq_length > src_size) { free(out); return nullptr; }
    memcpy(out + o, src + 100, seq_length); o += seq_length;
    if (fc14_seq_length > seq_length) { out[o++] = 0; }

    // --- Patterns (with portamento fix) ---
    // Even-align pattern offset (FC14 reader expects patOffset aligned).
    if (o & 1u) { out[o++] = 0; }
    uint32_t new_pat_offset = (uint32_t)o;
    if (pat_offset + pat_length > src_size) { free(out); return nullptr; }
    memcpy(out + o, src + pat_offset, pat_length);

    // Fix portamento: scan every odd byte within the pattern block. When bit 7
    // of pattBuf[i] is set, the slide target in pattBuf[i+2] must be doubled.
    // Layout: pairs of (note, info), where info bit 0x80 = portamento flag on
    // the *next* row's note byte's low 5 bits.
    if (pat_length >= 3) {
        uint8_t* p = out + o;
        for (uint32_t i = 1; i < pat_length - 2; i += 2) {
            if (p[i] & 0x80) {
                uint8_t v = p[i + 2];
                p[i + 2] = (uint8_t)(((((uint32_t)(v & 0x1f)) * 2u) & 0x1fu) | (v & 0x20u));
            }
        }
    }
    o += pat_length;

    // --- Frequency sequences (verbatim) ---
    uint32_t new_frq_offset = (uint32_t)o;
    if (frq_offset + frq_length > src_size) { free(out); return nullptr; }
    memcpy(out + o, src + frq_offset, frq_length); o += frq_length;

    // --- Volume sequences (verbatim) ---
    uint32_t new_vol_offset = (uint32_t)o;
    if (vol_offset + vol_length > src_size) { free(out); return nullptr; }
    memcpy(out + o, src + vol_offset, vol_length); o += vol_length;

    // --- Sample data ---
    // FC14 expects: for each of 10 samples, (sample bytes if length > 0) + 2 pad bytes.
    // SMOD shares this layout, so we copy straight from src + smp_offset to the end
    // of the sample-data section (= start of wave tables in FC14, which SMOD lacks).
    uint32_t new_smp_offset = (uint32_t)o;
    // Samples run from smp_offset to end-of-file in SMOD (everything past the vol-seq block
    // is sample data and the FC14 sample section must cover it). We copy the tail.
    if (smp_offset > src_size) { free(out); return nullptr; }
    size_t smp_bytes = src_size - smp_offset;
    memcpy(out + o, src + smp_offset, smp_bytes);
    o += smp_bytes;

    // --- Wave tables (appended) ---
    uint32_t new_wav_offset = (uint32_t)o;
    memcpy(out + o, smod_wave_tables, sizeof(smod_wave_tables));
    o += sizeof(smod_wave_tables);

    // --- Fill in the 8 offsets in the header ---
    // FC14 order: patOffset, patLength, frqOffset, frqLength, volOffset, volLength, smpOffset, wavOffset
    wr_be_u32(out + offsets_pos +  0, new_pat_offset);
    wr_be_u32(out + offsets_pos +  4, pat_length);
    wr_be_u32(out + offsets_pos +  8, new_frq_offset);
    wr_be_u32(out + offsets_pos + 12, frq_length);
    wr_be_u32(out + offsets_pos + 16, new_vol_offset);
    wr_be_u32(out + offsets_pos + 20, vol_length);
    wr_be_u32(out + offsets_pos + 24, new_smp_offset);
    wr_be_u32(out + offsets_pos + 28, new_wav_offset);

    *out_size = o;
    return out;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

FcModule* fc_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 100)
        return nullptr;

    // Accept FC14 directly, or convert SMOD (FC 1.0-1.3) → FC14 first.
    uint8_t* converted = nullptr;
    size_t   converted_size = 0;

    if (memcmp(data, "FC14", 4) == 0) {
        if (size < 180) return nullptr;
        // use data / size as-is
    } else if (memcmp(data, "SMOD", 4) == 0) {
        converted = smod_to_fc14(data, size, &converted_size);
        if (!converted) return nullptr;
        data = converted;
        size = converted_size;
    } else {
        return nullptr;
    }

    FcModule* m = (FcModule*)calloc(1, sizeof(FcModule));
    if (!m) { if (converted) free(converted); return nullptr; }

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }

    if (!load_module(m, data, size)) {
        fc_destroy(m);
        if (converted) free(converted);
        return nullptr;
    }

    // load_module has fully consumed `data` (samples/patterns copied out), and
    // `original_data` holds its own copy, so the temporary SMOD→FC14 buffer is
    // safe to release now.
    if (converted) free(converted);

    if (m->seq_num > 0) {
        clear_visited(m);
        initialize_sound(m, 0);
    }

    return m;
}

void fc_destroy(FcModule* module) {
    if (!module) return;

    // Free samples
    for (int i = 0; i < 90; i++) {
        if (module->samp_info[i].address)
            free(module->samp_info[i].address);

        if (module->samp_info[i].multi) {
            for (int j = 0; j < 20; j++) {
                if (module->samp_info[i].multi->sample[j].address)
                    free(module->samp_info[i].multi->sample[j].address);
            }
            free(module->samp_info[i].multi);
        }
    }

    if (module->sequences) free(module->sequences);
    if (module->patterns) free(module->patterns);
    if (module->frq_sequences) free(module->frq_sequences);
    if (module->vol_sequences) free(module->vol_sequences);

    if (module->original_data) free(module->original_data);
    free(module);
}

int fc_subsong_count(const FcModule* module) {
    if (!module) return 0;
    return 1;  // FC14 has only one song
}

bool fc_select_subsong(FcModule* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    clear_visited(module);
    initialize_sound(module, 0);
    return true;
}

int fc_channel_count(const FcModule* module) {
    (void)module;
    return 4;
}

void fc_set_channel_mask(FcModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool fc_has_ended(const FcModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int fc_get_instrument_count(const FcModule* module) {
    return module ? (int)module->vol_num : 0;
}

int fc_get_num_patterns(const FcModule* module) {
    return module ? (int)module->pat_num : 0;
}

int fc_get_num_sequences(const FcModule* module) {
    return module ? (int)module->seq_num : 0;
}

void fc_get_cell(const FcModule* module, int pattern, int row,
                  uint8_t* note, uint8_t* info) {
    if (!module || pattern < 0 || pattern >= module->pat_num || row < 0 || row >= 32) {
        if (note) *note = 0; if (info) *info = 0;
        return;
    }
    const FcPatternRow* pr = &module->patterns[pattern].rows[row];
    if (note) *note = pr->note;
    if (info) *info = pr->info;
}

void fc_set_cell(FcModule* module, int pattern, int row,
                  uint8_t note, uint8_t info) {
    if (!module || pattern < 0 || pattern >= module->pat_num || row < 0 || row >= 32) return;
    FcPatternRow* pr = &module->patterns[pattern].rows[row];
    pr->note = note;
    pr->info = info;
}

void fc_get_sequence(const FcModule* module, int seq, int channel,
                      uint8_t* pattern, int8_t* transpose, int8_t* sound_transpose, uint8_t* speed) {
    if (!module || seq < 0 || seq >= module->seq_num || channel < 0 || channel >= 4) {
        if (pattern) *pattern = 0; if (transpose) *transpose = 0;
        if (sound_transpose) *sound_transpose = 0; if (speed) *speed = 0;
        return;
    }
    const FcSequence* s = &module->sequences[seq];
    if (pattern) *pattern = s->voice_seq[channel].pattern;
    if (transpose) *transpose = s->voice_seq[channel].transpose;
    if (sound_transpose) *sound_transpose = s->voice_seq[channel].sound_transpose;
    if (speed) *speed = s->speed;
}

void fc_set_sequence(FcModule* module, int seq, int channel,
                      uint8_t pattern, int8_t transpose, int8_t sound_transpose, uint8_t speed) {
    if (!module || seq < 0 || seq >= module->seq_num || channel < 0 || channel >= 4) return;
    FcSequence* s = &module->sequences[seq];
    s->voice_seq[channel].pattern = pattern;
    s->voice_seq[channel].transpose = transpose;
    s->voice_seq[channel].sound_transpose = sound_transpose;
    s->speed = speed;
}

float fc_get_instrument_param(const FcModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= module->vol_num || !param) return -1.0f;
    const FcVolSequence* vs = &module->vol_sequences[inst];

    if (strcmp(param, "speed") == 0)       return (float)vs->speed;
    if (strcmp(param, "frqNumber") == 0)   return (float)vs->frq_number;
    if (strcmp(param, "vibSpeed") == 0)    return (float)vs->vib_speed;
    if (strcmp(param, "vibDepth") == 0)    return (float)vs->vib_depth;
    if (strcmp(param, "vibDelay") == 0)    return (float)vs->vib_delay;

    return -1.0f;
}

void fc_set_instrument_param(FcModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= module->vol_num || !param) return;
    FcVolSequence* vs = &module->vol_sequences[inst];
    uint8_t v8 = (uint8_t)value;
    int8_t sv8 = (int8_t)value;

    if (strcmp(param, "speed") == 0)       { vs->speed = v8; return; }
    if (strcmp(param, "frqNumber") == 0)   { vs->frq_number = v8; return; }
    if (strcmp(param, "vibSpeed") == 0)    { vs->vib_speed = sv8; return; }
    if (strcmp(param, "vibDepth") == 0)    { vs->vib_depth = sv8; return; }
    if (strcmp(param, "vibDelay") == 0)    { vs->vib_delay = v8; return; }
}

size_t fc_export(const FcModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
