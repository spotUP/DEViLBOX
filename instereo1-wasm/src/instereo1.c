// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "instereo1.h"

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
#define AMIGA_CLOCK 3546895.0

#define ENVELOPE_GENERATOR_TABLE_LENGTH 128
#define ADSR_TABLE_LENGTH 256
#define ARPEGGIO_TABLE_LENGTH 16

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum Is1Effect {
    IS1_EFFECT_NONE = 0x0,
    IS1_EFFECT_SET_SLIDE_SPEED = 0x1,
    IS1_EFFECT_RESTART_ADSR = 0x2,
    IS1_EFFECT_RESTART_EGC = 0x3,
    IS1_EFFECT_SET_SLIDE_INCREMENT = 0x4,
    IS1_EFFECT_SET_VIBRATO_DELAY = 0x5,
    IS1_EFFECT_SET_VIBRATO_POSITION = 0x6,
    IS1_EFFECT_SET_VOLUME = 0x7,
    IS1_EFFECT_SKIP_NT = 0x8,
    IS1_EFFECT_SKIP_ST = 0x9,
    IS1_EFFECT_SET_TRACK_LEN = 0xA,
    IS1_EFFECT_SKIP_PORTAMENTO = 0xB,
    IS1_EFFECT_EFF_C = 0xC,
    IS1_EFFECT_EFF_D = 0xD,
    IS1_EFFECT_SET_FILTER = 0xE,
    IS1_EFFECT_SET_SPEED = 0xF
} Is1Effect;

typedef enum Is1EgcMode {
    IS1_EGC_OFF = 0,
    IS1_EGC_ONES = 1,
    IS1_EGC_REPEAT = 2
} Is1EgcMode;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t is1_periods[109] = {
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
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Is1SongInfo {
    uint8_t start_speed;
    uint8_t rows_per_track;
    uint16_t first_position;
    uint16_t last_position;
    uint16_t restart_position;
} Is1SongInfo;

typedef struct Is1SinglePositionInfo {
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;
} Is1SinglePositionInfo;

typedef struct Is1TrackLine {
    uint8_t note;
    uint8_t instrument;
    uint8_t arpeggio;
    Is1Effect effect;
    uint8_t effect_arg;
} Is1TrackLine;

typedef struct Is1Sample {
    int8_t* sample_addr;
    uint32_t length;
} Is1Sample;

typedef struct Is1Instrument {
    uint8_t waveform_number;
    bool synthesis_enabled;
    uint16_t waveform_length;
    uint16_t repeat_length;
    uint8_t volume;
    int8_t portamento_speed;
    bool adsr_enabled;
    uint8_t adsr_table_number;
    uint16_t adsr_table_length;
    bool portamento_enabled;
    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    uint8_t vibrato_level;
    uint8_t egc_offset;
    Is1EgcMode egc_mode;
    uint8_t egc_table_number;
    uint16_t egc_table_length;
} Is1Instrument;

typedef struct Is1VoiceInfo {
    // Position information
    uint16_t start_track_row;
    int8_t sound_transpose;
    int8_t note_transpose;

    // Track row information
    uint8_t note;
    uint8_t instrument;
    uint8_t arpeggio;
    Is1Effect effect;
    uint8_t effect_arg;

    uint8_t use_buffer;
    int8_t synth_sample1[256];
    int8_t synth_sample2[256];

    uint8_t transposed_note;
    uint8_t previous_transposed_note;

    uint8_t transposed_instrument;

    uint8_t current_volume;

    int8_t slide_speed;
    int16_t slide_increment;

    bool portamento_enabled;
    int8_t portamento_speed;
    int16_t portamento_speed_counter;

    uint8_t vibrato_delay;
    uint8_t vibrato_position;

    bool adsr_enabled;
    uint16_t adsr_position;

    Is1EgcMode egc_mode;
    uint16_t egc_position;
} Is1VoiceInfo;

// Mix channel state (IChannel equivalent)
typedef struct Is1MixChannel {
    bool active;
    bool muted;
    int8_t* sample_data;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t volume;       // 0-64 (Amiga range)
    uint32_t period;
    uint64_t position_fp;
    int16_t sample_number;
} Is1MixChannel;

struct Is1Module {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    Is1SongInfo* sub_songs;
    uint8_t num_sub_songs;

    Is1SinglePositionInfo** positions;   // [totalPositions][4]
    uint16_t total_positions;

    Is1TrackLine* track_lines;
    uint32_t total_track_rows;

    Is1Sample* samples;
    uint8_t num_samples;

    int8_t** waveforms;
    uint8_t num_waveforms;

    Is1Instrument* instruments;
    uint8_t num_instruments;

    uint8_t* eg_tables;
    uint8_t num_eg_tables;

    uint8_t* adsr_tables;
    uint8_t num_adsr_tables;

    uint8_t arpeggio_tables[16 * ARPEGGIO_TABLE_LENGTH];

    int8_t vibrato_table[256];

    Is1SongInfo* current_song_info;

    // Playing info
    uint8_t speed_counter;
    uint8_t current_speed;
    uint16_t song_position;
    uint8_t row_position;
    uint8_t rows_per_track;

    Is1VoiceInfo voices[4];
    Is1MixChannel mix_channels[4];

    bool has_ended;
    bool end_reached;

    // Position visited tracking
    uint8_t visited[256];

    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Is1Reader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} Is1Reader;

static void reader_init(Is1Reader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const Is1Reader* r) {
    return r->pos > r->size;
}

static void reader_seek(Is1Reader* r, size_t pos) {
    r->pos = pos;
}

static void reader_skip(Is1Reader* r, size_t n) {
    r->pos += n;
}

static uint8_t reader_read_uint8(Is1Reader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_read_int8(Is1Reader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(Is1Reader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static uint32_t reader_read_b_uint32(Is1Reader* r) {
    uint8_t b0 = reader_read_uint8(r);
    uint8_t b1 = reader_read_uint8(r);
    uint8_t b2 = reader_read_uint8(r);
    uint8_t b3 = reader_read_uint8(r);
    return (uint32_t)((b0 << 24) | (b1 << 16) | (b2 << 8) | b3);
}

static void reader_read_bytes(Is1Reader* r, uint8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_uint8(r);
}

static void reader_read_signed(Is1Reader* r, int8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_int8(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mix channel operations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void mix_play_sample(Is1MixChannel* mc, int16_t samp_num, int8_t* addr, uint32_t offset, uint32_t length) {
    mc->sample_data = addr + offset;
    mc->sample_length = length;
    mc->loop_start = 0;
    mc->loop_length = 0;
    mc->position_fp = 0;
    mc->active = true;
    mc->sample_number = samp_num;
}

static void mix_set_loop(Is1MixChannel* mc, uint32_t start, uint32_t length) {
    mc->loop_start = start;
    mc->loop_length = length;
}

static void mix_set_loop_with_addr(Is1MixChannel* mc, int8_t* addr, uint32_t start, uint32_t length) {
    mc->sample_data = addr;
    mc->loop_start = start;
    mc->loop_length = length;
    mc->sample_length = start + length;
}

static void mix_set_sample(Is1MixChannel* mc, int8_t* addr, uint32_t offset, uint32_t length) {
    // SetSample with address: change sample data without retrigger
    mc->sample_data = addr + offset;
    mc->sample_length = length;
}

static void mix_set_sample_number(Is1MixChannel* mc, int16_t num) {
    mc->sample_number = num;
}

static void mix_set_amiga_volume(Is1MixChannel* mc, uint16_t vol) {
    mc->volume = vol;
}

static void mix_set_amiga_period(Is1MixChannel* mc, uint32_t period) {
    mc->period = period;
}

static void mix_mute(Is1MixChannel* mc) {
    mc->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Position visited tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(Is1Module* m) {
    memset(m->visited, 0, sizeof(m->visited));
}

static void mark_position_visited(Is1Module* m, uint16_t pos) {
    if (pos < 256)
        m->visited[pos] = 1;
}

static bool has_position_been_visited(Is1Module* m, uint16_t pos) {
    if (pos < 256)
        return m->visited[pos] != 0;
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Build vibrato table (triangle)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void build_vibrato_table(Is1Module* m) {
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
// DoArpeggio
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct Is1PeriodInfo {
    uint16_t period;
    uint16_t previous_period;
} Is1PeriodInfo;

static Is1PeriodInfo do_arpeggio(Is1Module* m, Is1VoiceInfo* vi) {
    uint8_t note = vi->transposed_note;
    uint8_t prev_note = vi->previous_transposed_note;

    uint8_t arp_val = m->arpeggio_tables[vi->arpeggio * 16 + m->speed_counter];
    note += arp_val;
    prev_note += arp_val;

    uint16_t period = is1_periods[note];
    uint16_t previous_period = is1_periods[prev_note];

    Is1PeriodInfo info;
    info.period = period;
    info.previous_period = previous_period;
    return info;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoPortamento
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_portamento(Is1PeriodInfo* pi, Is1VoiceInfo* vi) {
    if (vi->portamento_enabled && (vi->portamento_speed_counter != 0) && (pi->period != pi->previous_period)) {
        vi->portamento_speed_counter--;

        // Swap period and previous_period
        uint16_t tmp = pi->period;
        pi->period = pi->previous_period;
        pi->previous_period = tmp;

        int new_period = (pi->period - pi->previous_period) * vi->portamento_speed_counter;

        if (vi->portamento_speed != 0)
            new_period /= vi->portamento_speed;

        new_period += pi->previous_period;
        pi->period = (uint16_t)new_period;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoVibrato
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool do_vibrato(Is1Module* m, Is1PeriodInfo* pi, Is1VoiceInfo* vi) {
    if (vi->vibrato_delay == 0) {
        if (vi->transposed_instrument == 0)
            return false;

        Is1Instrument* instr = &m->instruments[vi->transposed_instrument - 1];

        int8_t vib_val = m->vibrato_table[vi->vibrato_position];
        uint8_t vib_level = instr->vibrato_level;

        if (vib_val < 0) {
            if (vib_level != 0)
                pi->period -= (uint16_t)((-vib_val * 4) / vib_level);
        }
        else {
            if (vib_level != 0)
                pi->period += (uint16_t)((vib_val * 4) / vib_level);
            else
                pi->period = 0;
        }

        vi->vibrato_position += instr->vibrato_speed;
    }
    else
        vi->vibrato_delay--;

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoAdsr
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_adsr(Is1Module* m, Is1VoiceInfo* vi, Is1MixChannel* mc) {
    Is1Instrument* instr = &m->instruments[vi->transposed_instrument - 1];

    if (vi->adsr_enabled) {
        if (vi->adsr_position >= instr->adsr_table_length)
            vi->adsr_enabled = false;

        uint16_t adsr_val = m->adsr_tables[instr->adsr_table_number * ADSR_TABLE_LENGTH + vi->adsr_position];
        adsr_val++;

        uint16_t volume = instr->volume;
        volume = (uint16_t)((volume * adsr_val) / 128);
        if (volume > 64)
            volume = 64;

        mix_set_amiga_volume(mc, volume);

        vi->adsr_position++;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEnvelopeGeneratorCounter
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_egc(Is1Module* m, Is1VoiceInfo* vi, Is1MixChannel* mc) {
    if (vi->egc_mode != IS1_EGC_OFF) {
        Is1Instrument* instr = &m->instruments[vi->transposed_instrument - 1];

        int8_t* waveform = m->waveforms[instr->waveform_number];
        int8_t* synth_buf;

        vi->use_buffer ^= 1;

        if (vi->use_buffer == 0)
            synth_buf = vi->synth_sample2;
        else
            synth_buf = vi->synth_sample1;

        // SetSample with addr
        mix_set_sample(mc, synth_buf, 0, instr->waveform_length);
        // SetLoop with addr
        mix_set_loop_with_addr(mc, synth_buf, 0, instr->waveform_length);
        mix_set_sample_number(mc, (int16_t)(vi->transposed_instrument - 1));

        memcpy(synth_buf, waveform, instr->waveform_length);

        uint8_t egc_val = m->eg_tables[instr->egc_table_number * ENVELOPE_GENERATOR_TABLE_LENGTH + vi->egc_position];
        egc_val += instr->egc_offset;

        if (egc_val != 0) {
            for (int i = 0; i < egc_val; i++)
                synth_buf[i] = (int8_t)-synth_buf[i];
        }

        vi->egc_position++;

        if (vi->egc_position >= instr->egc_table_length) {
            if (vi->egc_mode == IS1_EGC_ONES)
                vi->egc_mode = IS1_EGC_OFF;
            else
                vi->egc_position = 0;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffects for a single voice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects(Is1Module* m, Is1VoiceInfo* vi, Is1MixChannel* mc) {
    Is1PeriodInfo pi = do_arpeggio(m, vi);
    do_portamento(&pi, vi);

    if (do_vibrato(m, &pi, vi)) {
        pi.period = (uint16_t)(pi.period + vi->slide_increment);

        mix_set_amiga_period(mc, pi.period);

        vi->slide_increment = (int16_t)(vi->slide_increment - vi->slide_speed);

        do_adsr(m, vi, mc);
    }

    do_egc(m, vi, mc);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffectsForAllVoices
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects_for_all_voices(Is1Module* m) {
    for (int i = 0; i < 4; i++)
        do_effects(m, &m->voices[i], &m->mix_channels[i]);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayRow — initialize channel for a single row
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_row(Is1Module* m, Is1VoiceInfo* vi, Is1MixChannel* mc) {
    vi->current_volume = 0;
    vi->slide_speed = 0;

    if (vi->effect != IS1_EFFECT_NONE) {
        switch (vi->effect) {
            case IS1_EFFECT_SET_SLIDE_SPEED:
                vi->slide_speed = (int8_t)vi->effect_arg;
                break;

            case IS1_EFFECT_RESTART_ADSR:
                vi->adsr_position = vi->effect_arg;
                vi->adsr_enabled = true;
                break;

            case IS1_EFFECT_RESTART_EGC:
                vi->egc_position = vi->effect_arg;
                vi->egc_mode = IS1_EGC_ONES;
                break;

            case IS1_EFFECT_SET_SLIDE_INCREMENT:
                vi->slide_increment = (int8_t)vi->effect_arg;
                break;

            case IS1_EFFECT_SET_VIBRATO_DELAY:
                vi->vibrato_delay = vi->effect_arg;
                vi->vibrato_position = 0;
                break;

            case IS1_EFFECT_SET_VIBRATO_POSITION:
                vi->vibrato_position = vi->effect_arg;
                break;

            case IS1_EFFECT_SET_VOLUME:
                vi->current_volume = (uint8_t)(vi->effect_arg & 0x3f);
                break;

            case IS1_EFFECT_SET_TRACK_LEN:
                if (vi->effect_arg <= 64)
                    m->rows_per_track = vi->effect_arg;
                break;

            // These effects do nothing in the replayer source
            case IS1_EFFECT_EFF_C:
            case IS1_EFFECT_EFF_D:
                break;

            case IS1_EFFECT_SET_FILTER:
                // AmigaFilter = voiceInfo.EffectArg == 0;
                // Not implemented in our C renderer
                break;

            case IS1_EFFECT_SET_SPEED:
                if ((vi->effect_arg > 0) && (vi->effect_arg <= 16))
                    m->current_speed = vi->effect_arg;
                break;

            default:
                break;
        }
    }

    uint8_t note = vi->note;
    if (note != 0) {
        if (note == 0x7f) {
            mix_mute(mc);
            vi->current_volume = 0;
            return;
        }

        if (vi->effect != IS1_EFFECT_SKIP_NT)
            note = (uint8_t)(note + vi->note_transpose);

        vi->previous_transposed_note = vi->transposed_note;
        vi->transposed_note = note;

        mix_set_amiga_period(mc, is1_periods[note]);

        uint8_t instr_num = vi->instrument;
        if (instr_num != 0) {
            if (vi->effect != IS1_EFFECT_SKIP_ST)
                instr_num = (uint8_t)(instr_num + vi->sound_transpose);

            vi->transposed_instrument = instr_num;

            Is1Instrument* instr = &m->instruments[instr_num - 1];

            vi->adsr_enabled = false;
            vi->adsr_position = 0;

            vi->vibrato_delay = 0;
            vi->vibrato_position = 0;

            vi->egc_mode = IS1_EGC_OFF;
            vi->egc_position = 0;

            vi->slide_increment = 0;

            vi->portamento_enabled = instr->portamento_enabled;

            vi->portamento_speed = instr->portamento_speed;
            vi->portamento_speed_counter = instr->portamento_speed;

            if (vi->effect == IS1_EFFECT_SKIP_PORTAMENTO) {
                vi->portamento_enabled = false;
                vi->portamento_speed = 0;
                vi->portamento_speed_counter = 0;
            }

            vi->vibrato_delay = instr->vibrato_delay;

            if (instr->adsr_enabled)
                vi->adsr_enabled = true;

            if (instr->synthesis_enabled) {
                int8_t* waveform = m->waveforms[instr->waveform_number];

                vi->use_buffer = 1;

                vi->egc_mode = instr->egc_mode;

                if (instr->egc_mode == IS1_EGC_OFF) {
                    uint16_t length = instr->waveform_length;
                    if (length > 256)
                        length = 256;

                    mix_play_sample(mc, instr_num, vi->synth_sample1, 0, length);
                    mix_set_loop(mc, 0, length);

                    memcpy(vi->synth_sample1, waveform, length);

                    if (instr->egc_offset != 0) {
                        for (int i = 0; i < instr->egc_offset; i++)
                            vi->synth_sample1[i] = (int8_t)-vi->synth_sample1[i];
                    }
                }

                vi->current_volume = instr->volume;
                mix_set_amiga_volume(mc, vi->current_volume);
            }
            else {
                uint8_t sample_num = (uint8_t)(instr->waveform_number & 0x3f);
                if (sample_num >= m->num_samples) {
                    mix_mute(mc);
                    return;
                }

                Is1Sample* sample = &m->samples[sample_num];

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

                uint32_t actual_length = play_length < sample->length ? play_length : sample->length;
                mix_play_sample(mc, sample_num, sample->sample_addr, 0, actual_length);

                if (loop_length != 0)
                    mix_set_loop(mc, loop_start, loop_length);

                mix_set_amiga_volume(mc, instr->volume);

                if (sample_num == 7)
                    vi->current_volume = (uint8_t)(vi->effect_arg & 0x3f);
                else
                    vi->current_volume = instr->volume;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// GetNextRow
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_next_row(Is1Module* m) {
    m->speed_counter = 0;

    if (m->row_position >= m->rows_per_track) {
        m->row_position = 0;

        if (m->song_position > m->current_song_info->last_position)
            m->song_position = m->current_song_info->restart_position;

        if (has_position_been_visited(m, m->song_position))
            m->end_reached = true;

        mark_position_visited(m, m->song_position);
        m->song_position++;

        Is1SinglePositionInfo* pos_row = m->positions[m->song_position - 1];

        for (int i = 0; i < 4; i++) {
            Is1SinglePositionInfo* pos_info = &pos_row[i];
            Is1VoiceInfo* vi = &m->voices[i];

            vi->start_track_row = pos_info->start_track_row;
            vi->sound_transpose = pos_info->sound_transpose;
            vi->note_transpose = pos_info->note_transpose;
        }
    }

    for (int i = 0; i < 4; i++) {
        Is1VoiceInfo* vi = &m->voices[i];

        int position = vi->start_track_row + m->row_position;
        Is1TrackLine* tl;
        Is1TrackLine empty_line;
        memset(&empty_line, 0, sizeof(Is1TrackLine));

        if (position < (int)m->total_track_rows + 64)
            tl = &m->track_lines[position];
        else
            tl = &empty_line;

        vi->note = tl->note;
        vi->instrument = tl->instrument;
        vi->arpeggio = tl->arpeggio;
        vi->effect = tl->effect;
        vi->effect_arg = tl->effect_arg;
    }

    for (int i = 0; i < 4; i++)
        play_row(m, &m->voices[i], &m->mix_channels[i]);

    m->row_position++;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(Is1Module* m) {
    m->speed_counter++;

    if (m->speed_counter >= m->current_speed)
        get_next_row(m);

    do_effects_for_all_voices(m);

    if (m->end_reached) {
        m->has_ended = true;
        m->end_reached = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(Is1Module* m, int sub_song) {
    m->current_song_info = &m->sub_songs[sub_song];

    m->speed_counter = m->current_song_info->start_speed;
    m->current_speed = m->current_song_info->start_speed;

    m->song_position = m->current_song_info->first_position;
    m->row_position = m->current_song_info->rows_per_track;
    m->rows_per_track = m->current_song_info->rows_per_track;

    for (int i = 0; i < 4; i++) {
        Is1VoiceInfo* vi = &m->voices[i];
        memset(vi, 0, sizeof(Is1VoiceInfo));

        vi->egc_mode = IS1_EGC_OFF;
    }

    m->end_reached = false;
    m->has_ended = false;

    clear_visited(m);

    // Reset mix channels
    for (int i = 0; i < 4; i++) {
        Is1MixChannel* mc = &m->mix_channels[i];
        memset(mc, 0, sizeof(Is1MixChannel));
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(Is1Module* m, const uint8_t* data, size_t size) {
    Is1Reader reader;
    reader_init(&reader, data, size);

    // Read meta data
    reader_seek(&reader, 8);

    uint16_t total_positions = reader_read_b_uint16(&reader);
    uint16_t total_track_rows = reader_read_b_uint16(&reader);

    reader_skip(&reader, 4);

    uint8_t num_samples = reader_read_uint8(&reader);
    uint8_t num_waveforms = reader_read_uint8(&reader);
    uint8_t num_instruments = reader_read_uint8(&reader);
    uint8_t num_sub_songs = reader_read_uint8(&reader);
    uint8_t num_eg_tables = reader_read_uint8(&reader);
    uint8_t num_adsr_tables = reader_read_uint8(&reader);

    if (reader_eof(&reader))
        return false;

    m->num_samples = num_samples;
    m->num_waveforms = num_waveforms;
    m->num_instruments = num_instruments;
    m->num_sub_songs = num_sub_songs;
    m->num_eg_tables = num_eg_tables;
    m->num_adsr_tables = num_adsr_tables;
    m->total_positions = total_positions;
    m->total_track_rows = total_track_rows;

    // Skip to past header text
    reader_skip(&reader, 14);  // skip remaining header

    // Read module name (28 bytes)
    reader_skip(&reader, 28);

    // Skip some text (140 bytes)
    reader_skip(&reader, 140);

    // Read sample information
    m->samples = (Is1Sample*)calloc(num_samples, sizeof(Is1Sample));
    if (!m->samples) return false;

    for (int i = 0; i < num_samples; i++) {
        reader_skip(&reader, 1);  // skip
        reader_skip(&reader, 23); // skip name

        if (reader_eof(&reader))
            return false;

        reader_skip(&reader, 4);  // skip more
    }

    for (int i = 0; i < num_samples; i++)
        m->samples[i].length = reader_read_b_uint32(&reader);

    if (reader_eof(&reader))
        return false;

    // Read envelope generator tables
    m->eg_tables = (uint8_t*)calloc(num_eg_tables * ENVELOPE_GENERATOR_TABLE_LENGTH, sizeof(uint8_t));
    if (!m->eg_tables && num_eg_tables > 0) return false;

    reader_read_bytes(&reader, m->eg_tables, num_eg_tables * ENVELOPE_GENERATOR_TABLE_LENGTH);

    if (reader_eof(&reader) && num_eg_tables > 0)
        return false;

    // Read ADSR tables
    m->adsr_tables = (uint8_t*)calloc(num_adsr_tables * ADSR_TABLE_LENGTH, sizeof(uint8_t));
    if (!m->adsr_tables && num_adsr_tables > 0) return false;

    reader_read_bytes(&reader, m->adsr_tables, num_adsr_tables * ADSR_TABLE_LENGTH);

    if (reader_eof(&reader) && num_adsr_tables > 0)
        return false;

    // Read instrument information
    m->instruments = (Is1Instrument*)calloc(num_instruments, sizeof(Is1Instrument));
    if (!m->instruments) return false;

    for (int i = 0; i < num_instruments; i++) {
        Is1Instrument* instr = &m->instruments[i];

        instr->waveform_number = reader_read_uint8(&reader);
        instr->synthesis_enabled = reader_read_uint8(&reader) != 0;
        instr->waveform_length = reader_read_b_uint16(&reader);
        instr->repeat_length = reader_read_b_uint16(&reader);
        instr->volume = reader_read_uint8(&reader);
        instr->portamento_speed = reader_read_int8(&reader);
        instr->adsr_enabled = reader_read_uint8(&reader) != 0;
        instr->adsr_table_number = reader_read_uint8(&reader);
        instr->adsr_table_length = reader_read_b_uint16(&reader);
        reader_skip(&reader, 2);
        instr->portamento_enabled = reader_read_uint8(&reader) != 0;
        reader_skip(&reader, 5);
        instr->vibrato_delay = reader_read_uint8(&reader);
        instr->vibrato_speed = reader_read_uint8(&reader);
        instr->vibrato_level = reader_read_uint8(&reader);
        instr->egc_offset = reader_read_uint8(&reader);
        instr->egc_mode = (Is1EgcMode)reader_read_uint8(&reader);
        instr->egc_table_number = reader_read_uint8(&reader);
        instr->egc_table_length = reader_read_b_uint16(&reader);

        if (reader_eof(&reader))
            return false;
    }

    // Read arpeggio tables (16 * 16 = 256 bytes)
    reader_read_bytes(&reader, m->arpeggio_tables, 16 * ARPEGGIO_TABLE_LENGTH);

    if (reader_eof(&reader))
        return false;

    // Read sub-song information
    m->sub_songs = (Is1SongInfo*)calloc(num_sub_songs, sizeof(Is1SongInfo));
    if (!m->sub_songs) return false;

    for (int i = 0; i < num_sub_songs; i++) {
        reader_skip(&reader, 4);

        Is1SongInfo* si = &m->sub_songs[i];
        si->start_speed = reader_read_uint8(&reader);
        si->rows_per_track = reader_read_uint8(&reader);
        si->first_position = reader_read_b_uint16(&reader);
        si->last_position = reader_read_b_uint16(&reader);
        si->restart_position = reader_read_b_uint16(&reader);

        if (reader_eof(&reader))
            return false;

        reader_skip(&reader, 2);
    }

    // Skip extra sub-song information (14 bytes)
    reader_skip(&reader, 14);

    // Read waveforms
    m->waveforms = (int8_t**)calloc(num_waveforms, sizeof(int8_t*));
    if (!m->waveforms) return false;

    for (int i = 0; i < num_waveforms; i++) {
        m->waveforms[i] = (int8_t*)calloc(256, sizeof(int8_t));
        if (!m->waveforms[i]) return false;

        reader_read_signed(&reader, m->waveforms[i], 256);

        if (reader_eof(&reader))
            return false;
    }

    // Read position information
    m->positions = (Is1SinglePositionInfo**)calloc(total_positions, sizeof(Is1SinglePositionInfo*));
    if (!m->positions) return false;

    for (int i = 0; i < total_positions; i++) {
        m->positions[i] = (Is1SinglePositionInfo*)calloc(4, sizeof(Is1SinglePositionInfo));
        if (!m->positions[i]) return false;

        for (int j = 0; j < 4; j++) {
            Is1SinglePositionInfo* sp = &m->positions[i][j];

            sp->start_track_row = reader_read_b_uint16(&reader);
            sp->sound_transpose = reader_read_int8(&reader);
            sp->note_transpose = reader_read_int8(&reader);
        }

        if (reader_eof(&reader))
            return false;
    }

    // Read track rows (+ 64 extra empty rows)
    uint32_t track_line_count = total_track_rows + 64;
    m->track_lines = (Is1TrackLine*)calloc(track_line_count, sizeof(Is1TrackLine));
    if (!m->track_lines) return false;

    for (uint32_t i = 0; i < track_line_count; i++) {
        Is1TrackLine* tl = &m->track_lines[i];

        uint8_t byt1 = reader_read_uint8(&reader);
        uint8_t byt2 = reader_read_uint8(&reader);
        uint8_t byt3 = reader_read_uint8(&reader);
        uint8_t byt4 = reader_read_uint8(&reader);

        tl->note = byt1;
        tl->instrument = byt2;
        tl->arpeggio = (uint8_t)((byt3 & 0xf0) >> 4);
        tl->effect = (Is1Effect)(byt3 & 0x0f);
        tl->effect_arg = byt4;

        if (reader_eof(&reader))
            return false;
    }

    // Read sample data
    for (int i = 0; i < num_samples; i++) {
        m->samples[i].sample_addr = (int8_t*)calloc(m->samples[i].length, sizeof(int8_t));
        if (!m->samples[i].sample_addr && m->samples[i].length > 0) return false;

        reader_read_signed(&reader, m->samples[i].sample_addr, m->samples[i].length);

        // Check if we read everything
        // (the C# version checks readBytes != length but we just check eof)
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render — stereo interleaved output
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t is1_render(Is1Module* module, float* interleaved_stereo, size_t frames) {
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
            Is1MixChannel* c = &module->mix_channels[ch];

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
                    while (new_pos >= c->sample_length) {
                        uint32_t overshoot = new_pos - c->sample_length;
                        new_pos = c->loop_start + overshoot;
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

        // Scale output
        *out++ = left * 0.5f;
        *out++ = right * 0.5f;
        frames_written++;
    }

    return frames_written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render multi — per-channel mono output
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t is1_render_multi(Is1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            Is1MixChannel* c = &module->mix_channels[ch];
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

Is1Module* is1_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 204)
        return nullptr;

    // Check the mark
    if (memcmp(data, "ISM!V1.2", 8) != 0)
        return nullptr;

    Is1Module* m = (Is1Module*)calloc(1, sizeof(Is1Module));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }
    m->ticks_per_frame = sample_rate / 50.0f;

    if (!load_module(m, data, size)) {
        is1_destroy(m);
        return nullptr;
    }

    build_vibrato_table(m);

    if (m->num_sub_songs > 0)
        initialize_sound(m, 0);

    return m;
}

void is1_destroy(Is1Module* module) {
    if (!module) return;

    if (module->sub_songs) free(module->sub_songs);

    if (module->positions) {
        for (int i = 0; i < module->total_positions; i++)
            free(module->positions[i]);
        free(module->positions);
    }

    if (module->track_lines) free(module->track_lines);

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

    if (module->instruments) free(module->instruments);
    if (module->eg_tables) free(module->eg_tables);
    if (module->adsr_tables) free(module->adsr_tables);

    if (module->original_data) free(module->original_data);
    free(module);
}

int is1_subsong_count(const Is1Module* module) {
    if (!module) return 0;
    return module->num_sub_songs;
}

bool is1_select_subsong(Is1Module* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_sub_songs)
        return false;

    initialize_sound(module, subsong);
    return true;
}

int is1_channel_count(const Is1Module* module) {
    (void)module;
    return 4;
}

void is1_set_channel_mask(Is1Module* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->mix_channels[i].muted = ((mask >> i) & 1) == 0;
}

bool is1_has_ended(const Is1Module* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int is1_get_instrument_count(const Is1Module* module) {
    // TODO: return actual instrument count from format-specific field
    (void)module;
    return 0;
}

size_t is1_export(const Is1Module* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
