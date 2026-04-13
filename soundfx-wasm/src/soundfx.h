// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct SfxModule SfxModule;

SfxModule* sfx_create(const uint8_t* data, size_t size, float sample_rate);
void sfx_destroy(SfxModule* module);

int sfx_subsong_count(const SfxModule* module);
bool sfx_select_subsong(SfxModule* module, int subsong);

int sfx_channel_count(const SfxModule* module);
void sfx_set_channel_mask(SfxModule* module, uint32_t mask);

size_t sfx_render(SfxModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t sfx_render_multi(SfxModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sfx_has_ended(const SfxModule* module);

// Edit API
int sfx_get_instrument_count(const SfxModule* module);
int sfx_get_num_patterns(const SfxModule* module);
void sfx_get_cell(const SfxModule* module, int pattern, int row, int channel,
                  uint16_t* period, uint8_t* sample, uint8_t* effect, uint8_t* effect_arg);
void sfx_set_cell(SfxModule* module, int pattern, int row, int channel,
                  uint16_t period, uint8_t sample, uint8_t effect, uint8_t effect_arg);
float sfx_get_instrument_param(const SfxModule* module, int inst, const char* param);
void sfx_set_instrument_param(SfxModule* module, int inst, const char* param, float value);
size_t sfx_export(const SfxModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
