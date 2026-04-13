// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "soundmon.h"

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

typedef enum SmModuleType {
    SM_TYPE_UNKNOWN = 0,
    SM_TYPE_SOUNDMON_11,
    SM_TYPE_SOUNDMON_22
} SmModuleType;

typedef enum SmOptional {
    SM_OPT_ARPEGGIO_ONCE    = 0x0,
    SM_OPT_SET_VOLUME       = 0x1,
    SM_OPT_SET_SPEED        = 0x2,
    SM_OPT_FILTER           = 0x3,
    SM_OPT_PORT_UP          = 0x4,
    SM_OPT_PORT_DOWN        = 0x5,
    SM_OPT_SET_REP_COUNT    = 0x6, // SoundMon 1.1
    SM_OPT_DBRA_REP_COUNT   = 0x7, // SoundMon 1.1
    SM_OPT_VIBRATO          = 0x6, // SoundMon 2.2
    SM_OPT_JUMP             = 0x7, // SoundMon 2.2
    SM_OPT_SET_AUTO_SLIDE   = 0x8,
    SM_OPT_SET_ARPEGGIO     = 0x9,
    SM_OPT_TRANSPOSE        = 0xa,
    SM_OPT_CHANGE_FX        = 0xb,
    SM_OPT_CHANGE_INVERSION = 0xd,
    SM_OPT_RESET_ADSR       = 0xe,
    SM_OPT_CHANGE_NOTE      = 0xf
} SmOptional;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t sm_periods[84] = {
    6848, 6464, 6080, 5760, 5440, 5120, 4832, 4576, 4320, 4064, 3840, 3616,
    3424, 3232, 3040, 2880, 2720, 2560, 2416, 2288, 2160, 2032, 1920, 1808,
    1712, 1616, 1520, 1440, 1360, 1280, 1208, 1144, 1080, 1016,  960,  904,
     856,  808,  760,  720,  680,  640,  604,  572,  540,  508,  480,  452,
     428,  404,  380,  360,  340,  320,  302,  286,  270,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     107,  101,   95,   90,   85,   80,   76,   72,   68,   64,   60,   57
};

static const int16_t sm_vibrato_table[8] = {
    0, 64, 128, 64, 0, -64, -128, -64
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SmSampleInstrument {
    char name[25];
    uint16_t length;
    uint16_t loop_start;
    uint16_t loop_length;
    uint16_t volume;
    int8_t*  adr;
} SmSampleInstrument;

typedef struct SmSynthInstrument {
    uint16_t volume;
    uint8_t  wave_table;
    uint16_t wave_length;
    uint8_t  adsr_control;
    uint8_t  adsr_table;
    uint16_t adsr_length;
    uint8_t  adsr_speed;
    uint8_t  lfo_control;
    uint8_t  lfo_table;
    uint8_t  lfo_depth;
    uint16_t lfo_length;
    uint8_t  lfo_delay;
    uint8_t  lfo_speed;
    uint8_t  eg_control;
    uint8_t  eg_table;
    uint16_t eg_length;
    uint8_t  eg_delay;
    uint8_t  eg_speed;
    uint8_t  fx_control;
    uint8_t  fx_speed;
    uint8_t  fx_delay;
    uint8_t  mod_control;
    uint8_t  mod_table;
    uint8_t  mod_speed;
    uint8_t  mod_delay;
    uint16_t mod_length;
} SmSynthInstrument;

typedef struct SmInstrument {
    bool is_synth;
    SmSampleInstrument sample;
    SmSynthInstrument  synth;
} SmInstrument;

typedef struct SmStep {
    uint16_t track_number;
    int8_t   sound_transpose;
    int8_t   transpose;
} SmStep;

typedef struct SmTrack {
    int8_t  note;
    uint8_t instrument;
    uint8_t optional;     // SmOptional value
    uint8_t optional_data;
} SmTrack;

typedef struct SmBpCurrent {
    bool     restart;
    bool     use_default_volume;
    bool     synth_mode;
    int      synth_offset;
    uint16_t period;
    uint8_t  volume;
    uint8_t  instrument;
    uint8_t  note;
    uint8_t  arp_value;
    int8_t   auto_slide;
    uint8_t  auto_arp;
    uint16_t eg_ptr;
    uint16_t lfo_ptr;
    uint16_t adsr_ptr;
    uint16_t mod_ptr;
    uint8_t  eg_count;
    uint8_t  lfo_count;
    uint8_t  adsr_count;
    uint8_t  mod_count;
    uint8_t  fx_count;
    uint8_t  old_eg_value;
    uint8_t  eg_control;
    uint8_t  lfo_control;
    uint8_t  adsr_control;
    uint8_t  mod_control;
    uint8_t  fx_control;
    int8_t   vibrato;
} SmBpCurrent;

typedef struct SmGlobalPlayingInfo {
    uint16_t bp_step;
    uint8_t  vib_index;
    uint8_t  arp_count;
    uint8_t  bp_count;
    uint8_t  bp_delay;
    int8_t   st;
    int8_t   tr;
    uint8_t  bp_pat_count;
    uint8_t  bp_rep_count;
    uint8_t  new_pos;
    bool     pos_flag;
    bool     first_repeat;
    int8_t*  wave_tables;
    int      wave_tables_size;
    int8_t   synth_buffer[4][32];
} SmGlobalPlayingInfo;

// Mixer channel state (maps IChannel calls)
typedef struct SmChannel {
    const int8_t* sample_data;
    uint32_t sample_length;
    uint32_t sample_offset;
    uint32_t loop_start;
    uint32_t loop_length;
    uint64_t position_fp;
    uint16_t period;
    uint16_t volume;       // 0-256
    bool     active;
    bool     muted;
    int16_t  sample_number;
} SmChannel;

// Position visited tracking for end detection
#define SM_MAX_POSITIONS 256
static uint8_t sm_visited[SM_MAX_POSITIONS];

struct SmModule {
    // Module data
    SmModuleType module_type;
    char   module_name[27];
    uint8_t wave_num;
    uint16_t step_num;
    uint16_t track_num;

    SmInstrument instruments[15];
    SmStep*  steps[4];       // steps[channel][step_index]
    SmTrack** tracks;        // tracks[track_index][row_index (0-15)]
    int8_t*  wave_tables;    // raw wave table data (waveNum * 64)

    // Playing state
    SmGlobalPlayingInfo playing_info;
    SmBpCurrent bp_current[4];
    bool end_reached;
    bool amiga_filter;

    // Mixer
    SmChannel channels[4];
    float sample_rate;
    float ticks_per_frame;
    float tick_accumulator;
    bool has_ended;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Big-endian reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct SmReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} SmReader;

static void reader_init(SmReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const SmReader* r) {
    // Match NostalgicPlayer EndOfStream: only true when a read overshot the end,
    // NOT when we're exactly at the end after a complete read.
    return r->pos > r->size;
}

static uint8_t read_u8(SmReader* r) {
    if (r->pos >= r->size) return 0;
    return r->data[r->pos++];
}

static int8_t read_i8(SmReader* r) {
    return (int8_t)read_u8(r);
}

static uint16_t read_b_u16(SmReader* r) {
    uint8_t hi = read_u8(r);
    uint8_t lo = read_u8(r);
    return (uint16_t)((hi << 8) | lo);
}

static void reader_skip(SmReader* r, size_t count) {
    r->pos += count;
    if (r->pos > r->size) r->pos = r->size;
}

static void read_string(SmReader* r, char* out, int max_len) {
    for (int i = 0; i < max_len; i++) {
        if (r->pos >= r->size) {
            out[i] = '\0';
            return;
        }
        out[i] = (char)r->data[r->pos++];
    }
    out[max_len] = '\0';
}

static void read_signed_bytes(SmReader* r, int8_t* out, int count) {
    for (int i = 0; i < count; i++) {
        out[i] = read_i8(r);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Position visited tracking
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void clear_visited(void) {
    memset(sm_visited, 0, sizeof(sm_visited));
}

static void mark_position_visited(uint16_t pos) {
    if (pos < SM_MAX_POSITIONS)
        sm_visited[pos] = 1;
}

static bool has_position_been_visited(uint16_t pos) {
    if (pos < SM_MAX_POSITIONS)
        return sm_visited[pos] != 0;
    return false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Channel helpers (maps IChannel interface calls to direct channel state)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void channel_play_sample(SmChannel* ch, int16_t sample_number, const int8_t* adr,
                                uint32_t start_offset, uint32_t length) {
    ch->sample_number = sample_number;
    ch->sample_data = adr;
    ch->sample_offset = start_offset;
    ch->sample_length = start_offset + length;
    ch->loop_start = 0;
    ch->loop_length = 0;
    ch->position_fp = (uint64_t)start_offset << SAMPLE_FRAC_BITS;
    ch->active = true;
}

static void channel_set_loop(SmChannel* ch, uint32_t start_offset, uint32_t length) {
    ch->loop_start = start_offset;
    ch->loop_length = length;
    ch->sample_length = start_offset + length;
}

static void channel_set_volume(SmChannel* ch, uint16_t vol) {
    ch->volume = vol;
}

static void channel_set_amiga_volume(SmChannel* ch, uint16_t vol) {
    // Amiga volume 0-64 -> internal 0-256
    ch->volume = (uint16_t)(vol * 4);
    if (ch->volume > 256) ch->volume = 256;
}

static void channel_set_amiga_period(SmChannel* ch, uint16_t period) {
    ch->period = period;
}

static void channel_mute(SmChannel* ch) {
    ch->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(SmModule* m, SmReader* r, SmModuleType type) {
    m->module_type = type;

    // Read module name (26 bytes)
    read_string(r, m->module_name, 26);

    // Skip the mark (3 bytes) - already consumed by identify
    reader_skip(r, 3);

    // Get number of waveforms
    m->wave_num = read_u8(r);

    // Get number of positions (steps)
    m->step_num = read_b_u16(r);

    if (reader_eof(r))
        return false;

    // Read instrument information
    for (int i = 0; i < 15; i++) {
        uint8_t first_byte = read_u8(r);

        if (first_byte == 0xff) {
            // Synth instrument
            SmSynthInstrument* si = &m->instruments[i].synth;
            m->instruments[i].is_synth = true;

            if (type == SM_TYPE_SOUNDMON_11) {
                si->wave_table   = read_u8(r);
                si->wave_length  = (uint16_t)(read_b_u16(r) * 2);
                si->adsr_control = read_u8(r);
                si->adsr_table   = read_u8(r);
                si->adsr_length  = read_b_u16(r);
                si->adsr_speed   = read_u8(r);
                si->lfo_control  = read_u8(r);
                si->lfo_table    = read_u8(r);
                si->lfo_depth    = read_u8(r);
                si->lfo_length   = read_b_u16(r);
                reader_skip(r, 1);
                si->lfo_delay    = read_u8(r);
                si->lfo_speed    = read_u8(r);
                si->eg_control   = read_u8(r);
                si->eg_table     = read_u8(r);
                reader_skip(r, 1);
                si->eg_length    = read_b_u16(r);
                reader_skip(r, 1);
                si->eg_delay     = read_u8(r);
                si->eg_speed     = read_u8(r);
                si->fx_control   = 0;
                si->fx_speed     = 1;
                si->fx_delay     = 0;
                si->mod_control  = 0;
                si->mod_table    = 0;
                si->mod_speed    = 1;
                si->mod_delay    = 0;
                si->volume       = read_u8(r);
                si->mod_length   = 0;
                reader_skip(r, 6);
            } else {
                si->wave_table   = read_u8(r);
                si->wave_length  = (uint16_t)(read_b_u16(r) * 2);
                si->adsr_control = read_u8(r);
                si->adsr_table   = read_u8(r);
                si->adsr_length  = read_b_u16(r);
                si->adsr_speed   = read_u8(r);
                si->lfo_control  = read_u8(r);
                si->lfo_table    = read_u8(r);
                si->lfo_depth    = read_u8(r);
                si->lfo_length   = read_b_u16(r);
                si->lfo_delay    = read_u8(r);
                si->lfo_speed    = read_u8(r);
                si->eg_control   = read_u8(r);
                si->eg_table     = read_u8(r);
                si->eg_length    = read_b_u16(r);
                si->eg_delay     = read_u8(r);
                si->eg_speed     = read_u8(r);
                si->fx_control   = read_u8(r);
                si->fx_speed     = read_u8(r);
                si->fx_delay     = read_u8(r);
                si->mod_control  = read_u8(r);
                si->mod_table    = read_u8(r);
                si->mod_speed    = read_u8(r);
                si->mod_delay    = read_u8(r);
                si->volume       = read_u8(r);
                si->mod_length   = read_b_u16(r);
            }

            if (si->volume > 64)
                si->volume = 64;
        } else {
            // Sample instrument
            SmSampleInstrument* si = &m->instruments[i].sample;
            m->instruments[i].is_synth = false;

            // Seek back 1 byte (the first byte is part of the name)
            r->pos--;

            read_string(r, si->name, 24);
            si->length     = (uint16_t)(read_b_u16(r) * 2);
            si->loop_start = read_b_u16(r);
            si->loop_length = (uint16_t)(read_b_u16(r) * 2);
            si->volume     = read_b_u16(r);
            si->adr        = nullptr;

            if (si->volume > 64)
                si->volume = 64;

            // Fix for Karate.bp
            if ((si->loop_start + si->loop_length) > si->length)
                si->loop_length = (uint16_t)(si->length - si->loop_start);
        }

        if (reader_eof(r))
            return false;
    }

    // Allocate step structures
    for (int i = 0; i < 4; i++) {
        m->steps[i] = (SmStep*)calloc(m->step_num, sizeof(SmStep));
        if (!m->steps[i]) return false;
    }

    // Read step data
    m->track_num = 0;

    for (int i = 0; i < m->step_num; i++) {
        for (int j = 0; j < 4; j++) {
            m->steps[j][i].track_number = read_b_u16(r);
            m->steps[j][i].sound_transpose = read_i8(r);
            m->steps[j][i].transpose = read_i8(r);

            if (m->steps[j][i].track_number > m->track_num)
                m->track_num = m->steps[j][i].track_number;
        }

        if (reader_eof(r))
            return false;
    }


    // Allocate tracks
    m->tracks = (SmTrack**)calloc(m->track_num, sizeof(SmTrack*));
    if (!m->tracks) return false;

    // Read tracks
    for (int i = 0; i < m->track_num; i++) {
        m->tracks[i] = (SmTrack*)calloc(16, sizeof(SmTrack));
        if (!m->tracks[i]) return false;

        for (int j = 0; j < 16; j++) {
            m->tracks[i][j].note = read_i8(r);
            uint8_t inst_byte = read_u8(r);
            m->tracks[i][j].optional = inst_byte & 0x0f;
            m->tracks[i][j].instrument = (inst_byte & 0xf0) >> 4;
            m->tracks[i][j].optional_data = read_u8(r);
        }

        if (reader_eof(r))
            return false;
    }


    // Allocate and read wave tables
    int wave_table_size = m->wave_num * 64;
    m->wave_tables = (int8_t*)calloc(wave_table_size, 1);
    if (!m->wave_tables) return false;

    read_signed_bytes(r, m->wave_tables, wave_table_size);

    if (reader_eof(r))
        return false;


    // Read samples
    for (int i = 0; i < 15; i++) {
        if (!m->instruments[i].is_synth) {
            SmSampleInstrument* si = &m->instruments[i].sample;
            if (si->length != 0) {
                si->adr = (int8_t*)malloc(si->length);
                if (!si->adr) return false;
                read_signed_bytes(r, si->adr, si->length);

                if (reader_eof(r))
                    return false;
            }
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// InitializeSound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void initialize_sound(SmModule* m, int start_position) {
    SmGlobalPlayingInfo* pi = &m->playing_info;

    pi->arp_count   = 1;
    pi->bp_count    = 1;
    pi->bp_delay    = 6;
    pi->bp_rep_count = 0;
    pi->vib_index   = 0;
    pi->bp_step     = (uint16_t)start_position;
    pi->bp_pat_count = 0;
    pi->st          = 0;
    pi->tr          = 0;
    pi->new_pos     = 0;
    pi->pos_flag    = false;
    pi->first_repeat = false;

    m->end_reached = false;
    m->has_ended = false;

    // Initialize BpCurrent for each channel
    for (int i = 0; i < 4; i++) {
        memset(&m->bp_current[i], 0, sizeof(SmBpCurrent));
        m->bp_current[i].synth_offset = -1;
    }

    // Initialize synth buffers
    for (int i = 0; i < 4; i++)
        memset(pi->synth_buffer[i], 0, 32);

    // Make a copy of wave tables
    int wave_table_size = m->wave_num * 64;
    if (pi->wave_tables) free(pi->wave_tables);
    pi->wave_tables = (int8_t*)malloc(wave_table_size);
    pi->wave_tables_size = wave_table_size;
    if (pi->wave_tables && m->wave_tables)
        memcpy(pi->wave_tables, m->wave_tables, wave_table_size);

    // Reset mixer channels
    for (int i = 0; i < 4; i++) {
        memset(&m->channels[i], 0, sizeof(SmChannel));
        m->channels[i].sample_number = -1;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Period to frequency helper (for info only, not used in mixer)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static inline int sm_max(int a, int b) { return a > b ? a : b; }
static inline int sm_min(int a, int b) { return a < b ? a : b; }

static uint16_t sm_lookup_period(int note) {
    int idx = sm_max(0, sm_min(note + 36 - 1, 83));
    return sm_periods[idx];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Forward declarations
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void bp_play(SmModule* m);
static void bp_next(SmModule* m);
static void play_it(SmModule* m, int voice);
static void do_optionals(SmModule* m, int voice, uint8_t optional, uint8_t optional_data);
static void do_effects(SmModule* m);
static void do_synths(SmModule* m);
static void do_adsr(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si);
static void do_lfo(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si);
static void do_eg(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si);
static void do_fx(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si);
static void do_mod(SmModule* m, SmBpCurrent* cur, SmSynthInstrument* si);
static void averaging(SmModule* m, int voice);
static void transform2(SmModule* m, int voice, int8_t delta);
static void transform3(SmModule* m, int voice, int8_t delta);
static void transform4(SmModule* m, int voice, int8_t delta);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// BpPlay — main player tick
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void bp_play(SmModule* m) {
    // First run the real-time effects
    do_effects(m);

    // Then do the synth voices
    do_synths(m);

    // At last, update the positions
    m->playing_info.bp_count--;
    if (m->playing_info.bp_count == 0) {
        m->playing_info.bp_count = m->playing_info.bp_delay;
        bp_next(m);

        for (int i = 0; i < 4; i++) {
            // Is the sound restarting?
            if (m->bp_current[i].restart) {
                // Copy temporary synth data back
                if (m->bp_current[i].synth_offset >= 0) {
                    memcpy(m->playing_info.wave_tables + m->bp_current[i].synth_offset,
                           m->playing_info.synth_buffer[i], 32);
                    m->bp_current[i].synth_offset = -1;
                }

                // Play the sounds
                play_it(m, i);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// BpNext — change pattern position and/or step position
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void bp_next(SmModule* m) {
    SmGlobalPlayingInfo* pi = &m->playing_info;

    for (int i = 0; i < 4; i++) {
        SmBpCurrent* cur = &m->bp_current[i];

        // Get the step information
        uint16_t track = m->steps[i][pi->bp_step].track_number;
        pi->st = m->steps[i][pi->bp_step].sound_transpose;
        pi->tr = m->steps[i][pi->bp_step].transpose;

        // Find the track
        SmTrack* cur_track = &m->tracks[track - 1][pi->bp_pat_count];

        // Is there any note?
        int8_t note = cur_track->note;
        if (note != 0) {
            // Stop the effects
            cur->auto_slide = 0;
            cur->auto_arp = 0;
            cur->vibrato = 0;

            // Find the note number and period
            if ((cur_track->optional != SM_OPT_TRANSPOSE) || ((cur_track->optional_data & 0xf0) == 0))
                note += pi->tr;

            cur->note = (uint8_t)note;
            cur->period = sm_lookup_period((int)note);
            cur->restart = false;

            // Should the voice be retrigged?
            if (cur_track->optional < SM_OPT_CHANGE_INVERSION) {
                cur->restart = true;
                cur->use_default_volume = true;
            }

            // Find the instrument
            uint8_t inst = cur_track->instrument;
            if (inst == 0)
                inst = cur->instrument;

            if ((inst != 0) && ((cur_track->optional != SM_OPT_TRANSPOSE) || ((cur_track->optional_data & 0x0f) == 0))) {
                inst += (uint8_t)pi->st;
                if ((inst < 1) || (inst > 15))
                    inst -= (uint8_t)pi->st;
            }

            if ((cur_track->optional < SM_OPT_CHANGE_INVERSION) && (!cur->synth_mode || (cur->instrument != inst)))
                cur->instrument = inst;
        }

        do_optionals(m, i, cur_track->optional, cur_track->optional_data);
    }

    // Change the position
    if (pi->pos_flag) {
        pi->bp_pat_count = 0;
        pi->bp_step = pi->new_pos;
    } else {
        // Next row in the pattern
        pi->bp_pat_count++;
        if (pi->bp_pat_count == 16) {
            // Done with the pattern, now go to the next step
            pi->pos_flag = true;
            pi->bp_pat_count = 0;
            pi->bp_step++;

            if (pi->bp_step == m->step_num) {
                // Done with the module, repeat it
                pi->bp_step = 0;
            }
        }
    }

    if (pi->pos_flag) {
        if ((pi->bp_rep_count == 0) || pi->first_repeat) {
            if (has_position_been_visited(pi->bp_step))
                m->end_reached = true;

            mark_position_visited(pi->bp_step);
        }

        pi->pos_flag = false;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PlayIt — retrigs a sample or synth sound
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_it(SmModule* m, int voice) {
    SmBpCurrent* cur = &m->bp_current[voice];
    SmChannel* ch = &m->channels[voice];
    SmGlobalPlayingInfo* pi = &m->playing_info;

    // Reset the retrig flag
    cur->restart = false;
    channel_set_amiga_period(ch, cur->period);

    // Get the instrument address
    if (cur->instrument != 0) {
        SmInstrument* inst = &m->instruments[cur->instrument - 1];

        // Is the instrument a synth?
        if (inst->is_synth) {
            SmSynthInstrument* si = &inst->synth;

            // Yes it is
            cur->synth_mode = true;
            cur->eg_ptr   = 0;
            cur->lfo_ptr  = 0;
            cur->adsr_ptr = 0;
            cur->mod_ptr  = 0;

            cur->eg_count   = (uint8_t)(si->eg_delay + 1);
            cur->lfo_count  = (uint8_t)(si->lfo_delay + 1);
            cur->adsr_count = 1; // Start immediate
            cur->mod_count  = (uint8_t)(si->mod_delay + 1);
            cur->fx_count   = (uint8_t)(si->fx_delay + 1);

            cur->fx_control   = si->fx_control;
            cur->eg_control   = si->eg_control;
            cur->lfo_control  = si->lfo_control;
            cur->adsr_control = si->adsr_control;
            cur->mod_control  = si->mod_control;
            cur->old_eg_value = 0;

            // Play the synth sound
            int wave_offset = si->wave_table * 64;
            channel_play_sample(ch, (int16_t)(cur->instrument - 1),
                                pi->wave_tables, (uint32_t)wave_offset, si->wave_length);
            channel_set_loop(ch, (uint32_t)wave_offset, si->wave_length);

            // Initialize ADSR
            if (cur->adsr_control != 0) {
                // Get table value
                int tmp = (pi->wave_tables[si->adsr_table * 64] + 128) / 4;

                if (cur->use_default_volume) {
                    cur->volume = (uint8_t)si->volume;
                    cur->use_default_volume = false;
                }

                tmp = tmp * cur->volume / 16;
                channel_set_volume(ch, (uint16_t)(tmp > 256 ? 256 : tmp));
            } else {
                int tmp = (cur->use_default_volume ? (int)si->volume : (int)cur->volume) * 4;
                channel_set_volume(ch, (uint16_t)(tmp > 256 ? 256 : tmp));
            }

            // Initialize the other effects
            if ((cur->eg_control != 0) || (cur->mod_control != 0) || (cur->fx_control != 0)) {
                cur->synth_offset = wave_offset;
                memcpy(pi->synth_buffer[voice], pi->wave_tables + wave_offset, 32);
            }
        } else {
            // No, it is a sample
            SmSampleInstrument* si = &inst->sample;

            cur->synth_mode = false;
            cur->lfo_control = 0;

            if (si->adr == nullptr) {
                channel_mute(ch);
            } else {
                // Play the sample
                channel_play_sample(ch, (int16_t)(cur->instrument - 1),
                                    si->adr, 0, si->length);

                // Set the loop if any
                if (si->loop_length > 2)
                    channel_set_loop(ch, si->loop_start, si->loop_length);

                // Set the volume
                int tmp = (cur->use_default_volume ? (int)si->volume : (int)cur->volume) * 4;
                channel_set_volume(ch, (uint16_t)(tmp > 256 ? 256 : tmp));
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoOptionals — parse track optionals
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_optionals(SmModule* m, int voice, uint8_t optional, uint8_t optional_data) {
    SmBpCurrent* cur = &m->bp_current[voice];
    SmChannel* ch = &m->channels[voice];
    SmGlobalPlayingInfo* pi = &m->playing_info;

    switch (optional) {
        // Arpeggio once
        case SM_OPT_ARPEGGIO_ONCE: {
            cur->arp_value = optional_data;
            break;
        }

        // Set volume
        case SM_OPT_SET_VOLUME: {
            if (optional_data > 64)
                optional_data = 64;

            cur->volume = optional_data;
            cur->use_default_volume = false;

            if (m->module_type == SM_TYPE_SOUNDMON_11) {
                channel_set_amiga_volume(ch, optional_data);
            } else {
                if (!cur->synth_mode)
                    channel_set_amiga_volume(ch, optional_data);
            }
            break;
        }

        // Set speed
        case SM_OPT_SET_SPEED: {
            pi->bp_count = optional_data;
            pi->bp_delay = optional_data;
            break;
        }

        // Filter control
        case SM_OPT_FILTER: {
            m->amiga_filter = (optional_data != 0);
            break;
        }

        // Period lift up
        case SM_OPT_PORT_UP: {
            cur->period -= optional_data;
            cur->arp_value = 0;
            break;
        }

        // Period lift down
        case SM_OPT_PORT_DOWN: {
            cur->period += optional_data;
            cur->arp_value = 0;
            break;
        }

        // Set repeat count (SM 1.1) / Vibrato (SM 2.2)
        // Both are value 0x6
        case SM_OPT_VIBRATO: {
            if (m->module_type == SM_TYPE_SOUNDMON_11) {
                if (pi->bp_rep_count == 0) {
                    pi->bp_rep_count = optional_data;

                    if (pi->bp_rep_count != 0)
                        pi->first_repeat = true;
                }
            } else {
                cur->vibrato = (int8_t)optional_data;
            }
            break;
        }

        // DBRA repeat count (SM 1.1) / Jump to step (SM 2.2)
        // Both are value 0x7
        case SM_OPT_JUMP: {
            if (m->module_type == SM_TYPE_SOUNDMON_11) {
                if (pi->bp_rep_count != 0) {
                    pi->first_repeat = false;

                    pi->bp_rep_count--;
                    if (pi->bp_rep_count != 0) {
                        pi->new_pos = optional_data;
                        pi->pos_flag = true;

                        // Set the "end" mark, if we have to repeat the block a lot
                        if ((pi->bp_rep_count == 254) || ((pi->bp_rep_count >= 15) && (pi->new_pos < pi->bp_step)))
                            m->end_reached = true;
                    }
                }
            } else {
                // SoundMon 2.2
                pi->new_pos = optional_data;
                pi->pos_flag = true;
            }
            break;
        }

        // Set auto slide
        case SM_OPT_SET_AUTO_SLIDE: {
            cur->auto_slide = (int8_t)optional_data;
            break;
        }

        // Set continuous arpeggio
        case SM_OPT_SET_ARPEGGIO: {
            cur->auto_arp = optional_data;

            if (m->module_type == SM_TYPE_SOUNDMON_22) {
                cur->adsr_ptr = 0;

                if (cur->adsr_control == 0)
                    cur->adsr_control = 1;
            }
            break;
        }

        // Transpose (0xa) -- handled via note modification in BpNext, no separate action
        case SM_OPT_TRANSPOSE: {
            break;
        }

        // Change fx type
        case SM_OPT_CHANGE_FX: {
            cur->fx_control = optional_data;
            break;
        }

        // Changes from inversion to backward inversion (or vice versa)
        case SM_OPT_CHANGE_INVERSION: {
            cur->auto_arp = optional_data;
            cur->fx_control = (uint8_t)(cur->fx_control ^ 1);
            cur->adsr_ptr = 0;

            if (cur->adsr_control == 0)
                cur->adsr_control = 1;

            break;
        }

        // Reset ADSR on synth sound
        case SM_OPT_RESET_ADSR: {
            cur->auto_arp = optional_data;
            cur->adsr_ptr = 0;

            if (cur->adsr_control == 0)
                cur->adsr_control = 1;

            break;
        }

        // Change note (does not reset ADSR)
        case SM_OPT_CHANGE_NOTE: {
            cur->auto_arp = optional_data;
            break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEffects — real-time effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effects(SmModule* m) {
    SmGlobalPlayingInfo* pi = &m->playing_info;

    // Adjust the arpeggio counter
    pi->arp_count = (uint8_t)((pi->arp_count - 1) & 3);

    // Adjust the vibrato table index
    pi->vib_index = (uint8_t)((pi->vib_index + 1) & 7);

    for (int i = 0; i < 4; i++) {
        SmBpCurrent* cur = &m->bp_current[i];
        SmChannel* ch = &m->channels[i];

        // Auto slide
        cur->period = (uint16_t)(cur->period + cur->auto_slide);

        // Vibrato
        if (cur->vibrato != 0)
            channel_set_amiga_period(ch, (uint16_t)(cur->period + sm_vibrato_table[pi->vib_index] / cur->vibrato));
        else
            channel_set_amiga_period(ch, cur->period);

        // Arpeggio
        if ((cur->arp_value != 0) || (cur->auto_arp != 0)) {
            int note = (int8_t)cur->note;

            if (pi->arp_count == 0)
                note += ((cur->arp_value & 0xf0) >> 4) + ((cur->auto_arp & 0xf0) >> 4);
            else {
                if (pi->arp_count == 1)
                    note += (cur->arp_value & 0x0f) + (cur->auto_arp & 0x0f);
            }

            // Find the period
            cur->restart = false;
            cur->period = sm_lookup_period(note);
            channel_set_amiga_period(ch, cur->period);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoSynths — synth effect processing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_synths(SmModule* m) {
    for (int i = 0; i < 4; i++) {
        SmBpCurrent* cur = &m->bp_current[i];

        // Does the current voice play a synth sample?
        if (cur->synth_mode) {
            // Get the instrument
            if (cur->instrument != 0 && m->instruments[cur->instrument - 1].is_synth) {
                SmSynthInstrument* si = &m->instruments[cur->instrument - 1].synth;

                do_adsr(m, i, cur, si);
                do_lfo(m, i, cur, si);

                // Do we have a synth buffer?
                if (cur->synth_offset >= 0) {
                    do_eg(m, i, cur, si);
                    do_fx(m, i, cur, si);
                    do_mod(m, cur, si);
                }
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoAdsr — ADSR envelope
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_adsr(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si) {
    if (cur->adsr_control != 0) {
        cur->adsr_count--;
        if (cur->adsr_count == 0) {
            // Reset counter
            cur->adsr_count = si->adsr_speed;

            // Calculate new volume
            int table_value = (((m->playing_info.wave_tables[si->adsr_table * 64 + cur->adsr_ptr] + 128) / 4) * cur->volume) / 16;
            channel_set_volume(&m->channels[voice], (uint16_t)(table_value > 256 ? 256 : table_value));

            // Update the ADSR pointer
            cur->adsr_ptr++;
            if (cur->adsr_ptr == si->adsr_length) {
                cur->adsr_ptr = 0;

                // Only do the ADSR once?
                if (cur->adsr_control == 1)
                    cur->adsr_control = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoLfo — LFO effect
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_lfo(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si) {
    if (cur->lfo_control != 0) {
        cur->lfo_count--;
        if (cur->lfo_count == 0) {
            // Reset counter
            cur->lfo_count = si->lfo_speed;

            // Get the wave table value
            int table_value = m->playing_info.wave_tables[si->lfo_table * 64 + cur->lfo_ptr];

            // Adjust the value by the LFO depth
            if (si->lfo_depth != 0)
                table_value /= si->lfo_depth;

            // Calculate and set the new period
            channel_set_amiga_period(&m->channels[voice], (uint16_t)(cur->period + table_value));

            // Update the LFO pointer
            cur->lfo_ptr++;
            if (cur->lfo_ptr == si->lfo_length) {
                cur->lfo_ptr = 0;

                // Only do the LFO once?
                if (cur->lfo_control == 1)
                    cur->lfo_control = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoEg — envelope generator
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_eg(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si) {
    if (cur->eg_control != 0) {
        cur->eg_count--;
        if (cur->eg_count == 0) {
            // Reset counter
            cur->eg_count = si->eg_speed;

            // Calculate new EG value
            int table_value = cur->old_eg_value;
            cur->old_eg_value = (uint8_t)((m->playing_info.wave_tables[si->eg_table * 64 + cur->eg_ptr] + 128) / 8);

            // Do we need to do the EG thing at all?
            if (cur->old_eg_value != (uint8_t)table_value) {
                // Find the source and destination offset
                int8_t* source = m->playing_info.synth_buffer[voice];
                int source_offset = table_value;
                int dest_offset = cur->synth_offset + table_value;

                if (cur->old_eg_value < (uint8_t)table_value) {
                    table_value = table_value - cur->old_eg_value;

                    for (int j = 0; j < table_value; j++)
                        m->playing_info.wave_tables[--dest_offset] = source[--source_offset];
                } else {
                    table_value = cur->old_eg_value - table_value;

                    for (int j = 0; j < table_value; j++)
                        m->playing_info.wave_tables[dest_offset++] = (int8_t)-source[source_offset++];
                }
            }

            // Update the EG pointer
            cur->eg_ptr++;
            if (cur->eg_ptr == si->eg_length) {
                cur->eg_ptr = 0;

                // Only do the EG once?
                if (cur->eg_control == 1)
                    cur->eg_control = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoFx — synth effects
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_fx(SmModule* m, int voice, SmBpCurrent* cur, SmSynthInstrument* si) {
    switch (cur->fx_control) {
        case 1: {
            cur->fx_count--;
            if (cur->fx_control == 0) {
                // Reset counter
                cur->fx_count = si->fx_speed;
                averaging(m, voice);
            }
            break;
        }

        case 2: {
            transform2(m, voice, (int8_t)si->fx_speed);
            break;
        }

        case 3:
        case 5: {
            transform3(m, voice, (int8_t)si->fx_speed);
            break;
        }

        case 4: {
            transform4(m, voice, (int8_t)si->fx_speed);
            break;
        }

        case 6: {
            cur->fx_count--;
            if (cur->fx_count == 0) {
                cur->fx_control = 0;
                cur->fx_count = 1;

                memcpy(m->playing_info.wave_tables + cur->synth_offset,
                       m->playing_info.wave_tables + cur->synth_offset + 64, 32);
            }
            break;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoMod — modulation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_mod(SmModule* m, SmBpCurrent* cur, SmSynthInstrument* si) {
    if (cur->mod_control != 0) {
        cur->mod_count--;
        if (cur->mod_count == 0) {
            // Reset counter
            cur->mod_count = si->mod_speed;

            // Get the table value and store it in the synth sample
            m->playing_info.wave_tables[cur->synth_offset + 32] =
                m->playing_info.wave_tables[si->mod_table * 64 + cur->mod_ptr];

            // Update the MOD pointer
            cur->mod_ptr++;
            if (cur->mod_ptr == si->mod_length) {
                cur->mod_ptr = 0;

                // Only do the MOD once?
                if (cur->mod_control == 1)
                    cur->mod_control = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Averaging — averages the synth sample
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void averaging(SmModule* m, int voice) {
    int synth_offset = m->bp_current[voice].synth_offset;
    int8_t last_val = m->playing_info.wave_tables[synth_offset];

    for (int i = 0; i < 32 - 1; i++) {
        last_val = (int8_t)((last_val + m->playing_info.wave_tables[synth_offset + 1]) / 2);
        m->playing_info.wave_tables[synth_offset++] = last_val;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Transform2 — transform synth sample using method 2
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void transform2(SmModule* m, int voice, int8_t delta) {
    int8_t* source = m->playing_info.synth_buffer[voice];
    int source_offset = 31;
    int dest_offset = m->bp_current[voice].synth_offset;

    for (int i = 0; i < 32; i++) {
        int8_t source_val = source[source_offset];
        int8_t dest_val = m->playing_info.wave_tables[dest_offset];

        if (source_val < dest_val)
            m->playing_info.wave_tables[dest_offset] -= delta;
        else {
            if (source_val > dest_val)
                m->playing_info.wave_tables[dest_offset] += delta;
        }

        source_offset--;
        dest_offset++;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Transform3 — transform synth sample using method 3
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void transform3(SmModule* m, int voice, int8_t delta) {
    int8_t* source = m->playing_info.synth_buffer[voice];
    int source_offset = 0;
    int dest_offset = m->bp_current[voice].synth_offset;

    for (int i = 0; i < 32; i++) {
        int8_t source_val = source[source_offset];
        int8_t dest_val = m->playing_info.wave_tables[dest_offset];

        if (source_val < dest_val)
            m->playing_info.wave_tables[dest_offset] -= delta;
        else {
            if (source_val > dest_val)
                m->playing_info.wave_tables[dest_offset] += delta;
        }

        source_offset++;
        dest_offset++;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Transform4 — transform synth sample using method 4
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void transform4(SmModule* m, int voice, int8_t delta) {
    int source_offset = m->bp_current[voice].synth_offset + 64;
    int dest_offset = m->bp_current[voice].synth_offset;

    for (int i = 0; i < 32; i++) {
        int8_t source_val = (source_offset >= m->playing_info.wave_tables_size) ? 0 : m->playing_info.wave_tables[source_offset];
        int8_t dest_val = m->playing_info.wave_tables[dest_offset];

        if (source_val < dest_val)
            m->playing_info.wave_tables[dest_offset] -= delta;
        else {
            if (source_val > dest_val)
                m->playing_info.wave_tables[dest_offset] += delta;
        }

        source_offset++;
        dest_offset++;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Amiga 4-channel mixer
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define AMIGA_CLOCK 3546895.0

size_t sm_render(SmModule* module, float* interleaved_stereo, size_t frames) {
    if (!module || !interleaved_stereo || frames == 0)
        return 0;

    float* out = interleaved_stereo;
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        // Accumulate ticks
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            bp_play(module);

            if (module->end_reached) {
                module->has_ended = true;
                module->end_reached = false;
                mark_position_visited(module->playing_info.bp_step);
            }
        }

        float left = 0.0f;
        float right = 0.0f;

        for (int ch = 0; ch < 4; ch++) {
            SmChannel* c = &module->channels[ch];

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

            // Apply volume (0-256 -> 0.0-1.0)
            sample *= (float)c->volume / 256.0f;

            // Amiga panning: channels 0,3 = left; channels 1,2 = right
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

size_t sm_render_multi(SmModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
    if (!module || frames == 0)
        return 0;

    float* ch_out[4] = { ch0, ch1, ch2, ch3 };
    size_t frames_written = 0;

    for (size_t f = 0; f < frames; f++) {
        // Accumulate ticks
        module->tick_accumulator += 1.0f;

        if (module->tick_accumulator >= module->ticks_per_frame) {
            module->tick_accumulator -= module->ticks_per_frame;
            bp_play(module);

            if (module->end_reached) {
                module->has_ended = true;
                module->end_reached = false;
                mark_position_visited(module->playing_info.bp_step);
            }
        }

        for (int ch = 0; ch < 4; ch++) {
            SmChannel* c = &module->channels[ch];
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

            // Apply volume (0-256 -> 0.0-1.0)
            sample *= (float)c->volume / 256.0f;

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

SmModule* sm_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 512)
        return nullptr;

    // Read the module mark at offset 26
    SmModuleType type = SM_TYPE_UNKNOWN;
    if (size >= 29) {
        if (data[26] == 'V' && data[27] == '.' && data[28] == '2')
            type = SM_TYPE_SOUNDMON_11;
        else if (data[26] == 'V' && data[27] == '.' && data[28] == '3')
            type = SM_TYPE_SOUNDMON_22;
    }

    if (type == SM_TYPE_UNKNOWN)
        return nullptr;

    SmModule* m = (SmModule*)calloc(1, sizeof(SmModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;

    SmReader reader;
    reader_init(&reader, data, size);

    if (!load_module(m, &reader, type)) {
        sm_destroy(m);
        return nullptr;
    }

    // Calculate ticks per frame: CIA timer at ~50 Hz (PAL)
    // The player runs at 50 Hz (one BpPlay call per VBlank)
    m->ticks_per_frame = sample_rate / 50.0f;
    m->tick_accumulator = 0.0f;

    clear_visited();
    initialize_sound(m, 0);
    mark_position_visited(0);

    return m;
}

void sm_destroy(SmModule* module) {
    if (!module) return;

    for (int i = 0; i < 4; i++) {
        if (module->steps[i]) free(module->steps[i]);
    }

    if (module->tracks) {
        for (int i = 0; i < module->track_num; i++) {
            if (module->tracks[i]) free(module->tracks[i]);
        }
        free(module->tracks);
    }

    if (module->wave_tables) free(module->wave_tables);

    for (int i = 0; i < 15; i++) {
        if (!module->instruments[i].is_synth) {
            if (module->instruments[i].sample.adr)
                free(module->instruments[i].sample.adr);
        }
    }

    if (module->playing_info.wave_tables)
        free(module->playing_info.wave_tables);

    free(module);
}

int sm_subsong_count(const SmModule* module) {
    if (!module) return 0;
    return 1;
}

bool sm_select_subsong(SmModule* module, int subsong) {
    if (!module || subsong != 0)
        return false;

    clear_visited();
    initialize_sound(module, 0);
    mark_position_visited(0);
    return true;
}

int sm_channel_count(const SmModule* module) {
    (void)module;
    return 4;
}

void sm_set_channel_mask(SmModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->channels[i].muted = ((mask >> i) & 1) == 0;
}

bool sm_has_ended(const SmModule* module) {
    if (!module) return true;
    return module->has_ended;
}
