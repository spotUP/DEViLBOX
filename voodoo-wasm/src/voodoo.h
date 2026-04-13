// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct VsModule VsModule;

VsModule* vs_create(const uint8_t* data, size_t size, float sample_rate);
void vs_destroy(VsModule* module);

int vs_subsong_count(const VsModule* module);
bool vs_select_subsong(VsModule* module, int subsong);

int vs_channel_count(const VsModule* module);
void vs_set_channel_mask(VsModule* module, uint32_t mask);

size_t vs_render(VsModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t vs_render_multi(VsModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool vs_has_ended(const VsModule* module);


