// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SmModule SmModule;

SmModule* sm_create(const uint8_t* data, size_t size, float sample_rate);
void sm_destroy(SmModule* module);

int sm_subsong_count(const SmModule* module);
bool sm_select_subsong(SmModule* module, int subsong);

int sm_channel_count(const SmModule* module);
void sm_set_channel_mask(SmModule* module, uint32_t mask);

size_t sm_render(SmModule* module, float* interleaved_stereo, size_t frames);
bool sm_has_ended(const SmModule* module);

#ifdef __cplusplus
}
#endif
