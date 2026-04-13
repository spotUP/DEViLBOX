// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Dm1Module Dm1Module;

Dm1Module* dm1_create(const uint8_t* data, size_t size, float sample_rate);
void dm1_destroy(Dm1Module* module);

int dm1_subsong_count(const Dm1Module* module);
bool dm1_select_subsong(Dm1Module* module, int subsong);

int dm1_channel_count(const Dm1Module* module);
void dm1_set_channel_mask(Dm1Module* module, uint32_t mask);

size_t dm1_render(Dm1Module* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dm1_render_multi(Dm1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dm1_has_ended(const Dm1Module* module);

// Edit API
int dm1_get_instrument_count(const Dm1Module* module);
int dm1_get_num_blocks(const Dm1Module* module);
void dm1_get_cell(const Dm1Module* module, int block_idx, int row,
                  uint8_t* note, uint8_t* instrument, uint8_t* effect, uint8_t* effect_arg);
void dm1_set_cell(Dm1Module* module, int block_idx, int row,
                  uint8_t note, uint8_t instrument, uint8_t effect, uint8_t effect_arg);
const char* dm1_get_instrument_name(const Dm1Module* module, int inst);
float dm1_get_instrument_param(const Dm1Module* module, int inst, const char* param);
void dm1_set_instrument_param(Dm1Module* module, int inst, const char* param, float value);
size_t dm1_export(const Dm1Module* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
