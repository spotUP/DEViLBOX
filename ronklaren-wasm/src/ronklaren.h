// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct RkModule RkModule;

RkModule* rk_create(const uint8_t* data, size_t size, float sample_rate);
void rk_destroy(RkModule* module);

int rk_subsong_count(const RkModule* module);
bool rk_select_subsong(RkModule* module, int subsong);

int rk_channel_count(const RkModule* module);
void rk_set_channel_mask(RkModule* module, uint32_t mask);

size_t rk_render(RkModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t rk_render_multi(RkModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool rk_has_ended(const RkModule* module);

#ifdef __cplusplus
}
#endif
