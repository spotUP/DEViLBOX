// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Daniel Collin
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)
#include "sidmon2.h"

#include <stdlib.h>
#include <string.h>

#ifndef __cplusplus
#ifndef nullptr
#define nullptr ((void*)0)
#endif
#endif

#define SAMPLE_FRAC_BITS 11

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tables
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static const uint16_t s_periods[] = {
       0,
                      5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3616,
    3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     107,  101,   95
};

#define PERIODS_COUNT (sizeof(s_periods) / sizeof(s_periods[0]))

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

typedef enum EnvelopeState {
    EnvelopeState_Done = 0,
    EnvelopeState_Attack,
    EnvelopeState_Decay,
    EnvelopeState_Sustain,
    EnvelopeState_Release
} EnvelopeState;

typedef struct Instrument {
    uint8_t waveform_list_number;
    uint8_t waveform_list_length;
    uint8_t waveform_list_speed;
    uint8_t waveform_list_delay;
    uint8_t arpeggio_number;
    uint8_t arpeggio_length;
    uint8_t arpeggio_speed;
    uint8_t arpeggio_delay;
    uint8_t vibrato_number;
    uint8_t vibrato_length;
    uint8_t vibrato_speed;
    uint8_t vibrato_delay;
    int8_t pitch_bend_speed;
    uint8_t pitch_bend_delay;
    uint8_t attack_max;
    uint8_t attack_speed;
    uint8_t decay_min;
    uint8_t decay_speed;
    uint8_t sustain_time;
    uint8_t release_min;
    uint8_t release_speed;
} Instrument;

typedef struct Sample {
    uint32_t length;
    uint32_t loop_start;
    uint32_t loop_length;
    int8_t* sample_data;
} Sample;

typedef struct SampleNegateInfo {
    uint32_t start_offset;
    uint32_t end_offset;
    uint16_t loop_index;
    uint16_t status;
    int16_t speed;
    int32_t position;
    uint16_t index;
    int16_t do_negation;
} SampleNegateInfo;

typedef struct Sequence {
    uint8_t track_number;
    int8_t note_transpose;
    int8_t instrument_transpose;
} Sequence;

typedef struct Track {
    uint8_t* track_data;
    uint32_t length;
} Track;

typedef struct VoiceInfo {
    Sequence* sequence_list;
    int8_t* sample_data;
    uint32_t sample_length;
    uint16_t sample_period;
    int16_t sample_volume;
    EnvelopeState envelope_state;
    uint16_t sustain_counter;
    Instrument* instrument;
    int8_t* loop_sample;
    uint32_t loop_offset;
    uint32_t loop_length;
    uint16_t original_note;

    uint16_t wave_list_delay;
    int16_t wave_list_offset;
    uint16_t arpeggio_delay;
    int16_t arpeggio_offset;
    uint16_t vibrato_delay;
    int16_t vibrato_offset;

    uint16_t current_note;
    uint16_t current_instrument;
    uint16_t current_effect;
    uint16_t current_effect_arg;

    uint16_t pitch_bend_counter;
    int16_t instrument_transpose;
    int16_t pitch_bend_value;
    uint16_t note_slide_note;
    int16_t note_slide_speed;
    int32_t track_position;
    uint8_t* current_track;
    uint32_t current_track_length;
    uint16_t empty_notes_counter;
    int16_t note_transpose;
    uint16_t current_sample;
} VoiceInfo;

typedef struct VoiceRender {
    const int8_t* sample_data;
    uint32_t sample_length;
    const int8_t* loop_data;
    uint32_t loop_offset;
    uint32_t loop_length;
    uint32_t sample_pos;    // fixed-point position (SAMPLE_FRAC_BITS)
    uint32_t sample_inc;    // fixed-point increment
    uint16_t volume;
    uint16_t period;
    bool active;
    bool has_pending_sample;
    const int8_t* pending_sample_data;
    uint32_t pending_sample_length;
    bool has_pending_loop;
    const int8_t* pending_loop_data;
    uint32_t pending_loop_offset;
    uint32_t pending_loop_length;
} VoiceRender;

typedef struct Sd2Module {
    // Module data
    uint8_t** waveform_info;    // [list_count][16]
    int32_t waveform_count;
    int8_t** arpeggios;         // [arp_count][16]
    int32_t arpeggio_count;
    int8_t** vibratoes;         // [vib_count][16]
    int32_t vibrato_count;
    Sequence* sequences;        // [4 * num_positions]
    int32_t num_positions;      // number of positions per channel
    Track* tracks;
    int32_t track_count;
    Instrument* instruments;
    int32_t instrument_count;
    Sample* samples;
    int32_t sample_count;
    SampleNegateInfo* sample_negate_info;

    // Playback state
    int8_t current_position;
    uint8_t current_row;
    uint8_t pattern_length;
    uint8_t current_rast;
    uint8_t current_rast2;
    uint8_t speed;
    uint8_t start_speed;
    uint8_t number_of_positions;  // max position index (numberOfPositions in C#, after decrement)

    VoiceInfo voices[4];
    VoiceRender voice_render[4];

    float sample_rate;
    float frames_per_tick;
    float frames_until_tick;
    uint32_t channel_mask;
    bool ended;
} Sd2Module;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Byte-reading helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint8_t read_u8(const uint8_t* data, size_t* pos) {
    return data[(*pos)++];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int8_t read_i8(const uint8_t* data, size_t* pos) {
    return (int8_t)data[(*pos)++];
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint16_t read_be16(const uint8_t* data, size_t* pos) {
    uint16_t val = (uint16_t)((data[*pos] << 8) | data[*pos + 1]);
    *pos += 2;
    return val;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int16_t read_be16_signed(const uint8_t* data, size_t* pos) {
    return (int16_t)read_be16(data, pos);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static uint32_t read_be32(const uint8_t* data, size_t* pos) {
    uint32_t val = ((uint32_t)data[*pos] << 24) | ((uint32_t)data[*pos + 1] << 16)
                   | ((uint32_t)data[*pos + 2] << 8) | (uint32_t)data[*pos + 3];
    *pos += 4;
    return val;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static int32_t read_be32_signed(const uint8_t* data, size_t* pos) {
    return (int32_t)read_be32(data, pos);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Module parsing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool sd2_identify(const uint8_t* data, size_t size) {
    if (size < 86) {
        return false;
    }
    // Check "SIDMON II - THE MIDI VERSION" at offset 58
    return memcmp(data + 58, "SIDMON II - THE MIDI VERSION", 28) == 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_single_list_u8(const uint8_t* data, size_t size, uint32_t offset, uint32_t length,
                                uint8_t*** out_list, int32_t* out_count) {
    if ((length % 16) != 0 || offset + length > size) {
        return false;
    }

    uint32_t count = length / 16;
    uint8_t** list = (uint8_t**)calloc(count, sizeof(uint8_t*));
    uint8_t* block = (uint8_t*)malloc(length);
    if (list == nullptr || block == nullptr) {
        free(list);
        free(block);
        return false;
    }

    memcpy(block, data + offset, length);
    for (uint32_t i = 0; i < count; i++) {
        list[i] = block + i * 16;
    }

    *out_list = list;
    *out_count = (int32_t)count;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_single_list_i8(const uint8_t* data, size_t size, uint32_t offset, uint32_t length,
                                int8_t*** out_list, int32_t* out_count) {
    if ((length % 16) != 0 || offset + length > size) {
        return false;
    }

    uint32_t count = length / 16;
    int8_t** list = (int8_t**)calloc(count, sizeof(int8_t*));
    int8_t* block = (int8_t*)malloc(length);
    if (list == nullptr || block == nullptr) {
        free(list);
        free(block);
        return false;
    }

    memcpy(block, data + offset, length);
    for (uint32_t i = 0; i < count; i++) {
        list[i] = block + i * 16;
    }

    *out_list = list;
    *out_count = (int32_t)count;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_sequences(const uint8_t* data, size_t size, uint32_t pos_offset, uint32_t pos_length,
                           uint32_t note_offset, uint32_t note_length, uint32_t inst_offset, uint32_t inst_length,
                           uint8_t num_positions, Sequence** out_sequences) {
    if (pos_length != note_length || note_length != inst_length) {
        return false;
    }
    if (pos_length != (uint32_t)(num_positions * 4)) {
        return false;
    }
    if (pos_offset + pos_length > size || note_offset + note_length > size || inst_offset + inst_length > size) {
        return false;
    }

    // 4 channels * num_positions
    Sequence* seqs = (Sequence*)calloc(4 * num_positions, sizeof(Sequence));
    if (seqs == nullptr) {
        return false;
    }

    for (int ch = 0; ch < 4; ch++) {
        for (int j = 0; j < num_positions; j++) {
            int idx = ch * num_positions + j;
            int src_idx = ch * num_positions + j;
            seqs[idx].track_number = data[pos_offset + src_idx];
            seqs[idx].note_transpose = (int8_t)data[note_offset + src_idx];
            seqs[idx].instrument_transpose = (int8_t)data[inst_offset + src_idx];
        }
    }

    *out_sequences = seqs;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_tracks(const uint8_t* data, size_t size, uint32_t table_offset, uint32_t table_length,
                        uint32_t tracks_offset, uint32_t tracks_length, Track** out_tracks, int32_t* out_count,
                        uint32_t* out_sample_offset) {
    uint32_t num_tracks = table_length / 2;
    if (table_offset + table_length > size || tracks_offset + tracks_length > size) {
        return false;
    }

    // Read track offset table
    uint16_t* track_offsets = (uint16_t*)calloc(num_tracks, sizeof(uint16_t));
    if (track_offsets == nullptr) {
        return false;
    }

    size_t tpos = table_offset;
    for (uint32_t i = 0; i < num_tracks; i++) {
        track_offsets[i] = read_be16(data, &tpos);
    }

    Track* trks = (Track*)calloc(num_tracks, sizeof(Track));
    if (trks == nullptr) {
        free(track_offsets);
        return false;
    }

    for (uint32_t i = 0; i < num_tracks; i++) {
        uint32_t track_len = (i == num_tracks - 1 ? tracks_length : track_offsets[i + 1]) - track_offsets[i];
        uint32_t src = tracks_offset + track_offsets[i];
        if (src + track_len > size) {
            // Truncate to available data
            track_len = (src < size) ? (uint32_t)(size - src) : 0;
        }

        trks[i].track_data = (uint8_t*)malloc(track_len > 0 ? track_len : 1);
        if (trks[i].track_data == nullptr) {
            for (uint32_t j = 0; j < i; j++) {
                free(trks[j].track_data);
            }
            free(trks);
            free(track_offsets);
            return false;
        }
        if (track_len > 0) {
            memcpy(trks[i].track_data, data + src, track_len);
        }
        trks[i].length = track_len;
    }

    // Sample data starts right after tracks block.
    // Note: C# has "sampleOffset % 1 != 0" which is always false (no-op).
    uint32_t sample_off = tracks_offset + tracks_length;

    *out_tracks = trks;
    *out_count = (int32_t)num_tracks;
    *out_sample_offset = sample_off;

    free(track_offsets);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_instruments(const uint8_t* data, size_t size, uint32_t offset, uint32_t length,
                             Instrument** out_instruments, int32_t* out_count) {
    if ((length % 32) != 0) {
        return false;
    }
    if (offset + length > size) {
        return false;
    }

    uint32_t count = length / 32;
    Instrument* insts = (Instrument*)calloc(count, sizeof(Instrument));
    if (insts == nullptr) {
        return false;
    }

    size_t pos = offset;
    for (uint32_t i = 0; i < count; i++) {
        insts[i].waveform_list_number = read_u8(data, &pos);
        insts[i].waveform_list_length = read_u8(data, &pos);
        insts[i].waveform_list_speed = read_u8(data, &pos);
        insts[i].waveform_list_delay = read_u8(data, &pos);
        insts[i].arpeggio_number = read_u8(data, &pos);
        insts[i].arpeggio_length = read_u8(data, &pos);
        insts[i].arpeggio_speed = read_u8(data, &pos);
        insts[i].arpeggio_delay = read_u8(data, &pos);
        insts[i].vibrato_number = read_u8(data, &pos);
        insts[i].vibrato_length = read_u8(data, &pos);
        insts[i].vibrato_speed = read_u8(data, &pos);
        insts[i].vibrato_delay = read_u8(data, &pos);
        insts[i].pitch_bend_speed = read_i8(data, &pos);
        insts[i].pitch_bend_delay = read_u8(data, &pos);
        pos += 2; // skip 2 bytes
        insts[i].attack_max = read_u8(data, &pos);
        insts[i].attack_speed = read_u8(data, &pos);
        insts[i].decay_min = read_u8(data, &pos);
        insts[i].decay_speed = read_u8(data, &pos);
        insts[i].sustain_time = read_u8(data, &pos);
        insts[i].release_min = read_u8(data, &pos);
        insts[i].release_speed = read_u8(data, &pos);
        pos += 9; // skip 9 bytes
    }

    *out_instruments = insts;
    *out_count = (int32_t)count;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool load_samples(const uint8_t* data, size_t size, uint32_t sample_offset, uint16_t num_samples,
                         uint32_t info_offset, uint32_t info_length, Sample** out_samples,
                         SampleNegateInfo** out_negate) {
    if (info_offset + info_length > size) {
        return false;
    }

    Sample* samps = (Sample*)calloc(num_samples, sizeof(Sample));
    SampleNegateInfo* negates = (SampleNegateInfo*)calloc(num_samples, sizeof(SampleNegateInfo));
    if (samps == nullptr || negates == nullptr) {
        free(samps);
        free(negates);
        return false;
    }

    // Read sample info (each entry is 64 bytes: 4 ptr + 6 sample + 22 negate + 4 skip + 32 name = 68 bytes? )
    // Actually: 4 (ptr) + 2+2+2 (len/loopstart/looplen) + 2+2+2+2+2+4+2+2 (negate=18) + 4 (skip) + 32 (name) = 64
    size_t pos = info_offset;
    for (int i = 0; i < num_samples; i++) {
        if (pos + 64 > size) {
            free(samps);
            free(negates);
            return false;
        }

        pos += 4; // skip sample data pointer

        samps[i].length = (uint32_t)read_be16(data, &pos) * 2;
        samps[i].loop_start = (uint32_t)read_be16(data, &pos) * 2;
        samps[i].loop_length = (uint32_t)read_be16(data, &pos) * 2;

        if (samps[i].loop_start > samps[i].length) {
            samps[i].loop_start = 0;
            samps[i].loop_length = 0;
        } else if (samps[i].loop_start + samps[i].loop_length > samps[i].length) {
            samps[i].loop_length = samps[i].length - samps[i].loop_start;
        }

        // Negate info
        negates[i].start_offset = (uint32_t)read_be16(data, &pos) * 2;
        negates[i].end_offset = (uint32_t)read_be16(data, &pos) * 2;
        negates[i].loop_index = read_be16(data, &pos);
        negates[i].status = read_be16(data, &pos);
        negates[i].speed = read_be16_signed(data, &pos);
        negates[i].position = read_be32_signed(data, &pos);
        negates[i].index = read_be16(data, &pos);
        negates[i].do_negation = read_be16_signed(data, &pos);

        pos += 4;  // skip 4 bytes
        pos += 32; // skip name
    }

    // Read sample data
    size_t sdata_pos = sample_offset;
    for (int i = 0; i < num_samples; i++) {
        if (samps[i].length == 0) {
            samps[i].sample_data = (int8_t*)calloc(4, 1);
            continue;
        }
        if (sdata_pos + samps[i].length > size) {
            // Truncate or fail
            uint32_t avail = (sdata_pos < size) ? (uint32_t)(size - sdata_pos) : 0;
            samps[i].sample_data = (int8_t*)calloc(samps[i].length, 1);
            if (samps[i].sample_data != nullptr && avail > 0) {
                memcpy(samps[i].sample_data, data + sdata_pos, avail);
            }
            sdata_pos += samps[i].length;
            continue;
        }
        samps[i].sample_data = (int8_t*)malloc(samps[i].length);
        if (samps[i].sample_data == nullptr) {
            // cleanup
            for (int j = 0; j < i; j++) {
                free(samps[j].sample_data);
            }
            free(samps);
            free(negates);
            return false;
        }
        memcpy(samps[i].sample_data, data + sdata_pos, samps[i].length);
        sdata_pos += samps[i].length;
    }

    *out_samples = samps;
    *out_negate = negates;
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static bool sd2_parse(Sd2Module* mod, const uint8_t* data, size_t size) {
    if (!sd2_identify(data, size)) {
        return false;
    }

    size_t pos = 2; // skip MIDI mode
    uint8_t num_pos = read_u8(data, &pos);
    num_pos++;
    mod->start_speed = read_u8(data, &pos);

    uint16_t num_samples = read_be16(data, &pos);
    num_samples /= 64;

    // Block offsets: start after header
    // offset 6: 10 x uint32 block lengths
    // Block data starts at offset 58 + id_length + song_length_length

    uint32_t offset = 58;

    // Read id_length and song_length_length
    uint32_t id_length = read_be32(data, &pos);     // at pos 6
    uint32_t song_len_length = read_be32(data, &pos); // at pos 10

    offset += id_length;
    offset += song_len_length;

    // Read 10 block lengths
    uint32_t block_lengths[10];
    for (int i = 0; i < 10; i++) {
        block_lengths[i] = read_be32(data, &pos);
    }

    // Compute block offsets
    uint32_t block_offsets[10];
    uint32_t cur_offset = offset;
    for (int i = 0; i < 10; i++) {
        block_offsets[i] = cur_offset;
        cur_offset += block_lengths[i];
    }

    // Block indices (from C# LoadSongData order):
    // 0: positionTable, 1: noteTranspose, 2: instrumentTranspose
    // 3: instruments, 4: waveformList, 5: arpeggios
    // 6: vibratoes, 7: sampleInfo, 8: trackTable, 9: tracks

    // Load lists
    if (!load_single_list_u8(data, size, block_offsets[4], block_lengths[4],
                             &mod->waveform_info, &mod->waveform_count)) {
        return false;
    }

    if (!load_single_list_i8(data, size, block_offsets[5], block_lengths[5],
                             &mod->arpeggios, &mod->arpeggio_count)) {
        return false;
    }

    if (!load_single_list_i8(data, size, block_offsets[6], block_lengths[6],
                             &mod->vibratoes, &mod->vibrato_count)) {
        return false;
    }

    // Load sequences
    mod->num_positions = num_pos;
    if (!load_sequences(data, size, block_offsets[0], block_lengths[0],
                        block_offsets[1], block_lengths[1],
                        block_offsets[2], block_lengths[2],
                        num_pos, &mod->sequences)) {
        return false;
    }

    // Load tracks
    uint32_t sample_data_offset = 0;
    if (!load_tracks(data, size, block_offsets[8], block_lengths[8],
                     block_offsets[9], block_lengths[9],
                     &mod->tracks, &mod->track_count, &sample_data_offset)) {
        return false;
    }

    // Load instruments
    if (!load_instruments(data, size, block_offsets[3], block_lengths[3],
                          &mod->instruments, &mod->instrument_count)) {
        return false;
    }

    // Load samples
    mod->sample_count = num_samples;
    if (!load_samples(data, size, sample_data_offset, num_samples,
                      block_offsets[7], block_lengths[7],
                      &mod->samples, &mod->sample_negate_info)) {
        return false;
    }

    // numberOfPositions-- (C# does this after loading)
    mod->number_of_positions = (uint8_t)(num_pos - 1);

    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Voice rendering helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void update_period(VoiceRender* vr, uint16_t period, float sample_rate) {
    vr->period = period;
    if (period > 0) {
        // NP mixer: frequency = 3546895 / period (integer), then increment = (freq << FracBits) / mixerRate
        uint32_t frequency = 3546895 / period;
        vr->sample_inc = (uint32_t)(((uint64_t)frequency << SAMPLE_FRAC_BITS) / (uint32_t)sample_rate);
    } else {
        vr->sample_inc = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void voice_render_play_sample(VoiceRender* vr, const int8_t* sample_data, uint32_t offset,
                                     uint32_t length) {
    // Matches C# PlaySample: sets sampleInfo immediately, clears newSampleInfo and loop
    vr->sample_data = sample_data;
    vr->sample_length = offset + length;
    vr->sample_pos = offset << SAMPLE_FRAC_BITS;
    vr->active = true;
    vr->has_pending_sample = false;
    vr->has_pending_loop = false;
    // Clear loop (C#: sampleInfo.Loop = null)
    vr->loop_data = nullptr;
    vr->loop_offset = 0;
    vr->loop_length = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void voice_render_set_loop(VoiceRender* vr, const int8_t* loop_data, uint32_t loop_offset,
                                  uint32_t loop_length) {
    // C# SetLoop: operates on newSampleInfo ?? sampleInfo
    // If there's a pending sample, set loop on it; otherwise set directly on current
    if (vr->has_pending_sample) {
        vr->has_pending_loop = true;
        vr->pending_loop_data = loop_data;
        vr->pending_loop_offset = loop_offset;
        vr->pending_loop_length = loop_length;
    } else {
        vr->loop_data = loop_data;
        vr->loop_offset = loop_offset;
        vr->loop_length = loop_length;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void voice_render_set_sample(VoiceRender* vr, const int8_t* sample_data, uint32_t offset,
                                    uint32_t length) {
    vr->has_pending_sample = true;
    vr->pending_sample_data = sample_data;
    vr->pending_sample_length = offset + length;
    vr->pending_loop_data = sample_data;
    vr->pending_loop_offset = offset;
    vr->pending_loop_length = length;
    vr->has_pending_loop = true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void voice_render_mute(VoiceRender* vr) {
    vr->active = false;
    vr->volume = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player state init
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void find_note(Sd2Module* mod, VoiceInfo* vi) {
    Sequence* seq = &mod->sequences[0]; // base for this channel
    // Find correct sequence for this channel
    int ch_idx = (int)(vi - &mod->voices[0]);
    seq = &mod->sequences[ch_idx * mod->num_positions + mod->current_position];

    if (seq->track_number < mod->track_count) {
        vi->current_track = mod->tracks[seq->track_number].track_data;
        vi->current_track_length = mod->tracks[seq->track_number].length;
    } else {
        vi->current_track = nullptr;
        vi->current_track_length = 0;
    }
    vi->track_position = 0;
    vi->note_transpose = seq->note_transpose;
    vi->instrument_transpose = seq->instrument_transpose;
    vi->empty_notes_counter = 0;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void init_sound(Sd2Module* mod) {
    mod->current_position = 0;
    mod->current_row = 0;
    mod->pattern_length = 64;
    mod->current_rast = 0;
    mod->current_rast2 = 0;
    mod->speed = mod->start_speed;

    for (int i = 0; i < 4; i++) {
        VoiceInfo* vi = &mod->voices[i];
        memset(vi, 0, sizeof(VoiceInfo));

        vi->sequence_list = &mod->sequences[i * mod->num_positions];

        Instrument* inst = &mod->instruments[0];
        vi->instrument = inst;

        uint8_t sample_number = mod->waveform_info[inst->waveform_list_number][0];
        vi->current_sample = sample_number;

        if (sample_number < mod->sample_count) {
            Sample* smp = &mod->samples[sample_number];
            vi->sample_data = smp->sample_data;
            vi->sample_length = smp->length;
            vi->loop_sample = smp->sample_data;
            vi->loop_offset = smp->loop_start;
            vi->loop_length = smp->loop_length;
        }

        vi->envelope_state = EnvelopeState_Attack;
        vi->sample_period = 0;

        // Init render state
        VoiceRender* vr = &mod->voice_render[i];
        memset(vr, 0, sizeof(VoiceRender));

        find_note(mod, vi);
    }

    // frames_per_tick: NostalgicPlayer default is 50Hz (PAL VBI)
    mod->frames_per_tick = mod->sample_rate / 50.0f;
    mod->frames_until_tick = 0.0f;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Note and voice processing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_note2(Sd2Module* mod, VoiceInfo* vi) {
    uint8_t* track_data = vi->current_track;

    vi->current_note = 0;
    vi->current_instrument = 0;
    vi->current_effect = 0;
    vi->current_effect_arg = 0;

    if (vi->empty_notes_counter == 0) {
        int8_t track_value;
        if (track_data == nullptr || vi->track_position >= (int32_t)vi->current_track_length) {
            track_value = -1;
        } else {
            track_value = (int8_t)track_data[vi->track_position++];
        }

        if (track_value == 0) {
            if (vi->track_position + 1 < (int32_t)vi->current_track_length) {
                vi->current_effect = track_data[vi->track_position++];
                vi->current_effect_arg = track_data[vi->track_position++];
            }
            return;
        }

        if (track_value > 0) {
            if (track_value >= 0x70) {
                vi->current_effect = (uint8_t)track_value;
                if (vi->track_position < (int32_t)vi->current_track_length) {
                    vi->current_effect_arg = track_data[vi->track_position++];
                }
                return;
            }

            vi->current_note = (uint16_t)track_value;

            if (vi->track_position < (int32_t)vi->current_track_length) {
                track_value = (int8_t)track_data[vi->track_position++];
                if (track_value >= 0) {
                    if (track_value >= 0x70) {
                        vi->current_effect = (uint8_t)track_value;
                        if (vi->track_position < (int32_t)vi->current_track_length) {
                            vi->current_effect_arg = track_data[vi->track_position++];
                        }
                        return;
                    }

                    vi->current_instrument = (uint16_t)track_value;

                    if (vi->track_position < (int32_t)vi->current_track_length) {
                        track_value = (int8_t)track_data[vi->track_position++];
                        if (track_value >= 0) {
                            vi->current_effect = (uint8_t)track_value;
                            if (vi->track_position < (int32_t)vi->current_track_length) {
                                vi->current_effect_arg = track_data[vi->track_position++];
                            }
                            return;
                        }
                    } else {
                        return;
                    }
                }
            } else {
                return;
            }
        }

        vi->empty_notes_counter = (uint16_t)(~(int)track_value);
    } else {
        vi->empty_notes_counter--;
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_note(Sd2Module* mod, VoiceInfo* vi) {
    get_note2(mod, vi);

    if (vi->current_note != 0) {
        vi->current_note = (uint16_t)(vi->current_note + vi->note_transpose);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void play_voice(Sd2Module* mod, VoiceInfo* vi, VoiceRender* vr) {
    vi->pitch_bend_value = 0;

    if (vi->current_note != 0) {
        vi->sample_volume = 0;
        vi->wave_list_delay = 0;
        vi->wave_list_offset = 0;
        vi->arpeggio_delay = 0;
        vi->arpeggio_offset = 0;
        vi->vibrato_delay = 0;
        vi->vibrato_offset = 0;
        vi->pitch_bend_counter = 0;
        vi->note_slide_speed = 0;

        vi->envelope_state = EnvelopeState_Attack;
        vi->sustain_counter = 0;

        uint16_t instrument = vi->current_instrument;
        if (instrument != 0) {
            instrument = (uint16_t)(instrument - 1 + vi->instrument_transpose);
            if (instrument < (uint16_t)mod->instrument_count) {
                vi->instrument = &mod->instruments[instrument];

                if (vi->instrument->waveform_list_number < mod->waveform_count) {
                    uint8_t* waveform_list = mod->waveform_info[vi->instrument->waveform_list_number];
                    vi->current_sample = waveform_list[0];

                    if (vi->current_sample < (uint16_t)mod->sample_count) {
                        Sample* smp = &mod->samples[vi->current_sample];
                        vi->sample_data = smp->sample_data;
                        vi->sample_length = smp->length;
                        vi->loop_sample = smp->sample_data;
                        vi->loop_offset = smp->loop_start;
                        vi->loop_length = smp->loop_length;
                    }
                }
            }
        }

        if (vi->instrument->arpeggio_number < mod->arpeggio_count) {
            int8_t* arpeggio = mod->arpeggios[vi->instrument->arpeggio_number];
            int note = vi->current_note + arpeggio[0];
            if (note >= 0 && note < (int)PERIODS_COUNT) {
                vi->original_note = (uint16_t)note;
                vi->sample_period = s_periods[note];

                if (vi->sample_length != 0) {
                    voice_render_play_sample(vr, vi->sample_data, 0, vi->sample_length);

                    if (vi->loop_length > 2) {
                        voice_render_set_loop(vr, vi->loop_sample, vi->loop_offset, vi->loop_length);
                    }
                } else {
                    voice_render_mute(vr);
                }
            } else {
                voice_render_mute(vr);
            }
        } else {
            voice_render_mute(vr);
        }

        update_period(vr, vi->sample_period, mod->sample_rate);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Effect processing
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_adsr_curve(VoiceInfo* vi, VoiceRender* vr) {
    Instrument* inst = vi->instrument;
    (void)vr;

    switch (vi->envelope_state) {
        case EnvelopeState_Attack:
            vi->sample_volume += inst->attack_speed;
            if (vi->sample_volume >= inst->attack_max) {
                vi->sample_volume = inst->attack_max;
                vi->envelope_state = EnvelopeState_Decay;
            }
            break;

        case EnvelopeState_Decay:
            if (inst->decay_speed == 0) {
                vi->envelope_state = EnvelopeState_Sustain;
            } else {
                vi->sample_volume -= inst->decay_speed;
                if (vi->sample_volume <= inst->decay_min) {
                    vi->sample_volume = inst->decay_min;
                    vi->envelope_state = EnvelopeState_Sustain;
                }
            }
            break;

        case EnvelopeState_Sustain:
            if (vi->sustain_counter == inst->sustain_time) {
                vi->envelope_state = EnvelopeState_Release;
            } else {
                vi->sustain_counter++;
            }
            break;

        case EnvelopeState_Release:
            if (inst->release_speed == 0) {
                vi->envelope_state = EnvelopeState_Done;
            } else {
                vi->sample_volume -= inst->release_speed;
                if (vi->sample_volume <= inst->release_min) {
                    vi->sample_volume = inst->release_min;
                    vi->envelope_state = EnvelopeState_Done;
                }
            }
            break;

        case EnvelopeState_Done:
            break;
    }

    // SetVolume maps to vr->volume. C# uses 0-256 range.
    uint16_t vol = (vi->sample_volume < 0) ? 0 : (uint16_t)vi->sample_volume;
    vr->volume = vol;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_waveform(Sd2Module* mod, VoiceInfo* vi, VoiceRender* vr) {
    Instrument* inst = vi->instrument;

    if (inst->waveform_list_length != 0) {
        if (vi->wave_list_delay == inst->waveform_list_delay) {
            vi->wave_list_delay -= inst->waveform_list_speed;

            if (vi->wave_list_offset == inst->waveform_list_length) {
                vi->wave_list_offset = -1;
            }

            vi->wave_list_offset++;

            if (inst->waveform_list_number < mod->waveform_count && vi->wave_list_offset < 16) {
                int8_t waveform_value =
                    (int8_t)mod->waveform_info[inst->waveform_list_number][vi->wave_list_offset];
                if (waveform_value >= 0) {
                    vi->current_sample = (uint16_t)waveform_value;

                    if (vi->current_sample < (uint16_t)mod->sample_count) {
                        Sample* smp = &mod->samples[vi->current_sample];
                        vi->loop_sample = smp->sample_data;
                        vi->loop_offset = smp->loop_start;
                        vi->loop_length = smp->loop_length;

                        if (vr->active) {
                            // SetSample (deferred) + SetLoop
                            voice_render_set_sample(vr, vi->loop_sample, vi->loop_offset, vi->loop_length);
                            // The C# also calls SetLoop(offset, length) separately but set_sample already sets loop
                        }
                    }
                } else {
                    vi->wave_list_offset--;
                }
            }
        } else {
            vi->wave_list_delay++;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_arpeggio(Sd2Module* mod, VoiceInfo* vi) {
    Instrument* inst = vi->instrument;

    if (inst->arpeggio_length != 0) {
        if (vi->arpeggio_delay == inst->arpeggio_delay) {
            vi->arpeggio_delay -= inst->arpeggio_speed;

            if (vi->arpeggio_offset == inst->arpeggio_length) {
                vi->arpeggio_offset = -1;
            }

            vi->arpeggio_offset++;

            if (inst->arpeggio_number < mod->arpeggio_count && vi->arpeggio_offset < 16) {
                int8_t arp_value = mod->arpeggios[inst->arpeggio_number][vi->arpeggio_offset];
                int16_t new_note = (int16_t)(vi->original_note + arp_value);
                if (new_note >= 0 && new_note < (int16_t)PERIODS_COUNT) {
                    vi->sample_period = s_periods[new_note];
                }
            }
        } else {
            vi->arpeggio_delay++;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_vibrato(Sd2Module* mod, VoiceInfo* vi) {
    Instrument* inst = vi->instrument;

    if (inst->vibrato_length != 0) {
        if (vi->vibrato_delay == inst->vibrato_delay) {
            vi->vibrato_delay -= inst->vibrato_speed;

            if (vi->vibrato_offset == inst->vibrato_length) {
                vi->vibrato_offset = -1;
            }

            vi->vibrato_offset++;

            if (inst->vibrato_number < mod->vibrato_count && vi->vibrato_offset < 16) {
                int8_t vib_value = mod->vibratoes[inst->vibrato_number][vi->vibrato_offset];
                vi->sample_period = (uint16_t)(vi->sample_period + vib_value);
            }
        } else {
            vi->vibrato_delay++;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_pitch_bend(VoiceInfo* vi) {
    Instrument* inst = vi->instrument;

    if (inst->pitch_bend_speed != 0) {
        if (vi->pitch_bend_counter == inst->pitch_bend_delay) {
            vi->pitch_bend_value = (int16_t)(vi->pitch_bend_value + inst->pitch_bend_speed);
        } else {
            vi->pitch_bend_counter++;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_note_slide(VoiceInfo* vi) {
    if (vi->current_effect != 0 && vi->current_effect < 0x70 && vi->current_effect_arg != 0) {
        if (vi->current_effect < PERIODS_COUNT) {
            vi->note_slide_note = s_periods[vi->current_effect];
        }

        int direction = (int)vi->note_slide_note - (int)vi->sample_period;
        if (direction == 0) {
            return;
        }

        int16_t effect_arg = (int16_t)vi->current_effect_arg;
        if (direction < 0) {
            effect_arg = (int16_t)-effect_arg;
        }

        vi->note_slide_speed = effect_arg;
    }

    int16_t speed = vi->note_slide_speed;
    if (speed != 0) {
        if (speed < 0) {
            vi->sample_period = (uint16_t)(vi->sample_period + speed);
            if (vi->sample_period <= vi->note_slide_note) {
                vi->sample_period = vi->note_slide_note;
                vi->note_slide_speed = 0;
            }
        } else {
            vi->sample_period = (uint16_t)(vi->sample_period + speed);
            if (vi->sample_period >= vi->note_slide_note) {
                vi->sample_period = vi->note_slide_note;
                vi->note_slide_speed = 0;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_sound_tracker(Sd2Module* mod, VoiceInfo* vi, VoiceRender* vr) {
    uint16_t effect = vi->current_effect;
    if (effect >= 0x70) {
        effect &= 0x0f;

        if (mod->current_rast != 0 || effect >= 5) {
            switch (effect) {
                // Arpeggio
                case 0x0: {
                    uint8_t arp_tab[] = {
                        (uint8_t)(vi->current_effect_arg >> 4),
                        0,
                        (uint8_t)(vi->current_effect_arg & 0x0f),
                        0
                    };
                    uint8_t arp_value = arp_tab[mod->current_rast2];
                    int idx = vi->original_note + arp_value;
                    if (idx >= 0 && idx < (int)PERIODS_COUNT) {
                        vi->sample_period = s_periods[idx];
                    }
                    break;
                }

                // Pitch up
                case 0x1:
                    vi->pitch_bend_value = (int16_t)(-(int16_t)vi->current_effect_arg);
                    break;

                // Pitch down
                case 0x2:
                    vi->pitch_bend_value = (int16_t)vi->current_effect_arg;
                    break;

                // Volume up
                case 0x3:
                    if (vi->envelope_state == EnvelopeState_Done) {
                        if (mod->current_rast == 0 && vi->current_instrument != 0) {
                            vi->sample_volume = vi->instrument->attack_speed;
                        }
                        int16_t volume = (int16_t)(vi->sample_volume + vi->current_effect_arg * 4);
                        if (volume >= 256) {
                            volume = 255;
                        }
                        vi->sample_volume = volume;
                    }
                    break;

                // Volume down
                case 0x4:
                    if (vi->envelope_state == EnvelopeState_Done) {
                        if (mod->current_rast == 0 && vi->current_instrument != 0) {
                            vi->sample_volume = vi->instrument->attack_speed;
                        }
                        int16_t volume = (int16_t)(vi->sample_volume - vi->current_effect_arg * 4);
                        if (volume < 0) {
                            volume = 0;
                        }
                        vi->sample_volume = volume;
                    }
                    break;

                // Set ADSR attack
                case 0x5:
                    vi->instrument->attack_max = (uint8_t)vi->current_effect_arg;
                    vi->instrument->attack_speed = (uint8_t)vi->current_effect_arg;
                    break;

                // Set pattern length
                case 0x6:
                    if (vi->current_effect_arg != 0) {
                        mod->pattern_length = (uint8_t)vi->current_effect_arg;
                    }
                    break;

                // Volume change
                case 0xc: {
                    uint16_t volume = vi->current_effect_arg;
                    if (volume > 64) {
                        volume = 64;
                    }
                    // SetAmigaVolume: convert 0-64 to mixer volume
                    // We store the *4 version as sample_volume
                    uint16_t vol4 = volume * 4;
                    if (vol4 >= 255) {
                        vol4 = 255;
                    }
                    vi->sample_volume = (int16_t)vol4;
                    vr->volume = vol4;
                    break;
                }

                // Speed change
                case 0xf: {
                    uint8_t new_speed = (uint8_t)(vi->current_effect_arg & 0x0f);
                    if (new_speed != 0 && new_speed != mod->speed) {
                        mod->speed = new_speed;
                    }
                    break;
                }

                default:
                    break;
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_effect(Sd2Module* mod, VoiceInfo* vi, VoiceRender* vr) {
    do_adsr_curve(vi, vr);
    do_waveform(mod, vi, vr);
    do_arpeggio(mod, vi);
    do_sound_tracker(mod, vi, vr);
    do_vibrato(mod, vi);
    do_pitch_bend(vi);
    do_note_slide(vi);

    vi->sample_period = (uint16_t)(vi->sample_period + vi->pitch_bend_value);

    if (vi->sample_period < 95) {
        vi->sample_period = 95;
    } else if (vi->sample_period > 5760) {
        vi->sample_period = 5760;
    }

    update_period(vr, vi->sample_period, mod->sample_rate);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Sample negation
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void do_negation(Sd2Module* mod) {
    SampleNegateInfo* working[4];

    for (int i = 0; i < 4; i++) {
        VoiceInfo* vi = &mod->voices[i];
        uint16_t sample_number = vi->current_sample;
        if (sample_number >= (uint16_t)mod->sample_count) {
            working[i] = nullptr;
            continue;
        }
        SampleNegateInfo* ni = &mod->sample_negate_info[sample_number];
        working[i] = ni;

        if (ni->do_negation == 0) {
            ni->do_negation = -1;

            if (ni->index == 0) {
                ni->index = ni->loop_index;

                if (ni->status != 0) {
                    Sample* smp = &mod->samples[sample_number];
                    uint32_t end_offset = ni->end_offset - 1;

                    int32_t position = (int32_t)(ni->start_offset + ni->position);
                    if (position >= 0 && position < (int32_t)smp->length) {
                        smp->sample_data[position] = (int8_t)~smp->sample_data[position];
                    }

                    ni->position += ni->speed;
                    if (ni->position < 0) {
                        if (ni->status == 2) {
                            ni->position = (int32_t)end_offset;
                        } else {
                            ni->position += -ni->speed;
                            ni->speed = (int16_t)-ni->speed;
                        }
                    } else {
                        if ((uint32_t)ni->position > end_offset) {
                            if (ni->status == 1) {
                                ni->position = 0;
                            } else {
                                ni->position += -ni->speed;
                                ni->speed = (int16_t)-ni->speed;
                            }
                        }
                    }
                }
            } else {
                ni->index++;
                ni->index &= 0x1f;
            }
        }
    }

    for (int i = 0; i < 4; i++) {
        if (working[i] != nullptr) {
            working[i]->do_negation = 0;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Tick function
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void player_tick(Sd2Module* mod) {
    mod->current_rast2++;
    if (mod->current_rast2 == 3) {
        mod->current_rast2 = 0;
    }

    mod->current_rast++;
    if (mod->current_rast >= mod->speed) {
        mod->current_rast = 0;
        mod->current_rast2 = 0;

        for (int i = 0; i < 4; i++) {
            get_note(mod, &mod->voices[i]);
        }

        for (int i = 0; i < 4; i++) {
            play_voice(mod, &mod->voices[i], &mod->voice_render[i]);
        }

        do_negation(mod);

        mod->current_row++;
        if (mod->current_row == mod->pattern_length) {
            mod->current_row = 0;

            if (mod->current_position == mod->number_of_positions) {
                mod->current_position = -1;
                mod->ended = true;
            }

            mod->current_position++;

            for (int i = 0; i < 4; i++) {
                find_note(mod, &mod->voices[i]);
            }
        }
    }

    for (int i = 0; i < 4; i++) {
        do_effect(mod, &mod->voices[i], &mod->voice_render[i]);
    }

    if (mod->current_rast != 0) {
        do_negation(mod);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Render function
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void mix_voices(Sd2Module* mod, float* stereo, size_t frames) {
    for (int ch = 0; ch < 4; ch++) {
        if (!(mod->channel_mask & (1U << ch))) {
            continue;
        }

        VoiceRender* vr = &mod->voice_render[ch];
        if (!vr->active || vr->sample_inc == 0) {
            continue;
        }

        float gain = (float)vr->volume / 512.0f; // 0-256 range / 256 * 0.5 NP mixer gain
        // Amiga panning: 0,3=left, 1,2=right
        int stereo_ch = (ch == 0 || ch == 3) ? 0 : 1;

        // Compute fixed-point end positions (matching NP mixer: ((start+length) << FracBits) - 1)
        uint32_t idx_end = vr->sample_length > 0
            ? (vr->sample_length << SAMPLE_FRAC_BITS) - 1 : 0;
        uint32_t idx_loop_end = (vr->loop_length > 2)
            ? ((vr->loop_offset + vr->loop_length) << SAMPLE_FRAC_BITS) - 1 : 0;
        uint32_t idx_loop_start = vr->loop_offset << SAMPLE_FRAC_BITS;

        for (size_t i = 0; i < frames; i++) {
            // Check loop/end boundaries (NP checks loop end for looping, sample end for non-looping)
            if (vr->loop_length > 2) {
                // Looping sample: check against loop end
                if (vr->sample_pos >= idx_loop_end) {
                    if (vr->has_pending_sample) {
                        // New sample pending: reset position exactly (no overflow)
                        vr->sample_data = vr->pending_sample_data;
                        vr->sample_length = vr->pending_sample_length;
                        vr->has_pending_sample = false;
                        vr->sample_pos = vr->pending_loop_offset << SAMPLE_FRAC_BITS;
                        if (vr->has_pending_loop) {
                            vr->loop_data = vr->pending_loop_data;
                            vr->loop_offset = vr->pending_loop_offset;
                            vr->loop_length = vr->pending_loop_length;
                            vr->has_pending_loop = false;
                        }
                        idx_end = vr->sample_length > 0
                            ? (vr->sample_length << SAMPLE_FRAC_BITS) - 1 : 0;
                        idx_loop_start = vr->loop_offset << SAMPLE_FRAC_BITS;
                        idx_loop_end = (vr->loop_length > 2)
                            ? ((vr->loop_offset + vr->loop_length) << SAMPLE_FRAC_BITS) - 1 : 0;
                    } else {
                        // Normal loop: preserve fractional overflow
                        vr->sample_data = vr->loop_data;
                        vr->sample_length = vr->loop_offset + vr->loop_length;
                        uint32_t new_loop_start = vr->loop_offset << SAMPLE_FRAC_BITS;
                        uint32_t new_loop_end = (vr->loop_length > 2)
                            ? ((vr->loop_offset + vr->loop_length) << SAMPLE_FRAC_BITS) - 1 : 0;
                        vr->sample_pos = new_loop_start + (vr->sample_pos - idx_loop_end);
                        idx_loop_start = new_loop_start;
                        idx_loop_end = new_loop_end;
                        idx_end = vr->sample_length > 0
                            ? (vr->sample_length << SAMPLE_FRAC_BITS) - 1 : 0;
                    }
                }
            } else {
                // Non-looping sample: check against sample end
                if (vr->sample_pos >= idx_end) {
                    if (vr->has_pending_sample) {
                        vr->sample_data = vr->pending_sample_data;
                        vr->sample_length = vr->pending_sample_length;
                        vr->has_pending_sample = false;
                        vr->sample_pos = vr->pending_loop_offset << SAMPLE_FRAC_BITS;
                        if (vr->has_pending_loop) {
                            vr->loop_data = vr->pending_loop_data;
                            vr->loop_offset = vr->pending_loop_offset;
                            vr->loop_length = vr->pending_loop_length;
                            vr->has_pending_loop = false;
                        }
                        idx_end = vr->sample_length > 0
                            ? (vr->sample_length << SAMPLE_FRAC_BITS) - 1 : 0;
                        idx_loop_end = (vr->loop_length > 2)
                            ? ((vr->loop_offset + vr->loop_length) << SAMPLE_FRAC_BITS) - 1 : 0;
                        idx_loop_start = vr->loop_offset << SAMPLE_FRAC_BITS;
                    } else {
                        vr->active = false;
                        break;
                    }
                }
            }

            uint32_t int_pos = vr->sample_pos >> SAMPLE_FRAC_BITS;

            // No interpolation (NP default: InterpolationMode.None)
            int32_t sample_int = (int32_t)vr->sample_data[int_pos] * 256;
            float sample_val = (float)sample_int / 32768.0f;
            stereo[i * 2 + stereo_ch] += sample_val * gain;

            vr->sample_pos += vr->sample_inc;
        }
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static size_t sd2_render_internal(Sd2Module* mod, float* stereo, size_t frames) {
    memset(stereo, 0, frames * 2 * sizeof(float));

    size_t pos = 0;
    while (pos < frames) {
        if (mod->frames_until_tick <= 0.0f) {
            player_tick(mod);
            mod->frames_until_tick += mod->frames_per_tick;
        }

        size_t chunk = frames - pos;
        if ((float)chunk > mod->frames_until_tick) {
            chunk = (size_t)mod->frames_until_tick;
        }
        if (chunk == 0) {
            chunk = 1;
        }

        mix_voices(mod, stereo + pos * 2, chunk);
        mod->frames_until_tick -= (float)chunk;
        pos += chunk;
    }

    return frames;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Player create/destroy
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

Sd2Module* sd2_create(const uint8_t* data, size_t size, float sample_rate) {
    if (data == nullptr || size == 0) {
        return nullptr;
    }

    if (!sd2_identify(data, size)) {
        return nullptr;
    }

    Sd2Module* mod = (Sd2Module*)calloc(1, sizeof(Sd2Module));
    if (mod == nullptr) {
        return nullptr;
    }

    mod->sample_rate = sample_rate;
    mod->channel_mask = 0xf; // all 4 channels enabled

    if (!sd2_parse(mod, data, size)) {
        sd2_destroy(mod);
        return nullptr;
    }

    init_sound(mod);
    return mod;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void sd2_destroy(Sd2Module* mod) {
    if (mod == nullptr) {
        return;
    }

    if (mod->waveform_info != nullptr) {
        free(mod->waveform_info[0]);  // free the flat data block
        free(mod->waveform_info);     // free the pointer array
    }

    if (mod->arpeggios != nullptr) {
        free(mod->arpeggios[0]);
        free(mod->arpeggios);
    }

    if (mod->vibratoes != nullptr) {
        free(mod->vibratoes[0]);
        free(mod->vibratoes);
    }

    free(mod->sequences);

    if (mod->tracks != nullptr) {
        for (int i = 0; i < mod->track_count; i++) {
            free(mod->tracks[i].track_data);
        }
        free(mod->tracks);
    }

    free(mod->instruments);

    if (mod->samples != nullptr) {
        for (int i = 0; i < mod->sample_count; i++) {
            free(mod->samples[i].sample_data);
        }
        free(mod->samples);
    }

    free(mod->sample_negate_info);
    free(mod);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sd2_subsong_count(const Sd2Module* mod) {
    if (mod == nullptr) {
        return 0;
    }
    return 1;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

bool sd2_select_subsong(Sd2Module* mod, int subsong) {
    if (mod == nullptr || subsong != 0) {
        return false;
    }
    init_sound(mod);
    return true;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sd2_channel_count(const Sd2Module* mod) {
    if (mod == nullptr) {
        return 0;
    }
    return 4;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void sd2_set_channel_mask(Sd2Module* mod, uint32_t mask) {
    if (mod == nullptr) {
        return;
    }
    mod->channel_mask = mask;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

size_t sd2_render(Sd2Module* mod, float* interleaved_stereo, size_t frames) {
    if (mod == nullptr || interleaved_stereo == nullptr || frames == 0) {
        return 0;
    }
    return sd2_render_internal(mod, interleaved_stereo, frames);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

bool sd2_has_ended(const Sd2Module* mod) {
    if (mod == nullptr) {
        return true;
    }
    return mod->ended;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Track editing API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Decoded cell for internal use
typedef struct DecodedCell {
    uint8_t note;        // 0 = empty, 1-72 = note
    uint8_t instrument;  // 0 = none
    uint8_t effect;      // 0 = none
    uint8_t param;       // 0 = none
} DecodedCell;

// Decode an entire track into a fixed-size cell array.
// Returns the number of rows decoded.
static int decode_track(const Track* trk, DecodedCell* cells, int max_rows) {
    if (trk == nullptr || trk->track_data == nullptr || trk->length == 0) {
        return 0;
    }

    const uint8_t* data = trk->track_data;
    const uint32_t len = trk->length;
    uint32_t pos = 0;
    int row = 0;
    int empty_counter = 0;

    while (pos < len && row < max_rows) {
        if (empty_counter > 0) {
            // Still counting down empty rows
            cells[row].note = 0;
            cells[row].instrument = 0;
            cells[row].effect = 0;
            cells[row].param = 0;
            row++;
            empty_counter--;
            continue;
        }

        int8_t v = (int8_t)data[pos++];

        if (v == 0) {
            // Effect-only row (no note): next 2 bytes are effect + param
            cells[row].note = 0;
            cells[row].instrument = 0;
            if (pos + 1 < len) {
                cells[row].effect = data[pos++];
                cells[row].param = data[pos++];
            } else {
                cells[row].effect = 0;
                cells[row].param = 0;
            }
            row++;
        } else if (v > 0) {
            if (v >= 0x70) {
                // Effect byte (>= 112), no note
                cells[row].note = 0;
                cells[row].instrument = 0;
                cells[row].effect = (uint8_t)v;
                cells[row].param = (pos < len) ? data[pos++] : 0;
                row++;
            } else {
                // Note (1-0x6F)
                cells[row].note = (uint8_t)v;
                cells[row].instrument = 0;
                cells[row].effect = 0;
                cells[row].param = 0;

                // Matches get_note2() logic exactly:
                // After note, read next byte as int8_t
                if (pos < len) {
                    int8_t next = (int8_t)data[pos++];
                    if (next >= 0) {
                        if (next >= 0x70) {
                            // Effect follows note (no instrument)
                            cells[row].effect = (uint8_t)next;
                            cells[row].param = (pos < len) ? data[pos++] : 0;
                        } else {
                            // Instrument follows note (0 = instrument 0)
                            cells[row].instrument = (uint8_t)next;

                            // Check for effect after instrument
                            if (pos < len) {
                                int8_t next2 = (int8_t)data[pos++];
                                if (next2 >= 0) {
                                    cells[row].effect = (uint8_t)next2;
                                    cells[row].param = (pos < len) ? data[pos++] : 0;
                                } else {
                                    // Negative = empty counter
                                    empty_counter = (int)(~(int)next2);
                                }
                            }
                        }
                    } else {
                        // Negative after note = empty counter
                        empty_counter = (int)(~(int)next);
                    }
                }
                row++;
            }
        } else {
            // Negative byte: empty row + set counter for subsequent empty rows
            cells[row].note = 0;
            cells[row].instrument = 0;
            cells[row].effect = 0;
            cells[row].param = 0;
            empty_counter = (int)(~(int)v);
            row++;
        }
    }

    // Fill remaining rows from empty_counter
    while (empty_counter > 0 && row < max_rows) {
        cells[row].note = 0;
        cells[row].instrument = 0;
        cells[row].effect = 0;
        cells[row].param = 0;
        row++;
        empty_counter--;
    }

    return row;
}

// Encode cells back to variable-length track format matching get_note2() decoder.
// Returns the number of bytes written.
//
// After note + instrument with no effect, the decoder reads the next byte as
// effect (if >= 0) or empty_counter (if < 0). To prevent the next row's first byte
// from being consumed as effect, we interpose a 0xFF separator (-1 as int8_t,
// giving empty_counter = ~(-1) = 0, consuming the byte harmlessly).
static uint32_t encode_track(const DecodedCell* cells, int num_rows, uint8_t* out, uint32_t out_capacity) {
    uint32_t pos = 0;
    int row = 0;

    while (row < num_rows && pos < out_capacity) {
        // Count consecutive empty rows
        int empty_run = 0;
        int scan = row;
        while (scan < num_rows &&
               cells[scan].note == 0 && cells[scan].instrument == 0 &&
               cells[scan].effect == 0 && cells[scan].param == 0) {
            empty_run++;
            scan++;
        }

        if (empty_run > 0) {
            // Negative byte v: current row empty, empty_counter = ~v for subsequent rows.
            // For N empty rows: v = ~(N-1). Max N=128 per byte (v = -128).
            while (empty_run > 0 && pos < out_capacity) {
                int chunk = (empty_run > 128) ? 128 : empty_run;
                out[pos++] = (uint8_t)(int8_t)(~(chunk - 1));
                empty_run -= chunk;
                row += chunk;
            }
            continue;
        }

        const DecodedCell* c = &cells[row];

        if (c->note == 0) {
            // Effect-only row
            if (c->effect >= 0x70) {
                if (pos + 1 >= out_capacity) break;
                out[pos++] = c->effect;
                out[pos++] = c->param;
            } else {
                if (pos + 2 >= out_capacity) break;
                out[pos++] = 0;
                out[pos++] = c->effect;
                out[pos++] = c->param;
            }
        } else {
            // Note row
            if (pos >= out_capacity) break;
            out[pos++] = c->note;

            if (c->effect >= 0x70 && c->instrument == 0) {
                // Effect >= 0x70 directly after note (decoder reads as effect, not instrument)
                if (pos + 1 >= out_capacity) break;
                out[pos++] = c->effect;
                out[pos++] = c->param;
            } else {
                // Emit instrument (always, decoder consumes next byte as instrument if < 0x70)
                if (pos >= out_capacity) break;
                out[pos++] = c->instrument;

                if (c->effect != 0) {
                    if (pos + 1 >= out_capacity) break;
                    out[pos++] = c->effect;
                    out[pos++] = c->param;
                } else if (row + 1 < num_rows && pos < out_capacity) {
                    // No effect: decoder will consume next byte as effect/empty_counter.
                    // Interpose 0xFF separator so next row's data isn't eaten.
                    out[pos++] = 0xFF;
                }
            }
        }

        row++;
    }

    return pos;
}

int sd2_get_num_tracks(const Sd2Module* mod) {
    if (mod == nullptr) return 0;
    return mod->track_count;
}

int sd2_get_track_length(const Sd2Module* mod, int track_idx) {
    if (mod == nullptr || track_idx < 0 || track_idx >= mod->track_count) return 0;
    DecodedCell cells[256];
    return decode_track(&mod->tracks[track_idx], cells, 256);
}

uint32_t sd2_get_cell(const Sd2Module* mod, int track_idx, int row) {
    if (mod == nullptr || track_idx < 0 || track_idx >= mod->track_count) return 0;
    DecodedCell cells[256];
    int num_rows = decode_track(&mod->tracks[track_idx], cells, 256);
    if (row < 0 || row >= num_rows) return 0;
    return ((uint32_t)cells[row].note << 24) |
           ((uint32_t)cells[row].instrument << 16) |
           ((uint32_t)cells[row].effect << 8) |
           (uint32_t)cells[row].param;
}

void sd2_set_cell(Sd2Module* mod, int track_idx, int row,
                  int note, int instrument, int effect, int param) {
    if (mod == nullptr || track_idx < 0 || track_idx >= mod->track_count) return;

    Track* trk = &mod->tracks[track_idx];
    DecodedCell cells[256];
    int num_rows = decode_track(trk, cells, 256);

    // Extend with empty rows if needed
    if (row >= num_rows && row < 256) {
        for (int i = num_rows; i <= row; i++) {
            cells[i].note = 0;
            cells[i].instrument = 0;
            cells[i].effect = 0;
            cells[i].param = 0;
        }
        num_rows = row + 1;
    }
    if (row < 0 || row >= num_rows) return;

    cells[row].note = (uint8_t)note;
    cells[row].instrument = (uint8_t)instrument;
    cells[row].effect = (uint8_t)effect;
    cells[row].param = (uint8_t)param;

    // Re-encode: worst case is 4 bytes per row (note + instr + effect + param)
    uint8_t encoded[1024];
    uint32_t encoded_len = encode_track(cells, num_rows, encoded, sizeof(encoded));

    // Replace track data
    uint8_t* new_data = (uint8_t*)malloc(encoded_len);
    if (new_data == nullptr) return;
    memcpy(new_data, encoded, encoded_len);
    free(trk->track_data);
    trk->track_data = new_data;
    trk->length = encoded_len;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Instrument preview API
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

int sd2_get_instrument_count(const Sd2Module* mod) {
    if (mod == nullptr) return 0;
    return mod->instrument_count;
}

void sd2_preview_note_on(Sd2Module* mod, int instrument, int note, int velocity) {
    if (mod == nullptr) return;
    if (instrument < 0 || instrument >= mod->instrument_count) return;
    if (note < 1 || note >= (int)PERIODS_COUNT) return;

    VoiceInfo* vi = &mod->voices[0];
    VoiceRender* vr = &mod->voice_render[0];

    // Reset voice state for preview
    vi->sample_volume = 0;
    vi->wave_list_delay = 0;
    vi->wave_list_offset = 0;
    vi->arpeggio_delay = 0;
    vi->arpeggio_offset = 0;
    vi->vibrato_delay = 0;
    vi->vibrato_offset = 0;
    vi->pitch_bend_counter = 0;
    vi->pitch_bend_value = 0;
    vi->note_slide_speed = 0;
    vi->envelope_state = EnvelopeState_Attack;
    vi->sustain_counter = 0;
    vi->current_note = (uint16_t)note;
    vi->current_instrument = (uint16_t)(instrument + 1); // 1-based for play_voice
    vi->current_effect = 0;
    vi->current_effect_arg = 0;

    // Set instrument
    vi->instrument = &mod->instruments[instrument];
    Instrument* inst = vi->instrument;

    // Look up sample from waveform list
    if (inst->waveform_list_number < mod->waveform_count) {
        uint8_t* waveform_list = mod->waveform_info[inst->waveform_list_number];
        vi->current_sample = waveform_list[0];

        if (vi->current_sample < (uint16_t)mod->sample_count) {
            Sample* smp = &mod->samples[vi->current_sample];
            vi->sample_data = smp->sample_data;
            vi->sample_length = smp->length;
            vi->loop_sample = smp->sample_data;
            vi->loop_offset = smp->loop_start;
            vi->loop_length = smp->loop_length;
        }
    }

    // Set period from note + arpeggio offset
    if (inst->arpeggio_number < mod->arpeggio_count) {
        int8_t* arpeggio = mod->arpeggios[inst->arpeggio_number];
        int final_note = note + arpeggio[0];
        if (final_note >= 0 && final_note < (int)PERIODS_COUNT) {
            vi->original_note = (uint16_t)final_note;
            vi->sample_period = s_periods[final_note];
        }
    } else {
        vi->original_note = (uint16_t)note;
        vi->sample_period = s_periods[note];
    }

    // Scale volume by velocity (0-127 mapped to multiplier)
    (void)velocity; // Volume is handled by ADSR envelope, velocity unused in SidMon II

    // Start sample playback on voice render
    if (vi->sample_length != 0) {
        voice_render_play_sample(vr, vi->sample_data, 0, vi->sample_length);
        if (vi->loop_length > 2) {
            voice_render_set_loop(vr, vi->loop_sample, vi->loop_offset, vi->loop_length);
        }
    }

    update_period(vr, vi->sample_period, mod->sample_rate);
}

void sd2_preview_note_off(Sd2Module* mod) {
    if (mod == nullptr) return;
    VoiceInfo* vi = &mod->voices[0];
    VoiceRender* vr = &mod->voice_render[0];

    // Force release state
    vi->envelope_state = EnvelopeState_Release;

    // Mute immediately
    vr->volume = 0;
    vi->sample_volume = 0;
    voice_render_mute(vr);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Serialize module to binary
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

static void write_u8(uint8_t* buf, uint32_t* pos, uint8_t val) {
    buf[(*pos)++] = val;
}

static void write_be16(uint8_t* buf, uint32_t* pos, uint16_t val) {
    buf[(*pos)++] = (uint8_t)(val >> 8);
    buf[(*pos)++] = (uint8_t)(val & 0xFF);
}

static void write_be32(uint8_t* buf, uint32_t* pos, uint32_t val) {
    buf[(*pos)++] = (uint8_t)(val >> 24);
    buf[(*pos)++] = (uint8_t)((val >> 16) & 0xFF);
    buf[(*pos)++] = (uint8_t)((val >> 8) & 0xFF);
    buf[(*pos)++] = (uint8_t)(val & 0xFF);
}

uint32_t sd2_serialize(const Sd2Module* mod, uint8_t** out_data) {
    if (mod == nullptr || out_data == nullptr) return 0;

    // Calculate sizes of each block
    uint32_t num_pos = (uint32_t)mod->num_positions;
    uint32_t pos_table_len = num_pos * 4; // 4 channels * num_positions per channel

    // Block 0-2: sequence data (position, noteTranspose, instrumentTranspose)
    uint32_t seq_block_len = pos_table_len; // same for all 3 passes

    // Block 3: instruments (32 bytes each, instrument 0 excluded from file)
    uint32_t instr_count = (uint32_t)(mod->instrument_count > 0 ? mod->instrument_count - 1 : 0);
    uint32_t instr_block_len = instr_count * 32;

    // Block 4: waveform lists (16 bytes each)
    uint32_t wave_block_len = (uint32_t)mod->waveform_count * 16;

    // Block 5: arpeggios (16 bytes each)
    uint32_t arp_block_len = (uint32_t)mod->arpeggio_count * 16;

    // Block 6: vibratoes (16 bytes each)
    uint32_t vib_block_len = (uint32_t)mod->vibrato_count * 16;

    // Block 7: sample info (64 bytes each)
    uint32_t sample_info_len = (uint32_t)mod->sample_count * 64;

    // Block 8: track offset table (2 bytes per track)
    uint32_t track_table_len = (uint32_t)mod->track_count * 2;

    // Block 9: track data (re-encode all tracks)
    // First pass: compute track data sizes
    uint32_t* track_sizes = (uint32_t*)calloc((uint32_t)mod->track_count, sizeof(uint32_t));
    uint8_t** track_encoded = (uint8_t**)calloc((uint32_t)mod->track_count, sizeof(uint8_t*));
    uint32_t tracks_total_len = 0;

    for (int i = 0; i < mod->track_count; i++) {
        // Use existing track data directly (already encoded)
        track_sizes[i] = mod->tracks[i].length;
        track_encoded[i] = mod->tracks[i].track_data;
        tracks_total_len += track_sizes[i];
    }

    // ID string
    const char* id_str = "SIDMON II - THE MIDI VERSION";
    uint32_t id_len = 28;

    // song_length block: 2 bytes
    uint32_t song_len_block = 2;

    // Header: 2 (midi) + 1 (numPos) + 1 (speed) + 2 (numSamples) + 12*4 (block lengths) = 54 bytes
    // Then id_str, then song_length, then blocks
    // Actual header: 58 bytes (positions 0-57), then id_str starts at 58
    // Wait - looking at the parser: pos=2 reads numPos at offset 2, speed at 3, numSamples at 4-5
    // Block lengths at 6-57 (13 uint32s: idLen, songLenLen, then 10 blocks = 12 total)
    // Actually: pos=6 reads id_length, pos=10 reads song_len_length, then pos=14..53 reads 10 block lengths
    // That's 6 + 4 + 4 + 40 = 54 bytes of header... but id_str is at offset 58

    // Let me re-derive from the parser:
    // offset 0-1: MIDI mode (2 bytes)
    // offset 2: num_positions (1 byte)
    // offset 3: speed (1 byte)
    // offset 4-5: num_samples * 64 (2 bytes BE)
    // offset 6-9: id_length (4 bytes BE)
    // offset 10-13: song_length_length (4 bytes BE)
    // offset 14-53: 10 block lengths (40 bytes)
    // offset 54-57: padding? Actually 6+4+4+40 = 54. But id_str is at 58.
    // That means there are 4 more bytes. Looking at the parse function:
    // pos starts at 6, reads id_length (4 bytes), song_len_length (4 bytes), then 10 block_lengths (40 bytes)
    // 6 + 4 + 4 + 40 = 54. Then offset = 58 + id_length + song_len_length.
    // So header is 58 bytes (0-57 are header data).
    // But pos only goes from 6 to 54 (block_lengths[9] ends at offset 6+4+4+40=54).
    // Offsets 54-57 must be something else. Let me check...
    // The parser reads: offset 14 = trackDataLen (4 bytes), offset 26 = waveDataLen (4 bytes)
    // offset 30 = arpeggioDataLen, offset 34 = vibratoDataLen, offset 50 = patternDataLen
    // So the 10 block lengths are at offsets 14, 18, 22, 26, 30, 34, 38, 42, 46, 50
    // That's 14 + 40 = 54. So offsets 54-57 are unused? No:
    // Actually wait, let me re-read. pos starts at 6.
    // read_be32 at pos 6 → id_length (offsets 6-9)
    // read_be32 at pos 10 → song_len_length (offsets 10-13)
    // Then 10 × read_be32: offsets 14-17, 18-21, 22-25, 26-29, 30-33, 34-37, 38-41, 42-45, 46-49, 50-53
    // So header ends at offset 54 (exclusive), i.e., 53 is last header byte.
    // But offset = 58. So there are 4 bytes between the header and the first data block.
    // Actually looking again: the initial offset is set to 58 BEFORE adding id_length and song_len_length.
    // This means the raw file has: bytes 0-57 = header + meta, then id_str at 58, then song_length at 58+id_length.
    // So the id_str IS part of the data blocks. The 58 is a fixed header size.
    // Let me verify: id_str "SIDMON II - THE MIDI VERSION" is 28 bytes, id_length=28 in the file.
    // offset=58, then offset += 28 → 86, then offset += song_len_length → 86+2=88 (typically).
    // Then block data starts at offset 88.

    uint32_t header_size = 58;
    // Total data size after header:
    uint32_t total_data = id_len + song_len_block
        + seq_block_len * 3     // blocks 0, 1, 2
        + instr_block_len       // block 3
        + wave_block_len        // block 4
        + arp_block_len         // block 5
        + vib_block_len         // block 6
        + sample_info_len       // block 7
        + track_table_len       // block 8
        + tracks_total_len;     // block 9

    // Sample PCM data
    uint32_t sample_pcm_total = 0;
    for (int i = 0; i < mod->sample_count; i++) {
        sample_pcm_total += mod->samples[i].length;
    }

    // Word-align after track data if needed
    uint32_t padding = 0;
    uint32_t after_tracks = header_size + total_data;
    if (after_tracks & 1) padding = 1;

    uint32_t total_size = header_size + total_data + padding + sample_pcm_total;

    uint8_t* buf = (uint8_t*)calloc(total_size, 1);
    if (buf == nullptr) {
        free(track_sizes);
        free(track_encoded);
        return 0;
    }

    uint32_t p = 0;

    // -- Header (58 bytes) --
    // MIDI mode (2 bytes) - write 0
    write_be16(buf, &p, 0);
    // num_positions (1 byte) - stored decremented
    write_u8(buf, &p, (uint8_t)(mod->num_positions - 1));
    // speed (1 byte)
    write_u8(buf, &p, mod->start_speed);
    // num_samples * 64 (2 bytes BE)
    write_be16(buf, &p, (uint16_t)(mod->sample_count * 64));

    // Block lengths (id_length, song_len_length, then 10 block lengths)
    write_be32(buf, &p, id_len);           // id_length
    write_be32(buf, &p, song_len_block);   // song_len_length

    // 10 block lengths:
    // 0: positionTable, 1: noteTranspose, 2: instrumentTranspose
    // 3: instruments, 4: waveformList, 5: arpeggios
    // 6: vibratoes, 7: sampleInfo, 8: trackTable, 9: tracks
    write_be32(buf, &p, seq_block_len);    // block 0: positionTable
    write_be32(buf, &p, seq_block_len);    // block 1: noteTranspose
    write_be32(buf, &p, seq_block_len);    // block 2: instrumentTranspose
    write_be32(buf, &p, instr_block_len);  // block 3: instruments
    write_be32(buf, &p, wave_block_len);   // block 4: waveformList
    write_be32(buf, &p, arp_block_len);    // block 5: arpeggios
    write_be32(buf, &p, vib_block_len);    // block 6: vibratoes
    write_be32(buf, &p, sample_info_len);  // block 7: sampleInfo
    write_be32(buf, &p, track_table_len);  // block 8: trackTable
    write_be32(buf, &p, tracks_total_len); // block 9: tracks

    // Pad to offset 58 (header has: 2+1+1+2 + 4+4 + 10*4 = 54 bytes, need 4 more)
    while (p < header_size) {
        write_u8(buf, &p, 0);
    }

    // -- ID string --
    memcpy(buf + p, id_str, id_len);
    p += id_len;

    // -- Song length block (2 bytes) --
    // Not entirely clear what goes here; the parser skips it. Write 0.
    write_be16(buf, &p, 0);

    // -- Block 0: position table --
    for (int ch = 0; ch < 4; ch++) {
        for (int j = 0; j < (int)num_pos; j++) {
            int idx = ch * (int)num_pos + j;
            write_u8(buf, &p, mod->sequences[idx].track_number);
        }
    }

    // -- Block 1: note transpose --
    for (int ch = 0; ch < 4; ch++) {
        for (int j = 0; j < (int)num_pos; j++) {
            int idx = ch * (int)num_pos + j;
            write_u8(buf, &p, (uint8_t)mod->sequences[idx].note_transpose);
        }
    }

    // -- Block 2: instrument transpose --
    for (int ch = 0; ch < 4; ch++) {
        for (int j = 0; j < (int)num_pos; j++) {
            int idx = ch * (int)num_pos + j;
            write_u8(buf, &p, (uint8_t)mod->sequences[idx].instrument_transpose);
        }
    }

    // -- Block 3: instruments (32 bytes each, skip instrument 0) --
    for (int i = 1; i < mod->instrument_count; i++) {
        Instrument* inst = &mod->instruments[i];
        write_u8(buf, &p, inst->waveform_list_number);
        write_u8(buf, &p, inst->waveform_list_length);
        write_u8(buf, &p, inst->waveform_list_speed);
        write_u8(buf, &p, inst->waveform_list_delay);
        write_u8(buf, &p, inst->arpeggio_number);
        write_u8(buf, &p, inst->arpeggio_length);
        write_u8(buf, &p, inst->arpeggio_speed);
        write_u8(buf, &p, inst->arpeggio_delay);
        write_u8(buf, &p, inst->vibrato_number);
        write_u8(buf, &p, inst->vibrato_length);
        write_u8(buf, &p, inst->vibrato_speed);
        write_u8(buf, &p, inst->vibrato_delay);
        write_u8(buf, &p, (uint8_t)inst->pitch_bend_speed);
        write_u8(buf, &p, inst->pitch_bend_delay);
        write_u8(buf, &p, 0); // skip byte
        write_u8(buf, &p, 0); // skip byte
        write_u8(buf, &p, inst->attack_max);
        write_u8(buf, &p, inst->attack_speed);
        write_u8(buf, &p, inst->decay_min);
        write_u8(buf, &p, inst->decay_speed);
        write_u8(buf, &p, inst->sustain_time);
        write_u8(buf, &p, inst->release_min);
        write_u8(buf, &p, inst->release_speed);
        // 9 padding bytes
        for (int j = 0; j < 9; j++) write_u8(buf, &p, 0);
    }

    // -- Block 4: waveform lists (16 bytes each) --
    for (int i = 0; i < mod->waveform_count; i++) {
        memcpy(buf + p, mod->waveform_info[i], 16);
        p += 16;
    }

    // -- Block 5: arpeggios (16 bytes each) --
    for (int i = 0; i < mod->arpeggio_count; i++) {
        memcpy(buf + p, mod->arpeggios[i], 16);
        p += 16;
    }

    // -- Block 6: vibratoes (16 bytes each) --
    for (int i = 0; i < mod->vibrato_count; i++) {
        memcpy(buf + p, mod->vibratoes[i], 16);
        p += 16;
    }

    // -- Block 7: sample info (64 bytes each) --
    uint32_t running_sample_offset = 0;
    for (int i = 0; i < mod->sample_count; i++) {
        Sample* smp = &mod->samples[i];
        SampleNegateInfo* ni = &mod->sample_negate_info[i];

        write_be32(buf, &p, 0); // sample data pointer (unused in file)
        write_be16(buf, &p, (uint16_t)(smp->length / 2));
        write_be16(buf, &p, (uint16_t)(smp->loop_start / 2));
        write_be16(buf, &p, (uint16_t)(smp->loop_length / 2));

        // Negate info
        write_be16(buf, &p, (uint16_t)(ni->start_offset / 2));
        write_be16(buf, &p, (uint16_t)(ni->end_offset / 2));
        write_be16(buf, &p, ni->loop_index);
        write_be16(buf, &p, ni->status);
        write_be16(buf, &p, (uint16_t)ni->speed);
        write_be32(buf, &p, (uint32_t)ni->position);
        write_be16(buf, &p, ni->index);
        write_be16(buf, &p, (uint16_t)ni->do_negation);

        write_be32(buf, &p, 0); // skip 4 bytes
        // Name: 32 bytes of zeros (names not stored in Sd2Module)
        for (int j = 0; j < 32; j++) write_u8(buf, &p, 0);

        running_sample_offset += smp->length;
    }

    // -- Block 8: track offset table --
    uint32_t running_offset = 0;
    for (int i = 0; i < mod->track_count; i++) {
        write_be16(buf, &p, (uint16_t)running_offset);
        running_offset += track_sizes[i];
    }

    // -- Block 9: track data --
    for (int i = 0; i < mod->track_count; i++) {
        if (track_encoded[i] != nullptr && track_sizes[i] > 0) {
            memcpy(buf + p, track_encoded[i], track_sizes[i]);
            p += track_sizes[i];
        }
    }

    // Padding for word alignment
    if (padding) write_u8(buf, &p, 0);

    // -- Sample PCM data --
    for (int i = 0; i < mod->sample_count; i++) {
        if (mod->samples[i].length > 0 && mod->samples[i].sample_data != nullptr) {
            memcpy(buf + p, mod->samples[i].sample_data, mod->samples[i].length);
            p += mod->samples[i].length;
        }
    }

    free(track_sizes);
    free(track_encoded);

    *out_data = buf;
    return p;
}
