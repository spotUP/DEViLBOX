// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SynModule SynModule;

SynModule* syn_create(const uint8_t* data, size_t size, float sample_rate);
void syn_destroy(SynModule* module);

int syn_subsong_count(const SynModule* module);
bool syn_select_subsong(SynModule* module, int subsong);

int syn_channel_count(const SynModule* module);
void syn_set_channel_mask(SynModule* module, uint32_t mask);

size_t syn_render(SynModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t syn_render_multi(SynModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool syn_has_ended(const SynModule* module);

#ifdef __cplusplus
}
#endif
