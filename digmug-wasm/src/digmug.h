// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct DmModule DmModule;

DmModule* dm_create(const uint8_t* data, size_t size, float sample_rate);
void dm_destroy(DmModule* module);

int dm_subsong_count(const DmModule* module);
bool dm_select_subsong(DmModule* module, int subsong);

int dm_channel_count(const DmModule* module);
void dm_set_channel_mask(DmModule* module, uint32_t mask);

size_t dm_render(DmModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dm_render_multi(DmModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dm_has_ended(const DmModule* module);


