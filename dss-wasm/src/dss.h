// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct DssModule DssModule;

DssModule* dss_create(const uint8_t* data, size_t size, float sample_rate);
void dss_destroy(DssModule* module);

int dss_subsong_count(const DssModule* module);
bool dss_select_subsong(DssModule* module, int subsong);

int dss_channel_count(const DssModule* module);
void dss_set_channel_mask(DssModule* module, uint32_t mask);

size_t dss_render(DssModule* module, float* interleaved_stereo, size_t frames);
size_t dss_render_multi(DssModule* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool dss_has_ended(const DssModule* module);


