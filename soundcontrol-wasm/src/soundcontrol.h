// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct ScModule ScModule;

ScModule* sc_create(const uint8_t* data, size_t size, float sample_rate);
void sc_destroy(ScModule* module);

int sc_subsong_count(const ScModule* module);
bool sc_select_subsong(ScModule* module, int subsong);

int sc_channel_count(const ScModule* module);
void sc_set_channel_mask(ScModule* module, uint32_t mask);

size_t sc_render(ScModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t sc_render_multi(ScModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sc_has_ended(const ScModule* module);

// Edit API
int sc_get_instrument_count(const ScModule* module);
int sc_get_num_samples(const ScModule* module);
float sc_get_instrument_param(const ScModule* module, int inst, const char* param);
void sc_set_instrument_param(ScModule* module, int inst, const char* param, float value);
size_t sc_export(const ScModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
