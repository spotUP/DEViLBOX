// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "fred_replayer.h"

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

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enums
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum FredInstrumentType {
    FRED_INST_SAMPLE = 0x00,
    FRED_INST_PULSE  = 0x01,
    FRED_INST_BLEND  = 0x02,
    FRED_INST_UNUSED = 0xff
} FredInstrumentType;

typedef enum FredEnvelopeState {
    FRED_ENV_ATTACK  = 0,
    FRED_ENV_DECAY   = 1,
    FRED_ENV_SUSTAIN = 2,
    FRED_ENV_RELEASE = 3,
    FRED_ENV_DONE    = 4
} FredEnvelopeState;

typedef enum FredSynchronizeFlag {
    FRED_SYNC_PULSE_XSHOT  = 0x01,
    FRED_SYNC_PULSE_SYNC   = 0x02,
    FRED_SYNC_BLEND_XSHOT  = 0x04,
    FRED_SYNC_BLEND_SYNC   = 0x08
} FredSynchronizeFlag;

typedef enum FredVibFlags {
    FRED_VIB_NONE             = 0,
    FRED_VIB_VIB_DIRECTION    = 0x01,
    FRED_VIB_PERIOD_DIRECTION = 0x02
} FredVibFlags;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint32_t fred_period_table[72] = {
    8192, 7728, 7296, 6888, 6504, 6136, 5792, 5464, 5160, 4872, 4600, 4336,
    4096, 3864, 3648, 3444, 3252, 3068, 2896, 2732, 2580, 2436, 2300, 2168,
    2048, 1932, 1824, 1722, 1626, 1534, 1448, 1366, 1290, 1218, 1150, 1084,
    1024,  966,  912,  861,  813,  767,  724,  683,  645,  609,  575,  542,
     512,  483,  456,  430,  406,  383,  362,  341,  322,  304,  287,  271,
     256,  241,  228,  215,  203,  191,  181,  170,  161,  152,  143,  135
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Track command codes
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#define TRACK_END_CODE   0x80
#define TRACK_PORT_CODE  0x81
#define TRACK_TEMPO_CODE 0x82
#define TRACK_INST_CODE  0x83
#define TRACK_PAUSE_CODE 0x84
#define TRACK_MAX_CODE   0xa0

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Structs
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct FredInstrument {
    int16_t instrument_number;
    uint16_t repeat_len;
    uint16_t length;
    uint16_t period;
    uint8_t vib_delay;
    int8_t vib_speed;
    int8_t vib_ampl;
    uint8_t env_vol;
    uint8_t attack_speed;
    uint8_t attack_volume;
    uint8_t decay_speed;
    uint8_t decay_volume;
    uint8_t sustain_delay;
    uint8_t release_speed;
    uint8_t release_volume;
    int8_t arpeggio[16];
    uint8_t arp_speed;
    FredInstrumentType inst_type;
    int8_t pulse_rate_min;
    int8_t pulse_rate_plus;
    uint8_t pulse_speed;
    uint8_t pulse_start;
    uint8_t pulse_end;
    uint8_t pulse_delay;
    uint8_t inst_sync;    // SynchronizeFlag bitmask
    uint8_t blend;
    uint8_t blend_delay;
    uint8_t pulse_shot_counter;
    uint8_t blend_shot_counter;
    uint8_t arp_count;

    int8_t* sample_addr;
    uint32_t sample_size;
} FredInstrument;

typedef struct FredChannelInfo {
    int chan_num;
    int8_t* position_table;       // sbyte[256] per sub-song per channel
    uint8_t* track_table;         // pointer to current track data
    uint16_t position;
    uint16_t track_position;
    uint16_t track_duration;
    uint8_t track_note;
    uint16_t track_period;
    int16_t track_volume;
    FredInstrument* instrument;
    uint8_t vib_flags;            // FredVibFlags bitmask
    uint8_t vib_delay;
    int8_t vib_speed;
    int8_t vib_ampl;
    int8_t vib_value;
    bool port_running;
    uint16_t port_delay;
    uint16_t port_limit;
    uint8_t port_target_note;
    uint16_t port_start_period;
    int16_t period_diff;
    uint16_t port_counter;
    uint16_t port_speed;
    FredEnvelopeState env_state;
    uint8_t sustain_delay;
    uint8_t arp_position;
    uint8_t arp_speed;
    bool pulse_way;
    uint8_t pulse_position;
    uint8_t pulse_delay;
    uint8_t pulse_speed;
    uint8_t pulse_shot;
    bool blend_way;
    uint16_t blend_position;
    uint8_t blend_delay;
    uint8_t blend_shot;
    int8_t synth_sample[64];
} FredChannelInfo;

// Channel mixing state (IChannel equivalent)
typedef struct FredMixChannel {
    bool active;
    bool muted;
    int8_t* sample_data;
    uint32_t sample_length;
    uint32_t loop_start;
    uint32_t loop_length;
    uint16_t volume;       // 0-256 (NP uses SetVolume(0-256))
    uint32_t period;
    uint64_t position_fp;
} FredMixChannel;

struct FredModule {
    float sample_rate;

    uint16_t sub_song_num;
    uint16_t inst_num;

    uint8_t* start_tempos;
    int8_t*** positions;      // [subSongNum][4][256]
    uint8_t** tracks;         // [128] each variable-sized
    int* track_sizes;
    FredInstrument* instruments;

    // has_notes[subSong * 4 + chan]
    bool* has_notes;

    int current_song;
    uint8_t current_tempo;       // GlobalPlayingInfo.CurrentTempo
    FredChannelInfo channels[4];
    FredMixChannel mix_channels[4];

    bool has_ended;
    bool end_reached[4];         // per-channel end detection

    float tick_accumulator;
    float ticks_per_frame;       // sample_rate / 50.0 (PAL)
};

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Reader helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef struct FredReader {
    const uint8_t* data;
    size_t size;
    size_t pos;
} FredReader;

static void reader_init(FredReader* r, const uint8_t* data, size_t size) {
    r->data = data;
    r->size = size;
    r->pos = 0;
}

static bool reader_eof(const FredReader* r) {
    return r->pos > r->size;
}

static void reader_seek(FredReader* r, size_t pos) {
    r->pos = pos;
}

static void reader_skip(FredReader* r, size_t n) {
    r->pos += n;
}

static uint8_t reader_read_uint8(FredReader* r) {
    if (r->pos >= r->size) { r->pos = r->size + 1; return 0; }
    return r->data[r->pos++];
}

static int8_t reader_read_int8(FredReader* r) {
    return (int8_t)reader_read_uint8(r);
}

static uint16_t reader_read_b_uint16(FredReader* r) {
    uint8_t hi = reader_read_uint8(r);
    uint8_t lo = reader_read_uint8(r);
    return (uint16_t)((hi << 8) | lo);
}

static int32_t reader_read_b_int32(FredReader* r) {
    uint8_t b0 = reader_read_uint8(r);
    uint8_t b1 = reader_read_uint8(r);
    uint8_t b2 = reader_read_uint8(r);
    uint8_t b3 = reader_read_uint8(r);
    return (int32_t)((b0 << 24) | (b1 << 16) | (b2 << 8) | b3);
}

static uint32_t reader_read_b_uint32(FredReader* r) {
    return (uint32_t)reader_read_b_int32(r);
}

static void reader_read_bytes(FredReader* r, uint8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_uint8(r);
}

static void reader_read_signed(FredReader* r, int8_t* out, size_t count) {
    for (size_t i = 0; i < count; i++)
        out[i] = reader_read_int8(r);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Mix channel operations (IChannel equivalents)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void mix_play_sample(FredMixChannel* mc, int8_t* addr, uint32_t offset, uint32_t length) {
    mc->sample_data = addr + offset;
    mc->sample_length = length;
    mc->loop_start = 0;
    mc->loop_length = 0;
    mc->position_fp = 0;
    mc->active = true;
}

static void mix_set_loop(FredMixChannel* mc, uint32_t start, uint32_t length) {
    mc->loop_start = start;
    mc->loop_length = length;
}

static void mix_set_volume(FredMixChannel* mc, uint16_t vol) {
    mc->volume = vol;
}

// Note: Fred uses SetVolume (0-256 range), not SetAmigaVolume (0-64 range).
// The C# source calls channel.SetVolume((ushort)(inst.EnvVol * chanInfo.TrackVolume / 256))
// which uses 0-256 range volume. No SetAmigaVolume helper needed.

static void mix_set_amiga_period(FredMixChannel* mc, uint32_t period) {
    mc->period = period;
}

static void mix_mute(FredMixChannel* mc) {
    mc->active = false;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Create synth sample - Pulse
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void create_synth_sample_pulse(FredInstrument* inst, FredChannelInfo* chanInfo) {
    // Initialize the pulse variables
    chanInfo->pulse_shot = inst->pulse_shot_counter;
    chanInfo->pulse_delay = inst->pulse_delay;
    chanInfo->pulse_speed = inst->pulse_speed;
    chanInfo->pulse_way = false;
    chanInfo->pulse_position = inst->pulse_start;

    // Create first part of the sample
    int i;
    for (i = 0; i < inst->pulse_start; i++)
        chanInfo->synth_sample[i] = inst->pulse_rate_min;

    // Create the second part
    for (; i < inst->length; i++)
        chanInfo->synth_sample[i] = inst->pulse_rate_plus;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Create synth sample - Blend
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void create_synth_sample_blend(FredInstrument* inst, FredChannelInfo* chanInfo) {
    // Initialize the blend variables
    chanInfo->blend_way = false;
    chanInfo->blend_position = 1;
    chanInfo->blend_shot = inst->blend_shot_counter;
    chanInfo->blend_delay = inst->blend_delay;

    for (int i = 0; i < 32; i++)
        chanInfo->synth_sample[i] = inst->sample_addr[i];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ModifySound — runs all effects on a channel
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void modify_sound(FredChannelInfo* chanInfo, FredMixChannel* mc) {
    FredInstrument* inst = chanInfo->instrument;

    // If the channel doesn't have any instruments, don't do anything
    if (inst == nullptr)
        return;

    // Arpeggio
    uint8_t new_note = (uint8_t)(chanInfo->track_note + inst->arpeggio[chanInfo->arp_position]);

    chanInfo->arp_speed--;
    if (chanInfo->arp_speed == 0) {
        chanInfo->arp_speed = inst->arp_speed;

        // Go to the next position
        chanInfo->arp_position++;

        if (chanInfo->arp_position >= inst->arp_count)
            chanInfo->arp_position = 0;
    }

    // Find the new period
    chanInfo->track_period = (uint16_t)((fred_period_table[new_note] * inst->period) / 1024);

    // Portamento
    if (chanInfo->port_running) {
        // Should we delay the portamento?
        if (chanInfo->port_delay != 0)
            chanInfo->port_delay--;
        else {
            // Do it, calculate the new period
            chanInfo->track_period = (uint16_t)(chanInfo->track_period + (chanInfo->port_counter * chanInfo->period_diff / chanInfo->port_speed));

            chanInfo->port_counter++;

            if (chanInfo->port_counter > chanInfo->port_speed) {
                chanInfo->track_note = chanInfo->port_target_note;
                chanInfo->port_running = false;
            }
        }
    }

    // Vibrato
    uint16_t period = chanInfo->track_period;

    if (chanInfo->vib_delay != 0)
        chanInfo->vib_delay--;
    else {
        if (chanInfo->vib_flags != FRED_VIB_NONE) {
            // Vibrato is running, now check the vibrato direction
            if ((chanInfo->vib_flags & FRED_VIB_VIB_DIRECTION) != 0) {
                chanInfo->vib_value += chanInfo->vib_speed;

                if (chanInfo->vib_value == chanInfo->vib_ampl)
                    chanInfo->vib_flags &= ~FRED_VIB_VIB_DIRECTION;
            }
            else {
                chanInfo->vib_value -= chanInfo->vib_speed;

                if (chanInfo->vib_value == 0)
                    chanInfo->vib_flags |= FRED_VIB_VIB_DIRECTION;
            }

            // Change the direction of the period
            if (chanInfo->vib_value == 0)
                chanInfo->vib_flags ^= FRED_VIB_PERIOD_DIRECTION;

            if ((chanInfo->vib_flags & FRED_VIB_PERIOD_DIRECTION) != 0)
                period = (uint16_t)(period + chanInfo->vib_value);
            else
                period = (uint16_t)(period - chanInfo->vib_value);
        }
    }

    // Set the period
    mix_set_amiga_period(mc, period);

    // Envelope
    switch (chanInfo->env_state) {
        case FRED_ENV_ATTACK:
            chanInfo->track_volume += inst->attack_speed;

            if (chanInfo->track_volume >= inst->attack_volume) {
                chanInfo->track_volume = inst->attack_volume;
                chanInfo->env_state = FRED_ENV_DECAY;
            }
            break;

        case FRED_ENV_DECAY:
            chanInfo->track_volume -= inst->decay_speed;

            if (chanInfo->track_volume <= inst->decay_volume) {
                chanInfo->track_volume = inst->decay_volume;
                chanInfo->env_state = FRED_ENV_SUSTAIN;
            }
            break;

        case FRED_ENV_SUSTAIN:
            if (chanInfo->sustain_delay == 0)
                chanInfo->env_state = FRED_ENV_RELEASE;
            else
                chanInfo->sustain_delay--;
            break;

        case FRED_ENV_RELEASE:
            chanInfo->track_volume -= inst->release_speed;

            if (chanInfo->track_volume <= inst->release_volume) {
                chanInfo->track_volume = inst->release_volume;
                chanInfo->env_state = FRED_ENV_DONE;
            }
            break;

        case FRED_ENV_DONE:
            break;
    }

    // Set the volume
    mix_set_volume(mc, (uint16_t)(inst->env_vol * chanInfo->track_volume / 256));

    // Pulse on synth samples
    if (inst->inst_type == FRED_INST_PULSE) {
        if (chanInfo->pulse_delay != 0)
            chanInfo->pulse_delay--;
        else {
            if (chanInfo->pulse_speed != 0)
                chanInfo->pulse_speed--;
            else {
                if (((inst->inst_sync & FRED_SYNC_PULSE_XSHOT) == 0) || (chanInfo->pulse_shot != 0)) {
                    chanInfo->pulse_speed = inst->pulse_speed;

                    for (;;) {
                        if (chanInfo->pulse_way) {
                            if (chanInfo->pulse_position >= inst->pulse_start) {
                                // Change the sample at the pulse position
                                chanInfo->synth_sample[chanInfo->pulse_position] = inst->pulse_rate_plus;
                                chanInfo->pulse_position--;
                                break;
                            }

                            // Switch direction
                            chanInfo->pulse_way = false;
                            chanInfo->pulse_shot--;
                            chanInfo->pulse_position++;
                        }
                        else {
                            if (chanInfo->pulse_position <= inst->pulse_end) {
                                // Change the sample at the pulse position
                                chanInfo->synth_sample[chanInfo->pulse_position] = inst->pulse_rate_min;
                                chanInfo->pulse_position++;
                                break;
                            }

                            // Switch direction
                            chanInfo->pulse_way = true;
                            chanInfo->pulse_shot--;
                            chanInfo->pulse_position--;
                        }
                    }
                }
            }
        }
    }

    // Blend on synth samples
    if (inst->inst_type == FRED_INST_BLEND) {
        if (chanInfo->blend_delay != 0)
            chanInfo->blend_delay--;
        else {
            for (;;) {
                if (((inst->inst_sync & FRED_SYNC_BLEND_XSHOT) == 0) || (chanInfo->blend_shot != 0)) {
                    if (chanInfo->blend_way) {
                        if (chanInfo->blend_position == 1) {
                            chanInfo->blend_way = false;
                            chanInfo->blend_shot--;
                            continue;
                        }

                        chanInfo->blend_position--;
                        break;
                    }

                    if (chanInfo->blend_position == (1 << inst->blend)) {
                        chanInfo->blend_way = true;
                        chanInfo->blend_shot--;
                        continue;
                    }

                    chanInfo->blend_position++;
                    break;
                }

                return;     // Well, done with the effects
            }

            // Create new synth sample
            for (int i = 0; i < 32; i++)
                chanInfo->synth_sample[i] = (int8_t)(((chanInfo->blend_position * inst->sample_addr[i + 32]) >> inst->blend) + inst->sample_addr[i]);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DoNewLine — parse the next track line
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint8_t do_new_line(FredModule* m, int chan_idx) {
    FredChannelInfo* chanInfo = &m->channels[chan_idx];
    FredMixChannel* mc = &m->mix_channels[chan_idx];
    bool inst_change = false;

    // For channels that does not contain any notes, mark them as done immediately
    if (!m->has_notes[m->current_song * 4 + chanInfo->chan_num])
        m->end_reached[chanInfo->chan_num] = true;

    // Get the current track position
    uint16_t track_pos = chanInfo->track_position;

    for (;;) {
        uint8_t cmd = chanInfo->track_table[track_pos++];

        // Is the command a note?
        if (cmd < 0x80) {
            // Yes, play it
            FredInstrument* inst = chanInfo->instrument;

            // Store the new position
            chanInfo->track_position = track_pos;

            // Do we play an invalid instrument?
            if (inst == nullptr) {
                // Stop all effects
                chanInfo->port_running = false;
                chanInfo->vib_flags = 0;
                chanInfo->track_volume = 0;
                mix_mute(mc);

                // Take the next channel
                return 0;
            }

            // Initialize the channel
            chanInfo->track_note = cmd;
            chanInfo->arp_position = 0;
            chanInfo->arp_speed = inst->arp_speed;
            chanInfo->vib_delay = inst->vib_delay;
            chanInfo->vib_speed = inst->vib_speed;
            chanInfo->vib_ampl = inst->vib_ampl;
            chanInfo->vib_flags = FRED_VIB_VIB_DIRECTION | FRED_VIB_PERIOD_DIRECTION;
            chanInfo->vib_value = 0;

            // Create synth sample if the instrument used is a synth instrument
            if ((inst->inst_type == FRED_INST_PULSE) && (inst_change || ((inst->inst_sync & FRED_SYNC_PULSE_SYNC) != 0)))
                create_synth_sample_pulse(inst, chanInfo);
            else {
                if ((inst->inst_type == FRED_INST_BLEND) && (inst_change || ((inst->inst_sync & FRED_SYNC_BLEND_SYNC) != 0)))
                    create_synth_sample_blend(inst, chanInfo);
            }

            // Set the track duration (speed)
            chanInfo->track_duration = m->current_tempo;

            // Play the instrument
            if (inst->inst_type == FRED_INST_SAMPLE) {
                if (inst->sample_addr != nullptr) {
                    // Play sample
                    mix_play_sample(mc, inst->sample_addr, 0, inst->length);

                    if ((inst->repeat_len != 0) && (inst->repeat_len != 0xffff)) {
                        // There is no bug in this line. The original player calculate
                        // the wrong start and length too!
                        mix_set_loop(mc, inst->repeat_len, (uint32_t)inst->length - inst->repeat_len);
                    }
                }
            }
            else {
                // Play synth sound
                mix_play_sample(mc, chanInfo->synth_sample, 0, inst->length);
                mix_set_loop(mc, 0, inst->length);
            }

            // Set the volume (mute the channel)
            mix_set_volume(mc, 0);

            chanInfo->track_volume = 0;
            chanInfo->env_state = FRED_ENV_ATTACK;
            chanInfo->sustain_delay = inst->sustain_delay;

            // Set the period
            chanInfo->track_period = (uint16_t)((fred_period_table[chanInfo->track_note] * inst->period) / 1024);
            mix_set_amiga_period(mc, chanInfo->track_period);

            // Initialize portamento
            if (chanInfo->port_running && (chanInfo->port_start_period == 0)) {
                chanInfo->period_diff = (int16_t)(chanInfo->port_limit - chanInfo->track_period);
                chanInfo->port_counter = 1;
                chanInfo->port_start_period = chanInfo->track_period;
            }

            // Take the next channel
            return 0;
        }

        // It's a command
        switch (cmd) {
            // Change instrument
            case TRACK_INST_CODE: {
                uint8_t new_inst = chanInfo->track_table[track_pos++];

                if (new_inst >= m->inst_num)
                    chanInfo->instrument = nullptr;
                else {
                    // Find the instrument information
                    chanInfo->instrument = &m->instruments[new_inst];

                    if (chanInfo->instrument->inst_type == FRED_INST_UNUSED)
                        chanInfo->instrument = nullptr;
                    else
                        inst_change = true;
                }
                break;
            }

            // Change tempo
            case TRACK_TEMPO_CODE: {
                m->current_tempo = chanInfo->track_table[track_pos++];
                break;
            }

            // Start portamento
            case TRACK_PORT_CODE: {
                uint16_t inst_period = 428;

                if (chanInfo->instrument != nullptr)
                    inst_period = chanInfo->instrument->period;

                chanInfo->port_speed = (uint16_t)(chanInfo->track_table[track_pos++] * m->current_tempo);
                chanInfo->port_target_note = chanInfo->track_table[track_pos++];
                chanInfo->port_limit = (uint16_t)((fred_period_table[chanInfo->port_target_note] * inst_period) / 1024);
                chanInfo->port_start_period = 0;
                chanInfo->port_delay = (uint16_t)(chanInfo->track_table[track_pos++] * m->current_tempo);
                chanInfo->port_running = true;
                break;
            }

            // Execute pause
            case TRACK_PAUSE_CODE: {
                chanInfo->track_duration = m->current_tempo;
                chanInfo->track_position = track_pos;
                mix_mute(mc);

                // Take the next channel
                return 1;
            }

            // End, goto next pattern
            case TRACK_END_CODE: {
                chanInfo->position++;

                for (;;) {
                    // If the song ends, start it over
                    if (chanInfo->position_table[chanInfo->position] == -1) {
                        chanInfo->position = 0;
                        m->current_tempo = m->start_tempos[m->current_song];

                        // Tell that the channel has ended
                        m->end_reached[chanInfo->chan_num] = true;
                        continue;
                    }

                    if (chanInfo->position_table[chanInfo->position] < 0) {
                        // Jump to a new position
                        uint16_t old_position = chanInfo->position;
                        chanInfo->position = (uint16_t)(chanInfo->position_table[chanInfo->position] & 0x7f);

                        // Do we jump back in the song
                        if (chanInfo->position < old_position)
                            m->end_reached[chanInfo->chan_num] = true;

                        continue;
                    }

                    // Stop the loop
                    break;
                }

                // Find new track
                chanInfo->track_table = m->tracks[chanInfo->position_table[chanInfo->position]];
                chanInfo->track_position = 0;
                chanInfo->track_duration = 1;

                // Take the same channel again
                return 2;
            }

            // Note delay
            default: {
                chanInfo->track_duration = (uint16_t)(-(int8_t)cmd * m->current_tempo);
                chanInfo->track_position = track_pos;

                // Take the next channel
                return 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Play tick — main player method
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_tick(FredModule* m) {
    // Well, play all channels
    for (int i = 0; i < 4; i++) {
        FredChannelInfo* chanInfo = &m->channels[i];
        FredMixChannel* mc = &m->mix_channels[i];

        // Decrement the note delay counter
        chanInfo->track_duration--;

        // Check to see if we need to get the next track line
        if (chanInfo->track_duration == 0) {
            uint8_t ret_val = do_new_line(m, i);

            if (ret_val == 1)   // Take the next voice
                continue;

            if (ret_val == 2) { // Do the same voice again
                i--;
                continue;
            }
        }
        else {
            // Check to see if we need to mute the channel
            if ((chanInfo->track_duration == 1) && (chanInfo->track_table[chanInfo->track_position] < TRACK_MAX_CODE))
                mix_mute(mc);
        }

        modify_sound(chanInfo, mc);
    }

    // Check if any channel wrapped (end detection)
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

static void initialize_sound(FredModule* m, int song_number) {
    m->current_song = song_number;
    m->current_tempo = m->start_tempos[song_number];
    m->has_ended = false;

    for (int i = 0; i < 4; i++) {
        m->end_reached[i] = false;

        int8_t* pos_table = m->positions[song_number][i];

        FredChannelInfo* ch = &m->channels[i];
        memset(ch, 0, sizeof(FredChannelInfo));

        ch->chan_num = i;
        ch->position_table = pos_table;
        ch->track_table = m->tracks[pos_table[0]];
        ch->position = 0;
        ch->track_position = 0;
        ch->track_duration = 1;
        ch->track_note = 0;
        ch->track_period = 0;
        ch->track_volume = 0;
        ch->instrument = nullptr;
        ch->vib_flags = FRED_VIB_NONE;
        ch->vib_delay = 0;
        ch->vib_speed = 0;
        ch->vib_ampl = 0;
        ch->vib_value = 0;
        ch->port_running = false;
        ch->port_delay = 0;
        ch->port_limit = 0;
        ch->port_target_note = 0;
        ch->port_start_period = 0;
        ch->period_diff = 0;
        ch->port_counter = 0;
        ch->port_speed = 0;
        ch->env_state = FRED_ENV_ATTACK;
        ch->sustain_delay = 0;
        ch->arp_position = 0;
        ch->arp_speed = 0;
        ch->pulse_way = false;
        ch->pulse_position = 0;
        ch->pulse_delay = 0;
        ch->pulse_speed = 0;
        ch->pulse_shot = 0;
        ch->blend_way = false;
        ch->blend_position = 0;
        ch->blend_delay = 0;
        ch->blend_shot = 0;
        memset(ch->synth_sample, 0, 64);

        // Reset mix channel
        FredMixChannel* mc = &m->mix_channels[i];
        memset(mc, 0, sizeof(FredMixChannel));
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Loading
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_module(FredModule* m, const uint8_t* data, size_t size) {
    FredReader reader;
    reader_init(&reader, data, size);

    // Skip the signature and version (14 bytes: "Fred Editor " + 2 version bytes)
    reader_seek(&reader, 14);

    // Get number of sub-songs
    m->sub_song_num = reader_read_b_uint16(&reader);

    if (reader_eof(&reader))
        return false;

    // Read the sub-song start tempos
    m->start_tempos = (uint8_t*)calloc(m->sub_song_num, sizeof(uint8_t));
    if (!m->start_tempos) return false;

    for (int i = 0; i < m->sub_song_num; i++)
        m->start_tempos[i] = reader_read_uint8(&reader);

    if (reader_eof(&reader))
        return false;

    // Allocate memory to hold the positions
    m->positions = (int8_t***)calloc(m->sub_song_num, sizeof(int8_t**));
    if (!m->positions) return false;

    // Take one sub-song at the time
    for (int i = 0; i < m->sub_song_num; i++) {
        m->positions[i] = (int8_t**)calloc(4, sizeof(int8_t*));
        if (!m->positions[i]) return false;

        // There are 4 channels in each sub-song
        for (int j = 0; j < 4; j++) {
            // Read one channel position data
            m->positions[i][j] = (int8_t*)calloc(256, sizeof(int8_t));
            if (!m->positions[i][j]) return false;

            reader_read_signed(&reader, m->positions[i][j], 256);

            if (reader_eof(&reader))
                return false;
        }
    }

    // Allocate memory to hold the track data
    m->tracks = (uint8_t**)calloc(128, sizeof(uint8_t*));
    m->track_sizes = (int*)calloc(128, sizeof(int));
    if (!m->tracks || !m->track_sizes) return false;

    // Now load the track data
    for (int i = 0; i < 128; i++) {
        // Read the current track size
        int track_size = reader_read_b_int32(&reader);

        // Allocate memory for the track data
        m->tracks[i] = (uint8_t*)calloc(track_size, sizeof(uint8_t));
        m->track_sizes[i] = track_size;
        if (!m->tracks[i]) return false;

        // Read the track data
        reader_read_bytes(&reader, m->tracks[i], track_size);

        // Did we get some problems?
        if (reader_eof(&reader))
            return false;
    }

    // Get the number of instruments
    m->inst_num = reader_read_b_uint16(&reader);

    // Allocate memory to hold the instrument info
    m->instruments = (FredInstrument*)calloc(m->inst_num, sizeof(FredInstrument));
    if (!m->instruments) return false;

    // Read the instrument info
    // Map from instIndex → instrument pointer
    typedef struct { uint32_t key; int value; } InstIndexEntry;
    InstIndexEntry* inst_index_map = (InstIndexEntry*)calloc(m->inst_num, sizeof(InstIndexEntry));
    int inst_map_count = 0;

    for (int16_t i = 0; i < (int16_t)m->inst_num; i++) {
        FredInstrument* inst = &m->instruments[i];

        inst->instrument_number = i;

        // Skip name (32 bytes)
        reader_skip(&reader, 32);

        uint32_t inst_index = reader_read_b_uint32(&reader);

        // Check if this instIndex is already mapped
        bool found = false;
        for (int k = 0; k < inst_map_count; k++) {
            if (inst_index_map[k].key == inst_index) {
                found = true;
                break;
            }
        }
        if (!found) {
            inst_index_map[inst_map_count].key = inst_index;
            inst_index_map[inst_map_count].value = i;
            inst_map_count++;
        }

        inst->repeat_len = reader_read_b_uint16(&reader);
        inst->length = (uint16_t)(reader_read_b_uint16(&reader) * 2);
        inst->period = reader_read_b_uint16(&reader);
        inst->vib_delay = reader_read_uint8(&reader);
        reader_skip(&reader, 1);

        inst->vib_speed = reader_read_int8(&reader);
        inst->vib_ampl = reader_read_int8(&reader);
        inst->env_vol = reader_read_uint8(&reader);
        inst->attack_speed = reader_read_uint8(&reader);
        inst->attack_volume = reader_read_uint8(&reader);
        inst->decay_speed = reader_read_uint8(&reader);
        inst->decay_volume = reader_read_uint8(&reader);
        inst->sustain_delay = reader_read_uint8(&reader);
        inst->release_speed = reader_read_uint8(&reader);
        inst->release_volume = reader_read_uint8(&reader);

        reader_read_signed(&reader, inst->arpeggio, 16);

        inst->arp_speed = reader_read_uint8(&reader);
        inst->inst_type = (FredInstrumentType)reader_read_uint8(&reader);
        inst->pulse_rate_min = reader_read_int8(&reader);
        inst->pulse_rate_plus = reader_read_int8(&reader);
        inst->pulse_speed = reader_read_uint8(&reader);
        inst->pulse_start = reader_read_uint8(&reader);
        inst->pulse_end = reader_read_uint8(&reader);
        inst->pulse_delay = reader_read_uint8(&reader);
        inst->inst_sync = reader_read_uint8(&reader);
        inst->blend = reader_read_uint8(&reader);
        inst->blend_delay = reader_read_uint8(&reader);
        inst->pulse_shot_counter = reader_read_uint8(&reader);
        inst->blend_shot_counter = reader_read_uint8(&reader);
        inst->arp_count = reader_read_uint8(&reader);

        if (reader_eof(&reader)) {
            free(inst_index_map);
            return false;
        }

        reader_skip(&reader, 12);
    }

    // Read number of samples
    uint16_t samp_num = reader_read_b_uint16(&reader);

    for (int i = 0; i < samp_num; i++) {
        // Read the instrument index
        uint16_t inst_index = reader_read_b_uint16(&reader);

        // Find the instrument info
        int inst_idx = -1;
        for (int k = 0; k < inst_map_count; k++) {
            if (inst_index_map[k].key == inst_index) {
                inst_idx = inst_index_map[k].value;
                break;
            }
        }

        if (inst_idx < 0) {
            free(inst_index_map);
            return false;
        }

        FredInstrument* inst = &m->instruments[inst_idx];

        // Get the size of the sample data
        uint16_t samp_size = reader_read_b_uint16(&reader);

        // Read the sample data
        inst->sample_addr = (int8_t*)calloc(samp_size, sizeof(int8_t));
        inst->sample_size = samp_size;
        if (!inst->sample_addr) {
            free(inst_index_map);
            return false;
        }

        reader_read_signed(&reader, inst->sample_addr, samp_size);

        if (reader_eof(&reader)) {
            free(inst_index_map);
            return false;
        }
    }

    free(inst_index_map);

    // Calculate has_notes
    m->has_notes = (bool*)calloc(m->sub_song_num * 4, sizeof(bool));
    if (!m->has_notes) return false;

    for (int i = 0; i < m->sub_song_num; i++) {
        for (int j = 0; j < 4; j++) {
            int8_t* pos_list = m->positions[i][j];

            for (int k = 0; k < 256; k++) {
                if (pos_list[k] < 0)
                    break;

                if (!m->has_notes[i * 4 + j]) {
                    uint8_t* track = m->tracks[pos_list[k]];

                    for (int mi = 0; ; mi++) {
                        uint8_t cmd = track[mi];

                        if (cmd < 0x80) {
                            m->has_notes[i * 4 + j] = true;
                            break;
                        }

                        if (cmd == TRACK_END_CODE)
                            break;

                        switch (cmd) {
                            case TRACK_INST_CODE:
                            case TRACK_TEMPO_CODE:
                                mi++;
                                break;

                            case TRACK_PORT_CODE:
                                mi += 3;
                                break;
                        }
                    }
                }
            }
        }
    }

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render — stereo interleaved output
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t fred_render(FredModule* module, float* interleaved_stereo, size_t frames) {
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
            FredMixChannel* c = &module->mix_channels[ch];

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

            // Apply volume (0-256 → 0.0-1.0)
            sample *= (float)c->volume / 256.0f;

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

size_t fred_render_multi(FredModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames) {
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
            FredMixChannel* c = &module->mix_channels[ch];
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

            // Apply volume (0-256 → 0.0-1.0)
            sample *= (float)c->volume / 256.0f;

            // Write to per-channel buffer (with same 0.5f scaling as stereo render)
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

FredModule* fred_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < 20)
        return nullptr;

    // Check the mark
    if (memcmp(data, "Fred Editor ", 12) != 0)
        return nullptr;

    // Check the version
    if (data[12] != 0x00 || data[13] != 0x00)
        return nullptr;

    // Check the number of songs
    uint16_t num_songs = (uint16_t)((data[14] << 8) | data[15]);
    if (num_songs > 10)
        return nullptr;

    // Check the end mark
    if (size < 4)
        return nullptr;
    uint32_t end_mark = ((uint32_t)data[size-4] << 24) | ((uint32_t)data[size-3] << 16) |
                         ((uint32_t)data[size-2] << 8) | (uint32_t)data[size-1];
    if (end_mark != 0x12345678)
        return nullptr;

    FredModule* m = (FredModule*)calloc(1, sizeof(FredModule));
    if (!m) return nullptr;

    m->sample_rate = sample_rate;
    m->ticks_per_frame = sample_rate / 50.0f;

    if (!load_module(m, data, size)) {
        fred_destroy(m);
        return nullptr;
    }

    if (m->sub_song_num > 0)
        initialize_sound(m, 0);

    return m;
}

void fred_destroy(FredModule* module) {
    if (!module) return;

    if (module->start_tempos) free(module->start_tempos);

    if (module->positions) {
        for (int i = 0; i < module->sub_song_num; i++) {
            if (module->positions[i]) {
                for (int j = 0; j < 4; j++)
                    free(module->positions[i][j]);
                free(module->positions[i]);
            }
        }
        free(module->positions);
    }

    if (module->tracks) {
        for (int i = 0; i < 128; i++)
            free(module->tracks[i]);
        free(module->tracks);
    }
    if (module->track_sizes) free(module->track_sizes);

    if (module->instruments) {
        for (int i = 0; i < module->inst_num; i++)
            free(module->instruments[i].sample_addr);
        free(module->instruments);
    }

    if (module->has_notes) free(module->has_notes);

    free(module);
}

int fred_subsong_count(const FredModule* module) {
    if (!module) return 0;
    return module->sub_song_num;
}

bool fred_select_subsong(FredModule* module, int subsong) {
    if (!module || subsong < 0 || subsong >= module->sub_song_num)
        return false;

    initialize_sound(module, subsong);
    return true;
}

int fred_channel_count(const FredModule* module) {
    (void)module;
    return 4;
}

void fred_set_channel_mask(FredModule* module, uint32_t mask) {
    if (!module) return;

    for (int i = 0; i < 4; i++)
        module->mix_channels[i].muted = ((mask >> i) & 1) == 0;
}

bool fred_has_ended(const FredModule* module) {
    if (!module) return true;
    return module->has_ended;
}
