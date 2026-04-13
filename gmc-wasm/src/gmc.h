// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct GmcModule GmcModule;

GmcModule* gmc_create(const uint8_t* data, size_t size, float sample_rate);
void gmc_destroy(GmcModule* module);

int gmc_subsong_count(const GmcModule* module);
bool gmc_select_subsong(GmcModule* module, int subsong);

int gmc_channel_count(const GmcModule* module);
void gmc_set_channel_mask(GmcModule* module, uint32_t mask);

size_t gmc_render(GmcModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t gmc_render_multi(GmcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool gmc_has_ended(const GmcModule* module);

// Edit API
int gmc_get_instrument_count(const GmcModule* module);
int gmc_get_num_patterns(const GmcModule* module);
void gmc_get_cell(const GmcModule* module, int pattern, int row, int channel,
                  uint16_t* period, uint8_t* sample, uint8_t* effect, uint8_t* effect_arg);
void gmc_set_cell(GmcModule* module, int pattern, int row, int channel,
                  uint16_t period, uint8_t sample, uint8_t effect, uint8_t effect_arg);
float gmc_get_instrument_param(const GmcModule* module, int inst, const char* param);
void gmc_set_instrument_param(GmcModule* module, int inst, const char* param, float value);
size_t gmc_export(const GmcModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
