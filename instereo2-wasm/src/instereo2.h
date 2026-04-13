// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Is2Module Is2Module;

Is2Module* is2_create(const uint8_t* data, size_t size, float sample_rate);
void is2_destroy(Is2Module* module);

int is2_subsong_count(const Is2Module* module);
bool is2_select_subsong(Is2Module* module, int subsong);

int is2_channel_count(const Is2Module* module);
void is2_set_channel_mask(Is2Module* module, uint32_t mask);

size_t is2_render(Is2Module* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t is2_render_multi(Is2Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool is2_has_ended(const Is2Module* module);


