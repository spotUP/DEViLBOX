// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Dm2Module Dm2Module;

Dm2Module* dm2_create(const uint8_t* data, size_t size, float sample_rate);
void dm2_destroy(Dm2Module* module);

int dm2_subsong_count(const Dm2Module* module);
bool dm2_select_subsong(Dm2Module* module, int subsong);

int dm2_channel_count(const Dm2Module* module);
void dm2_set_channel_mask(Dm2Module* module, uint32_t mask);

size_t dm2_render(Dm2Module* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dm2_render_multi(Dm2Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dm2_has_ended(const Dm2Module* module);


