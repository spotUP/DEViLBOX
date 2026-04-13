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


