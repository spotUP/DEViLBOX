/*
 * FuturePlayer.h — Future Player replayer interface
 *
 * Transpiled from: Future Player_v1.asm
 * Original: (c) 1988-89 by Paul van der Valk
 * EaglePlayer adaptation by Wanted Team
 *
 * This C header declares the public API used by the harness.
 */
#pragma once
#include <stdint.h>

/* Initialize the replayer with module data.
 * Returns 0 on success, -1 on error. */
int fp_init(const uint8_t* module_data, uint32_t module_size);

/* Call once per tick (CIA timer interrupt equivalent).
 * Drives the replayer forward one tick. */
void fp_play(void);

/* Stop playback and silence all channels. */
void fp_stop(void);

/* Get current subsong count */
int fp_get_num_subsongs(void);

/* Set subsong (0-based) */
void fp_set_subsong(int subsong);

/* Get sample rate for rendering */
int fp_get_sample_rate(void);

/* Per-note instrument preview */
void fp_note_on(uint32_t instr_ptr, int note, int velocity);
void fp_note_off(void);
void fp_preview_tick(void);  /* call at 50Hz during preview */
int fp_is_preview_active(void);

/* Get instrument info: returns sample size in bytes, sets *is_wavetable */
int fp_get_instrument_info(uint32_t instr_ptr, int* is_wavetable);
