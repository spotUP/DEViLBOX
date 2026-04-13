// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "soundfactory.h"

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

typedef enum SfOpcode {
    SF_OP_PAUSE           = 0x80,
    SF_OP_SET_VOLUME      = 0x81,
    SF_OP_SET_FINE_TUNE   = 0x82,
    SF_OP_USE_INSTRUMENT  = 0x83,
    SF_OP_DEFINE_INSTR    = 0x84,
    SF_OP_RETURN          = 0x85,
    SF_OP_GOSUB           = 0x86,
    SF_OP_GOTO            = 0x87,
    SF_OP_FOR             = 0x88,
    SF_OP_NEXT            = 0x89,
    SF_OP_FADE_OUT        = 0x8a,
    SF_OP_NOP             = 0x8b,
    SF_OP_REQUEST         = 0x8c,
    SF_OP_LOOP            = 0x8d,
    SF_OP_END             = 0x8e,
    SF_OP_FADE_IN         = 0x8f,
    SF_OP_SET_ADSR        = 0x90,
    SF_OP_ONE_SHOT        = 0x91,
    SF_OP_LOOPING         = 0x92,
    SF_OP_VIBRATO         = 0x93,
    SF_OP_ARPEGGIO        = 0x94,
    SF_OP_PHASING         = 0x95,
    SF_OP_PORTAMENTO      = 0x96,
    SF_OP_TREMOLO         = 0x97,
    SF_OP_FILTER          = 0x98,
    SF_OP_STOP_AND_PAUSE  = 0x99,
    SF_OP_LED             = 0x9a,
    SF_OP_WAIT_FOR_REQ    = 0x9b,
    SF_OP_SET_TRANSPOSE   = 0x9c
} SfOpcode;

typedef enum SfInstrFlag {
    SF_FLAG_NONE       = 0x00,
    SF_FLAG_ONE_SHOT   = 0x01,
    SF_FLAG_VIBRATO    = 0x02,
    SF_FLAG_ARPEGGIO   = 0x04,
    SF_FLAG_PHASING    = 0x08,
    SF_FLAG_PORTAMENTO = 0x10,
    SF_FLAG_RELEASE    = 0x20,
    SF_FLAG_TREMOLO    = 0x40,
    SF_FLAG_FILTER     = 0x80
} SfInstrFlag;

typedef enum SfEnvState {
    SF_ENV_ATTACK  = 0,
    SF_ENV_DECAY   = 1,
    SF_ENV_SUSTAIN = 2,
    SF_ENV_RELEASE = 3
} SfEnvState;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SfInstrument {
    int16_t instrument_number;
    uint16_t sample_length;
    uint16_t sampling_period;
    uint8_t effect_byte;  // SfInstrFlag
    uint8_t tremolo_speed;
    uint8_t tremolo_step;
    uint8_t tremolo_range;
    uint16_t portamento_step;
    uint8_t portamento_speed;
    uint8_t arpeggio_speed;
    uint8_t vibrato_delay;
    uint8_t vibrato_speed;
    int8_t vibrato_step;
    uint8_t vibrato_amount;
    uint8_t attack_time;
    uint8_t decay_time;
    uint8_t sustain_level;
    uint8_t release_time;
    uint8_t phasing_start;
    uint8_t phasing_end;
    uint8_t phasing_speed;
    int8_t phasing_step;
    uint8_t wave_count;
    uint8_t octave;
    uint8_t filter_frequency;
    uint8_t filter_end;
    uint8_t filter_speed;
    uint16_t dasr_sustain_offset;
    uint16_t dasr_release_offset;
    int8_t* sample_data;
} SfInstrument;

// The "default" instrument
static const SfInstrument sf_default_instrument_template = {
    .instrument_number = -1,
    .sample_length = 1,
    .sampling_period = 0,
    .effect_byte = SF_FLAG_NONE,
    .tremolo_speed = 0, .tremolo_step = 0, .tremolo_range = 0,
    .portamento_step = 0, .portamento_speed = 0,
    .arpeggio_speed = 0,
    .vibrato_delay = 0, .vibrato_speed = 0, .vibrato_step = 0, .vibrato_amount = 0,
    .attack_time = 1, .decay_time = 0, .sustain_level = 64, .release_time = 30,
    .phasing_start = 0, .phasing_end = 0, .phasing_speed = 0, .phasing_step = 0,
    .wave_count = 1, .octave = 0,
    .filter_frequency = 1, .filter_end = 50, .filter_speed = 2,
    .dasr_sustain_offset = 0, .dasr_release_offset = 0,
    .sample_data = nullptr

};
static int8_t sf_default_sample_data[2] = { 100, -100 };

#define SF_MAX_STACK 64

typedef struct SfVoiceInfo {
    int channel_number;
    bool voice_enabled;

    uint32_t start_position;
    uint32_t current_position;

    uint8_t current_instrument;

    uint16_t note_duration;
    uint16_t note_duration2;
    uint8_t note;
    int8_t transpose;

    uint8_t fine_tune;
    uint16_t period;

    uint8_t current_volume;
    uint8_t volume;

    uint16_t active_period;
    uint8_t portamento_counter;

    bool arpeggio_flag;
    uint8_t arpeggio_counter;

    uint8_t vibrato_delay;
    uint8_t vibrato_counter;
    uint8_t vibrato_counter2;
    int16_t vibrato_relative;
    int8_t vibrato_step;

    uint8_t tremolo_counter;
    int8_t tremolo_step;
    uint8_t tremolo_volume;

    SfEnvState envelope_state;
    uint8_t envelope_counter;

    uint8_t phasing_counter;
    int8_t phasing_step;
    int8_t phasing_relative;

    uint8_t filter_counter;
    int8_t filter_step;
    uint8_t filter_relative;

    uint32_t stack[SF_MAX_STACK];
    int stack_top;

    uint8_t note_start_flag;
    uint8_t note_start_flag1;

    int8_t phasing_buffer[256];
} SfVoiceInfo;

typedef struct SfSongInfo {
    uint8_t enabled_channels;
    uint32_t opcode_start_offsets[4];
} SfSongInfo;

typedef struct SfChannel {
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
} SfChannel;

// Instrument lookup — simple array indexed by offset
#define SF_MAX_INSTRUMENTS 256

struct SfModule {
    float sample_rate;

    // Original file data for export
    uint8_t* original_data;
    size_t original_size;
    SfSongInfo* song_infos;
    int num_songs;

    uint8_t* opcodes;
    uint32_t opcodes_length;

    // Original instruments (keyed by offset)
    SfInstrument original_instruments[SF_MAX_INSTRUMENTS];
    uint32_t original_instrument_offsets[SF_MAX_INSTRUMENTS];
    int num_original_instruments;

    // Playing state
    SfInstrument default_instrument;
    SfInstrument* sound_table[32]; // pointers into playing_instruments
    SfInstrument playing_instruments[SF_MAX_INSTRUMENTS];
    int num_playing_instruments;

    bool fade_out_flag;
    bool fade_in_flag;
    uint8_t fade_out_volume;
    uint8_t fade_out_counter;
    uint8_t fade_out_speed;
    uint8_t request_counter;

    SfVoiceInfo voices[4];
    SfChannel channels[4];

    SfSongInfo* current_song;
    bool has_ended;
    int ended_channels;

    float tick_accumulator;
    float ticks_per_frame;

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t sf_multiply_table[12] = {
    32768, 30929, 29193, 27555, 26008, 24549,
    23171, 21870, 20643, 19484, 18391, 17359

};

static const uint16_t sf_sample_table[12] = {
    54728, 51656, 48757, 46020, 43437, 40999,
    38698, 36526, 34476, 32541, 30715, 28964

};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stack helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_push(SfVoiceInfo* v, uint32_t val) {
    if (v->stack_top < SF_MAX_STACK)
        v->stack[v->stack_top++] = val;
}

static uint32_t sf_pop(SfVoiceInfo* v) {
    if (v->stack_top > 0) return v->stack[--v->stack_top];
    return 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_ch_mute(SfChannel* c) { c->active = false; }

static void sf_ch_play(SfChannel* c, int8_t* data, uint32_t start, uint32_t len) {
    c->sample_data = data; c->sample_offset = start;
    c->sample_length = start + len; c->loop_start = 0; c->loop_length = 0;
    c->position_fp = (uint64_t)start << SAMPLE_FRAC_BITS; c->active = true;
}

static void sf_ch_set_loop(SfChannel* c, uint32_t start, uint32_t len) {
    c->loop_start = start; c->loop_length = len; c->sample_length = start + len;
}

static void sf_ch_set_period(SfChannel* c, uint16_t p) { c->period = p; }
static void sf_ch_set_volume(SfChannel* c, uint16_t v) { if (v > 64) v = 64; c->volume = v; }

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Opcode reading helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint8_t sf_fetch_code(SfModule* m, SfVoiceInfo* v) {
    if (v->current_position >= m->opcodes_length) return 0;
    return m->opcodes[v->current_position++];
}

static uint16_t sf_fetch_word(SfModule* m, SfVoiceInfo* v) {
    uint8_t hi = sf_fetch_code(m, v);
    uint8_t lo = sf_fetch_code(m, v);
    return (uint16_t)((hi << 8) | lo);
}

static uint16_t sf_fetch_word_at(SfModule* m, uint32_t* offset) {
    uint16_t val = (uint16_t)((m->opcodes[*offset] << 8) | m->opcodes[*offset + 1]);
    *offset += 2;
    return val;
}

static int32_t sf_fetch_long_at(SfModule* m, uint32_t* offset) {
    int32_t val = ((int8_t)m->opcodes[*offset] << 24) | (m->opcodes[*offset+1] << 16) |
                  (m->opcodes[*offset+2] << 8) | m->opcodes[*offset+3];
    *offset += 4;
    return val;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Instrument lookup
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static SfInstrument* sf_get_instrument(SfModule* m, SfVoiceInfo* v) {
    return m->sound_table[v->current_instrument];
}

static int sf_find_original_instrument_index(SfModule* m, uint32_t offset) {
    for (int i = 0; i < m->num_original_instruments; i++) {
        if (m->original_instrument_offsets[i] == offset)
            return i;
    }
    return -1;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Period calculation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint16_t sf_calc_period_from_sampling(SfInstrument* instr, int octave, int note) {
    uint16_t mult = sf_multiply_table[note];
    int period = instr->sampling_period * mult / 32768;
    int cur_oct = instr->octave;

    while (cur_oct != octave) {
        if (cur_oct < octave) { period /= 2; cur_oct++; }
        else { period *= 2; cur_oct--; }
    }
    return (uint16_t)period;
}

static uint16_t sf_calc_period_multi_octave(SfInstrument* instr, int octave, int note) {
    uint32_t period = sf_sample_table[note];
    if (instr->wave_count != 1) period *= instr->wave_count;
    if (instr->sample_length != 1) period /= instr->sample_length;
    while (octave != 0) { period /= 2; octave--; }
    return (uint16_t)(period * 2);
}

static uint16_t sf_calc_period(SfVoiceInfo* v, SfInstrument* instr) {
    int octave = v->note / 12;
    int note = v->note % 12;
    if (instr->sampling_period != 0)
        return sf_calc_period_from_sampling(instr, octave, note);
    return sf_calc_period_multi_octave(instr, octave, note);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Phasing mix
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_mix(SfVoiceInfo* v, SfInstrument* instr) {
    uint16_t slen = (uint16_t)(instr->sample_length * 2);
    int8_t* sdata = instr->sample_data;
    int8_t* pbuf = v->phasing_buffer;

    int idx = slen - v->phasing_relative;

    for (int i = 0; i < slen; i++) {
        int16_t s1 = (idx >= slen) ? 0 : sdata[idx];
        int16_t s2 = sdata[i];
        pbuf[i] = (int8_t)((s1 + s2) / 2);
        idx++;
        if (idx == slen) idx = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Filter
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int16_t sf_average(int8_t* data, uint16_t slen, uint16_t offset, int16_t count) {
    int16_t sum = 0;
    for (int i = count; i > 0; i--) {
        sum += data[offset];
        offset++;
        if (offset == slen) offset = 0;
    }
    return (int16_t)(sum / count);
}

static void sf_filter(SfVoiceInfo* v, SfInstrument* instr) {
    uint16_t slen = (uint16_t)(instr->sample_length * 2);
    int8_t* sdata = instr->sample_data;
    int8_t* pbuf = v->phasing_buffer;

    if (instr->effect_byte & SF_FLAG_PHASING)
        sdata = pbuf;

    if (v->filter_relative == 1) {
        if (sdata != pbuf) {
            int to_copy = (slen == 256) ? 256 : slen + 4;
            if (to_copy > 256) to_copy = 256;
            memcpy(pbuf, sdata, to_copy);
        }
    } else {
        uint16_t sample_pos = (uint16_t)(v->filter_relative / 2);
        int16_t average = sf_average(sdata, slen, 0, v->filter_relative);
        bool finished = false;

        do {
            int16_t prev_avg = average;
            uint16_t pos = (uint16_t)((v->filter_relative / 2) + sample_pos);
            if (pos >= slen) pos -= slen;

            average = sf_average(sdata, slen, pos, v->filter_relative);

            int16_t diff = (int16_t)(average - prev_avg);
            int16_t step = 1;
            if (diff < 0) { step = -1; diff = (int16_t)-diff; }

            int16_t counter = 0;
            for (int i = v->filter_relative; i > 0; i--) {
                pbuf[sample_pos] = (int8_t)prev_avg;
                counter += diff;
                while (counter >= v->filter_relative) {
                    counter -= v->filter_relative;
                    prev_avg += step;
                }
                sample_pos++;
                if (sample_pos >= slen) {
                    sample_pos -= slen;
                    finished = true;
                }
            }
        } while (!finished);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InHardware
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_in_hardware(SfModule* m, SfVoiceInfo* v, SfChannel* ch, uint8_t flags) {
    uint16_t volume = v->current_volume;

    if ((flags & SF_FLAG_TREMOLO) && v->tremolo_volume != 0)
        volume = (uint16_t)((volume * v->tremolo_volume) / 256);

    if (v->volume != 0)
        volume = (uint16_t)((volume * v->volume) / 256);

    if ((m->fade_out_flag || m->fade_in_flag) && m->fade_out_volume != 0)
        volume = (uint16_t)((volume * m->fade_out_volume) / 256);

    sf_ch_set_volume(ch, volume);

    uint16_t period = (flags & SF_FLAG_PORTAMENTO) ? v->active_period : v->period;

    if ((flags & SF_FLAG_VIBRATO) && v->vibrato_delay == 0)
        period = (uint16_t)(period + v->vibrato_relative);

    if ((flags & SF_FLAG_ARPEGGIO) && v->arpeggio_flag)
        period /= 2;

    period += v->fine_tune;

    sf_ch_set_period(ch, period);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_play_tick(SfModule* m);
static void sf_play_voice(SfModule* m, SfVoiceInfo* v, SfChannel* ch);
static void sf_next_note(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr);
static void sf_modulator(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr);
static bool sf_new_note(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr, uint8_t note);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// HandleFade
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_handle_fade(SfModule* m) {
    if (m->fade_in_flag || m->fade_out_flag) {
        uint8_t new_fc = (uint8_t)(m->fade_out_counter + m->fade_out_speed);
        m->fade_out_counter = (uint8_t)(new_fc & 3);
        new_fc >>= 2;

        int fov = m->fade_out_volume;

        if (m->fade_in_flag) {
            fov += new_fc;
            if (fov >= 256) {
                m->fade_in_flag = false;
                m->fade_out_volume = 0;
            } else
                m->fade_out_volume = (uint8_t)fov;
        } else {
            if (fov == 0)
                fov -= new_fc;
            else {
                fov -= new_fc;
                if (fov <= 0) {
                    m->fade_out_flag = false;
                    m->fade_in_flag = false;
                    for (int i = 0; i < 4; i++) {
                        m->voices[i].voice_enabled = false;
                        sf_ch_mute(&m->channels[i]);
                    }
                    m->has_ended = true;
                    return;
                }
            }
            m->fade_out_volume = (uint8_t)fov;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// NewNote
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool sf_new_note(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr, uint8_t note) {
    v->note = (uint8_t)((note + v->transpose) & 127);

    uint8_t flags = instr->effect_byte;

    if (flags & SF_FLAG_PORTAMENTO) {
        v->active_period = v->period;
        v->portamento_counter = 1;
    }

    v->period = sf_calc_period(v, instr);

    uint16_t orig_dur = sf_fetch_word(m, v);
    uint16_t dur = (uint16_t)(orig_dur & 0x7fff);

    if (dur == 0) {
        sf_ch_mute(ch);
        return false;
    }

    v->note_duration = dur;
    v->note_duration2 = (uint16_t)(dur / 2);
    v->note_start_flag = 1;

    if (flags & SF_FLAG_ARPEGGIO) {
        v->arpeggio_flag = false;
        v->arpeggio_counter = instr->arpeggio_speed;
    }

    if (flags & SF_FLAG_VIBRATO) {
        v->vibrato_delay = instr->vibrato_delay;
        if (v->vibrato_delay == 0) {
            v->vibrato_step = instr->vibrato_step;
            v->vibrato_relative = 0;
            v->vibrato_counter = instr->vibrato_speed;
            v->vibrato_counter2 = instr->vibrato_amount;
        }
    }

    if (flags & SF_FLAG_TREMOLO) {
        v->tremolo_counter = 1;
        v->tremolo_step = (int8_t)(-instr->tremolo_step);
        v->tremolo_volume = 0;
    }

    if ((orig_dur & 0x8000) == 0) {
        v->envelope_counter = 0;
        if (instr->attack_time != 0) {
            v->current_volume = 0;
            v->envelope_state = SF_ENV_ATTACK;
        } else {
            if (instr->decay_time == 0 || instr->sustain_level == 64) {
                v->envelope_state = SF_ENV_SUSTAIN;
                v->current_volume = instr->sustain_level;
            } else {
                v->current_volume = 64;
                v->envelope_state = SF_ENV_DECAY;
            }
        }
    }

    int8_t* sdata;

    if (flags & SF_FLAG_PHASING) {
        v->phasing_counter = instr->phasing_speed;
        v->phasing_step = instr->phasing_step;
        v->phasing_relative = (int8_t)instr->phasing_start;
        sf_mix(v, instr);
        sdata = v->phasing_buffer;
    } else
        sdata = instr->sample_data;

    if (flags & SF_FLAG_FILTER) {
        v->filter_counter = instr->filter_speed;
        v->filter_relative = instr->filter_frequency;
        v->filter_step = 1;
        sf_filter(v, instr);
        sdata = v->phasing_buffer;
    }

    if (instr->dasr_sustain_offset != 0) {
        sf_ch_play(ch, sdata, 0, instr->dasr_release_offset * 2U);
        sf_ch_set_loop(ch, instr->dasr_sustain_offset * 2U,
                       ((uint32_t)instr->dasr_release_offset - instr->dasr_sustain_offset) * 2U);
    } else {
        sf_ch_play(ch, sdata, 0, instr->sample_length * 2U);
        if (!(flags & SF_FLAG_ONE_SHOT))
            sf_ch_set_loop(ch, 0, instr->sample_length * 2U);
    }

    sf_in_hardware(m, v, ch, flags);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Modulator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_modulator(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr) {
    uint8_t flags = instr->effect_byte;

    v->note_start_flag1 = v->note_start_flag;
    v->note_start_flag = 0;

    if (flags & SF_FLAG_TREMOLO) {
        v->tremolo_counter--;
        if (v->tremolo_counter == 0) {
            v->tremolo_counter = instr->tremolo_speed;
            v->tremolo_volume = (uint8_t)(v->tremolo_volume + v->tremolo_step);
            if (v->tremolo_volume <= instr->tremolo_range)
                v->tremolo_step = (int8_t)(-v->tremolo_step);
        }
    }

    if (flags & SF_FLAG_PORTAMENTO) {
        if (v->period != v->active_period) {
            v->portamento_counter--;
            if (v->portamento_counter == 0) {
                v->portamento_counter = instr->portamento_speed;
                if (v->period < v->active_period) {
                    v->active_period -= instr->portamento_step;
                    if (v->active_period < v->period)
                        v->active_period = v->period;
                } else {
                    v->active_period += instr->portamento_step;
                    if (v->active_period > v->period)
                        v->active_period = v->period;
                }
            }
        }
    }

    if (flags & SF_FLAG_ARPEGGIO) {
        v->arpeggio_counter--;
        if (v->arpeggio_counter == 0) {
            v->arpeggio_counter = instr->arpeggio_speed;
            v->arpeggio_flag = !v->arpeggio_flag;
        }
    }

    if (flags & SF_FLAG_VIBRATO) {
        if (v->vibrato_delay == 0) {
            v->vibrato_counter--;
            if (v->vibrato_counter == 0) {
                v->vibrato_counter = instr->vibrato_speed;
                v->vibrato_relative += v->vibrato_step;
                v->vibrato_counter2--;
                if (v->vibrato_counter2 == 0) {
                    v->vibrato_counter2 = (uint8_t)(instr->vibrato_amount * 2);
                    v->vibrato_step = (int8_t)(-v->vibrato_step);
                }
            }
        } else {
            v->vibrato_delay--;
            if (v->vibrato_delay == 0) {
                v->vibrato_counter = 1;
                v->vibrato_relative = 0;
                v->vibrato_step = instr->vibrato_step;
                v->vibrato_counter2 = instr->vibrato_amount;
            }
        }
    }

    // Envelope processing
    if (v->envelope_state == SF_ENV_RELEASE) {
        if (v->current_volume != 0) {
            v->envelope_counter += instr->sustain_level;
            for (;;) {
                if (v->envelope_counter < instr->release_time) break;
                v->envelope_counter -= instr->release_time;
                v->current_volume--;
                if (v->current_volume == 0) break;
            }
        }
    } else {
        bool do_release_skip = false;

        if (flags & SF_FLAG_RELEASE)
            do_release_skip = true;
        else {
            if (v->note_duration2 != 0)
                v->note_duration2--;
            if (v->note_duration2 == 0) {
                if (v->envelope_state != SF_ENV_SUSTAIN)
                    do_release_skip = true;
                else {
                    v->envelope_state = SF_ENV_RELEASE;
                    v->envelope_counter = 0;
                    if ((flags & SF_FLAG_ONE_SHOT) && instr->dasr_sustain_offset != 0) {
                        // SetSample for DASR release
                        // channel.SetSample(sustainOff*2, (releaseOff - sustainOff)*2)
                        v->note_start_flag = 2;
                    }
                }
            } else
                do_release_skip = true;
        }

        if (do_release_skip) {
            if (v->envelope_state == SF_ENV_DECAY) {
                v->envelope_counter += (uint8_t)(64 - instr->sustain_level);
                for (;;) {
                    if (v->envelope_counter < instr->decay_time) break;
                    v->envelope_counter -= instr->decay_time;
                    v->current_volume--;
                    if (v->current_volume == 0) break;
                }
                if (v->current_volume <= instr->sustain_level)
                    v->envelope_state = SF_ENV_SUSTAIN;
            } else if (v->envelope_state == SF_ENV_ATTACK) {
                uint8_t level = 64;
                if (instr->decay_time == 0) level = instr->sustain_level;
                v->envelope_counter += level;
                if (instr->attack_time != 0) {
                    while (v->envelope_counter >= instr->attack_time) {
                        v->envelope_counter -= instr->attack_time;
                        v->current_volume++;
                    }
                }
                if (v->current_volume == level) {
                    if (instr->decay_time == 0)
                        v->envelope_state = SF_ENV_SUSTAIN;
                    else {
                        v->envelope_counter = 0;
                        if (instr->sustain_level == 64)
                            v->envelope_state = SF_ENV_SUSTAIN;
                        else
                            v->envelope_state = SF_ENV_DECAY;
                    }
                }
            }
        }
    }

    bool mix_flag = false;

    if (flags & SF_FLAG_PHASING) {
        v->phasing_counter--;
        if (v->phasing_counter == 0) {
            v->phasing_counter = instr->phasing_speed;
            int16_t rel = (int16_t)(v->phasing_relative + v->phasing_step);
            v->phasing_relative = (int8_t)rel;
            if (rel < 0 || rel >= instr->phasing_end || rel <= instr->phasing_start)
                v->phasing_step = (int8_t)(-v->phasing_step);
            mix_flag = true;
        }
    }

    if (flags & SF_FLAG_FILTER) {
        v->filter_counter--;
        if (v->filter_counter == 0) {
            v->filter_counter = instr->filter_speed;
            v->filter_relative = (uint8_t)(v->filter_relative + v->filter_step);
            if (v->filter_relative == instr->filter_frequency || v->filter_relative == instr->filter_end)
                v->filter_step = (int8_t)(-v->filter_step);
            mix_flag = true;
        }
    }

    if (mix_flag) {
        if (flags & SF_FLAG_PHASING) sf_mix(v, instr);
        if (flags & SF_FLAG_FILTER) sf_filter(v, instr);
    }

    sf_in_hardware(m, v, ch, flags);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// NextNote (opcode interpreter)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_next_note(SfModule* m, SfVoiceInfo* v, SfChannel* ch, SfInstrument* instr) {
    uint8_t opcode;
    int safety = 10000;

    do {
        if (--safety <= 0) {
            v->voice_enabled = false;
            return;
        }
        opcode = sf_fetch_code(m, v);

        if ((opcode & 0x80) == 0) {
            opcode = sf_new_note(m, v, ch, instr, opcode) ? 0 : 1;
        } else {
            switch (opcode) {
                case SF_OP_PAUSE:
                    v->note_duration = sf_fetch_word(m, v);
                    break;

                case SF_OP_SET_VOLUME:
                    v->volume = sf_fetch_code(m, v);
                    break;

                case SF_OP_SET_FINE_TUNE:
                    v->fine_tune = sf_fetch_code(m, v);
                    break;

                case SF_OP_USE_INSTRUMENT:
                    v->current_instrument = sf_fetch_code(m, v);
                    instr = sf_get_instrument(m, v);
                    break;

                case SF_OP_DEFINE_INSTR: {
                    uint8_t inum = sf_fetch_code(m, v);
                    uint16_t ilen = sf_fetch_word(m, v);

                    int idx = sf_find_original_instrument_index(m, v->current_position);
                    if (idx >= 0)
                        m->sound_table[inum] = &m->playing_instruments[idx];

                    v->current_position += (ilen * 2U - 4);
                    break;
                }

                case SF_OP_RETURN:
                    v->current_position = (uint32_t)sf_pop(v);
                    break;

                case SF_OP_GOSUB: {
                    uint16_t hi = sf_fetch_word(m, v);
                    uint16_t lo = sf_fetch_word(m, v);
                    int32_t off = (int32_t)((hi << 16) | lo);
                    sf_push(v, v->current_position);
                    v->current_position = (uint32_t)((int32_t)v->current_position + off);
                    break;
                }

                case SF_OP_GOTO: {
                    uint16_t hi = sf_fetch_word(m, v);
                    uint16_t lo = sf_fetch_word(m, v);
                    int32_t off = (int32_t)((hi << 16) | lo);
                    v->current_position = (uint32_t)((int32_t)v->current_position + off);
                    // Check for infinite loop
                    break;
                }

                case SF_OP_FOR:
                    sf_push(v, sf_fetch_code(m, v));
                    sf_push(v, v->current_position);
                    break;

                case SF_OP_NEXT: {
                    uint32_t loop_pos = sf_pop(v);
                    uint8_t loop_count = (uint8_t)sf_pop(v);
                    loop_count--;
                    if (loop_count != 0) {
                        v->current_position = loop_pos;
                        sf_push(v, loop_count);
                        sf_push(v, loop_pos);
                    }
                    break;
                }

                case SF_OP_FADE_OUT:
                    m->fade_out_speed = sf_fetch_code(m, v);
                    m->fade_in_flag = false;
                    m->fade_out_counter = 0;
                    m->fade_out_flag = true;
                    break;

                case SF_OP_NOP:
                    break;

                case SF_OP_REQUEST:
                    m->request_counter++;
                    break;

                case SF_OP_LOOP:
                    v->current_position = v->start_position;
                    m->ended_channels |= (1 << v->channel_number);
                    opcode = 0;
                    break;

                case SF_OP_END:
                    sf_ch_mute(ch);
                    v->voice_enabled = false;
                    m->ended_channels |= (1 << v->channel_number);

                    if (!m->fade_out_flag)
                        m->has_ended = true;

                    opcode = 0;
                    break;

                case SF_OP_FADE_IN:
                    m->fade_out_speed = sf_fetch_code(m, v);
                    m->fade_in_flag = true;
                    if (m->fade_out_volume == 0) m->fade_out_volume = 1;
                    m->fade_out_counter = 0;
                    m->fade_out_flag = false;
                    break;

                case SF_OP_SET_ADSR:
                    instr->attack_time = sf_fetch_code(m, v);
                    instr->decay_time = sf_fetch_code(m, v);
                    instr->sustain_level = sf_fetch_code(m, v);
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte &= ~SF_FLAG_RELEASE;
                        instr->release_time = sf_fetch_code(m, v);
                    } else
                        instr->effect_byte |= SF_FLAG_RELEASE;
                    break;

                case SF_OP_ONE_SHOT:
                    instr->effect_byte |= SF_FLAG_ONE_SHOT;
                    break;

                case SF_OP_LOOPING:
                    instr->effect_byte &= ~SF_FLAG_ONE_SHOT;
                    break;

                case SF_OP_VIBRATO:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_VIBRATO;
                        instr->vibrato_delay = sf_fetch_code(m, v);
                        instr->vibrato_speed = sf_fetch_code(m, v);
                        instr->vibrato_step = (int8_t)sf_fetch_code(m, v);
                        instr->vibrato_amount = sf_fetch_code(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_VIBRATO;
                    break;

                case SF_OP_ARPEGGIO:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_ARPEGGIO;
                        instr->arpeggio_speed = sf_fetch_code(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_ARPEGGIO;
                    break;

                case SF_OP_PHASING:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_PHASING;
                        instr->phasing_start = sf_fetch_code(m, v);
                        instr->phasing_end = sf_fetch_code(m, v);
                        instr->phasing_speed = sf_fetch_code(m, v);
                        instr->phasing_step = (int8_t)sf_fetch_code(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_PHASING;
                    break;

                case SF_OP_PORTAMENTO:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_PORTAMENTO;
                        instr->portamento_speed = sf_fetch_code(m, v);
                        instr->portamento_step = sf_fetch_word(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_PORTAMENTO;
                    break;

                case SF_OP_TREMOLO:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_TREMOLO;
                        instr->tremolo_speed = sf_fetch_code(m, v);
                        instr->tremolo_step = sf_fetch_code(m, v);
                        instr->tremolo_range = sf_fetch_code(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_TREMOLO;
                    break;

                case SF_OP_FILTER:
                    if (sf_fetch_code(m, v) != 0) {
                        instr->effect_byte |= SF_FLAG_FILTER;
                        instr->filter_frequency = sf_fetch_code(m, v);
                        instr->filter_end = sf_fetch_code(m, v);
                        instr->filter_speed = sf_fetch_code(m, v);
                    } else
                        instr->effect_byte &= ~SF_FLAG_FILTER;
                    break;

                case SF_OP_STOP_AND_PAUSE:
                    v->note_duration = sf_fetch_word(m, v);
                    sf_ch_mute(ch);
                    opcode = 0;
                    break;

                case SF_OP_LED:
                    sf_fetch_code(m, v); // AmigaFilter - ignore
                    break;

                case SF_OP_WAIT_FOR_REQ: {
                    uint8_t val = sf_fetch_code(m, v);
                    if (val == m->request_counter) {
                        // continue
                    } else {
                        v->current_position -= 2;
                        v->note_duration = 1;
                        opcode = 0;
                    }
                    break;
                }

                case SF_OP_SET_TRANSPOSE:
                    v->transpose = (int8_t)sf_fetch_code(m, v);
                    break;

                default:
                    break;
            }
        }
    } while ((opcode & 0x7f) != 0);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayVoice
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_play_voice(SfModule* m, SfVoiceInfo* v, SfChannel* ch) {
    SfInstrument* instr = sf_get_instrument(m, v);

    v->note_duration--;

    if (v->note_duration == 0)
        sf_next_note(m, v, ch, instr);
    else
        sf_modulator(m, v, ch, instr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_play_tick(SfModule* m) {
    sf_handle_fade(m);

    // Take voices backward (matching C# original)
    for (int i = 3; i >= 0; i--) {
        SfVoiceInfo* v = &m->voices[i];
        SfChannel* ch = &m->channels[i];

        if (v->voice_enabled)
            sf_play_voice(m, v, ch);
        else
            m->ended_channels |= (1 << i);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FindSamples — scan opcodes to find DefineInstrument
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_parse_instrument_at(SfModule* m, uint32_t offset) {
    SfInstrument* instr = &m->original_instruments[m->num_original_instruments];
    memset(instr, 0, sizeof(SfInstrument));

    instr->sample_length = sf_fetch_word_at(m, &offset);
    instr->sampling_period = sf_fetch_word_at(m, &offset);
    instr->effect_byte = m->opcodes[offset++];

    instr->tremolo_speed = m->opcodes[offset++];
    instr->tremolo_step = m->opcodes[offset++];
    instr->tremolo_range = m->opcodes[offset++];

    instr->portamento_step = sf_fetch_word_at(m, &offset);
    instr->portamento_speed = m->opcodes[offset++];
    instr->arpeggio_speed = m->opcodes[offset++];

    instr->vibrato_delay = m->opcodes[offset++];
    instr->vibrato_speed = m->opcodes[offset++];
    instr->vibrato_step = (int8_t)m->opcodes[offset++];
    instr->vibrato_amount = m->opcodes[offset++];

    instr->attack_time = m->opcodes[offset++];
    instr->decay_time = m->opcodes[offset++];
    instr->sustain_level = m->opcodes[offset++];
    instr->release_time = m->opcodes[offset++];

    instr->phasing_start = m->opcodes[offset++];
    instr->phasing_end = m->opcodes[offset++];
    instr->phasing_speed = m->opcodes[offset++];
    instr->phasing_step = (int8_t)m->opcodes[offset++];

    instr->wave_count = m->opcodes[offset++];
    instr->octave = m->opcodes[offset++];

    instr->filter_frequency = m->opcodes[offset++];
    instr->filter_end = m->opcodes[offset++];
    instr->filter_speed = m->opcodes[offset++];
    offset++; // padding

    instr->dasr_sustain_offset = sf_fetch_word_at(m, &offset);
    instr->dasr_release_offset = sf_fetch_word_at(m, &offset);

    instr->sample_data = (int8_t*)malloc(instr->sample_length * 2);
    if (instr->sample_data)
        memcpy(instr->sample_data, m->opcodes + offset, instr->sample_length * 2);

    instr->instrument_number = (int16_t)m->num_original_instruments;
}

static void sf_find_samples_in_list(SfModule* m, uint32_t offset);

static void sf_find_samples(SfModule* m) {
    m->num_original_instruments = 0;

    for (int s = 0; s < m->num_songs; s++) {
        for (int i = 0; i < 4; i++)
            sf_find_samples_in_list(m, m->song_infos[s].opcode_start_offsets[i]);
    }
}

static void sf_find_samples_in_list(SfModule* m, uint32_t offset) {
    bool stop = false;
    // Track visited GOTO targets to detect loops
    uint32_t visited_gotos[256];
    int num_visited = 0;

    while (!stop && offset < m->opcodes_length) {
        uint8_t op = m->opcodes[offset++];
        uint32_t skip = 0;

        switch (op) {
            case SF_OP_NEXT: case SF_OP_NOP: case SF_OP_REQUEST:
            case SF_OP_ONE_SHOT: case SF_OP_LOOPING:
                skip = 0; break;

            case SF_OP_SET_VOLUME: case SF_OP_SET_FINE_TUNE: case SF_OP_USE_INSTRUMENT:
            case SF_OP_FOR: case SF_OP_FADE_OUT: case SF_OP_FADE_IN:
            case SF_OP_LED: case SF_OP_WAIT_FOR_REQ: case SF_OP_SET_TRANSPOSE:
                skip = 1; break;

            case SF_OP_PAUSE: case SF_OP_STOP_AND_PAUSE:
                skip = 2; break;

            case SF_OP_PORTAMENTO: case SF_OP_TREMOLO: case SF_OP_FILTER: {
                bool enable = m->opcodes[offset++] != 0;
                skip = enable ? 3 : 0;
                break;
            }

            case SF_OP_ARPEGGIO: {
                bool enable = m->opcodes[offset++] != 0;
                skip = enable ? 1 : 0;
                break;
            }

            case SF_OP_VIBRATO: case SF_OP_PHASING: {
                bool enable = m->opcodes[offset++] != 0;
                skip = enable ? 4 : 0;
                break;
            }

            case SF_OP_SET_ADSR: {
                skip = 0;
                offset += 3; // attack, decay, sustain
                bool rel = m->opcodes[offset++] != 0; // release flag
                if (rel) skip = 1; // optional releaseTime byte
                break;
            }

            case SF_OP_DEFINE_INSTR: {
                offset++; // instrument number
                uint16_t ilen = sf_fetch_word_at(m, &offset);

                if (m->num_original_instruments < SF_MAX_INSTRUMENTS) {
                    m->original_instrument_offsets[m->num_original_instruments] = offset;
                    sf_parse_instrument_at(m, offset);
                    m->num_original_instruments++;
                }

                skip = ilen * 2U - 4U;
                break;
            }

            case SF_OP_RETURN:
                skip = 0; stop = true; break;

            case SF_OP_GOSUB: {
                uint32_t tmp = offset;
                int32_t goff = sf_fetch_long_at(m, &tmp);
                sf_find_samples_in_list(m, (uint32_t)((int32_t)tmp + goff));
                offset = tmp;
                skip = 0;
                break;
            }

            case SF_OP_GOTO: {
                int32_t goff = sf_fetch_long_at(m, &offset);
                uint32_t target = (uint32_t)((int32_t)offset + goff);
                // Check if we already visited this target (loop detection)
                bool already_visited = false;
                for (int vi = 0; vi < num_visited; vi++) {
                    if (visited_gotos[vi] == target) { already_visited = true; break; }
                }
                if (already_visited || num_visited >= 256) {
                    stop = true;
                } else {
                    visited_gotos[num_visited++] = target;
                    offset = target;
                }
                skip = 0;
                break;
            }

            case SF_OP_LOOP: case SF_OP_END:
                skip = 0; stop = true; break;

            default:
                // Notes
                skip = 2; break;
        }

        offset += skip;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Initialize sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void sf_initialize_sound(SfModule* m, int sub_song) {
    m->current_song = &m->song_infos[sub_song];

    // Copy default instrument
    m->default_instrument = sf_default_instrument_template;
    m->default_instrument.sample_data = sf_default_sample_data;

    // Copy original instruments to playing state
    m->num_playing_instruments = m->num_original_instruments;
    for (int i = 0; i < m->num_original_instruments; i++)
        m->playing_instruments[i] = m->original_instruments[i];

    // Set default sound table
    for (int i = 0; i < 32; i++)
        m->sound_table[i] = &m->default_instrument;

    m->fade_out_flag = false;
    m->fade_in_flag = false;
    m->fade_out_volume = 0;
    m->fade_out_counter = 0;
    m->fade_out_speed = 0;
    m->request_counter = 0;

    m->has_ended = false;
    m->ended_channels = 0;

    for (int i = 0; i < 4; i++) {
        SfVoiceInfo* v = &m->voices[i];
        memset(v, 0, sizeof(SfVoiceInfo));

        v->channel_number = i;
        v->voice_enabled = (m->current_song->enabled_channels & (1 << i)) != 0;
        v->start_position = m->current_song->opcode_start_offsets[i];
        v->current_position = m->current_song->opcode_start_offsets[i];
        v->note_duration = 1;
        v->envelope_state = SF_ENV_ATTACK;

        memset(&m->channels[i], 0, sizeof(SfChannel));
    }

    // 50 Hz CIA timer
    m->ticks_per_frame = m->sample_rate / 50.0f;
    m->tick_accumulator = m->ticks_per_frame; // trigger first tick
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Load
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool sf_load(SfModule* m, const uint8_t* data, size_t size) {
    if (size < 276) return false;

    uint32_t pos = 0;
    uint32_t mod_length = ((uint32_t)data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
    pos = 4;

    if (mod_length > size) return false;

    // Read sub-songs
    int song_count = 0;
    SfSongInfo temp_songs[16];
    memset(temp_songs, 0, sizeof(temp_songs));

    for (int i = 0; i < 16; i++) {
        uint8_t channels = data[pos++];
        if (channels > 15) return false;
        if (channels != 0) {
            temp_songs[song_count].enabled_channels = channels;
            song_count++;
        }
    }

    if (song_count == 0) return false;

    // Read offsets — contiguous, one block per valid song (not per slot)
    pos = 20;
    for (int si = 0; si < song_count; si++) {
        for (int j = 0; j < 4; j++) {
            uint32_t off = ((uint32_t)data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
            temp_songs[si].opcode_start_offsets[j] = off - 276;
            pos += 4;
        }
    }

    m->num_songs = song_count;
    m->song_infos = (SfSongInfo*)malloc(song_count * sizeof(SfSongInfo));
    if (!m->song_infos) return false;
    memcpy(m->song_infos, temp_songs, song_count * sizeof(SfSongInfo));

    // Read opcodes
    m->opcodes_length = mod_length - 276;
    m->opcodes = (uint8_t*)malloc(m->opcodes_length);
    if (!m->opcodes) return false;
    if (276 + m->opcodes_length > size) return false;
    memcpy(m->opcodes, data + 276, m->opcodes_length);

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga mixing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t sf_render(SfModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0) return 0;

    float* out = interleaved_stereo;
    size_t written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;
        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            sf_play_tick(module);
        }

        float left = 0.0f, right = 0.0f;
        for (int ch = 0; ch < 4; ch++) {
            SfChannel* c = &module->channels[ch];
            if (!c->active || c->muted || c->period == 0 || !c->sample_data) continue;

            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            float sample = 0.0f;
            if (pos < c->sample_length) sample = (float)c->sample_data[pos] / 128.0f;
            sample *= (float)c->volume / 64.0f;

            if (ch == 0 || ch == 3) left += sample; else right += sample;

            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    while (new_pos >= c->sample_length) {
                        new_pos = c->loop_start + (new_pos - c->sample_length);
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
        written++;
    }
    return written;
}

size_t sf_render_multi(SfModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0) return 0;
    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t written = 0;

    for (size_t f = 0; f < frames; f++) {
        module->tick_accumulator += 1.0f;
        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            sf_play_tick(module);
        }
        for (int ch = 0; ch < 4; ch++) {
            SfChannel* c = &module->channels[ch];
            float sample = 0.0f;
            if (!c->active || c->muted || c->period == 0 || !c->sample_data) {
                if (ch_out[ch]) ch_out[ch][f] = 0.0f; continue;
            }
            double step = AMIGA_CLOCK / ((double)c->period * (double)module->sample_rate);
            uint32_t pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            if (pos < c->sample_length) sample = (float)c->sample_data[pos] / 128.0f;
            sample *= (float)c->volume / 64.0f;
            if (ch_out[ch]) ch_out[ch][f] = sample * 0.5f;

            c->position_fp += (uint64_t)(step * (double)(1 << SAMPLE_FRAC_BITS));
            uint32_t new_pos = (uint32_t)(c->position_fp >> SAMPLE_FRAC_BITS);
            if (new_pos >= c->sample_length) {
                if (c->loop_length > 0) {
                    while (new_pos >= c->sample_length) {
                        new_pos = c->loop_start + (new_pos - c->sample_length);
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
        written++;
    }
    return written;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

SfModule* sf_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 276) return nullptr;

    SfModule* m = (SfModule*)calloc(1, sizeof(SfModule));
    if (!m) return nullptr;
    m->sample_rate = sample_rate;

    // Keep original data for export
    m->original_data = (uint8_t*)malloc(size);
    if (m->original_data) { memcpy(m->original_data, data, size); m->original_size = size; }

    if (!sf_load(m, data, size)) { sf_destroy(m); return nullptr; }

    sf_find_samples(m);

    if (m->num_songs > 0)
        sf_initialize_sound(m, 0);

    return m;
}

void sf_destroy(SfModule* module) {
    if (!module) return;
    if (module->song_infos) free(module->song_infos);
    if (module->opcodes) free(module->opcodes);
    for (int i = 0; i < module->num_original_instruments; i++)
        if (module->original_instruments[i].sample_data)
            free(module->original_instruments[i].sample_data);
    if (module->original_data) free(module->original_data);
    free(module);
}

int sf_subsong_count(const SfModule* module) {
    if (!module) return 0;
    return module->num_songs;
}

bool sf_select_subsong(SfModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->num_songs) return false;
    sf_initialize_sound(module, subsong);
    return true;
}

int sf_channel_count(const SfModule* module) { (void)module; return 4; }

void sf_set_channel_mask(SfModule* module, uint32_t mask) {
    if (!module) return;
    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool sf_has_ended(const SfModule* module) {
    if (!module) return true;
    return module->has_ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Edit API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sf_get_instrument_count(const SfModule* module) {
    return module ? module->num_original_instruments : 0;
}

float sf_get_instrument_param(const SfModule* module, int inst, const char* param) {
    if (!module || inst < 0 || inst >= module->num_original_instruments || !param) return -1.0f;
    const SfInstrument* in = &module->original_instruments[inst];

    if (strcmp(param, "instrumentNumber") == 0)  return (float)in->instrument_number;
    if (strcmp(param, "sampleLength") == 0)      return (float)in->sample_length;
    if (strcmp(param, "samplingPeriod") == 0)     return (float)in->sampling_period;
    if (strcmp(param, "effectByte") == 0)         return (float)in->effect_byte;
    if (strcmp(param, "tremoloSpeed") == 0)       return (float)in->tremolo_speed;
    if (strcmp(param, "tremoloStep") == 0)        return (float)in->tremolo_step;
    if (strcmp(param, "tremoloRange") == 0)       return (float)in->tremolo_range;
    if (strcmp(param, "portamentoStep") == 0)     return (float)in->portamento_step;
    if (strcmp(param, "portamentoSpeed") == 0)    return (float)in->portamento_speed;
    if (strcmp(param, "arpeggioSpeed") == 0)      return (float)in->arpeggio_speed;
    if (strcmp(param, "vibratoDelay") == 0)       return (float)in->vibrato_delay;
    if (strcmp(param, "vibratoSpeed") == 0)       return (float)in->vibrato_speed;
    if (strcmp(param, "vibratoStep") == 0)        return (float)in->vibrato_step;
    if (strcmp(param, "vibratoAmount") == 0)      return (float)in->vibrato_amount;
    if (strcmp(param, "attackTime") == 0)         return (float)in->attack_time;
    if (strcmp(param, "decayTime") == 0)          return (float)in->decay_time;
    if (strcmp(param, "sustainLevel") == 0)       return (float)in->sustain_level;
    if (strcmp(param, "releaseTime") == 0)        return (float)in->release_time;
    if (strcmp(param, "phasingStart") == 0)       return (float)in->phasing_start;
    if (strcmp(param, "phasingEnd") == 0)         return (float)in->phasing_end;
    if (strcmp(param, "phasingSpeed") == 0)       return (float)in->phasing_speed;
    if (strcmp(param, "phasingStep") == 0)        return (float)in->phasing_step;
    if (strcmp(param, "waveCount") == 0)          return (float)in->wave_count;
    if (strcmp(param, "octave") == 0)             return (float)in->octave;
    if (strcmp(param, "filterFrequency") == 0)    return (float)in->filter_frequency;
    if (strcmp(param, "filterEnd") == 0)          return (float)in->filter_end;
    if (strcmp(param, "filterSpeed") == 0)        return (float)in->filter_speed;
    if (strcmp(param, "dasrSustainOffset") == 0)  return (float)in->dasr_sustain_offset;
    if (strcmp(param, "dasrReleaseOffset") == 0)  return (float)in->dasr_release_offset;

    return -1.0f;
}

void sf_set_instrument_param(SfModule* module, int inst, const char* param, float value) {
    if (!module || inst < 0 || inst >= module->num_original_instruments || !param) return;
    SfInstrument* in = &module->original_instruments[inst];
    uint8_t b = (uint8_t)value;
    uint16_t v = (uint16_t)value;

    if (strcmp(param, "sampleLength") == 0)      { in->sample_length = v; return; }
    if (strcmp(param, "samplingPeriod") == 0)     { in->sampling_period = v; return; }
    if (strcmp(param, "effectByte") == 0)         { in->effect_byte = b; return; }
    if (strcmp(param, "tremoloSpeed") == 0)       { in->tremolo_speed = b; return; }
    if (strcmp(param, "tremoloStep") == 0)        { in->tremolo_step = b; return; }
    if (strcmp(param, "tremoloRange") == 0)       { in->tremolo_range = b; return; }
    if (strcmp(param, "portamentoStep") == 0)     { in->portamento_step = v; return; }
    if (strcmp(param, "portamentoSpeed") == 0)    { in->portamento_speed = b; return; }
    if (strcmp(param, "arpeggioSpeed") == 0)      { in->arpeggio_speed = b; return; }
    if (strcmp(param, "vibratoDelay") == 0)       { in->vibrato_delay = b; return; }
    if (strcmp(param, "vibratoSpeed") == 0)       { in->vibrato_speed = b; return; }
    if (strcmp(param, "vibratoStep") == 0)        { in->vibrato_step = (int8_t)value; return; }
    if (strcmp(param, "vibratoAmount") == 0)      { in->vibrato_amount = b; return; }
    if (strcmp(param, "attackTime") == 0)         { in->attack_time = b; return; }
    if (strcmp(param, "decayTime") == 0)          { in->decay_time = b; return; }
    if (strcmp(param, "sustainLevel") == 0)       { in->sustain_level = b; return; }
    if (strcmp(param, "releaseTime") == 0)        { in->release_time = b; return; }
    if (strcmp(param, "phasingStart") == 0)       { in->phasing_start = b; return; }
    if (strcmp(param, "phasingEnd") == 0)         { in->phasing_end = b; return; }
    if (strcmp(param, "phasingSpeed") == 0)       { in->phasing_speed = b; return; }
    if (strcmp(param, "phasingStep") == 0)        { in->phasing_step = (int8_t)value; return; }
    if (strcmp(param, "waveCount") == 0)          { in->wave_count = b; return; }
    if (strcmp(param, "octave") == 0)             { in->octave = b; return; }
    if (strcmp(param, "filterFrequency") == 0)    { in->filter_frequency = b; return; }
    if (strcmp(param, "filterEnd") == 0)          { in->filter_end = b; return; }
    if (strcmp(param, "filterSpeed") == 0)        { in->filter_speed = b; return; }
    if (strcmp(param, "dasrSustainOffset") == 0)  { in->dasr_sustain_offset = v; return; }
    if (strcmp(param, "dasrReleaseOffset") == 0)  { in->dasr_release_offset = v; return; }
}

size_t sf_export(const SfModule* module, uint8_t* out, size_t max_size) {
    if (!module || !module->original_data) return 0;
    size_t total = module->original_size;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, module->original_data, total);
    return total;
}
