// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct AvpModule AvpModule;

AvpModule* avp_create(const uint8_t* data, size_t size, float sample_rate);
void avp_destroy(AvpModule* module);

int avp_subsong_count(const AvpModule* module);
bool avp_select_subsong(AvpModule* module, int subsong);

int avp_channel_count(const AvpModule* module);
void avp_set_channel_mask(AvpModule* module, uint32_t mask);

size_t avp_render(AvpModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t avp_render_multi(AvpModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool avp_has_ended(const AvpModule* module);

// Edit API
int avp_get_instrument_count(const AvpModule* module);

float avp_get_instrument_param(const AvpModule* module, int inst, const char* param);
void avp_set_instrument_param(AvpModule* module, int inst, const char* param, float value);

size_t avp_export(const AvpModule* module, uint8_t* out, size_t max_size);


#ifdef __cplusplus
}
#endif
