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

/* Pattern editing — shadow array access.
 * The shadow array must be built after fp_init() via fp_build_shadow().
 * get/set operate on the linearized pattern data, not the original bytecode. */
int fp_get_module_data(const uint8_t** out_base, uint32_t* out_size);
int fp_get_voice_seq_start(int subsong, int voice);
int fp_get_tick_speed(int subsong);
