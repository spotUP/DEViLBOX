// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Daniel Collin
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct BdModule BdModule;

BdModule* bd_create(const uint8_t* data, size_t size, float sample_rate);
void bd_destroy(BdModule* module);

int bd_subsong_count(const BdModule* module);
bool bd_select_subsong(BdModule* module, int subsong);

int bd_channel_count(const BdModule* module);
void bd_set_channel_mask(BdModule* module, uint32_t mask);

size_t bd_render(BdModule* module, float* interleaved_stereo, size_t frames);
bool bd_has_ended(const BdModule* module);

/* Playhead: the grid's global row (one row per 50 Hz tick); -1 before the first tick. */
int bd_get_play_tick(const BdModule* module);

int bd_walk(BdModule* module, int max_ticks, int32_t* out, int max_events, int32_t* info);

int bd_sample_count(const BdModule* module);
void* bd_get_sample(BdModule* module, int index);

#ifdef __cplusplus
}
#endif
