// SPDX-License-Identifier: MIT
// Ported from NostalgicPlayer C# implementation by Thomas Neumann (MIT)

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>


typedef struct Is1Module Is1Module;

Is1Module* is1_create(const uint8_t* data, size_t size, float sample_rate);
void is1_destroy(Is1Module* module);

int is1_subsong_count(const Is1Module* module);
bool is1_select_subsong(Is1Module* module, int subsong);

int is1_channel_count(const Is1Module* module);
void is1_set_channel_mask(Is1Module* module, uint32_t mask);

size_t is1_render(Is1Module* module, float* interleaved_stereo, size_t frames);
size_t is1_render_multi(Is1Module* module, float* ch0, float* ch1, float* ch2, float* ch3, size_t frames);

bool is1_has_ended(const Is1Module* module);


