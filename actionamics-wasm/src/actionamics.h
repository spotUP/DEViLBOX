// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct ActModule ActModule;

ActModule* act_create(const uint8_t* data, size_t size, float sample_rate);
void act_destroy(ActModule* module);

int act_subsong_count(const ActModule* module);
bool act_select_subsong(ActModule* module, int subsong);

int act_channel_count(const ActModule* module);
void act_set_channel_mask(ActModule* module, uint32_t mask);

size_t act_render(ActModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t act_render_multi(ActModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool act_has_ended(const ActModule* module);

// Edit API
int act_get_instrument_count(const ActModule* module);
int act_get_sample_count(const ActModule* module);
const char* act_get_sample_name(const ActModule* module, int samp);

float act_get_instrument_param(const ActModule* module, int inst, const char* param);
void act_set_instrument_param(ActModule* module, int inst, const char* param, float value);

size_t act_export(const ActModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
