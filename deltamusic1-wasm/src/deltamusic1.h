// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Dm1Module Dm1Module;

Dm1Module* dm1_create(const uint8_t* data, size_t size, float sample_rate);
void dm1_destroy(Dm1Module* module);

int dm1_subsong_count(const Dm1Module* module);
bool dm1_select_subsong(Dm1Module* module, int subsong);

int dm1_channel_count(const Dm1Module* module);
void dm1_set_channel_mask(Dm1Module* module, uint32_t mask);

size_t dm1_render(Dm1Module* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dm1_render_multi(Dm1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dm1_has_ended(const Dm1Module* module);


