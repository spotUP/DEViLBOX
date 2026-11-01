// SPDX-License-Identifier: Unlicense
// C port of MONOTONE (Jim Leonard / Trixter, Unlicense): MT_PLAY.PAS (TMTV1Player)
// plus the PC speaker output of MT_OUTP.PAS (TPCSpeakerSimple, equalShare=false).
// Reference source: monotone-wasm/reference/.

#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MtModule MtModule;

// Parse a .MON file. Returns NULL when it is not a valid MONOTONE V1 file.
MtModule* mt_create(const uint8_t* data, size_t size, float sample_rate);
void mt_destroy(MtModule* m);

// Tracks in the file (1..12) and the tracks the speaker plays (min(tracks, 4)).
int mt_track_count(const MtModule* m);
int mt_channel_count(const MtModule* m);
// Bit n set = track n audible. A cleared track is treated as inactive by the
// speaker (the Pascal's TChannel.enabled, which TPCSpeakerSimple never reads).
void mt_set_channel_mask(MtModule* m, uint32_t mask);

// Restart from order 0 (PlaySongTop).
void mt_restart(MtModule* m);

// Render mono float frames (square wave, constant amplitude).
size_t mt_render(MtModule* m, float* mono, size_t frames);
// Same signal duplicated to interleaved L/R.
size_t mt_render_stereo(MtModule* m, float* interleaved_stereo, size_t frames);

bool mt_has_ended(const MtModule* m);

// Playhead: order index and row of the row the player last read.
int mt_get_position(const MtModule* m);
int mt_get_row(const MtModule* m);
int mt_get_rows(const MtModule* m);
// Pattern number of the row last read.
int mt_get_pattern(const MtModule* m);
// Track the speaker is sounding right now (-1 = silent) and its PIT divisor
// (0 = silent) and resulting frequency in Hz.
int mt_get_sounding_track(const MtModule* m);
int mt_get_divisor(const MtModule* m);
float mt_get_frequency(const MtModule* m);

// One 60 Hz player tick plus speaker update, no audio (used by the test harness).
void mt_tick(MtModule* m);
int mt_tick_in_row(const MtModule* m);
int mt_get_speed(const MtModule* m);
// Frequency of the last row-read channel state, for inspection.
int mt_get_channel_frequency(const MtModule* m, int track);
int mt_get_channel_active(const MtModule* m, int track);

// Song data / editing.
int mt_get_pattern_count(const MtModule* m);
int mt_get_order(const MtModule* m, int index);       // 0..255, 255 = end
int mt_set_order(MtModule* m, int index, int pattern);
uint16_t mt_get_cell(const MtModule* m, int pattern, int row, int track);
int mt_set_cell(MtModule* m, int pattern, int row, int track, uint16_t cell);
const char* mt_get_title(const MtModule* m);
const char* mt_get_comment(const MtModule* m);

// Replace cells/orders from an edited file, keeping playback state. 0 = refused.
int mt_replace_song(MtModule* m, const uint8_t* data, size_t size);

// Serialize back to a .MON file (byte-exact for an unedited song).
size_t mt_export(const MtModule* m, uint8_t* out, size_t max_size);

#ifdef __cplusplus
}
#endif
