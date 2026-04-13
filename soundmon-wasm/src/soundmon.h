// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct SmModule SmModule;

SmModule* sm_create(const uint8_t* data, size_t size, float sample_rate);
void sm_destroy(SmModule* module);

int sm_subsong_count(const SmModule* module);
bool sm_select_subsong(SmModule* module, int subsong);

int sm_channel_count(const SmModule* module);
void sm_set_channel_mask(SmModule* module, uint32_t mask);

size_t sm_render(SmModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t sm_render_multi(SmModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sm_has_ended(const SmModule* module);

// Edit API
int sm_get_instrument_count(const SmModule* module);
int sm_get_num_tracks(const SmModule* module);
void sm_get_cell(const SmModule* module, int track_idx, int row,
                 uint8_t* note, uint8_t* instrument, uint8_t* effect, uint8_t* effect_arg);
void sm_set_cell(SmModule* module, int track_idx, int row,
                 uint8_t note, uint8_t instrument, uint8_t effect, uint8_t effect_arg);
const char* sm_get_instrument_name(const SmModule* module, int inst);
float sm_get_instrument_param(const SmModule* module, int inst, const char* param);
void sm_set_instrument_param(SmModule* module, int inst, const char* param, float value);
size_t sm_export(const SmModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
