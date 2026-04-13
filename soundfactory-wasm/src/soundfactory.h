// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct SfModule SfModule;

SfModule* sf_create(const uint8_t* data, size_t size, float sample_rate);
void sf_destroy(SfModule* module);

int sf_subsong_count(const SfModule* module);
bool sf_select_subsong(SfModule* module, int subsong);

int sf_channel_count(const SfModule* module);
void sf_set_channel_mask(SfModule* module, uint32_t mask);

size_t sf_render(SfModule* module, float* interleaved_stereo, size_t frames);
size_t sf_render_multi(SfModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sf_has_ended(const SfModule* module);

// Edit API
int sf_get_instrument_count(const SfModule* module);
float sf_get_instrument_param(const SfModule* module, int inst, const char* param);
void sf_set_instrument_param(SfModule* module, int inst, const char* param, float value);
size_t sf_export(const SfModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
