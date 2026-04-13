// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation (David Whittaker player)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct DwModule DwModule;

DwModule* dw_create(const uint8_t* data, size_t size, float sample_rate);
void dw_destroy(DwModule* module);

int dw_subsong_count(const DwModule* module);
bool dw_select_subsong(DwModule* module, int subsong);

int dw_channel_count(const DwModule* module);
void dw_set_channel_mask(DwModule* module, uint32_t mask);

size_t dw_render(DwModule* module, float* interleaved_stereo, size_t frames);

// Render with per-channel output. Each ch buffer receives mono float samples.
// ch0..ch3 are float arrays of at least `frames` floats. Any may be NULL to skip.
size_t dw_render_multi(DwModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dw_has_ended(const DwModule* module);


