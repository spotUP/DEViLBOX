// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct FcModule FcModule;

FcModule* fc_create(const uint8_t* data, size_t size, float sample_rate);
void fc_destroy(FcModule* module);

int fc_subsong_count(const FcModule* module);
bool fc_select_subsong(FcModule* module, int subsong);

int fc_channel_count(const FcModule* module);
void fc_set_channel_mask(FcModule* module, uint32_t mask);

size_t fc_render(FcModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t fc_render_multi(FcModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool fc_has_ended(const FcModule* module);


