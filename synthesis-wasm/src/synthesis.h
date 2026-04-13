// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct SynModule SynModule;

SynModule* syn_create(const uint8_t* data, size_t size, float sample_rate);
void syn_destroy(SynModule* module);

int syn_subsong_count(const SynModule* module);
bool syn_select_subsong(SynModule* module, int subsong);

int syn_channel_count(const SynModule* module);
void syn_set_channel_mask(SynModule* module, uint32_t mask);

size_t syn_render(SynModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t syn_render_multi(SynModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool syn_has_ended(const SynModule* module);

// Edit API
int syn_get_instrument_count(const SynModule* module);
int syn_get_num_track_lines(const SynModule* module);
int syn_get_num_positions(const SynModule* module);

void syn_get_cell(const SynModule* module, int idx,
                   uint8_t* note, uint8_t* instrument, uint8_t* arpeggio,
                   uint8_t* effect, uint8_t* effect_arg);
void syn_set_cell(SynModule* module, int idx,
                   uint8_t note, uint8_t instrument, uint8_t arpeggio,
                   uint8_t effect, uint8_t effect_arg);

void syn_get_position(const SynModule* module, int pos, int channel,
                       uint16_t* start_track_row, int8_t* sound_transpose, int8_t* note_transpose);
void syn_set_position(SynModule* module, int pos, int channel,
                       uint16_t start_track_row, int8_t sound_transpose, int8_t note_transpose);

float syn_get_instrument_param(const SynModule* module, int inst, const char* param);
void syn_set_instrument_param(SynModule* module, int inst, const char* param, float value);

size_t syn_export(const SynModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
