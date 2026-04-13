// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct FcModule FcModule;

FcModule* fc_create(const uint8_t* data, size_t size, float sample_rate);
void fc_destroy(FcModule* module);

int fc_subsong_count(const FcModule* module);
bool fc_select_subsong(FcModule* module, int subsong);

int fc_channel_count(const FcModule* module);
void fc_set_channel_mask(FcModule* module, uint32_t mask);

size_t fc_render(FcModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t fc_render_multi(FcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool fc_has_ended(const FcModule* module);

// Edit API
int fc_get_instrument_count(const FcModule* module);
int fc_get_num_patterns(const FcModule* module);
int fc_get_num_sequences(const FcModule* module);

void fc_get_cell(const FcModule* module, int pattern, int row,
                  uint8_t* note, uint8_t* info);
void fc_set_cell(FcModule* module, int pattern, int row,
                  uint8_t note, uint8_t info);

void fc_get_sequence(const FcModule* module, int seq, int channel,
                      uint8_t* pattern, int8_t* transpose, int8_t* sound_transpose, uint8_t* speed);
void fc_set_sequence(FcModule* module, int seq, int channel,
                      uint8_t pattern, int8_t transpose, int8_t sound_transpose, uint8_t speed);

float fc_get_instrument_param(const FcModule* module, int inst, const char* param);
void fc_set_instrument_param(FcModule* module, int inst, const char* param, float value);

size_t fc_export(const FcModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
