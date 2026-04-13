// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SaModule SaModule;

SaModule* sa_create(const uint8_t* data, size_t size, float sample_rate);
void sa_destroy(SaModule* module);

int sa_subsong_count(const SaModule* module);
bool sa_select_subsong(SaModule* module, int subsong);

int sa_channel_count(const SaModule* module);
void sa_set_channel_mask(SaModule* module, uint32_t mask);

size_t sa_render(SaModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t sa_render_multi(SaModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool sa_has_ended(const SaModule* module);

#ifdef __cplusplus
}
#endif
