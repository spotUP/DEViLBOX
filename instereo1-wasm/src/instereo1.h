// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Is1Module Is1Module;

Is1Module* is1_create(const uint8_t* data, size_t size, float sample_rate);
void is1_destroy(Is1Module* module);

int is1_subsong_count(const Is1Module* module);
bool is1_select_subsong(Is1Module* module, int subsong);

int is1_channel_count(const Is1Module* module);
void is1_set_channel_mask(Is1Module* module, uint32_t mask);

size_t is1_render(Is1Module* module, float* interleaved_stereo, size_t frames);
size_t is1_render_multi(Is1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool is1_has_ended(const Is1Module* module);

// Edit API
int is1_get_instrument_count(const Is1Module* module);
int is1_get_num_track_lines(const Is1Module* module);
int is1_get_num_positions(const Is1Module* module);

void is1_get_cell(const Is1Module* module, int idx,
                   uint8_t* note, uint8_t* instrument, uint8_t* arpeggio,
                   uint8_t* effect, uint8_t* effect_arg);
void is1_set_cell(Is1Module* module, int idx,
                   uint8_t note, uint8_t instrument, uint8_t arpeggio,
                   uint8_t effect, uint8_t effect_arg);

void is1_get_position(const Is1Module* module, int pos, int channel,
                       uint16_t* start_track_row, int8_t* sound_transpose, int8_t* note_transpose);
void is1_set_position(Is1Module* module, int pos, int channel,
                       uint16_t start_track_row, int8_t sound_transpose, int8_t note_transpose);

float is1_get_instrument_param(const Is1Module* module, int inst, const char* param);
void is1_set_instrument_param(Is1Module* module, int inst, const char* param, float value);

size_t is1_export(const Is1Module* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
